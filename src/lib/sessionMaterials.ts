import type { ComputedPalette } from './dithering';
import type { BlockSelection } from './paletteBlocks';
import { buildMaterialLookup } from './materialLookup';
import type { MapGrid } from './types';
import { MAP_BLOCK_SIZE } from './types';
import type { SessionMaterial } from './buildSession';

export interface RawMaterialEntry {
  csId: number;
  blockId: number;
  nbtName: string;
  displayName: string;
  total: number;
  perSection: number[];
}

export function computeRawMaterials(
  imageData: ImageData,
  cp: ComputedPalette,
  sel: BlockSelection,
  mapGrid: MapGrid,
): RawMaterialEntry[] {
  const lookup = buildMaterialLookup(cp, sel);

  const numSections = mapGrid.wide * mapGrid.tall;
  const counts = new Map<string, number[]>();
  const infos = new Map<string, { csId: number; blockId: number; nbtName: string; displayName: string }>();
  const { data, width, height } = imageData;

  for (let y = 0; y < height; y++) {
    const secY = Math.min(Math.floor(y / MAP_BLOCK_SIZE), mapGrid.tall - 1);
    for (let x = 0; x < width; x++) {
      const base = (y * width + x) * 4;
      if (data[base + 3] < 128) continue;
      const rgbKey = (data[base] << 16) | (data[base + 1] << 8) | data[base + 2];
      const info = lookup.get(rgbKey);
      if (!info) continue;

      const key = `${info.csId}_${info.blockId}`;
      if (!counts.has(key)) {
        counts.set(key, new Array(1 + numSections).fill(0));
        infos.set(key, {
          csId: info.csId, blockId: info.blockId,
          nbtName: info.nbtName, displayName: info.displayName,
        });
      }
      const arr = counts.get(key)!;
      arr[0]++;
      const secX = Math.min(Math.floor(x / MAP_BLOCK_SIZE), mapGrid.wide - 1);
      arr[1 + secY * mapGrid.wide + secX]++;
    }
  }

  return [...counts.entries()]
    .map(([key, arr]) => ({
      ...infos.get(key)!,
      total: arr[0],
      perSection: arr.slice(1),
    }))
    .filter(entry => entry.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function computeSessionMaterials(
  imageData: ImageData,
  cp: ComputedPalette,
  sel: BlockSelection,
  mapGrid: MapGrid,
): SessionMaterial[] {
  return computeRawMaterials(imageData, cp, sel, mapGrid).map(entry => ({
    nbtName: entry.nbtName,
    displayName: entry.displayName,
    count: entry.total,
  }));
}
