<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import AverageBars from '#lib/components/AverageBars.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { consumptionStats, type Band, type Bucket } from '#lib/consumption.ts';
	import { DASH, energy, localeTag, oneDecimal, wholeNumber } from '#lib/format.ts';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const c = $derived(t.consumption);
	const capacity = $derived(data.connection.batteryCapacityKwh);
	// With a known capacity values are kWh, otherwise percentage points of the battery.
	const unit = $derived(capacity === null ? '%/100 km' : 'kWh/100 km');
	const decimal = (value: number) => oneDecimal(value, data.locale);

	// Weeks and months follow the browser's time zone, so the numbers appear after hydration.
	let mounted = $state(false);
	onMount(() => (mounted = true));
	const stats = $derived(
		mounted
			? consumptionStats(data.trips, data.range, capacity === null ? 1 : capacity / 100)
			: null
	);

	const comparison = $derived.by(() => {
		if (!stats?.totals) return '';
		if (data.range === 'all') {
			return format(c.since, {
				date: new Date(stats.from).toLocaleDateString(localeTag(data.locale), {
					dateStyle: 'long'
				})
			});
		}
		if (!stats.previous) return '';
		const period = c.previous[data.range];
		const diff = stats.totals.per100 - stats.previous.per100;
		if (Math.abs(diff) < 0.05) return format(c.same, { period });
		return format(diff < 0 ? c.less : c.more, { value: decimal(Math.abs(diff)), period });
	});

	/** ISO 8601 week number of a local date. */
	function isoWeek(t: number) {
		const d = new Date(t);
		const thursday = new Date(
			d.getFullYear(),
			d.getMonth(),
			d.getDate() + 3 - ((d.getDay() + 6) % 7)
		);
		const firstThursday = new Date(thursday.getFullYear(), 0, 4);
		return (
			1 +
			Math.round(
				((thursday.getTime() - firstThursday.getTime()) / 86_400_000 -
					3 +
					((firstThursday.getDay() + 6) % 7)) /
					7
			)
		);
	}

	const tag = $derived(localeTag(data.locale));
	const bars = $derived(
		(stats?.buckets ?? []).map((b: Bucket) => {
			if (stats!.unit === 'week') {
				const week = format(c.week, { n: String(isoWeek(b.start)) });
				const last = new Date(b.end - 1);
				const range = `${new Date(b.start).toLocaleDateString(tag, { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString(tag, { day: 'numeric', month: 'short' })}`;
				return { label: week, title: `${week} · ${range}`, value: b.per100 };
			}
			const d = new Date(b.start);
			return {
				label: d.toLocaleDateString(tag, { month: 'narrow' }),
				title: d.toLocaleDateString(tag, { month: 'long', year: 'numeric' }),
				value: b.per100
			};
		})
	);

	// Bars relative to the largest value of their group.
	const rows = (bands: Band[], labels: Record<string, string>) => {
		const top = Math.max(...bands.map((b) => b.per100), 0.1);
		return bands.map((b) => ({
			key: b.key,
			label: labels[b.key],
			value: decimal(b.per100),
			share: Math.round((b.per100 / top) * 100)
		}));
	};
	const temperatures = $derived(rows(stats?.byTemperature ?? [], c.temperatures));
	const lengths = $derived(rows(stats?.byLength ?? [], c.lengths));
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

	{#if !stats}
		<div class="placeholder" aria-hidden="true"></div>
	{:else if !stats.totals}
		<p class="card muted">{c.noData}</p>
	{:else}
		<section class="card hero" aria-labelledby="average-title">
			<div class="average">
				<h2 id="average-title">{c.average}</h2>
				<p class="big">{decimal(stats.totals.per100)}<span class="unit">{unit}</span></p>
				{#if comparison}<p class="muted small">{comparison}</p>{/if}
			</div>
			<dl class="totals">
				<div>
					<dt>{c.distance}</dt>
					<dd>{wholeNumber(stats.totals.km, data.locale)} km</dd>
				</div>
				<div>
					<dt>{capacity === null ? c.used : c.energy}</dt>
					<dd>
						{capacity === null
							? `${wholeNumber(stats.totals.used, data.locale)} %`
							: `${wholeNumber(stats.totals.used, data.locale)} kWh`}
					</dd>
				</div>
				<div>
					<dt>{c.fullRange}</dt>
					<dd>
						{capacity === null
							? DASH
							: `${wholeNumber((capacity / stats.totals.per100) * 100, data.locale)} km`}
					</dd>
				</div>
			</dl>
		</section>

		<section class="card" aria-labelledby="chart-title">
			<h2 id="chart-title">{stats.unit === 'week' ? c.perWeek : c.perMonth}</h2>
			<AverageBars
				items={bars}
				average={stats.totals.per100}
				format={decimal}
				{unit}
				label={c.chartLabel}
			/>
		</section>

		<div class="bands">
			{#each [{ id: 'temperature', title: c.byTemperature, list: temperatures }, { id: 'length', title: c.byLength, list: lengths }] as group (group.id)}
				{#if group.list.length > 0}
					<section class="card" aria-labelledby={`${group.id}-title`}>
						<h2 id={`${group.id}-title`}>{group.title}</h2>
						<dl class="band-list">
							{#each group.list as row (row.key)}
								<div class="band">
									<dt>{row.label}</dt>
									<dd class="track" aria-hidden="true">
										<span style:width={`${row.share}%`}></span>
									</dd>
									<dd class="value">{row.value}</dd>
								</div>
							{/each}
						</dl>
					</section>
				{/if}
			{/each}
		</div>
	{/if}

	<p class="muted small note">
		{#if capacity === null}
			{c.percentNote}
			<a href={resolve('/vehicles/[id]', { id: data.connection.id })}>{t.charging.capacityLink}</a>
		{:else}
			{format(c.energyNote, { capacity: energy(capacity, data.locale) })}
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

	.hero {
		gap: 16px;
	}

	.average {
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
		font-size: 16px;
		font-weight: 500;
		color: var(--muted);
		margin-left: 8px;
		font-family: var(--font-sans);
		letter-spacing: 0;
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

	.bands {
		display: grid;
		gap: var(--space);
	}

	@media (min-width: 700px) {
		.bands {
			grid-template-columns: repeat(2, minmax(0, 1fr));
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
		grid-template-columns: 84px minmax(0, 1fr) 44px;
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
		font-family: var(--font-mono);
	}

	.small {
		margin: 0;
		font-size: 13px;
	}

	.note a {
		color: var(--accent);
	}
</style>
