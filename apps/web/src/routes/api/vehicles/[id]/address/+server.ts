import { error, json } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

// Loaded by the dashboard after the page, so a slow geocoding service never delays it.
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, geocoder } = getApp();
	const latest = await vehicles.latestValues(locals.user.id, params.id);
	if (!latest) error(404, 'Not found');
	const { latitude, longitude } = latest.data;
	const address =
		geocoder && latitude !== undefined && longitude !== undefined
			? await geocoder.lookup(latitude, longitude, locals.locale)
			: null;
	return json({ address }, { headers: { 'cache-control': 'private, max-age=60' } });
};
