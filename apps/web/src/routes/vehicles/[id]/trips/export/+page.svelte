<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const l = $derived(t.logbook);

	type Range = keyof typeof l.ranges;
	const RANGES: Range[] = ['thisMonth', 'lastMonth', 'thisYear', 'lastYear'];
	const iso = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	function bounds(range: Range, now = new Date()) {
		const y = now.getFullYear();
		const m = now.getMonth();
		if (range === 'thisMonth') return [new Date(y, m, 1), new Date(y, m + 1, 0)];
		if (range === 'lastMonth') return [new Date(y, m - 1, 1), new Date(y, m, 0)];
		if (range === 'thisYear') return [new Date(y, 0, 1), new Date(y, 11, 31)];
		return [new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)];
	}

	let range = $state<Range | null>('thisMonth');
	let from = $state(iso(bounds('thisMonth')[0]));
	let to = $state(iso(bounds('thisMonth')[1]));
	let timeZone = $state('');
	let choice = $state('xlsx');

	const pick = (r: Range) => {
		range = r;
		[from, to] = bounds(r).map(iso);
	};

	// The browser knows the local dates and time zone the file should use.
	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		pick('thisMonth');
	});

	const formats = ['xlsx', 'csv', 'txt'] as const;
	const isTemplate = $derived(choice.startsWith('template:'));
	const templateError = $derived(
		form && 'templateError' in form && form.templateError
			? l.templateErrors[form.templateError]
			: null
	);
</script>

<svelte:head>
	<title
		>{l.exportTitle} · {data.connection.label || t.connections.unnamed} · {t.common.appName}</title
	>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<a class="back" href={resolve('/vehicles/[id]/trips', { id: data.connection.id })}
		>← {l.backToLog}</a
	>
	<h1>{l.exportTitle}</h1>

	<form
		class="stack"
		method="GET"
		action={resolve('/vehicles/[id]/trips/export/download', { id: data.connection.id })}
		data-sveltekit-reload
	>
		<input type="hidden" name="tz" value={timeZone} />

		<fieldset class="card">
			<legend>{l.range}</legend>
			<div class="chips">
				{#each RANGES as r (r)}
					<button type="button" aria-pressed={range === r} onclick={() => pick(r)}
						>{l.ranges[r]}</button
					>
				{/each}
			</div>
			<div class="dates">
				<label class="field">
					{l.fromDate}
					<input
						type="date"
						name="from"
						bind:value={from}
						required
						oninput={() => (range = null)}
					/>
				</label>
				<label class="field">
					{l.toDate}
					<input type="date" name="to" bind:value={to} required oninput={() => (range = null)} />
				</label>
			</div>
		</fieldset>

		<fieldset class="card" disabled={isTemplate}>
			<legend>{l.which}</legend>
			<div class="segments">
				{#each [['all', l.all], ['business', l.purposes.business], ['private', l.purposes.private]] as [value, label] (value)}
					<label class="segment">
						<input type="radio" name="purpose" {value} checked={value === 'all'} />
						{label}
					</label>
				{/each}
			</div>
		</fieldset>

		<fieldset class="card">
			<legend>{l.format}</legend>
			<div class="options">
				{#each formats as f (f)}
					<label class="option">
						<input type="radio" name="format" value={f} bind:group={choice} />
						<span class="ext">{f.toUpperCase()}</span>
						<span class="text">
							<span class="name">{l.formats[f].label}</span>
							<span class="hint">{l.formats[f].hint}</span>
						</span>
					</label>
				{/each}
				{#each data.templates as template (template.id)}
					<label class="option">
						<input
							type="radio"
							name="format"
							value={`template:${template.id}`}
							bind:group={choice}
						/>
						<span class="ext">XLSX</span>
						<span class="text">
							<span class="name">{template.name}</span>
							<span class="hint">{l.templateKinds[template.kind] ?? template.kind}</span>
						</span>
					</label>
				{/each}
			</div>
		</fieldset>

		<button class="btn btn-primary download">{l.download}</button>
		<p class="muted small">{l.disclaimer}</p>
	</form>

	<section class="card stack" aria-labelledby="templates-title">
		<h2 id="templates-title">{l.templates}</h2>
		<p class="muted small">{l.templatesIntro}</p>
		{#if data.templates.length === 0}
			<p class="muted small">{l.noTemplates}</p>
		{:else}
			<ul class="templates">
				{#each data.templates as template (template.id)}
					<li>
						<span class="text">
							<span class="name">{template.name}</span>
							<span class="hint">{l.templateKinds[template.kind] ?? template.kind}</span>
						</span>
						<form
							method="POST"
							action="?/removeTemplate"
							use:enhance
							onsubmit={(event) => {
								if (!confirm(format(l.removeConfirm, { name: template.name }))) {
									event.preventDefault();
								}
							}}
						>
							<input type="hidden" name="id" value={template.id} />
							<button class="btn btn-danger">{l.remove}</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			class="stack upload"
			method="POST"
			action="?/uploadTemplate"
			enctype="multipart/form-data"
			use:enhance
		>
			<label class="field">
				{l.templateName}
				<input name="name" required maxlength="80" />
			</label>
			<label class="field">
				{l.templateFile}
				<input
					type="file"
					name="file"
					required
					accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
				/>
			</label>
			{#if templateError}
				<p class="notice notice-error" role="alert">{templateError}</p>
			{:else if form && 'templateUploaded' in form}
				<p class="notice notice-ok" role="status">{l.uploaded}</p>
			{/if}
			<button class="btn">{l.upload}</button>
		</form>
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

	.stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	fieldset {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}

	fieldset:disabled {
		opacity: 0.5;
	}

	legend {
		float: left;
		padding: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--muted);
	}

	legend + * {
		clear: both;
	}

	h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--muted);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chips button {
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		min-height: 40px;
		padding: 0 14px;
		border-radius: 20px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}

	.chips button[aria-pressed='true'] {
		background: var(--text);
		border-color: var(--text);
		color: var(--bg);
	}

	.chips button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.dates {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.dates input {
		font-family: var(--font-mono);
	}

	.segments {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
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
		display: grid;
		place-items: center;
		font-size: 14px;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
		text-align: center;
	}

	.segment input,
	.option input {
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

	.segment:has(input:focus-visible),
	.option:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.option {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 8px 14px;
		border-radius: 14px;
		border: 1.5px solid var(--border);
		cursor: pointer;
	}

	.option:has(input:checked) {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}

	.ext {
		width: 44px;
		height: 40px;
		flex-shrink: 0;
		border-radius: 10px;
		background: var(--bg);
		border: 1px solid var(--border);
		display: grid;
		place-items: center;
		font-size: 11px;
		font-weight: 600;
		font-family: var(--font-mono);
		color: var(--muted);
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.name {
		font-size: 15px;
		font-weight: 600;
		color: var(--text);
	}

	.hint {
		font-size: 13px;
		color: var(--muted);
	}

	.download {
		min-height: 52px;
		font-size: 16px;
		font-weight: 600;
	}

	.small {
		margin: 0;
		font-size: 13px;
	}

	.templates {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
	}

	.templates li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--border);
	}

	.upload {
		padding-top: 4px;
	}

	.upload input[type='file'] {
		font-size: 14px;
		padding: 10px 12px;
	}
</style>
