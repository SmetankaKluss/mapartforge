import type { Layer } from './layers';
import type { MapGrid } from './types';

interface SerializedLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  groupId: string | null;
  imageDataB64: string | null; // base64-encoded raw RGBA bytes
  width: number;
  height: number;
}

export interface ProjectFile {
  version: number;
  grid: MapGrid;
  activeLayerId: string;
  layers: SerializedLayer[];
}

function imageDataToBase64(data: ImageData): string {
  // Encode raw RGBA bytes as base64
  return btoa(String.fromCharCode(...new Uint8Array(data.data.buffer)));
}

function base64ToImageData(b64: string, width: number, height: number): ImageData {
  const binary = atob(b64);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new ImageData(bytes, width, height);
}

export function serializeProject(
  layers: Layer[],
  activeLayerId: string,
  grid: MapGrid,
): string {
  const serialized: SerializedLayer[] = layers.map(l => ({
    id: l.id,
    name: l.name,
    visible: l.visible,
    locked: l.locked,
    groupId: l.groupId,
    imageDataB64: l.imageData ? imageDataToBase64(l.imageData) : null,
    width: l.imageData?.width ?? 0,
    height: l.imageData?.height ?? 0,
  }));

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

    const layers: Layer[] = project.layers.map(sl => ({
      id: sl.id,
      name: sl.name,
      visible: sl.visible,
      locked: sl.locked,
      opacity: (sl as { opacity?: number }).opacity ?? 100,
      buildMode: (sl as { buildMode?: string }).buildMode as import('./layers').LayerBuildMode ?? '2d',
      groupId: sl.groupId,
      imageData: sl.imageDataB64 && sl.width > 0 && sl.height > 0
        ? base64ToImageData(sl.imageDataB64, sl.width, sl.height)
        : null,
    }));

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
  adjustments: { brightness: number; contrast: number; saturation: number };
  mapMode: '2d' | '3d';
  staircaseMode: 'classic' | 'optimized';
  bnScale: number;
}

interface FullProjectData {
  version: 2;
  project: ProjectFile;
  settings: FullProjectSettings;
}

export function serializeFullProject(
  layers: Layer[],
  activeLayerId: string,
  grid: MapGrid,
  settings: FullProjectSettings,
): string {
  const serialized: SerializedLayer[] = layers.map(l => ({
    id: l.id,
    name: l.name,
    visible: l.visible,
    locked: l.locked,
    groupId: l.groupId,
    imageDataB64: l.imageData ? imageDataToBase64(l.imageData) : null,
    width: l.imageData?.width ?? 0,
    height: l.imageData?.height ?? 0,
  }));

  const project: ProjectFile = {
    version: 1,
    grid,
    activeLayerId,
    layers: serialized,
  };

  const full: FullProjectData = { version: 2, project, settings };
  return JSON.stringify(full);
}

export function deserializeFullProject(json: string): {
  layers: Layer[];
  activeLayerId: string;
  grid: MapGrid;
  settings: FullProjectSettings;
} | null {
  try {
    const full = JSON.parse(json) as FullProjectData;
    if (full.version !== 2) return null;
    const { project, settings } = full;

    const layers: Layer[] = project.layers.map(sl => ({
      id: sl.id,
      name: sl.name,
      visible: sl.visible,
      locked: sl.locked,
      opacity: (sl as { opacity?: number }).opacity ?? 100,
      buildMode: (sl as { buildMode?: string }).buildMode as import('./layers').LayerBuildMode ?? '2d',
      groupId: sl.groupId,
      imageData: sl.imageDataB64 && sl.width > 0 && sl.height > 0
        ? base64ToImageData(sl.imageDataB64, sl.width, sl.height)
        : null,
      isDirty: true,
    }));

    return {
      layers,
      activeLayerId: project.activeLayerId,
      grid: project.grid,
      settings,
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
