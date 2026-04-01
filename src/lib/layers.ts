import type { DitheringMode } from './dithering';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  groupId: string | null;
  imageData: ImageData | null;
  // Optional: attached source image with dithering settings (processed layers)
  sourceDataUrl?: string;
  dithering?: DitheringMode;
  ditheringIntensity?: number;
  mapMode?: '2d' | '3d';
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

export function createLayer(name: string, imageData: ImageData | null = null): Layer {
  return {
    id: genId(),
    name,
    visible: true,
    locked: false,
    groupId: null,
    imageData,
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
    const src = layer.imageData.data;
    for (let i = 0; i < dst.length; i += 4) {
      const sa = src[i + 3];
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

/** Replace the imageData of the active layer (immutable update). */
export function updateLayerImageData(
  layers: Layer[],
  activeId: string,
  imageData: ImageData | null,
): Layer[] {
  return layers.map(l => l.id === activeId ? { ...l, imageData } : l);
}
