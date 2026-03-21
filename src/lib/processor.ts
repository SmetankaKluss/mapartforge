import { applyDithering, DEFAULT_PALETTE } from './dithering';
import type { DitheringMode, ComputedPalette } from './dithering';
import { applyAdjustments, DEFAULT_ADJUSTMENTS } from './adjustments';
import type { ImageAdjustments } from './adjustments';

export interface ProcessOptions {
  dithering:   DitheringMode;
  width:       number;
  height:      number;
  intensity:   number;
  bnScale?:    number;
  palette?:    ComputedPalette;
  adjustments?: ImageAdjustments;
  onProgress?: (pct: number) => void;
}

export interface ProcessResult {
  processed: ImageData;
  original:  ImageData;
}

async function scaleSource(
  source: HTMLImageElement | ImageBitmap,
  width: number,
  height: number,
): Promise<Uint8ClampedArray> {
  const offscreen = new OffscreenCanvas(width, height);
  const ctx = offscreen.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

export async function processImage(
  source: HTMLImageElement | ImageBitmap,
  options: ProcessOptions,
): Promise<ProcessResult> {
  const {
    width, height, dithering, intensity,
    bnScale     = 2,
    palette     = DEFAULT_PALETTE,
    adjustments = DEFAULT_ADJUSTMENTS,
    onProgress,
  } = options;

  onProgress?.(5);

  const raw      = await scaleSource(source, width, height);
  const expected = width * height * 4;
  console.log('[proc] scaled', width, 'x', height, 'data.length=', raw.length, 'expected=', expected, raw.length === expected ? 'OK' : 'MISMATCH');
  const original = new ImageData(new Uint8ClampedArray(raw), width, height);

  onProgress?.(10);

  // Apply adjustments to a working copy, leaving `raw` (= original) untouched
  const adjusted = applyAdjustments(raw, adjustments);

  // Map row progress (0..height-1) → pct (10..95)
  const rowProgress = onProgress
    ? (row: number, total: number) => onProgress(10 + Math.round((row / total) * 85))
    : undefined;

  const processedData = await applyDithering(adjusted, width, height, dithering, intensity, palette, bnScale, rowProgress);

  onProgress?.(100);

  return {
    processed: new ImageData(new Uint8ClampedArray(processedData), width, height),
    original,
  };
}

export async function processCompare(
  source: HTMLImageElement | ImageBitmap,
  width:      number,
  height:     number,
  intensity:  number,
  leftMode:   DitheringMode,
  rightMode:  DitheringMode,
  palette:    ComputedPalette = DEFAULT_PALETTE,
  adjustments: ImageAdjustments = DEFAULT_ADJUSTMENTS,
  bnScale:    number = 2,
): Promise<{ left: ImageData; right: ImageData; original: ImageData }> {
  const raw      = await scaleSource(source, width, height);
  const adjusted = applyAdjustments(raw, adjustments);

  const [leftData, rightData] = await Promise.all([
    applyDithering(adjusted, width, height, leftMode,  intensity, palette, bnScale),
    applyDithering(adjusted, width, height, rightMode, intensity, palette, bnScale),
  ]);

  return {
    left:     new ImageData(new Uint8ClampedArray(leftData),  width, height),
    right:    new ImageData(new Uint8ClampedArray(rightData), width, height),
    original: new ImageData(new Uint8ClampedArray(raw), width, height),
  };
}
