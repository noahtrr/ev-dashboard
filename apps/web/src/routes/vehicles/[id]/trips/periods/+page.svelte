<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import PurposeSegments from '#lib/components/PurposeSegments.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { localeTag } from '#lib/format.ts';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const l = $derived(t.logbook);
	const p = $derived(t.tripPeriods);

	const iso = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	const localDay = (day: string, offset = 0) => {
		const [y, m, d] = day.split('-').map(Number);
		return new Date(y, m - 1, d + offset);
	};
	const showDay = (day: string) =>
		localDay(day).toLocaleDateString(localeTag(data.locale), { dateStyle: 'medium' });
	const length = (from: string, to: string) =>
		Math.round((localDay(to, 1).getTime() - localDay(from).getTime()) / 86_400_000);

	let from = $state('');
	let to = $state('');
	let purpose = $state<'private' | 'business' | null>(null);
	let overwrite = $state(true);
	let timeZone = $state('');
	let busy = $state(false);

	// The browser knows the local dates and time zone the period is meant in.
	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const today = new Date();
		from = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13));
		to = iso(today);
	});

	// Counted here from the logged trips, so it follows every change of the dates.
	const preview = $derived.by(() => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
			return null;
		}
		const start = localDay(from).getTime();
		const end = localDay(to, 1).getTime();
		const inside = data.trips.filter((trip) => trip.t >= start && trip.t < end);
		const other = inside.filter((trip) => trip.purpose !== null && trip.purpose !== purpose);
		const open = inside.filter((trip) => trip.purpose === null);
		return {
			count: inside.length,
			change: purpose === null ? 0 : open.length + (overwrite ? other.length : 0),
			keep: overwrite || purpose === null ? 0 : other.length,
			future: end > Date.now()
		};
	});

	const save = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
		};
	};
	const error = $derived(
		form && 'periodError' in form
			? form.periodError === 'purpose'
				? p.purposeError
				: p.error
			: null
	);
</script>

<svelte:head>
	<title>{p.title} · {data.connection.label || t.connections.unnamed} · {t.common.appName}</title>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<a class="back" href={resolve('/vehicles/[id]/trips', { id: data.connection.id })}
		>← {l.backToLog}</a
	>
	<h1>{p.title}</h1>
	<p class="muted intro">{p.intro}</p>

	<form class="card stack" method="POST" action="?/add" use:enhance={save}>
		<h2 id="new-title">{p.newPeriod}</h2>
		<input type="hidden" name="tz" value={timeZone} />
		<div class="dates">
			<label class="field">
				{l.fromDate}
				<input type="date" name="from" bind:value={from} required />
			</label>
			<label class="field">
				{l.toDate}
				<input type="date" name="to" bind:value={to} min={from} required />
			</label>
		</div>
		<PurposeSegments bind:value={purpose} labels={l.purposes} labelledby="new-title" />
		<label class="check">
			<input type="checkbox" name="overwrite" bind:checked={overwrite} />
			{p.overwrite}
		</label>

		{#if preview}
			<div class="preview" role="status" aria-live="polite">
				<p class="count">
					{preview.count === 0
						? p.previewNone
						: preview.count === 1
							? p.previewOne
							: format(p.preview, { n: String(preview.count) })}
				</p>
				{#if preview.count > 0 && purpose}
					<p class="muted small">
						{#if preview.change > 0}
							{format(p.previewChange, {
								n: String(preview.change),
								purpose: l.purposes[purpose].toLowerCase()
							})}
						{:else if preview.keep === 0}
							{format(p.previewSame, { purpose: l.purposes[purpose].toLowerCase() })}
						{/if}
						{#if preview.keep > 0}
							{format(p.previewKeep, { n: String(preview.keep) })}
						{/if}
					</p>
				{/if}
				{#if preview.future}
					<p class="muted small">{p.later}</p>
				{/if}
			</div>
		{/if}

		{#if error}
			<p class="notice notice-error" role="alert">{error}</p>
		{:else if form && 'added' in form}
			<p class="notice notice-ok" role="status">
				{form.changed === 1 ? p.saved1 : format(p.saved, { n: String(form.changed) })}
			</p>
		{/if}
		<button class="btn btn-primary" disabled={busy || !purpose}>{p.save}</button>
	</form>

	<section class="card stack" aria-labelledby="list-title">
		<h2 id="list-title">{p.list}</h2>
		{#if data.periods.length === 0}
			<p class="muted small">{p.none}</p>
		{:else}
			<ul class="periods">
				{#each data.periods as period (period.id)}
					{@const days = length(period.fromDay, period.toDay)}
					<li>
						<span class="dot {period.purpose}"></span>
						<span class="text">
							<span class="range">{showDay(period.fromDay)} – {showDay(period.toDay)}</span>
							<span class="hint">
								{l.purposes[period.purpose as 'private' | 'business'] ?? period.purpose} · {days ===
								1
									? p.day
									: format(p.days, { n: String(days) })}
							</span>
						</span>
						<form
							method="POST"
							action="?/remove"
							use:enhance
							onsubmit={(event) => {
								if (!confirm(p.removeConfirm)) event.preventDefault();
							}}
						>
							<input type="hidden" name="id" value={period.id} />
							<button class="btn btn-danger">{p.remove}</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 640px;
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

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}

	.intro {
		font-size: 15px;
	}

	.stack {
		gap: 14px;
	}

	h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--muted);
	}

	.dates {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.dates input {
		font-family: var(--font-mono);
		min-width: 0;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 15px;
		cursor: pointer;
	}

	.check input {
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
	}

	.preview {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 16px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--accent) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
	}

	.count {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}

	.small {
		font-size: 14px;
	}

	.btn-primary {
		align-self: flex-start;
	}

	.periods {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.periods li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 0;
		border-bottom: 1px solid var(--border);
	}

	.periods li:last-child {
		border-bottom: 0;
	}

	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.range {
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}

	.hint {
		font-size: 13px;
		color: var(--muted);
	}

	.dot {
		width: 10px;
		height: 10px;
		flex-shrink: 0;
		border-radius: 999px;
		background: var(--accent);
	}

	.dot.private {
		background: var(--private);
	}
</style>
