import { useMemo, useState } from 'react';
import type { ComputedPalette } from '../lib/dithering';
import type { BlockSelection } from '../lib/paletteBlocks';
import type { MapGrid } from '../lib/types';
import { MAP_BLOCK_SIZE } from '../lib/types';
import { COLOUR_ROWS } from '../lib/paletteBlocks';
import { BlockIcon } from './BlockIcon';

interface Props {
  imageData: ImageData | null;
  cp: ComputedPalette;
  blockSelection: BlockSelection;
  mapGrid: MapGrid;
}

interface MaterialEntry {
  csId: number;
  blockId: number;
  nbtName: string;
  displayName: string;
  count: number;
}

interface RawEntry {
  csId: number;
  blockId: number;
  nbtName: string;
  displayName: string;
  total: number;
  /** count[s] = number of this block in map-section s */
  perSection: number[];
}

function computeRawMaterials(
  imageData: ImageData,
  cp: ComputedPalette,
  sel: BlockSelection,
  mapGrid: MapGrid,
): RawEntry[] {
  // color rgb key → baseId
  const colorToBase = new Map<number, number>();
  for (const c of cp.colors) {
    const key = (c.r << 16) | (c.g << 8) | c.b;
    if (!colorToBase.has(key)) colorToBase.set(key, c.baseId);
  }

  // baseId → selected block info
  const baseToBlock = new Map<number, { csId: number; blockId: number; nbtName: string; displayName: string }>();
  for (const row of COLOUR_ROWS) {
    const activeIds = sel[row.csId] ?? [];
    const block = row.blocks.find(b => activeIds.includes(b.blockId)) ?? row.blocks[0];
    if (block) {
      baseToBlock.set(row.baseId, {
        csId: row.csId, blockId: block.blockId,
        nbtName: block.nbtName, displayName: block.displayName,
      });
    }
  }

  const numSections = mapGrid.wide * mapGrid.tall;
  // key → [total, sec0, sec1, ..., secN-1]
  const counts = new Map<string, number[]>();
  const infos  = new Map<string, { csId: number; blockId: number; nbtName: string; displayName: string }>();
  const { data, width, height } = imageData;

  for (let y = 0; y < height; y++) {
    const secY = Math.min(Math.floor(y / MAP_BLOCK_SIZE), mapGrid.tall - 1);
    for (let x = 0; x < width; x++) {
      const base = (y * width + x) * 4;
      const rgbKey = (data[base] << 16) | (data[base + 1] << 8) | data[base + 2];
      const baseId = colorToBase.get(rgbKey);
      if (baseId === undefined) continue;
      const info = baseToBlock.get(baseId);
      if (!info) continue;

      const k = `${info.csId}_${info.blockId}`;
      if (!counts.has(k)) {
        counts.set(k, new Array(1 + numSections).fill(0));
        infos.set(k, info);
      }
      const arr = counts.get(k)!;
      arr[0]++; // total
      const secX = Math.min(Math.floor(x / MAP_BLOCK_SIZE), mapGrid.wide - 1);
      arr[1 + secY * mapGrid.wide + secX]++;
    }
  }

  return [...counts.entries()]
    .map(([k, arr]) => ({
      ...infos.get(k)!,
      total: arr[0],
      perSection: arr.slice(1),
    }))
    .filter(e => e.total > 0)
    .sort((a, b) => b.total - a.total);
}

function fmtN(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtStacks(n: number): string {
  const stacks = Math.floor(n / 64);
  const rem    = n % 64;
  if (stacks === 0) return `${rem}`;
  if (rem === 0)    return `${stacks}×64`;
  return `${stacks}×64+${rem}`;
}

function fmtShulkers(n: number): string {
  const shulkers = Math.floor(n / 1728);
  const rem1     = n - shulkers * 1728;
  const stacks   = Math.floor(rem1 / 64);
  const rem2     = rem1 % 64;
  const parts: string[] = [];
  if (shulkers > 0) parts.push(`${shulkers}sh`);
  if (stacks   > 0) parts.push(`${stacks}×64`);
  if (rem2     > 0) parts.push(`${rem2}`);
  return parts.length ? parts.join('+') : '0';
}

function buildCopyText(entries: MaterialEntry[], total: number, maxPerMap: boolean, mapGrid: MapGrid): string {
  const mode   = maxPerMap ? `max per map section (${mapGrid.wide}×${mapGrid.tall} grid)` : 'total';
  const colHdr = maxPerMap ? 'MAX/MAP' : 'TOTAL';
  const COL    = [30, 9, 22, 24];
  const pad    = (s: string, w: number) => s.slice(0, w).padEnd(w);
  const header  = pad('Block', COL[0]) + pad(colHdr, COL[1]) + pad('Stacks', COL[2]) + 'Shulkers';
  const divider = '─'.repeat(COL[0] + COL[1] + COL[2] + 26);
  const lines = [
    `Materials List – KlussForge (${mode})`,
    '═'.repeat(divider.length),
    header,
    divider,
    ...entries.map(e =>
      pad(e.displayName, COL[0]) +
      pad(fmtN(e.count), COL[1]) +
      pad(fmtStacks(e.count), COL[2]) +
      fmtShulkers(e.count),
    ),
    divider,
    pad(maxPerMap ? 'SUM OF MAX' : 'TOTAL', COL[0]) +
      pad(fmtN(total), COL[1]) +
      pad(fmtStacks(total), COL[2]) +
      fmtShulkers(total),
  ];
  return lines.join('\n');
}

export function MaterialsList({ imageData, cp, blockSelection, mapGrid }: Props) {
  const [copied,     setCopied]     = useState(false);
  const [maxPerMap,  setMaxPerMap]  = useState(false);

  // Heavy computation: raw data with per-section counts
  const rawData = useMemo(() => {
    if (!imageData) return null;
    return computeRawMaterials(imageData, cp, blockSelection, mapGrid);
  }, [imageData, cp, blockSelection, mapGrid]);

  // Cheap derivation: pick total or max-per-section based on toggle
  const materials = useMemo<MaterialEntry[]>(() => {
    if (!rawData) return [];
    return rawData
      .map(e => ({
        csId: e.csId, blockId: e.blockId,
        nbtName: e.nbtName, displayName: e.displayName,
        count: maxPerMap ? Math.max(...e.perSection) : e.total,
      }))
      .filter(e => e.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [rawData, maxPerMap]);

  if (!imageData || !rawData || materials.length === 0) return null;

  const total = materials.reduce((s, e) => s + e.count, 0);
  const numMaps = mapGrid.wide * mapGrid.tall;

  function handleCopy() {
    navigator.clipboard.writeText(buildCopyText(materials, total, maxPerMap, mapGrid)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="sidebar-section">
      <div className="mat-header">
        <h3 className="section-title" style={{ margin: 0 }}>Materials</h3>
        <label
          className="mat-mode-toggle"
          title={`Show the highest single-map demand for each block across all ${numMaps} map section${numMaps !== 1 ? 's' : ''} — useful for knowing how much to carry per trip`}
        >
          <input
            type="checkbox"
            checked={maxPerMap}
            onChange={e => setMaxPerMap(e.target.checked)}
          />
          <span>Max / map</span>
        </label>
      </div>
      {maxPerMap && (
        <p className="mat-mode-hint">
          Per block: highest count found in any single 128×128 map section ({mapGrid.wide}×{mapGrid.tall} grid).
        </p>
      )}
      <div className="mat-table-wrap">
        <table className="mat-table">
          <thead>
            <tr>
              <th className="mat-th mat-col-block">BLOCK</th>
              <th className="mat-th mat-col-num">{maxPerMap ? 'MAX/MAP' : 'TOTAL'}</th>
              <th className="mat-th mat-col-stacks">STACKS</th>
              <th className="mat-th mat-col-shulkers">SHULKERS</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((e, i) => {
              const row = COLOUR_ROWS[e.csId];
              return (
                <tr key={`${e.csId}_${e.blockId}`} className={`mat-row${i % 2 === 0 ? ' mat-row-even' : ' mat-row-odd'}`}>
                  <td className="mat-col-block">
                    <div className="mat-block-cell">
                      <span className="mat-icon-wrap">
                        <BlockIcon
                          nbtName={e.nbtName}
                          blockId={e.blockId}
                          csId={e.csId}
                          r={row?.r ?? 128} g={row?.g ?? 128} b={row?.b ?? 128}
                          className="mat-icon"
                        />
                      </span>
                      <span className="mat-name">{e.displayName}</span>
                    </div>
                  </td>
                  <td className="mat-col-num mat-num-cell">{fmtN(e.count)}</td>
                  <td className="mat-col-stacks mat-num-cell">{fmtStacks(e.count)}</td>
                  <td className="mat-col-shulkers mat-num-cell">{fmtShulkers(e.count)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="mat-total-row">
              <td className="mat-col-block">
                <span className="mat-total-label">{maxPerMap ? 'SUM OF MAX' : 'TOTAL'}</span>
              </td>
              <td className="mat-col-num mat-num-cell mat-total-num">{fmtN(total)}</td>
              <td className="mat-col-stacks mat-num-cell mat-total-num">{fmtStacks(total)}</td>
              <td className="mat-col-shulkers mat-num-cell mat-total-num">{fmtShulkers(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mat-copy-row">
        <button className="mat-copy-btn" onClick={handleCopy}>
          {copied ? '✓ COPIED!' : '⎘ COPY LIST'}
        </button>
      </div>
    </section>
  );
}
