import { useMemo, useState } from 'react';
import type { ComputedPalette } from '../lib/dithering';
import type { DitheringMode } from '../lib/dithering';
import type { MapGrid } from '../lib/types';
import type { BlockSelection } from '../lib/paletteBlocks';
import type { ImageAdjustments } from '../lib/adjustments';
import type { PlatformMode } from '../lib/platformMode';
import type { MinecraftVersion } from '../lib/versionPresets';
import type { BuildTechnique } from '../lib/buildTechnique';
import {
  evaluateSuppressionEligibility,
  type SuppressionEligibilityReason,
} from '../lib/suppressionPlan';
import { coerceSuppressionTargetVersion } from '../lib/buildTechnique';
import {
  buildSuppressionArtifacts,
  buildSuppressionMultiMapZipFromInput,
  buildSuppressionZipBlob,
  downloadSuppressionZip,
} from '../lib/suppressionExport';
import { downloadPng } from '../lib/exportPng';
import { exportMapDat } from '../lib/exportMapDat';
import { exportLitematic, exportLitematicZip, exportLitematicHybrid } from '../lib/exportLitematic';
import type { SupportMode, LayerExportInfo } from '../lib/exportLitematic';
import { exportSchematic, exportSchematicZip } from '../lib/exportSchematic';
import { exportStructureNbt, exportStructureNbtZip } from '../lib/exportStructureNbt';
import { exportMcStructure, exportMcStructureZip } from '../lib/exportMcStructure';
import { uploadPermalink } from '../lib/share';
import { downloadBlob, generateShowcaseImage } from '../lib/showcase';
import { uploadDiagnosticCapture } from '../lib/diagnostics';
import { LinkModal } from './LinkModal';
import { useLocale } from '../lib/useLocale';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';
import { trackEvent } from '../lib/analytics';
import {
  deferSupportPrompt,
  shouldShowSupportPrompt,
  SUPPORT_URL,
} from '../lib/supportPrompt';

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
  platformMode: PlatformMode;
  minecraftVersion: MinecraftVersion;
  buildTechnique: BuildTechnique;
  // Tracker
  onCreateTracker?: () => void;
  // GIF Project
  onExportGifPack?: () => void | Promise<void>;
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
  platformMode,
  minecraftVersion,
  buildTechnique,
  onCreateTracker, onExportGifPack,
}: Props) {
  const { t } = useLocale();
  const [collapsed, setCollapsed]         = useState(true);
  const [busyPng]                         = useState(false);
  const [busyMapdat,   setBusyMapdat]     = useState(false);
  const [busyLiteFlat, setBusyLiteFlat]   = useState(false);
  const [busyHybrid,   setBusyHybrid]     = useState(false);
  const [busyLayer,    setBusyLayer]      = useState(false);
  const [busyZip,      setBusyZip]        = useState(false);
  const [busyShowcase, setBusyShowcase]   = useState(false);
  const [busySchematic, setBusySchematic] = useState(false);
  const [busyNbt,       setBusyNbt]       = useState(false);
  const [busyMcStruct,  setBusyMcStruct]  = useState(false);
  const [busySuppression, setBusySuppression] = useState(false);
  const [suppressionError, setSuppressionError] = useState<string | null>(null);
  const [linkState,      setLinkState]      = useState<'idle' | 'uploading' | 'error'>('idle');
  const [linkUrl,        setLinkUrl]        = useState<string | null>(null);
  const [supportPromptVisible, setSupportPromptVisible] = useState(false);
  const [supportExportFormat, setSupportExportFormat] = useState<string | null>(null);

  const hasPreview = (previewImageData ?? imageData) !== null;
  const hasCmp     = compareData !== null;
  const hasContent = compareMode ? hasCmp : hasPreview;
  const mapCount   = mapGrid.wide * mapGrid.tall;
  const disabledReason = disabled
    ? t('Обработка ещё идёт.', 'Processing is still running.')
    : t('Сначала обработай изображение.', 'Process an image first.');

  const previewData = compareMode ? null : (previewImageData ?? imageData);
  const suppressionEligibility = useMemo(() => {
    if (!imageData) return null;
    return evaluateSuppressionEligibility({
      imageData,
      palette: activePalette,
      blockSelection,
      grid: mapGrid,
      mapMode,
      platformMode,
      minecraftVersion,
      fillerBlockNbt: supportBlock,
    });
  }, [activePalette, blockSelection, imageData, mapGrid, mapMode, minecraftVersion, platformMode, supportBlock]);

  function suppressionReason(reason: SuppressionEligibilityReason): string {
    switch (reason.code) {
      case 'wrong_grid': return t('поддерживаются сетки до 10×10 карт', 'map grids up to 10×10 are supported');
      case 'wrong_size': return t('размер изображения не совпадает с сеткой карт', 'the image size does not match the map grid');
      case 'wrong_platform': return t('только Java Edition', 'Java Edition only');
      case 'unsupported_version': return t('только Minecraft 1.21.4, 1.21.8, 1.21.11 или 26.2', 'Minecraft 1.21.4, 1.21.8, 1.21.11, or 26.2 only');
      case 'requires_three_shades': return t('нужен режим 3D с тремя оттенками', 'requires 3D mode with three shades');
      case 'transparent_pixel': return t('прозрачные пиксели пока не поддерживаются', 'transparent pixels are not supported yet');
      case 'unknown_palette_colour': return t('есть цвет вне текущей палитры', 'a color is outside the current palette');
      case 'unsupported_shade': return t('найден неподдерживаемый оттенок', 'an unsupported shade was found');
      case 'unsupported_block': return t(`нестабильный блок: ${reason.detail ?? ''}`, `unstable block: ${reason.detail ?? ''}`);
    }
  }

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

  function getSupportStorage(): Storage | null {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function completeExport(format: string) {
    trackEvent('export_completed', {
      format,
      map_mode: mapMode,
      map_wide: mapGrid.wide,
      map_tall: mapGrid.tall,
      platform_mode: platformMode,
    });
    if (supportPromptVisible || !shouldShowSupportPrompt(getSupportStorage())) return;
    setSupportExportFormat(format);
    setSupportPromptVisible(true);
    trackEvent('support_prompt_visible', { after_export_format: format });
  }

  function hideSupportPrompt(reason: 'dismissed' | 'opened') {
    deferSupportPrompt(getSupportStorage());
    setSupportPromptVisible(false);
    trackEvent(reason === 'opened' ? 'support_prompt_clicked' : 'support_prompt_dismissed', {
      after_export_format: supportExportFormat,
      destination: reason === 'opened' ? 'boosty' : undefined,
    });
  }

  function handlePng() {
    const format = compareMode ? 'png_compare' : 'png';
    trackExport(format);
    if (compareMode && hasCmp) {
      captureDiagnostics('export_png_compare_left', compareData!.left);
      captureDiagnostics('export_png_compare_right', compareData!.right);
      downloadPng(compareData!.left,  makePngFilename(mapGrid, compareLeft)  .replace('.png', '_left.png'));
      downloadPng(compareData!.right, makePngFilename(mapGrid, compareRight) .replace('.png', '_right.png'));
      completeExport(format);
    } else if (previewData) {
      captureDiagnostics('export_png', previewData);
      downloadPng(previewData, makePngFilename(mapGrid, dithering));
      completeExport(format);
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
      completeExport('showcase_png');
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
      await exportMapDat(src, mapGrid, activePalette, 0, minecraftVersion);
      trackEvent('dat_exported', {
        map_mode: mapMode,
        staircase_mode: mapMode === '3d' ? staircaseMode : undefined,
        map_wide: mapGrid.wide,
        map_tall: mapGrid.tall,
        compare_mode: compareMode,
        artist_mode: Boolean(artistMode),
        platform_mode: platformMode,
        file_count: mapGrid.wide * mapGrid.tall,
        start_map_id: 0,
      });
      completeExport('map_dat');
    } finally {
      setBusyMapdat(false);
    }
  }

  async function handleSuppressionZip() {
    if (!imageData || !suppressionEligibility?.eligible || compareMode) return;
    setBusySuppression(true);
    setSuppressionError(null);
    try {
      const input = {
        imageData,
        palette: activePalette,
        blockSelection,
        grid: mapGrid,
        mapMode,
        platformMode,
        minecraftVersion: coerceSuppressionTargetVersion(minecraftVersion),
        fillerBlockNbt: supportBlock,
      };
      const zip = mapCount === 1
        ? await buildSuppressionZipBlob(await buildSuppressionArtifacts('MapKluss', input))
        : await buildSuppressionMultiMapZipFromInput('MapKluss', input);
      downloadSuppressionZip(zip, 'MapKluss', mapGrid);
      trackExport('suppression_two_layer_zip');
      completeExport('suppression_two_layer_zip');
    } catch (error) {
      setSuppressionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusySuppression(false);
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
      trackEvent('litematic_exported', {
        variant: 'single',
        map_mode: mapMode,
        staircase_mode: mapMode === '3d' ? staircaseMode : undefined,
        map_wide: mapGrid.wide,
        map_tall: mapGrid.tall,
        compare_mode: compareMode,
        artist_mode: Boolean(artistMode),
        platform_mode: platformMode,
      });
      completeExport('litematic');
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
      trackEvent('litematic_exported', {
        variant: 'zip',
        map_mode: mapMode,
        staircase_mode: mapMode === '3d' ? staircaseMode : undefined,
        map_wide: mapGrid.wide,
        map_tall: mapGrid.tall,
        compare_mode: compareMode,
        artist_mode: Boolean(artistMode),
        platform_mode: platformMode,
      });
      completeExport('litematic_zip');
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
      trackEvent('litematic_exported', {
        variant: 'hybrid',
        map_mode: 'hybrid',
        map_wide: mapGrid.wide,
        map_tall: mapGrid.tall,
        compare_mode: compareMode,
        artist_mode: Boolean(artistMode),
        platform_mode: platformMode,
      });
      completeExport('litematic_hybrid');
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
      trackEvent('litematic_exported', {
        variant: 'layer',
        map_mode: activeLayerExport.mapMode,
        staircase_mode: activeLayerExport.mapMode === '3d' ? activeLayerExport.staircaseMode : undefined,
        map_wide: mapGrid.wide,
        map_tall: mapGrid.tall,
        compare_mode: compareMode,
        artist_mode: Boolean(artistMode),
        platform_mode: platformMode,
      });
      completeExport('litematic_layer');
    } finally {
      setBusyLayer(false);
    }
  }

  async function handleSchematic() {
    const src = compareMode ? compareData?.left ?? null : imageData;
    if (!src) return;
    trackExport('schematic');
    const structure = mapMode === '3d' ? 'staircase' : 'flat';
    setBusySchematic(true);
    try {
      const supportForExport = structure === 'staircase' ? supportBlock : 'air';
      if (isMultiMap) {
        const ditheringSlug = DITHERING_LABELS[compareMode ? compareLeft : dithering];
        await exportSchematicZip(src, activePalette, blockSelection, mapGrid, structure,
          `MapartForge_${mapGrid.wide}x${mapGrid.tall}_${ditheringSlug}.zip`,
          supportForExport, supportMode, staircaseMode, minecraftVersion);
      } else {
        await exportSchematic(src, activePalette, blockSelection, 'MapartForge', structure,
          supportForExport, supportMode, staircaseMode, minecraftVersion);
      }
      trackEvent('schematic_exported', {
        map_mode: mapMode,
        map_wide: mapGrid.wide,
        map_tall: mapGrid.tall,
        mc_version: minecraftVersion,
        platform_mode: platformMode,
      });
      completeExport('schematic');
    } finally {
      setBusySchematic(false);
    }
  }

  async function handleNbt() {
    const src = compareMode ? compareData?.left ?? null : imageData;
    if (!src) return;
    trackExport('nbt');
    const structure = mapMode === '3d' ? 'staircase' : 'flat';
    setBusyNbt(true);
    try {
      const supportForExport = structure === 'staircase' ? supportBlock : 'air';
      if (isMultiMap) {
        const ditheringSlug = DITHERING_LABELS[compareMode ? compareLeft : dithering];
        await exportStructureNbtZip(src, activePalette, blockSelection, mapGrid, structure,
          `MapartForge_${mapGrid.wide}x${mapGrid.tall}_${ditheringSlug}_nbt.zip`,
          supportForExport, supportMode, staircaseMode, minecraftVersion);
      } else {
        await exportStructureNbt(src, activePalette, blockSelection, 'MapartForge', structure,
          supportForExport, supportMode, staircaseMode, minecraftVersion);
      }
      trackEvent('nbt_exported', {
        map_mode: mapMode,
        map_wide: mapGrid.wide,
        map_tall: mapGrid.tall,
        platform_mode: platformMode,
      });
      completeExport('nbt');
    } finally {
      setBusyNbt(false);
    }
  }

  async function handleMcStructure() {
    const src = compareMode ? compareData?.left ?? null : imageData;
    if (!src) return;
    trackExport('mcstructure');
    const structure = mapMode === '3d' ? 'staircase' : 'flat';
    setBusyMcStruct(true);
    try {
      const supportForExport = structure === 'staircase' ? supportBlock : 'air';
      if (isMultiMap) {
        const ditheringSlug = DITHERING_LABELS[compareMode ? compareLeft : dithering];
        await exportMcStructureZip(src, activePalette, blockSelection, mapGrid, structure,
          `MapartForge_${mapGrid.wide}x${mapGrid.tall}_${ditheringSlug}_bedrock.zip`,
          supportForExport, supportMode, staircaseMode);
      } else {
        await exportMcStructure(src, activePalette, blockSelection, 'MapartForge', structure,
          supportForExport, supportMode, staircaseMode);
      }
      trackEvent('mcstructure_exported', {
        map_mode: mapMode,
        map_wide: mapGrid.wide,
        map_tall: mapGrid.tall,
        platform_mode: platformMode,
      });
      completeExport('mcstructure');
    } finally {
      setBusyMcStruct(false);
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
        minecraftVersion, platformMode, buildTechnique, supportBlock, supportMode,
      });
      setLinkUrl(url);
      setLinkState('idle');
    } catch {
      setLinkState('error');
      setTimeout(() => setLinkState('idle'), 3000);
    }
  }

  async function handleGifPack() {
    if (!onExportGifPack) return;
    trackEvent('export_clicked', { format: 'gif_litematic_pack', map_wide: mapGrid.wide, map_tall: mapGrid.tall });
    await onExportGifPack();
    completeExport('gif_litematic_pack');
  }

  const base        = disabled || !hasContent;
  const busyAnyLite = busyLiteFlat || busyZip || busyHybrid || busyLayer || busySchematic || busyNbt || busyMcStruct;
  const isMultiMap  = mapGrid.wide * mapGrid.tall > 1;
  const isBedrock = platformMode === 'bedrock';

  return (
    <section className="sidebar-section" id="tour-export" data-tour="export">
      <h2 className="section-title section-title-collapsible" onClick={() => setCollapsed(c => !c)}>
        {t('Экспорт', 'Export')}
        <IconGlyph icon={mkIcons.chevronDown} className={`section-collapse-arrow${collapsed ? ' collapsed' : ''}`} />
      </h2>
      {!collapsed && !hasContent && (
        <p className="export-empty">{t('Загрузи изображение — экспорт появится здесь.', 'Upload an image to enable export.')}</p>
      )}
      {!collapsed && hasContent && (
        <>
        {supportPromptVisible && (
          <aside className="export-support-prompt" aria-labelledby="export-support-title">
            <span className="export-support-icon" aria-hidden="true"><IconGlyph icon={mkIcons.support} /></span>
            <div className="export-support-copy" role="status" aria-live="polite">
              <strong id="export-support-title">{t('MapKluss помог?', 'Did MapKluss help?')}</strong>
              <span>{t('Поддержи развитие проекта и его серверы.', 'Support the project and help cover its servers.')}</span>
            </div>
            <button
              type="button"
              className="export-support-dismiss"
              onClick={() => hideSupportPrompt('dismissed')}
              aria-label={t('Не показывать предложение один день', 'Hide this prompt for one day')}
              title={t('Скрыть', 'Dismiss')}
            >
              <IconGlyph icon={mkIcons.close} />
            </button>
            <a
              className="export-support-action"
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => hideSupportPrompt('opened')}
            >
              {t('Поддержать автора', 'Support the author')}
              <IconGlyph icon={mkIcons.arrowRight} />
            </a>
          </aside>
        )}
        {!isBedrock && buildTechnique === 'suppression_two_layer' && suppressionEligibility && !suppressionEligibility.eligible && (
          <p className="build-technique-warning" role="status">
            {t('Two-layer недоступен: ', 'Two-layer unavailable: ')}
            {suppressionEligibility.reasons.map(suppressionReason).join('; ')}.
          </p>
        )}
        <div className="export-buttons">
          <button
            className="export-btn"
            onClick={handlePng}
            disabled={base || busyPng}
            title={compareMode ? t('Скачать левую и правую панели как отдельные PNG', 'Download left and right panels as separate PNG') : t('Скачать обработанное изображение как PNG', 'Download processed image as PNG')}
          >
            <IconGlyph icon={mkIcons.exportImage} /> {busyPng ? t('Сохранение…', 'Saving…') : compareMode ? 'PNG ×2' : 'PNG'}
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

          {/* Java-only exports — hidden in Bedrock mode */}
          {!isBedrock && (<>
            {buildTechnique === 'suppression_two_layer' && (
              <button
                className="export-btn export-btn-suppression"
                onClick={() => void handleSuppressionZip()}
                disabled={base || busySuppression || compareMode || !suppressionEligibility?.eligible}
                title={t(
                  `Скачать схемы, планы и SHA-256 для ${mapCount} карт`,
                  `Download schematics, plans, and SHA-256 checks for ${mapCount} maps`,
                )}
              >
                <IconGlyph icon={mkIcons.archive} /> {busySuppression ? t('Сборка…', 'Building…') : `TWO-LAYER ZIP${mapCount > 1 ? ` (${mapCount})` : ''}`}
              </button>
            )}
            <button
              className="export-btn export-btn-mapdat"
              onClick={handleMapDat}
              disabled={base || busyMapdat}
              title={t('Скачать ZIP с map.dat файлами и командами для рамок', 'Download a ZIP with map.dat files and item-frame commands')}
            >
              <IconGlyph icon={mkIcons.map} /> {busyMapdat ? t('Сборка…', 'Building…') : mapCount > 1 ? `MAP.DAT ZIP (${mapCount})` : 'MAP.DAT ZIP'}
            </button>

            {artistMode ? (<>
              <button
                className="export-btn"
                onClick={handleHybridLitematic}
                disabled={base || busyAnyLite || !hybridLayers?.length}
                title={t('Все видимые слои в одной схематике — 3D и 2D части объединены', 'All visible layers in one schematic — 3D and 2D parts combined')}
              >
                <IconGlyph icon={mkIcons.package} /> {busyHybrid ? t('Сборка…', 'Building…') : 'LITEMATIC'}
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
                <IconGlyph icon={mkIcons.package} /> {busyLiteFlat ? t('Сборка…', 'Building…') : `LITEMATIC ${mapMode.toUpperCase()}`}
              </button>
            )}

            {isMultiMap && (
              <button
                className="export-btn export-btn-zip"
                onClick={handleZip}
                disabled={base || busyAnyLite}
                title={t(`Разделить на ${mapGrid.wide * mapGrid.tall} отдельных .litematic файла по 128×128, в архиве`, `Split into ${mapGrid.wide * mapGrid.tall} separate 128×128 .litematic files in archive`)}
              >
                <IconGlyph icon={mkIcons.archive} /> {busyZip ? t('Архивирование…', 'Archiving…') : `ZIP (${mapGrid.wide * mapGrid.tall} ${t('карт', 'maps')})`}
              </button>
            )}

            <button
              className="export-btn"
              onClick={handleSchematic}
              disabled={base || busyAnyLite}
              title={t('Экспорт в .schematic (legacy MCEdit для 1.12.2, Sponge v2 для 1.13+)', 'Export to .schematic (legacy MCEdit for 1.12.2, Sponge v2 for 1.13+)')}
            >
              <IconGlyph icon={mkIcons.file} /> {busySchematic ? t('Сборка…', 'Building…') : 'SCHEMATIC'}
            </button>

            <button
              className="export-btn"
              onClick={handleNbt}
              disabled={base || busyAnyLite}
              title={t('Экспорт в .nbt (формат структурного блока, 1.13+)', 'Export to .nbt (vanilla structure block format, 1.13+)')}
            >
              <IconGlyph icon={mkIcons.file} /> {busyNbt ? t('Сборка…', 'Building…') : 'NBT'}
            </button>
          </>)}

          {/* Bedrock-only exports — hidden in Java mode */}
          {isBedrock && (
            <button
              className="export-btn"
              onClick={handleMcStructure}
              disabled={base || busyAnyLite}
              title={t('Экспорт в .mcstructure (Bedrock Edition, структурный блок)', 'Export to .mcstructure (Bedrock Edition structure block)')}
            >
              <IconGlyph icon={mkIcons.package} /> {busyMcStruct ? t('Сборка…', 'Building…') : 'MCSTRUCTURE'}
            </button>
          )}

        </div>
        {suppressionError && <p className="export-error-note" role="alert">{suppressionError}</p>}
        </>
      )}
      {!collapsed && hasContent && isBedrock && (
        <p className="export-note">{t('Bedrock 1.20.80+ — загрузи .mcstructure через структурный блок.', 'Bedrock 1.20.80+ — import .mcstructure via structure block.')}</p>
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
        {onExportGifPack && !isBedrock && (
          <div className="link-row">
            <button
              className="link-export-btn gif-pack-export-btn"
              onClick={() => void handleGifPack()}
              aria-label={t('Экспортировать GIF проект как Litematic ZIP', 'Export GIF project as Litematic ZIP')}
              title={t('Экспортировать все кадры GIF как .litematic ZIP', 'Export all GIF frames as .litematic ZIP')}
            >
              <IconGlyph icon={mkIcons.archive} /> {t('GIF LITEMATIC PACK', 'GIF LITEMATIC PACK')}
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
