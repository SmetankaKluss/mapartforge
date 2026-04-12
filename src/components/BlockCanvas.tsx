import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocale } from '../lib/locale';
import type { ComputedPalette } from '../lib/dithering';
import type { BlockSelection } from '../lib/paletteBlocks';
import { COLOUR_ROWS } from '../lib/paletteBlocks';

export const SPRITE_URL =
  'https://raw.githubusercontent.com/rebane2001/mapartcraft/master/src/images/textures.png';

interface Props {
  imageData: ImageData | null;
  cp: ComputedPalette;
  blockSelection: BlockSelection;
  width: number;
  height: number;
  showGrid: boolean;
  scale: number;
}

// ── Sprite cell bounds analysis ───────────────────────────────────────────
// Scans each 32×32 sprite cell to find the first and last non-transparent
// pixel rows.  Used to scale carpet / thin-texture blocks so they fill the
// full block area rather than rendering as a narrow horizontal strip.

interface CellBounds { y: number; h: number }

function analyzeSpriteCells(sprite: HTMLImageElement): Map<string, CellBounds> {
  const CELL = 32;
  const offscreen = document.createElement('canvas');
  offscreen.width  = sprite.naturalWidth;
  offscreen.height = sprite.naturalHeight;
  const ctx = offscreen.getContext('2d')!;
  ctx.drawImage(sprite, 0, 0);
  const { data } = ctx.getImageData(0, 0, sprite.naturalWidth, sprite.naturalHeight);
  const cols = Math.floor(sprite.naturalWidth  / CELL);
  const rows = Math.floor(sprite.naturalHeight / CELL);
  const map  = new Map<string, CellBounds>();

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      let first = CELL, last = -1;
      outer: for (let py = 0; py < CELL; py++) {
        for (let px = 0; px < CELL; px++) {
          const alpha = data[((row * CELL + py) * sprite.naturalWidth + (col * CELL + px)) * 4 + 3];
          if (alpha > 16) {
            if (py < first) first = py;
            last = py;
            if (py < first) continue outer; // keep scanning downward
          }
        }
      }
      if (last >= first) {
        map.set(`${col}_${row}`, { y: row * CELL + first, h: last - first + 1 });
      }
    }
  }
  return map;
}

// ── Colour → palette entry lookup ─────────────────────────────────────────

function buildLookup(cp: ComputedPalette, sel: BlockSelection): Map<number, { csId: number; blockId: number }> {
  const map = new Map<number, { csId: number; blockId: number }>();
  for (const c of cp.colors) {
    const key = (c.r << 16) | (c.g << 8) | c.b;
    if (map.has(key)) continue;
    const row = COLOUR_ROWS.find(r => r.baseId === c.baseId);
    if (!row) continue;
    const activeIds = sel[row.csId] ?? [];
    const blockId = activeIds[0] ?? (row.blocks[0]?.blockId ?? 0);
    map.set(key, { csId: row.csId, blockId });
  }
  return map;
}

export function BlockCanvas({ imageData, cp, blockSelection, width, height, showGrid, scale }: Props) {
  const { t } = useLocale();
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const [sprite,      setSprite]      = useState<HTMLImageElement | null>(null);
  const [spriteBounds, setSpriteBounds] = useState<Map<string, CellBounds> | null>(null);
  const [spriteReady, setSpriteReady] = useState(false);
  const [rendering,   setRendering]   = useState(false);

  const isLarge = width * height > 128 * 128;

  // Analyze the sprite cell bounds once on load so that thin textures
  // (e.g. carpets) are scaled to fill the full block area.
  const onSpriteLoad = useCallback((img: HTMLImageElement) => {
    setSprite(img);
    setSpriteBounds(analyzeSpriteCells(img));
    setSpriteReady(true);
  }, []);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => onSpriteLoad(img);
    img.src = SPRITE_URL;
  }, [onSpriteLoad]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageData || !sprite || !spriteReady) return;

    setRendering(true);

    // requestAnimationFrame lets React paint the "Rendering…" state before
    // we start the expensive synchronous draw loop.
    const rafId = requestAnimationFrame(() => {
      const lookup = buildLookup(cp, blockSelection);
      const ctx = canvas.getContext('2d')!;
      canvas.width  = width  * scale;
      canvas.height = height * scale;
      ctx.imageSmoothingEnabled = false;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const r = imageData.data[i], g = imageData.data[i + 1], b = imageData.data[i + 2];
          const entry = lookup.get((r << 16) | (g << 8) | b);
          if (entry) {
            // Use analyzed bounds so thin textures (carpets etc.) scale to
            // fill the full block area instead of rendering as a slim strip.
            const bounds = spriteBounds?.get(`${entry.blockId}_${entry.csId}`);
            const srcY = bounds ? bounds.y      : entry.csId * 32;
            const srcH = bounds ? bounds.h      : 32;
            ctx.drawImage(sprite, entry.blockId * 32, srcY, 32, srcH,
              x * scale, y * scale, scale, scale);
          } else {
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x * scale, y * scale, scale, scale);
          }
        }
      }

      if (showGrid) {
        const mapsWide = width  / 128;
        const mapsTall = height / 128;
        if (mapsWide > 1 || mapsTall > 1) {
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = 2;
          for (let mx = 1; mx < mapsWide; mx++) {
            const px = mx * 128 * scale;
            ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, height * scale); ctx.stroke();
          }
          for (let my = 1; my < mapsTall; my++) {
            const py = my * 128 * scale;
            ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(width * scale, py); ctx.stroke();
          }
        }
      }

      setRendering(false);
    });

    return () => cancelAnimationFrame(rafId);
  }, [imageData, sprite, spriteBounds, spriteReady, cp, blockSelection, width, height, showGrid, scale]);

  if (!imageData) {
    return (
      <div className="canvas-placeholder">
        <svg className="ph-icon" width="80" height="80" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Corner brackets */}
          <rect x="0" y="0" width="8" height="2" fill="#57FF6E" opacity="0.5"/><rect x="0" y="0" width="2" height="8" fill="#57FF6E" opacity="0.5"/>
          <rect x="64" y="0" width="8" height="2" fill="#57FF6E" opacity="0.5"/><rect x="70" y="0" width="2" height="8" fill="#57FF6E" opacity="0.5"/>
          <rect x="0" y="70" width="8" height="2" fill="#57FF6E" opacity="0.5"/><rect x="0" y="64" width="2" height="8" fill="#57FF6E" opacity="0.5"/>
          <rect x="64" y="70" width="8" height="2" fill="#57FF6E" opacity="0.5"/><rect x="70" y="64" width="2" height="8" fill="#57FF6E" opacity="0.5"/>
          {/* Tree canopy — oval: narrow top, wide middle, narrow bottom */}
          <rect x="24" y="8" width="6" height="6" fill="#57FF6E" opacity="0.6"/>
          <rect x="30" y="8" width="6" height="6" fill="#57FF6E" opacity="0.72"/>
          <rect x="36" y="8" width="6" height="6" fill="#57FF6E" opacity="0.6"/>
          {/* canopy widest row */}
          <rect x="18" y="14" width="6" height="6" fill="#57FF6E" opacity="0.5"/>
          <rect x="24" y="14" width="6" height="6" fill="#57FF6E" opacity="0.65"/>
          <rect x="30" y="14" width="6" height="6" fill="#57FF6E" opacity="0.75"/>
          <rect x="36" y="14" width="6" height="6" fill="#57FF6E" opacity="0.65"/>
          <rect x="42" y="14" width="6" height="6" fill="#57FF6E" opacity="0.5"/>
          {/* canopy bottom row */}
          <rect x="24" y="20" width="6" height="6" fill="#57FF6E" opacity="0.6"/>
          <rect x="30" y="20" width="6" height="6" fill="#57FF6E" opacity="0.7"/>
          <rect x="36" y="20" width="6" height="6" fill="#57FF6E" opacity="0.6"/>
          {/* grass ground + trunk */}
          <rect x="12" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/>
          <rect x="18" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/>
          <rect x="24" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/>
          <rect x="30" y="26" width="6" height="6" fill="#7B4A1B" opacity="0.85"/>
          <rect x="36" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/>
          <rect x="42" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/>
          <rect x="48" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/>
          <rect x="54" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/>
          {/* row 4 — dirt */}
          <rect x="12" y="32" width="6" height="6" fill="#8B6040" opacity="0.5"/>
          <rect x="18" y="32" width="6" height="6" fill="#C8922A" opacity="0.5"/>
          <rect x="24" y="32" width="6" height="6" fill="#8B6040" opacity="0.5"/>
          <rect x="30" y="32" width="6" height="6" fill="#8B6040" opacity="0.55"/>
          <rect x="36" y="32" width="6" height="6" fill="#8B6040" opacity="0.5"/>
          <rect x="42" y="32" width="6" height="6" fill="#C8922A" opacity="0.45"/>
          <rect x="48" y="32" width="6" height="6" fill="#8B6040" opacity="0.45"/>
          <rect x="54" y="32" width="6" height="6" fill="#8B6040" opacity="0.4"/>
          {/* row 5 — stone */}
          <rect x="12" y="38" width="6" height="6" fill="#555" opacity="0.32"/>
          <rect x="18" y="38" width="6" height="6" fill="#555" opacity="0.28"/>
          <rect x="24" y="38" width="6" height="6" fill="#555" opacity="0.32"/>
          <rect x="30" y="38" width="6" height="6" fill="#555" opacity="0.28"/>
          <rect x="36" y="38" width="6" height="6" fill="#555" opacity="0.32"/>
          <rect x="42" y="38" width="6" height="6" fill="#555" opacity="0.28"/>
          <rect x="48" y="38" width="6" height="6" fill="#555" opacity="0.32"/>
          <rect x="54" y="38" width="6" height="6" fill="#555" opacity="0.28"/>
          {/* Down arrow */}
          <rect x="33" y="50" width="6" height="8" fill="#57FF6E" opacity="0.35"/>
          <rect x="27" y="54" width="18" height="4" fill="#57FF6E" opacity="0.3"/>
          <rect x="30" y="58" width="12" height="4" fill="#57FF6E" opacity="0.25"/>
          <rect x="33" y="62" width="6" height="3" fill="#57FF6E" opacity="0.2"/>
        </svg>
        <p className="ph-title">Перетащи изображение сюда</p>
        <p className="ph-hint">или нажми для выбора файла · Ctrl+V</p>
      </div>
    );
  }

  return (
    <div className="canvas-wrapper">
      {(!spriteReady || rendering) && (
        <div className="block-mode-overlay">
          {!spriteReady ? t('Загрузка текстур блоков…', 'Loading block textures…') : t('Рендеринг текстур…', 'Rendering textures…')}
        </div>
      )}
      {isLarge && spriteReady && !rendering && (
        <div className="block-mode-warning">
          ⚠ {t(`Режим текстур блоков отображает ${width.toLocaleString()}×${height.toLocaleString()} спрайтов — большие сетки могут быть медленными.`, `Block texture mode renders ${width.toLocaleString()}×${height.toLocaleString()} sprites — large grids may be slow.`)}
        </div>
      )}
      <canvas ref={canvasRef} className="map-canvas" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}
