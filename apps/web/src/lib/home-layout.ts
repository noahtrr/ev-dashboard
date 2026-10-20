// Which modules the home page shows, and in which order. Each user arranges their own; the
// layout applies to all of their vehicles.

export const HOME_MODULES = [
	'location',
	'range',
	'charging',
	'trips',
	'condition',
	'costs',
	'consumption'
] as const;
export type HomeModule = (typeof HOME_MODULES)[number];

export type HomeLayout = { id: HomeModule; on: boolean }[];

/** Added later; existing users only see them once they switch them on. */
const HIDDEN_BY_DEFAULT: ReadonlySet<HomeModule> = new Set(['costs', 'consumption']);

export const defaultHomeLayout = (): HomeLayout =>
	HOME_MODULES.map((id) => ({ id, on: !HIDDEN_BY_DEFAULT.has(id) }));

const isModule = (value: unknown): value is HomeModule =>
	typeof value === 'string' && (HOME_MODULES as readonly string[]).includes(value);

/**
 * A complete layout from whatever was stored or sent: unknown and repeated modules are dropped,
 * missing ones (e.g. added by an update) are appended with their default visibility.
 */
export function normalizeHomeLayout(value: unknown): HomeLayout {
	const layout: HomeLayout = [];
	if (Array.isArray(value)) {
		for (const entry of value) {
			const id = (entry as { id?: unknown } | null)?.id;
			if (!isModule(id) || layout.some((m) => m.id === id)) continue;
			layout.push({ id, on: (entry as { on?: unknown }).on !== false });
		}
	}
	for (const m of defaultHomeLayout()) {
		if (!layout.some((x) => x.id === m.id)) layout.push(m);
	}
	return layout;
}

/** Swaps a module with its neighbour; out-of-range moves leave the layout as it is. */
export function moveModule(layout: HomeLayout, index: number, by: -1 | 1): HomeLayout {
	const target = index + by;
	if (index < 0 || target < 0 || target >= layout.length) return layout;
	const next = [...layout];
	[next[index], next[target]] = [next[target], next[index]];
	return next;
}
