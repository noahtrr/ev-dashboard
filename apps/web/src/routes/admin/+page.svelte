<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import TopBar from '#lib/components/TopBar.svelte';
	import { format, messages, relativeTime } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const a = $derived(t.admin);
	const localeTag = $derived(data.locale === 'de' ? 'de-DE' : 'en-GB');
	const date = (value: Date | null) => (value ? value.toLocaleDateString(localeTag) : '');

	// --- Users ---
	type Filter = 'all' | 'admins' | 'recent' | 'locked';
	let filter = $state<Filter>('all');
	let query = $state('');
	const weekAgo = Date.now() - 7 * 86_400_000;
	const shown = $derived(
		data.users.filter((u) => {
			const q = query.trim().toLowerCase();
			if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q))
				return false;
			if (filter === 'admins') return u.role === 'admin';
			if (filter === 'recent') return u.createdAt.getTime() > weekAgo;
			if (filter === 'locked') return u.lockedAt !== null;
			return true;
		})
	);
	const methodName = (m: string) => a.methods[m as keyof typeof a.methods] ?? m;
	const vehicleText = (n: number) =>
		n === 0
			? a.vehicles.none
			: n === 1
				? a.vehicles.one
				: format(a.vehicles.many, { count: String(n) });
	const meta = (u: (typeof data.users)[number]) =>
		[
			format(a.since, { date: date(u.createdAt) }),
			u.lockedAt
				? format(a.lockedOn, { date: date(u.lockedAt) })
				: u.lastActiveAt
					? format(a.activeAt, { when: relativeTime(u.lastActiveAt, data.locale) })
					: a.neverActive,
			vehicleText(u.vehicles),
			u.methods.map(methodName).join(', ')
		]
			.filter(Boolean)
			.join(' · ');

	// --- Invitations and mail ---
	const invites = $derived(t.invites);
	const inviteResult = $derived.by(() => {
		if (form && 'inviteError' in form && form.inviteError) {
			return { ok: false, text: invites[form.inviteError as 'invalid' | 'exists' | 'failed'] };
		}
		if (form && 'inviteSent' in form && form.inviteSent) {
			return { ok: true, text: format(invites.sent, { email: form.inviteSent }) };
		}
		return undefined;
	});
	const inviteState = (item: {
		state: string;
		createdAt: Date;
		expiresAt: Date;
		acceptedAt: Date | null;
	}) =>
		format(invites.states[item.state as 'pending' | 'expired' | 'accepted'], {
			date: date(item.acceptedAt ?? item.createdAt),
			until: date(item.expiresAt)
		});
	let inviteBusy = $state(false);
	const submitInvite = () => {
		inviteBusy = true;
		return async ({
			result,
			update
		}: {
			result: { type: string };
			update: (o?: { reset?: boolean }) => Promise<void>;
		}) => {
			await update({ reset: result.type === 'success' });
			inviteBusy = false;
		};
	};
</script>

<svelte:head>
	<title>{a.title} · {t.common.appName}</title>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<h1>{a.title}</h1>

	{#if page.url.searchParams.has('deleted')}
		<p class="notice notice-ok" role="status">{a.deleted}</p>
	{/if}

	<section class="card" aria-labelledby="signup-title">
		<div class="head">
			<h2 id="signup-title">{a.signup}</h2>
			<span class="badge {data.allowSignup ? 'warn' : 'ok'}"
				>{data.allowSignup ? a.signupOpen : a.signupClosed}</span
			>
		</div>
		<p class="muted">
			{#if data.allowSignup}
				{format(a.signupOpenText, {
					confirm: data.mail ? a.withConfirm : a.withoutConfirm,
					variable: 'AUTH_ALLOW_SIGNUP=false'
				})}
			{:else}
				{format(a.signupClosedText, {
					invites: data.mail ? '' : a.noInvites,
					variable: 'AUTH_ALLOW_SIGNUP=true'
				})}
			{/if}
		</p>
		<p class="stats">
			<span><strong>{data.stats.total}</strong> {a.accounts}</span>
			<span><strong>{data.stats.recent}</strong> {a.recent}</span>
			<span><strong>{data.stats.locked}</strong> {a.locked}</span>
		</p>
	</section>

	<section class="card" aria-labelledby="users-title">
		<h2 id="users-title">{a.users}</h2>
		<label class="field">
			<span class="sr-only">{a.search}</span>
			<input type="search" bind:value={query} placeholder={a.search} autocomplete="off" />
		</label>
		<div class="filters" role="group" aria-label={a.users}>
			{#each ['all', 'admins', 'recent', 'locked'] as const as key (key)}
				<button
					type="button"
					class="chip"
					aria-pressed={filter === key}
					onclick={() => (filter = key)}>{a.filters[key]}</button
				>
			{/each}
		</div>
		{#if shown.length === 0}
			<p class="muted small">{a.none}</p>
		{:else}
			<ul class="users">
				{#each shown as u (u.id)}
					<li class:dim={u.lockedAt !== null}>
						<a href={resolve('/admin/users/[id]', { id: u.id })}>
							<span class="avatar" aria-hidden="true"
								>{(u.name || u.email).trim().charAt(0).toUpperCase()}</span
							>
							<span class="who">
								<span class="name"
									>{u.name}
									{#if u.id === data.user?.id}<span class="badge">{a.badges.you}</span>{/if}
									{#if u.role === 'admin'}<span class="badge accent">{a.badges.admin}</span>{/if}
									{#if u.lockedAt}<span class="badge danger">{a.badges.locked}</span>{/if}
									{#if !u.emailVerified && data.mail}<span class="badge warn"
											>{a.badges.unverified}</span
										>{/if}
								</span>
								<span class="muted small email">{u.email}</span>
								<span class="muted tiny">{meta(u)}</span>
							</span>
							<span class="chevron" aria-hidden="true">›</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if !data.mail}
		<section class="card" aria-labelledby="mail-off-title">
			<h2 id="mail-off-title">{t.invites.title}</h2>
			<p class="muted">{a.mailOff}</p>
		</section>
	{/if}
	{#if data.invitations}
		<section class="card" id="invitations" aria-labelledby="invitations-title">
			<h2 id="invitations-title">{invites.title}</h2>
			<p class="muted">{invites.intro}</p>
			{#if inviteResult}
				<p class="notice {inviteResult.ok ? 'notice-ok' : 'notice-error'}" role="status">
					{inviteResult.text}
				</p>
			{/if}
			<form class="row" method="POST" action="?/invite" use:enhance={submitInvite}>
				<label class="field grow">
					{invites.email}
					<input name="email" type="email" autocomplete="off" required />
				</label>
				<button class="btn btn-primary" type="submit" disabled={inviteBusy}>
					{invites.invite}
				</button>
			</form>
			{#if data.invitations.length === 0}
				<p class="muted small">{invites.none}</p>
			{:else}
				<ul class="list">
					{#each data.invitations as item (item.id)}
						<li class="invite">
							<div>
								<strong>{item.email}</strong>
								<span class="muted small">{inviteState(item)}</span>
							</div>
							{#if item.state !== 'accepted'}
								<span class="invite-actions">
									<form method="POST" action="?/resendInvite" use:enhance={submitInvite}>
										<input type="hidden" name="id" value={item.id} />
										<button
											class="btn btn-small"
											type="submit"
											disabled={inviteBusy}
											aria-label={format(invites.resendLabel, { email: item.email })}
											>{invites.resend}</button
										>
									</form>
									<form method="POST" action="?/revokeInvite" use:enhance={submitInvite}>
										<input type="hidden" name="id" value={item.id} />
										<button
											class="btn btn-small btn-danger"
											type="submit"
											disabled={inviteBusy}
											aria-label={format(invites.revokeLabel, { email: item.email })}
											>{invites.revoke}</button
										>
									</form>
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	{#if data.mailInfo}
		<section class="card" aria-labelledby="mail-title">
			<h2 id="mail-title">{t.mail.title}</h2>
			<dl class="mail-info">
				<div>
					<dt>{t.mail.server}</dt>
					<dd class="mono">{data.mailInfo.host}:{data.mailInfo.port}</dd>
				</div>
				<div>
					<dt>{t.mail.from}</dt>
					<dd>{data.mailInfo.from}</dd>
				</div>
			</dl>
			<form class="row" method="POST" action="?/testMail" use:enhance>
				<button class="btn" type="submit">{t.mail.test}</button>
			</form>
			{#if form && 'testSent' in form && form.testSent}
				<p class="notice notice-ok" role="status">
					{format(t.mail.testSent, { email: form.testSent })}
				</p>
			{:else if form && 'testError' in form && form.testError}
				<p class="notice notice-error" role="alert">
					{format(t.mail.testFailed, { error: form.testError })}
				</p>
			{/if}
			<p class="muted small">{t.mail.note}</p>
		</section>
	{/if}
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

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 1px 8px;
		border-radius: 999px;
		border: 1px solid var(--border);
		color: var(--muted);
		font-size: 12px;
		font-weight: 400;
		white-space: nowrap;
	}

	.badge.ok {
		border-color: var(--ok);
		color: var(--ok);
	}

	.badge.warn {
		border-color: var(--warn);
		color: var(--warn);
	}

	.badge.danger {
		border-color: var(--danger);
		color: var(--danger);
	}

	.badge.accent {
		border-color: var(--accent);
		color: var(--accent);
	}

	.stats {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		font-size: 14px;
		color: var(--muted);
	}

	.stats strong {
		color: var(--text);
		font-weight: 600;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		min-height: 36px;
		padding: 0 14px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}

	.chip[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--accent);
	}

	.users {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.users li {
		border-top: 1px solid var(--border);
	}

	.users li.dim {
		opacity: 0.65;
	}

	.users a {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 0;
		color: inherit;
		text-decoration: none;
	}

	.users a:hover .name {
		color: var(--accent);
	}

	.avatar {
		flex: none;
		width: 36px;
		height: 36px;
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		color: var(--accent);
		font-weight: 600;
	}

	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.name {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-weight: 500;
	}

	.email {
		overflow-wrap: anywhere;
	}

	.tiny {
		font-size: 12px;
	}

	.chevron {
		color: var(--muted);
		font-size: 20px;
		line-height: 36px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 12px;
	}

	.grow {
		flex: 1 1 200px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 0;
		border-top: 1px solid var(--border);
	}

	.list li div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.small {
		margin: 0;
		font-size: 13px;
	}

	.btn-small {
		min-height: 40px;
		padding: 0 14px;
		font-size: 14px;
	}

	.list li.invite {
		flex-wrap: wrap;
	}

	.list li.invite div {
		flex: 1 1 180px;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.invite-actions {
		display: flex;
		gap: 8px;
	}

	.mail-info {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.mail-info div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 14px;
	}

	.mail-info dt {
		color: var(--muted);
	}

	.mail-info dd {
		margin: 0;
		text-align: right;
		overflow-wrap: anywhere;
	}
</style>
