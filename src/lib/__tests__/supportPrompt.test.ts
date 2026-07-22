import { describe, expect, it } from 'vitest';
import {
  deferSupportPrompt,
  shouldShowSupportPrompt,
  SUPPORT_PROMPT_COOLDOWN_MS,
  SUPPORT_PROMPT_STORAGE_KEY,
} from '../supportPrompt';

function makeStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(SUPPORT_PROMPT_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('support prompt cooldown', () => {
  it('shows when no valid future cooldown exists', () => {
    expect(shouldShowSupportPrompt(makeStorage(), 1_000)).toBe(true);
    expect(shouldShowSupportPrompt(makeStorage('invalid'), 1_000)).toBe(true);
    expect(shouldShowSupportPrompt(makeStorage('999'), 1_000)).toBe(true);
  });

  it('stays hidden until the saved cooldown expires', () => {
    const now = 10_000;
    const storage = makeStorage();
    deferSupportPrompt(storage, now);

    expect(shouldShowSupportPrompt(storage, now + SUPPORT_PROMPT_COOLDOWN_MS - 1)).toBe(false);
    expect(shouldShowSupportPrompt(storage, now + SUPPORT_PROMPT_COOLDOWN_MS)).toBe(true);
  });

  it('fails open when browser storage is unavailable', () => {
    expect(shouldShowSupportPrompt(null, 1_000)).toBe(true);
    expect(shouldShowSupportPrompt({ getItem: () => { throw new Error('blocked'); } }, 1_000)).toBe(true);
    expect(() => deferSupportPrompt({ setItem: () => { throw new Error('blocked'); } }, 1_000)).not.toThrow();
  });
});
