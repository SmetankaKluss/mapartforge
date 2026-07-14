import type { ActiveGroups } from './paletteGroups';

// Maps dye-color baseIds (8, 15-29) to their Minecraft color name
const DYE_COLOR: Record<number, string> = {
  8:  'white',
  15: 'orange',
  16: 'magenta',
  17: 'light_blue',
  18: 'yellow',
  19: 'lime',
  20: 'pink',
  21: 'gray',
  22: 'light_gray',
  23: 'cyan',
  24: 'purple',
  25: 'blue',
  26: 'brown',
  27: 'green',
  28: 'red',
  29: 'black',
};

// Maps terracotta baseIds (36-51) to Minecraft color name
const TERRA_COLOR: Record<number, string> = {
  36: 'white',   37: 'orange',     38: 'magenta',    39: 'light_blue',
  40: 'yellow',  41: 'lime',       42: 'pink',        43: 'gray',
  44: 'light_gray', 45: 'cyan',   46: 'purple',      47: 'blue',
  48: 'brown',   49: 'green',      50: 'red',         51: 'black',
};

// Static blocks for non-group baseIds (no properties needed for most)
const STATIC: Record<number, string> = {
  1:  'minecraft:grass_block',
  2:  'minecraft:sand',
  3:  'minecraft:white_wool',
  4:  'minecraft:redstone_block',
  5:  'minecraft:packed_ice',
  6:  'minecraft:iron_block',
  7:  'minecraft:oak_leaves',
  9:  'minecraft:clay',
  10: 'minecraft:dirt',
  11: 'minecraft:cobblestone',    // overridden to pressure_plate if plates enabled
  12: 'minecraft:water',
  13: 'minecraft:oak_log',        // overridden to pressure_plate if plates enabled
  14: 'minecraft:quartz_block',
  30: 'minecraft:gold_block',
  31: 'minecraft:diamond_block',
  32: 'minecraft:lapis_block',
  33: 'minecraft:emerald_block',
  34: 'minecraft:podzol',
  35: 'minecraft:netherrack',
  52: 'minecraft:crimson_nylium',
  53: 'minecraft:crimson_stem',
  54: 'minecraft:crimson_hyphae',
  55: 'minecraft:warped_nylium',
  56: 'minecraft:warped_stem',
  57: 'minecraft:warped_hyphae',
  58: 'minecraft:warped_wart_block',
  59: 'minecraft:deepslate',
  60: 'minecraft:raw_iron_block',
  61: 'minecraft:glow_lichen',
};

const DYE_IDS  = new Set([8, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
const TERRA_IDS = new Set([36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);

/** Return the Minecraft block ID string for a given (baseId, activeGroups) pair. */
export function getBlockId(baseId: number, groups: ActiveGroups): string {
  // Dye-colored blocks (shared by carpet/wool/concrete/banners)
  if (DYE_IDS.has(baseId)) {
    const color = DYE_COLOR[baseId] ?? 'white';
    if (groups.carpet)   return `minecraft:${color}_carpet`;
    if (groups.wool)     return `minecraft:${color}_wool`;
    if (groups.concrete) return `minecraft:${color}_concrete`;
    if (groups.banners)  return `minecraft:${color}_carpet`;
    // When groups.all = true, default to carpet
    return `minecraft:${color}_carpet`;
  }

  // Terracotta
  if (TERRA_IDS.has(baseId)) {
    const color = TERRA_COLOR[baseId] ?? 'white';
    return `minecraft:${color}_terracotta`;
  }

  // Pressure plates (only when plates group is active)
  if (baseId === 11 && groups.plates) return 'minecraft:stone_pressure_plate';
  if (baseId === 13 && groups.plates) return 'minecraft:oak_pressure_plate';

  // Snow/white — also a dye color (baseId 8 handled above)
  if (baseId === 8) return 'minecraft:snow_block';

  return STATIC[baseId] ?? 'minecraft:stone';
}
