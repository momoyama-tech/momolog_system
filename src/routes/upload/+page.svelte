<script>
	import { user } from '$lib/stores/auth.js';
	import { getUser, getGroupsByIds, createVideo } from '$lib/firebase/firestore.js';
	import { uploadVideo } from '$lib/firebase/storage.js';
	import { onMount } from 'svelte';

	let groups = $state([]);
	let selectedGroupId = $state('');
	let title = $state('');
	let description = $state('');
	let tags = $state('');
	let videoFile = $state(null);
	let uploading = $state(false);
	let progress = $state(0);
	let uploadPhase = $state(''); // 'storage' | 'youtube'
	let error = $state('');
	let success = $state(false);
	let youtubeUrl = $state('');

	// 録画関連
	let videoElement;
	let recorder;
	let chunks = [];
	let isRecording = $state(false);
	let stream;

	onMount(async () => {
		if (!$user) return;
		const userData = await getUser($user.uid);
		if (userData?.groupIds?.length) {
			groups = await getGroupsByIds(userData.groupIds);
		}

		// カメラアクセス
		try {
			stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
			if (videoElement) {
				videoElement.srcObject = stream;
			}
		} catch (e) {
			error = 'カメラ・マイクへのアクセスが許可されませんでした: ' + e.message;
		}
	});

	function handleFileChange(e) {
		const file = e.target.files?.[0];
		if (file) videoFile = file;
	}

	async function startRecording() {
		// ① 毎回撮影開始時にchunksをリセット（これだけで上書きになる）
		chunks = [];

		stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
		if (videoElement) {
			videoElement.srcObject = stream;
		}

		const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
		recorder = new MediaRecorder(stream, { mimeType });

		recorder.ondataavailable = (e) => chunks.push(e.data);

		recorder.onstop = () => {
			const ext = mimeType.split('/')[1];
			const blob = new Blob(chunks, { type: mimeType });
			const file = new File([blob], `recorded_${Date.now()}.${ext}`, { type: mimeType });

			// プレビュー切り替え
			if (videoElement) {
				videoElement.srcObject = null;
				videoElement.src = URL.createObjectURL(blob);
				videoElement.controls = true;
			}

			uploadToFirebase(file);
		};

		recorder.start(100);
		isRecording = true;
	}

	function stopRecording() {
		if (recorder && isRecording) {
			recorder.stop();
			stream.getTracks().forEach(track => track.stop()); // カメラを解放
			isRecording = false;
		}
	}

	// Firebase Storageへアップロード
	async function uploadToFirebase(file) {
		const storageRef = `videos/${$user.uid}/${file.name}`;
		const downloadUrl = await uploadVideo(file, storageRef, (p) => {
			progress = p;
		});
		console.log('アップロード完了:', downloadUrl);
		// → YouTube APIへ渡す（ここではvideoFileにセット）
		videoFile = file;
	}

	async function handleSubmit() {
		if (!videoFile || !selectedGroupId || !title) {
			error = '動画ファイル、団体、タイトルは必須です';
			return;
		}

		// YouTube連携チェック
		const selectedGroup = groups.find((g) => g.id === selectedGroupId);
		if (!selectedGroup?.youtube?.connected) {
			error = 'この団体はYouTube連携がされていません。団体管理ページで連携してください。';
			return;
		}

		try {
			error = '';
			uploading = true;
			progress = 0;
			uploadPhase = 'storage';

			// 1. Firebase Storageにアップロード
			const storagePath = `videos/${$user.uid}/${Date.now()}_${videoFile.name}`;
			const downloadUrl = await uploadVideo(videoFile, storagePath, (p) => {
				progress = p;
			});

			// 2. Firestoreに動画ドキュメント作成（団体名をdenormalize）
			const videoId = await createVideo({
				groupId: selectedGroupId,
				groupName: selectedGroup.name,
				uploadedBy: $user.uid,
				title,
				description,
				tags: tags
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean),
				status: 'pending',
				storagePath,
				storageUrl: downloadUrl,
				youtubeUrl: '',
				youtubeThumbnailUrl: ''
			});

			// 3. YouTube投稿APIを呼び出し
			uploadPhase = 'youtube';
			progress = 0;

			const response = await fetch('/api/youtube/upload', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ videoId })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.details || result.error || 'YouTube投稿に失敗しました');
			}

			youtubeUrl = result.youtubeUrl;
			success = true;
		} catch (e) {
			error = e.message;
		} finally {
			uploading = false;
			uploadPhase = '';
		}
	}
</script>

<div class="mx-auto max-w-2xl p-6">
	<h1 class="mb-6 text-2xl font-bold text-gray-900">動画アップロード</h1>

	{#if success}
		<div class="rounded-lg bg-green-50 p-6 text-center">
			<p class="text-lg font-medium text-green-800">YouTubeへの投稿が完了しました（非公開）</p>
			{#if youtubeUrl}
				<a
					href={youtubeUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="mt-3 inline-block text-blue-600 underline"
				>
					YouTubeで確認する
				</a>
			{/if}
			<div class="mt-4 flex justify-center gap-4">
				<a href="/status" class="text-blue-600 underline">投稿ステータス一覧</a>
				<a href="/upload" class="text-blue-600 underline" onclick={() => { success = false; youtubeUrl = ''; }}>
					続けてアップロード
				</a>
			</div>
		</div>
	{:else}
		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
			{#if error}
				<div class="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
			{/if}

			<!-- カメラ録画セクション -->
			<div class="rounded-lg border border-gray-200 p-4">
				<h2 class="mb-4 text-lg font-semibold">カメラで録画</h2>
				<video
					bind:this={videoElement}
					autoplay
					muted
					class="mb-4 w-full max-w-md rounded border"
				></video>
				<div class="flex space-x-2">
					<button
						type="button"
						onclick={startRecording}
						disabled={isRecording}
						class="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
					>
						{isRecording ? '録画中...' : '録画開始'}
					</button>
					<button
						type="button"
						onclick={stopRecording}
						disabled={!isRecording}
						class="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
					>
						録画停止
					</button>
				</div>
			</div>

			<!-- またはファイル選択 -->
			<div class="text-center text-gray-500">または</div>

			<div>
				<label for="video" class="block text-sm font-medium text-gray-700">動画ファイルを選択</label>
				<input
					id="video"
					type="file"
					accept="video/*"
					onchange={handleFileChange}
					class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
				/>
			</div>

			<div>
				<label for="group" class="block text-sm font-medium text-gray-700">団体</label>
				<select
					id="group"
					bind:value={selectedGroupId}
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
				>
					<option value="">選択してください</option>
					{#each groups as group}
						<option value={group.id}>{group.name}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="title" class="block text-sm font-medium text-gray-700">タイトル</label>
				<input
					id="title"
					type="text"
					bind:value={title}
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
				/>
			</div>

			<div>
				<label for="desc" class="block text-sm font-medium text-gray-700">説明文</label>
				<textarea
					id="desc"
					bind:value={description}
					rows="3"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
				></textarea>
			</div>

			<div>
				<label for="tags" class="block text-sm font-medium text-gray-700"
					>タグ（カンマ区切り）</label
				>
				<input
					id="tags"
					type="text"
					bind:value={tags}
					placeholder="タグ1, タグ2, タグ3"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
				/>
			</div>

			{#if uploading}
				<div class="space-y-2">
					{#if uploadPhase === 'storage'}
						<div class="h-2 w-full rounded-full bg-gray-200">
							<div class="h-2 rounded-full bg-blue-600 transition-all" style="width: {progress}%"></div>
						</div>
						<p class="text-sm text-gray-500">
							Storageにアップロード中... {Math.round(progress)}%
						</p>
					{:else if uploadPhase === 'youtube'}
						<div class="flex items-center gap-2">
							<div class="h-5 w-5 animate-spin rounded-full border-2 border-red-600 border-t-transparent"></div>
							<p class="text-sm text-gray-500">YouTubeに投稿中...（しばらくお待ちください）</p>
						</div>
					{/if}
				</div>
			{/if}

			<button
				type="submit"
				disabled={uploading}
				class="w-full rounded-lg bg-blue-600 px-4 py-3 text-white shadow hover:bg-blue-700 disabled:opacity-50"
			>
				{#if uploading}
					{uploadPhase === 'storage' ? 'Storageにアップロード中...' : 'YouTubeに投稿中...'}
				{:else}
					アップロード
				{/if}
			</button>
		</form>
	{/if}
</div>
