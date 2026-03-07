import { json } from '@sveltejs/kit';
import { getAdminDb, getAdminBucket } from '$lib/server/firebase-admin.js';
import { createOAuth2Client } from '$lib/server/google-oauth.js';
import { google } from 'googleapis';
import { FieldValue } from 'firebase-admin/firestore';
import { Readable } from 'stream';

export async function POST({ request }) {
	const { videoId } = await request.json();

	if (!videoId) {
		return json({ error: 'Missing videoId' }, { status: 400 });
	}

	const adminDb = getAdminDb();

	try {
		// 1. 動画ドキュメントを取得
		const videoDoc = await adminDb.collection('videos').doc(videoId).get();
		if (!videoDoc.exists) {
			return json({ error: 'Video not found' }, { status: 404 });
		}

		const video = videoDoc.data();
		if (!video.storagePath) {
			return json({ error: 'Video has no storagePath' }, { status: 400 });
		}

		// 2. ステータスを uploading_to_youtube に更新
		await adminDb.collection('videos').doc(videoId).update({
			status: 'uploading_to_youtube'
		});

		// 3. 団体のYouTube認証情報を取得
		const credDoc = await adminDb.collection('youtube_credentials').doc(video.groupId).get();
		if (!credDoc.exists) {
			await adminDb.collection('videos').doc(videoId).update({
				status: 'failed',
				youtubeError: 'YouTube認証情報が見つかりません。団体のYouTube連携を確認してください。'
			});
			return json({ error: 'YouTube credentials not found for group' }, { status: 400 });
		}

		const creds = credDoc.data();

		// 4. OAuth2クライアントにトークンをセット
		const oauth2Client = createOAuth2Client();
		oauth2Client.setCredentials({
			access_token: creds.accessToken,
			refresh_token: creds.refreshToken,
			expiry_date: creds.tokenExpiry?.toMillis?.() || creds.tokenExpiry
		});

		// トークン自動更新時にFirestoreに保存
		oauth2Client.on('tokens', async (tokens) => {
			const updateData = { updatedAt: FieldValue.serverTimestamp() };
			if (tokens.access_token) updateData.accessToken = tokens.access_token;
			if (tokens.refresh_token) updateData.refreshToken = tokens.refresh_token;
			if (tokens.expiry_date) updateData.tokenExpiry = new Date(tokens.expiry_date);
			await adminDb.collection('youtube_credentials').doc(video.groupId).update(updateData);
			console.log('YouTube tokens refreshed and saved for group:', video.groupId);
		});

		// 5. Firebase Storageから動画をダウンロード
		const bucket = getAdminBucket();
		const file = bucket.file(video.storagePath);
		const [fileBuffer] = await file.download();
		const [metadata] = await file.getMetadata();

		console.log(
			`Downloaded video: ${video.storagePath} (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB)`
		);

		// 6. YouTubeにアップロード（非公開）
		const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

		const response = await youtube.videos.insert({
			part: 'snippet,status',
			requestBody: {
				snippet: {
					title: video.title || 'Untitled',
					description: video.description || '',
					tags: video.tags || []
				},
				status: {
					privacyStatus: 'private'
				}
			},
			media: {
				mimeType: metadata.contentType || 'video/mp4',
				body: Readable.from(fileBuffer)
			}
		});

		const youtubeVideoId = response.data.id;
		const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

		console.log(`YouTube upload success: ${youtubeUrl}`);

		// 7. 動画ドキュメントを更新
		await adminDb.collection('videos').doc(videoId).update({
			status: 'published',
			youtubeVideoId,
			youtubeUrl,
			youtubeUploadedAt: FieldValue.serverTimestamp()
		});

		return json({
			success: true,
			youtubeVideoId,
			youtubeUrl
		});
	} catch (err) {
		console.error('YouTube upload error:', err);

		// 動画ドキュメントをfailedに更新
		try {
			await adminDb.collection('videos').doc(videoId).update({
				status: 'failed',
				youtubeError: err.message || 'Unknown error'
			});
		} catch (updateErr) {
			console.error('Failed to update video status:', updateErr);
		}

		return json(
			{
				error: 'YouTube upload failed',
				details: err.message
			},
			{ status: 500 }
		);
	}
}
