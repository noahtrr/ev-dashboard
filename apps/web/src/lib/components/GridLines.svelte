<script lang="ts">
	// Decorative stage: thin vertical lines with slowly drifting dots behind every page.
	const lines = [0, 1, 2, 3, 4];
</script>

<div class="rule" aria-hidden="true"></div>
<div class="grid" aria-hidden="true">
	{#each lines as i (i)}
		<span class="line" class:mid={i === 2} style:--i={i}>
			<span class="dot a"></span>
			<span class="dot b"></span>
		</span>
	{/each}
</div>

<style>
	.rule {
		position: fixed;
		top: 64px;
		left: 0;
		right: 0;
		height: 1px;
		background: var(--line);
		pointer-events: none;
		z-index: -1;
	}

	.grid {
		position: fixed;
		inset: 0 max(16px, calc((100vw - 1200px) / 2));
		display: flex;
		justify-content: space-between;
		pointer-events: none;
		z-index: -1;
	}

	.line {
		position: relative;
		width: 1px;
		height: 100%;
		background: var(--line);
	}

	/* Mobile shows three lines: both edges and the centre. */
	.line:nth-child(2),
	.line:nth-child(4) {
		display: none;
	}

	@media (min-width: 900px) {
		.line:nth-child(2),
		.line:nth-child(4) {
			display: block;
		}
	}

	.mid {
		margin-top: 64px;
		height: calc(100% - 64px);
	}

	.dot {
		position: absolute;
		left: 50%;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--text) 35%, transparent);
		transform: translate(-50%, -50%);
		animation: drift calc(70s + var(--i) * 13s) linear infinite;
		animation-delay: calc(var(--i) * -17s);
	}

	.dot.b {
		animation-direction: reverse;
		animation-delay: calc(var(--i) * -29s - 31s);
	}

	@keyframes drift {
		from {
			top: 0%;
		}
		to {
			top: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dot {
			top: calc(15% + var(--i) * 16%);
		}
		.dot.b {
			top: calc(85% - var(--i) * 14%);
		}
	}
</style>
