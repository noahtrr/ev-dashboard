<script lang="ts">
	import { DESIGN_STYLES, type DesignStyle } from '#lib/design-style.ts';
	import type { Messages } from '#lib/i18n.ts';

	type Props = { current: DesignStyle; error?: boolean; t: Messages };
	let { current, error = false, t }: Props = $props();
	const s = $derived(t.designStyle);
</script>

<!-- A plain form post: the page reloads in the new style. -->
<section class="card" id="design" aria-labelledby="design-title">
	<h2 id="design-title">{s.title}</h2>
	<p class="muted">{s.intro}</p>
	{#if error}
		<p class="notice notice-error" role="alert">{s.error}</p>
	{/if}
	<form method="POST" action="?/designStyle" class="options" aria-label={s.choose}>
		{#each DESIGN_STYLES as style (style)}
			<button
				class="option {style}"
				name="style"
				value={style}
				aria-pressed={style === current}
				type="submit"
			>
				<span class="swatch" aria-hidden="true"><i></i><i></i><i></i></span>
				<span class="text">
					<strong
						>{s.styles[style].name}{#if style === current}<span class="active">{s.active}</span
							>{/if}</strong
					>
					<span class="muted">{s.styles[style].text}</span>
				</span>
			</button>
		{/each}
	</form>
</section>

<style>
	.options {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 12px;
	}

	.option {
		font: inherit;
		color: var(--text);
		text-align: left;
		cursor: pointer;
		display: flex;
		gap: 14px;
		align-items: flex-start;
		padding: 16px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: transparent;
	}

	.option:hover,
	.option[aria-pressed='true'] {
		border-color: var(--accent);
	}

	.option:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.text .muted {
		font-size: 13px;
	}

	strong {
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.active {
		font-size: 11px;
		font-weight: 500;
		color: var(--accent);
		border: 1px solid currentColor;
		border-radius: 999px;
		padding: 1px 8px;
	}

	/* Fixed previews of each style, independent of the one in use. */
	.swatch {
		flex: none;
		display: grid;
		grid-template-columns: repeat(3, 14px);
		gap: 3px;
		padding: 8px;
		border-radius: 8px;
	}

	.swatch i {
		height: 28px;
		border-radius: 2px;
	}

	.bronze .swatch {
		background: #000000;
		border-radius: 3px;
	}

	.bronze .swatch i:nth-child(1) {
		background: #fff6ed;
	}

	.bronze .swatch i:nth-child(2) {
		background: #d4a373;
	}

	.bronze .swatch i:nth-child(3) {
		background: #7fb0e0;
	}

	.cockpit .swatch {
		background: #0a0e13;
		border-radius: 10px;
	}

	.cockpit .swatch i {
		border-radius: 6px;
	}

	.cockpit .swatch i:nth-child(1) {
		background: #11171f;
	}

	.cockpit .swatch i:nth-child(2) {
		background: #38bdf8;
	}

	.cockpit .swatch i:nth-child(3) {
		background: #e6edf3;
	}
</style>
