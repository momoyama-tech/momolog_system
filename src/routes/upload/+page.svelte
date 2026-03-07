<script>
	import { user } from '$lib/stores/auth.js';
	import { getUser, getGroupsByIds, createVideo } from '$lib/firebase/firestore.js';
	import { uploadVideo } from '$lib/firebase/storage.js';
	import { onMount } from 'svelte';

	let groups = $state([]);
	let selectedGroupId = $state('');
	let title = $state('');
	let description = $state('');
	let tags = $state('');
	let videoFile = $state(null);
	let uploading = $state(false);
	let progress = $state(0);
	let error = $state('');
	let success = $state(false);

	onMount(async () => {
		if (!$user) return;
		const userData = await getUser($user.uid);
		if (userData?.groupIds?.length) {
			groups = await getGroupsByIds(userData.groupIds);
		}
	});

	function handleFileChange(e) {
		const file = e.target.files?.[0];
		if (file) videoFile = file;
	}

	async function handleSubmit() {
		if (!videoFile || !selectedGroupId || !title) {
			error = '動画ファイル、団体、タイトルは必須です';
			return;
		}

		try {
			error = '';
			uploading = true;
			progress = 0;

			const path = `videos/${$user.uid}/${Date.now()}_${videoFile.name}`;
			const downloadUrl = await uploadVideo(videoFile, path, (p) => {
				progress = p;
			});

			await createVideo({
				groupId: selectedGroupId,
				uploadedBy: $user.uid,
				title,
				description,
				tags: tags
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean),
				status: 'pending',
				storageUrl: downloadUrl,
				youtubeUrl: ''
			});

			success = true;
		} catch (e) {
			error = e.message;
		} finally {
			uploading = false;
		}
	}
</script>

<div class="mx-auto max-w-2xl p-6">
	<h1 class="mb-6 text-2xl font-bold text-gray-900">動画アップロード</h1>

	{#if success}
		<div class="rounded-lg bg-green-50 p-6 text-center">
			<p class="text-lg font-medium text-green-800">アップロードが完了しました</p>
			<a href="/status" class="mt-4 inline-block text-blue-600 underline">投稿ステータスを確認</a>
		</div>
	{:else}
		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
			{#if error}
				<div class="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
			{/if}

			<div>
				<label for="video" class="block text-sm font-medium text-gray-700">動画ファイル</label>
				<input
					id="video"
					type="file"
					accept="video/*"
					onchange={handleFileChange}
					class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
				/>
			</div>

			<div>
				<label for="group" class="block text-sm font-medium text-gray-700">団体</label>
				<select
					id="group"
					bind:value={selectedGroupId}
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
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
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
				/>
			</div>

			<div>
				<label for="desc" class="block text-sm font-medium text-gray-700">説明文</label>
				<textarea
					id="desc"
					bind:value={description}
					rows="3"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
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
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
				/>
			</div>

			{#if uploading}
				<div class="space-y-2">
					<div class="h-2 w-full rounded-full bg-gray-200">
						<div class="h-2 rounded-full bg-blue-600" style="width: {progress}%"></div>
					</div>
					<p class="text-sm text-gray-500">アップロード中... {Math.round(progress)}%</p>
				</div>
			{/if}

			<button
				type="submit"
				disabled={uploading}
				class="w-full rounded-lg bg-blue-600 px-4 py-3 text-white shadow hover:bg-blue-700 disabled:opacity-50"
			>
				{uploading ? 'アップロード中...' : 'アップロード'}
			</button>
		</form>
	{/if}
</div>
