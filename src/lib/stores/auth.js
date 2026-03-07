import { writable } from 'svelte/store';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '$lib/firebase/config.js';

/** @type {import('svelte/store').Writable<import('firebase/auth').User | null>} */
export const user = writable(null);

/** @type {import('svelte/store').Writable<boolean>} */
export const loading = writable(true);

let unsubscribe;

export function initAuth() {
	if (unsubscribe) return;
	unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
		user.set(firebaseUser);
		loading.set(false);
	});
}
