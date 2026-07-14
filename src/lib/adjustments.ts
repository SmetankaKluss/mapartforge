export interface ImageAdjustments {
  brightness: number; // -100 to +100
  contrast:   number; // -100 to +100
  saturation: number; // -100 to +100
  red:        number; // -100 to +100 (per-channel offset)
  green:      number; // -100 to +100
  blue:       number; // -100 to +100
}

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast:   0,
  saturation: 0,
  red:        0,
  green:      0,
  blue:       0,
};

/** Fill in any missing channel fields (back-compat for older saved data). */
export function normalizeAdjustments(adj: Partial<ImageAdjustments> | undefined | null): ImageAdjustments {
  return {
    brightness: adj?.brightness ?? 0,
    contrast:   adj?.contrast   ?? 0,
    saturation: adj?.saturation ?? 0,
    red:        adj?.red        ?? 0,
    green:      adj?.green       ?? 0,
    blue:       adj?.blue        ?? 0,
  };
}

export function isDefaultAdjustments(adj: ImageAdjustments): boolean {
  return (adj.brightness ?? 0) === 0 && (adj.contrast ?? 0) === 0 && (adj.saturation ?? 0) === 0
    && (adj.red ?? 0) === 0 && (adj.green ?? 0) === 0 && (adj.blue ?? 0) === 0;
}

/**
 * Apply brightness / contrast / saturation / per-channel RGB to a flat RGBA
 * pixel buffer. Returns a new Uint8ClampedArray (does not mutate the input).
 *
 * Order: brightness → contrast → saturation → per-channel RGB offset
 */
export function applyAdjustments(
  data: Uint8ClampedArray,
  adj: ImageAdjustments,
): Uint8ClampedArray {
  if (isDefaultAdjustments(adj)) return data;

  const out = new Uint8ClampedArray(data.length);

  // Pre-compute factors
  const brightDelta = ((adj.brightness ?? 0) / 100) * 255;
  // contrast=0 → factor=1 (identity), contrast=100 → factor=2, contrast=-100 → factor=0 (flat grey)
  const contrastFactor = ((adj.contrast ?? 0) + 100) / 100;
  // saturation=0 → factor=1, saturation=100 → factor=2, saturation=-100 → factor=0 (greyscale)
  const satFactor = ((adj.saturation ?? 0) + 100) / 100;
  // per-channel additive offsets (-100..100 → -255..255)
  const rDelta = ((adj.red   ?? 0) / 100) * 255;
  const gDelta = ((adj.green ?? 0) / 100) * 255;
  const bDelta = ((adj.blue  ?? 0) / 100) * 255;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 1. Brightness
    r += brightDelta;
    g += brightDelta;
    b += brightDelta;

    // 2. Contrast (pivot at mid-grey 128)
    r = (r - 128) * contrastFactor + 128;
    g = (g - 128) * contrastFactor + 128;
    b = (b - 128) * contrastFactor + 128;

    // 3. Saturation (interpolate between luminance and full-colour)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = lum + (r - lum) * satFactor;
    g = lum + (g - lum) * satFactor;
    b = lum + (b - lum) * satFactor;

    // 4. Per-channel RGB offset
    r += rDelta;
    g += gDelta;
    b += bDelta;

    // Clamp + copy alpha unchanged
    out[i]     = Math.max(0, Math.min(255, Math.round(r)));
    out[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    out[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    out[i + 3] = data[i + 3];
  }

  return out;
}
