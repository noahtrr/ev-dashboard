<script lang="ts">
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import VehicleMap from '#lib/components/VehicleMap.svelte';
	import { format, messages, relativeTime } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const h = $derived(t.home);
	const d = $derived(t.vehicleDetail);
	const vehicle = $derived(data.selected);
	const values = $derived(vehicle?.data ?? null);
	const DASH = '–';

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
			const minutes = values.timeToFullChargeMin;
			const time =
				minutes >= 60
					? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
					: `${minutes} min`;
			parts.push(format(h.timeToFull, { time }));
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

	const number = (value: number) =>
		value.toLocaleString(data.locale === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 0 });
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

		.range {
			align-self: start;
		}
	}
</style>
