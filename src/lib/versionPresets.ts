// Minecraft version-specific block availability presets

export type MinecraftVersion = 'pre-1.12' | '1.12' | '1.13+';

// Map of version → block nbt names that are EXCLUDED from palette for that version
// Empty array = all blocks available
const EXCLUDED_BLOCKS: Record<MinecraftVersion, Set<string>> = {
  'pre-1.12': new Set([
    // Concrete (added in 1.12)
    'white_concrete', 'orange_concrete', 'magenta_concrete', 'light_blue_concrete',
    'yellow_concrete', 'lime_concrete', 'pink_concrete', 'gray_concrete',
    'light_gray_concrete', 'cyan_concrete', 'purple_concrete', 'blue_concrete',
    'brown_concrete', 'green_concrete', 'red_concrete', 'black_concrete',
    // Concrete powder (added in 1.12)
    'white_concrete_powder', 'orange_concrete_powder', 'magenta_concrete_powder',
    'light_blue_concrete_powder', 'yellow_concrete_powder', 'lime_concrete_powder',
    'pink_concrete_powder', 'gray_concrete_powder', 'light_gray_concrete_powder',
    'cyan_concrete_powder', 'purple_concrete_powder', 'blue_concrete_powder',
    'brown_concrete_powder', 'green_concrete_powder', 'red_concrete_powder',
    'black_concrete_powder',
    // Terracotta variants (added in 1.12)
    'white_terracotta', 'orange_terracotta', 'magenta_terracotta',
    'light_blue_terracotta', 'yellow_terracotta', 'lime_terracotta',
    'pink_terracotta', 'gray_terracotta', 'light_gray_terracotta',
    'cyan_terracotta', 'purple_terracotta', 'blue_terracotta',
    'brown_terracotta', 'green_terracotta', 'red_terracotta',
    'black_terracotta',
    // Glazed terracotta (added in 1.12)
    'white_glazed_terracotta', 'orange_glazed_terracotta',
    'magenta_glazed_terracotta', 'light_blue_glazed_terracotta',
    'yellow_glazed_terracotta', 'lime_glazed_terracotta',
    'pink_glazed_terracotta', 'gray_glazed_terracotta',
    'light_gray_glazed_terracotta', 'cyan_glazed_terracotta',
    'purple_glazed_terracotta', 'blue_glazed_terracotta',
    'brown_glazed_terracotta', 'green_glazed_terracotta',
    'red_glazed_terracotta', 'black_glazed_terracotta',
    // Shulker boxes (added in 1.11, but palette mostly for 1.12+)
    'white_shulker_box', 'orange_shulker_box', 'magenta_shulker_box',
    'light_blue_shulker_box', 'yellow_shulker_box', 'lime_shulker_box',
    'pink_shulker_box', 'gray_shulker_box', 'light_gray_shulker_box',
    'cyan_shulker_box', 'purple_shulker_box', 'blue_shulker_box',
    'brown_shulker_box', 'green_shulker_box', 'red_shulker_box',
    'black_shulker_box',
  ]),
  '1.12': new Set([
    // Keep all 1.12 blocks (added in 1.12 snapshot)
    // Exclude very new things from 1.13+ like barrels, bells, lanterns
    'barrel', 'bell', 'lantern', 'sweet_berry_bush',
    'beehive', 'bee_nest', 'honeycomb_block',
  ]),
  '1.13+': new Set([
    // No exclusions — all current blocks
  ]),
};

export function filterBlocksForVersion(
  nbtNames: string[],
  version: MinecraftVersion,
): string[] {
  const excluded = EXCLUDED_BLOCKS[version];
  return nbtNames.filter(name => !excluded.has(name));
}

export function getVersionLabel(version: MinecraftVersion): string {
  return {
    'pre-1.12': 'Pre-1.12 (Beta)',
    '1.12': '1.12 Snapshot',
    '1.13+': '1.13+ (Current)',
  }[version];
}
