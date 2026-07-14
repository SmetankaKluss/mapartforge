/// <reference lib="webworker" />
export {};

import { processImage, processCompare } from '../lib/processor';
import type { ProcessOptions } from '../lib/processor';
import type { DitheringMode, ComputedPalette, KlussParams } from '../lib/dithering';
import type { ImageAdjustments } from '../lib/adjustments';

type InMsg =
  | {
      type: 'process';
      jobId: number;
      bitmap: ImageBitmap;
      options: Omit<ProcessOptions, 'onProgress'>;
    }
  | {
      type: 'compare';
      jobId: number;
      bitmap: ImageBitmap;
      width: number;
      height: number;
      intensity: number;
      leftMode: DitheringMode;
      rightMode: DitheringMode;
      palette: ComputedPalette;
      adjustments: ImageAdjustments;
      bnScale: number;
      klussParams?: KlussParams;
    };

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  const { jobId } = msg;
  let bitmapToClose: ImageBitmap | null = null;
  try {
    if (msg.type === 'process') {
      const { bitmap, options } = msg;
      bitmapToClose = bitmap;
      const result = await processImage(bitmap, {
        ...options,
        onProgress: (pct: number) => self.postMessage({ type: 'progress', jobId, pct }),
      });
      const pd = result.processed.data;
      const od = result.original.data;
      // Transfer buffers to avoid copying
      self.postMessage(
        { type: 'result', jobId, processedData: pd, originalData: od, width: options.width, height: options.height },
        [pd.buffer, od.buffer],
      );
    } else {
      const { bitmap, width, height, intensity, leftMode, rightMode, palette, adjustments, bnScale, klussParams } = msg;
      bitmapToClose = bitmap;
      const result = await processCompare(bitmap, width, height, intensity, leftMode, rightMode, palette, adjustments, bnScale, klussParams);
      const ld = result.left.data;
      const rd = result.right.data;
      const od = result.original.data;
      self.postMessage(
        { type: 'compare_result', jobId, leftData: ld, rightData: rd, originalData: od, width, height },
        [ld.buffer, rd.buffer, od.buffer],
      );
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      jobId,
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    bitmapToClose?.close();
  }
};
