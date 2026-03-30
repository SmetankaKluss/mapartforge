import type { DitheringMode } from './dithering';
import type { MapGrid } from './types';
import { COLOUR_ROWS } from './paletteBlocks';
import type { BlockSelection } from './paletteBlocks';
import type { ImageAdjustments } from './adjustments';

export interface SavedSettings {
  dithering: DitheringMode;
  intensity: number;
  mapGrid: MapGrid;
  blockSelection: BlockSelection;
  adjustments: ImageAdjustments;
  mapMode: '2d' | '3d';
  staircaseMode: 'classic' | 'optimized';
  bnScale: number;
}

const STORAGE_KEY = 'mapartforge-v3';

export function saveSettings(s: Partial<SavedSettings>): void {
  try {
    const existing = loadSettings();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...s }));
  } catch { /* storage full or unavailable */ }
}

export function loadSettings(): Partial<SavedSettings> {
  try {
    // Try current version first
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedSettings>;
      if (parsed.blockSelection) {
        parsed.blockSelection = migrateBlockSelection(parsed.blockSelection);
      }
      return parsed;
    }
    // Migrate from any older version: carry over all settings except blockSelection
    // (older blockSelection formats may be incompatible or contain all-variants bug)
    for (const legacyKey of ['mapartforge-v2', 'mapartforge-v1']) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as Partial<SavedSettings>;
        const { blockSelection: _dropped, ...rest } = legacy;
        void _dropped;
        return rest;
      }
    }
    return {};
  } catch { return {}; }
}

/** Add any block IDs present in COLOUR_ROWS that are missing from a saved selection. */
function migrateBlockSelection(sel: BlockSelection): BlockSelection {
  const migrated = { ...sel };
  for (const row of COLOUR_ROWS) {
    const saved = migrated[row.csId];
    // Skip if row was fully excluded (undefined) or intentionally empty (length === 0)
    if (saved === undefined || saved.length === 0) continue;
    const savedSet = new Set(saved);
    const newIds = row.blocks
      .map(b => b.blockId)
      .filter(id => !savedSet.has(id));
    if (newIds.length > 0) {
      migrated[row.csId] = [...saved, ...newIds].sort((a, b) => a - b);
    }
  }
  return migrated;
}

export function clearSettings(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
