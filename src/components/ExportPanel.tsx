import { useState } from 'react';
import type { ComputedPalette } from '../lib/dithering';
import type { DitheringMode } from '../lib/dithering';
import type { MapGrid } from '../lib/types';
import type { BlockSelection } from '../lib/paletteBlocks';
import type { ImageAdjustments } from '../lib/adjustments';
import { downloadPng } from '../lib/exportPng';
import { exportMapDat } from '../lib/exportMapDat';
import { exportLitematic, exportLitematicZip } from '../lib/exportLitematic';
import type { SupportMode } from '../lib/exportLitematic';
import { uploadPermalink } from '../lib/share';
import { LinkModal } from './LinkModal';

interface Props {
  imageData:   ImageData | null;
  compareData: { left: ImageData; right: ImageData } | null;
  compareMode: boolean;
  dithering:   DitheringMode;
  compareLeft:  DitheringMode;
  compareRight: DitheringMode;
  mapGrid:     MapGrid;
  mapMode:     '2d' | '3d';
  staircaseMode: 'classic' | 'optimized';
  activePalette:  ComputedPalette;
  blockSelection: BlockSelection;
  disabled:    boolean;
  supportBlock: string;
  supportMode:  SupportMode;
  // Link export
  sourceImage: HTMLImageElement | null;
  intensity:   number;
  adjustments: ImageAdjustments;
  bnScale:     number;
}


const DITHERING_LABELS: Record<DitheringMode, string> = {
  'none':            'none',
  'floyd-steinberg': 'floyd-steinberg',
  'stucki':          'stucki',
  'jjn':             'jjn',
  'atkinson':        'atkinson',
  'blue-noise':      'blue-noise',
  'yliluoma2':       'yliluoma2',
  'kluss':           'kluss',
};

function makePngFilename(grid: MapGrid, dithering: DitheringMode): string {
  return `mapartforge_${grid.wide}x${grid.tall}_${DITHERING_LABELS[dithering]}.png`;
}

export function ExportPanel({
  imageData, compareData, compareMode,
  dithering, compareLeft, compareRight,
  mapGrid, mapMode, staircaseMode, activePalette, blockSelection, disabled,
  supportBlock, supportMode,
  sourceImage, intensity, adjustments, bnScale,
}: Props) {
  const [busyPng]                         = useState(false);
  const [busyMapdat,   setBusyMapdat]     = useState(false);
  const [busyLiteFlat, setBusyLiteFlat]   = useState(false);
  const [busyZip,      setBusyZip]        = useState(false);
  const [linkState,      setLinkState]      = useState<'idle' | 'uploading' | 'error'>('idle');
  const [linkUrl,        setLinkUrl]        = useState<string | null>(null);

  const hasImage   = imageData !== null;
  const hasCmp     = compareData !== null;
  const hasContent = compareMode ? hasCmp : hasImage;
  const mapCount   = mapGrid.wide * mapGrid.tall;

  const exportData = compareMode ? null : imageData;

  function handlePng() {
    if (compareMode && hasCmp) {
      downloadPng(compareData!.left,  makePngFilename(mapGrid, compareLeft)  .replace('.png', '_left.png'));
      downloadPng(compareData!.right, makePngFilename(mapGrid, compareRight) .replace('.png', '_right.png'));
    } else if (exportData) {
      downloadPng(exportData, makePngFilename(mapGrid, dithering));
    }
  }

  async function handleMapDat() {
    const src = compareMode ? compareData?.left ?? null : imageData;
    if (!src) return;
    setBusyMapdat(true);
    try {
      await exportMapDat(src, mapGrid, activePalette);
    } finally {
      setBusyMapdat(false);
    }
  }

  async function handleLitematic() {
    const src = compareMode ? compareData?.left ?? null : imageData;
    if (!src) return;
    const structure = mapMode === '3d' ? 'staircase' : 'flat';
    setBusyLiteFlat(true);
    try {
      await exportLitematic(src, activePalette, blockSelection, 'MapartForge', structure,
        structure === 'staircase' ? supportBlock : undefined,
        supportMode, staircaseMode);
    } finally {
      setBusyLiteFlat(false);
    }
  }

  async function handleZip() {
    const src = compareMode ? compareData?.left ?? null : imageData;
    if (!src) return;
    const structure     = mapMode === '3d' ? 'staircase' : 'flat';
    const ditheringSlug = DITHERING_LABELS[compareMode ? compareLeft : dithering];
    const zipFilename   = `MapartForge_${mapGrid.wide}x${mapGrid.tall}_${ditheringSlug}.zip`;
    setBusyZip(true);
    try {
      await exportLitematicZip(src, activePalette, blockSelection, mapGrid, structure, zipFilename,
        structure === 'staircase' ? supportBlock : undefined,
        supportMode, staircaseMode);
    } finally {
      setBusyZip(false);
    }
  }

  async function handleGetLink() {
    const src = compareMode ? compareData?.left ?? null : imageData;
    if (!src || !sourceImage) return;
    setLinkState('uploading');
    try {
      const url = await uploadPermalink(sourceImage, src, {
        dithering, intensity, mapGrid, blockSelection, adjustments, mapMode, staircaseMode, bnScale,
      });
      setLinkUrl(url);
      setLinkState('idle');
    } catch {
      setLinkState('error');
      setTimeout(() => setLinkState('idle'), 3000);
    }
  }

  const base        = disabled || !hasContent;
  const busyAnyLite = busyLiteFlat || busyZip;
  const isMultiMap  = mapGrid.wide * mapGrid.tall > 1;

  return (
    <section className="sidebar-section" id="tour-export">
      <h3 className="section-title">Экспорт</h3>
      {!hasContent && (
        <p className="export-empty">Обработай изображение для экспорта.</p>
      )}
      {hasContent && (
        <div className="export-buttons">
          <button
            className="export-btn"
            onClick={handlePng}
            disabled={base || busyPng}
            title={compareMode ? 'Скачать левую и правую панели как отдельные PNG' : 'Скачать обработанное изображение как PNG'}
          >
            {busyPng ? 'Сохранение…' : compareMode ? '↓ PNG ×2' : '↓ PNG'}
          </button>

          <button
            className="export-btn"
            onClick={handleMapDat}
            disabled={base || busyMapdat}
            title="Скачать файл(ы) map.dat — по одному на каждые 128×128 тайл"
          >
            {busyMapdat ? 'Сборка…' : mapCount > 1 ? `↓ MAP.DAT (${mapCount} файлов)` : '↓ MAP.DAT'}
          </button>

          <button
            className="export-btn"
            onClick={handleLitematic}
            disabled={base || busyAnyLite}
            title={mapMode === '3d' ? 'Лестничная структура — дополнительные оттенки за счёт высоты' : 'Один плоский слой — стандартный 2D мап-арт для выживания'}
          >
            {busyLiteFlat ? 'Сборка…' : `↓ LITEMATIC ${mapMode.toUpperCase()}`}
          </button>

          {isMultiMap && (
            <button
              className="export-btn export-btn-zip"
              onClick={handleZip}
              disabled={base || busyAnyLite}
              title={`Разделить на ${mapGrid.wide * mapGrid.tall} отдельных .litematic файла по 128×128, в архиве`}
            >
              {busyZip ? 'Архивирование…' : `↓ ZIP (${mapGrid.wide * mapGrid.tall} карт)`}
            </button>
          )}
        </div>
      )}
      {compareMode && hasContent && (
        <p className="export-note">Режим сравнения: PNG экспортирует обе панели; остальные форматы используют левую панель.</p>
      )}
      <div className="link-row">
        <button
          className={`link-export-btn${linkState === 'error' ? ' link-export-btn-error' : ''}`}
          onClick={handleGetLink}
          disabled={base || linkState === 'uploading' || !sourceImage}
          title={!hasContent ? 'Сначала обработай изображение' : 'Создать постоянную ссылку на этот мап-арт с текущими настройками'}
        >
          {linkState === 'uploading' ? 'Загрузка…' : linkState === 'error' ? 'Ошибка загрузки' : '🔗 ПОЛУЧИТЬ ССЫЛКУ'}
        </button>
      </div>
      {linkUrl && (
        <LinkModal url={linkUrl} onClose={() => setLinkUrl(null)} />
      )}
    </section>
  );
}
