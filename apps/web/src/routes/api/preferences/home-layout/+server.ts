import { error, json } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { jsonBody } from '#lib/server/json-body.ts';
import type { RequestHandler } from './$types';

// Saved by the home page on every change while it is being arranged.
export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await jsonBody(request);
	if (!Array.isArray(body.layout)) error(400, 'Missing layout');
	const layout = await getApp().preferences.setHomeLayout(locals.user.id, body.layout);
	return json({ layout });
};
