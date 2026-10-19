import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { getApp, startVehiclePoller } from '#lib/server/app.ts';
import { countUsers } from '#lib/server/auth/config.ts';
import { pickLocale } from '#lib/i18n.ts';

// Reachable without a session. Everything else requires login.
const PUBLIC_PATHS = new Set([
	'/api/health',
	'/login',
	'/signup',
	'/setup',
	'/forgot-password',
	'/reset-password'
]);

// Open the database, run migrations and load secrets at startup instead of on the first
// request, then start the vehicle data poller.
export const init: ServerInit = () => {
	if (building) return;
	getApp();
	startVehiclePoller();
};

export const handle: Handle = async ({ event, resolve }) => {
	const locale = pickLocale(event.request.headers.get('accept-language'));
	event.locals.locale = locale;
	const render = () =>
		resolve(event, {
			transformPageChunk: ({ html }) => html.replace('<html lang="de">', `<html lang="${locale}">`)
		});

	const path = event.url.pathname;
	if (building || path === '/api/health') return render();

	const { auth, db } = getApp();
	// /api/auth/* is answered by Better Auth (sign-in, callbacks, passkeys, rate limiting).
	if (path.startsWith('/api/auth/')) return auth.handler(event.request);

	const session = await auth.api.getSession({ headers: event.request.headers });
	if (session) {
		const { id, name, email, role } = session.user;
		event.locals.user = { id, name, email, role };
		return render();
	}
	if (PUBLIC_PATHS.has(path)) return render();

	// A provider callback is a browser navigation: send the user to sign in and back.
	const isCallback = /^\/api\/providers\/[^/]+\/callback$/.test(path);
	if (path.startsWith('/api/') && !isCallback) {
		return new Response(JSON.stringify({ error: 'unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}
	const target = (await countUsers(db)) === 0 ? '/setup' : '/login';
	const next = path === '/' ? '' : `?redirectTo=${encodeURIComponent(path + event.url.search)}`;
	return new Response(null, { status: 303, headers: { location: target + next } });
};
