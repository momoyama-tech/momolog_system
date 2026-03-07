import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from './config.js';

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
	return signInWithPopup(auth, googleProvider);
}

export async function logout() {
	return signOut(auth);
}
