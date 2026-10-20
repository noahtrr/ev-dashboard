// Push notifications: the devices of each account, its choice of events, and the check that
// runs after every poll and sends what changed.
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { wholeNumber } from '../../format.ts';
import { format, messages, type Locale } from '../../i18n.ts';
import { normalizeNotificationPrefs, type NotificationPrefs } from '../../notifications.ts';
import type { Database } from '../db/index.ts';
import {
	notificationState,
	pushSubscription,
	snapshot,
	user,
	vehicleConnection
} from '../db/schema.ts';
import type { VehicleData } from '../providers/types.ts';
import { detectEvents, type VehicleEvent, type WatchState } from './events.ts';
import { sendPush, type PushTarget, type SendResult, type VapidKeys } from './webpush.ts';

/** Push services of the major browsers; nothing else is ever contacted. */
const PUSH_HOSTS = [
	'fcm.googleapis.com',
	'android.googleapis.com',
	'push.services.mozilla.com',
	'push.apple.com',
	'notify.windows.com'
];

export function isPushEndpoint(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > 1024) return false;
	try {
		const url = new URL(value);
		return (
			url.protocol === 'https:' &&
			!url.username &&
			!url.password &&
			PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
		);
	} catch {
		return false;
	}
}

/** The browser's key (65-byte P-256 point) and auth secret (16 bytes), base64url. */
function validKeys(p256dh: unknown, auth: unknown): boolean {
	const bytes = (v: unknown) =>
		typeof v === 'string' && /^[A-Za-z0-9_-]+={0,2}$/.test(v)
			? Buffer.from(v, 'base64url').length
			: -1;
	return bytes(p256dh) === 65 && bytes(auth) === 16;
}

export type Device = {
	id: string;
	endpoint: string;
	device: string | null;
	createdAt: Date;
};

export type Message = { title: string; body: string; url: string; tag: string };

/** The text of one event in one language. */
export function eventMessage(
	event: VehicleEvent,
	vehicle: { id: string; label: string | null },
	locale: Locale
): Message {
	const n = messages[locale].notifications;
	const name = vehicle.label || messages[locale].connections.unnamed;
	const pct = (v?: number) => (v === undefined ? '–' : `${wholeNumber(v, locale)} %`);
	const km = (v?: number) => (v === undefined ? '–' : `${wholeNumber(v, locale)} km`);
	const values: Record<string, string> = {
		vehicle: name,
		soc: pct('socPct' in event ? event.socPct : undefined),
		range: km('rangeKm' in event ? event.rangeKm : undefined),
		alert: event.kind === 'alert' ? event.title : '',
		minutes: event.kind === 'unlocked' ? String(event.minutes) : ''
	};
	const text = n.messages[event.kind];
	const url =
		event.kind === 'reauth'
			? '/account#vehicles'
			: event.kind === 'alert' || event.kind === 'unlocked'
				? `/vehicles/${vehicle.id}/condition`
				: `/?v=${vehicle.id}`;
	return {
		title: format(text.title, values),
		body: format(text.body, values),
		url,
		// Replaces an older message about the same thing instead of stacking up.
		tag: `${vehicle.id}:${event.kind}`
	};
}

export type NotifierOptions = {
	db: Database;
	keys: VapidKeys;
	/** Contact for push services (RFC 8292), the public URL of the instance. */
	subject: string;
	now?: () => number;
	send?: typeof sendPush;
};

export function createNotifier(options: NotifierOptions) {
	const { db, keys, subject } = options;
	const now = options.now ?? (() => Date.now());
	const send = options.send ?? sendPush;

	async function prefs(userId: string): Promise<NotificationPrefs> {
		const [row] = await db
			.select({ prefs: user.notificationPrefs })
			.from(user)
			.where(eq(user.id, userId));
		try {
			return normalizeNotificationPrefs(row?.prefs ? JSON.parse(row.prefs) : null);
		} catch {
			return normalizeNotificationPrefs(null);
		}
	}

	async function setPrefs(userId: string, value: unknown): Promise<NotificationPrefs> {
		const next = normalizeNotificationPrefs(value);
		await db
			.update(user)
			.set({ notificationPrefs: JSON.stringify(next) })
			.where(eq(user.id, userId));
		return next;
	}

	async function devices(userId: string): Promise<Device[]> {
		return db
			.select({
				id: pushSubscription.id,
				endpoint: pushSubscription.endpoint,
				device: pushSubscription.device,
				createdAt: pushSubscription.createdAt
			})
			.from(pushSubscription)
			.where(eq(pushSubscription.userId, userId))
			.orderBy(desc(pushSubscription.createdAt));
	}

	/** Registers a browser; the same browser signed in to another account moves over. */
	async function subscribe(
		userId: string,
		input: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } },
		device: string | null,
		locale: Locale
	): Promise<boolean> {
		const { endpoint } = input;
		if (!isPushEndpoint(endpoint) || !validKeys(input.keys?.p256dh, input.keys?.auth)) {
			return false;
		}
		const values = {
			userId,
			p256dh: input.keys!.p256dh as string,
			auth: input.keys!.auth as string,
			device,
			locale
		};
		await db
			.insert(pushSubscription)
			.values({ id: randomUUID(), endpoint, ...values, createdAt: new Date(now()) })
			.onConflictDoUpdate({ target: pushSubscription.endpoint, set: values });
		return true;
	}

	async function unsubscribe(userId: string, endpoint: string) {
		await db
			.delete(pushSubscription)
			.where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
	}

	async function removeDevice(userId: string, id: string) {
		await db
			.delete(pushSubscription)
			.where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.id, id)));
	}

	type Row = typeof pushSubscription.$inferSelect;

	async function deliver(row: Row, message: Message): Promise<SendResult> {
		const target: PushTarget = { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth };
		const result = await send(target, message, keys, subject);
		if (result === 'gone') {
			await db.delete(pushSubscription).where(eq(pushSubscription.id, row.id));
		} else if (result === 'sent') {
			await db
				.update(pushSubscription)
				.set({ lastSuccessAt: new Date(now()) })
				.where(eq(pushSubscription.id, row.id));
		}
		return result;
	}

	/** Sends the test message to one of the owner's devices; `gone` once it is unknown here too. */
	async function sendTest(userId: string, endpoint: string): Promise<SendResult> {
		const [row] = await db
			.select()
			.from(pushSubscription)
			.where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
		if (!row) return 'gone';
		const text = messages[row.locale as Locale].notifications.messages.test;
		return deliver(row, { ...text, url: '/', tag: 'test' });
	}

	/** Compares every watched vehicle with what was seen before and sends what changed. */
	async function check(): Promise<number> {
		const subscribers = await db
			.selectDistinct({ userId: pushSubscription.userId })
			.from(pushSubscription)
			.innerJoin(user, eq(user.id, pushSubscription.userId))
			.where(isNull(user.lockedAt));
		if (subscribers.length === 0) return 0;
		const connections = await db
			.select({
				id: vehicleConnection.id,
				userId: vehicleConnection.userId,
				label: vehicleConnection.label,
				status: vehicleConnection.status
			})
			.from(vehicleConnection)
			.where(
				inArray(
					vehicleConnection.userId,
					subscribers.map((s) => s.userId)
				)
			);
		let sent = 0;
		for (const connection of connections) {
			const [latest] = await db
				.select({ fetchedAt: snapshot.fetchedAt, data: snapshot.data })
				.from(snapshot)
				.where(eq(snapshot.connectionId, connection.id))
				.orderBy(desc(snapshot.fetchedAt))
				.limit(1);
			const [stored] = await db
				.select({ state: notificationState.state })
				.from(notificationState)
				.where(eq(notificationState.connectionId, connection.id));
			let previous: WatchState | undefined;
			try {
				previous = stored ? (JSON.parse(stored.state) as WatchState) : undefined;
			} catch {
				previous = undefined;
			}
			let data: VehicleData | undefined;
			try {
				data = latest ? (JSON.parse(latest.data) as VehicleData) : undefined;
			} catch {
				data = undefined;
			}
			const { events, next } = detectEvents(
				previous,
				{ status: connection.status, fetchedAt: latest?.fetchedAt.getTime(), data },
				await prefs(connection.userId),
				now()
			);
			const state = JSON.stringify(next);
			if (!stored || stored.state !== state) {
				await db
					.insert(notificationState)
					.values({ connectionId: connection.id, state, updatedAt: new Date(now()) })
					.onConflictDoUpdate({
						target: notificationState.connectionId,
						set: { state, updatedAt: new Date(now()) }
					});
			}
			if (events.length === 0) continue;
			const rows = await db
				.select()
				.from(pushSubscription)
				.where(eq(pushSubscription.userId, connection.userId));
			for (const event of events) {
				for (const row of rows) {
					const result = await deliver(row, eventMessage(event, connection, row.locale as Locale));
					if (result === 'sent') sent++;
				}
			}
		}
		return sent;
	}

	return {
		publicKey: keys.publicKey,
		prefs,
		setPrefs,
		devices,
		subscribe,
		unsubscribe,
		removeDevice,
		sendTest,
		check
	};
}

export type Notifier = ReturnType<typeof createNotifier>;
