import LZString from 'lz-string';
import type { BlockSelection } from './paletteBlocks';
import { COLOUR_ROWS } from './paletteBlocks';

export const PALETTE_PARAM = 'palette';

function getShareBase(): string {
  const configured = import.meta.env.VITE_SHARE_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return window.location.origin;
}

/**
 * Encode a BlockSelection into a URL-safe compressed string.
 * Only stores rows that have at least one block enabled, as a compact
 * [[csId, [blockId,...]],...] array — typically under 200 chars after LZ.
 */
export function encodePalette(sel: BlockSelection): string {
  const data: [number, number[]][] = COLOUR_ROWS
    .map(row => [row.csId, sel[row.csId] ?? []] as [number, number[]])
    .filter(([, ids]) => ids.length > 0);
  return LZString.compressToEncodedURIComponent(JSON.stringify(data));
}

/**
 * Decode a compressed palette param back into a BlockSelection.
 * Returns null if the data is missing or corrupt.
 */
export function decodePalette(encoded: string): BlockSelection | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const data = JSON.parse(json) as [number, number[]][];
    if (!Array.isArray(data)) return null;
    const sel: BlockSelection = {};
    for (const [csId, ids] of data) {
      if (typeof csId === 'number' && Array.isArray(ids)) {
        sel[csId] = ids.filter(id => typeof id === 'number');
      }
    }
    return sel;
  } catch {
    return null;
  }
}

/** Build the full shareable URL for a block selection. */
export function buildPaletteUrl(sel: BlockSelection): string {
  return `${getShareBase()}/?${PALETTE_PARAM}=${encodePalette(sel)}`;
}
