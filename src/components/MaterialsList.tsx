import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { isBlockAvailable, type MinecraftVersion } from '../lib/versionPresets';
import { isBlockAvailableOnPlatform, type PlatformMode } from '../lib/platformMode';

interface Props {
  imageData: ImageData | null;
  cp: ComputedPalette;
  blockSelection: BlockSelection;
  mapGrid: MapGrid;
  mapMode?: '2d' | '3d';
  staircaseMode?: 'classic' | 'optimized';
  supportBlock?: string;
  supportMode?: SupportMode;
  compact?: boolean;
  onFocusPalette?: (csId: number, blockId: number) => void;
  onExcludeFromPalette?: (csId: number) => void;
  onReplaceInPalette?: (previousCsId: number, previousBlockId: number, nextCsId: number, nextBlockId: number) => void;
  minecraftVersion?: MinecraftVersion;
  platformMode?: PlatformMode;
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

export function MaterialsList({
  imageData,
  cp,
  blockSelection,
  mapGrid,
  mapMode,
  staircaseMode,
  supportBlock,
  supportMode,
  compact = false,
  onFocusPalette,
  onExcludeFromPalette,
  onReplaceInPalette,
  minecraftVersion,
  platformMode = 'java',
}: Props) {
  const { t } = useLocale();
  const [copied,     setCopied]     = useState(false);
  // The compact workbench answers "what do I need for one map section?".
  // The full export-oriented materials view keeps its total-art default.
  const [maxPerMap,  setMaxPerMap]  = useState(compact);
  const [replacementTarget, setReplacementTarget] = useState<MaterialEntry | null>(null);
  const [replacementSearch, setReplacementSearch] = useState('');

  useEffect(() => {
    if (!replacementTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReplacementTarget(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [replacementTarget]);

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
  // Keep the normal material order here: it already reflects the actual build
  // workload, and the horizontal strip remains useful for both large and tiny arts.
  const workbenchMaterials = materials;
  const replacementChoices = COLOUR_ROWS.flatMap(row => row.blocks
    .filter(block =>
      (!minecraftVersion || isBlockAvailable(block.nbtName, minecraftVersion))
      && isBlockAvailableOnPlatform(block.nbtName, platformMode),
    )
    .map(block => ({ row, block })),
  ).filter(({ row, block }) => {
    const query = replacementSearch.trim().toLowerCase();
    return !query || row.colourName.toLowerCase().includes(query)
      || block.displayName.toLowerCase().includes(query)
      || block.nbtName.toLowerCase().includes(query);
  });

  function openReplacement(entry: MaterialEntry) {
    if (!onReplaceInPalette) return;
    trackEvent('material_replacement_opened', { color_group: entry.csId, block_id: entry.blockId });
    setReplacementSearch('');
    setReplacementTarget(entry);
  }

  const replacementPopup = replacementTarget && typeof document !== 'undefined'
    ? createPortal(
      <div className="material-replace-backdrop" onMouseDown={() => setReplacementTarget(null)}>
        <section
          className="material-replace-popup"
          role="dialog"
          aria-modal="true"
          aria-label={t(`Заменить цвет ${replacementTarget.displayName}`, `Replace ${replacementTarget.displayName}'s colour`)}
          onMouseDown={event => event.stopPropagation()}
        >
          <header className="material-replace-header">
            <span>{t('Заменить цвет', 'Replace colour')}</span>
            <button type="button" onClick={() => setReplacementTarget(null)} aria-label={t('Закрыть', 'Close')}><IconGlyph icon={mkIcons.close} /></button>
          </header>
          <div className="material-replace-search-wrap">
            <input
              className="material-replace-search"
              value={replacementSearch}
              onChange={event => setReplacementSearch(event.target.value)}
              placeholder={t('Найти цвет или блок…', 'Find a colour or block…')}
              aria-label={t('Найти цвет или блок', 'Find a colour or block')}
              autoFocus
            />
          </div>
          <div className="material-replace-grid" role="listbox" aria-label={t('Блоки для замены', 'Replacement blocks')}>
            {replacementChoices.map(({ row, block }) => (
              <button
                type="button"
                key={`${row.csId}_${block.blockId}`}
                className={`material-replace-choice${row.csId === replacementTarget.csId && block.blockId === replacementTarget.blockId ? ' active' : ''}`}
                onClick={() => {
                  if (row.csId !== replacementTarget.csId || block.blockId !== replacementTarget.blockId) {
                    onReplaceInPalette?.(replacementTarget.csId, replacementTarget.blockId, row.csId, block.blockId);
                  }
                  setReplacementTarget(null);
                }}
                role="option"
                aria-selected={row.csId === replacementTarget.csId && block.blockId === replacementTarget.blockId}
                title={`${row.colourName}: ${block.displayName}`}
              >
                <span className="material-replace-colour" style={{ background: `rgb(${row.r}, ${row.g}, ${row.b})` }} />
                <BlockIcon
                  nbtName={block.nbtName}
                  blockId={block.blockId}
                  csId={row.csId}
                  r={row.r} g={row.g} b={row.b}
                  className="material-replace-icon"
                />
                <span><b>{block.displayName}</b><small>{row.colourName}</small></span>
              </button>
            ))}
          </div>
        </section>
      </div>,
      document.body,
    )
    : null;

  if (compact) {
    return (
      <section className="workbench-materials" aria-label={t('Материалы в работе', 'Active materials')}>
        <div className="workbench-material-grid">
          {workbenchMaterials.map(entry => {
            const row = COLOUR_ROWS[entry.csId];
            return (
              <div className="workbench-material" key={`${entry.csId}_${entry.blockId}`}>
                <button
                  type="button"
                  className="workbench-material-main"
                  onClick={() => onFocusPalette?.(entry.csId, entry.blockId)}
                  title={t(`Найти ${entry.displayName} в палитре`, `Find ${entry.displayName} in the palette`)}
                  disabled={!onFocusPalette}
                >
                  <span className="mat-icon-wrap">
                    <BlockIcon
                      nbtName={entry.nbtName}
                      blockId={entry.blockId}
                      csId={entry.csId}
                      r={row?.r ?? 128} g={row?.g ?? 128} b={row?.b ?? 128}
                      className="mat-icon"
                    />
                  </span>
                  <span className="workbench-material-copy">
                    <strong>{entry.displayName}</strong>
                    <small>{fmtStacks(entry.count)}</small>
                  </span>
                </button>
                {(onExcludeFromPalette || onReplaceInPalette) && (
                  <span className="workbench-material-actions">
                    {onExcludeFromPalette && (
                      <button
                        type="button"
                        className="workbench-material-exclude"
                        onClick={() => onExcludeFromPalette(entry.csId)}
                        title={t(`Исключить ${entry.displayName} и этот цвет из палитры`, `Exclude ${entry.displayName} and its colour from the palette`)}
                        aria-label={t(`Исключить ${entry.displayName}`, `Exclude ${entry.displayName}`)}
                      ><IconGlyph icon={mkIcons.close} /></button>
                    )}
                    {onReplaceInPalette && (
                      <button
                        type="button"
                        className="workbench-material-replace"
                        onClick={() => openReplacement(entry)}
                        title={t(`Заменить ${entry.displayName}`, `Replace ${entry.displayName}`)}
                        aria-label={t(`Заменить ${entry.displayName}`, `Replace ${entry.displayName}`)}
                      ><IconGlyph icon={mkIcons.invert} /></button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {replacementPopup}
      </section>
    );
  }

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
                       {(onFocusPalette || onExcludeFromPalette || onReplaceInPalette) && (
                         <span className="mat-block-actions">
                           {onFocusPalette && (
                             <button
                               type="button"
                               onClick={() => onFocusPalette(e.csId, e.blockId)}
                               title={t(`Найти ${e.displayName} в палитре`, `Find ${e.displayName} in the palette`)}
                               aria-label={t(`Найти ${e.displayName} в палитре`, `Find ${e.displayName} in the palette`)}
                             ><IconGlyph icon={mkIcons.link} /></button>
                           )}
                           {onExcludeFromPalette && (
                             <button
                               type="button"
                               className="mat-block-exclude"
                               onClick={() => onExcludeFromPalette(e.csId)}
                               title={t(`Исключить цвет ${e.displayName} из палитры`, `Exclude ${e.displayName}'s colour from the palette`)}
                               aria-label={t(`Исключить ${e.displayName}`, `Exclude ${e.displayName}`)}
                             ><IconGlyph icon={mkIcons.close} /></button>
                           )}
                           {onReplaceInPalette && (
                             <button
                               type="button"
                               className="mat-block-replace"
                               onClick={() => openReplacement(e)}
                               title={t(`Заменить ${e.displayName}`, `Replace ${e.displayName}`)}
                               aria-label={t(`Заменить ${e.displayName}`, `Replace ${e.displayName}`)}
                             ><IconGlyph icon={mkIcons.invert} /></button>
                           )}
                         </span>
                       )}
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
      {replacementPopup}
    </section>
  );
}
