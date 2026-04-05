import type { DitheringMode } from './dithering';

export type LayerBuildMode = '2d' | '3d-classic' | '3d-optimized';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;       // 0–100, default 100
  isText?: boolean;      // true for text layers
  groupId: string | null;
  imageData: ImageData | null;
  // Optional: attached source image with dithering settings (processed layers)
  sourceDataUrl?: string;
  dithering?: DitheringMode;
  ditheringIntensity?: number;
  mapMode?: '2d' | '3d';
  staircaseMode?: 'classic' | 'optimized';
  buildMode: LayerBuildMode;
  isDirty?: boolean;  // true if manually edited (prevents re-processing from source)
}

export interface LayerGroup {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
}

let _idCounter = 0;
function genId(): string {
  return `layer-${Date.now()}-${_idCounter++}`;
}

export function createLayer(name: string, imageData: ImageData | null = null, isText?: boolean): Layer {
  return {
    id: genId(),
    name,
    visible: true,
    locked: false,
    opacity: 100,
    isText,
    groupId: null,
    imageData,
    buildMode: '2d',
    mapMode: '2d',
    staircaseMode: 'classic',
  };
}

/** Composite all visible layers (bottom to top) into a single ImageData. */
export function compositeLayersToImageData(
  layers: Layer[],
  width: number,
  height: number,
): ImageData {
  const result = new ImageData(width, height);
  const dst = result.data;

  for (const layer of layers) {
    if (!layer.visible || !layer.imageData) continue;
    const opacityFactor = (layer.opacity ?? 100) / 100;
    const src = layer.imageData.data;
    for (let i = 0; i < dst.length; i += 4) {
      const rawA = src[i + 3];
      if (rawA === 0) continue;
      const sa = Math.round(rawA * opacityFactor);
      if (sa === 0) continue;
      if (sa === 255) {
        dst[i]     = src[i];
        dst[i + 1] = src[i + 1];
        dst[i + 2] = src[i + 2];
        dst[i + 3] = 255;
      } else {
        // Alpha compositing: src over dst
        const da = dst[i + 3];
        const outA = sa + da * (255 - sa) / 255;
        if (outA === 0) continue;
        dst[i]     = (src[i]     * sa + dst[i]     * da * (255 - sa) / 255) / outA;
        dst[i + 1] = (src[i + 1] * sa + dst[i + 1] * da * (255 - sa) / 255) / outA;
        dst[i + 2] = (src[i + 2] * sa + dst[i + 2] * da * (255 - sa) / 255) / outA;
        dst[i + 3] = outA;
      }
    }
  }

  return result;
}

/** Returns a deep copy of layers array (clones imageData buffers). */
export function cloneLayers(layers: Layer[]): Layer[] {
  return layers.map(l => ({
    ...l,
    imageData: l.imageData
      ? new ImageData(new Uint8ClampedArray(l.imageData.data), l.imageData.width, l.imageData.height)
      : null,
  }));
}

/** Merge active layer down onto the layer below it. Returns updated layers array. */
export function mergeLayersDown(
  layers: Layer[], activeId: string, width: number, height: number,
): Layer[] {
  const idx = layers.findIndex(l => l.id === activeId);
  if (idx <= 0) return layers;
  const bottom = layers[idx - 1];
  const top    = layers[idx];
  const merged = compositeLayersToImageData([bottom, top], width, height);
  const newLayer: Layer = { ...bottom, imageData: merged };
  const next = [...layers];
  next.splice(idx - 1, 2, newLayer);
  return next;
}

/** Merge all visible layers into one. The merged layer takes the position of the bottommost visible layer. */
export function mergeVisible(
  layers: Layer[], width: number, height: number,
): Layer[] {
  const visibleWithData = layers.filter(l => l.visible && l.imageData);
  if (visibleWithData.length <= 1) return layers;
  const merged = compositeLayersToImageData(visibleWithData, width, height);
  const firstVisIdx = layers.findIndex(l => l.visible && l.imageData);
  const mergedLayer: Layer = { ...visibleWithData[0], imageData: merged, name: 'Слитые слои' };
  return layers.reduce<Layer[]>((acc, l, i) => {
    if (!l.visible || !l.imageData) { acc.push(l); return acc; }
    if (i === firstVisIdx) { acc.push(mergedLayer); return acc; }
    return acc; // remove other visible layers
  }, []);
}

/** Replace the imageData of the active layer (immutable update). */
export function updateLayerImageData(
  layers: Layer[],
  activeId: string,
  imageData: ImageData | null,
): Layer[] {
  return layers.map(l => l.id === activeId ? { ...l, imageData } : l);
}
