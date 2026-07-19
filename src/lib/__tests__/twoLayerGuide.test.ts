import { describe, expect, it, vi } from 'vitest';
import {
  TWO_LAYER_GUIDE_ACK_KEY,
  acknowledgeTwoLayerGuide,
  hasAcknowledgedTwoLayerGuide,
} from '../twoLayerGuide';

describe('Two-layer guide acknowledgement', () => {
  it('stays pending until the user acknowledges the guide', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };

    expect(hasAcknowledgedTwoLayerGuide(storage)).toBe(false);
    acknowledgeTwoLayerGuide(storage);
    expect(storage.setItem).toHaveBeenCalledWith(TWO_LAYER_GUIDE_ACK_KEY, '1');
    expect(hasAcknowledgedTwoLayerGuide(storage)).toBe(true);
  });

  it('fails safely when browser storage is unavailable', () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(hasAcknowledgedTwoLayerGuide(storage)).toBe(false);
    expect(() => acknowledgeTwoLayerGuide(storage)).not.toThrow();
  });
});
