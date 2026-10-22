import { error, fail } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { parseCapacity } from '#lib/server/vehicles/charging.ts';
import { DEFAULT_LOSS_PCT, parseDecimal } from '#lib/costs.ts';
import { parseQuota } from '#lib/private-quota.ts';
import {
	isDay,
	isPriceKind,
	LOSS_MAX_PCT,
	PRICE_MAX_CT,
	PRICE_MIN_CT
} from '#lib/server/vehicles/costs.ts';
import type { Actions, PageServerLoad } from './$types';

/** Longest raw JSON text sent to the page per endpoint. */
const MAX_RAW_CHARS = 200_000;

export const load = (async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, costs, geocoder } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	if (!connection) error(404, 'Not found');
	const latest = await vehicles.latestSnapshot(locals.user.id, params.id);
	const raw = Object.entries(latest?.raw ?? {}).map(([endpoint, response]) => {
		const text = JSON.stringify(response?.body ?? null, null, 2) ?? 'null';
		return {
			endpoint,
			status: typeof response?.status === 'number' ? response.status : 0,
			error: typeof response?.error === 'string' ? response.error : undefined,
			text: text.length > MAX_RAW_CHARS ? text.slice(0, MAX_RAW_CHARS) : text,
			truncated: text.length > MAX_RAW_CHARS
		};
	});
	const settings = await costs.settings(locals.user.id, params.id);
	const home = settings?.home ?? null;
	return {
		connection,
		costs: {
			prices: settings?.prices ?? [],
			lossPct: settings?.lossPct ?? null,
			defaultLossPct: DEFAULT_LOSS_PCT,
			home,
			// Streamed, so a slow address service does not hold up the page.
			homeAddress:
				home && geocoder
					? geocoder.lookup(home.latitude, home.longitude, locals.locale)
					: Promise.resolve(null)
		},
		snapshot: latest ? { fetchedAt: latest.fetchedAt, data: latest.data } : null,
		raw
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	capacity: async ({ locals, params, request }) => {
		if (!locals.user) error(401, 'Unauthorized');
		const parsed = parseCapacity((await request.formData()).get('capacity'));
		if (!parsed.ok) return fail(400, { capacityError: true });
		const saved = await getApp().vehicles.setBatteryCapacity(
			locals.user.id,
			params.id,
			parsed.value
		);
		if (!saved) error(404, 'Not found');
		return { capacitySaved: true };
	},
	quota: async ({ locals, params, request }) => {
		if (!locals.user) error(401, 'Unauthorized');
		const form = await request.formData();
		const parsed = parseQuota(form.get('quotaKm'), form.get('warnPct'));
		if (typeof parsed === 'string') return fail(400, { quotaError: parsed });
		const saved = await getApp().vehicles.setPrivateQuota(locals.user.id, params.id, parsed);
		if (!saved) error(404, 'Not found');
		return { quotaSaved: true };
	},
	price: async ({ locals, params, request }) => {
		if (!locals.user) error(401, 'Unauthorized');
		const form = await request.formData();
		const kind = form.get('kind');
		const from = form.get('from');
		const ct = parseDecimal(form.get('ct'), PRICE_MIN_CT, PRICE_MAX_CT);
		if (!isPriceKind(kind) || !isDay(from) || ct === null || ct === undefined) {
			return fail(400, { priceError: kind === 'away' ? 'away' : 'home' });
		}
		const saved = await getApp().costs.setPrice(locals.user.id, params.id, kind, from, ct);
		if (!saved) error(404, 'Not found');
		return { priceSaved: kind };
	},
	deletePrice: async ({ locals, params, request }) => {
		if (!locals.user) error(401, 'Unauthorized');
		const id = (await request.formData()).get('id');
		if (typeof id !== 'string') return fail(400, {});
		const done = await getApp().costs.deletePrice(locals.user.id, params.id, id);
		if (!done) error(404, 'Not found');
		return {};
	},
	loss: async ({ locals, params, request }) => {
		if (!locals.user) error(401, 'Unauthorized');
		const pct = parseDecimal((await request.formData()).get('loss'), 0, LOSS_MAX_PCT);
		if (pct === undefined) return fail(400, { lossError: true });
		const saved = await getApp().costs.setLoss(locals.user.id, params.id, pct);
		if (!saved) error(404, 'Not found');
		return { lossSaved: true };
	},
	clearHome: async ({ locals, params }) => {
		if (!locals.user) error(401, 'Unauthorized');
		const saved = await getApp().costs.setHome(locals.user.id, params.id, null);
		if (!saved) error(404, 'Not found');
		return {};
	}
};
