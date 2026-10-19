// Trip log rows for export tests.
import type { LogEntry } from '../vehicles/logbook.ts';

let n = 0;
export function entry(start: string, minutes: number, values: Partial<LogEntry> = {}): LogEntry {
	const startAt = new Date(start);
	return {
		id: `t${++n}`,
		connectionId: 'c1',
		startAt,
		endAt: new Date(startAt.getTime() + minutes * 60_000),
		distanceKm: 10,
		startOdometerKm: null,
		endOdometerKm: null,
		startSocPct: null,
		endSocPct: null,
		startLatitude: 52.5,
		startLongitude: 13.4,
		endLatitude: 52.6,
		endLongitude: 13.5,
		outsideTempC: null,
		startAddress: null,
		endAddress: null,
		gap: false,
		purpose: null,
		note: null,
		createdAt: startAt,
		updatedAt: startAt,
		...values
	};
}
