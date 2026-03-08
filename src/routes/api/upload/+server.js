import { json } from '@sveltejs/kit';
import { getStorage } from 'firebase-admin/storage';
// 先ほどエラーを直した admin 初期化ファイルを読み込む（パスは環境に合わせて調整してください）
import '../../../lib/server/firebase-admin.js';

export async function POST({ request }) {
	try {
		// 1. フロントエンドから送られた FormData を受け取る
		const data = await request.formData();
		const file = data.get('video');

		if (!file) {
			return json({ error: 'ファイルが見つかりません' }, { status: 400 });
		}

		// 2. FileオブジェクトをNode.jsで扱えるBufferに変換
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// 3. Firebase Storageに保存
		// 注意: ここにご自身のFirebaseのバケット名を入れてください
		const bucket = getStorage().bucket('momolog-develop.firebasestorage.app');

		// 保存するファイル名（重複しないようにタイムスタンプを付与）
		const fileName = `videos/${Date.now()}_${file.name}`;
		const fileRef = bucket.file(fileName);

		// アップロード実行
		await fileRef.save(buffer, {
			metadata: { contentType: file.type }
		});

		// ダウンロードURL生成
		const [url] = await fileRef.getSignedUrl({
			action: 'read',
			expires: '03-09-2491', // 遠い未来
		});

		return json({ success: true, message: 'アップロード完了', path: fileName, url });

	} catch (error) {
		console.error('Upload Error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}