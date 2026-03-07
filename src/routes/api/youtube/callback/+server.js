import { redirect } from '@sveltejs/kit';
import { createOAuth2Client } from '$lib/server/google-oauth.js';
import { getAdminDb } from '$lib/server/firebase-admin.js';
import { google } from 'googleapis';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET({ url }) {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');

	if (error) {
		throw redirect(302, `/groups?error=${encodeURIComponent(error)}`);
	}

	if (!code || !state) {
		return new Response(JSON.stringify({ error: 'Missing code or state' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const groupId = state;
	const oauth2Client = createOAuth2Client();

	try {
		const { tokens } = await oauth2Client.getToken(code);
		oauth2Client.setCredentials(tokens);

		const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
		const channelResponse = await youtube.channels.list({
			part: 'snippet',
			mine: true
		});
		const channel = channelResponse.data.items?.[0];

		if (!channel) {
			throw redirect(302, `/groups/${groupId}?error=no_channel`);
		}

		const adminDb = getAdminDb();

		await adminDb.collection('youtube_credentials').doc(groupId).set({
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
			scope: tokens.scope,
			updatedAt: FieldValue.serverTimestamp()
		});

		await adminDb
			.collection('groups')
			.doc(groupId)
			.update({
				youtube: {
					channelId: channel.id,
					channelTitle: channel.snippet.title,
					connected: true,
					connectedAt: FieldValue.serverTimestamp()
				}
			});

		throw redirect(302, `/groups/${groupId}?youtube=connected`);
	} catch (err) {
		if (err.status === 302) throw err;
		console.error('OAuth callback error:', err);
		throw redirect(302, `/groups/${groupId}?error=${encodeURIComponent(err.message)}`);
	}
}
