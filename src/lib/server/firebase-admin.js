import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { env } from '$env/dynamic/private';

let _adminApp;
let _adminDb;
let _adminStorage;

function getAdminApp() {
	if (_adminApp) return _adminApp;
	if (getApps().length > 0) {
		_adminApp = getApps()[0];
		return _adminApp;
	}
	const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
	_adminApp = initializeApp({
		credential: cert(serviceAccount),
		storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
	});
	return _adminApp;
}

export function getAdminDb() {
	if (_adminDb) return _adminDb;
	_adminDb = getFirestore(getAdminApp());
	return _adminDb;
}

export function getAdminBucket() {
	if (_adminStorage) return _adminStorage;
	const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
	const bucketName = `${serviceAccount.project_id}.firebasestorage.app`;
	_adminStorage = getStorage(getAdminApp()).bucket(bucketName);
	return _adminStorage;
}
