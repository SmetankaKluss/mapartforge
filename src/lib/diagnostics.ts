import { VERSION } from '../version';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import type { BlockSelection } from './paletteBlocks';
import type { ImageAdjustments } from './adjustments';
import type { DitheringMode } from './dithering';
import type { MapGrid } from './types';

const BUCKET = 'mapartforge';
const PREFIX = 'diagnostics';
const MAX_DIMENSION = 768;
const JPEG_QUALITY = 0.86;

interface DiagnosticSettings {
  dithering: DitheringMode;
  intensity: number;
  mapGrid: MapGrid;
  blockSelection: BlockSelection;
  adjustments: ImageAdjustments;
  mapMode: '2d' | '3d';
  staircaseMode: 'classic' | 'optimized';
  bnScale: number;
  compareMode?: boolean;
  artistMode?: boolean;
  paletteSize?: number;
}

interface DiagnosticCaptureOptions {
  action: string;
  previewData: ImageData;
  settings: DiagnosticSettings;
  sourceImage?: HTMLImageElement | null;
}

function generateId(): string {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId(): string {
  const key = 'mapkluss_diagnostic_session';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = generateId();
  localStorage.setItem(key, next);
  return next;
}

function getDatePath(): string {
  return new Date().toISOString().slice(0, 10);
}

function scaleSize(width: number, height: number) {
  const maxSide = Math.max(width, height);
  if (maxSide <= MAX_DIMENSION) return { width, height };
  const ratio = MAX_DIMENSION / maxSide;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob failed'));
    }, type, quality);
  });
}

async function imageDataToJpegBlob(data: ImageData): Promise<Blob> {
  const { width, height } = scaleSize(data.width, data.height);
  const src = document.createElement('canvas');
  src.width = data.width;
  src.height = data.height;
  src.getContext('2d')!.putImageData(data, 0, 0);

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0, width, height);
  return canvasToBlob(out, 'image/jpeg', JPEG_QUALITY);
}

async function imageElementToJpegBlob(image: HTMLImageElement): Promise<Blob> {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const { width, height } = scaleSize(naturalWidth, naturalHeight);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, 0, 0, width, height);
  return canvasToBlob(out, 'image/jpeg', JPEG_QUALITY);
}

export async function uploadDiagnosticCapture({
  action,
  previewData,
  settings,
  sourceImage = null,
}: DiagnosticCaptureOptions): Promise<void> {
  if (!isSupabaseConfigured) return;

  try {
    const supabase = getSupabaseClient();
    const captureId = generateId();
    const sessionId = getSessionId();
    const basePath = `${PREFIX}/${getDatePath()}/${sessionId}/${captureId}`;

    const uploads: Promise<unknown>[] = [];

    if (sourceImage) {
      uploads.push(
        imageElementToJpegBlob(sourceImage).then((blob) =>
          supabase.storage.from(BUCKET).upload(`${basePath}_source.jpg`, blob, {
            contentType: 'image/jpeg',
            upsert: false,
          }),
        ),
      );
    }

    uploads.push(
      imageDataToJpegBlob(previewData).then((blob) =>
        supabase.storage.from(BUCKET).upload(`${basePath}_preview.jpg`, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        }),
      ),
    );

    const metadata = {
      version: VERSION,
      action,
      capturedAt: new Date().toISOString(),
      url: window.location.href,
      language: document.documentElement.lang || undefined,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
      },
      previewSize: {
        width: previewData.width,
        height: previewData.height,
      },
      settings,
    };

    const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
    uploads.push(
      supabase.storage.from(BUCKET).upload(`${basePath}_settings.json`, metadataBlob, {
        contentType: 'application/json',
        upsert: false,
      }),
    );

    const results = await Promise.all(uploads);
    for (const result of results) {
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        console.warn('[diagnostics] upload failed:', result.error);
      }
    }
  } catch (error) {
    console.warn('[diagnostics] capture failed:', error);
  }
}
