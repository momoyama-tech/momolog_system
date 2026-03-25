<script>
	import { user } from '$lib/stores/auth.js';
	import { getUser, getGroupsByIds, createVideo, getThemes } from '$lib/firebase/firestore.js';
	import { uploadVideo } from '$lib/firebase/storage.js';
	import { ref, getDownloadURL } from 'firebase/storage';
	import { storage } from '$lib/firebase/config.js';
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';

	const PROCESSOR_URL = env.PUBLIC_PROCESSOR_URL || '';

	// step: 'theme' → 'record' → 'form'
	let step = $state('theme');

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
	let processedVideoUrl = $state('');

	let videoElement = $state();
	let recorder;
	let chunks = [];
	let isRecording = $state(false);
	let stream;
	let facingMode = $state('user');
	let recordingTime = $state(0);
	let recordingTimer;

	let targetDuration = $derived.by(() => {
		const theme = themes.find((t) => t.id === selectedTheme);
		return theme?.mediaDuration || 0;
	});
	let selectedThemeLabel = $derived.by(() => {
		const theme = themes.find((t) => t.id === selectedTheme);
		return theme?.label || 'なし';
	});

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
					mediaDuration: t.mediaDuration || 0,
					originalAudioVolume: t.originalAudioVolume ?? 1.0
				}))
			];
		} catch (e) {
			console.warn('Failed to load themes:', e);
		}
	});

	async function initCamera() {
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
	}

	function goToRecord() {
		step = 'record';
		setTimeout(() => initCamera(), 100);
	}

	function goToTheme() {
		step = 'theme';
		if (stream) stream.getTracks().forEach((t) => t.stop());
	}

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
			step = 'form';
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
		step = 'record';
		recordingTime = 0;
		setTimeout(() => {
			if (videoElement) {
				videoElement.src = '';
				videoElement.controls = false;
			}
			navigator.mediaDevices
				.getUserMedia({ video: { facingMode }, audio: true })
				.then((s) => {
					stream = s;
					if (videoElement) videoElement.srcObject = stream;
				})
				.catch((e) => {
					error = 'カメラの再起動に失敗しました: ' + e.message;
				});
		}, 100);
	}

	async function readStreamAsNDJSON(response) {
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let lastResult = null;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop();
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				try {
					lastResult = JSON.parse(trimmed);
				} catch {}
			}
		}
		if (buffer.trim()) {
			try {
				lastResult = JSON.parse(buffer.trim());
			} catch {}
		}
		return lastResult;
	}

	async function getHttpUrl(url) {
		if (url.startsWith('gs://')) {
			const path = url.replace(/^gs:\/\/[^/]+\//, '');
			return await getDownloadURL(ref(storage, path));
		}
		return url;
	}

	async function downloadProcessedVideo() {
		if (!processedVideoUrl) return;
		try {
			const httpUrl = await getHttpUrl(processedVideoUrl);
			const res = await fetch(httpUrl);
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${title || 'video'}_processed.mp4`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			try {
				const httpUrl = await getHttpUrl(processedVideoUrl);
				window.open(httpUrl, '_blank');
			} catch {
				alert('ダウンロードに失敗しました');
			}
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

			if (selectedTheme !== 'none' && PROCESSOR_URL) {
				uploadPhase = 'processing';
				progress = 0;

				const themeData = themes.find((t) => t.id === selectedTheme);
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

				try {
					const processResponse = await fetch(`${PROCESSOR_URL}/process`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							storagePath,
							theme: themeData.type,
							mediaStoragePath: themeData.mediaStoragePath,
							userId: $user.uid,
						originalAudioVolume: themeData.originalAudioVolume ?? 1.0,
						mediaDuration: themeData.mediaDuration || null
						}),
						signal: controller.signal
					});

					if (!processResponse.ok) {
						throw new Error('動画加工サーバーへの接続に失敗しました');
					}

					const processResult = await readStreamAsNDJSON(processResponse);

					if (!processResult || processResult.status === 'error' || processResult.error) {
						throw new Error(processResult?.error || '動画の加工に失敗しました');
					}

					finalStoragePath = processResult.processedStoragePath;
					finalStorageUrl = processResult.processedStorageUrl;
					processedVideoUrl = finalStorageUrl;
				} finally {
					clearTimeout(timeoutId);
				}
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
		<!-- 完了画面 -->
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
			<div class="mt-4 flex flex-wrap justify-center gap-4">
				<a href="/status" class="text-blue-600 underline">投稿ステータス一覧</a>
				{#if processedVideoUrl}
					<button onclick={downloadProcessedVideo} class="text-blue-600 underline">
						加工済み動画をダウンロード
					</button>
				{/if}
				<a
					href="/record"
					class="text-blue-600 underline"
					onclick={() => {
						success = false;
						youtubeUrl = '';
						videoFile = null;
						selectedTheme = 'none';
						processedVideoUrl = '';
						step = 'theme';
					}}
				>
					続けて撮影
				</a>
			</div>
		</div>
	{:else if step === 'theme'}
		<!-- Step 1: テーマ選択 -->
		<h1 class="mb-1 text-lg font-bold text-gray-900">加工テーマを選択</h1>
		<p class="mb-4 text-sm text-gray-500">撮影前にテーマを選ぶと、目標の撮影時間がわかります</p>

		{#if error}
			<div class="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
		{/if}

		<div class="space-y-3">
			{#each themes as theme}
				<button
					type="button"
					onclick={() => {
						selectedTheme = theme.id;
					}}
					class="w-full rounded-xl border-2 p-4 text-left transition-colors {selectedTheme ===
					theme.id
						? 'border-blue-500 bg-blue-50'
						: 'border-gray-200 active:border-gray-300'}"
				>
					<div class="flex items-center justify-between">
						<p class="font-medium">{theme.label}</p>
						{#if theme.mediaDuration}
							<span class="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
								{formatDuration(theme.mediaDuration)}
							</span>
						{/if}
					</div>
					<p class="mt-0.5 text-sm text-gray-500">{theme.description}</p>
					{#if theme.mediaDuration}
						<p class="mt-1 text-xs text-blue-600">
							撮影目安: {formatDuration(theme.mediaDuration)}
						</p>
					{/if}
				</button>
			{/each}
		</div>

		<button
			type="button"
			onclick={goToRecord}
			class="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3.5 text-base font-medium text-white shadow active:bg-blue-700"
		>
			撮影へ進む
		</button>
	{:else if step === 'record'}
		<!-- Step 2: 撮影画面 -->
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

			<!-- 撮影前: テーマ名＋目標時間（上部オーバーレイ） -->
			{#if !isRecording && selectedTheme !== 'none'}
				<div class="absolute left-0 right-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-4 pb-8 pt-3">
					<div class="flex items-center justify-between">
						<span class="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
							{selectedThemeLabel}
						</span>
						{#if targetDuration}
							<span class="rounded-full bg-blue-500/80 px-3 py-1 text-sm font-bold text-white backdrop-blur-sm">
								目標 {formatTime(targetDuration)}
							</span>
						{/if}
					</div>
				</div>
			{/if}

			<!-- 録画中: タイマー（上部中央オーバーレイ） -->
			{#if isRecording}
				<div class="absolute left-1/2 top-4 -translate-x-1/2">
					<div class="flex items-center gap-2 rounded-full bg-black/60 px-4 py-1.5 backdrop-blur-sm">
						<span class="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500"></span>
						{#if targetDuration > 0}
							<span
								class="font-mono text-sm font-semibold {recordingTime > targetDuration
									? 'text-yellow-400'
									: recordingTime >= targetDuration - 3 && targetDuration > 3
										? 'text-green-400'
										: 'text-white'}"
							>
								{formatTime(recordingTime)} / {formatTime(targetDuration)}
							</span>
						{:else}
							<span class="font-mono text-sm font-semibold text-white">
								REC {formatTime(recordingTime)}
							</span>
						{/if}
					</div>
				</div>
			{/if}

			<!-- 録画中: 目標時間プログレスバー -->
			{#if isRecording && targetDuration > 0}
				<div class="absolute bottom-20 left-4 right-4">
					<div class="h-1 overflow-hidden rounded-full bg-white/30">
						<div
							class="h-full rounded-full transition-all duration-1000 {recordingTime > targetDuration
								? 'bg-yellow-400'
								: 'bg-green-400'}"
							style="width: {Math.min((recordingTime / targetDuration) * 100, 100)}%"
						></div>
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

		<!-- テーマ選択に戻る -->
		{#if !isRecording}
			<button
				type="button"
				onclick={goToTheme}
				class="mt-4 w-full text-center text-sm text-gray-500 active:text-gray-700"
			>
				← テーマ選択に戻る
			</button>
		{/if}
	{:else if step === 'form'}
		<!-- Step 3: 録画完了後 フォーム入力 -->
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
			class="space-y-5"
		>
			{#if error}
				<div class="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
				{#if processedVideoUrl}
					<button onclick={downloadProcessedVideo} class="mt-1 text-sm text-blue-600 underline">
						加工済み動画をダウンロード
					</button>
				{/if}
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

			<!-- 選択テーマ＋録画情報 -->
			<div class="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
				<span class="text-sm text-gray-600">
					テーマ: <span class="font-medium">{selectedThemeLabel}</span>
				</span>
				<span class="text-sm text-gray-500">
					録画時間: {formatTime(recordingTime)}
					{#if targetDuration > 0}
						/ {formatTime(targetDuration)}
					{/if}
				</span>
			</div>

			<!-- 撮り直すボタン -->
			<button
				type="button"
				onclick={retakeVideo}
				class="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 active:bg-gray-100"
			>
				撮り直す
			</button>

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
