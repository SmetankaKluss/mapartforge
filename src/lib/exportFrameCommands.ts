import type { MapGrid } from './types';
import type { MinecraftVersion } from './versionPresets';

export interface FrameCommandOptions {
  mapGrid: MapGrid;
  startMapId: number;
  minecraftVersion?: MinecraftVersion;
  forwardOffset?: number;
  frameSearchRadius?: number;
}

export interface DatapackFile {
  path: string;
  content: string;
}

const DEFAULT_FORWARD_OFFSET = 2;
const DEFAULT_FRAME_SEARCH_RADIUS = 1.45;
const ITEM_FRAME_FACINGS = [0, 1, 2, 3, 4, 5] as const;
const TARGET_FRAME_TAG = 'mapkluss_target_frame';

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
  frameSearchRadius = DEFAULT_FRAME_SEARCH_RADIUS,
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
    '# 4. Place item frames in the same grid size.',
    '# 5. Put your crosshair on the BOTTOM-LEFT frame.',
    '# 6. Run /function mapkluss:fill_frames.',
    '#',
    'tellraw @s {"text":"MapKluss: filling item frames from your crosshair...","color":"green"}',
  ];

  for (let rowFromBottom = 0; rowFromBottom < mapGrid.tall; rowFromBottom++) {
    for (let col = 0; col < mapGrid.wide; col++) {
      const mapId = mapIdForBottomLeftFrame(mapGrid, firstId, col, rowFromBottom);
      const left = -col;
      const up = rowFromBottom;
      const itemNbt = mapItemNbt(mapId, minecraftVersion);
      lines.push(
        `execute anchored eyes positioned ^${left} ^${up} ^${forwardOffset} if entity @e[type=minecraft:item_frame,distance=..${frameSearchRadius},limit=1] run tellraw @s {"text":"MapKluss: frame ${col + 1},${rowFromBottom + 1} -> map_${mapId}","color":"dark_gray"}`,
      );
      if (usesLegacyMapItemNbt(minecraftVersion)) {
        lines.push(
          `execute anchored eyes positioned ^${left} ^${up} ^${forwardOffset} as @e[type=minecraft:item_frame,distance=..${frameSearchRadius},sort=nearest,limit=1] run data merge entity @s {Item:${itemNbt}}`,
        );
        continue;
      }
      lines.push(`tag @e[type=minecraft:item_frame,tag=${TARGET_FRAME_TAG}] remove ${TARGET_FRAME_TAG}`);
      lines.push(
        `execute anchored eyes positioned ^${left} ^${up} ^${forwardOffset} as @e[type=minecraft:item_frame,distance=..${frameSearchRadius},sort=nearest,limit=1] run tag @s add ${TARGET_FRAME_TAG}`,
      );
      for (const facing of ITEM_FRAME_FACINGS) {
        lines.push(
          `execute as @e[type=minecraft:item_frame,tag=${TARGET_FRAME_TAG},limit=1] at @s if data entity @s {Facing:${facing}b} run summon minecraft:item_frame ~ ~ ~ {Facing:${facing}b,Item:${itemNbt}}`,
        );
      }
      lines.push(
        `kill @e[type=minecraft:item_frame,tag=${TARGET_FRAME_TAG}]`,
      );
    }
  }

  lines.push(`tag @e[type=minecraft:item_frame,tag=${TARGET_FRAME_TAG}] remove ${TARGET_FRAME_TAG}`);
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
