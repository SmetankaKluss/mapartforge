import { useState, useMemo, useRef, useEffect } from 'react';
import { MapCanvas } from './MapCanvas';
import { BlockCanvas } from './BlockCanvas';
import { BlockIcon } from './BlockIcon';
import { COLOUR_ROWS } from '../lib/paletteBlocks';

const SPRITE_URL = 'https://raw.githubusercontent.com/rebane2001/mapartcraft/master/src/images/textures.png';
import type { BlockSelection } from '../lib/paletteBlocks';
import type { ComputedPalette } from '../lib/dithering';
import { rgbToOklab, oklabDistance } from '../lib/oklab';

// ── Exported types ────────────────────────────────────────────────────────────

export type PaintTool = 'eyedropper' | 'brush' | 'fill';

export interface PaintBlock {
  csId: number;
  blockId: number;
  baseId: number;
  displayName: string;
  colourName: string;
}

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

interface Props {
  mode: 'pixel' | 'block';
  imageData: ImageData | null;
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
  brushSize: 1 | 2 | 3;
  onRemoveBlock: (csId: number) => void;
  onImageUpdate: (data: ImageData) => void;
  onToolChange: (tool: PaintTool | null) => void;
  onPaintBlockChange: (block: PaintBlock) => void;
  splitPos?: number;
  onSplitPosChange?: (p: number) => void;
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
  for (let i = 0; i < cp.colors.length; i++) {
    const c = cp.colors[i];
    if (c.shade !== 2) continue;
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
  targetBaseId: number, cp: ComputedPalette,
  colorLookup: Map<number, { shade: number }>,
): void {
  const i = (py * buf.width + px) * 4;
  const key = (buf.data[i] << 16) | (buf.data[i + 1] << 8) | buf.data[i + 2];
  const shade = colorLookup.get(key)?.shade ?? 2;
  const tc = getTargetColor(shade, targetBaseId, cp);
  if (!tc) return;
  buf.data[i] = tc.r; buf.data[i + 1] = tc.g; buf.data[i + 2] = tc.b;
}

function floodFill(
  buf: ImageData, startX: number, startY: number,
  srcBaseId: number, tgtBaseId: number,
  cp: ComputedPalette, colorLookup: Map<number, { baseId: number; shade: number }>,
): void {
  if (srcBaseId === tgtBaseId) return;
  const { width: w, height: h, data } = buf;
  const visited = new Uint8Array(w * h);
  const stack = [startY * w + startX];
  while (stack.length > 0) {
    const flat = stack.pop()!;
    if (visited[flat]) continue;
    visited[flat] = 1;
    const bx = flat % w, by = (flat / w) | 0;
    const bi = flat * 4;
    const key = (data[bi] << 16) | (data[bi + 1] << 8) | data[bi + 2];
    const info = colorLookup.get(key);
    if (!info || info.baseId !== srcBaseId) continue;
    const tc = getTargetColor(info.shade, tgtBaseId, cp);
    if (tc) { data[bi] = tc.r; data[bi + 1] = tc.g; data[bi + 2] = tc.b; }
    if (bx > 0)     stack.push(flat - 1);
    if (bx < w - 1) stack.push(flat + 1);
    if (by > 0)     stack.push(flat - w);
    if (by < h - 1) stack.push(flat + w);
  }
}

function repaintPixels(src: ImageData, srcBaseId: number, targetBaseId: number, cp: ComputedPalette): ImageData {
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
    const shade = srcKeyToShade.get(key);
    if (shade === undefined) continue;
    const tc = shadeToTarget.get(shade) ?? shadeToTarget.get(2) ?? [...shadeToTarget.values()][0];
    if (!tc) continue;
    data[i * 4] = tc.r; data[i * 4 + 1] = tc.g; data[i * 4 + 2] = tc.b;
  }
  return newData;
}

// ─────────────────────────────────────────────────────────────────────────────

const HIDE_DELAY = 150;

export function PreviewCanvas({
  mode, imageData, originalData, showOriginal, showGrid,
  width, height, scale, cp, blockSelection,
  activeTool, paintBlock, brushSize,
  onRemoveBlock, onImageUpdate, onToolChange, onPaintBlockChange,
  splitPos, onSplitPosChange,
}: Props) {
  // Tooltip state
  const [hoverInfo, setHoverInfo]     = useState<HoverInfo | null>(null);
  const [mousePos, setMousePos]       = useState({ x: 0, y: 0 });
  const [showRepaint, setShowRepaint] = useState(false);
  const [isPinned, setIsPinned]       = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Paint state
  const paintBufferRef   = useRef<ImageData | null>(null);
  const isDraggingRef    = useRef(false);
  const paintedSetRef    = useRef<Set<number>>(new Set());
  const [paintVersion, setPaintVersion] = useState(0);
  const [brushCursor, setBrushCursor]   = useState<string>('cell');

  // Split slider state
  const isDraggingSplitRef   = useRef(false);
  const splitContainerRef    = useRef<HTMLDivElement>(null);
  const onSplitPosChangeRef  = useRef(onSplitPosChange);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  // Stable refs so global listeners never capture stale closures
  const onImageUpdateRef = useRef(onImageUpdate);
  onImageUpdateRef.current = onImageUpdate;
  const canvasZoneRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({ activeTool, paintBlock, scale, width, height, cp, colorLookup: null as unknown as Map<number, LookupEntry>, brushSize: 1 as 1 | 2 | 3 });

  const colorLookup = useMemo(() => buildColorLookup(cp, blockSelection), [cp, blockSelection]);
  propsRef.current = { activeTool, paintBlock, scale, width, height, cp, colorLookup, brushSize };
  // Keep ref current each render so stable global handlers see latest callback
  onSplitPosChangeRef.current = onSplitPosChange;

  const displayImageData = paintBufferRef.current ?? imageData;

  // ── Cleanup timers ──────────────────────────────────────────────────────────

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    clearTimeout(labelTimerRef.current);
  }, []);

  // ── Show split labels on mount / when split activates ───────────────────────
  useEffect(() => {
    if (splitPos == null) return;
    setLabelsVisible(true);
    labelTimerRef.current = setTimeout(() => setLabelsVisible(false), 2000);
    return () => clearTimeout(labelTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitPos != null]);

  // ── Close tooltip when a paint tool activates ───────────────────────────────

  useEffect(() => {
    if (activeTool) { setIsPinned(false); setHoverInfo(null); setShowRepaint(false); }
  }, [activeTool]);

  // ── Escape key ──────────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsPinned(false); setHoverInfo(null); setShowRepaint(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── Global mousemove + mouseup for brush drag ───────────────────────────────

  useEffect(() => {
    function onGlobalMouseMove(e: MouseEvent) {
      // Split drag takes priority
      if (isDraggingSplitRef.current && splitContainerRef.current) {
        const rect = splitContainerRef.current.getBoundingClientRect();
        const pos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        onSplitPosChangeRef.current?.(pos);
        return;
      }
      const { activeTool, paintBlock, scale, width, height, cp, colorLookup, brushSize } = propsRef.current;
      if (!isDraggingRef.current || activeTool !== 'brush' || !paintBlock || !paintBufferRef.current) return;
      const canvas = canvasZoneRef.current?.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = Math.floor((e.clientX - rect.left) / scale);
      const cy = Math.floor((e.clientY - rect.top)  / scale);
      if (cx < 0 || cx >= width || cy < 0 || cy >= height) return;
      // Track center to avoid repainting the same brush center
      const centerKey = cy * width + cx;
      if (paintedSetRef.current.has(centerKey)) return;
      paintedSetRef.current.add(centerKey);
      const half = Math.floor(brushSize / 2);
      for (let dy = 0; dy < brushSize; dy++) {
        for (let dx = 0; dx < brushSize; dx++) {
          const bx = cx - half + dx, by = cy - half + dy;
          if (bx < 0 || bx >= width || by < 0 || by >= height) continue;
          paintPixelInBuffer(paintBufferRef.current!, bx, by, paintBlock.baseId, cp, colorLookup);
        }
      }
      setPaintVersion(v => v + 1);
    }

    function onGlobalMouseUp() {
      if (isDraggingSplitRef.current) { isDraggingSplitRef.current = false; setIsDraggingSplit(false); return; }
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      if (paintBufferRef.current) {
        onImageUpdateRef.current(paintBufferRef.current);
        paintBufferRef.current = null;
        setPaintVersion(v => v + 1);
      }
    }

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup',   onGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup',   onGlobalMouseUp);
    };
  }, []); // stable — uses only refs

  // ── Brush cursor generation ─────────────────────────────────────────────────

  useEffect(() => {
    if (activeTool !== 'brush' || !paintBlock) { setBrushCursor('cell'); return; }
    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!active) return;
      try {
        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        const ctx = c.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, paintBlock.blockId * 32, paintBlock.csId * 32, 32, 32, 0, 0, 16, 16);
        setBrushCursor(`url(${c.toDataURL()}) 8 8, cell`);
      } catch { setBrushCursor('cell'); }
    };
    img.onerror = () => { if (active) setBrushCursor('cell'); };
    img.src = SPRITE_URL;
    return () => { active = false; };
  }, [activeTool, paintBlock?.csId, paintBlock?.blockId]);

  // ── Repaint list memo ───────────────────────────────────────────────────────

  const repaintEntries = useMemo<RepaintEntry[]>(() => {
    if (!hoverInfo || !showRepaint) return [];
    return buildRepaintEntries(hoverInfo.r, hoverInfo.g, hoverInfo.b, cp, blockSelection);
  }, [hoverInfo, showRepaint, cp, blockSelection]);

  // ── Tooltip helpers ─────────────────────────────────────────────────────────

  function scheduleHide() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setHoverInfo(null); setShowRepaint(false); setIsPinned(false);
    }, HIDE_DELAY);
  }

  function cancelHide() {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  }

  function closeTooltip() {
    cancelHide(); setIsPinned(false); setHoverInfo(null); setShowRepaint(false);
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
    const info = colorLookup.get((r << 16) | (g << 8) | b);
    if (!info) return null;
    return { pixelX: px, pixelY: py, r, g, b, ...info };
  }

  // ── Paint tool handlers ─────────────────────────────────────────────────────

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
      onSplitPosChangeRef.current?.(Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100)));
    }
  }

  function handleContainerTouchEnd() { isDraggingSplitRef.current = false; setIsDraggingSplit(false); }

  function handleContainerMouseEnter() { if (splitPos != null) showSplitLabels(); }

  function handleZoneMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // If split drag is in progress (e.g. event bubbled through), ignore
    if (isDraggingSplitRef.current) return;
    // Alt+drag anywhere on canvas → move split divider
    if (e.altKey && splitPos != null && splitContainerRef.current) {
      e.preventDefault();
      isDraggingSplitRef.current = true;
      const rect = splitContainerRef.current.getBoundingClientRect();
      onSplitPosChangeRef.current?.(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
      showSplitLabels();
      return;
    }
    if (!activeTool || showOriginal) return;
    e.preventDefault(); // prevent text selection during drag

    if (activeTool === 'eyedropper') {
      const info = lookupAtEvent(e);
      if (info) {
        onPaintBlockChange({ csId: info.csId, blockId: info.blockId, baseId: info.baseId, displayName: info.displayName, colourName: info.colourName });
        onToolChange('brush'); // auto-switch to brush after picking
      }
      return;
    }

    if (!imageData || !paintBlock) return;
    const pos = getPixelCoords(e);
    if (!pos) return;

    if (activeTool === 'brush') {
      isDraggingRef.current = true;
      paintedSetRef.current = new Set();
      // Clone current imageData into paint buffer
      paintBufferRef.current = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
      // Paint first brush stroke
      const { px: cx, py: cy } = pos;
      paintedSetRef.current.add(cy * width + cx);
      const half = Math.floor(brushSize / 2);
      for (let dy = 0; dy < brushSize; dy++) {
        for (let dx = 0; dx < brushSize; dx++) {
          const bx = cx - half + dx, by = cy - half + dy;
          if (bx < 0 || bx >= width || by < 0 || by >= height) continue;
          paintPixelInBuffer(paintBufferRef.current, bx, by, paintBlock.baseId, cp, colorLookup);
        }
      }
      setPaintVersion(v => v + 1);
    } else if (activeTool === 'fill') {
      const buf = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
      const i = (pos.py * buf.width + pos.px) * 4;
      const key = (buf.data[i] << 16) | (buf.data[i + 1] << 8) | buf.data[i + 2];
      const existing = colorLookup.get(key);
      if (!existing || existing.baseId === paintBlock.baseId) return;
      floodFill(buf, pos.px, pos.py, existing.baseId, paintBlock.baseId, cp, colorLookup);
      onImageUpdate(buf); // commits + pushes history
    }
  }

  // ── Tooltip handlers ────────────────────────────────────────────────────────

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    // During brush drag: handled globally — but also cancel any tooltip hide
    if (isDraggingRef.current) { cancelHide(); return; }
    // Other tools active: no tooltip
    if (activeTool) return;

    cancelHide();
    if (isPinned) return;
    const info = lookupAtEvent(e);
    if (!info) return;
    setMousePos({ x: e.clientX, y: e.clientY });
    setHoverInfo(info);
  }

  function handleZoneClick(e: React.MouseEvent<HTMLDivElement>) {
    if (isDraggingSplitRef.current) return; // ignore click if split drag just ended
    if (activeTool) return; // paint tools handle clicks via mousedown
    const info = lookupAtEvent(e);
    if (info) {
      setIsPinned(true);
      setHoverInfo(info);
      setMousePos({ x: e.clientX, y: e.clientY });
      setShowRepaint(false);
      cancelHide();
    } else {
      setIsPinned(false); setHoverInfo(null); setShowRepaint(false);
    }
  }

  function handleZoneLeave() { if (!isPinned && !activeTool) scheduleHide(); }
  function handleTooltipEnter() { cancelHide(); }
  function handleTooltipLeave() { if (!isPinned) scheduleHide(); }

  function handleRemove() {
    if (!hoverInfo) return;
    onRemoveBlock(hoverInfo.csId);
    closeTooltip();
  }

  function handleRepaintClick(entry: RepaintEntry) {
    if (!hoverInfo || !imageData) return;
    onImageUpdate(repaintPixels(imageData, hoverInfo.baseId, entry.baseId, cp));
    closeTooltip();
  }

  // ── Tooltip positioning ─────────────────────────────────────────────────────

  const TOOLTIP_W = 220;
  const TOOLTIP_H = showRepaint ? 320 : 130;
  const ttLeft = Math.min(mousePos.x + 12, window.innerWidth  - TOOLTIP_W - 8);
  const ttTop  = Math.min(mousePos.y + 12, window.innerHeight - TOOLTIP_H - 8);

  // ── Cursor style ────────────────────────────────────────────────────────────

  const zoneCursor = activeTool === 'eyedropper' || activeTool === 'fill'
    ? 'crosshair'
    : activeTool === 'brush'
      ? brushCursor
      : undefined;

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
      {/* Bottom: processed (always full width) */}
      <div style={isDraggingSplit ? { pointerEvents: 'none' } : undefined}>
        {processedLayer}
      </div>
      {/* Top: original clipped to left side of divider */}
      {originalData && (
        <div
          className="split-original-layer"
          style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)`, pointerEvents: 'none' }}
        >
          <MapCanvas
            imageData={originalData} originalData={null}
            showOriginal={false} showGrid={false}
            width={width} height={height} scale={scale}
          />
        </div>
      )}
      {/* Divider line + handle */}
      <div
        className="split-divider"
        style={{ left: `${splitPos}%` }}
        onMouseDown={handleDividerMouseDown}
        onTouchStart={handleDividerTouchStart}
      >
        <div className="split-handle" onMouseDown={e => e.stopPropagation()}>◀▶</div>
      </div>
      {/* Labels */}
      <span className={`split-label split-label-left${labelsVisible ? ' visible' : ''}`}>ORIGINAL</span>
      <span className={`split-label split-label-right${labelsVisible ? ' visible' : ''}`}>PROCESSED</span>
    </div>
  ) : processedLayer;

  // paintVersion is used only to force re-renders when paint buffer mutates
  void paintVersion;

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

      {hoverInfo && !activeTool && (
        <div
          className={`hover-tooltip${isPinned ? ' hover-tooltip-pinned' : ''}`}
          style={{ left: ttLeft, top: ttTop }}
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
          onClick={e => e.stopPropagation()}
        >
          {isPinned && <span className="hover-tooltip-pin-icon">📌</span>}
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

          {showRepaint && (
            <div className="repaint-picker">
              <div className="repaint-picker-header">
                <span>Pick replacement</span>
                <button className="repaint-back-btn" onClick={() => setShowRepaint(false)}>✕</button>
              </div>
              <div className="repaint-picker-list">
                {repaintEntries.map(e => (
                  <button
                    key={`${e.csId}_${e.blockId}`}
                    className={`repaint-item${e.csId === hoverInfo.csId ? ' repaint-item-current' : ''}`}
                    onClick={() => handleRepaintClick(e)}
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
        </div>
      )}
    </div>
  );
}
