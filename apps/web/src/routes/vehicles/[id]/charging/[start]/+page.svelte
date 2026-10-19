<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import SocChart from '#lib/components/SocChart.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import VehicleMap from '#lib/components/VehicleMap.svelte';
	import {
		DASH,
		clockTime,
		dateTime,
		duration,
		energy,
		minutesBetween,
		wholeNumber
	} from '#lib/format.ts';
	import { format, messages, relativeTime } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const c = $derived(t.charging);
	const h = $derived(t.home);
	const s = $derived(data.session);
	const x = $derived(data.details);
	const number = (value: number) => wholeNumber(value, data.locale);
	const hasPosition = $derived(s.latitude !== undefined && s.longitude !== undefined);

	const amount = $derived(
		s.addedKwh !== undefined
			? { value: `+${energy(s.addedKwh, data.locale)}`, unit: 'kWh' }
			: { value: s.addedPct === undefined ? DASH : `+${number(s.addedPct)}`, unit: '%' }
	);
	const levels = $derived(
		s.startSocPct !== undefined && s.endSocPct !== undefined
			? `${number(s.startSocPct)} → ${number(s.endSocPct)} %`
			: DASH
	);

	// Only the values the vehicle reported are listed.
	const rows = $derived(
		[
			[c.start, dateTime(s.start, data.locale)],
			[c.end, s.ongoing ? c.ongoing : dateTime(s.end, data.locale)],
			[
				c.range,
				x.startRangeKm !== undefined && x.endRangeKm !== undefined
					? `${number(x.startRangeKm)} → ${number(x.endRangeKm)} km`
					: x.endRangeKm !== undefined
						? `${number(x.endRangeKm)} km`
						: undefined
			],
			[c.speed, x.pctPerHour === undefined ? undefined : `${number(x.pctPerHour)} %/h`],
			[c.power, x.averageKw === undefined ? undefined : `${energy(x.averageKw, data.locale)} kW`],
			[
				c.timeToFull,
				s.ongoing && s.timeToFullChargeMin !== undefined
					? duration(s.timeToFullChargeMin)
					: undefined
			],
			[c.odometer, x.odometerKm === undefined ? undefined : `${number(x.odometerKm)} km`],
			[
				c.outsideTemp,
				x.minOutsideTempC === undefined || x.maxOutsideTempC === undefined
					? undefined
					: x.minOutsideTempC === x.maxOutsideTempC
						? `${number(x.minOutsideTempC)} °C`
						: `${number(x.minOutsideTempC)} – ${number(x.maxOutsideTempC)} °C`
			],
			[c.status, x.statusRaw],
			[c.samples, String(x.samples)]
		].filter((row): row is [string, string] => row[1] !== undefined)
	);

	// The chart depends on the browser's width and time zone, so it renders after hydration.
	let mounted = $state(false);
	onMount(() => (mounted = true));
</script>

<svelte:head>
	<title>{c.session} · {data.connection.label || t.connections.unnamed} · {t.common.appName}</title>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<a class="back" href={resolve('/vehicles/[id]/charging', { id: data.connection.id })}
		>← {c.backToHistory}</a
	>
	<header class="head">
		<h1>{c.session}</h1>
		<p class="muted when">
			{dateTime(s.start, data.locale)}
			{#if s.ongoing}<span class="live">{c.ongoing}</span>{/if}
		</p>
	</header>

	<dl class="totals">
		<div>
			<dt>{c.added}</dt>
			<dd class:live={s.ongoing}>{amount.value}<span class="unit">{amount.unit}</span></dd>
		</div>
		<div>
			<dt>{c.level}</dt>
			<dd>{levels}</dd>
		</div>
		<div>
			<dt>{c.duration}</dt>
			<dd>{duration(minutesBetween(s.start, s.end))}</dd>
		</div>
	</dl>

	<div class="grid">
		<section class="module" aria-labelledby="place-title">
			<div class="map-wrap">
				{#if hasPosition}
					<VehicleMap
						latitude={s.latitude!}
						longitude={s.longitude!}
						sources={data.map}
						label={h.mapLabel}
						strings={h.map}
					/>
				{:else}
					<p class="muted no-position">{h.noPosition}</p>
				{/if}
			</div>
			<div class="module-body">
				<h2 id="place-title" class="title">{c.place}</h2>
				{#if hasPosition}
					{@const coordinates = `${s.latitude!.toFixed(5)}, ${s.longitude!.toFixed(5)}`}
					<p class="address">
						{#await data.address}
							{coordinates}
						{:then address}
							{address ?? coordinates}
						{/await}
					</p>
				{/if}
				{#if x.positionAt}
					<p class="stamp">
						{format(c.positionTime, { time: relativeTime(x.positionAt, data.locale) })}
						· {clockTime(x.positionAt, data.locale)}
					</p>
				{/if}
			</div>
		</section>

		<section class="card" aria-labelledby="details-title">
			<h2 id="details-title" class="title">{c.details}</h2>
			<dl class="facts">
				{#each rows as [label, value] (label)}
					<div>
						<dt>{label}</dt>
						<dd>{value}</dd>
					</div>
				{/each}
			</dl>
			{#if s.addedKwh !== undefined && data.connection.batteryCapacityKwh !== null}
				<p class="muted small">
					{format(c.energyNote, {
						capacity: energy(data.connection.batteryCapacityKwh, data.locale)
					})}
				</p>
			{/if}
		</section>
	</div>

	<section class="card" aria-labelledby="chart-title">
		<h2 id="chart-title" class="title">{c.chart}</h2>
		{#if data.chart.length === 0}
			<p class="muted">{c.noData}</p>
		{:else if mounted}
			<SocChart
				points={data.chart}
				bands={[{ start: new Date(s.start).getTime(), end: new Date(s.end).getTime() }]}
				from={data.from}
				to={data.to}
				maxGapMs={data.maxGapMs}
				locale={data.locale}
				label={c.sessionChart}
				legend={c.chartLegend}
			/>
		{:else}
			<div class="chart-placeholder" aria-hidden="true"></div>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 8px var(--space) 48px;
		display: flex;
		flex-direction: column;
		gap: var(--space);
	}

	.back {
		color: var(--muted);
		text-decoration: none;
		font-size: 14px;
	}

	.back:hover,
	.back:focus-visible {
		color: var(--accent);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 16px;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}

	.when {
		margin: 0;
	}

	.live {
		color: var(--accent);
	}

	.when .live {
		margin-left: 8px;
		font-size: 13px;
	}

	.totals {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1px;
		background: var(--border);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.totals div {
		background: var(--surface);
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.totals dt {
		font-size: 13px;
		color: var(--muted);
	}

	.totals dd {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		font-family: var(--font-mono);
	}

	.unit {
		font-size: 14px;
		font-weight: 500;
		color: var(--muted);
		margin-left: 4px;
		font-family: var(--font-sans);
	}

	@media (max-width: 480px) {
		.totals dd {
			font-size: 17px;
		}
	}

	.grid {
		display: grid;
		gap: var(--space);
	}

	@media (min-width: 800px) {
		.grid {
			grid-template-columns: 3fr 2fr;
			align-items: start;
		}
	}

	.module {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.module-body {
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.title {
		margin: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--muted);
		letter-spacing: 0.02em;
	}

	.map-wrap {
		height: 300px;
		border-bottom: 1px solid var(--border);
	}

	.no-position {
		height: 100%;
		display: grid;
		place-items: center;
		padding: var(--space);
		text-align: center;
	}

	.address {
		margin: 0;
		font-size: 17px;
		font-weight: 500;
	}

	.stamp {
		margin: 0;
		font-size: 13px;
		color: var(--muted);
	}

	.facts {
		margin: 0;
		display: flex;
		flex-direction: column;
	}

	.facts div {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 0;
		border-bottom: 1px solid var(--border);
		font-size: 14px;
	}

	.facts div:last-child {
		border-bottom: 0;
	}

	.facts dt {
		color: var(--muted);
	}

	.facts dd {
		margin: 0;
		text-align: right;
		font-family: var(--font-mono);
	}

	.chart-placeholder {
		height: 250px;
	}

	.small {
		margin: 0;
		font-size: 13px;
	}
</style>
