<script lang="ts">
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
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
			{ label: d.odometer, value: num(v.odometerKm, 0, 'km') },
			{ label: d.outsideTemp, value: num(v.outsideTempC, 1, '°C') },
			{ label: d.battery12v, value: battery12v || DASH },
			{ label: d.alerts, value: v.alertCount === undefined ? DASH : String(v.alertCount) },
			{ label: d.position, value: position, mono: true },
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
