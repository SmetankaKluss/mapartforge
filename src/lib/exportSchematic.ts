/**
 * Schematic export: two sub-formats selected automatically by Minecraft version.
 *
 *  • 1.12.2 → MCEdit "Classic" / Alpha .schematic
 *    Root tag "Schematic": Width/Height/Length (short), Materials="Alpha",
 *    Blocks (byte array of numeric IDs), Data (byte array of data values).
 *    Understood by Schematica and old WorldEdit on 1.12.2.
 *
 *  • 1.13+ → Sponge Schematic v2
 *    Root tag "Schematic": Version=2, DataVersion, Width/Height/Length (short),
 *    Offset (int array ×3), PaletteMax, Palette (compound: name→int),
 *    BlockData (byte array, LEB128-varint palette indices), BlockEntities (empty list).
 *    Understood by modern WorldEdit, Litematica, and Axiom.
 *
 * Both formats produce the exact same block geometry as the .litematic exporter
 * (same noobline, support blocks, and staircase logic) via buildBlockVolume().
 */

import JSZip from 'jszip';
import { buildBlockVolume, extractTile, triggerDownload } from './exportLitematic';
import type { BlockVolume, SupportMode } from './exportLitematic';
import type { ComputedPalette } from './dithering';
import type { BlockSelection } from './paletteBlocks';
import type { MapGrid } from './types';
import { minecraftDataVersion, type MinecraftVersion } from './versionPresets';
import { NbtWriter, gzipBytes, encodeVarint } from './nbt';
import { getLegacyBlockId } from './legacyBlockIds';

/** True when version → MCEdit legacy format; false → Sponge v2. */
function isLegacyVersion(ver: MinecraftVersion): boolean {
  return ver === '1.12.2';
}

// ── MCEdit legacy ─────────────────────────────────────────────────────────────

function writeLegacySchematic(vol: BlockVolume): Uint8Array {
  const { sizeX, sizeY, sizeZ, indices, palette } = vol;
  const totalBlocks = sizeX * sizeY * sizeZ;

  const blocksArr = new Uint8Array(totalBlocks);
  const dataArr   = new Uint8Array(totalBlocks);

  // Volume layout in our intermediate: y outer, z middle, x inner
  // MCEdit expects: same layout (Height outer, Length=z middle, Width=x inner)
  for (let i = 0; i < totalBlocks; i++) {
    const palIdx = indices[i];
    if (palIdx === 0) continue; // air
    // Strip "minecraft:" prefix
    const name = palette[palIdx].replace('minecraft:', '');
    const legacy = getLegacyBlockId(name);
    blocksArr[i] = legacy.id & 0xff;
    dataArr[i]   = legacy.data & 0x0f;
  }

  const w = new NbtWriter();
  w.tagCompoundStart('Schematic');
    w.tagString('Materials', 'Alpha');
    w.tagShort('Width',  sizeX);
    w.tagShort('Height', sizeY);
    w.tagShort('Length', sizeZ);
    w.tagByteArray('Blocks', blocksArr);
    w.tagByteArray('Data',   dataArr);
    w.tagListStart('Entities',     10, 0);
    w.tagListStart('TileEntities', 10, 0);
  w.tagCompoundEnd();

  return w.toBytes();
}

// ── Sponge v2 ─────────────────────────────────────────────────────────────────

function writeSpongeSchematic(vol: BlockVolume, _name: string, mcVersion: MinecraftVersion): Uint8Array {
  const { sizeX, sizeY, sizeZ, indices, palette } = vol;

  // Build Sponge palette: deduplicate palette entries (keep canonical names)
  const spongeByName = new Map<string, number>();
  let nextIdx = 0;

  // Pre-register air at 0
  spongeByName.set('minecraft:air', nextIdx++);

  // Walk the volume to collect used palette entries
  for (let i = 0; i < indices.length; i++) {
    const palIdx = indices[i];
    if (palIdx === 0) continue;
    const name = palette[palIdx];
    if (!spongeByName.has(name)) spongeByName.set(name, nextIdx++);
  }

  // Build BlockData: LEB128-varint for each block in the volume
  const variantBytes: number[] = [];
  for (let i = 0; i < indices.length; i++) {
    const palIdx = indices[i];
    const name   = palette[palIdx];
    const si     = spongeByName.get(name) ?? 0;
    for (const b of encodeVarint(si)) variantBytes.push(b);
  }
  const blockData = new Uint8Array(variantBytes);

  const dataVersion = minecraftDataVersion(mcVersion);

  const w = new NbtWriter();
  w.tagCompoundStart('Schematic');
    w.tagInt('Version',     2);
    w.tagInt('DataVersion', dataVersion);

    w.tagCompoundStart('Metadata');
      w.tagString('Name',   _name);
      w.tagString('Author', 'MapKluss');
    w.tagCompoundEnd();

    w.tagShort('Width',  sizeX);
    w.tagShort('Height', sizeY);
    w.tagShort('Length', sizeZ);

    w.tagIntArray('Offset', [0, 0, 0]);
    w.tagInt('PaletteMax', spongeByName.size);

    w.tagCompoundStart('Palette');
    for (const [blockName, idx] of spongeByName) {
      w.tagInt(blockName, idx);
    }
    w.tagCompoundEnd();

    w.tagByteArray('BlockData', blockData);

    w.tagListStart('BlockEntities', 10, 0);
  w.tagCompoundEnd();

  return w.toBytes();
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Export a single .schematic; format selected by MC version. */
export async function exportSchematic(
  imageData:        ImageData,
  cp:               ComputedPalette,
  groups:           BlockSelection,
  name:             string = 'MapartForge',
  structure:        'flat' | 'staircase' = 'flat',
  supportBlockNbt?: string,
  supportMode:      SupportMode = 1,
  staircaseMode:    'classic' | 'optimized' = 'classic',
  mcVersion:        MinecraftVersion = '1.21.4',
): Promise<void> {
  const vol     = buildBlockVolume(imageData, cp, groups, structure, supportBlockNbt, staircaseMode, supportMode);
  const suffix  = structure === 'staircase' ? '_3d' : '_2d';
  const legacy  = isLegacyVersion(mcVersion);
  const raw     = legacy
    ? writeLegacySchematic(vol)
    : writeSpongeSchematic(vol, name, mcVersion);
  const bytes   = await gzipBytes(raw);
  triggerDownload(bytes, `${name}${suffix}.schematic`);
}

/** Export per-tile .schematic files as a ZIP (for multi-map grids). */
export async function exportSchematicZip(
  imageData:        ImageData,
  cp:               ComputedPalette,
  groups:           BlockSelection,
  mapGrid:          MapGrid,
  structure:        'flat' | 'staircase',
  zipFilename:      string,
  supportBlockNbt?: string,
  supportMode:      SupportMode = 1,
  staircaseMode:    'classic' | 'optimized' = 'classic',
  mcVersion:        MinecraftVersion = '1.21.4',
): Promise<void> {
  const zip = new JSZip();
  const legacy = isLegacyVersion(mcVersion);
  let idx = 1;
  for (let row = 0; row < mapGrid.tall; row++) {
    for (let col = 0; col < mapGrid.wide; col++) {
      const tile   = extractTile(imageData, col, row);
      const tileName = `mapart_${idx}`;
      const vol    = buildBlockVolume(tile, cp, groups, structure, supportBlockNbt, staircaseMode, supportMode);
      const raw    = legacy
        ? writeLegacySchematic(vol)
        : writeSpongeSchematic(vol, tileName, mcVersion);
      const bytes  = await gzipBytes(raw);
      zip.file(`${tileName}.schematic`, bytes);
      idx++;
    }
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: zipFilename });
  a.click();
  URL.revokeObjectURL(url);
}

/** Human-readable format label for the export button. */
export function schematicVariantLabel(mcVersion: MinecraftVersion): string {
  return isLegacyVersion(mcVersion) ? 'SCHEMATIC (MCEdit)' : 'SCHEMATIC (Sponge)';
}
