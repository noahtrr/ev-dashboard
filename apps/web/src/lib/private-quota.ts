// Private kilometres per calendar year that the owner allows for a vehicle (e.g. a company
// car). Counted in the browser, so the year follows the viewer's time zone.
import { parseDecimal } from './costs.ts';

export const DEFAULT_QUOTA_WARN_PCT = 80;
export const QUOTA_MAX_KM = 1_000_000;

export type QuotaLevel = 'ok' | 'warn' | 'over';
export type PrivateTrip = { t: number; km: number };

/** Private kilometres driven in the local calendar `year` against the quota. */
export function quotaStatus(
	trips: PrivateTrip[],
	quotaKm: number,
	warnPct: number | null,
	year: number
) {
	const usedKm = trips
		.filter((trip) => new Date(trip.t).getFullYear() === year)
		.reduce((sum, trip) => sum + trip.km, 0);
	const pct = (usedKm / quotaKm) * 100;
	const level: QuotaLevel =
		pct >= 100 ? 'over' : pct >= (warnPct ?? DEFAULT_QUOTA_WARN_PCT) ? 'warn' : 'ok';
	return { usedKm, pct, level, leftKm: Math.max(0, quotaKm - usedKm) };
}

/** The quota form: kilometres (empty turns the quota off) and the warning threshold in percent. */
export function parseQuota(
	km: unknown,
	warnPct: unknown
): { km: number | null; warnPct: number | null } | 'km' | 'warn' {
	const quota = parseDecimal(km, 1, QUOTA_MAX_KM);
	if (quota === undefined) return 'km';
	const warn = parseDecimal(warnPct, 1, 99);
	if (warn === undefined || (warn !== null && !Number.isInteger(warn))) return 'warn';
	// The default is stored as null, so changing it later changes it for everyone who kept it.
	return { km: quota, warnPct: quota === null || warn === DEFAULT_QUOTA_WARN_PCT ? null : warn };
}
