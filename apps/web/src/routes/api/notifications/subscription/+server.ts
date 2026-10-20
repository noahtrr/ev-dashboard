import { error, json } from '@sveltejs/kit';
import { deviceLabel } from '#lib/server/admin/users.ts';
import { getApp } from '#lib/server/app.ts';
import { jsonBody } from '#lib/server/json-body.ts';
import type { RequestHandler } from './$types';

// Called by the account page after the browser created a push subscription.
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await jsonBody(request);
	const ok = await getApp().notifier.subscribe(
		locals.user.id,
		(body.subscription ?? {}) as {
			endpoint?: unknown;
			keys?: { p256dh?: unknown; auth?: unknown };
		},
		deviceLabel(request.headers.get('user-agent')),
		locals.locale
	);
	if (!ok) error(400, 'Invalid subscription');
	return json({ ok: true });
};

// Turning notifications off on this device (by endpoint), another device (by id), and signing out.
export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { endpoint, id } = await jsonBody(request);
	const { notifier } = getApp();
	if (typeof endpoint === 'string') await notifier.unsubscribe(locals.user.id, endpoint);
	else if (typeof id === 'string') await notifier.removeDevice(locals.user.id, id);
	else error(400, 'Missing endpoint or id');
	return json({ ok: true });
};
