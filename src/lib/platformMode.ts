import { COLOUR_ROWS } from './paletteBlocks';
import type { BlockSelection } from './paletteBlocks';

export type PlatformMode = 'java' | 'bedrock';

const BEDROCK_UNSAFE_BLOCKS = new Set([
  'unknown',
  'glow_lichen',
  'brewing_stand',
  'pointed_dripstone',
  'heavy_weighted_pressure_plate',
  'light_weighted_pressure_plate',
  'resin_clump',
  'resin_block', // Java 1.21.4 Pale Garden — not yet in Bedrock
  'sulfur',
  'sulfur_slab',
  'polished_sulfur',
  'polished_sulfur_slab',
  'sulfur_bricks',
  'sulfur_brick_slab',
  'chiseled_sulfur',
  'potent_sulfur',
  'cinnabar',
  'cinnabar_slab',
  'polished_cinnabar',
  'polished_cinnabar_slab',
  'cinnabar_bricks',
  'cinnabar_brick_slab',
  'chiseled_cinnabar',
]);

export function isBlockAvailableOnPlatform(nbtName: string, platformMode: PlatformMode): boolean {
  if (platformMode === 'java') return true;
  return !BEDROCK_UNSAFE_BLOCKS.has(nbtName);
}

export function filterBlocksForPlatform(nbtNames: string[], platformMode: PlatformMode): string[] {
  return nbtNames.filter(nbtName => isBlockAvailableOnPlatform(nbtName, platformMode));
}

export function sanitizeSelectionForPlatform(selection: BlockSelection, platformMode: PlatformMode): BlockSelection {
  if (platformMode === 'java') return selection;
  const next: BlockSelection = {};
  for (const row of COLOUR_ROWS) {
    const selected = selection[row.csId] ?? [];
    const safeBlockIds = row.blocks
      .filter(block => isBlockAvailableOnPlatform(block.nbtName, platformMode))
      .map(block => block.blockId);
    const safeSelected = selected.filter(blockId => safeBlockIds.includes(blockId));
    next[row.csId] = safeSelected.length > 0
      ? safeSelected
      : (safeBlockIds[0] !== undefined ? [safeBlockIds[0]] : []);
  }
  return next;
}
