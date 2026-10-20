import { describe, expect, it } from 'vitest';
import { defaultHomeLayout, HOME_MODULES, moveModule, normalizeHomeLayout } from './home-layout.ts';

describe('home layout', () => {
	it('shows the original modules and hides the newer ones by default', () => {
		expect(
			defaultHomeLayout()
				.filter((m) => !m.on)
				.map((m) => m.id)
		).toEqual(['costs', 'consumption']);
		expect(defaultHomeLayout().map((m) => m.id)).toEqual([...HOME_MODULES]);
	});

	it('falls back to the default for anything that is not a list', () => {
		expect(normalizeHomeLayout(null)).toEqual(defaultHomeLayout());
		expect(normalizeHomeLayout({ id: 'range' })).toEqual(defaultHomeLayout());
	});

	it('keeps the stored order, drops unknown and repeated modules and appends missing ones', () => {
		const layout = normalizeHomeLayout([
			{ id: 'trips', on: false },
			{ id: 'weather', on: true },
			{ id: 'range' },
			{ id: 'trips', on: true },
			'location',
			null
		]);
		expect(layout.slice(0, 2)).toEqual([
			{ id: 'trips', on: false },
			{ id: 'range', on: true }
		]);
		expect(layout.map((m) => m.id).sort()).toEqual([...HOME_MODULES].sort());
		expect(layout.find((m) => m.id === 'costs')?.on).toBe(false);
		expect(layout.find((m) => m.id === 'location')?.on).toBe(true);
	});

	it('moves a module one step and ignores moves past either end', () => {
		const layout = defaultHomeLayout();
		expect(
			moveModule(layout, 1, -1)
				.map((m) => m.id)
				.slice(0, 2)
		).toEqual(['range', 'location']);
		expect(moveModule(layout, 0, -1)).toBe(layout);
		expect(moveModule(layout, layout.length - 1, 1)).toBe(layout);
	});
});
