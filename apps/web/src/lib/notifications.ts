// Which vehicle events send push notifications. Each user chooses for all of their vehicles.

export const NOTIFICATION_EVENTS = [
	'chargingDone',
	'chargingStopped',
	'lowCharge',
	'alert',
	'unlocked',
	'reauth'
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** Thresholds offered for `lowCharge`, in percent. */
export const LOW_CHARGE_LEVELS = [10, 20, 30, 40] as const;

export type NotificationPrefs = {
	events: Record<NotificationEvent, boolean>;
	lowChargePct: number;
};

/** Leaving the car unlocked is often deliberate (garage, driveway), so it starts off. */
export const defaultNotificationPrefs = (): NotificationPrefs => ({
	events: {
		chargingDone: true,
		chargingStopped: true,
		lowCharge: true,
		alert: true,
		unlocked: false,
		reauth: true
	},
	lowChargePct: 20
});

/** Complete preferences from whatever was stored or sent. */
export function normalizeNotificationPrefs(value: unknown): NotificationPrefs {
	const prefs = defaultNotificationPrefs();
	const input = (value ?? {}) as { events?: Record<string, unknown>; lowChargePct?: unknown };
	for (const event of NOTIFICATION_EVENTS) {
		const on = input.events?.[event];
		if (typeof on === 'boolean') prefs.events[event] = on;
	}
	if ((LOW_CHARGE_LEVELS as readonly unknown[]).includes(input.lowChargePct)) {
		prefs.lowChargePct = input.lowChargePct as number;
	}
	return prefs;
}
