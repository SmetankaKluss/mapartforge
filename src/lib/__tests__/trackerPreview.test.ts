import { describe, expect, it } from 'vitest';
import { gatheringMask, revealGathering } from '../trackerPreview';

describe('Tracker gathering preview', () => {
  const source = new Uint8ClampedArray([247,233,163,255, 247,233,163,255, 51,76,178,255, 51,76,178,0]);
  const materials = [{ nbtName: 'minecraft:sand', displayName: 'Sand', count: 20 }, { nbtName: 'minecraft:blue_wool', displayName: 'Blue', count: 10 }];
  it('reveals only the collected colour quota and preserves alpha', () => {
    const mask = gatheringMask(source, materials);
    const result = revealGathering(source, mask, { 'minecraft:sand': 10 });
    expect([...result.slice(0,4)]).toEqual([...source.slice(0,4)]);
    expect(result[4]).toBe(result[5]); expect(result[8]).toBe(result[9]);
    expect(result[15]).toBe(0); expect(source[4]).toBe(247);
    expect(revealGathering(source, mask, { 'minecraft:sand': 10 })).toEqual(result);
  });
  it('undo returns to gray and complete quotas recover all opaque pixels', () => {
    const mask = gatheringMask(source, materials);
    expect(revealGathering(source, mask, { 'minecraft:sand':20,'minecraft:blue_wool':10 }).slice(0,12)).toEqual(source.slice(0,12));
    const reset = revealGathering(source, mask, {}); expect(reset[0]).toBe(reset[1]);
  });
  it('pools indistinguishable materials and ignores unknown material IDs', () => {
    const mask = gatheringMask(source, [...materials, { nbtName:'minecraft:blue_concrete',displayName:'Concrete',count:10 }, { nbtName:'unknown',displayName:'Unknown',count:10 }]);
    const blue = mask.groups.find(group => group.names.includes('minecraft:blue_wool'))!;
    expect(blue.names).toHaveLength(2); expect(blue.target).toBe(20);
    expect(revealGathering(source, mask, { 'minecraft:sand': -1 })[0]).toBe(revealGathering(source, mask, {})[0]);
  });
});
