<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import { localDay, PRICE_KINDS } from '#lib/costs.ts';
	import { oneDecimal } from '#lib/format.ts';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const d = $derived(t.vehicleDetail);
	const localeTag = $derived(data.locale === 'de' ? 'de-DE' : 'en-GB');
	const values = $derived(data.snapshot?.data ?? {});

	const DASH = '–';
	const num = (value: number | undefined, digits: number, unit: string) =>
		value === undefined
			? DASH
			: `${value.toLocaleString(localeTag, { maximumFractionDigits: digits })} ${unit}`;
	const dateTime = (value: Date | string | undefined) =>
		value
			? new Date(value).toLocaleString(localeTag, { dateStyle: 'medium', timeStyle: 'short' })
			: DASH;

	const k = $derived(t.costs);
	// "Valid from" defaults to today in the viewer's time zone.
	let today = $state('');
	onMount(() => (today = localDay(Date.now())));
	const dayText = (day: string) =>
		new Date(`${day}T12:00:00`).toLocaleDateString(localeTag, { dateStyle: 'medium' });
	const priceLists = $derived(
		PRICE_KINDS.map((kind) => ({
			kind,
			prices: [...data.costs.prices.filter((p) => p.kind === kind)].reverse()
		}))
	);
	const keep =
		() =>
		({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) =>
			update({ reset: false });

	const rows = $derived.by(() => {
		const v = values;
		const position =
			v.latitude !== undefined && v.longitude !== undefined
				? `${v.latitude.toFixed(5)}, ${v.longitude.toFixed(5)}`
				: DASH;
		const plug = v.pluggedIn === undefined ? DASH : v.pluggedIn ? d.plugged : d.unplugged;
		const charging = v.chargingState
			? d.chargingStates[v.chargingState]
			: (v.chargingStatusRaw ?? DASH);
		const yesNo = (value: boolean | undefined, yes: string, no: string) =>
			value === undefined ? DASH : value ? yes : no;
		// The estimate is only meaningful while charging; vehicles keep reporting the last one.
		const timeToFull =
			v.chargingState === 'charging' ? num(v.timeToFullChargeMin, 0, d.minutes) : DASH;
		const battery12v = [
			v.battery12vVoltage !== undefined ? num(v.battery12vVoltage, 2, 'V') : '',
			v.battery12vPct !== undefined ? num(v.battery12vPct, 0, '%') : ''
		]
			.filter(Boolean)
			.join(' · ');
		return [
			{ label: d.soc, value: num(v.stateOfChargePct, 0, '%'), big: true },
			{ label: d.range, value: num(v.rangeKm, 0, 'km'), big: true },
			{ label: d.plug, value: plug },
			{ label: d.charging, value: charging },
			{ label: d.timeToFull, value: timeToFull },
			{ label: d.ignition, value: yesNo(v.ignitionOn, d.on, d.off) },
			{ label: d.locks, value: yesNo(v.doorsLocked, d.locked, d.unlocked) },
			{ label: d.doors, value: yesNo(v.doorsClosed, d.closed, d.open) },
			{ label: d.windows, value: yesNo(v.windowsClosed, d.closed, d.open) },
			{ label: d.odometer, value: num(v.odometerKm, 0, 'km') },
			{ label: d.outsideTemp, value: num(v.outsideTempC, 1, '°C') },
			{ label: d.battery12v, value: battery12v || DASH },
			{ label: d.alerts, value: v.alertCount === undefined ? DASH : String(v.alertCount) },
			{ label: d.position, value: position, mono: true },
			{ label: d.positionAt, value: dateTime(v.positionAt) },
			{ label: d.reportedAt, value: dateTime(v.reportedAt) }
		];
	});
</script>

<svelte:head>
	<title>{data.connection.label || t.connections.unnamed} · {t.common.appName}</title>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<a class="back" href={resolve('/account')}>← {d.back}</a>
	<header class="head">
		<h1>{data.connection.label || t.connections.unnamed}</h1>
		{#if data.connection.status === 'active'}
			<span class="status"
				><span class="dot" aria-hidden="true"></span>{t.connections.statusActive}</span
			>
		{:else}
			<span class="status status-warn">
				<span class="dot" aria-hidden="true"></span>{t.connections.statusReauth}
			</span>
		{/if}
	</header>

	<section class="card" aria-labelledby="latest">
		<h2 id="latest">{d.latest}</h2>
		{#if data.snapshot}
			<span class="muted small">
				{format(d.fetchedAt, { date: dateTime(data.snapshot.fetchedAt) })}
			</span>
			<dl class="values">
				{#each rows as row (row.label)}
					<div class="value" class:big={row.big}>
						<dt>{row.label}</dt>
						<dd class:mono={row.mono}>{row.value}</dd>
					</div>
				{/each}
			</dl>
		{:else}
			<p class="muted">{d.noData}</p>
		{/if}
	</section>

	<section class="card" aria-labelledby="battery">
		<h2 id="battery">{d.capacityTitle}</h2>
		<p class="muted small">{d.capacityIntro}</p>
		<form
			class="capacity"
			method="POST"
			action="?/capacity"
			use:enhance={() =>
				({ update }) =>
					update({ reset: false })}
		>
			<label class="field">
				{d.capacityLabel}
				<span class="with-unit">
					<input
						name="capacity"
						inputmode="decimal"
						autocomplete="off"
						placeholder="77"
						value={data.connection.batteryCapacityKwh?.toLocaleString(localeTag) ?? ''}
						aria-invalid={form?.capacityError ? 'true' : undefined}
						aria-describedby="capacity-hint"
					/>
					<span class="unit">kWh</span>
				</span>
			</label>
			<button class="btn" type="submit">{d.capacitySave}</button>
		</form>
		<p id="capacity-hint" class="muted small">{d.capacityHint}</p>
		{#if form?.capacityError}
			<p class="notice notice-error" role="alert">{d.capacityInvalid}</p>
		{:else if form?.capacitySaved}
			<p class="notice notice-ok" role="status">{d.capacitySaved}</p>
		{/if}
	</section>

	<section class="card" id="prices" aria-labelledby="prices-title">
		<h2 id="prices-title">{k.settingsTitle}</h2>
		<p class="muted small">{k.settingsIntro}</p>
		{#each priceLists as list (list.kind)}
			<div class="price-kind">
				<h3>{k.kinds[list.kind]}</h3>
				{#if list.prices.length === 0}
					<p class="muted small">{k.noPrice}</p>
				{:else}
					<ul class="price-list">
						{#each list.prices as p (p.id)}
							<li>
								<span class="mono">{oneDecimal(p.ct, data.locale)} ct/kWh</span>
								<span class="muted">{format(k.since, { date: dayText(p.from) })}</span>
								<form method="POST" action="?/deletePrice" use:enhance={keep}>
									<input type="hidden" name="id" value={p.id} />
									<button
										class="text-btn"
										type="submit"
										aria-label={format(k.removePrice, { date: dayText(p.from) })}>{k.remove}</button
									>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
				<form class="price-form" method="POST" action="?/price" use:enhance>
					<input type="hidden" name="kind" value={list.kind} />
					<label class="field">
						{k.price}
						<span class="with-unit">
							<input
								name="ct"
								inputmode="decimal"
								autocomplete="off"
								required
								placeholder={list.kind === 'home' ? '32' : '49'}
								aria-invalid={form?.priceError === list.kind ? 'true' : undefined}
							/>
							<span class="unit">ct/kWh</span>
						</span>
					</label>
					<label class="field">
						{k.validFrom}
						<input name="from" type="date" required value={today} />
					</label>
					<button class="btn" type="submit">{k.addPrice}</button>
				</form>
				{#if form?.priceError === list.kind}
					<p class="notice notice-error" role="alert">{k.invalidPrice}</p>
				{:else if form?.priceSaved === list.kind}
					<p class="notice notice-ok" role="status">{k.saved}</p>
				{/if}
			</div>
		{/each}

		<div class="price-kind">
			<form class="price-form" method="POST" action="?/loss" use:enhance={keep}>
				<label class="field">
					{k.loss}
					<span class="with-unit">
						<input
							name="loss"
							inputmode="decimal"
							autocomplete="off"
							placeholder={String(data.costs.defaultLossPct)}
							value={data.costs.lossPct?.toLocaleString(localeTag) ?? ''}
							aria-invalid={form?.lossError ? 'true' : undefined}
							aria-describedby="loss-hint"
						/>
						<span class="unit">%</span>
					</span>
				</label>
				<button class="btn" type="submit">{k.saveLoss}</button>
			</form>
			<p id="loss-hint" class="muted small">{k.lossHint}</p>
			{#if form?.lossError}
				<p class="notice notice-error" role="alert">{k.invalidLoss}</p>
			{:else if form?.lossSaved}
				<p class="notice notice-ok" role="status">{k.saved}</p>
			{/if}
		</div>

		<div class="price-kind">
			<h3>{k.homePlace}</h3>
			{#if data.costs.home}
				{#await data.costs.homeAddress then address}
					{#if address}<p class="address">{address}</p>{/if}
				{/await}
				<p class="muted small">
					{format(k.homeSet, {
						coords: `${data.costs.home.latitude.toFixed(5)}, ${data.costs.home.longitude.toFixed(5)}`
					})}
				</p>
				<form method="POST" action="?/clearHome" use:enhance>
					<button class="text-btn" type="submit">{k.clearHome}</button>
				</form>
			{:else}
				<p class="muted small">{k.homeUnset}</p>
			{/if}
		</div>
	</section>

	{#if data.raw.length > 0}
		<section class="card" aria-labelledby="raw">
			<h2 id="raw">{d.raw}</h2>
			<p class="muted small">{d.rawIntro}</p>
			{#each data.raw as entry (entry.endpoint)}
				<details class="raw">
					<summary>
						<span class="mono">{entry.endpoint}</span>
						<span class="muted small">
							{format(d.status, { status: String(entry.status) })}{entry.error
								? ` · ${entry.error}`
								: ''}{entry.truncated ? ` · ${d.truncated}` : ''}
						</span>
					</summary>
					<pre class="mono">{entry.text}</pre>
				</details>
			{/each}
		</section>
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

	.back:hover {
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

	.small {
		margin: 0;
		font-size: 13px;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: var(--ok);
		font-weight: 500;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: var(--ok);
	}

	.status-warn {
		color: var(--warn);
	}

	.status-warn .dot {
		background: var(--warn);
	}

	.values {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		background: var(--border);
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow: hidden;
	}

	.value {
		background: var(--surface);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.value dt {
		font-size: 13px;
		color: var(--muted);
	}

	.value dd {
		margin: 0;
		font-size: 16px;
		overflow-wrap: anywhere;
	}

	.value.big dd {
		font-size: 28px;
		font-weight: 600;
		color: var(--accent);
	}

	@media (min-width: 640px) {
		.values {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	.capacity {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 12px;
	}

	.with-unit {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.with-unit input {
		width: 120px;
	}

	.with-unit .unit {
		color: var(--muted);
	}

	.price-kind {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 14px;
		border-top: 1px solid var(--border);
	}

	h3 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}

	.price-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.price-list li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 6px 12px;
		font-size: 14px;
	}

	.price-list li:first-child .mono {
		font-weight: 600;
	}

	.price-list form {
		margin-left: auto;
	}

	.price-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 12px;
	}

	.price-form .with-unit input {
		width: 88px;
	}

	.price-form input[type='date'] {
		width: 150px;
	}

	.address {
		margin: 0;
		font-size: 15px;
		font-weight: 500;
	}

	.text-btn {
		font: inherit;
		font-size: 13px;
		border: 0;
		padding: 0;
		background: none;
		color: var(--accent);
		cursor: pointer;
	}

	.text-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: 4px;
	}

	.raw {
		border-top: 1px solid var(--border);
		padding-top: 12px;
	}

	.raw summary {
		cursor: pointer;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 8px;
	}

	.raw summary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	pre {
		margin: 12px 0 0;
		padding: 12px;
		max-height: 480px;
		overflow: auto;
		border-radius: 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		font-size: 12px;
		line-height: 1.5;
	}
</style>
