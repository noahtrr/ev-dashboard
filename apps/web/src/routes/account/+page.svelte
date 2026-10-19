<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '#lib/auth-client.ts';
	import TopBar from '#lib/components/TopBar.svelte';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const date = (value: Date | null) =>
		value ? value.toLocaleDateString(data.locale === 'de' ? 'de-DE' : 'en-GB') : '';

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
		font-size: 13px;
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
