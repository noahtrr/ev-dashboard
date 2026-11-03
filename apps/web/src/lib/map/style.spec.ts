import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { mapStyle } from './style.ts';

const sources = {
	tilesUrl: 'https://tiles.example/planet',
	glyphsUrl: 'https://tiles.example/fonts/{fontstack}/{range}.pbf'
};

describe('mapStyle', () => {
	it.each([
		['dark', 'bronze'],
		['light', 'bronze'],
		['dark', 'cockpit'],
		['light', 'cockpit']
	] as const)('is a valid %s %s style', (theme, design) => {
		expect(validateStyleMin(mapStyle(theme, sources, design))).toEqual([]);
	});

	it('follows the design style', () => {
		const color = (design: 'bronze' | 'cockpit') =>
			mapStyle('dark', sources, design).layers[0].paint;
		expect(color('bronze')).not.toEqual(color('cockpit'));
	});

	it('uses the configured sources', () => {
		const style = mapStyle('dark', sources);
		expect(style.glyphs).toBe(sources.glyphsUrl);
		expect(style.sources.omt).toEqual({ type: 'vector', url: sources.tilesUrl });
	});
});
