// Which logged trips count for consumption statistics (see lib/consumption.ts).
import type { ConsumptionTrip } from '../../consumption.ts';
import type { LogEntry } from './logbook.ts';

/** Shorter trips are dominated by the whole-percent steps of the state of charge. */
const MIN_TRIP_KM = 1;

/**
 * A trip counts when both charge levels are known, nothing is missing in between (a gap may
 * hide a charging stop) and the level did not rise.
 */
export function consumptionTrip(e: LogEntry): ConsumptionTrip | undefined {
	if (e.gap || e.distanceKm < MIN_TRIP_KM) return undefined;
	if (e.startSocPct === null || e.endSocPct === null || e.endSocPct > e.startSocPct)
		return undefined;
	return {
		t: e.startAt.getTime(),
		km: e.distanceKm,
		usedPct: e.startSocPct - e.endSocPct,
		tempC: e.outsideTempC
	};
}

export const consumptionTrips = (entries: LogEntry[]): ConsumptionTrip[] =>
	entries.flatMap((e) => consumptionTrip(e) ?? []);
