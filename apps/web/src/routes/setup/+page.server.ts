import { redirect } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { countUsers } from '#lib/server/auth/config.ts';
import type { PageServerLoad } from './$types';

// First-run page: only reachable while no account exists.
export const load: PageServerLoad = async ({ url }) => {
	const { db, methods } = getApp();
	if ((await countUsers(db)) > 0) redirect(303, '/login');
	return { methods, errorCode: url.searchParams.get('error') };
};
