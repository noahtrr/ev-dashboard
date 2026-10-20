<script lang="ts">
	import '@fontsource-variable/geist';
	import '@fontsource-variable/geist-mono';
	import '../app.css';
	import { onMount } from 'svelte';
	import favicon from '#lib/assets/favicon.svg';
	import { messages } from '#lib/i18n.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	// Without a connection the service worker answers with the pages loaded last.
	let online = $state(true);
	onMount(() => {
		const update = () => (online = navigator.onLine);
		update();
		addEventListener('online', update);
		addEventListener('offline', update);
		return () => {
			removeEventListener('online', update);
			removeEventListener('offline', update);
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if !online}
	<p class="offline" role="status">
		<span class="dot" aria-hidden="true"></span>{messages[data.locale].app.offline}
	</p>
{/if}

{@render children()}

<style>
	.offline {
		max-width: 960px;
		box-sizing: border-box;
		margin: 8px auto 0;
		padding: 10px 14px;
		border-radius: 12px;
		border: 1px solid var(--warn);
		color: var(--warn);
		font-size: 13px;
		display: flex;
		align-items: center;
		gap: 8px;
		width: calc(100% - 2 * var(--space));
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 3px;
		background: currentColor;
	}
</style>
