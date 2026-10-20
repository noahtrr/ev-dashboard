<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '#lib/auth-client.ts';
	import type { Messages } from '#lib/i18n.ts';

	type Props = { user: { name: string; email: string; role: string }; t: Messages };

	let { user, t }: Props = $props();
	let busy = $state(false);

	const initial = $derived((user.name || user.email).trim().charAt(0).toUpperCase());

	async function signOut() {
		busy = true;
		try {
			await authClient.signOut();
			// Pages kept for offline use belong to this account (see the service worker).
			await globalThis.caches?.delete('pages').catch(() => {});
		} finally {
			busy = false;
		}
		await goto(resolve('/login'), { invalidateAll: true });
	}
</script>

<details class="menu">
	<summary aria-label={t.menu.open}>
		<span class="avatar" aria-hidden="true">{initial}</span>
	</summary>
	<div class="panel">
		<div class="who">
			<strong>{user.name}</strong>
			<span class="muted">{user.email}</span>
			{#if user.role === 'admin'}<span class="label">{t.menu.admin}</span>{/if}
		</div>
		<a class="btn" href={resolve('/account')}>{t.menu.account}</a>
		{#if user.role === 'admin'}
			<a class="btn" href={resolve('/admin')}>{t.menu.manage}</a>
		{/if}
		<button class="btn" type="button" onclick={signOut} disabled={busy}>{t.menu.signOut}</button>
	</div>
</details>

<style>
	.menu {
		position: relative;
	}

	summary {
		list-style: none;
		cursor: pointer;
		border-radius: 999px;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.avatar {
		width: 40px;
		height: 40px;
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--accent);
		font-weight: 600;
	}

	.panel {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		min-width: 240px;
		padding: 16px;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 8px;
		z-index: 10;
	}

	.who {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 8px;
		overflow-wrap: anywhere;
	}

	.who .muted {
		font-size: 14px;
	}
</style>
