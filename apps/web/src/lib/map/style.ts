// Calm, warm-dark map style for vector tiles in the OpenMapTiles schema. Only a few layers:
// the map gives orientation around the vehicle, it is not a navigation map.
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';

export type MapTheme = 'dark' | 'light';

export type MapSources = { tilesUrl: string; glyphsUrl: string };

const PALETTE = {
	dark: {
		background: '#0a0807',
		water: '#0b1219',
		park: '#0e0f0a',
		building: '#15120f',
		road: '#221d18',
		major: '#2e2720',
		rail: '#1b1713',
		boundary: '#332b23',
		label: '#8a8178',
		halo: '#0a0807'
	},
	light: {
		background: '#f1ebe2',
		water: '#d5dde3',
		park: '#e3e4d6',
		building: '#e7dfd4',
		road: '#fffcf8',
		major: '#fffaf3',
		rail: '#d8cfc3',
		boundary: '#c2b6a6',
		label: '#6b5f53',
		halo: '#f1ebe2'
	}
} as const;

const FONT = ['Noto Sans Regular'];

export function mapStyle(theme: MapTheme, sources: MapSources): StyleSpecification {
	const c = PALETTE[theme];
	const roadWidth = (base: number): ExpressionSpecification => [
		'interpolate',
		['exponential', 1.5],
		['zoom'],
		10,
		base * 0.5,
		18,
		base * 8
	];
	return {
		version: 8,
		glyphs: sources.glyphsUrl,
		sources: { omt: { type: 'vector', url: sources.tilesUrl } },
		layers: [
			{ id: 'background', type: 'background', paint: { 'background-color': c.background } },
			{
				id: 'park',
				type: 'fill',
				source: 'omt',
				'source-layer': 'park',
				paint: { 'fill-color': c.park }
			},
			{
				id: 'landcover-wood',
				type: 'fill',
				source: 'omt',
				'source-layer': 'landcover',
				filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass']]],
				paint: { 'fill-color': c.park, 'fill-opacity': 0.7 }
			},
			{
				id: 'water',
				type: 'fill',
				source: 'omt',
				'source-layer': 'water',
				paint: { 'fill-color': c.water }
			},
			{
				id: 'building',
				type: 'fill',
				source: 'omt',
				'source-layer': 'building',
				minzoom: 14,
				paint: { 'fill-color': c.building }
			},
			{
				id: 'boundary',
				type: 'line',
				source: 'omt',
				'source-layer': 'boundary',
				filter: ['<=', ['get', 'admin_level'], 4],
				paint: { 'line-color': c.boundary, 'line-dasharray': [3, 2], 'line-width': 1 }
			},
			{
				id: 'rail',
				type: 'line',
				source: 'omt',
				'source-layer': 'transportation',
				filter: ['==', ['get', 'class'], 'rail'],
				paint: { 'line-color': c.rail, 'line-width': 1 }
			},
			{
				id: 'road-minor',
				type: 'line',
				source: 'omt',
				'source-layer': 'transportation',
				minzoom: 12,
				filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]],
				layout: { 'line-cap': 'round', 'line-join': 'round' },
				paint: { 'line-color': c.road, 'line-width': roadWidth(0.6) }
			},
			{
				id: 'road-major',
				type: 'line',
				source: 'omt',
				'source-layer': 'transportation',
				filter: [
					'in',
					['get', 'class'],
					['literal', ['motorway', 'trunk', 'primary', 'secondary']]
				],
				layout: { 'line-cap': 'round', 'line-join': 'round' },
				paint: { 'line-color': c.major, 'line-width': roadWidth(1) }
			},
			{
				id: 'road-label',
				type: 'symbol',
				source: 'omt',
				'source-layer': 'transportation_name',
				minzoom: 14,
				layout: {
					'symbol-placement': 'line',
					'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
					'text-font': FONT,
					'text-size': 11
				},
				paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.5 }
			},
			{
				id: 'place-label',
				type: 'symbol',
				source: 'omt',
				'source-layer': 'place',
				filter: [
					'in',
					['get', 'class'],
					['literal', ['city', 'town', 'village', 'suburb', 'quarter']]
				],
				layout: {
					'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
					'text-font': FONT,
					'text-size': ['match', ['get', 'class'], 'city', 15, 'town', 13, 12]
				},
				paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.5 }
			}
		]
	};
}
