<script>
	import { user } from '$lib/stores/auth.js';
	import { getUser } from '$lib/firebase/firestore.js';
	import { getGroupsByIds } from '$lib/firebase/firestore.js';
	import { onMount } from 'svelte';

	let groups = $state([]);
	let loadingGroups = $state(true);

	onMount(async () => {
		if (!$user) return;
		try {
			const userData = await getUser($user.uid);
			if (userData?.groupIds?.length) {
				groups = await getGroupsByIds(userData.groupIds);
			}
		} catch (e) {
			// Firestoreが未設定 or ユーザードキュメントが存在しない場合は無視
			console.warn('Firestore not available or user doc missing:', e.code || e.message);
		} finally {
			loadingGroups = false;
		}
	});
</script>

<div class="mx-auto max-w-2xl p-6">
	<h1 class="mb-6 text-2xl font-bold text-gray-900">ダッシュボード</h1>

	<section class="mb-8">
		<h2 class="mb-4 text-lg font-semibold text-gray-700">所属団体</h2>
		{#if loadingGroups}
			<p class="text-gray-500">読み込み中...</p>
		{:else if groups.length === 0}
			<p class="text-gray-500">所属する団体がありません</p>
		{:else}
			<div class="space-y-3">
				{#each groups as group}
					<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
						<h3 class="font-medium text-gray-900">{group.name}</h3>
						{#if group.description}
							<p class="mt-1 text-sm text-gray-500">{group.description}</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<div class="flex flex-wrap gap-4">
		<a
			href="/upload"
			class="rounded-lg bg-blue-600 px-6 py-3 text-white shadow hover:bg-blue-700"
		>
			動画をアップロード
		</a>
		<a
			href="/status"
			class="rounded-lg border border-gray-300 bg-white px-6 py-3 text-gray-700 shadow-sm hover:bg-gray-50"
		>
			投稿ステータス
		</a>
		<a
			href="/groups"
			class="rounded-lg border border-gray-300 bg-white px-6 py-3 text-gray-700 shadow-sm hover:bg-gray-50"
		>
			団体管理
		</a>
	</div>
</div>
