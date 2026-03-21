import { PALETTE } from './palette';
import type { PaletteColor } from './palette';

// ── Index constants (0-based into BASE_COLORS, = baseId - 1) ──────────────

// The 16 dye map-colors shared by: wool, carpet, concrete, banners
const DYE_INDICES    = [7, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
// Stone pressure plate + wooden pressure plate
const PLATE_INDICES  = [10, 12]; // STONE, WOOD
// 16 stained / glazed terracotta map-colors (earthy palette)
const TERRA_INDICES  = [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50];

// ── Group definitions ─────────────────────────────────────────────────────

export type GroupKey = 'carpet' | 'plates' | 'wool' | 'terracotta' | 'concrete' | 'banners';

export interface PaletteGroup {
  key:  GroupKey;
  label: string;
  desc:  string;
  baseIndices: number[];
}

export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    key: 'carpet',
    label: 'Carpets',
    desc: 'All 16 dye colors — survival-friendly',
    baseIndices: DYE_INDICES,
  },
  {
    key: 'plates',
    label: 'Pressure Plates',
    desc: 'Wood & stone (+2 muted tones)',
    baseIndices: PLATE_INDICES,
  },
  {
    key: 'wool',
    label: 'Wool',
    desc: 'All 16 dye colors (same hues as carpet)',
    baseIndices: DYE_INDICES,
  },
  {
    key: 'terracotta',
    label: 'Terracotta',
    desc: '16 earthy tones — stained & glazed',
    baseIndices: TERRA_INDICES,
  },
  {
    key: 'concrete',
    label: 'Concrete',
    desc: 'All 16 dye colors (same hues as carpet)',
    baseIndices: DYE_INDICES,
  },
  {
    key: 'banners',
    label: 'Banners',
    desc: 'All 16 dye colors (same hues as carpet)',
    baseIndices: DYE_INDICES,
  },
];

// ── Active-groups state type ──────────────────────────────────────────────

/** When 'all' is true the entire 244-entry palette is used, ignoring groups. */
export interface ActiveGroups {
  all: boolean;
  carpet:     boolean;
  plates:     boolean;
  wool:       boolean;
  terracotta: boolean;
  concrete:   boolean;
  banners:    boolean;
}

// ── Presets ───────────────────────────────────────────────────────────────

const off: ActiveGroups = {
  all: false, carpet: false, plates: false,
  wool: false, terracotta: false, concrete: false, banners: false,
};

export const PRESETS = {
  carpet:   { ...off, carpet: true },
  extended: { ...off, carpet: true, plates: true, wool: true },
  all:      { ...off, all: true },
} satisfies Record<string, ActiveGroups>;

export const DEFAULT_GROUPS: ActiveGroups = PRESETS.all;

// ── Palette builder ───────────────────────────────────────────────────────

export function buildActivePalette(groups: ActiveGroups): PaletteColor[] {
  if (groups.all) return PALETTE;

  const activeBaseIdx = new Set<number>();
  for (const g of PALETTE_GROUPS) {
    if (groups[g.key]) {
      for (const idx of g.baseIndices) activeBaseIdx.add(idx);
    }
  }

  if (activeBaseIdx.size === 0) return [];
  return PALETTE.filter(c => activeBaseIdx.has(c.baseId - 1));
}

// ── Static swatch data (shade 2 = full-brightness colours) ───────────────

export interface SwatchEntry {
  groupKey: GroupKey;
  swatches: { r: number; g: number; b: number }[];
}

export const GROUP_SWATCHES: SwatchEntry[] = PALETTE_GROUPS.map(g => ({
  groupKey: g.key,
  swatches: g.baseIndices
    .map(idx => PALETTE.find(c => c.baseId - 1 === idx && c.shade === 2))
    .filter((c): c is PaletteColor => c !== undefined)
    .slice(0, 12)
    .map(c => ({ r: c.r, g: c.g, b: c.b })),
}));
