import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAfterPageLoad } from '../deferredWork';

type FakeWindow = EventTarget & {
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function installBrowser(readyState: 'loading' | 'complete', idleCallback?: FakeWindow['requestIdleCallback']) {
  const fakeWindow = new EventTarget() as FakeWindow;
  fakeWindow.setTimeout = globalThis.setTimeout.bind(globalThis);
  fakeWindow.clearTimeout = globalThis.clearTimeout.bind(globalThis);
  fakeWindow.requestIdleCallback = idleCallback;
  fakeWindow.cancelIdleCallback = vi.fn();
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', { readyState });
  return fakeWindow;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('runAfterPageLoad', () => {
  it('waits for page load and then uses an idle callback', () => {
    const callback = vi.fn();
    const requestIdleCallback = vi.fn((idleWork: () => void) => {
      idleWork();
      return 7;
    });
    const fakeWindow = installBrowser('loading', requestIdleCallback);

    runAfterPageLoad(callback);
    expect(callback).not.toHaveBeenCalled();
    fakeWindow.dispatchEvent(new Event('load'));

    expect(requestIdleCallback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
  });

  it('falls back to a short timer when idle callbacks are unavailable', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    installBrowser('complete');

    runAfterPageLoad(callback, 1_500);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('can be cancelled before page load', () => {
    const callback = vi.fn();
    const fakeWindow = installBrowser('loading');
    const cancel = runAfterPageLoad(callback);

    cancel();
    fakeWindow.dispatchEvent(new Event('load'));
    expect(callback).not.toHaveBeenCalled();
  });
});
