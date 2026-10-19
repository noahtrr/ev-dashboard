import { error, fail } from '@sveltejs/kit';
import * as env from '$app/env/private';
import { DEFAULT_LOSS_PCT, parseDecimal } from '#lib/costs.ts';
import { getApp } from '#lib/server/app.ts';
import { deriveSessions, sessionDetails, withEnergy } from '#lib/server/vehicles/charging.ts';
import { COST_MAX_EUR, isHome, PRICE_MAX_CT, PRICE_MIN_CT } from '#lib/server/vehicles/costs.ts';
import type { Actions, PageServerLoad } from './$types';

/** Longest session the page looks for; longer runs are cut here. */
const MAX_SESSION_MS = 7 * 24 * 3600 * 1000;

/** The owner's session around `start` (milliseconds in the URL), or a 404. */
async function findSession(userId: string, connectionId: string, startParam: string) {
	const { vehicles } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(userId, connectionId);
	if (!connection) error(404, 'Not found');

	// The session is addressed by its start time in milliseconds (any time inside it works).
	const start = /^\d{1,15}$/.test(startParam) ? Number(startParam) : NaN;
	if (!Number.isSafeInteger(start)) error(404, 'Not found');
	const gap = vehicles.staleAfterMs;
	const points = await vehicles.history(
		userId,
		connectionId,
		new Date(start - gap),
		new Date(start + MAX_SESSION_MS)
	);
	const session = withEnergy(deriveSessions(points, gap), connection.batteryCapacityKwh).find(
		(s) => s.start.getTime() <= start && start <= s.end.getTime()
	);
	if (!session) error(404, 'Not found');
	return { connection, points, session, gap };
}

export const load = (async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { geocoder, costs } = getApp();
	const { connection, points, session, gap } = await findSession(
		locals.user.id,
		params.id,
		params.start
	);
	const settings = await costs.settings(locals.user.id, params.id);
	const entry = await costs.entry(locals.user.id, params.id, session.start);

	// The chart shows a little of the time before and after the session.
	const end = session.end.getTime();
	const begin = session.start.getTime();
	const pad = Math.max(gap, (end - begin) / 10);
	const from = begin - pad;
	const to = Math.min(end + pad, Date.now());
	const chart = points
		.filter((p) => p.data.stateOfChargePct !== undefined)
		.map((p) => ({ t: p.at.getTime(), soc: p.data.stateOfChargePct! }))
		.filter((p) => p.t >= from && p.t <= to);

	const { latitude, longitude } = session;
	return {
		connection: {
			id: connection.id,
			label: connection.label,
			batteryCapacityKwh: connection.batteryCapacityKwh
		},
		session,
		costs: {
			prices: settings?.prices ?? [],
			lossPct: settings?.lossPct ?? DEFAULT_LOSS_PCT,
			home: settings?.home
				? isHome(
						{
							homeLatitude: settings.home.latitude,
							homeLongitude: settings.home.longitude
						},
						latitude,
						longitude
					)
				: false,
			hasHome: settings?.home !== null && settings?.home !== undefined,
			entry: entry ?? { priceCt: null, costEur: null }
		},
		details: sessionDetails(points, session, gap),
		chart,
		from,
		to,
		maxGapMs: gap,
		map: { tilesUrl: env.MAP_TILES_URL, glyphsUrl: env.MAP_GLYPHS_URL },
		// Streamed, so a slow geocoding service never delays the page.
		address:
			geocoder && latitude !== undefined && longitude !== undefined
				? geocoder.lookup(latitude, longitude, locals.locale).catch(() => null)
				: null
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	/** Makes this session's place the home location. */
	home: async ({ locals, params }) => {
		if (!locals.user) error(401, 'Unauthorized');
		const { session } = await findSession(locals.user.id, params.id, params.start);
		if (session.latitude === undefined || session.longitude === undefined) return fail(400, {});
		await getApp().costs.setHome(locals.user.id, params.id, {
			latitude: session.latitude,
			longitude: session.longitude
		});
		return {};
	},
	/** The owner's price (ct/kWh) or total (€) for this session; exactly one of them. */
	entry: async ({ locals, params, request }) => {
		if (!locals.user) error(401, 'Unauthorized');
		const { session } = await findSession(locals.user.id, params.id, params.start);
		const form = await request.formData();
		const priceCt = parseDecimal(form.get('ct') ?? '', PRICE_MIN_CT, PRICE_MAX_CT);
		const costEur = parseDecimal(form.get('eur') ?? '', 0, COST_MAX_EUR);
		if (
			session.ongoing ||
			priceCt === undefined ||
			costEur === undefined ||
			(priceCt === null) === (costEur === null)
		) {
			return fail(400, { entryError: true });
		}
		await getApp().costs.setEntry(locals.user.id, params.id, session, { priceCt, costEur });
		return { entrySaved: true };
	},
	clearEntry: async ({ locals, params }) => {
		if (!locals.user) error(401, 'Unauthorized');
		const { session } = await findSession(locals.user.id, params.id, params.start);
		if (session.ongoing) return fail(400, {});
		await getApp().costs.setEntry(locals.user.id, params.id, session, {
			priceCt: null,
			costEur: null
		});
		return {};
	}
};
