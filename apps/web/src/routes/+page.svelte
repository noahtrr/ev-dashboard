<script lang="ts">
	import TopBar from '#lib/components/TopBar.svelte';
	import { messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);
</script>

<svelte:head>
	<title>{t.common.appName}</title>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<section class="card">
		<span class="label">{t.home.label}</span>
		<h1>{t.home.title}</h1>
		<p class="muted">{t.home.text}</p>
	</section>
</main>

<style>
	main {
		min-height: calc(100vh - 64px);
		display: grid;
		place-items: center;
		padding: var(--space);
	}

	.card {
		max-width: 420px;
		gap: 8px;
	}
</style>
