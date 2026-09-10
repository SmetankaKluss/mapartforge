import { useEffect, useState } from 'react';
import { readTrackerLive, trackerSnapshotPixels, type TrackerLive } from '../lib/trackerLive';
import { getSupabaseClient } from '../lib/supabase';

export function useTrackerLive(sessionId: string, mock: boolean) {
  const [state, setState] = useState<{ id: string; value: TrackerLive; image: ImageData | null; fresh: boolean; access?: 'login' | 'denied' } | null>(null);
  useEffect(() => {
    if (mock) return;
    let stopped = false, busy = false;
    let authEpoch = 0;
    let authBlocked = false;
    let previous: TrackerLive | undefined;
    let image: ImageData | null = null;
    let expires: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (stopped || busy || document.hidden || authBlocked) return;
      busy = true;
      const started = performance.now();
      const epoch = authEpoch;
      try {
        const next = await readTrackerLive(sessionId, previous);
        if (stopped || epoch !== authEpoch) return;
        if (!next.available || next.invalidated || next.publisher !== previous?.publisher) { image = null; previous = undefined; }
        if (next.snapshot) image = trackerSnapshotPixels(next.snapshot);
        previous = { ...next, snapshot: next.invalidated ? null : next.snapshot ?? previous?.snapshot };
        const ttl = next.fresh ? Math.max(0, Math.min(15000, next.fresh_for_ms ?? 0) - (performance.now() - started)) : 0;
        clearTimeout(expires);
        setState({ id: sessionId, value: previous, image, fresh: ttl > 0 });
        if (ttl > 0) expires = setTimeout(() => setState(current => current?.id === sessionId ? { ...current, fresh: false } : current), ttl);
      } catch (error) {
        if (stopped || epoch !== authEpoch) return;
        const status = (error as { context?: { status?: number } })?.context?.status;
        if (status === 401 || status === 403) {
          previous = undefined; image = null; authBlocked = true; clearTimeout(expires);
          setState({ id: sessionId, value: { available: false }, image: null, fresh: false, access: status === 401 ? 'login' : 'denied' });
        }
        else setState(current => current?.id === sessionId ? { ...current, fresh: false } : current);
      } finally { busy = false; }
    };
    void poll();
    const interval = setInterval(() => { void poll(); }, 5000);
    const { data: auth } = getSupabaseClient().auth.onAuthStateChange(event => {
      if (event !== 'SIGNED_OUT' && event !== 'SIGNED_IN') return;
      authEpoch++; previous = undefined; image = null; clearTimeout(expires); setState(null);
      authBlocked = event === 'SIGNED_OUT';
      if (authBlocked) setState({ id: sessionId, value: { available: false }, image: null, fresh: false, access: 'login' });
    });
    const visible = () => { if (!document.hidden) void poll(); };
    document.addEventListener('visibilitychange', visible);
    return () => { stopped = true; auth.subscription.unsubscribe(); clearTimeout(expires); clearInterval(interval); document.removeEventListener('visibilitychange', visible); };
  }, [sessionId, mock]);
  return state?.id === sessionId ? state : null;
}
