<script lang="ts">
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import { dateTime, kilometres } from '#lib/format.ts';
	import { format, messages } from '#lib/i18n.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(messages[data.locale]);
	const l = $derived(t.logbook);
	const m = $derived(t.manualTrips);
	const km = (value: number) => `${kilometres(value, data.locale)} km`;
	const total = $derived(data.trips.reduce((sum, trip) => sum + trip.distanceKm, 0));
	const purposeOf = (p: string | null) => (p === 'private' || p === 'business' ? p : 'open');
</script>

<svelte:head>
	<title>{m.title} · {data.connection.label || t.connections.unnamed} · {t.common.appName}</title>
</svelte:head>

{#if data.user}
	<TopBar user={data.user} {t} />
{/if}

<main>
	<a class="back" href={resolve('/vehicles/[id]/trips', { id: data.connection.id })}
		>← {l.backToLog}</a
	>
	<header class="head">
		<h1>{m.title}</h1>
		<a
			class="btn btn-primary add"
			href={resolve('/vehicles/[id]/trips/manual/new', { id: data.connection.id })}>{m.add}</a
		>
	</header>
	<p class="muted intro">{m.intro}</p>

	<section class="card" aria-labelledby="list-title">
		<h2 id="list-title" class="sr-only">{m.title}</h2>
		{#if data.trips.length === 0}
			<p class="muted">{m.none}</p>
		{:else}
			<p class="muted small">
				{format(m.total, { n: String(data.trips.length), km: km(total) })}
			</p>
			<ul class="trips">
				{#each data.trips as trip (trip.id)}
					{@const purpose = purposeOf(trip.purpose)}
					<li>
						<a
							href={resolve('/vehicles/[id]/trips/manual/[entry]', {
								id: data.connection.id,
								entry: trip.id
							})}
						>
							<span class="text">
								<span class="when">{dateTime(trip.start, data.locale)}</span>
								{#if trip.startAddress || trip.endAddress}
									<span class="route">{trip.startAddress ?? '…'} → {trip.endAddress ?? '…'}</span>
								{/if}
							</span>
							<span class="badge {purpose}">{l.purposes[purpose]}</span>
							<span class="km mono">{km(trip.distanceKm)}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
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

	.back {
		color: var(--muted);
		text-decoration: none;
		font-size: 14px;
	}

	.back:hover,
	.back:focus-visible {
		color: var(--accent);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}

	.add {
		min-height: 40px;
		border-radius: 20px;
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
	}

	.intro {
		font-size: 15px;
	}

	.small {
		font-size: 14px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	.trips {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.trips li + li {
		border-top: 1px solid var(--border);
	}

	.trips a {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 0;
		color: inherit;
		text-decoration: none;
	}

	.trips a:hover .when,
	.trips a:focus-visible .when {
		color: var(--accent);
	}

	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.when {
		font-size: 15px;
	}

	.route {
		font-size: 13px;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.km {
		font-size: 15px;
		min-width: 72px;
		text-align: right;
	}

	.badge {
		display: inline-block;
		padding: 2px 10px;
		border-radius: 12px;
		font-size: 12px;
		font-weight: 500;
		background: color-mix(in srgb, var(--accent) 14%, transparent);
	}

	.badge.private {
		background: color-mix(in srgb, var(--private) 16%, transparent);
	}

	.badge.open {
		background: transparent;
		border: 1px dashed var(--muted);
		color: var(--muted);
	}
</style>
