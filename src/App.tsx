import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { PreviewCanvas } from './components/PreviewCanvas';
import type { PaintTool, PaintBlock } from './components/PreviewCanvas';
import { BlockPickerPopup } from './components/BlockPickerPopup';
import { SPRITE_URL } from './components/BlockCanvas';
import { CompareView } from './components/CompareView';
import { MaterialsList } from './components/MaterialsList';
import { Controls } from './components/Controls';
import { Adjustments } from './components/Adjustments';
import { PaletteEditor } from './components/PaletteEditor';
import { ExportPanel } from './components/ExportPanel';
import type { DitheringMode, KlussParams } from './lib/dithering';
import { buildComputedPalette, DEFAULT_KLUSS_PARAMS } from './lib/dithering';
import type { ComputedPalette } from './lib/dithering';
import { gridPixelWidth, gridPixelHeight, gridScale } from './lib/types';
import type { MapGrid } from './lib/types';
import { buildPaletteFromSelection, DEFAULT_SELECTION } from './lib/paletteBlocks';
import type { BlockSelection } from './lib/paletteBlocks';
import { DEFAULT_ADJUSTMENTS } from './lib/adjustments';
import type { ImageAdjustments } from './lib/adjustments';
import { saveSettings, loadSettings, clearSettings } from './lib/localStorage';
import type { SavedSettings } from './lib/localStorage';
import { loadShare } from './lib/share';
import { decodePalette, PALETTE_PARAM } from './lib/paletteShare';
import { downloadPng } from './lib/exportPng';
import { exportLitematic } from './lib/exportLitematic';
import { NumInput } from './components/NumInput';
import { CropModal } from './components/CropModal';
import { WikiModal } from './components/WikiModal';
import { createTour, shouldAutoStart } from './lib/tour';
import 'driver.js/dist/driver.css';
import './App.css';

// Exponential zoom mapping: slider 0–100 ↔ zoom 50–800%
function sliderToZoom(s: number): number { return Math.round(50 * Math.pow(16, s / 100)); }
function zoomToSlider(z: number): number { return Math.round(Math.log(z / 50) / Math.log(16) * 100); }

// Support blocks for 3D staircase (nbt name → sprite coords + label)
const SUPPORT_BLOCKS_PALETTE = [
  { nbt: 'stone',        csId: 9,  blockId: 4,  label: 'Stone' },
  { nbt: 'cobblestone',  csId: 9,  blockId: 0,  label: 'Cobble' },
  { nbt: 'deepslate',    csId: 58, blockId: 0,  label: 'Deepslate' },
  { nbt: 'smooth_stone', csId: 9,  blockId: 18, label: 'Smooth' },
  { nbt: 'granite',      csId: 8,  blockId: 7,  label: 'Granite' },
  { nbt: 'diorite',      csId: 12, blockId: 1,  label: 'Diorite' },
  { nbt: 'andesite',     csId: 9,  blockId: 9,  label: 'Andesite' },
  { nbt: 'dirt',         csId: 8,  blockId: 3,  label: 'Dirt' },
  { nbt: 'oak_planks',   csId: 11, blockId: 1,  label: 'Oak' },
  { nbt: 'netherrack',   csId: 34, blockId: 0,  label: 'Nether' },
  { nbt: 'blackstone',   csId: 28, blockId: 9,  label: 'Blackstone' },
] as const;

const SUPPORT_MODE_TITLES: Record<1 | 2 | 3, string> = {
  1: 'Under floating blocks only (sand, gravel, lichens…)',
  2: 'One block under every art block',
  3: 'Two blocks under every art block',
};

const MAX_HISTORY = 20;

interface HistoryEntry {
  imageData: ImageData | null;
  blockSelection: BlockSelection;
}

const DITHERING_LABELS: Record<DitheringMode, string> = {
  'none':            'None',
  'floyd-steinberg': 'Floyd–Steinberg',
  'stucki':          'Stucki',
  'jjn':             'JJN',
  'atkinson':        'Atkinson',
  'blue-noise':      'Blue Noise',
  'yliluoma2':       'Yliluoma #2',
  'kluss':           'KlussDither',
};
const ALL_MODES: DitheringMode[] = ['none', 'floyd-steinberg', 'stucki', 'jjn', 'atkinson', 'blue-noise', 'yliluoma2', 'kluss'];

export default function App() {
  // ── Restore persisted settings — lazy init runs exactly once on mount ─
  const [saved] = useState<Partial<SavedSettings>>(() => loadSettings());

  const [sourceImage, setSourceImage]   = useState<HTMLImageElement | null>(null);
  const [imageData, setImageData]       = useState<ImageData | null>(null);
  const [originalData, setOriginalData] = useState<ImageData | null>(null);
  const [splitPos, setSplitPos] = useState(50);
  const [showGrid, setShowGrid]         = useState(false);
  const [zoom, setZoom]                 = useState(100);
  const [compareMode, setCompareMode]   = useState(false);
  const [compareLeft,  setCompareLeft]  = useState<DitheringMode>('floyd-steinberg');
  const [compareRight, setCompareRight] = useState<DitheringMode>('yliluoma2');
  const [compareData, setCompareData]   = useState<{ left: ImageData; right: ImageData } | null>(null);
  const [mapMode, setMapMode]           = useState<'2d' | '3d'>(saved.mapMode ?? '2d');
  const [staircaseMode, setStaircaseMode] = useState<'classic' | 'optimized'>(saved.staircaseMode ?? 'classic');
  const [textureMode, setTextureMode]   = useState<'pixel' | 'block'>('pixel');
  const [dithering, setDithering]       = useState<DitheringMode>(saved.dithering ?? 'floyd-steinberg');
  const [intensity, setIntensity]       = useState(saved.intensity ?? 100);
  const [bnScale, setBnScale]           = useState(saved.bnScale ?? 2);
  const [klussParams, setKlussParams]   = useState<KlussParams>(DEFAULT_KLUSS_PARAMS);
  const [mapGrid, setMapGrid]           = useState<MapGrid>(saved.mapGrid ?? { wide: 1, tall: 1 });
  const [processing, setProcessing]     = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [blockSelection, setBlockSelection] = useState<BlockSelection>(saved.blockSelection ?? DEFAULT_SELECTION);
  const [adjustments, setAdjustments]   = useState<ImageAdjustments>(saved.adjustments ?? DEFAULT_ADJUSTMENTS);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showWiki, setShowWiki] = useState(false);
  const [showAdjustments, setShowAdjustments] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [activeTool, setActiveTool]     = useState<PaintTool | null>(null);
  const [paintBlock, setPaintBlock]     = useState<PaintBlock | null>(null);
  const [brushSize, setBrushSize]       = useState<1 | 2 | 3>(1);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [viewBanner,    setViewBanner]    = useState(false);
  const [paletteBanner, setPaletteBanner] = useState(false);
  const [supportBlock,  setSupportBlock]  = useState('stone');
  const [supportMode,   setSupportMode]   = useState<1 | 2 | 3>(2);
  const [resetDefaultsPending, setResetDefaultsPending] = useState(false);
  const resetDefaultsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [sourceHasAlpha, setSourceHasAlpha] = useState(false);
  const [bgMode, setBgMode] = useState<'color' | 'transparent'>('color');
  const [bgColor, setBgColor] = useState('#ffffff');
  const bgModeRef  = useRef<'color' | 'transparent'>('color');
  const bgColorRef = useRef('#ffffff');
  bgModeRef.current  = bgMode;
  bgColorRef.current = bgColor;
  // Always holds the originally-uploaded image so crop modal can re-crop from source
  const uploadedImageRef = useRef<HTMLImageElement | null>(null);
  const workerRef     = useRef<Worker | null>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const previewSectionRef = useRef<HTMLElement>(null);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [mobileTab, setMobileTab] = useState<'settings' | 'palette' | 'export'>('settings');
  const [tabletRightOpen, setTabletRightOpen] = useState(false);

  // Always-current ref — updated each render so callbacks never see stale state
  const latestRef = useRef<{ imageData: ImageData | null; blockSelection: BlockSelection }>({
    imageData: null, blockSelection: DEFAULT_SELECTION,
  });
  latestRef.current = { imageData, blockSelection };

  // Ref with all current state needed for export shortcuts (avoids stale closures)
  const exportRef = useRef({ imageData, dithering, mapGrid, activePalette: null as unknown as ReturnType<typeof buildComputedPalette>, blockSelection, mapMode, staircaseMode });


  // ── Auto-save settings to localStorage ──────────────────────────────────
  useEffect(() => { saveSettings({ dithering }); }, [dithering]);
  useEffect(() => { saveSettings({ intensity }); }, [intensity]);
  useEffect(() => { saveSettings({ mapGrid }); }, [mapGrid]);
  useEffect(() => { saveSettings({ blockSelection }); }, [blockSelection]);
  useEffect(() => { saveSettings({ adjustments }); }, [adjustments]);
  useEffect(() => { saveSettings({ mapMode }); }, [mapMode]);
  useEffect(() => { saveSettings({ staircaseMode }); }, [staircaseMode]);
  useEffect(() => { saveSettings({ bnScale }); }, [bnScale]);

  // Push current state onto undo stack before a tracked action
  const pushToHistory = useCallback(() => {
    const { imageData: img, blockSelection: sel } = latestRef.current;
    setUndoStack(prev => {
      const next = [...prev, { imageData: img, blockSelection: sel }];
      return next.length > MAX_HISTORY ? next.slice(1) : next;
    });
    setRedoStack([]);
  // latestRef is a stable ref, setters are stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const entry = prev[prev.length - 1];
      const cur = latestRef.current;
      setRedoStack(r => [...r, { imageData: cur.imageData, blockSelection: cur.blockSelection }]);
      setImageData(entry.imageData);
      setBlockSelection(entry.blockSelection);
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const entry = prev[prev.length - 1];
      const cur = latestRef.current;
      setUndoStack(u => {
        const next = [...u, { imageData: cur.imageData, blockSelection: cur.blockSelection }];
        return next.length > MAX_HISTORY ? next.slice(1) : next;
      });
      setImageData(entry.imageData);
      setBlockSelection(entry.blockSelection);
      return prev.slice(0, -1);
    });
  }, []);

  // Keyboard shortcuts for undo/redo + export — effect registered below,
  // after handleExportPng/handleExportLitematic are declared.

  // Keyboard shortcuts for paint tools (E / B / F / Escape) + view toggles (Z / O)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (!imageData) return;
      switch (e.code) {
        case 'KeyE': setActiveTool(t => t === 'eyedropper' ? null : 'eyedropper'); break;
        case 'KeyB': setActiveTool(t => t === 'brush' ? null : 'brush'); break;
        case 'KeyF': setActiveTool(t => t === 'fill' ? null : 'fill'); break;
        case 'Escape': setActiveTool(null); break;
        case 'KeyZ': setShowGrid(g => !g); break;
        case 'KeyO': if (!compareMode) setSplitPos(50); break;
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [imageData, compareMode]);


  const modeShades = mapMode === '2d' ? [2] : [0, 1, 2];

  // When adjustments are disabled, use zero adjustments for processing
  const effectiveAdjustments = showAdjustments ? adjustments : DEFAULT_ADJUSTMENTS;

  const activePalette = useMemo<ComputedPalette>(
    () => buildComputedPalette(buildPaletteFromSelection(blockSelection, modeShades)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blockSelection, mapMode],
  );

  // Keep exportRef current each render so keyboard shortcuts access fresh state
  exportRef.current = { imageData, dithering, mapGrid, activePalette, blockSelection, mapMode, staircaseMode };

  function handleCancelProcessing() {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (cancelTimerRef.current) { clearTimeout(cancelTimerRef.current); cancelTimerRef.current = null; }
    setShowCancel(false);
    setProcessing(false);
    setProcessingProgress(0);
  }

  function runProcess(
    img: HTMLImageElement,
    mode: DitheringMode,
    grid: MapGrid,
    intens: number,
    compare: boolean,
    cmpLeft: DitheringMode,
    cmpRight: DitheringMode,
    palette: ComputedPalette,
    adj: ImageAdjustments,
    bn: number,
    kp: KlussParams,
  ) {
    // Terminate any running worker and clear pending cancel timer
    workerRef.current?.terminate();
    if (cancelTimerRef.current) { clearTimeout(cancelTimerRef.current); cancelTimerRef.current = null; }

    setProcessing(true);
    setProcessingProgress(0);
    setShowCancel(false);

    const w = gridPixelWidth(grid);
    const h = gridPixelHeight(grid);

    // Show cancel button after 500 ms
    cancelTimerRef.current = setTimeout(() => setShowCancel(true), 500);

    const worker = new Worker(
      new URL('./workers/processor.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    function done() {
      if (cancelTimerRef.current) { clearTimeout(cancelTimerRef.current); cancelTimerRef.current = null; }
      setShowCancel(false);
      setProcessing(false);
      setProcessingProgress(0);
      if (workerRef.current === worker) workerRef.current = null;
    }

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setProcessingProgress(msg.pct as number);
      } else if (msg.type === 'result') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mk = (d: any) => new ImageData(new Uint8ClampedArray(d.buffer as ArrayBuffer), w, h);
        setImageData(mk(msg.processedData));
        setOriginalData(mk(msg.originalData));
        done();
      } else if (msg.type === 'compare_result') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mk = (d: any) => new ImageData(new Uint8ClampedArray(d.buffer as ArrayBuffer), w, h);
        setCompareData({ left: mk(msg.leftData), right: mk(msg.rightData) });
        setOriginalData(mk(msg.originalData));
        done();
      } else if (msg.type === 'error') {
        console.error('Processor worker error:', msg.message);
        done();
      }
    };
    worker.onerror = () => done();

    // Create transferable bitmap, then dispatch to worker
    createImageBitmap(img).then(bitmap => {
      // If a newer runProcess call superseded this one, discard
      if (workerRef.current !== worker) { bitmap.close(); return; }
      if (compare) {
        worker.postMessage(
          { type: 'compare', bitmap, width: w, height: h, intensity: intens / 100, leftMode: cmpLeft, rightMode: cmpRight, palette, adjustments: adj, bnScale: bn },
          [bitmap],
        );
      } else {
        worker.postMessage(
          { type: 'process', bitmap, options: { dithering: mode, width: w, height: h, intensity: intens / 100, bnScale: bn, palette, adjustments: adj, klussParams: kp, bgMode: bgModeRef.current, bgColor: bgColorRef.current } },
          [bitmap],
        );
      }
    }).catch(() => done());
  }

  const handleImageLoaded = useCallback((img: HTMLImageElement) => {
    uploadedImageRef.current = img;   // save original for crop modal
    // Detect transparency by sampling pixels at reduced scale
    const tc = document.createElement('canvas');
    tc.width  = Math.min(img.naturalWidth,  64);
    tc.height = Math.min(img.naturalHeight, 64);
    const tctx = tc.getContext('2d')!;
    tctx.drawImage(img, 0, 0, tc.width, tc.height);
    const td = tctx.getImageData(0, 0, tc.width, tc.height).data;
    let hasAlpha = false;
    for (let i = 3; i < td.length; i += 4) { if (td[i] < 255) { hasAlpha = true; break; } }
    setSourceHasAlpha(hasAlpha);
    if (!hasAlpha) { setBgMode('color'); bgModeRef.current = 'color'; }
    setSourceImage(img);
    setSplitPos(50);
    setUndoStack([]);
    setRedoStack([]);
    runProcess(img, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams);
  }, [dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams]);

  const handleCropApply = useCallback((croppedImg: HTMLImageElement) => {
    setShowCropModal(false);
    setSourceImage(croppedImg);
    setSplitPos(50);
    setUndoStack([]);
    setRedoStack([]);
    runProcess(croppedImg, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams);
  }, [dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams]);

  const handleDitheringChange = useCallback((mode: DitheringMode) => {
    setDithering(mode);
    if (sourceImage) runProcess(sourceImage, mode, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams);
  }, [sourceImage, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams]);

  const handleMapGridChange = useCallback((grid: MapGrid) => {
    setMapGrid(grid);
    if (sourceImage) runProcess(sourceImage, dithering, grid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams);
  }, [sourceImage, dithering, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams]);

  const handleIntensityChange = useCallback((v: number) => setIntensity(v), []);

  const handleIntensityCommit = useCallback((v: number) => {
    setIntensity(v);
    if (sourceImage) runProcess(sourceImage, dithering, mapGrid, v, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams);
  }, [sourceImage, dithering, mapGrid, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams]);

  const handleBnScaleChange = useCallback((v: number) => {
    setBnScale(v);
    if (sourceImage) runProcess(sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, v, klussParams);
  }, [sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, klussParams]);

  const handleKlussParamsChange = useCallback((kp: KlussParams) => {
    setKlussParams(kp);
    if (sourceImage) runProcess(sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, kp);
  }, [sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale]);

  const handleCompareModeChange = useCallback((enabled: boolean) => {
    setCompareMode(enabled);
    if (sourceImage) runProcess(sourceImage, dithering, mapGrid, intensity, enabled, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams);
  }, [sourceImage, dithering, mapGrid, intensity, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams]);

  const handleCompareSideChange = useCallback((side: 'left' | 'right', mode: DitheringMode) => {
    if (side === 'left') {
      setCompareLeft(mode);
      if (sourceImage) runProcess(sourceImage, dithering, mapGrid, intensity, true, mode, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams);
    } else {
      setCompareRight(mode);
      if (sourceImage) runProcess(sourceImage, dithering, mapGrid, intensity, true, compareLeft, mode, activePalette, effectiveAdjustments, bnScale, klussParams);
    }
  }, [sourceImage, dithering, mapGrid, intensity, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams]);

  const handleSelectionChange = useCallback((sel: BlockSelection) => {
    pushToHistory();
    setBlockSelection(sel);
    const shades = mapMode === '2d' ? [2] : [0, 1, 2];
    const newPalette = buildComputedPalette(buildPaletteFromSelection(sel, shades));
    if (sourceImage) runProcess(sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, newPalette, effectiveAdjustments, bnScale, klussParams);
  }, [sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, effectiveAdjustments, mapMode, bnScale, klussParams]);

  const handleMapModeChange = useCallback((mode: '2d' | '3d') => {
    setMapMode(mode);
    const shades = mode === '2d' ? [2] : [0, 1, 2];
    const newPalette = buildComputedPalette(buildPaletteFromSelection(blockSelection, shades));
    if (sourceImage) runProcess(sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, newPalette, effectiveAdjustments, bnScale, klussParams);
  }, [sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, blockSelection, effectiveAdjustments, bnScale, klussParams]);

  const handleAdjChange = useCallback((adj: ImageAdjustments) => {
    setAdjustments(adj);
  }, []);

  const handleAdjCommit = useCallback((adj: ImageAdjustments) => {
    setAdjustments(adj);
    if (sourceImage) runProcess(sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, adj, bnScale, klussParams);
  }, [sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, bnScale, klussParams]);

  const handleToggleSection = useCallback((key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleToggleAdjustments = useCallback(() => {
    setShowAdjustments(prev => {
      const next = !prev;
      if (sourceImage) {
        const adj = next ? adjustments : DEFAULT_ADJUSTMENTS;
        runProcess(sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, adj, bnScale, klussParams);
      }
      return next;
    });
  }, [adjustments, sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, bnScale, klussParams]);

  // Reprocess when background mode or color changes
  useEffect(() => {
    if (sourceImage) runProcess(sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgMode, bgColor]);

  const handleRemoveBlock = useCallback((csId: number) => {
    pushToHistory();
    const next: BlockSelection = { ...blockSelection, [csId]: [] };
    setBlockSelection(next);
    const shades = mapMode === '2d' ? [2] : [0, 1, 2];
    const newPalette = buildComputedPalette(buildPaletteFromSelection(next, shades));
    if (sourceImage) runProcess(sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, newPalette, effectiveAdjustments, bnScale, klussParams);
  }, [blockSelection, mapMode, sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, effectiveAdjustments, bnScale, klussParams]);

  const handleImageUpdate = useCallback((data: ImageData) => {
    pushToHistory();
    setImageData(data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Export shortcuts (stable — uses exportRef for fresh state) ───────────
  const handleExportPng = useCallback(() => {
    const { imageData: img, dithering: d, mapGrid: g } = exportRef.current;
    if (!img) return;
    downloadPng(img, `MapartForge_${g.wide}x${g.tall}_${d}.png`);
  }, []);

  const handleExportLitematic = useCallback(() => {
    const { imageData: img, activePalette: ap, blockSelection: sel, mapMode: mm, staircaseMode: sm } = exportRef.current;
    if (!img) return;
    const groups: Record<number, number[]> = {};
    for (const [k, v] of Object.entries(sel)) { groups[Number(k)] = v as number[]; }
    exportLitematic(img, ap, groups, 'MapartForge', mm === '3d' ? 'staircase' : 'flat', undefined, undefined, sm);
  }, []);

  // Keyboard shortcuts: 1-8 select dithering, C toggles compare mode
  // (declared here, after handleDitheringChange / handleCompareModeChange, to avoid TDZ)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.code.startsWith('Digit')) {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < ALL_MODES.length) { handleDitheringChange(ALL_MODES[idx]); return; }
      }
      if (!imageData) return;
      if (e.code === 'KeyC') handleCompareModeChange(!compareMode);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [imageData, compareMode, handleDitheringChange, handleCompareModeChange]);

  // Keyboard shortcuts for undo/redo + export
  // (declared here, after handleExportPng/handleExportLitematic, to avoid TDZ)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey) return;
      if (!e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); handleUndo(); return; }
      if (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ')) { e.preventDefault(); handleRedo(); return; }
      if (!e.shiftKey && e.code === 'KeyS') { e.preventDefault(); handleExportPng(); return; }
      if (e.shiftKey && e.code === 'KeyS') { e.preventDefault(); handleExportLitematic(); return; }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo, handleExportPng, handleExportLitematic]);

  // ── Reset all settings to defaults ───────────────────────────────────────
  const handleResetDefaults = useCallback(() => {
    clearSettings();
    setDithering('floyd-steinberg');
    setIntensity(100);
    setBnScale(2);
    setMapGrid({ wide: 1, tall: 1 });
    setBlockSelection(DEFAULT_SELECTION);
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setMapMode('2d');
    if (sourceImage) {
      const palette = buildComputedPalette(buildPaletteFromSelection(DEFAULT_SELECTION, [2]));
      runProcess(sourceImage, 'floyd-steinberg', { wide: 1, tall: 1 }, 100, compareMode, compareLeft, compareRight, palette, DEFAULT_ADJUSTMENTS, 2, DEFAULT_KLUSS_PARAMS);
    }
  }, [sourceImage, compareMode, compareLeft, compareRight]);

  // ── Load from ?palette= URL param (runs once on mount) ───────────────────
  // Must run before the ?share= check so the ref guard doesn't block it.
  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const shareId  = params.get('share');
    const paletteQ = params.get(PALETTE_PARAM);
    // ?share= takes priority — don't apply a palette-only link on top of a
    // full image share, because the image share will restore its own palette.
    if (shareId || !paletteQ) return;
    const sel = decodePalette(paletteQ);
    if (!sel) return;
    setBlockSelection(sel);
    setPaletteBanner(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load from ?share= URL param (runs once on mount) ──────────────────────
  // Using a ref to prevent double-execution in React StrictMode
  const linkLoadedRef = useRef(false);
  useEffect(() => {
    if (linkLoadedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const linkId = params.get('share');
    if (!linkId) return;
    linkLoadedRef.current = true;

    loadShare(linkId).then(result => {
      if (!result) return;
      const s = result.settings;
      // Restore settings
      if (s.dithering)       setDithering(s.dithering);
      if (s.intensity != null)  setIntensity(s.intensity);
      if (s.bnScale != null)    setBnScale(s.bnScale);
      if (s.mapGrid)         setMapGrid(s.mapGrid);
      if (s.blockSelection)  setBlockSelection(s.blockSelection);
      if (s.adjustments)     setAdjustments(s.adjustments);
      if (s.mapMode)         setMapMode(s.mapMode);

      // Load source image from storage
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setSourceImage(img);
        setViewBanner(true);
        setUndoStack([]);
        setRedoStack([]);
        const shades = (s.mapMode ?? '2d') === '2d' ? [2] : [0, 1, 2];
        const palette = buildComputedPalette(
          buildPaletteFromSelection(s.blockSelection ?? DEFAULT_SELECTION, shades),
        );
        runProcess(
          img,
          s.dithering       ?? 'floyd-steinberg',
          s.mapGrid         ?? { wide: 1, tall: 1 },
          s.intensity       ?? 100,
          false,
          'floyd-steinberg',
          'yliluoma2',
          palette,
          s.adjustments     ?? DEFAULT_ADJUSTMENTS,
          s.bnScale         ?? 2,
          DEFAULT_KLUSS_PARAMS,
        );
      };
      img.src = result.imageUrl;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Onboarding tour ───────────────────────────────────────────────────────
  const startTour = useCallback(() => { createTour(setMobileTab).drive(); }, []);
  useEffect(() => {
    if (shouldAutoStart()) {
      // Slight delay so the DOM is fully painted
      const t = setTimeout(() => createTour(setMobileTab).drive(), 600);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseScale    = gridScale(mapGrid);
  const zoomFactor   = zoom / 100;
  const displayScale = Math.max(1, Math.round(baseScale * zoomFactor));
  const pw = gridPixelWidth(mapGrid);
  const ph = gridPixelHeight(mapGrid);

  const hasContent = imageData !== null || compareData !== null;

  return (
    <>
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <img src="/logo.png" height="32" style={{ width: 'auto' }} alt="MapKluss" />
          <div className="header-titles">
            <h1 className="app-title">MAPKLUSS</h1>
            <span className="app-tagline">MINECRAFT MAP ART GENERATOR</span>
          </div>
          <div className="header-spacer" />
          <button className="tour-btn" onClick={startTour} title="Start guided tour">? GUIDE</button>
          <button className="wiki-btn" onClick={() => setShowWiki(true)} title="Read full documentation">📖 WIKI</button>
          <a href="https://boosty.to/klussforge" target="_blank" rel="noopener noreferrer" className="support-btn" title="Support development on Boosty">❤ SUPPORT</a>
          <a href="https://boosty.to/klussforge" target="_blank" rel="noopener noreferrer" className="header-ver" title="Support development">v1.0</a>
        </div>
      </header>

      {viewBanner && (
        <div className="view-banner">
          <span>█ LOADED FROM LINK</span>
          <button className="view-banner-dismiss" onClick={() => setViewBanner(false)} title="Dismiss">✕</button>
        </div>
      )}

      {paletteBanner && (
        <div className="view-banner palette-banner">
          <span>⬡ PALETTE LOADED FROM LINK</span>
          <button className="view-banner-dismiss" onClick={() => setPaletteBanner(false)} title="Dismiss">✕</button>
        </div>
      )}

      <div className="app-body" data-tab={mobileTab}>
        {/* ── LEFT PANEL ── */}
        <aside className="panel panel-left">
          <div className="panel-scroll">
            <ImageUpload onImageLoaded={handleImageLoaded} />
            {sourceHasAlpha && (
              <div className="alpha-controls">
                <span className="alpha-label">Transparency</span>
                <div className="alpha-mode-btns">
                  <button
                    className={`alpha-mode-btn${bgMode === 'color' ? ' active' : ''}`}
                    onClick={() => setBgMode('color')}
                    title="Fill transparent areas with a background color"
                  >Fill BG</button>
                  <button
                    className={`alpha-mode-btn${bgMode === 'transparent' ? ' active' : ''}`}
                    onClick={() => setBgMode('transparent')}
                    title="Keep transparent areas empty (air blocks in export)"
                  >Transparent</button>
                  {bgMode === 'color' && (
                    <input
                      type="color"
                      className="alpha-color-picker"
                      value={bgColor}
                      onChange={e => setBgColor(e.target.value)}
                      title="Background fill color"
                    />
                  )}
                </div>
              </div>
            )}
            {uploadedImageRef.current && (
              <div className="crop-section">
                <button
                  className="crop-tool-btn"
                  onClick={() => setShowCropModal(true)}
                  disabled={processing}
                  title={`Crop source image to ${pw}×${ph} map grid ratio`}
                >✂ Crop to ratio</button>
                <span className="crop-ratio-hint">{mapGrid.wide}:{mapGrid.tall}</span>
              </div>
            )}
            <Controls
              dithering={dithering}
              onDitheringChange={handleDitheringChange}
              intensity={intensity}
              onIntensityChange={handleIntensityChange}
              onIntensityCommit={handleIntensityCommit}
              bnScale={bnScale}
              onBnScaleChange={handleBnScaleChange}
              klussParams={klussParams}
              onKlussParamsChange={handleKlussParamsChange}
              mapGrid={mapGrid}
              onMapGridChange={handleMapGridChange}
              mapMode={mapMode}
              onMapModeChange={handleMapModeChange}
              staircaseMode={staircaseMode}
              onStaircaseModeChange={setStaircaseMode}
              processing={processing}
              collapsedSections={collapsedSections}
              onToggleSection={handleToggleSection}
            />
            <div className="panel-section">
            <Adjustments
              adjustments={adjustments}
              sourceImage={sourceImage}
              onChange={handleAdjChange}
              onCommit={handleAdjCommit}
              disabled={processing || !showAdjustments}
              showAdjustments={showAdjustments}
              onToggleAdjustments={handleToggleAdjustments}
              collapsed={!!collapsedSections['adjustments']}
              onToggle={() => handleToggleSection('adjustments')}
            />
            </div>
          </div>
          <div className="panel-footer">
            <button
              className={`reset-defaults-btn${resetDefaultsPending ? ' pending' : ''}`}
              disabled={processing}
              title={resetDefaultsPending ? 'Click again to confirm reset' : 'Reset all settings to defaults'}
              onClick={() => {
                if (!resetDefaultsPending) {
                  setResetDefaultsPending(true);
                  resetDefaultsTimerRef.current = setTimeout(() => setResetDefaultsPending(false), 2000);
                } else {
                  if (resetDefaultsTimerRef.current) clearTimeout(resetDefaultsTimerRef.current);
                  setResetDefaultsPending(false);
                  handleResetDefaults();
                }
              }}
            >
              <span className="reset-icon">↺</span> {resetDefaultsPending ? 'Sure?' : 'Reset defaults'}
            </button>
          </div>
        </aside>

        {/* ── CENTER PANEL ── */}
        <main className="panel panel-center" ref={previewSectionRef}>
          <div className="toolbar">

            {/* LEFT: undo/redo — always visible */}
            <div className="toolbar-group">
              <button className="tool-btn" onClick={handleUndo} disabled={!hasContent || undoStack.length === 0} title="Undo (Ctrl+Z)">↩</button>
              <button className="tool-btn" onClick={handleRedo} disabled={!hasContent || redoStack.length === 0} title="Redo (Ctrl+Y)">↪</button>
            </div>
            <div className="toolbar-sep" />

            {/* TOOLS: select / eyedropper / brush / fill — only when image loaded */}
            {!compareMode && imageData && (
              <div className="toolbar-paint-tools">
                <div className="toolbar-group">
                  <button
                    className={`tool-btn${activeTool === null ? ' active' : ''}`}
                    onClick={() => setActiveTool(null)}
                    title="Select / deselect tool (Esc)"
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 2l4 11.5 2.3-4.3L13 14l1.5-1.5-4.7-4.7L14.5 5 2 2z"/>
                    </svg>
                  </button>
                  <button
                    className={`tool-btn${activeTool === 'eyedropper' ? ' active' : ''}`}
                    onClick={() => setActiveTool(t => t === 'eyedropper' ? null : 'eyedropper')}
                    title="Eyedropper (E)"
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M13.5 1a2 2 0 00-2.83 0L9.5 2.17 8.83 1.5 7.5 2.83l.67.67-5.34 5.33A1 1 0 003 10v2h2a1 1 0 00.71-.29L11 6.5l.67.67 1.33-1.34-.67-.66L13.5 4a2 2 0 000-2.83l-.7-.7.7.53zM4 11H4v-1l5-5 1 1-5 5H4z"/>
                      <circle cx="2.5" cy="13.5" r="1.8"/>
                    </svg>
                  </button>
                  <button
                    className={`tool-btn${activeTool === 'brush' ? ' active' : ''}`}
                    onClick={() => setActiveTool(t => t === 'brush' ? null : 'brush')}
                    title="Brush (B)"
                    disabled={!paintBlock}
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M12.146 1.146a1.5 1.5 0 012.121 2.121l-8 8a1 1 0 01-.379.242l-3 1a1 1 0 01-1.27-1.27l1-3a1 1 0 01.242-.379l8-8z"/>
                      <path d="M3 13.5c0-1 .5-1.5 1-1.5s1 .5 1 1.5S4.5 15.5 4 16c-.5-.5-1-1.5-1-2.5z" opacity=".7"/>
                    </svg>
                  </button>
                  <button
                    className={`tool-btn${activeTool === 'fill' ? ' active' : ''}`}
                    onClick={() => setActiveTool(t => t === 'fill' ? null : 'fill')}
                    title="Fill (F)"
                    disabled={!paintBlock}
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 4h8v1l1 1v5a2 2 0 01-2 2H3a2 2 0 01-2-2V6l1-1V4z" opacity=".8"/>
                      <path d="M3 2h6l1 2H2L3 2z"/>
                      <circle cx="13" cy="11" r="2.2"/>
                      <path d="M13 6l.5 4.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>

                {activeTool === 'brush' && (
                  <div className="toolbar-group">
                    {([1, 2, 3] as const).map(s => (
                      <button key={s} className={`tool-btn${brushSize === s ? ' active' : ''}`} onClick={() => setBrushSize(s)} title={`Brush ${s}px`}>{s}px</button>
                    ))}
                  </div>
                )}

                {mapMode === '3d' && (activeTool === 'brush' || activeTool === 'fill') && paintBlock && (
                  <div className="toolbar-group shade-selector">
                    {([0, 1, 2] as const).map(sh => {
                      const shadeLabel = ['▼ Dark', '■ Mid', '▲ Bright'];
                      const sc = activePalette.colors.find(c => c.baseId === paintBlock.baseId && c.shade === sh);
                      const bg = sc ? `rgb(${sc.r},${sc.g},${sc.b})` : '#888';
                      return (
                        <button
                          key={sh}
                          className={`shade-btn${paintBlock.shade === sh ? ' active' : ''}`}
                          style={{ '--shade-color': bg } as React.CSSProperties}
                          title={shadeLabel[sh]}
                          onClick={() => setPaintBlock(pb => pb ? { ...pb, shade: sh } : pb)}
                        />
                      );
                    })}
                  </div>
                )}

                <div className="toolbar-group paint-swatch-wrapper">
                  <div className="paint-active-swatch">
                    {paintBlock ? (
                      <>
                        <span className="paint-swatch-icon" style={{ backgroundImage: `url(${SPRITE_URL})`, backgroundPosition: `-${paintBlock.blockId * 32}px -${paintBlock.csId * 32}px` }} />
                        <span className="paint-swatch-name">{paintBlock.displayName}</span>
                      </>
                    ) : (
                      <span className="paint-no-block">no block</span>
                    )}
                  </div>
                  <button className="tool-btn block-picker-arrow" onClick={() => setShowBlockPicker(p => !p)} title="Choose block">▾</button>
                  {showBlockPicker && (
                    <BlockPickerPopup
                      blockSelection={blockSelection}
                      current={paintBlock}
                      onSelect={b => { setPaintBlock(b); setShowBlockPicker(false); }}
                      onClose={() => setShowBlockPicker(false)}
                      mapMode={mapMode}
                    />
                  )}
                </div>
                <div className="toolbar-sep" />
              </div>
            )}

            {/* SPACER */}
            <div className="toolbar-spacer" />

            {/* ZOOM — only when content */}
            {hasContent && (
              <div className="toolbar-group">
                <input type="range" min={0} max={100} step={1} value={zoomToSlider(zoom)} className="zoom-slider" onChange={e => setZoom(sliderToZoom(Number(e.target.value)))} title="Zoom (Ctrl+scroll)" />
                <NumInput value={zoom} min={50} max={800} step={1} onCommit={setZoom} />
                <span className="toolbar-label-unit">%</span>
              </div>
            )}

            {/* VIEW TOGGLES — only when content */}
            {hasContent && (
              <>
                <div className="toolbar-sep" />
                <div className="toolbar-group">
                  <button
                    className="tool-btn tool-btn-zoom-reset"
                    title="Reset zoom to 100%"
                    onClick={() => setZoom(100)}
                  >⌖</button>
                  <button
                    className="tool-btn"
                    title="Reset split to center"
                    onClick={() => setSplitPos(50)}
                  >⟺</button>
                  {!compareMode && (
                    <button className={`tool-btn${textureMode === 'block' ? ' active' : ''}`} onClick={() => setTextureMode(m => m === 'block' ? 'pixel' : 'block')} title="Block textures">Blocks</button>
                  )}
                  <button className={`tool-btn${compareMode ? ' active' : ''}`} onClick={() => handleCompareModeChange(!compareMode)} title="Compare">Compare</button>
                  <button className={`tool-btn${showGrid ? ' active' : ''}`} onClick={() => setShowGrid(g => !g)} title="Grid">Grid</button>
                </div>
              </>
            )}

            {/* TABLET DRAWER TOGGLE */}
            <div className="toolbar-sep tablet-right-sep" />
            <button className={`tool-btn tablet-right-toggle${tabletRightOpen ? ' active' : ''}`} onClick={() => setTabletRightOpen(v => !v)} title="Palette & Export">📦</button>

            {/* SHORTCUTS */}
            <div className="toolbar-sep" />
            <div className="toolbar-group shortcuts-wrap">
              <button className={`tool-btn${showShortcuts ? ' active' : ''}`} onClick={() => setShowShortcuts(v => !v)} title="Keyboard shortcuts">⌨</button>
              {showShortcuts && (
                <div className="shortcuts-panel">
                  <div className="shortcuts-panel-title">SHORTCUTS</div>
                  <div className="shortcut-row"><kbd>Ctrl+Z</kbd><span>Undo</span></div>
                  <div className="shortcut-row"><kbd>Ctrl+Y</kbd><span>Redo</span></div>
                  <div className="shortcut-row"><kbd>Ctrl+S</kbd><span>Export PNG</span></div>
                  <div className="shortcut-row"><kbd>Ctrl+Shift+S</kbd><span>Export .litematic</span></div>
                  <div className="shortcuts-divider" />
                  <div className="shortcut-row"><kbd>Z</kbd><span>Toggle grid</span></div>
                  <div className="shortcut-row"><kbd>O</kbd><span>Reset split to 50%</span></div>
                  <div className="shortcut-row"><kbd>C</kbd><span>Toggle compare</span></div>
                  <div className="shortcut-row"><kbd>1 – 7</kbd><span>Select dithering</span></div>
                  <div className="shortcuts-divider" />
                  <div className="shortcut-row"><kbd>E</kbd><span>Eyedropper</span></div>
                  <div className="shortcut-row"><kbd>B</kbd><span>Brush</span></div>
                  <div className="shortcut-row"><kbd>F</kbd><span>Fill</span></div>
                  <div className="shortcut-row"><kbd>Esc</kbd><span>Deselect tool</span></div>
                </div>
              )}
            </div>
          </div>

          {compareMode && hasContent && (
            <div className="compare-selectors">
              <div className="compare-selector">
                <label className="compare-selector-label">LEFT</label>
                <select
                  className="compare-selector-select"
                  value={compareLeft}
                  onChange={e => handleCompareSideChange('left', e.target.value as DitheringMode)}
                  disabled={processing}
                >
                  {ALL_MODES.map(m => <option key={m} value={m}>{DITHERING_LABELS[m]}</option>)}
                </select>
              </div>
              <span className="compare-vs">VS</span>
              <div className="compare-selector">
                <label className="compare-selector-label">RIGHT</label>
                <select
                  className="compare-selector-select"
                  value={compareRight}
                  onChange={e => handleCompareSideChange('right', e.target.value as DitheringMode)}
                  disabled={processing}
                >
                  {ALL_MODES.map(m => <option key={m} value={m}>{DITHERING_LABELS[m]}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="canvas-area">
            <span className="corner corner-tl" />
            <span className="corner corner-tr" />
            <span className="corner corner-bl" />
            <span className="corner corner-br" />

            {compareMode ? (
              <CompareView
                leftData={compareData?.left   ?? null}
                rightData={compareData?.right ?? null}
                leftLabel={DITHERING_LABELS[compareLeft]}
                rightLabel={DITHERING_LABELS[compareRight]}
                width={pw} height={ph} scale={displayScale} showGrid={showGrid}
                splitPos={splitPos} onSplitPosChange={setSplitPos}
              />
            ) : (
              <div>
                <PreviewCanvas
                  mode={textureMode}
                  imageData={imageData} originalData={originalData}
                  showOriginal={false} showGrid={showGrid}
                  width={pw} height={ph} scale={displayScale}
                  cp={activePalette} blockSelection={blockSelection}
                  activeTool={activeTool}
                  paintBlock={paintBlock}
                  brushSize={brushSize}
                  onRemoveBlock={handleRemoveBlock}
                  onImageUpdate={handleImageUpdate}
                  onToolChange={setActiveTool}
                  onPaintBlockChange={setPaintBlock}
                  splitPos={imageData && originalData ? splitPos : undefined}
                  onSplitPosChange={setSplitPos}
                />
              </div>
            )}

            {processing && (
              <div className="processing-overlay">
                <div className="processing-overlay-inner">
                  <div className="processing-spinner" />
                  <span className="processing-label">PROCESSING… {DITHERING_LABELS[dithering].toUpperCase()}</span>
                  <span className="processing-pct">{processingProgress}%</span>
                  {showCancel && (
                    <button className="processing-cancel-btn" onClick={handleCancelProcessing}>✕ CANCEL</button>
                  )}
                </div>
                <div className="processing-bar-track">
                  <div className="processing-bar-fill" style={{ width: `${processingProgress}%` }} />
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ── RIGHT PANEL ── */}
        {tabletRightOpen && <div className="tablet-drawer-backdrop" onClick={() => setTabletRightOpen(false)} />}
        <aside className={`panel panel-right${tabletRightOpen ? ' drawer-open' : ''}`}>
          <div className="panel-scroll">
            <div className="mobile-palette-content">
              <PaletteEditor
                blockSelection={blockSelection}
                onSelectionChange={handleSelectionChange}
                paletteSize={activePalette.colors.length}
                disabled={processing}
              />
              <div className="panel-divider"></div>
              {mapMode === '3d' && (
                <div className="support-block-section">
                  <div className="support-block-section-title">Support block (3D)</div>
                  <div className="support-block-grid">
                    {SUPPORT_BLOCKS_PALETTE.map(b => (
                      <button
                        key={b.nbt}
                        className={`support-block-item${supportBlock === b.nbt ? ' active' : ''}`}
                        onClick={() => setSupportBlock(b.nbt)}
                        title={b.label}
                      >
                        <span
                          className="support-block-sprite"
                          style={{
                            backgroundImage: `url(${SPRITE_URL})`,
                            backgroundPosition: `-${b.blockId * 32}px -${b.csId * 32}px`,
                          }}
                        />
                        <span className="support-block-item-label">{b.label}</span>
                      </button>
                    ))}
                    {/* None + Depth — spans 4 cells together */}
                    <div className="support-none-depth">
                      <button
                        className={`support-block-item support-none-btn${supportBlock === 'air' ? ' active' : ''}`}
                        onClick={() => setSupportBlock('air')}
                        title="No support blocks"
                      >
                        <span className="support-block-no-icon">∅</span>
                        <span className="support-block-item-label">None</span>
                      </button>
                      <div className={`support-depth-group${supportBlock === 'air' ? ' disabled' : ''}`}>
                        <span className="support-mode-label">Depth</span>
                        {([1, 2] as const).map(m => (
                          <button
                            key={m}
                            className={`support-mode-btn${supportMode === m ? ' active' : ''}`}
                            onClick={() => setSupportMode(m)}
                            title={SUPPORT_MODE_TITLES[m]}
                            disabled={supportBlock === 'air'}
                          >{m}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="mobile-export-content">
              <MaterialsList
                imageData={compareMode ? (compareData?.left ?? null) : imageData}
                cp={activePalette}
                blockSelection={blockSelection}
                mapGrid={mapGrid}
              />
            </div>
          </div>
          <div className="panel-footer mobile-export-content">
            <ExportPanel
              imageData={imageData}
              compareData={compareData}
              compareMode={compareMode}
              dithering={dithering}
              compareLeft={compareLeft}
              compareRight={compareRight}
              mapGrid={mapGrid}
              mapMode={mapMode}
              staircaseMode={staircaseMode}
              activePalette={activePalette}
              blockSelection={blockSelection}
              disabled={processing}
              supportBlock={supportBlock}
              supportMode={supportMode}
              sourceImage={sourceImage}
              intensity={intensity}
              adjustments={adjustments}
              bnScale={bnScale}
            />
          </div>
        </aside>

        {/* ── MOBILE TAB BAR ── */}
        <div className="mobile-tab-bar">
          <button className={`mobile-tab-btn${mobileTab === 'settings' ? ' active' : ''}`} onClick={() => setMobileTab('settings')}>
            <span className="mobile-tab-icon">⚙</span>
            <span className="mobile-tab-label">Settings</span>
          </button>
          <button className={`mobile-tab-btn${mobileTab === 'palette' ? ' active' : ''}`} onClick={() => setMobileTab('palette')}>
            <span className="mobile-tab-icon">▦</span>
            <span className="mobile-tab-label">Palette</span>
          </button>
          <button className={`mobile-tab-btn${mobileTab === 'export' ? ' active' : ''}`} onClick={() => setMobileTab('export')}>
            <span className="mobile-tab-icon">⬇</span>
            <span className="mobile-tab-label">Export</span>
          </button>
        </div>
      </div>

      {/* ── STATUS BAR ── */}
      <div className="status-bar">
        <span>█ {DITHERING_LABELS[dithering].toUpperCase()}</span>
        <span>█ {mapGrid.wide}×{mapGrid.tall} MAPS</span>
        <span>█ {activePalette.colors.length} COLORS</span>
        <span>█ {mapMode.toUpperCase()}</span>
        <span>█ {zoom}%</span>
        {hasContent && <span>█ {pw}×{ph}px</span>}
        <span className="status-spacer" />
        <span className="status-credit">Made by SmetankaKluss</span>
        <a className="status-tg" href="https://t.me/SmetankaKluss" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="#57FF6E" aria-hidden="true">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-1.97 9.269c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 14.173l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.496.413z"/>
          </svg>
          @SmetankaKluss
        </a>
      </div>
    </div>

    {/* ── Crop modal ── */}
    {showCropModal && uploadedImageRef.current && (
      <CropModal
        sourceImage={uploadedImageRef.current}
        targetW={pw} targetH={ph}
        onApply={handleCropApply}
        onCancel={() => setShowCropModal(false)}
      />
    )}

    {/* ── Wiki modal ── */}
    {showWiki && <WikiModal onClose={() => setShowWiki(false)} />}
    </>
  );
}
