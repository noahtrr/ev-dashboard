// Assessment of the reported vehicle condition: what needs attention, if anything. Values a
// vehicle does not report are simply not judged.
import type { Condition, ConditionIssue } from '../../condition.ts';
import type { VehicleData } from '../providers/types.ts';

/** Below this resting voltage a 12 V lead-acid battery is considered weak. */
export const LOW_12V_VOLTS = 12.2;
/** Below this state of charge the 12 V battery is considered weak (when no voltage is known). */
export const LOW_12V_PCT = 40;

export function battery12vLow(data: VehicleData): boolean {
	// While driving or charging the converter holds the voltage up, so only resting values count.
	if (data.ignitionOn === true || data.chargingState === 'charging') return false;
	if (data.battery12vVoltage !== undefined) return data.battery12vVoltage < LOW_12V_VOLTS;
	return data.battery12vPct !== undefined && data.battery12vPct < LOW_12V_PCT;
}

export function vehicleCondition(data: VehicleData): Condition {
	const issues: ConditionIssue[] = [];
	// Unlocked while driving is normal.
	if (data.doorsLocked === false && data.ignitionOn !== true) {
		const parts = (data.doors ?? []).filter((d) => d.locked === false).map((d) => d.part);
		issues.push({ kind: 'unlocked', parts });
	}
	if (data.doorsClosed === false) {
		const parts = (data.doors ?? []).filter((d) => d.closed === false).map((d) => d.part);
		issues.push({ kind: 'doorOpen', parts });
	}
	if (data.windowsClosed === false) {
		const parts = (data.windows ?? []).filter((w) => !w.closed).map((w) => w.part);
		issues.push({ kind: 'windowOpen', parts });
	}
	if (data.hoodClosed === false) issues.push({ kind: 'hoodOpen' });
	const lowTires = (data.tires ?? []).filter((t) => t.low).map((t) => t.part);
	if (lowTires.length > 0) issues.push({ kind: 'tireLow', parts: lowTires });
	if (battery12vLow(data)) issues.push({ kind: 'battery12vLow' });
	for (const alert of data.alerts ?? []) {
		if (alert.severity !== 'info') issues.push({ kind: 'alert', title: alert.title });
	}
	const known =
		data.doorsLocked !== undefined ||
		data.doorsClosed !== undefined ||
		data.windowsClosed !== undefined ||
		data.hoodClosed !== undefined ||
		data.tires !== undefined ||
		data.battery12vVoltage !== undefined ||
		data.battery12vPct !== undefined ||
		data.alerts !== undefined;
	return { known, issues };
}

const HOUR_MS = 3600 * 1000;

/** Lowest 12 V reading per hour: dips matter more than the average. */
export function hourlyMinimum(points: { at: Date; volts: number }[]) {
	const hours = new Map<number, number>();
	for (const { at, volts } of points) {
		const hour = Math.floor(at.getTime() / HOUR_MS) * HOUR_MS;
		const current = hours.get(hour);
		if (current === undefined || volts < current) hours.set(hour, volts);
	}
	return [...hours].map(([t, v]) => ({ t, v }));
}
