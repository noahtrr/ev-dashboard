import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../providers/types.ts';
import { deriveSessions, thinSeries, type HistoryPoint } from './charging.ts';

const MIN = 60_000;
const T0 = Date.parse('2026-10-18T18:00:00Z');
const GAP = 30 * MIN;

/** One snapshot every 5 minutes from T0. */
function series(values: VehicleData[], startMin = 0): HistoryPoint[] {
	return values.map((data, i) => ({ at: new Date(T0 + (startMin + i * 5) * MIN), data }));
}

const idle = (soc: number): VehicleData => ({
	stateOfChargePct: soc,
	chargingState: 'notCharging'
});
const charging = (soc: number): VehicleData => ({
	stateOfChargePct: soc,
	chargingState: 'charging',
	pluggedIn: true,
	latitude: 52.52,
	longitude: 13.405
});

describe('deriveSessions', () => {
	it('finds a finished session with the level before and after', () => {
		const points = series([idle(40), charging(41), charging(45), charging(50), idle(50)]);
		const [session, ...rest] = deriveSessions(points, GAP, T0 + 24 * 60 * MIN);
		expect(rest).toEqual([]);
		expect(session).toMatchObject({
			start: new Date(T0 + 5 * MIN),
			end: new Date(T0 + 15 * MIN),
			ongoing: false,
			startSocPct: 40,
			endSocPct: 50,
			addedPct: 10,
			latitude: 52.52
		});
	});

	it('marks a recent session at the end as ongoing, an old one not', () => {
		const points = series([idle(20), charging(22), charging(30)]);
		const end = T0 + 10 * MIN;
		expect(deriveSessions(points, GAP, end + MIN)[0].ongoing).toBe(true);
		expect(deriveSessions(points, GAP, end + 2 * GAP)[0].ongoing).toBe(false);
	});

	it('splits at long gaps and returns the newest first', () => {
		const points = [
			...series([charging(10), charging(20)]),
			...series([charging(60), charging(70)], 120)
		];
		const sessions = deriveSessions(points, GAP, T0 + 24 * 60 * MIN);
		expect(sessions.map((s) => [s.startSocPct, s.endSocPct])).toEqual([
			[60, 70],
			[10, 20]
		]);
	});

	it('falls back to a rising level while plugged in', () => {
		const plugged = (soc: number): VehicleData => ({ stateOfChargePct: soc, pluggedIn: true });
		const sessions = deriveSessions(
			series([plugged(30), plugged(35), plugged(40), plugged(40)]),
			GAP,
			T0
		);
		expect(sessions).toHaveLength(1);
		expect(sessions[0]).toMatchObject({ startSocPct: 30, endSocPct: 40, addedPct: 10 });
	});

	it('handles empty and charging-free series', () => {
		expect(deriveSessions([], GAP)).toEqual([]);
		expect(deriveSessions(series([idle(50), idle(49)]), GAP)).toEqual([]);
	});
});

describe('thinSeries', () => {
	it('limits the length and keeps peaks and the newest point', () => {
		const items = Array.from({ length: 1000 }, (_, i) => ({ t: i, soc: i === 500 ? 99 : 50 }));
		const out = thinSeries(items, 100);
		expect(out.length).toBeLessThanOrEqual(101);
		expect(out.some((p) => p.soc === 99)).toBe(true);
		expect(out.at(-1)).toEqual({ t: 999, soc: 50 });
		expect(out.map((p) => p.t)).toEqual([...out.map((p) => p.t)].sort((a, b) => a - b));
	});

	it('returns short series unchanged', () => {
		const items = [{ t: 1, soc: 2 }];
		expect(thinSeries(items, 100)).toBe(items);
	});
});
