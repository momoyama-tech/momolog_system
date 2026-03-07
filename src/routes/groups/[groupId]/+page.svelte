<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { getGroup } from '$lib/firebase/firestore.js';

	let group = $state(null);
	let loading = $state(true);
	let successMessage = $state('');
	let errorMessage = $state('');

	onMount(async () => {
		const params = $page.url.searchParams;
		if (params.get('youtube') === 'connected') {
			successMessage = 'YouTubeアカウントを連携しました！';
		}
		if (params.get('error')) {
			errorMessage = `エラー: ${params.get('error')}`;
		}

		const groupId = $page.params.groupId;
		try {
			group = await getGroup(groupId);
		} catch (err) {
			console.error('Failed to load group:', err);
			errorMessage = '団体情報の読み込みに失敗しました';
		}
		loading = false;
	});

	function connectYouTube() {
		const groupId = $page.params.groupId;
		window.location.href = `/api/youtube/auth?groupId=${groupId}`;
	}
</script>

<div class="mx-auto max-w-lg p-6">
	{#if loading}
		<div class="flex justify-center py-12">
			<div
				class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"
			></div>
		</div>
	{:else if !group}
		<p class="text-gray-500">団体が見つかりません。</p>
	{:else}
		<h1 class="mb-6 text-2xl font-bold text-gray-800">{group.name}</h1>

		{#if successMessage}
			<div class="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-800">
				{successMessage}
			</div>
		{/if}

		{#if errorMessage}
			<div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
				{errorMessage}
			</div>
		{/if}

		{#if group.description}
			<p class="mb-6 text-gray-600">{group.description}</p>
		{/if}

		<!-- YouTube連携セクション -->
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-4 text-lg font-semibold text-gray-800">YouTube連携</h2>

			{#if group.youtube?.connected}
				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<span class="inline-block h-3 w-3 rounded-full bg-green-500"></span>
						<span class="text-sm font-medium text-green-800">連携済み</span>
					</div>
					<div class="rounded-lg bg-gray-50 p-4">
						<p class="text-sm text-gray-600">
							チャンネル:
							<span class="font-medium text-gray-800">{group.youtube.channelTitle}</span>
						</p>
						<p class="mt-1 text-xs text-gray-400">
							チャンネルID: {group.youtube.channelId}
						</p>
					</div>
					<button
						onclick={connectYouTube}
						class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
					>
						アカウントを再連携する
					</button>
				</div>
			{:else}
				<p class="mb-4 text-sm text-gray-500">
					この団体のYouTubeアカウントを連携すると、動画が自動的にYouTubeへ非公開で投稿されます。
				</p>
				<button
					onclick={connectYouTube}
					class="rounded-lg bg-red-600 px-6 py-2 font-medium text-white hover:bg-red-700"
				>
					YouTubeアカウントを連携する
				</button>
			{/if}
		</div>
	{/if}

	<div class="mt-6">
		<a href="/groups" class="text-sm text-gray-500 hover:text-gray-700">← 団体一覧に戻る</a>
	</div>
</div>
