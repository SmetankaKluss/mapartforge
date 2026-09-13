import type { ComputedPalette } from './dithering';
import { COLOUR_ROWS, type BlockSelection } from './paletteBlocks';

export interface MaterialLookupEntry {
  baseId: number;
  shade: number;
  csId: number;
  blockId: number;
  nbtName: string;
  displayName: string;
  colourName: string;
}

export function buildMaterialLookup(cp: ComputedPalette, selection: BlockSelection): Map<number, MaterialLookupEntry> {
  const lookup = new Map<number, MaterialLookupEntry>();
  for (const color of cp.colors) {
    const key = (color.r << 16) | (color.g << 8) | color.b;
    if (lookup.has(key)) continue;
    const row = COLOUR_ROWS.find(candidate => candidate.baseId === color.baseId);
    if (!row) continue;
    const activeIds = selection[row.csId] ?? [];
    // Match the material/export preference, independent of checkbox click order.
    const block = row.blocks.find(candidate => activeIds.includes(candidate.blockId));
    if (!block) continue;
    lookup.set(key, {
      baseId: color.baseId, shade: color.shade, csId: row.csId,
      blockId: block.blockId, nbtName: block.nbtName,
      displayName: block.displayName, colourName: row.colourName,
    });
  }
  return lookup;
}

export function sampleMaterialPixel(
  image: ImageData,
  x: number,
  y: number,
  lookup: ReadonlyMap<number, MaterialLookupEntry>,
): (MaterialLookupEntry & { pixelX: number; pixelY: number; r: number; g: number; b: number }) | null {
  if (!Number.isInteger(x) || !Number.isInteger(y)
      || x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  const offset = (y * image.width + x) * 4;
  if (offset + 3 >= image.data.length || image.data[offset + 3] < 128) return null;
  const r = image.data[offset], g = image.data[offset + 1], b = image.data[offset + 2];
  // An unmapped RGB is not a block. Never invent one with nearest-colour search.
  const material = lookup.get((r << 16) | (g << 8) | b);
  return material ? { ...material, pixelX: x, pixelY: y, r, g, b } : null;
}
