import { redirect } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { countUsers } from '#lib/server/auth/config.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { db, methods } = getApp();
	if (locals.user) redirect(303, '/');
	if ((await countUsers(db)) === 0) redirect(303, '/setup');
	if (!methods.allowSignup) redirect(303, '/login');
	return { methods, errorCode: url.searchParams.get('error') };
};
