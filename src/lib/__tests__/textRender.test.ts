import { describe, expect, it } from 'vitest';
import { scaleMask, dilateMask, type TextBitmap } from '../textRender';

describe('textRender engine', () => {
  describe('scaleMask', () => {
    it('returns the same bitmap when scale is 1', () => {
      const bm: TextBitmap = { fill: new Uint8Array([1, 0, 0, 1]), width: 2, height: 2 };
      expect(scaleMask(bm, 1, 1)).toBe(bm);
    });

    it('upscales with nearest-neighbour (stays crisp, only 0/1 values)', () => {
      const bm: TextBitmap = { fill: new Uint8Array([1, 0]), width: 2, height: 1 };
      const out = scaleMask(bm, 2, 2);
      expect(out.width).toBe(4);
      expect(out.height).toBe(2);
      // every value is binary
      expect(Array.from(out.fill).every(v => v === 0 || v === 1)).toBe(true);
      // left half filled, right half empty, duplicated vertically
      expect(Array.from(out.fill)).toEqual([1, 1, 0, 0, 1, 1, 0, 0]);
    });

    it('never collapses below 1px', () => {
      const bm: TextBitmap = { fill: new Uint8Array([1]), width: 1, height: 1 };
      const out = scaleMask(bm, 0.01, 0.01);
      expect(out.width).toBe(1);
      expect(out.height).toBe(1);
    });
  });

  describe('dilateMask', () => {
    it('returns a copy unchanged when radius <= 0', () => {
      const fill = new Uint8Array([0, 1, 0]);
      const out = dilateMask(fill, 3, 1, 0);
      expect(Array.from(out)).toEqual([0, 1, 0]);
      expect(out).not.toBe(fill);
    });

    it('expands a single pixel into a plus shape at radius 1', () => {
      // 3x3 grid, centre pixel set
      const fill = new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 0]);
      const out = dilateMask(fill, 3, 3, 1);
      // Euclidean radius 1 keeps orthogonal neighbours but drops diagonals
      expect(Array.from(out)).toEqual([0, 1, 0, 1, 1, 1, 0, 1, 0]);
    });

    it('respects bounds at edges', () => {
      const fill = new Uint8Array([1, 0, 0, 0]);
      const out = dilateMask(fill, 2, 2, 1);
      // corner pixel dilates to its two in-bounds orthogonal neighbours
      expect(Array.from(out)).toEqual([1, 1, 1, 0]);
    });
  });
});
