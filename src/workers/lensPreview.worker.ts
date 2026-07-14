import type { LensGrid, LensTileResolution } from '../lib/companionLens';
import { LENS_MAX_PREVIEW_BYTES, nextLensTileResolution } from '../lib/lensPreview';

interface BuildMessage {
  id: number;
  pixels: ArrayBuffer;
  width: number;
  height: number;
  grid: LensGrid;
  tileResolution: LensTileResolution;
}

interface BuildResult {
  id: number;
  blob?: Blob;
  sha256?: string;
  tileResolution?: LensTileResolution;
  width?: number;
  height?: number;
  error?: string;
}

function hexDigest(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function encodeAtlas(message: BuildMessage, resolution: LensTileResolution): Promise<BuildResult> {
  const source = new OffscreenCanvas(message.width, message.height);
  const sourceContext = source.getContext('2d');
  if (!sourceContext) throw new Error('canvas_unavailable');
  sourceContext.putImageData(
    new ImageData(new Uint8ClampedArray(message.pixels), message.width, message.height),
    0,
    0,
  );

  const width = message.grid.wide * resolution;
  const height = message.grid.tall * resolution;
  const atlas = new OffscreenCanvas(width, height);
  const context = atlas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  const blob = await atlas.convertToBlob({ type: 'image/png' });
  const sha256 = hexDigest(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  return { id: message.id, blob, sha256, tileResolution: resolution, width, height };
}

async function buildAtlas(message: BuildMessage): Promise<BuildResult> {
  const first = await encodeAtlas(message, message.tileResolution);
  if (!first.blob || first.blob.size <= LENS_MAX_PREVIEW_BYTES) return first;
  const retryResolution = nextLensTileResolution(message.tileResolution);
  if (!retryResolution) throw new Error('preview_too_large');
  const retry = await encodeAtlas(message, retryResolution);
  if (!retry.blob || retry.blob.size > LENS_MAX_PREVIEW_BYTES) throw new Error('preview_too_large');
  return retry;
}

self.onmessage = (event: MessageEvent<BuildMessage>) => {
  void buildAtlas(event.data)
    .then(result => self.postMessage(result satisfies BuildResult))
    .catch((error: unknown) => self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : 'preview_failed',
    } satisfies BuildResult));
};
