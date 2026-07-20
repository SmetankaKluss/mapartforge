import JSZip from 'jszip';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ComputedPalette } from '../dithering';
import type { BlockSelection } from '../paletteBlocks';
import {
  buildSuppressionArtifacts,
  buildSuppressionMultiMapArtifacts,
  buildSuppressionMultiMapZipBlob,
  buildSuppressionZipBlob,
} from '../suppressionExport';
import type { SuppressionTargetVersion } from '../suppressionPlan';

const color = { r: 153, g: 51, b: 51, name: 'RED_1', baseId: 28, shade: 1 };
const palette: ComputedPalette = {
  colors: [color],
  labs: [],
  exactLookup: new Map([[(color.r << 16) | (color.g << 8) | color.b, 0]]),
  matchMode: 'oklab',
  coords: new Float64Array(0),
};
const selection: BlockSelection = { 27: [0] };

function input(minecraftVersion: SuppressionTargetVersion, wide = 1, tall = 1) {
  const width = wide * 128;
  const height = tall * 128;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    data[index * 4] = color.r;
    data[index * 4 + 1] = color.g;
    data[index * 4 + 2] = color.b;
    data[index * 4 + 3] = 255;
  }
  return {
    imageData: { data, width, height },
    palette,
    blockSelection: selection,
    grid: { wide, tall },
    mapMode: '3d' as const,
    platformMode: 'java' as const,
    minecraftVersion,
  };
}

describe('Two-layer site-to-Companion interoperability fixture', () => {
  it('emits art-only v3 bundles for both supported Minecraft versions', async () => {
    const outputDir = process.env.MAPKLUSS_SUPPRESSION_INTEROP_DIR;
    if (outputDir) mkdirSync(outputDir, { recursive: true });

    for (const minecraftVersion of ['26.2', '1.21.11', '1.21.8', '1.21.4'] as const) {
      const artifacts = await buildSuppressionArtifacts(`Interop ${minecraftVersion}`, input(minecraftVersion));
      const zipBlob = await buildSuppressionZipBlob(artifacts);
      const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
      const zip = await JSZip.loadAsync(zipBytes);

      expect(artifacts.plan.version).toBe(3);
      expect(artifacts.plan.target.minecraftVersion).toBe(minecraftVersion);
      expect(artifacts.plan.structureBounds.max.x).toBe(127);
      expect(artifacts.plan.workflowBounds.max.x).toBe(253);
      expect('canvas' in artifacts.plan).toBe(false);
      expect(artifacts.plan.palette.every(entry => !entry.roles.includes('marker' as never))).toBe(true);
      expect(zip.file(artifacts.litematicFilename)).not.toBeNull();
      expect(zip.file(artifacts.planFilename)).not.toBeNull();
      expect(zip.file('SHA256.json')).not.toBeNull();
      expect(Object.keys(zip.files).some(name => name.includes('canvas') || name.includes('reusable'))).toBe(false);

      if (outputDir) {
        writeFileSync(join(outputDir, `site-v3-${minecraftVersion}.zip`), zipBytes);
      }
    }
  });

  it('emits a deterministic row-major v2 bundle for a 2x2 art', async () => {
    const outputDir = process.env.MAPKLUSS_SUPPRESSION_INTEROP_DIR;
    if (outputDir) mkdirSync(outputDir, { recursive: true });
    const first = await buildSuppressionMultiMapArtifacts('Interop 2x2', input('1.21.11', 2, 2));
    const second = await buildSuppressionMultiMapArtifacts('Interop 2x2', input('1.21.11', 2, 2));
    const firstBytes = new Uint8Array(await (await buildSuppressionMultiMapZipBlob(first)).arrayBuffer());
    const secondBytes = new Uint8Array(await (await buildSuppressionMultiMapZipBlob(second)).arrayBuffer());
    const zip = await JSZip.loadAsync(firstBytes);
    const manifest = JSON.parse(await zip.file('SHA256.json')!.async('string')) as {
      version: number;
      tileOrder: string;
      tiles: Array<{ id: string; index: number; column: number; row: number }>;
    };

    expect(firstBytes).toEqual(secondBytes);
    expect(manifest.version).toBe(2);
    expect(manifest.tileOrder).toBe('row_major_top_left');
    expect(manifest.tiles.map(tile => [tile.id, tile.index, tile.column, tile.row])).toEqual([
      ['tile_001', 1, 0, 0],
      ['tile_002', 2, 1, 0],
      ['tile_003', 3, 0, 1],
      ['tile_004', 4, 1, 1],
    ]);

    if (outputDir) writeFileSync(join(outputDir, 'site-v2-multimap-2x2.zip'), firstBytes);
  }, 20_000);
});
