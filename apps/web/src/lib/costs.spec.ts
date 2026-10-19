import { describe, expect, it } from 'vitest';
import {
	costStats,
	distanceM,
	homeCsv,
	parseDecimal,
	priceAt,
	sessionCost,
	type CostSession,
	type Price
} from './costs.ts';

// Local times, so the tests hold in any time zone.
const at = (month: number, day: number, hour = 20) =>
	new Date(2026, month - 1, day, hour).getTime();
const NOW = at(10, 19, 12);

const prices: Price[] = [
	{ id: 'h1', kind: 'home', from: '2025-01-01', ct: 34 },
	{ id: 'h2', kind: 'home', from: '2026-09-15', ct: 30 },
	{ id: 'a1', kind: 'away', from: '2026-01-01', ct: 50 }
];

const session = (t: number, values: Partial<CostSession> = {}): CostSession => ({
	t,
	end: t + 3600_000,
	addedPct: 20,
	home: true,
	priceCt: null,
	costEur: null,
	...values
});

describe('priceAt', () => {
	it('uses the newest price that started on or before the day', () => {
		expect(priceAt(prices, 'home', at(9, 14))).toBe(34);
		expect(priceAt(prices, 'home', at(9, 15, 0))).toBe(30);
		expect(priceAt(prices, 'away', at(9, 15))).toBe(50);
		expect(priceAt(prices, 'away', new Date(2025, 5, 1).getTime())).toBeNull();
	});
});

describe('sessionCost', () => {
	it('adds charging losses to the energy put into the battery', () => {
		const cost = sessionCost(session(at(10, 1)), prices, 80, 10);
		expect(cost.batteryKwh).toBe(16);
		expect(cost.gridKwh).toBeCloseTo(17.6);
		expect(cost.ct).toBe(30);
		expect(cost.eur).toBeCloseTo(5.28);
		expect(cost.source).toBe('price');
	});

	it('prefers the amount from a receipt, then the owner’s price', () => {
		const receipt = sessionCost(session(at(10, 1), { costEur: 11, priceCt: 70 }), prices, 80, 10);
		expect(receipt).toMatchObject({ eur: 11, source: 'receipt' });
		expect(receipt.ct).toBeCloseTo(62.5);
		const own = sessionCost(session(at(10, 1), { home: false, priceCt: 70 }), prices, 80, 0);
		expect(own).toMatchObject({ ct: 70, source: 'own' });
		expect(own.eur).toBeCloseTo(11.2);
	});

	it('has no amount without a capacity or a price', () => {
		expect(sessionCost(session(at(10, 1)), prices, null, 10)).toMatchObject({
			gridKwh: null,
			eur: null,
			source: null
		});
		expect(
			sessionCost(session(at(10, 1), { addedPct: null, costEur: 9 }), prices, null, 10)
		).toMatchObject({ eur: 9, ct: null, source: 'receipt' });
		expect(sessionCost(session(new Date(2024, 0, 1).getTime()), prices, 80, 10).eur).toBeNull();
	});
});

describe('costStats', () => {
	const sessions = [
		session(at(9, 10)), // 16 kWh × 1.1 × 34 ct = 5.984
		session(at(10, 2)), // × 30 ct = 5.28
		session(at(10, 5), { home: false }), // × 50 ct = 8.8
		session(at(10, 8), { addedPct: null }) // unknown energy
	];
	const trips = [
		{ t: at(10, 3), km: 100, purpose: 'business' },
		{ t: at(10, 6), km: 50, purpose: 'private' },
		{ t: at(10, 7), km: 50, purpose: null }
	];

	it('sums the current month by place, with the previous month for comparison', () => {
		const stats = costStats(sessions, trips, prices, 80, 10, 'month', NOW);
		expect(stats.from).toBe(new Date(2026, 9, 1).getTime());
		expect(stats.home).toBeCloseTo(5.28);
		expect(stats.away).toBeCloseTo(8.8);
		expect(stats.eur).toBeCloseTo(14.08);
		expect(stats.gridKwh).toBeCloseTo(35.2);
		expect(stats.avgCt).toBeCloseTo(40);
		expect(stats.km).toBe(200);
		expect(stats.per100).toBeCloseTo(7.04);
		expect(stats.previous).toBeCloseTo(5.984);
		expect(stats.perMonth).toBeNull();
		expect(stats.unpriced).toBe(1);
		expect(stats.sessions).toHaveLength(3);
		expect(stats.months).toHaveLength(1);
		expect(stats.purposes.map((p) => [p.key, p.km])).toEqual([
			['private', 50],
			['business', 100],
			['unclassified', 50]
		]);
		expect(stats.purposes[1].eur).toBeCloseTo(7.04);
	});

	it('gives months and an average per month for longer ranges', () => {
		const stats = costStats(sessions, trips, prices, 80, 10, 'year', NOW);
		expect(stats.months).toHaveLength(12);
		const [sep, oct] = stats.months.slice(-2);
		expect(sep.home).toBeCloseTo(5.984);
		expect(sep.homeKwh).toBeCloseTo(17.6);
		expect(oct.away).toBeCloseTo(8.8);
		expect(stats.perMonth).toBeCloseTo((5.984 + 14.08) / 12);
		expect(stats.previous).toBeNull();

		const all = costStats(sessions, trips, prices, 80, 10, 'all', NOW);
		expect(all.from).toBe(at(9, 10));
		expect(all.months).toHaveLength(2);
	});

	it('has no cost per 100 km or split by purpose with too little distance', () => {
		const stats = costStats(
			sessions,
			[{ t: at(10, 3), km: 10, purpose: null }],
			prices,
			80,
			10,
			'month',
			NOW
		);
		expect(stats.per100).toBeNull();
		expect(stats.purposes).toEqual([]);
	});
});

describe('homeCsv', () => {
	it('lists the sessions charged at home with a known amount', () => {
		const costed = [
			session(at(10, 2)),
			session(at(10, 5), { home: false }),
			session(at(10, 8), { addedPct: null })
		].map((s) => ({ ...s, ...sessionCost(s, prices, 80, 10) }));
		const columns = {
			date: 'Datum',
			start: 'Beginn',
			end: 'Ende',
			battery: 'kWh Akku',
			grid: 'kWh Netz',
			price: 'Preis ct/kWh',
			cost: 'Kosten EUR'
		};
		expect(homeCsv(costed, columns, 'de-DE')).toBe(
			'﻿Datum;Beginn;Ende;kWh Akku;kWh Netz;Preis ct/kWh;Kosten EUR\r\n' +
				'2026-10-02;20:00;21:00;16,00;17,60;30,0;5,28\r\n'
		);
		expect(homeCsv(costed, columns, 'en-GB').split('\r\n')[1]).toBe(
			'2026-10-02,20:00,21:00,16.00,17.60,30.0,5.28'
		);
	});
});

describe('distanceM', () => {
	it('measures short distances in metres', () => {
		expect(distanceM(52.5, 13.4, 52.501, 13.4)).toBeCloseTo(111.2, 0);
	});
});

describe('parseDecimal', () => {
	it('accepts a decimal comma, an empty field and a range', () => {
		expect(parseDecimal('32,5', 0, 500)).toBe(32.5);
		expect(parseDecimal(' 49 ', 0, 500)).toBe(49);
		expect(parseDecimal('', 0, 500)).toBeNull();
		expect(parseDecimal('501', 0, 500)).toBeUndefined();
		expect(parseDecimal('-1', 0, 500)).toBeUndefined();
		expect(parseDecimal('1e3', 0, 5000)).toBeUndefined();
		expect(parseDecimal(null, 0, 500)).toBeUndefined();
	});
});
