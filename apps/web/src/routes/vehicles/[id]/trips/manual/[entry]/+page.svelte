<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ManualTripForm from '#lib/components/ManualTripForm.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const m = $derived(t.manualTrips);
</script>

<svelte:head>
	<title
		>{m.editTitle} · {data.connection.label || t.connections.unnamed} · {t.common.appName}</title
	>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<a class="back" href={resolve('/vehicles/[id]/trips/manual', { id: data.connection.id })}
		>← {m.title}</a
	>
	<header class="head">
		<h1>{m.editTitle}</h1>
		<span class="badge">{m.badge}</span>
	</header>
	<ManualTripForm
		{t}
		entry={data.entry}
		limits={data.limits}
		failed={form && 'values' in form ? form.values : null}
		error={form && 'tripError' in form ? form.tripError : null}
		saved={Boolean(form && 'saved' in form)}
	/>
	<form
		method="POST"
		action="?/remove"
		use:enhance
		onsubmit={(event) => {
			if (!confirm(m.removeConfirm)) event.preventDefault();
		}}
	>
		<button class="btn btn-danger">{m.remove}</button>
	</form>
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

	.head {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}

	.badge {
		padding: 2px 10px;
		border-radius: 12px;
		font-size: 12px;
		font-weight: 500;
		border: 1px solid var(--border);
		color: var(--muted);
	}
</style>
