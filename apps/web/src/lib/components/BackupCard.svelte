<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { BACKUP_FORMAT, BACKUP_VERSION, IMPORT_BATCH } from '#lib/backup.ts';
	import { format, type Messages } from '#lib/i18n.ts';

	type Summary = {
		vehicles: number;
		trips: number;
		chargeSessions: number;
		prices: boolean;
		templates: number;
		settings: boolean;
	};
	type Target = { id: string; label: string | null; externalId: string | null };
	type Props = { t: Messages; summary: Summary; targets: Target[]; localeTag: string };

	let { t, summary, targets, localeTag }: Props = $props();
	const b = $derived(t.backup);

	/** Only what the page needs to know before sending; the server checks every value. */
	type FileVehicle = {
		id: string;
		label: string | null;
		externalId: string | null;
		trips: unknown[];
		chargeSessions: unknown[];
	} & Record<string, unknown>;
	type FileBackup = {
		createdAt: string;
		settings: unknown;
		vehicles: FileVehicle[];
		templates: unknown[];
	};

	let step = $state<'pick' | 'preview' | 'running' | 'done'>('pick');
	let backup = $state<FileBackup | null>(null);
	/** Per vehicle in the file: an existing vehicle's ID, 'new' or 'skip'. */
	let choice = $state<Record<string, string>>({});
	let progress = $state(0);
	let error = $state('');
	let result = $state<{
		trips: number;
		charges: number;
		existingTrips: number;
		existingCharges: number;
		created: string[];
		templatesFull: boolean;
		failed: boolean;
	} | null>(null);
	let input = $state<HTMLInputElement>();

	const number = (n: number) => n.toLocaleString(localeTag);
	const count = (forms: { none: string; one: string; many: string }, n: number) =>
		n === 0 ? forms.none : n === 1 ? forms.one : format(forms.many, { count: number(n) });
	const name = (label: string | null) => label || t.connections.unnamed;

	const contents = $derived([
		[b.contents.vehicles, number(summary.vehicles)],
		[b.contents.trips, number(summary.trips)],
		[b.contents.chargeSessions, number(summary.chargeSessions)],
		[b.contents.prices, summary.prices ? b.yes : b.no],
		[b.contents.templates, number(summary.templates)],
		[b.contents.settings, summary.settings ? b.yes : b.no]
	]);

	/** The vehicle here that most likely is the one from the file. */
	function match(v: FileVehicle): string {
		const byId = v.externalId ? targets.find((c) => c.externalId === v.externalId) : undefined;
		const byName = v.label ? targets.find((c) => c.label === v.label) : undefined;
		return (byId ?? byName)?.id ?? 'new';
	}

	async function read(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file) return;
		error = '';
		try {
			const data = JSON.parse(await file.text());
			if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.vehicles)) throw new Error();
			if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
				error = b.newer;
				return;
			}
			for (const v of data.vehicles) {
				if (typeof v?.id !== 'string' || !Array.isArray(v.trips)) throw new Error();
				v.chargeSessions = Array.isArray(v.chargeSessions) ? v.chargeSessions : [];
			}
			data.templates = Array.isArray(data.templates) ? data.templates : [];
			backup = data;
			choice = Object.fromEntries(data.vehicles.map((v: FileVehicle) => [v.id, match(v)]));
			step = 'preview';
		} catch {
			error = b.invalid;
		}
	}

	async function send(body: object) {
		const response = await fetch('/api/backup/import', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!response.ok) throw new Error(String(response.status));
		return response.json();
	}

	function batches<T>(items: T[]): T[][] {
		const out: T[][] = [];
		for (let i = 0; i < items.length; i += IMPORT_BATCH) out.push(items.slice(i, i + IMPORT_BATCH));
		return out;
	}

	async function run() {
		if (!backup) return;
		const vehicles = backup.vehicles.filter((v) => choice[v.id] !== 'skip');
		const total =
			1 +
			backup.templates.length +
			vehicles.reduce(
				(sum, v) => sum + 1 + batches(v.trips).length + batches(v.chargeSessions).length,
				0
			);
		let done = 0;
		const tick = () => (progress = Math.round((++done / total) * 100));
		const r = {
			trips: 0,
			charges: 0,
			existingTrips: 0,
			existingCharges: 0,
			created: [] as string[],
			templatesFull: false,
			failed: false
		};
		step = 'running';
		progress = 0;
		try {
			for (const v of vehicles) {
				const { trips, chargeSessions, ...info } = v;
				const target = await send({ step: 'vehicle', vehicle: info, target: choice[v.id] });
				tick();
				if (target.created) r.created.push(name(v.label));
				for (const part of batches(trips)) {
					const c = await send({ step: 'trips', connectionId: target.connectionId, trips: part });
					r.trips += c.added;
					r.existingTrips += c.skipped;
					tick();
				}
				for (const part of batches(chargeSessions)) {
					const c = await send({
						step: 'charges',
						connectionId: target.connectionId,
						chargeSessions: part
					});
					r.charges += c.added;
					r.existingCharges += c.skipped;
					tick();
				}
			}
			if (backup.settings) await send({ step: 'settings', settings: backup.settings });
			tick();
			for (const template of backup.templates) {
				const { result } = await send({ step: 'template', template });
				if (result === 'full') r.templatesFull = true;
				tick();
			}
		} catch {
			r.failed = true;
		}
		result = r;
		step = 'done';
		await invalidateAll();
	}

	function reset() {
		step = 'pick';
		backup = null;
		result = null;
		error = '';
	}

	const fileTrips = $derived(backup?.vehicles.reduce((n, v) => n + v.trips.length, 0) ?? 0);
	const fileCharges = $derived(
		backup?.vehicles.reduce((n, v) => n + v.chargeSessions.length, 0) ?? 0
	);
	const fileDate = $derived.by(() => {
		const d = backup ? new Date(backup.createdAt) : null;
		return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(localeTag) : '–';
	});
</script>

<section class="card" id="backup" aria-labelledby="backup-title">
	<h2 id="backup-title">{b.title}</h2>
	<p class="muted">{b.intro}</p>
	<dl>
		{#each contents as [label, value] (label)}
			<dt>{label}</dt>
			<dd>{value}</dd>
		{/each}
	</dl>
	<p class="muted small">{b.excluded}</p>
	<a class="btn btn-primary start" href={resolve('/api/backup')} download>{b.download}</a>
</section>

<section class="card" aria-labelledby="restore-title">
	<h2 id="restore-title">{b.importTitle}</h2>

	{#if step === 'pick'}
		<p class="muted">{b.importIntro}</p>
		<input
			bind:this={input}
			class="file"
			type="file"
			accept="application/json,.json"
			onchange={read}
		/>
		<button class="btn start" type="button" onclick={() => input?.click()}>{b.choose}</button>
		{#if error}
			<p class="notice notice-error" role="alert">{error}</p>
		{/if}
	{:else if step === 'preview' && backup}
		<p class="lead">
			{format(b.from, { date: fileDate })} · {count(b.vehicles, backup.vehicles.length)},
			{count(b.trips, fileTrips)}, {count(b.charges, fileCharges)}
		</p>
		{#each backup.vehicles as v (v.id)}
			<div class="vehicle">
				<span class="name">{name(v.label)}</span>
				<span class="muted small"
					>{count(b.trips, v.trips.length)} · {count(b.charges, v.chargeSessions.length)}</span
				>
				<select aria-label={format(b.target, { vehicle: name(v.label) })} bind:value={choice[v.id]}>
					{#each targets as c (c.id)}
						<option value={c.id}>{format(b.addTo, { vehicle: name(c.label) })}</option>
					{/each}
					<option value="new">{b.createNew}</option>
					<option value="skip">{b.skip}</option>
				</select>
			</div>
		{/each}
		<div class="actions">
			<button class="btn" type="button" onclick={reset}>{t.common.cancel}</button>
			<button class="btn btn-primary" type="button" onclick={run}>{b.run}</button>
		</div>
	{:else if step === 'running'}
		<p class="muted" role="status">{format(b.running, { pct: String(progress) })}</p>
		<progress max="100" value={progress}></progress>
	{:else if step === 'done' && result}
		<p class="notice {result.failed ? 'notice-error' : 'notice-ok'}" role="status">
			{#if result.failed}{b.failed}{/if}
			{format(b.done, {
				trips: count(b.trips, result.trips),
				charges: count(b.charges, result.charges)
			})}
			{#if result.existingTrips + result.existingCharges > 0}
				{format(b.existing, {
					trips: count(b.trips, result.existingTrips),
					charges: count(b.charges, result.existingCharges)
				})}
			{/if}
		</p>
		{#each result.created as vehicle (vehicle)}
			<p class="muted small">{format(b.created, { vehicle })}</p>
		{/each}
		{#if result.templatesFull}
			<p class="muted small">{b.templatesFull}</p>
		{/if}
		<button class="link" type="button" onclick={reset}>{b.again}</button>
	{/if}
</section>

<style>
	.small {
		margin: 0;
		font-size: 13px;
	}

	.start {
		align-self: flex-start;
	}

	dl {
		margin: 0;
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px 12px;
		font-size: 14px;
	}

	dt {
		color: var(--muted);
	}

	dd {
		margin: 0;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.file {
		display: none;
	}

	.lead {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
	}

	.vehicle {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}

	.name {
		font-size: 15px;
		font-weight: 500;
	}

	select {
		font: inherit;
		font-size: 16px;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 0 12px;
		min-height: 44px;
	}

	select:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.actions {
		display: flex;
		gap: 8px;
	}

	.actions .btn {
		flex: 1;
	}

	progress {
		width: 100%;
		accent-color: var(--accent);
	}

	.link {
		align-self: flex-start;
		border: 0;
		background: none;
		padding: 0;
		color: var(--accent);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}

	.link:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
