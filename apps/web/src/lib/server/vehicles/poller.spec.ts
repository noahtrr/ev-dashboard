import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPoller } from './poller.ts';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('poller', () => {
	it('waits for the initial delay, then runs with the period plus jitter', async () => {
		const tick = vi.fn(async () => {});
		const poller = createPoller({ tick, periodMs: 1000, initialDelayMs: 500, random: () => 0.5 });
		poller.start();
		poller.start(); // idempotent
		await vi.advanceTimersByTimeAsync(499);
		expect(tick).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(tick).toHaveBeenCalledTimes(1);
		// Next run after 1000 ms + 5 % jitter.
		await vi.advanceTimersByTimeAsync(1049);
		expect(tick).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(tick).toHaveBeenCalledTimes(2);
		await poller.stop();
	});

	it('never overlaps a slow run', async () => {
		let active = 0;
		let maxActive = 0;
		const tick = vi.fn(async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise((resolve) => setTimeout(resolve, 5000)); // slower than the period
			active--;
		});
		const poller = createPoller({ tick, periodMs: 1000, initialDelayMs: 0, random: () => 0 });
		poller.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(poller.running).toBe(true);
		await vi.advanceTimersByTimeAsync(4999);
		expect(tick).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1 + 1000);
		expect(tick).toHaveBeenCalledTimes(2);
		expect(maxActive).toBe(1);
		await vi.advanceTimersByTimeAsync(5000);
		await poller.stop();
	});

	it('keeps running after a failed run', async () => {
		const onError = vi.fn();
		const tick = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
		const poller = createPoller({
			tick,
			periodMs: 100,
			initialDelayMs: 0,
			random: () => 0,
			onError
		});
		poller.start();
		await vi.advanceTimersByTimeAsync(250);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(tick.mock.calls.length).toBeGreaterThanOrEqual(3);
		await poller.stop();
	});

	it('stops cleanly: waits for the current run and schedules nothing more', async () => {
		let finish!: () => void;
		const tick = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
		const poller = createPoller({ tick, periodMs: 100, initialDelayMs: 0, random: () => 0 });
		poller.start();
		await vi.advanceTimersByTimeAsync(0);
		let stopped = false;
		const stopping = poller.stop().then(() => (stopped = true));
		await vi.advanceTimersByTimeAsync(10);
		expect(stopped).toBe(false);
		finish();
		await stopping;
		expect(stopped).toBe(true);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(tick).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});
});
