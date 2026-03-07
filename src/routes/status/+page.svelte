<script>
	import { user } from '$lib/stores/auth.js';
	import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
	import { db } from '$lib/firebase/config.js';
	import { onMount } from 'svelte';

	let videos = $state([]);
	let loadingVideos = $state(true);

	const statusLabels = {
		pending: '処理中',
		published: '公開済み',
		rejected: '却下'
	};

	const statusColors = {
		pending: 'bg-yellow-100 text-yellow-800',
		published: 'bg-green-100 text-green-800',
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
							class="rounded-full px-3 py-1 text-xs font-medium {statusColors[video.status] || 'bg-gray-100 text-gray-800'}"
						>
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
				</div>
			{/each}
		</div>
	{/if}

	<div class="mt-6">
		<a href="/dashboard" class="text-blue-600 underline">ダッシュボードに戻る</a>
	</div>
</div>
