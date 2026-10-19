<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '#lib/auth-client.ts';
	import { authErrorMessage, MIN_PASSWORD_LENGTH, type LoginMethods } from '#lib/auth-shared.ts';
	import { format, type Messages } from '#lib/i18n.ts';

	type Props = {
		mode: 'signin' | 'signup' | 'setup';
		methods: LoginMethods;
		t: Messages;
		redirectTo: string;
		error?: string;
		/** Shown above the form, e.g. after a password reset. */
		notice?: string;
	};

	let { mode, methods, t, redirectTo, error: initialError = '', notice = '' }: Props = $props();

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	// svelte-ignore state_referenced_locally
	let error = $state(initialError);
	let info = $state('');
	/** Address that still has to be confirmed after signing up. */
	let pending = $state<string | null>(null);
	// The confirmation link signs in and lands here, which forwards to the dashboard.
	const callbackURL = '/login';

	// redirectTo is a same-origin path checked by safeRedirect() on the server.
	const target = $derived(redirectTo as '/');
	const creating = $derived(mode !== 'signin');
	const title = $derived(
		mode === 'setup'
			? t.auth.setupTitle
			: mode === 'signup'
				? t.auth.signUpTitle
				: t.auth.signInTitle
	);
	const intro = $derived(
		mode === 'setup'
			? t.auth.setupIntro
			: mode === 'signup'
				? t.auth.signUpIntro
				: t.auth.signInIntro
	);
	const hasOther = $derived(methods.social.length > 0 || (methods.passkey && !creating));
	const hasAny = $derived(methods.emailPassword || hasOther);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		info = '';
		try {
			if (creating) {
				const result = await authClient.signUp.email({
					name: name.trim() || email.trim(),
					email,
					password,
					callbackURL
				});
				if (result.error) {
					error = authErrorMessage(t, result.error);
					return;
				}
				// With email confirmation there is no session until the link is opened.
				if (!result.data?.token) {
					if (!result.data?.user.emailVerified) {
						pending = email.trim();
						return;
					}
					// The first admin counts as confirmed and signs in right away.
					const login = await authClient.signIn.email({ email, password });
					if (login.error) {
						error = authErrorMessage(t, login.error);
						return;
					}
				}
			} else {
				const result = await authClient.signIn.email({ email, password, callbackURL });
				if (result.error) {
					error = authErrorMessage(t, result.error);
					return;
				}
			}
			await goto(resolve(target), { invalidateAll: true });
		} catch {
			error = t.common.error;
		} finally {
			busy = false;
		}
	}

	async function resend() {
		if (!pending) return;
		busy = true;
		error = '';
		info = '';
		const result = await authClient.sendVerificationEmail({ email: pending, callbackURL });
		if (result.error) error = authErrorMessage(t, result.error);
		else info = t.auth.resent;
		busy = false;
	}

	async function signInPasskey() {
		busy = true;
		error = '';
		try {
			const result = await authClient.signIn.passkey();
			if (result?.error) {
				error = result.error.status === 429 ? t.auth.errors.rateLimited : t.auth.errors.passkey;
				return;
			}
			await goto(resolve(target), { invalidateAll: true });
		} catch {
			error = t.auth.errors.passkey;
		} finally {
			busy = false;
		}
	}

	async function signInSocial(provider: string) {
		busy = true;
		error = '';
		const errorPage = mode === 'signin' ? '/login' : `/${mode}`;
		const result = await authClient.signIn.social({
			provider,
			callbackURL: redirectTo,
			errorCallbackURL: errorPage
		});
		// On success the browser is already on its way to the provider.
		if (result.error) {
			error = authErrorMessage(t, result.error);
			busy = false;
		}
	}
</script>

<section class="card">
	<span class="label">{t.common.appName}</span>
	{#if pending}
		<h1>{t.auth.checkTitle}</h1>
		<p class="muted">{format(t.auth.checkText, { email: pending })}</p>
		{#if error}
			<p class="notice notice-error" role="alert">{error}</p>
		{:else if info}
			<p class="notice notice-ok" role="status">{info}</p>
		{/if}
		<button class="btn" type="button" onclick={resend} disabled={busy}>{t.auth.resend}</button>
		<button class="link" type="button" onclick={() => (pending = null)}>
			{t.auth.otherAddress}
		</button>
	{:else}
		<h1>{title}</h1>
		<p class="muted">{intro}</p>

		{#if error}
			<p class="notice notice-error" role="alert">{error}</p>
		{:else if notice}
			<p class="notice notice-ok" role="status">{notice}</p>
		{/if}

		{#if !hasAny}
			<p class="notice notice-error">{t.auth.noMethods}</p>
		{/if}

		{#if methods.emailPassword}
			<form class="stack" onsubmit={submit}>
				{#if creating}
					<label class="field">
						{t.auth.name}
						<input name="name" autocomplete="name" bind:value={name} />
					</label>
				{/if}
				<label class="field">
					{t.auth.email}
					<input
						name="email"
						type="email"
						autocomplete={creating ? 'email' : 'username webauthn'}
						required
						bind:value={email}
					/>
				</label>
				<label class="field">
					<span class="label-row">
						{t.auth.password}
						{#if mode === 'signin' && methods.mail}
							<a href={resolve('/forgot-password')}>{t.auth.forgot}</a>
						{/if}
					</span>
					<input
						name="password"
						type="password"
						autocomplete={creating ? 'new-password' : 'current-password'}
						minlength={creating ? MIN_PASSWORD_LENGTH : undefined}
						required
						bind:value={password}
					/>
					{#if creating}<span class="hint">{t.auth.passwordHint}</span>{/if}
				</label>
				<button class="btn btn-primary" type="submit" disabled={busy}>
					{mode === 'setup' ? t.auth.createAdmin : creating ? t.auth.signUp : t.auth.signIn}
				</button>
			</form>
		{/if}

		{#if methods.emailPassword && hasOther}
			<div class="divider"><span>{t.common.or}</span></div>
		{/if}

		{#if hasOther}
			<div class="stack">
				{#if methods.passkey && !creating}
					<button class="btn" type="button" onclick={signInPasskey} disabled={busy}>
						{t.auth.passkey}
					</button>
				{/if}
				{#each methods.social as provider (provider.id)}
					<button
						class="btn"
						type="button"
						onclick={() => signInSocial(provider.id)}
						disabled={busy}
					>
						{format(t.auth.continueWith, { name: provider.label })}
					</button>
				{/each}
			</div>
		{/if}

		{#if mode === 'signin' && methods.allowSignup && methods.emailPassword}
			<p class="muted footer">
				{t.auth.noAccount} <a href={resolve('/signup')}>{t.auth.signUp}</a>
			</p>
		{:else if mode === 'signup'}
			<p class="muted footer">
				{t.auth.haveAccount} <a href={resolve('/login')}>{t.auth.signIn}</a>
			</p>
		{/if}
	{/if}
</section>

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
		font-size: 13px;
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--muted);
		font-size: 13px;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.footer {
		font-size: 14px;
	}

	.label-row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}

	.label-row a {
		font-size: 14px;
	}

	.link {
		align-self: flex-start;
		font: inherit;
		font-size: 14px;
		border: 0;
		padding: 0;
		background: none;
		color: var(--accent);
		cursor: pointer;
	}

	a {
		color: var(--accent);
	}
</style>
