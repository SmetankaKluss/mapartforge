import { useEffect, useRef, useState } from 'react';
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sprite, setSprite] = useState<HTMLImageElement | null>(null);
  const [spriteReady, setSpriteReady] = useState(false);
  const [rendering, setRendering] = useState(false);

  const isLarge = width * height > 128 * 128;

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { setSprite(img); setSpriteReady(true); };
    img.src = SPRITE_URL;
  }, []);

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
            ctx.drawImage(sprite, entry.blockId * 32, entry.csId * 32, 32, 32,
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
  }, [imageData, sprite, spriteReady, cp, blockSelection, width, height, showGrid, scale]);

  if (!imageData) {
    return (
      <div className="canvas-placeholder">
        <span>Preview will appear here</span>
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
