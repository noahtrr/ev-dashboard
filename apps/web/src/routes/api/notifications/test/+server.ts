import { error, json } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { jsonBody } from '#lib/server/json-body.ts';
import type { RequestHandler } from './$types';

// Sends the test message to the device that asked for it.
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { endpoint } = await jsonBody(request);
	if (typeof endpoint !== 'string') error(400, 'Missing endpoint');
	return json({ result: await getApp().notifier.sendTest(locals.user.id, endpoint) });
};
