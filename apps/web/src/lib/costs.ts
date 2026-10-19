// Charging costs. Runs in the browser, so price dates, months and the current month follow
// the viewer's time zone. Energy is estimated from the state of charge a session added.

export const PRICE_KINDS = ['home', 'away'] as const;
export type PriceKind = (typeof PRICE_KINDS)[number];

/** Applies from `from` (`YYYY-MM-DD`, local calendar day) until the next price of its kind. */
export type Price = { id: string; kind: PriceKind; from: string; ct: number };

export type CostSession = {
	/** Start, epoch ms. */
	t: number;
	/** End, epoch ms. */
	end: number;
	/** Percentage points added; null when unknown. */
	addedPct: number | null;
	/** Charged within the home radius. */
	home: boolean;
	/** Price the owner entered for this session. */
	priceCt: number | null;
	/** Total the owner entered for this session; wins over any price. */
	costEur: number | null;
};

export type CostTrip = { t: number; km: number; purpose: string | null };

export const COST_RANGES = ['month', 'year', 'all'] as const;
export type CostRange = (typeof COST_RANGES)[number];

/** Used when the owner did not enter charging losses; grid energy = battery energy × (1 + loss). */
export const DEFAULT_LOSS_PCT = 10;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day of `t` as `YYYY-MM-DD`. */
export function localDay(t: number): string {
	const d = new Date(t);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The price of `kind` that applies on the local day of `t`, if any. */
export function priceEntryAt(prices: Price[], kind: PriceKind, t: number): Price | undefined {
	const day = localDay(t);
	let best: Price | undefined;
	for (const p of prices) {
		if (p.kind === kind && p.from <= day && (!best || p.from > best.from)) best = p;
	}
	return best;
}

export const priceAt = (prices: Price[], kind: PriceKind, t: number): number | null =>
	priceEntryAt(prices, kind, t)?.ct ?? null;

export type SessionCost = {
	/** Energy put into the battery; null without a known capacity. */
	batteryKwh: number | null;
	/** Energy drawn from the grid, including charging losses. */
	gridKwh: number | null;
	/** Price used, cents per grid kWh. */
	ct: number | null;
	eur: number | null;
	/** Where the amount comes from. */
	source: 'receipt' | 'own' | 'price' | null;
};

export function sessionCost(
	session: CostSession,
	prices: Price[],
	capacityKwh: number | null,
	lossPct: number
): SessionCost {
	const batteryKwh =
		capacityKwh !== null && session.addedPct !== null
			? (session.addedPct / 100) * capacityKwh
			: null;
	const gridKwh = batteryKwh === null ? null : batteryKwh * (1 + lossPct / 100);
	if (session.costEur !== null) {
		const ct = gridKwh ? (session.costEur / gridKwh) * 100 : null;
		return { batteryKwh, gridKwh, ct, eur: session.costEur, source: 'receipt' };
	}
	const own = session.priceCt !== null;
	const ct = own ? session.priceCt : priceAt(prices, session.home ? 'home' : 'away', session.t);
	const eur = ct !== null && gridKwh !== null ? (gridKwh * ct) / 100 : null;
	return { batteryKwh, gridKwh, ct, eur, source: eur === null ? null : own ? 'own' : 'price' };
}

function monthStart(t: number, offset = 0) {
	const d = new Date(t);
	return new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime();
}

export type Month = {
	start: number;
	home: number;
	away: number;
	/** Grid energy charged at home. */
	homeKwh: number;
};

export type CostStats = {
	from: number;
	to: number;
	eur: number;
	home: number;
	away: number;
	gridKwh: number;
	/** Distance driven in the range, from the trip log. */
	km: number;
	/** Euros per 100 km; null with too little distance. */
	per100: number | null;
	/** Average price, cents per grid kWh. */
	avgCt: number | null;
	/** Total of the previous calendar month, for `month`. */
	previous: number | null;
	/** Average per month, for `year` and `all`. */
	perMonth: number | null;
	months: Month[];
	/** Costs split by the trip log's distance shares. */
	purposes: { key: 'private' | 'business' | 'unclassified'; eur: number; km: number }[];
	/** Sessions in the range whose costs are unknown (no price or no capacity). */
	unpriced: number;
	sessions: (CostSession & SessionCost)[];
};

/** Less distance than this gives no meaningful cost per 100 km. */
const MIN_KM = 20;
/** Most months the chart shows for `all`. */
const MAX_MONTHS = 36;

export function costStats(
	sessions: CostSession[],
	trips: CostTrip[],
	prices: Price[],
	capacityKwh: number | null,
	lossPct: number,
	range: CostRange,
	now = Date.now()
): CostStats {
	const firstT = Math.min(...sessions.map((s) => s.t), ...trips.map((t) => t.t), now);
	const from =
		range === 'month' ? monthStart(now) : range === 'year' ? monthStart(now, -11) : firstT;
	const to = now;
	const costed = sessions.map((s) => ({ ...s, ...sessionCost(s, prices, capacityKwh, lossPct) }));
	const inRange = costed.filter((s) => s.t >= from && s.t < to);

	let home = 0;
	let away = 0;
	let gridKwh = 0;
	let pricedKwh = 0;
	let pricedEur = 0;
	for (const s of inRange) {
		if (s.eur === null) continue;
		if (s.home) home += s.eur;
		else away += s.eur;
		if (s.gridKwh !== null) {
			gridKwh += s.gridKwh;
			pricedKwh += s.gridKwh;
			pricedEur += s.eur;
		}
	}
	const eur = home + away;

	const tripsInRange = trips.filter((t) => t.t >= from && t.t < to);
	const km = tripsInRange.reduce((sum, t) => sum + t.km, 0);
	const purposeKm = { private: 0, business: 0, unclassified: 0 };
	for (const t of tripsInRange) {
		if (t.purpose === 'private' || t.purpose === 'business') purposeKm[t.purpose] += t.km;
		else purposeKm.unclassified += t.km;
	}
	const purposes =
		km >= MIN_KM && eur > 0
			? (['private', 'business', 'unclassified'] as const)
					.filter((key) => purposeKm[key] > 0)
					.map((key) => ({ key, km: purposeKm[key], eur: (eur * purposeKm[key]) / km }))
			: [];

	const months: Month[] = [];
	const first = monthStart(Math.max(from, monthStart(now, 1 - MAX_MONTHS)));
	for (let start = first; start < to; start = monthStart(start, 1)) {
		const end = monthStart(start, 1);
		const month: Month = { start, home: 0, away: 0, homeKwh: 0 };
		for (const s of costed) {
			if (s.t < start || s.t >= end || s.eur === null) continue;
			if (s.home) {
				month.home += s.eur;
				month.homeKwh += s.gridKwh ?? 0;
			} else month.away += s.eur;
		}
		months.push(month);
	}

	let previous: number | null = null;
	let perMonth: number | null = null;
	if (range === 'month') {
		const start = monthStart(now, -1);
		const prev = costed.filter((s) => s.t >= start && s.t < from && s.eur !== null);
		previous = prev.length > 0 ? prev.reduce((sum, s) => sum + (s.eur ?? 0), 0) : null;
	} else if (months.length > 0) {
		perMonth = eur / months.length;
	}

	return {
		from,
		to,
		eur,
		home,
		away,
		gridKwh,
		km,
		per100: km >= MIN_KM ? (eur / km) * 100 : null,
		avgCt: pricedKwh > 0 ? (pricedEur / pricedKwh) * 100 : null,
		previous,
		perMonth,
		months,
		purposes,
		unpriced: inRange.filter((s) => s.eur === null).length,
		sessions: inRange
	};
}

/** Distance between two points in metres (haversine). */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const rad = Math.PI / 180;
	const dLat = (lat2 - lat1) * rad;
	const dLon = (lon2 - lon1) * rad;
	const a =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
	return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

/** Sessions this close to the home location count as charged at home. */
export const HOME_RADIUS_M = 150;

/** Decimal number from a form field ("32,5" or "32.5"): null when empty, undefined when invalid. */
export function parseDecimal(value: unknown, min: number, max: number): number | null | undefined {
	if (typeof value !== 'string') return undefined;
	const text = value.trim().replace(',', '.');
	if (text === '') return null;
	if (!/^\d+(\.\d+)?$/.test(text)) return undefined;
	const n = Number(text);
	return n >= min && n <= max ? n : undefined;
}

/** CSV of the sessions charged at home with a known amount, for reimbursement. */
export function homeCsv(
	sessions: (CostSession & SessionCost)[],
	columns: Record<'date' | 'start' | 'end' | 'battery' | 'grid' | 'price' | 'cost', string>,
	tag: string
): string {
	const separator = tag.startsWith('de') ? ';' : ',';
	const number = (value: number | null, digits: number) =>
		value === null
			? ''
			: value.toLocaleString(tag, {
					minimumFractionDigits: digits,
					maximumFractionDigits: digits,
					useGrouping: false
				});
	const time = (t: number) =>
		new Date(t).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' });
	const lines = [
		[
			columns.date,
			columns.start,
			columns.end,
			columns.battery,
			columns.grid,
			columns.price,
			columns.cost
		],
		...sessions
			.filter((s) => s.home && s.eur !== null)
			.map((s) => [
				localDay(s.t),
				time(s.t),
				time(s.end),
				number(s.batteryKwh, 2),
				number(s.gridKwh, 2),
				number(s.ct, 1),
				number(s.eur, 2)
			])
	];
	// The byte order mark makes spreadsheet programs read the file as UTF-8.
	return `\uFEFF${lines.map((fields) => fields.join(separator)).join('\r\n')}\r\n`;
}
