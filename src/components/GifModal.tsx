import { useState, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import type { GifFrames } from '../lib/gifDecoder';
import type { MapGrid } from '../lib/types';
import type { ComputedPalette, DitheringMode, KlussParams } from '../lib/dithering';
import type { ImageAdjustments } from '../lib/adjustments';
import type { BlockSelection } from '../lib/paletteBlocks';
import { buildLookup, buildTileColors, buildMapNbt } from '../lib/exportMapDat';
import { gzipBytes } from '../lib/nbt';
import { processImage } from '../lib/processor';
import type { GifFrameConfig } from '../lib/gifProject';

interface Props {
  gifFrames: GifFrames;
  mapGrid: MapGrid;
  palette: ComputedPalette;
  dithering: DitheringMode;
  intensity: number;
  klussParams: KlussParams;
  adjustments: ImageAdjustments;
  bnScale: number;
  blockSelection: BlockSelection;
  onClose: () => void;
  /** Called with selected frames + current settings to open in filmstrip mode */
  onOpenAsProject?: (frames: ImageData[], initialConfig: GifFrameConfig) => void;
}

export function GifModal({
  gifFrames, mapGrid, palette, dithering, intensity, klussParams, adjustments, bnScale,
  blockSelection, onClose, onOpenAsProject,
}: Props) {
  const { info, frames } = gifFrames;

  const [frameStart, setFrameStart] = useState(0);
  const [frameEnd, setFrameEnd]   = useState(Math.min(info.frameCount - 1, 63));
  const [step, setStep]           = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress]   = useState(0); // 0–100
  const [statusMsg, setStatusMsg] = useState('');
  const cancelRef = useRef(false);

  const selectedFrameIdxs: number[] = [];
  for (let i = frameStart; i <= frameEnd; i += step) selectedFrameIdxs.push(i);
  const totalSelected = selectedFrameIdxs.length;

  // Show thumbnail of first selected frame
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = thumbCanvasRef.current;
    if (!canvas) return;
    const frame = frames[frameStart];
    if (!frame) return;
    canvas.width  = frame.width;
    canvas.height = frame.height;
    canvas.getContext('2d')?.putImageData(frame, 0, 0);
  }, [frames, frameStart]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setProgress(0);
    cancelRef.current = false;

    const zip   = new JSZip();
    const w     = mapGrid.wide * 128;
    const h     = mapGrid.tall * 128;
    const lookup = buildLookup(palette);

    for (let fi = 0; fi < selectedFrameIdxs.length; fi++) {
      if (cancelRef.current) break;

      const frameIdx = selectedFrameIdxs[fi];
      const srcFrame = frames[frameIdx];
      setStatusMsg(`Обработка кадра ${fi + 1} / ${selectedFrameIdxs.length}`);

      // Scale frame to target grid size via bitmap
      const bitmap = await createImageBitmap(srcFrame, {
        resizeWidth: w,
        resizeHeight: h,
        resizeQuality: 'pixelated',
        colorSpaceConversion: 'none',
      });

      const result = await processImage(bitmap, {
        dithering,
        width: w,
        height: h,
        intensity,
        bnScale,
        palette,
        adjustments,
        klussParams,
        onProgress: (pct) => {
          // inner frame progress — blend with outer
          const outerBase = (fi / selectedFrameIdxs.length) * 100;
          const outerStep = (1 / selectedFrameIdxs.length) * 100;
          setProgress(outerBase + (pct / 100) * outerStep);
        },
      });
      bitmap.close();

      const processed = result.processed;

      // Build one .dat per tile
      let tileIdx = 0;
      for (let row = 0; row < mapGrid.tall; row++) {
        for (let col = 0; col < mapGrid.wide; col++) {
          const colors  = buildTileColors(processed, col, row, lookup);
          const nbt     = buildMapNbt(colors);
          const gzipped = await gzipBytes(nbt);
          const framePad = String(fi + 1).padStart(3, '0');
          const tileSuffix = mapGrid.wide * mapGrid.tall > 1 ? `_tile${tileIdx}` : '';
          zip.file(`frame_${framePad}${tileSuffix}.dat`, gzipped);
          tileIdx++;
        }
      }

      setProgress(((fi + 1) / selectedFrameIdxs.length) * 100);
    }

    if (!cancelRef.current) {
      setStatusMsg('Создание ZIP архива…');
      const blob = await zip.generateAsync({ type: 'blob' });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: 'mapart_frames.zip' });
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg('Готово!');
    } else {
      setStatusMsg('Отменено');
    }

    setIsExporting(false);
    setProgress(0);
  }, [selectedFrameIdxs, frames, mapGrid, palette, dithering, intensity, bnScale, adjustments, klussParams]);

  return (
    <div className="gif-overlay" onClick={(e) => { if (e.target === e.currentTarget && !isExporting) onClose(); }}>
      <div className="gif-modal">
        <div className="gif-header">
          <span className="gif-title">GIF → Map Art</span>
          {!isExporting && (
            <button className="gif-close" onClick={onClose}>✕</button>
          )}
        </div>

        <div className="gif-info-row">
          <span className="gif-badge">{info.frameCount} кадров</span>
          <span className="gif-badge">{info.width}×{info.height}px</span>
          <span className="gif-badge">{(info.totalDurationMs / 1000).toFixed(1)}с</span>
        </div>

        <div className="gif-body">
          <div className="gif-thumb-wrap">
            <canvas ref={thumbCanvasRef} className="gif-thumb" />
            <span className="gif-thumb-label">Кадр {frameStart + 1}</span>
          </div>

          <div className="gif-controls">
            <label className="gif-label">
              Первый кадр
              <input
                type="range" min={0} max={info.frameCount - 1}
                value={frameStart} disabled={isExporting}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setFrameStart(v);
                  if (v > frameEnd) setFrameEnd(Math.min(v, info.frameCount - 1));
                }}
              />
              <span>{frameStart + 1}</span>
            </label>

            <label className="gif-label">
              Последний кадр
              <input
                type="range" min={frameStart} max={Math.min(info.frameCount - 1, 63)}
                value={frameEnd} disabled={isExporting}
                onChange={(e) => setFrameEnd(parseInt(e.target.value))}
              />
              <span>{frameEnd + 1}</span>
            </label>

            <label className="gif-label">
              Шаг (каждый N-й кадр)
              <input
                type="range" min={1} max={Math.max(1, Math.floor((frameEnd - frameStart) / 2))}
                value={step} disabled={isExporting}
                onChange={(e) => setStep(parseInt(e.target.value))}
              />
              <span>{step}</span>
            </label>

            <div className="gif-summary">
              Итого кадров: <strong>{totalSelected}</strong>
              {totalSelected > 64 && (
                <span className="gif-warn"> (макс 64)</span>
              )}
            </div>
          </div>
        </div>

        {isExporting && (
          <div className="gif-progress-wrap">
            <div className="gif-progress-bar">
              <div className="gif-progress-fill" style={{ width: `${progress.toFixed(1)}%` }} />
            </div>
            <span className="gif-progress-text">{statusMsg} ({progress.toFixed(0)}%)</span>
          </div>
        )}

        <div className="gif-actions">
          {isExporting ? (
            <button className="gif-btn gif-btn--cancel" onClick={() => { cancelRef.current = true; }}>
              Отмена
            </button>
          ) : (<>
            <button
              className="gif-btn gif-btn--export"
              onClick={handleExport}
              disabled={totalSelected === 0 || totalSelected > 64}
            >
              ⬇ Экспорт {totalSelected} кадров (.dat ZIP)
            </button>
            {onOpenAsProject && (
              <button
                className="gif-btn gif-btn--project"
                disabled={totalSelected === 0 || totalSelected > 64}
                onClick={() => {
                  const selected = selectedFrameIdxs.map(i => frames[i]);
                  onOpenAsProject(selected, {
                    dithering, intensity, mapMode: 'flat' as never,
                    staircaseMode: 'classic', adjustments, bnScale,
                    klussParams, blockSelection,
                  });
                }}
              >
                🎞 Открыть как проект ({totalSelected} кадров)
              </button>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}
