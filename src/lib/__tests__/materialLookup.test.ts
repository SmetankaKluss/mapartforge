import { describe, expect, it } from 'vitest';
import { buildComputedPalette } from '../dithering';
import { buildPaletteFromSelection, COLOUR_ROWS, getPreferredBlockNbt, type BlockSelection } from '../paletteBlocks';
import { buildMaterialLookup, sampleMaterialPixel } from '../materialLookup';
import { computeRawMaterials } from '../sessionMaterials';
import { countMaterials } from '../exportMaterials';
import { buildLookup } from '../exportLitematic';

const selection: BlockSelection = Object.fromEntries(COLOUR_ROWS.map(row => [row.csId, [row.blocks[0].blockId]]));
const cp = buildComputedPalette(buildPaletteFromSelection(selection, [1], '1.21.11'));
const lookup = buildMaterialLookup(cp, selection);

function image(pixels: number[][], width = pixels.length): ImageData {
  return { width, height: pixels.length / width, data: new Uint8ClampedArray(pixels.flat()), colorSpace: 'srgb' } as ImageData;
}

function pixel(baseId: number, alpha = 255): number[] {
  const color = cp.colors.find(candidate => candidate.baseId === baseId)!;
  return [color.r, color.g, color.b, alpha];
}

describe('editor material lookup', () => {
  it('agrees with material counts and schematic identity for every 2D palette colour', () => {
    const schematic = buildLookup(cp);
    for (const color of cp.colors) {
      const source = image([[color.r, color.g, color.b, 255]]);
      const picked = sampleMaterialPixel(source, 0, 0, lookup)!;
      const listed = computeRawMaterials(source, cp, selection, { wide: 1, tall: 1 })[0];
      expect(picked.nbtName).toBe(listed.nbtName);
      expect(picked.nbtName).toBe(countMaterials(source, cp, selection)[0].nbtName);
      expect(picked.baseId).toBe(schematic.get((color.r << 16) | (color.g << 8) | color.b)!.baseId);
    }
  });

  it('never guesses diamond for an unmapped pixel absent from the materials', () => {
    const diamond = pixel(31);
    diamond[0]++;
    const source = image([pixel(8), pixel(21), pixel(29), diamond]);
    expect(computeRawMaterials(source, cp, selection, { wide: 1, tall: 1 }).map(item => item.displayName))
      .toEqual(['White Wool', 'Gray Wool', 'Black Wool']);
    expect(sampleMaterialPixel(source, 3, 0, lookup)).toBeNull();
    expect([0, 1, 2].map(x => sampleMaterialPixel(source, x, 0, lookup)!.baseId)).toEqual([8, 21, 29]);
  });

  it('uses export preference for multiple blocks, not checkbox insertion order', () => {
    const reversed = { ...selection, 13: [3, 0] };
    const material = sampleMaterialPixel(image([pixel(8)]), 0, 0, buildMaterialLookup(cp, reversed))!;
    expect(material.blockId).toBe(0);
    expect(material.nbtName).toBe(getPreferredBlockNbt(8, reversed));
    expect(material.nbtName).toBe('white_wool');
  });

  it('honours a single selected alternative and never resurrects disabled blocks from an old palette', () => {
    const concrete = buildMaterialLookup(cp, { ...selection, 13: [3] });
    expect(sampleMaterialPixel(image([pixel(8)]), 0, 0, concrete)?.nbtName).toBe('white_concrete');
    const disabled = { ...selection, 13: [] };
    expect(sampleMaterialPixel(image([pixel(8)]), 0, 0, buildMaterialLookup(cp, disabled))).toBeNull();
    expect(computeRawMaterials(image([pixel(8)]), cp, disabled, { wide: 1, tall: 1 })).toEqual([]);
  });

  it('treats alpha below 128 as air in both sampling and material counts', () => {
    const source = image([pixel(31, 0), pixel(31, 1), pixel(31, 127), pixel(8, 128)]);
    for (let x = 0; x < 3; x++) expect(sampleMaterialPixel(source, x, 0, lookup)).toBeNull();
    expect(sampleMaterialPixel(source, 3, 0, lookup)?.baseId).toBe(8);
    expect(computeRawMaterials(source, cp, selection, { wide: 1, tall: 1 }))
      .toEqual([expect.objectContaining({ nbtName: 'white_wool', total: 1 })]);
  });

  it('reads the actual source stride and rejects coordinates outside it', () => {
    const source = image([pixel(8), pixel(21), pixel(29), pixel(31)], 2);
    expect(sampleMaterialPixel(source, 0, 1, lookup)?.baseId).toBe(29);
    for (const [x, y] of [[-1, 0], [2, 0], [0, 2], [0.5, 0], [NaN, 0]]) {
      expect(sampleMaterialPixel(source, x, y, lookup)).toBeNull();
    }
  });

  it('does not confuse source block identity with an equal RGB in another preview shade', () => {
    const palette3D = buildComputedPalette(buildPaletteFromSelection(selection, [0, 1, 2], '1.21.11'));
    const sourceColor = palette3D.colors.find(color => color.baseId === 22 && color.shade === 2)!;
    const source = image([[sourceColor.r, sourceColor.g, sourceColor.b, 255]]);
    expect(sampleMaterialPixel(source, 0, 0, buildMaterialLookup(palette3D, selection))?.baseId).toBe(22);
  });

  it('keeps per-map totals coherent with the sampled opaque pixels', () => {
    const source = image(Array.from({ length: 256 }, (_, x) => pixel(x < 128 ? 8 : 29)));
    const materials = computeRawMaterials(source, cp, selection, { wide: 2, tall: 1 });
    expect(materials.map(entry => entry.perSection)).toEqual([[128, 0], [0, 128]]);
  });
});
