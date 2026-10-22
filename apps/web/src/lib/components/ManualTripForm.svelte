<script lang="ts">
	// Form for a trip entered by hand. Dates and times are shown and entered in the browser's
	// time zone, which is sent along.
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Messages } from '#lib/i18n.ts';
	import PurposeSegments from './PurposeSegments.svelte';

	type Purpose = 'private' | 'business';
	type Values = {
		date: string;
		startTime: string;
		endTime: string;
		distanceKm: string;
		startOdometerKm: string;
		endOdometerKm: string;
		startAddress: string;
		endAddress: string;
		purpose: string;
		note: string;
	};
	type Entry = {
		startAt: number;
		endAt: number;
		distanceKm: number;
		startOdometerKm: number | null;
		endOdometerKm: number | null;
		startAddress: string | null;
		endAddress: string | null;
		purpose: Purpose | null;
		note: string | null;
	};

	let {
		t,
		entry = null,
		failed = null,
		error = null,
		saved = false,
		limits
	}: {
		t: Messages;
		/** The trip to change; null for a new one. */
		entry?: Entry | null;
		/** Values sent back after a mistake. */
		failed?: Values | null;
		error?: keyof Messages['manualTrips']['errors'] | null;
		saved?: boolean;
		limits: { note: number; address: number };
	} = $props();
	const m = $derived(t.manualTrips);
	const l = $derived(t.logbook);

	const pad = (n: number) => String(n).padStart(2, '0');
	const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	const time = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	const decimal = (n: number | null) => (n === null ? '' : String(Math.round(n * 10) / 10));

	const empty: Values = {
		date: '',
		startTime: '',
		endTime: '',
		distanceKm: '',
		startOdometerKm: '',
		endOdometerKm: '',
		startAddress: '',
		endAddress: '',
		purpose: '',
		note: ''
	};
	let v = $state<Values>({ ...empty });
	let purpose = $state<Purpose | null>(null);
	let timeZone = $state('');
	let busy = $state(false);
	let dirty = $state(false);

	function fromEntry(e: Entry): Values {
		const start = new Date(e.startAt);
		const end = new Date(e.endAt);
		return {
			date: day(start),
			startTime: time(start),
			endTime: e.endAt === e.startAt ? '' : time(end),
			distanceKm: decimal(e.distanceKm),
			startOdometerKm: decimal(e.startOdometerKm),
			endOdometerKm: decimal(e.endOdometerKm),
			startAddress: e.startAddress ?? '',
			endAddress: e.endAddress ?? '',
			purpose: e.purpose ?? '',
			note: e.note ?? ''
		};
	}

	// Local dates and times are only known in the browser.
	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		v = failed ?? (entry ? fromEntry(entry) : { ...empty, date: day(new Date()) });
		purpose = v.purpose === 'private' || v.purpose === 'business' ? v.purpose : null;
	});

	const submit = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
			dirty = false;
		};
	};
</script>

<form
	class="card stack"
	method="POST"
	action="?/save"
	use:enhance={submit}
	oninput={() => (dirty = true)}
>
	<input type="hidden" name="tz" value={timeZone} />
	<label class="field">
		{m.date}
		<input type="date" name="date" bind:value={v.date} required />
	</label>
	<div class="pair">
		<label class="field">
			{m.startTime}
			<input type="time" name="startTime" bind:value={v.startTime} required />
		</label>
		<label class="field">
			{m.endTime}
			<input type="time" name="endTime" bind:value={v.endTime} />
		</label>
	</div>

	<fieldset class="distance">
		<legend class="sr-only">{m.distance}</legend>
		<label class="field">
			{m.distance}
			<input
				name="distanceKm"
				inputmode="decimal"
				autocomplete="off"
				bind:value={v.distanceKm}
				placeholder="0"
			/>
		</label>
		<p class="or"><span>{m.or}</span></p>
		<div class="pair">
			<label class="field">
				{m.startOdometer}
				<input
					name="startOdometerKm"
					inputmode="numeric"
					autocomplete="off"
					bind:value={v.startOdometerKm}
				/>
			</label>
			<label class="field">
				{m.endOdometer}
				<input
					name="endOdometerKm"
					inputmode="numeric"
					autocomplete="off"
					bind:value={v.endOdometerKm}
				/>
			</label>
		</div>
		<p class="muted small">{m.distanceHint}</p>
	</fieldset>

	<label class="field">
		{m.startAddress}
		<input name="startAddress" maxlength={limits.address} bind:value={v.startAddress} />
	</label>
	<label class="field">
		{m.endAddress}
		<input name="endAddress" maxlength={limits.address} bind:value={v.endAddress} />
	</label>

	<div class="stack-tight">
		<span class="label-muted" id="manual-purpose">{l.purpose}</span>
		<PurposeSegments bind:value={purpose} labels={l.purposes} labelledby="manual-purpose" />
	</div>
	<label class="field">
		{l.note}
		<textarea
			name="note"
			rows="2"
			maxlength={limits.note}
			placeholder={l.notePlaceholder}
			bind:value={v.note}></textarea>
	</label>

	{#if error}
		<p class="notice notice-error" role="alert">{m.errors[error]}</p>
	{/if}
	<button class="btn btn-primary" disabled={busy}>{saved && !dirty ? m.saved : m.save}</button>
</form>

<style>
	.stack {
		gap: 14px;
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.pair input,
	input[type='date'] {
		font-family: var(--font-mono);
		min-width: 0;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	.or {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13px;
		color: var(--muted);
	}

	.or::before,
	.or::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.small {
		font-size: 13px;
	}

	.stack-tight {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.label-muted {
		font-size: 14px;
		color: var(--muted);
	}

	textarea {
		font: inherit;
		font-size: 15px;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 12px 14px;
		resize: vertical;
	}

	textarea:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.btn-primary {
		align-self: flex-start;
	}
</style>
