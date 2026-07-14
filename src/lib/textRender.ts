// Pure text-rendering engine for the map-art text tool.
//
// All functions here are framework-agnostic and operate on plain typed arrays.
// The central guarantee: `renderTextBitmap` returns a bitmap cropped to the
// exact glyph coverage, so the caller's bounding box, transform handles,
// preview and final stamp all share one consistent size. This removes the
// heuristic box/glyph mismatch that plagued the old implementation.

export type TextAlign = 'left' | 'center' | 'right';

export interface TextStyle {
  font: string;          // CSS font-family value, e.g. 'monospace' or '"Arial Black"'
  size: number;          // font size in canvas pixels
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  lineHeight: number;    // multiplier of font size (1 = tight)
  letterSpacing: number; // extra px between glyphs
  smooth: boolean;       // true = keep soft edges (lower alpha cutoff), false = crisp
}

export interface TextBitmap {
  /** Glyph coverage, 1 byte per pixel (0 or 1), row-major. */
  fill: Uint8Array;
  width: number;
  height: number;
}

const EMPTY: TextBitmap = { fill: new Uint8Array(0), width: 0, height: 0 };

function cssFont(style: TextStyle): string {
  const weight = style.bold ? '700' : '400';
  const slant = style.italic ? 'italic ' : '';
  return `${slant}${weight} ${style.size}px ${style.font}`;
}

/** Measure the advance width of a single line, honouring letter spacing. */
function lineWidth(ctx: CanvasRenderingContext2D, line: string, letterSpacing: number): number {
  if (line.length === 0) return 0;
  if (letterSpacing === 0) return ctx.measureText(line).width;
  let w = 0;
  for (const ch of line) w += ctx.measureText(ch).width + letterSpacing;
  return w - letterSpacing; // no trailing gap
}

/** Draw a single line char-by-char so letter spacing and alignment are exact. */
function drawLine(
  ctx: CanvasRenderingContext2D, line: string,
  startX: number, y: number, letterSpacing: number,
): void {
  if (letterSpacing === 0) {
    ctx.fillText(line, startX, y);
    return;
  }
  let x = startX;
  for (const ch of line) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + letterSpacing;
  }
}

/**
 * Render `value` to a coverage bitmap cropped to the exact painted bounds.
 * Returns an empty bitmap if nothing is drawn (e.g. blank input).
 */
export function renderTextBitmap(value: string, style: TextStyle): TextBitmap {
  const lines = (value.length === 0 ? ' ' : value).split('\n');
  const size = Math.max(1, style.size);
  const lineH = Math.max(1, Math.round(size * style.lineHeight));
  const pad = Math.ceil(size); // generous margin for descenders / italic overhang

  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return EMPTY;
  measure.font = cssFont(style);
  measure.textBaseline = 'top';

  const widths = lines.map(l => lineWidth(measure, l, style.letterSpacing));
  const maxW = Math.max(1, ...widths);

  const canvasW = Math.ceil(maxW) + pad * 2;
  const canvasH = lineH * lines.length + pad * 2;

  const c = document.createElement('canvas');
  c.width = canvasW;
  c.height = canvasH;
  const ctx = c.getContext('2d');
  if (!ctx) return EMPTY;
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.font = cssFont(style);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';

  for (let i = 0; i < lines.length; i++) {
    const lw = widths[i];
    let startX = pad;
    if (style.align === 'center') startX = pad + (maxW - lw) / 2;
    else if (style.align === 'right') startX = pad + (maxW - lw);
    drawLine(ctx, lines[i], startX, pad + i * lineH, style.letterSpacing);
  }

  const img = ctx.getImageData(0, 0, canvasW, canvasH);
  const cutoff = style.smooth ? 72 : 128;

  // Find painted bounds.
  let minX = canvasW, minY = canvasH, maxX = -1, maxY = -1;
  for (let y = 0; y < canvasH; y++) {
    for (let x = 0; x < canvasW; x++) {
      if (img.data[(y * canvasW + x) * 4 + 3] >= cutoff) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    // Nothing painted (e.g. a single space) — give a caret-sized box.
    const w = Math.max(1, Math.ceil(maxW));
    return { fill: new Uint8Array(w * lineH), width: w, height: lineH };
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const fill = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = img.data[((y + minY) * canvasW + (x + minX)) * 4 + 3];
      if (a >= cutoff) fill[y * w + x] = 1;
    }
  }
  return { fill, width: w, height: h };
}

/** Nearest-neighbour scale of a coverage bitmap — stays crisp at any factor. */
export function scaleMask(bm: TextBitmap, scaleX: number, scaleY: number): TextBitmap {
  if (bm.width === 0 || bm.height === 0) return bm;
  const w = Math.max(1, Math.round(bm.width * scaleX));
  const h = Math.max(1, Math.round(bm.height * scaleY));
  if (w === bm.width && h === bm.height) return bm;
  const fill = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(bm.height - 1, Math.floor((y / h) * bm.height));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(bm.width - 1, Math.floor((x / w) * bm.width));
      fill[y * w + x] = bm.fill[sy * bm.width + sx];
    }
  }
  return { fill, width: w, height: h };
}

/**
 * Dilate a coverage mask by `radius` (Euclidean) — used to build text outline.
 * Returns a new mask of the same dimensions covering glyph + outline area.
 */
export function dilateMask(fill: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const r = Math.round(radius);
  if (r <= 0) return fill.slice();
  const out = new Uint8Array(width * height);
  const r2 = r * r;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!fill[y * width + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          out[ny * width + nx] = 1;
        }
      }
    }
  }
  return out;
}
