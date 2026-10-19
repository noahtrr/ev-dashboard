import { error } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { RANGES, type ConsumptionTrip, type Range } from '#lib/consumption.ts';
import type { LogEntry } from '#lib/server/vehicles/logbook.ts';
import type { PageServerLoad } from './$types';

/** Shorter trips are dominated by the whole-percent steps of the state of charge. */
const MIN_TRIP_KM = 1;

/**
 * A trip counts when both charge levels are known, nothing is missing in between (a gap may
 * hide a charging stop) and the level did not rise.
 */
function counted(e: LogEntry): ConsumptionTrip | undefined {
	if (e.gap || e.distanceKm < MIN_TRIP_KM) return undefined;
	if (e.startSocPct === null || e.endSocPct === null || e.endSocPct > e.startSocPct)
		return undefined;
	return {
		t: e.startAt.getTime(),
		km: e.distanceKm,
		usedPct: e.startSocPct - e.endSocPct,
		tempC: e.outsideTempC
	};
}

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
		trips: entries.flatMap((e) => counted(e) ?? [])
	};
}) satisfies PageServerLoad;
