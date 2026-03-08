<script>
	import { user } from '$lib/stores/auth.js';
	import { getUser, getGroupsByIds, createVideo } from '$lib/firebase/firestore.js';
	import { uploadVideo } from '$lib/firebase/storage.js';
	import { onMount } from 'svelte';
	import { PUBLIC_PROCESSOR_URL } from '$env/static/public';

	const PROCESSOR_URL = PUBLIC_PROCESSOR_URL || '';

	const THEMES = [
		{ id: 'none', label: 'なし', description: 'そのまま投稿' },
		{ id: 'bgm', label: 'BGM追加', description: 'BGMを自動で追加' }
	];

	let groups = $state([]);
	let selectedGroupId = $state('');
	let title = $state('');
	let description = $state('');
	let tags = $state('');
	let videoFile = $state(null);
	let uploading = $state(false);
	let progress = $state(0);
	let uploadPhase = $state('');
	let error = $state('');
	let success = $state(false);
	let youtubeUrl = $state('');
	let selectedTheme = $state('none');

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

		try {
			stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
			if (videoElement) {
				videoElement.srcObject = stream;
			}
		} catch (e) {
			error = 'カメラ・マイクへのアクセスが許可されませんでした: ' + e.message;
		}
	});

	async function startRecording() {
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

			if (videoElement) {
				videoElement.srcObject = null;
				videoElement.src = URL.createObjectURL(blob);
				videoElement.controls = true;
			}

			videoFile = file;
		};

		recorder.start(100);
		isRecording = true;
	}

	function stopRecording() {
		if (recorder && isRecording) {
			recorder.stop();
			stream.getTracks().forEach((track) => track.stop());
			isRecording = false;
		}
	}

	async function handleSubmit() {
		if (!videoFile || !selectedGroupId || !title) {
			error = '録画した動画、団体、タイトルは必須です';
			return;
		}

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

			const storagePath = `videos/${$user.uid}/${Date.now()}_${videoFile.name}`;
			const downloadUrl = await uploadVideo(videoFile, storagePath, (p) => {
				progress = p;
			});

			let finalStoragePath = storagePath;
			let finalStorageUrl = downloadUrl;

			if (selectedTheme === 'bgm' && PROCESSOR_URL) {
				uploadPhase = 'processing';
				progress = 0;

				const processResponse = await fetch(`${PROCESSOR_URL}/process`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						storagePath,
						theme: 'bgm',
						userId: $user.uid
					})
				});

				const processResult = await processResponse.json();

				if (!processResponse.ok) {
					throw new Error(processResult.error || '動画の加工に失敗しました');
				}

				finalStoragePath = processResult.processedStoragePath;
				finalStorageUrl = processResult.processedStorageUrl;
			}

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
				storagePath: finalStoragePath,
				storageUrl: finalStorageUrl,
				youtubeUrl: '',
				youtubeThumbnailUrl: '',
				processingTheme: selectedTheme
			});

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
	<h1 class="mb-6 text-2xl font-bold text-gray-900">カメラで撮影</h1>

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
				<a
					href="/record"
					class="text-blue-600 underline"
					onclick={() => {
						success = false;
						youtubeUrl = '';
						videoFile = null;
					}}
				>
					続けて撮影
				</a>
			</div>
		</div>
	{:else}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
			class="space-y-6"
		>
			{#if error}
				<div class="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
			{/if}

			<!-- カメラ録画 -->
			<div class="rounded-lg border border-gray-200 p-4">
				<video
					bind:this={videoElement}
					autoplay
					muted
					class="mb-4 w-full rounded border"
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

			<!-- 加工テーマ選択 -->
			{#if videoFile}
				<div class="rounded-lg border border-gray-200 p-4">
					<h2 class="mb-3 text-lg font-semibold">加工テーマ</h2>
					<div class="grid grid-cols-2 gap-3">
						{#each THEMES as theme}
							<button
								type="button"
								onclick={() => {
									selectedTheme = theme.id;
								}}
								class="rounded-lg border-2 p-3 text-left transition-colors {selectedTheme ===
								theme.id
									? 'border-blue-500 bg-blue-50'
									: 'border-gray-200 hover:border-gray-300'}"
							>
								<p class="font-medium">{theme.label}</p>
								<p class="text-xs text-gray-500">{theme.description}</p>
							</button>
						{/each}
					</div>
				</div>
			{/if}

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
							<div
								class="h-2 rounded-full bg-blue-600 transition-all"
								style="width: {progress}%"
							></div>
						</div>
						<p class="text-sm text-gray-500">
							Storageにアップロード中... {Math.round(progress)}%
						</p>
					{:else if uploadPhase === 'processing'}
						<div class="flex items-center gap-2">
							<div
								class="h-5 w-5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent"
							></div>
							<p class="text-sm text-gray-500">動画を加工中...（しばらくお待ちください）</p>
						</div>
					{:else if uploadPhase === 'youtube'}
						<div class="flex items-center gap-2">
							<div
								class="h-5 w-5 animate-spin rounded-full border-2 border-red-600 border-t-transparent"
							></div>
							<p class="text-sm text-gray-500">YouTubeに投稿中...（しばらくお待ちください）</p>
						</div>
					{/if}
				</div>
			{/if}

			<button
				type="submit"
				disabled={uploading || !videoFile}
				class="w-full rounded-lg bg-blue-600 px-4 py-3 text-white shadow hover:bg-blue-700 disabled:opacity-50"
			>
				{#if uploading}
					{uploadPhase === 'storage'
						? 'Storageにアップロード中...'
						: uploadPhase === 'processing'
							? '動画を加工中...'
							: 'YouTubeに投稿中...'}
				{:else}
					アップロード
				{/if}
			</button>
		</form>
	{/if}

	<div class="mt-6">
		<a href="/dashboard" class="text-blue-600 underline">← ダッシュボードに戻る</a>
	</div>
</div>
