import {
  COLOUR_ROWS,
  isMandatorySupport,
  type BlockSelection,
  type PaletteBlock,
} from './paletteBlocks';
import { isBlockAvailableOnPlatform, type PlatformMode } from './platformMode';
import { isBlockAvailable, type MinecraftVersion } from './versionPresets';

const UNSAFE_BLOCK_NAMES = new Set([
  'water', 'lava', 'sand', 'red_sand', 'gravel', 'dragon_egg',
  'dirt', 'grass_block', 'mycelium', 'dirt_path', 'farmland', 'crimson_nylium', 'warped_nylium',
  'copper_block', 'cut_copper', 'exposed_copper', 'exposed_cut_copper',
  'weathered_copper', 'weathered_cut_copper',
  'white_concrete_powder', 'orange_concrete_powder', 'magenta_concrete_powder',
  'light_blue_concrete_powder', 'yellow_concrete_powder', 'lime_concrete_powder',
  'pink_concrete_powder', 'gray_concrete_powder', 'light_gray_concrete_powder',
  'cyan_concrete_powder', 'purple_concrete_powder', 'blue_concrete_powder',
  'brown_concrete_powder', 'green_concrete_powder', 'red_concrete_powder',
  'black_concrete_powder', 'ice', 'frosted_ice', 'unknown',
  'potent_sulfur', // can become an active geyser in its water/magma arrangement
]);

const UNSAFE_BLOCK_TOKENS = [
  '_slab', '_stairs', '_carpet', '_pressure_plate', '_trapdoor',
  '_leaves', '_candle', '_torch', '_wall_sign', '_sign', '_banner',
  'lichen', 'vine', 'snow', 'cobweb', 'rail', 'button', 'sapling',
] as const;

export function isSuppressionSafeBlockName(nbtName: string): boolean {
  const name = nbtName.replace(/^minecraft:/, '');
  if (UNSAFE_BLOCK_NAMES.has(name)) return false;
  return !UNSAFE_BLOCK_TOKENS.some(token => name.includes(token));
}

export function sanitizeSuppressionSupportBlock(nbtName: string): string {
  return nbtName !== 'air' && isSuppressionSafeBlockName(nbtName) ? nbtName : 'stone';
}

export function isSuppressionSafePaletteBlock(block: PaletteBlock): boolean {
  return !block.supportBlockMandatory && isSuppressionSafeBlockName(block.nbtName);
}

export function isSuppressionPaletteBlockAvailable(
  block: PaletteBlock,
  minecraftVersion: MinecraftVersion,
  platformMode: PlatformMode = 'java',
): boolean {
  return isSuppressionSafePaletteBlock(block)
    && isBlockAvailable(block.nbtName, minecraftVersion)
    && isBlockAvailableOnPlatform(block.nbtName, platformMode);
}

/**
 * Preserve every already-safe choice. Replace only unsafe/unavailable choices
 * with the first safe block from the same map-colour row. A row without a safe
 * candidate stays empty, so Two-layer never silently borrows another colour.
 */
export function sanitizeSelectionForSuppression(
  selection: BlockSelection,
  minecraftVersion: MinecraftVersion,
  platformMode: PlatformMode = 'java',
): BlockSelection {
  const next: BlockSelection = {};
  for (const row of COLOUR_ROWS) {
    const selectedIds = selection[row.csId] ?? [];
    if (selectedIds.length === 0) {
      next[row.csId] = [];
      continue;
    }
    const selectedId = selectedIds[0];
    const selected = row.blocks.find(block => block.blockId === selectedId);
    if (selected && isSuppressionPaletteBlockAvailable(selected, minecraftVersion, platformMode)) {
      next[row.csId] = [selected.blockId];
      continue;
    }
    const fallback = row.blocks.find(block =>
      isSuppressionPaletteBlockAvailable(block, minecraftVersion, platformMode),
    );
    next[row.csId] = fallback ? [fallback.blockId] : [];
  }
  return next;
}

export function isSuppressionSelectionSafe(selection: BlockSelection): boolean {
  return COLOUR_ROWS.every(row => {
    const ids = selection[row.csId] ?? [];
    return ids.length === 0 || (
      ids.length === 1
      && !isMandatorySupport(row.baseId, selection)
      && row.blocks.some(block => block.blockId === ids[0] && isSuppressionSafePaletteBlock(block))
    );
  });
}
