// In-process background loop. Runs `tick` repeatedly with a pause in between; a run never
// overlaps the previous one because the next run is only scheduled after it finished.

export type PollerOptions = {
	tick: () => Promise<void>;
	/** Pause between the end of one run and the start of the next. */
	periodMs: number;
	/** Delay before the first run after `start()`. */
	initialDelayMs?: number;
	random?: () => number;
	onError?: (error: unknown) => void;
};

export type Poller = {
	start(): void;
	/** Stops scheduling; resolves when a run in progress has finished. */
	stop(): Promise<void>;
	readonly running: boolean;
};

export function createPoller(options: PollerOptions): Poller {
	const random = options.random ?? Math.random;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let current: Promise<void> | undefined;
	let started = false;
	let stopped = false;

	function schedule(delayMs: number) {
		if (stopped) return;
		timer = setTimeout(run, delayMs);
		// Never keep the process alive just for the poller.
		timer.unref?.();
	}

	function run() {
		timer = undefined;
		if (stopped || current) return;
		current = (async () => {
			try {
				await options.tick();
			} catch (error) {
				options.onError?.(error);
			}
		})().finally(() => {
			current = undefined;
			// Up to 10 % extra so instances started together drift apart.
			schedule(Math.round(options.periodMs * (1 + random() * 0.1)));
		});
	}

	return {
		start() {
			if (started) return;
			started = true;
			schedule(options.initialDelayMs ?? options.periodMs);
		},
		async stop() {
			stopped = true;
			if (timer) clearTimeout(timer);
			timer = undefined;
			await current;
		},
		get running() {
			return current !== undefined;
		}
	};
}
