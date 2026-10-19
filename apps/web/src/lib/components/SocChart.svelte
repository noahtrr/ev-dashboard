<script lang="ts">
	import { clockTime, dateTime, wholeNumber } from '#lib/format.ts';
	import type { Locale } from '#lib/i18n.ts';

	type Point = { t: number; soc: number };
	type Band = { start: number; end: number };
	type Props = {
		points: Point[];
		/** Charging periods, drawn as highlighted bands. */
		bands: Band[];
		from: number;
		to: number;
		/** Points further apart than this are not connected. */
		maxGapMs: number;
		locale: Locale;
		label: string;
		legend: string;
	};

	let { points, bands, from, to, maxGapMs, locale, label, legend }: Props = $props();

	const HEIGHT = 220;
	const M = { top: 12, right: 12, bottom: 26, left: 48 };
	let width = $state(600);
	const plotW = $derived(Math.max(width - M.left - M.right, 10));
	const plotH = HEIGHT - M.top - M.bottom;

	const x = (t: number) => M.left + ((t - from) / Math.max(to - from, 1)) * plotW;
	const y = (soc: number) => M.top + (1 - soc / 100) * plotH;

	const path = $derived.by(() => {
		let d = '';
		points.forEach((p, i) => {
			const gap = i === 0 || p.t - points[i - 1].t > maxGapMs;
			d += `${gap ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.soc).toFixed(1)}`;
		});
		return d;
	});

	const HOUR = 3600 * 1000;
	// Spans under two days get clock-time ticks, longer ones day ticks.
	const hourly = $derived(to - from < 48 * HOUR);
	const maxTicks = $derived(Math.max(2, Math.floor(plotW / 70)));

	// Day ticks at local midnight, or full hours, thinned to fit the width.
	const ticks = $derived.by(() => {
		const all: number[] = [];
		const f = new Date(from);
		if (hourly) {
			const step = [1, 2, 3, 6, 12].find((h) => (to - from) / (h * HOUR) <= maxTicks) ?? 24;
			// Hours via the calendar, so ticks stay on local full hours across DST changes.
			for (let i = 1; ; i++) {
				const t = new Date(f.getFullYear(), f.getMonth(), f.getDate(), f.getHours() + i).getTime();
				if (t > to) break;
				if (new Date(t).getHours() % step === 0) all.push(t);
			}
			return all;
		}
		// Midnights via the calendar, so DST changes keep ticks on the day boundary.
		for (let i = 1; ; i++) {
			const t = new Date(f.getFullYear(), f.getMonth(), f.getDate() + i).getTime();
			if (t > to) break;
			all.push(t);
		}
		const every = Math.max(1, Math.ceil(all.length / maxTicks));
		return all.filter((_, i) => i % every === 0);
	});
	const tickLabel = (t: number) =>
		hourly
			? clockTime(new Date(t), locale)
			: new Date(t).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB', {
					day: 'numeric',
					month: 'short'
				});

	let active = $state<number | null>(null);
	const hovered = $derived(active === null ? null : points[active]);
	const valueText = $derived.by(() => {
		const p = hovered ?? points.at(-1);
		return p ? `${wholeNumber(p.soc, locale)} %, ${dateTime(new Date(p.t), locale)}` : '';
	});

	function nearest(t: number): number {
		let lo = 0;
		let hi = points.length - 1;
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1;
			if (points[mid].t < t) lo = mid;
			else hi = mid;
		}
		return Math.abs(points[lo].t - t) <= Math.abs(points[hi].t - t) ? lo : hi;
	}

	function onMove(event: PointerEvent) {
		if (points.length === 0) return;
		const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
		const t = from + ((event.clientX - rect.left) / rect.width) * (to - from);
		active = nearest(t);
	}

	function onKey(event: KeyboardEvent) {
		if (points.length === 0) return;
		const step = event.shiftKey ? 12 : 1;
		if (event.key === 'ArrowRight') active = Math.min((active ?? -1) + step, points.length - 1);
		else if (event.key === 'ArrowLeft') active = Math.max((active ?? points.length) - step, 0);
		else if (event.key === 'Escape') active = null;
		else return;
		event.preventDefault();
	}
</script>

<figure class="chart" bind:clientWidth={width}>
	<!-- Arrow keys step through the points like a slider over time. -->
	<svg
		viewBox={`0 0 ${width} ${HEIGHT}`}
		height={HEIGHT}
		role="slider"
		aria-label={label}
		aria-valuemin={0}
		aria-valuemax={Math.max(points.length - 1, 0)}
		aria-valuenow={active ?? points.length - 1}
		aria-valuetext={valueText}
		tabindex="0"
		onkeydown={onKey}
		onblur={() => (active = null)}
	>
		{#each bands as band (band.start)}
			<rect
				class="band"
				x={x(Math.max(band.start, from))}
				y={M.top}
				width={Math.max(x(Math.min(band.end, to)) - x(Math.max(band.start, from)), 2)}
				height={plotH}
			/>
		{/each}
		{#each [0, 50, 100] as level (level)}
			<line class="grid" x1={M.left} x2={M.left + plotW} y1={y(level)} y2={y(level)} />
			<text class="axis" x={M.left - 8} y={y(level)} text-anchor="end" dominant-baseline="middle"
				>{level} %</text
			>
		{/each}
		{#each ticks as tick (tick)}
			<text class="axis" x={x(tick)} y={HEIGHT - 6} text-anchor="middle">{tickLabel(tick)}</text>
		{/each}
		<path class="line" d={path} />
		{#if hovered}
			<line class="cross" x1={x(hovered.t)} x2={x(hovered.t)} y1={M.top} y2={M.top + plotH} />
			<circle class="dot" cx={x(hovered.t)} cy={y(hovered.soc)} r="5" />
		{/if}
		<rect
			role="presentation"
			class="hit"
			x={M.left}
			y={0}
			width={plotW}
			height={HEIGHT}
			onpointermove={onMove}
			onpointerdown={onMove}
			onpointerleave={() => (active = null)}
		/>
	</svg>
	{#if hovered}
		<div
			class="tip"
			style:left={`${Math.min(Math.max(x(hovered.t), 70), width - 70)}px`}
			style:top={`${Math.max(y(hovered.soc) - 12, 0)}px`}
		>
			<strong>{wholeNumber(hovered.soc, locale)} %</strong>
			<span>{dateTime(new Date(hovered.t), locale)}</span>
		</div>
	{/if}
	<figcaption class="legend"><span class="swatch" aria-hidden="true"></span>{legend}</figcaption>
</figure>

<style>
	.chart {
		position: relative;
		margin: 0;
		width: 100%;
	}

	svg {
		display: block;
		width: 100%;
		overflow: visible;
		touch-action: pan-y;
	}

	svg:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
		border-radius: 8px;
	}

	.band {
		fill: color-mix(in srgb, var(--accent) 14%, transparent);
	}

	.grid {
		stroke: var(--border);
		stroke-width: 1;
	}

	.axis {
		fill: var(--muted);
		font-size: 11px;
		font-family: var(--font-mono);
	}

	.line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.cross {
		stroke: var(--muted);
		stroke-width: 1;
		stroke-dasharray: 3 3;
	}

	.dot {
		fill: var(--accent);
		stroke: var(--surface);
		stroke-width: 2;
	}

	.hit {
		fill: transparent;
		cursor: crosshair;
	}

	.tip {
		position: absolute;
		transform: translate(-50%, -100%);
		pointer-events: none;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 6px 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
	}

	.tip strong {
		color: var(--text);
		font-size: 14px;
		font-family: var(--font-mono);
	}

	.legend {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		font-size: 12px;
		color: var(--muted);
	}

	.swatch {
		width: 14px;
		height: 10px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--accent) 30%, transparent);
	}
</style>
