<script>
	import { user } from '$lib/stores/auth.js';
	import { getThemes } from '$lib/firebase/firestore.js';
	import { uploadVideo } from '$lib/firebase/storage.js';
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';

	const PROCESSOR_URL = env.PUBLIC_PROCESSOR_URL || '';

	let themes = $state([]);
	let videoFile = $state(null);
	let processing = $state(false);
	let progress = $state(0);
	let phase = $state('');
	let error = $state('');
	let processedVideoUrl = $state('');
	let selectedTheme = $state('');

	onMount(async () => {
		if (!$user) return;
		try {
			const dbThemes = await getThemes();
			themes = dbThemes.map((t) => ({
				id: t.id,
				label: t.name,
				description: t.description,
				type: t.type,
				mediaStoragePath: t.mediaStoragePath,
				mediaDuration: t.mediaDuration || 0,
				originalAudioVolume: t.originalAudioVolume ?? 1.0
			}));
			if (themes.length > 0) {
				selectedTheme = themes[0].id;
			}
		} catch (e) {
			console.warn('Failed to load themes:', e);
		}
	});

	function handleFileChange(e) {
		const file = e.target.files?.[0];
		if (file) videoFile = file;
	}

	function formatDuration(seconds) {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${String(s).padStart(2, '0')}`;
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

	async function downloadProcessedVideo() {
		if (!processedVideoUrl) return;
		try {
			const res = await fetch(processedVideoUrl);
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${videoFile?.name?.replace(/\.[^.]+$/, '') || 'video'}_processed.mp4`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			window.open(processedVideoUrl, '_blank');
		}
	}

	async function handleProcess() {
		if (!videoFile || !selectedTheme) {
			error = '動画ファイルとテーマを選択してください';
			return;
		}

		if (!PROCESSOR_URL) {
			error = '加工サーバーが設定されていません';
			return;
		}

		try {
			error = '';
			processing = true;
			progress = 0;
			processedVideoUrl = '';
			phase = 'storage';

			const storagePath = `videos/${$user.uid}/${Date.now()}_${videoFile.name}`;
			await uploadVideo(videoFile, storagePath, (p) => {
				progress = p;
			});

			phase = 'processing';
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

				processedVideoUrl = processResult.processedStorageUrl;
				phase = 'done';
			} finally {
				clearTimeout(timeoutId);
			}
		} catch (e) {
			error = e.message;
			phase = '';
		} finally {
			processing = false;
		}
	}

	function reset() {
		videoFile = null;
		processedVideoUrl = '';
		error = '';
		phase = '';
		progress = 0;
		if (themes.length > 0) {
			selectedTheme = themes[0].id;
		}
	}
</script>

<div class="mx-auto max-w-2xl p-6">
	<h1 class="mb-2 text-2xl font-bold text-gray-900">動画加工（ダウンロード）</h1>
	<p class="mb-6 text-sm text-gray-500">
		動画にテーマを適用して加工し、ローカルにダウンロードします。YouTube投稿は行いません。
	</p>

	{#if phase === 'done' && processedVideoUrl}
		<!-- 完了画面 -->
		<div class="rounded-lg bg-green-50 p-6 text-center">
			<p class="text-lg font-medium text-green-800">加工が完了しました</p>
			<div class="mt-4 flex flex-col items-center gap-3">
				<button
					onclick={downloadProcessedVideo}
					class="rounded-lg bg-blue-600 px-6 py-3 text-white shadow hover:bg-blue-700"
				>
					加工済み動画をダウンロード
				</button>
				<button onclick={reset} class="text-sm text-blue-600 underline">
					別の動画を加工する
				</button>
			</div>
		</div>
	{:else}
		<div class="space-y-6">
			{#if error}
				<div class="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
				{#if processedVideoUrl}
					<button onclick={downloadProcessedVideo} class="mt-1 text-sm text-blue-600 underline">
						加工済み動画をダウンロード
					</button>
				{/if}
			{/if}

			<!-- ファイル選択 -->
			<div>
				<label for="video" class="block text-sm font-medium text-gray-700"
					>動画ファイルを選択</label
				>
				<input
					id="video"
					type="file"
					accept="video/*"
					onchange={handleFileChange}
					disabled={processing}
					class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
				/>
			</div>

			<!-- テーマ選択 -->
			{#if themes.length > 0}
				<div class="rounded-lg border border-gray-200 p-4">
					<h2 class="mb-3 text-sm font-semibold text-gray-700">加工テーマ</h2>
					<div class="space-y-2">
						{#each themes as theme}
							<button
								type="button"
								disabled={processing}
								onclick={() => {
									selectedTheme = theme.id;
								}}
								class="w-full rounded-xl border-2 p-3 text-left transition-colors {selectedTheme ===
								theme.id
									? 'border-blue-500 bg-blue-50'
									: 'border-gray-200 hover:border-gray-300'} disabled:opacity-50"
							>
								<div class="flex items-center justify-between">
									<p class="font-medium">{theme.label}</p>
									{#if theme.mediaDuration}
										<span
											class="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700"
										>
											{formatDuration(theme.mediaDuration)}
										</span>
									{/if}
								</div>
								<p class="mt-0.5 text-xs text-gray-500">{theme.description}</p>
							</button>
						{/each}
					</div>
				</div>
			{:else}
				<p class="text-sm text-gray-500">利用可能なテーマがありません。</p>
			{/if}

			<!-- プログレス表示 -->
			{#if processing}
				<div class="space-y-2">
					{#if phase === 'storage'}
						<div class="h-2 w-full rounded-full bg-gray-200">
							<div
								class="h-2 rounded-full bg-blue-600 transition-all"
								style="width: {progress}%"
							></div>
						</div>
						<p class="text-sm text-gray-500">
							Storageにアップロード中... {Math.round(progress)}%
						</p>
					{:else if phase === 'processing'}
						<div class="flex items-center gap-2">
							<div
								class="h-5 w-5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent"
							></div>
							<p class="text-sm text-gray-500">動画を加工中...（しばらくお待ちください）</p>
						</div>
					{/if}
				</div>
			{/if}

			<!-- 実行ボタン -->
			<button
				onclick={handleProcess}
				disabled={processing || !videoFile || !selectedTheme}
				class="w-full rounded-lg bg-purple-600 px-4 py-3 text-white shadow hover:bg-purple-700 disabled:opacity-50"
			>
				{#if processing}
					{phase === 'storage' ? 'アップロード中...' : '加工中...'}
				{:else}
					加工してダウンロード
				{/if}
			</button>
		</div>
	{/if}

	<div class="mt-6">
		<a href="/dashboard" class="text-blue-600 underline">← ダッシュボードに戻る</a>
	</div>
</div>
