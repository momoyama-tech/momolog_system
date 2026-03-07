<script>
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/auth.js';
	import { getGroupsByUser } from '$lib/firebase/firestore.js';

	let groups = $state([]);
	let loading = $state(true);

	onMount(async () => {
		if (!$user) return;
		try {
			groups = await getGroupsByUser($user.uid);
		} catch (err) {
			console.error('Failed to load groups:', err);
		}
		loading = false;
	});
</script>

<div class="mx-auto max-w-2xl p-6">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">団体管理</h1>
		<a
			href="/groups/new"
			class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
		>
			+ 新しい団体を作成
		</a>
	</div>

	{#if loading}
		<div class="flex justify-center py-12">
			<div
				class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"
			></div>
		</div>
	{:else if groups.length === 0}
		<div class="rounded-lg border border-gray-200 bg-white p-8 text-center">
			<p class="text-gray-500">まだ団体がありません。</p>
			<a href="/groups/new" class="mt-2 inline-block text-blue-600 hover:underline">
				団体を作成する
			</a>
		</div>
	{:else}
		<div class="space-y-4">
			{#each groups as group}
				<a
					href="/groups/{group.id}"
					class="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
				>
					<div class="flex items-center justify-between">
						<div>
							<h2 class="text-lg font-semibold text-gray-800">{group.name}</h2>
							{#if group.description}
								<p class="mt-1 text-sm text-gray-500">{group.description}</p>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							{#if group.youtube?.connected}
								<span
									class="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800"
								>
									YouTube連携済み
								</span>
							{:else}
								<span
									class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
								>
									未連携
								</span>
							{/if}
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}

	<div class="mt-6">
		<a href="/dashboard" class="text-sm text-gray-500 hover:text-gray-700">← ダッシュボードに戻る</a>
	</div>
</div>
