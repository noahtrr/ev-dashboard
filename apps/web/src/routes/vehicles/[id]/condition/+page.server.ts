import { error } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { hourlyMinimum, vehicleCondition } from '#lib/server/vehicles/condition.ts';
import type { PageServerLoad } from './$types';

const DAY_MS = 24 * 3600 * 1000;
/** Span of the 12 V battery chart. */
const VOLTAGE_DAYS = 14;
/** Trips for this month, this year and the daily average. */
const TRIP_DAYS = 400;

export const load = (async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, logbook } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	if (!connection) error(404, 'Not found');

	const now = Date.now();
	const latest = await vehicles.latestValues(locals.user.id, params.id);
	const data = latest?.data ?? {};
	const points =
		data.battery12vVoltage === undefined
			? []
			: await vehicles.history(locals.user.id, params.id, new Date(now - VOLTAGE_DAYS * DAY_MS));
	// Month and year are cut in the browser, in the viewer's time zone.
	const entries = await logbook.list(
		locals.user.id,
		params.id,
		new Date(now - TRIP_DAYS * DAY_MS),
		new Date(now),
		'asc'
	);
	return {
		connection: { id: connection.id, label: connection.label },
		fetchedAt: latest?.fetchedAt ?? null,
		data,
		condition: vehicleCondition(data),
		voltages: hourlyMinimum(
			points.flatMap((p) =>
				p.data.battery12vVoltage === undefined
					? []
					: [{ at: p.at, volts: p.data.battery12vVoltage }]
			)
		),
		trips: entries.map((e) => ({ t: e.startAt.getTime(), km: e.distanceKm }))
	};
}) satisfies PageServerLoad;
