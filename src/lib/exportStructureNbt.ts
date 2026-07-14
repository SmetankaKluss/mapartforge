/**
 * Vanilla structure block (.nbt) export.
 *
 * Format: gzip-compressed NBT with root tag "" (unnamed compound):
 *   DataVersion  (int)
 *   size         (TAG_List of TAG_Int: [x, y, z])
 *   palette      (TAG_List of TAG_Compound: {Name:string, Properties?:compound})
 *   blocks       (TAG_List of TAG_Compound: {state:int, pos:TAG_List of TAG_Int [x,y,z]})
 *   entities     (TAG_List of TAG_Compound, empty)
 *
 * Note: In a TAG_List of TAG_Compound, each element writes its named tags
 * directly (no tagCompoundStart per element) and is terminated by tagCompoundEnd().
 *
 * Compatible with vanilla /place structure and NBT loaders since 1.13.
 * Uses modern block-state names — 1.12.2 is NOT supported by this format.
 */

import JSZip from 'jszip';
import { buildBlockVolume, blockStateProperties, extractTile, triggerDownload } from './exportLitematic';
import type { SupportMode } from './exportLitematic';
import type { ComputedPalette } from './dithering';
import type { BlockSelection } from './paletteBlocks';
import type { MapGrid } from './types';
import { NbtWriter, gzipBytes } from './nbt';

// Current Java Edition data version (1.21.4)
const DATA_VERSION = 4082;

function writeStructureNbt(
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  indices: Uint32Array,
  palette: string[],
): Uint8Array {
  // Collect non-air block placements up-front so we know the count.
  const blockEntries: { state: number; x: number; y: number; z: number }[] = [];
  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const vi    = y * sizeZ * sizeX + z * sizeX + x;
        const state = indices[vi];
        if (state === 0) continue;
        blockEntries.push({ state, x, y, z });
      }
    }
  }

  const w = new NbtWriter();
  w.tagCompoundStart('');
    w.tagInt('DataVersion', DATA_VERSION);
    w.tagIntList('size', [sizeX, sizeY, sizeZ]);

    // palette — TAG_List of TAG_Compound
    // Inside TAG_List<Compound> each element writes named tags + TAG_End, no outer header.
    w.tagListStart('palette', 10 /* TAG_Compound */, palette.length);
    for (const name of palette) {
      w.tagString('Name', name);
      const props = blockStateProperties(name);
      if (props) {
        w.tagCompoundStart('Properties');
        for (const [k, v] of Object.entries(props)) w.tagString(k, v);
        w.tagCompoundEnd();
      }
      w.tagCompoundEnd(); // end of palette element
    }

    // blocks — TAG_List of TAG_Compound
    w.tagListStart('blocks', 10 /* TAG_Compound */, blockEntries.length);
    for (const { state, x, y, z } of blockEntries) {
      w.tagInt('state', state);
      w.tagIntList('pos', [x, y, z]);
      w.tagCompoundEnd(); // end of block element
    }

    // entities — empty TAG_List
    w.tagListStart('entities', 10, 0);
  w.tagCompoundEnd(); // root

  return w.toBytes();
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Export a single .nbt structure file. */
export async function exportStructureNbt(
  imageData:        ImageData,
  cp:               ComputedPalette,
  groups:           BlockSelection,
  name:             string = 'MapartForge',
  structure:        'flat' | 'staircase' = 'flat',
  supportBlockNbt?: string,
  supportMode:      SupportMode = 1,
  staircaseMode:    'classic' | 'optimized' = 'classic',
): Promise<void> {
  const vol    = buildBlockVolume(imageData, cp, groups, structure, supportBlockNbt, staircaseMode, supportMode);
  const raw    = writeStructureNbt(vol.sizeX, vol.sizeY, vol.sizeZ, vol.indices, vol.palette);
  const bytes  = await gzipBytes(raw);
  const suffix = structure === 'staircase' ? '_3d' : '_2d';
  triggerDownload(bytes, `${name}${suffix}.nbt`);
}

/** Export per-tile .nbt files as a ZIP (for multi-map grids). */
export async function exportStructureNbtZip(
  imageData:        ImageData,
  cp:               ComputedPalette,
  groups:           BlockSelection,
  mapGrid:          MapGrid,
  structure:        'flat' | 'staircase',
  zipFilename:      string,
  supportBlockNbt?: string,
  supportMode:      SupportMode = 1,
  staircaseMode:    'classic' | 'optimized' = 'classic',
): Promise<void> {
  const zip = new JSZip();
  let idx = 1;
  for (let row = 0; row < mapGrid.tall; row++) {
    for (let col = 0; col < mapGrid.wide; col++) {
      const tile     = extractTile(imageData, col, row);
      const tileName = `mapart_${idx}`;
      const vol      = buildBlockVolume(tile, cp, groups, structure, supportBlockNbt, staircaseMode, supportMode);
      const raw      = writeStructureNbt(vol.sizeX, vol.sizeY, vol.sizeZ, vol.indices, vol.palette);
      const bytes    = await gzipBytes(raw);
      zip.file(`${tileName}.nbt`, bytes);
      idx++;
    }
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: zipFilename });
  a.click();
  URL.revokeObjectURL(url);
}
