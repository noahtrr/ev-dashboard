import { describe, expect, it } from 'vitest';
import { defaultNotificationPrefs } from '../../notifications.ts';
import type { VehicleData } from '../providers/types.ts';
import { detectEvents, UNLOCKED_AFTER_MS, type WatchState } from './events.ts';

const MIN = 60_000;
const prefs = defaultNotificationPrefs();
const all = { ...prefs, events: { ...prefs.events, unlocked: true } };

/** Feeds a series of fetches (5 minutes apart) and collects the events of each. */
function run(series: (VehicleData & { status?: string })[], p = all, start?: WatchState) {
	let state = start;
	return series.map(({ status = 'active', ...data }, i) => {
		const at = (i + 1) * 5 * MIN;
		const { events, next } = detectEvents(state, { status, fetchedAt: at, data }, p, at);
		state = next;
		return events;
	});
}

describe('detectEvents', () => {
	it('sends nothing on the first look', () => {
		const { events, next } = detectEvents(
			undefined,
			{
				status: 'reauth',
				fetchedAt: 1,
				data: { stateOfChargePct: 5, alerts: [{ title: 'Öl', severity: 'warning' }] }
			},
			all,
			1
		);
		expect(events).toEqual([]);
		expect(next).toMatchObject({ fetchedAt: 1, status: 'reauth', socPct: 5, alerts: ['Öl'] });
	});

	it('tells finished from interrupted charging', () => {
		expect(
			run([
				{ chargingState: 'charging', stateOfChargePct: 70 },
				{ chargingState: 'complete', stateOfChargePct: 80, rangeKm: 312 }
			])[1]
		).toEqual([{ kind: 'chargingDone', socPct: 80, rangeKm: 312 }]);
		expect(
			run([
				{ chargingState: 'charging', stateOfChargePct: 70 },
				{ chargingState: 'notCharging', pluggedIn: true, stateOfChargePct: 72 }
			])[1]
		).toEqual([{ kind: 'chargingStopped', socPct: 72 }]);
		expect(run([{ chargingState: 'charging' }, { chargingState: 'fault' }])[1]).toEqual([
			{ kind: 'chargingStopped', socPct: undefined }
		]);
	});

	it('sends a low charge once when crossing the threshold, not while charging', () => {
		const events = run([
			{ stateOfChargePct: 22 },
			{ stateOfChargePct: 19, rangeKm: 60 },
			{ stateOfChargePct: 17 },
			{ stateOfChargePct: 25, chargingState: 'charging' },
			{ stateOfChargePct: 21 }
		]);
		expect(events.flat()).toEqual([{ kind: 'lowCharge', socPct: 19, rangeKm: 60 }]);
		const at30 = { ...all, lowChargePct: 30 };
		expect(run([{ stateOfChargePct: 31 }, { stateOfChargePct: 29 }], at30)[1]).toHaveLength(1);
	});

	it('sends new warnings only, and ignores information', () => {
		const events = run([
			{ alerts: [{ title: 'Reifendruck', severity: 'warning' }] },
			{
				alerts: [
					{ title: 'Reifendruck', severity: 'warning' },
					{ title: 'Service', severity: 'info' },
					{ title: 'Bremse', severity: 'critical' }
				]
			}
		]);
		expect(events[1]).toEqual([{ kind: 'alert', title: 'Bremse' }]);
	});

	it('sends unlocked once after ten parked minutes, and again after locking', () => {
		const open = { doorsLocked: false, ignitionOn: false };
		const events = run([open, open, open, open, { doorsLocked: true }, open, open, open]);
		expect(events.map((e) => e.map((x) => x.kind))).toEqual([
			[],
			[],
			['unlocked'],
			[],
			[],
			[],
			[],
			['unlocked']
		]);
		expect(run([open, { ...open, ignitionOn: true }, open, open]).flat()).toEqual([]);
	});

	it('checks the unlocked time between fetches too', () => {
		const first = detectEvents(
			{ fetchedAt: 0, status: 'active', alerts: [] },
			{ status: 'active', fetchedAt: MIN, data: { doorsLocked: false } },
			all,
			MIN
		);
		const later = detectEvents(
			first.next,
			{ status: 'active', fetchedAt: MIN, data: { doorsLocked: false } },
			all,
			MIN + UNLOCKED_AFTER_MS
		);
		expect(later.events).toEqual([{ kind: 'unlocked', minutes: 10 }]);
	});

	it('sends reauth when the connection needs a new sign-in', () => {
		const events = run([{}, { status: 'reauth' }, { status: 'reauth' }]);
		expect(events).toEqual([[], [{ kind: 'reauth' }], []]);
	});

	it('respects switched off events', () => {
		const none = {
			...prefs,
			events: Object.fromEntries(Object.keys(prefs.events).map((k) => [k, false]))
		} as typeof prefs;
		const events = run(
			[
				{ chargingState: 'charging', stateOfChargePct: 21 },
				{
					status: 'reauth',
					chargingState: 'complete',
					stateOfChargePct: 15,
					alerts: [{ title: 'x', severity: 'warning' }]
				}
			],
			none
		);
		expect(events.flat()).toEqual([]);
	});
});
