import { describe, expect, it } from 'vitest';
import {
	inPeriod,
	parseMinute,
	periodBounds,
	periodsOverlap,
	type PeriodInput
} from './trip-period.ts';

// UTC keeps the arithmetic readable; the server passes a zoned function instead.
const at = (day: string, minute: number) => Date.parse(`${day}T00:00:00Z`) + minute * 60_000;
const utc = (day: string, time: string) => Date.parse(`${day}T${time}:00Z`);
const input = (values: Partial<PeriodInput> = {}): PeriodInput => ({
	mode: 'range',
	fromDay: '2026-03-02',
	toDay: '2026-03-04',
	fromMinute: null,
	toMinute: null,
	...values
});
const rule = (values: Partial<PeriodInput> = {}) => {
	const p = input(values);
	const bounds = periodBounds(p, at);
	if (typeof bounds === 'string') throw new Error(bounds);
	return { ...p, ...bounds, timeZone: 'UTC' };
};

describe('parseMinute', () => {
	it('reads HH:MM and treats empty as null', () => {
		expect(parseMinute('08:30')).toBe(510);
		expect(parseMinute('')).toBeNull();
		expect(parseMinute('24:00')).toBeNaN();
	});
});

describe('periodBounds', () => {
	it('covers whole days, or from and until a time', () => {
		expect(periodBounds(input(), at)).toEqual({
			fromAt: utc('2026-03-02', '00:00'),
			toAt: utc('2026-03-05', '00:00')
		});
		expect(periodBounds(input({ fromMinute: 480, toMinute: 960 }), at)).toEqual({
			fromAt: utc('2026-03-02', '08:00'),
			toAt: utc('2026-03-04', '16:00')
		});
	});

	it('runs a daily window past midnight to the day after the last', () => {
		expect(periodBounds(input({ mode: 'daily', fromMinute: 1320, toMinute: 360 }), at)).toEqual({
			fromAt: utc('2026-03-02', '22:00'),
			toAt: utc('2026-03-05', '06:00')
		});
	});

	it('rejects what does not fit', () => {
		expect(periodBounds(input({ toDay: '2026-03-01' }), at)).toBe('range');
		expect(periodBounds(input({ fromDay: '2026-02-30' }), at)).toBe('range');
		expect(periodBounds(input({ toDay: '2030-01-01' }), at)).toBe('range');
		expect(periodBounds(input({ toDay: '2026-03-02', fromMinute: 960, toMinute: 480 }), at)).toBe(
			'times'
		);
		expect(periodBounds(input({ mode: 'daily', fromMinute: 480 }), at)).toBe('times');
		expect(periodBounds(input({ mode: 'daily', fromMinute: 480, toMinute: 480 }), at)).toBe(
			'times'
		);
		expect(periodBounds(input({ fromMinute: NaN }), at)).toBe('times');
	});
});

describe('inPeriod', () => {
	it('checks the window on every day', () => {
		const p = rule({ mode: 'daily', fromMinute: 480, toMinute: 960 });
		expect(inPeriod(p, utc('2026-03-03', '09:00'))).toBe(true);
		expect(inPeriod(p, utc('2026-03-03', '16:00'))).toBe(false);
		expect(inPeriod(p, utc('2026-03-05', '09:00'))).toBe(false);
	});

	it('checks a window past midnight', () => {
		const p = rule({ mode: 'daily', fromMinute: 1320, toMinute: 360 });
		expect(inPeriod(p, utc('2026-03-02', '02:00'))).toBe(false);
		expect(inPeriod(p, utc('2026-03-02', '23:00'))).toBe(true);
		expect(inPeriod(p, utc('2026-03-05', '05:00'))).toBe(true);
		expect(inPeriod(p, utc('2026-03-03', '12:00'))).toBe(false);
	});

	it('takes stored whole-day periods as they are', () => {
		const p = {
			fromAt: new Date(utc('2026-03-02', '00:00')),
			toAt: new Date(utc('2026-03-03', '00:00')),
			mode: 'range',
			fromMinute: null,
			toMinute: null,
			timeZone: null
		};
		expect(inPeriod(p, utc('2026-03-02', '23:59'))).toBe(true);
		expect(inPeriod(p, utc('2026-03-03', '00:00'))).toBe(false);
	});
});

describe('periodsOverlap', () => {
	it('finds a common minute', () => {
		expect(periodsOverlap(input(), input({ fromDay: '2026-03-04', toDay: '2026-03-06' }))).toBe(
			true
		);
		expect(periodsOverlap(input(), input({ fromDay: '2026-03-05', toDay: '2026-03-06' }))).toBe(
			false
		);
		const mornings = input({ mode: 'daily', fromMinute: 480, toMinute: 720 });
		expect(periodsOverlap(mornings, { ...mornings, fromMinute: 1080, toMinute: 1200 })).toBe(false);
		expect(periodsOverlap(mornings, { ...mornings, fromMinute: 600, toMinute: 1200 })).toBe(true);
	});
});
