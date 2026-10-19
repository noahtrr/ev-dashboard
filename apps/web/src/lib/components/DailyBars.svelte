<script lang="ts">
	import { wholeNumber } from '#lib/format.ts';
	import type { Locale } from '#lib/i18n.ts';

	type Props = {
		/** Values to add up per local day, e.g. one entry per trip. */
		items: { t: number; value: number }[];
		from: number;
		to: number;
		unit: string;
		locale: Locale;
		label: string;
	};

	let { items, from, to, unit, locale, label }: Props = $props();

	const HEIGHT = 200;
	const M = { top: 12, right: 12, bottom: 26, left: 48 };
	let width = $state(600);
	const plotW = $derived(Math.max(width - M.left - M.right, 10));
	const plotH = HEIGHT - M.top - M.bottom;
	const tag = $derived(locale === 'de' ? 'de-DE' : 'en-GB');

	// One bar per local calendar day, so the bars follow the viewer's time zone.
	const days = $derived.by(() => {
		const f = new Date(from);
		const list: { t: number; value: number }[] = [];
		for (let i = 0; ; i++) {
			const t = new Date(f.getFullYear(), f.getMonth(), f.getDate() + i).getTime();
			if (t > to) break;
			list.push({ t, value: 0 });
		}
		for (const item of items) {
			const d = new Date(item.t);
			const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
			const day = list.find((entry) => entry.t === t);
			if (day) day.value += item.value;
		}
		return list;
	});

	// A rounded axis maximum with three gridlines.
	const max = $derived.by(() => {
		const top = Math.max(...days.map((d) => d.value), 1);
		const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => s * 2 >= top);
		return (step ?? Math.ceil(top / 2000) * 1000) * 2;
	});
	const slot = $derived(plotW / Math.max(days.length, 1));
	const barW = $derived(Math.max(Math.min(slot - 2, 28), 2));
	const x = (i: number) => M.left + i * slot + (slot - barW) / 2;
	const y = (value: number) => M.top + (1 - value / max) * plotH;

	const every = $derived(Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(plotW / 70)))));
	const dayLabel = (t: number) =>
		new Date(t).toLocaleDateString(tag, { day: 'numeric', month: 'short' });
	const amount = (value: number) => `${wholeNumber(value, locale)} ${unit}`;

	let active = $state<number | null>(null);
	const hovered = $derived(active === null ? null : days[active]);

	function onMove(event: PointerEvent) {
		const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
		const i = Math.floor(((event.clientX - rect.left) / rect.width) * days.length);
		active = Math.min(Math.max(i, 0), days.length - 1);
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') active = Math.min((active ?? -1) + 1, days.length - 1);
		else if (event.key === 'ArrowLeft') active = Math.max((active ?? days.length) - 1, 0);
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
</script>

<figure class="chart" bind:clientWidth={width}>
	<svg
		viewBox={`0 0 ${width} ${HEIGHT}`}
		height={HEIGHT}
		role="slider"
		aria-label={label}
		aria-valuemin={0}
		aria-valuemax={Math.max(days.length - 1, 0)}
		aria-valuenow={active ?? days.length - 1}
		aria-valuetext={hovered ? `${dayLabel(hovered.t)}: ${amount(hovered.value)}` : ''}
		tabindex="0"
		onkeydown={onKey}
		onblur={() => (active = null)}
	>
		{#each [0, max / 2, max] as level (level)}
			<line class="grid" x1={M.left} x2={M.left + plotW} y1={y(level)} y2={y(level)} />
			<text class="axis" x={M.left - 8} y={y(level)} text-anchor="end" dominant-baseline="middle"
				>{wholeNumber(level, locale)} {unit}</text
			>
		{/each}
		{#each days as day, i (day.t)}
			{#if day.value > 0}
				<path class="bar" class:active={active === i} d={bar(i, day.value)} />
			{/if}
			{#if i % every === 0}
				<text class="axis" x={x(i) + barW / 2} y={HEIGHT - 6} text-anchor="middle"
					>{dayLabel(day.t)}</text
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
	{#if hovered}
		<div
			class="tip"
			style:left={`${Math.min(Math.max(x(active!) + barW / 2, 60), width - 60)}px`}
			style:top={`${Math.max(y(hovered.value) - 10, 0)}px`}
		>
			<strong>{amount(hovered.value)}</strong>
			<span>{dayLabel(hovered.t)}</span>
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

	.axis {
		fill: var(--muted);
		font-size: 11px;
		font-family: var(--font-mono);
	}

	.bar {
		fill: color-mix(in srgb, var(--accent) 70%, transparent);
	}

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
