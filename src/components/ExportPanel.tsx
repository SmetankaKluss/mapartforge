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
import { downloadBlob, generateShowcaseImage } from '../lib/showcase';
import { uploadDiagnosticCapture } from '../lib/diagnostics';
import { LinkModal } from './LinkModal';
import { useLocale } from '../lib/locale';
import { IconGlyph, mkIcons } from './IconGlyph';
import { trackEvent } from '../lib/analytics';

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
  previewImageData?: ImageData | null;
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
  // GIF Project
  onExportGifPack?: () => void;
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
  previewImageData,
  imageData, compareData, compareMode,
  dithering, compareLeft, compareRight,
  mapGrid, mapMode, staircaseMode, activePalette, blockSelection, disabled,
  supportBlock, supportMode,
  artistMode, hybridLayers, activeLayerExport,
  sourceImage, intensity, adjustments, bnScale,
  onCreateTracker, onExportGifPack,
}: Props) {
  const { t } = useLocale();
  const [collapsed, setCollapsed]         = useState(false);
  const [busyPng]                         = useState(false);
  const [busyMapdat,   setBusyMapdat]     = useState(false);
  const [busyLiteFlat, setBusyLiteFlat]   = useState(false);
  const [busyHybrid,   setBusyHybrid]     = useState(false);
  const [busyLayer,    setBusyLayer]      = useState(false);
  const [busyZip,      setBusyZip]        = useState(false);
  const [busyShowcase, setBusyShowcase]   = useState(false);
  const [linkState,      setLinkState]      = useState<'idle' | 'uploading' | 'error'>('idle');
  const [linkUrl,        setLinkUrl]        = useState<string | null>(null);

  const hasPreview = (previewImageData ?? imageData) !== null;
  const hasCmp     = compareData !== null;
  const hasContent = compareMode ? hasCmp : hasPreview;
  const mapCount   = mapGrid.wide * mapGrid.tall;
  const disabledReason = disabled
    ? t('Обработка ещё идёт.', 'Processing is still running.')
    : t('Сначала обработай изображение.', 'Process an image first.');

  const previewData = compareMode ? null : (previewImageData ?? imageData);

  function captureDiagnostics(action: string, preview: ImageData | null) {
    if (!preview) return;
    void uploadDiagnosticCapture({
      action,
      previewData: preview,
      sourceImage,
      settings: {
        dithering: compareMode ? compareLeft : dithering,
        intensity,
        mapGrid,
        blockSelection,
        adjustments,
        mapMode,
        staircaseMode,
        bnScale,
        compareMode,
        artistMode: Boolean(artistMode),
        paletteSize: activePalette.colors.length,
      },
    });
  }

  function trackExport(format: string) {
    trackEvent('export_clicked', {
      format,
      map_mode: mapMode,
      staircase_mode: mapMode === '3d' ? staircaseMode : undefined,
      map_wide: mapGrid.wide,
      map_tall: mapGrid.tall,
      dithering: compareMode ? compareLeft : dithering,
      compare_mode: compareMode,
      artist_mode: Boolean(artistMode),
    });
  }

  function handlePng() {
    trackExport(compareMode ? 'png_compare' : 'png');
    if (compareMode && hasCmp) {
      captureDiagnostics('export_png_compare_left', compareData!.left);
      captureDiagnostics('export_png_compare_right', compareData!.right);
      downloadPng(compareData!.left,  makePngFilename(mapGrid, compareLeft)  .replace('.png', '_left.png'));
      downloadPng(compareData!.right, makePngFilename(mapGrid, compareRight) .replace('.png', '_right.png'));
    } else if (previewData) {
      captureDiagnostics('export_png', previewData);
      downloadPng(previewData, makePngFilename(mapGrid, dithering));
    }
  }

  async function handleShowcase() {
    const src = compareMode ? compareData?.left ?? null : (previewImageData ?? imageData);
    if (!src) return;
    trackExport('showcase_png');
    setBusyShowcase(true);
    try {
      captureDiagnostics('export_showcase_png', src);
      const blob = await generateShowcaseImage({
        originalImage: sourceImage,
        processed: src,
        mapGrid,
        mapMode,
        dithering: compareMode ? compareLeft : dithering,
        colors: activePalette.colors.length,
      });
      downloadBlob(blob, `mapkluss_showcase_${mapGrid.wide}x${mapGrid.tall}_${mapMode}.png`);
    } finally {
      setBusyShowcase(false);
    }
  }

  async function handleMapDat() {
    const src = compareMode ? compareData?.left ?? null : (previewImageData ?? imageData);
    if (!src) return;
    trackExport('map_dat');
    setBusyMapdat(true);
    try {
      captureDiagnostics('export_map_dat', src);
      await exportMapDat(src, mapGrid, activePalette);
    } finally {
      setBusyMapdat(false);
    }
  }

  async function handleLitematic() {
    const src = compareMode ? compareData?.left ?? null : imageData;
    if (!src) return;
    trackExport('litematic');
    const structure = mapMode === '3d' ? 'staircase' : 'flat';
    setBusyLiteFlat(true);
    try {
      captureDiagnostics('export_litematic', src);
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
    trackExport('litematic_zip');
    const structure     = mapMode === '3d' ? 'staircase' : 'flat';
    const ditheringSlug = DITHERING_LABELS[compareMode ? compareLeft : dithering];
    const zipFilename   = `MapartForge_${mapGrid.wide}x${mapGrid.tall}_${ditheringSlug}.zip`;
    setBusyZip(true);
    try {
      captureDiagnostics('export_litematic_zip', src);
      const supportForExport = structure === 'staircase' ? supportBlock : 'air';
      await exportLitematicZip(src, activePalette, blockSelection, mapGrid, structure, zipFilename,
        supportForExport, supportMode, staircaseMode);
    } finally {
      setBusyZip(false);
    }
  }

  async function handleHybridLitematic() {
    if (!hybridLayers || hybridLayers.length === 0) return;
    trackExport('litematic_hybrid');
    setBusyHybrid(true);
    try {
      captureDiagnostics('export_litematic_hybrid', imageData);
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
    trackExport('litematic_layer');
    const structure = activeLayerExport.mapMode === '3d' ? 'staircase' : 'flat';
    setBusyLayer(true);
    try {
      captureDiagnostics('export_litematic_layer', activeLayerExport.imageData);
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
    const sourceData = compareMode ? compareData?.left ?? null : imageData;
    const preview = compareMode ? compareData?.left ?? null : (previewImageData ?? imageData);
    if (!sourceData || !preview) return;
    trackEvent('share_link_clicked', {
      map_mode: mapMode,
      map_wide: mapGrid.wide,
      map_tall: mapGrid.tall,
      dithering,
      artist_mode: Boolean(artistMode),
    });
    setLinkState('uploading');
    try {
      captureDiagnostics('create_share_link', preview);
      // Use sourceImage if available; otherwise use imageData as fallback for blank canvas projects
      let imgToShare = sourceImage;
      if (!imgToShare && sourceData) {
        imgToShare = await imageDataToHtmlImage(sourceData);
      }
      if (!imgToShare) return;
      const url = await uploadPermalink(imgToShare, preview, {
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
      <h2 className="section-title section-title-collapsible" onClick={() => setCollapsed(c => !c)}>
        {t('Экспорт', 'Export')}
        <IconGlyph icon={mkIcons.chevronDown} className={`section-collapse-arrow${collapsed ? ' collapsed' : ''}`} />
      </h2>
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
            <IconGlyph icon={mkIcons.download} /> {busyPng ? t('Сохранение…', 'Saving…') : compareMode ? 'PNG ×2' : 'PNG'}
          </button>

          <button
            className="export-btn export-btn-showcase"
            onClick={handleShowcase}
            disabled={base || busyShowcase}
            aria-label={t('Скачать витрину PNG для публикации', 'Download showcase PNG for sharing')}
            title={t('Скачать промо-картинку Original | MapKluss Preview для публикации', 'Download an Original | MapKluss Preview promo image for sharing')}
          >
            <IconGlyph icon={mkIcons.view} /> {busyShowcase ? t('Сборка…', 'Building…') : t('ВИТРИНА PNG', 'SHOWCASE PNG')}
          </button>

          <button
            className="export-btn export-btn-mapdat"
            onClick={handleMapDat}
            disabled={base || busyMapdat}
            title={t('Скачать файл(ы) map.dat — по одному на каждые 128×128 тайл', 'Download map.dat file(s) — one per 128×128 tile')}
          >
            <IconGlyph icon={mkIcons.map} /> {busyMapdat ? t('Сборка…', 'Building…') : mapCount > 1 ? `MAP.DAT (${mapCount} ${t('файлов', 'files')})` : 'MAP.DAT'}
          </button>

          {artistMode ? (<>
            <button
              className="export-btn"
              onClick={handleHybridLitematic}
              disabled={base || busyAnyLite || !hybridLayers?.length}
              title={t('Все видимые слои в одной схематике — 3D и 2D части объединены', 'All visible layers in one schematic — 3D and 2D parts combined')}
            >
              <IconGlyph icon={mkIcons.download} /> {busyHybrid ? t('Сборка…', 'Building…') : 'LITEMATIC'}
            </button>
            <button
              className="export-btn"
              onClick={handleLayerLitematic}
              disabled={base || busyAnyLite || !activeLayerExport}
              title={t('Только активный слой с его режимом постройки', 'Active layer only with its build mode')}
            >
              <IconGlyph icon={mkIcons.layer} /> {busyLayer ? t('Сборка…', 'Building…') : `${t('СЛОЙ', 'LAYER')}${isMultiMap ? ' ZIP' : ''} (${(activeLayerExport?.mapMode ?? '2d').toUpperCase()})`}
            </button>
          </>) : (
            <button
              className="export-btn"
              onClick={handleLitematic}
              disabled={base || busyAnyLite}
              title={mapMode === '3d' ? t('Лестничная структура — дополнительные оттенки за счёт высоты', 'Staircase structure — extra shades from height') : t('Один плоский слой — стандартный 2D мап-арт для выживания', 'Single flat layer — standard 2D map art for survival')}
            >
              <IconGlyph icon={mkIcons.download} /> {busyLiteFlat ? t('Сборка…', 'Building…') : `LITEMATIC ${mapMode.toUpperCase()}`}
            </button>
          )}

          {isMultiMap && (
            <button
              className="export-btn export-btn-zip"
              onClick={handleZip}
              disabled={base || busyAnyLite}
              title={t(`Разделить на ${mapGrid.wide * mapGrid.tall} отдельных .litematic файла по 128×128, в архиве`, `Split into ${mapGrid.wide * mapGrid.tall} separate 128×128 .litematic files in archive`)}
            >
              <IconGlyph icon={mkIcons.download} /> {busyZip ? t('Архивирование…', 'Archiving…') : `ZIP (${mapGrid.wide * mapGrid.tall} ${t('карт', 'maps')})`}
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
            aria-label={t('Создать публичную ссылку на проект', 'Create a public project link')}
            title={!hasContent ? t('Сначала обработай изображение', 'Process image first') : t('Создать постоянную ссылку на этот мап-арт с текущими настройками', 'Create permanent link to this map art with current settings')}
          >
            <IconGlyph icon={mkIcons.share} /> {linkState === 'uploading' ? t('Загрузка…', 'Uploading…') : linkState === 'error' ? t('Ошибка загрузки', 'Upload failed') : t('ПОЛУЧИТЬ ССЫЛКУ', 'GET LINK')}
          </button>
        </div>
        {onCreateTracker && (
          <div className="link-row">
            <button
              className="link-export-btn tracker-export-btn"
              onClick={() => {
                trackEvent('build_tracker_clicked', { map_mode: mapMode, map_wide: mapGrid.wide, map_tall: mapGrid.tall });
                onCreateTracker();
              }}
              disabled={base}
              aria-label={t('Создать трекер постройки', 'Create build tracker')}
              title={t('Создать общий трекер сбора и постройки для команды', 'Create a shared gathering & building tracker for your team')}
            >
              <IconGlyph icon={mkIcons.pickaxe} /> {t('ТРЕКЕР ПОСТРОЙКИ', 'BUILD TRACKER')}
            </button>
          </div>
        )}
        {onExportGifPack && (
          <div className="link-row">
            <button
              className="link-export-btn gif-pack-export-btn"
              onClick={() => {
                trackEvent('export_clicked', { format: 'gif_litematic_pack', map_wide: mapGrid.wide, map_tall: mapGrid.tall });
                onExportGifPack();
              }}
              aria-label={t('Экспортировать GIF проект как Litematic ZIP', 'Export GIF project as Litematic ZIP')}
              title={t('Экспортировать все кадры GIF как .litematic ZIP', 'Export all GIF frames as .litematic ZIP')}
            >
              <IconGlyph icon={mkIcons.download} /> {t('GIF LITEMATIC PACK', 'GIF LITEMATIC PACK')}
            </button>
          </div>
        )}
        {linkUrl && (
          <LinkModal url={linkUrl} onClose={() => setLinkUrl(null)} />
        )}
        {!hasContent && <p className="export-disabled-note">{disabledReason}</p>}
        {linkState === 'error' && hasContent && (
          <p className="export-error-note" role="alert">
            {t('Ссылка не создалась. Проверь интернет и попробуй ещё раз.', 'Could not create the link. Check your connection and try again.')}
          </p>
        )}
      </>}
    </section>
  );
}
