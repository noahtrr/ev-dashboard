import { describe, expect, it } from 'vitest';
import type { HistoryPoint } from './charging.ts';
import { consumption, deriveTrips, haversineKm, tripDetails, withTripEnergy } from './trips.ts';

const MIN = 60_000;
const T0 = Date.parse('2026-10-18T08:00:00Z');
const GAP = 30 * MIN;
const at = (min: number, data: HistoryPoint['data']): HistoryPoint => ({
	at: new Date(T0 + min * MIN),
	data
});
const home = { latitude: 52.52, longitude: 13.405 };
const work = { latitude: 52.5, longitude: 13.3 };

describe('haversineKm', () => {
	it('measures great-circle distances', () => {
		expect(haversineKm(52.52, 13.405, 48.137, 11.575)).toBeCloseTo(504, 0);
		expect(haversineKm(1, 1, 1, 1)).toBe(0);
	});
});

describe('deriveTrips', () => {
	const commute = [
		at(0, { ...home, odometerKm: 1000, ignitionOn: false, stateOfChargePct: 80 }),
		at(5, { latitude: 52.51, longitude: 13.35, odometerKm: 1004, ignitionOn: true }),
		at(10, { ...work, odometerKm: 1009, ignitionOn: true, stateOfChargePct: 77 }),
		at(15, { ...work, odometerKm: 1009, ignitionOn: false, stateOfChargePct: 77 }),
		at(20, { ...work, odometerKm: 1009, ignitionOn: false, stateOfChargePct: 77 })
	];

	it('turns moving snapshots into a trip from the last parked to the arrival snapshot', () => {
		const [trip, ...rest] = deriveTrips(commute, GAP, T0 + 20 * MIN);
		expect(rest).toEqual([]);
		expect(trip).toEqual({
			start: new Date(T0),
			end: new Date(T0 + 10 * MIN),
			ongoing: false,
			gap: false,
			distanceKm: 9,
			startSocPct: 80,
			endSocPct: 77,
			usedPct: 3,
			startLatitude: 52.52,
			startLongitude: 13.405,
			endLatitude: 52.5,
			endLongitude: 13.3,
			startOdometerKm: 1000,
			endOdometerKm: 1009
		});
	});

	it('finds trips between two polls from the odometer alone', () => {
		const trips = deriveTrips(
			[at(0, { odometerKm: 50, ...home }), at(5, { odometerKm: 53, ...work })],
			GAP,
			T0 + 5 * MIN
		);
		expect(trips).toHaveLength(1);
		expect(trips[0].distanceKm).toBe(3);
	});

	it('falls back to the positions without an odometer', () => {
		const [trip] = deriveTrips([at(0, home), at(5, work), at(10, work)], GAP, T0);
		expect(trip.distanceKm).toBeCloseTo(haversineKm(52.52, 13.405, 52.5, 13.3), 6);
	});

	it('ignores GPS drift and a running ignition without movement', () => {
		const trips = deriveTrips(
			[
				at(0, { ...home, odometerKm: 10 }),
				at(5, { latitude: 52.5201, longitude: 13.405, odometerKm: 10, ignitionOn: true }),
				at(10, { ...home, odometerKm: 10, ignitionOn: false })
			],
			GAP,
			T0 + 10 * MIN
		);
		expect(trips).toEqual([]);
	});

	it('marks the newest trip as ongoing while the ignition is on and the data recent', () => {
		const driving = commute.slice(0, 3);
		expect(deriveTrips(driving, GAP, T0 + 15 * MIN)[0].ongoing).toBe(true);
		expect(deriveTrips(driving, GAP, T0 + 120 * MIN)[0].ongoing).toBe(false);
	});

	it('flags trips with missing snapshots', () => {
		const [trip] = deriveTrips(
			[at(0, { odometerKm: 1 }), at(240, { odometerKm: 80 }), at(245, { odometerKm: 80 })],
			GAP,
			T0
		);
		expect(trip.gap).toBe(true);
	});
});

describe('trip energy and details', () => {
	const points = [
		at(0, { ...home, odometerKm: 1000, stateOfChargePct: 80, rangeKm: 300, outsideTempC: 9 }),
		at(15, { latitude: 52.51, longitude: 13.35, odometerKm: 1010, ignitionOn: true }),
		at(30, { ...work, odometerKm: 1020, stateOfChargePct: 75, rangeKm: 280, outsideTempC: 11 }),
		at(35, { ...work, odometerKm: 1020, ignitionOn: false })
	];

	it('estimates energy, consumption and speed', () => {
		const [trip] = withTripEnergy(deriveTrips(points, GAP, T0 + 35 * MIN), 80);
		expect(trip.usedKwh).toBe(4);
		expect(consumption(trip)).toBe(20);
		expect(tripDetails(points, trip)).toEqual({
			path: [
				[13.405, 52.52],
				[13.35, 52.51],
				[13.3, 52.5]
			],
			samples: 3,
			startRangeKm: 300,
			endRangeKm: 280,
			minOutsideTempC: 9,
			maxOutsideTempC: 11,
			averageKmh: 40,
			consumptionKwh100: 20
		});
	});

	it('leaves consumption out without a capacity or for very short trips', () => {
		const [trip] = withTripEnergy(deriveTrips(points, GAP, T0), null);
		expect(trip.usedKwh).toBeUndefined();
		expect(consumption({ usedKwh: 0.1, distanceKm: 0.5 })).toBeUndefined();
	});
});
