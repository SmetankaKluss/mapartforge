import type { SessionMaterial } from './buildSession';

export function trackerMaterialCounts(materials: SessionMaterial[], scanned: Record<string, number>): Record<string, number> {
  return Object.fromEntries(materials.map(material => {
    const name = material.nbtName;
    const value = scanned[name.includes(':') ? name : `minecraft:${name}`] ?? 0;
    return [name, Number.isFinite(value) ? Math.max(0, Math.min(material.count, Math.trunc(value))) : 0];
  }));
}
