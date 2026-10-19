import { redirect } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { countUsers } from '#lib/server/auth/config.ts';
import { safeRedirect } from '#lib/auth-shared.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { db, methods } = getApp();
	const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));
	if (locals.user) redirect(303, redirectTo);
	if ((await countUsers(db)) === 0) redirect(303, '/setup');
	// `error` comes from Better Auth after a failed OAuth/SSO sign-in or an invalid link.
	return {
		methods,
		redirectTo,
		errorCode: url.searchParams.get('error'),
		passwordReset: url.searchParams.has('reset')
	};
};
