import { error } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, logbook } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	if (!connection) error(404, 'Not found');
	return {
		connection: { id: connection.id, label: connection.label },
		trips: (await logbook.manualTrips(locals.user.id, connection.id)).map((e) => ({
			id: e.id,
			start: e.startAt,
			distanceKm: e.distanceKm,
			startAddress: e.startAddress,
			endAddress: e.endAddress,
			purpose: e.purpose
		}))
	};
}) satisfies PageServerLoad;
