import { PALETTE } from './palette';
import type { PaletteColor } from './palette';
import { rgbToOklab, oklabDistance } from './oklab';
import type { Lab } from './oklab';

export type DitheringMode =
  | 'none'
  | 'floyd-steinberg'
  | 'stucki'
  | 'jjn'
  | 'atkinson'
  | 'blue-noise'
  | 'yliluoma2';

// ── Computed-palette bundle ───────────────────────────────────────────────

export interface ComputedPalette {
  colors: PaletteColor[];
  labs:   Lab[];
}

export function buildComputedPalette(colors: PaletteColor[]): ComputedPalette {
  return { colors, labs: colors.map(c => rgbToOklab(c.r, c.g, c.b)) };
}

/** Full default palette — pre-built once at module load. */
export const DEFAULT_PALETTE: ComputedPalette = buildComputedPalette(PALETTE);

// ── Utilities ─────────────────────────────────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function findClosestColor(
  r: number, g: number, b: number,
  cp: ComputedPalette,
): { color: PaletteColor; index: number } {
  const lab = rgbToOklab(clamp(r), clamp(g), clamp(b));
  let minDist = Infinity;
  let bestIndex = 0;
  for (let i = 0; i < cp.labs.length; i++) {
    const d = oklabDistance(lab, cp.labs[i]);
    if (d < minDist) { minDist = d; bestIndex = i; }
  }
  return { color: cp.colors[bestIndex], index: bestIndex };
}

// ── Error-diffusion helpers ───────────────────────────────────────────────

/**
 * Spread quantisation error to a neighbour pixel in the working buffers.
 * Bounds-checked; `intensity` scales the total error propagated.
 */
function addErr(
  r: Float32Array, g: Float32Array, b: Float32Array,
  idx: number, total: number,
  er: number, eg: number, eb: number,
  weight: number, intensity: number,
): void {
  if (idx < 0 || idx >= total) return;
  const f = weight * intensity;
  r[idx] += er * f;
  g[idx] += eg * f;
  b[idx] += eb * f;
}

/** Initialise float working buffers from raw pixel data. */
function initBuffers(data: Uint8ClampedArray, n: number): [Float32Array, Float32Array, Float32Array] {
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    r[i] = data[i * 4];
    g[i] = data[i * 4 + 1];
    b[i] = data[i * 4 + 2];
  }
  return [r, g, b];
}

// ── Async helpers ─────────────────────────────────────────────────────────

const YIELD_ROWS = 8;
const yieldControl = (): Promise<void> => new Promise(r => setTimeout(r, 0));

export type ProgressFn = (row: number, totalRows: number) => void;

// ── Blue noise: Interleaved Gradient Noise ────────────────────────────────

function ign(x: number, y: number): number {
  return ((52.9829189 * ((0.06711056 * (x & 0xffff) + 0.00583715 * (y & 0xffff)) % 1.0)) % 1.0);
}

// ── Yliluoma #2: constrained greedy pattern dithering ────────────────────

const BAYER4 = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];

const CANDIDATE_N   = 8;
const SPREAD_FACTOR = 4;

function buildCandidateSet(targetLab: Lab, cp: ComputedPalette): PaletteColor[] {
  const dists: { c: PaletteColor; d: number }[] = cp.colors.map((c, i) => ({
    c, d: oklabDistance(cp.labs[i], targetLab),
  }));
  dists.sort((a, b) => a.d - b.d);
  const n      = Math.min(CANDIDATE_N, dists.length);
  const minD   = dists[0].d;
  const cutoff = minD * SPREAD_FACTOR;
  return dists.slice(0, n).filter(x => x.d <= cutoff || x === dists[0]).map(x => x.c);
}

function nearestInSet(r: number, g: number, b: number, candidates: PaletteColor[]): PaletteColor {
  const lab = rgbToOklab(clamp(r), clamp(g), clamp(b));
  let bestDist = Infinity, best = candidates[0];
  for (const c of candidates) {
    const d = oklabDistance(rgbToOklab(c.r, c.g, c.b), lab);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

function greedyMix(
  tR: number, tG: number, tB: number,
  k: number, candidates: PaletteColor[],
): PaletteColor[] {
  const combo: PaletteColor[] = [];
  let sumR = 0, sumG = 0, sumB = 0;
  for (let i = 0; i < k; i++) {
    const rem  = k - i;
    const ir   = Math.max(0, Math.min(255, (k * tR - sumR) / rem));
    const ig_  = Math.max(0, Math.min(255, (k * tG - sumG) / rem));
    const ib   = Math.max(0, Math.min(255, (k * tB - sumB) / rem));
    const color = nearestInSet(ir, ig_, ib, candidates);
    combo.push(color);
    sumR += color.r; sumG += color.g; sumB += color.b;
  }
  return combo;
}

function buildYliluomaMix(tR: number, tG: number, tB: number, maxK: number, cp: ComputedPalette): PaletteColor[] {
  const tRc = clamp(tR), tGc = clamp(tG), tBc = clamp(tB);
  const targetLab  = rgbToOklab(tRc, tGc, tBc);
  const candidates = buildCandidateSet(targetLab, cp);

  let bestCombo: PaletteColor[] = [candidates[0]];
  let bestDist = oklabDistance(rgbToOklab(candidates[0].r, candidates[0].g, candidates[0].b), targetLab);

  for (let k = 2; k <= maxK; k++) {
    const combo = greedyMix(tRc, tGc, tBc, k, candidates);
    const avgR = combo.reduce((s, c) => s + c.r, 0) / k;
    const avgG = combo.reduce((s, c) => s + c.g, 0) / k;
    const avgB = combo.reduce((s, c) => s + c.b, 0) / k;
    const dist = oklabDistance(rgbToOklab(avgR, avgG, avgB), targetLab);
    if (dist < bestDist) { bestDist = dist; bestCombo = combo; }
  }
  return bestCombo;
}

// ── Floyd-Steinberg (serpentine) ──────────────────────────────────────────

async function applyFloydSteinberg(
  data: Uint8ClampedArray, width: number, height: number, intensity: number, cp: ComputedPalette,
  onProgress?: ProgressFn,
): Promise<Uint8ClampedArray> {
  const out = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = initBuffers(data, width * height);
  const total = width * height;

  for (let y = 0; y < height; y++) {
    const ltr = (y & 1) === 0; // left-to-right on even rows (serpentine)
    const x0  = ltr ? 0 : width - 1;
    const x1  = ltr ? width : -1;
    const dx  = ltr ? 1 : -1;

    for (let x = x0; x !== x1; x += dx) {
      const idx = y * width + x;
      const { color } = findClosestColor(r[idx], g[idx], b[idx], cp);

      out[idx * 4]     = color.r;
      out[idx * 4 + 1] = color.g;
      out[idx * 4 + 2] = color.b;
      out[idx * 4 + 3] = 255;

      const er = clamp(r[idx]) - color.r;
      const eg = clamp(g[idx]) - color.g;
      const eb = clamp(b[idx]) - color.b;

      // Spread in scan direction (mirror coefficients for r-to-l rows)
      const fwd = dx; // +1 for ltr, -1 for rtl
      addErr(r, g, b, idx + fwd,         total, er, eg, eb, 7 / 16, intensity);
      if (y + 1 < height) {
        addErr(r, g, b, idx + width - fwd, total, er, eg, eb, 3 / 16, intensity);
        addErr(r, g, b, idx + width,       total, er, eg, eb, 5 / 16, intensity);
        addErr(r, g, b, idx + width + fwd, total, er, eg, eb, 1 / 16, intensity);
      }
    }
    if (onProgress) { onProgress(y, height); if ((y & (YIELD_ROWS - 1)) === YIELD_ROWS - 1) await yieldControl(); }
  }
  return out;
}

// ── Stucki dithering ──────────────────────────────────────────────────────
//
// Kernel (right half shown, mirrored for left):
//           * 8/42  4/42
// 2/42 4/42 8/42 4/42 2/42
// 1/42 2/42 4/42 2/42 1/42

async function applyStucki(
  data: Uint8ClampedArray, width: number, height: number, intensity: number, cp: ComputedPalette,
  onProgress?: ProgressFn,
): Promise<Uint8ClampedArray> {
  const out = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = initBuffers(data, width * height);
  const total = width * height;
  const D = 42;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const { color } = findClosestColor(r[idx], g[idx], b[idx], cp);

      out[idx * 4]     = color.r;
      out[idx * 4 + 1] = color.g;
      out[idx * 4 + 2] = color.b;
      out[idx * 4 + 3] = 255;

      const er = clamp(r[idx]) - color.r;
      const eg = clamp(g[idx]) - color.g;
      const eb = clamp(b[idx]) - color.b;

      const W = width;
      const sp = (di: number, f: number) => addErr(r, g, b, idx + di, total, er, eg, eb, f / D, intensity);

      // Same row
      if (x + 1 < width) sp(+1, 8);
      if (x + 2 < width) sp(+2, 4);
      // Row +1
      if (y + 1 < height) {
        if (x - 2 >= 0)    sp(W - 2, 2);
        if (x - 1 >= 0)    sp(W - 1, 4);
                           sp(W,     8);
        if (x + 1 < width) sp(W + 1, 4);
        if (x + 2 < width) sp(W + 2, 2);
      }
      // Row +2
      if (y + 2 < height) {
        if (x - 2 >= 0)    sp(W * 2 - 2, 1);
        if (x - 1 >= 0)    sp(W * 2 - 1, 2);
                           sp(W * 2,     4);
        if (x + 1 < width) sp(W * 2 + 1, 2);
        if (x + 2 < width) sp(W * 2 + 2, 1);
      }
    }
    if (onProgress) { onProgress(y, height); if ((y & (YIELD_ROWS - 1)) === YIELD_ROWS - 1) await yieldControl(); }
  }
  return out;
}

// ── Jarvis-Judice-Ninke dithering ─────────────────────────────────────────
//
//           * 7/48  5/48
// 3/48 5/48 7/48 5/48 3/48
// 1/48 3/48 5/48 3/48 1/48

async function applyJJN(
  data: Uint8ClampedArray, width: number, height: number, intensity: number, cp: ComputedPalette,
  onProgress?: ProgressFn,
): Promise<Uint8ClampedArray> {
  const out = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = initBuffers(data, width * height);
  const total = width * height;
  const D = 48;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const { color } = findClosestColor(r[idx], g[idx], b[idx], cp);

      out[idx * 4]     = color.r;
      out[idx * 4 + 1] = color.g;
      out[idx * 4 + 2] = color.b;
      out[idx * 4 + 3] = 255;

      const er = clamp(r[idx]) - color.r;
      const eg = clamp(g[idx]) - color.g;
      const eb = clamp(b[idx]) - color.b;

      const W = width;
      const sp = (di: number, f: number) => addErr(r, g, b, idx + di, total, er, eg, eb, f / D, intensity);

      if (x + 1 < width) sp(+1, 7);
      if (x + 2 < width) sp(+2, 5);
      if (y + 1 < height) {
        if (x - 2 >= 0)    sp(W - 2, 3);
        if (x - 1 >= 0)    sp(W - 1, 5);
                           sp(W,     7);
        if (x + 1 < width) sp(W + 1, 5);
        if (x + 2 < width) sp(W + 2, 3);
      }
      if (y + 2 < height) {
        if (x - 2 >= 0)    sp(W * 2 - 2, 1);
        if (x - 1 >= 0)    sp(W * 2 - 1, 3);
                           sp(W * 2,     5);
        if (x + 1 < width) sp(W * 2 + 1, 3);
        if (x + 2 < width) sp(W * 2 + 2, 1);
      }
    }
    if (onProgress) { onProgress(y, height); if ((y & (YIELD_ROWS - 1)) === YIELD_ROWS - 1) await yieldControl(); }
  }
  return out;
}

// ── Atkinson dithering ────────────────────────────────────────────────────

async function applyAtkinson(
  data: Uint8ClampedArray, width: number, height: number, intensity: number, cp: ComputedPalette,
  onProgress?: ProgressFn,
): Promise<Uint8ClampedArray> {
  const out = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = initBuffers(data, width * height);
  const total = width * height;
  const f = 1 / 8;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const { color } = findClosestColor(r[idx], g[idx], b[idx], cp);

      out[idx * 4]     = color.r;
      out[idx * 4 + 1] = color.g;
      out[idx * 4 + 2] = color.b;
      out[idx * 4 + 3] = 255;

      const er = clamp(r[idx]) - color.r;
      const eg = clamp(g[idx]) - color.g;
      const eb = clamp(b[idx]) - color.b;

      const W = width;
      if (x + 1 < width) addErr(r, g, b, idx + 1, total, er, eg, eb, f, intensity);
      if (x + 2 < width) addErr(r, g, b, idx + 2, total, er, eg, eb, f, intensity);
      if (y + 1 < height) {
        if (x - 1 >= 0)    addErr(r, g, b, idx + W - 1, total, er, eg, eb, f, intensity);
                           addErr(r, g, b, idx + W,     total, er, eg, eb, f, intensity);
        if (x + 1 < width) addErr(r, g, b, idx + W + 1, total, er, eg, eb, f, intensity);
      }
      if (y + 2 < height) addErr(r, g, b, idx + W * 2, total, er, eg, eb, f, intensity);
    }
    if (onProgress) { onProgress(y, height); if ((y & (YIELD_ROWS - 1)) === YIELD_ROWS - 1) await yieldControl(); }
  }
  return out;
}

// ── Edge-only dithering ───────────────────────────────────────────────────
//
// Detects flat colour regions in OKLAB space. Pixels at colour boundaries
// get serpentine FS error-diffusion; pixels in flat zones are quantised
// to nearest colour with no error propagation — giving clean solid blocks
// in illustration-style artwork.
//
// edgeSensitivity (0–1): how aggressively to treat regions as "flat".
//   0 = only hard edges dither  |  1 = almost everything dithers

export function applyEdgeOnly(
  data: Uint8ClampedArray, width: number, height: number,
  edgeSensitivity: number, cp: ComputedPalette,
): Uint8ClampedArray {
  const out   = new Uint8ClampedArray(width * height * 4);
  const total = width * height;

  // Pre-compute OKLAB for every source pixel (used for edge detection only)
  const srcLabs = new Array<Lab>(total);
  for (let i = 0; i < total; i++) {
    srcLabs[i] = rgbToOklab(
      data[i * 4], data[i * 4 + 1], data[i * 4 + 2],
    );
  }

  // Map sensitivity to a squared-OKLAB threshold.
  // 0 → 0.05 (only very sharp edges trigger dithering)
  // 1 → 0.00005 (almost all colour variation triggers dithering)
  const edgeThreshold = 0.05 * Math.pow(0.001, edgeSensitivity);

  // Error buffers for FS at edge pixels
  const er_buf = new Float32Array(total);
  const eg_buf = new Float32Array(total);
  const eb_buf = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    er_buf[i] = data[i * 4];
    eg_buf[i] = data[i * 4 + 1];
    eb_buf[i] = data[i * 4 + 2];
  }

  for (let y = 0; y < height; y++) {
    const ltr = (y & 1) === 0;
    const x0  = ltr ? 0 : width - 1;
    const x1  = ltr ? width : -1;
    const dx  = ltr ? 1 : -1;

    for (let x = x0; x !== x1; x += dx) {
      const idx = y * width + x;
      const lab = srcLabs[idx];

      // Compute max OKLAB distance to 4-connected neighbours
      let maxDist = 0;
      if (x > 0)          maxDist = Math.max(maxDist, oklabDistance(lab, srcLabs[idx - 1]));
      if (x < width - 1)  maxDist = Math.max(maxDist, oklabDistance(lab, srcLabs[idx + 1]));
      if (y > 0)          maxDist = Math.max(maxDist, oklabDistance(lab, srcLabs[idx - width]));
      if (y < height - 1) maxDist = Math.max(maxDist, oklabDistance(lab, srcLabs[idx + width]));

      if (maxDist >= edgeThreshold) {
        // ── Edge pixel: serpentine FS ──────────────────────────────────
        const { color } = findClosestColor(er_buf[idx], eg_buf[idx], eb_buf[idx], cp);
        out[idx * 4]     = color.r;
        out[idx * 4 + 1] = color.g;
        out[idx * 4 + 2] = color.b;
        out[idx * 4 + 3] = 255;

        const er = clamp(er_buf[idx]) - color.r;
        const eg = clamp(eg_buf[idx]) - color.g;
        const eb = clamp(eb_buf[idx]) - color.b;

        const fwd = dx;
        addErr(er_buf, eg_buf, eb_buf, idx + fwd,         total, er, eg, eb, 7 / 16, 1);
        if (y + 1 < height) {
          addErr(er_buf, eg_buf, eb_buf, idx + width - fwd, total, er, eg, eb, 3 / 16, 1);
          addErr(er_buf, eg_buf, eb_buf, idx + width,       total, er, eg, eb, 5 / 16, 1);
          addErr(er_buf, eg_buf, eb_buf, idx + width + fwd, total, er, eg, eb, 1 / 16, 1);
        }
      } else {
        // ── Flat pixel: nearest colour from original, no error ─────────
        const { color } = findClosestColor(
          data[idx * 4], data[idx * 4 + 1], data[idx * 4 + 2], cp,
        );
        out[idx * 4]     = color.r;
        out[idx * 4 + 1] = color.g;
        out[idx * 4 + 2] = color.b;
        out[idx * 4 + 3] = 255;
        // Zeroing error buffers prevents flat zones from bleeding into edges
        er_buf[idx] = data[idx * 4];
        eg_buf[idx] = data[idx * 4 + 1];
        eb_buf[idx] = data[idx * 4 + 2];
      }
    }
  }
  return out;
}

// ── Blue Noise + Edge Only hybrid ─────────────────────────────────────────
//
// Flat zones (low OKLAB variance between neighbours): blue noise at 4× scale.
// Colour boundaries: blue noise at 1× scale for sharp detail.
// Fixed edge threshold tuned for moderate sensitivity.

export function applyBlueNoiseEdge(
  data: Uint8ClampedArray, width: number, height: number,
  intensity: number, cp: ComputedPalette,
): Uint8ClampedArray {
  const out      = new Uint8ClampedArray(width * height * 4);
  const total    = width * height;
  const noiseAmp = intensity * 48;

  // Pre-compute OKLAB for edge detection
  const srcLabs = new Array<Lab>(total);
  for (let i = 0; i < total; i++) {
    srcLabs[i] = rgbToOklab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  }

  // Fixed threshold: moderate sensitivity (~30% on edge-only scale)
  const edgeThreshold = 0.004;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const lab = srcLabs[idx];

      let maxDist = 0;
      if (x > 0)          maxDist = Math.max(maxDist, oklabDistance(lab, srcLabs[idx - 1]));
      if (x < width - 1)  maxDist = Math.max(maxDist, oklabDistance(lab, srcLabs[idx + 1]));
      if (y > 0)          maxDist = Math.max(maxDist, oklabDistance(lab, srcLabs[idx - width]));
      if (y < height - 1) maxDist = Math.max(maxDist, oklabDistance(lab, srcLabs[idx + width]));

      // Edge → 1× (fine grain); flat → 4× (smooth blocks)
      const nx = maxDist >= edgeThreshold ? x           : Math.floor(x / 4);
      const ny = maxDist >= edgeThreshold ? y           : Math.floor(y / 4);

      const offset = (ign(nx, ny) - 0.5) * noiseAmp;
      const { color } = findClosestColor(
        data[idx * 4] + offset, data[idx * 4 + 1] + offset, data[idx * 4 + 2] + offset, cp,
      );
      out[idx * 4] = color.r; out[idx * 4 + 1] = color.g;
      out[idx * 4 + 2] = color.b; out[idx * 4 + 3] = 255;
    }
  }
  return out;
}

// ── Main entry point ──────────────────────────────────────────────────────

/**
 * @param bnScale  Pattern scale for blue-noise modes (1 | 2 | 4 | 8).
 *                 Each noise threshold covers a bnScale×bnScale block area.
 *                 Higher = less ribbing, smoother transitions. Default 2.
 */
export async function applyDithering(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mode: DitheringMode,
  intensity: number = 1.0,
  cp: ComputedPalette = DEFAULT_PALETTE,
  bnScale: number = 2,
  onProgress?: ProgressFn,
): Promise<Uint8ClampedArray> {
  if (cp.colors.length === 0) {
    console.error('[mapart] applyDithering called with empty palette — falling back to DEFAULT_PALETTE');
    cp = DEFAULT_PALETTE;
  }
  const out = new Uint8ClampedArray(width * height * 4);

  // ── Nearest colour only ────────────────────────────────────────────────
  if (mode === 'none') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const { color } = findClosestColor(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], cp);
        out[i * 4] = color.r; out[i * 4 + 1] = color.g;
        out[i * 4 + 2] = color.b; out[i * 4 + 3] = 255;
      }
      if (onProgress) { onProgress(y, height); if ((y & (YIELD_ROWS - 1)) === YIELD_ROWS - 1) await yieldControl(); }
    }
    return out;
  }

  // ── Blue noise ─────────────────────────────────────────────────────────
  if (mode === 'blue-noise') {
    const scale = intensity * 48;
    const s = Math.max(1, bnScale);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const offset = (ign(Math.floor(x / s), Math.floor(y / s)) - 0.5) * scale;
        const { color } = findClosestColor(
          data[i * 4] + offset, data[i * 4 + 1] + offset, data[i * 4 + 2] + offset, cp,
        );
        out[i * 4] = color.r; out[i * 4 + 1] = color.g;
        out[i * 4 + 2] = color.b; out[i * 4 + 3] = 255;
      }
      if (onProgress) { onProgress(y, height); if ((y & (YIELD_ROWS - 1)) === YIELD_ROWS - 1) await yieldControl(); }
    }
    return out;
  }

  // ── Yliluoma #2 ────────────────────────────────────────────────────────
  if (mode === 'yliluoma2') {
    const maxK = Math.max(1, Math.min(4, Math.round(1 + intensity * 3)));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const mix   = buildYliluomaMix(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], maxK, cp);
        const bayer = BAYER4[(y % 4) * 4 + (x % 4)];
        const color = mix[Math.floor(bayer * mix.length / 16)];
        out[i * 4] = color.r; out[i * 4 + 1] = color.g;
        out[i * 4 + 2] = color.b; out[i * 4 + 3] = 255;
      }
      if (onProgress) { onProgress(y, height); if ((y & (YIELD_ROWS - 1)) === YIELD_ROWS - 1) await yieldControl(); }
    }
    return out;
  }

  // ── Dedicated implementations ──────────────────────────────────────────
  if (mode === 'floyd-steinberg')  return applyFloydSteinberg(data, width, height, intensity, cp, onProgress);
  if (mode === 'stucki')           return applyStucki(data, width, height, intensity, cp, onProgress);
  if (mode === 'jjn')              return applyJJN(data, width, height, intensity, cp, onProgress);
  if (mode === 'atkinson')         return applyAtkinson(data, width, height, intensity, cp, onProgress);

  return out;
}
