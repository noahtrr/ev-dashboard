<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import SocChart from '#lib/components/SocChart.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { DASH, dateTime, duration, energy, minutesBetween, wholeNumber } from '#lib/format.ts';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const c = $derived(t.charging);
	const number = (value: number) => wholeNumber(value, data.locale);
	const capacity = $derived(data.connection.batteryCapacityKwh);
	// With a known capacity amounts are shown in kWh, otherwise in percentage points.
	const amount = (s: { addedPct?: number; addedKwh?: number }) =>
		s.addedKwh !== undefined
			? `+${energy(s.addedKwh, data.locale)} kWh`
			: s.addedPct === undefined
				? DASH
				: `+${number(s.addedPct)} %`;

	const totals = $derived({
		count: data.sessions.length,
		addedPct: data.sessions.reduce((sum, s) => sum + (s.addedPct ?? 0), 0),
		addedKwh: data.sessions.reduce((sum, s) => sum + (s.addedKwh ?? 0), 0),
		minutes: data.sessions.reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0)
	});
	const bands = $derived(
		data.sessions.map((s) => ({
			start: new Date(s.start).getTime(),
			end: new Date(s.end).getTime()
		}))
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
			<dt>{c.sessions}</dt>
			<dd>{totals.count}</dd>
		</div>
		<div>
			<dt>{c.totalAdded}</dt>
			<dd>
				{totals.count
					? amount(
							capacity === null ? { addedPct: totals.addedPct } : { addedKwh: totals.addedKwh }
						)
					: DASH}
			</dd>
		</div>
		<div>
			<dt>{c.totalDuration}</dt>
			<dd>{totals.count ? duration(totals.minutes) : DASH}</dd>
		</div>
	</dl>

	<section class="card" aria-labelledby="chart-title">
		<h2 id="chart-title">{c.chart}</h2>
		{#if data.chart.length === 0}
			<p class="muted">{c.noData}</p>
		{:else if mounted}
			<SocChart
				points={data.chart}
				{bands}
				from={data.from}
				to={data.to}
				maxGapMs={data.maxGapMs}
				locale={data.locale}
				label={c.chartLabel}
				legend={c.chartLegend}
			/>
		{:else}
			<div class="chart-placeholder" aria-hidden="true"></div>
		{/if}
	</section>

	<section class="card" aria-labelledby="sessions-title">
		<h2 id="sessions-title">{c.sessions}</h2>
		{#if data.sessions.length === 0}
			<p class="muted">{c.noSessions}</p>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th scope="col">{c.start}</th>
							<th scope="col">{c.duration}</th>
							<th scope="col" class="level">{c.level}</th>
							<th scope="col" class="num">{c.added}</th>
						</tr>
					</thead>
					<tbody>
						{#each data.sessions as s (s.start)}
							<tr>
								<td>
									<a
										class="row-link"
										href={resolve('/vehicles/[id]/charging/[start]', {
											id: data.connection.id,
											start: String(new Date(s.start).getTime())
										})}
										aria-label={format(c.open, { date: dateTime(s.start, data.locale) })}
										>{dateTime(s.start, data.locale)}</a
									>
									{#if s.ongoing}<span class="live">{c.ongoing}</span>{/if}
								</td>
								<td>{duration(minutesBetween(s.start, s.end))}</td>
								<td class="mono level">
									{s.startSocPct !== undefined && s.endSocPct !== undefined
										? `${number(s.startSocPct)} → ${number(s.endSocPct)} %`
										: DASH}
								</td>
								<td class="num mono">{amount(s)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="muted small">
				{#if capacity === null}
					{c.percentNote}
					<a href={resolve('/vehicles/[id]', { id: data.connection.id })}>{c.capacityLink}</a>
				{:else}
					{format(c.energyNote, { capacity: energy(capacity, data.locale) })}
				{/if}
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

	@media (max-width: 480px) {
		.totals dd {
			font-size: 17px;
		}
	}

	.chart-placeholder {
		height: 250px;
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

	/* The whole row opens the session; the link stretches over it. */
	tbody tr {
		position: relative;
	}

	tbody tr:hover {
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}

	/* On phones the level moves to the session page, so the amount stays visible. */
	@media (max-width: 480px) {
		.level {
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
