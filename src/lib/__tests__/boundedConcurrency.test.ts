import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../boundedConcurrency';

describe('mapWithConcurrency', () => {
  it('preserves result order while limiting active work', async () => {
    let active = 0;
    let maxActive = 0;

    const result = await mapWithConcurrency([4, 3, 2, 1], 2, async value => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, value));
      active -= 1;
      return value * 10;
    });

    expect(result).toEqual([40, 30, 20, 10]);
    expect(maxActive).toBe(2);
  });

  it('waits for already running work and stops scheduling after a failure', async () => {
    const completed: number[] = [];
    const started: number[] = [];

    await expect(mapWithConcurrency([0, 1, 2, 3, 4], 2, async value => {
      started.push(value);
      if (value === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
        throw new Error('upload failed');
      }
      await new Promise(resolve => setTimeout(resolve, 5));
      completed.push(value);
      return value;
    })).rejects.toThrow('upload failed');

    expect(started).toEqual([0, 1]);
    expect(completed).toEqual([1]);
  });

  it('rejects invalid concurrency values', async () => {
    await expect(mapWithConcurrency([1], 0, async value => value)).rejects.toThrow(RangeError);
  });

  it('propagates an undefined rejection reason', async () => {
    let rejected = false;
    try {
      await mapWithConcurrency([1], 1, async () => {
        throw undefined;
      });
    } catch (error) {
      rejected = true;
      expect(error).toBeUndefined();
    }
    expect(rejected).toBe(true);
  });
});
