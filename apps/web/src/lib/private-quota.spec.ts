import { describe, expect, it } from 'vitest';
import { parseQuota, quotaStatus } from './private-quota.ts';

// Mid-year dates, so the test does not depend on the time zone it runs in.
const at = (year: number, month: number) => new Date(year, month - 1, 15, 12).getTime();

describe('quotaStatus', () => {
	const trips = [
		{ t: at(2025, 12), km: 900 },
		{ t: at(2026, 3), km: 2500 },
		{ t: at(2026, 6), km: 1500 }
	];

	it('counts only the given year and warns from the threshold', () => {
		expect(quotaStatus(trips, 5000, null, 2026)).toEqual({
			usedKm: 4000,
			pct: 80,
			level: 'warn',
			leftKm: 1000
		});
		expect(quotaStatus(trips, 5000, 90, 2026).level).toBe('ok');
		expect(quotaStatus(trips, 4000, null, 2026)).toMatchObject({ level: 'over', leftKm: 0 });
		expect(quotaStatus(trips, 5000, null, 2025)).toMatchObject({ usedKm: 900, level: 'ok' });
	});
});

describe('parseQuota', () => {
	it('reads kilometres and the threshold, storing the default as null', () => {
		expect(parseQuota('5000', '80')).toEqual({ km: 5000, warnPct: null });
		expect(parseQuota('4500,5', '90')).toEqual({ km: 4500.5, warnPct: 90 });
		expect(parseQuota('', '90')).toEqual({ km: null, warnPct: null });
		expect(parseQuota('5000', '')).toEqual({ km: 5000, warnPct: null });
	});

	it('rejects values outside their range', () => {
		expect(parseQuota('0', '80')).toBe('km');
		expect(parseQuota('viel', '80')).toBe('km');
		expect(parseQuota('5000', '100')).toBe('warn');
		expect(parseQuota('5000', '85.5')).toBe('warn');
	});
});
