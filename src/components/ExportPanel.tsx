import { useState } from 'react';
import type { ComputedPalette } from '../lib/dithering';
import type { DitheringMode } from '../lib/dithering';
import type { MapGrid } from '../lib/types';
import type { BlockSelection } from '../lib/paletteBlocks';
import type { ImageAdjustments } from '../lib/adjustments';
import { downloadPng } from '../lib/exportPng';
import { exportMapDat } from '../lib/exportMapDat';
import { exportLitematic, exportLitematicZip, exportLitematicHybrid } from '../lib/exportLitematic';
import type { SupportMode, LayerExportInfo } from '../lib/exportLitematic';
import { uploadPermalink } from '../lib/share';
import { LinkModal } from './LinkModal';
import { useLocale } from '../lib/locale';

// Helper: convert ImageData to HTMLImageElement (async to ensure image loads)
function imageDataToHtmlImage(data: ImageData): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext('2d')!.putImageData(data, 0, 0);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = canvas.toDataURL('image/png');
  });
}

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
  // Artist mode
  artistMode?:       boolean;
  hybridLayers?:     LayerExportInfo[];
  activeLayerExport?: LayerExportInfo;
  // Link export
  sourceImage: HTMLImageElement | null;
  intensity:   number;
  adjustments: ImageAdjustments;
  bnScale:     number;
  // Tracker
  onCreateTracker?: () => void;
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
  artistMode, hybridLayers, activeLayerExport,
  sourceImage, intensity, adjustments, bnScale,
  onCreateTracker,
}: Props) {
  const { t } = useLocale();
  const [collapsed, setCollapsed]         = useState(false);
  const [busyPng]                         = useState(false);
  const [busyMapdat,   setBusyMapdat]     = useState(false);
  const [busyLiteFlat, setBusyLiteFlat]   = useState(false);
  const [busyHybrid,   setBusyHybrid]     = useState(false);
  const [busyLayer,    setBusyLayer]      = useState(false);
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
      // For 2D flat mode, use 'air' as support block to disable support layer
      const supportForExport = structure === 'staircase' ? supportBlock : 'air';
      await exportLitematic(src, activePalette, blockSelection, 'MapartForge', structure,
        supportForExport, supportMode, staircaseMode);
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
      const supportForExport = structure === 'staircase' ? supportBlock : 'air';
      await exportLitematicZip(src, activePalette, blockSelection, mapGrid, structure, zipFilename,
        supportForExport, supportMode, staircaseMode);
    } finally {
      setBusyZip(false);
    }
  }

  async function handleHybridLitematic() {
    if (!hybridLayers || hybridLayers.length === 0) return;
    setBusyHybrid(true);
    try {
      const has3D = hybridLayers.some(l => l.mapMode === '3d');
      // For 2D-only hybrid, use 'air' as support block to disable support layer
      const supportForExport = has3D ? supportBlock : 'air';
      await exportLitematicHybrid(hybridLayers, activePalette, blockSelection, 'MapartForge',
        supportForExport, supportMode);
    } finally {
      setBusyHybrid(false);
    }
  }

  async function handleLayerLitematic() {
    if (!activeLayerExport) return;
    const structure = activeLayerExport.mapMode === '3d' ? 'staircase' : 'flat';
    setBusyLayer(true);
    try {
      // For 2D flat mode, use 'air' as support block to disable support layer
      const supportForExport = structure === 'staircase' ? supportBlock : 'air';
      if (mapGrid.wide * mapGrid.tall > 1) {
        await exportLitematicZip(activeLayerExport.imageData, activePalette, blockSelection, mapGrid,
          structure, 'MapartForge_layer', supportForExport, supportMode, activeLayerExport.staircaseMode);
      } else {
        await exportLitematic(activeLayerExport.imageData, activePalette, blockSelection, 'MapartForge_layer',
          structure, supportForExport, supportMode, activeLayerExport.staircaseMode);
      }
    } finally {
      setBusyLayer(false);
    }
  }

  async function handleGetLink() {
    const src = compareMode ? compareData?.left ?? null : imageData;
    if (!src) return;
    setLinkState('uploading');
    try {
      // Use sourceImage if available; otherwise use imageData as fallback for blank canvas projects
      let imgToShare = sourceImage;
      if (!imgToShare && src) {
        imgToShare = await imageDataToHtmlImage(src);
      }
      if (!imgToShare) return;
      const url = await uploadPermalink(imgToShare, src, {
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
  const busyAnyLite = busyLiteFlat || busyZip || busyHybrid || busyLayer;
  const isMultiMap  = mapGrid.wide * mapGrid.tall > 1;

  return (
    <section className="sidebar-section" id="tour-export">
      <h3 className="section-title section-title-collapsible" onClick={() => setCollapsed(c => !c)}>
        {t('Экспорт', 'Export')}
        <span className="section-collapse-arrow">{collapsed ? '▶' : '▼'}</span>
      </h3>
      {!collapsed && !hasContent && (
        <p className="export-empty">{t('Загрузи изображение — экспорт появится здесь.', 'Upload an image to enable export.')}</p>
      )}
      {!collapsed && hasContent && (
        <div className="export-buttons">
          <button
            className="export-btn"
            onClick={handlePng}
            disabled={base || busyPng}
            title={compareMode ? t('Скачать левую и правую панели как отдельные PNG', 'Download left and right panels as separate PNG') : t('Скачать обработанное изображение как PNG', 'Download processed image as PNG')}
          >
            {busyPng ? t('Сохранение…', 'Saving…') : compareMode ? '↓ PNG ×2' : '↓ PNG'}
          </button>

          <button
            className="export-btn"
            onClick={handleMapDat}
            disabled={base || busyMapdat}
            title={t('Скачать файл(ы) map.dat — по одному на каждые 128×128 тайл', 'Download map.dat file(s) — one per 128×128 tile')}
          >
            {busyMapdat ? t('Сборка…', 'Building…') : mapCount > 1 ? `↓ MAP.DAT (${mapCount} ${t('файлов', 'files')})` : '↓ MAP.DAT'}
          </button>

          {artistMode ? (<>
            <button
              className="export-btn"
              onClick={handleHybridLitematic}
              disabled={base || busyAnyLite || !hybridLayers?.length}
              title={t('Все видимые слои в одной схематике — 3D и 2D части объединены', 'All visible layers in one schematic — 3D and 2D parts combined')}
            >
              {busyHybrid ? t('Сборка…', 'Building…') : '↓ LITEMATIC'}
            </button>
            <button
              className="export-btn"
              onClick={handleLayerLitematic}
              disabled={base || busyAnyLite || !activeLayerExport}
              title={t('Только активный слой с его режимом постройки', 'Active layer only with its build mode')}
            >
              {busyLayer ? t('Сборка…', 'Building…') : `↓ ${t('СЛОЙ', 'LAYER')}${isMultiMap ? ' ZIP' : ''} (${(activeLayerExport?.mapMode ?? '2d').toUpperCase()})`}
            </button>
          </>) : (
            <button
              className="export-btn"
              onClick={handleLitematic}
              disabled={base || busyAnyLite}
              title={mapMode === '3d' ? t('Лестничная структура — дополнительные оттенки за счёт высоты', 'Staircase structure — extra shades from height') : t('Один плоский слой — стандартный 2D мап-арт для выживания', 'Single flat layer — standard 2D map art for survival')}
            >
              {busyLiteFlat ? t('Сборка…', 'Building…') : `↓ LITEMATIC ${mapMode.toUpperCase()}`}
            </button>
          )}

          {isMultiMap && (
            <button
              className="export-btn export-btn-zip"
              onClick={handleZip}
              disabled={base || busyAnyLite}
              title={t(`Разделить на ${mapGrid.wide * mapGrid.tall} отдельных .litematic файла по 128×128, в архиве`, `Split into ${mapGrid.wide * mapGrid.tall} separate 128×128 .litematic files in archive`)}
            >
              {busyZip ? t('Архивирование…', 'Archiving…') : `↓ ZIP (${mapGrid.wide * mapGrid.tall} ${t('карт', 'maps')})`}
            </button>
          )}

        </div>
      )}
      {!collapsed && compareMode && hasContent && (
        <p className="export-note">{t('Режим сравнения: PNG экспортирует обе панели; остальные форматы используют левую панель.', 'Compare mode: PNG exports both panels; other formats use left panel.')}</p>
      )}
      {!collapsed && <>
        <div className="link-row">
          <button
            className={`link-export-btn${linkState === 'error' ? ' link-export-btn-error' : ''}`}
            onClick={handleGetLink}
            disabled={base || linkState === 'uploading'}
            title={!hasContent ? t('Сначала обработай изображение', 'Process image first') : t('Создать постоянную ссылку на этот мап-арт с текущими настройками', 'Create permanent link to this map art with current settings')}
          >
            {linkState === 'uploading' ? t('Загрузка…', 'Uploading…') : linkState === 'error' ? t('Ошибка загрузки', 'Upload failed') : t('🔗 ПОЛУЧИТЬ ССЫЛКУ', '🔗 GET LINK')}
          </button>
        </div>
        {onCreateTracker && (
          <div className="link-row">
            <button
              className="link-export-btn tracker-export-btn"
              onClick={onCreateTracker}
              disabled={base}
              title={t('Создать общий трекер сбора и постройки для команды', 'Create a shared gathering & building tracker for your team')}
            >
              {t('⛏ ТРЕКЕР ПОСТРОЙКИ', '⛏ BUILD TRACKER')}
            </button>
          </div>
        )}
        {linkUrl && (
          <LinkModal url={linkUrl} onClose={() => setLinkUrl(null)} />
        )}
      </>}
    </section>
  );
}
