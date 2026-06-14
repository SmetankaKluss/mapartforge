import JSZip from 'jszip';
import { NbtWriter, gzipBytes } from './nbt';
import type { ComputedPalette } from './dithering';
import type { MapGrid } from './types';
import { buildFrameFillCommands, buildFrameFillDatapackFiles } from './exportFrameCommands';

const MAP_SIZE = 128;

/** Build reverse lookup: packed RGB → PaletteColor */
export function buildLookup(cp: ComputedPalette): Map<number, { baseId: number; shade: number }> {
  const m = new Map<number, { baseId: number; shade: number }>();
  for (const c of cp.colors) {
    const key = (c.r << 16) | (c.g << 8) | c.b;
    if (!m.has(key)) m.set(key, { baseId: c.baseId, shade: c.shade });
  }
  return m;
}

/** Build a 16384-byte color array for one 128×128 map tile. */
export function buildTileColors(
  imageData: ImageData,
  tileCol: number,
  tileRow: number,
  lookup: Map<number, { baseId: number; shade: number }>,
): Uint8Array {
  const colors = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const { data, width } = imageData;

  for (let py = 0; py < MAP_SIZE; py++) {
    for (let px = 0; px < MAP_SIZE; px++) {
      const imgX = tileCol * MAP_SIZE + px;
      const imgY = tileRow * MAP_SIZE + py;
      const i = (imgY * width + imgX) * 4;
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      const entry = lookup.get(key);
      // colorIndex = baseId * 4 + shade (Minecraft map color byte value)
      colors[py * MAP_SIZE + px] = entry ? entry.baseId * 4 + entry.shade : 0;
    }
  }
  return colors;
}

/** Write a single map.dat NBT payload (uncompressed). */
export function buildMapNbt(colors: Uint8Array): Uint8Array {
  const w = new NbtWriter();
  // Outer compound (root, named "")
  w.tagCompoundStart('');
    w.tagInt('DataVersion', 3953); // Minecraft 1.21.4
    w.tagCompoundStart('data');
      w.tagByte('scale', 0);
      w.tagString('dimension', 'minecraft:overworld');
      w.tagByte('trackingPosition', 0);
      w.tagByte('unlimitedTracking', 0);
      w.tagByte('locked', 1);
      w.tagInt('xCenter', 0);
      w.tagInt('zCenter', 0);
      // empty banners list (TAG_List of TAG_Compound, 0 entries)
      w.tagListStart('banners', 10, 0);
      // empty frames list
      w.tagListStart('frames', 10, 0);
      w.tagByteArray('colors', colors);
    w.tagCompoundEnd(); // end data
  w.tagCompoundEnd(); // end root
  return w.toBytes();
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export map.dat files as one ZIP.
 * Files are named map_0.dat, map_1.dat, … in row-major order (left→right, top→bottom),
 * or start from startMapId when the user needs exact in-world map IDs.
 */
export async function exportMapDat(
  imageData: ImageData,
  mapGrid:   MapGrid,
  cp:        ComputedPalette,
  startMapId = 0,
): Promise<void> {
  const lookup = buildLookup(cp);
  const zip = new JSZip();
  const mapsFolder = zip.folder('data') ?? zip;
  let idx = 0;
  for (let row = 0; row < mapGrid.tall; row++) {
    for (let col = 0; col < mapGrid.wide; col++) {
      const colors  = buildTileColors(imageData, col, row, lookup);
      const nbt     = buildMapNbt(colors);
      const gzipped = await gzipBytes(nbt);
      mapsFolder.file(`map_${startMapId + idx}.dat`, gzipped);
      idx++;
    }
  }

  const commandOptions = { mapGrid, startMapId };
  zip.file('mapkluss_fill_frames.mcfunction', buildFrameFillCommands(commandOptions));
  const datapackFolder = 'datapacks/mapkluss_map_art';
  for (const file of buildFrameFillDatapackFiles(commandOptions)) {
    zip.file(`${datapackFolder}/${file.path}`, file.content);
  }
  zip.file('README.txt', [
    'MapKluss MAP.DAT export',
    '',
    'Install:',
    '1. Copy files from the data folder into your Minecraft world/data folder.',
    '2. Copy the datapacks/mapkluss_map_art folder into your Minecraft world/datapacks folder.',
    '3. Open the world and run /reload.',
    '',
    'Use:',
    '1. Place item frames in the same grid size as your art.',
    '2. Put your crosshair on the bottom-left frame.',
    '3. Run /function mapkluss:fill_frames.',
    '',
    'Fallback:',
    'If the datapack does not appear, commands are also included in mapkluss_fill_frames.mcfunction.',
    '',
    `Grid: ${mapGrid.wide}x${mapGrid.tall}`,
    `Map IDs: ${startMapId}..${startMapId + mapGrid.wide * mapGrid.tall - 1}`,
    '',
  ].join('\n'));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  triggerBlobDownload(blob, `mapkluss_mapdat_${mapGrid.wide}x${mapGrid.tall}_maps_${startMapId}.zip`);
}
