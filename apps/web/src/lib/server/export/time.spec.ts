import { describe, expect, it } from 'vitest';
import { isTimeZone, parseDay, spreadsheetSerial, wallClock, zonedMidnight } from './time.ts';

describe('time helpers', () => {
	it('finds local midnight, also on days with a clock change', () => {
		expect(zonedMidnight(2026, 1, 15, 'Europe/Berlin').toISOString()).toBe(
			'2026-01-14T23:00:00.000Z'
		);
		expect(zonedMidnight(2026, 7, 1, 'Europe/Berlin').toISOString()).toBe(
			'2026-06-30T22:00:00.000Z'
		);
		expect(zonedMidnight(2026, 3, 29, 'Europe/Berlin').toISOString()).toBe(
			'2026-03-28T23:00:00.000Z'
		);
		expect(zonedMidnight(2026, 3, 30, 'Europe/Berlin').toISOString()).toBe(
			'2026-03-29T22:00:00.000Z'
		);
		expect(zonedMidnight(2026, 10, 1, 'UTC').toISOString()).toBe('2026-10-01T00:00:00.000Z');
	});

	it('reads wall clocks and spreadsheet serials', () => {
		const c = wallClock(new Date('2026-10-19T05:25:00Z'), 'Europe/Berlin');
		expect(c).toEqual({ year: 2026, month: 10, day: 19, hour: 7, minute: 25 });
		expect(spreadsheetSerial({ ...c, hour: 0, minute: 0 })).toBe(46314);
		expect(spreadsheetSerial({ year: 1900, month: 3, day: 1, hour: 12, minute: 0 })).toBe(61.5);
	});

	it('validates input', () => {
		expect(isTimeZone('Europe/Berlin')).toBe(true);
		expect(isTimeZone('Mars/Base')).toBe(false);
		expect(isTimeZone('')).toBe(false);
		expect(parseDay('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
		expect(parseDay('2026-02-30')).toBeNull();
		expect(parseDay('26-02-01')).toBeNull();
		expect(parseDay(null)).toBeNull();
	});
});
