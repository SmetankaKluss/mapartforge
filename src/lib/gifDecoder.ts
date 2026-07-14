/**
 * GIF decoder using gifuct-js.
 * Composites delta frames into full ImageData frames.
 */
import { parseGIF, decompressFrames } from 'gifuct-js';
import type { ParsedFrame } from 'gifuct-js';

export interface GifInfo {
  width: number;
  height: number;
  frameCount: number;
  /** Delays in ms for each frame */
  delays: number[];
  totalDurationMs: number;
}

export interface GifFrames {
  info: GifInfo;
  /** Each element is a fully-composited RGBA ImageData (width × height) */
  frames: ImageData[];
}

/** Decode a GIF file, returning metadata + composited frames. */
export async function decodeGif(file: File): Promise<GifFrames> {
  const arrayBuffer = await file.arrayBuffer();
  const parsed = parseGIF(arrayBuffer);
  const rawFrames: ParsedFrame[] = decompressFrames(parsed, true);

  if (rawFrames.length === 0) throw new Error('GIF has no frames');

  const { width, height } = parsed.lsd;

  // Canvas buffer — accumulates frame patches
  const buffer = new Uint8ClampedArray(width * height * 4);

  const composited: ImageData[] = [];
  const delays: number[] = [];

  for (const frame of rawFrames) {
    const { dims, patch, delay, disposalType } = frame;

    // Save previous buffer state if disposal = 3 (restore to previous)
    const prevBuffer = disposalType === 3 ? new Uint8ClampedArray(buffer) : null;

    // Blit patch onto buffer
    const { width: fw, height: fh, left, top } = dims;
    for (let py = 0; py < fh; py++) {
      for (let px = 0; px < fw; px++) {
        const pi = (py * fw + px) * 4;
        const r = patch[pi], g = patch[pi + 1], b = patch[pi + 2], a = patch[pi + 3];

        // Skip transparent pixels
        if (a === 0) continue;
        // Skip if this color index is the transparent index (gifuct-js sets a=0 for these)
        // (already handled by a===0 check above)

        const bufIdx = ((top + py) * width + (left + px)) * 4;
        buffer[bufIdx]     = r;
        buffer[bufIdx + 1] = g;
        buffer[bufIdx + 2] = b;
        buffer[bufIdx + 3] = 255;
      }
    }

    // Snapshot the composited frame
    composited.push(new ImageData(new Uint8ClampedArray(buffer), width, height));
    delays.push(delay * 10); // centiseconds → ms

    // Handle disposal
    if (disposalType === 2) {
      // Restore to background: clear the frame region
      for (let py = 0; py < fh; py++) {
        for (let px = 0; px < fw; px++) {
          const bufIdx = ((top + py) * width + (left + px)) * 4;
          buffer[bufIdx] = buffer[bufIdx + 1] = buffer[bufIdx + 2] = buffer[bufIdx + 3] = 0;
        }
      }
    } else if (disposalType === 3 && prevBuffer) {
      // Restore to previous
      buffer.set(prevBuffer);
    }
    // disposalType 0 or 1: leave buffer as-is
  }

  const totalDurationMs = delays.reduce((s, d) => s + d, 0);

  return {
    info: { width, height, frameCount: composited.length, delays, totalDurationMs },
    frames: composited,
  };
}
