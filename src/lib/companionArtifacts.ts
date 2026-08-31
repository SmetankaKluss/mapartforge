import { md5 } from '@noble/hashes/legacy';
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
  suppression_litematic: 'litematic',
  suppression_plan: 'json',
  suppression_bundle: 'zip',
};

const KIND_SUFFIXES: Partial<Record<CompanionArtifactKind, string>> = {
  materials_txt: 'materials',
  materials_csv: 'materials',
  litematic_tiles_zip: 'litematic_tiles',
  mapdat_zip: 'mapdat',
  frame_commands: 'frames',
  frame_datapack: 'frames_datapack',
  suppression_litematic: 'suppression',
  suppression_plan: 'suppression_plan',
  suppression_bundle: 'two_layer',
};

export function companionSlug(input: string): string {
  const cyrillicMap: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const cleaned = input
    .replace(/№/g, '')
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[а-яё]/g, letter => cyrillicMap[letter] ?? '')
    .replace(/[^a-z0-9_-]+/g, '_')
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

async function bytesFromArtifactData(data: Blob | ArrayBuffer | Uint8Array | string): Promise<Uint8Array> {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (data instanceof Uint8Array) return new Uint8Array(data);
  return new Uint8Array(data);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function companionArtifactChecksums(
  data: Blob | ArrayBuffer | Uint8Array | string,
): Promise<{ sha256: string; contentMd5: string }> {
  const bytes = await bytesFromArtifactData(data);
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', digestInput.buffer);
  const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return { sha256, contentMd5: bytesToBase64(md5(bytes)) };
}

export async function sha256Hex(data: Blob | ArrayBuffer | Uint8Array | string): Promise<string> {
  return (await companionArtifactChecksums(data)).sha256;
}
