import { COLOUR_ROWS } from './paletteBlocks';
import type { SessionMaterial } from './buildSession';

export function materialColour(name: string) {
  const simple = name.replace(/^minecraft:/, '').split('[')[0];
  const row = COLOUR_ROWS.find(row => row.blocks.some(block => block.nbtName === simple));
  if (!row) return null;
  return { row, block: row.blocks.find(block => block.nbtName === simple)! };
}

export interface GatheringMask {
  groups: { names: string[]; target: number; pixels: number[] }[];
}

/** Legacy thumbnails have no material IDs. Shared map colours must share a quota. */
export function gatheringMask(rgba: Uint8ClampedArray, materials: SessionMaterial[]): GatheringMask {
  const byColour = new Map<number, GatheringMask['groups'][number]>();
  for (const material of materials) {
    const colour = materialColour(material.nbtName);
    if (!colour || material.count <= 0) continue;
    const group = byColour.get(colour.row.baseId) ?? { names: [], target: 0, pixels: [] };
    group.names.push(material.nbtName);
    group.target += material.count;
    byColour.set(colour.row.baseId, group);
  }
  const candidates = [...byColour].flatMap(([base, group]) => {
    const row = COLOUR_ROWS.find(row => row.baseId === base)!;
    return [180, 220, 255, 135].map(shade => ({ group,
      r: Math.floor(row.r * shade / 255), g: Math.floor(row.g * shade / 255), b: Math.floor(row.b * shade / 255) }));
  });
  const cache = new Map<number, GatheringMask['groups'][number] | undefined>();
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if (!rgba[offset + 3]) continue;
    const key = rgba[offset] * 65536 + rgba[offset + 1] * 256 + rgba[offset + 2];
    if (cache.has(key)) { cache.get(key)?.pixels.push(offset); continue; }
    let distance = Infinity;
    let closest: GatheringMask['groups'][number] | undefined;
    for (const candidate of candidates) {
      const next = (rgba[offset] - candidate.r) ** 2 + (rgba[offset + 1] - candidate.g) ** 2 + (rgba[offset + 2] - candidate.b) ** 2;
      if (next < distance) { distance = next; closest = candidate.group; }
    }
    cache.set(key, closest);
    closest?.pixels.push(offset);
  }
  return { groups: [...byColour.values()] };
}

export function revealGathering(source: Uint8ClampedArray, mask: GatheringMask, gathered: Record<string, number>) {
  const result = source.slice();
  for (let i = 0; i < result.length; i += 4) {
    const gray = Math.round(source[i] * .299 + source[i + 1] * .587 + source[i + 2] * .114);
    result[i] = result[i + 1] = result[i + 2] = gray;
  }
  for (const group of mask.groups) {
    const count = group.names.reduce((sum, name) => sum + Math.max(0, Number.isFinite(gathered[name]) ? gathered[name] : 0), 0);
    const quota = Math.floor(group.pixels.length * Math.min(1, count / group.target));
    for (let n = 0; n < quota; n++) {
      const i = group.pixels[n];
      result[i] = source[i]; result[i + 1] = source[i + 1]; result[i + 2] = source[i + 2];
    }
  }
  return result;
}
