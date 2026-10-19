<script lang="ts">
	import AuthPanel from '#lib/components/AuthPanel.svelte';
	import { authErrorMessage } from '#lib/auth-shared.ts';
	import { messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);
</script>

<svelte:head>
	<title>{t.auth.setupTitle} · {t.common.appName}</title>
</svelte:head>

<main class="center">
	<AuthPanel
		mode="setup"
		methods={data.methods}
		{t}
		redirectTo="/"
		error={data.errorCode ? authErrorMessage(t, { code: data.errorCode }, t.auth.errors.oauth) : ''}
	/>
</main>
