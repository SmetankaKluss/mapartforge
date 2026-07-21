import { useMemo, useState } from 'react';
import type { ComputedPalette } from '../lib/dithering';
import type { BlockSelection } from '../lib/paletteBlocks';
import { COLOUR_ROWS } from '../lib/paletteBlocks';
import type { MapGrid } from '../lib/types';
import { BlockIcon } from './BlockIcon';
import { useLocale } from '../lib/useLocale';
import { countSupportBlocks } from '../lib/exportLitematic';
import type { SupportMode } from '../lib/exportLitematic';
import { downloadFile } from '../lib/exportMaterials';
import { trackEvent } from '../lib/analytics';
import { computeRawMaterials } from '../lib/sessionMaterials';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';

interface Props {
  imageData: ImageData | null;
  cp: ComputedPalette;
  blockSelection: BlockSelection;
  mapGrid: MapGrid;
  mapMode?: '2d' | '3d';
  staircaseMode?: 'classic' | 'optimized';
  supportBlock?: string;
  supportMode?: SupportMode;
}

interface MaterialEntry {
  csId: number;
  blockId: number;
  nbtName: string;
  displayName: string;
  count: number;
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
    `Materials List – MapKluss (${mode})`,
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

export function MaterialsList({ imageData, cp, blockSelection, mapGrid, mapMode, staircaseMode, supportBlock, supportMode }: Props) {
  const { t } = useLocale();
  const [copied,     setCopied]     = useState(false);
  const [maxPerMap,  setMaxPerMap]  = useState(false);

  // Heavy computation: raw data with per-section counts
  const rawData = useMemo(() => {
    if (!imageData) return null;
    return computeRawMaterials(imageData, cp, blockSelection, mapGrid);
  }, [imageData, cp, blockSelection, mapGrid]);

  // Support block count (only in 3D staircase mode with a support block selected)
  const supportCount = useMemo(() => {
    if (!imageData || mapMode !== '3d' || !supportBlock || supportBlock === 'air' || !supportMode) return 0;
    return countSupportBlocks(imageData, cp, blockSelection, staircaseMode ?? 'optimized', supportMode);
  }, [imageData, cp, blockSelection, mapMode, staircaseMode, supportBlock, supportMode]);

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
    trackEvent('materials_copied', { max_per_map: maxPerMap, map_wide: mapGrid.wide, map_tall: mapGrid.tall });
    navigator.clipboard.writeText(buildCopyText(materials, total, maxPerMap, mapGrid)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const mode = maxPerMap ? `max_per_map` : 'total';
    trackEvent('materials_downloaded', {
      mode,
      map_wide: mapGrid.wide,
      map_tall: mapGrid.tall,
      map_mode: mapMode,
      staircase_mode: mapMode === '3d' ? staircaseMode : undefined,
      has_supports: Boolean(mapMode === '3d' && supportBlock && supportBlock !== 'air' && supportMode),
      support_mode: mapMode === '3d' ? supportMode : undefined,
    });
    const text = buildCopyText(materials, total, maxPerMap, mapGrid);
    const csv = [
      `Block Name,${maxPerMap ? 'MAX/MAP' : 'Total'},Stacks,Shulkers`,
      ...materials.map(e => `"${e.displayName}",${e.count},${fmtStacks(e.count)},${fmtShulkers(e.count)}`),
      ``,
      `${maxPerMap ? 'SUM OF MAX' : 'TOTAL'},${total},${fmtStacks(total)},${fmtShulkers(total)}`,
      `Map size,${mapGrid.wide}x${mapGrid.tall}`,
    ].join('\n');
    downloadFile(`materials_${mode}.txt`, text, 'text/plain');
    downloadFile(`materials_${mode}.csv`, csv, 'text/csv');
  }

  return (
    <section className="sidebar-section">
      <div className="mat-header" data-tour="materials">
        <h2 className="section-title" style={{ margin: 0 }}>{t('Материалы', 'Materials')}</h2>
        <label
          className="mat-mode-toggle"
          title={t(`Показать максимальное количество каждого блока в любой из ${numMaps} секций — удобно для расчёта что взять с собой`, `Show max count of each block in any of ${numMaps} sections — useful for planning what to bring`)}
        >
          <input
            type="checkbox"
            checked={maxPerMap}
            onChange={e => {
              trackEvent('materials_mode_changed', { max_per_map: e.target.checked, map_wide: mapGrid.wide, map_tall: mapGrid.tall });
              setMaxPerMap(e.target.checked);
            }}
          />
          <span>{t('Макс / карта', 'Max / map')}</span>
        </label>
      </div>
      {maxPerMap && (
        <p className="mat-mode-hint">
          {t(`На блок: максимум в любой секции 128×128 (сетка ${mapGrid.wide}×${mapGrid.tall}).`, `Per block: maximum in any 128×128 section (grid ${mapGrid.wide}×${mapGrid.tall}).`)}
        </p>
      )}
      <div className="mat-table-wrap">
        <table className="mat-table">
          <thead>
            <tr>
              <th className="mat-th mat-col-block">{t('БЛОК', 'BLOCK')}</th>
              <th className="mat-th mat-col-num">{maxPerMap ? t('МАКС/К', 'MAX/MAP') : t('ВСЕГО', 'TOTAL')}</th>
              <th className="mat-th mat-col-stacks">{t('СТАКИ', 'STACKS')}</th>
              <th className="mat-th mat-col-shulkers">{t('ШАЛКЕРЫ', 'SHULKERS')}</th>
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
          {supportCount > 0 && (
            <tbody>
              <tr className="mat-row mat-row-support">
                <td className="mat-col-block">
                  <div className="mat-block-cell">
                    <span className="mat-name" style={{ color: 'var(--color-success)', fontStyle: 'italic' }}>
                      {t('Опорные блоки', 'Support blocks')} ({supportBlock})
                    </span>
                  </div>
                </td>
                <td className="mat-col-num mat-num-cell">{fmtN(supportCount)}</td>
                <td className="mat-col-stacks mat-num-cell">{fmtStacks(supportCount)}</td>
                <td className="mat-col-shulkers mat-num-cell">{fmtShulkers(supportCount)}</td>
              </tr>
            </tbody>
          )}
          <tfoot>
            <tr className="mat-total-row">
              <td className="mat-col-block">
                <span className="mat-total-label">{maxPerMap ? t('СУММА МАКС', 'SUM OF MAX') : t('ИТОГО', 'TOTAL')}</span>
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
          <IconGlyph icon={copied ? mkIcons.check : mkIcons.copy} /> {copied ? t('СКОПИРОВАНО!', 'COPIED!') : t('КОПИРОВАТЬ', 'COPY')}
        </button>
        <button className="mat-copy-btn" onClick={handleDownload} title={t('Скачать как .txt и .csv с учётом режима Макс/карта', 'Download as .txt and .csv respecting Max/map mode')}>
          <IconGlyph icon={mkIcons.export} /> {t('СКАЧАТЬ', 'DOWNLOAD')}
        </button>
      </div>
    </section>
  );
}
