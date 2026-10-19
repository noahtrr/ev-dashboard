import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { getApp } from '#lib/server/app.ts';
import { countUsers } from '#lib/server/auth/config.ts';
import { pickLocale } from '#lib/i18n.ts';

// Reachable without a session. Everything else requires login.
const PUBLIC_PATHS = new Set(['/api/health', '/login', '/signup', '/setup']);

// Open the database, run migrations and load secrets at startup instead of on the first request.
export const init: ServerInit = () => {
	if (!building) getApp();
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

	if (path.startsWith('/api/')) {
		return new Response(JSON.stringify({ error: 'unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}
	const target = (await countUsers(db)) === 0 ? '/setup' : '/login';
	const next = path === '/' ? '' : `?redirectTo=${encodeURIComponent(path + event.url.search)}`;
	return new Response(null, { status: 303, headers: { location: target + next } });
};
