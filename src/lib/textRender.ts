/**
 * Editable text-layer renderer.
 *
 * Text stays as metadata in a project but every edit is also baked into the
 * layer's RGBA buffer. That keeps exports, palette processing and all existing
 * build modes on their normal image pipeline.
 */

export type TextAlign = 'left' | 'center' | 'right';

export interface TextLayerMeta {
  /** Canvas-space center of the transformed text object. */
  x: number;
  y: number;
  value: string;
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  lineHeight: number;
  letterSpacing: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  smooth: boolean;
}

export interface TextLayout {
  width: number;
  height: number;
  lineHeight: number;
  lineWidths: number[];
  pad: number;
}

export const TEXT_FONTS = [
  { label: 'MapKluss Mono', value: '"JetBrains Mono", "Cascadia Mono", "Courier New", monospace' },
  { label: 'Hardpixel', value: '"MapKluss Text Hardpixel", monospace' },
  { label: 'Press Start 2P', value: '"MapKluss Text Press Start", monospace' },
  { label: 'Tektur', value: '"MapKluss Text Tektur", sans-serif' },
  { label: 'Handjet', value: '"MapKluss Text Handjet", monospace' },
  { label: 'Jura', value: '"MapKluss Text Jura", sans-serif' },
  { label: 'Russo One', value: '"MapKluss Text Russo", sans-serif' },
  { label: 'Rubik Mono One', value: '"MapKluss Text Rubik Mono", sans-serif' },
  { label: 'Unbounded', value: '"MapKluss Text Unbounded", sans-serif' },
  { label: 'IBM Plex Mono', value: '"MapKluss Text IBM Plex Mono", monospace' },
  { label: 'Fira Code', value: '"MapKluss Text Fira Code", monospace' },
  { label: 'PT Mono', value: '"MapKluss Text PT Mono", monospace' },
  { label: 'Play', value: '"MapKluss Text Play", sans-serif' },
  { label: 'Sans', value: 'system-ui, Arial, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, sans-serif' },
  { label: 'Round', value: '"Trebuchet MS", Verdana, sans-serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
] as const;

const LOCAL_TEXT_FONT_VALUES = new Set<string>(TEXT_FONTS.slice(1, 13).map(font => font.value));

/** Load a bundled face before a canvas redraw; returns true only after a new load. */
export async function ensureTextFont(font: string): Promise<boolean> {
  if (!LOCAL_TEXT_FONT_VALUES.has(font) || typeof document === 'undefined' || !document.fonts) return false;
  const descriptor = `400 16px ${font}`;
  const sample = 'MapKluss Текст Ёё';
  if (document.fonts.check(descriptor, sample)) return false;
  try {
    await document.fonts.load(descriptor, sample);
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_META: Omit<TextLayerMeta, 'x' | 'y'> = {
  value: 'Text',
  font: TEXT_FONTS[0].value,
  size: 24,
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
  fillColor: '#ffffff',
  strokeColor: '#101116',
  strokeWidth: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  smooth: true,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function textAlign(value: unknown): TextAlign {
  return value === 'center' || value === 'right' ? value : 'left';
}

function cssFont(meta: TextLayerMeta): string {
  return `${meta.italic ? 'italic ' : ''}${meta.bold ? '700' : '400'} ${meta.size}px ${meta.font}`;
}

function lineWidth(ctx: CanvasRenderingContext2D, value: string, spacing: number): number {
  if (!value) return 0;
  if (!spacing) return ctx.measureText(value).width;
  let width = 0;
  for (const character of value) width += ctx.measureText(character).width + spacing;
  return width - spacing;
}

function drawLine(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, spacing: number, stroke: boolean): void {
  if (!spacing) {
    if (stroke) ctx.strokeText(value, x, y);
    else ctx.fillText(value, x, y);
    return;
  }
  let cursor = x;
  for (const character of value) {
    if (stroke) ctx.strokeText(character, cursor, y);
    else ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + spacing;
  }
}

/** A normalized, safe metadata object. Also migrates the previous px/py form. */
export function normalizeTextMeta(value: unknown, fallbackX = 0, fallbackY = 0): TextLayerMeta {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const legacyFill = raw.fillBlock && typeof raw.fillBlock === 'object'
    ? raw.fillBlock as Record<string, unknown>
    : null;
  const legacyColor = legacyFill && typeof legacyFill.color === 'string' ? legacyFill.color : undefined;
  return {
    x: finite(raw.x ?? raw.px, fallbackX),
    y: finite(raw.y ?? raw.py, fallbackY),
    value: typeof raw.value === 'string' ? raw.value.slice(0, 2_000) : DEFAULT_META.value,
    font: typeof raw.font === 'string' && raw.font.length <= 160 ? raw.font : DEFAULT_META.font,
    size: clamp(finite(raw.size, DEFAULT_META.size), 4, 1_024),
    bold: Boolean(raw.bold),
    italic: Boolean(raw.italic),
    underline: Boolean(raw.underline),
    align: textAlign(raw.align),
    lineHeight: clamp(finite(raw.lineHeight, DEFAULT_META.lineHeight), 0.7, 4),
    letterSpacing: clamp(finite(raw.letterSpacing, DEFAULT_META.letterSpacing), -8, 80),
    fillColor: color(raw.fillColor ?? legacyColor, DEFAULT_META.fillColor),
    strokeColor: color(raw.strokeColor, DEFAULT_META.strokeColor),
    strokeWidth: clamp(finite(raw.strokeWidth, DEFAULT_META.strokeWidth), 0, 64),
    scaleX: clamp(finite(raw.scaleX, DEFAULT_META.scaleX), 0.08, 64),
    scaleY: clamp(finite(raw.scaleY, DEFAULT_META.scaleY), 0.08, 64),
    rotation: ((finite(raw.rotation, DEFAULT_META.rotation) % 360) + 360) % 360,
    smooth: raw.smooth !== false,
  };
}

export function createTextMeta(x: number, y: number, value = 'Text'): TextLayerMeta {
  return { ...DEFAULT_META, x, y, value };
}

export function getTextLayout(metaInput: TextLayerMeta): TextLayout {
  const meta = normalizeTextMeta(metaInput, metaInput.x, metaInput.y);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: 1, height: 1, lineHeight: 1, lineWidths: [1], pad: 0 };
  ctx.font = cssFont(meta);
  ctx.textBaseline = 'top';
  const lines = (meta.value || ' ').split('\n');
  const lineHeight = Math.max(1, Math.ceil(meta.size * meta.lineHeight));
  const lineWidths = lines.map(line => lineWidth(ctx, line, meta.letterSpacing));
  const maxWidth = Math.max(1, ...lineWidths);
  const pad = Math.ceil(meta.size * 0.55 + meta.strokeWidth + 3);
  return {
    width: Math.max(1, Math.ceil(maxWidth + pad * 2)),
    height: Math.max(1, Math.ceil(lineHeight * lines.length + pad * 2)),
    lineHeight,
    lineWidths,
    pad,
  };
}

function makeTextBitmap(metaInput: TextLayerMeta): HTMLCanvasElement {
  const meta = normalizeTextMeta(metaInput, metaInput.x, metaInput.y);
  const layout = getTextLayout(meta);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = cssFont(meta);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = meta.fillColor;
  ctx.strokeStyle = meta.strokeColor;
  ctx.lineWidth = meta.strokeWidth * 2;
  ctx.lineJoin = 'round';
  const lines = (meta.value || ' ').split('\n');
  const maxWidth = Math.max(1, ...layout.lineWidths);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lineWidthValue = layout.lineWidths[index];
    const offset = meta.align === 'center'
      ? (maxWidth - lineWidthValue) / 2
      : meta.align === 'right'
      ? maxWidth - lineWidthValue
      : 0;
    const x = layout.pad + offset;
    const y = layout.pad + index * layout.lineHeight;
    if (meta.strokeWidth > 0) drawLine(ctx, line, x, y, meta.letterSpacing, true);
    drawLine(ctx, line, x, y, meta.letterSpacing, false);
    if (meta.underline && lineWidthValue > 0) {
      ctx.fillRect(x, y + meta.size + Math.max(1, Math.round(meta.size * 0.08)), lineWidthValue, Math.max(1, Math.round(meta.size * 0.06)));
    }
  }
  if (!meta.smooth) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 3; index < pixels.data.length; index += 4) pixels.data[index] = pixels.data[index] >= 128 ? 255 : 0;
    ctx.putImageData(pixels, 0, 0);
  }
  return canvas;
}

/** Render a text object to a full-size transparent layer ready for the normal export pipeline. */
export function renderTextLayer(metaInput: TextLayerMeta, width: number, height: number): ImageData {
  const meta = normalizeTextMeta(metaInput, width / 2, height / 2);
  const source = makeTextBitmap(meta);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new ImageData(width, height);
  ctx.imageSmoothingEnabled = meta.smooth;
  ctx.save();
  ctx.translate(meta.x, meta.y);
  ctx.rotate((meta.rotation * Math.PI) / 180);
  ctx.scale(meta.scaleX, meta.scaleY);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  ctx.restore();
  return ctx.getImageData(0, 0, width, height);
}

/** Transforms a screen-space vector into the unrotated text object's local axes. */
export function textLocalVector(x: number, y: number, rotation: number): { x: number; y: number } {
  const radians = (-rotation * Math.PI) / 180;
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  };
}
