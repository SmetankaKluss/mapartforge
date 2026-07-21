import { describe, expect, it, vi } from 'vitest';
import { isTourDone, markTourDone, markTourOfferDismissed, shouldAutoStart } from '../tour';

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe('guided tour persistence', () => {
  it('offers the new tour once on a fresh browser', () => {
    const store = storage();
    expect(shouldAutoStart(store)).toBe(true);
    markTourOfferDismissed(store);
    expect(shouldAutoStart(store)).toBe(false);
  });

  it('respects the completed legacy basic tour', () => {
    expect(shouldAutoStart(storage({ mapkluss_tour_basic_done: 'true' }))).toBe(false);
  });

  it('stores completion separately for each task tour', () => {
    const store = storage();
    markTourDone('editing', store);
    expect(isTourDone('editing', store)).toBe(true);
    expect(isTourDone('building', store)).toBe(false);
  });
});
