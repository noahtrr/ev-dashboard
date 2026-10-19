import { redirect } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

// Better Auth checks the link and forwards here with `token`, or with `error` when it is invalid.
export const load: PageServerLoad = async ({ url }) => {
	const { methods } = getApp();
	if (!methods.mail || !methods.emailPassword) redirect(303, '/login');
	const token = url.searchParams.get('token');
	return { token: url.searchParams.has('error') ? null : token };
};
