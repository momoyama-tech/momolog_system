<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user, loading, initAuth } from '$lib/stores/auth.js';
	import { logout } from '$lib/firebase/auth.js';

	let { children } = $props();

	onMount(() => {
		initAuth();
	});

	const publicPaths = ['/'];

	$effect(() => {
		if ($loading) return;
		const path = $page.url.pathname;

		if (!$user && !publicPaths.includes(path)) {
			goto('/');
		}
		if ($user && path === '/') {
			goto('/dashboard');
		}
	});

	async function handleLogout() {
		await logout();
		goto('/');
	}
</script>

{#if $loading}
	<div class="flex h-screen items-center justify-center">
		<div class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
	</div>
{:else}
	{#if $user}
		<header class="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
			<a href="/dashboard" class="text-xl font-bold text-gray-800">momolog</a>
			<div class="flex items-center gap-4">
				<span class="text-sm text-gray-600">{$user.displayName}</span>
				<button
					onclick={handleLogout}
					class="rounded bg-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-300"
				>
					ログアウト
				</button>
			</div>
		</header>
	{/if}
	<main>
		{@render children()}
	</main>
{/if}
