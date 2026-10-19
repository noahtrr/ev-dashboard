import { redirect } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { methods } = getApp();
	if (locals.user) redirect(303, '/');
	// Without mail there is no way to deliver the link.
	if (!methods.mail || !methods.emailPassword) redirect(303, '/login');
	return {};
};
