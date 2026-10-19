import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { mapStyle } from './style.ts';

const sources = {
	tilesUrl: 'https://tiles.example/planet',
	glyphsUrl: 'https://tiles.example/fonts/{fontstack}/{range}.pbf'
};

describe('mapStyle', () => {
	it.each(['dark', 'light'] as const)('is a valid %s style', (theme) => {
		expect(validateStyleMin(mapStyle(theme, sources))).toEqual([]);
	});

	it('uses the configured sources', () => {
		const style = mapStyle('dark', sources);
		expect(style.glyphs).toBe(sources.glyphsUrl);
		expect(style.sources.omt).toEqual({ type: 'vector', url: sources.tilesUrl });
	});
});
