<script>
	import { user } from '$lib/stores/auth.js';
	import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
	import { db } from '$lib/firebase/config.js';
	import { onMount } from 'svelte';

	let videos = $state([]);
	let loadingVideos = $state(true);

	const statusLabels = {
		pending: '待機中',
		uploading_to_youtube: 'YouTube投稿中',
		published: '投稿完了',
		failed: '投稿失敗',
		rejected: '却下'
	};

	const statusColors = {
		pending: 'bg-yellow-100 text-yellow-800',
		uploading_to_youtube: 'bg-blue-100 text-blue-800',
		published: 'bg-green-100 text-green-800',
		failed: 'bg-red-100 text-red-800',
		rejected: 'bg-red-100 text-red-800'
	};

	onMount(async () => {
		if (!$user) return;
		try {
			const q = query(
				collection(db, 'videos'),
				where('uploadedBy', '==', $user.uid),
				orderBy('createdAt', 'desc')
			);
			const snap = await getDocs(q);
			videos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
		} catch (e) {
			console.error('Failed to load videos:', e);
		} finally {
			loadingVideos = false;
		}
	});
</script>

<div class="mx-auto max-w-2xl p-6">
	<h1 class="mb-6 text-2xl font-bold text-gray-900">投稿ステータス</h1>

	{#if loadingVideos}
		<p class="text-gray-500">読み込み中...</p>
	{:else if videos.length === 0}
		<p class="text-gray-500">投稿した動画はありません</p>
	{:else}
		<div class="space-y-4">
			{#each videos as video}
				<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
					<div class="flex items-start justify-between">
						<div>
							<h3 class="font-medium text-gray-900">{video.title}</h3>
							{#if video.description}
								<p class="mt-1 text-sm text-gray-500">{video.description}</p>
							{/if}
						</div>
						<span
							class="shrink-0 rounded-full px-3 py-1 text-xs font-medium {statusColors[video.status] || 'bg-gray-100 text-gray-800'}"
						>
							{#if video.status === 'uploading_to_youtube'}
								<span class="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500"></span>
							{/if}
							{statusLabels[video.status] || video.status}
						</span>
					</div>
					{#if video.youtubeUrl}
						<a
							href={video.youtubeUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="mt-2 inline-block text-sm text-blue-600 underline"
						>
							YouTubeで見る
						</a>
					{/if}
					{#if video.status === 'failed' && video.youtubeError}
						<p class="mt-2 text-sm text-red-600">エラー: {video.youtubeError}</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<div class="mt-6">
		<a href="/dashboard" class="text-blue-600 underline">ダッシュボードに戻る</a>
	</div>
</div>
