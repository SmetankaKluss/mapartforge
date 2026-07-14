import type { MapGrid } from './types';
import type { CompanionArtifactKind } from './companionTypes';

const KIND_EXTENSIONS: Record<CompanionArtifactKind, string> = {
  project: 'mapkluss',
  preview_png: 'png',
  litematic: 'litematic',
  litematic_tiles_zip: 'zip',
  materials_txt: 'txt',
  materials_csv: 'csv',
  mapdat_zip: 'zip',
  frame_commands: 'mcfunction',
  frame_datapack: 'zip',
};

const KIND_SUFFIXES: Partial<Record<CompanionArtifactKind, string>> = {
  materials_txt: 'materials',
  materials_csv: 'materials',
  litematic_tiles_zip: 'litematic_tiles',
  mapdat_zip: 'mapdat',
  frame_commands: 'frames',
  frame_datapack: 'frames_datapack',
};

export function companionSlug(input: string): string {
  const cleaned = input
    .replace(/№/g, '')
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9а-яё_-]+/giu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'mapkluss_art';
}

export function companionGridSuffix(grid: MapGrid): string {
  return `${grid.wide}x${grid.tall}`;
}

export function companionArtifactFilename(
  title: string,
  grid: MapGrid,
  kind: CompanionArtifactKind,
): string {
  const slug = companionSlug(title);
  const suffix = KIND_SUFFIXES[kind];
  const middle = suffix
    ? `${companionGridSuffix(grid)}_${suffix}`
    : companionGridSuffix(grid);
  return `${slug}_${middle}.${KIND_EXTENSIONS[kind]}`;
}

export async function sha256Hex(data: Blob | ArrayBuffer | Uint8Array | string): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data).buffer;
  } else if (data instanceof Blob) {
    buffer = await data.arrayBuffer();
  } else if (data instanceof Uint8Array) {
    buffer = new Uint8Array(data).buffer;
  } else {
    buffer = data;
  }
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
