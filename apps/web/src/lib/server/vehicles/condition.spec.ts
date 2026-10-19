import { describe, expect, it } from 'vitest';
import { battery12vLow, hourlyMinimum, vehicleCondition } from './condition.ts';

describe('vehicleCondition', () => {
	it('finds nothing to judge without condition values', () => {
		expect(vehicleCondition({ stateOfChargePct: 50 })).toEqual({ known: false, issues: [] });
	});

	it('is fine when locked and closed', () => {
		expect(
			vehicleCondition({ doorsLocked: true, doorsClosed: true, windowsClosed: true, alerts: [] })
		).toEqual({ known: true, issues: [] });
	});

	it('names open and unlocked parts, low tyres and warnings', () => {
		const { issues } = vehicleCondition({
			doorsLocked: false,
			doorsClosed: false,
			windowsClosed: false,
			hoodClosed: false,
			doors: [
				{ part: 'frontLeft', closed: true, locked: false },
				{ part: 'rearLeft', closed: false, locked: false }
			],
			windows: [
				{ part: 'frontLeft', closed: true },
				{ part: 'rearRight', closed: false }
			],
			tires: [
				{ part: 'frontLeft', kPa: 260, low: false },
				{ part: 'rearLeft', kPa: 190, low: true }
			],
			battery12vVoltage: 11.9,
			alerts: [
				{ title: 'Washer fluid low', severity: 'info' },
				{ title: 'Service due', severity: 'warning' }
			]
		});
		expect(issues).toEqual([
			{ kind: 'unlocked', parts: ['frontLeft', 'rearLeft'] },
			{ kind: 'doorOpen', parts: ['rearLeft'] },
			{ kind: 'windowOpen', parts: ['rearRight'] },
			{ kind: 'hoodOpen' },
			{ kind: 'tireLow', parts: ['rearLeft'] },
			{ kind: 'battery12vLow' },
			{ kind: 'alert', title: 'Service due' }
		]);
	});

	it('accepts unlocked doors while the ignition is on', () => {
		expect(vehicleCondition({ doorsLocked: false, ignitionOn: true }).issues).toEqual([]);
	});
});

describe('battery12vLow', () => {
	it('judges resting voltage, else the state of charge', () => {
		expect(battery12vLow({ battery12vVoltage: 12.1 })).toBe(true);
		expect(battery12vLow({ battery12vVoltage: 12.6, battery12vPct: 10 })).toBe(false);
		expect(battery12vLow({ battery12vVoltage: 12.1, ignitionOn: true })).toBe(false);
		expect(battery12vLow({ battery12vPct: 35 })).toBe(true);
		expect(battery12vLow({})).toBe(false);
	});
});

describe('hourlyMinimum', () => {
	it('keeps the lowest reading per hour', () => {
		const at = (min: number) => new Date(Date.UTC(2026, 9, 19, 10, min));
		expect(
			hourlyMinimum([
				{ at: at(5), volts: 12.6 },
				{ at: at(35), volts: 12.4 },
				{ at: at(65), volts: 12.5 }
			])
		).toEqual([
			{ t: Date.UTC(2026, 9, 19, 10), v: 12.4 },
			{ t: Date.UTC(2026, 9, 19, 11), v: 12.5 }
		]);
	});
});
