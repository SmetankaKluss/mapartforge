import type { Layer, LayerBuildMode, LayerGroup } from './layers';
import type { MapGrid } from './types';
import { base64ToBytes, bytesToBase64 } from './base64';
import type { TextLayerMeta } from '../components/previewCanvasShared';
import { coerceBuildTechnique, type BuildTechnique } from './buildTechnique';

interface SerializedLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  groupId: string | null;
  imageDataB64: string | null; // base64-encoded raw RGBA bytes
  width: number;
  height: number;
  isText?: boolean;
  text?: TextLayerMeta;
  opacity?: number;
  buildMode?: LayerBuildMode;
  sourceDataUrl?: string;
  dithering?: import('./dithering').DitheringMode;
  ditheringIntensity?: number;
  mapMode?: '2d' | '3d';
  staircaseMode?: 'classic' | 'optimized';
  isDirty?: boolean;
}

export interface ProjectFile {
  version: number;
  grid: MapGrid;
  activeLayerId: string;
  layers: SerializedLayer[];
}

export function imageDataToBase64(data: ImageData): string {
  return bytesToBase64(new Uint8Array(data.data.buffer));
}

export function base64ToImageData(b64: string, width: number, height: number): ImageData {
  const bytes = new Uint8ClampedArray(base64ToBytes(b64));
  return new ImageData(bytes, width, height);
}

function serializeLayer(layer: Layer): SerializedLayer {
  return {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    groupId: layer.groupId,
    imageDataB64: layer.imageData ? imageDataToBase64(layer.imageData) : null,
    width: layer.imageData?.width ?? 0,
    height: layer.imageData?.height ?? 0,
    isText: layer.isText,
    text: layer.text,
    opacity: layer.opacity,
    buildMode: layer.buildMode,
    sourceDataUrl: layer.sourceDataUrl,
    dithering: layer.dithering,
    ditheringIntensity: layer.ditheringIntensity,
    mapMode: layer.mapMode,
    staircaseMode: layer.staircaseMode,
    isDirty: layer.isDirty,
  };
}

function deserializeLayer(layer: SerializedLayer): Layer {
  return {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity ?? 100,
    buildMode: layer.buildMode ?? '2d',
    groupId: layer.groupId,
    imageData: layer.imageDataB64 && layer.width > 0 && layer.height > 0
      ? base64ToImageData(layer.imageDataB64, layer.width, layer.height)
      : null,
    isText: layer.isText,
    text: layer.text,
    sourceDataUrl: layer.sourceDataUrl,
    dithering: layer.dithering,
    ditheringIntensity: layer.ditheringIntensity,
    mapMode: layer.mapMode,
    staircaseMode: layer.staircaseMode,
    isDirty: layer.isDirty,
  };
}

export function serializeProject(
  layers: Layer[],
  activeLayerId: string,
  grid: MapGrid,
): string {
  const serialized = layers.map(serializeLayer);

  const project: ProjectFile = {
    version: 1,
    grid,
    activeLayerId,
    layers: serialized,
  };

  return JSON.stringify(project);
}

export function deserializeProject(json: string): {
  layers: Layer[];
  activeLayerId: string;
  grid: MapGrid;
} | null {
  try {
    const project = JSON.parse(json) as ProjectFile;
    if (project.version !== 1) return null;

    const layers = project.layers.map(deserializeLayer);

    return {
      layers,
      activeLayerId: project.activeLayerId,
      grid: project.grid,
    };
  } catch {
    return null;
  }
}

export interface FullProjectSettings {
  dithering: string;
  intensity: number;
  blockSelection: Record<string, number[]>;
  adjustments: { brightness: number; contrast: number; saturation: number; red: number; green: number; blue: number };
  colorMatch?: import('./colorMatch').ColorMatchMode;
  mapMode: '2d' | '3d';
  staircaseMode: 'classic' | 'optimized';
  bnScale: number;
  klussParams?: import('./dithering').KlussParams;
  originalDataB64?: string; // base64-encoded pre-dithering image data for reprocessing
  minecraftVersion?: import('./versionPresets').MinecraftVersion;
  platformMode?: import('./platformMode').PlatformMode;
  buildTechnique?: BuildTechnique;
  supportBlock?: string;
  supportMode?: 1 | 2 | 3;
}

interface FullProjectDataV2 {
  version: 2;
  project: ProjectFile;
  settings: FullProjectSettings;
}

interface FullProjectDataV3 {
  version: 3;
  project: ProjectFile;
  groups: LayerGroup[];
  settings: FullProjectSettings;
}

interface FullProjectDataV4 {
  version: 4;
  project: ProjectFile;
  groups: LayerGroup[];
  settings: FullProjectSettings;
}

type FullProjectData = FullProjectDataV2 | FullProjectDataV3 | FullProjectDataV4;

export function serializeFullProject(
  layers: Layer[],
  activeLayerId: string,
  grid: MapGrid,
  settings: FullProjectSettings,
  groups: LayerGroup[] = [],
): string {
  const serialized = layers.map(serializeLayer);

  const project: ProjectFile = {
    version: 1,
    grid,
    activeLayerId,
    layers: serialized,
  };

  const full: FullProjectDataV4 = {
    version: 4,
    project,
    groups,
    settings: { ...settings, buildTechnique: coerceBuildTechnique(settings.buildTechnique) },
  };
  return JSON.stringify(full);
}

export function deserializeFullProject(json: string): {
  layers: Layer[];
  activeLayerId: string;
  grid: MapGrid;
  groups: LayerGroup[];
  settings: FullProjectSettings;
} | null {
  try {
    const full = JSON.parse(json) as FullProjectData;
    if (full.version !== 2 && full.version !== 3 && full.version !== 4) return null;
    const { project, settings } = full;
    const layers = project.layers.map(deserializeLayer);

    return {
      layers,
      activeLayerId: project.activeLayerId,
      grid: project.grid,
      groups: full.version === 2 ? [] : full.groups,
      settings: {
        ...settings,
        adjustments: {
          ...settings.adjustments,
          red: settings.adjustments.red ?? 0,
          green: settings.adjustments.green ?? 0,
          blue: settings.adjustments.blue ?? 0,
        },
        buildTechnique: coerceBuildTechnique(settings.buildTechnique),
      },
    };
  } catch {
    return null;
  }
}

export function downloadProject(json: string, filename = 'project.mapkluss'): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
