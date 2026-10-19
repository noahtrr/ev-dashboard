<script lang="ts">
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
	import { mapStyle, type MapSources, type MapTheme } from '#lib/map/style.ts';

	type Props = {
		latitude: number;
		longitude: number;
		sources: MapSources;
		label: string;
		/** UI strings of the map controls, by MapLibre key. */
		strings: Record<string, string>;
		/** A route as [longitude, latitude] pairs; the marker then sits at its end. */
		path?: [number, number][];
	};

	let { latitude, longitude, sources, label, strings, path = [] }: Props = $props();
	const ROUTE = 'route';

	let container: HTMLDivElement;
	let map: MapLibreMap | undefined;
	let marker: Marker | undefined;
	let failed = $state(false);

	function currentTheme(): MapTheme {
		const forced = document.documentElement.dataset.theme;
		if (forced === 'light' || forced === 'dark') return forced;
		return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
	}

	onMount(() => {
		let cancelled = false;
		const scheme = matchMedia('(prefers-color-scheme: light)');
		const onScheme = () => map?.setStyle(mapStyle(currentTheme(), sources));

		// MapLibre needs WebGL and the DOM, so it is loaded in the browser only.
		(async () => {
			try {
				const [maplibre, worker] = await Promise.all([
					import('maplibre-gl'),
					import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
					import('maplibre-gl/dist/maplibre-gl.css')
				]);
				if (cancelled) return;
				maplibre.setWorkerUrl(worker.default);
				map = new maplibre.Map({
					container,
					style: mapStyle(currentTheme(), sources),
					center: [longitude, latitude],
					zoom: 15,
					attributionControl: { compact: true },
					cooperativeGestures: true,
					dragRotate: false,
					pitchWithRotate: false,
					touchPitch: false,
					locale: strings
				});
				map.touchZoomRotate.disableRotation();
				if (path.length > 1) {
					// Custom layers are dropped with every style change, so they are re-added each time.
					map.on('style.load', addRoute);
					const bounds = path.reduce(
						(b, point) => b.extend(point),
						new maplibre.LngLatBounds(path[0], path[0])
					);
					const frame = () => map?.fitBounds(bounds, { padding: 48, duration: 0, maxZoom: 16 });
					frame();
					// Keep the whole route in view when the layout changes (rotation, window size).
					map.on('resize', frame);
					const origin = document.createElement('div');
					origin.className = 'route-start';
					new maplibre.Marker({ element: origin }).setLngLat(path[0]).addTo(map);
				}
				const dot = document.createElement('div');
				dot.className = 'vehicle-dot';
				marker = new maplibre.Marker({ element: dot }).setLngLat([longitude, latitude]).addTo(map);
				scheme.addEventListener('change', onScheme);
			} catch {
				failed = true;
			}
		})();

		return () => {
			cancelled = true;
			scheme.removeEventListener('change', onScheme);
			map?.remove();
			map = undefined;
		};
	});

	function addRoute() {
		if (!map || map.getSource(ROUTE)) return;
		const accent = getComputedStyle(container).getPropertyValue('--accent').trim() || '#38bdf8';
		map.addSource(ROUTE, {
			type: 'geojson',
			data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path } }
		});
		map.addLayer({
			id: ROUTE,
			type: 'line',
			source: ROUTE,
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: { 'line-color': accent, 'line-width': 4, 'line-opacity': 0.85 }
		});
	}

	// Follow the vehicle when the position changes (e.g. switching vehicles); a route stays framed.
	$effect(() => {
		const center: [number, number] = [longitude, latitude];
		marker?.setLngLat(center);
		if (path.length < 2) map?.jumpTo({ center });
	});
</script>

<div class="map" bind:this={container} role="img" aria-label={label}>
	{#if failed}
		<p class="fallback mono">{latitude.toFixed(5)}, {longitude.toFixed(5)}</p>
	{/if}
</div>

<style>
	.map {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 260px;
		background: var(--bg);
	}

	.fallback {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		color: var(--muted);
	}

	.map :global(.vehicle-dot) {
		width: 18px;
		height: 18px;
		border-radius: 999px;
		background: var(--accent);
		border: 3px solid var(--surface);
		box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 25%, transparent);
	}

	.map :global(.route-start) {
		width: 14px;
		height: 14px;
		border-radius: 999px;
		background: var(--surface);
		border: 3px solid var(--accent);
	}

	.map :global(.maplibregl-ctrl-attrib) {
		font-size: 11px;
	}
</style>
