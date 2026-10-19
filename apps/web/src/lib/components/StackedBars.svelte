<script lang="ts">
	type Props = {
		/** One bar per section; `values` in the order of `series`, bottom first. */
		items: { label: string; title: string; values: number[] }[];
		/** Name and CSS colour of each series, bottom first. */
		series: { name: string; color: string }[];
		/** Formats values for the axis and the tooltip. */
		format: (value: number) => string;
		unit: string;
		label: string;
	};

	let { items, series, format, unit, label }: Props = $props();

	const HEIGHT = 180;
	const M = { top: 12, right: 4, bottom: 24, left: 40 };
	let width = $state(360);
	const plotW = $derived(Math.max(width - M.left - M.right, 10));
	const plotH = HEIGHT - M.top - M.bottom;
	const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

	// A rounded axis maximum with three gridlines.
	const max = $derived.by(() => {
		const top = Math.max(...items.map((item) => sum(item.values)), 1);
		const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].find((s) => s * 2 >= top * 1.05);
		return (step ?? Math.ceil(top / 1000) * 500) * 2;
	});
	const slot = $derived(plotW / Math.max(items.length, 1));
	const barW = $derived(Math.max(Math.min(slot - 4, 32), 3));
	const x = (i: number) => M.left + i * slot + (slot - barW) / 2;
	const y = (value: number) => M.top + (1 - value / max) * plotH;
	const labelW = $derived(Math.max(...items.map((item) => item.label.length), 1) * 7 + 10);
	const every = $derived(
		Math.max(1, Math.ceil(items.length / Math.max(2, Math.floor(plotW / labelW))))
	);

	/** Segments of one bar, bottom up, with a 2px gap between them. */
	function segments(values: number[]) {
		const base = M.top + plotH;
		let top = base;
		return values.flatMap((value, s) => {
			const h = (value / max) * plotH;
			if (h <= 0) return [];
			const y0 = top;
			top -= h;
			const isTop = values.slice(s + 1).every((v) => v <= 0);
			return [{ s, y0, y1: top, round: isTop, gap: y0 < base ? 2 : 0 }];
		});
	}

	function path(left: number, y0: number, y1: number, round: boolean, gap: number) {
		const bottom = y0 - gap;
		const h = bottom - y1;
		if (h <= 0) return '';
		const r = round ? Math.min(4, barW / 2, h) : 0;
		return `M${left},${bottom}V${y1 + r}Q${left},${y1} ${left + r},${y1}H${left + barW - r}Q${left + barW},${y1} ${left + barW},${y1 + r}V${bottom}Z`;
	}

	let active = $state<number | null>(null);
	const hovered = $derived(active === null ? null : items[active]);

	function onMove(event: PointerEvent) {
		const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
		const i = Math.floor(((event.clientX - rect.left) / rect.width) * items.length);
		active = Math.min(Math.max(i, 0), items.length - 1);
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') active = Math.min((active ?? -1) + 1, items.length - 1);
		else if (event.key === 'ArrowLeft') active = Math.max((active ?? items.length) - 1, 0);
		else if (event.key === 'Escape') active = null;
		else return;
		event.preventDefault();
	}

	const text = (item: { title: string; values: number[] }) =>
		`${item.title}: ${series.map((s, i) => `${s.name} ${format(item.values[i] ?? 0)} ${unit}`).join(', ')}`;
</script>

<div class="legend">
	{#each series as s (s.name)}
		<span><i style:background={s.color}></i>{s.name}</span>
	{/each}
</div>
<figure class="chart" bind:clientWidth={width}>
	<svg
		viewBox={`0 0 ${width} ${HEIGHT}`}
		height={HEIGHT}
		role="slider"
		aria-label={label}
		aria-valuemin={0}
		aria-valuemax={Math.max(items.length - 1, 0)}
		aria-valuenow={active ?? items.length - 1}
		aria-valuetext={hovered ? text(hovered) : ''}
		tabindex="0"
		onkeydown={onKey}
		onblur={() => (active = null)}
	>
		{#each [0, max / 2, max] as level (level)}
			<line class="grid" x1={M.left} x2={M.left + plotW} y1={y(level)} y2={y(level)} />
			<text class="axis" x={M.left - 6} y={y(level)} text-anchor="end" dominant-baseline="middle"
				>{level}</text
			>
		{/each}
		{#each items as item, i (i)}
			{#each segments(item.values) as seg (seg.s)}
				<path
					class="bar"
					class:dim={active !== null && active !== i}
					style:fill={series[seg.s].color}
					d={path(x(i), seg.y0, seg.y1, seg.round, seg.gap)}
				/>
			{/each}
			{#if (items.length - 1 - i) % every === 0}
				<text class="axis" x={x(i) + barW / 2} y={HEIGHT - 6} text-anchor="middle"
					>{item.label}</text
				>
			{/if}
		{/each}
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
	{#if hovered && active !== null}
		<div
			class="tip"
			style:left={`${Math.min(Math.max(x(active) + barW / 2, 80), width - 80)}px`}
			style:top={`${Math.max(y(sum(hovered.values)) - 10, 0)}px`}
		>
			<strong>{format(sum(hovered.values))} {unit}</strong>
			<span>{hovered.title}</span>
			{#each series as s, k (s.name)}
				<span class="row"
					><i style:background={s.color}></i>{s.name}
					{format(hovered.values[k] ?? 0)}
					{unit}</span
				>
			{/each}
		</div>
	{/if}
</figure>

<style>
	.legend {
		display: flex;
		gap: 14px;
		font-size: 12px;
		color: var(--muted);
	}

	.legend span,
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.legend i,
	.row i {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}

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

	.grid {
		stroke: var(--border);
		stroke-width: 1;
	}

	.axis {
		fill: var(--muted);
		font-size: 11px;
		font-family: var(--font-mono);
	}

	.bar.dim {
		opacity: 0.45;
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
