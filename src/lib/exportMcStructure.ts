/**
 * Bedrock Edition .mcstructure export.
 *
 * Format: uncompressed little-endian NBT, root compound name "":
 *
 *   format_version   TAG_Int  = 1
 *   size             TAG_List<TAG_Int>[3]  = [sizeX, sizeY, sizeZ]
 *   structure        TAG_Compound
 *     block_indices  TAG_List<TAG_List<TAG_Int>>[2]
 *       [0] primary   layer: palette index per voxel (air = 0)
 *       [1] secondary layer: all -1 (waterlogging, unused for map art)
 *     entities       TAG_List<TAG_Compound>  (empty)
 *     palette        TAG_Compound
 *       default      TAG_Compound
 *         block_palette       TAG_List<TAG_Compound>
 *           name      TAG_String  (full Bedrock block id, e.g. "minecraft:stone")
 *           states    TAG_Compound (block states, empty for most blocks)
 *           version   TAG_Int  = BEDROCK_BLOCK_VERSION
 *         block_position_data TAG_Compound (empty)
 *
 * Voxel index layout: y outer → z middle → x inner
 *   idx = y * sizeZ * sizeX + z * sizeX + x
 * This is the same layout used by buildBlockVolume.
 *
 * Compatible with Bedrock Edition 1.20.80+.
 */

import JSZip from 'jszip';
import { buildBlockVolume, extractTile, triggerDownload } from './exportLitematic';
import type { SupportMode } from './exportLitematic';
import type { ComputedPalette } from './dithering';
import type { BlockSelection } from './paletteBlocks';
import type { MapGrid } from './types';
import { NbtWriterLE } from './nbtLE';
import { toBedrockBlock, BEDROCK_BLOCK_VERSION } from './bedrockBlockNames';

function writeMcStructure(
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  indices: Uint32Array,
  palette: string[],
): Uint8Array {
  const total = sizeX * sizeY * sizeZ;

  // Flatten indices into a plain array for the primary layer.
  // Index 0 = air (palette[0] is always 'minecraft:air').
  const primaryLayer = Array.from({ length: total }, (_, i) => indices[i]);
  const secondaryLayer = new Array<number>(total).fill(-1);

  // Pre-resolve Java palette entries → Bedrock block defs.
  const bedrockPalette = palette.map(javaName => toBedrockBlock(javaName));

  const w = new NbtWriterLE();
  w.tagCompoundStart('');
    w.tagInt('format_version', 1);
    w.tagIntList('size', [sizeX, sizeY, sizeZ]);

    w.tagCompoundStart('structure');

      // block_indices: outer TAG_List<TAG_List> (elementType=9)
      w.tagListStart('block_indices', 9 /* TAG_List */, 2);
      w.inlineIntList(primaryLayer);
      w.inlineIntList(secondaryLayer);

      // entities: empty TAG_List<TAG_Compound>
      w.tagListStart('entities', 10, 0);

      w.tagCompoundStart('palette');
        w.tagCompoundStart('default');

          // block_palette: TAG_List<TAG_Compound>
          w.tagListStart('block_palette', 10 /* TAG_Compound */, bedrockPalette.length);
          for (const bd of bedrockPalette) {
            // Named tags written directly (no tagCompoundStart for list elements)
            w.tagString('name', bd.name);
            w.tagCompoundStart('states');
              if (bd.stringStates) for (const [k, v] of Object.entries(bd.stringStates)) w.tagString(k, v);
              if (bd.intStates)    for (const [k, v] of Object.entries(bd.intStates))    w.tagInt(k, v);
              if (bd.byteStates)  for (const [k, v] of Object.entries(bd.byteStates))   w.tagByte(k, v);
            w.tagCompoundEnd();
            w.tagInt('version', BEDROCK_BLOCK_VERSION);
            w.tagCompoundEnd(); // end palette element
          }

          // block_position_data: empty compound
          w.tagCompoundStart('block_position_data');
          w.tagCompoundEnd();

        w.tagCompoundEnd(); // default
      w.tagCompoundEnd(); // palette

    w.tagCompoundEnd(); // structure
  w.tagCompoundEnd(); // root

  return w.toBytes();
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Export a single .mcstructure file for Bedrock Edition. */
export async function exportMcStructure(
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
  const bytes  = writeMcStructure(vol.sizeX, vol.sizeY, vol.sizeZ, vol.indices, vol.palette);
  const suffix = structure === 'staircase' ? '_3d' : '_2d';
  triggerDownload(bytes, `${name}${suffix}.mcstructure`);
}

/** Export per-tile .mcstructure files as a ZIP for multi-map grids. */
export async function exportMcStructureZip(
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
      const bytes    = writeMcStructure(vol.sizeX, vol.sizeY, vol.sizeZ, vol.indices, vol.palette);
      zip.file(`${tileName}.mcstructure`, bytes);
      idx++;
    }
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: zipFilename });
  a.click();
  URL.revokeObjectURL(url);
}
