/**
 * Import a Minecraft map.dat file and convert it to an ImageData.
 *
 * map.dat is a gzip-compressed NBT file. Its `data.colors` field is a
 * 16384-byte (128×128) array where each byte is a map color index:
 *   colorByte = baseId * 4 + shade
 *   baseId 0 = transparent/void
 *   baseId 1-61 = actual block colors
 */

import { PALETTE } from './palette';

// Build a lookup table: colorByte (0-255) → {r, g, b, a}
const COLOR_BYTE_TO_RGBA: Uint8ClampedArray[] = (() => {
  const table: Uint8ClampedArray[] = new Array(256);
  for (let i = 0; i < 256; i++) {
    const baseId = i >> 2;      // i / 4
    const shade  = i & 3;       // i % 4
    if (baseId === 0) {
      // Transparent
      table[i] = new Uint8ClampedArray([0, 0, 0, 0]);
    } else {
      const entry = PALETTE.find(p => p.baseId === baseId && p.shade === shade);
      if (entry) {
        table[i] = new Uint8ClampedArray([entry.r, entry.g, entry.b, 255]);
      } else {
        table[i] = new Uint8ClampedArray([0, 0, 0, 0]);
      }
    }
  }
  return table;
})();

// Minimal gzip decompressor using DecompressionStream (available in all modern browsers)
async function ungzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  writer.write(bytes as unknown as Uint8Array<ArrayBuffer>);
  writer.close();

  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// Read a big-endian UTF-8 string from DataView
function readString(view: DataView, offset: number): { str: string; end: number } {
  const len = view.getUint16(offset, false);
  offset += 2;
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, len);
  const str = new TextDecoder().decode(bytes);
  return { str, end: offset + len };
}

// NBT tag types
const TAG_END = 0, TAG_BYTE = 1, TAG_SHORT = 2, TAG_INT = 3, TAG_LONG = 4,
  TAG_FLOAT = 5, TAG_DOUBLE = 6, TAG_BYTE_ARRAY = 7, TAG_STRING = 8,
  TAG_LIST = 9, TAG_COMPOUND = 10, TAG_INT_ARRAY = 11, TAG_LONG_ARRAY = 12;

// Skip over an NBT payload of given type, returning new offset
function skipPayload(view: DataView, offset: number, tagType: number): number {
  switch (tagType) {
    case TAG_BYTE:   return offset + 1;
    case TAG_SHORT:  return offset + 2;
    case TAG_INT:    return offset + 4;
    case TAG_LONG:   return offset + 8;
    case TAG_FLOAT:  return offset + 4;
    case TAG_DOUBLE: return offset + 8;
    case TAG_BYTE_ARRAY: {
      const len = view.getInt32(offset, false);
      return offset + 4 + len;
    }
    case TAG_STRING: {
      const len = view.getUint16(offset, false);
      return offset + 2 + len;
    }
    case TAG_LIST: {
      const elemType = view.getUint8(offset);
      const count = view.getInt32(offset + 1, false);
      offset += 5;
      for (let i = 0; i < count; i++) offset = skipPayload(view, offset, elemType);
      return offset;
    }
    case TAG_COMPOUND: {
      while (true) {
        const type = view.getUint8(offset++);
        if (type === TAG_END) break;
        const { end } = readString(view, offset);
        offset = end;
        offset = skipPayload(view, offset, type);
      }
      return offset;
    }
    case TAG_INT_ARRAY: {
      const len = view.getInt32(offset, false);
      return offset + 4 + len * 4;
    }
    case TAG_LONG_ARRAY: {
      const len = view.getInt32(offset, false);
      return offset + 4 + len * 8;
    }
    default: throw new Error(`Unknown NBT tag type: ${tagType}`);
  }
}

/**
 * Walk the NBT tree looking for a byte array named "colors" inside a
 * compound named "data". Returns the raw color bytes or null.
 */
function extractColors(view: DataView, offset: number, insideData: boolean): Uint8Array | null {
  // We start after the root compound's name
  // Walk compound entries
  while (offset < view.byteLength) {
    const tagType = view.getUint8(offset++);
    if (tagType === TAG_END) break;

    const { str: name, end: nameEnd } = readString(view, offset);
    offset = nameEnd;

    if (tagType === TAG_COMPOUND && name === 'data') {
      const result = extractColors(view, offset, true);
      if (result) return result;
      offset = skipPayload(view, offset, TAG_COMPOUND);
    } else if (insideData && tagType === TAG_BYTE_ARRAY && name === 'colors') {
      const len = view.getInt32(offset, false);
      offset += 4;
      return new Uint8Array(view.buffer, view.byteOffset + offset, len);
    } else {
      offset = skipPayload(view, offset, tagType);
    }
  }
  return null;
}

export class MapDatImportError extends Error {}

/**
 * Parse a map.dat file (gzip-compressed NBT) and return an ImageData (128×128).
 * Throws MapDatImportError on invalid/unrecognized format.
 */
export async function importMapDat(file: File): Promise<ImageData> {
  const arrayBuffer = await file.arrayBuffer();
  const raw = new Uint8Array(arrayBuffer);

  // Detect gzip magic bytes (1f 8b)
  if (raw[0] !== 0x1f || raw[1] !== 0x8b) {
    throw new MapDatImportError('Not a valid map.dat file (expected gzip header)');
  }

  let decompressed: Uint8Array;
  try {
    decompressed = await ungzip(raw);
  } catch {
    throw new MapDatImportError('Failed to decompress map.dat — file may be corrupted');
  }

  const view = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);

  // NBT starts with root tag type (should be TAG_COMPOUND = 10)
  if (view.getUint8(0) !== TAG_COMPOUND) {
    throw new MapDatImportError('Invalid NBT structure: root tag is not a compound');
  }

  // Skip root name (usually empty string: 2 bytes = 0x00 0x00)
  const { end: rootNameEnd } = readString(view, 1);
  let offset = rootNameEnd;

  const colorBytes = extractColors(view, offset, false);
  if (!colorBytes) {
    throw new MapDatImportError('Could not find colors data in map.dat — is this a Minecraft map file?');
  }

  if (colorBytes.length < 128 * 128) {
    throw new MapDatImportError(`Color data too short: expected ${128 * 128}, got ${colorBytes.length}`);
  }

  // Convert color bytes to RGBA ImageData
  const imageData = new ImageData(128, 128);
  const { data } = imageData;

  for (let i = 0; i < 128 * 128; i++) {
    const rgba = COLOR_BYTE_TO_RGBA[colorBytes[i]];
    data[i * 4]     = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }

  return imageData;
}
