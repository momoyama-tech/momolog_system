import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';

export async function POST({ request }) {
	const PROCESSOR_URL = env.PUBLIC_PROCESSOR_URL;
	if (!PROCESSOR_URL) {
		return json({ error: 'Processor URL not configured' }, { status: 500 });
	}

	const body = await request.json();

	try {
		const response = await fetch(`${PROCESSOR_URL}/process`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});

		const result = await response.json();

		if (!response.ok) {
			return json(result, { status: response.status });
		}

		return json(result);
	} catch (err) {
		console.error('Process proxy error:', err);
		return json({ error: err.message || 'Processing failed' }, { status: 500 });
	}
}
