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
      <h3 className="section-title">Export</h3>
      {!hasContent && (
        <p className="export-empty">Process an image to enable export.</p>
      )}
      {hasContent && (
        <div className="export-buttons">
          <button
            className="export-btn"
            onClick={handlePng}
            disabled={base || busyPng}
            title={compareMode ? 'Download left and right panels as separate PNGs' : 'Download processed image as PNG'}
          >
            {busyPng ? 'Saving…' : compareMode ? '↓ PNG ×2' : '↓ PNG'}
          </button>

          <button
            className="export-btn"
            onClick={handleMapDat}
            disabled={base || busyMapdat}
            title="Download Minecraft map.dat file(s) — one per 128×128 tile"
          >
            {busyMapdat ? 'Building…' : mapCount > 1 ? `↓ MAP.DAT (${mapCount} files)` : '↓ MAP.DAT'}
          </button>

          <button
            className="export-btn"
            onClick={handleLitematic}
            disabled={base || busyAnyLite}
            title={mapMode === '3d' ? 'Staircase structure — extra shading tones from height variation' : 'Single flat layer — standard survival-friendly 2D map art'}
          >
            {busyLiteFlat ? 'Building…' : `↓ LITEMATIC ${mapMode.toUpperCase()}`}
          </button>

          {isMultiMap && (
            <button
              className="export-btn export-btn-zip"
              onClick={handleZip}
              disabled={base || busyAnyLite}
              title={`Split into ${mapGrid.wide * mapGrid.tall} separate 128×128 .litematic files, zipped`}
            >
              {busyZip ? 'Zipping…' : `↓ ZIP (${mapGrid.wide * mapGrid.tall} maps)`}
            </button>
          )}
        </div>
      )}
      {compareMode && hasContent && (
        <p className="export-note">Compare mode: PNG exports both panels; other formats use the left panel.</p>
      )}
      <div className="link-row">
        <button
          className={`link-export-btn${linkState === 'error' ? ' link-export-btn-error' : ''}`}
          onClick={handleGetLink}
          disabled={base || linkState === 'uploading' || !sourceImage}
          title={!hasContent ? 'Process an image first' : 'Generate a permalink to this map art with current settings'}
        >
          {linkState === 'uploading' ? 'Uploading…' : linkState === 'error' ? 'Upload failed' : '🔗 GET LINK'}
        </button>
      </div>
      {linkUrl && (
        <LinkModal url={linkUrl} onClose={() => setLinkUrl(null)} />
      )}
    </section>
  );
}
