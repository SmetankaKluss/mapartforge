// Legacy (Minecraft 1.12.2 and earlier) numeric block ID + data-value mapping.
// Used by the MCEdit/Classic .schematic exporter, which stores blocks as numeric
// IDs (0–255) with a parallel data-value byte (0–15) — the format understood by
// Schematica and old WorldEdit on 1.12.2.
//
// For map-art purposes only the *top* map colour matters, so sub-blocks like slabs
// and pressure plates are mapped to the full block that produces the same colour.
// Any block without a 1.12.2 equivalent falls back to plain stone.

export interface LegacyBlock {
  id: number;
  data: number;
}

const STONE_FALLBACK: LegacyBlock = { id: 1, data: 0 };

// Dye-colour order shared by wool/carpet/glass/concrete/terracotta/etc.
const COLOR_ORDER = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
] as const;

/** Build `${color}_${suffix}` → { id, data } for all 16 dye colours. */
function colorFamily(suffix: string, id: number): Record<string, LegacyBlock> {
  const out: Record<string, LegacyBlock> = {};
  COLOR_ORDER.forEach((c, data) => { out[`${c}_${suffix}`] = { id, data }; });
  return out;
}

const TABLE: Record<string, LegacyBlock> = {
  // ── Coloured families ───────────────────────────────────────────────────
  ...colorFamily('wool', 35),
  ...colorFamily('carpet', 171),
  ...colorFamily('stained_glass', 95),
  ...colorFamily('concrete', 251),
  ...colorFamily('concrete_powder', 252),
  ...colorFamily('terracotta', 159),      // coloured = stained_hardened_clay
  ...colorFamily('glazed_terracotta', 235), // white..black = 235..250 (sequential)

  // ── Stone variants (id 1) ────────────────────────────────────────────────
  stone:             { id: 1, data: 0 },
  granite:           { id: 1, data: 1 },
  polished_granite:  { id: 1, data: 2 },
  diorite:           { id: 1, data: 3 },
  polished_diorite:  { id: 1, data: 4 },
  andesite:          { id: 1, data: 5 },
  polished_andesite: { id: 1, data: 6 },
  smooth_stone:      { id: 1, data: 0 },

  // ── Dirt / ground (id 3) ─────────────────────────────────────────────────
  dirt:        { id: 3, data: 0 },
  coarse_dirt: { id: 3, data: 1 },
  podzol:      { id: 3, data: 2 },
  grass_block: { id: 2, data: 0 },
  mycelium:    { id: 110, data: 0 },
  dirt_path:   { id: 208, data: 0 }, // grass_path

  // ── Sand / sandstone ─────────────────────────────────────────────────────
  sand:               { id: 12, data: 0 },
  red_sand:           { id: 12, data: 1 },
  gravel:             { id: 13, data: 0 },
  clay:               { id: 82, data: 0 },
  sandstone:          { id: 24, data: 0 },
  chiseled_sandstone: { id: 24, data: 1 },
  cut_sandstone:      { id: 24, data: 2 },
  smooth_sandstone:   { id: 24, data: 2 },
  red_sandstone:      { id: 179, data: 0 },

  // ── Planks (id 5) ────────────────────────────────────────────────────────
  oak_planks:      { id: 5, data: 0 },
  spruce_planks:   { id: 5, data: 1 },
  birch_planks:    { id: 5, data: 2 },
  jungle_planks:   { id: 5, data: 3 },
  acacia_planks:   { id: 5, data: 4 },
  dark_oak_planks: { id: 5, data: 5 },

  // ── Logs (top facing, axis bits = 0) ─────────────────────────────────────
  oak_log:      { id: 17, data: 0 },
  spruce_log:   { id: 17, data: 1 },
  birch_log:    { id: 17, data: 2 },
  jungle_log:   { id: 17, data: 3 },
  acacia_log:   { id: 162, data: 0 },
  dark_oak_log: { id: 162, data: 1 },

  // ── Leaves ───────────────────────────────────────────────────────────────
  oak_leaves:      { id: 18, data: 0 },
  spruce_leaves:   { id: 18, data: 1 },
  birch_leaves:    { id: 18, data: 2 },
  jungle_leaves:   { id: 18, data: 3 },
  acacia_leaves:   { id: 161, data: 0 },
  dark_oak_leaves: { id: 161, data: 1 },

  // ── Pressure plates → base block colour ──────────────────────────────────
  oak_pressure_plate:      { id: 5, data: 0 },
  spruce_pressure_plate:   { id: 5, data: 1 },
  birch_pressure_plate:    { id: 5, data: 2 },
  jungle_pressure_plate:   { id: 5, data: 3 },
  acacia_pressure_plate:   { id: 5, data: 4 },
  dark_oak_pressure_plate: { id: 5, data: 5 },
  stone_pressure_plate:    { id: 1, data: 0 },
  heavy_weighted_pressure_plate: { id: 1, data: 0 },
  light_weighted_pressure_plate: { id: 1, data: 0 },

  // ── Slabs → full block of the same colour ────────────────────────────────
  oak_slab:           { id: 5, data: 0 },
  spruce_slab:        { id: 5, data: 1 },
  birch_slab:         { id: 5, data: 2 },
  jungle_slab:        { id: 5, data: 3 },
  acacia_slab:        { id: 5, data: 4 },
  dark_oak_slab:      { id: 5, data: 5 },
  stone_slab:         { id: 1, data: 0 },
  smooth_stone_slab:  { id: 1, data: 0 },
  sandstone_slab:     { id: 24, data: 0 },
  red_sandstone_slab: { id: 179, data: 0 },
  cobblestone_slab:   { id: 4, data: 0 },
  brick_slab:         { id: 45, data: 0 },
  stone_brick_slab:   { id: 98, data: 0 },
  nether_brick_slab:  { id: 112, data: 0 },
  quartz_slab:        { id: 155, data: 0 },
  mossy_cobblestone_slab: { id: 48, data: 0 },
  prismarine_slab:       { id: 168, data: 0 },
  prismarine_brick_slab: { id: 168, data: 1 },
  dark_prismarine_slab:  { id: 168, data: 2 },

  // ── Common stones / bricks ───────────────────────────────────────────────
  cobblestone:          { id: 4, data: 0 },
  mossy_cobblestone:    { id: 48, data: 0 },
  bricks:               { id: 45, data: 0 },
  stone_bricks:         { id: 98, data: 0 },
  mossy_stone_bricks:   { id: 98, data: 1 },
  cracked_stone_bricks: { id: 98, data: 2 },
  chiseled_stone_bricks:{ id: 98, data: 3 },
  obsidian:             { id: 49, data: 0 },

  // ── Nether / end ─────────────────────────────────────────────────────────
  netherrack:        { id: 87, data: 0 },
  soul_sand:         { id: 88, data: 0 },
  glowstone:         { id: 89, data: 0 },
  nether_bricks:     { id: 112, data: 0 },
  red_nether_bricks: { id: 215, data: 0 },
  red_nether_brick_slab: { id: 215, data: 0 },
  magma_block:       { id: 213, data: 0 },
  nether_wart_block: { id: 214, data: 0 },
  end_stone:         { id: 121, data: 0 },
  end_stone_bricks:  { id: 206, data: 0 },
  end_stone_brick_slab: { id: 206, data: 0 },
  purpur_block:      { id: 201, data: 0 },
  purpur_pillar:     { id: 202, data: 0 },
  purpur_slab:       { id: 205, data: 0 },

  // ── Metals / minerals ────────────────────────────────────────────────────
  gold_block:    { id: 41, data: 0 },
  iron_block:    { id: 42, data: 0 },
  diamond_block: { id: 57, data: 0 },
  emerald_block: { id: 133, data: 0 },
  lapis_block:   { id: 22, data: 0 },
  redstone_block:{ id: 152, data: 0 },
  coal_block:    { id: 173, data: 0 },
  quartz_block:  { id: 155, data: 0 },

  // ── Ice / snow / misc ────────────────────────────────────────────────────
  ice:        { id: 79, data: 0 },
  packed_ice: { id: 174, data: 0 },
  snow_block: { id: 80, data: 0 },
  snow:       { id: 78, data: 0 }, // snow layer
  pumpkin:    { id: 86, data: 0 },
  melon:      { id: 103, data: 0 },
  hay_block:  { id: 170, data: 0 },
  bone_block: { id: 216, data: 0 },
  sea_lantern:{ id: 169, data: 0 },
  slime_block:{ id: 165, data: 0 },
  sponge:     { id: 19, data: 0 },
  tnt:        { id: 46, data: 0 },
  bedrock:    { id: 7, data: 0 },
  cobweb:     { id: 30, data: 0 },
  beacon:     { id: 138, data: 0 },
  jukebox:    { id: 84, data: 0 },
  crafting_table: { id: 58, data: 0 },
  brewing_stand:  { id: 117, data: 0 },
  iron_trapdoor:  { id: 167, data: 0 },

  // ── Prismarine ───────────────────────────────────────────────────────────
  prismarine:        { id: 168, data: 0 },
  prismarine_bricks: { id: 168, data: 1 },
  dark_prismarine:   { id: 168, data: 2 },

  // ── Terracotta (plain) ───────────────────────────────────────────────────
  terracotta:  { id: 172, data: 0 }, // hardened_clay

  // ── Misc colour-equivalents ──────────────────────────────────────────────
  water: { id: 9, data: 0 },
};

/**
 * Resolve a modern block nbt name (without the `minecraft:` prefix) to its
 * legacy 1.12.2 numeric id + data value. Returns plain stone for unknown blocks.
 */
export function getLegacyBlockId(nbtName: string): LegacyBlock {
  return TABLE[nbtName] ?? STONE_FALLBACK;
}

/** True if the block has an explicit 1.12.2 mapping (not the stone fallback). */
export function hasLegacyMapping(nbtName: string): boolean {
  return nbtName in TABLE;
}
