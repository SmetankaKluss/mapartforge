type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function runAfterPageLoad(callback: () => void, timeoutMs = 1_500): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const idleWindow = window as IdleWindow;
  let cancelled = false;
  let timeoutHandle: number | undefined;
  let idleHandle: number | undefined;

  const run = () => {
    if (cancelled) return;
    cancelled = true;
    if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
    callback();
  };

  const schedule = () => {
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(run, { timeout: timeoutMs });
    } else {
      timeoutHandle = window.setTimeout(run, Math.min(timeoutMs, 500));
    }
  };

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });

  return () => {
    if (cancelled) return;
    cancelled = true;
    window.removeEventListener('load', schedule);
    if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
    if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
  };
}
