import { error } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { deriveTrips, withTripEnergy } from '#lib/server/vehicles/trips.ts';
import type { PageServerLoad } from './$types';

const PERIODS = [7, 30, 90] as const;
const DEFAULT_PERIOD = 30;
const DAY = 24 * 3600 * 1000;

export const load = (async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	if (!connection) error(404, 'Not found');

	const requested = Number(url.searchParams.get('days'));
	const days = (PERIODS as readonly number[]).includes(requested) ? requested : DEFAULT_PERIOD;
	const to = Date.now();
	const from = to - days * DAY;
	const points = await vehicles.history(locals.user.id, params.id, new Date(from));
	const trips = withTripEnergy(
		deriveTrips(points, vehicles.staleAfterMs, to),
		connection.batteryCapacityKwh
	);

	return {
		connection: {
			id: connection.id,
			label: connection.label,
			batteryCapacityKwh: connection.batteryCapacityKwh
		},
		days,
		periods: [...PERIODS],
		from,
		to,
		trips
	};
}) satisfies PageServerLoad;
