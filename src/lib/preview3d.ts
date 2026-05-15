import type { ComputedPalette } from './dithering';
import type { BlockSelection } from './paletteBlocks';
import { getPreferredBlockNbt, isMandatorySupport } from './paletteBlocks';
import { buildLookup, computeStaircaseClassic, computeStaircaseOptimized } from './exportLitematic';
import type { SupportMode } from './exportLitematic';
import type { MapGrid } from './types';

export type PreviewMode = 'wall' | 'scene' | 'schematic3d';

export interface SchematicPreviewBlock {
  x: number;
  y: number;
  z: number;
  color: number;
  kind: 'art' | 'support' | 'noobline';
  baseId: number;
  shade: number;
  nbtName?: string;
}

export interface SchematicPreviewModel {
  width: number;
  height: number;
  depth: number;
  exportDepth: number;
  mapMode: '2d' | '3d';
  staircaseMode: 'classic' | 'optimized';
  minHeight: number;
  maxHeight: number;
  heightRange: number;
  nonTransparentCount: number;
  supportCount: number;
  has3D: boolean;
  blocks: SchematicPreviewBlock[];
}

export interface SceneCameraPreset {
  id: string;
  titleRu: string;
  titleEn: string;
  position: [number, number, number];
  target: [number, number, number];
}

export interface ScenePreset {
  id: string;
  titleRu: string;
  titleEn: string;
  environment: 'gallery' | 'nether' | 'house';
  wallAnchor: {
    position: [number, number, number];
    rotationY: number;
  };
  supportedMapRatios: 'any';
  cameraPresets: SceneCameraPreset[];
}

interface BuildModelOptions {
  imageData: ImageData;
  cp: ComputedPalette;
  blockSelection: BlockSelection;
  mapMode: '2d' | '3d';
  staircaseMode: 'classic' | 'optimized';
  supportMode: SupportMode;
  supportBlockNbt: string;
  supportColor?: number;
}

const DEFAULT_SUPPORT_COLOR = 0x7c7568;
const NOOBLINE_COLOR = 0x9c8b62;

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'gallery-wall',
    titleRu: 'Галерея',
    titleEn: 'Gallery Wall',
    environment: 'gallery',
    wallAnchor: { position: [0, 3.1, -4.45], rotationY: 0 },
    supportedMapRatios: 'any',
    cameraPresets: [
      { id: 'front', titleRu: 'Фронт', titleEn: 'Front', position: [0, 3.1, 6.4], target: [0, 2.9, -4.4] },
      { id: 'corner', titleRu: 'Угол', titleEn: 'Corner', position: [6.8, 4.2, 5.4], target: [0, 2.8, -3.9] },
      { id: 'wide', titleRu: 'Общий', titleEn: 'Wide', position: [-7.2, 4.8, 8.4], target: [0, 2.7, -3.8] },
    ],
  },
  {
    id: 'nether-corridor',
    titleRu: 'Коридор ада',
    titleEn: 'Nether Corridor',
    environment: 'nether',
    wallAnchor: { position: [0, 3.2, -9.35], rotationY: 0 },
    supportedMapRatios: 'any',
    cameraPresets: [
      { id: 'front', titleRu: 'Фронт', titleEn: 'Front', position: [0, 3.8, 1.2], target: [0, 3.0, -8.9] },
      { id: 'ride', titleRu: 'Трасса', titleEn: 'Ride', position: [2.8, 2.8, 5.2], target: [0, 2.9, -4.6] },
      { id: 'wide', titleRu: 'Общий', titleEn: 'Wide', position: [-5.4, 5.8, 3.8], target: [0, 3.1, -7.6] },
    ],
  },
  {
    id: 'house-interior',
    titleRu: 'Дом',
    titleEn: 'House Interior',
    environment: 'house',
    wallAnchor: { position: [4.45, 3.0, 0], rotationY: -Math.PI / 2 },
    supportedMapRatios: 'any',
    cameraPresets: [
      { id: 'corner', titleRu: 'Угол', titleEn: 'Corner', position: [-4.8, 3.8, 7.4], target: [3.7, 2.8, 0] },
      { id: 'front', titleRu: 'Стена', titleEn: 'Wall', position: [0.5, 3.2, 7.2], target: [4.2, 2.8, 0] },
      { id: 'wide', titleRu: 'Комната', titleEn: 'Room', position: [-6.6, 5.6, -6.4], target: [2.8, 2.6, 0] },
    ],
  },
];

export function buildSchematicPreviewModel({
  imageData,
  cp,
  blockSelection,
  mapMode,
  staircaseMode,
  supportMode,
  supportBlockNbt,
  supportColor = DEFAULT_SUPPORT_COLOR,
}: BuildModelOptions): SchematicPreviewModel {
  const { data, width, height } = imageData;
  const n = width * height;
  const lookup = buildLookup(cp);
  const has3D = mapMode === '3d';
  const yGrid = has3D
    ? (staircaseMode === 'optimized'
      ? computeStaircaseOptimized(data, width, height, lookup).yGrid
      : computeStaircaseClassic(data, width, height, lookup).yGrid)
    : new Int32Array(n);

  const baseIds = new Int32Array(n).fill(-1);
  const shades = new Int8Array(n).fill(1);
  const alphaMask = new Uint8Array(n);
  const blocks: SchematicPreviewBlock[] = [];
  let minHeight = 0;
  let maxHeight = 0;
  let nonTransparentCount = 0;

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const pi = z * width + x;
      const di = pi * 4;
      if (data[di + 3] < 128) continue;
      alphaMask[pi] = 1;
      nonTransparentCount++;
      const key = (data[di] << 16) | (data[di + 1] << 8) | data[di + 2];
      const entry = lookup.get(key);
      baseIds[pi] = entry?.baseId ?? -1;
      shades[pi] = entry?.shade ?? 1;
      const y = yGrid[pi];
      if (y < minHeight) minHeight = y;
      if (y > maxHeight) maxHeight = y;
      const artZ = has3D ? z + 1 : z;
      blocks.push({
        x,
        y,
        z: artZ,
        color: (data[di] << 16) | (data[di + 1] << 8) | data[di + 2],
        kind: 'art',
        baseId: baseIds[pi],
        shade: shades[pi],
        nbtName: baseIds[pi] >= 0 ? getPreferredBlockNbt(baseIds[pi], blockSelection) : undefined,
      });
    }
  }

  let supportCount = 0;
  const exportDepth = has3D ? height + 1 : height;

  if (has3D) {
    for (let x = 0; x < width; x++) {
      let firstZ = -1;
      for (let z = 0; z < height; z++) {
        const pi = z * width + x;
        if (!alphaMask[pi]) continue;
        firstZ = z;
        break;
      }
      if (firstZ < 0) continue;
      const pi = firstZ * width + x;
      const artY = yGrid[pi];
      const shade = shades[pi];
      const nooblineY = shade === 0 ? artY + 1 : shade === 2 ? artY - 1 : artY;
      if (nooblineY < minHeight) minHeight = nooblineY;
      if (nooblineY > maxHeight) maxHeight = nooblineY;
      blocks.push({
        x,
        y: nooblineY,
        z: firstZ,
        color: NOOBLINE_COLOR,
        kind: 'noobline',
        baseId: -1,
        shade: 1,
        nbtName: supportBlockNbt === 'air' ? 'cobblestone' : supportBlockNbt,
      });
    }
  }

  if (has3D && supportBlockNbt !== 'air') {
    const seenYPerCol: Set<number>[] = [];
    if (supportMode === 2) {
      for (let x = 0; x < width; x++) {
        const seen = new Set<number>();
        for (let z = 0; z < height; z++) {
          const pi = z * width + x;
          if (alphaMask[pi]) seen.add(yGrid[pi]);
        }
        seenYPerCol[x] = seen;
      }
    }

    const positions = new Set<string>();
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const pi = z * width + x;
        if (!alphaMask[pi]) continue;
        const pixelY = yGrid[pi];
        const artZ = z + 1;
        if (supportMode === 1) {
          if (!isMandatorySupport(baseIds[pi], blockSelection)) continue;
          const sy = pixelY - 1;
          if (sy < 0) continue;
          positions.add(`${x}:${sy}:${artZ}`);
        } else if (supportMode === 2) {
          const numSup = shades[pi] === 1 ? 1 : shades[pi] === 2 ? 2 : (seenYPerCol[x]?.has(pixelY) ? 1 : 2);
          for (let k = 1; k <= numSup; k++) {
            const sy = pixelY - k;
            if (sy < 0) break;
            positions.add(`${x}:${sy}:${artZ}`);
          }
        } else {
          for (let k = 1; k <= 2; k++) {
            const sy = pixelY - k;
            if (sy < 0) break;
            positions.add(`${x}:${sy}:${artZ}`);
          }
        }
      }
    }

    supportCount = positions.size;
    for (const key of positions) {
      const [x, y, z] = key.split(':').map(Number);
      if (y < minHeight) minHeight = y;
      if (y > maxHeight) maxHeight = y;
      blocks.push({
        x,
        y,
        z,
        color: supportColor,
        kind: 'support',
        baseId: -1,
        shade: 1,
        nbtName: supportBlockNbt,
      });
    }
  }

  return {
    width,
    height,
    depth: height,
    exportDepth,
    mapMode,
    staircaseMode,
    minHeight,
    maxHeight,
    heightRange: maxHeight - minHeight,
    nonTransparentCount,
    supportCount,
    has3D,
    blocks,
  };
}

export function getSceneArtSize(mapGrid: MapGrid): { width: number; height: number } {
  return {
    width: Math.max(1.8, mapGrid.wide * 1.82),
    height: Math.max(1.8, mapGrid.tall * 1.82),
  };
}
