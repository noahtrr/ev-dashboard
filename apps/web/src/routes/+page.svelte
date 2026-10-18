<svelte:head>
	<title>EV Dashboard</title>
</svelte:head>

<main>
	<section class="card">
		<span class="label">EV Dashboard</span>
		<h1>Bald verfügbar</h1>
		<p>Das Grundgerüst läuft. Anmeldung und Fahrzeugdaten folgen in den nächsten Schritten.</p>
	</section>
</main>

<style>
	main {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: var(--space);
	}

	.card {
		width: 100%;
		max-width: 420px;
		padding: 24px;
		border-radius: var(--radius);
		background: var(--surface);
		border: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.label {
		font-size: 13px;
		color: var(--accent);
		font-weight: 500;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}

	p {
		margin: 0;
		color: var(--muted);
		line-height: 1.5;
	}
</style>
