import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { type SelectionMask, selectAllMask, invertMask, countSelected } from './lib/selectionMask';
import { VERSION } from './version';
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
import { exportLitematicHybrid } from './lib/exportLitematic';
import { NumInput } from './components/NumInput';
import { CropModal } from './components/CropModal';
import { lazy, Suspense } from 'react';
const WikiModal = lazy(() => import('./components/WikiModal').then(m => ({ default: m.WikiModal })));
import { NewCanvasModal } from './components/NewCanvasModal';
import { LayersPanel } from './components/LayersPanel';
import type { Layer, LayerGroup } from './lib/layers';
import { createLayer, compositeLayersToImageData, mergeLayersDown, mergeVisible, scaleImageData } from './lib/layers';
import { serializeProject, deserializeProject, downloadProject } from './lib/projectFile';
import { createTour, shouldAutoStart } from './lib/tour';
import { useLocale } from './lib/locale';
import type { PatternDefinition } from './lib/patternTool';
import { createDefaultPattern } from './lib/patternTool';
import type { GradientStop } from './lib/gradientTool';
import { PatternEditorPopup } from './components/PatternEditorPopup';
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

const getSupportModeTitles = (t: (ru: string, en: string) => string): Record<1 | 2 | 3, string> => ({
  1: t('1 блок только под плавающими блоками (песок, гравий, лишайник…)', '1 block under floating blocks (sand, gravel, moss…)'),
  2: t('Зависит от оттенка: переходные оттенки получают 2, плоские — 1', 'Depends on shade: gradients get 2, flat get 1'),
  3: t('2 блока под каждым блоком арта', '2 blocks under each art block'),
});

const SUPPORT_MODE_LABELS: Record<1 | 2, string> = {
  1: 'Crit.',
  2: 'Opt.',
};

const MAX_HISTORY = 20;

interface HistoryEntry {
  imageData: ImageData | null;
  blockSelection: BlockSelection;
}

interface LayerState {
  layers: Layer[];
  activeLayerId: string;
  groups: LayerGroup[];
}

function makeInitialLayerState(): LayerState {
  const l = createLayer('Слой 1');
  return { layers: [l], activeLayerId: l.id, groups: [] };
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

/** Returns true if the layer ref's imageData has at least one non-transparent pixel. */
function activeLayerHasContent(ref: React.MutableRefObject<{ imageData: ImageData | null } | undefined>): boolean {
  const img = ref.current?.imageData;
  if (!img) return false;
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] > 0) return true;
  }
  return false;
}

export default function App() {
  const { lang, toggle: toggleLang, t } = useLocale();

  // ── Restore persisted settings — lazy init runs exactly once on mount ─
  const [saved] = useState<Partial<SavedSettings>>(() => loadSettings());

  const [sourceImage, setSourceImage]   = useState<HTMLImageElement | null>(null);
  const [originalData, setOriginalData] = useState<ImageData | null>(null);

  // ── Layer system ─────────────────────────────────────────────────────────────
  const [layerState, setLayerState] = useState<LayerState>(makeInitialLayerState);
  const layers = layerState.layers;
  const activeLayerId = layerState.activeLayerId;
  const activeLayer = layers.find(l => l.id === activeLayerId) ?? layers[0];
  const layerGroups = layerState.groups;
  // imageData = active layer's imageData (for painting tools + display in Phase 1)
  const imageData: ImageData | null = activeLayer?.imageData ?? null;
  // setImageData wrapper — updates active layer without touching other layers
  // dirty=true marks the layer as manually edited (blocks re-processing from source on settings change)
  function setImageData(data: ImageData | null, dirty = false) {
    setLayerState(prev => ({
      ...prev,
      layers: prev.layers.map(l =>
        l.id === prev.activeLayerId ? { ...l, imageData: data, isDirty: dirty } : l,
      ),
    }));
  }

  // ── Artist mode toggle ────────────────────────────────────────────────────────
  const [editorMode, setEditorMode] = useState<'simple' | 'artist'>(
    () => (localStorage.getItem('mapartforge-editor-mode') as 'simple' | 'artist' | null) ?? 'simple',
  );
  const [splitPos, setSplitPos] = useState(50);
  const [showSplitLine, setShowSplitLine] = useState(true);
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
  const [selectionMask, setSelectionMask] = useState<SelectionMask | null>(null);
  const [patternBlocks, setPatternBlocks] = useState<PaintBlock[]>([]);
  const [showPatternPicker, setShowPatternPicker] = useState<number | null>(null); // index of open picker
  const [brushSize, setBrushSize]       = useState<number>(1);

  // Pattern-tile tool state
  const [savedPatterns, setSavedPatterns] = useState<PatternDefinition[]>(() => [createDefaultPattern()]);
  const [activePatternId, setActivePatternId] = useState<string>(() => savedPatterns[0]?.id ?? '');
  const [showPatternEditor, setShowPatternEditor] = useState(false);
  const activePattern = savedPatterns.find(p => p.id === activePatternId) ?? savedPatterns[0] ?? null;
  void setActivePatternId; // reserved for future multi-pattern selection UI

  // Gradient tool state
  const [gradientStops, setGradientStops] = useState<GradientStop[]>([]);
  const [gradientDithering, setGradientDithering] = useState<'none' | 'ordered'>('ordered');
  const [showGradientStopPicker, setShowGradientStopPicker] = useState<number | null>(null);
  const [showGradientAddPicker, setShowGradientAddPicker] = useState(false);
  const [textSize]                       = useState<number>(8);
  const [showBlockPicker, setShowBlockPicker]   = useState(false);
  const [viewBanner,    setViewBanner]    = useState(false);
  const [paletteBanner, setPaletteBanner] = useState(false);
  const [supportBlock,  setSupportBlock]  = useState('stone');
  const [supportMode,   setSupportMode]   = useState<1 | 2 | 3>(2);
  const [resetDefaultsPending, setResetDefaultsPending] = useState(false);
  const resetDefaultsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [showNewCanvasModal, setShowNewCanvasModal] = useState(false);
  const [sourceHasAlpha, setSourceHasAlpha] = useState(false);
  const [bgMode, setBgMode] = useState<'color' | 'transparent'>('color');
  const [bgColor, setBgColor] = useState('#ffffff');
  const bgModeRef  = useRef<'color' | 'transparent'>('color');
  const bgColorRef = useRef('#ffffff');
  bgModeRef.current  = bgMode;
  bgColorRef.current = bgColor;
  // Always holds the originally-uploaded image so crop modal can re-crop from source
  const uploadedImageRef = useRef<HTMLImageElement | null>(null);
  // Raw file for color-accurate bitmap creation (bypasses ICC profile correction)
  const uploadedFileRef  = useRef<File | null>(null);
  const workerRef     = useRef<Worker | null>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When re-processing a manually-edited layer, store the alpha mask here so it can
  // be re-applied after the worker returns (preserves deletions/transparency edits).
  const pendingAlphaMaskRef = useRef<Uint8Array | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const previewSectionRef = useRef<HTMLElement>(null);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [mobileTab, setMobileTab] = useState<'settings' | 'palette' | 'export'>('settings');
  const [tabletRightOpen, setTabletRightOpen] = useState(false);

  // Always-current ref — updated each render so callbacks never see stale state
  const latestRef = useRef<{ imageData: ImageData | null; blockSelection: BlockSelection; layers: Layer[] }>({
    imageData: null, blockSelection: DEFAULT_SELECTION, layers: layerState.layers,
  });
  latestRef.current = { imageData, blockSelection, layers };

  // Ref to active layer — used in callbacks to check if layer has real content
  const activeLayerRef = useRef<typeof activeLayer>(activeLayer);
  activeLayerRef.current = activeLayer;

  // Ref with all current state needed for export shortcuts (avoids stale closures)
  const exportRef = useRef({ imageData, dithering, mapGrid, activePalette: null as unknown as ReturnType<typeof buildComputedPalette>, blockSelection, mapMode, staircaseMode, layers: layerState.layers });


  // ── Auto-save settings to localStorage ──────────────────────────────────
  useEffect(() => { saveSettings({ dithering }); }, [dithering]);
  useEffect(() => { saveSettings({ intensity }); }, [intensity]);
  useEffect(() => { saveSettings({ mapGrid }); }, [mapGrid]);
  useEffect(() => { saveSettings({ blockSelection }); }, [blockSelection]);
  useEffect(() => { saveSettings({ adjustments }); }, [adjustments]);
  useEffect(() => { saveSettings({ mapMode }); }, [mapMode]);
  useEffect(() => { saveSettings({ staircaseMode }); }, [staircaseMode]);
  useEffect(() => { saveSettings({ bnScale }); }, [bnScale]);
  useEffect(() => { localStorage.setItem('mapartforge-editor-mode', editorMode); }, [editorMode]);

  // Per-layer settings: restore mapMode/staircaseMode/dithering when active layer changes
  const layersRef = useRef(layers);
  layersRef.current = layers;
  useEffect(() => {
    const layer = layersRef.current.find(l => l.id === activeLayerId);
    if (!layer) return;
    setMapMode(layer.mapMode ?? '2d');
    setStaircaseMode(layer.staircaseMode ?? 'classic');
    if (layer.dithering !== undefined) setDithering(layer.dithering);
    setSelectionMask(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayerId]);

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

  // Stable ref so keyboard handler can call handleDeleteSelection without forward-ref TDZ
  const handleDeleteSelectionRef = useRef<(() => void) | null>(null);

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
        case 'KeyX': setActiveTool(t => t === 'eraser' ? null : 'eraser'); break;
        case 'KeyR': if (editorMode === 'artist') setActiveTool(t => t === 'select-rect' ? null : 'select-rect'); break;
        case 'KeyL': if (editorMode === 'artist') setActiveTool(t => t === 'select-lasso' ? null : 'select-lasso'); break;
        case 'KeyW': if (editorMode === 'artist') setActiveTool(t => t === 'select-magic' ? null : 'select-magic'); break;
        case 'KeyP': if (editorMode === 'artist') setActiveTool(t => t === 'pattern-tile' ? null : 'pattern-tile'); break;
        case 'KeyG': if (editorMode === 'artist') setActiveTool(t => t === 'gradient' ? null : 'gradient'); break;
        case 'Delete':
        case 'Backspace': if (editorMode === 'artist' && selectionMask) { handleDeleteSelectionRef.current?.(); } break;
        case 'Escape':
          if (selectionMask && editorMode === 'artist') { setSelectionMask(null); return; }
          setActiveTool(null);
          break;
        case 'KeyZ': setShowGrid(g => !g); break;
        case 'KeyO': if (!compareMode) setSplitPos(50); break;
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [imageData, compareMode, editorMode, selectionMask]);


  const modeShades = (mapMode === '2d') ? [1] : [0, 1, 2];

  // When adjustments are disabled, use zero adjustments for processing
  const effectiveAdjustments = showAdjustments ? adjustments : DEFAULT_ADJUSTMENTS;

  const activePalette = useMemo<ComputedPalette>(
    () => buildComputedPalette(buildPaletteFromSelection(blockSelection, modeShades)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blockSelection, mapMode],
  );


  const selectedPixelCount = useMemo(() => selectionMask ? countSelected(selectionMask) : 0, [selectionMask]);

  // exportRef is updated below, after compositeImageData is computed

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
        const processed = mk(msg.processedData);
        const alphaMask = pendingAlphaMaskRef.current;
        pendingAlphaMaskRef.current = null;
        if (alphaMask) {
          // Re-apply the alpha channel from before re-processing (preserves deleted background)
          for (let i = 0; i < alphaMask.length; i++) {
            processed.data[i * 4 + 3] = alphaMask[i];
          }
          setImageData(processed, true);  // keep dirty — manual edits still present
        } else {
          setImageData(processed);  // fresh process, not dirty
        }
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

    // Create transferable bitmap, then dispatch to worker.
    // Use raw File if available to bypass ICC profile color correction.
    const bitmapSource: ImageBitmapSource = uploadedFileRef.current ?? img;
    createImageBitmap(bitmapSource, { colorSpaceConversion: 'none' }).then(bitmap => {
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

  const handleImageLoaded = useCallback((img: HTMLImageElement, file?: File) => {
    uploadedImageRef.current = img;   // save original for crop modal
    uploadedFileRef.current  = file ?? null;
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
    setOriginalData(null);
    setCompareData(null);
    setSourceImage(img);
    setSplitPos(50);
    setUndoStack([]);
    setRedoStack([]);
    runProcess(img, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams);
  }, [dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams]);

  const handleCropApply = useCallback((croppedImg: HTMLImageElement) => {
    setShowCropModal(false);
    uploadedFileRef.current = null;   // use cropped image, not original file
    uploadedImageRef.current = croppedImg;
    setOriginalData(null);
    setCompareData(null);
    setSourceImage(croppedImg);
    setSplitPos(50);
    setUndoStack([]);
    setRedoStack([]);
    runProcess(croppedImg, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams);
  }, [dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams]);

  const handleCreateBlankCanvas = useCallback((
    bg: { r: number; g: number; b: number; a: number } | null,
    grid: MapGrid,
  ) => {
    setShowNewCanvasModal(false);
    const width  = gridPixelWidth(grid);
    const height = gridPixelHeight(grid);
    const data   = new ImageData(width, height);
    if (bg) {
      for (let i = 0; i < data.data.length; i += 4) {
        data.data[i]     = bg.r;
        data.data[i + 1] = bg.g;
        data.data[i + 2] = bg.b;
        data.data[i + 3] = bg.a;
      }
    }
    setMapGrid(grid);
    setSourceImage(null);
    uploadedImageRef.current = null;
    uploadedFileRef.current  = null;
    setOriginalData(null);
    setCompareData(null);
    setUndoStack([]);
    setRedoStack([]);
    // Reset to single fresh layer with blank canvas data
    const newLayer = createLayer('Слой 1');
    newLayer.imageData = data;
    setLayerState({ layers: [newLayer], activeLayerId: newLayer.id, groups: [] });
  }, []);

  const handleDitheringChange = useCallback((mode: DitheringMode) => {
    setDithering(mode);
    setLayerState(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === prev.activeLayerId ? { ...l, dithering: mode } : l),
    }));
    if (sourceImage && activeLayerHasContent(activeLayerRef)) {
      if (activeLayerRef.current?.isDirty) {
        // Layer was manually edited — re-process but re-apply the current alpha mask afterwards
        const img = activeLayerRef.current.imageData;
        if (img) {
          const mask = new Uint8Array(img.width * img.height);
          for (let i = 0; i < mask.length; i++) mask[i] = img.data[i * 4 + 3];
          pendingAlphaMaskRef.current = mask;
        }
      }
      runProcess(sourceImage, mode, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams);
    }
  }, [sourceImage, mapGrid, intensity, compareMode, compareLeft, compareRight, activePalette, effectiveAdjustments, bnScale, klussParams]);

  const handleMapGridChange = useCallback((grid: MapGrid) => {
    setMapGrid(grid);
    const newW = gridPixelWidth(grid);
    const newH = gridPixelHeight(grid);
    // Scale all layers to new dimensions before re-processing
    setLayerState(prev => ({
      ...prev,
      layers: prev.layers.map(l => {
        if (!l.imageData) return l; // empty layers stay empty
        return { ...l, imageData: scaleImageData(l.imageData, newW, newH) };
      }),
    }));
    // Only re-process from sourceImage for non-dirty layers that have content
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
    const shades = mapMode === '2d' ? [1] : [0, 1, 2];
    const newPalette = buildComputedPalette(buildPaletteFromSelection(sel, shades));
    if (sourceImage) runProcess(sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, newPalette, effectiveAdjustments, bnScale, klussParams);
  }, [sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, effectiveAdjustments, mapMode, bnScale, klussParams]);

  const handleMapModeChange = useCallback((mode: '2d' | '3d') => {
    setMapMode(mode);
    setLayerState(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === prev.activeLayerId ? { ...l, mapMode: mode } : l),
    }));
    const shades = mode === '2d' ? [1] : [0, 1, 2];
    const newPalette = buildComputedPalette(buildPaletteFromSelection(blockSelection, shades));
    if (sourceImage && activeLayerHasContent(activeLayerRef)) {
      if (activeLayerRef.current?.isDirty) {
        const img = activeLayerRef.current.imageData;
        if (img) {
          const mask = new Uint8Array(img.width * img.height);
          for (let i = 0; i < mask.length; i++) mask[i] = img.data[i * 4 + 3];
          pendingAlphaMaskRef.current = mask;
        }
      }
      runProcess(sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, newPalette, effectiveAdjustments, bnScale, klussParams);
    }
  }, [sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, blockSelection, effectiveAdjustments, bnScale, klussParams]);

  const handleStaircaseModeChange = useCallback((mode: 'classic' | 'optimized') => {
    setStaircaseMode(mode);
    setLayerState(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === prev.activeLayerId ? { ...l, staircaseMode: mode } : l),
    }));
  }, []);

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
    const shades = mapMode === '2d' ? [1] : [0, 1, 2];
    const newPalette = buildComputedPalette(buildPaletteFromSelection(next, shades));
    if (sourceImage) runProcess(sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, newPalette, effectiveAdjustments, bnScale, klussParams);
  }, [blockSelection, mapMode, sourceImage, dithering, mapGrid, intensity, compareMode, compareLeft, compareRight, effectiveAdjustments, bnScale, klussParams]);

  const handleImageUpdate = useCallback((data: ImageData) => {
    pushToHistory();
    setImageData(data, true);  // manual paint → mark dirty
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Selection operations ─────────────────────────────────────────────────────

  const handleDeleteSelection = useCallback(() => {
    if (!imageData || !selectionMask) return;
    pushToHistory();
    const buf = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
    for (let i = 0; i < selectionMask.length; i++) {
      if (!selectionMask[i]) continue;
      buf.data[i * 4] = 0; buf.data[i * 4 + 1] = 0; buf.data[i * 4 + 2] = 0; buf.data[i * 4 + 3] = 0;
    }
    setImageData(buf, true);  // manual edit → dirty
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageData, selectionMask]);
  handleDeleteSelectionRef.current = handleDeleteSelection;

  const handleFillSelection = useCallback(() => {
    if (!imageData || !selectionMask || !paintBlock || paintBlock.baseId === -1) return;
    const color = activePalette.colors.find(c => c.baseId === paintBlock.baseId && c.shade === paintBlock.shade)
      ?? activePalette.colors.find(c => c.baseId === paintBlock.baseId);
    if (!color) return;
    pushToHistory();
    const buf = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
    for (let i = 0; i < selectionMask.length; i++) {
      if (!selectionMask[i]) continue;
      buf.data[i * 4] = color.r; buf.data[i * 4 + 1] = color.g; buf.data[i * 4 + 2] = color.b; buf.data[i * 4 + 3] = 255;
    }
    setImageData(buf, true);  // manual edit → dirty
  }, [imageData, selectionMask, paintBlock, activePalette]);

  const handleInvertSelection = useCallback(() => {
    if (!imageData) return;
    setSelectionMask(prev => prev ? invertMask(prev, imageData.width, imageData.height) : selectAllMask(imageData.width, imageData.height));
  }, [imageData]);

  const handleMoveSelectionToLayer = useCallback(() => {
    if (!imageData || !selectionMask) return;
    pushToHistory();
    const w = imageData.width, h = imageData.height;
    const newLayerData = new ImageData(w, h);
    const erasedData = new ImageData(new Uint8ClampedArray(imageData.data), w, h);
    for (let i = 0; i < selectionMask.length; i++) {
      if (!selectionMask[i]) continue;
      newLayerData.data[i * 4]     = imageData.data[i * 4];
      newLayerData.data[i * 4 + 1] = imageData.data[i * 4 + 1];
      newLayerData.data[i * 4 + 2] = imageData.data[i * 4 + 2];
      newLayerData.data[i * 4 + 3] = imageData.data[i * 4 + 3];
      erasedData.data[i * 4]     = 0;
      erasedData.data[i * 4 + 1] = 0;
      erasedData.data[i * 4 + 2] = 0;
      erasedData.data[i * 4 + 3] = 0;
    }
    const newLayer = createLayer('Выделение', newLayerData);
    newLayer.isDirty = true;  // manually created — must not be overwritten by runProcess
    setLayerState(prev => {
      const idx = prev.layers.findIndex(l => l.id === prev.activeLayerId);
      const updated = prev.layers.map(l => l.id === prev.activeLayerId ? { ...l, imageData: erasedData, isDirty: true } : l);
      const insertAt = idx >= 0 ? idx + 1 : updated.length;
      const newLayers = [...updated.slice(0, insertAt), newLayer, ...updated.slice(insertAt)];
      return { ...prev, layers: newLayers, activeLayerId: newLayer.id };
    });
    setSelectionMask(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageData, selectionMask]);

  // ── Layer management ─────────────────────────────────────────────────────────

  const handleAddLayer = useCallback(() => {
    setLayerState(prev => {
      const w = gridPixelWidth(mapGrid);
      const h = gridPixelHeight(mapGrid);
      const l = createLayer(`Слой ${prev.layers.length + 1}`, new ImageData(w, h));
      return { ...prev, layers: [...prev.layers, l], activeLayerId: l.id };
    });
  }, [mapGrid]);

  const handleDeleteLayer = useCallback((id: string) => {
    setLayerState(prev => {
      if (prev.layers.length <= 1) return prev; // always keep at least 1
      const newLayers = prev.layers.filter(l => l.id !== id);
      const newActive = prev.activeLayerId === id
        ? (newLayers[newLayers.length - 1]?.id ?? '')
        : prev.activeLayerId;
      return { ...prev, layers: newLayers, activeLayerId: newActive };
    });
  }, []);

  const handleRenameLayer = useCallback((id: string, name: string) => {
    setLayerState(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === id ? { ...l, name } : l),
    }));
  }, []);

  const handleToggleLayerVisible = useCallback((id: string) => {
    setLayerState(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l),
    }));
  }, []);

  const handleMoveLayerUp = useCallback((id: string) => {
    setLayerState(prev => {
      const idx = prev.layers.findIndex(l => l.id === id);
      if (idx >= prev.layers.length - 1) return prev;
      const next = [...prev.layers];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return { ...prev, layers: next };
    });
  }, []);

  const handleMoveLayerDown = useCallback((id: string) => {
    setLayerState(prev => {
      const idx = prev.layers.findIndex(l => l.id === id);
      if (idx <= 0) return prev;
      const next = [...prev.layers];
      [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
      return { ...prev, layers: next };
    });
  }, []);

  const handleOpacityChange = useCallback((id: string, opacity: number) => {
    setLayerState(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === id ? { ...l, opacity } : l),
    }));
  }, []);

  const handleToggleLock = useCallback((id: string) => {
    setLayerState(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l),
    }));
  }, []);

  const handleMoveLayer = useCallback((fromIdx: number, toIdx: number) => {
    setLayerState(prev => {
      const display = [...prev.layers].reverse();
      if (fromIdx < 0 || fromIdx >= display.length || toIdx < 0 || toIdx >= display.length) return prev;
      const moved = display.splice(fromIdx, 1)[0];
      display.splice(toIdx, 0, moved);
      return { ...prev, layers: display.reverse() };
    });
  }, []);

  const handleMergeDown = useCallback(() => {
    setLayerState(prev => {
      const w = gridPixelWidth(mapGrid);
      const h = gridPixelHeight(mapGrid);
      const newLayers = mergeLayersDown(prev.layers, prev.activeLayerId, w, h);
      const mergedIdx = prev.layers.findIndex(l => l.id === prev.activeLayerId);
      const newActive = newLayers[Math.max(0, mergedIdx - 1)]?.id ?? newLayers[0]?.id ?? prev.activeLayerId;
      return { ...prev, layers: newLayers, activeLayerId: newActive };
    });
  }, [mapGrid]);

  const handleMergeVisible = useCallback(() => {
    setLayerState(prev => {
      const w = gridPixelWidth(mapGrid);
      const h = gridPixelHeight(mapGrid);
      const newLayers = mergeVisible(prev.layers, w, h);
      const firstVisible = newLayers.find(l => l.visible && l.imageData);
      return { ...prev, layers: newLayers, activeLayerId: firstVisible?.id ?? prev.activeLayerId };
    });
  }, [mapGrid]);

  const handleCreateGroup = useCallback((layerIds: string[]) => {
    const groupId = `group-${Date.now()}`;
    const newGroup: LayerGroup = { id: groupId, name: 'Группа', visible: true, collapsed: false };
    setLayerState(prev => ({
      ...prev,
      groups: [...prev.groups, newGroup],
      layers: prev.layers.map(l => layerIds.includes(l.id) ? { ...l, groupId } : l),
    }));
  }, []);

  const handleToggleGroupCollapse = useCallback((groupId: string) => {
    setLayerState(prev => ({
      ...prev,
      groups: prev.groups.map(g => g.id === groupId ? { ...g, collapsed: !g.collapsed } : g),
    }));
  }, []);

  const handleDeleteGroup = useCallback((groupId: string) => {
    setLayerState(prev => ({
      ...prev,
      groups: prev.groups.filter(g => g.id !== groupId),
      layers: prev.layers.map(l => l.groupId === groupId ? { ...l, groupId: null } : l),
    }));
  }, []);

  const handleTextCommit = useCallback((textImageData: ImageData, layerName: string) => {
    setLayerState(prev => {
      const newLayer = createLayer(layerName, textImageData, true);
      const idx = prev.layers.findIndex(l => l.id === prev.activeLayerId);
      const insertAt = idx >= 0 ? idx + 1 : prev.layers.length;
      const newLayers = [...prev.layers.slice(0, insertAt), newLayer, ...prev.layers.slice(insertAt)];
      return { ...prev, layers: newLayers, activeLayerId: newLayer.id };
    });
  }, []);

  // ── Export shortcuts (stable — uses exportRef for fresh state) ───────────
  const handleExportPng = useCallback(() => {
    const { imageData: img, dithering: d, mapGrid: g } = exportRef.current;
    if (!img) return;
    downloadPng(img, `MapartForge_${g.wide}x${g.tall}_${d}.png`);
  }, []);

  const handleExportLitematic = useCallback(() => {
    const { activePalette: ap, blockSelection: sel, layers: exportLayers } = exportRef.current;
    const visLayers = exportLayers.filter(l => l.visible && l.imageData);
    if (visLayers.length === 0) return;
    const groups: Record<number, number[]> = {};
    for (const [k, v] of Object.entries(sel)) { groups[Number(k)] = v as number[]; }
    exportLitematicHybrid(visLayers.map(l => ({
      imageData: l.imageData!,
      mapMode: l.mapMode ?? '2d',
      staircaseMode: l.staircaseMode ?? 'classic',
    })), ap, groups, 'MapartForge');
  }, []);

  // ── Project save / load ──────────────────────────────────────────────────────

  const handleSaveProject = useCallback(() => {
    const json = serializeProject(layers, activeLayerId, mapGrid);
    const name = `MapKluss_${mapGrid.wide}x${mapGrid.tall}_${new Date().toISOString().slice(0,10)}.mapkluss`;
    downloadProject(json, name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, activeLayerId, mapGrid]);

  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const handleLoadProject = useCallback(() => {
    // Create hidden file input on demand
    if (!projectFileInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.mapkluss,application/json';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        file.text().then(json => {
          const result = deserializeProject(json);
          if (!result) { alert('Не удалось загрузить проект — файл повреждён или несовместим.'); return; }
          setMapGrid(result.grid);
          setLayerState({ layers: result.layers, activeLayerId: result.activeLayerId, groups: [] });
          setSourceImage(null);
          setOriginalData(null);
          setCompareData(null);
          setUndoStack([]);
          setRedoStack([]);
        });
      };
      projectFileInputRef.current = input;
    }
    projectFileInputRef.current.value = '';
    projectFileInputRef.current.click();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (!e.ctrlKey && !e.metaKey) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA' && editorMode === 'artist' && imageData) {
        e.preventDefault();
        setSelectionMask(selectAllMask(imageData.width, imageData.height));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD' && editorMode === 'artist') {
        e.preventDefault();
        setSelectionMask(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyI' && editorMode === 'artist' && imageData) {
        e.preventDefault();
        handleInvertSelection();
        return;
      }
      if (!e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); handleUndo(); return; }
      if (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ')) { e.preventDefault(); handleRedo(); return; }
      if (!e.shiftKey && e.code === 'KeyS') { e.preventDefault(); handleExportPng(); return; }
      if (e.shiftKey && e.code === 'KeyS') { e.preventDefault(); handleExportLitematic(); return; }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo, handleExportPng, handleExportLitematic, editorMode, imageData, handleInvertSelection]);

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
      const palette = buildComputedPalette(buildPaletteFromSelection(DEFAULT_SELECTION, [1]));
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
        const shades = (s.mapMode ?? '2d') === '2d' ? [1] : [0, 1, 2];
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
  const startTour = useCallback(() => { createTour(setMobileTab, lang).drive(); }, [lang]);
  useEffect(() => {
    if (shouldAutoStart()) {
      // Slight delay so the DOM is fully painted
      const timer = setTimeout(() => createTour(setMobileTab, lang).drive(), 600);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseScale    = gridScale(mapGrid);
  const zoomFactor   = zoom / 100;
  const displayScale = Math.max(1, Math.round(baseScale * zoomFactor));
  const pw = gridPixelWidth(mapGrid);
  const ph = gridPixelHeight(mapGrid);

  // Composite of all visible layers — used for export and MaterialsList
  const compositeImageData: ImageData | null = useMemo(() => {
    const hasAny = layers.some(l => l.visible && l.imageData);
    if (!hasAny) return null;
    return compositeLayersToImageData(layers, pw, ph);
  }, [layers, pw, ph]);

  // Composite of all visible layers EXCEPT the active one — shown as backdrop during painting
  const otherLayersData: ImageData | null = useMemo(() => {
    const others = layers.filter(l => l.id !== activeLayerId && l.visible && l.imageData);
    if (others.length === 0) return null;
    return compositeLayersToImageData(others, pw, ph);
  }, [layers, activeLayerId, pw, ph]);

  // Keep exportRef current (uses composite so Ctrl+Shift+S exports all visible layers)
  exportRef.current = { imageData: compositeImageData, dithering, mapGrid, activePalette, blockSelection, mapMode, staircaseMode, layers };

  const hasContent = compositeImageData !== null || compareData !== null;

  return (
    <>
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <img src="/logo-opt.png" width="64" height="64" style={{ height: '32px', width: 'auto' }} alt="MapKluss" fetchPriority="high" />
          <div className="header-titles">
            <h1 className="app-title">MAPKLUSS</h1>
            <span className="app-tagline">MINECRAFT MAP ART GENERATOR</span>
          </div>
          <div className="header-spacer" />
          <button
            className={`tour-btn artist-mode-btn${editorMode === 'artist' ? ' active' : ''}`}
            onClick={() => setEditorMode(m => m === 'simple' ? 'artist' : 'simple')}
            title={editorMode === 'artist' ? t('Выключить режим художника', 'Exit artist mode') : t('Режим художника: слои и расширенные инструменты', 'Artist mode: layers & advanced tools')}
          >🎨 {t('ХУДОЖНИК', 'ARTIST')}</button>
          <button className="tour-btn" onClick={startTour} title={t('Запустить интерактивный тур', 'Start guided tour')}>? {t('ГИД', 'GUIDE')}</button>
          <button className="wiki-btn" onClick={() => setShowWiki(true)} title={t('Открыть полную документацию', 'Read full documentation')}>📖 WIKI</button>
          <a href="https://boosty.to/klussforge" target="_blank" rel="noopener noreferrer" className="support-btn" title={t('Поддержать разработку на Boosty', 'Support development on Boosty')}>❤ {t('ПОДДЕРЖАТЬ', 'SUPPORT')}</a>
          <button className="lang-toggle-btn" onClick={toggleLang} title={t('Switch to English', 'Переключить на русский')}>{lang === 'ru' ? 'EN' : 'RU'}</button>
          <a href="https://boosty.to/klussforge" target="_blank" rel="noopener noreferrer" className="header-ver" title={t('Поддержать разработку', 'Support development')}>{VERSION}</a>
        </div>
      </header>

      {viewBanner && (
        <div className="view-banner">
          <span>█ {t('ЗАГРУЖЕНО ПО ССЫЛКЕ', 'LOADED FROM LINK')}</span>
          <button className="view-banner-dismiss" onClick={() => setViewBanner(false)} title={t('Закрыть', 'Close')}>✕</button>
        </div>
      )}

      {paletteBanner && (
        <div className="view-banner palette-banner">
          <span>⬡ {t('ПАЛИТРА ЗАГРУЖЕНА ПО ССЫЛКЕ', 'PALETTE LOADED FROM LINK')}</span>
          <button className="view-banner-dismiss" onClick={() => setPaletteBanner(false)} title={t('Закрыть', 'Close')}>✕</button>
        </div>
      )}

      <div className="app-body" data-tab={mobileTab}>
        {/* ── LEFT PANEL ── */}
        <aside className="panel panel-left">
          <div className="panel-scroll">
            <ImageUpload onImageLoaded={handleImageLoaded} />
            <div className="new-canvas-row">
              <button
                className="new-canvas-btn"
                onClick={() => setShowNewCanvasModal(true)}
                disabled={processing}
                title={t('Создать пустой холст для рисования с нуля', 'Create blank canvas to draw from scratch')}
              >+ {t('Новый холст', 'New canvas')}</button>
            </div>
            {sourceHasAlpha && (
              <div className="alpha-controls">
                <span className="alpha-label">{t('Прозрачность', 'Transparency')}</span>
                <div className="alpha-mode-btns">
                  <button
                    className={`alpha-mode-btn${bgMode === 'color' ? ' active' : ''}`}
                    onClick={() => setBgMode('color')}
                    title={t('Заполнить прозрачные области фоновым цветом', 'Fill transparent areas with background color')}
                  >{t('Фон', 'BG')}</button>
                  <button
                    className={`alpha-mode-btn${bgMode === 'transparent' ? ' active' : ''}`}
                    onClick={() => setBgMode('transparent')}
                    title={t('Оставить прозрачные области пустыми (воздух в экспорте)', 'Keep transparent areas empty (air in export)')}
                  >{t('Прозрачно', 'Transparent')}</button>
                  {bgMode === 'color' && (
                    <input
                      type="color"
                      className="alpha-color-picker"
                      value={bgColor}
                      onChange={e => setBgColor(e.target.value)}
                      title={t('Цвет заливки фона', 'Background fill color')}
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
                  title={t(`Обрезать изображение под пропорции карты ${pw}×${ph}`, `Crop image to map ratio ${pw}×${ph}`)}
                >✂ {t('Обрезать', 'Crop')}</button>
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
              onStaircaseModeChange={handleStaircaseModeChange}
              processing={processing}
              isBlankCanvas={sourceImage === null && imageData !== null}
              collapsedSections={collapsedSections}
              onToggleSection={handleToggleSection}
              t={t}
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
              title={resetDefaultsPending ? t('Нажми ещё раз для подтверждения', 'Click again to confirm reset') : t('Сбросить все настройки', 'Reset all settings to defaults')}
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
              <span className="reset-icon">↺</span> {resetDefaultsPending ? t('Точно?', 'Sure?') : t('Сбросить всё', 'Reset All')}
            </button>
          </div>
        </aside>

        {/* ── CENTER PANEL ── */}
        <main className="panel panel-center" ref={previewSectionRef}>
          <div className="toolbar">

            {/* LEFT: undo/redo — always visible */}
            <div className="toolbar-group">
              <button className="tool-btn" onClick={handleUndo} disabled={!hasContent || undoStack.length === 0} title={t('Отменить (Ctrl+Z)', 'Undo (Ctrl+Z)')}><i className="fi fi-br-rotate-left" /></button>
              <button className="tool-btn" onClick={handleRedo} disabled={!hasContent || redoStack.length === 0} title={t('Повторить (Ctrl+Y)', 'Redo (Ctrl+Y)')}><i className="fi fi-br-rotate-right" /></button>
            </div>
            <div className="toolbar-sep" />

            {/* TOOLS: select / eyedropper / brush / fill — only when image loaded */}
            {!compareMode && imageData && (
              <div className="toolbar-paint-tools">
                {/* Tool buttons */}
                <div className="toolbar-group">
                  <button className={`tool-btn${activeTool === null ? ' active' : ''}`} onClick={() => setActiveTool(null)} title={t('Выбрать / снять (Esc)', 'Select / deselect (Esc)')}>
                    <i className="fi fi-br-cursor" />
                  </button>
                  <button className={`tool-btn${activeTool === 'eyedropper' ? ' active' : ''}`} onClick={() => setActiveTool(t => t === 'eyedropper' ? null : 'eyedropper')} title={t('Пипетка (E)', 'Eyedropper (E)')}>
                    <i className="fi fi-br-eye-dropper" />
                  </button>
                  <button className={`tool-btn${activeTool === 'brush' ? ' active' : ''}`} onClick={() => setActiveTool(t => t === 'brush' ? null : 'brush')} title={t('Кисть (B)', 'Brush (B)')}>
                    <i className="fi fi-br-brush" />
                  </button>
                  <button className={`tool-btn${activeTool === 'fill' ? ' active' : ''}`} onClick={() => setActiveTool(t => t === 'fill' ? null : 'fill')} title={t('Заливка (F). Без блока — прозрачный', 'Fill (F). No block = transparent')}>
                    <i className="fi fi-br-fill" />
                  </button>
                  <button className={`tool-btn${activeTool === 'eraser' ? ' active' : ''}`} onClick={() => setActiveTool(t => t === 'eraser' ? null : 'eraser')} title={t('Ластик (X)', 'Eraser (X)')}>
                    <i className="fi fi-br-eraser" />
                  </button>
                  {/* text and pattern tools hidden — work in progress */}
                </div>

                {/* Brush size */}
                {(activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'pattern' || activeTool === 'pattern-tile') && (
                  <div className="toolbar-group brush-size-group">
                    <input type="range" min={1} max={20} step={1} value={brushSize} className="brush-size-slider" onChange={e => setBrushSize(Number(e.target.value))} title={t(`Размер: ${brushSize}px`, `Size: ${brushSize}px`)} />
                    <NumInput value={brushSize} min={1} max={20} step={1} onCommit={setBrushSize} />
                    <span className="brush-size-label">px</span>
                  </div>
                )}

                {/* Pattern blocks — hidden while text/pattern tools are WIP */}
                {false && editorMode === 'artist' && activeTool === 'pattern' && (
                  <div className="toolbar-group pattern-blocks-group" style={{ position: 'relative', flexWrap: 'wrap', gap: 3 }}>
                    {patternBlocks.map((pb, idx) => (
                      <div key={idx} className="pattern-block-chip" style={{ position: 'relative' }}>
                        {pb.baseId === -1 ? (
                          <span className="paint-swatch-icon block-picker-icon-transparent pattern-chip-swatch" onClick={() => setShowPatternPicker(idx)} title={t('Сменить блок', 'Change block')} />
                        ) : (
                          <span className="paint-swatch-icon pattern-chip-swatch" style={{ backgroundImage: `url(${SPRITE_URL})`, backgroundPosition: `-${pb.blockId * 32}px -${pb.csId * 32}px` }} onClick={() => setShowPatternPicker(idx)} title={pb.displayName} />
                        )}
                        <button className="pattern-chip-remove" onClick={() => setPatternBlocks(prev => prev.filter((_, i) => i !== idx))} disabled={patternBlocks.length <= 1} title={t('Удалить', 'Remove')}>×</button>
                        {showPatternPicker === idx && (
                          <BlockPickerPopup
                            blockSelection={blockSelection}
                            current={pb}
                            onSelect={b => { setPatternBlocks(prev => prev.map((x, i) => i === idx ? b : x)); setShowPatternPicker(null); }}
                            onClose={() => setShowPatternPicker(null)}
                            mapMode={mapMode}
                          />
                        )}
                      </div>
                    ))}
                    <div style={{ position: 'relative' }}>
                      <button className="tool-btn" title={t('Добавить блок', 'Add block')} onClick={() => setShowPatternPicker(-1)}>+</button>
                      {showPatternPicker === -1 && (
                        <BlockPickerPopup
                          blockSelection={blockSelection}
                          current={null}
                          onSelect={b => { setPatternBlocks(prev => [...prev, b]); setShowPatternPicker(null); }}
                          onClose={() => setShowPatternPicker(null)}
                          mapMode={mapMode}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Shade selector (3D mode, brush/fill) */}
                {mapMode === '3d' && (activeTool === 'brush' || activeTool === 'fill') && paintBlock && paintBlock.baseId !== -1 && (
                  <div className="toolbar-group shade-selector">
                    {([0, 1, 2] as const).map(sh => {
                      const shadeLabel = [t('▼ Тёмный', '▼ Dark'), t('■ Средний', '■ Mid'), t('▲ Светлый', '▲ Bright')];
                      const sc = activePalette.colors.find(c => c.baseId === paintBlock.baseId && c.shade === sh);
                      const bg = sc ? `rgb(${sc.r},${sc.g},${sc.b})` : '#888';
                      return (
                        <button key={sh} className={`shade-btn${paintBlock.shade === sh ? ' active' : ''}`} style={{ '--shade-color': bg } as React.CSSProperties} title={shadeLabel[sh]} onClick={() => setPaintBlock(pb => pb ? { ...pb, shade: sh } : pb)} />
                      );
                    })}
                  </div>
                )}

                {/* Main paint block picker */}
                <div className="toolbar-group paint-swatch-wrapper">
                  <div className="paint-active-swatch">
                    {paintBlock && paintBlock.baseId === -1 ? (
                      <><span className="paint-swatch-icon-wrap"><span className="paint-swatch-icon block-picker-icon-transparent" /></span><span className="paint-swatch-name">{t('Прозрачный', 'Transparent')}</span></>
                    ) : paintBlock ? (
                      <><span className="paint-swatch-icon-wrap"><span className="paint-swatch-icon" style={{ backgroundImage: `url(${SPRITE_URL})`, backgroundPosition: `-${paintBlock.blockId * 32}px -${paintBlock.csId * 32}px` }} /></span><span className="paint-swatch-name">{paintBlock.displayName}</span></>
                    ) : (
                      <span className="paint-no-block">{t('нет блока', 'no block')}</span>
                    )}
                  </div>
                  <button className="tool-btn block-picker-arrow" onClick={() => setShowBlockPicker(p => !p)} title={t('Выбрать блок', 'Choose block')}>▾</button>
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
                {editorMode === 'artist' && (
                  <>
                    <div className="toolbar-sep" />
                    <div className="toolbar-group">
                      <button
                        className={`tool-btn${activeTool === 'select-rect' ? ' active' : ''}`}
                        onClick={() => setActiveTool(t => t === 'select-rect' ? null : 'select-rect')}
                        title={t('Прямоугольное выделение (R)', 'Rect select (R)')}
                      ><i className="fi fi-br-square" /></button>
                      <button
                        className={`tool-btn${activeTool === 'select-lasso' ? ' active' : ''}`}
                        onClick={() => setActiveTool(t => t === 'select-lasso' ? null : 'select-lasso')}
                        title={t('Лассо (L)', 'Lasso (L)')}
                      ><i className="fi fi-br-lasso" /></button>
                      <button
                        className={`tool-btn${activeTool === 'select-magic' ? ' active' : ''}`}
                        onClick={() => setActiveTool(t => t === 'select-magic' ? null : 'select-magic')}
                        title={t('Волшебная палочка (W)', 'Magic wand (W)')}
                      ><i className="fi fi-br-magic-wand" /></button>
                    </div>
                    {selectionMask && (
                      <div className="toolbar-group selection-ops">
                        <button className="tool-btn sel-op-btn" onClick={handleDeleteSelection} title={t('Удалить выделенное (Del)', 'Delete selected (Del)')}><i className="fi fi-br-trash" /></button>
                        <button className="tool-btn sel-op-btn" onClick={handleFillSelection} disabled={!paintBlock || paintBlock.baseId === -1} title={t('Залить выделенное', 'Fill selected')}><i className="fi fi-br-fill" /></button>
                        <button className="tool-btn sel-op-btn" onClick={handleInvertSelection} title={t('Инвертировать (Ctrl+I)', 'Invert (Ctrl+I)')}><i className="fi fi-br-arrows-retweet" /></button>
                        <button className="tool-btn sel-op-btn" onClick={handleMoveSelectionToLayer} title={t('Перенести на новый слой', 'Move to new layer')}><i className="fi fi-br-layer-plus" /></button>
                        <button className="tool-btn sel-op-btn" onClick={() => setSelectionMask(null)} title={t('Снять выделение (Ctrl+D)', 'Deselect (Ctrl+D)')}><i className="fi fi-br-circle-xmark" /></button>
                        <span className="selection-count">{selectedPixelCount}px</span>
                      </div>
                    )}

                    {/* Pattern-tile tool */}
                    <div className="toolbar-sep" />
                    <div className="toolbar-group">
                      <button
                        className={`tool-btn${activeTool === 'pattern-tile' ? ' active' : ''}`}
                        onClick={() => setActiveTool(prev => prev === 'pattern-tile' ? null : 'pattern-tile')}
                        title={t('Паттерн-кисть (P)', 'Pattern brush (P)')}
                      ><i className="fi fi-br-apps" /></button>
                      {activeTool === 'pattern-tile' && (
                        <button
                          className="tool-btn"
                          onClick={() => setShowPatternEditor(true)}
                          title={t('Редактировать паттерн', 'Edit pattern')}
                        ><i className="fi fi-br-settings" /></button>
                      )}
                    </div>

                    {/* Gradient tool */}
                    <div className="toolbar-group" style={{ position: 'relative' }}>
                      <button
                        className={`tool-btn${activeTool === 'gradient' ? ' active' : ''}`}
                        onClick={() => setActiveTool(prev => prev === 'gradient' ? null : 'gradient')}
                        title={t('Градиент (G)', 'Gradient (G)')}
                      ><i className="fi fi-br-arrows-h" /></button>
                    </div>
                    {activeTool === 'gradient' && (
                      <div className="toolbar-group gradient-stops-bar">
                        {[...gradientStops.map((stop, origIdx) => ({ stop, origIdx }))].sort((a, b) => a.stop.t - b.stop.t).map(({ stop, origIdx }, sortedPos) => {
                          const c = activePalette.colors.find(col => col.baseId === stop.block.baseId && col.shade === stop.block.shade)
                            ?? activePalette.colors.find(col => col.baseId === stop.block.baseId);
                          const bg = c ? `rgb(${c.r},${c.g},${c.b})` : '#888';
                          const isFirst = sortedPos === 0;
                          const isLast = sortedPos === gradientStops.length - 1;
                          return (
                            <div key={origIdx} className="gradient-stop-chip" style={{ position: 'relative' }}>
                              <button
                                className={`gradient-stop-swatch${showGradientStopPicker === origIdx ? ' active' : ''}`}
                                style={{ background: bg }}
                                title={`${stop.block.displayName} (${Math.round(stop.t * 100)}%)`}
                                onClick={() => setShowGradientStopPicker(prev => prev === origIdx ? null : origIdx)}
                              />
                              {!isFirst && !isLast && (
                                <button className="gradient-stop-remove" onClick={() => setGradientStops(prev => prev.filter((_, j) => j !== origIdx))}>×</button>
                              )}
                              {showGradientStopPicker === origIdx && (
                                <BlockPickerPopup
                                  blockSelection={blockSelection}
                                  current={stop.block}
                                  onSelect={b => {
                                    setGradientStops(prev => prev.map((s, j) => j === origIdx ? { ...s, block: b } : s));
                                    setShowGradientStopPicker(null);
                                  }}
                                  onClose={() => setShowGradientStopPicker(null)}
                                  mapMode={mapMode}
                                />
                              )}
                            </div>
                          );
                        })}
                        {gradientStops.length < 6 && (
                          <div style={{ position: 'relative' }}>
                            <button
                              className="tool-btn gradient-add-stop"
                              title={t('Добавить цвет', 'Add color')}
                              onClick={() => setShowGradientAddPicker(v => !v)}
                            >+</button>
                            {showGradientAddPicker && (
                              <BlockPickerPopup
                                blockSelection={blockSelection}
                                current={null}
                                onSelect={b => {
                                  setGradientStops(prev => {
                                    // Place first stop at 0, second at 1, subsequent ones bisect the widest gap
                                    let newT: number;
                                    if (prev.length === 0) {
                                      newT = 0;
                                    } else if (prev.length === 1) {
                                      newT = 1;
                                    } else {
                                      // Find the widest gap between consecutive stops
                                      const sorted = [...prev].sort((a, b) => a.t - b.t);
                                      let maxGap = 0, gapStart = 0;
                                      for (let i = 0; i < sorted.length - 1; i++) {
                                        const gap = sorted[i + 1].t - sorted[i].t;
                                        if (gap > maxGap) { maxGap = gap; gapStart = sorted[i].t; }
                                      }
                                      newT = gapStart + maxGap / 2;
                                    }
                                    return [...prev, { t: newT, block: b }];
                                  });
                                  setShowGradientAddPicker(false);
                                }}
                                onClose={() => setShowGradientAddPicker(false)}
                                mapMode={mapMode}
                              />
                            )}
                          </div>
                        )}
                        <button
                          className={`tool-btn${gradientDithering === 'ordered' ? ' active' : ''}`}
                          title={t('Дизеринг (упорядоченный Байер)', 'Ordered dithering (Bayer)')}
                          onClick={() => setGradientDithering(d => d === 'ordered' ? 'none' : 'ordered')}
                        ><i className="fi fi-br-grid-alt" /></button>
                      </div>
                    )}
                  </>
                )}
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
                    title={t('Сбросить масштаб до 100%', 'Reset zoom to 100%')}
                    onClick={() => setZoom(100)}
                  >⌖</button>
                  <button
                    className={`tool-btn${showSplitLine ? ' active' : ''}`}
                    title={t('Показать/скрыть полоску сравнения', 'Show/hide split line')}
                    onClick={() => setShowSplitLine(v => !v)}
                  >╎</button>
                  <button
                    className="tool-btn"
                    title={t('Сбросить разделитель', 'Reset split to center')}
                    onClick={() => setSplitPos(50)}
                  >⟺</button>
                  {!compareMode && (
                    <button className={`tool-btn${textureMode === 'block' ? ' active' : ''}`} onClick={() => setTextureMode(m => m === 'block' ? 'pixel' : 'block')} title={t('Текстуры блоков', 'Block textures')}>{t('Блоки', 'Blocks')}</button>
                  )}
                  <button className={`tool-btn${compareMode ? ' active' : ''}`} onClick={() => handleCompareModeChange(!compareMode)} title={t('Сравнение', 'Comparison')}>{t('Сравнить', 'Compare')}</button>
                  <button className={`tool-btn${showGrid ? ' active' : ''}`} onClick={() => setShowGrid(g => !g)} title={t('Сетка', 'Grid')}>{t('Сетка', 'Grid')}</button>
                </div>
              </>
            )}

            {/* TABLET DRAWER TOGGLE */}
            <div className="toolbar-sep tablet-right-sep" />
            <button className={`tool-btn tablet-right-toggle${tabletRightOpen ? ' active' : ''}`} onClick={() => setTabletRightOpen(v => !v)} title={t('Палитра и экспорт', 'Palette & Export')}>📦</button>

            {/* SHORTCUTS */}
            <div className="toolbar-sep" />
            <div className="toolbar-group shortcuts-wrap">
              <button className={`tool-btn${showShortcuts ? ' active' : ''}`} onClick={() => setShowShortcuts(v => !v)} title={t('Клавиатурные сочетания', 'Keyboard shortcuts')}>⌨</button>
              {showShortcuts && (
                <div className="shortcuts-panel">
                  <div className="shortcuts-panel-title">{t('ГОРЯЧИЕ КЛАВИШИ', 'KEYBOARD SHORTCUTS')}</div>
                  <div className="shortcut-row"><kbd>Ctrl+Z</kbd><span>{t('Отменить', 'Undo')}</span></div>
                  <div className="shortcut-row"><kbd>Ctrl+Y</kbd><span>{t('Повторить', 'Redo')}</span></div>
                  <div className="shortcut-row"><kbd>Ctrl+S</kbd><span>{t('Экспорт PNG', 'Export PNG')}</span></div>
                  <div className="shortcut-row"><kbd>Ctrl+Shift+S</kbd><span>{t('Экспорт .litematic', 'Export .litematic')}</span></div>
                  <div className="shortcuts-divider" />
                  <div className="shortcut-row"><kbd>Z</kbd><span>{t('Сетка', 'Grid')}</span></div>
                  <div className="shortcut-row"><kbd>O</kbd><span>{t('Сброс разделителя', 'Reset split')}</span></div>
                  <div className="shortcut-row"><kbd>C</kbd><span>{t('Режим сравнения', 'Compare mode')}</span></div>
                  <div className="shortcut-row"><kbd>1 – 7</kbd><span>{t('Выбор дизеринга', 'Select dithering')}</span></div>
                  <div className="shortcuts-divider" />
                  <div className="shortcut-row"><kbd>E</kbd><span>{t('Пипетка', 'Eyedropper')}</span></div>
                  <div className="shortcut-row"><kbd>B</kbd><span>{t('Кисть', 'Brush')}</span></div>
                  <div className="shortcut-row"><kbd>F</kbd><span>{t('Заливка', 'Fill')}</span></div>
                  <div className="shortcut-row"><kbd>X</kbd><span>{t('Ластик', 'Eraser')}</span></div>
                  <div className="shortcut-row"><kbd>L</kbd><span>{t('Линия', 'Line')}</span></div>
                  <div className="shortcut-row"><kbd>P</kbd><span>{t('Паттерн', 'Pattern tile')}</span></div>
                  <div className="shortcut-row"><kbd>G</kbd><span>{t('Градиент', 'Gradient')}</span></div>
                  <div className="shortcut-row"><kbd>Esc</kbd><span>{t('Снять инструмент', 'Deselect tool')}</span></div>
                </div>
              )}
            </div>
          </div>

          {compareMode && hasContent && (
            <div className="compare-selectors">
              <div className="compare-selector">
                <label className="compare-selector-label">{t('ЛЕВЫЙ', 'LEFT')}</label>
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
                <label className="compare-selector-label">{t('ПРАВЫЙ', 'RIGHT')}</label>
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
                  imageData={compositeImageData ?? imageData} paintData={imageData} originalData={originalData}
                  showOriginal={false} showGrid={showGrid}
                  width={pw} height={ph} scale={displayScale}
                  cp={activePalette} blockSelection={blockSelection}
                  activeTool={activeTool}
                  paintBlock={paintBlock}
                  patternBlocks={patternBlocks}
                  brushSize={brushSize}
                  textSize={textSize}
                  otherLayersData={otherLayersData}
                  onRemoveBlock={handleRemoveBlock}
                  onImageUpdate={handleImageUpdate}
                  onToolChange={setActiveTool}
                  onPaintBlockChange={setPaintBlock}
                  onTextCommit={handleTextCommit}
                  splitPos={imageData && originalData && showSplitLine ? splitPos : undefined}
                  onSplitPosChange={setSplitPos}
                  selectionMask={selectionMask}
                  onSelectionChange={setSelectionMask}
                  activePattern={activePattern}
                  gradientStops={gradientStops}
                  gradientDithering={gradientDithering}
                />
              </div>
            )}

            {processing && (
              <div className="processing-overlay">
                <div className="processing-overlay-inner">
                  <div className="processing-spinner" />
                  <span className="processing-label">{t('ОБРАБОТКА…', 'PROCESSING…')} {DITHERING_LABELS[dithering].toUpperCase()}</span>
                  <span className="processing-pct">{processingProgress}%</span>
                  {showCancel && (
                    <button className="processing-cancel-btn" onClick={handleCancelProcessing}>✕ {t('ОТМЕНА', 'CANCEL')}</button>
                  )}
                </div>
                <div className="processing-bar-track">
                  <div className="processing-bar-fill" style={{ width: `${processingProgress}%` }} />
                </div>
              </div>
            )}
          </div>
        </main>

        {showPatternEditor && activePattern && (
          <PatternEditorPopup
            pattern={activePattern}
            paintBlock={paintBlock}
            cp={activePalette}
            blockSelection={blockSelection}
            mapMode={mapMode}
            onSave={p => setSavedPatterns(prev => prev.map(x => x.id === p.id ? p : x))}
            onClose={() => setShowPatternEditor(false)}
          />
        )}

        {/* ── RIGHT PANEL ── */}
        {tabletRightOpen && <div className="tablet-drawer-backdrop" onClick={() => setTabletRightOpen(false)} />}
        <aside className={`panel panel-right${tabletRightOpen ? ' drawer-open' : ''}${editorMode === 'artist' ? ' artist-mode' : ''}`}>
          <div className="panel-scroll">
            {editorMode === 'artist' && (
              <>
                <LayersPanel
                  layers={layers}
                  activeLayerId={activeLayerId}
                  onSetActive={id => setLayerState(prev => ({ ...prev, activeLayerId: id }))}
                  onToggleVisible={handleToggleLayerVisible}
                  onAdd={handleAddLayer}
                  onDelete={handleDeleteLayer}
                  onRename={handleRenameLayer}
                  onMoveUp={handleMoveLayerUp}
                  onMoveDown={handleMoveLayerDown}
                  onOpacityChange={handleOpacityChange}
                  onToggleLock={handleToggleLock}
                  onMoveLayer={handleMoveLayer}
                  onMergeDown={handleMergeDown}
                  onMergeVisible={handleMergeVisible}
                  groups={layerGroups}
                  onCreateGroup={handleCreateGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onToggleGroupCollapse={handleToggleGroupCollapse}
                />
                <div className="project-btns">
                  <button className="project-btn" onClick={handleSaveProject} title={t('Скачать проект (.mapkluss)', 'Download project (.mapkluss)')}>
                    ↓ {t('Сохранить проект', 'Save project')}
                  </button>
                  <button className="project-btn" onClick={handleLoadProject} title={t('Загрузить проект (.mapkluss)', 'Load project (.mapkluss)')}>
                    ↑ {t('Загрузить проект', 'Load project')}
                  </button>
                </div>
              </>
            )}
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
                  <div className="support-block-section-title">{t('Опорный блок (3D)', 'Support block (3D)')}</div>
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
                        title={t('Без опорных блоков', 'No support blocks')}
                      >
                        <span className="support-block-no-icon">∅</span>
                        <span className="support-block-item-label">{t('Нет', 'None')}</span>
                      </button>
                      <div className={`support-depth-group${supportBlock === 'air' ? ' disabled' : ''}`}>
                        <span className="support-mode-label">{t('Глубина', 'Depth')}</span>
                        {([1, 2] as const).map(m => (
                          <button
                            key={m}
                            className={`support-mode-btn${supportMode === m ? ' active' : ''}`}
                            onClick={() => setSupportMode(m)}
                            title={getSupportModeTitles(t)[m]}
                            disabled={supportBlock === 'air'}
                          >{SUPPORT_MODE_LABELS[m]}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="mobile-export-content">
              <MaterialsList
                imageData={compareMode ? (compareData?.left ?? null) : compositeImageData}
                cp={activePalette}
                blockSelection={blockSelection}
                mapGrid={mapGrid}
                mapMode={mapMode}
                staircaseMode={staircaseMode}
                supportBlock={supportBlock}
                supportMode={supportMode}
              />
            </div>
          </div>
          <div className="panel-footer mobile-export-content">
            <ExportPanel
              imageData={compositeImageData}
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
              artistMode={editorMode === 'artist'}
              hybridLayers={layers.filter(l => l.visible && l.imageData).map(l => ({
                imageData: l.imageData!,
                mapMode: l.mapMode ?? '2d',
                staircaseMode: l.staircaseMode ?? 'classic',
              }))}
              activeLayerExport={activeLayer?.imageData ? {
                imageData: activeLayer.imageData,
                mapMode: activeLayer.mapMode ?? '2d',
                staircaseMode: activeLayer.staircaseMode ?? 'classic',
              } : undefined}
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
            <span className="mobile-tab-label">Настройки</span>
          </button>
          <button className={`mobile-tab-btn${mobileTab === 'palette' ? ' active' : ''}`} onClick={() => setMobileTab('palette')}>
            <span className="mobile-tab-icon">▦</span>
            <span className="mobile-tab-label">Палитра</span>
          </button>
          <button className={`mobile-tab-btn${mobileTab === 'export' ? ' active' : ''}`} onClick={() => setMobileTab('export')}>
            <span className="mobile-tab-icon">⬇</span>
            <span className="mobile-tab-label">Экспорт</span>
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

    {/* ── New Canvas modal ── */}
    {showNewCanvasModal && (
      <NewCanvasModal
        currentGrid={mapGrid}
        paletteColors={activePalette.colors}
        onConfirm={handleCreateBlankCanvas}
        onClose={() => setShowNewCanvasModal(false)}
      />
    )}

    {/* ── Wiki modal ── */}
    {showWiki && <Suspense fallback={null}><WikiModal onClose={() => setShowWiki(false)} /></Suspense>}
    </>
  );
}
