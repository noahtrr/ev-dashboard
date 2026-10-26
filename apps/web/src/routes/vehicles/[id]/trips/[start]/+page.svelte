<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import VehicleMap from '#lib/components/VehicleMap.svelte';
	import {
		DASH,
		clockTime,
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

	let { data, form }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const c = $derived(t.trips);
	const l = $derived(t.logbook);
	const h = $derived(t.home);
	const trip = $derived(data.trip);
	const x = $derived(data.details);
	const number = (value: number) => wholeNumber(value, data.locale);
	const capacity = $derived(data.connection.batteryCapacityKwh);
	const hasStart = $derived(trip.startLatitude !== undefined && trip.startLongitude !== undefined);
	const hasEnd = $derived(trip.endLatitude !== undefined && trip.endLongitude !== undefined);
	const coordinates = (lat: number, lon: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

	const used = $derived(
		trip.usedKwh !== undefined
			? { value: energy(trip.usedKwh, data.locale), unit: 'kWh' }
			: { value: trip.usedPct === undefined ? DASH : number(trip.usedPct), unit: '%' }
	);

	// Edits since the last save; a successful save shows "Saved" until the next change.
	let dirty = $state(false);
	let busy = $state(false);
	const classify = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
			dirty = false;
		};
	};

	// Only the values the vehicle reported are listed.
	const rows = $derived(
		[
			[c.start, dateTime(trip.start, data.locale)],
			[c.end, trip.ongoing ? c.ongoing : dateTime(trip.end, data.locale)],
			[
				c.level,
				trip.startSocPct !== undefined && trip.endSocPct !== undefined
					? `${number(trip.startSocPct)} → ${number(trip.endSocPct)} %`
					: undefined
			],
			[
				c.range,
				x.startRangeKm !== undefined && x.endRangeKm !== undefined
					? `${number(x.startRangeKm)} → ${number(x.endRangeKm)} km`
					: undefined
			],
			[c.speed, x.averageKmh === undefined ? undefined : `${number(x.averageKmh)} km/h`],
			[
				c.odometer,
				trip.startOdometerKm !== undefined && trip.endOdometerKm !== undefined
					? `${number(trip.startOdometerKm)} → ${number(trip.endOdometerKm)} km`
					: undefined
			],
			[
				c.outsideTemp,
				x.minOutsideTempC === undefined || x.maxOutsideTempC === undefined
					? undefined
					: x.minOutsideTempC === x.maxOutsideTempC
						? `${number(x.minOutsideTempC)} °C`
						: `${number(x.minOutsideTempC)} – ${number(x.maxOutsideTempC)} °C`
			],
			// Trips whose snapshots are gone show only what the trip log kept.
			[c.samples, x.samples ? String(x.samples) : undefined]
		].filter((row): row is [string, string] => row[1] !== undefined)
	);
</script>

<svelte:head>
	<title>{c.trip} · {data.connection.label || t.connections.unnamed} · {t.common.appName}</title>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<a class="back" href={resolve('/vehicles/[id]/trips', { id: data.connection.id })}
		>← {c.backToList}</a
	>
	<header class="head">
		<h1>{c.trip}</h1>
		<p class="muted when">
			{dateTime(trip.start, data.locale)}
			{#if trip.ongoing}<span class="live">{c.ongoing}</span>{/if}
		</p>
	</header>

	<dl class="totals">
		<div>
			<dt>{c.distance}</dt>
			<dd>{kilometres(trip.distanceKm, data.locale)}<span class="unit">km</span></dd>
		</div>
		<div>
			<dt>{c.duration}</dt>
			<dd>{duration(minutesBetween(trip.start, trip.end))}</dd>
		</div>
		<div>
			<dt>{c.used}</dt>
			<dd>{used.value}<span class="unit">{used.unit}</span></dd>
		</div>
		<div>
			<dt>{c.consumption}</dt>
			<dd>
				{#if x.consumptionKwh100 !== undefined}
					{oneDecimal(x.consumptionKwh100, data.locale)}<span class="unit">kWh/100 km</span>
				{:else}
					{DASH}
				{/if}
			</dd>
		</div>
	</dl>

	<section class="card classify" aria-labelledby="purpose-title">
		<h2 id="purpose-title" class="title">{l.purpose}</h2>
		{#if data.entry}
			<form method="POST" action="?/classify" use:enhance={classify} oninput={() => (dirty = true)}>
				<input type="hidden" name="id" value={data.entry.id} />
				<div class="segments" role="radiogroup" aria-labelledby="purpose-title">
					{#each ['private', 'business'] as const as purpose (purpose)}
						<label class="segment {purpose}">
							<input
								type="radio"
								name="purpose"
								value={purpose}
								checked={data.entry.purpose === purpose}
							/>
							<span class="dot"></span>{l.purposes[purpose]}
						</label>
					{/each}
				</div>
				<label class="field">
					{l.note}
					<textarea
						name="note"
						rows="2"
						maxlength={data.noteMaxLength}
						placeholder={l.notePlaceholder}>{data.entry.note ?? ''}</textarea
					>
				</label>
				{#if form?.classifyError}
					<p class="notice notice-error" role="alert">
						{format(l.noteTooLong, { n: String(data.noteMaxLength) })}
					</p>
				{/if}
				<button class="btn btn-primary" disabled={busy}>
					{form?.classified && !dirty ? l.saved : l.save}
				</button>
			</form>
		{:else}
			<p class="muted small">{l.notLogged}</p>
		{/if}
	</section>

	<div class="grid">
		<section class="module" aria-labelledby="route-title">
			<div class="map-wrap">
				{#if hasEnd}
					<VehicleMap
						latitude={trip.endLatitude!}
						longitude={trip.endLongitude!}
						path={x.path}
						sources={data.map}
						label={c.mapLabel}
						strings={h.map}
					/>
				{:else}
					<p class="muted no-position">{c.noPosition}</p>
				{/if}
			</div>
			<div class="module-body">
				<h2 id="route-title" class="title">{c.route}</h2>
				<dl class="places">
					<div>
						<dt>{c.from} · {clockTime(trip.start, data.locale)}</dt>
						<dd>
							{#if hasStart}
								{@const fallback = coordinates(trip.startLatitude!, trip.startLongitude!)}
								{#await data.startAddress}
									{fallback}
								{:then address}
									{address ?? fallback}
								{/await}
							{:else}
								{DASH}
							{/if}
						</dd>
					</div>
					<div class="end">
						<dt>{trip.ongoing ? c.to : `${c.to} · ${clockTime(trip.end, data.locale)}`}</dt>
						<dd>
							{#if hasEnd}
								{@const fallback = coordinates(trip.endLatitude!, trip.endLongitude!)}
								{#await data.endAddress}
									{fallback}
								{:then address}
									{address ?? fallback}
								{/await}
							{:else}
								{DASH}
							{/if}
						</dd>
					</div>
				</dl>
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
			<p class="muted small">
				{#if trip.gap}{c.gapNote}{:else}{c.accuracyNote}{/if}
				{#if trip.usedKwh !== undefined && capacity !== null}
					{format(t.charging.energyNote, { capacity: energy(capacity, data.locale) })}
				{/if}
			</p>
		</section>
	</div>
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
		font-size: 14px;
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

	.places {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.places div {
		display: grid;
		grid-template-columns: 14px 1fr;
		column-gap: 12px;
		align-items: baseline;
	}

	.places dt {
		grid-column: 2;
		font-size: 13px;
		color: var(--muted);
	}

	.places dd {
		grid-column: 2;
		margin: 0;
		font-size: 16px;
		font-weight: 500;
	}

	.places div::before {
		content: '';
		grid-row: 1 / span 2;
		align-self: start;
		margin-top: 4px;
		width: 12px;
		height: 12px;
		border-radius: 999px;
		border: 3px solid var(--accent);
		background: var(--surface);
	}

	.places div.end::before {
		background: var(--accent);
	}

	.classify form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 4px;
	}

	.segments {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 4px;
		padding: 4px;
		border-radius: 14px;
		background: var(--bg);
		border: 1px solid var(--border);
	}

	.segment {
		position: relative;
		min-height: 44px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-size: 15px;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
	}

	.segment input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}

	.segment:has(input:checked) {
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 0 0 1px var(--border);
	}

	.segment:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.segment .dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: var(--accent);
	}

	.segment.private .dot {
		background: var(--private);
	}

	.classify textarea {
		font: inherit;
		font-size: 15px;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 12px 14px;
		resize: vertical;
	}

	.classify textarea:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.classify .btn {
		align-self: flex-start;
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

	.small {
		margin: 0;
		font-size: 13px;
	}
</style>
