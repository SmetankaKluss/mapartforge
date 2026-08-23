import { describe, expect, it } from 'vitest';
import { createTextMeta, normalizeTextMeta, textLocalVector } from '../textRender';

describe('text layer metadata', () => {
  it('normalizes unsafe and legacy values to bounded editable settings', () => {
    const meta = normalizeTextMeta({ px: 11, py: 13, value: 'Hello', size: 9_999, scaleX: 0, rotation: -90 });
    expect(meta).toMatchObject({ x: 11, y: 13, value: 'Hello', size: 1024, scaleX: 0.08, rotation: 270 });
  });

  it('creates a usable text object at the requested canvas point', () => {
    expect(createTextMeta(32, 64, 'MapKluss')).toMatchObject({ x: 32, y: 64, value: 'MapKluss', scaleX: 1, scaleY: 1 });
  });

  it('converts screen vectors into the text local axes for rotated resize handles', () => {
    const local = textLocalVector(0, 10, 90);
    expect(Math.round(local.x)).toBe(10);
    expect(Math.round(local.y)).toBe(0);
  });
});
