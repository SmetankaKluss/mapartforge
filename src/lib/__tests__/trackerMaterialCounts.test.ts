import { expect, it } from 'vitest';
import { trackerMaterialCounts } from '../trackerMaterialCounts';

it('maps scanned registry IDs to resource keys and resets removed blocks', () => {
  const materials = [{ nbtName: 'stone', displayName: 'Stone', count: 2 }, { nbtName: 'minecraft:sand', displayName: 'Sand', count: 4 }];
  expect(trackerMaterialCounts(materials, { 'minecraft:stone': 3, 'minecraft:sand': 1 })).toEqual({ stone: 2, 'minecraft:sand': 1 });
  expect(trackerMaterialCounts(materials, {})).toEqual({ stone: 0, 'minecraft:sand': 0 });
});
