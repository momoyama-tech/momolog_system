import {
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	addDoc,
	arrayUnion,
	query,
	where,
	orderBy,
	serverTimestamp
} from 'firebase/firestore';
import { db } from './config.js';

// --- Users ---

export async function getUser(userId) {
	const snap = await getDoc(doc(db, 'users', userId));
	return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function setUser(userId, data) {
	return setDoc(doc(db, 'users', userId), data, { merge: true });
}

// --- Groups ---

export async function getGroup(groupId) {
	const snap = await getDoc(doc(db, 'groups', groupId));
	return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getGroupsByIds(groupIds) {
	if (!groupIds.length) return [];
	const groups = await Promise.all(groupIds.map((id) => getGroup(id)));
	return groups.filter(Boolean);
}

export async function createGroup(groupData, userId) {
	const ref = await addDoc(collection(db, 'groups'), {
		...groupData,
		createdBy: userId,
		createdAt: serverTimestamp()
	});
	// ユーザーのgroupIdsに追加
	await setDoc(doc(db, 'users', userId), { groupIds: arrayUnion(ref.id) }, { merge: true });
	return ref.id;
}

export async function getGroupsByUser(userId) {
	const userData = await getUser(userId);
	if (!userData?.groupIds?.length) return [];
	return getGroupsByIds(userData.groupIds);
}

export async function getAllGroups() {
	const snap = await getDocs(collection(db, 'groups'));
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function joinGroup(groupId, userId) {
	await setDoc(doc(db, 'users', userId), { groupIds: arrayUnion(groupId) }, { merge: true });
}

// --- Videos ---

export async function createVideo(videoData) {
	const ref = doc(collection(db, 'videos'));
	await setDoc(ref, {
		...videoData,
		createdAt: serverTimestamp()
	});
	return ref.id;
}

export async function getVideosByGroup(groupId) {
	const q = query(
		collection(db, 'videos'),
		where('groupId', '==', groupId),
		orderBy('createdAt', 'desc')
	);
	const snap = await getDocs(q);
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateVideo(videoId, data) {
	return updateDoc(doc(db, 'videos', videoId), data);
}
