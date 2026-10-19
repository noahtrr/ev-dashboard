import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/index.ts';
import { chargeSession, user, vehicleConnection } from '../db/schema.ts';
import type { ChargeSession } from './charging.ts';
import { createCosts, isDay, isHome, type Costs } from './costs.ts';

const T0 = Date.parse('2026-10-18T07:00:00Z');
let db: ReturnType<typeof openDatabase>['db'];
let costs: Costs;

const session = (min: number, latitude = 52.5): ChargeSession => ({
	start: new Date(T0 + min * 60_000),
	end: new Date(T0 + (min + 60) * 60_000),
	ongoing: false,
	startSocPct: 40,
	endSocPct: 60,
	latitude,
	longitude: 13.4
});

beforeEach(async () => {
	db = openDatabase(':memory:').db;
	await db
		.insert(user)
		.values(['alice', 'bob'].map((id) => ({ id, name: id, email: `${id}@example.com` })));
	await db.insert(vehicleConnection).values({
		id: 'c1',
		userId: 'alice',
		providerId: 'mock',
		accessToken: 'x',
		accessTokenExpiresAt: new Date(T0)
	});
	costs = createCosts(db);
});

describe('costs', () => {
	it('keeps prices per start day and replaces one with the same day', async () => {
		expect(await costs.setPrice('alice', 'c1', 'home', '2026-01-01', 32)).toBe(true);
		await costs.setPrice('alice', 'c1', 'home', '2025-01-01', 34.5);
		await costs.setPrice('alice', 'c1', 'away', '2026-01-01', 49);
		await costs.setPrice('alice', 'c1', 'home', '2026-01-01', 31);
		const { prices } = (await costs.settings('alice', 'c1'))!;
		expect(prices.map(({ kind, from, ct }) => [kind, from, ct])).toEqual([
			['away', '2026-01-01', 49],
			['home', '2025-01-01', 34.5],
			['home', '2026-01-01', 31]
		]);

		await costs.deletePrice('alice', 'c1', prices[0].id);
		expect((await costs.settings('alice', 'c1'))!.prices).toHaveLength(2);
	});

	it('stores losses and the home location', async () => {
		await costs.setLoss('alice', 'c1', 12);
		await costs.setHome('alice', 'c1', { latitude: 52.5, longitude: 13.4 });
		expect(await costs.settings('alice', 'c1')).toMatchObject({
			lossPct: 12,
			home: { latitude: 52.5, longitude: 13.4 }
		});
		await costs.setLoss('alice', 'c1', null);
		await costs.setHome('alice', 'c1', null);
		expect(await costs.settings('alice', 'c1')).toMatchObject({ lossPct: null, home: null });
	});

	it('lists logged sessions with the home flag and the owner’s entries', async () => {
		await costs.setHome('alice', 'c1', { latitude: 52.5, longitude: 13.4 });
		await db.insert(chargeSession).values([
			{
				id: 's1',
				connectionId: 'c1',
				startAt: session(0).start,
				endAt: session(0).end,
				startSocPct: 40,
				endSocPct: 60,
				latitude: 52.5005,
				longitude: 13.4
			},
			{
				id: 's2',
				connectionId: 'c1',
				startAt: session(600).start,
				endAt: session(600).end,
				startSocPct: 70,
				endSocPct: null,
				latitude: 48.1,
				longitude: 11.6
			}
		]);
		await costs.setEntry('alice', 'c1', session(600, 48.1), { priceCt: null, costEur: 12.5 });
		expect(await costs.sessions('alice', 'c1')).toEqual([
			{
				t: T0,
				end: T0 + 3600_000,
				addedPct: 20,
				home: true,
				priceCt: null,
				costEur: null
			},
			{
				t: T0 + 600 * 60_000,
				end: T0 + 660 * 60_000,
				addedPct: null,
				home: false,
				priceCt: null,
				costEur: 12.5
			}
		]);
		expect(await costs.entry('alice', 'c1', session(600).start)).toEqual({
			priceCt: null,
			costEur: 12.5
		});
	});

	it('logs a session that is not logged yet when the owner enters a price', async () => {
		await costs.setEntry('alice', 'c1', session(0), { priceCt: 59, costEur: null });
		const rows = await db.select().from(chargeSession);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ startSocPct: 40, endSocPct: 60, priceCtPerKwh: 59 });
	});

	it('keeps other users out', async () => {
		expect(await costs.settings('bob', 'c1')).toBeUndefined();
		expect(await costs.setPrice('bob', 'c1', 'home', '2026-01-01', 1)).toBe(false);
		expect(await costs.setLoss('bob', 'c1', 1)).toBe(false);
		expect(await costs.setHome('bob', 'c1', null)).toBe(false);
		expect(await costs.setEntry('bob', 'c1', session(0), { priceCt: 1, costEur: null })).toBe(
			false
		);
		expect(await costs.sessions('bob', 'c1')).toEqual([]);
		expect(await costs.entry('bob', 'c1', session(0).start)).toBeUndefined();
		await costs.setPrice('alice', 'c1', 'home', '2026-01-01', 32);
		const [price] = (await costs.settings('alice', 'c1'))!.prices;
		expect(await costs.deletePrice('bob', 'c1', price.id)).toBe(false);
		expect((await costs.settings('alice', 'c1'))!.prices).toHaveLength(1);
	});
});

describe('isDay', () => {
	it('accepts real calendar days only', () => {
		expect(isDay('2026-02-28')).toBe(true);
		expect(isDay('2026-02-30')).toBe(false);
		expect(isDay('2026-2-1')).toBe(false);
		expect(isDay(null)).toBe(false);
	});
});

describe('isHome', () => {
	it('counts sessions within 150 m', () => {
		const home = { homeLatitude: 52.5, homeLongitude: 13.4 };
		expect(isHome(home, 52.501, 13.4)).toBe(true);
		expect(isHome(home, 52.502, 13.4)).toBe(false);
		expect(isHome(home, null, 13.4)).toBe(false);
		expect(isHome({ homeLatitude: null, homeLongitude: null }, 52.5, 13.4)).toBe(false);
	});
});
