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

/** Blocks that need axis=x to lie on their side (show bark/side texture on top). */
const LOG_AXIS_X = new Set([
  'minecraft:oak_log', 'minecraft:birch_log', 'minecraft:spruce_log',
  'minecraft:jungle_log', 'minecraft:acacia_log', 'minecraft:dark_oak_log',
  'minecraft:mangrove_log', 'minecraft:cherry_log', 'minecraft:cherry_wood',
  'minecraft:stripped_cherry_log', 'minecraft:stripped_cherry_wood',
  'minecraft:crimson_stem', 'minecraft:warped_stem',
  'minecraft:stripped_crimson_stem', 'minecraft:stripped_warped_stem',
  'minecraft:bamboo_block',
]);

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
 * Compute raw heights for a single X-column based on shade deltas.
 * shade 0 (dark)  → y-1, shade 1 (normal) → y, shade 2 (bright) → y+1
 */
function columnRawHeights(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  lookup: Map<number, ColorEntry>,
  x: number,
): number[] {
  const col = new Array<number>(height);
  let y = 0;
  for (let z = 0; z < height; z++) {
    const i = (z * width + x) * 4;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const shade = lookup.get(key)?.shade ?? 2;
    y = shade === 0 ? y - 1 : shade === 2 ? y + 1 : y;
    col[z] = y;
  }
  return col;
}

/**
 * Classic 3D: each X-column is an independent "sausage".
 * Per-column normalisation — shift so column min = 0.
 * Each column touches y=0 at its own lowest point, independent of neighbours.
 */
function computeStaircaseClassic(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  lookup: Map<number, ColorEntry>,
): { yGrid: Int32Array; minY: number; maxY: number } {
  const yGrid = new Int32Array(width * height);
  let maxY = 0;
  for (let x = 0; x < width; x++) {
    const col = columnRawHeights(data, width, height, lookup, x);
    const colMin = Math.min(...col);
    for (let z = 0; z < height; z++) {
      const v = col[z] - colMin;
      yGrid[z * width + x] = v;
      if (v > maxY) maxY = v;
    }
  }
  return { yGrid, minY: 0, maxY };
}

/**
 * Valley/Optimized 3D: pulls descending valleys down to y=0 creating break-points.
 * Ported from mapartcraft's valley algorithm (rebane2001/mapartcraft).
 * Each ascending segment ("plateau") is pulled down as far as its adjacent valleys allow.
 */
function applyValleyAlgorithm(col: number[]): void {
  const n = col.length;
  const plateaus: { startIndex: number; endIndex: number }[] = [{ startIndex: 0, endIndex: 0 }];
  let ascending = false;
  let plateauStart = 0;
  let prevH = col[0];

  for (let i = 0; i < n; i++) {
    const h = col[i];
    if (ascending && h < prevH) {
      ascending = false;
      plateaus.push({ startIndex: plateauStart, endIndex: i });
    } else if (h > prevH) {
      ascending = true;
      plateauStart = i;
    }
    prevH = h;
  }
  plateaus.push({ startIndex: n, endIndex: n });

  const sidePull: [number, number] = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
  while (plateaus.length > 1) {
    // Find minimum of valley region between plateaus[0] and plateaus[1]
    let valleyMin = Number.MAX_SAFE_INTEGER;
    for (let i = plateaus[0].endIndex; i < plateaus[1].startIndex; i++) {
      if (col[i] < valleyMin) valleyMin = col[i];
    }
    if (valleyMin === Number.MAX_SAFE_INTEGER) valleyMin = 0;

    // Pull valley down so its minimum = 0
    for (let i = plateaus[0].endIndex; i < plateaus[1].startIndex; i++) {
      col[i] -= valleyMin;
    }

    sidePull[1] = valleyMin;
    const platPull = Math.min(sidePull[0], sidePull[1]);
    if (platPull < Number.MAX_SAFE_INTEGER) {
      for (let i = plateaus[0].startIndex; i < plateaus[0].endIndex; i++) {
        col[i] -= platPull;
      }
    }

    plateaus.shift();
    sidePull[0] = sidePull[1];
  }
}

function computeStaircaseOptimized(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  lookup: Map<number, ColorEntry>,
): { yGrid: Int32Array; minY: number; maxY: number } {
  const yGrid = new Int32Array(width * height);
  let maxY = 0;
  for (let x = 0; x < width; x++) {
    const col = columnRawHeights(data, width, height, lookup, x);
    applyValleyAlgorithm(col);
    for (let z = 0; z < height; z++) {
      const v = col[z];
      yGrid[z * width + x] = v;
      if (v > maxY) maxY = v;
    }
  }
  return { yGrid, minY: 0, maxY };
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
  staircaseMode:    'classic' | 'optimized' = 'classic',
  supportMode:      SupportMode = 1,
): Promise<Uint8Array> {
  const { data, width, height } = imageData;
  const lookup = buildLookup(cp);

  const sizeX = width;
  const sizeZ = height;

  // ── 1. Determine Y dimensions ─────────────────────────────────────────
  let sizeY: number;
  let yGrid: Int32Array | null = null;
  // Staircase: add 1 extra Z row at z=0 for the noobline (north shading reference)
  const exportSizeZ = structure === 'staircase' ? sizeZ + 1 : sizeZ;

  if (structure === 'staircase') {
    const sc = staircaseMode === 'optimized'
      ? computeStaircaseOptimized(data, width, height, lookup)
      : computeStaircaseClassic(data, width, height, lookup);
    yGrid = sc.yGrid;
    sizeY = Math.max(1, sc.maxY + 2); // +1 for max, +1 headroom for noobline if needed
  } else {
    sizeY = 1; // may be updated to 2 after pixelBaseId is populated (step 2b)
  }

  // ── 2. Block palette ──────────────────────────────────────────────────
  const blockPalette: string[] = ['minecraft:air'];
  const blockToIdx   = new Map<string, number>([['minecraft:air', 0]]);
  const pixelBlock   = new Array<number>(width * height);
  const pixelBaseId  = new Int32Array(width * height);
  const pixelShade   = new Int32Array(width * height);

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
      pixelShade[z * sizeX + x]  = entry?.shade ?? 1;
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
    // Art blocks placed at z+1 (z=0 is reserved for noobline)
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const pi = z * sizeX + x;
        const y  = yGrid![pi];
        const vi = y * exportSizeZ * sizeX + (z + 1) * sizeX + x;
        indices[vi] = pixelBlock[pi];
      }
    }

    // ── Noobline: 1 cobblestone per column at z=0 (north shading reference) ──
    {
      const noobId = 'minecraft:cobblestone';
      let noobIdx = blockToIdx.get(noobId);
      if (noobIdx === undefined) {
        noobIdx = blockPalette.length;
        blockToIdx.set(noobId, noobIdx);
        blockPalette.push(noobId);
      }
      for (let x = 0; x < sizeX; x++) {
        // Noobline block is placed at the same Y as the first art block,
        // directly to its north (z=0), strictly adjacent — not above or below.
        const nooblineY = yGrid![0 * sizeX + x];
        const vi = nooblineY * exportSizeZ * sizeX + 0 * sizeX + x;
        indices[vi] = noobIdx;
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

    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const pi = z * sizeX + x;
        if (pixelBlock[pi] === 0) continue; // transparent pixel
        const pixelY = yGrid![pi];
        const artZ   = z + 1; // art shifted by 1 due to noobline

        if (supportMode === 1) {
          // Mode 1: 1 block under gravity-affected blocks only
          if (!isMandatorySupport(pixelBaseId[pi], groups)) continue;
          const sy = pixelY - 1;
          if (sy < 0) continue;
          const vi = sy * exportSizeZ * sizeX + artZ * sizeX + x;
          if (indices[vi] === 0) indices[vi] = supIdx;
        } else if (supportMode === 2) {
          // Mode 2: shade-dependent support — stepping shades get 2 blocks, flat gets 1
          const numSup = pixelShade[pi] === 1 ? 1 : 2;
          for (let k = 1; k <= numSup; k++) {
            const sy = pixelY - k;
            if (sy < 0) break;
            const vi = sy * exportSizeZ * sizeX + artZ * sizeX + x;
            if (indices[vi] === 0) indices[vi] = supIdx;
          }
        } else if (supportMode === 3) {
          // Mode 3: 2 blocks under every art block
          for (let k = 1; k <= 2; k++) {
            const sy = pixelY - k;
            if (sy < 0) break;
            const vi = sy * exportSizeZ * sizeX + artZ * sizeX + x;
            if (indices[vi] === 0) indices[vi] = supIdx;
          }
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
          const faceProps = BLOCK_FACE_PROPS[id];
          const needsAxis = LOG_AXIS_X.has(id);
          if (faceProps || needsAxis) {
            w.tagCompoundStart('Properties');
            if (faceProps) for (const [k, v] of Object.entries(faceProps)) w.tagString(k, v);
            if (needsAxis) w.tagString('axis', 'x');
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
  supportMode:      SupportMode = 1,
  staircaseMode:    'classic' | 'optimized' = 'classic',
): Promise<void> {
  const suffix = structure === 'staircase' ? '_3d' : '_2d';
  const bytes  = await buildLitematicBytes(imageData, cp, groups, name, structure, supportBlockNbt, staircaseMode, supportMode);
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
  supportMode:      SupportMode = 1,
  staircaseMode:    'classic' | 'optimized' = 'classic',
): Promise<void> {
  const zip = new JSZip();
  let idx = 1;

  for (let row = 0; row < mapGrid.tall; row++) {
    for (let col = 0; col < mapGrid.wide; col++) {
      const tile  = extractTile(imageData, col, row);
      const name  = `mapart_${idx}`;
      const bytes = await buildLitematicBytes(tile, cp, groups, name, structure, supportBlockNbt, staircaseMode, supportMode);
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
