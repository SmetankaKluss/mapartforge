import { describe, expect, it } from 'vitest';
import { BUILTIN_PRESETS, COLOUR_ROWS, DEFAULT_SELECTION } from '../paletteBlocks';
import {
  isSuppressionSafeBlockName,
  sanitizeSuppressionSupportBlock,
  sanitizeSelectionForSuppression,
} from '../suppressionPalette';

describe('Two-layer palette safety', () => {
  it('keeps ordinary stone available', () => {
    expect(isSuppressionSafeBlockName('minecraft:stone')).toBe(true);
    expect(isSuppressionSafeBlockName('minecraft:tnt')).toBe(true);
  });

  it('rejects spreading dirt and replaces an unsafe height-step block only in Two-layer', () => {
    expect(isSuppressionSafeBlockName('minecraft:dirt')).toBe(false);
    expect(sanitizeSuppressionSupportBlock('dirt')).toBe('stone');
    expect(sanitizeSuppressionSupportBlock('air')).toBe('stone');
    expect(sanitizeSuppressionSupportBlock('coarse_dirt')).toBe('coarse_dirt');
  });

  it('replaces only unsafe blocks and stays idempotent', () => {
    const grassRow = COLOUR_ROWS.find(row => row.blocks.some(block => block.nbtName === 'grass_block'))!;
    const grass = grassRow.blocks.find(block => block.nbtName === 'grass_block')!;
    const selection = { ...DEFAULT_SELECTION, [grassRow.csId]: [grass.blockId] };
    const first = sanitizeSelectionForSuppression(selection, '1.21.11');
    const second = sanitizeSelectionForSuppression(first, '1.21.11');

    expect(first[grassRow.csId]).not.toEqual([grass.blockId]);
    expect(second).toEqual(first);
  });

  it('does not apply the instant-mining preset', () => {
    const safe = sanitizeSelectionForSuppression(DEFAULT_SELECTION, '1.21.11');
    const changedRows = COLOUR_ROWS.filter(row =>
      JSON.stringify(safe[row.csId] ?? []) !== JSON.stringify(DEFAULT_SELECTION[row.csId] ?? []),
    );
    expect(changedRows.length).toBeGreaterThan(0);
    expect(changedRows.length).toBeLessThan(COLOUR_ROWS.length / 2);
  });

  it('preserves deliberately empty preset rows in Two-layer', () => {
    const sanitized = sanitizeSelectionForSuppression(BUILTIN_PRESETS['Instant Mining'], '1.21.11');
    expect(sanitized).toEqual(BUILTIN_PRESETS['Instant Mining']);
  });
});
