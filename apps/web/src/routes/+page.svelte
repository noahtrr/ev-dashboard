<script lang="ts">
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import VehicleMap from '#lib/components/VehicleMap.svelte';
	import {
		clockTime,
		DASH,
		duration,
		energy,
		kilometres,
		minutesBetween,
		oneDecimal,
		wholeNumber
	} from '#lib/format.ts';
	import { capitalize, headline, partsText } from '#lib/condition.ts';
	import { format, messages, relativeTime } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const h = $derived(t.home);
	const d = $derived(t.vehicleDetail);
	const c = $derived(t.charging);
	const tr = $derived(t.trips);
	const vehicle = $derived(data.selected);
	const values = $derived(vehicle?.data ?? null);
	const session = $derived(data.lastSession);

	// Ticks so relative times ("5 minutes ago") stay correct while the page is open.
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});

	const ago = (date: Date | string) => relativeTime(date, data.locale, now);
	const isStale = (date: Date | string | undefined | null) =>
		!date || now - new Date(date).getTime() > data.staleAfterMs;

	const reportedAt = $derived(values?.reportedAt ?? vehicle?.fetchedAt ?? null);
	const hasPosition = $derived(values?.latitude !== undefined && values?.longitude !== undefined);

	const socPct = $derived(values?.stateOfChargePct);
	// Ring geometry for the state of charge.
	const RADIUS = 52;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
	const ringOffset = $derived(CIRCUMFERENCE * (1 - Math.min(Math.max(socPct ?? 0, 0), 100) / 100));

	const chargingLine = $derived.by(() => {
		if (!values) return '';
		const parts: string[] = [];
		if (values.chargingState) parts.push(d.chargingStates[values.chargingState]);
		else if (values.pluggedIn !== undefined) parts.push(values.pluggedIn ? d.plugged : d.unplugged);
		if (values.chargingState === 'charging' && values.timeToFullChargeMin !== undefined) {
			parts.push(format(h.timeToFull, { time: duration(values.timeToFullChargeMin) }));
		}
		return parts.join(' · ');
	});

	// The street address is fetched after the page so a slow lookup never delays it.
	let address = $state<string | null>(null);
	$effect(() => {
		address = null;
		if (!data.geocoding || !vehicle || !hasPosition) return;
		const controller = new AbortController();
		fetch(`/api/vehicles/${encodeURIComponent(vehicle.id)}/address`, {
			signal: controller.signal
		})
			.then((res) => (res.ok ? res.json() : null))
			.then((body: { address?: unknown } | null) => {
				if (typeof body?.address === 'string') address = body.address;
			})
			.catch(() => {});
		return () => controller.abort();
	});

	const number = (value: number) => wholeNumber(value, data.locale);

	const trip = $derived(data.lastTrip);
	// kWh/100 km with a known capacity, otherwise the percentage points used.
	const tripUsage = $derived.by(() => {
		if (!trip) return '';
		if (trip.usedKwh !== undefined && trip.distanceKm >= 1) {
			return `${oneDecimal((trip.usedKwh / trip.distanceKm) * 100, data.locale)} kWh/100 km`;
		}
		return trip.usedPct === undefined ? '' : `−${number(trip.usedPct)} %`;
	});

	// Up to four condition values the vehicle reports, most telling first.
	const conditionItems = $derived.by(() => {
		const v = values;
		const cd = t.condition;
		if (!v) return [];
		const open = (list: { part: string; closed?: boolean }[] | undefined) =>
			(list ?? []).filter((x) => x.closed === false).map((x) => x.part);
		const items: { label: string; value: string; warn: boolean }[] = [];
		if (v.doorsClosed === false) {
			const parts = open(v.doors);
			items.push({
				label: cd.doors,
				value: parts.length
					? format(cd.partsOpen, { parts: capitalize(partsText(parts, cd)) })
					: cd.open,
				warn: true
			});
		} else if (v.doorsLocked !== undefined) {
			const warn = !v.doorsLocked && v.ignitionOn !== true;
			items.push({ label: cd.doors, value: v.doorsLocked ? cd.locked : cd.unlocked, warn });
		}
		if (v.windowsClosed !== undefined) {
			const parts = open(v.windows);
			items.push({
				label: cd.windows,
				value: v.windowsClosed
					? cd.allClosed
					: parts.length
						? format(cd.partsOpen, { parts: capitalize(partsText(parts, cd)) })
						: cd.open,
				warn: !v.windowsClosed
			});
		}
		const pressures = (v.tires ?? []).flatMap((x) => (x.kPa === undefined ? [] : [x.kPa]));
		if (pressures.length > 0) {
			const low = (v.tires ?? []).filter((x) => x.low).map((x) => x.part);
			const lo = oneDecimal(Math.min(...pressures) / 100, data.locale);
			const hi = oneDecimal(Math.max(...pressures) / 100, data.locale);
			items.push({
				label: cd.tires,
				value: low.length
					? format(cd.partsLow, { parts: capitalize(partsText(low, cd)) })
					: `${lo === hi ? lo : `${lo}–${hi}`} bar`,
				warn: low.length > 0
			});
		}
		if (v.battery12vVoltage !== undefined) {
			const warn = vehicle?.condition.issues.some((i) => i.kind === 'battery12vLow') ?? false;
			items.push({
				label: cd.battery12v,
				value: `${oneDecimal(v.battery12vVoltage, data.locale)} V`,
				warn
			});
		}
		if (v.hoodClosed === false) items.push({ label: cd.hood, value: cd.open, warn: true });
		if (v.odometerKm !== undefined) {
			items.push({ label: cd.odometer, value: `${number(v.odometerKm)} km`, warn: false });
		}
		return items.slice(0, 4);
	});

	const sessionLevels = $derived(
		session?.startSocPct !== undefined && session.endSocPct !== undefined
			? `${number(session.startSocPct)} → ${number(session.endSocPct)} %`
			: ''
	);
</script>

<svelte:head>
	<title>{t.common.appName}</title>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	{#if !vehicle}
		<section class="card empty">
			<h1>{h.noVehicleTitle}</h1>
			<p class="muted">{h.noVehicleText}</p>
			<a class="btn btn-primary" href={resolve('/account')}>{h.toAccount}</a>
		</section>
	{:else}
		<header class="head">
			{#if data.vehicles.length > 1}
				<form class="switcher" method="GET" aria-label={h.vehicles} data-sveltekit-noscroll>
					{#each data.vehicles as v (v.id)}
						<button name="v" value={v.id} aria-pressed={v.id === vehicle.id}
							>{v.label || t.connections.unnamed}</button
						>
					{/each}
				</form>
			{:else}
				<h1>{vehicle.label || t.connections.unnamed}</h1>
			{/if}
			<a class="details" href={resolve('/vehicles/[id]', { id: vehicle.id })}>{h.details} →</a>
		</header>

		{#if vehicle.status === 'reauth'}
			<p class="notice notice-error">{h.reauth}</p>
		{/if}

		{#if !values}
			<p class="card muted">{h.noData}</p>
		{:else}
			<section class="module location" aria-labelledby="location-title">
				<div class="map-wrap">
					{#if hasPosition}
						<VehicleMap
							latitude={values.latitude!}
							longitude={values.longitude!}
							sources={data.map}
							label={h.mapLabel}
							strings={h.map}
						/>
					{:else}
						<p class="muted no-position">{h.noPosition}</p>
					{/if}
				</div>
				<div class="module-body">
					<h2 id="location-title" class="title">{h.location}</h2>
					{#if hasPosition}
						<p class="address">
							{address ?? `${values.latitude!.toFixed(5)}, ${values.longitude!.toFixed(5)}`}
						</p>
					{/if}
					{#if values.positionAt}
						<p class="stamp" class:stale={isStale(values.positionAt)}>
							{format(h.positionTime, { time: ago(values.positionAt) })}
							{#if isStale(values.positionAt)}<span class="badge">{h.stale}</span>{/if}
						</p>
					{/if}
				</div>
			</section>

			<section class="module range" aria-labelledby="range-title">
				<div class="module-body range-body">
					<div class="range-text">
						<h2 id="range-title" class="title">{h.range}</h2>
						<p class="big">
							{#if values.rangeKm !== undefined}
								{number(values.rangeKm)}<span class="unit">km</span>
							{:else}
								{DASH}
							{/if}
						</p>
						{#if chargingLine}
							<p class="context" class:charging={values.chargingState === 'charging'}>
								{chargingLine}
							</p>
						{/if}
					</div>
					<figure
						class="ring"
						aria-label={`${h.soc}: ${socPct === undefined ? DASH : `${number(socPct)} %`}`}
					>
						<svg viewBox="0 0 120 120" aria-hidden="true">
							<circle class="track" cx="60" cy="60" r={RADIUS} />
							{#if socPct !== undefined}
								<circle
									class="fill"
									cx="60"
									cy="60"
									r={RADIUS}
									stroke-dasharray={CIRCUMFERENCE}
									stroke-dashoffset={ringOffset}
								/>
							{/if}
						</svg>
						<figcaption>
							<span class="soc">{socPct === undefined ? DASH : number(socPct)}<small>%</small></span
							>
							<span class="soc-label">{h.soc}</span>
						</figcaption>
					</figure>
				</div>
				{#if reportedAt}
					<p class="stamp module-foot" class:stale={isStale(reportedAt)}>
						{format(h.updated, { time: ago(reportedAt) })}
						{#if isStale(reportedAt)}<span class="badge">{h.stale}</span>{/if}
					</p>
				{/if}
			</section>

			<section class="module charging-module" aria-labelledby="charging-title">
				<div class="module-body">
					<h2 id="charging-title" class="title">{c.title}</h2>
					{#if session}
						<p class="big small-big" class:live={session.ongoing}>
							{#if session.addedKwh !== undefined}
								+{energy(session.addedKwh, data.locale)}<span class="unit">kWh</span>
							{:else}
								{session.addedPct === undefined ? DASH : `+${number(session.addedPct)}`}<span
									class="unit">%</span
								>
							{/if}
						</p>
						<p class="context" class:charging={session.ongoing}>
							{[
								session.ongoing
									? format(c.since, { time: clockTime(session.start, data.locale) })
									: sessionLevels,
								duration(minutesBetween(session.start, session.end))
							]
								.filter(Boolean)
								.join(' · ')}
						</p>
					{:else}
						<p class="muted">{c.none}</p>
					{/if}
				</div>
				<p class="stamp module-foot foot-row">
					{#if session && !session.ongoing}
						<span>{format(c.last, { time: ago(session.end) })}</span>
					{/if}
					<span class="links">
						<a class="details" href={resolve('/vehicles/[id]/charging', { id: vehicle.id })}
							>{c.history} →</a
						>
						<a class="details" href={resolve('/vehicles/[id]/costs', { id: vehicle.id })}
							>{t.costs.link} →</a
						>
					</span>
				</p>
			</section>

			<section class="module trips-module" aria-labelledby="trips-title">
				<div class="module-body">
					<h2 id="trips-title" class="title">{tr.title}</h2>
					{#if trip}
						<p class="big small-big" class:live={trip.ongoing}>
							{kilometres(trip.distanceKm, data.locale)}<span class="unit">km</span>
						</p>
						<p class="context" class:charging={trip.ongoing}>
							{[
								trip.ongoing
									? format(tr.since, { time: clockTime(trip.start, data.locale) })
									: `${clockTime(trip.start, data.locale)} – ${clockTime(trip.end, data.locale)}`,
								duration(minutesBetween(trip.start, trip.end)),
								tripUsage
							]
								.filter(Boolean)
								.join(' · ')}
						</p>
					{:else}
						<p class="muted">{tr.none}</p>
					{/if}
				</div>
				<p class="stamp module-foot foot-row">
					{#if trip && !trip.ongoing}
						<span>{format(tr.last, { time: ago(trip.end) })}</span>
					{/if}
					<span class="links">
						<a class="details" href={resolve('/vehicles/[id]/trips', { id: vehicle.id })}
							>{tr.history} →</a
						>
						<a class="details" href={resolve('/vehicles/[id]/consumption', { id: vehicle.id })}
							>{t.consumption.link} →</a
						>
					</span>
				</p>
			</section>
			<section class="module condition-module" aria-labelledby="condition-title">
				<div class="module-body">
					<div class="condition-head">
						<h2 id="condition-title" class="title">{t.condition.title}</h2>
						{#if vehicle.condition.known}
							<span class="pill" class:warn={vehicle.condition.issues.length > 0}>
								<span class="pill-dot" aria-hidden="true"></span>{headline(
									vehicle.condition,
									t.condition
								)}
							</span>
						{/if}
					</div>
					{#if conditionItems.length > 0}
						<dl class="condition-grid">
							{#each conditionItems as item (item.label)}
								<div>
									<dt>{item.label}</dt>
									<dd class:warn={item.warn}>{item.value}</dd>
								</div>
							{/each}
						</dl>
					{:else}
						<p class="muted">{t.condition.noData}</p>
					{/if}
				</div>
				<p class="stamp module-foot foot-row">
					<a class="details" href={resolve('/vehicles/[id]/condition', { id: vehicle.id })}
						>{t.condition.link} →</a
					>
				</p>
			</section>
		{/if}
	{/if}
</main>

<style>
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 8px var(--space) 48px;
		display: grid;
		gap: var(--space);
		align-content: start;
	}

	.empty {
		max-width: 480px;
		justify-self: center;
		margin-top: 10vh;
	}

	.empty .btn {
		align-self: flex-start;
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
		font-size: 24px;
		font-weight: 600;
	}

	.details {
		color: var(--muted);
		text-decoration: none;
		font-size: 14px;
	}

	.details:hover,
	.details:focus-visible {
		color: var(--accent);
	}

	.switcher {
		display: flex;
		gap: 4px;
		padding: 4px;
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow-x: auto;
		max-width: 100%;
	}

	.switcher button {
		font: inherit;
		border: 0;
		background: transparent;
		cursor: pointer;
		padding: 8px 14px;
		border-radius: 10px;
		color: var(--muted);
		text-decoration: none;
		white-space: nowrap;
		font-size: 14px;
	}

	.switcher button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--text);
	}

	.switcher button:focus-visible,
	.details:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
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

	.module-foot {
		padding: 0 20px 18px;
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
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.stamp.stale {
		color: var(--warn);
	}

	.badge {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--warn) 50%, transparent);
	}

	.range-body {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.range-text {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.big {
		margin: 0;
		font-size: 56px;
		line-height: 1;
		font-weight: 600;
		letter-spacing: -0.02em;
		font-family: var(--font-mono);
	}

	.unit {
		font-size: 20px;
		font-weight: 500;
		color: var(--muted);
		margin-left: 6px;
		font-family: var(--font-sans);
	}

	.context {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
	}

	.context.charging {
		color: var(--accent);
	}

	.small-big {
		font-size: 40px;
	}

	.small-big.live {
		color: var(--accent);
	}

	.foot-row {
		flex-wrap: wrap;
	}

	.foot-row > .details,
	.links {
		margin-left: auto;
	}

	.links {
		display: flex;
		gap: 16px;
	}

	.condition-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.pill {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-weight: 500;
		color: var(--ok);
	}

	.pill.warn {
		color: var(--warn);
	}

	.pill-dot {
		width: 6px;
		height: 6px;
		border-radius: 3px;
		background: currentColor;
	}

	.condition-grid {
		margin: 8px 0 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px 16px;
	}

	.condition-grid div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.condition-grid dt {
		font-size: 12px;
		color: var(--muted);
	}

	.condition-grid dd {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.condition-grid dd.warn {
		color: var(--warn);
	}

	.ring {
		position: relative;
		margin: 0;
		width: 120px;
		height: 120px;
		flex: none;
	}

	.ring svg {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}

	.ring circle {
		fill: none;
		stroke-width: 8;
	}

	.track {
		stroke: var(--border);
	}

	.fill {
		stroke: var(--accent);
		stroke-linecap: round;
		transition: stroke-dashoffset 600ms ease;
	}

	figcaption {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
	}

	.soc {
		font-family: var(--font-mono);
		font-size: 26px;
		font-weight: 600;
	}

	.soc small {
		font-size: 14px;
		color: var(--muted);
		margin-left: 2px;
	}

	.soc-label {
		font-size: 11px;
		color: var(--muted);
	}

	@media (min-width: 800px) {
		main {
			grid-template-columns: 3fr 2fr;
		}

		.head,
		.notice,
		main > .card {
			grid-column: 1 / -1;
		}

		.map-wrap {
			height: 360px;
		}

		.location {
			grid-row: span 4;
		}

		/* The map grows with the modules beside it. */
		.location .map-wrap {
			flex: 1;
			min-height: 360px;
		}

		.range,
		.charging-module,
		.trips-module,
		.condition-module {
			align-self: start;
		}
	}
</style>
