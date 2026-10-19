<script lang="ts">
	type Props = {
		/** Open parts by neutral name (`frontLeft`, `innerTailgate`, ...). */
		openDoors: string[];
		openWindows: string[];
		hoodOpen: boolean;
		/** Undefined when the locks are not reported. */
		locked: boolean | undefined;
		tires: { part: string; value: string; low: boolean }[];
		label: string;
		/** Shown under each tyre value. */
		unit: string;
		tooLow: string;
	};

	let { openDoors, openWindows, hoodOpen, locked, tires, label, unit, tooLow }: Props = $props();

	const DOORS: Record<string, { x: number; y: number }> = {
		frontLeft: { x: 109, y: 70 },
		frontRight: { x: 206, y: 70 },
		rearLeft: { x: 109, y: 122 },
		rearRight: { x: 206, y: 122 }
	};
	const WHEELS: Record<string, { x: number; y: number; tx: number; anchor: 'start' | 'end' }> = {
		frontLeft: { x: 98, y: 44, tx: 84, anchor: 'end' },
		frontRight: { x: 208, y: 44, tx: 236, anchor: 'start' },
		rearLeft: { x: 98, y: 168, tx: 84, anchor: 'end' },
		rearRight: { x: 208, y: 168, tx: 236, anchor: 'start' }
	};
	const TAILGATES = ['tailgate', 'innerTailgate', 'trunk'];

	const wheels = $derived(tires.filter((t) => t.part in WHEELS));
	// Without tyre values the labels beside the wheels are not needed.
	const viewBox = $derived(wheels.length > 0 ? '0 0 320 250' : '90 0 140 250');
	const tailgateOpen = $derived(openDoors.some((p) => TAILGATES.includes(p)));
</script>

<svg {viewBox} role="img" aria-label={label} class:narrow={wheels.length === 0}>
	<rect class="body" x="112" y="18" width="96" height="214" rx="38" />
	<rect class="glass" x="124" y="62" width="72" height="40" rx="10" />
	<rect class="glass" x="124" y="160" width="72" height="30" rx="10" />
	<rect class="edge" class:open={hoodOpen} x="140" y="19" width="40" height="5" rx="2.5" />
	<rect class="edge" class:open={tailgateOpen} x="140" y="226" width="40" height="5" rx="2.5" />
	{#each Object.entries(DOORS) as [part, d] (part)}
		<rect
			class="edge"
			class:open={openDoors.includes(part)}
			x={d.x}
			y={d.y}
			width="5"
			height="46"
			rx="2.5"
		/>
		{#if openWindows.includes(part)}
			<rect
				class="window-open"
				x={part.endsWith('Left') ? d.x + 9 : d.x - 7}
				y={d.y + 8}
				width="3"
				height="30"
				rx="1.5"
			/>
		{/if}
	{/each}
	{#each wheels as tire (tire.part)}
		{@const w = WHEELS[tire.part]}
		<rect class="wheel" class:low={tire.low} x={w.x} y={w.y} width="14" height="34" rx="5" />
		<text class="value" x={w.tx} y={w.y + 16} text-anchor={w.anchor}>{tire.value}</text>
		<text class="sub" class:low={tire.low} x={w.tx} y={w.y + 32} text-anchor={w.anchor}
			>{tire.low ? tooLow : unit}</text
		>
	{/each}
	{#if locked !== undefined}
		<g class="lock" class:unlocked={!locked} transform="translate(148 112)">
			<rect x="0" y="12" width="24" height="18" rx="4" />
			<path d={locked ? 'M5 12V8a7 7 0 0114 0v4' : 'M5 12V8a7 7 0 0113.5-2.5'} />
		</g>
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		max-width: 420px;
		margin: 0 auto;
	}

	svg.narrow {
		max-width: 180px;
	}

	.body {
		fill: color-mix(in srgb, var(--border) 60%, transparent);
		stroke: var(--border);
		stroke-width: 1.5;
	}

	.glass {
		fill: var(--bg);
		opacity: 0.6;
	}

	.edge,
	.wheel {
		fill: color-mix(in srgb, var(--muted) 45%, transparent);
	}

	.edge.open,
	.wheel.low,
	.window-open {
		fill: var(--warn);
	}

	.value {
		fill: var(--text);
		font-size: 17px;
		font-weight: 600;
		font-family: var(--font-mono);
	}

	.sub {
		fill: var(--muted);
		font-size: 12px;
	}

	.sub.low {
		fill: var(--warn);
	}

	.lock {
		color: var(--muted);
	}

	.lock.unlocked {
		color: var(--warn);
	}

	.lock rect {
		fill: currentColor;
	}

	.lock path {
		fill: none;
		stroke: currentColor;
		stroke-width: 3;
		stroke-linecap: round;
	}
</style>
