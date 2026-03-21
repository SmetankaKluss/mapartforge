import { useState } from 'react';
import type { ComputedPalette } from '../lib/dithering';
import type { DitheringMode } from '../lib/dithering';
import type { MapGrid } from '../lib/types';
import type { BlockSelection } from '../lib/paletteBlocks';
import type { ImageAdjustments } from '../lib/adjustments';
import { downloadPng } from '../lib/exportPng';
import { exportMapDat } from '../lib/exportMapDat';
import { exportLitematic, exportLitematicZip } from '../lib/exportLitematic';
import { uploadShare } from '../lib/share';
import { ShareModal } from './ShareModal';

interface Props {
  imageData:   ImageData | null;
  compareData: { left: ImageData; right: ImageData } | null;
  compareMode: boolean;
  dithering:   DitheringMode;
  compareLeft:  DitheringMode;
  compareRight: DitheringMode;
  mapGrid:     MapGrid;
  mapMode:     '2d' | '3d';
  activePalette:  ComputedPalette;
  blockSelection: BlockSelection;
  disabled:    boolean;
  // Share
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
};

function makePngFilename(grid: MapGrid, dithering: DitheringMode): string {
  return `mapartforge_${grid.wide}x${grid.tall}_${DITHERING_LABELS[dithering]}.png`;
}

export function ExportPanel({
  imageData, compareData, compareMode,
  dithering, compareLeft, compareRight,
  mapGrid, mapMode, activePalette, blockSelection, disabled,
  sourceImage, intensity, adjustments, bnScale,
}: Props) {
  const [busyPng,         setBusyPng]         = useState(false);
  const [busyMapdat,      setBusyMapdat]      = useState(false);
  const [busyLiteFlat,    setBusyLiteFlat]    = useState(false);
  const [busyLiteStairs,  setBusyLiteStairs]  = useState(false);
  const [busyZip,         setBusyZip]         = useState(false);
  const [shareState,      setShareState]      = useState<'idle' | 'uploading' | 'error'>('idle');
  const [shareUrl,        setShareUrl]        = useState<string | null>(null);

  const hasImage   = imageData !== null;
  const hasCmp     = compareData !== null;
  const hasContent = compareMode ? hasCmp : hasImage;
  const mapCount   = mapGrid.wide * mapGrid.tall;

  // Which ImageData to use for export in normal mode
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

  async function handleLitematicFlat() {
    const src = compareMode ? compareData?.left ?? null : imageData;
    if (!src) return;
    setBusyLiteFlat(true);
    try {
      await exportLitematic(src, activePalette, blockSelection, 'MapartForge', 'flat');
    } finally {
      setBusyLiteFlat(false);
    }
  }

  async function handleLitematicStaircase() {
    const src = compareMode ? compareData?.left ?? null : imageData;
    if (!src) return;
    setBusyLiteStairs(true);
    try {
      await exportLitematic(src, activePalette, blockSelection, 'MapartForge', 'staircase');
    } finally {
      setBusyLiteStairs(false);
    }
  }

  async function handleZip() {
    const src = compareMode ? compareData?.left ?? null : imageData;
    if (!src) return;
    const structure   = mapMode === '3d' ? 'staircase' : 'flat';
    const ditheringSlug = DITHERING_LABELS[compareMode ? compareLeft : dithering];
    const zipFilename = `MapartForge_${mapGrid.wide}x${mapGrid.tall}_${ditheringSlug}.zip`;
    setBusyZip(true);
    try {
      await exportLitematicZip(src, activePalette, blockSelection, mapGrid, structure, zipFilename);
    } finally {
      setBusyZip(false);
    }
  }

  async function handleShare() {
    const src     = compareMode ? compareData?.left ?? null : imageData;
    if (!src || !sourceImage) return;
    setShareState('uploading');
    try {
      const url = await uploadShare(sourceImage, src, {
        dithering, intensity, mapGrid, blockSelection, adjustments, mapMode, bnScale,
      });
      setShareUrl(url);
      setShareState('idle');
    } catch {
      setShareState('error');
      setTimeout(() => setShareState('idle'), 3000);
    }
  }

  const base         = disabled || !hasContent;
  const busyAnyLite  = busyLiteFlat || busyLiteStairs || busyZip;
  const isMultiMap   = mapGrid.wide * mapGrid.tall > 1;

  return (
    <section className="sidebar-section">
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
            {busyPng ? 'Saving…' : compareMode ? 'Download PNG (×2)' : 'Download PNG'}
          </button>

          <button
            className="export-btn"
            onClick={handleMapDat}
            disabled={base || busyMapdat}
            title="Download Minecraft map.dat file(s) — one per 128×128 tile"
          >
            {busyMapdat
              ? 'Building…'
              : mapCount > 1
                ? `Download map.dat (${mapCount} files)`
                : 'Download map.dat'}
          </button>

          <button
            className={`export-btn ${mapMode === '3d' ? 'export-btn-secondary' : ''}`}
            onClick={handleLitematicFlat}
            disabled={base || busyAnyLite}
            title="Single flat layer — standard survival-friendly 2D map art"
          >
            {busyLiteFlat ? 'Building…' : 'Download .litematic (2D flat)'}
          </button>

          <button
            className={`export-btn ${mapMode === '2d' ? 'export-btn-secondary' : ''}`}
            onClick={handleLitematicStaircase}
            disabled={base || busyAnyLite}
            title="Staircase structure — extra shading tones from height variation"
          >
            {busyLiteStairs ? 'Building…' : 'Download .litematic (3D staircase)'}
          </button>

          {isMultiMap && (
            <button
              className="export-btn export-btn-zip"
              onClick={handleZip}
              disabled={base || busyAnyLite}
              title={`Split into ${mapGrid.wide * mapGrid.tall} separate 128×128 .litematic files, zipped`}
            >
              {busyZip
                ? 'Zipping…'
                : `Download ZIP (${mapGrid.wide * mapGrid.tall} maps, split)`}
            </button>
          )}
        </div>
      )}
      {compareMode && hasContent && (
        <p className="export-note">In compare mode, PNG exports both panels; map.dat/.litematic use the left panel.</p>
      )}
      {hasContent && (
        <div className="share-row">
          <button
            className={`share-btn${shareState === 'error' ? ' share-btn-error' : ''}`}
            onClick={handleShare}
            disabled={base || shareState === 'uploading' || !sourceImage}
            title="Upload and share a link to this map art with current settings"
          >
            {shareState === 'uploading' ? 'Uploading…' : shareState === 'error' ? 'Upload failed' : '🔗 Share'}
          </button>
        </div>
      )}
      {shareUrl && (
        <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />
      )}
    </section>
  );
}
