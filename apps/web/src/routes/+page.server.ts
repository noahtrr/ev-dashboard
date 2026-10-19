import { error } from '@sveltejs/kit';
import * as env from '$app/env/private';
import { getApp } from '#lib/server/app.ts';
import { deriveSessions, withEnergy } from '#lib/server/vehicles/charging.ts';
import { vehicleCondition } from '#lib/server/vehicles/condition.ts';
import { deriveTrips, withTripEnergy } from '#lib/server/vehicles/trips.ts';
import type { PageServerLoad } from './$types';

/** How far back the home page looks for the last charging session and trip. */
const LOOKBACK_DAYS = 30;

export const load = (async ({ locals, url }) => {
	// The handle hook already sends anonymous visitors to the login page.
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, geocoder } = getApp();
	const connections = await vehicles.listConnections(locals.user.id);
	const current = connections.find((c) => c.id === url.searchParams.get('v')) ?? connections[0];
	const latest = current ? await vehicles.latestValues(locals.user.id, current.id) : undefined;
	// The newest charging session and trip (running or finished) for their modules.
	const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);
	const points = current ? await vehicles.history(locals.user.id, current.id, since) : [];
	const capacity = current?.batteryCapacityKwh ?? null;
	const [lastSession] = withEnergy(deriveSessions(points, vehicles.staleAfterMs), capacity);
	const [lastTrip] = withTripEnergy(deriveTrips(points, vehicles.staleAfterMs), capacity);
	return {
		vehicles: connections.map((c) => ({ id: c.id, label: c.label })),
		selected: current
			? {
					id: current.id,
					label: current.label,
					status: current.status,
					fetchedAt: latest?.fetchedAt ?? null,
					data: latest?.data ?? null,
					condition: vehicleCondition(latest?.data ?? {})
				}
			: null,
		lastSession: lastSession ?? null,
		lastTrip: lastTrip ?? null,
		// Values older than this are marked as stale.
		staleAfterMs: vehicles.staleAfterMs,
		geocoding: geocoder !== undefined,
		map: { tilesUrl: env.MAP_TILES_URL, glyphsUrl: env.MAP_GLYPHS_URL }
	};
}) satisfies PageServerLoad;
