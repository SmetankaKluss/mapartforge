import { useEffect, useRef, useState, useCallback } from 'react';
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
        <span style={{ position: 'relative', top: 36 }}>{'Preview will appear here'}</span>
      </div>
    );
  }

  return (
    <div className="canvas-wrapper">
      {(!spriteReady || rendering) && (
        <div className="block-mode-overlay">
          {!spriteReady ? 'Loading block textures…' : 'Rendering textures…'}
        </div>
      )}
      {isLarge && spriteReady && !rendering && (
        <div className="block-mode-warning">
          ⚠ Block texture mode renders {width.toLocaleString()}×{height.toLocaleString()} sprites — large grids may be slow.
        </div>
      )}
      <canvas ref={canvasRef} className="map-canvas" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}
