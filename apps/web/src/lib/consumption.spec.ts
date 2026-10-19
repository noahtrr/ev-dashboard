import { describe, expect, it } from 'vitest';
import { consumptionStats, totals, type ConsumptionTrip } from './consumption.ts';

// Local dates, so the tests hold in any time zone.
const at = (month: number, day: number, hour = 8) => new Date(2026, month - 1, day, hour).getTime();
const trip = (t: number, km: number, usedPct: number, tempC: number | null = null) => ({
	t,
	km,
	usedPct,
	tempC
});
const NOW = at(10, 19, 12);

describe('totals', () => {
	it('weights by distance and leaves out too little distance', () => {
		// 20 % of 75 kWh over 100 km and 4 % over 20 km: 18 kWh / 120 km.
		const sum = totals([trip(0, 100, 20), trip(1, 20, 4)], 0.75)!;
		expect(sum.km).toBe(120);
		expect(sum.used).toBeCloseTo(18);
		expect(sum.per100).toBeCloseTo(15);
		expect(totals([trip(0, 12, 3)], 0.75)).toBeNull();
	});
});

describe('consumptionStats', () => {
	const trips: ConsumptionTrip[] = [
		trip(at(9, 1), 40, 10, -2),
		trip(at(9, 25), 60, 12, 5),
		trip(at(10, 6), 30, 6, 12),
		trip(at(10, 14), 8, 3, 14),
		trip(at(10, 15), 80, 14, 22)
	];

	it('covers the last 30 days by week and compares with the 30 days before', () => {
		const stats = consumptionStats(trips, 'month', 1, NOW);
		expect(stats.unit).toBe('week');
		// 12 + 6 + 3 + 14 percentage points over 178 km.
		expect(stats.totals!.km).toBe(178);
		expect(stats.totals!.per100).toBeCloseTo((35 / 178) * 100);
		expect(stats.previous!.km).toBe(40);
		// Weeks from the Monday on or before 19 September up to now, each starting on a Monday.
		expect(new Date(stats.buckets[0].start).getDay()).toBe(1);
		expect(stats.buckets.every((b, i) => i === 0 || b.start === stats.buckets[i - 1].end)).toBe(
			true
		);
		expect(stats.buckets.at(-1)!.end).toBeGreaterThan(NOW);
		// The week of 13 October holds 88 km.
		const week = stats.buckets.find((b) => b.start <= at(10, 14) && at(10, 14) < b.end)!;
		expect(week.per100).toBeCloseTo((17 / 88) * 100);
	});

	it('covers twelve calendar months and groups by temperature and length', () => {
		const stats = consumptionStats(trips, 'year', 0.8, NOW);
		expect(stats.buckets).toHaveLength(12);
		expect(stats.buckets[0].start).toBe(new Date(2025, 10, 1).getTime());
		expect(stats.buckets.at(-1)!.start).toBe(new Date(2026, 9, 1).getTime());
		expect(stats.buckets.at(-2)!.per100).toBeCloseTo((22 * 0.8 * 100) / 100);
		expect(stats.previous).toBeNull();
		// Below 0 °C only 40 km: shown, it reaches the minimum distance.
		expect(stats.byTemperature.map((b) => b.key)).toEqual(['below0', '0to10', '10to20', 'above20']);
		// Short trips: only 8 km, too little to show.
		expect(stats.byLength.map((b) => b.key)).toEqual(['medium', 'long']);
	});

	it('starts `all` at the first trip', () => {
		const stats = consumptionStats(trips, 'all', 1, NOW);
		expect(stats.from).toBe(trips[0].t);
		expect(stats.buckets.map((b) => new Date(b.start).getMonth())).toEqual([8, 9]);
		expect(stats.totals!.km).toBe(218);
		expect(consumptionStats([], 'all', 1, NOW).totals).toBeNull();
	});
});
