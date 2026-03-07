import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './config.js';

/**
 * 動画ファイルをFirebase Storageにアップロード
 * @param {File} file
 * @param {string} path - ストレージパス (例: "videos/{userId}/{filename}")
 * @param {(progress: number) => void} [onProgress]
 * @returns {Promise<string>} ダウンロードURL
 */
export function uploadVideo(file, path, onProgress) {
	return new Promise((resolve, reject) => {
		const storageRef = ref(storage, path);
		const uploadTask = uploadBytesResumable(storageRef, file);

		uploadTask.on(
			'state_changed',
			(snapshot) => {
				const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
				onProgress?.(progress);
			},
			(error) => reject(error),
			async () => {
				const url = await getDownloadURL(uploadTask.snapshot.ref);
				resolve(url);
			}
		);
	});
}
