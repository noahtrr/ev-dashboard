<script lang="ts">
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
	<title>{m.newTitle} · {data.connection.label || t.connections.unnamed} · {t.common.appName}</title
	>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<a class="back" href={resolve('/vehicles/[id]/trips/manual', { id: data.connection.id })}
		>← {m.title}</a
	>
	<h1>{m.newTitle}</h1>
	<ManualTripForm
		{t}
		limits={data.limits}
		failed={form?.values ?? null}
		error={form?.tripError ?? null}
	/>
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
</style>
