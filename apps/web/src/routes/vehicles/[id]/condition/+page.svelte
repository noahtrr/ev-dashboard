<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import CarTopView from '#lib/components/CarTopView.svelte';
	import ThresholdLine from '#lib/components/ThresholdLine.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { capitalize, headline, issuesText, partsText } from '#lib/condition.ts';
	import { dateTime, localeTag, oneDecimal, wholeNumber } from '#lib/format.ts';
	import { format, messages, relativeTime } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const c = $derived(t.condition);
	const v = $derived(data.data);
	const ok = $derived(data.condition.known && data.condition.issues.length === 0);
	const has = (kind: string) => data.condition.issues.some((issue) => issue.kind === kind);

	const bar = (kPa: number) => oneDecimal(kPa / 100, data.locale);
	const volts = (value: number) =>
		value.toLocaleString(localeTag(data.locale), {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1
		});
	const parts = (list: string[]) => capitalize(partsText(list, c));

	const openDoors = $derived((v.doors ?? []).filter((d) => d.closed === false).map((d) => d.part));
	const unlockedDoors = $derived(
		(v.doors ?? []).filter((d) => d.locked === false).map((d) => d.part)
	);
	const openWindows = $derived((v.windows ?? []).filter((w) => !w.closed).map((w) => w.part));
	const lowTires = $derived((v.tires ?? []).filter((w) => w.low).map((w) => w.part));

	const rows = $derived.by(() => {
		const list: { label: string; value: string; warn: boolean }[] = [];
		if (v.doorsLocked !== undefined) {
			list.push({
				label: c.locks,
				value: v.doorsLocked
					? c.locked
					: unlockedDoors.length > 0 && unlockedDoors.length < (v.doors?.length ?? 0)
						? format(c.partsUnlocked, { parts: parts(unlockedDoors) })
						: c.unlocked,
				warn: has('unlocked')
			});
		}
		if (v.doorsClosed !== undefined) {
			list.push({
				label: c.doors,
				value: v.doorsClosed
					? c.allClosed
					: openDoors.length > 0
						? format(c.partsOpen, { parts: parts(openDoors) })
						: c.open,
				warn: !v.doorsClosed
			});
		}
		if (v.windowsClosed !== undefined) {
			list.push({
				label: c.windows,
				value: v.windowsClosed
					? c.allClosed
					: openWindows.length > 0
						? format(c.partsOpen, { parts: parts(openWindows) })
						: c.open,
				warn: !v.windowsClosed
			});
		}
		if (v.hoodClosed !== undefined) {
			list.push({ label: c.hood, value: v.hoodClosed ? c.closed : c.open, warn: !v.hoodClosed });
		}
		if (v.tires && v.tires.length > 0) {
			list.push({
				label: c.tires,
				value: lowTires.length > 0 ? format(c.partsLow, { parts: parts(lowTires) }) : c.tiresOk,
				warn: lowTires.length > 0
			});
		}
		return list;
	});

	const tires = $derived(
		(v.tires ?? []).flatMap((w) =>
			w.kPa === undefined ? [] : [{ part: w.part, value: bar(w.kPa), low: w.low === true }]
		)
	);

	const newest = (list: { at?: string }[] | undefined) =>
		(list ?? []).reduce<string | undefined>(
			(max, x) => (x.at && (!max || x.at > max) ? x.at : max),
			undefined
		);
	const when = (value: string | number) => dateTime(new Date(value), data.locale);
	const stamps = $derived(
		[
			newest(v.doors) && format(c.stampDoors, { date: when(newest(v.doors)!) }),
			newest(v.windows) && format(c.stampWindows, { date: when(newest(v.windows)!) }),
			newest(v.tires) && format(c.stampTires, { date: when(newest(v.tires)!) })
		]
			.filter(Boolean)
			.join(', ')
	);

	// Month and year follow the browser's time zone, so these appear after hydration.
	let mounted = $state(false);
	onMount(() => (mounted = true));
	const distance = $derived.by(() => {
		if (!mounted || data.trips.length === 0) return null;
		const now = new Date();
		const month = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
		const year = new Date(now.getFullYear(), 0, 1).getTime();
		const sum = (from: number) =>
			data.trips.filter((trip) => trip.t >= from).reduce((s, trip) => s + trip.km, 0);
		const firstThisYear = data.trips.find((trip) => trip.t >= year)?.t;
		const start = firstThisYear === undefined ? undefined : new Date(firstThisYear);
		const days =
			start === undefined
				? 0
				: Math.max(
						1,
						Math.ceil(
							(now.getTime() -
								new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()) /
								86_400_000
						)
					);
		return {
			monthName: now.toLocaleDateString(localeTag(data.locale), { month: 'long' }),
			month: sum(month),
			year: sum(year),
			perDay: days > 0 ? sum(year) / days : null
		};
	});
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
		{#if data.fetchedAt}
			<span class="muted small">
				{format(c.reported, {
					time: relativeTime(v.reportedAt ?? data.fetchedAt, data.locale)
				})}
			</span>
		{/if}
	</header>

	{#if !data.condition.known && v.odometerKm === undefined}
		<p class="card muted">{c.noData}</p>
	{:else}
		<section class="card hero" aria-labelledby="state-title">
			<div class="state">
				<span
					class="badge"
					class:ok
					class:warn={data.condition.issues.length > 0}
					aria-hidden="true"
				>
					{#if data.condition.issues.length > 0}
						<svg viewBox="0 0 24 24"
							><path d="M12 9v4M12 17h.01" /><path
								d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
							/></svg
						>
					{:else}
						<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
					{/if}
				</span>
				<div>
					<h2 id="state-title">{headline(data.condition, c)}</h2>
					<p class="muted small">{issuesText(data.condition, c)}</p>
				</div>
			</div>
			{#if v.doors || v.windows || v.tires || v.doorsLocked !== undefined}
				<CarTopView
					{openDoors}
					{openWindows}
					hoodOpen={v.hoodClosed === false}
					locked={v.doorsLocked}
					{tires}
					label={[c.carLabel, ...rows.map((r) => `${r.label}: ${r.value}`)].join('. ')}
					unit="bar"
					tooLow={c.tooLow}
				/>
			{/if}
		</section>

		{#if rows.length > 0}
			<section class="card list" aria-label={c.title}>
				<dl>
					{#each rows as row (row.label)}
						<div class="row">
							<dt>{row.label}</dt>
							<dd class:warn={row.warn}>
								{#if row.warn}
									<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
										><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16.5h.01" /></svg
									>
								{/if}
								{row.value}
							</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/if}

		{#if v.battery12vVoltage !== undefined || v.battery12vPct !== undefined}
			<section class="card" aria-labelledby="battery-title">
				<div class="split">
					<h2 id="battery-title" class="label">{c.battery12v}</h2>
					{#if data.voltages.length > 1}<span class="muted small">{c.days}</span>{/if}
				</div>
				<p class="figure">
					{#if v.battery12vVoltage !== undefined}
						{volts(v.battery12vVoltage)}<span class="unit">V</span>
					{/if}
					{#if v.battery12vPct !== undefined}
						<span class="unit">{wholeNumber(v.battery12vPct, data.locale)} %</span>
					{/if}
					<span class="assessment" class:warn={has('battery12vLow')}
						>{has('battery12vLow') ? c.weak : c.good}</span
					>
				</p>
				{#if data.voltages.length > 1}
					<ThresholdLine
						points={data.voltages}
						threshold={12.2}
						format={volts}
						time={when}
						unit="V"
						label={c.chartLabel}
					/>
				{/if}
			</section>
		{/if}

		{#if v.odometerKm !== undefined}
			<section class="card" aria-labelledby="odometer-title">
				<h2 id="odometer-title" class="label">{c.odometer}</h2>
				<p class="figure">{wholeNumber(v.odometerKm, data.locale)}<span class="unit">km</span></p>
				{#if distance}
					<dl class="totals">
						<div>
							<dt>{capitalize(distance.monthName)}</dt>
							<dd>{wholeNumber(distance.month, data.locale)} km</dd>
						</div>
						<div>
							<dt>{c.thisYear}</dt>
							<dd>{wholeNumber(distance.year, data.locale)} km</dd>
						</div>
						<div>
							<dt>{c.perDay}</dt>
							<dd>
								{distance.perDay === null ? '–' : `${wholeNumber(distance.perDay, data.locale)} km`}
							</dd>
						</div>
					</dl>
					<p class="muted small">{c.fromLog}</p>
				{/if}
			</section>
		{/if}

		{#if v.alerts}
			<section class="card" aria-labelledby="alerts-title">
				<h2 id="alerts-title" class="label">{c.alerts}</h2>
				{#if v.alerts.length === 0}
					<p class="muted small">{c.noAlerts}</p>
				{:else}
					<ul class="alerts">
						{#each v.alerts as alert, i (i)}
							<li class={alert.severity}>
								<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
									><path d="M12 9v4M12 17h.01" /><path
										d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
									/></svg
								>
								<div>
									<p class="alert-title">{alert.title}</p>
									<p class="muted small">
										{[
											c.severity[alert.severity],
											alert.at ? format(c.since, { date: when(alert.at) }) : ''
										]
											.filter(Boolean)
											.join(' · ')}
									</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		{#if stamps}
			<p class="muted small note">{c.stamps} {stamps}.</p>
		{/if}
	{/if}
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
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}

	.small {
		margin: 0;
		font-size: 13px;
	}

	.hero {
		gap: 16px;
	}

	.state {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.state h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
	}

	.badge {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 20px;
		color: var(--muted);
		background: color-mix(in srgb, var(--muted) 14%, transparent);
	}

	.badge.ok {
		color: var(--ok);
		background: color-mix(in srgb, var(--ok) 14%, transparent);
	}

	.badge.warn {
		color: var(--warn);
		background: color-mix(in srgb, var(--warn) 16%, transparent);
	}

	.badge svg,
	.icon {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.list {
		padding-top: 6px;
		padding-bottom: 6px;
	}

	.list dl {
		margin: 0;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 44px;
		border-bottom: 1px solid var(--border);
	}

	.row:last-child {
		border-bottom: 0;
	}

	.row dt {
		font-size: 14px;
		color: var(--muted);
	}

	.row dd {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		font-weight: 500;
		text-align: right;
	}

	.row dd .icon {
		width: 14px;
		height: 14px;
	}

	.warn {
		color: var(--warn);
	}

	.split {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.label {
		margin: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--muted);
	}

	.figure {
		margin: 0;
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0 10px;
		font-size: 32px;
		font-weight: 600;
		letter-spacing: -0.02em;
		font-family: var(--font-mono);
	}

	.unit {
		font-size: 15px;
		font-weight: 500;
		color: var(--muted);
		margin-left: 6px;
		font-family: var(--font-sans);
		letter-spacing: 0;
	}

	.assessment {
		margin-left: auto;
		font-size: 13px;
		font-weight: 400;
		color: var(--muted);
		font-family: var(--font-sans);
		letter-spacing: 0;
	}

	.assessment.warn {
		color: var(--warn);
	}

	.totals {
		margin: 0;
		padding-top: 12px;
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
		font-size: 16px;
		font-weight: 600;
		font-family: var(--font-mono);
		white-space: nowrap;
	}

	.alerts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.alerts li {
		display: grid;
		grid-template-columns: 20px minmax(0, 1fr);
		gap: 10px;
		align-items: start;
		color: var(--muted);
	}

	.alerts li.warning,
	.alerts li.critical {
		color: var(--warn);
	}

	.alerts li.critical .icon {
		color: var(--danger);
	}

	.alerts .icon {
		width: 18px;
		height: 18px;
		margin-top: 1px;
	}

	.alert-title {
		margin: 0;
		font-size: 14px;
		font-weight: 500;
		color: var(--text);
	}

	.note {
		line-height: 1.5;
	}
</style>
