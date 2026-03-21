import { useMemo, useState } from 'react';
import type { ComputedPalette } from '../lib/dithering';
import type { BlockSelection } from '../lib/paletteBlocks';
import { COLOUR_ROWS } from '../lib/paletteBlocks';
import { BlockIcon } from './BlockIcon';

interface Props {
  imageData: ImageData | null;
  cp: ComputedPalette;
  blockSelection: BlockSelection;
}

interface MaterialEntry {
  csId: number;
  blockId: number;
  nbtName: string;
  displayName: string;
  count: number;
}

function computeMaterials(
  imageData: ImageData,
  cp: ComputedPalette,
  sel: BlockSelection,
): MaterialEntry[] {
  // color rgb key → baseId
  const colorToBase = new Map<number, number>();
  for (const c of cp.colors) {
    const key = (c.r << 16) | (c.g << 8) | c.b;
    if (!colorToBase.has(key)) colorToBase.set(key, c.baseId);
  }

  // baseId → block info (preferred selected block)
  const baseToBlock = new Map<number, { csId: number; blockId: number; nbtName: string; displayName: string }>();
  for (const row of COLOUR_ROWS) {
    const activeIds = sel[row.csId] ?? [];
    const block = row.blocks.find(b => activeIds.includes(b.blockId)) ?? row.blocks[0];
    if (block) {
      baseToBlock.set(row.baseId, { csId: row.csId, blockId: block.blockId, nbtName: block.nbtName, displayName: block.displayName });
    }
  }

  const counts  = new Map<string, number>();
  const entries = new Map<string, { csId: number; blockId: number; nbtName: string; displayName: string }>();
  const { data, width, height } = imageData;

  for (let i = 0, n = width * height; i < n; i++) {
    const rgbKey = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
    const baseId = colorToBase.get(rgbKey);
    if (baseId === undefined) continue;
    const info = baseToBlock.get(baseId);
    if (!info) continue;
    const k = `${info.csId}_${info.blockId}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (!entries.has(k)) entries.set(k, info);
  }

  return [...counts.entries()]
    .map(([k, count]) => ({ ...entries.get(k)!, count }))
    .sort((a, b) => b.count - a.count);
}

function fmtN(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtStacks(n: number): string {
  const stacks = Math.floor(n / 64);
  const rem    = n % 64;
  if (stacks === 0) return `${rem}`;
  if (rem === 0)    return `${stacks}× 64`;
  return `${stacks}× 64 + ${rem}`;
}

function fmtShulkers(n: number): string {
  const shulkers = Math.floor(n / 1728);
  const rem1     = n - shulkers * 1728;
  const stacks   = Math.floor(rem1 / 64);
  const rem2     = rem1 % 64;
  const parts: string[] = [];
  if (shulkers > 0) parts.push(`${shulkers} shulker${shulkers > 1 ? 's' : ''}`);
  if (stacks   > 0) parts.push(`${stacks}× 64`);
  if (rem2     > 0) parts.push(`${rem2}`);
  return parts.length ? parts.join(' + ') : '0';
}

function buildCopyText(entries: MaterialEntry[], total: number): string {
  const COL = [30, 9, 22, 24];
  const pad = (s: string, w: number) => s.slice(0, w).padEnd(w);
  const header = pad('Block', COL[0]) + pad('Total', COL[1]) + pad('Stacks', COL[2]) + 'Shulkers';
  const divider = '─'.repeat(COL[0] + COL[1] + COL[2] + 26);
  const lines = [
    'Materials List – MapartForge',
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
    pad('Total', COL[0]) + pad(fmtN(total), COL[1]) + pad(fmtStacks(total), COL[2]) + fmtShulkers(total),
  ];
  return lines.join('\n');
}

export function MaterialsList({ imageData, cp, blockSelection }: Props) {
  const [copied, setCopied] = useState(false);

  const materials = useMemo(() => {
    if (!imageData) return [];
    return computeMaterials(imageData, cp, blockSelection);
  }, [imageData, cp, blockSelection]);

  if (!imageData || materials.length === 0) return null;

  const total = materials.reduce((s, e) => s + e.count, 0);

  function handleCopy() {
    navigator.clipboard.writeText(buildCopyText(materials, total)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="sidebar-section">
      <div className="mat-header">
        <h3 className="section-title" style={{ margin: 0 }}>Materials</h3>
        <button className="mat-copy-btn" onClick={handleCopy}>
          {copied ? '✓ Copied!' : 'Copy list'}
        </button>
      </div>
      <div className="mat-table-wrap">
        <table className="mat-table">
          <thead>
            <tr>
              <th className="mat-th mat-col-block">Block</th>
              <th className="mat-th mat-col-num">Total</th>
              <th className="mat-th mat-col-stacks">Stacks</th>
              <th className="mat-th mat-col-shulkers">Shulkers</th>
            </tr>
          </thead>
          <tbody>
            {materials.map(e => {
              const row = COLOUR_ROWS[e.csId];
              return (
              <tr key={`${e.csId}_${e.blockId}`} className="mat-row">
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
                <td className="mat-col-num">{fmtN(e.count)}</td>
                <td className="mat-col-stacks">{fmtStacks(e.count)}</td>
                <td className="mat-col-shulkers">{fmtShulkers(e.count)}</td>
              </tr>
            );
            })}
          </tbody>
          <tfoot>
            <tr className="mat-total-row">
              <td className="mat-col-block mat-total-label">Total</td>
              <td className="mat-col-num">{fmtN(total)}</td>
              <td className="mat-col-stacks">{fmtStacks(total)}</td>
              <td className="mat-col-shulkers">{fmtShulkers(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
