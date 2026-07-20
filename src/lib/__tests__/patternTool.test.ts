import { describe, expect, it } from 'vitest';
import { forEachLinePoint, parsePatternDefinition, resizePattern } from '../patternTool';

const block = {
  csId: 1,
  blockId: 2,
  baseId: 3,
  shade: 1,
  displayName: 'Stone',
  colourName: 'Gray',
};

describe('parsePatternDefinition', () => {
  it('accepts a bounded pattern with an exact pixel array', () => {
    const parsed = parsePatternDefinition({
      id: 'pattern-1',
      name: 'Dots',
      width: 2,
      height: 2,
      pixels: [block, null, null, block],
    });
    expect(parsed).toMatchObject({ id: 'pattern-1', name: 'Dots', width: 2, height: 2 });
    expect(parsed?.pixels).toHaveLength(4);
  });

  it('rejects oversized, truncated, and malformed patterns', () => {
    expect(parsePatternDefinition({ width: 17, height: 1, pixels: Array(17).fill(null) })).toBeNull();
    expect(parsePatternDefinition({ width: 2, height: 2, pixels: [null] })).toBeNull();
    expect(parsePatternDefinition({ width: 1, height: 1, pixels: [{ ...block, shade: 99 }] })).toBeNull();
  });
});

describe('pattern editor geometry and stroke interpolation', () => {
  it('crops the right side when a pattern becomes narrower', () => {
    const original = {
      id: 'pattern-4x2',
      name: 'Rows',
      width: 4,
      height: 2,
      pixels: [block, null, null, block, null, block, block, null],
    };
    expect(resizePattern(original, 2, 2).pixels).toEqual([block, null, null, block]);
  });

  it('visits every pixel between sparse pointer samples', () => {
    const points: Array<[number, number]> = [];
    forEachLinePoint(1, 2, 8, 5, (x, y) => points.push([x, y]));
    expect(points[0]).toEqual([1, 2]);
    expect(points.at(-1)).toEqual([8, 5]);
    expect(points).toHaveLength(8);
    for (let index = 1; index < points.length; index++) {
      expect(Math.abs(points[index][0] - points[index - 1][0])).toBeLessThanOrEqual(1);
      expect(Math.abs(points[index][1] - points[index - 1][1])).toBeLessThanOrEqual(1);
    }
  });
});
