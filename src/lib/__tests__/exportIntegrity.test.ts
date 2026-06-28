import { describe, expect, it } from 'vitest';
import type { ComputedPalette } from '../dithering';
import type { BlockSelection } from '../paletteBlocks';

const grass = { r: 127, g: 178, b: 56, name: 'GRASS_2', baseId: 1, shade: 2 };
const sand = { r: 247, g: 233, b: 163, name: 'SAND_2', baseId: 2, shade: 2 };

const computedPalette: ComputedPalette = {
  colors: [grass, sand],
  labs: [],
  exactLookup: new Map([
    [(grass.r << 16) | (grass.g << 8) | grass.b, 0],
    [(sand.r << 16) | (sand.g << 8) | sand.b, 1],
  ]),
  matchMode: 'oklab',
  coords: new Float64Array(0),
};

const blockSelection: BlockSelection = {
  0: [0],
  1: [1],
};

function imageData(width: number, height: number, pixels: Array<[number, number, number, number]>): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach(([r, g, b, a], index) => {
    const offset = index * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  });
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

describe('export integrity', () => {
  it('maps image pixels to Minecraft map.dat color bytes', async () => {
    const { buildLookup, buildTileColors } = await import('../exportMapDat');
    const image = imageData(128, 128, [
      [grass.r, grass.g, grass.b, 255],
      [sand.r, sand.g, sand.b, 255],
      [1, 2, 3, 255],
    ]);

    const colors = buildTileColors(image, 0, 0, buildLookup(computedPalette));

    expect(colors[0]).toBe(grass.baseId * 4 + grass.shade);
    expect(colors[1]).toBe(sand.baseId * 4 + sand.shade);
    expect(colors[2]).toBe(0);
  });

  it('counts only opaque palette-matched pixels in material exports', async () => {
    const { countMaterials, formatMaterialsAsCSV } = await import('../exportMaterials');
    const image = imageData(4, 1, [
      [grass.r, grass.g, grass.b, 255],
      [grass.r, grass.g, grass.b, 255],
      [sand.r, sand.g, sand.b, 255],
      [sand.r, sand.g, sand.b, 0],
    ]);

    const materials = countMaterials(image, computedPalette, blockSelection);

    expect(materials).toEqual([
      expect.objectContaining({ nbtName: 'grass_block', displayName: 'Grass Block', count: 2 }),
      expect.objectContaining({ nbtName: 'sandstone', displayName: 'Sandstone', count: 1 }),
    ]);
    expect(formatMaterialsAsCSV(materials, { wide: 1, tall: 1 })).toContain('Total blocks,3');
  });
});

describe('client error reporting helpers', () => {
  it('groups Clarity-style client errors into stable categories', async () => {
    const { getClientErrorCategory, getClientErrorSignature } = await import('../errorReporting');

    expect(getClientErrorCategory("Failed to execute 'insertBefore' on 'Node'")).toBe('insert_before');
    expect(getClientErrorCategory("Failed to execute 'removeChild' on 'Node'")).toBe('remove_child');
    expect(getClientErrorCategory("undefined is not an object (evaluating 'tx')")).toBe('tx');
    expect(getClientErrorCategory('set maximum size exceeded')).toBe('max_size');
    expect(getClientErrorCategory('Unexpected editor crash')).toBe('other');
    expect(getClientErrorSignature("Failed to execute 'removeChild' on 'Node'")).toMatch(/^remove_child:/);
  });
});
