// Per-user settings that are not part of sign-in, such as the home page layout.
import { eq } from 'drizzle-orm';
import { normalizeHomeLayout, type HomeLayout } from '../home-layout.ts';
import type { Database } from './db/index.ts';
import { user } from './db/schema.ts';

export function createPreferences(db: Database) {
	async function homeLayout(userId: string): Promise<HomeLayout> {
		const [row] = await db
			.select({ homeLayout: user.homeLayout })
			.from(user)
			.where(eq(user.id, userId));
		let stored: unknown = null;
		try {
			stored = row?.homeLayout ? JSON.parse(row.homeLayout) : null;
		} catch {
			// A broken value falls back to the default.
		}
		return normalizeHomeLayout(stored);
	}

	/** Stores the layout in its complete form and returns it. */
	async function setHomeLayout(userId: string, value: unknown): Promise<HomeLayout> {
		const layout = normalizeHomeLayout(value);
		await db
			.update(user)
			.set({ homeLayout: JSON.stringify(layout) })
			.where(eq(user.id, userId));
		return layout;
	}

	return { homeLayout, setHomeLayout };
}

export type Preferences = ReturnType<typeof createPreferences>;
