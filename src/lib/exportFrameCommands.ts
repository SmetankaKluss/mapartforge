import type { MapGrid } from './types';
import type { MinecraftVersion } from './versionPresets';

export interface FrameCommandOptions {
  mapGrid: MapGrid;
  startMapId: number;
  minecraftVersion?: MinecraftVersion;
  forwardOffset?: number;
}

export interface DatapackFile {
  path: string;
  content: string;
}

const DEFAULT_FORWARD_OFFSET = 2;
const FRAME_CLEAR_RADIUS = 0.8;

const PLAYER_FACING_RULES = [
  { range: '-45..45', frameFacing: 2, label: 'south' },
  { range: '45..135', frameFacing: 5, label: 'west' },
  { range: '-135..-45', frameFacing: 4, label: 'east' },
  { range: '135..180', frameFacing: 3, label: 'north+' },
  { range: '-180..-135', frameFacing: 3, label: 'north-' },
] as const;

function usesLegacyMapItemNbt(version: MinecraftVersion | undefined): boolean {
  return version !== '1.21.4';
}

function mapItemNbt(mapId: number, version: MinecraftVersion | undefined): string {
  if (usesLegacyMapItemNbt(version)) {
    return `{id:"minecraft:filled_map",Count:1b,tag:{map:${mapId}}}`;
  }
  return `{id:"minecraft:filled_map",count:1,components:{"minecraft:map_id":${mapId}}}`;
}

function packFormatForVersion(version: MinecraftVersion | undefined): number {
  if (version === '1.21.4') return 48;
  return 15;
}

function clampStartMapId(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function mapIdForBottomLeftFrame(
  mapGrid: MapGrid,
  startMapId: number,
  frameCol: number,
  frameRowFromBottom: number,
): number {
  const tileRowFromTop = mapGrid.tall - 1 - frameRowFromBottom;
  return clampStartMapId(startMapId) + tileRowFromTop * mapGrid.wide + frameCol;
}

export function buildFrameFillCommands({
  mapGrid,
  startMapId,
  minecraftVersion,
  forwardOffset = DEFAULT_FORWARD_OFFSET,
}: FrameCommandOptions): string {
  const firstId = clampStartMapId(startMapId);
  const lastId = firstId + mapGrid.wide * mapGrid.tall - 1;
  const lines: string[] = [
    '# MapKluss item frame fill commands',
    `# Minecraft ${minecraftVersion === '1.21.4' ? 'Java 1.21.4+' : 'Java 1.20.1 compatible'}`,
    `# Maps: map_${firstId}.dat ... map_${lastId}.dat`,
    `# Grid: ${mapGrid.wide}x${mapGrid.tall}`,
    '#',
    '# How to use:',
    '# 1. Put the exported map_*.dat files into your world/data folder.',
    '# 2. Put the mapkluss_map_art datapack folder into your world/datapacks folder.',
    '# 3. Run /reload.',
    '# 4. Put your crosshair on the BOTTOM-LEFT block position of the future art.',
    '# 5. Run /function mapkluss:fill_frames.',
    '#',
    'tellraw @s {"text":"MapKluss: placing glowing item frames from your crosshair...","color":"green"}',
  ];

  for (let rowFromBottom = 0; rowFromBottom < mapGrid.tall; rowFromBottom++) {
    for (let col = 0; col < mapGrid.wide; col++) {
      const mapId = mapIdForBottomLeftFrame(mapGrid, firstId, col, rowFromBottom);
      const left = -col;
      const up = rowFromBottom;
      const itemNbt = mapItemNbt(mapId, minecraftVersion);
      lines.push(
        `execute anchored eyes positioned ^${left} ^${up} ^${forwardOffset} run kill @e[type=minecraft:item_frame,distance=..${FRAME_CLEAR_RADIUS}]`,
      );
      lines.push(
        `execute anchored eyes positioned ^${left} ^${up} ^${forwardOffset} run kill @e[type=minecraft:glow_item_frame,distance=..${FRAME_CLEAR_RADIUS}]`,
      );
      lines.push(
        `tellraw @s {"text":"MapKluss: frame ${col + 1},${rowFromBottom + 1} -> map_${mapId}","color":"dark_gray"}`,
      );
      for (const rule of PLAYER_FACING_RULES) {
        lines.push(
          `execute if entity @s[y_rotation=${rule.range}] anchored eyes positioned ^${left} ^${up} ^${forwardOffset} run summon minecraft:glow_item_frame ~ ~ ~ {Facing:${rule.frameFacing}b,Item:${itemNbt}}`,
        );
      }
    }
  }

  lines.push('tellraw @s {"text":"MapKluss: done.","color":"green"}');
  return `${lines.join('\n')}\n`;
}

export function buildFrameFillDatapackFiles(options: FrameCommandOptions): DatapackFile[] {
  const fillFunction = buildFrameFillCommands(options);
  const packMeta = JSON.stringify({
    pack: {
      pack_format: packFormatForVersion(options.minecraftVersion),
      description: 'MapKluss map art item-frame filler',
    },
  }, null, 2);

  return [
    { path: 'pack.mcmeta', content: `${packMeta}\n` },
    { path: 'data/mapkluss/function/fill_frames.mcfunction', content: fillFunction },
    { path: 'data/mapkluss/functions/fill_frames.mcfunction', content: fillFunction },
  ];
}

export function downloadFrameFillCommands(options: FrameCommandOptions): void {
  const content = buildFrameFillCommands(options);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `mapkluss_frame_fill_${options.mapGrid.wide}x${options.mapGrid.tall}_maps_${clampStartMapId(options.startMapId)}.mcfunction`,
  });
  a.click();
  URL.revokeObjectURL(url);
}
