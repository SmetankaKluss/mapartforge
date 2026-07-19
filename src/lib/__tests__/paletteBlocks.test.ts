import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PRESET_LABELS,
  BUILTIN_PRESETS,
  COLOUR_ROWS,
  INSTANT_MINING_BLOCKS,
  buildPaletteFromSelection,
} from '../paletteBlocks';

const EXPECTED_INSTANT_MINING: Record<number, number> = {
  1: 1,
  3: 0,
  8: 7,
  9: 9,
  12: 3,
  13: 5,
  14: 14,
  15: 5,
  16: 5,
  17: 5,
  18: 5,
  19: 5,
  20: 5,
  21: 5,
  22: 5,
  23: 5,
  24: 5,
  25: 5,
  26: 5,
  27: 5,
  28: 5,
  33: 8,
  34: 0,
  35: 0,
  36: 0,
  37: 0,
  38: 0,
  39: 0,
  40: 0,
  41: 0,
  42: 0,
  43: 0,
  44: 0,
  45: 0,
  46: 0,
  47: 0,
  48: 0,
  49: 0,
  50: 0,
};

describe('built-in palette presets', () => {
  it('has localized labels for every built-in preset', () => {
    for (const name of Object.keys(BUILTIN_PRESETS)) {
      expect(BUILTIN_PRESET_LABELS[name]?.ru).toBeTruthy();
      expect(BUILTIN_PRESET_LABELS[name]?.en).toBeTruthy();
    }
  });

  it('keeps the instant-mining preset exact and valid for every colour row', () => {
    expect(INSTANT_MINING_BLOCKS).toEqual(EXPECTED_INSTANT_MINING);

    const selection = BUILTIN_PRESETS['Instant Mining'];
    expect(Object.keys(selection)).toHaveLength(COLOUR_ROWS.length);

    for (const row of COLOUR_ROWS) {
      const selected = selection[row.csId];
      expect(selected).toEqual(
        EXPECTED_INSTANT_MINING[row.csId] === undefined
          ? []
          : [EXPECTED_INSTANT_MINING[row.csId]],
      );
      expect(selected.length).toBeLessThanOrEqual(1);
      if (selected.length === 1) {
        expect(row.blocks.some(block => block.blockId === selected[0])).toBe(true);
      }
    }
  });

  it('exposes exactly the intended base colours in current Java versions', () => {
    const selection = BUILTIN_PRESETS['Instant Mining'];
    const expectedBaseIds = COLOUR_ROWS
      .filter(row => EXPECTED_INSTANT_MINING[row.csId] !== undefined)
      .map(row => row.baseId)
      .sort((a, b) => a - b);

    for (const version of ['1.21.8', '1.21.11'] as const) {
      const baseIds = [...new Set(
        buildPaletteFromSelection(selection, [2], version, 'java').map(color => color.baseId),
      )].sort((a, b) => a - b);
      expect(baseIds).toEqual(expectedBaseIds);
    }
  });

  it('includes the zero-hardness hand-break options', () => {
    const selection = BUILTIN_PRESETS['Instant Mining'];
    const selectedNames = COLOUR_ROWS.flatMap(row =>
      row.blocks
        .filter(block => (selection[row.csId] ?? []).includes(block.blockId))
        .map(block => block.nbtName),
    );
    expect(selectedNames).toContain('tnt');
    expect(selectedNames).toContain('honey_block');
  });
});
