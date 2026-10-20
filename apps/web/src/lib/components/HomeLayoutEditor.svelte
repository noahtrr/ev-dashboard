<script lang="ts">
	import { defaultHomeLayout, moveModule, type HomeLayout } from '#lib/home-layout.ts';
	import { format, type Messages } from '#lib/i18n.ts';

	type Props = {
		layout: HomeLayout;
		t: Messages;
		/** Called with the complete new layout after every change. */
		onchange: (layout: HomeLayout) => void;
		ondone: () => void;
		error?: boolean;
	};

	let { layout, t, onchange, ondone, error = false }: Props = $props();
	const h = $derived(t.home);

	const toggle = (index: number) =>
		onchange(layout.map((m, i) => (i === index ? { ...m, on: !m.on } : m)));
</script>

<div class="editor">
	<div class="head">
		<h1>{h.customize}</h1>
		<button class="btn btn-primary done" type="button" onclick={ondone}>{h.done}</button>
	</div>
	<p class="muted hint">{h.customizeHint}</p>
	{#if error}
		<p class="notice notice-error" role="alert">{h.saveFailed}</p>
	{/if}

	<ul class="card list">
		{#each layout as m, i (m.id)}
			{@const name = h.modules[m.id].title}
			<li>
				<span class="arrows">
					<button
						type="button"
						aria-label={format(h.moveUp, { module: name })}
						disabled={i === 0}
						onclick={() => onchange(moveModule(layout, i, -1))}>▲</button
					>
					<button
						type="button"
						aria-label={format(h.moveDown, { module: name })}
						disabled={i === layout.length - 1}
						onclick={() => onchange(moveModule(layout, i, 1))}>▼</button
					>
				</span>
				<span class="entry" class:off={!m.on} id="module-{m.id}">
					<span class="name">{name}</span>
					<span class="muted text">{h.modules[m.id].text}</span>
				</span>
				<button
					class="switch"
					type="button"
					role="switch"
					aria-checked={m.on}
					aria-labelledby="module-{m.id}"
					onclick={() => toggle(i)}
				>
					<span class="knob"></span>
				</button>
			</li>
		{/each}
	</ul>

	<button class="reset" type="button" onclick={() => onchange(defaultHomeLayout())}
		>{h.reset}</button
	>
</div>

<style>
	.editor {
		grid-column: 1 / -1;
		width: 100%;
		max-width: 560px;
		justify-self: center;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 600;
	}

	.done {
		min-height: 40px;
		padding: 0 18px;
		font-size: 14px;
	}

	.hint {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 4px 16px;
		gap: 0;
	}

	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 0;
	}

	li + li {
		border-top: 1px solid var(--border);
	}

	.arrows {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.arrows button {
		width: 36px;
		height: 28px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		font-size: 11px;
		cursor: pointer;
	}

	.arrows button:disabled {
		color: var(--border);
		cursor: default;
	}

	.entry {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.entry.off {
		opacity: 0.5;
	}

	.name {
		font-size: 15px;
		font-weight: 500;
	}

	.text {
		font-size: 13px;
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

	.arrows button:focus-visible,
	.switch:focus-visible,
	.reset:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.reset {
		align-self: center;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
		padding: 8px;
	}
</style>
