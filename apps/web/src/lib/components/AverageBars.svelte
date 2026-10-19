<script lang="ts">
	type Props = {
		/** One bar per section; `value` null where there is too little data. */
		items: { label: string; title: string; value: number | null }[];
		/** Drawn as a dashed line across the bars. */
		average: number | null;
		/** Formats values for the axis and the tooltip. */
		format: (value: number) => string;
		unit: string;
		label: string;
	};

	let { items, average, format, unit, label }: Props = $props();

	const HEIGHT = 180;
	const M = { top: 12, right: 4, bottom: 24, left: 36 };
	let width = $state(360);
	const plotW = $derived(Math.max(width - M.left - M.right, 10));
	const plotH = HEIGHT - M.top - M.bottom;

	// A rounded axis maximum with three gridlines.
	const max = $derived.by(() => {
		const top = Math.max(...items.map((item) => item.value ?? 0), average ?? 0, 1);
		const step = [1, 2, 5, 10, 15, 20, 25, 50, 100].find((s) => s * 2 >= top * 1.05);
		return (step ?? Math.ceil(top / 100) * 50) * 2;
	});
	const slot = $derived(plotW / Math.max(items.length, 1));
	const barW = $derived(Math.max(Math.min(slot - 4, 32), 3));
	const x = (i: number) => M.left + i * slot + (slot - barW) / 2;
	const y = (value: number) => M.top + (1 - value / max) * plotH;
	// Thin out labels so they never collide.
	// Room per label from its length in the 11px monospace axis font.
	const labelW = $derived(Math.max(...items.map((item) => item.label.length), 1) * 7 + 10);
	const every = $derived(
		Math.max(1, Math.ceil(items.length / Math.max(2, Math.floor(plotW / labelW))))
	);
	const newest = $derived(items.findLastIndex((item) => item.value !== null));

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

	// Bar with rounded top corners only, anchored to the baseline.
	function bar(i: number, value: number): string {
		const h = Math.max(M.top + plotH - y(value), 0);
		const r = Math.min(4, barW / 2, h);
		const left = x(i);
		const base = M.top + plotH;
		return `M${left},${base}V${base - h + r}Q${left},${base - h} ${left + r},${base - h}H${left + barW - r}Q${left + barW},${base - h} ${left + barW},${base - h + r}V${base}Z`;
	}

	const text = (item: { title: string; value: number | null }) =>
		`${item.title}: ${item.value === null ? '–' : `${format(item.value)} ${unit}`}`;
</script>

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
			{#if item.value !== null}
				<path
					class="bar"
					class:newest={i === newest}
					class:active={active === i}
					d={bar(i, item.value)}
				/>
			{/if}
			{#if (items.length - 1 - i) % every === 0}
				<text class="axis" x={x(i) + barW / 2} y={HEIGHT - 6} text-anchor="middle"
					>{item.label}</text
				>
			{/if}
		{/each}
		{#if average !== null}
			<line class="average" x1={M.left} x2={M.left + plotW} y1={y(average)} y2={y(average)} />
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
			style:left={`${Math.min(Math.max(x(active!) + barW / 2, 60), width - 60)}px`}
			style:top={`${Math.max(y(hovered.value ?? 0) - 10, 0)}px`}
		>
			<strong>{hovered.value === null ? '–' : `${format(hovered.value)} ${unit}`}</strong>
			<span>{hovered.title}</span>
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

	.grid {
		stroke: var(--border);
		stroke-width: 1;
	}

	.average {
		stroke: var(--muted);
		stroke-width: 1;
		stroke-dasharray: 4 4;
	}

	.axis {
		fill: var(--muted);
		font-size: 11px;
		font-family: var(--font-mono);
	}

	.bar {
		fill: color-mix(in srgb, var(--accent) 50%, transparent);
	}

	.bar.newest,
	.bar.active {
		fill: var(--accent);
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
