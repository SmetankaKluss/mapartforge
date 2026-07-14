export interface ScenePaletteEntry {
  name: string;
  properties?: Record<string, string>;
}

export interface SceneBlockInstance {
  x: number;
  y: number;
  z: number;
  paletteIndex: number;
}

export interface SceneFrameAnchor {
  center: [number, number, number];
  tile: [number, number, number];
  facing: 'north' | 'south' | 'west' | 'east';
  rotationY: number;
  leftStep: [number, number, number];
  upStep: [number, number, number];
  maxWide: number;
  maxTall: number;
}

export interface SceneLitematicAsset {
  size: { x: number; y: number; z: number };
  originOffset: [number, number, number];
  palette: ScenePaletteEntry[];
  blocks: SceneBlockInstance[];
  frame: SceneFrameAnchor;
}

type NbtValue = number | bigint | string | Uint8Array | NbtValue[] | { [key: string]: NbtValue };
type NbtCompound = { [key: string]: NbtValue };

const GALLERY_SCENE_URL = '/scene/gallery-wall.litematic';

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

let galleryScenePromise: Promise<SceneLitematicAsset> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

function asCompound(value: unknown, label: string): NbtCompound {
  if (!isRecord(value)) throw new Error(`Expected compound for ${label}`);
  return value as NbtCompound;
}

function asArray(value: unknown, label: string): NbtValue[] {
  if (!Array.isArray(value)) throw new Error(`Expected list for ${label}`);
  return value as NbtValue[];
}

function asNumber(value: unknown, label: string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  throw new Error(`Expected number for ${label}`);
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Expected string for ${label}`);
  return value;
}

function readString(view: DataView, offset: number): { value: string; end: number } {
  const len = view.getUint16(offset, false);
  const start = offset + 2;
  const bytes = new Uint8Array(view.buffer, view.byteOffset + start, len);
  return { value: new TextDecoder().decode(bytes), end: start + len };
}

function readPayload(view: DataView, offset: number, tagType: number): { value: NbtValue; end: number } {
  switch (tagType) {
    case TAG_BYTE:
      return { value: view.getInt8(offset), end: offset + 1 };
    case TAG_SHORT:
      return { value: view.getInt16(offset, false), end: offset + 2 };
    case TAG_INT:
      return { value: view.getInt32(offset, false), end: offset + 4 };
    case TAG_LONG:
      return { value: view.getBigInt64(offset, false), end: offset + 8 };
    case TAG_FLOAT:
      return { value: view.getFloat32(offset, false), end: offset + 4 };
    case TAG_DOUBLE:
      return { value: view.getFloat64(offset, false), end: offset + 8 };
    case TAG_BYTE_ARRAY: {
      const len = view.getInt32(offset, false);
      const start = offset + 4;
      return {
        value: new Uint8Array(view.buffer.slice(view.byteOffset + start, view.byteOffset + start + len)),
        end: start + len,
      };
    }
    case TAG_STRING:
      return readString(view, offset);
    case TAG_LIST: {
      const elemType = view.getUint8(offset);
      const count = view.getInt32(offset + 1, false);
      let cursor = offset + 5;
      const items: NbtValue[] = [];
      for (let i = 0; i < count; i++) {
        const result = readPayload(view, cursor, elemType);
        items.push(result.value);
        cursor = result.end;
      }
      return { value: items, end: cursor };
    }
    case TAG_COMPOUND: {
      const compound: NbtCompound = {};
      let cursor = offset;
      while (true) {
        const type = view.getUint8(cursor++);
        if (type === TAG_END) break;
        const { value: name, end: nameEnd } = readString(view, cursor);
        cursor = nameEnd;
        const result = readPayload(view, cursor, type);
        compound[name] = result.value;
        cursor = result.end;
      }
      return { value: compound, end: cursor };
    }
    case TAG_INT_ARRAY: {
      const len = view.getInt32(offset, false);
      let cursor = offset + 4;
      const values: number[] = [];
      for (let i = 0; i < len; i++, cursor += 4) values.push(view.getInt32(cursor, false));
      return { value: values, end: cursor };
    }
    case TAG_LONG_ARRAY: {
      const len = view.getInt32(offset, false);
      let cursor = offset + 4;
      const values: bigint[] = [];
      for (let i = 0; i < len; i++, cursor += 8) values.push(view.getBigInt64(cursor, false));
      return { value: values, end: cursor };
    }
    default:
      throw new Error(`Unsupported NBT tag type ${tagType}`);
  }
}

async function ungzip(bytes: Uint8Array): Promise<Uint8Array> {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function unpackBlockStates(
  longs: bigint[],
  paletteSize: number,
  size: { x: number; y: number; z: number },
  palette: ScenePaletteEntry[],
): SceneBlockInstance[] {
  const bitsPerEntry = Math.max(2, Math.ceil(Math.log2(Math.max(paletteSize, 2))));
  const mask = (1n << BigInt(bitsPerEntry)) - 1n;
  const volume = size.x * size.y * size.z;
  const blocks: SceneBlockInstance[] = [];

  for (let index = 0; index < volume; index++) {
    const bitIndex = BigInt(index * bitsPerEntry);
    const longIndex = Number(bitIndex >> 6n);
    const startBit = Number(bitIndex & 63n);
    const current = BigInt.asUintN(64, longs[longIndex] ?? 0n);

    let value: bigint;
    if (startBit + bitsPerEntry <= 64) {
      value = (current >> BigInt(startBit)) & mask;
    } else {
      const lowBits = 64 - startBit;
      const highBits = bitsPerEntry - lowBits;
      const next = BigInt.asUintN(64, longs[longIndex + 1] ?? 0n);
      const low = (current >> BigInt(startBit)) & ((1n << BigInt(lowBits)) - 1n);
      const high = next & ((1n << BigInt(highBits)) - 1n);
      value = low | (high << BigInt(lowBits));
    }

    const paletteIndex = Number(value);
    const entry = palette[paletteIndex];
    if (!entry || entry.name === 'minecraft:air') continue;

    const x = index % size.x;
    const y = Math.floor(index / (size.x * size.z));
    const z = Math.floor(index / size.x) % size.z;
    blocks.push({ x, y, z, paletteIndex });
  }

  return blocks;
}

function mapFacing(facing: number): Pick<SceneFrameAnchor, 'facing' | 'rotationY' | 'leftStep' | 'upStep'> {
  switch (facing) {
    case 2:
      return { facing: 'north', rotationY: Math.PI, leftStep: [1, 0, 0], upStep: [0, 1, 0] };
    case 3:
      return { facing: 'south', rotationY: 0, leftStep: [-1, 0, 0], upStep: [0, 1, 0] };
    case 4:
      return { facing: 'west', rotationY: -Math.PI / 2, leftStep: [0, 0, -1], upStep: [0, 1, 0] };
    case 5:
      return { facing: 'east', rotationY: Math.PI / 2, leftStep: [0, 0, 1], upStep: [0, 1, 0] };
    default:
      throw new Error(`Unsupported item frame facing ${facing}`);
  }
}

export function parseSceneLitematicNbt(bytes: Uint8Array): SceneLitematicAsset {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(0) !== TAG_COMPOUND) throw new Error('Invalid litematic: root tag is not a compound');

  const { end: rootNameEnd } = readString(view, 1);
  const root = asCompound(readPayload(view, rootNameEnd, TAG_COMPOUND).value, 'root');
  const regions = asCompound(root.Regions, 'Regions');
  const firstRegionEntry = Object.entries(regions)[0];
  if (!firstRegionEntry) throw new Error('Invalid litematic: no regions found');
  const [, regionValue] = firstRegionEntry;
  const region = asCompound(regionValue, 'Region');
  const regionSize = asCompound(region.Size, 'Region.Size');
  const size = {
    x: asNumber(regionSize.x, 'Region.Size.x'),
    y: asNumber(regionSize.y, 'Region.Size.y'),
    z: asNumber(regionSize.z, 'Region.Size.z'),
  };

  const palette = asArray(region.BlockStatePalette, 'BlockStatePalette').map((entry, index) => {
    const compound = asCompound(entry, `BlockStatePalette[${index}]`);
    const name = asString(compound.Name, `BlockStatePalette[${index}].Name`);
    const propertiesValue = compound.Properties;
    const properties = isRecord(propertiesValue)
      ? Object.fromEntries(Object.entries(propertiesValue).map(([key, value]) => [key, asString(value, `Property ${key}`)]))
      : undefined;
    return { name, properties };
  });

  const blockStates = asArray(region.BlockStates, 'BlockStates').map((value, index) => {
    if (typeof value !== 'bigint') throw new Error(`Expected bigint in BlockStates[${index}]`);
    return value;
  });

  const entities = asArray(region.Entities, 'Entities');
  const frameEntity = entities
    .map((value, index) => asCompound(value, `Entities[${index}]`))
    .find(entity => entity.id === 'minecraft:glow_item_frame');
  if (!frameEntity) throw new Error('Gallery scene is missing a glow item frame anchor');

  const itemFramePos = asArray(frameEntity.Pos, 'ItemFrame.Pos').map((value, index) => asNumber(value, `ItemFrame.Pos[${index}]`)) as [number, number, number];
  const tile = [
    asNumber(frameEntity.TileX, 'ItemFrame.TileX'),
    asNumber(frameEntity.TileY, 'ItemFrame.TileY'),
    asNumber(frameEntity.TileZ, 'ItemFrame.TileZ'),
  ] as [number, number, number];
  const facing = mapFacing(asNumber(frameEntity.Facing, 'ItemFrame.Facing'));
  const originOffset: [number, number, number] = [-size.x / 2, 0, -size.z / 2];

  return {
    size,
    originOffset,
    palette,
    blocks: unpackBlockStates(blockStates, palette.length, size, palette),
    frame: {
      center: [
        itemFramePos[0] + originOffset[0],
        itemFramePos[1],
        itemFramePos[2] + originOffset[2],
      ],
      tile,
      ...facing,
      maxWide: 3,
      maxTall: 4,
    },
  };
}

export async function loadGallerySceneLitematic(): Promise<SceneLitematicAsset> {
  if (!galleryScenePromise) {
    galleryScenePromise = (async () => {
      const response = await fetch(GALLERY_SCENE_URL);
      if (!response.ok) throw new Error(`Failed to load gallery scene: ${response.status}`);
      const raw = new Uint8Array(await response.arrayBuffer());
      const bytes = await ungzip(raw);
      return parseSceneLitematicNbt(bytes);
    })();
  }
  return galleryScenePromise;
}
