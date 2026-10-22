<script lang="ts">
	// Private or business as two segments, for forms that set a trip's purpose.
	type Purpose = 'private' | 'business';
	let {
		value = $bindable(null),
		labels,
		labelledby,
		name = 'purpose'
	}: {
		value?: Purpose | null;
		labels: Record<Purpose, string>;
		labelledby: string;
		name?: string;
	} = $props();
</script>

<div class="segments" role="radiogroup" aria-labelledby={labelledby}>
	{#each ['private', 'business'] as const as purpose (purpose)}
		<label class="segment {purpose}">
			<input type="radio" {name} value={purpose} bind:group={value} required />
			<span class="dot"></span>{labels[purpose]}
		</label>
	{/each}
</div>

<style>
	.segments {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 4px;
		padding: 4px;
		border-radius: 14px;
		background: var(--bg);
		border: 1px solid var(--border);
	}

	.segment {
		position: relative;
		min-height: 44px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-size: 15px;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
	}

	.segment input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}

	.segment:has(input:checked) {
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 0 0 1px var(--border);
	}

	.segment:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: var(--accent);
	}

	.private .dot {
		background: var(--private);
	}
</style>
