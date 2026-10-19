<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import AuthPanel from '#lib/components/AuthPanel.svelte';
	import { authErrorMessage, MIN_PASSWORD_LENGTH } from '#lib/auth-shared.ts';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const tag = $derived(data.locale === 'de' ? 'de-DE' : 'en-GB');
	const inviteError = $derived.by(() => {
		if (!form?.code) return '';
		if (form.code === 'INVITE_INVALID') return t.auth.inviteInvalid;
		return authErrorMessage(t, { code: form.code });
	});
	let busy = $state(false);
</script>

<svelte:head>
	<title>{t.auth.signUpTitle} · {t.common.appName}</title>
</svelte:head>

<main class="center">
	{#if data.invite}
		<section class="card">
			<span class="label">{t.common.appName}</span>
			<h1>{t.auth.signUpTitle}</h1>
			<p class="invited">
				{format(t.auth.invited, {
					name: data.invite.inviter,
					date: new Date(data.invite.expiresAt).toLocaleDateString(tag, { dateStyle: 'medium' })
				})}
			</p>
			{#if inviteError}
				<p class="notice notice-error" role="alert">{inviteError}</p>
			{/if}
			<form
				class="stack"
				method="POST"
				action="?/invite"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update({ reset: false });
						busy = false;
					};
				}}
			>
				<input type="hidden" name="token" value={data.invite.token} />
				<label class="field">
					{t.auth.name}
					<input name="name" autocomplete="name" value={form?.name ?? ''} />
				</label>
				<label class="field">
					{t.auth.email}
					<input
						type="email"
						autocomplete="username"
						value={data.invite.email}
						readonly
						aria-describedby="invite-email-hint"
					/>
					<span id="invite-email-hint" class="hint">{t.auth.inviteFixed}</span>
				</label>
				<label class="field">
					{t.auth.password}
					<input
						name="password"
						type="password"
						autocomplete="new-password"
						minlength={MIN_PASSWORD_LENGTH}
						required
					/>
					<span class="hint">{t.auth.passwordHint}</span>
				</label>
				<button class="btn btn-primary" type="submit" disabled={busy}>{t.auth.signUp}</button>
			</form>
			<p class="muted footer">
				{t.auth.haveAccount} <a href={resolve('/login')}>{t.auth.signIn}</a>
			</p>
		</section>
	{:else if data.inviteInvalid}
		<section class="card">
			<span class="label">{t.common.appName}</span>
			<h1>{t.auth.invalidTitle}</h1>
			<p class="muted">{t.auth.inviteInvalid}</p>
			<a class="btn" href={resolve('/login')}>{t.auth.toLogin}</a>
		</section>
	{:else}
		<AuthPanel
			mode="signup"
			methods={data.methods}
			{t}
			redirectTo="/"
			error={data.errorCode
				? authErrorMessage(t, { code: data.errorCode }, t.auth.errors.oauth)
				: ''}
		/>
	{/if}
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

	.invited {
		margin: 0;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		font-size: 14px;
		line-height: 1.45;
	}

	.hint {
		font-size: 13px;
	}

	.footer {
		font-size: 14px;
	}

	a {
		color: var(--accent);
	}

	input[readonly] {
		color: var(--muted);
	}
</style>
