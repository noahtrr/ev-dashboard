// Decides which notifications a new fetch triggers by comparing it with what was seen before.
// Pure, so every rule can be tested without a database.
import type { NotificationEvent, NotificationPrefs } from '../../notifications.ts';
import type { ChargingState, VehicleData } from '../providers/types.ts';

/** Unlocked and parked for this long before `unlocked` is sent. */
export const UNLOCKED_AFTER_MS = 10 * 60_000;

/** What the notifier remembers per vehicle (stored as JSON). */
export type WatchState = {
	fetchedAt: number;
	status: string;
	chargingState?: ChargingState;
	socPct?: number;
	alerts: string[];
	/** Since when the parked vehicle is reported unlocked. */
	unlockedSince?: number;
	unlockedSent?: boolean;
};

export type VehicleEvent =
	| { kind: 'chargingDone'; socPct?: number; rangeKm?: number }
	| { kind: 'chargingStopped'; socPct?: number }
	| { kind: 'lowCharge'; socPct: number; rangeKm?: number }
	| { kind: 'alert'; title: string }
	| { kind: 'unlocked'; minutes: number }
	| { kind: 'reauth' };

export type Observation = {
	status: string;
	/** Latest fetch, if there is one. */
	fetchedAt?: number;
	data?: VehicleData;
};

const warnings = (data: VehicleData) =>
	(data.alerts ?? []).filter((a) => a.severity !== 'info').map((a) => a.title);

/**
 * Events for one vehicle and the state to remember. Without a previous state nothing is sent:
 * the first look only establishes what is normal.
 */
export function detectEvents(
	previous: WatchState | undefined,
	current: Observation,
	prefs: NotificationPrefs,
	now: number
): { events: VehicleEvent[]; next: WatchState } {
	const data = current.data ?? {};
	const fresh = current.fetchedAt !== undefined && current.fetchedAt > (previous?.fetchedAt ?? -1);
	const next: WatchState = fresh
		? {
				fetchedAt: current.fetchedAt!,
				status: current.status,
				chargingState: data.chargingState,
				socPct: data.stateOfChargePct,
				alerts: warnings(data),
				unlockedSince: previous?.unlockedSince,
				unlockedSent: previous?.unlockedSent
			}
		: { ...(previous ?? { fetchedAt: -1, alerts: [] }), status: current.status };

	// Parked and unlocked: remember since when; reset as soon as it is locked or driven.
	if (fresh) {
		if (data.doorsLocked === false && data.ignitionOn !== true) {
			next.unlockedSince ??= current.fetchedAt;
		} else {
			next.unlockedSince = undefined;
			next.unlockedSent = undefined;
		}
	}

	const events: VehicleEvent[] = [];
	if (!previous) return { events, next };
	const on = (event: NotificationEvent) => prefs.events[event];

	if (on('reauth') && previous.status !== 'reauth' && current.status === 'reauth') {
		events.push({ kind: 'reauth' });
	}
	if (
		on('unlocked') &&
		next.unlockedSince !== undefined &&
		!next.unlockedSent &&
		now - next.unlockedSince >= UNLOCKED_AFTER_MS
	) {
		events.push({ kind: 'unlocked', minutes: Math.floor((now - next.unlockedSince) / 60_000) });
		next.unlockedSent = true;
	}
	if (!fresh) return { events, next };

	const soc = data.stateOfChargePct;
	if (
		previous.chargingState === 'charging' &&
		data.chargingState !== undefined &&
		data.chargingState !== 'charging'
	) {
		// Ending with the cable still in (or with a fault) means it stopped before the goal.
		const stopped =
			data.chargingState === 'fault' ||
			(data.chargingState === 'notCharging' && data.pluggedIn === true);
		if (stopped && on('chargingStopped')) events.push({ kind: 'chargingStopped', socPct: soc });
		if (!stopped && on('chargingDone')) {
			events.push({ kind: 'chargingDone', socPct: soc, rangeKm: data.rangeKm });
		}
	}

	const limit = prefs.lowChargePct;
	if (
		on('lowCharge') &&
		soc !== undefined &&
		previous.socPct !== undefined &&
		previous.socPct >= limit &&
		soc < limit &&
		data.chargingState !== 'charging'
	) {
		events.push({ kind: 'lowCharge', socPct: soc, rangeKm: data.rangeKm });
	}

	if (on('alert')) {
		for (const title of next.alerts) {
			if (!previous.alerts.includes(title)) events.push({ kind: 'alert', title });
		}
	}

	return { events, next };
}
