<script>
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/auth.js';
	import { getGroupsByUser, getAllGroups, joinGroup } from '$lib/firebase/firestore.js';

	let myGroups = $state([]);
	let availableGroups = $state([]);
	let loading = $state(true);
	let joining = $state('');

	async function loadGroups() {
		if (!$user) return;
		try {
			const [mine, all] = await Promise.all([
				getGroupsByUser($user.uid),
				getAllGroups()
			]);
			myGroups = mine;
			const myIds = new Set(mine.map((g) => g.id));
			availableGroups = all.filter((g) => !myIds.has(g.id));
		} catch (err) {
			console.error('Failed to load groups:', err);
		}
		loading = false;
	}

	async function handleJoin(groupId) {
		joining = groupId;
		try {
			await joinGroup(groupId, $user.uid);
			await loadGroups();
		} catch (err) {
			console.error('Failed to join group:', err);
		}
		joining = '';
	}

	onMount(loadGroups);
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
	{:else}
		<!-- 所属団体 -->
		<section class="mb-8">
			<h2 class="mb-3 text-lg font-semibold text-gray-700">所属団体</h2>
			{#if myGroups.length === 0}
				<div class="rounded-lg border border-gray-200 bg-white p-8 text-center">
					<p class="text-gray-500">まだ団体に所属していません。</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each myGroups as group}
						<a
							href="/groups/{group.id}"
							class="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
						>
							<div class="flex items-center justify-between">
								<div>
									<h3 class="text-lg font-semibold text-gray-800">{group.name}</h3>
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
		</section>

		<!-- 参加可能な団体 -->
		{#if availableGroups.length > 0}
			<section>
				<h2 class="mb-3 text-lg font-semibold text-gray-700">参加可能な団体</h2>
				<div class="space-y-3">
					{#each availableGroups as group}
						<div
							class="flex items-center justify-between rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5"
						>
							<div>
								<h3 class="font-semibold text-gray-800">{group.name}</h3>
								{#if group.description}
									<p class="mt-1 text-sm text-gray-500">{group.description}</p>
								{/if}
							</div>
							<button
								onclick={() => handleJoin(group.id)}
								disabled={joining === group.id}
								class="shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
							>
								{joining === group.id ? '参加中...' : '参加する'}
							</button>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{/if}

	<div class="mt-6">
		<a href="/dashboard" class="text-sm text-gray-500 hover:text-gray-700">← ダッシュボードに戻る</a>
	</div>
</div>
