// Colour-matching spaces ("Better colour").
//
// Each mode embeds an sRGB colour into a 3-D vector such that plain squared
// Euclidean distance between two vectors approximates their perceived
// difference.  The dithering nearest-neighbour search then runs in that space.
//
//   rgb    — raw sRGB channels (fast, what the original mapartcraft uses)
//   oklab  — OKLab perceptual space (project default; unchanged behaviour)
//   cielab — CIE L*a*b* (CIE76 ΔE)
//   hct    — Google HCT (CAM16 hue/chroma + L* tone), embedded cylindrically
//
// The OKLab embedding is intentionally identical (L, a, b) to the historical
// `rgbToOklab`/`oklabDistance` pair so the default match results never change.

import { rgbToOklab } from './oklab';

export type ColorMatchMode = 'oklab' | 'rgb' | 'cielab' | 'hct';

export const DEFAULT_COLOR_MATCH: ColorMatchMode = 'oklab';

export const COLOR_MATCH_MODES: ColorMatchMode[] = ['oklab', 'hct', 'cielab', 'rgb'];

export function coerceColorMatchMode(v: unknown): ColorMatchMode {
  return v === 'oklab' || v === 'rgb' || v === 'cielab' || v === 'hct' ? v : DEFAULT_COLOR_MATCH;
}

// ── sRGB → linear / XYZ (D65) ─────────────────────────────────────────────

function srgbToLinear01(c8: number): number {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB byte → CIE XYZ on a 0..100 scale (D65 white). */
function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear01(r);
  const gl = srgbToLinear01(g);
  const bl = srgbToLinear01(b);
  const x = (0.41233895 * rl + 0.35762064 * gl + 0.18051042 * bl) * 100;
  const y = (0.2126729  * rl + 0.7151522  * gl + 0.0721750  * bl) * 100;
  const z = (0.01932141 * rl + 0.11916382 * gl + 0.95034478 * bl) * 100;
  return [x, y, z];
}

// ── CIE L*a*b* (D65) ──────────────────────────────────────────────────────

const LAB_E = 216 / 24389;
const LAB_K = 24389 / 27;
// D65 reference white on the same 0..100 XYZ scale used by rgbToXyz.
const XN = 95.047, YN = 100.0, ZN = 108.883;

function labF(t: number): number {
  return t > LAB_E ? Math.cbrt(t) : (LAB_K * t + 16) / 116;
}

function rgbToCielab(r: number, g: number, b: number): [number, number, number] {
  const [x, y, z] = rgbToXyz(r, g, b);
  const fx = labF(x / XN);
  const fy = labF(y / YN);
  const fz = labF(z / ZN);
  const L = 116 * fy - 16;
  const A = 500 * (fx - fy);
  const B = 200 * (fy - fz);
  return [L, A, B];
}

/** CIE L* tone from a Y luminance (0..100). */
function lstarFromY(y: number): number {
  return 116 * labF(y / YN) - 16;
}

function yFromLstar(lstar: number): number {
  const ft = (lstar + 16) / 116;
  const ft3 = ft * ft * ft;
  return 100 * (ft3 > LAB_E ? ft3 : (116 * ft - 16) / LAB_K);
}

// ── CAM16 viewing conditions (HCT) ────────────────────────────────────────
// Faithful port of material-color-utilities (Apache-2.0) default conditions.

interface ViewingConditions {
  n: number; aw: number; nbb: number; ncb: number;
  c: number; nc: number; rgbD: [number, number, number];
  fl: number; z: number;
}

function makeViewingConditions(): ViewingConditions {
  const whitePoint: [number, number, number] = [XN, YN, ZN];
  const adaptingLuminance = (200 / Math.PI) * yFromLstar(50) / 100;
  const backgroundLstar = 50;
  const surround = 2;

  const rW = whitePoint[0] *  0.401288 + whitePoint[1] * 0.650173 + whitePoint[2] * -0.051461;
  const gW = whitePoint[0] * -0.250268 + whitePoint[1] * 1.204414 + whitePoint[2] *  0.045854;
  const bW = whitePoint[0] * -0.002079 + whitePoint[1] * 0.048952 + whitePoint[2] *  0.953127;

  const f = 0.8 + surround / 10;
  const c = f >= 0.9
    ? lerp(0.59, 0.69, (f - 0.9) * 10)
    : lerp(0.525, 0.59, (f - 0.8) * 10);
  let d = f * (1 - (1 / 3.6) * Math.exp((-adaptingLuminance - 42) / 92));
  d = d > 1 ? 1 : d < 0 ? 0 : d;
  const nc = f;
  const rgbD: [number, number, number] = [
    d * (100 / rW) + 1 - d,
    d * (100 / gW) + 1 - d,
    d * (100 / bW) + 1 - d,
  ];
  const k = 1 / (5 * adaptingLuminance + 1);
  const k4 = k * k * k * k;
  const k4F = 1 - k4;
  const fl = k4 * adaptingLuminance + 0.1 * k4F * k4F * Math.cbrt(5 * adaptingLuminance);
  const n = yFromLstar(backgroundLstar) / whitePoint[1];
  const z = 1.48 + Math.sqrt(n);
  const nbb = 0.725 / Math.pow(n, 0.2);
  const ncb = nbb;

  const rgbAFactors: [number, number, number] = [
    Math.pow((fl * rgbD[0] * rW) / 100, 0.42),
    Math.pow((fl * rgbD[1] * gW) / 100, 0.42),
    Math.pow((fl * rgbD[2] * bW) / 100, 0.42),
  ];
  const rgbA: [number, number, number] = [
    (400 * rgbAFactors[0]) / (rgbAFactors[0] + 27.13),
    (400 * rgbAFactors[1]) / (rgbAFactors[1] + 27.13),
    (400 * rgbAFactors[2]) / (rgbAFactors[2] + 27.13),
  ];
  const aw = (2 * rgbA[0] + rgbA[1] + 0.05 * rgbA[2]) * nbb;

  return { n, aw, nbb, ncb, c, nc, rgbD, fl, z };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const VC = makeViewingConditions();

/**
 * HCT embedding: returns [tone, chroma·cos(hue), chroma·sin(hue)].
 * Tone is CIE L*; hue/chroma come from CAM16 forward.
 */
function rgbToHctVec(r: number, g: number, b: number): [number, number, number] {
  const [x, y, z] = rgbToXyz(r, g, b);
  const tone = lstarFromY(y);

  // CAM16 forward (cone responses → opponent signals).
  const rC = x *  0.401288 + y * 0.650173 + z * -0.051461;
  const gC = x * -0.250268 + y * 1.204414 + z *  0.045854;
  const bC = x * -0.002079 + y * 0.048952 + z *  0.953127;

  const rD = VC.rgbD[0] * rC;
  const gD = VC.rgbD[1] * gC;
  const bD = VC.rgbD[2] * bC;

  const rAF = Math.pow((VC.fl * Math.abs(rD)) / 100, 0.42);
  const gAF = Math.pow((VC.fl * Math.abs(gD)) / 100, 0.42);
  const bAF = Math.pow((VC.fl * Math.abs(bD)) / 100, 0.42);

  const rA = (Math.sign(rD) * 400 * rAF) / (rAF + 27.13);
  const gA = (Math.sign(gD) * 400 * gAF) / (gAF + 27.13);
  const bA = (Math.sign(bD) * 400 * bAF) / (bAF + 27.13);

  const a = (11 * rA - 12 * gA + bA) / 11;
  const bb = (rA + gA - 2 * bA) / 9;
  const u = (20 * rA + 20 * gA + 21 * bA) / 20;
  const p2 = (40 * rA + 20 * gA + bA) / 20;

  const atan2 = Math.atan2(bb, a);
  let hueDeg = (atan2 * 180) / Math.PI;
  if (hueDeg < 0) hueDeg += 360;
  else if (hueDeg >= 360) hueDeg -= 360;

  const ac = p2 * VC.nbb;
  const J = 100 * Math.pow(ac / VC.aw, VC.c * VC.z);

  const huePrime = hueDeg < 20.14 ? hueDeg + 360 : hueDeg;
  const eHue = 0.25 * (Math.cos((huePrime * Math.PI) / 180 + 2) + 3.8);
  const p1 = ((50000 / 13) * eHue * VC.nc * VC.ncb);
  const t = (p1 * Math.sqrt(a * a + bb * bb)) / (u + 0.305);
  const alpha = Math.pow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, VC.n), 0.73);
  const chroma = alpha * Math.sqrt(J / 100);

  const hueRad = (hueDeg * Math.PI) / 180;
  return [tone, chroma * Math.cos(hueRad), chroma * Math.sin(hueRad)];
}

// ── Public embedding ──────────────────────────────────────────────────────

/**
 * Write the 3-D match-space embedding of an sRGB colour into `out` (length ≥ 3).
 * Distances between embeddings are compared with squared Euclidean distance.
 */
export function colorCoordsInto(
  r: number, g: number, b: number, mode: ColorMatchMode, out: Float64Array,
): void {
  switch (mode) {
    case 'rgb': {
      out[0] = r; out[1] = g; out[2] = b;
      return;
    }
    case 'cielab': {
      const lab = rgbToCielab(r, g, b);
      out[0] = lab[0]; out[1] = lab[1]; out[2] = lab[2];
      return;
    }
    case 'hct': {
      const v = rgbToHctVec(r, g, b);
      out[0] = v[0]; out[1] = v[1]; out[2] = v[2];
      return;
    }
    case 'oklab':
    default: {
      const lab = rgbToOklab(r, g, b);
      out[0] = lab.L; out[1] = lab.a; out[2] = lab.b;
      return;
    }
  }
}

/** Convenience non-scratch variant (allocates). */
export function colorCoords(r: number, g: number, b: number, mode: ColorMatchMode): [number, number, number] {
  const out = new Float64Array(3);
  colorCoordsInto(r, g, b, mode, out);
  return [out[0], out[1], out[2]];
}
