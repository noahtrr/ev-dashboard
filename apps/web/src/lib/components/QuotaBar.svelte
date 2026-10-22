<script lang="ts">
	import { resolve } from '$app/paths';
	import { kilometres } from '#lib/format.ts';
	import { format, messages, type Locale } from '#lib/i18n.ts';
	import { quotaStatus, type PrivateTrip } from '#lib/private-quota.ts';

	let {
		quota,
		connectionId,
		locale
	}: {
		quota: { km: number; warnPct: number | null; year: number; trips: PrivateTrip[] };
		connectionId: string;
		locale: Locale;
	} = $props();

	const q = $derived(messages[locale].privateQuota);
	const status = $derived(quotaStatus(quota.trips, quota.km, quota.warnPct, quota.year));
	const km = (value: number) => kilometres(value, locale);
</script>

<section class="quota {status.level}" aria-labelledby="quota-title">
	<div class="line">
		<h2 id="quota-title">
			<a href={resolve('/vehicles/[id]#quota', { id: connectionId })}
				>{format(q.bar, { year: String(quota.year) })}</a
			>
		</h2>
		<span class="numbers">
			{format(q.used, { used: km(status.usedKm), quota: km(quota.km) })} ·
			{status.level === 'over'
				? format(q.over, { km: km(status.usedKm - quota.km) })
				: format(q.left, { left: km(status.leftKm) })}
		</span>
	</div>
	<div
		class="track"
		role="meter"
		aria-labelledby="quota-title"
		aria-valuemin={0}
		aria-valuemax={quota.km}
		aria-valuenow={Math.round(status.usedKm)}
		aria-valuetext={format(q.used, { used: km(status.usedKm), quota: km(quota.km) })}
	>
		<div class="fill" style:width="{Math.min(status.pct, 100)}%"></div>
	</div>
</section>

<style>
	.quota {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px 16px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--surface);
	}

	.line {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 4px 12px;
	}

	h2 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}

	h2 a {
		color: inherit;
		text-decoration: none;
	}

	h2 a:hover,
	h2 a:focus-visible {
		color: var(--accent);
	}

	.numbers {
		font-size: 13px;
		color: var(--muted);
		font-family: var(--font-mono);
	}

	.track {
		height: 10px;
		border-radius: 999px;
		background: var(--bg);
		border: 1px solid var(--border);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		border-radius: 999px;
		background: var(--ok);
		transition: width 0.3s ease;
	}

	.warn .fill {
		background: var(--warn);
	}

	.over .fill {
		background: var(--danger);
	}
</style>
