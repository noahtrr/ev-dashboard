import { error } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { deriveSessions, thinSeries, withEnergy } from '#lib/server/vehicles/charging.ts';
import type { PageServerLoad } from './$types';

const PERIODS = [7, 30, 90] as const;
const DEFAULT_PERIOD = 30;
/** Points sent to the chart; enough for a smooth line at any width. */
const CHART_POINTS = 600;

export const load = (async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	if (!connection) error(404, 'Not found');

	const requested = Number(url.searchParams.get('days'));
	const days = (PERIODS as readonly number[]).includes(requested) ? requested : DEFAULT_PERIOD;
	const to = Date.now();
	const from = to - days * 24 * 3600 * 1000;
	const points = await vehicles.history(locals.user.id, params.id, new Date(from));
	const sessions = withEnergy(
		deriveSessions(points, vehicles.staleAfterMs, to),
		connection.batteryCapacityKwh
	);
	const soc = points
		.filter((p) => p.data.stateOfChargePct !== undefined)
		.map((p) => ({ t: p.at.getTime(), soc: p.data.stateOfChargePct! }));

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
		// Thinned points are further apart than raw ones; only real outages break the line.
		maxGapMs: Math.max(vehicles.staleAfterMs, (4 * (to - from)) / CHART_POINTS),
		chart: thinSeries(soc, CHART_POINTS),
		sessions
	};
}) satisfies PageServerLoad;
