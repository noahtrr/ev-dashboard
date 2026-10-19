import { error } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { COST_RANGES, DEFAULT_LOSS_PCT, type CostRange } from '#lib/costs.ts';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, logbook, costs } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	const settings = await costs.settings(locals.user.id, params.id);
	if (!connection || !settings) error(404, 'Not found');

	const requested = url.searchParams.get('range');
	const range: CostRange = (COST_RANGES as readonly string[]).includes(requested ?? '')
		? (requested as CostRange)
		: 'month';
	// Amounts, months and price days are worked out in the browser, in the viewer's time zone.
	const trips = await logbook.list(locals.user.id, params.id, new Date(0), new Date(), 'asc');
	return {
		connection: {
			id: connection.id,
			label: connection.label,
			batteryCapacityKwh: connection.batteryCapacityKwh
		},
		range,
		ranges: [...COST_RANGES],
		prices: settings.prices,
		lossPct: settings.lossPct ?? DEFAULT_LOSS_PCT,
		hasHome: settings.home !== null,
		sessions: await costs.sessions(locals.user.id, params.id),
		trips: trips.map((e) => ({ t: e.startAt.getTime(), km: e.distanceKm, purpose: e.purpose }))
	};
}) satisfies PageServerLoad;
