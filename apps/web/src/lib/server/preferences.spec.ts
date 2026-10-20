import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { defaultHomeLayout } from '../home-layout.ts';
import { openDatabase } from './db/index.ts';
import { user } from './db/schema.ts';
import { createPreferences, type Preferences } from './preferences.ts';

let db: ReturnType<typeof openDatabase>['db'];
let preferences: Preferences;

beforeEach(async () => {
	db = openDatabase(':memory:').db;
	preferences = createPreferences(db);
	await db.insert(user).values([
		{ id: 'alice', name: 'Alice', email: 'alice@example.com' },
		{ id: 'bob', name: 'Bob', email: 'bob@example.com' }
	]);
});

describe('preferences', () => {
	it('starts with the default layout', async () => {
		expect(await preferences.homeLayout('alice')).toEqual(defaultHomeLayout());
	});

	it('stores a layout per user in its complete form', async () => {
		const saved = await preferences.setHomeLayout('alice', [
			{ id: 'costs', on: true },
			{ id: 'location', on: false }
		]);
		expect(saved.slice(0, 2)).toEqual([
			{ id: 'costs', on: true },
			{ id: 'location', on: false }
		]);
		expect(saved).toHaveLength(defaultHomeLayout().length);
		expect(await preferences.homeLayout('alice')).toEqual(saved);
		expect(await preferences.homeLayout('bob')).toEqual(defaultHomeLayout());
	});

	it('falls back to the default when the stored value is broken', async () => {
		await db.update(user).set({ homeLayout: '{nope' }).where(eq(user.id, 'alice'));
		expect(await preferences.homeLayout('alice')).toEqual(defaultHomeLayout());
	});
});
