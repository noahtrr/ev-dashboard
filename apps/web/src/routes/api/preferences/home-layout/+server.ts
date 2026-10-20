import { error, json } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

// Saved by the home page on every change while it is being arranged.
export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Unauthorized');
	// Only JSON: browsers do not send it cross-site without asking first.
	if (!request.headers.get('content-type')?.startsWith('application/json')) {
		error(415, 'Unsupported media type');
	}
	let body: { layout?: unknown };
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}
	if (!Array.isArray(body?.layout)) error(400, 'Missing layout');
	const layout = await getApp().preferences.setHomeLayout(locals.user.id, body.layout);
	return json({ layout });
};
