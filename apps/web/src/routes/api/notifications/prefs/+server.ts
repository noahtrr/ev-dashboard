import { error, json } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { jsonBody } from '#lib/server/json-body.ts';
import type { RequestHandler } from './$types';

// Saved by the account page on every change of the event switches.
export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await jsonBody(request);
	if (typeof body.prefs !== 'object' || body.prefs === null) error(400, 'Missing prefs');
	const prefs = await getApp().notifier.setPrefs(locals.user.id, body.prefs);
	return json({ prefs });
};
