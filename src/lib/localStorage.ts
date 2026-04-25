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
  minecraftVersion?: import('./versionPresets').MinecraftVersion;
}

const STORAGE_KEY = 'mapartforge-v4';

// Version tag stored alongside blockSelection to detect corrupt data from earlier bugs.
// Increment this if the blockSelection schema changes in a breaking way.
const BS_VERSION = 4;

interface RawStorage extends Partial<SavedSettings> {
  __bsv?: number;
}

export function saveSettings(s: Partial<SavedSettings>): void {
  try {
    const existing = loadSettings();
    const payload: RawStorage = { ...existing, ...s };
    if (s.blockSelection !== undefined) {
      payload.__bsv = BS_VERSION;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch { /* storage full or unavailable */ }
}

export function loadSettings(): Partial<SavedSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RawStorage;
      const { __bsv, ...settings } = parsed;
      // If blockSelection exists but was written by buggy code (no version tag or old version),
      // drop it so DEFAULT_SELECTION is used instead.
      if (settings.blockSelection && (!__bsv || __bsv < BS_VERSION)) {
        delete settings.blockSelection;
      } else if (settings.blockSelection) {
        settings.blockSelection = migrateBlockSelection(settings.blockSelection);
      }
      return settings;
    }
    // Migrate from any older version: carry over all settings except blockSelection.
    for (const legacyKey of ['mapartforge-v3', 'mapartforge-v2', 'mapartforge-v1']) {
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
    if (saved === undefined || saved.length === 0) continue;
    // Only extend selection if user already had ALL variants (they want everything)
    const allIds = row.blocks.map(b => b.blockId);
    const savedSet = new Set(saved);
    const allSelected = allIds.every(id => savedSet.has(id));
    if (!allSelected) continue;
    const newIds = allIds.filter(id => !savedSet.has(id));
    if (newIds.length > 0) {
      migrated[row.csId] = [...saved, ...newIds].sort((a, b) => a - b);
    }
  }
  return migrated;
}

export function clearSettings(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
