import { error } from '@sveltejs/kit';
import * as env from '$app/env/private';
import { DEFAULT_LOSS_PCT } from '#lib/costs.ts';
import { getApp } from '#lib/server/app.ts';
import { consumptionTrips } from '#lib/server/vehicles/consumption.ts';
import { deriveSessions, withEnergy } from '#lib/server/vehicles/charging.ts';
import { vehicleCondition } from '#lib/server/vehicles/condition.ts';
import { deriveTrips, withTripEnergy } from '#lib/server/vehicles/trips.ts';
import type { PageServerLoad } from './$types';

const DAY_MS = 24 * 3600 * 1000;
/** How far back the home page looks for the last charging session and trip. */
const LOOKBACK_DAYS = 30;
/** Trips for the cost module: this and the previous calendar month in any time zone. */
const COST_TRIP_DAYS = 62;

export const load = (async ({ locals, url }) => {
	// The handle hook already sends anonymous visitors to the login page.
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, geocoder, logbook, costs, preferences } = getApp();
	const layout = await preferences.homeLayout(locals.user.id);
	const shows = (id: string) => layout.some((m) => m.id === id && m.on);
	const connections = await vehicles.listConnections(locals.user.id);
	const current = connections.find((c) => c.id === url.searchParams.get('v')) ?? connections[0];
	const latest = current ? await vehicles.latestValues(locals.user.id, current.id) : undefined;
	// The newest charging session and trip (running or finished) for their modules.
	const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
	const points = current ? await vehicles.history(locals.user.id, current.id, since) : [];
	const capacity = current?.batteryCapacityKwh ?? null;
	const [lastSession] = withEnergy(deriveSessions(points, vehicles.staleAfterMs), capacity);
	const [lastTrip] = withTripEnergy(deriveTrips(points, vehicles.staleAfterMs), capacity);
	// The optional modules only load their data while they are shown.
	const settings =
		current && shows('costs') ? await costs.settings(locals.user.id, current.id) : undefined;
	const costData = settings && {
		prices: settings.prices,
		lossPct: settings.lossPct ?? DEFAULT_LOSS_PCT,
		sessions: await costs.sessions(locals.user.id, current!.id),
		trips: (
			await logbook.list(
				locals.user.id,
				current!.id,
				new Date(Date.now() - COST_TRIP_DAYS * DAY_MS),
				new Date(),
				'asc'
			)
		).map((e) => ({ t: e.startAt.getTime(), km: e.distanceKm, purpose: e.purpose }))
	};
	// 60 days: the last 30 and the 30 before them.
	const consumption =
		current && shows('consumption')
			? consumptionTrips(
					await logbook.list(
						locals.user.id,
						current.id,
						new Date(Date.now() - 60 * DAY_MS),
						new Date(),
						'asc'
					)
				)
			: null;
	return {
		layout,
		vehicles: connections.map((c) => ({ id: c.id, label: c.label })),
		selected: current
			? {
					id: current.id,
					label: current.label,
					status: current.status,
					fetchedAt: latest?.fetchedAt ?? null,
					data: latest?.data ?? null,
					batteryCapacityKwh: capacity,
					condition: vehicleCondition(latest?.data ?? {})
				}
			: null,
		lastSession: lastSession ?? null,
		lastTrip: lastTrip ?? null,
		costs: costData ?? null,
		consumption,
		// Values older than this are marked as stale.
		staleAfterMs: vehicles.staleAfterMs,
		geocoding: geocoder !== undefined,
		map: { tilesUrl: env.MAP_TILES_URL, glyphsUrl: env.MAP_GLYPHS_URL }
	};
}) satisfies PageServerLoad;
