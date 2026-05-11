import type { ComputedPalette } from './dithering';
import type { LayerExportInfo } from './exportLitematic';
import { buildLookup, computeStaircaseClassic, computeStaircaseOptimized } from './exportLitematic';

export interface FinalPreviewResult {
  displayImage: ImageData;
  shadeWarnings: Uint8Array;
  heightData: Int16Array;
  northEdgeMask: Uint8Array;
  has3D: boolean;
}

function getPaletteColor(
  cp: ComputedPalette,
  baseId: number,
  shade: number,
): { r: number; g: number; b: number } | null {
  let fallback: { r: number; g: number; b: number } | null = null;
  let byBase: { r: number; g: number; b: number } | null = null;
  for (const color of cp.colors) {
    if (color.baseId !== baseId) continue;
    if (!byBase) byBase = { r: color.r, g: color.g, b: color.b };
    if (color.shade === 1) fallback = { r: color.r, g: color.g, b: color.b };
    if (color.shade === shade) return { r: color.r, g: color.g, b: color.b };
  }
  return fallback ?? byBase;
}

export function buildFinalPreview(
  layers: LayerExportInfo[],
  cp: ComputedPalette,
): FinalPreviewResult | null {
  if (layers.length === 0) return null;

  const width = layers[0].imageData.width;
  const height = layers[0].imageData.height;
  const n = width * height;
  const pixelLayerIdx = new Int32Array(n).fill(-1);
  const pixelIs3D = new Uint8Array(n);

  for (let li = layers.length - 1; li >= 0; li--) {
    const layer = layers[li];
    const is3D = layer.mapMode === '3d' ? 1 : 0;
    const src = layer.imageData.data;
    for (let pi = 0; pi < n; pi++) {
      if (pixelLayerIdx[pi] !== -1) continue;
      if (src[pi * 4 + 3] < 128) continue;
      pixelLayerIdx[pi] = li;
      pixelIs3D[pi] = is3D;
    }
  }

  const displayImage = new ImageData(width, height);
  const out = displayImage.data;
  const shadeWarnings = new Uint8Array(n);
  const northEdgeMask = new Uint8Array(n);
  const heightData = new Int16Array(n);
  const lookup = buildLookup(cp);

  const compositeData = new Uint8ClampedArray(n * 4);
  const encodedShade = new Int8Array(n).fill(1);
  const pixelBaseId = new Int32Array(n).fill(-1);
  for (let pi = 0; pi < n; pi++) {
    const li = pixelLayerIdx[pi];
    if (li < 0) continue;
    const src = layers[li].imageData.data;
    const di = pi * 4;
    compositeData[di] = src[di];
    compositeData[di + 1] = src[di + 1];
    compositeData[di + 2] = src[di + 2];
    compositeData[di + 3] = 255;
    const entry = lookup.get((src[di] << 16) | (src[di + 1] << 8) | src[di + 2]);
    pixelBaseId[pi] = entry?.baseId ?? -1;
    encodedShade[pi] = entry?.shade ?? 1;
  }

  const has3D = layers.some(layer => layer.mapMode === '3d');
  let yGrid: Int32Array | null = null;
  if (has3D) {
    const data3D = new Uint8ClampedArray(n * 4);
    for (let pi = 0; pi < n; pi++) {
      if (pixelLayerIdx[pi] < 0 || !pixelIs3D[pi]) continue;
      const di = pi * 4;
      data3D[di] = compositeData[di];
      data3D[di + 1] = compositeData[di + 1];
      data3D[di + 2] = compositeData[di + 2];
      data3D[di + 3] = 255;
    }
    const staircaseMode = layers.find(layer => layer.mapMode === '3d')?.staircaseMode ?? 'optimized';
    yGrid = staircaseMode === 'optimized'
      ? computeStaircaseOptimized(data3D, width, height, lookup).yGrid
      : computeStaircaseClassic(data3D, width, height, lookup).yGrid;
  }

  for (let x = 0; x < width; x++) {
    let prevVisible = false;
    let prevY = 0;
    for (let z = 0; z < height; z++) {
      const pi = z * width + x;
      const di = pi * 4;
      if (pixelLayerIdx[pi] < 0) {
        prevVisible = false;
        continue;
      }

      const artY = pixelIs3D[pi] && yGrid ? yGrid[pi] : 0;
      heightData[pi] = artY;

      let actualShade: 0 | 1 | 2;
      if (!has3D) {
        actualShade = 1;
      } else if (!prevVisible) {
        actualShade = encodedShade[pi] === 0 ? 0 : encodedShade[pi] === 2 ? 2 : 1;
        northEdgeMask[pi] = 1;
      } else if (artY < prevY) {
        actualShade = 0;
      } else if (artY > prevY) {
        actualShade = 2;
      } else {
        actualShade = 1;
      }

      prevVisible = true;
      prevY = artY;

      const baseId = pixelBaseId[pi];
      const mapped = baseId >= 0 ? getPaletteColor(cp, baseId, actualShade) : null;
      out[di] = mapped?.r ?? compositeData[di];
      out[di + 1] = mapped?.g ?? compositeData[di + 1];
      out[di + 2] = mapped?.b ?? compositeData[di + 2];
      out[di + 3] = 255;

      if (actualShade !== encodedShade[pi]) {
        shadeWarnings[pi] = 1;
      }
    }
  }

  return { displayImage, shadeWarnings, heightData, northEdgeMask, has3D };
}
