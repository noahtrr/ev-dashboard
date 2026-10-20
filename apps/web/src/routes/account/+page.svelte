<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { authClient } from '#lib/auth-client.ts';
	import SigninCard from '#lib/components/SigninCard.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const localeTag = $derived(data.locale === 'de' ? 'de-DE' : 'en-GB');
	const date = (value: Date | null) => (value ? value.toLocaleDateString(localeTag) : '');
	const dateTime = (value: Date | null) =>
		value ? value.toLocaleString(localeTag, { dateStyle: 'medium', timeStyle: 'short' }) : '';

	let passkeyName = $state('');
	let passkeyBusy = $state(false);
	let passkeyError = $state('');

	async function addPasskey() {
		passkeyBusy = true;
		passkeyError = '';
		try {
			const result = await authClient.passkey.addPasskey({ name: passkeyName.trim() || undefined });
			if (result?.error) passkeyError = t.account.passkeyError;
			else passkeyName = '';
			await invalidateAll();
		} catch {
			passkeyError = t.account.passkeyError;
		} finally {
			passkeyBusy = false;
		}
	}

	async function removePasskey(id: string) {
		passkeyBusy = true;
		passkeyError = '';
		try {
			const result = await authClient.passkey.deletePasskey({ id });
			if (result?.error) passkeyError = t.common.error;
			await invalidateAll();
		} finally {
			passkeyBusy = false;
		}
	}

	let replacing = $state(false);
	let vehicleBusy = $state(false);
	const showVehicleForm = $derived(!data.vehicleApi.configured || replacing);
	const vehicleError = $derived(
		form && 'vehicleError' in form && form.vehicleError
			? t.vehicle.errors[form.vehicleError as keyof typeof t.vehicle.errors]
			: ''
	);

	// --- Vehicle connections ---
	type Results = typeof t.connections.results;
	type Errors = typeof t.connections.errors;
	const resultParam = $derived(page.url.searchParams.get('vehicle'));
	const connectResult = $derived.by(() => {
		if (form && 'connectError' in form && form.connectError) {
			return { ok: false, text: t.connections.results[form.connectError as keyof Results] };
		}
		if (form && 'disconnected' in form && form.disconnected) {
			return { ok: true, text: t.connections.disconnected };
		}
		if (resultParam && resultParam in t.connections.results) {
			return {
				ok: resultParam === 'connected',
				text: t.connections.results[resultParam as keyof Results]
			};
		}
		return undefined;
	});
	const fetchResult = $derived(
		form && 'fetchResult' in form && form.fetchResult ? form.fetchResult : undefined
	);
	const errorText = (code: string | null | undefined) =>
		code && code in t.connections.errors ? t.connections.errors[code as keyof Errors] : '';

	let copied = $state(false);
	async function copyRedirectUri() {
		try {
			await navigator.clipboard.writeText(data.redirectUri);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}

	let confirming = $state<string | null>(null);
	let busyConnection = $state<string | null>(null);
	const submitConnection = (id: string) => () => {
		busyConnection = id;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busyConnection = null;
			confirming = null;
		};
	};

	const submitVehicle = () => {
		vehicleBusy = true;
		return async ({
			result,
			update
		}: {
			result: { type: string };
			update: () => Promise<void>;
		}) => {
			await update();
			if (result.type === 'success') replacing = false;
			vehicleBusy = false;
		};
	};
</script>

<svelte:head>
	<title>{t.account.title} · {t.common.appName}</title>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<h1>{t.account.title}</h1>

	<SigninCard signin={data.signin} mail={data.mail} {t} />

	{#if data.passkeysEnabled}
		<section class="card" aria-labelledby="passkeys">
			<h2 id="passkeys">{t.account.passkeys}</h2>
			<p class="muted">{t.account.passkeysIntro}</p>

			{#if passkeyError}
				<p class="notice notice-error" role="alert">{passkeyError}</p>
			{/if}

			{#if data.passkeys.length === 0}
				<p class="muted">{t.account.noPasskeys}</p>
			{:else}
				<ul class="list">
					{#each data.passkeys as item (item.id)}
						<li>
							<div>
								<strong>{item.name || t.account.unnamedPasskey}</strong>
								{#if item.createdAt}
									<span class="muted small">
										{format(t.account.addedOn, { date: date(item.createdAt) })}
									</span>
								{/if}
							</div>
							<button
								class="btn btn-danger"
								type="button"
								disabled={passkeyBusy}
								onclick={() => removePasskey(item.id)}
							>
								{t.account.removePasskey}
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			<form
				class="row"
				onsubmit={(event) => {
					event.preventDefault();
					addPasskey();
				}}
			>
				<label class="field grow">
					{t.account.passkeyName}
					<input
						bind:value={passkeyName}
						maxlength="64"
						placeholder={t.account.passkeyNamePlaceholder}
					/>
				</label>
				<button class="btn btn-primary" type="submit" disabled={passkeyBusy}>
					{t.account.addPasskey}
				</button>
			</form>
		</section>
	{/if}

	<section class="card" aria-labelledby="vehicle-api">
		<h2 id="vehicle-api">{t.vehicle.title}</h2>
		<p class="muted">{t.vehicle.intro}</p>

		{#if vehicleError}
			<p class="notice notice-error" role="alert">{vehicleError}</p>
		{:else if form && 'vehicleDeleted' in form && form.vehicleDeleted}
			<p class="notice notice-ok" role="status">{t.vehicle.deleted}</p>
		{/if}

		{#if showVehicleForm}
			<form class="stack" method="POST" action="?/saveVehicleApi" use:enhance={submitVehicle}>
				<label class="field">
					{t.vehicle.clientId}
					<input
						name="clientId"
						class="mono"
						autocomplete="off"
						spellcheck="false"
						required
						maxlength="256"
						value={data.vehicleApi.configured ? data.vehicleApi.clientId : ''}
					/>
				</label>
				<label class="field">
					{t.vehicle.clientSecret}
					<input
						name="clientSecret"
						type="password"
						class="mono"
						autocomplete="new-password"
						spellcheck="false"
						required
						maxlength="1024"
					/>
				</label>
				<div class="row">
					<button class="btn btn-primary" type="submit" disabled={vehicleBusy}>
						{t.vehicle.save}
					</button>
					{#if replacing}
						<button class="btn" type="button" onclick={() => (replacing = false)}>
							{t.common.cancel}
						</button>
					{/if}
				</div>
			</form>
		{:else if data.vehicleApi.configured}
			<div class="saved">
				<span class="status"><span class="dot" aria-hidden="true"></span>{t.vehicle.saved}</span>
				<dl>
					<dt>{t.vehicle.clientId}</dt>
					<dd class="mono">{data.vehicleApi.clientId}</dd>
					<dt>{t.vehicle.clientSecret}</dt>
					<dd class="mono">••••••••</dd>
				</dl>
				<span class="muted small">
					{format(t.vehicle.savedOn, { date: date(data.vehicleApi.updatedAt) })}
				</span>
			</div>
			<div class="row">
				<button class="btn" type="button" onclick={() => (replacing = true)}>
					{t.vehicle.replace}
				</button>
				<form method="POST" action="?/deleteVehicleApi" use:enhance>
					<button class="btn btn-danger" type="submit">{t.vehicle.delete}</button>
				</form>
			</div>
		{/if}
	</section>

	<section class="card" id="vehicles" aria-labelledby="vehicles-title">
		<h2 id="vehicles-title">{t.connections.title}</h2>
		<p class="muted">{t.connections.intro}</p>

		<div class="redirect">
			<span class="field-label">{t.connections.redirectUri}</span>
			<div class="copy-row">
				<code class="mono">{data.redirectUri}</code>
				<button class="btn btn-small" type="button" onclick={copyRedirectUri}>
					{copied ? t.connections.copied : t.connections.copy}
				</button>
			</div>
			<span class="muted small">{t.connections.redirectHint}</span>
		</div>

		{#if connectResult}
			<p
				class="notice {connectResult.ok ? 'notice-ok' : 'notice-error'}"
				role={connectResult.ok ? 'status' : 'alert'}
			>
				{connectResult.text}
			</p>
		{/if}

		{#if data.connections.length === 0}
			<p class="muted">{t.connections.none}</p>
		{:else}
			<ul class="list">
				{#each data.connections as connection (connection.id)}
					<li class="connection">
						<div class="connection-head">
							<a class="connection-name" href={resolve('/vehicles/[id]', { id: connection.id })}>
								{connection.label || t.connections.unnamed}
							</a>
							{#if connection.status === 'active'}
								<span class="status">
									<span class="dot" aria-hidden="true"></span>{t.connections.statusActive}
								</span>
							{:else}
								<span class="status status-warn">
									<span class="dot" aria-hidden="true"></span>{t.connections.statusReauth}
								</span>
							{/if}
						</div>
						<dl>
							<dt>{t.connections.lastSuccess}</dt>
							<dd>{dateTime(connection.lastSuccessAt) || t.connections.never}</dd>
							{#if connection.lastError}
								<dt>{t.connections.lastError}</dt>
								<dd class="error-text">
									{errorText(connection.lastError)}
									<span class="muted small">· {dateTime(connection.lastErrorAt)}</span>
								</dd>
							{/if}
						</dl>
						{#if connection.status === 'reauth'}
							<p class="muted small">{t.connections.reauthHint}</p>
						{/if}
						{#if fetchResult && fetchResult.id === connection.id}
							<p
								class="notice {fetchResult.ok ? 'notice-ok' : 'notice-error'}"
								role={fetchResult.ok ? 'status' : 'alert'}
							>
								{fetchResult.ok
									? t.connections.fetched
									: errorText('error' in fetchResult ? fetchResult.error : 'internal')}
							</p>
						{/if}

						{#if confirming === connection.id}
							<form
								class="stack confirm"
								method="POST"
								action="?/disconnect"
								use:enhance={submitConnection(connection.id)}
							>
								<input type="hidden" name="connectionId" value={connection.id} />
								<input type="hidden" name="confirm" value="yes" />
								<p class="small">
									{format(t.connections.confirmDisconnect, {
										count: String(connection.snapshotCount)
									})}
								</p>
								<div class="row">
									<button
										class="btn btn-danger"
										type="submit"
										disabled={busyConnection === connection.id}
									>
										{t.connections.confirm}
									</button>
									<button class="btn" type="button" onclick={() => (confirming = null)}>
										{t.common.cancel}
									</button>
								</div>
							</form>
						{:else}
							<div class="row">
								{#if connection.status === 'active'}
									<form
										method="POST"
										action="?/fetchNow"
										use:enhance={submitConnection(connection.id)}
									>
										<input type="hidden" name="connectionId" value={connection.id} />
										<button class="btn" type="submit" disabled={busyConnection === connection.id}>
											{t.connections.fetchNow}
										</button>
									</form>
								{/if}
								<a class="btn" href={resolve('/vehicles/[id]', { id: connection.id })}>
									{t.connections.details}
								</a>
								<button
									class="btn btn-danger"
									type="button"
									onclick={() => (confirming = connection.id)}
								>
									{t.connections.disconnect}
								</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<!-- No use:enhance: the response is a redirect to the provider's sign-in page. -->
		<form class="stack" method="POST" action="?/connectVehicle">
			<button class="btn btn-primary" type="submit" disabled={!data.vehicleApi.configured}>
				{t.connections.connect}
			</button>
			{#if !data.vehicleApi.configured}
				<span class="muted small">{t.connections.connectHint}</span>
			{/if}
		</form>
	</section>
</main>

<style>
	main {
		max-width: 560px;
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

	.stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
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

	.redirect {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: 14px;
		color: var(--muted);
	}

	.copy-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.copy-row code {
		flex: 1;
		min-width: 0;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--bg);
		font-size: 13px;
		overflow-wrap: anywhere;
	}

	.list li.connection {
		flex-direction: column;
		align-items: stretch;
	}

	.list li .connection-head {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.connection-name {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}

	.connection-name:hover {
		color: var(--accent);
	}

	.status-warn {
		color: var(--warn);
	}

	.status-warn .dot {
		background: var(--warn);
	}

	.error-text {
		color: var(--danger);
	}

	.confirm {
		padding: 12px;
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
	}

	.saved {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: var(--ok);
		font-weight: 500;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: var(--ok);
	}

	dl {
		margin: 0;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 16px;
		font-size: 14px;
	}

	dt {
		color: var(--muted);
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
</style>
