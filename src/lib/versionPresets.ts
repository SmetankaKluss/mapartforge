// Minecraft Java Edition version-specific block availability

export type MinecraftVersion =
  | '1.12.2' | '1.13.2' | '1.14.4' | '1.15.2'
  | '1.16.5' | '1.17.1' | '1.18.2' | '1.19' | '1.20';

const VERSION_ORDER: MinecraftVersion[] = [
  '1.12.2', '1.13.2', '1.14.4', '1.15.2',
  '1.16.5', '1.17.1', '1.18.2', '1.19', '1.20',
];

// Minimum version required to use a block in map art (by nbt name).
// Blocks not listed here are available since 1.12.2.
const BLOCK_MIN_VERSION: Record<string, MinecraftVersion | 'future'> = {

  // ── 1.13 — Aquatic Update ────────────────────────────────────────────────
  'blue_ice':                         '1.13.2',
  'dried_kelp_block':                 '1.13.2',
  'dead_tube_coral_block':            '1.13.2',
  'dead_brain_coral_block':           '1.13.2',
  'dead_bubble_coral_block':          '1.13.2',
  'dead_fire_coral_block':            '1.13.2',
  'dead_horn_coral_block':            '1.13.2',
  'prismarine_slab':                  '1.13.2',
  'prismarine_brick_slab':            '1.13.2',
  'dark_prismarine_slab':             '1.13.2',
  // these got distinct nbt names in 1.13 flattening (were metadata variants before)
  'smooth_sandstone':                 '1.13.2',
  'cut_sandstone':                    '1.13.2',
  'chiseled_sandstone':               '1.13.2',

  // ── 1.14 — Village & Pillage ─────────────────────────────────────────────
  'smooth_stone':                     '1.14.4',
  'smooth_stone_slab':                '1.14.4',
  'andesite_slab':                    '1.14.4',
  'diorite_slab':                     '1.14.4',
  'granite_slab':                     '1.14.4',
  'end_stone_brick_slab':             '1.14.4',
  'mossy_cobblestone_slab':           '1.14.4',
  'red_nether_brick_slab':            '1.14.4',

  // ── 1.15 — Buzzy Bees ────────────────────────────────────────────────────
  'honey_block':                      '1.15.2',

  // ── 1.16 — Nether Update ─────────────────────────────────────────────────
  'crying_obsidian':                  '1.16.5',
  'blackstone':                       '1.16.5',
  'blackstone_slab':                  '1.16.5',
  'basalt':                           '1.16.5',
  'netherite_block':                  '1.16.5',
  'polished_blackstone_pressure_plate': '1.16.5',
  'soul_soil':                        '1.16.5',
  'shroomlight':                      '1.16.5',
  'crimson_nylium':                   '1.16.5',
  'crimson_stem':                     '1.16.5',
  'stripped_crimson_stem':            '1.16.5',
  'crimson_planks':                   '1.16.5',
  'crimson_slab':                     '1.16.5',
  'crimson_pressure_plate':           '1.16.5',
  'crimson_hyphae':                   '1.16.5',
  'stripped_crimson_hyphae':          '1.16.5',
  'warped_nylium':                    '1.16.5',
  'warped_stem':                      '1.16.5',
  'stripped_warped_stem':             '1.16.5',
  'warped_planks':                    '1.16.5',
  'warped_slab':                      '1.16.5',
  'warped_pressure_plate':            '1.16.5',
  'warped_hyphae':                    '1.16.5',
  'stripped_warped_hyphae':           '1.16.5',
  'warped_wart_block':                '1.16.5',

  // ── 1.17 — Caves & Cliffs Part 1 ─────────────────────────────────────────
  'azalea_leaves':                    '1.17.1',
  'white_candle':                     '1.17.1',
  'rooted_dirt':                      '1.17.1',
  'dirt_path':                        '1.17.1', // was grass_path before 1.17
  'tinted_glass':                     '1.17.1',
  'amethyst_block':                   '1.17.1',
  'budding_amethyst':                 '1.17.1',
  'calcite':                          '1.17.1',
  'tuff':                             '1.17.1',
  'dripstone_block':                  '1.17.1',
  'pointed_dripstone':                '1.17.1',
  'honeycomb_block':                  '1.17.1',
  'raw_copper_block':                 '1.17.1',
  'raw_gold_block':                   '1.17.1',
  'raw_iron_block':                   '1.17.1',
  'copper_block':                     '1.17.1',
  'cut_copper':                       '1.17.1',
  'waxed_copper_block':               '1.17.1',
  'waxed_cut_copper':                 '1.17.1',
  'waxed_cut_copper_slab':            '1.17.1',
  'exposed_copper':                   '1.17.1',
  'exposed_cut_copper':               '1.17.1',
  'waxed_exposed_copper':             '1.17.1',
  'waxed_exposed_cut_copper':         '1.17.1',
  'waxed_exposed_cut_copper_slab':    '1.17.1',
  'weathered_copper':                 '1.17.1',
  'weathered_cut_copper':             '1.17.1',
  'waxed_weathered_copper':           '1.17.1',
  'waxed_weathered_cut_copper':       '1.17.1',
  'waxed_weathered_cut_copper_slab':  '1.17.1',
  'oxidized_copper':                  '1.17.1',
  'oxidized_cut_copper':              '1.17.1',
  'waxed_oxidized_copper':            '1.17.1',
  'waxed_oxidized_cut_copper':        '1.17.1',
  'waxed_oxidized_cut_copper_slab':   '1.17.1',
  'deepslate':                        '1.17.1',
  'cobbled_deepslate':                '1.17.1',
  'cobbled_deepslate_slab':           '1.17.1',
  'deepslate_bricks':                 '1.17.1',
  'deepslate_tiles':                  '1.17.1',
  'polished_deepslate':               '1.17.1',
  'glow_lichen':                      '1.17.1',

  // ── 1.18 — Caves & Cliffs Part 2 — no new blocks in this palette ─────────

  // ── 1.19 — Wild Update ───────────────────────────────────────────────────
  'mud':                              '1.19',
  'packed_mud':                       '1.19',
  'mud_bricks':                       '1.19',
  'mud_brick_slab':                   '1.19',
  'mangrove_log':                     '1.19',
  'mangrove_planks':                  '1.19',
  'mangrove_slab':                    '1.19',
  'mangrove_pressure_plate':          '1.19',
  'mangrove_roots':                   '1.19',
  'ochre_froglight':                  '1.19',
  'pearlescent_froglight':            '1.19',
  'verdant_froglight':                '1.19',
  'sculk':                            '1.19',
  'sculk_catalyst':                   '1.19',
  'sculk_shrieker':                   '1.19',

  // ── 1.20 — Trails & Tales ────────────────────────────────────────────────
  'bamboo_block':                     '1.20',
  'bamboo_planks':                    '1.20',
  'bamboo_slab':                      '1.20',
  'bamboo_mosaic':                    '1.20',
  'bamboo_mosaic_slab':               '1.20',
  'bamboo_pressure_plate':            '1.20',
  'cherry_leaves':                    '1.20',
  'cherry_log':                       '1.20',
  'cherry_planks':                    '1.20',
  'cherry_slab':                      '1.20',
  'stripped_cherry_log':              '1.20',
  'cherry_wood':                      '1.20',
  'stripped_cherry_wood':             '1.20',
  'cherry_pressure_plate':            '1.20',

  // ── 1.21+ — beyond supported range (never shown) ─────────────────────────
  'pale_oak_pressure_plate':          'future',
  'resin_clump':                      'future',
};

/** True if the block is available in the given MC version. */
export function isBlockAvailable(nbtName: string, version: MinecraftVersion): boolean {
  const minVer = BLOCK_MIN_VERSION[nbtName];
  if (!minVer) return true; // default: available since 1.12.2
  if (minVer === 'future') return false;
  return VERSION_ORDER.indexOf(version) >= VERSION_ORDER.indexOf(minVer as MinecraftVersion);
}

/** Filter an array of nbt names to those available in the given version. */
export function filterBlocksForVersion(
  nbtNames: string[],
  version: MinecraftVersion,
): string[] {
  return nbtNames.filter(n => isBlockAvailable(n, version));
}

/** Human-readable label for a version. */
export function getVersionLabel(version: MinecraftVersion): string {
  const labels: Record<MinecraftVersion, string> = {
    '1.12.2': 'Java 1.12.2',
    '1.13.2': 'Java 1.13.2',
    '1.14.4': 'Java 1.14.4',
    '1.15.2': 'Java 1.15.2',
    '1.16.5': 'Java 1.16.5',
    '1.17.1': 'Java 1.17.1',
    '1.18.2': 'Java 1.18.2',
    '1.19':   'Java 1.19',
    '1.20':   'Java 1.20',
  };
  return labels[version] ?? version;
}
