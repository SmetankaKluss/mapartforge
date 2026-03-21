// Minecraft map color palette
// 61 base colors × 4 shades = 244 usable entries
// Shade multipliers: 180 (darkest), 220 (dark), 255 (normal), 135 (very dark)
// Shade 2 (×255) = the "base" color as seen in most references

export interface PaletteColor {
  r: number;
  g: number;
  b: number;
  name: string;
  baseId: number; // 1-61
  shade: number;  // 0-3
}

// Base RGB values (full brightness, shade=2, ×255/255)
const BASE_COLORS: [number, number, number, string][] = [
  [127, 178,  56, "GRASS"],
  [247, 233, 163, "SAND"],
  [199, 199, 199, "WOOL"],
  [255,   0,   0, "FIRE"],
  [160, 160, 255, "ICE"],
  [167, 167, 167, "METAL"],
  [  0, 124,   0, "PLANT"],
  [255, 255, 255, "SNOW"],
  [164, 168, 184, "CLAY"],
  [151, 109,  77, "DIRT"],
  [112, 112, 112, "STONE"],
  [ 64,  64, 255, "WATER"],
  [143, 119,  72, "WOOD"],
  [255, 252, 245, "QUARTZ"],
  [216, 127,  51, "COLOR_ORANGE"],
  [178,  76, 216, "COLOR_MAGENTA"],
  [102, 153, 216, "COLOR_LIGHT_BLUE"],
  [229, 229,  51, "COLOR_YELLOW"],
  [127, 204,  25, "COLOR_LIGHT_GREEN"],
  [242, 127, 165, "COLOR_PINK"],
  [ 76,  76,  76, "COLOR_GRAY"],
  [153, 153, 153, "COLOR_LIGHT_GRAY"],
  [ 76, 127, 153, "COLOR_CYAN"],
  [127,  63, 178, "COLOR_PURPLE"],
  [ 51,  76, 178, "COLOR_BLUE"],
  [102,  76,  51, "COLOR_BROWN"],
  [102, 127,  51, "COLOR_GREEN"],
  [153,  51,  51, "COLOR_RED"],
  [ 25,  25,  25, "COLOR_BLACK"],
  [250, 238,  77, "GOLD"],
  [ 92, 219, 213, "DIAMOND"],
  [ 74, 128, 255, "LAPIS"],
  [  0, 217,  58, "EMERALD"],
  [129,  86,  49, "PODZOL"],
  [112,   2,   0, "NETHER"],
  [209, 177, 161, "TERRACOTTA_WHITE"],
  [159,  82,  36, "TERRACOTTA_ORANGE"],
  [149,  87, 108, "TERRACOTTA_MAGENTA"],
  [112, 108, 138, "TERRACOTTA_LIGHT_BLUE"],
  [186, 133,  36, "TERRACOTTA_YELLOW"],
  [103, 117,  53, "TERRACOTTA_LIGHT_GREEN"],
  [160,  77,  78, "TERRACOTTA_PINK"],
  [ 57,  41,  35, "TERRACOTTA_GRAY"],
  [135, 107,  98, "TERRACOTTA_LIGHT_GRAY"],
  [ 87,  92,  92, "TERRACOTTA_CYAN"],
  [122,  73,  88, "TERRACOTTA_PURPLE"],
  [ 76,  62,  92, "TERRACOTTA_BLUE"],
  [ 76,  50,  35, "TERRACOTTA_BROWN"],
  [ 76,  82,  42, "TERRACOTTA_GREEN"],
  [142,  60,  46, "TERRACOTTA_RED"],
  [ 37,  22,  16, "TERRACOTTA_BLACK"],
  [189,  48,  49, "CRIMSON_NYLIUM"],
  [148,  63,  97, "CRIMSON_STEM"],
  [ 92,  25,  29, "CRIMSON_HYPHAE"],
  [ 22, 126, 134, "WARPED_NYLIUM"],
  [ 58, 142, 140, "WARPED_STEM"],
  [ 86,  44,  62, "WARPED_HYPHAE"],
  [ 20, 180, 133, "WARPED_WART_BLOCK"],
  [100, 100, 100, "DEEPSLATE"],
  [216, 175, 147, "RAW_IRON"],
  [127, 167, 150, "GLOW_LICHEN"],
];

const SHADE_MULTIPLIERS = [180, 220, 255, 135];

function applyShade(value: number, mult: number): number {
  return Math.round((value * mult) / 255);
}

// Build the full palette: 61 base × 4 shades = 244 colors
// Shade indices 0-2 are usable in survival; shade 3 requires special techniques.
// We include all 4 for maximum color range.
export const PALETTE: PaletteColor[] = [];

for (let i = 0; i < BASE_COLORS.length; i++) {
  const [r, g, b, name] = BASE_COLORS[i];
  for (let shade = 0; shade < 4; shade++) {
    const mult = SHADE_MULTIPLIERS[shade];
    PALETTE.push({
      r: applyShade(r, mult),
      g: applyShade(g, mult),
      b: applyShade(b, mult),
      name: `${name}_${shade}`,
      baseId: i + 1,
      shade,
    });
  }
}
