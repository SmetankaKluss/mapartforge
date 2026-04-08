import type { PaintBlock } from '../components/PreviewCanvas';
import type { ComputedPalette } from './dithering';

export interface PatternDefinition {
  id: string;
  name: string;
  width: number;   // 1–16
  height: number;  // 1–16
  /** null = transparent/skip when painting */
  pixels: (PaintBlock | null)[];
}

export function createDefaultPattern(name = 'Паттерн 1'): PatternDefinition {
  return {
    id: crypto.randomUUID(),
    name,
    width: 4,
    height: 4,
    pixels: Array(16).fill(null),
  };
}

/** Resize a pattern, preserving existing pixels (crop or pad with null). */
export function resizePattern(p: PatternDefinition, newW: number, newH: number): PatternDefinition {
  const pixels: (PaintBlock | null)[] = [];
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      pixels.push(x < p.width && y < p.height ? p.pixels[y * p.width + x] : null);
    }
  }
  return { ...p, width: newW, height: newH, pixels };
}

function getTargetColor(shade: number, baseId: number, cp: ComputedPalette): { r: number; g: number; b: number } | null {
  let fallback: { r: number; g: number; b: number } | null = null;
  for (const c of cp.colors) {
    if (c.baseId !== baseId) continue;
    if (c.shade === shade) return { r: c.r, g: c.g, b: c.b };
    if (c.shade === 2) fallback = { r: c.r, g: c.g, b: c.b };
  }
  return fallback;
}

/**
 * Stamp the pattern once, centered at (cx, cy) — Photoshop brush style.
 * null pixels are skipped (transparent).
 */
export function paintWithPatternStamp(
  buf: ImageData,
  cx: number, cy: number,
  pattern: PatternDefinition,
  cp: ComputedPalette,
  mask?: Uint8Array | null,
): void {
  if (pattern.pixels.every(p => p === null)) return;
  const { width: w, height: h } = buf;
  const pw = pattern.width, ph = pattern.height;
  const ox = cx - Math.floor(pw / 2);
  const oy = cy - Math.floor(ph / 2);
  for (let ty = 0; ty < ph; ty++) {
    for (let tx = 0; tx < pw; tx++) {
      const px = ox + tx, py = oy + ty;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      if (mask && !mask[py * w + px]) continue;
      const block = pattern.pixels[ty * pw + tx];
      if (block === null) continue;
      const i = (py * w + px) * 4;
      if (block.baseId === -1) {
        buf.data[i] = 0; buf.data[i + 1] = 0; buf.data[i + 2] = 0; buf.data[i + 3] = 0;
      } else {
        const tc = getTargetColor(block.shade, block.baseId, cp);
        if (!tc) continue;
        buf.data[i] = tc.r; buf.data[i + 1] = tc.g; buf.data[i + 2] = tc.b; buf.data[i + 3] = 255;
      }
    }
  }
}

/**
 * Paint a circular region at (cx, cy) using a tiled pattern.
 * Pattern tiles from canvas origin (0,0) — always grid-aligned.
 * null pixels in the pattern are skipped (don't overwrite).
 */
export function paintWithPatternTile(
  buf: ImageData,
  cx: number, cy: number,
  brushSize: number,
  pattern: PatternDefinition,
  cp: ComputedPalette,
  mask?: Uint8Array | null,
  anchorX = 0, anchorY = 0,
): void {
  if (pattern.pixels.every(p => p === null)) return;
  const { width: w, height: h } = buf;
  const pw = pattern.width, ph = pattern.height;
  const r = brushSize / 2;
  const ri = Math.floor(r);
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const px = cx + dx, py = cy + dy;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      if (mask && !mask[py * w + px]) continue;
      const tx = (((px - anchorX) % pw) + pw) % pw;
      const ty = (((py - anchorY) % ph) + ph) % ph;
      const block = pattern.pixels[ty * pw + tx];
      if (block === null) continue;
      const i = (py * w + px) * 4;
      if (block.baseId === -1) {
        buf.data[i] = 0; buf.data[i + 1] = 0; buf.data[i + 2] = 0; buf.data[i + 3] = 0;
      } else {
        const tc = getTargetColor(block.shade, block.baseId, cp);
        if (!tc) continue;
        buf.data[i] = tc.r; buf.data[i + 1] = tc.g; buf.data[i + 2] = tc.b; buf.data[i + 3] = 255;
      }
    }
  }
}
