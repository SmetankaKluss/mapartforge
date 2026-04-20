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
  let prevTransparent = true; // treat north boundary as transparent gap
  for (let z = 0; z < height; z++) {
    const i = (z * width + x) * 4;
    if (data[i + 3] < 128) {
      // Transparent pixel: air at ground level.
      // Do NOT carry accumulated height — new solid segment after gap must start fresh.
      col[z] = 0;
      prevTransparent = true;
      continue;
    }
    // First solid pixel after a transparent gap: reset accumulator to ground.
    if (prevTransparent) {
      y = 0;
      prevTransparent = false;
    }
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const shade = lookup.get(key)?.shade ?? 1;
    y = shade === 0 ? y - 1 : shade === 2 ? y + 1 : y;
    col[z] = y;
  }
  return col;
}

/**
 * Return start/end (exclusive) of each solid (non-transparent) run in column x.
 */
function solidSegments(
  data: Uint8ClampedArray, width: number, height: number, x: number,
): { start: number; end: number }[] {
  const segs: { start: number; end: number }[] = [];
  let start = -1;
  for (let z = 0; z <= height; z++) {
    const transp = z === height || data[(z * width + x) * 4 + 3] < 128;
    if (!transp && start === -1) { start = z; }
    else if (transp && start !== -1) { segs.push({ start, end: z }); start = -1; }
  }
  return segs;
}

/**
 * Shift a segment of col[] so its minimum value = 0.
 * This grounds each disconnected island to floor level independently.
 */
function groundSegment(col: number[], start: number, end: number): void {
  let min = Infinity;
  for (let z = start; z < end; z++) if (col[z] < min) min = col[z];
  if (isFinite(min) && min !== 0) {
    for (let z = start; z < end; z++) col[z] -= min;
  }
}

/**
 * Classic 3D: each X-column is an independent "sausage".
 * Each solid segment is normalised independently so no island floats.
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
    for (const { start, end } of solidSegments(data, width, height, x)) {
      groundSegment(col, start, end);
    }
    for (let z = 0; z < height; z++) {
      const v = col[z];
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
    // Process each solid segment independently: valley-optimise then ground to y=0.
    // Running the valley algorithm on the full column (including transparent gaps)
    // caused islands after a gap to float — the algorithm had no way to know
    // where the ground was relative to the air sections.
    for (const { start, end } of solidSegments(data, width, height, x)) {
      const seg = col.slice(start, end);
      applyValleyAlgorithm(seg);
      for (let z = start; z < end; z++) col[z] = seg[z - start];
      groundSegment(col, start, end);
    }
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
  let exportSizeZ = structure === 'staircase' ? sizeZ + 1 : sizeZ;

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

  // ── 2b. Flat mode: always keep art at ground level (y=0) ─
  // Support blocks are not added in flat mode - user should place on solid surface
  // (Removed automatic support layer to prevent floating schematics)

  // Flat mode needs +1 Z row for noobline
  if (structure === 'flat') {
    exportSizeZ = sizeZ + 1;
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

    // ── Noobline: 1 block per column at z=0 (north shading reference) ──
    // Block type matches user's support block selection; Y is shade-dependent.
    // Place noobline for ALL columns that have at least one non-transparent pixel.
    {
      const supportNbt = (!supportBlockNbt || supportBlockNbt === 'air') ? 'cobblestone' : supportBlockNbt;
      const noobId = `minecraft:${supportNbt}`;
      let noobIdx = blockToIdx.get(noobId);
      if (noobIdx === undefined) {
        noobIdx = blockPalette.length;
        blockToIdx.set(noobId, noobIdx);
        blockPalette.push(noobId);
      }
      for (let x = 0; x < sizeX; x++) {
        // Find first non-transparent pixel in this column
        let firstZ = -1;
        for (let z = 0; z < sizeZ; z++) {
          const pi = z * sizeX + x;
          if (pixelBlock[pi] !== 0) {
            firstZ = z;
            break;
          }
        }
        if (firstZ < 0) continue; // entire column is transparent

        const pi = firstZ * sizeX + x;
        const artY = yGrid![pi];
        const firstShade = pixelShade[pi];
        // Position noobline to create the correct height difference for map shading:
        // shade 0 (dark): noobline above art by 1; shade 2 (bright): noobline below by 1
        const nooblineY = firstShade === 0 ? artY + 1 : firstShade === 2 ? artY - 1 : artY;
        if (nooblineY >= 0 && nooblineY < sizeY) {
          const vi = nooblineY * exportSizeZ * sizeX + 0 * sizeX + x;
          indices[vi] = noobIdx;
        }
      }
    }
  } else {
    // Flat mode: art always at y=0 (ground level), noobline at z=0
    const artY = 0;

    // Art blocks at z+1 (z=0 reserved for noobline)
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const pi = z * sizeX + x;
        const vi = artY * exportSizeZ * sizeX + (z + 1) * sizeX + x;
        indices[vi] = pixelBlock[pi];
      }
    }

    // Noobline (z=0) — reference block for north-face shading
    // Place noobline for ALL columns that have at least one non-transparent pixel.
    const supportNbt = (!supportBlockNbt || supportBlockNbt === 'air') ? 'cobblestone' : supportBlockNbt;
    const noobId = `minecraft:${supportNbt}`;
    let noobIdx = blockToIdx.get(noobId);
    if (noobIdx === undefined) {
      noobIdx = blockPalette.length;
      blockToIdx.set(noobId, noobIdx);
      blockPalette.push(noobId);
    }
    for (let x = 0; x < sizeX; x++) {
      // Find first non-transparent pixel in this column
      let hasArt = false;
      for (let z = 0; z < sizeZ; z++) {
        const pi = z * sizeX + x;
        if (pixelBlock[pi] !== 0) {
          hasArt = true;
          break;
        }
      }
      if (!hasArt) continue; // entire column is transparent

      const nooblineY = artY; // Flat mode: noobline at same Y as art
      const vi = nooblineY * exportSizeZ * sizeX + 0 * sizeX + x;
      if (vi < volume) indices[vi] = noobIdx;
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

    // Track Y levels per column for mode 2: dark blocks at previously-seen Y get 1 support
    const seenYPerCol: Set<number>[] = [];
    if (supportMode === 2) {
      for (let x = 0; x < sizeX; x++) {
        const seen = new Set<number>();
        for (let z = 0; z < sizeZ; z++) {
          const pi = z * sizeX + x;
          if (pixelBlock[pi] !== 0) seen.add(yGrid![pi]);
        }
        seenYPerCol[x] = seen;
      }
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
          // Mode 2: shade-dependent support.
          // Medium → 1 block, Bright → 2 blocks (always a new Y level).
          // Dark → 2 blocks if at a new Y level, 1 block if Y was previously seen.
          let numSup: number;
          if (pixelShade[pi] === 1) {
            numSup = 1; // medium: always 1
          } else if (pixelShade[pi] === 2) {
            numSup = 2; // bright: always stepping up → 2
          } else {
            // shade 0 (dark): 1 if Y was previously seen in this column, else 2
            numSup = seenYPerCol[x]?.has(yGrid![pi]) ? 1 : 2;
          }
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

// ── Hybrid multi-layer export ────────────────────────────────────────────────

export interface LayerExportInfo {
  imageData: ImageData;
  mapMode: '2d' | '3d';
  staircaseMode: 'classic' | 'optimized';
}

/**
 * Build a single litematic from multiple layers, each with its own mapMode/staircaseMode.
 * At each (X,Z) pixel the topmost visible non-transparent layer wins.
 * 3D-mode pixels are placed using the staircase algorithm; 2D-mode pixels are flat (Y=0).
 */
async function buildHybridBytes(
  layers:          LayerExportInfo[],
  cp:              ComputedPalette,
  groups:          BlockSelection,
  name:            string,
  supportBlockNbt?: string,
  supportMode:     SupportMode = 1,
): Promise<Uint8Array> {
  const { width: sizeX, height: sizeZ } = layers[0].imageData;
  const n = sizeX * sizeZ;

  // 1. Per-pixel: which layer wins (topmost non-transparent), and is it 3D?
  const pixelLayerIdx = new Int32Array(n).fill(-1);
  const pixelIs3D     = new Uint8Array(n);           // 1 = 3D, 0 = 2D

  for (let li = 0; li < layers.length; li++) {
    const { imageData, mapMode } = layers[li];
    const is3D = mapMode === '3d' ? 1 : 0;
    const src  = imageData.data;
    for (let pi = 0; pi < n; pi++) {
      if (pixelLayerIdx[pi] !== -1) continue;      // already covered
      if (src[pi * 4 + 3] < 128)   continue;      // transparent
      pixelLayerIdx[pi] = li;
      pixelIs3D[pi]     = is3D;
    }
  }

  // 2. Composite pixel colors (from winning layer)
  const compositeData = new Uint8ClampedArray(n * 4);
  for (let pi = 0; pi < n; pi++) {
    const li = pixelLayerIdx[pi];
    if (li < 0) continue;
    const src = layers[li].imageData.data;
    compositeData[pi * 4]     = src[pi * 4];
    compositeData[pi * 4 + 1] = src[pi * 4 + 1];
    compositeData[pi * 4 + 2] = src[pi * 4 + 2];
    compositeData[pi * 4 + 3] = 255;
  }

  // 3. Build 3D-only data for staircase computation (2D pixels → transparent)
  const data3D = new Uint8ClampedArray(n * 4);
  for (let pi = 0; pi < n; pi++) {
    if (pixelLayerIdx[pi] < 0 || !pixelIs3D[pi]) { data3D[pi * 4 + 3] = 0; continue; }
    data3D[pi * 4]     = compositeData[pi * 4];
    data3D[pi * 4 + 1] = compositeData[pi * 4 + 1];
    data3D[pi * 4 + 2] = compositeData[pi * 4 + 2];
    data3D[pi * 4 + 3] = 255;
  }

  const lookup = buildLookup(cp);

  // 4. Staircase computation for 3D pixels
  const has3D = layers.some(l => l.mapMode === '3d');
  let yGrid: Int32Array | null = null;
  let maxY3D = 0;
  if (has3D) {
    // Use the first 3D layer's staircaseMode
    const mode3D = layers.find(l => l.mapMode === '3d')?.staircaseMode ?? 'classic';
    const sc = mode3D === 'optimized'
      ? computeStaircaseOptimized(data3D, sizeX, sizeZ, lookup)
      : computeStaircaseClassic(data3D, sizeX, sizeZ, lookup);
    yGrid  = sc.yGrid;
    maxY3D = sc.maxY;
  }

  const exportSizeZ = sizeZ + 1;                        // z=0 reserved for noobline
  // sizeY = 1 for pure 2D (art at y=0, noobline also at y=0, no empty levels).
  // For 3D: +2 for maxY + headroom for noobline above/below art when shade=0/2.
  const sizeY       = has3D ? Math.max(1, maxY3D + 2) : 1;

  // 5. Block palette
  const blockPalette: string[] = ['minecraft:air'];
  const blockToIdx   = new Map<string, number>([['minecraft:air', 0]]);
  const pixelBlock   = new Uint32Array(n);
  const pixelBaseId  = new Int32Array(n).fill(-1);
  const pixelShade   = new Int32Array(n).fill(1);

  for (let pi = 0; pi < n; pi++) {
    if (pixelLayerIdx[pi] < 0) continue;
    const di    = pi * 4;
    const key   = (compositeData[di] << 16) | (compositeData[di + 1] << 8) | compositeData[di + 2];
    const entry = lookup.get(key);
    const nbt   = entry ? getPreferredBlockNbt(entry.baseId, groups) : 'stone';
    const id    = `minecraft:${nbt}`;
    let idx = blockToIdx.get(id);
    if (idx === undefined) { idx = blockPalette.length; blockToIdx.set(id, idx); blockPalette.push(id); }
    pixelBlock[pi]  = idx;
    pixelBaseId[pi] = entry?.baseId ?? 0;
    pixelShade[pi]  = entry?.shade  ?? 1;
  }

  // 6. Fill volume
  const volume  = sizeX * sizeY * exportSizeZ;
  const indices = new Uint32Array(volume);

  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const pi = z * sizeX + x;
      if (pixelBlock[pi] === 0 && pixelLayerIdx[pi] < 0) continue;
      const y  = (pixelIs3D[pi] && yGrid) ? yGrid[pi] : 0;
      const vi = y * exportSizeZ * sizeX + (z + 1) * sizeX + x;
      if (vi >= 0 && vi < volume) indices[vi] = pixelBlock[pi];
    }
  }

  // 7. Noobline (z=0) — reference block for north-face shading of first art row
  // Place noobline for ALL columns that have at least one non-transparent pixel.
  const supportNbt = (!supportBlockNbt || supportBlockNbt === 'air') ? 'cobblestone' : supportBlockNbt;
  const noobId = `minecraft:${supportNbt}`;
  let noobIdx = blockToIdx.get(noobId);
  if (noobIdx === undefined) {
    noobIdx = blockPalette.length;
    blockToIdx.set(noobId, noobIdx);
    blockPalette.push(noobId);
  }
  // Place noobline only for columns that have at least one non-transparent pixel
  for (let x = 0; x < sizeX; x++) {
    // Find first non-transparent pixel in this column
    let firstZ = -1;
    for (let z = 0; z < sizeZ; z++) {
      const pi = z * sizeX + x;
      if (pixelLayerIdx[pi] >= 0) {
        firstZ = z;
        break;
      }
    }
    if (firstZ < 0) continue; // entire column is transparent

    const pi = firstZ * sizeX + x;
    const artY     = (pixelIs3D[pi] && yGrid) ? yGrid[pi] : 0;
    const shade    = pixelShade[pi];
    const nooblineY = shade === 0 ? artY + 1 : shade === 2 ? artY - 1 : artY;
    if (nooblineY >= 0 && nooblineY < sizeY) {
      const vi = nooblineY * exportSizeZ * sizeX + 0 * sizeX + x;
      if (vi < volume) indices[vi] = noobIdx;
    }
  }

  // 8. Support blocks (for 3D layers only)
  if (has3D && supportNbt !== 'air') {
    const supId = `minecraft:${supportNbt}`;
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
        if (!pixelIs3D[pi]) continue; // 2D layers don't need support in hybrid
        const pixelY = yGrid![pi];
        const artZ   = z + 1; // art shifted by 1 due to noobline

        if (supportMode === 1) {
          // Mode 1: 1 block under gravity-affected blocks only
          if (!isMandatorySupport(pixelBaseId[pi], groups)) continue;
          const sy = pixelY - 1;
          if (sy < 0) continue;
          const vi = sy * exportSizeZ * sizeX + artZ * sizeX + x;
          if (vi < volume && indices[vi] === 0) indices[vi] = supIdx;
        } else if (supportMode === 2) {
          // Mode 2: shade-dependent support
          let numSup: number;
          if (pixelShade[pi] === 1) {
            numSup = 1;
          } else if (pixelShade[pi] === 2) {
            numSup = 2;
          } else {
            // shade 0 (dark): check if this Y level was seen before
            const seenYPerCol = new Set<number>();
            for (let zz = 0; zz < sizeZ; zz++) {
              const ppi = zz * sizeX + x;
              if (ppi !== pi && pixelBlock[ppi] !== 0 && pixelIs3D[ppi]) {
                seenYPerCol.add(yGrid![ppi]);
              }
            }
            numSup = seenYPerCol.has(yGrid![pi]) ? 1 : 2;
          }
          for (let k = 1; k <= numSup; k++) {
            const sy = pixelY - k;
            if (sy < 0) break;
            const vi = sy * exportSizeZ * sizeX + artZ * sizeX + x;
            if (vi < volume && indices[vi] === 0) indices[vi] = supIdx;
          }
        } else if (supportMode === 3) {
          // Mode 3: 2 blocks under every art block
          for (let k = 1; k <= 2; k++) {
            const sy = pixelY - k;
            if (sy < 0) break;
            const vi = sy * exportSizeZ * sizeX + artZ * sizeX + x;
            if (vi < volume && indices[vi] === 0) indices[vi] = supIdx;
          }
        }
      }
    }
  }

  // 9. Write NBT (same structure as buildLitematicBytes)
  const packedStates = packBlockStates(indices, blockPalette.length);
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
        w.tagInt('x', sizeX); w.tagInt('y', sizeY); w.tagInt('z', exportSizeZ);
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

/** Download a hybrid litematic: each layer uses its own mapMode/staircaseMode. */
export async function exportLitematicHybrid(
  layers:          LayerExportInfo[],
  cp:              ComputedPalette,
  groups:          BlockSelection,
  name:            string = 'MapartForge',
  supportBlockNbt?: string,
  supportMode:     SupportMode = 1,
): Promise<void> {
  if (layers.length === 0) return;
  const has3D = layers.some(l => l.mapMode === '3d');
  const suffix = has3D ? '_3d' : '_2d';
  const bytes = await buildHybridBytes(layers, cp, groups, name, supportBlockNbt, supportMode);
  triggerDownload(bytes, `${name}${suffix}.litematic`);
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
 * Count support blocks that would be placed in staircase mode.
 * Returns the number of unique support block positions.
 */
export function countSupportBlocks(
  imageData:     ImageData,
  cp:            ComputedPalette,
  groups:        BlockSelection,
  staircaseMode: 'classic' | 'optimized',
  supportMode:   SupportMode,
): number {
  const { data, width, height } = imageData;
  const lookup  = buildLookup(cp);
  const sizeX   = width;
  const sizeZ   = height;
  const sc      = staircaseMode === 'optimized'
    ? computeStaircaseOptimized(data, width, height, lookup)
    : computeStaircaseClassic(data, width, height, lookup);
  const yGrid   = sc.yGrid;
  const exportSizeZ = sizeZ + 1; // +1 for noobline

  const pixelBaseId = new Int32Array(sizeX * sizeZ);
  const pixelShade  = new Int32Array(sizeX * sizeZ);
  const pixelIsAir  = new Uint8Array(sizeX * sizeZ);

  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const i = (z * sizeX + x) * 4;
      const pi = z * sizeX + x;
      if (data[i + 3] < 128) { pixelIsAir[pi] = 1; pixelBaseId[pi] = -1; continue; }
      const key  = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      const entry = lookup.get(key);
      pixelBaseId[pi] = entry?.baseId ?? 0;
      pixelShade[pi]  = entry?.shade  ?? 1;
    }
  }

  const seenYPerCol: Set<number>[] = [];
  if (supportMode === 2) {
    for (let x = 0; x < sizeX; x++) {
      const seen = new Set<number>();
      for (let z = 0; z < sizeZ; z++) {
        const pi = z * sizeX + x;
        if (!pixelIsAir[pi]) seen.add(yGrid[pi]);
      }
      seenYPerCol[x] = seen;
    }
  }

  const supportPositions = new Set<number>();
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const pi   = z * sizeX + x;
      if (pixelIsAir[pi]) continue;
      const pixelY = yGrid[pi];
      const artZ   = z + 1;

      if (supportMode === 1) {
        if (!isMandatorySupport(pixelBaseId[pi], groups)) continue;
        const sy = pixelY - 1;
        if (sy >= 0) supportPositions.add(sy * exportSizeZ * sizeX + artZ * sizeX + x);
      } else if (supportMode === 2) {
        const numSup = pixelShade[pi] === 1 ? 1 : pixelShade[pi] === 2 ? 2
          : (seenYPerCol[x]?.has(yGrid[pi]) ? 1 : 2);
        for (let k = 1; k <= numSup; k++) {
          const sy = pixelY - k;
          if (sy < 0) break;
          supportPositions.add(sy * exportSizeZ * sizeX + artZ * sizeX + x);
        }
      } else {
        for (let k = 1; k <= 2; k++) {
          const sy = pixelY - k;
          if (sy < 0) break;
          supportPositions.add(sy * exportSizeZ * sizeX + artZ * sizeX + x);
        }
      }
    }
  }
  return supportPositions.size;
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
