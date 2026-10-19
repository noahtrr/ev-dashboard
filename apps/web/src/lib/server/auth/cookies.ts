// Copies the cookies of a server-side Better Auth call (e.g. a new session) onto the response.
import type { Cookies } from '@sveltejs/kit';
import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies';

export function applyAuthCookies(headers: Headers, cookies: Cookies) {
	const setCookie = headers.get('set-cookie');
	if (!setCookie) return;
	for (const [name, attributes] of parseSetCookieHeader(setCookie)) {
		cookies.set(name, attributes.value, {
			...toCookieOptions(attributes),
			path: attributes.path || '/'
		});
	}
}
