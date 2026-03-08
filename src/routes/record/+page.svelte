<script>
	import { user } from '$lib/stores/auth.js';
	import { getUser, getGroupsByIds, createVideo, getThemes } from '$lib/firebase/firestore.js';
	import { uploadVideo } from '$lib/firebase/storage.js';
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';

	const PROCESSOR_URL = env.PUBLIC_PROCESSOR_URL || '';

	let themes = $state([{ id: 'none', label: 'なし', description: 'そのまま投稿', type: 'none', mediaDuration: 0 }]);
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

	let videoElement = $state();
	let recorder;
	let chunks = [];
	let isRecording = $state(false);
	let stream;
	let facingMode = $state('user');
	let recordingTime = $state(0);
	let recordingTimer;

	onMount(async () => {
		if (!$user) return;
		const userData = await getUser($user.uid);
		if (userData?.groupIds?.length) {
			groups = await getGroupsByIds(userData.groupIds);
		}
		try {
			const dbThemes = await getThemes();
			themes = [
				{ id: 'none', label: 'なし', description: 'そのまま投稿', type: 'none', mediaDuration: 0 },
				...dbThemes.map((t) => ({
					id: t.id,
					label: t.name,
					description: t.description,
					type: t.type,
					mediaStoragePath: t.mediaStoragePath,
					mediaDuration: t.mediaDuration || 0
				}))
			];
		} catch (e) {
			console.warn('Failed to load themes:', e);
		}

		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode },
				audio: true
			});
			if (videoElement) {
				videoElement.srcObject = stream;
			}
		} catch (e) {
			error = 'カメラ・マイクへのアクセスが許可されませんでした: ' + e.message;
		}
	});

	async function switchCamera() {
		if (isRecording) return;
		facingMode = facingMode === 'user' ? 'environment' : 'user';
		try {
			if (stream) stream.getTracks().forEach((t) => t.stop());
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode },
				audio: true
			});
			if (videoElement) {
				videoElement.srcObject = stream;
			}
		} catch (e) {
			error = 'カメラの切り替えに失敗しました: ' + e.message;
		}
	}

	function formatTime(seconds) {
		const m = Math.floor(seconds / 60)
			.toString()
			.padStart(2, '0');
		const s = (seconds % 60).toString().padStart(2, '0');
		return `${m}:${s}`;
	}

	function formatDuration(seconds) {
		if (!seconds) return '';
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `0:${s.toString().padStart(2, '0')}`;
	}

	async function startRecording() {
		chunks = [];
		recordingTime = 0;

		stream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode },
			audio: true
		});
		if (videoElement) {
			videoElement.srcObject = stream;
		}

		const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
		recorder = new MediaRecorder(stream, { mimeType });

		recorder.ondataavailable = (e) => chunks.push(e.data);

		recorder.onstop = () => {
			clearInterval(recordingTimer);
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
		recordingTimer = setInterval(() => {
			recordingTime += 1;
		}, 1000);
	}

	function stopRecording() {
		if (recorder && isRecording) {
			recorder.stop();
			stream.getTracks().forEach((track) => track.stop());
			isRecording = false;
			clearInterval(recordingTimer);
		}
	}

	function retakeVideo() {
		videoFile = null;
		if (videoElement) {
			videoElement.src = '';
			videoElement.controls = false;
		}
		recordingTime = 0;
		navigator.mediaDevices
			.getUserMedia({ video: { facingMode }, audio: true })
			.then((s) => {
				stream = s;
				if (videoElement) videoElement.srcObject = stream;
			})
			.catch((e) => {
				error = 'カメラの再起動に失敗しました: ' + e.message;
			});
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

			if (selectedTheme !== 'none' && PROCESSOR_URL) {
				uploadPhase = 'processing';
				progress = 0;

				const themeData = themes.find((t) => t.id === selectedTheme);
				const processResponse = await fetch(`${PROCESSOR_URL}/process`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						storagePath,
						theme: themeData.type,
						mediaStoragePath: themeData.mediaStoragePath,
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

<div class="mx-auto max-w-2xl p-4 sm:p-6">
	{#if success}
		<div class="rounded-lg bg-green-50 p-6 text-center">
			<p class="text-lg font-medium text-green-800">YouTubeへの投稿が完了しました（限定公開）</p>
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
	{:else if !videoFile}
		<!-- 撮影画面 -->
		{#if error}
			<div class="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
		{/if}

		<div class="relative overflow-hidden rounded-2xl bg-black">
			<!-- カメラプレビュー -->
			<video
				bind:this={videoElement}
				autoplay
				muted
				playsinline
				class="aspect-video w-full object-cover"
			></video>

			<!-- 録画中の赤枠 -->
			{#if isRecording}
				<div class="pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-inset ring-red-500"></div>
			{/if}

			<!-- 録画タイマー（上部中央オーバーレイ） -->
			{#if isRecording}
				<div class="absolute left-1/2 top-4 -translate-x-1/2">
					<div class="flex items-center gap-2 rounded-full bg-black/60 px-4 py-1.5">
						<span class="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500"></span>
						<span class="font-mono text-sm font-semibold text-white"
							>REC {formatTime(recordingTime)}</span
						>
					</div>
				</div>
			{/if}

			<!-- カメラ切り替え（右上オーバーレイ） -->
			{#if !isRecording}
				<button
					type="button"
					onclick={switchCamera}
					aria-label="カメラ切り替え"
					class="absolute right-3 top-3 rounded-full bg-black/50 p-2.5 text-white active:bg-black/70"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						></path>
					</svg>
				</button>
			{/if}

			<!-- 録画コントロール（下部オーバーレイ） -->
			<div class="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-8 bg-gradient-to-t from-black/50 to-transparent pb-5 pt-10">
				<!-- カメラ切り替え -->
				<button
					type="button"
					onclick={switchCamera}
					disabled={isRecording}
					aria-label="カメラ切り替え"
					class="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm active:bg-white/30 disabled:opacity-30"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						></path>
					</svg>
				</button>

				<!-- 録画ボタン -->
				{#if isRecording}
					<button
						type="button"
						onclick={stopRecording}
						aria-label="録画停止"
						class="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 shadow-lg backdrop-blur-sm active:scale-95"
					>
						<span class="h-8 w-8 rounded-sm bg-red-600"></span>
					</button>
				{:else}
					<button
						type="button"
						onclick={startRecording}
						aria-label="録画開始"
						class="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 shadow-lg backdrop-blur-sm active:scale-95"
					>
						<span class="h-14 w-14 rounded-full bg-red-600"></span>
					</button>
				{/if}

				<!-- スペーサー -->
				<div class="h-12 w-12"></div>
			</div>
		</div>
	{:else}
		<!-- 録画完了後: プレビュー＋投稿フォーム -->
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
			class="space-y-5"
		>
			{#if error}
				<div class="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
			{/if}

			<!-- 録画プレビュー -->
			<div class="overflow-hidden rounded-2xl bg-black">
				<video
					bind:this={videoElement}
					class="aspect-video w-full object-cover"
					controls
					playsinline
				></video>
			</div>

			<!-- 撮り直すボタン -->
			<button
				type="button"
				onclick={retakeVideo}
				class="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 active:bg-gray-100"
			>
				撮り直す
			</button>

			<!-- 加工テーマ選択 -->
			<div class="rounded-lg border border-gray-200 p-4">
				<h2 class="mb-3 text-base font-semibold">加工テーマ</h2>
				<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
					{#each themes as theme}
						<button
							type="button"
							onclick={() => {
								selectedTheme = theme.id;
							}}
							class="rounded-lg border-2 p-3 text-left transition-colors {selectedTheme ===
							theme.id
								? 'border-blue-500 bg-blue-50'
								: 'border-gray-200 active:border-gray-300'}"
						>
							<div class="flex items-center justify-between">
								<p class="text-sm font-medium">{theme.label}</p>
								{#if theme.mediaDuration}
									<span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{formatDuration(theme.mediaDuration)}</span>
								{/if}
							</div>
							<p class="text-xs text-gray-500">{theme.description}</p>
						</button>
					{/each}
				</div>
			</div>

			<div>
				<label for="group" class="block text-sm font-medium text-gray-700">団体</label>
				<select
					id="group"
					bind:value={selectedGroupId}
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5 text-base"
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
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5 text-base"
				/>
			</div>

			<div>
				<label for="desc" class="block text-sm font-medium text-gray-700">説明文</label>
				<textarea
					id="desc"
					bind:value={description}
					rows="3"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5 text-base"
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
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5 text-base"
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
				class="w-full rounded-lg bg-blue-600 px-4 py-3.5 text-base font-medium text-white shadow active:bg-blue-700 disabled:opacity-50"
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
