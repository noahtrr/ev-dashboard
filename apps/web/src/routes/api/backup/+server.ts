import { error } from '@sveltejs/kit';
import { APP_VERSION } from '$app/env/private';
import { getApp } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

// The account page's download link: everything of the signed-in user as one JSON file.
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const now = new Date();
	const backup = await getApp().backups.exportBackup(locals.user.id, APP_VERSION, now);
	const name = locals.locale === 'de' ? 'ev-dashboard-sicherung' : 'ev-dashboard-backup';
	return new Response(JSON.stringify(backup), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="${name}-${now.toISOString().slice(0, 10)}.json"`,
			'cache-control': 'no-store'
		}
	});
};
