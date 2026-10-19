<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import StackedBars from '#lib/components/StackedBars.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { costStats, homeCsv, localDay } from '#lib/costs.ts';
	import { energy, euro, localeTag, oneDecimal, wholeNumber } from '#lib/format.ts';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const c = $derived(t.costs);
	const tag = $derived(localeTag(data.locale));
	const capacity = $derived(data.connection.batteryCapacityKwh);
	const money = (value: number) => euro(value, data.locale);

	// Months and price days follow the browser's time zone, so the numbers appear after hydration.
	let mounted = $state(false);
	onMount(() => (mounted = true));
	const stats = $derived(
		mounted
			? costStats(data.sessions, data.trips, data.prices, capacity, data.lossPct, data.range)
			: null
	);
	const priced = $derived(
		data.prices.length > 0 || data.sessions.some((s) => s.costEur !== null || s.priceCt !== null)
	);

	const monthName = (t: number, year = false) =>
		new Date(t).toLocaleDateString(
			tag,
			year ? { month: 'long', year: 'numeric' } : { month: 'long' }
		);

	const heroLabel = $derived.by(() => {
		if (!stats) return '';
		if (data.range === 'month') return format(c.heroMonth, { month: monthName(stats.from) });
		if (data.range === 'year') return c.heroYear;
		return format(c.heroAll, {
			date: new Date(stats.from).toLocaleDateString(tag, { dateStyle: 'long' })
		});
	});

	const compare = $derived.by(() => {
		if (!stats) return '';
		if (stats.previous !== null) {
			const d = new Date(stats.from);
			return format(c.previous, {
				month: monthName(new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime()),
				amount: `${money(stats.previous)} €`
			});
		}
		return stats.perMonth !== null
			? format(c.perMonth, { amount: `${money(stats.perMonth)} €` })
			: '';
	});

	const homeShare = $derived(stats && stats.eur > 0 ? (stats.home / stats.eur) * 100 : 0);

	const series = $derived([
		{ name: c.home, color: 'var(--home)' },
		{ name: c.away, color: 'var(--away)' }
	]);
	const bars = $derived(
		(stats?.months ?? []).map((m) => ({
			label: new Date(m.start).toLocaleDateString(tag, {
				month: (stats?.months.length ?? 0) > 12 ? 'narrow' : 'short'
			}),
			title: monthName(m.start, true),
			values: [m.home, m.away]
		}))
	);

	const purposes = $derived.by(() => {
		const list = stats?.purposes ?? [];
		const top = Math.max(...list.map((p) => p.eur), 0.01);
		return list.map((p) => ({
			key: p.key,
			label: c.purposes[p.key],
			value: money(p.eur),
			share: Math.round((p.eur / top) * 100)
		}));
	});

	// Newest month first; only months with charging at home.
	const homeMonths = $derived(
		(stats?.months ?? [])
			.filter((m) => m.home > 0 || m.homeKwh > 0)
			.reverse()
			.map((m) => ({
				start: m.start,
				label: monthName(m.start, true),
				kwh: wholeNumber(m.homeKwh, data.locale),
				eur: money(m.home)
			}))
	);

	function exportCsv() {
		if (!stats) return;
		const blob = new Blob([homeCsv(stats.sessions, c.csv, tag)], {
			type: 'text/csv;charset=utf-8'
		});
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `${c.csv.file}-${localDay(stats.from)}_${localDay(stats.to)}.csv`;
		link.click();
		URL.revokeObjectURL(link.href);
	}
</script>

<svelte:head>
	<title>{c.title} · {data.connection.label || t.connections.unnamed} · {t.common.appName}</title>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<a class="back" href={resolve('/')}>← {c.back}</a>
	<header class="head">
		<h1>{c.title}</h1>
		<form class="periods" method="GET" aria-label={c.range} data-sveltekit-noscroll>
			{#each data.ranges as r (r)}
				<button name="range" value={r} aria-pressed={r === data.range}>{c.ranges[r]}</button>
			{/each}
		</form>
	</header>

	{#if !priced}
		<p class="card setup">
			{c.setup}
			<a href={resolve('/vehicles/[id]#prices', { id: data.connection.id })}>{c.setupLink} →</a>
		</p>
	{/if}

	{#if !stats}
		<div class="placeholder" aria-hidden="true"></div>
	{:else if stats.sessions.length === 0 || (stats.eur === 0 && stats.unpriced === stats.sessions.length)}
		<p class="card muted">{c.noData}</p>
		{#if stats.unpriced > 0}
			<p class="muted small">
				{stats.unpriced === 1 ? c.unpricedOne : format(c.unpriced, { n: String(stats.unpriced) })}
			</p>
		{/if}
	{:else}
		<section class="card hero" aria-labelledby="total-title">
			<div class="total">
				<h2 id="total-title">{heroLabel}</h2>
				<p class="big">{money(stats.eur)}<span class="unit">€</span></p>
				{#if compare}<p class="muted small">{compare}</p>{/if}
			</div>
			<div class="split">
				<div class="split-bar" aria-hidden="true">
					{#if stats.home > 0}<span class="home" style:width={`${homeShare}%`}></span>{/if}
					{#if stats.away > 0}<span class="away" style:width={`${100 - homeShare}%`}></span>{/if}
				</div>
				<div class="split-legend">
					<span><i class="home"></i>{c.home} <b>{money(stats.home)} €</b></span>
					<span><i class="away"></i>{c.away} <b>{money(stats.away)} €</b></span>
				</div>
			</div>
			<dl class="totals">
				<div>
					<dt>{c.per100}</dt>
					<dd>{stats.per100 === null ? '–' : `${money(stats.per100)} €`}</dd>
				</div>
				<div>
					<dt>{c.grid}</dt>
					<dd>{wholeNumber(stats.gridKwh, data.locale)} kWh</dd>
				</div>
				<div>
					<dt>{c.avgPrice}</dt>
					<dd>{stats.avgCt === null ? '–' : `${oneDecimal(stats.avgCt, data.locale)} ct`}</dd>
				</div>
			</dl>
		</section>

		{#if bars.length > 1}
			<section class="card" aria-labelledby="months-title">
				<h2 id="months-title">{c.perMonthTitle}</h2>
				<StackedBars items={bars} {series} format={money} unit="€" label={c.chartLabel} />
			</section>
		{/if}

		<div class="pair">
			{#if purposes.length > 0}
				<section class="card" aria-labelledby="purpose-title">
					<h2 id="purpose-title">{c.byPurpose}</h2>
					<dl class="band-list">
						{#each purposes as row (row.key)}
							<div class="band">
								<dt>{row.label}</dt>
								<dd class="track" aria-hidden="true">
									<span style:width={`${row.share}%`}></span>
								</dd>
								<dd class="value">{row.value} €</dd>
							</div>
						{/each}
					</dl>
					<p class="muted small">{c.purposeNote}</p>
				</section>
			{/if}

			<section class="card" aria-labelledby="home-title">
				<div class="row-head">
					<h2 id="home-title">{c.homeTitle}</h2>
					{#if homeMonths.length > 0}
						<button type="button" class="link" onclick={exportCsv}>{c.exportCsv}</button>
					{/if}
				</div>
				{#if homeMonths.length === 0}
					<p class="muted small">{data.hasHome ? c.noHome : c.homeUnset}</p>
				{:else}
					<ul class="home-list">
						{#each homeMonths as m (m.start)}
							<li>
								<span>{m.label}</span>
								<span class="muted mono">{m.kwh} kWh</span>
								<span class="mono">{m.eur} €</span>
							</li>
						{/each}
					</ul>
					<p class="muted small">{c.homeNote}</p>
				{/if}
			</section>
		</div>

		{#if stats.unpriced > 0}
			<p class="muted small">
				{stats.unpriced === 1 ? c.unpricedOne : format(c.unpriced, { n: String(stats.unpriced) })}
				<a href={resolve('/vehicles/[id]#prices', { id: data.connection.id })}>{c.setupLink}</a>
			</p>
		{/if}
	{/if}

	<p class="muted small note">
		{#if capacity === null}
			{c.noCapacity}
			<a href={resolve('/vehicles/[id]', { id: data.connection.id })}>{t.charging.capacityLink}</a>
		{:else}
			{format(c.note, {
				capacity: energy(capacity, data.locale),
				loss: wholeNumber(data.lossPct, data.locale)
			})}
		{/if}
	</p>
</main>

<style>
	main {
		max-width: 720px;
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

	h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--muted);
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

	.placeholder {
		height: 420px;
	}

	.setup {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
	}

	.setup a,
	.small a,
	.note a {
		color: var(--accent);
	}

	.hero {
		gap: 16px;
	}

	.total {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.big {
		margin: 0;
		font-size: 44px;
		line-height: 1.1;
		font-weight: 600;
		letter-spacing: -0.02em;
		font-family: var(--font-mono);
	}

	.unit {
		font-size: 20px;
		font-weight: 500;
		color: var(--muted);
		margin-left: 8px;
		font-family: var(--font-sans);
		letter-spacing: 0;
	}

	.split {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.split-bar {
		display: flex;
		gap: 2px;
		height: 10px;
		border-radius: 5px;
		overflow: hidden;
		background: color-mix(in srgb, var(--border) 70%, transparent);
	}

	.split-bar span {
		display: block;
		height: 100%;
	}

	.split-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 18px;
		font-size: 13px;
		color: var(--muted);
	}

	.split-legend span {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.split-legend b {
		color: var(--text);
		font-weight: 600;
		font-family: var(--font-mono);
	}

	.split-legend i {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}

	.home {
		background: var(--home);
	}

	.away {
		background: var(--away);
	}

	.totals {
		margin: 0;
		padding-top: 14px;
		border-top: 1px solid var(--border);
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	.totals div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.totals dt {
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
	}

	.totals dd {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
		font-family: var(--font-mono);
		white-space: nowrap;
	}

	.pair {
		display: grid;
		gap: var(--space);
		align-items: start;
	}

	@media (min-width: 700px) {
		.pair {
			grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
		}
	}

	.band-list {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.band {
		display: grid;
		grid-template-columns: 96px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
	}

	.band dt {
		font-size: 13px;
	}

	.band dd {
		margin: 0;
	}

	.track {
		height: 10px;
		border-radius: 5px;
		background: color-mix(in srgb, var(--border) 70%, transparent);
		overflow: hidden;
	}

	.track span {
		display: block;
		height: 100%;
		border-radius: 5px;
		background: var(--accent);
	}

	.value {
		font-size: 13px;
		text-align: right;
		white-space: nowrap;
		font-family: var(--font-mono);
	}

	.row-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.link {
		font: inherit;
		font-size: 13px;
		border: 0;
		padding: 0;
		background: none;
		color: var(--accent);
		cursor: pointer;
	}

	.link:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: 4px;
	}

	.home-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.home-list li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 84px;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--border);
		font-size: 14px;
	}

	.home-list li:last-child {
		border-bottom: 0;
	}

	.home-list .mono {
		font-family: var(--font-mono);
		text-align: right;
	}

	.small {
		margin: 0;
		font-size: 13px;
	}
</style>
