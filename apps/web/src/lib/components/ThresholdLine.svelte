<script lang="ts">
	type Props = {
		/** Oldest first; `t` in epoch ms. */
		points: { t: number; v: number }[];
		/** Drawn as a dashed line with its value. */
		threshold: number;
		/** Formats values for the threshold label and the tooltip. */
		format: (value: number) => string;
		/** Formats a point's time for the tooltip. */
		time: (t: number) => string;
		unit: string;
		label: string;
	};

	let { points, threshold, format, time, unit, label }: Props = $props();

	const HEIGHT = 72;
	const PAD = 6;
	let width = $state(320);

	const values = $derived(points.map((p) => p.v));
	const lo = $derived(Math.min(...values, threshold) - 0.1);
	const hi = $derived(Math.max(...values, threshold) + 0.1);
	const t0 = $derived(points[0]?.t ?? 0);
	const t1 = $derived(points.at(-1)?.t ?? 1);
	const x = (t: number) => (t1 === t0 ? width / 2 : ((t - t0) / (t1 - t0)) * width);
	const y = (v: number) => PAD + ((hi - v) / (hi - lo)) * (HEIGHT - 2 * PAD);
	const path = $derived(points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '));

	let active = $state<number | null>(null);
	const hovered = $derived(active === null ? null : points[active]);

	function nearest(clientX: number, rect: DOMRect) {
		const t = t0 + ((clientX - rect.left) / rect.width) * (t1 - t0);
		let best = 0;
		for (let i = 1; i < points.length; i++) {
			if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
		}
		return best;
	}

	function onMove(event: PointerEvent) {
		active = nearest(
			event.clientX,
			(event.currentTarget as SVGRectElement).getBoundingClientRect()
		);
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') active = Math.min((active ?? -1) + 1, points.length - 1);
		else if (event.key === 'ArrowLeft') active = Math.max((active ?? points.length) - 1, 0);
		else if (event.key === 'Escape') active = null;
		else return;
		event.preventDefault();
	}

	const text = (p: { t: number; v: number }) => `${time(p.t)}: ${format(p.v)} ${unit}`;
</script>

<figure class="chart" bind:clientWidth={width}>
	<svg
		viewBox={`0 0 ${width} ${HEIGHT}`}
		height={HEIGHT}
		role="slider"
		aria-label={label}
		aria-valuemin={0}
		aria-valuemax={Math.max(points.length - 1, 0)}
		aria-valuenow={active ?? points.length - 1}
		aria-valuetext={hovered ? text(hovered) : ''}
		tabindex="0"
		onkeydown={onKey}
		onblur={() => (active = null)}
	>
		<line class="threshold" x1="0" x2={width} y1={y(threshold)} y2={y(threshold)} />
		<text class="axis" x={width} y={y(threshold) - 4} text-anchor="end"
			>{format(threshold)} {unit}</text
		>
		<polyline class="line" points={path} />
		{#if hovered}
			<circle class="dot" cx={x(hovered.t)} cy={y(hovered.v)} r="4" />
		{/if}
		<rect
			role="presentation"
			class="hit"
			x="0"
			y="0"
			{width}
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
			style:top={`${Math.max(y(hovered.v) - 10, 0)}px`}
		>
			<strong>{format(hovered.v)} {unit}</strong>
			<span>{time(hovered.t)}</span>
		</div>
	{/if}
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

	.threshold {
		stroke: var(--muted);
		stroke-width: 1;
		stroke-dasharray: 4 4;
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
</style>
