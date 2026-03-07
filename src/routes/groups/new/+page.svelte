<script>
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores/auth.js';
	import { createGroup } from '$lib/firebase/firestore.js';

	let name = $state('');
	let description = $state('');
	let submitting = $state(false);
	let error = $state('');

	async function handleSubmit() {
		if (!name.trim()) {
			error = '団体名を入力してください';
			return;
		}
		submitting = true;
		error = '';

		try {
			const groupId = await createGroup(
				{
					name: name.trim(),
					description: description.trim()
				},
				$user.uid
			);
			goto(`/groups/${groupId}`);
		} catch (err) {
			console.error('Failed to create group:', err);
			error = '団体の作成に失敗しました';
			submitting = false;
		}
	}
</script>

<div class="mx-auto max-w-lg p-6">
	<h1 class="mb-6 text-2xl font-bold text-gray-800">新しい団体を作成</h1>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
		class="space-y-5"
	>
		<div>
			<label for="name" class="mb-1 block text-sm font-medium text-gray-700">団体名 *</label>
			<input
				id="name"
				type="text"
				bind:value={name}
				placeholder="例: テック部"
				class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
				required
			/>
		</div>

		<div>
			<label for="description" class="mb-1 block text-sm font-medium text-gray-700">説明</label>
			<textarea
				id="description"
				bind:value={description}
				placeholder="団体の説明（任意）"
				rows="3"
				class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
			></textarea>
		</div>

		{#if error}
			<p class="text-sm text-red-600">{error}</p>
		{/if}

		<div class="flex items-center gap-3">
			<button
				type="submit"
				disabled={submitting}
				class="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
			>
				{submitting ? '作成中...' : '作成する'}
			</button>
			<a href="/groups" class="text-sm text-gray-500 hover:text-gray-700">キャンセル</a>
		</div>
	</form>
</div>
