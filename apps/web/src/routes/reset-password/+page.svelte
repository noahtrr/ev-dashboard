<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '#lib/auth-client.ts';
	import { authErrorMessage, MIN_PASSWORD_LENGTH } from '#lib/auth-shared.ts';
	import { messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);

	let password = $state('');
	let repeat = $state('');
	let busy = $state(false);
	let error = $state('');
	let invalid = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!data.token) return;
		if (password !== repeat) {
			error = t.auth.mismatch;
			return;
		}
		busy = true;
		error = '';
		try {
			const result = await authClient.resetPassword({ newPassword: password, token: data.token });
			if (result.error) {
				if (result.error.code?.toUpperCase() === 'INVALID_TOKEN') invalid = true;
				else error = authErrorMessage(t, result.error);
				return;
			}
			await goto(resolve('/login?reset=1'));
		} catch {
			error = t.common.error;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{t.auth.resetTitle} · {t.common.appName}</title>
</svelte:head>

<main class="center">
	<section class="card">
		<span class="label">{t.common.appName}</span>
		{#if !data.token || invalid}
			<h1>{t.auth.invalidTitle}</h1>
			<p class="muted">{t.auth.invalidText}</p>
			<a class="btn" href={resolve('/forgot-password')}>{t.auth.requestNew}</a>
		{:else}
			<h1>{t.auth.resetTitle}</h1>
			{#if error}
				<p class="notice notice-error" role="alert">{error}</p>
			{/if}
			<form class="stack" onsubmit={submit}>
				<label class="field">
					{t.auth.newPassword}
					<input
						name="password"
						type="password"
						autocomplete="new-password"
						minlength={MIN_PASSWORD_LENGTH}
						required
						bind:value={password}
					/>
					<span class="hint">{t.auth.passwordHint}</span>
				</label>
				<label class="field">
					{t.auth.repeatPassword}
					<input
						name="repeat"
						type="password"
						autocomplete="new-password"
						minlength={MIN_PASSWORD_LENGTH}
						required
						bind:value={repeat}
					/>
				</label>
				<button class="btn btn-primary" type="submit" disabled={busy}>{t.auth.savePassword}</button>
			</form>
			<p class="muted hint">{t.auth.resetNote}</p>
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

	.hint {
		margin: 0;
		font-size: 13px;
	}
</style>
