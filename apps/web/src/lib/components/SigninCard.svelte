<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '#lib/auth-client.ts';
	import { authErrorMessage, MIN_PASSWORD_LENGTH } from '#lib/auth-shared.ts';
	import { format, type Messages } from '#lib/i18n.ts';

	type Props = {
		signin: { email: string; emailVerified: boolean; hasPassword: boolean };
		/** Mail is set up. */
		mail: boolean;
		t: Messages;
	};

	let { signin, mail, t }: Props = $props();
	const s = $derived(t.signin);

	let open = $state<'email' | 'password' | null>(null);
	let busy = $state(false);
	let error = $state('');
	let info = $state('');
	let newEmail = $state('');
	let currentPassword = $state('');
	let newPassword = $state('');

	// Confirmation links bring the owner back to this page.
	const callbackURL = '/account';

	async function act(
		action: () => Promise<{ error: { code?: string; status?: number } | null }>,
		done: string
	) {
		busy = true;
		error = '';
		info = '';
		try {
			const result = await action();
			if (result.error) {
				error =
					result.error.code?.toUpperCase() === 'INVALID_PASSWORD'
						? s.wrongPassword
						: authErrorMessage(t, result.error);
				return;
			}
			info = done;
			open = null;
			await invalidateAll();
		} catch {
			error = t.common.error;
		} finally {
			busy = false;
		}
	}

	const sendVerification = () =>
		act(
			() => authClient.sendVerificationEmail({ email: signin.email, callbackURL }),
			s.verificationSent
		);

	function changeEmail(event: SubmitEvent) {
		event.preventDefault();
		const email = newEmail.trim();
		act(
			() => authClient.changeEmail({ newEmail: email, callbackURL }),
			format(s.changeEmailSent, { email })
		).then(() => (newEmail = ''));
	}

	function changePassword(event: SubmitEvent) {
		event.preventDefault();
		act(
			() => authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true }),
			s.passwordChanged
		).then(() => {
			currentPassword = '';
			newPassword = '';
		});
	}

	const toggle = (which: 'email' | 'password') => {
		open = open === which ? null : which;
		error = '';
		info = '';
	};
</script>

<section class="card" aria-labelledby="signin-title">
	<h2 id="signin-title">{s.title}</h2>
	<div class="email">
		<span class="muted small">{s.email}</span>
		<span class="address">
			{signin.email}
			{#if mail}
				<span class="badge" class:ok={signin.emailVerified}>
					{signin.emailVerified ? s.verified : s.unverified}
				</span>
			{/if}
		</span>
		{#if mail && !signin.emailVerified}
			<button class="link" type="button" onclick={sendVerification} disabled={busy}>
				{s.sendVerification}
			</button>
		{/if}
	</div>

	{#if error}
		<p class="notice notice-error" role="alert">{error}</p>
	{:else if info}
		<p class="notice notice-ok" role="status">{info}</p>
	{/if}

	{#if mail || signin.hasPassword}
		<div class="actions">
			{#if mail}
				<button
					class="btn"
					type="button"
					aria-expanded={open === 'email'}
					onclick={() => toggle('email')}
				>
					{s.changeEmail}
				</button>
			{/if}
			{#if signin.hasPassword}
				<button
					class="btn"
					type="button"
					aria-expanded={open === 'password'}
					onclick={() => toggle('password')}
				>
					{s.changePassword}
				</button>
			{/if}
		</div>
	{/if}

	{#if open === 'email'}
		<form class="row" onsubmit={changeEmail}>
			<label class="field grow">
				{s.newEmail}
				<input type="email" autocomplete="email" required bind:value={newEmail} />
			</label>
			<button class="btn btn-primary" type="submit" disabled={busy}>{s.save}</button>
		</form>
		<p class="muted small">{s.changeEmailNote}</p>
	{:else if open === 'password'}
		<form class="stack" onsubmit={changePassword}>
			<input type="email" autocomplete="username" value={signin.email} hidden readonly />
			<label class="field">
				{s.currentPassword}
				<input
					type="password"
					autocomplete="current-password"
					required
					bind:value={currentPassword}
				/>
			</label>
			<label class="field">
				{s.newPassword}
				<input
					type="password"
					autocomplete="new-password"
					minlength={MIN_PASSWORD_LENGTH}
					required
					bind:value={newPassword}
				/>
				<span class="small">{t.auth.passwordHint}</span>
			</label>
			<button class="btn btn-primary" type="submit" disabled={busy}>{s.save}</button>
		</form>
	{/if}

	{#if !mail}
		<p class="muted small">{s.noMail}</p>
	{/if}
</section>

<style>
	.email {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.address {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 15px;
		overflow-wrap: anywhere;
	}

	.badge {
		display: inline-flex;
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px solid var(--warn);
		color: var(--warn);
		font-size: 12px;
	}

	.badge.ok {
		border-color: var(--ok);
		color: var(--ok);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 12px;
	}

	.grow {
		flex: 1;
		min-width: 200px;
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.small {
		margin: 0;
		font-size: 13px;
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
</style>
