import { createECDH } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { defaultNotificationPrefs } from '../../notifications.ts';
import { openDatabase } from '../db/index.ts';
import { pushSubscription, snapshot, user, vehicleConnection } from '../db/schema.ts';
import { createNotifier, eventMessage, isPushEndpoint } from './notifier.ts';
import { newVapidScalar, vapidKeys, type SendResult } from './webpush.ts';

const T0 = Date.UTC(2026, 9, 20, 8);
const browserKey = () => {
	const ecdh = createECDH('prime256v1');
	ecdh.generateKeys();
	return ecdh.getPublicKey().toString('base64url');
};
const sub = (endpoint: string) => ({
	endpoint,
	keys: { p256dh: browserKey(), auth: Buffer.alloc(16, 1).toString('base64url') }
});

let db: ReturnType<typeof openDatabase>['db'];
let now: number;
let results: SendResult[];
const send = vi.fn(async () => results.shift() ?? 'sent');
const notifier = () =>
	createNotifier({
		db,
		keys: vapidKeys(newVapidScalar()),
		subject: 'https://ev.example.org',
		now: () => now,
		send
	});

async function fetched(data: object, minutes: number) {
	await db.insert(snapshot).values({
		connectionId: 'c1',
		fetchedAt: new Date(T0 + minutes * 60_000),
		data: JSON.stringify(data),
		raw: '{}'
	});
}

beforeEach(async () => {
	db = openDatabase(':memory:').db;
	now = T0;
	results = [];
	send.mockClear();
	await db
		.insert(user)
		.values(['alice', 'bob'].map((id) => ({ id, name: id, email: `${id}@example.com` })));
	await db.insert(vehicleConnection).values({
		id: 'c1',
		userId: 'alice',
		providerId: 'mock',
		label: 'Ferdinand',
		accessToken: 'x',
		accessTokenExpiresAt: new Date(T0)
	});
});

describe('isPushEndpoint', () => {
	it('accepts the push services of the major browsers only', () => {
		expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
		expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
		expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
		expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
		for (const bad of [
			'http://fcm.googleapis.com/x',
			'https://evil.example.org/x',
			'https://fcm.googleapis.com.evil.org/x',
			'https://user:pw@fcm.googleapis.com/x',
			'https://127.0.0.1/x',
			'nope',
			42
		]) {
			expect(isPushEndpoint(bad)).toBe(false);
		}
	});
});

describe('notifier', () => {
	it('keeps one entry per browser and moves it to whoever subscribed last', async () => {
		const n = notifier();
		const s = sub('https://fcm.googleapis.com/fcm/send/a');
		expect(await n.subscribe('alice', s, 'Chrome · Android', 'de')).toBe(true);
		expect(await n.subscribe('alice', s, 'Chrome · Android', 'en')).toBe(true);
		expect(await n.devices('alice')).toHaveLength(1);
		await n.subscribe('bob', s, null, 'de');
		expect(await n.devices('alice')).toHaveLength(0);
		expect(await n.devices('bob')).toHaveLength(1);
	});

	it('refuses foreign endpoints and broken keys', async () => {
		const n = notifier();
		expect(await n.subscribe('alice', sub('https://evil.example.org/x'), null, 'de')).toBe(false);
		expect(
			await n.subscribe(
				'alice',
				{ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'abc', auth: 'def' } },
				null,
				'de'
			)
		).toBe(false);
		expect(await n.devices('alice')).toHaveLength(0);
	});

	it('removes only the own devices', async () => {
		const n = notifier();
		await n.subscribe('alice', sub('https://fcm.googleapis.com/a'), null, 'de');
		const [device] = await n.devices('alice');
		await n.removeDevice('bob', device.id);
		await n.unsubscribe('bob', device.endpoint);
		expect(await n.devices('alice')).toHaveLength(1);
		await n.removeDevice('alice', device.id);
		expect(await n.devices('alice')).toHaveLength(0);
	});

	it('stores complete preferences', async () => {
		const n = notifier();
		expect(await n.prefs('alice')).toEqual(defaultNotificationPrefs());
		const saved = await n.setPrefs('alice', { events: { unlocked: true }, lowChargePct: 30, x: 1 });
		expect(saved.events.unlocked).toBe(true);
		expect(saved.lowChargePct).toBe(30);
		expect(await n.prefs('alice')).toEqual(saved);
		expect((await n.setPrefs('alice', { lowChargePct: 33 })).lowChargePct).toBe(20);
	});

	it('sends a test message to the own device only', async () => {
		const n = notifier();
		const endpoint = 'https://fcm.googleapis.com/a';
		await n.subscribe('alice', sub(endpoint), null, 'en');
		expect(await n.sendTest('bob', endpoint)).toBe('gone');
		expect(await n.sendTest('alice', endpoint)).toBe('sent');
		expect(send).toHaveBeenCalledTimes(1);
		expect((send.mock.calls[0] as unknown[])[1]).toMatchObject({ title: 'Test message', url: '/' });
	});

	it('sends what changed between two fetches, in the language of each device', async () => {
		const n = notifier();
		await n.subscribe('alice', sub('https://fcm.googleapis.com/de'), null, 'de');
		await n.subscribe('alice', sub('https://fcm.googleapis.com/en'), null, 'en');
		await fetched({ chargingState: 'charging', stateOfChargePct: 70 }, 0);
		expect(await n.check()).toBe(0);
		expect(await n.check()).toBe(0);

		await fetched({ chargingState: 'complete', stateOfChargePct: 80, rangeKm: 312 }, 5);
		now += 5 * 60_000;
		expect(await n.check()).toBe(2);
		const titles = send.mock.calls.map((c) => ((c as unknown[])[1] as { title: string }).title);
		expect(titles.sort()).toEqual(['Ferdinand: Laden beendet', 'Ferdinand: charging ended']);
		expect(await n.check()).toBe(0);
	});

	it('deletes devices whose subscription is gone and skips locked accounts', async () => {
		const n = notifier();
		await n.subscribe('alice', sub('https://fcm.googleapis.com/a'), null, 'de');
		await fetched({ chargingState: 'charging' }, 0);
		await n.check();
		await fetched({ chargingState: 'complete' }, 5);
		results = ['gone'];
		expect(await n.check()).toBe(0);
		expect(await db.select().from(pushSubscription)).toHaveLength(0);

		await n.subscribe('alice', sub('https://fcm.googleapis.com/b'), null, 'de');
		await db
			.update(user)
			.set({ lockedAt: new Date(T0) })
			.where(eq(user.id, 'alice'));
		await fetched({ chargingState: 'charging' }, 10);
		await fetched({ chargingState: 'complete' }, 15);
		send.mockClear();
		await n.check();
		expect(send).not.toHaveBeenCalled();
	});
});

describe('eventMessage', () => {
	it('links each event to the right page', () => {
		const v = { id: 'c1', label: null };
		expect(eventMessage({ kind: 'reauth' }, v, 'de')).toMatchObject({ url: '/account#vehicles' });
		expect(eventMessage({ kind: 'alert', title: 'Öl' }, v, 'de')).toMatchObject({
			url: '/vehicles/c1/condition',
			body: 'Öl'
		});
		expect(eventMessage({ kind: 'lowCharge', socPct: 18, rangeKm: 61 }, v, 'en')).toMatchObject({
			url: '/?v=c1',
			tag: 'c1:lowCharge'
		});
	});
});
