import JSZip from 'jszip';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ComputedPalette } from '../dithering';
import type { BlockSelection } from '../paletteBlocks';
import {
  buildSuppressionArtifacts,
  buildSuppressionMultiMapArtifacts,
  buildSuppressionMultiMapZipFromInput,
  buildSuppressionMultiMapZipBlob,
  buildSuppressionZipBlob,
} from '../suppressionExport';
import { SUPPRESSION_MAX_BUNDLE_EXPANDED_BYTES } from '../suppressionPlan';

const color = { r: 153, g: 51, b: 51, name: 'RED_1', baseId: 28, shade: 1 };
const palette: ComputedPalette = {
  colors: [color],
  labs: [],
  exactLookup: new Map([[(color.r << 16) | (color.g << 8) | color.b, 0]]),
  matchMode: 'oklab',
  coords: new Float64Array(0),
};
const selection: BlockSelection = { 27: [0] };

function input() {
  const data = new Uint8ClampedArray(128 * 128 * 4);
  for (let i = 0; i < 128 * 128; i++) {
    data[i * 4] = color.r;
    data[i * 4 + 1] = color.g;
    data[i * 4 + 2] = color.b;
    data[i * 4 + 3] = 255;
  }
  return {
    imageData: { data, width: 128, height: 128 },
    palette,
    blockSelection: selection,
    grid: { wide: 1, tall: 1 },
    mapMode: '3d' as const,
    platformMode: 'java' as const,
    minecraftVersion: '1.21.8' as const,
  };
}

function nbtPaletteState(name: string, axis: 'x' | 'y'): Buffer {
  const nbtString = (tagName: string, value: string) => Buffer.concat([
    Buffer.from([8, tagName.length >> 8, tagName.length & 0xff]),
    Buffer.from(tagName),
    Buffer.from([value.length >> 8, value.length & 0xff]),
    Buffer.from(value),
  ]);
  return Buffer.concat([
    nbtString('Name', name),
    Buffer.from([10, 0, 10]),
    Buffer.from('Properties'),
    nbtString('axis', axis),
  ]);
}

describe('Two-layer bundle export', () => {
  it('is deterministic and contains the plan, Litematic, instructions and hashes', async () => {
    const first = await buildSuppressionArtifacts('Test Art', input());
    const second = await buildSuppressionArtifacts('Test Art', input());

    expect(first.planJson).toBe(second.planJson);
    expect(first.litematicBytes).toEqual(second.litematicBytes);
    expect(first.plan.litematic.sha256).toMatch(/^[a-f0-9]{64}$/);

    const zipBlob = await buildSuppressionZipBlob(first);
    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      'README_EN.txt',
      'README_RU.txt',
      'SHA256.json',
      first.litematicFilename,
      first.planFilename,
    ].sort());
    const parsedPlan = JSON.parse(await zip.file(first.planFilename)!.async('text')) as {
      schema: string;
      version: number;
      phases: unknown[];
      canvas?: unknown;
    };
    expect(parsedPlan.schema).toBe('mapkluss.suppression-plan');
    expect(parsedPlan.version).toBe(3);
    expect(parsedPlan.canvas).toBeUndefined();
    expect(parsedPlan.phases).toHaveLength(64);
    const manifest = JSON.parse(await zip.file('SHA256.json')!.async('text')) as { files: unknown[] };
    expect(manifest.files).toHaveLength(4);
    expect(Object.keys(zip.files).some(name => name.includes('canvas') || name.includes('reusable'))).toBe(false);
    expect(await zip.file('README_RU.txt')!.async('text')).toContain('вручную бери карту в руку');
    expect(await zip.file('README_EN.txt')!.async('text')).toContain('manually hold the map');
    expect(await zip.file('README_RU.txt')!.async('text')).toContain('не блокирует инвентарь');
    expect(new TextEncoder().encode(first.planJson).byteLength).toBeLessThan(1536 * 1024);
  });

  it('exports every tile of a larger art in deterministic row-major order', async () => {
    const multi = input();
    multi.grid = { wide: 2, tall: 2 };
    const source = multi.imageData.data;
    const data = new Uint8ClampedArray(256 * 256 * 4);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const sourceOffset = ((y % 128) * 128 + (x % 128)) * 4;
        const offset = (y * 256 + x) * 4;
        data.set(source.subarray(sourceOffset, sourceOffset + 4), offset);
      }
    }
    multi.imageData = { data, width: 256, height: 256 };

    const bundle = await buildSuppressionMultiMapArtifacts('Large Art', multi);
    expect(bundle.tiles.map(tile => [tile.index, tile.column, tile.row])).toEqual([
      [1, 0, 0], [2, 1, 0], [3, 0, 1], [4, 1, 1],
    ]);
    const zip = await JSZip.loadAsync(await (await buildSuppressionMultiMapZipBlob(bundle)).arrayBuffer());
    const manifest = JSON.parse(await zip.file('SHA256.json')!.async('text')) as {
      version: number;
      grid: { wide: number; tall: number };
      tileOrder: string;
      tiles: Array<{ index: number; column: number; row: number; plan: { path: string }; litematic: { path: string } }>;
      files: Array<{ path: string }>;
    };
    expect(manifest.version).toBe(2);
    expect(manifest.grid).toEqual({ wide: 2, tall: 2 });
    expect(manifest.tileOrder).toBe('row_major_top_left');
    expect(manifest.tiles).toHaveLength(4);
    expect(manifest.files).toHaveLength(10);
    for (const tile of manifest.tiles) {
      expect(zip.file(tile.plan.path)).not.toBeNull();
      expect(zip.file(tile.litematic.path)).not.toBeNull();
    }
    const expandedBytes = (await Promise.all(Object.values(zip.files)
      .filter(entry => !entry.dir)
      .map(async entry => (await entry.async('uint8array')).byteLength)))
      .reduce((sum, size) => sum + size, 0);
    expect(expandedBytes).toBeLessThanOrEqual(SUPPRESSION_MAX_BUNDLE_EXPANDED_BYTES);

    const streamedFirst = new Uint8Array(await (await buildSuppressionMultiMapZipFromInput('Large Art', multi)).arrayBuffer());
    const streamedSecond = new Uint8Array(await (await buildSuppressionMultiMapZipFromInput('Large Art', multi)).arrayBuffer());
    expect(streamedFirst).toEqual(streamedSecond);
    const streamedZip = await JSZip.loadAsync(streamedFirst);
    const streamedManifest = JSON.parse(await streamedZip.file('SHA256.json')!.async('text')) as {
      grid: { wide: number; tall: number };
      tiles: unknown[];
    };
    expect(streamedManifest.grid).toEqual({ wide: 2, tall: 2 });
    expect(streamedManifest.tiles).toHaveLength(4);
  }, 20_000);

  it('writes selected log axes into the actual Litematic palette', async () => {
    const vertical = { r: 143, g: 119, b: 72, name: 'OAK_1', baseId: 13, shade: 1 };
    const horizontal = { r: 129, g: 86, b: 49, name: 'SPRUCE_1', baseId: 34, shade: 1 };
    const axisInput = input();
    axisInput.palette = {
      colors: [vertical, horizontal],
      labs: [],
      exactLookup: new Map([
        [(vertical.r << 16) | (vertical.g << 8) | vertical.b, 0],
        [(horizontal.r << 16) | (horizontal.g << 8) | horizontal.b, 1],
      ]),
      matchMode: 'oklab',
      coords: new Float64Array(0),
    };
    axisInput.blockSelection = { 11: [0], 33: [3] };
    for (let z = 0; z < 128; z++) {
      for (let x = 0; x < 128; x++) {
        const chosen = ((x + z) & 1) === 0 ? vertical : horizontal;
        const offset = (z * 128 + x) * 4;
        axisInput.imageData.data[offset] = chosen.r;
        axisInput.imageData.data[offset + 1] = chosen.g;
        axisInput.imageData.data[offset + 2] = chosen.b;
      }
    }

    const artifacts = await buildSuppressionArtifacts('Axis Test', axisInput);
    const uncompressed = gunzipSync(artifacts.litematicBytes);

    expect(uncompressed.indexOf(nbtPaletteState('minecraft:oak_log', 'y'))).toBeGreaterThanOrEqual(0);
    expect(uncompressed.indexOf(nbtPaletteState('minecraft:oak_log', 'x'))).toBeGreaterThanOrEqual(0);
  });
});
