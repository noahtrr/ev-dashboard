<script lang="ts">
	import { resolve } from '$app/paths';
	import { authClient } from '#lib/auth-client.ts';
	import { authErrorMessage } from '#lib/auth-shared.ts';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);

	let email = $state('');
	let busy = $state(false);
	let error = $state('');
	let sent = $state<string | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			// Answers the same whether the address has an account or not.
			const result = await authClient.requestPasswordReset({
				email,
				redirectTo: '/reset-password'
			});
			if (result.error) error = authErrorMessage(t, result.error);
			else sent = email.trim();
		} catch {
			error = t.common.error;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{t.auth.forgotTitle} · {t.common.appName}</title>
</svelte:head>

<main class="center">
	<section class="card">
		<span class="label">{t.common.appName}</span>
		{#if sent}
			<h1>{t.auth.sentTitle}</h1>
			<p class="muted">{format(t.auth.sentText, { email: sent })}</p>
			<a class="btn" href={resolve('/login')}>{t.auth.toLogin}</a>
		{:else}
			<h1>{t.auth.forgotTitle}</h1>
			<p class="muted">{t.auth.forgotIntro}</p>
			{#if error}
				<p class="notice notice-error" role="alert">{error}</p>
			{/if}
			<form class="stack" onsubmit={submit}>
				<label class="field">
					{t.auth.email}
					<input name="email" type="email" autocomplete="email" required bind:value={email} />
				</label>
				<button class="btn btn-primary" type="submit" disabled={busy}>{t.auth.sendLink}</button>
			</form>
			<a class="back" href={resolve('/login')}>{t.auth.backToLogin}</a>
		{/if}
	</section>
</main>

<style>
	.card {
		max-width: 400px;
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.back {
		font-size: 14px;
		color: var(--accent);
	}
</style>
