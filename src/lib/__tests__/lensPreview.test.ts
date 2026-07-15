import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseLensTileResolution, LensPublishQueue, nextLensTileResolution } from '../lensPreview';

afterEach(() => {
  vi.useRealTimers();
});

describe('Lens atlas sizing', () => {
  it('chooses the largest resolution within side and pixel limits', () => {
    expect(chooseLensTileResolution({ wide: 1, tall: 1 })).toBe(128);
    expect(chooseLensTileResolution({ wide: 32, tall: 32 })).toBe(128);
    expect(chooseLensTileResolution({ wide: 33, tall: 1 })).toBe(64);
    expect(chooseLensTileResolution({ wide: 64, tall: 64 })).toBe(64);
    expect(chooseLensTileResolution({ wide: 100, tall: 100 })).toBe(32);
  });

  it('walks the retry ladder once per downscale', () => {
    expect(nextLensTileResolution(128)).toBe(64);
    expect(nextLensTileResolution(64)).toBe(32);
    expect(nextLensTileResolution(32)).toBe(16);
    expect(nextLensTileResolution(16)).toBeNull();
  });
});

describe('LensPublishQueue', () => {
  it('debounces changes and publishes only the newest pending value', async () => {
    vi.useFakeTimers();
    const published: number[] = [];
    const queue = new LensPublishQueue<number>({
      debounceMs: 350,
      minIntervalMs: 1000,
      publish: async value => { published.push(value); },
    });

    queue.enqueue(1);
    await vi.advanceTimersByTimeAsync(200);
    queue.enqueue(2);
    await vi.advanceTimersByTimeAsync(349);
    expect(published).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(published).toEqual([2]);
  });

  it('keeps one newest value while a publish is in flight and rate limits starts', async () => {
    vi.useFakeTimers();
    let releaseFirst: (() => void) | undefined;
    const published: number[] = [];
    const queue = new LensPublishQueue<number>({
      debounceMs: 0,
      minIntervalMs: 1000,
      publish: value => {
        published.push(value);
        if (value !== 1) return Promise.resolve();
        return new Promise<void>(resolve => { releaseFirst = resolve; });
      },
    });

    queue.enqueue(1);
    await vi.advanceTimersByTimeAsync(0);
    queue.enqueue(2);
    queue.enqueue(3);
    await vi.advanceTimersByTimeAsync(500);
    releaseFirst?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(499);
    expect(published).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(published).toEqual([1, 3]);
  });

  it('retries the last value after a rate-limited publish', async () => {
    vi.useFakeTimers();
    const published: number[] = [];
    const queue = new LensPublishQueue<number>({
      debounceMs: 0,
      minIntervalMs: 1000,
      publish: async value => {
        published.push(value);
        if (published.length === 1) throw new Error('rate_limited');
      },
      retryDelay: error => error instanceof Error && error.message === 'rate_limited' ? 1500 : null,
    });

    queue.enqueue(7);
    await vi.advanceTimersByTimeAsync(0);
    expect(published).toEqual([7]);
    await vi.advanceTimersByTimeAsync(1499);
    expect(published).toEqual([7]);
    await vi.advanceTimersByTimeAsync(1);
    expect(published).toEqual([7, 7]);
  });

  it('retains a preview after a transient failure and retries with backoff', async () => {
    vi.useFakeTimers();
    const published: number[] = [];
    const attempts: number[] = [];
    const queue = new LensPublishQueue<number>({
      debounceMs: 0,
      minIntervalMs: 1000,
      publish: async value => {
        published.push(value);
        if (published.length < 3) throw new TypeError('network unavailable');
      },
      retryDelay: (_error, attempt) => {
        attempts.push(attempt);
        return 2000 * (2 ** attempt);
      },
    });

    queue.enqueue(9);
    await vi.advanceTimersByTimeAsync(0);
    expect(published).toEqual([9]);
    await vi.advanceTimersByTimeAsync(1999);
    expect(published).toEqual([9]);
    await vi.advanceTimersByTimeAsync(1);
    expect(published).toEqual([9, 9]);
    await vi.advanceTimersByTimeAsync(3999);
    expect(published).toEqual([9, 9]);
    await vi.advanceTimersByTimeAsync(1);
    expect(published).toEqual([9, 9, 9]);
    expect(attempts).toEqual([0, 1]);
  });

  it('publishes the newest retained preview when connectivity wakes the queue', async () => {
    vi.useFakeTimers();
    const published: number[] = [];
    const queue = new LensPublishQueue<number>({
      debounceMs: 0,
      minIntervalMs: 1000,
      publish: async value => {
        published.push(value);
        if (published.length === 1) throw new TypeError('offline');
      },
      retryDelay: () => 30_000,
    });

    queue.enqueue(1);
    await vi.advanceTimersByTimeAsync(0);
    queue.enqueue(2);
    await vi.advanceTimersByTimeAsync(500);
    queue.retryNow();
    await vi.advanceTimersByTimeAsync(499);
    expect(published).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(published).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(published).toEqual([1, 2]);
  });

  it('keeps network backoff while newer previews replace the pending value', async () => {
    vi.useFakeTimers();
    const published: number[] = [];
    const attempts: number[] = [];
    const queue = new LensPublishQueue<number>({
      debounceMs: 350,
      minIntervalMs: 1000,
      publish: async value => {
        published.push(value);
        if (published.length < 3) throw new TypeError('offline');
      },
      retryDelay: (_error, attempt) => {
        attempts.push(attempt);
        return 2000 * (2 ** attempt);
      },
    });

    queue.enqueue(1);
    await vi.advanceTimersByTimeAsync(350);
    queue.enqueue(2);
    await vi.advanceTimersByTimeAsync(1000);
    queue.enqueue(3);
    await vi.advanceTimersByTimeAsync(999);
    expect(published).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(published).toEqual([1, 3]);
    queue.enqueue(4);
    await vi.advanceTimersByTimeAsync(3999);
    expect(published).toEqual([1, 3]);
    await vi.advanceTimersByTimeAsync(1);
    expect(published).toEqual([1, 3, 4]);
    expect(attempts).toEqual([0, 1]);
  });

  it('invalidates an in-flight publish when the session is cleared', async () => {
    vi.useFakeTimers();
    let rejectOld: ((error: Error) => void) | undefined;
    const published: number[] = [];
    const errors: unknown[] = [];
    const queue = new LensPublishQueue<number>({
      debounceMs: 0,
      minIntervalMs: 0,
      publish: value => {
        published.push(value);
        if (value === 1) return new Promise<void>((_resolve, reject) => { rejectOld = reject; });
        return Promise.resolve();
      },
      onError: error => errors.push(error),
      retryDelay: () => 1000,
    });

    queue.enqueue(1);
    await vi.advanceTimersByTimeAsync(0);
    queue.clear();
    queue.enqueue(2);
    rejectOld?.(new Error('stale session'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(errors).toEqual([]);
    expect(published).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(published).toEqual([1, 2]);
  });
});
