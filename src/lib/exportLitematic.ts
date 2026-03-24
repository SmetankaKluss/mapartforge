import JSZip from 'jszip';
import { NbtWriter, gzipBytes } from './nbt';
import type { ComputedPalette } from './dithering';
import type { BlockSelection } from './paletteBlocks';
import { getPreferredBlockNbt, isMandatorySupport } from './paletteBlocks';
import type { MapGrid } from './types';

/**
 * Blocks that require specific block-state Properties in the palette entry
 * to be placed correctly in-game (e.g. glow_lichen must declare which face
 * it attaches to — otherwise Minecraft treats it as a blank/floating block).
 */
const BLOCK_FACE_PROPS: Record<string, Record<string, string>> = {
  'minecraft:glow_lichen': {
    down: 'true', east: 'false', north: 'false', south: 'false', up: 'false', west: 'false',
  },
};

export type SupportMode =
  | 1  // 1 block under floating-only blocks (sand, gravel, lichens…)
  | 2  // 1 block under every art block
  | 3; // 2 blocks under every art block

interface ColorEntry { baseId: number; shade: number }

function buildLookup(cp: ComputedPalette): Map<number, ColorEntry> {
  const m = new Map<number, ColorEntry>();
  for (const c of cp.colors) {
    const key = (c.r << 16) | (c.g << 8) | c.b;
    if (!m.has(key)) m.set(key, { baseId: c.baseId, shade: c.shade });
  }
  return m;
}

/**
 * Compute staircase Y-levels for every pixel column.
 *
 * Minecraft map shading (north = z-1):
 *   shade 0 (mult 180, dark)   → north is HIGHER  → current = prevY - 1
 *   shade 1 (mult 220, medium) → same height       → current = prevY
 *   shade 2 (mult 255, bright) → north is LOWER    → current = prevY + 1
 *   shade 3 (water, very dark) → approximated as shade 1
 */
function computeStaircase(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  lookup: Map<number, ColorEntry>,
): { yGrid: Int32Array; minY: number; maxY: number } {
  const yGrid = new Int32Array(width * height);
  const prevY = new Int32Array(width).fill(1);

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const i   = (z * width + x) * 4;
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      const shade = lookup.get(key)?.shade ?? 2;

      const y = shade === 0 ? prevY[x] - 1
              : shade === 2 ? prevY[x] + 1
              : prevY[x];

      yGrid[z * width + x] = y;
      prevY[x] = y;
    }
  }

  let minY = Infinity, maxY = -Infinity;
  for (const v of yGrid) {
    if (v < minY) minY = v;
    if (v > maxY) maxY = v;
  }
  if (!isFinite(minY)) { minY = 0; maxY = 0; }
  return { yGrid, minY, maxY };
}

/**
 * Pack block state indices into Litematica's long-array format.
 * Entries span across longs (unlike vanilla's padded format).
 * bitsPerEntry = max(2, ceil(log2(paletteSize)))
 */
function packBlockStates(indices: Uint32Array, paletteSize: number): BigInt64Array {
  const bpe      = Math.max(2, Math.ceil(Math.log2(Math.max(paletteSize, 2))));
  const totalBits = indices.length * bpe;
  const longs    = new BigInt64Array(Math.ceil(totalBits / 64));
  const mask     = (1n << BigInt(bpe)) - 1n;

  for (let i = 0; i < indices.length; i++) {
    const v      = BigInt(indices[i]) & mask;
    const bitPos = i * bpe;
    const li     = Math.floor(bitPos / 64);
    const bi     = bitPos % 64;
    longs[li]   |= v << BigInt(bi);
    if (bi + bpe > 64 && li + 1 < longs.length) {
      longs[li + 1] |= v >> BigInt(64 - bi);
    }
  }
  return longs;
}

function triggerDownload(bytes: Uint8Array, filename: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/** Extract a 128×128 tile from a full ImageData (col/row in tile units). */
function extractTile(src: ImageData, col: number, row: number): ImageData {
  const tw = 128, th = 128;
  const out = new ImageData(tw, th);
  const ox = col * tw, oy = row * th;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const si = ((oy + y) * src.width + (ox + x)) * 4;
      const di = (y * tw + x) * 4;
      out.data[di]     = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

/** Core builder: returns gzipped .litematic bytes for one tile. */
async function buildLitematicBytes(
  imageData:        ImageData,
  cp:               ComputedPalette,
  groups:           BlockSelection,
  name:             string,
  structure:        'flat' | 'staircase',
  supportBlockNbt?: string,
  supportMode:      SupportMode = 2,
): Promise<Uint8Array> {
  const { data, width, height } = imageData;
  const lookup = buildLookup(cp);

  const sizeX = width;
  const sizeZ = height;

  // ── 1. Determine Y dimensions ─────────────────────────────────────────
  let sizeY: number;
  let yGrid: Int32Array | null = null;
  let minY  = 0;
  const exportSizeZ = sizeZ;

  if (structure === 'staircase') {
    const sc = computeStaircase(data, width, height, lookup);
    yGrid = sc.yGrid;
    minY  = sc.minY;
    sizeY = Math.max(1, sc.maxY - minY + 1);
  } else {
    sizeY = 1; // may be updated to 2 after pixelBaseId is populated (step 2b)
  }

  // ── 2. Block palette ──────────────────────────────────────────────────
  const blockPalette: string[] = ['minecraft:air'];
  const blockToIdx   = new Map<string, number>([['minecraft:air', 0]]);
  const pixelBlock   = new Array<number>(width * height);
  const pixelBaseId  = new Int32Array(width * height);

  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const i = (z * width + x) * 4;
      // Transparent pixel → air (index 0), no block placed
      if (data[i + 3] < 128) {
        pixelBlock[z * sizeX + x]  = 0; // minecraft:air
        pixelBaseId[z * sizeX + x] = -1;
        continue;
      }
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      const entry   = lookup.get(key);
      const nbt     = entry ? getPreferredBlockNbt(entry.baseId, groups) : 'stone';
      const blockId = `minecraft:${nbt}`;
      let idx = blockToIdx.get(blockId);
      if (idx === undefined) {
        idx = blockPalette.length;
        blockToIdx.set(blockId, idx);
        blockPalette.push(blockId);
      }
      pixelBlock[z * sizeX + x]  = idx;
      pixelBaseId[z * sizeX + x] = entry?.baseId ?? 0;
    }
  }

  // ── 2b. Flat mode: expand to 2 layers when mandatory-support blocks present ─
  if (structure === 'flat' && supportBlockNbt && supportBlockNbt !== 'air') {
    if (pixelBaseId.some(bid => isMandatorySupport(bid, groups))) {
      sizeY = 2;
    }
  }

  // ── 3. Fill volume (Y×exportSizeZ×X, y outer) ────────────────────────
  const volume  = sizeX * sizeY * exportSizeZ;
  const indices = new Uint32Array(volume);

  if (structure === 'staircase') {
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const pi = z * sizeX + x;
        const y  = yGrid![pi] - minY;
        const vi = y * exportSizeZ * sizeX + z * sizeX + x;
        indices[vi] = pixelBlock[pi];
      }
    }
  } else {
    const artY = sizeY - 1; // 0 normally, 1 when support layer added below
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const pi = z * sizeX + x;
        const vi = artY * exportSizeZ * sizeX + z * sizeX + x;
        indices[vi] = pixelBlock[pi];
      }
    }
    // Support layer (y=0) under floating blocks in flat mode
    if (sizeY === 2 && supportBlockNbt && supportBlockNbt !== 'air') {
      const supId = `minecraft:${supportBlockNbt}`;
      let supIdx = blockToIdx.get(supId);
      if (supIdx === undefined) {
        supIdx = blockPalette.length;
        blockPalette.push(supId);
        blockToIdx.set(supId, supIdx);
      }
      for (let z = 0; z < sizeZ; z++) {
        for (let x = 0; x < sizeX; x++) {
          const pi = z * sizeX + x;
          if (pixelBaseId[pi] < 0) continue; // transparent pixel
          if (!isMandatorySupport(pixelBaseId[pi], groups)) continue;
          const vi = 0 * exportSizeZ * sizeX + z * sizeX + x;
          indices[vi] = supIdx;
        }
      }
    }
  }

  // ── 3b. Support blocks (staircase only) ──────────────────────────────
  if (structure === 'staircase' && supportBlockNbt && supportBlockNbt !== 'air') {
    const supId = `minecraft:${supportBlockNbt}`;
    let supIdx = blockToIdx.get(supId);
    if (supIdx === undefined) {
      supIdx = blockPalette.length;
      blockPalette.push(supId);
      blockToIdx.set(supId, supIdx);
    }
    const depth = supportMode === 3 ? 2 : 1;
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const pi = z * sizeX + x;
        const i  = (z * width + x) * 4;
        const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        const entry = lookup.get(key);
        // Mode 1: only blocks that can't float (supportBlockMandatory)
        if (supportMode === 1 && !isMandatorySupport(entry?.baseId ?? 0, groups)) continue;
        const pixelY = yGrid![pi] - minY;
        for (let d = 1; d <= depth; d++) {
          const sy = pixelY - d;
          if (sy < 0) continue;
          const vi = sy * exportSizeZ * sizeX + z * sizeX + x;
          if (indices[vi] === 0) indices[vi] = supIdx;
        }
      }
    }
  }

  // ── 4. Pack block states ──────────────────────────────────────────────
  const packedStates = packBlockStates(indices, blockPalette.length);

  // ── 5. Write NBT ──────────────────────────────────────────────────────
  const now = BigInt(Date.now());
  const w   = new NbtWriter();

  w.tagCompoundStart('');
    w.tagInt('MinecraftDataVersion', 3953);
    w.tagInt('Version', 6);

    w.tagCompoundStart('Metadata');
      w.tagString('Name', name);
      w.tagString('Author', 'MapKluss');
      w.tagString('Description', '');
      w.tagLong('TimeCreated', now);
      w.tagLong('TimeModified', now);
      w.tagCompoundStart('EnclosingSize');
        w.tagInt('x', sizeX);
        w.tagInt('y', sizeY);
        w.tagInt('z', exportSizeZ);
      w.tagCompoundEnd();
      w.tagInt('RegionCount', 1);
      w.tagIntList('TileContainerEntityCount', [0]);
    w.tagCompoundEnd();

    w.tagCompoundStart('Regions');
      w.tagCompoundStart(name);

        w.tagCompoundStart('Position');
          w.tagInt('x', 0); w.tagInt('y', 0); w.tagInt('z', 0);
        w.tagCompoundEnd();

        w.tagCompoundStart('Size');
          w.tagInt('x', sizeX); w.tagInt('y', sizeY); w.tagInt('z', exportSizeZ);
        w.tagCompoundEnd();

        w.tagListStart('BlockStatePalette', 10, blockPalette.length);
        for (const id of blockPalette) {
          w.tagString('Name', id);
          const props = BLOCK_FACE_PROPS[id];
          if (props) {
            w.tagCompoundStart('Properties');
            for (const [k, v] of Object.entries(props)) w.tagString(k, v);
            w.tagCompoundEnd();
          }
          w.tagCompoundEnd();
        }

        w.tagLongArray('BlockStates', packedStates);

        w.tagListStart('TileEntities', 10, 0);
        w.tagListStart('Entities', 10, 0);
        w.tagListStart('PendingBlockTicks', 10, 0);
        w.tagListStart('PendingFluidTicks', 10, 0);

      w.tagCompoundEnd();
    w.tagCompoundEnd();

  w.tagCompoundEnd();

  return gzipBytes(w.toBytes());
}

/** Download a single .litematic file for the full canvas. */
export async function exportLitematic(
  imageData:        ImageData,
  cp:               ComputedPalette,
  groups:           BlockSelection,
  name:             string = 'MapartForge',
  structure:        'flat' | 'staircase' = 'flat',
  supportBlockNbt?: string,
  supportMode:      SupportMode = 2,
): Promise<void> {
  const suffix = structure === 'staircase' ? '_3d' : '_2d';
  const bytes  = await buildLitematicBytes(imageData, cp, groups, name, structure, supportBlockNbt, supportMode);
  triggerDownload(bytes, `${name}${suffix}.litematic`);
}

/**
 * Split the canvas into 128×128 tiles and download a ZIP containing one
 * .litematic per tile, named mapart_1.litematic … mapart_N.litematic
 * in Z-order (left→right, top→bottom).
 */
export async function exportLitematicZip(
  imageData:        ImageData,
  cp:               ComputedPalette,
  groups:           BlockSelection,
  mapGrid:          MapGrid,
  structure:        'flat' | 'staircase',
  zipFilename:      string,
  supportBlockNbt?: string,
  supportMode:      SupportMode = 2,
): Promise<void> {
  const zip = new JSZip();
  let idx = 1;

  for (let row = 0; row < mapGrid.tall; row++) {
    for (let col = 0; col < mapGrid.wide; col++) {
      const tile  = extractTile(imageData, col, row);
      const name  = `mapart_${idx}`;
      const bytes = await buildLitematicBytes(tile, cp, groups, name, structure, supportBlockNbt, supportMode);
      zip.file(`${name}.litematic`, bytes);
      idx++;
    }
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: zipFilename });
  a.click();
  URL.revokeObjectURL(url);
}
