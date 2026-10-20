import { error } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { RANGES, type Range } from '#lib/consumption.ts';
import { consumptionTrips } from '#lib/server/vehicles/consumption.ts';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, logbook } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	if (!connection) error(404, 'Not found');

	const requested = url.searchParams.get('range');
	const range: Range = (RANGES as readonly string[]).includes(requested ?? '')
		? (requested as Range)
		: 'year';
	// The statistics are computed in the browser, in the viewer's time zone.
	const entries = await logbook.list(locals.user.id, params.id, new Date(0), new Date(), 'asc');
	return {
		connection: {
			id: connection.id,
			label: connection.label,
			batteryCapacityKwh: connection.batteryCapacityKwh
		},
		range,
		ranges: [...RANGES],
		trips: consumptionTrips(entries)
	};
}) satisfies PageServerLoad;
