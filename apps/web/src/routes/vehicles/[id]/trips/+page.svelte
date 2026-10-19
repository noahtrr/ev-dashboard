<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import DailyBars from '#lib/components/DailyBars.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import {
		DASH,
		dateTime,
		duration,
		energy,
		kilometres,
		minutesBetween,
		oneDecimal,
		wholeNumber
	} from '#lib/format.ts';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const c = $derived(t.trips);
	const number = (value: number) => wholeNumber(value, data.locale);
	const km = (value: number) => `${kilometres(value, data.locale)} km`;
	const capacity = $derived(data.connection.batteryCapacityKwh);

	// kWh/100 km with a known capacity (trips under 1 km are too coarse), otherwise % used.
	const usage = (trip: { usedPct?: number; usedKwh?: number; distanceKm: number }) =>
		trip.usedKwh !== undefined
			? trip.distanceKm >= 1
				? oneDecimal((trip.usedKwh / trip.distanceKm) * 100, data.locale)
				: DASH
			: trip.usedPct === undefined
				? DASH
				: `${number(trip.usedPct)} %`;

	const totals = $derived.by(() => {
		const distance = data.trips.reduce((sum, trip) => sum + trip.distanceKm, 0);
		const usedKwh = data.trips.reduce((sum, trip) => sum + (trip.usedKwh ?? 0), 0);
		return {
			count: data.trips.length,
			distance,
			minutes: data.trips.reduce((sum, trip) => sum + minutesBetween(trip.start, trip.end), 0),
			usedPct: data.trips.reduce((sum, trip) => sum + (trip.usedPct ?? 0), 0),
			perHundred: capacity !== null && distance >= 1 ? (usedKwh / distance) * 100 : undefined
		};
	});
	const items = $derived(
		data.trips.map((trip) => ({ t: new Date(trip.start).getTime(), value: trip.distanceKm }))
	);

	// The chart depends on the browser's width and time zone, so it renders after hydration.
	let mounted = $state(false);
	onMount(() => (mounted = true));
</script>

<svelte:head>
	<title>{c.history} · {data.connection.label || t.connections.unnamed} · {t.common.appName}</title>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<a class="back" href={resolve('/')}>← {c.back}</a>
	<header class="head">
		<h1>{c.history}</h1>
		<form class="periods" method="GET" aria-label={c.period} data-sveltekit-noscroll>
			{#each data.periods as n (n)}
				<button name="days" value={n} aria-pressed={n === data.days}
					>{format(c.days, { n: String(n) })}</button
				>
			{/each}
		</form>
	</header>

	<dl class="totals">
		<div>
			<dt>{c.trips}</dt>
			<dd>{totals.count}</dd>
		</div>
		<div>
			<dt>{c.totalDistance}</dt>
			<dd>{totals.count ? km(totals.distance) : DASH}</dd>
		</div>
		<div>
			<dt>{c.totalDuration}</dt>
			<dd>{totals.count ? duration(totals.minutes) : DASH}</dd>
		</div>
		<div>
			<dt>{capacity === null ? c.used : c.averageConsumption}</dt>
			<dd>
				{#if !totals.count}
					{DASH}
				{:else if capacity === null}
					{number(totals.usedPct)} %
				{:else if totals.perHundred !== undefined}
					{oneDecimal(totals.perHundred, data.locale)}<span class="unit">kWh/100 km</span>
				{:else}
					{DASH}
				{/if}
			</dd>
		</div>
	</dl>

	<section class="card" aria-labelledby="chart-title">
		<h2 id="chart-title">{c.chart}</h2>
		{#if mounted}
			<DailyBars
				{items}
				from={data.from}
				to={data.to}
				unit="km"
				locale={data.locale}
				label={c.chartLabel}
			/>
		{:else}
			<div class="chart-placeholder" aria-hidden="true"></div>
		{/if}
	</section>

	<section class="card" aria-labelledby="trips-title">
		<h2 id="trips-title">{c.trips}</h2>
		{#if data.trips.length === 0}
			<p class="muted">{c.noTrips}</p>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th scope="col">{c.start}</th>
							<th scope="col" class="optional">{c.duration}</th>
							<th scope="col" class="num">{c.distance}</th>
							<th scope="col" class="num">
								{capacity === null ? c.used : 'kWh/100 km'}
							</th>
						</tr>
					</thead>
					<tbody>
						{#each data.trips as trip (trip.start)}
							<tr>
								<td>
									<a
										class="row-link"
										href={resolve('/vehicles/[id]/trips/[start]', {
											id: data.connection.id,
											start: String(new Date(trip.start).getTime())
										})}
										aria-label={format(c.open, { date: dateTime(trip.start, data.locale) })}
										>{dateTime(trip.start, data.locale)}</a
									>
									{#if trip.ongoing}<span class="live">{c.ongoing}</span>{/if}
								</td>
								<td class="optional">{duration(minutesBetween(trip.start, trip.end))}</td>
								<td class="num mono">{km(trip.distanceKm)}</td>
								<td class="num mono">{usage(trip)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="muted small">
				{#if capacity === null}
					{c.percentNote}
					<a href={resolve('/vehicles/[id]', { id: data.connection.id })}
						>{t.charging.capacityLink}</a
					>
				{:else}
					{format(t.charging.energyNote, { capacity: energy(capacity, data.locale) })}
				{/if}
				{c.accuracyNote}
			</p>
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
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}

	.periods {
		display: flex;
		gap: 4px;
		padding: 4px;
		border: 1px solid var(--border);
		border-radius: 14px;
	}

	.periods button {
		font: inherit;
		font-size: 14px;
		border: 0;
		background: transparent;
		color: var(--muted);
		padding: 8px 12px;
		border-radius: 10px;
		cursor: pointer;
	}

	.periods button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--text);
	}

	.periods button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.totals {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
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
		font-size: 13px;
		font-weight: 500;
		color: var(--muted);
		margin-left: 4px;
		font-family: var(--font-sans);
	}

	@media (max-width: 640px) {
		.totals {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.totals dd {
			font-size: 17px;
		}
	}

	.chart-placeholder {
		height: 200px;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}

	th {
		text-align: left;
		font-weight: 500;
		font-size: 13px;
		color: var(--muted);
		padding: 0 12px 8px 0;
		border-bottom: 1px solid var(--border);
	}

	td {
		padding: 10px 12px 10px 0;
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}

	tr:last-child td {
		border-bottom: 0;
	}

	.num {
		text-align: right;
		padding-right: 0;
	}

	th.num + th.num,
	td.num + td.num {
		padding-left: 12px;
	}

	/* On phones the duration moves to the trip page, so distance and usage stay visible. */
	@media (max-width: 480px) {
		.optional {
			display: none;
		}

		table {
			font-size: 13px;
		}

		th,
		td {
			padding-right: 8px;
		}
	}

	/* The whole row opens the trip; the link stretches over it. */
	tbody tr {
		position: relative;
	}

	tbody tr:hover {
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}

	.row-link {
		color: inherit;
		text-decoration: none;
	}

	.row-link::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.row-link:focus-visible {
		outline: none;
	}

	tbody tr:has(.row-link:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.live {
		margin-left: 8px;
		font-size: 12px;
		color: var(--accent);
	}

	.small {
		font-size: 13px;
	}

	.small a {
		color: var(--accent);
	}
</style>
