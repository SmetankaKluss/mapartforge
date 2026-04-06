import type { PaintBlock } from '../components/PreviewCanvas';
import type { ComputedPalette } from './dithering';
import { rgbToOklab, oklabDistance } from './oklab';
import type { Lab } from './oklab';

export interface GradientStop {
  t: number;        // 0.0–1.0 position along gradient axis
  block: PaintBlock;
}

// Bayer 4×4 ordered dithering matrix (values 0–15)
const BAYER_4: readonly (readonly number[])[] = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

/** Linearly interpolate two OKLab values. */
function lerpLab(a: Lab, b: Lab, t: number): Lab {
  return { L: a.L + (b.L - a.L) * t, a: a.a + (b.a - a.a) * t, b: a.b + (b.b - a.b) * t };
}

/** Return the palette color index nearest to the given OKLab value. */
function nearestPaletteIndex(lab: Lab, cp: ComputedPalette): number {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < cp.labs.length; i++) {
    const d = oklabDistance(lab, cp.labs[i]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/**
 * Given sorted stops and a t value, interpolate in OKLab space and return
 * the nearest palette color index.
 */
function interpolateStops(stops: GradientStop[], t: number, cp: ComputedPalette): number {
  if (stops.length === 0) return 0;
  if (stops.length === 1) return nearestPaletteIndex(rgbToOklab(
    cp.colors.find(c => c.baseId === stops[0].block.baseId && c.shade === stops[0].block.shade)?.r ?? 128,
    cp.colors.find(c => c.baseId === stops[0].block.baseId && c.shade === stops[0].block.shade)?.g ?? 128,
    cp.colors.find(c => c.baseId === stops[0].block.baseId && c.shade === stops[0].block.shade)?.b ?? 128,
  ), cp);

  // Clamp to edges
  if (t <= stops[0].t) return nearestPaletteIdx(stops[0].block, cp);
  if (t >= stops[stops.length - 1].t) return nearestPaletteIdx(stops[stops.length - 1].block, cp);

  // Find segment
  for (let i = 0; i < stops.length - 1; i++) {
    const s0 = stops[i], s1 = stops[i + 1];
    if (t < s0.t || t > s1.t) continue;
    const range = s1.t - s0.t;
    const alpha = range > 0 ? (t - s0.t) / range : 0;
    const lab0 = getBlockLab(s0.block, cp);
    const lab1 = getBlockLab(s1.block, cp);
    if (!lab0 || !lab1) return nearestPaletteIdx(s0.block, cp);
    return nearestPaletteIndex(lerpLab(lab0, lab1, alpha), cp);
  }
  return nearestPaletteIdx(stops[stops.length - 1].block, cp);
}

function getBlockLab(block: PaintBlock, cp: ComputedPalette): Lab | null {
  const c = cp.colors.find(c => c.baseId === block.baseId && c.shade === block.shade)
    ?? cp.colors.find(c => c.baseId === block.baseId);
  return c ? rgbToOklab(c.r, c.g, c.b) : null;
}

function nearestPaletteIdx(block: PaintBlock, cp: ComputedPalette): number {
  const c = cp.colors.find(c => c.baseId === block.baseId && c.shade === block.shade)
    ?? cp.colors.find(c => c.baseId === block.baseId);
  if (!c) return 0;
  const lab = rgbToOklab(c.r, c.g, c.b);
  return nearestPaletteIndex(lab, cp);
}

/**
 * Apply a linear gradient to buf. The gradient axis goes from startPx to endPx.
 * Each pixel's position is projected onto this axis to compute t ∈ [0,1].
 * Stops are sorted by t; colors are interpolated in OKLab space.
 * If ditheringMode='ordered', Bayer 4×4 dithering is applied to smooth transitions.
 */
export function applyGradient(
  buf: ImageData,
  startPx: { x: number; y: number },
  endPx:   { x: number; y: number },
  stops: GradientStop[],
  cp: ComputedPalette,
  ditheringMode: 'none' | 'ordered',
  mask?: Uint8Array | null,
): void {
  if (stops.length < 1) return;
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  const w = buf.width, h = buf.height;
  const dx = endPx.x - startPx.x, dy = endPx.y - startPx.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (mask && !mask[py * w + px]) continue;

      // Project pixel onto gradient axis → raw t
      let t = ((px - startPx.x) * dx + (py - startPx.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));

      if (ditheringMode === 'ordered') {
        // Bayer 4×4 ordered dithering: perturb t near stop boundaries
        const bayer = BAYER_4[py & 3][px & 3] / 16;  // 0..1
        // Find which segment t is in and its width
        let segWidth = 1;
        for (let i = 0; i < sorted.length - 1; i++) {
          if (t >= sorted[i].t && t <= sorted[i + 1].t) {
            segWidth = sorted[i + 1].t - sorted[i].t;
            break;
          }
        }
        // Add Bayer noise scaled to segment width — creates dithering at boundaries
        t = Math.max(0, Math.min(1, t + (bayer - 0.5) * segWidth * 0.8));
      }

      const idx = interpolateStops(sorted, t, cp);
      const c = cp.colors[idx];
      if (!c) continue;
      const i = (py * w + px) * 4;
      buf.data[i] = c.r; buf.data[i + 1] = c.g; buf.data[i + 2] = c.b; buf.data[i + 3] = 255;
    }
  }
}
