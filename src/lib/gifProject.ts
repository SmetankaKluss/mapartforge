import type { DitheringMode, KlussParams } from './dithering';
import type { ImageAdjustments } from './adjustments';
import type { BlockSelection } from './paletteBlocks';

export interface GifFrameConfig {
  dithering: DitheringMode;
  intensity: number;
  mapMode: '2d' | '3d';
  staircaseMode: 'classic' | 'optimized';
  adjustments: ImageAdjustments;
  bnScale: number;
  klussParams: KlussParams;
  blockSelection: BlockSelection;
}

export interface GifProject {
  /** Raw composited RGBA frames from GIF decoder */
  frames: ImageData[];
  /** Small base64 thumbnails for the filmstrip (max 80px wide) */
  thumbnails: string[];
  /** Index of the currently loaded frame */
  currentIndex: number;
  /** Per-frame editor settings — initialized from current global settings */
  configs: GifFrameConfig[];
}

/** Build a small thumbnail from an ImageData (max 80px wide, base64 PNG) */
export function makeThumbnail(frame: ImageData, maxW = 80): string {
  const scale = Math.min(1, maxW / frame.width);
  const w = Math.max(1, Math.round(frame.width  * scale));
  const h = Math.max(1, Math.round(frame.height * scale));
  const src = document.createElement('canvas');
  src.width  = frame.width;
  src.height = frame.height;
  src.getContext('2d')!.putImageData(frame, 0, 0);
  const dst = document.createElement('canvas');
  dst.width = w; dst.height = h;
  dst.getContext('2d')!.drawImage(src, 0, 0, w, h);
  return dst.toDataURL('image/png');
}

/** Convert an ImageData to an HTMLImageElement (async, waits for load) */
export function imageDataToHtmlImage(data: ImageData): Promise<HTMLImageElement> {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    canvas.width  = data.width;
    canvas.height = data.height;
    canvas.getContext('2d')!.putImageData(data, 0, 0);
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = canvas.toDataURL('image/png');
  });
}
