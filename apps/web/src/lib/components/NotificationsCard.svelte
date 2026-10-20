<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { format, type Messages } from '#lib/i18n.ts';
	import {
		LOW_CHARGE_LEVELS,
		NOTIFICATION_EVENTS,
		type NotificationEvent,
		type NotificationPrefs
	} from '#lib/notifications.ts';

	type Device = { id: string; endpoint: string; device: string | null; createdAt: Date };
	type Props = {
		t: Messages;
		publicKey: string;
		prefs: NotificationPrefs;
		devices: Device[];
		pollMinutes: number;
		date: (value: Date) => string;
	};

	let { t, publicKey, prefs: initialPrefs, devices, pollMinutes, date }: Props = $props();
	const n = $derived(t.notifications);

	// svelte-ignore state_referenced_locally
	let prefs = $state(initialPrefs);
	/** 'unsupported' | 'install' (iOS outside the installed app) | 'ready', decided in the browser. */
	let support = $state<'unknown' | 'unsupported' | 'install' | 'ready'>('unknown');
	let endpoint = $state<string | null>(null);
	let busy = $state(false);
	let notice = $state<{ ok: boolean; text: string } | null>(null);

	const others = $derived(devices.filter((d) => d.endpoint !== endpoint));
	const current = $derived(devices.find((d) => d.endpoint === endpoint));

	const keyBytes = (value: string) =>
		Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

	async function api(path: string, method: string, body: unknown) {
		const response = await fetch(path, {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!response.ok) throw new Error(String(response.status));
		return response.json();
	}

	const registration = () => navigator.serviceWorker.ready;

	onMount(() => {
		const ua = navigator.userAgent;
		const appleTouch =
			/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
		const standalone =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true;
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
			// Safari on iOS only offers push inside the app added to the home screen.
			support = appleTouch && !standalone ? 'install' : 'unsupported';
			return;
		}
		support = 'ready';
		// A subscription the server no longer knows (removed on another device) shows as off.
		void registration()
			.then((reg) => reg.pushManager.getSubscription())
			.then((subscription) => (endpoint = subscription?.endpoint ?? null))
			.catch(() => {});
	});

	async function enable() {
		busy = true;
		notice = null;
		try {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				notice = { ok: false, text: n.denied };
				return;
			}
			const reg = await registration();
			// A subscription made with an earlier key of this instance cannot be reused.
			await (await reg.pushManager.getSubscription())?.unsubscribe();
			const subscription = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: keyBytes(publicKey)
			});
			await api('/api/notifications/subscription', 'POST', { subscription });
			endpoint = subscription.endpoint;
			await invalidateAll();
		} catch {
			notice = { ok: false, text: n.failed };
		} finally {
			busy = false;
		}
	}

	async function disable() {
		busy = true;
		notice = null;
		try {
			const subscription = await (await registration()).pushManager.getSubscription();
			if (subscription) {
				await api('/api/notifications/subscription', 'DELETE', {
					endpoint: subscription.endpoint
				});
				await subscription.unsubscribe();
			}
			endpoint = null;
			await invalidateAll();
		} catch {
			notice = { ok: false, text: t.common.error };
		} finally {
			busy = false;
		}
	}

	async function remove(id: string) {
		busy = true;
		notice = null;
		try {
			await api('/api/notifications/subscription', 'DELETE', { id });
			await invalidateAll();
		} catch {
			notice = { ok: false, text: t.common.error };
		} finally {
			busy = false;
		}
	}

	async function test() {
		if (!endpoint) return;
		busy = true;
		notice = null;
		try {
			const { result } = await api('/api/notifications/test', 'POST', { endpoint });
			if (result === 'sent') notice = { ok: true, text: n.testSent };
			else if (result === 'gone') {
				// The push service dropped this browser; the server already forgot it.
				await (await registration()).pushManager.getSubscription().then((s) => s?.unsubscribe());
				endpoint = null;
				notice = { ok: false, text: n.expired };
				await invalidateAll();
			} else notice = { ok: false, text: n.testFailed };
		} catch {
			notice = { ok: false, text: n.testFailed };
		} finally {
			busy = false;
		}
	}

	async function save(next: NotificationPrefs) {
		const before = prefs;
		prefs = next;
		notice = null;
		try {
			prefs = (await api('/api/notifications/prefs', 'PUT', { prefs: next })).prefs;
		} catch {
			prefs = before;
			notice = { ok: false, text: t.common.error };
		}
	}

	const toggle = (event: NotificationEvent) =>
		save({ ...prefs, events: { ...prefs.events, [event]: !prefs.events[event] } });
</script>

<section class="card" id="notifications" aria-labelledby="notifications-title">
	<h2 id="notifications-title">{n.title}</h2>

	{#if support === 'unsupported'}
		<p class="muted">{n.unsupported}</p>
	{:else if support === 'install'}
		<p class="muted">{n.installFirst}</p>
	{:else if support === 'ready' && !current}
		<p class="muted">{n.intro}</p>
		<button class="btn btn-primary enable" type="button" disabled={busy} onclick={enable}>
			{n.enable}
		</button>
	{/if}

	{#if current || others.length > 0}
		<ul class="devices">
			{#if current}
				<li>
					<span class="device">
						<span>{n.thisDevice}{current.device ? ` · ${current.device}` : ''}</span>
						<span class="muted small">{format(n.since, { date: date(current.createdAt) })}</span>
					</span>
					<button class="link" type="button" disabled={busy} onclick={disable}>{n.disable}</button>
				</li>
			{/if}
			{#each others as d (d.id)}
				<li>
					<span class="device">
						<span>{d.device ?? n.unknownDevice}</span>
						<span class="muted small">{format(n.since, { date: date(d.createdAt) })}</span>
					</span>
					<button class="link" type="button" disabled={busy} onclick={() => remove(d.id)}>
						{n.remove}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if current}
		<button class="btn btn-small test" type="button" disabled={busy} onclick={test}>{n.test}</button
		>
	{/if}

	{#if notice}
		<p
			class="notice {notice.ok ? 'notice-ok' : 'notice-error'}"
			role={notice.ok ? 'status' : 'alert'}
		>
			{notice.text}
		</p>
	{/if}

	<h3>{n.when}</h3>
	<ul class="events">
		{#each NOTIFICATION_EVENTS as event (event)}
			<li>
				<span class="entry" id="event-{event}">
					<span class="name">{n.events[event].title}</span>
					<span class="muted text">{n.events[event].text}</span>
				</span>
				<button
					class="switch"
					type="button"
					role="switch"
					aria-checked={prefs.events[event]}
					aria-labelledby="event-{event}"
					onclick={() => toggle(event)}
				>
					<span class="knob"></span>
				</button>
				{#if event === 'lowCharge' && prefs.events.lowCharge}
					<span class="levels">
						{#each LOW_CHARGE_LEVELS as pct (pct)}
							<button
								type="button"
								class="chip"
								aria-pressed={prefs.lowChargePct === pct}
								aria-label={format(n.level, { pct: String(pct) })}
								onclick={() => save({ ...prefs, lowChargePct: pct })}>{pct} %</button
							>
						{/each}
					</span>
				{/if}
			</li>
		{/each}
	</ul>
	<p class="muted small">{format(n.note, { minutes: String(pollMinutes) })}</p>
</section>

<style>
	.small {
		margin: 0;
		font-size: 13px;
	}

	.btn-small {
		min-height: 40px;
		padding: 0 14px;
		font-size: 14px;
	}

	h3 {
		margin: 8px 0 0;
		font-size: 14px;
		font-weight: 500;
		color: var(--muted);
	}

	.enable,
	.test {
		align-self: flex-start;
	}

	.devices,
	.events {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.devices {
		gap: 8px;
	}

	.devices li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 14px;
	}

	.device {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.link {
		flex: none;
		border: 0;
		background: none;
		padding: 8px 0;
		color: var(--accent);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}

	.events li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		padding: 12px 0;
		border-top: 1px solid var(--border);
	}

	.entry {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.name {
		font-size: 15px;
		font-weight: 500;
	}

	.text {
		font-size: 13px;
	}

	.levels {
		flex-basis: 100%;
		display: flex;
		gap: 6px;
	}

	.chip {
		min-height: 32px;
		padding: 0 12px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}

	.chip[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--accent);
	}

	.switch {
		flex: none;
		width: 48px;
		height: 28px;
		padding: 3px;
		border: 0;
		border-radius: 999px;
		background: var(--border);
		cursor: pointer;
		display: flex;
		justify-content: flex-start;
		transition: background 150ms ease;
	}

	.switch[aria-checked='true'] {
		background: var(--accent);
		justify-content: flex-end;
	}

	.knob {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--surface);
	}

	.link:focus-visible,
	.chip:focus-visible,
	.switch:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
