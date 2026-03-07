import { redirect } from '@sveltejs/kit';
import { createOAuth2Client, YOUTUBE_SCOPES } from '$lib/server/google-oauth.js';

export async function GET({ url }) {
	const groupId = url.searchParams.get('groupId');
	if (!groupId) {
		return new Response(JSON.stringify({ error: 'Missing groupId' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const oauth2Client = createOAuth2Client();
	const authUrl = oauth2Client.generateAuthUrl({
		access_type: 'offline',
		prompt: 'consent',
		scope: YOUTUBE_SCOPES,
		state: groupId
	});

	throw redirect(302, authUrl);
}
