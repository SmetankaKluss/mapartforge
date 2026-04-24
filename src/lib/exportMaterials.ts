import type { ComputedPalette } from './dithering';
import type { BlockSelection } from './paletteBlocks';
import { getPreferredBlockNbt, COLOUR_ROWS } from './paletteBlocks';

export interface MaterialCount {
  nbtName: string;
  displayName: string;
  count: number;
  stacks: number;
  shulkerBoxes: number;
}

function getBlockDisplayName(nbtName: string, blockSelection: BlockSelection): string {
  for (const row of COLOUR_ROWS) {
    const block = row.blocks.find(b => b.nbtName === nbtName);
    if (block) return block.displayName;
  }
  return nbtName;
}

export function countMaterials(
  imageData: ImageData,
  cp: ComputedPalette,
  blockSelection: BlockSelection,
): MaterialCount[] {
  const counts = new Map<string, number>();

  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    const a = imageData.data[i + 3];

    if (a < 128) continue; // transparency = air

    const rgb = (r << 16) | (g << 8) | b;
    const paletteIdx = cp.exactLookup.get(rgb);
    if (paletteIdx === undefined) continue;

    const color = cp.colors[paletteIdx];
    const nbtName = getPreferredBlockNbt(color.baseId, blockSelection);
    counts.set(nbtName, (counts.get(nbtName) ?? 0) + 1);
  }

  const result: MaterialCount[] = Array.from(counts, ([nbtName, count]) => ({
    nbtName,
    displayName: getBlockDisplayName(nbtName, blockSelection),
    count,
    stacks: Math.ceil(count / 64),
    shulkerBoxes: Math.ceil(count / 1728),
  }));

  result.sort((a, b) => b.count - a.count);
  return result;
}

export function formatMaterialsAsText(materials: MaterialCount[], mapSize: { wide: number; tall: number }): string {
  let text = 'MATERIALS LIST\n';
  text += `Map size: ${mapSize.wide}×${mapSize.tall} (${mapSize.wide * mapSize.tall} map${mapSize.wide * mapSize.tall > 1 ? 's' : ''})\n\n`;

  let totalCount = 0;
  for (const m of materials) {
    text += `${m.displayName}\n`;
    text += `  Count: ${m.count}\n`;
    text += `  Stacks: ${m.stacks} (64 per stack)\n`;
    text += `  Shulker boxes: ${m.shulkerBoxes} (1728 per box)\n\n`;
    totalCount += m.count;
  }
  text += `TOTAL: ${totalCount} blocks\n`;
  return text;
}

export function formatMaterialsAsCSV(materials: MaterialCount[], mapSize: { wide: number; tall: number }): string {
  let csv = `Block Name,Count,Stacks (64),Shulker Boxes (1728)\n`;
  for (const m of materials) {
    csv += `"${m.displayName}",${m.count},${m.stacks},${m.shulkerBoxes}\n`;
  }
  csv += `\nMap size,${mapSize.wide}x${mapSize.tall}\nTotal blocks,${materials.reduce((sum, m) => sum + m.count, 0)}\n`;
  return csv;
}

export function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
