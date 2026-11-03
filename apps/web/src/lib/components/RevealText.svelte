<script lang="ts">
	// Letters rise out of a blur one after another. Screen readers get the plain text.
	type Props = { text: string };
	let { text }: Props = $props();

	const chars = $derived.by(() => {
		let n = 0;
		return [...text].map((c) => ({ c, delay: c === ' ' ? 0 : n++ * 0.035 }));
	});
</script>

<span class="sr-only">{text}</span><span class="reveal" aria-hidden="true"
	>{#each chars as { c, delay }, i (i)}{#if c === ' '}<span class="space"> </span>{:else}<span
				class="char"
				style:animation-delay="{delay}s">{c}</span
			>{/if}{/each}</span
>

<style>
	.char {
		display: inline-block;
		animation: rise 0.8s cubic-bezier(0.25, 1, 0.5, 1) both;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(0.45em);
			filter: blur(10px);
		}
		to {
			opacity: 1;
			transform: none;
			filter: none;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
