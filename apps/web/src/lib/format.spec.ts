import { describe, expect, it } from 'vitest';
import { duration, energy, minutesBetween } from './format.ts';

describe('duration', () => {
	it('formats minutes and hours', () => {
		expect(duration(0)).toBe('0 min');
		expect(duration(45)).toBe('45 min');
		expect(duration(95)).toBe('1 h 35 min');
		expect(duration(185.4)).toBe('3 h 05 min');
	});

	it('measures spans', () => {
		expect(minutesBetween('2026-10-19T10:00:00Z', '2026-10-19T11:30:00Z')).toBe(90);
	});
});

describe('energy', () => {
	it('keeps one decimal for small amounts only', () => {
		expect(energy(4.26, 'en')).toBe('4.3');
		expect(energy(4.26, 'de')).toBe('4,3');
		expect(energy(38.4, 'de')).toBe('38');
	});
});
