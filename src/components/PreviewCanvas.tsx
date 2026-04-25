import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { MapCanvas, drawImageData } from './MapCanvas';
import { type SelectionMask, maskFromRect, maskFromPolygon, maskFromFloodFill, unionMask, subtractMask, drawMarchingAnts } from '../lib/selectionMask';
import { BlockCanvas } from './BlockCanvas';
import { SPRITE_URL } from './BlockCanvas';
import { BlockIcon } from './BlockIcon';
import { BlockPickerPopup } from './BlockPickerPopup';
import { COLOUR_ROWS } from '../lib/paletteBlocks';
import { paintWithPatternTile, paintWithPatternStamp } from '../lib/patternTool';
import type { PatternDefinition } from '../lib/patternTool';
import { applyGradient } from '../lib/gradientTool';
import type { GradientStop } from '../lib/gradientTool';

import type { BlockSelection } from '../lib/paletteBlocks';
import type { ComputedPalette } from '../lib/dithering';
import { rgbToOklab, oklabDistance } from '../lib/oklab';

// ── Exported types ────────────────────────────────────────────────────────────

export type PaintTool = 'eyedropper' | 'brush' | 'fill' | 'eraser' | 'pattern' | 'text'
  | 'select-rect' | 'select-lasso' | 'select-magic' | 'select-pixel'
  | 'pattern-tile' | 'gradient' | 'move';

export interface PaintBlock {
  csId: number;
  blockId: number;
  baseId: number;
  /** Map shade (0=dark/down, 1=flat, 2=bright/up). Used by brush in 3D mode. */
  shade: number;
  displayName: string;
  colourName: string;
}

/** Sentinel value: painting with this block erases pixels (alpha = 0). */
export const TRANSPARENT_PAINT_BLOCK: PaintBlock = {
  csId: -1, blockId: -1, baseId: -1, shade: 1,
  displayName: 'Transparent', colourName: 'Air',
};

// ── Text fonts ────────────────────────────────────────────────────────────────

export const TEXT_FONTS = [
  { label: 'Monospace', value: 'monospace' },
  { label: 'Sans-serif', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Courier New', value: '"Courier New"' },
  { label: 'Impact', value: 'Impact' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Arial Black', value: '"Arial Black"' },
];

// ── Internal types ────────────────────────────────────────────────────────────

interface HoverInfo {
  pixelX: number;
  pixelY: number;
  r: number;
  g: number;
  b: number;
  baseId: number;
  shade: number;
  csId: number;
  blockId: number;
  displayName: string;
  colourName: string;
}

interface RepaintEntry {
  csId: number;
  blockId: number;
  nbtName: string;
  displayName: string;
  baseId: number;
  dist: number;
}

type CanvasDrag = {
  type: 'move' | 'tl' | 'tr' | 'bl' | 'br';
  startPx: number; startPy: number;
  startScaleX: number; startScaleY: number;
  startMouseX: number; startMouseY: number;  // viewport clientX/Y
  baseW: number; baseH: number;
};

type TextState = {
  px: number; py: number;
  value: string; font: string; size: number;
  strokeWidth: number; strokeBlock: PaintBlock | null;
  scaleX: number; scaleY: number;
} | null;

interface Props {
  mode: 'pixel' | 'block';
  imageData: ImageData | null;     // composite of all visible layers — for display & tooltips
  paintData: ImageData | null;     // active layer only — for painting operations
  originalData: ImageData | null;
  showOriginal: boolean;
  showGrid: boolean;
  width: number;
  height: number;
  scale: number;
  cp: ComputedPalette;
  blockSelection: BlockSelection;
  activeTool: PaintTool | null;
  paintBlock: PaintBlock | null;
  patternBlocks: PaintBlock[];
  brushSize: number;
  textSize: number;
  otherLayersData?: ImageData | null;
  onRemoveBlock: (csId: number) => void;
  onImageUpdate: (data: ImageData) => void;
  onToolChange: (tool: PaintTool | null) => void;
  onPaintBlockChange: (block: PaintBlock) => void;
  onTextCommit?: (textImageData: ImageData, layerName: string) => void;
  splitPos?: number;
  onSplitPosChange?: (p: number) => void;
  selectionMask?: SelectionMask | null;
  onSelectionChange?: (mask: SelectionMask | null) => void;
  activePattern?: PatternDefinition | null;
  patternAnchorMode?: 'canvas' | 'brush';
  gradientStops?: GradientStop[];
  gradientDithering?: 'none' | 'ordered';
  overlayRef?: React.RefObject<HTMLCanvasElement | null>;
  onZoomWheel?: (e: WheelEvent) => void;
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

type LookupEntry = {
  baseId: number; shade: number; csId: number;
  blockId: number; displayName: string; colourName: string;
};

function buildColorLookup(cp: ComputedPalette, sel: BlockSelection): Map<number, LookupEntry> {
  const map = new Map<number, LookupEntry>();
  for (let i = 0; i < cp.colors.length; i++) {
    const c = cp.colors[i];
    const key = (c.r << 16) | (c.g << 8) | c.b;
    if (map.has(key)) continue;
    const row = COLOUR_ROWS.find(r => r.baseId === c.baseId);
    if (!row) continue;
    const activeIds = sel[row.csId] ?? [];
    const block = row.blocks.find(b => activeIds.includes(b.blockId)) ?? row.blocks[0];
    if (!block) continue;
    map.set(key, {
      baseId: c.baseId, shade: c.shade, csId: row.csId,
      blockId: block.blockId, displayName: block.displayName, colourName: row.colourName,
    });
  }
  return map;
}

function buildRepaintEntries(r: number, g: number, b: number, cp: ComputedPalette, sel: BlockSelection): RepaintEntry[] {
  const hoveredLab = rgbToOklab(r, g, b);
  const seen = new Set<number>();
  const entries: RepaintEntry[] = [];
  const repShade = cp.colors.some(c => c.shade === 2) ? 2 : 1;
  for (let i = 0; i < cp.colors.length; i++) {
    const c = cp.colors[i];
    if (c.shade !== repShade) continue;
    const row = COLOUR_ROWS.find(row => row.baseId === c.baseId);
    if (!row || seen.has(row.csId)) continue;
    seen.add(row.csId);
    const activeIds = sel[row.csId] ?? [];
    const blockId = activeIds[0] ?? (row.blocks[0]?.blockId ?? 0);
    const block = row.blocks.find(b => b.blockId === blockId) ?? row.blocks[0];
    if (!block) continue;
    entries.push({ csId: row.csId, blockId: block.blockId, nbtName: block.nbtName, displayName: block.displayName, baseId: c.baseId, dist: oklabDistance(hoveredLab, cp.labs[i]) });
  }
  return entries.sort((a, b) => a.dist - b.dist);
}

// ── Paint helpers (operate on a mutable ImageData buffer) ────────────────────

function getTargetColor(shade: number, targetBaseId: number, cp: ComputedPalette): { r: number; g: number; b: number } | null {
  let fallback: { r: number; g: number; b: number } | null = null;
  for (const c of cp.colors) {
    if (c.baseId !== targetBaseId) continue;
    if (c.shade === shade) return { r: c.r, g: c.g, b: c.b };
    if (c.shade === 2) fallback = { r: c.r, g: c.g, b: c.b };
  }
  return fallback;
}

function paintPixelInBuffer(
  buf: ImageData, px: number, py: number,
  targetBaseId: number, targetShade: number,
  cp: ComputedPalette,
  mask?: SelectionMask | null,
): void {
  if (mask && !mask[py * buf.width + px]) return;
  const i = (py * buf.width + px) * 4;
  const tc = getTargetColor(targetShade, targetBaseId, cp);
  if (!tc) return;
  buf.data[i] = tc.r; buf.data[i + 1] = tc.g; buf.data[i + 2] = tc.b; buf.data[i + 3] = 255;
}

function erasePixelInBuffer(buf: ImageData, px: number, py: number, mask?: SelectionMask | null): void {
  if (mask && !mask[py * buf.width + px]) return;
  const i = (py * buf.width + px) * 4;
  buf.data[i] = 0; buf.data[i + 1] = 0; buf.data[i + 2] = 0; buf.data[i + 3] = 0;
}

/** Paint a circular brush stroke at (cx, cy). */
function paintBrushCircle(
  buf: ImageData, cx: number, cy: number, brushSize: number,
  erase: boolean, baseId: number, shade: number, cp: ComputedPalette,
  mask?: SelectionMask | null,
): void {
  const r = brushSize / 2;        // half-integer for odd sizes → perfect circles
  const ri = Math.floor(r);       // = (brushSize-1)/2 for odd sizes
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const bx = cx + dx, by = cy + dy;
      if (bx < 0 || bx >= buf.width || by < 0 || by >= buf.height) continue;
      if (erase) erasePixelInBuffer(buf, bx, by, mask);
      else paintPixelInBuffer(buf, bx, by, baseId, shade, cp, mask);
    }
  }
}

/** Pattern brush — randomly picks a block from patternBlocks[] for each pixel. */
function paintPatternBrush(
  buf: ImageData, cx: number, cy: number, brushSize: number,
  patternBlocks: PaintBlock[],
  cp: ComputedPalette,
  mask?: SelectionMask | null,
): void {
  if (patternBlocks.length === 0) return;
  const r = brushSize / 2;
  const ri = Math.floor(r);
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const bx = cx + dx, by = cy + dy;
      if (bx < 0 || bx >= buf.width || by < 0 || by >= buf.height) continue;
      const block = patternBlocks[Math.floor(Math.random() * patternBlocks.length)];
      if (block.baseId === -1) erasePixelInBuffer(buf, bx, by, mask);
      else paintPixelInBuffer(buf, bx, by, block.baseId, block.shade, cp, mask);
    }
  }
}

/** Returns unscaled text canvas dimensions. */
function getTextBaseSize(text: string, size: number) {
  const fs = Math.max(4, size);
  return {
    baseW: Math.ceil(fs * (text || ' ').length * 0.75) + fs * 2,
    baseH: Math.ceil(fs * 1.6),
  };
}

/** Render text onto buf at (originX, originY) using the active paintBlock color, with optional stroke and scale. */
function stampText(
  buf: ImageData, text: string, originX: number, originY: number,
  textSize: number, font: string, paintBlock: PaintBlock,
  strokeWidth: number, strokeBlock: PaintBlock | null,
  scaleX: number, scaleY: number,
  cp: ComputedPalette,
): void {
  if (!getTargetColor(paintBlock.shade, paintBlock.baseId, cp) && paintBlock.baseId !== -1) return;
  const tc2d = document.createElement('canvas');
  const fontSize = Math.max(4, textSize);
  tc2d.width  = Math.ceil(fontSize * text.length * 0.75) + fontSize * 2;
  tc2d.height = Math.ceil(fontSize * 1.6);
  const ctx = tc2d.getContext('2d')!;
  ctx.clearRect(0, 0, tc2d.width, tc2d.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fontSize}px ${font}`;
  ctx.textBaseline = 'top';
  ctx.fillText(text, 0, 0);
  // Apply scale
  const scaledW = Math.max(1, Math.round(tc2d.width * scaleX));
  const scaledH = Math.max(1, Math.round(tc2d.height * scaleY));
  const scaled = document.createElement('canvas');
  scaled.width = scaledW; scaled.height = scaledH;
  const scaledCtx = scaled.getContext('2d')!;
  scaledCtx.imageSmoothingEnabled = false;
  scaledCtx.drawImage(tc2d, 0, 0, scaledW, scaledH);
  const src = scaled.getContext('2d')!.getImageData(0, 0, scaledW, scaledH);

  // First pass: stroke dilation
  const sw = Math.round(strokeWidth);
  if (sw > 0 && strokeBlock && strokeBlock.baseId !== -1) {
    for (let sy = 0; sy < src.height; sy++) {
      for (let sx = 0; sx < src.width; sx++) {
        if (src.data[(sy * src.width + sx) * 4 + 3] < 64) continue;
        for (let dy = -sw; dy <= sw; dy++) {
          for (let dx = -sw; dx <= sw; dx++) {
            if (dx * dx + dy * dy > sw * sw) continue;
            const bx = originX + sx + dx, by = originY + sy + dy;
            if (bx < 0 || bx >= buf.width || by < 0 || by >= buf.height) continue;
            paintPixelInBuffer(buf, bx, by, strokeBlock.baseId, strokeBlock.shade, cp);
          }
        }
      }
    }
  }

  // Second pass: text pixels on top
  for (let sy = 0; sy < src.height; sy++) {
    for (let sx = 0; sx < src.width; sx++) {
      if (src.data[(sy * src.width + sx) * 4 + 3] < 64) continue;
      const bx = originX + sx, by = originY + sy;
      if (bx < 0 || bx >= buf.width || by < 0 || by >= buf.height) continue;
      if (paintBlock.baseId === -1) erasePixelInBuffer(buf, bx, by);
      else paintPixelInBuffer(buf, bx, by, paintBlock.baseId, paintBlock.shade, cp);
    }
  }
}

function floodFill(
  buf: ImageData, startX: number, startY: number,
  srcBaseId: number, srcShade: number,
  tgtBaseId: number, tgtShade: number,
  cp: ComputedPalette, colorLookup: Map<number, { baseId: number; shade: number }>,
  mask?: SelectionMask | null,
): void {
  if (srcBaseId === tgtBaseId && srcShade === tgtShade) return;
  if (mask && !mask[startY * buf.width + startX]) return;
  const { width: w, height: h, data } = buf;
  const visited = new Uint8Array(w * h);
  const stack = [startY * w + startX];
  while (stack.length > 0) {
    const flat = stack.pop()!;
    if (visited[flat]) continue;
    visited[flat] = 1;
    if (mask && !mask[flat]) continue;
    const bx = flat % w, by = (flat / w) | 0;
    const bi = flat * 4;
    const key = (data[bi] << 16) | (data[bi + 1] << 8) | data[bi + 2];
    const info = colorLookup.get(key);
    if (!info || info.baseId !== srcBaseId || info.shade !== srcShade) continue;
    const tc = getTargetColor(tgtShade, tgtBaseId, cp);
    if (tc) { data[bi] = tc.r; data[bi + 1] = tc.g; data[bi + 2] = tc.b; data[bi + 3] = 255; }
    if (bx > 0)     stack.push(flat - 1);
    if (bx < w - 1) stack.push(flat + 1);
    if (by > 0)     stack.push(flat - w);
    if (by < h - 1) stack.push(flat + w);
  }
}

function floodFillTransparent(
  buf: ImageData, startX: number, startY: number,
  srcBaseId: number, srcShade: number,
  colorLookup: Map<number, { baseId: number; shade: number }>,
  mask?: SelectionMask | null,
): void {
  if (mask && !mask[startY * buf.width + startX]) return;
  const { width: w, height: h, data } = buf;
  const visited = new Uint8Array(w * h);
  const stack = [startY * w + startX];
  while (stack.length > 0) {
    const flat = stack.pop()!;
    if (visited[flat]) continue;
    visited[flat] = 1;
    if (mask && !mask[flat]) continue;
    const bx = flat % w, by = (flat / w) | 0;
    const bi = flat * 4;
    if (data[bi + 3] < 128) continue;
    const key = (data[bi] << 16) | (data[bi + 1] << 8) | data[bi + 2];
    const info = colorLookup.get(key);
    if (!info || info.baseId !== srcBaseId || info.shade !== srcShade) continue;
    data[bi + 3] = 0;
    if (bx > 0)     stack.push(flat - 1);
    if (bx < w - 1) stack.push(flat + 1);
    if (by > 0)     stack.push(flat - w);
    if (by < h - 1) stack.push(flat + w);
  }
}

/** Flood fill starting from a transparent pixel — fills connected transparent area with a block. */
function floodFillFromTransparent(
  buf: ImageData, startX: number, startY: number,
  tgtBaseId: number, tgtShade: number,
  cp: ComputedPalette,
  mask?: SelectionMask | null,
): void {
  if (mask && !mask[startY * buf.width + startX]) return;
  const { width: w, height: h, data } = buf;
  const visited = new Uint8Array(w * h);
  const stack = [startY * w + startX];
  while (stack.length > 0) {
    const flat = stack.pop()!;
    if (visited[flat]) continue;
    visited[flat] = 1;
    if (mask && !mask[flat]) continue;
    const bx = flat % w, by = (flat / w) | 0;
    const bi = flat * 4;
    if (data[bi + 3] >= 128) continue; // stop at non-transparent pixels
    const tc = getTargetColor(tgtShade, tgtBaseId, cp);
    if (tc) { data[bi] = tc.r; data[bi + 1] = tc.g; data[bi + 2] = tc.b; data[bi + 3] = 255; }
    if (bx > 0)     stack.push(flat - 1);
    if (bx < w - 1) stack.push(flat + 1);
    if (by > 0)     stack.push(flat - w);
    if (by < h - 1) stack.push(flat + w);
  }
}

function repaintPixels(
  src: ImageData, srcBaseId: number, targetBaseId: number,
  cp: ComputedPalette, fixedShade?: number,
): ImageData {
  const shadeToTarget = new Map<number, { r: number; g: number; b: number }>();
  for (const c of cp.colors) {
    if (c.baseId === targetBaseId) shadeToTarget.set(c.shade, { r: c.r, g: c.g, b: c.b });
  }
  if (shadeToTarget.size === 0) return src;
  const srcKeyToShade = new Map<number, number>();
  for (const c of cp.colors) {
    if (c.baseId === srcBaseId) srcKeyToShade.set((c.r << 16) | (c.g << 8) | c.b, c.shade);
  }
  const newData = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const { data } = newData;
  for (let i = 0, n = src.width * src.height; i < n; i++) {
    const key = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
    const srcShade = srcKeyToShade.get(key);
    if (srcShade === undefined) continue;
    const targetShade = fixedShade !== undefined ? fixedShade : srcShade;
    const tc = shadeToTarget.get(targetShade) ?? shadeToTarget.get(2) ?? [...shadeToTarget.values()][0];
    if (!tc) continue;
    data[i * 4] = tc.r; data[i * 4 + 1] = tc.g; data[i * 4 + 2] = tc.b;
  }
  return newData;
}

// ─────────────────────────────────────────────────────────────────────────────

const HIDE_DELAY = 150;

/** Simple alpha-composite: draw `top` over `bottom` into a new ImageData. */
function compositeTwo(bottom: ImageData, top: ImageData, w: number, h: number): ImageData {
  const result = new ImageData(new Uint8ClampedArray(bottom.data), w, h);
  const dst = result.data;
  const src = top.data;
  for (let i = 0; i < dst.length; i += 4) {
    const sa = src[i + 3];
    if (sa === 0) continue;
    if (sa === 255) {
      dst[i] = src[i]; dst[i+1] = src[i+1]; dst[i+2] = src[i+2]; dst[i+3] = 255;
    } else {
      const da = dst[i + 3];
      const outA = sa + da * (255 - sa) / 255;
      if (outA === 0) continue;
      dst[i]   = (src[i]   * sa + dst[i]   * da * (255 - sa) / 255) / outA;
      dst[i+1] = (src[i+1] * sa + dst[i+1] * da * (255 - sa) / 255) / outA;
      dst[i+2] = (src[i+2] * sa + dst[i+2] * da * (255 - sa) / 255) / outA;
      dst[i+3] = outA;
    }
  }
  return result;
}

/** Shift all pixels in src by (dx, dy). Pixels that move out of bounds are discarded. */
function shiftImageData(src: ImageData, dx: number, dy: number): ImageData {
  const dst = new ImageData(src.width, src.height);
  for (let ny = 0; ny < src.height; ny++) {
    for (let nx = 0; nx < src.width; nx++) {
      const sx = nx - dx, sy = ny - dy;
      if (sx < 0 || sx >= src.width || sy < 0 || sy >= src.height) continue;
      const si = (sy * src.width + sx) * 4;
      const di = (ny * src.width + nx) * 4;
      dst.data[di] = src.data[si]; dst.data[di+1] = src.data[si+1];
      dst.data[di+2] = src.data[si+2]; dst.data[di+3] = src.data[si+3];
    }
  }
  return dst;
}

/** Shift a SelectionMask by (dx, dy). */
function shiftMask(mask: SelectionMask, dx: number, dy: number, w: number, h: number): SelectionMask {
  const newMask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % w, y = Math.floor(i / w);
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < w && ny >= 0 && ny < h) newMask[ny * w + nx] = 1;
  }
  return newMask;
}

/** Stamp floatingPixels (at original positions) offset by (dx, dy) onto base. */
function stampFloating(base: ImageData, floatPixels: ImageData, mask: SelectionMask, dx: number, dy: number): ImageData {
  const dst = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
  const w = base.width, h = base.height;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const ox = i % w, oy = Math.floor(i / w);
    const nx = ox + dx, ny = oy + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const si = i * 4, di = (ny * w + nx) * 4;
    dst.data[di] = floatPixels.data[si]; dst.data[di+1] = floatPixels.data[si+1];
    dst.data[di+2] = floatPixels.data[si+2]; dst.data[di+3] = floatPixels.data[si+3];
  }
  return dst;
}

/** Bresenham line: call paintBrushCircle for every pixel between (x0,y0) and (x1,y1). */
function drawBrushLine(
  buf: ImageData, x0: number, y0: number, x1: number, y1: number,
  brushSize: number, erase: boolean, baseId: number, shade: number, cp: ComputedPalette,
  mask?: SelectionMask | null,
): void {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    paintBrushCircle(buf, x0, y0, brushSize, erase, baseId, shade, cp, mask);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx)  { err += dx; y0 += sy; }
  }
}

export function PreviewCanvas({
  mode, imageData, paintData, originalData, showOriginal, showGrid,
  width, height, scale, cp, blockSelection,
  activeTool, paintBlock, patternBlocks, brushSize, textSize,
  otherLayersData,
  onRemoveBlock, onImageUpdate, onToolChange, onPaintBlockChange,
  onTextCommit,
  splitPos, onSplitPosChange,
  selectionMask, onSelectionChange,
  activePattern, patternAnchorMode, gradientStops, gradientDithering,
  onZoomWheel,
}: Props) {
  // Tooltip state
  const [hoverInfo, setHoverInfo]     = useState<HoverInfo | null>(null);
  const [mousePos, setMousePos]       = useState({ x: 0, y: 0 });
  const tooltipRef                    = useRef<HTMLDivElement>(null);
  const prevHoverKeyRef               = useRef<string>('');
  const [showRepaint, setShowRepaint]       = useState(false);
  const [repaintTarget, setRepaintTarget]   = useState<RepaintEntry | null>(null);
  const [isPinned, setIsPinned]             = useState(false);
  const is3D = useMemo(() => cp.colors.some(c => c.shade !== 2), [cp]);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Paint state
  const paintBufferRef   = useRef<ImageData | null>(null);
  const isDraggingRef    = useRef(false);
  const paintedSetRef    = useRef<Set<number>>(new Set());
  const lastBrushPosRef  = useRef<{ px: number; py: number } | null>(null);
  // Last pixel painted during a drag — used to interpolate gaps between mousemove events
  const lastDragPixelRef = useRef<{ px: number; py: number } | null>(null);
  const patternAnchorRef = useRef<{ x: number; y: number } | null>(null);

  // Selection state
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectionDragRef = useRef<{
    type: 'rect' | 'lasso' | 'pixel';
    startPx: number; startPy: number;
    curPx: number; curPy: number;
    points: { x: number; y: number }[];
    addMode: 'replace' | 'add' | 'sub';
  } | null>(null);
  const selectionMaskRef = useRef<SelectionMask | null>(null);
  const antsPhaseRef = useRef(0);

  // Floating selection drag (move selection content)
  const floatingSelRef = useRef<{
    pixels: ImageData; mask: SelectionMask;
    dx: number; dy: number;
    startClientX: number; startClientY: number;
  } | null>(null);

  // Move tool drag (translate whole layer)
  const moveDragRef = useRef<{
    original: ImageData;
    dx: number; dy: number;
    startClientX: number; startClientY: number;
  } | null>(null);
  const antsRafRef = useRef<number>(0);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // Gradient drag state
  const gradientDragRef = useRef<{
    startPx: { x: number; y: number };
    curPx:   { x: number; y: number };
  } | null>(null);

  // Text tool state
  const [textState, setTextState] = useState<TextState>(null);
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [textCursor, setTextCursor] = useState<string | null>(null);
  const textStateRef    = useRef<TextState>(null);
  textStateRef.current  = textState;
  const setTextStateRef = useRef(setTextState);
  setTextStateRef.current = setTextState;
  const textBaseRef     = useRef<ImageData | null>(null);
  // canvasDrag lives in a ref (not state) — avoids React commit-timing issues during drag
  const canvasDragRef   = useRef<CanvasDrag | null>(null);

  // Split slider state
  const isDraggingSplitRef   = useRef(false);
  const splitContainerRef    = useRef<HTMLDivElement>(null);
  const splitDividerRef      = useRef<HTMLDivElement>(null);
  const splitOrigLayerRef    = useRef<HTMLDivElement>(null);
  const localSplitPosRef     = useRef(splitPos ?? 50);
  const onSplitPosChangeRef  = useRef(onSplitPosChange);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  // Brush cursor — positioned imperatively (no setState → no re-render per mousemove)
  const brushCursorWrapperRef = useRef<HTMLDivElement>(null);
  const stampCursorWrapperRef = useRef<HTMLDivElement>(null);
  // Last known mouse client position (used for stamp cursor imperative positioning)
  const lastMouseClientRef = useRef<{ clientX: number; clientY: number } | null>(null);
  // Cached main canvas element — avoids repeated querySelector on every mousemove
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  function getMainCanvas(): HTMLCanvasElement | null {
    if (mainCanvasRef.current?.isConnected) return mainCanvasRef.current;
    const c = canvasZoneRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    mainCanvasRef.current = c;
    return c;
  }

  // Stable refs so global listeners never capture stale closures
  const onImageUpdateRef = useRef(onImageUpdate);
  onImageUpdateRef.current = onImageUpdate;
  const onTextCommitRef = useRef(onTextCommit);
  onTextCommitRef.current = onTextCommit;
  const canvasZoneRef = useRef<HTMLDivElement>(null);
  const onZoomWheelRef = useRef(onZoomWheel);
  onZoomWheelRef.current = onZoomWheel;
  const imageDataRef  = useRef<ImageData | null>(null);
  imageDataRef.current = imageData;
  const propsRef = useRef<{
    activeTool: PaintTool | null; paintBlock: PaintBlock | null;
    patternBlocks: PaintBlock[];
    scale: number; width: number; height: number;
    cp: ComputedPalette; colorLookup: Map<number, LookupEntry>;
    brushSize: number; showGrid: boolean;
    otherLayersData: ImageData | null | undefined;
    selectionMask: SelectionMask | null | undefined;
    activePattern: PatternDefinition | null | undefined;
    patternAnchorMode: 'canvas' | 'brush' | undefined;
    gradientStops: GradientStop[] | undefined;
    gradientDithering: 'none' | 'ordered' | undefined;
  }>({
    activeTool: null, paintBlock: null,
    patternBlocks: [],
    scale: 1, width: 128, height: 128,
    cp: { colors: [], labs: [], exactLookup: new Map() }, colorLookup: new Map(),
    brushSize: 1, showGrid: false,
    otherLayersData: null,
    selectionMask: null,
    activePattern: null,
    patternAnchorMode: undefined,
    gradientStops: undefined,
    gradientDithering: undefined,
  });

  const colorLookup = useMemo(() => buildColorLookup(cp, blockSelection), [cp, blockSelection]);
  propsRef.current = { activeTool, paintBlock, patternBlocks, scale, width, height, cp, colorLookup, brushSize, showGrid, otherLayersData, selectionMask, activePattern, patternAnchorMode, gradientStops, gradientDithering };
  selectionMaskRef.current = selectionMask ?? null;
  onSplitPosChangeRef.current = onSplitPosChange;

  const displayImageData = (() => {
    const buf = paintBufferRef.current;
    if (buf && otherLayersData) return compositeTwo(otherLayersData, buf, width, height);
    return buf ?? imageData;
  })();

  // ── Text preview effect — draws text overlay + selection box ───────────────
  // useLayoutEffect runs synchronously before paint — keeps canvas in sync
  useLayoutEffect(() => {
    const canvas = canvasZoneRef.current?.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const { width: w, height: h, scale: s, showGrid: sg } = propsRef.current;

    if (!textState || !textBaseRef.current) return;

    const preview = new ImageData(new Uint8ClampedArray(textBaseRef.current.data), textBaseRef.current.width, textBaseRef.current.height);
    if (textState.value.trim() && paintBlock && paintBlock.baseId !== -1) {
      stampText(preview, textState.value, textState.px, textState.py, textState.size, textState.font, paintBlock, textState.strokeWidth, textState.strokeBlock, textState.scaleX, textState.scaleY, cp);
    }
    drawImageData(canvas, preview, w, h, s, sg);

    // Draw selection box on top of the canvas
    const ctx = canvas.getContext('2d')!;
    const { baseW: bw, baseH: bh } = getTextBaseSize(textState.value || ' ', textState.size);
    const sw = Math.max(1, Math.round(bw * textState.scaleX));
    const sh = Math.max(1, Math.round(bh * textState.scaleY));
    const x1 = textState.px * s, y1 = textState.py * s;
    const x2 = x1 + sw * s,     y2 = y1 + sh * s;
    ctx.save();
    ctx.strokeStyle = 'rgba(87,255,110,0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.setLineDash([]);
    const hs = 9;
    for (const [hx, hy] of [[x1,y1],[x2,y1],[x1,y2],[x2,y2]] as [number,number][]) {
      ctx.fillStyle = '#161623';
      ctx.fillRect(hx - hs/2, hy - hs/2, hs, hs);
      ctx.strokeRect(hx - hs/2, hy - hs/2, hs, hs);
    }
    ctx.restore();
  });

  // ── Cleanup timers ──────────────────────────────────────────────────────────

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    clearTimeout(labelTimerRef.current);
  }, []);

  // ── Marching ants overlay animation ─────────────────────────────────────────

  useEffect(() => {
    let lastTime = 0;
    function frame(time: number) {
      antsRafRef.current = requestAnimationFrame(frame);
      const overlay = overlayCanvasRef.current;
      if (!overlay) return;
      const mask = selectionMaskRef.current;
      const { width: w, height: h, scale: s } = propsRef.current;
      const cw = w * s, ch = h * s;
      if (overlay.width !== cw) overlay.width = cw;
      if (overlay.height !== ch) overlay.height = ch;
      const ctx = overlay.getContext('2d');
      if (!ctx) return;
      // Advance phase ~8px/s
      const dt = Math.min(time - lastTime, 100);
      lastTime = time;
      antsPhaseRef.current = (antsPhaseRef.current + dt * 0.008) % 8;
      // Draw gradient drag preview
      const gDrag = gradientDragRef.current;
      if (gDrag) {
        ctx.clearRect(0, 0, cw, ch);
        const sx = (gDrag.startPx.x + 0.5) * s, sy = (gDrag.startPx.y + 0.5) * s;
        const ex = (gDrag.curPx.x + 0.5) * s,   ey = (gDrag.curPx.y + 0.5) * s;
        ctx.save();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        // Start dot
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#57ff6e'; ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
        // End dot
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff5757'; ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        return;
      }

      // Draw selection drag preview if active (must happen even if mask is null)
      const drag = selectionDragRef.current;
      if (drag) {
        ctx.clearRect(0, 0, cw, ch);
        if (drag.type === 'rect') {
          const x = Math.min(drag.startPx, drag.curPx) * s;
          const y = Math.min(drag.startPy, drag.curPy) * s;
          const rw = (Math.abs(drag.curPx - drag.startPx) + 1) * s;
          const rh = (Math.abs(drag.curPy - drag.startPy) + 1) * s;
          ctx.save();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.lineDashOffset = -antsPhaseRef.current;
          ctx.strokeRect(x, y, rw, rh);
          ctx.strokeStyle = '#000';
          ctx.lineDashOffset = -antsPhaseRef.current + 4;
          ctx.strokeRect(x, y, rw, rh);
          ctx.restore();
        } else if (drag.type === 'lasso' && drag.points.length > 1) {
          ctx.save();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.lineDashOffset = -antsPhaseRef.current;
          ctx.beginPath();
          ctx.moveTo(drag.points[0].x * s + s / 2, drag.points[0].y * s + s / 2);
          for (let i = 1; i < drag.points.length; i++) {
            ctx.lineTo(drag.points[i].x * s + s / 2, drag.points[i].y * s + s / 2);
          }
          ctx.stroke();
          ctx.strokeStyle = '#000';
          ctx.lineDashOffset = -antsPhaseRef.current + 4;
          ctx.beginPath();
          ctx.moveTo(drag.points[0].x * s + s / 2, drag.points[0].y * s + s / 2);
          for (let i = 1; i < drag.points.length; i++) {
            ctx.lineTo(drag.points[i].x * s + s / 2, drag.points[i].y * s + s / 2);
          }
          ctx.stroke();
          ctx.restore();
        }
        return;
      }
      // Draw floating selection overlay
      const floatSel = floatingSelRef.current;
      if (floatSel) {
        ctx.clearRect(0, 0, cw, ch);
        // Draw floating pixels at offset
        const fc = new OffscreenCanvas(w, h);
        fc.getContext('2d')!.putImageData(floatSel.pixels, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(fc, floatSel.dx * s, floatSel.dy * s, w * s, h * s);
        ctx.restore();
        // Draw shifted marching ants border
        const shifted = shiftMask(floatSel.mask, floatSel.dx, floatSel.dy, w, h);
        drawMarchingAnts(ctx, shifted, w, h, s, antsPhaseRef.current);
        return;
      }

      if (!mask) { ctx.clearRect(0, 0, cw, ch); return; }
      drawMarchingAnts(ctx, mask, w, h, s, antsPhaseRef.current);
    }
    antsRafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(antsRafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Show split labels on mount / when split activates ───────────────────────
  useEffect(() => {
    if (splitPos == null) return;
    setLabelsVisible(true);
    labelTimerRef.current = setTimeout(() => setLabelsVisible(false), 2000);
    return () => clearTimeout(labelTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitPos != null]);

  // ── Ctrl/Shift+scroll zoom ───────────────────────────────────────────────────

  useEffect(() => {
    const el = canvasZoneRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.shiftKey) return;
      e.preventDefault();
      onZoomWheelRef.current?.(e);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Close tooltip when a paint tool activates ───────────────────────────────

  useEffect(() => {
    if (activeTool) { setIsPinned(false); setHoverInfo(null); setShowRepaint(false); setRepaintTarget(null); }
  }, [activeTool]);

  // ── Escape key ──────────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (textStateRef.current) { cancelText(); return; }
        // Cancel floating selection — restore original canvas display (paintData unchanged since no onImageUpdate was called)
        if (floatingSelRef.current) {
          floatingSelRef.current = null;
          paintBufferRef.current = null;
          const cvs = getMainCanvas();
          if (cvs && imageDataRef.current) {
            const { width: w, height: h, scale: s, showGrid: sg } = propsRef.current;
            drawImageData(cvs, imageDataRef.current, w, h, s, sg);
          }
          return;
        }
        // Cancel move tool drag
        if (moveDragRef.current) {
          moveDragRef.current = null;
          const cvs = getMainCanvas();
          if (cvs && imageDataRef.current) {
            const { width: w, height: h, scale: s, showGrid: sg } = propsRef.current;
            drawImageData(cvs, imageDataRef.current, w, h, s, sg);
          }
          return;
        }
        setIsPinned(false); setHoverInfo(null); setShowRepaint(false); setRepaintTarget(null);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Global mousemove + mouseup ──────────────────────────────────────────────

  useEffect(() => {
    function onGlobalMouseMove(e: MouseEvent) {
      // Canvas drag for text tool (move / scale handles)
      if (canvasDragRef.current) {
        const cd = canvasDragRef.current;
        const { scale: s } = propsRef.current;
        const dx = (e.clientX - cd.startMouseX) / s;
        const dy = (e.clientY - cd.startMouseY) / s;
        let px = cd.startPx, py = cd.startPy;
        let sx = cd.startScaleX, sy = cd.startScaleY;
        if (cd.type === 'move') {
          px = Math.max(0, cd.startPx + dx);
          py = Math.max(0, cd.startPy + dy);
        } else {
          if (cd.type === 'br') { sx = Math.max(0.1, cd.startScaleX + dx / cd.baseW); sy = Math.max(0.1, cd.startScaleY + dy / cd.baseH); }
          else if (cd.type === 'bl') { sx = Math.max(0.1, cd.startScaleX - dx / cd.baseW); sy = Math.max(0.1, cd.startScaleY + dy / cd.baseH); px = cd.startPx + dx; }
          else if (cd.type === 'tr') { sx = Math.max(0.1, cd.startScaleX + dx / cd.baseW); sy = Math.max(0.1, cd.startScaleY - dy / cd.baseH); py = cd.startPy + dy; }
          else { sx = Math.max(0.1, cd.startScaleX - dx / cd.baseW); sy = Math.max(0.1, cd.startScaleY - dy / cd.baseH); px = cd.startPx + dx; py = cd.startPy + dy; }
        }
        setTextStateRef.current(st => st ? { ...st, px, py, scaleX: sx, scaleY: sy } : st);
        return;
      }

      // Split drag takes priority — update DOM directly to avoid React re-renders per mousemove
      if (isDraggingSplitRef.current && splitContainerRef.current) {
        const rect = splitContainerRef.current.getBoundingClientRect();
        const pos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        localSplitPosRef.current = pos;
        if (splitDividerRef.current) splitDividerRef.current.style.left = `${pos}%`;
        if (splitOrigLayerRef.current) splitOrigLayerRef.current.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
        return;
      }
      const { activeTool, paintBlock, patternBlocks, scale, width, height, cp, brushSize, showGrid } = propsRef.current;

      // Get canvas + rect once for the entire handler — no repeated querySelector / getBoundingClientRect
      const cvs = getMainCanvas();
      const cr  = cvs ? cvs.getBoundingClientRect() : null;

      // Floating selection drag
      if (floatingSelRef.current) {
        const fs = floatingSelRef.current;
        fs.dx = Math.round((e.clientX - fs.startClientX) / scale);
        fs.dy = Math.round((e.clientY - fs.startClientY) / scale);
        // Redraw main canvas (erased layer from paintBuffer)
        if (cvs && paintBufferRef.current) {
          const { otherLayersData: oLD } = propsRef.current;
          const bufToDraw = oLD ? compositeTwo(oLD, paintBufferRef.current, width, height) : paintBufferRef.current;
          drawImageData(cvs, bufToDraw, width, height, scale, showGrid);
        }
        return;
      }

      // Move tool drag
      if (moveDragRef.current) {
        const md = moveDragRef.current;
        md.dx = Math.round((e.clientX - md.startClientX) / scale);
        md.dy = Math.round((e.clientY - md.startClientY) / scale);
        if (cvs) {
          const shifted = shiftImageData(md.original, md.dx, md.dy);
          // NOTE: Don't update paintBufferRef — show original image, let shifted preview draw to canvas
          const { otherLayersData: oLD } = propsRef.current;
          const bufToDraw = oLD ? compositeTwo(oLD, shifted, width, height) : shifted;
          drawImageData(cvs, bufToDraw, width, height, scale, showGrid);
        }
        return;
      }

      // Update brush/stamp cursor position directly in DOM — no React re-render
      if (activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'fill' || activeTool === 'pattern' || activeTool === 'pattern-tile') {
        lastMouseClientRef.current = { clientX: e.clientX, clientY: e.clientY };
        const { scale: s, brushSize: bs, patternAnchorMode: pam, activePattern: ap } = propsRef.current;
        if (cvs && cr) {
          const isStamp = activeTool === 'pattern-tile' && pam === 'brush';
          // Brush cursor — use CSS transform (no layout reflow, GPU-composited)
          const wrapper = brushCursorWrapperRef.current;
          if (wrapper && !isStamp) {
            if (activeTool === 'fill') {
              const hs = Math.max(s * 2, 16) / 2;
              wrapper.style.transform = `translate(${e.clientX - hs}px,${e.clientY - hs}px)`;
            } else {
              const px = Math.floor((e.clientX - cr.left) / s);
              const py = Math.floor((e.clientY - cr.top)  / s);
              const ri = Math.floor(bs / 2);
              wrapper.style.transform = `translate(${cr.left + (px - ri) * s}px,${cr.top + (py - ri) * s}px)`;
            }
            wrapper.style.visibility = 'visible';
          }
          // Stamp cursor
          const stampWrapper = stampCursorWrapperRef.current;
          if (stampWrapper && isStamp && ap) {
            const px = Math.floor((e.clientX - cr.left) / s);
            const py = Math.floor((e.clientY - cr.top)  / s);
            const ox = px - Math.floor(ap.width  / 2);
            const oy = py - Math.floor(ap.height / 2);
            stampWrapper.style.transform = `translate(${cr.left + ox * s}px,${cr.top + oy * s}px)`;
            stampWrapper.style.visibility = 'visible';
          }
        }
      }

      // Gradient drag: update current endpoint and draw preview line on overlay
      if (gradientDragRef.current && activeTool === 'gradient') {
        if (cr) {
          const cx = Math.max(0, Math.min(width - 1, Math.floor((e.clientX - cr.left) / scale)));
          const cy = Math.max(0, Math.min(height - 1, Math.floor((e.clientY - cr.top) / scale)));
          gradientDragRef.current.curPx = { x: cx, y: cy };
        }
        return;
      }

      // Selection drag update — update ref then draw immediately to avoid rAF 1-frame delay
      if (selectionDragRef.current) {
        const drag = selectionDragRef.current;
        if (cr) {
          const { scale: sc, width: ww, height: hh } = propsRef.current;
          const cx = Math.max(0, Math.min(ww - 1, Math.floor((e.clientX - cr.left) / sc)));
          const cy = Math.max(0, Math.min(hh - 1, Math.floor((e.clientY - cr.top) / sc)));
          drag.curPx = cx;
          drag.curPy = cy;
          if (drag.type === 'lasso') {
            const last = drag.points[drag.points.length - 1];
            if (last.x !== cx || last.y !== cy) drag.points.push({ x: cx, y: cy });
          } else if (drag.type === 'pixel') {
            const { selectionMask: sMask } = propsRef.current;
            const flat = cy * ww + cx;
            const newMask = new Uint8Array(sMask ?? new Uint8Array(ww * hh));
            if (drag.addMode === 'sub') newMask[flat] = 0;
            else newMask[flat] = 1;
            onSelectionChangeRef.current?.(newMask);
          }
          // Draw selection preview immediately (skip rAF delay)
          const overlay = overlayCanvasRef.current;
          if (overlay && (drag.type === 'rect' || drag.type === 'lasso')) {
            const cw = ww * sc, ch = hh * sc;
            if (overlay.width !== cw) overlay.width = cw;
            if (overlay.height !== ch) overlay.height = ch;
            const octx = overlay.getContext('2d');
            if (octx) {
              octx.clearRect(0, 0, cw, ch);
              const phase = antsPhaseRef.current;
              if (drag.type === 'rect') {
                const x = Math.min(drag.startPx, cx) * sc;
                const y = Math.min(drag.startPy, cy) * sc;
                const rw = (Math.abs(cx - drag.startPx) + 1) * sc;
                const rh = (Math.abs(cy - drag.startPy) + 1) * sc;
                octx.save();
                octx.strokeStyle = '#fff'; octx.lineWidth = 1; octx.setLineDash([4, 4]);
                octx.lineDashOffset = -phase; octx.strokeRect(x, y, rw, rh);
                octx.strokeStyle = '#000'; octx.lineDashOffset = -phase + 4; octx.strokeRect(x, y, rw, rh);
                octx.restore();
              } else if (drag.points.length > 1) {
                octx.save();
                octx.strokeStyle = '#fff'; octx.lineWidth = 1; octx.setLineDash([4, 4]);
                octx.lineDashOffset = -phase;
                octx.beginPath();
                octx.moveTo(drag.points[0].x * sc + sc / 2, drag.points[0].y * sc + sc / 2);
                for (let i = 1; i < drag.points.length; i++) {
                  octx.lineTo(drag.points[i].x * sc + sc / 2, drag.points[i].y * sc + sc / 2);
                }
                octx.stroke();
                octx.strokeStyle = '#000'; octx.lineDashOffset = -phase + 4;
                octx.beginPath();
                octx.moveTo(drag.points[0].x * sc + sc / 2, drag.points[0].y * sc + sc / 2);
                for (let i = 1; i < drag.points.length; i++) {
                  octx.lineTo(drag.points[i].x * sc + sc / 2, drag.points[i].y * sc + sc / 2);
                }
                octx.stroke();
                octx.restore();
              }
            }
          }
        }
        return;
      }

      // Brush / eraser / pattern drag
      const needsPattern = activeTool === 'pattern';
      const needsPatternTile = activeTool === 'pattern-tile';
      const { activePattern } = propsRef.current;
      if (!isDraggingRef.current ||
          (activeTool !== 'brush' && activeTool !== 'eraser' && activeTool !== 'pattern' && activeTool !== 'pattern-tile') ||
          ((activeTool === 'brush') && !paintBlock) ||
          (needsPattern && patternBlocks.length === 0) ||
          (needsPatternTile && !activePattern) ||
          !paintBufferRef.current) return;

      if (!cvs || !cr) return;
      const canvas = cvs;
      const rect = cr;
      const cx = Math.floor((e.clientX - rect.left) / scale);
      const cy = Math.floor((e.clientY - rect.top)  / scale);
      if (cx < 0 || cx >= width || cy < 0 || cy >= height) return;
      const { selectionMask: sMask, activePattern: aPattern, patternAnchorMode: pam } = propsRef.current;

      if (activeTool === 'brush' || activeTool === 'eraser') {
        const erase = activeTool === 'eraser' || paintBlock?.baseId === -1;
        const last = lastDragPixelRef.current;
        if (last && (last.px !== cx || last.py !== cy)) {
          // Interpolate from previous position to fill gaps on fast movement
          drawBrushLine(paintBufferRef.current!, last.px, last.py, cx, cy, brushSize, erase, paintBlock?.baseId ?? -1, paintBlock?.shade ?? 1, cp, sMask ?? undefined);
        } else {
          paintBrushCircle(paintBufferRef.current!, cx, cy, brushSize, erase, paintBlock?.baseId ?? -1, paintBlock?.shade ?? 1, cp, sMask ?? undefined);
        }
        lastDragPixelRef.current = { px: cx, py: cy };
      } else {
        // Pattern tools: paint only new center positions (no line interpolation)
        const centerKey = cy * width + cx;
        if (paintedSetRef.current.has(centerKey)) return;
        paintedSetRef.current.add(centerKey);
        if (activeTool === 'pattern-tile' && aPattern) {
          if (pam === 'brush') {
            paintWithPatternStamp(paintBufferRef.current!, cx, cy, aPattern, cp, sMask ?? undefined);
          } else {
            paintWithPatternTile(paintBufferRef.current!, cx, cy, brushSize, aPattern, cp, sMask ?? undefined);
          }
        } else if (activeTool === 'pattern') {
          paintPatternBrush(paintBufferRef.current!, cx, cy, brushSize, patternBlocks, cp, sMask ?? undefined);
        }
      }
      {
        const { otherLayersData: oLD } = propsRef.current;
        const bufToDraw = (oLD && paintBufferRef.current) ? compositeTwo(oLD, paintBufferRef.current, width, height) : paintBufferRef.current!;
        drawImageData(canvas, bufToDraw, width, height, scale, showGrid);
      }
    }

    function onGlobalMouseUp(e: MouseEvent) {
      if (canvasDragRef.current) { canvasDragRef.current = null; return; }

      // Commit floating selection
      if (floatingSelRef.current) {
        const fs = floatingSelRef.current;
        const { width: w, height: h } = propsRef.current;
        const base = paintBufferRef.current!;
        const stamped = stampFloating(base, fs.pixels, fs.mask, fs.dx, fs.dy);
        paintBufferRef.current = null;
        floatingSelRef.current = null;
        onImageUpdateRef.current(stamped);
        onSelectionChangeRef.current?.(shiftMask(fs.mask, fs.dx, fs.dy, w, h));
        return;
      }

      // Commit move tool drag
      if (moveDragRef.current) {
        const md = moveDragRef.current;
        moveDragRef.current = null;
        const shifted = shiftImageData(md.original, md.dx, md.dy);
        paintBufferRef.current = null;  // Clear buffer
        onImageUpdateRef.current(shifted);
        return;
      }

      // Apply gradient on drag end
      if (gradientDragRef.current) {
        const gd = gradientDragRef.current;
        gradientDragRef.current = null;
        const { gradientStops: gStops, gradientDithering: gDither, selectionMask: sMask, cp: gcp } = propsRef.current;
        const paintBuf = paintBufferRef.current ?? imageDataRef.current;
        if (paintBuf && gStops && gStops.length >= 1) {
          const buf = new ImageData(new Uint8ClampedArray(paintBuf.data), paintBuf.width, paintBuf.height);
          applyGradient(buf, gd.startPx, gd.curPx, gStops, gcp, gDither ?? 'ordered', sMask ?? undefined);
          onImageUpdateRef.current(buf);
        }
        return;
      }

      if (isDraggingSplitRef.current) { isDraggingSplitRef.current = false; setIsDraggingSplit(false); onSplitPosChangeRef.current?.(localSplitPosRef.current); return; }

      // Finalize selection drag
      if (selectionDragRef.current) {
        const drag = selectionDragRef.current;
        const { width: w, height: h, selectionMask: existingMask } = propsRef.current;
        let newMask: SelectionMask | null = null;
        if (drag.type === 'rect') {
          newMask = maskFromRect(drag.startPx, drag.startPy, drag.curPx, drag.curPy, w, h);
        } else if (drag.type === 'lasso' && drag.points.length >= 3) {
          newMask = maskFromPolygon(drag.points, w, h);
        }
        if (newMask) {
          if (drag.addMode === 'add' && existingMask) newMask = unionMask(existingMask, newMask);
          else if (drag.addMode === 'sub' && existingMask) newMask = subtractMask(existingMask, newMask);
          onSelectionChangeRef.current?.(newMask);
        }
        selectionDragRef.current = null;
        isDraggingRef.current = false;
        return;
      }

      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      patternAnchorRef.current = null;
      lastDragPixelRef.current = null;
      if (paintBufferRef.current) {
        onImageUpdateRef.current(paintBufferRef.current);
        paintBufferRef.current = null;
      }
      // Save last painted pixel position for shift+click line
      const { activeTool, scale, width, height } = propsRef.current;
      if (activeTool === 'brush' || activeTool === 'eraser') {
        const canvas = canvasZoneRef.current?.querySelector('canvas');
        if (canvas instanceof HTMLCanvasElement) {
          const rect = canvas.getBoundingClientRect();
          const px = Math.floor((e.clientX - rect.left) / scale);
          const py = Math.floor((e.clientY - rect.top) / scale);
          if (px >= 0 && px < width && py >= 0 && py < height) {
            lastBrushPosRef.current = { px, py };
          }
        }
      }
      void e;
    }

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup',   onGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup',   onGlobalMouseUp);
    };
  }, []); // stable — uses only refs


  // ── Repaint list memo ───────────────────────────────────────────────────────

  const repaintEntries = useMemo<RepaintEntry[]>(() => {
    if (!hoverInfo || !showRepaint) return [];
    return buildRepaintEntries(hoverInfo.r, hoverInfo.g, hoverInfo.b, cp, blockSelection);
  }, [hoverInfo, showRepaint, cp, blockSelection]);

  // ── Tooltip helpers ─────────────────────────────────────────────────────────

  function scheduleHide() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setHoverInfo(null); setShowRepaint(false); setRepaintTarget(null); setIsPinned(false);
      prevHoverKeyRef.current = '';
    }, HIDE_DELAY);
  }

  function cancelHide() {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  }

  function closeTooltip() {
    cancelHide(); setIsPinned(false); setHoverInfo(null); setShowRepaint(false); setRepaintTarget(null);
    prevHoverKeyRef.current = '';
  }

  // ── Pixel coordinate helpers ────────────────────────────────────────────────

  function getPixelCoords(e: React.MouseEvent<HTMLDivElement>): { px: number; py: number } | null {
    const canvas = (e.currentTarget as HTMLDivElement).querySelector('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (mx < 0 || my < 0 || mx >= rect.width || my >= rect.height) return null;
    const px = Math.floor(mx / scale), py = Math.floor(my / scale);
    if (px < 0 || px >= width || py < 0 || py >= height) return null;
    return { px, py };
  }

  function lookupAtEvent(e: React.MouseEvent<HTMLDivElement>): HoverInfo | null {
    if (showOriginal || !displayImageData) return null;
    const pos = getPixelCoords(e);
    if (!pos) return null;
    const { px, py } = pos;
    const idx = (py * width + px) * 4;
    const r = displayImageData.data[idx], g = displayImageData.data[idx + 1], b = displayImageData.data[idx + 2];
    const a = displayImageData.data[idx + 3];
    if (a === 0) return null; // fully transparent — nothing to pick
    const exact = colorLookup.get((r << 16) | (g << 8) | b);
    if (exact) return { pixelX: px, pixelY: py, r, g, b, ...exact };
    // Fallback: nearest palette color via OKLab distance
    if (cp.colors.length === 0) return null;
    const lab = rgbToOklab(r, g, b);
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < cp.labs.length; i++) {
      const d = oklabDistance(lab, cp.labs[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const nearest = colorLookup.get((cp.colors[bestIdx].r << 16) | (cp.colors[bestIdx].g << 8) | cp.colors[bestIdx].b);
    if (!nearest) return null;
    return { pixelX: px, pixelY: py, r, g, b, ...nearest };
  }

  // ── Split slider helpers ─────────────────────────────────────────────────────

  function showSplitLabels() {
    setLabelsVisible(true);
    clearTimeout(labelTimerRef.current);
    labelTimerRef.current = setTimeout(() => setLabelsVisible(false), 2000);
  }

  function handleDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    isDraggingSplitRef.current = true;
    setIsDraggingSplit(true);
    showSplitLabels();
  }

  function handleDividerTouchStart(e: React.TouchEvent) {
    e.preventDefault(); e.stopPropagation();
    isDraggingSplitRef.current = true;
    setIsDraggingSplit(true);
    showSplitLabels();
    const touch = e.touches[0];
    if (touch && splitContainerRef.current) {
      const rect = splitContainerRef.current.getBoundingClientRect();
      onSplitPosChangeRef.current?.(Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100)));
    }
  }

  function handleContainerTouchMove(e: React.TouchEvent) {
    if (!isDraggingSplitRef.current || !splitContainerRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) {
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100));
      localSplitPosRef.current = pos;
      if (splitDividerRef.current) splitDividerRef.current.style.left = `${pos}%`;
      if (splitOrigLayerRef.current) splitOrigLayerRef.current.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
    }
  }

  function handleContainerTouchEnd() { isDraggingSplitRef.current = false; setIsDraggingSplit(false); onSplitPosChangeRef.current?.(localSplitPosRef.current); }

  function handleContainerMouseEnter() { if (splitPos != null) showSplitLabels(); }

  // ── Text tool helpers ───────────────────────────────────────────────────────

  function confirmText() {
    if (!textState) return;
    const { width: w, height: h, scale: s, showGrid: sg } = propsRef.current;
    if (textState.value.trim() && paintBlock && paintBlock.baseId !== -1) {
      // Create text-only transparent ImageData
      const textOnly = new ImageData(w, h);  // all transparent
      stampText(textOnly, textState.value, textState.px, textState.py, textState.size, textState.font, paintBlock, textState.strokeWidth, textState.strokeBlock, textState.scaleX, textState.scaleY, cp);
      onTextCommitRef.current?.(textOnly, 'Текст');
    }
    setTextState(null);
    textBaseRef.current = null;
    canvasDragRef.current = null;
    // restore canvas
    const canvas = canvasZoneRef.current?.querySelector('canvas');
    if (canvas instanceof HTMLCanvasElement && imageDataRef.current) {
      drawImageData(canvas, imageDataRef.current, w, h, s, sg);
    }
  }

  function cancelText() {
    setTextState(null);
    textBaseRef.current = null;
    canvasDragRef.current = null;
    const { width: w, height: h, scale: s, showGrid: sg } = propsRef.current;
    const canvas = canvasZoneRef.current?.querySelector('canvas');
    if (canvas instanceof HTMLCanvasElement && imageDataRef.current) {
      drawImageData(canvas, imageDataRef.current, w, h, s, sg);
    }
  }

  // ── Paint tool handler ──────────────────────────────────────────────────────

  function handleZoneMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (isDraggingSplitRef.current) return;
    if (e.altKey && splitPos != null && splitContainerRef.current) {
      e.preventDefault();
      isDraggingSplitRef.current = true;
      const rect = splitContainerRef.current.getBoundingClientRect();
      onSplitPosChangeRef.current?.(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
      showSplitLabels();
      return;
    }

    // Move tool
    if (activeTool === 'move') {
      e.preventDefault();
      if (!paintData) return;
      moveDragRef.current = {
        original: new ImageData(new Uint8ClampedArray(paintData.data), paintData.width, paintData.height),
        dx: 0, dy: 0,
        startClientX: e.clientX, startClientY: e.clientY,
      };
      isDraggingRef.current = true;
      return;
    }

    // Selection tools — if clicking inside existing selection, start a floating drag
    if (activeTool === 'select-rect' || activeTool === 'select-lasso' || activeTool === 'select-magic' || activeTool === 'select-pixel') {
      e.preventDefault();
      const pos = getPixelCoords(e);
      if (!pos) return;
      const { px, py } = pos;
      const addMode: 'replace' | 'add' | 'sub' = e.shiftKey ? 'add' : e.altKey ? 'sub' : 'replace';

      // Click inside selection (no modifier) → start floating selection drag
      if (selectionMask && addMode === 'replace' && selectionMask[py * width + px] && paintData) {
        e.preventDefault();
        // Cut selected pixels from layer
        const floatPixels = new ImageData(width, height);
        const erased = new ImageData(new Uint8ClampedArray(paintData.data), width, height);
        for (let i = 0; i < selectionMask.length; i++) {
          if (!selectionMask[i]) continue;
          const si = i * 4;
          floatPixels.data[si] = paintData.data[si];
          floatPixels.data[si+1] = paintData.data[si+1];
          floatPixels.data[si+2] = paintData.data[si+2];
          floatPixels.data[si+3] = paintData.data[si+3];
          erased.data[si+3] = 0;
        }
        // NOTE: Don't erase main canvas — show original image, let float pixels on overlay "cover" it
        floatingSelRef.current = {
          pixels: floatPixels, mask: selectionMask,
          dx: 0, dy: 0,
          startClientX: e.clientX, startClientY: e.clientY,
        };
        isDraggingRef.current = true;  // Mark as dragging to prevent other operations
        return;
      }

      if (activeTool === 'select-magic') {
        if (!paintData) return;
        const newMask = maskFromFloodFill(paintData, px, py, colorLookup, width, height);
        let finalMask: SelectionMask = newMask;
        if (addMode === 'add' && selectionMask) finalMask = unionMask(selectionMask, newMask);
        else if (addMode === 'sub' && selectionMask) finalMask = subtractMask(selectionMask, newMask);
        onSelectionChange?.(finalMask);
        return;
      }

      if (activeTool === 'select-pixel') {
        // Toggle or add pixel
        const newMask = new Uint8Array(selectionMask ?? new Uint8Array(width * height));
        const idx = py * width + px;
        if (addMode === 'sub') newMask[idx] = 0;
        else newMask[idx] = 1;
        onSelectionChange?.(newMask);
        // Also start drag to allow drag-to-select
        selectionDragRef.current = { type: 'pixel', startPx: px, startPy: py, curPx: px, curPy: py, points: [], addMode };
        isDraggingRef.current = true;
        return;
      }

      // rect or lasso — start drag
      selectionDragRef.current = {
        type: activeTool === 'select-rect' ? 'rect' : 'lasso',
        startPx: px, startPy: py,
        curPx: px, curPy: py,
        points: [{ x: px, y: py }],
        addMode,
      };
      return;
    }

    if (!activeTool || showOriginal) return;
    e.preventDefault();

    if (activeTool === 'eyedropper') {
      const info = lookupAtEvent(e);
      if (info) {
        onPaintBlockChange({ csId: info.csId, blockId: info.blockId, baseId: info.baseId, shade: info.shade, displayName: info.displayName, colourName: info.colourName });
        onToolChange('brush');
      }
      return;
    }

    if (activeTool === 'text') {
      if (!paintData) return;
      const pos = getPixelCoords(e);

      if (textState) {
        const { baseW: bw, baseH: bh } = getTextBaseSize(textState.value || ' ', textState.size);
        const sw = Math.max(1, Math.round(bw * textState.scaleX));
        const sh = Math.max(1, Math.round(bh * textState.scaleY));
        const hs = Math.max(3, Math.round(9 / scale));  // handle size in canvas pixels

        // Corner hit test (scale handles)
        const corners: Array<['tl'|'tr'|'bl'|'br', number, number]> = [
          ['tl', textState.px,      textState.py],
          ['tr', textState.px + sw, textState.py],
          ['bl', textState.px,      textState.py + sh],
          ['br', textState.px + sw, textState.py + sh],
        ];
        if (pos) {
          for (const [id, hx, hy] of corners) {
            if (Math.abs(pos.px - hx) <= hs && Math.abs(pos.py - hy) <= hs) {
              e.preventDefault();
              canvasDragRef.current = { type: id, startPx: textState.px, startPy: textState.py, startScaleX: textState.scaleX, startScaleY: textState.scaleY, startMouseX: e.clientX, startMouseY: e.clientY, baseW: bw, baseH: bh };
              return;
            }
          }
          // Inside box → move
          if (pos.px >= textState.px && pos.px <= textState.px + sw && pos.py >= textState.py && pos.py <= textState.py + sh) {
            e.preventDefault();
            canvasDragRef.current = { type: 'move', startPx: textState.px, startPy: textState.py, startScaleX: textState.scaleX, startScaleY: textState.scaleY, startMouseX: e.clientX, startMouseY: e.clientY, baseW: bw, baseH: bh };
            return;
          }
        }
        // Click outside → confirm existing and create new
        confirmText();
      }

      if (!paintBlock) return;
      if (!pos) return;
      // Create new text at click
      textBaseRef.current = new ImageData(new Uint8ClampedArray(paintData.data), paintData.width, paintData.height);
      canvasDragRef.current = null;
      setTextState({ px: pos.px, py: pos.py, value: '', font: 'monospace', size: textSize, strokeWidth: 0, strokeBlock: null, scaleX: 1, scaleY: 1 });
      return;
    }

    if (!paintData) return;
    if (activeTool !== 'eraser' && activeTool !== 'fill' && activeTool !== 'pattern' && activeTool !== 'pattern-tile' && activeTool !== 'gradient' && !paintBlock) return;
    if (activeTool === 'pattern' && patternBlocks.length === 0) return;
    const pos = getPixelCoords(e);
    if (!pos) return;

    if (activeTool === 'gradient') {
      // Start gradient drag
      gradientDragRef.current = { startPx: { x: pos.px, y: pos.py }, curPx: { x: pos.px, y: pos.py } };
      return;
    }

    if (activeTool === 'pattern-tile') {
      if (!activePattern) return;
      isDraggingRef.current = true;
      paintedSetRef.current = new Set();
      paintBufferRef.current = new ImageData(new Uint8ClampedArray(paintData.data), paintData.width, paintData.height);
      paintedSetRef.current.add(pos.py * width + pos.px);
      if (patternAnchorMode === 'brush') {
        paintWithPatternStamp(paintBufferRef.current, pos.px, pos.py, activePattern, cp, selectionMask ?? undefined);
      } else {
        paintWithPatternTile(paintBufferRef.current, pos.px, pos.py, brushSize, activePattern, cp, selectionMask ?? undefined);
      }
      const canvas = canvasZoneRef.current?.querySelector('canvas');
      if (canvas instanceof HTMLCanvasElement) {
        const bufToDraw = (otherLayersData && paintBufferRef.current) ? compositeTwo(otherLayersData, paintBufferRef.current, width, height) : paintBufferRef.current!;
        drawImageData(canvas, bufToDraw, width, height, scale, showGrid);
      }
      return;
    }

    if (activeTool === 'eraser' || activeTool === 'brush') {
      const { px: cx, py: cy } = pos;
      const erase = activeTool === 'eraser' || paintBlock?.baseId === -1;

      // Shift+click: draw straight line from last brush position
      if (e.shiftKey && lastBrushPosRef.current && paintData) {
        const buf = new ImageData(new Uint8ClampedArray(paintData.data), paintData.width, paintData.height);
        drawBrushLine(buf, lastBrushPosRef.current.px, lastBrushPosRef.current.py, cx, cy, brushSize, erase, paintBlock?.baseId ?? -1, paintBlock?.shade ?? 1, cp, selectionMask ?? undefined);
        onImageUpdate(buf);
        lastBrushPosRef.current = { px: cx, py: cy };
        return;
      }

      isDraggingRef.current = true;
      paintedSetRef.current = new Set();
      lastDragPixelRef.current = { px: cx, py: cy };
      paintBufferRef.current = new ImageData(new Uint8ClampedArray(paintData.data), paintData.width, paintData.height);
      paintedSetRef.current.add(cy * width + cx);
      paintBrushCircle(paintBufferRef.current, cx, cy, brushSize, erase, paintBlock?.baseId ?? -1, paintBlock?.shade ?? 1, cp, selectionMask ?? undefined);
      lastBrushPosRef.current = { px: cx, py: cy };
      const canvas = canvasZoneRef.current?.querySelector('canvas');
      if (canvas instanceof HTMLCanvasElement) {
        const bufToDraw = (otherLayersData && paintBufferRef.current) ? compositeTwo(otherLayersData, paintBufferRef.current, width, height) : paintBufferRef.current!;
        drawImageData(canvas, bufToDraw, width, height, scale, showGrid);
      }
    } else if (activeTool === 'fill') {
      const buf = new ImageData(new Uint8ClampedArray(paintData.data), paintData.width, paintData.height);
      const i = (pos.py * buf.width + pos.px) * 4;

      if (buf.data[i + 3] < 128) {
        // Clicked on transparent pixel — fill connected transparent area with paintBlock
        if (!paintBlock || paintBlock.baseId === -1) return;
        floodFillFromTransparent(buf, pos.px, pos.py, paintBlock.baseId, paintBlock.shade, cp, selectionMask ?? undefined);
      } else {
        const key = (buf.data[i] << 16) | (buf.data[i + 1] << 8) | buf.data[i + 2];
        const existing = colorLookup.get(key);
        if (!existing) return;
        if (!paintBlock || paintBlock.baseId === -1) {
          floodFillTransparent(buf, pos.px, pos.py, existing.baseId, existing.shade, colorLookup, selectionMask ?? undefined);
        } else {
          if (existing.baseId === paintBlock.baseId && existing.shade === paintBlock.shade) return;
          floodFill(buf, pos.px, pos.py, existing.baseId, existing.shade, paintBlock.baseId, paintBlock.shade, cp, colorLookup, selectionMask ?? undefined);
        }
      }
      onImageUpdate(buf);
    } else if (activeTool === 'pattern') {
      isDraggingRef.current = true;
      paintedSetRef.current = new Set();
      paintBufferRef.current = new ImageData(new Uint8ClampedArray(paintData.data), paintData.width, paintData.height);
      const { px: cx, py: cy } = pos;
      paintedSetRef.current.add(cy * width + cx);
      paintPatternBrush(paintBufferRef.current, cx, cy, brushSize, patternBlocks, cp, selectionMask ?? undefined);
      const canvas = canvasZoneRef.current?.querySelector('canvas');
      if (canvas instanceof HTMLCanvasElement) {
        const bufToDraw = (otherLayersData && paintBufferRef.current) ? compositeTwo(otherLayersData, paintBufferRef.current, width, height) : paintBufferRef.current!;
        drawImageData(canvas, bufToDraw, width, height, scale, showGrid);
      }
    }
  }

  // ── Tooltip handlers ────────────────────────────────────────────────────────

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    // Brush cursor update — delegates to the same logic as onGlobalMouseMove
    // (onGlobalMouseMove on window fires too, but React onMouseMove fires first for zone events)
    if (activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'fill') {
      const wrapper = brushCursorWrapperRef.current;
      const cvs = getMainCanvas();
      if (wrapper && cvs) {
        const cr = cvs.getBoundingClientRect();
        if (activeTool === 'fill') {
          const hs = Math.max(scale * 2, 16) / 2;
          wrapper.style.transform = `translate(${e.clientX - hs}px,${e.clientY - hs}px)`;
        } else {
          const px = Math.floor((e.clientX - cr.left) / scale);
          const py = Math.floor((e.clientY - cr.top)  / scale);
          const ri = Math.floor(brushSize / 2);
          wrapper.style.transform = `translate(${cr.left + (px - ri) * scale}px,${cr.top + (py - ri) * scale}px)`;
        }
        wrapper.style.visibility = 'visible';
      }
    }
    if (isDraggingRef.current) { cancelHide(); return; }

    // Text cursor: detect hit area
    if (activeTool === 'text' && textState) {
      const canvas = canvasZoneRef.current?.querySelector('canvas');
      if (canvas instanceof HTMLCanvasElement) {
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) / scale;
        const py = (e.clientY - rect.top)  / scale;
        const { baseW: bw, baseH: bh } = getTextBaseSize(textState.value || ' ', textState.size);
        const sw = Math.max(1, Math.round(bw * textState.scaleX));
        const sh = Math.max(1, Math.round(bh * textState.scaleY));
        const hs = Math.max(3, 9 / scale);
        const corners: Array<[string, number, number]> = [
          ['nwse-resize', textState.px,      textState.py],
          ['nesw-resize', textState.px + sw, textState.py],
          ['nesw-resize', textState.px,      textState.py + sh],
          ['nwse-resize', textState.px + sw, textState.py + sh],
        ];
        let cur: string | null = null;
        for (const [cursor, hx, hy] of corners) {
          if (Math.abs(px - hx) <= hs && Math.abs(py - hy) <= hs) { cur = cursor; break; }
        }
        if (!cur && px >= textState.px && px <= textState.px + sw && py >= textState.py && py <= textState.py + sh) {
          cur = 'move';
        }
        setTextCursor(cur);
      }
      return;
    }

    if (activeTool) return;
    if (isPinned) return;
    const info = lookupAtEvent(e);
    if (!info) { scheduleHide(); return; }
    cancelHide();
    // Update tooltip position directly — no React re-render per pixel
    if (tooltipRef.current) {
      const TOOLTIP_W = 220;
      const RIGHT_PANEL_W = 260;
      const spaceOnRight = window.innerWidth - RIGHT_PANEL_W - (e.clientX + 12);
      const ttL = spaceOnRight >= TOOLTIP_W ? e.clientX + 12 : Math.max(8, e.clientX - TOOLTIP_W - 12);
      const ttT = Math.min(e.clientY + 12, window.innerHeight - 160);
      tooltipRef.current.style.left = `${ttL}px`;
      tooltipRef.current.style.top  = `${ttT}px`;
    }
    // Only re-render when hovered block actually changes
    const key = `${info.csId}:${info.blockId}:${info.shade}`;
    if (key !== prevHoverKeyRef.current) {
      prevHoverKeyRef.current = key;
      setMousePos({ x: e.clientX, y: e.clientY });
      setHoverInfo(info);
    }
  }

  function handleZoneClick(e: React.MouseEvent<HTMLDivElement>) {
    if (isDraggingSplitRef.current) return;
    if (activeTool) return;
    const info = lookupAtEvent(e);
    if (info) {
      setIsPinned(true);
      setHoverInfo(info);
      setMousePos({ x: e.clientX, y: e.clientY });
      setShowRepaint(false); setRepaintTarget(null);
      cancelHide();
    } else {
      setIsPinned(false); setHoverInfo(null); setShowRepaint(false); setRepaintTarget(null);
    }
  }

  function handleZoneLeave() { if (!isPinned && !activeTool) scheduleHide(); if (brushCursorWrapperRef.current) brushCursorWrapperRef.current.style.visibility = 'hidden'; if (stampCursorWrapperRef.current) stampCursorWrapperRef.current.style.visibility = 'hidden'; if (activeTool === 'text') setTextCursor(null); }
  function handleTooltipEnter() { cancelHide(); }
  function handleTooltipLeave() { if (!isPinned) scheduleHide(); }

  function handleRemove() {
    if (!hoverInfo) return;
    onRemoveBlock(hoverInfo.csId);
    closeTooltip();
  }

  function handleRepaintItemClick(entry: RepaintEntry) {
    if (!hoverInfo || !paintData) return;
    if (is3D) {
      setRepaintTarget(entry);
    } else {
      onImageUpdate(repaintPixels(paintData, hoverInfo.baseId, entry.baseId, cp));
      closeTooltip();
    }
  }

  function handleRepaintShade(shade: 0 | 1 | 2) {
    if (!hoverInfo || !paintData || !repaintTarget) return;
    onImageUpdate(repaintPixels(paintData, hoverInfo.baseId, repaintTarget.baseId, cp, shade));
    closeTooltip();
  }

  // ── Tooltip positioning ─────────────────────────────────────────────────────

  const TOOLTIP_W = 220;
  const TOOLTIP_H = repaintTarget ? 160 : showRepaint ? 320 : 130;
  const RIGHT_PANEL_W = 260;
  const spaceOnRight = window.innerWidth - RIGHT_PANEL_W - (mousePos.x + 12);
  const ttLeft = spaceOnRight >= TOOLTIP_W
    ? mousePos.x + 12
    : Math.max(8, mousePos.x - TOOLTIP_W - 12);
  const ttTop  = Math.min(mousePos.y + 12, window.innerHeight - TOOLTIP_H - 8);

  // ── Cursor style ────────────────────────────────────────────────────────────

  const hasBrushCursor = activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'fill' || activeTool === 'pattern' || activeTool === 'pattern-tile';
  const zoneCursor = hasBrushCursor
    ? 'none'
    : activeTool === 'text'
    ? (textCursor ?? 'crosshair')
    : activeTool === 'eyedropper'
    ? 'crosshair'
    : activeTool === 'gradient'
    ? 'crosshair'
    : (activeTool === 'select-rect' || activeTool === 'select-lasso' || activeTool === 'select-magic' || activeTool === 'select-pixel')
    ? 'crosshair'
    : activeTool === 'move'
    ? (moveDragRef.current ? 'grabbing' : 'grab')
    : undefined;

  const isStampMode = activeTool === 'pattern-tile' && patternAnchorMode === 'brush';

  // Cursor SVG content — memoized: recomputed only when tool/brushSize/scale changes, NOT per mousemove
  const brushCursorContent = useMemo(() => {
    if (!hasBrushCursor || isStampMode) return null;
    if (activeTool === 'fill') {
      const s = Math.max(scale * 2, 16);
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display: 'block' }}>
          <line x1={s/2} y1={0} x2={s/2} y2={s} stroke="rgba(255,60,60,0.85)" strokeWidth="1"/>
          <line x1={0} y1={s/2} x2={s} y2={s/2} stroke="rgba(255,60,60,0.85)" strokeWidth="1"/>
        </svg>
      );
    }
    const r = brushSize / 2;
    const ri = Math.floor(r);
    const rects: React.ReactNode[] = [];
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        rects.push(
          <rect key={`${dx},${dy}`}
            x={(dx + ri) * scale} y={(dy + ri) * scale}
            width={scale} height={scale}
            fill="rgba(255,60,60,0.25)" stroke="rgba(255,60,60,0.75)" strokeWidth="0.5"
          />,
        );
      }
    }
    const span = 2 * ri + 1;
    return <svg width={span * scale} height={span * scale} style={{ display: 'block' }}>{rects}</svg>;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBrushCursor, isStampMode, activeTool, brushSize, scale]);

  // ── Canvas child ────────────────────────────────────────────────────────────

  const processedLayer = mode === 'block' ? (
    <BlockCanvas
      imageData={displayImageData} cp={cp} blockSelection={blockSelection}
      width={width} height={height} showGrid={showGrid} scale={scale}
    />
  ) : (
    <MapCanvas
      imageData={displayImageData} originalData={originalData}
      showOriginal={showOriginal} showGrid={showGrid}
      width={width} height={height} scale={scale}
      overlayRef={overlayCanvasRef}
    />
  );

  const inner = splitPos != null ? (
    <div
      ref={splitContainerRef}
      className="split-canvas-container"
      onMouseEnter={handleContainerMouseEnter}
      onTouchMove={handleContainerTouchMove}
      onTouchEnd={handleContainerTouchEnd}
    >
      <div style={isDraggingSplit ? { pointerEvents: 'none' } : undefined}>
        {processedLayer}
      </div>
      {originalData && (
        <div
          ref={splitOrigLayerRef}
          className="split-original-layer"
          style={{ clipPath: `inset(0 ${100 - (splitPos ?? 50)}% 0 0)`, pointerEvents: 'none' }}
        >
          <MapCanvas
            imageData={originalData} originalData={null}
            showOriginal={false} showGrid={false}
            width={width} height={height} scale={scale}
          />
        </div>
      )}
      <div
        ref={splitDividerRef}
        className="split-divider"
        style={{ left: `${splitPos ?? 50}%` }}
        onMouseDown={handleDividerMouseDown}
        onClick={e => e.stopPropagation()}
        onTouchStart={handleDividerTouchStart}
      >
        <div
          className="split-handle"
          onMouseDown={handleDividerMouseDown}
          onClick={e => e.stopPropagation()}
        >◀▶</div>
      </div>
      <span className={`split-label split-label-left${labelsVisible ? ' visible' : ''}`}>ORIGINAL</span>
      <span className={`split-label split-label-right${labelsVisible ? ' visible' : ''}`}>PROCESSED</span>
    </div>
  ) : processedLayer;

  return (
    <div
      ref={canvasZoneRef}
      className="preview-hover-zone"
      style={zoneCursor ? { cursor: zoneCursor } : undefined}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleZoneLeave}
      onMouseDown={handleZoneMouseDown}
      onClick={handleZoneClick}
    >
      {inner}

      {/* Brush cursor — position set imperatively via transform (no layout reflow) */}
      <div
        ref={brushCursorWrapperRef}
        style={{
          position: 'fixed', left: 0, top: 0, willChange: 'transform',
          visibility: 'hidden', pointerEvents: 'none', zIndex: 9999,
          display: hasBrushCursor && !isStampMode ? 'block' : 'none',
        }}
      >
        {brushCursorContent}
      </div>

      {/* ── Pattern stamp cursor — wrapper positioned imperatively, cells re-render on pattern/scale change ── */}
      {isStampMode && activePattern && (() => {
        const pw = activePattern.width, ph = activePattern.height;
        const cells: React.ReactNode[] = [];
        for (let ty = 0; ty < ph; ty++) {
          for (let tx = 0; tx < pw; tx++) {
            const block = activePattern.pixels[ty * pw + tx];
            if (!block || block.baseId === -1) {
              cells.push(<rect key={`${tx},${ty}`} x={tx * scale} y={ty * scale} width={scale} height={scale} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />);
            } else {
              const c = cp.colors.find(col => col.baseId === block.baseId && col.shade === block.shade) ?? cp.colors.find(col => col.baseId === block.baseId);
              const fill = c ? `rgba(${c.r},${c.g},${c.b},0.85)` : 'rgba(128,128,128,0.5)';
              cells.push(<rect key={`${tx},${ty}`} x={tx * scale} y={ty * scale} width={scale} height={scale} fill={fill} stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />);
            }
          }
        }
        return (
          <div ref={stampCursorWrapperRef} style={{ position: 'fixed', left: 0, top: 0, willChange: 'transform', visibility: 'hidden', pointerEvents: 'none', zIndex: 9999 }}>
            <svg width={pw * scale} height={ph * scale} style={{ display: 'block', imageRendering: 'pixelated' }}>
              {cells}
            </svg>
          </div>
        );
      })()}

      {/* ── Text toolbar (top-center bar, visible when textState active) ── */}
      {textState !== null && activeTool === 'text' && (
        <div
          className="text-toolbar"
          style={{ position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10002, display: 'flex', gap: 6, alignItems: 'center', background: '#1a1a2e', border: '1px solid rgba(87,255,110,0.4)', borderRadius: 8, padding: '6px 10px', boxShadow: '0 4px 16px rgba(0,0,0,0.6)' }}
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Text input */}
          <input
            className="text-toolbar-input"
            autoFocus
            value={textState.value}
            onChange={e => setTextState(s => s ? { ...s, value: e.target.value } : s)}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); cancelText(); }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmText(); }
            }}
            placeholder="Введи текст…"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'rgba(87,255,110,0.9)', fontFamily: textState.font, fontSize: 13, minWidth: 120 }}
          />
          {/* Font selector */}
          <select
            value={textState.font}
            onChange={e => setTextState(s => s ? { ...s, font: e.target.value } : s)}
            style={{ background: '#0d0d1a', border: '1px solid rgba(87,255,110,0.3)', color: 'rgba(87,255,110,0.7)', borderRadius: 4, fontSize: 12, padding: '2px 4px' }}
          >
            {TEXT_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          {/* Size */}
          <input type="number" min={4} max={64} value={textState.size}
            onChange={e => setTextState(s => s ? { ...s, size: Math.max(4, Math.min(64, +e.target.value)) } : s)}
            style={{ background: '#0d0d1a', border: '1px solid rgba(87,255,110,0.3)', color: 'rgba(87,255,110,0.7)', borderRadius: 4, fontSize: 12, width: 48, textAlign: 'center', padding: '2px 4px' }}
          />
          {/* Stroke width */}
          <input type="number" min={0} max={4} value={textState.strokeWidth}
            onChange={e => setTextState(s => s ? { ...s, strokeWidth: Math.max(0, Math.min(4, +e.target.value)) } : s)}
            style={{ background: '#0d0d1a', border: '1px solid rgba(87,255,110,0.3)', color: 'rgba(87,255,110,0.7)', borderRadius: 4, fontSize: 12, width: 36, textAlign: 'center', padding: '2px 4px' }}
            title="Обводка"
          />
          {/* Stroke block picker */}
          <div style={{ position: 'relative' }}>
            {textState.strokeBlock
              ? <span className="paint-swatch-icon text-stroke-swatch"
                  style={{ backgroundImage: `url(${SPRITE_URL})`, backgroundPosition: `-${textState.strokeBlock.blockId * 32}px -${textState.strokeBlock.csId * 32}px` }}
                  title={textState.strokeBlock.displayName} onClick={() => setShowStrokePicker(v => !v)} />
              : <span className="paint-swatch-icon text-stroke-swatch text-stroke-swatch--none"
                  title="Выбрать цвет обводки" onClick={() => setShowStrokePicker(v => !v)}>+</span>
            }
            {showStrokePicker && (
              <BlockPickerPopup blockSelection={blockSelection} current={textState.strokeBlock}
                onSelect={b => { setTextState(s => s ? { ...s, strokeBlock: b } : s); setShowStrokePicker(false); }}
                onClose={() => setShowStrokePicker(false)} />
            )}
          </div>
          {/* Confirm / Cancel */}
          <button onClick={confirmText} style={{ background: 'rgba(87,255,110,0.15)', border: '1px solid rgba(87,255,110,0.5)', color: 'rgba(87,255,110,0.9)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 14 }}>✓</button>
          <button onClick={cancelText} style={{ background: 'rgba(60,60,60,0.3)', border: '1px solid rgba(120,120,120,0.3)', color: 'rgba(180,180,180,0.7)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )}

      {hoverInfo && !activeTool && (
        <div
          ref={tooltipRef}
          className={`hover-tooltip${isPinned ? ' hover-tooltip-pinned' : ''}`}
          style={{ left: ttLeft, top: ttTop }}
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
          onClick={e => e.stopPropagation()}
        >
          {isPinned && (
            <button className="hover-tooltip-close" onClick={closeTooltip} title="Close">✕</button>
          )}
          <div className="hover-tooltip-block">
            <div className="hover-tooltip-icon-wrap">
              {(() => {
                const row = COLOUR_ROWS[hoverInfo.csId];
                return (
                  <BlockIcon
                    nbtName={COLOUR_ROWS[hoverInfo.csId]?.blocks.find(b => b.blockId === hoverInfo.blockId)?.nbtName ?? ''}
                    blockId={hoverInfo.blockId}
                    csId={hoverInfo.csId}
                    r={row?.r ?? 128} g={row?.g ?? 128} b={row?.b ?? 128}
                    className="hover-tooltip-icon"
                  />
                );
              })()}
            </div>
            <div className="hover-tooltip-info">
              <span className="hover-tooltip-name">{hoverInfo.displayName}</span>
              <span className="hover-tooltip-group">{hoverInfo.colourName}</span>
            </div>
          </div>

          {!showRepaint && (
            <div className="hover-tooltip-actions">
              <button className="hover-btn hover-btn-remove" onClick={handleRemove}>Remove</button>
              <button className="hover-btn hover-btn-repaint" onClick={() => setShowRepaint(true)}>Repaint ▸</button>
            </div>
          )}

          {showRepaint && !repaintTarget && (
            <div className="repaint-picker">
              <div className="repaint-picker-header">
                <span>Pick replacement</span>
                <button className="repaint-back-btn" onClick={() => { setShowRepaint(false); setRepaintTarget(null); }}>✕</button>
              </div>
              <div className="repaint-picker-list">
                {repaintEntries.map(e => (
                  <button
                    key={`${e.csId}_${e.blockId}`}
                    className={`repaint-item${e.csId === hoverInfo.csId ? ' repaint-item-current' : ''}`}
                    onClick={() => handleRepaintItemClick(e)}
                    disabled={e.csId === hoverInfo.csId}
                  >
                    <div className="repaint-item-icon-wrap">
                      {(() => {
                        const row = COLOUR_ROWS[e.csId];
                        return (
                          <BlockIcon
                            nbtName={e.nbtName}
                            blockId={e.blockId}
                            csId={e.csId}
                            r={row?.r ?? 128} g={row?.g ?? 128} b={row?.b ?? 128}
                            className="repaint-item-icon"
                          />
                        );
                      })()}
                    </div>
                    <span className="repaint-item-name">{e.displayName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {repaintTarget && (
            <div className="repaint-picker">
              <div className="repaint-picker-header">
                <span>{repaintTarget.displayName}</span>
                <button className="repaint-back-btn" onClick={() => setRepaintTarget(null)}>◀</button>
              </div>
              <div className="repaint-shade-row">
                {([0, 1, 2] as const).map(sh => {
                  const shLabel = ['▼ Dark', '■ Mid', '▲ Bright'] as const;
                  const sc = cp.colors.find(c => c.baseId === repaintTarget.baseId && c.shade === sh);
                  const bg = sc ? `rgb(${sc.r},${sc.g},${sc.b})` : '#888';
                  return (
                    <button
                      key={sh}
                      className="repaint-shade-btn"
                      style={{ '--shade-color': bg } as React.CSSProperties}
                      onClick={() => handleRepaintShade(sh)}
                      title={shLabel[sh]}
                    >{shLabel[sh]}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
