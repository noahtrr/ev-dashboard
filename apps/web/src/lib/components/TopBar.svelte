<script lang="ts">
	import { resolve } from '$app/paths';
	import UserMenu from './UserMenu.svelte';
	import type { Messages } from '#lib/i18n.ts';

	type Props = { user: { name: string; email: string; role: string }; t: Messages };

	let { user, t }: Props = $props();
</script>

<header>
	<a class="brand" href={resolve('/')}>{t.common.appName}</a>
	<UserMenu {user} {t} />
</header>

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px var(--space);
		max-width: 960px;
		margin: 0 auto;
	}

	.brand {
		color: var(--text);
		text-decoration: none;
		font-weight: 600;
	}
</style>
