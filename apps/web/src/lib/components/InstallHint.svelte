<script lang="ts">
	import { onMount } from 'svelte';
	import type { Messages } from '#lib/i18n.ts';

	type Props = { t: Messages };
	let { t }: Props = $props();
	const a = $derived(t.app);

	/** Chrome and Edge fire this when the app can be installed; not part of the DOM typings. */
	type InstallPrompt = Event & { prompt: () => Promise<void> };

	/** Splits a message around `{key}` so the button name inside it can be emphasised. */
	const around = (text: string, key: string, value: string) => {
		const [before, after = ''] = text.split(`{${key}}`);
		return [before, value, after] as const;
	};

	const DISMISSED = 'install-hint-dismissed';
	let prompt = $state<InstallPrompt | null>(null);
	let ios = $state(false);
	let dismissed = $state(true);

	onMount(() => {
		const standalone =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true;
		if (standalone) return;
		try {
			dismissed = localStorage.getItem(DISMISSED) === '1';
		} catch {
			dismissed = false;
		}
		const ua = navigator.userAgent;
		// iPadOS reports itself as a Mac; touch support tells them apart. Only Safari can add apps.
		const appleTouch =
			/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
		ios = appleTouch && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

		const onPrompt = (event: Event) => {
			event.preventDefault();
			prompt = event as InstallPrompt;
		};
		const onInstalled = () => (prompt = null);
		addEventListener('beforeinstallprompt', onPrompt);
		addEventListener('appinstalled', onInstalled);
		return () => {
			removeEventListener('beforeinstallprompt', onPrompt);
			removeEventListener('appinstalled', onInstalled);
		};
	});

	function dismiss() {
		dismissed = true;
		try {
			localStorage.setItem(DISMISSED, '1');
		} catch {
			// Private mode: the hint simply returns next time.
		}
	}

	async function install() {
		const event = prompt;
		prompt = null;
		await event?.prompt();
	}
</script>

{#if !dismissed && prompt}
	<aside class="hint" aria-labelledby="install-title">
		<img class="icon" src="/icons/icon-192.png" alt="" width="44" height="44" />
		<span class="text">
			<strong id="install-title">{a.installTitle}</strong>
			<span class="muted">{a.installText}</span>
		</span>
		<span class="actions">
			<button class="btn btn-primary" type="button" onclick={install}>{a.install}</button>
			<button class="later" type="button" onclick={dismiss}>{a.later}</button>
		</span>
	</aside>
{:else if !dismissed && ios}
	<aside class="hint ios" aria-labelledby="install-title">
		<span class="ios-head">
			<strong id="install-title">{a.iosTitle}</strong>
			<button class="close" type="button" aria-label={a.close} onclick={dismiss}>×</button>
		</span>
		<ol class="muted">
			{#each [around(a.iosShare, 'share', a.share), around(a.iosAdd, 'add', a.add)] as step, i (i)}
				<li>{step[0]}<strong>{step[1]}</strong>{step[2]}</li>
			{/each}
			<li>{a.iosOpen}</li>
		</ol>
	</aside>
{/if}

<style>
	.hint {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: calc(16px + env(safe-area-inset-bottom));
		max-width: 440px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border-radius: 18px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
		z-index: 30;
	}

	.icon {
		flex: none;
		border-radius: 11px;
	}

	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.text strong {
		font-weight: 500;
	}

	.text .muted {
		font-size: 13px;
	}

	.actions {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}

	.actions .btn {
		min-height: 36px;
		padding: 0 14px;
		font-size: 14px;
	}

	.later,
	.close {
		border: 0;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
		padding: 4px;
	}

	.ios {
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
	}

	.ios-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}

	.ios-head strong {
		font-weight: 500;
	}

	.close {
		font-size: 20px;
		line-height: 1;
	}

	ol {
		margin: 0;
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 14px;
		line-height: 1.4;
	}

	ol strong {
		color: var(--text);
		font-weight: 500;
	}
</style>
