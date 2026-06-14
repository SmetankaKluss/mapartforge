import type { MapGrid } from './types';

export interface FrameCommandOptions {
  mapGrid: MapGrid;
  startMapId: number;
  forwardOffset?: number;
}

const DEFAULT_FORWARD_OFFSET = 1;

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
  forwardOffset = DEFAULT_FORWARD_OFFSET,
}: FrameCommandOptions): string {
  const firstId = clampStartMapId(startMapId);
  const lastId = firstId + mapGrid.wide * mapGrid.tall - 1;
  const lines: string[] = [
    '# MapKluss item frame fill commands',
    '# Minecraft Java 1.20.5+',
    `# Maps: map_${firstId}.dat ... map_${lastId}.dat`,
    `# Grid: ${mapGrid.wide}x${mapGrid.tall}`,
    '#',
    '# How to use:',
    '# 1. Put the exported map_*.dat files into your world/data folder.',
    '# 2. Place item frames in the same grid size.',
    '# 3. Stand one block in front of the BOTTOM-LEFT frame and look at it.',
    '# 4. Run these commands from that position. In a command block, use the same facing direction.',
    '#',
  ];

  for (let rowFromBottom = 0; rowFromBottom < mapGrid.tall; rowFromBottom++) {
    for (let col = 0; col < mapGrid.wide; col++) {
      const mapId = mapIdForBottomLeftFrame(mapGrid, firstId, col, rowFromBottom);
      const left = -col;
      const up = rowFromBottom;
      lines.push(
        `execute positioned ^${left} ^${up} ^${forwardOffset} as @e[type=minecraft:item_frame,distance=..0.75,sort=nearest,limit=1] run item replace entity @s contents with minecraft:filled_map[minecraft:map_id=${mapId}] 1`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
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
