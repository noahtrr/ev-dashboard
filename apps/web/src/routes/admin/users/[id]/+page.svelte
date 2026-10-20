<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import { format, messages, relativeTime } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const a = $derived(t.admin);
	const localeTag = $derived(data.locale === 'de' ? 'de-DE' : 'en-GB');
	const date = (value: Date | null) => (value ? value.toLocaleDateString(localeTag) : '');
	const dateTime = (value: Date | null) =>
		value ? value.toLocaleString(localeTag, { dateStyle: 'medium', timeStyle: 'short' }) : '';

	const u = $derived(data.account);
	const methodName = (m: string) => a.methods[m as keyof typeof a.methods] ?? m;
	const vehicleText = (n: number) =>
		n === 0
			? a.vehicles.none
			: n === 1
				? a.vehicles.one
				: format(a.vehicles.many, { count: String(n) });

	const notice = $derived.by(() => {
		if (!form) return undefined;
		if ('error' in form && form.error === 'confirm') return undefined;
		if ('error' in form && form.error) {
			return { ok: false, text: a.errors[form.error as keyof typeof a.errors] ?? t.common.error };
		}
		if ('roleSaved' in form) return { ok: true, text: a.roleSaved };
		if ('signedOut' in form) return { ok: true, text: a.signedOut };
		if ('locked' in form) return { ok: true, text: a.lockedDone };
		if ('unlocked' in form) return { ok: true, text: a.unlockedDone };
		return undefined;
	});

	let confirming = $state(false);
	let busy = $state(false);
	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>{u.name} · {a.title} · {t.common.appName}</title>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<a class="back" href={resolve('/admin')}>‹ {a.back}</a>

	<div class="profile">
		<span class="avatar" aria-hidden="true"
			>{(u.name || u.email).trim().charAt(0).toUpperCase()}</span
		>
		<div class="who">
			<h1>
				{u.name}
				{#if u.role === 'admin'}<span class="badge accent">{a.badges.admin}</span>{/if}
				{#if u.lockedAt}<span class="badge danger">{a.badges.locked}</span>{/if}
			</h1>
			<span class="muted email">{u.email}</span>
		</div>
	</div>

	{#if notice}
		<p class="notice {notice.ok ? 'notice-ok' : 'notice-error'}" role="status">{notice.text}</p>
	{/if}

	<section class="card" aria-labelledby="overview-title">
		<h2 id="overview-title">{a.overview}</h2>
		<dl class="facts">
			<div>
				<dt>{a.registered}</dt>
				<dd>{date(u.createdAt)}</dd>
			</div>
			<div>
				<dt>{a.email}</dt>
				<dd>
					{u.emailVerified
						? a.emailVerified
						: data.mail
							? a.emailUnverified
							: a.emailUnverifiedNoMail}
				</dd>
			</div>
			<div>
				<dt>{a.signInWith}</dt>
				<dd>{u.methods.map(methodName).join(', ') || '–'}</dd>
			</div>
			<div>
				<dt>{a.vehiclesLabel}</dt>
				<dd>{vehicleText(u.vehicles)}</dd>
			</div>
			<div>
				<dt>{a.lastActive}</dt>
				<dd>{u.lastActiveAt ? dateTime(u.lastActiveAt) : a.never}</dd>
			</div>
		</dl>
		<p class="muted small">{a.privacy}</p>
	</section>

	<section class="card" aria-labelledby="sessions-title">
		<div class="head">
			<h2 id="sessions-title">{a.sessions}</h2>
			{#if u.sessions.length > 0}
				<form method="POST" action="?/signOut" use:enhance={submit}>
					<button class="link" type="submit" disabled={busy}>{a.signOutAll}</button>
				</form>
			{/if}
		</div>
		{#if u.sessions.length === 0}
			<p class="muted small">{a.noSessions}</p>
		{:else}
			<ul class="sessions">
				{#each u.sessions as s (s.id)}
					<li>
						<span class="device">
							<span>{s.device || a.unknownDevice}</span>
							{#if s.ip}<span class="muted tiny mono">{s.ip}</span>{/if}
						</span>
						<span class="muted small">{relativeTime(s.lastActiveAt, data.locale)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.self}
		<p class="muted small">{a.selfHint}</p>
	{:else}
		<section class="card" aria-labelledby="role-title">
			<h2 id="role-title">{a.role}</h2>
			<form class="segmented" method="POST" action="?/role" use:enhance={submit}>
				{#each ['user', 'admin'] as const as role (role)}
					<button
						type="submit"
						name="role"
						value={role}
						aria-pressed={u.role === role}
						disabled={busy || u.role === role}>{a.roles[role]}</button
					>
				{/each}
			</form>
			<p class="muted small">{a.roleHint}</p>
		</section>

		<section class="card" aria-labelledby="access-title">
			<h2 id="access-title">{a.access}</h2>
			{#if u.lockedAt}
				<p class="locked">
					{format(a.lockedSince, { date: date(u.lockedAt) })}
					{#if u.lockReason}{format(a.lockedReason, { reason: u.lockReason })}{/if}
				</p>
				<div class="actions">
					<form method="POST" action="?/unlock" use:enhance={submit}>
						<button class="btn btn-small" type="submit" disabled={busy}>{a.unlock}</button>
					</form>
					<button class="btn btn-small btn-danger" type="button" onclick={() => (confirming = true)}
						>{a.deleteAccount}</button
					>
				</div>
			{:else}
				<form class="stack" method="POST" action="?/lock" use:enhance={submit}>
					<label class="field">
						{a.reason}
						<input name="reason" maxlength="200" autocomplete="off" />
					</label>
					<div class="actions">
						<button class="btn btn-small" type="submit" disabled={busy}>{a.lock}</button>
						<button
							class="btn btn-small btn-danger"
							type="button"
							onclick={() => (confirming = true)}>{a.deleteAccount}</button
						>
					</div>
				</form>
			{/if}
			<p class="muted small">{a.accessHint}</p>
		</section>
	{/if}
</main>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (confirming = false)} />

{#if confirming}
	<div class="sheet-backdrop" role="presentation" onclick={() => (confirming = false)}></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="delete-title">
		<h2 id="delete-title">{format(a.deleteTitle, { name: u.name })}</h2>
		<p class="muted">
			{format(a.deleteText, {
				vehicles: vehicleText(u.vehicles),
				trips: String(u.trips),
				charges: String(u.chargeSessions)
			})}
		</p>
		{#if form && 'error' in form && form.error === 'confirm'}
			<p class="notice notice-error" role="alert">{a.errors.confirm}</p>
		{/if}
		<form class="stack" method="POST" action="?/delete" use:enhance={submit}>
			<label class="field">
				<span class="sr-only">{a.email}</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					name="email"
					type="email"
					placeholder={u.email}
					autocomplete="off"
					required
					autofocus
				/>
			</label>
			<div class="actions">
				<button class="btn grow" type="button" onclick={() => (confirming = false)}
					>{a.cancel}</button
				>
				<button class="btn btn-danger grow" type="submit" disabled={busy}>{a.deleteConfirm}</button>
			</div>
		</form>
	</div>
{/if}

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
		color: var(--accent);
		text-decoration: none;
		font-size: 14px;
	}

	.profile {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.avatar {
		flex: none;
		width: 52px;
		height: 52px;
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		color: var(--accent);
		font-weight: 600;
		font-size: 20px;
	}

	.who {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 600;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.email {
		overflow-wrap: anywhere;
	}

	.badge {
		display: inline-flex;
		padding: 1px 8px;
		border-radius: 999px;
		border: 1px solid var(--border);
		font-size: 12px;
		font-weight: 400;
	}

	.badge.accent {
		border-color: var(--accent);
		color: var(--accent);
	}

	.badge.danger {
		border-color: var(--danger);
		color: var(--danger);
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.facts {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.facts div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 14px;
	}

	.facts dt {
		color: var(--muted);
	}

	.facts dd {
		margin: 0;
		text-align: right;
	}

	.sessions {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.sessions li {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		padding: 10px 0;
		border-top: 1px solid var(--border);
	}

	.device {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.link {
		border: 0;
		padding: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}

	.segmented {
		display: flex;
		padding: 4px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--bg);
	}

	.segmented button {
		flex: 1;
		min-height: 38px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}

	.segmented button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--text);
		cursor: default;
	}

	.locked {
		margin: 0;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid var(--danger);
		color: var(--danger);
		font-size: 14px;
		line-height: 1.45;
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.grow {
		flex: 1;
	}

	.small {
		margin: 0;
		font-size: 13px;
	}

	.tiny {
		font-size: 12px;
	}

	.btn-small {
		min-height: 40px;
		padding: 0 14px;
		font-size: 14px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.sheet-backdrop {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.55);
		z-index: 20;
	}

	.sheet {
		position: fixed;
		left: 50%;
		bottom: 0;
		transform: translateX(-50%);
		width: min(100%, 560px);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 24px 20px 28px;
		border-radius: 22px 22px 0 0;
		background: var(--surface);
		border: 1px solid var(--border);
		z-index: 21;
	}

	.sheet h2 {
		margin: 0;
		font-size: 19px;
	}
</style>
