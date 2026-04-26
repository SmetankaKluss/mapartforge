import { useState, useRef, useEffect } from 'react';
import { NumInput } from './NumInput';
import type { DitheringMode, KlussParams } from '../lib/dithering';
import { DEFAULT_KLUSS_PARAMS } from '../lib/dithering';
import { MAP_GRID_OPTIONS, MAP_BLOCK_SIZE } from '../lib/types';
import type { MapGrid } from '../lib/types';

interface Props {
  dithering: DitheringMode;
  onDitheringChange: (mode: DitheringMode) => void;
  intensity: number;
  onIntensityChange: (v: number) => void;
  onIntensityCommit: (v: number) => void;
  bnScale: number;
  onBnScaleChange: (v: number) => void;
  klussParams: KlussParams;
  onKlussParamsChange: (p: KlussParams) => void;
  mapGrid: MapGrid;
  onMapGridChange: (g: MapGrid) => void;
  mapMode: '2d' | '3d';
  onMapModeChange: (mode: '2d' | '3d') => void;
  staircaseMode: 'classic' | 'optimized';
  onStaircaseModeChange: (mode: 'classic' | 'optimized') => void;
  processing: boolean;
  isBlankCanvas: boolean;
  collapsedSections: Record<string, boolean>;
  onToggleSection: (key: string) => void;
  t: (ru: string, en: string) => string;
}

const BN_SCALES = [1, 2] as const;

interface DitheringOption {
  value: DitheringMode;
  label: string;
  desc: string;
  tooltip: { fullName: string; description: string; bestFor: string };
}

function getDitheringOptions(t: (ru: string, en: string) => string): DitheringOption[] {
  return [
    {
      value: 'none',
      label: 'None',
      desc: t('Ближайший цвет OKLAB', 'Nearest OKLAB'),
      tooltip: {
        fullName: t('Без дизеринга', 'No dithering'),
        description: t('Каждый пиксель напрямую заменяется ближайшим цветом палитры по расстоянию OKLAB. Без распространения ошибки.', 'Each pixel is directly replaced with the nearest palette color by OKLAB distance. No error diffusion.'),
        bestFor: t('Логотипы, пиксель-арт и изображения с небольшим количеством плоских цветов.', 'Logos, pixel art, and images with few flat colors.'),
      },
    },
    {
      value: 'floyd-steinberg',
      label: 'Floyd–Steinberg',
      desc: t('Классическая змейковая диффузия', 'Classic serpentine diffusion'),
      tooltip: {
        fullName: 'Floyd–Steinberg',
        description: t('Распределяет ошибку квантования на 4 соседних пикселя при змейковом сканировании. Классика, быстро работает.', 'Distributes quantization error to 4 neighboring pixels in serpentine scan. Classic and fast.'),
        bestFor: t('Фотографии и общее использование.', 'Photos and general use.'),
      },
    },
    {
      value: 'stucki',
      label: 'Stucki',
      desc: t('Плавная диффузия на 12 соседей', 'Smooth diffusion to 12 neighbors'),
      tooltip: {
        fullName: 'Stucki',
        description: t('Распространяет ошибку на 12 соседей через более широкое ядро. Даёт более плавные градиенты, чем Floyd–Steinberg.', 'Spreads error to 12 neighbors with a wider kernel. Produces smoother gradients than Floyd–Steinberg.'),
        bestFor: t('Плавные градиенты и портреты.', 'Smooth gradients and portraits.'),
      },
    },
    {
      value: 'jjn',
      label: 'JJN',
      desc: 'Jarvis–Judice–Ninke',
      tooltip: {
        fullName: 'Jarvis–Judice–Ninke',
        description: t('12-пиксельное ядро с иным распределением весов — более округлое и размытое распространение ошибки.', '12-pixel kernel with different weight distribution — more rounded and blurred error spread.'),
        bestFor: t('Детальные фото с мелкими текстурами.', 'Detailed photos with fine textures.'),
      },
    },
    {
      value: 'atkinson',
      label: 'Atkinson',
      desc: t('Стиль Apple HyperCard', 'Apple HyperCard style'),
      tooltip: {
        fullName: 'Atkinson',
        description: t('Распространяет только ¾ ошибки, сохраняя яркие блики и давая более чёткий результат.', 'Spreads only ¾ of error, preserving bright highlights and giving a crisper result.'),
        bestFor: t('Контрастные изображения и иллюстрации.', 'High-contrast images and illustrations.'),
      },
    },
    {
      value: 'blue-noise',
      label: 'Blue Noise',
      desc: t('Апериодический (IGN)', 'Aperiodic (IGN)'),
      tooltip: {
        fullName: 'Blue Noise (IGN)',
        description: t('Упорядоченный дизеринг на основе чересстрочного градиентного шума. Избегает повторяющихся полосовых артефактов.', 'Ordered dithering based on interleaved gradient noise. Avoids repeating striped artifacts.'),
        bestFor: t('Художественный результат и стилизованный мап-арт.', 'Artistic results and stylized map art.'),
      },
    },
    {
      value: 'yliluoma2',
      label: 'Yliluoma #2',
      desc: t('Паттерновый дизеринг для пиксель-арта', 'Pattern dithering for pixel art'),
      tooltip: {
        fullName: t('Алгоритм Yliluoma #2', 'Yliluoma #2 Algorithm'),
        description: t('Группирует пиксели в паттерны из цветов палитры вместо диффузии ошибки. Даёт чёткий, живописный результат.', 'Groups pixels into patterns from palette colors instead of error diffusion. Gives a crisp, painterly result.'),
        bestFor: t('Пиксель-арт стиль и большие мультикарточные сетки.', 'Pixel art style and large multi-map grids.'),
      },
    },
    {
      value: 'kluss',
      label: 'KlussDither',
      desc: t('IGN-дизеринг для аниме-арта', 'IGN dithering for anime art'),
      tooltip: {
        fullName: 'KlussDither',
        description: t('Определяет «чистые зоны» и снаппит их напрямую. В зонах дизеринга использует IGN-пороговое выделение между двумя ближайшими цветами палитры. Мягкая диффузия Stucki сглаживает градиенты поверх.', 'Detects "clean zones" and snaps them directly. In dithering zones uses IGN threshold selection between two nearest palette colors. Soft Stucki diffusion smooths gradients on top.'),
        bestFor: t('Аниме-арт, иллюстрации и изображения с большими плоскими областями.', 'Anime art, illustrations, and images with large flat areas.'),
      },
    },
  ];
}

const ERROR_DIFFUSION: DitheringMode[] = ['floyd-steinberg', 'stucki', 'jjn', 'atkinson'];

const MAX_CUSTOM = 100;
const MAX_PX = 8192;

function isPreset(g: MapGrid): boolean {
  return MAP_GRID_OPTIONS.some(o => o.wide === g.wide && o.tall === g.tall) && !g.pixelW && !g.pixelH;
}

function GridIcon({ wide, tall }: { wide: number; tall: number }) {
  // Cap visual at 3×3 for the icon regardless of actual size
  const cols = Math.min(wide, 3);
  const rows = Math.min(tall, 3);
  const cell = 7;
  const gap = 1;
  const w = cols * cell + (cols - 1) * gap;
  const h = rows * cell + (rows - 1) * gap;
  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({ x: col * (cell + gap), y: row * (cell + gap) });
    }
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      {cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width={cell} height={cell} rx={1} fill="currentColor" />
      ))}
    </svg>
  );
}

export function Controls({
  dithering, onDitheringChange,
  intensity, onIntensityChange, onIntensityCommit,
  bnScale, onBnScaleChange,
  klussParams, onKlussParamsChange,
  mapGrid, onMapGridChange,
  mapMode, onMapModeChange,
  staircaseMode, onStaircaseModeChange,
  processing,
  isBlankCanvas,
  collapsedSections, onToggleSection,
  t,
}: Props) {
  const DITHERING_OPTIONS = getDitheringOptions(t);
  const showIntensity = dithering !== 'none';
  const blockW = mapGrid.wide * MAP_BLOCK_SIZE;
  const blockH = mapGrid.tall * MAP_BLOCK_SIZE;

  // Dithering tooltip state
  const [tooltipInfo, setTooltipInfo] = useState<{ mode: DitheringMode; top: number; left: number } | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleOptionMouseEnter(e: React.MouseEvent<HTMLLabelElement>, value: DitheringMode) {
    clearTimeout(tooltipTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    const top = Math.min(rect.top, window.innerHeight - 140);
    tooltipTimer.current = setTimeout(() => {
      setTooltipInfo({ mode: value, top, left: rect.right + 10 });
    }, 400);
  }

  function handleOptionMouseLeave() {
    clearTimeout(tooltipTimer.current);
    setTooltipInfo(null);
  }

  // Local live state for KlussDither sliders — updated on every drag tick (display only).
  // Commits to parent only on mouseUp/touchEnd to avoid racing with processingRef guard.
  const [liveKluss, setLiveKluss] = useState<KlussParams>(klussParams);
  // Sync when parent resets params (e.g. "Reset to defaults" button)
  useEffect(() => { setLiveKluss(klussParams); }, [klussParams]);

  // Custom grid state
  const [showCustom, setShowCustom] = useState(false);
  const [customMode, setCustomMode] = useState<'grid' | 'pixels'>('grid');
  const [customW, setCustomW] = useState(mapGrid.wide);
  const [customH, setCustomH] = useState(mapGrid.tall);
  const [customPxW, setCustomPxW] = useState(mapGrid.pixelW ?? mapGrid.wide * MAP_BLOCK_SIZE);
  const [customPxH, setCustomPxH] = useState(mapGrid.pixelH ?? mapGrid.tall * MAP_BLOCK_SIZE);

  const customIsActive = !isPreset(mapGrid);

  function applyCustom() {
    if (customMode === 'pixels') {
      const pw = Math.max(1, Math.min(MAX_PX, customPxW));
      const ph = Math.max(1, Math.min(MAX_PX, customPxH));
      onMapGridChange({
        wide: Math.max(1, Math.ceil(pw / MAP_BLOCK_SIZE)),
        tall: Math.max(1, Math.ceil(ph / MAP_BLOCK_SIZE)),
        pixelW: pw,
        pixelH: ph,
      });
    } else {
      const w = Math.max(1, Math.min(MAX_CUSTOM, customW));
      const h = Math.max(1, Math.min(MAX_CUSTOM, customH));
      onMapGridChange({ wide: w, tall: h });
    }
    setShowCustom(false);
  }

  function handleCustomKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') applyCustom();
    if (e.key === 'Escape') setShowCustom(false);
  }

  return (
    <div className="controls">

      {/* ── Group 1: Output Format (Size + Mode) ─────────────────── */}
      <div className="ctrl-block">

      {/* ── Map grid selector ─────────────────────────────────── */}
      <section className={`control-group${isBlankCanvas ? ' section-disabled' : ''}`}>
        <h3 className="control-title">
          <span className={`section-arrow${collapsedSections['map-grid'] ? ' collapsed' : ''}`} onClick={() => onToggleSection('map-grid')}>▼</span>
          {t('Размер', 'Size')}
          {isBlankCanvas && <span className="section-disabled-hint"> {t('(холст)', '(canvas)')}</span>}
        </h3>
        <div className={`control-group-content${collapsedSections['map-grid'] ? ' collapsed' : ''}`}>
        <div className="grid-options">
          {MAP_GRID_OPTIONS.map((g) => {
            const active = !customIsActive && g.wide === mapGrid.wide && g.tall === mapGrid.tall;
            return (
              <button
                key={`${g.wide}x${g.tall}`}
                className={`grid-btn ${active ? 'active' : ''}`}
                onClick={() => { onMapGridChange(g); setShowCustom(false); }}
                disabled={processing}
                title={`${g.wide}×${g.tall} maps`}
              >
                <GridIcon wide={g.wide} tall={g.tall} />
                <span className="grid-label">{g.wide}×{g.tall}</span>
              </button>
            );
          })}

          {/* Custom button */}
          <button
            className={`grid-btn grid-btn-custom ${customIsActive || showCustom ? 'active' : ''}`}
            onClick={() => {
              setCustomW(mapGrid.wide);
              setCustomH(mapGrid.tall);
              setShowCustom(v => !v);
            }}
            disabled={processing}
            title={t('Произвольный размер', 'Custom size')}
          >
            <svg width="22" height="15" viewBox="0 0 22 15" aria-hidden fill="currentColor" opacity="0.8">
              <rect x="0" y="0" width="6" height="6" rx="1"/>
              <rect x="8" y="0" width="6" height="6" rx="1"/>
              <rect x="16" y="0" width="6" height="6" rx="1"/>
              <rect x="0" y="9" width="6" height="6" rx="1"/>
              <rect x="8" y="9" width="6" height="6" rx="1"/>
              <rect x="16" y="9" width="6" height="6" rx="1"/>
            </svg>
            <span className="grid-label">{t('Свой', 'Custom')}</span>
          </button>
        </div>

        {/* Custom grid inputs */}
        {showCustom && (
          <div className="custom-grid-inputs">
            <div className="custom-grid-mode-tabs">
              <button
                className={`custom-grid-mode-tab${customMode === 'grid' ? ' active' : ''}`}
                onClick={() => setCustomMode('grid')}
              >{t('Карты', 'Maps')}</button>
              <button
                className={`custom-grid-mode-tab${customMode === 'pixels' ? ' active' : ''}`}
                onClick={() => setCustomMode('pixels')}
              >{t('Пиксели', 'Pixels')}</button>
            </div>
            {customMode === 'grid' ? (
              <>
                <div className="custom-grid-row">
                  <label className="custom-grid-label">W</label>
                  <input
                    type="number"
                    className="custom-grid-input"
                    min={1} max={MAX_CUSTOM}
                    value={customW}
                    onChange={e => setCustomW(Math.max(1, Math.min(MAX_CUSTOM, Number(e.target.value))))}
                    onKeyDown={handleCustomKeyDown}
                  />
                  <span className="custom-grid-sep">×</span>
                  <label className="custom-grid-label">H</label>
                  <input
                    type="number"
                    className="custom-grid-input"
                    min={1} max={MAX_CUSTOM}
                    value={customH}
                    onChange={e => setCustomH(Math.max(1, Math.min(MAX_CUSTOM, Number(e.target.value))))}
                    onKeyDown={handleCustomKeyDown}
                  />
                  <button
                    className="custom-grid-apply"
                    onClick={applyCustom}
                    disabled={processing}
                  >{t('Применить', 'Apply')}</button>
                </div>
                <p className="custom-grid-info">
                  {customW}×{customH} {t('карт', 'maps')} — <strong>{customW * MAP_BLOCK_SIZE}×{customH * MAP_BLOCK_SIZE}</strong> {t('блоков', 'blocks')}
                  {(customW > 5 || customH > 5) && (
                    <span className="custom-grid-warn"> ⚠ {t('Большая сетка может быть медленной', 'Large grid may be slow')}</span>
                  )}
                </p>
              </>
            ) : (
              <>
                <div className="custom-grid-row">
                  <label className="custom-grid-label">W</label>
                  <input
                    type="number"
                    className="custom-grid-input"
                    min={1} max={MAX_PX}
                    value={customPxW}
                    onChange={e => setCustomPxW(Math.max(1, Math.min(MAX_PX, Number(e.target.value))))}
                    onKeyDown={handleCustomKeyDown}
                  />
                  <span className="custom-grid-sep">×</span>
                  <label className="custom-grid-label">H</label>
                  <input
                    type="number"
                    className="custom-grid-input"
                    min={1} max={MAX_PX}
                    value={customPxH}
                    onChange={e => setCustomPxH(Math.max(1, Math.min(MAX_PX, Number(e.target.value))))}
                    onKeyDown={handleCustomKeyDown}
                  />
                  <button
                    className="custom-grid-apply"
                    onClick={applyCustom}
                    disabled={processing}
                  >{t('Применить', 'Apply')}</button>
                </div>
                <p className="custom-grid-info">
                  <strong>{customPxW}×{customPxH}</strong> px
                  {(customPxW > 2048 || customPxH > 2048) && (
                    <span className="custom-grid-warn"> ⚠ {t('Большой холст может быть медленным', 'Large canvas may be slow')}</span>
                  )}
                </p>
              </>
            )}
          </div>
        )}

        <p className="grid-info">
          {mapGrid.wide}×{mapGrid.tall} {t('карт', 'maps')} — <strong>{blockW}×{blockH}</strong> {t('блоков', 'blocks')}
        </p>
        </div>
      </section>

      {/* ── Map mode (2D/3D) ──────────────────────────────────── */}
      <section className="control-group">
        <h3 className="control-title">
          <span className={`section-arrow${collapsedSections['map-mode'] ? ' collapsed' : ''}`} onClick={() => onToggleSection('map-mode')}>▼</span>
          {t('Режим', 'Mode')}
        </h3>
        <div className={`control-group-content${collapsedSections['map-mode'] ? ' collapsed' : ''}`}>
          <div className="mode-toggle">
            <button
              className={`mode-btn${mapMode === '2d' ? ' active' : ''}`}
              onClick={() => onMapModeChange('2d')}
              disabled={processing}
              title="2D flat — one shade per color, ~61 colors"
            >2D Flat</button>
            <button
              className={`mode-btn${mapMode === '3d' ? ' active' : ''}`}
              onClick={() => onMapModeChange('3d')}
              disabled={processing}
              title="3D staircase — 3 shades per color, ~183 colors"
            >3D Stair</button>
          </div>
          {mapMode === '3d' && (
            <div className="mode-toggle" style={{ marginTop: '6px' }}>
              <button
                className={`mode-btn${staircaseMode === 'classic' ? ' active' : ''}`}
                onClick={() => onStaircaseModeChange('classic')}
                disabled={processing}
                title="Classic: each shade at its own height"
                style={{ fontSize: '10px' }}
              >Classic</button>
              <button
                className={`mode-btn${staircaseMode === 'optimized' ? ' active' : ''}`}
                onClick={() => onStaircaseModeChange('optimized')}
                disabled={processing}
                title="Optimized: all shades at height 0, texture only"
                style={{ fontSize: '10px' }}
              >Optimized</button>
            </div>
          )}
        </div>
      </section>

      </div>{/* end ctrl-block: Output Format */}

      {/* ── Group 2: Processing (Dithering + Intensity) ────────── */}
      <div className="ctrl-block">

      {/* ── Dithering ─────────────────────────────────────────── */}
      <section className="control-group">
        <h3 className="control-title">
          <span className={`section-arrow${collapsedSections['dithering'] ? ' collapsed' : ''}`} onClick={() => onToggleSection('dithering')}>▼</span>
          {t('Дизеринг', 'Dithering')}
        </h3>
        <div className={`control-group-content${collapsedSections['dithering'] ? ' collapsed' : ''}`}>
        <div className="dither-options">
          {DITHERING_OPTIONS.map(({ value, label, desc }) => (
            <label
              key={value}
              className={`dither-option ${dithering === value ? 'active' : ''}`}
              onMouseEnter={e => handleOptionMouseEnter(e, value)}
              onMouseLeave={handleOptionMouseLeave}
            >
              <input
                type="radio"
                name="dithering"
                value={value}
                checked={dithering === value}
                onChange={() => onDitheringChange(value)}
                disabled={processing}
              />
              <span className="dither-label">{label}</span>
              <span className="dither-desc">{desc}</span>
            </label>
          ))}
        </div>
        {tooltipInfo && (() => {
          const opt = DITHERING_OPTIONS.find(o => o.value === tooltipInfo.mode);
          if (!opt) return null;
          return (
            <div className="dither-tooltip" style={{ top: tooltipInfo.top, left: tooltipInfo.left }}>
              <div className="dither-tooltip-title">{opt.tooltip.fullName}</div>
              <div className="dither-tooltip-body">{opt.tooltip.description}</div>
              <div className="dither-tooltip-best"><span className="dither-tooltip-best-label">Лучше для:</span> {opt.tooltip.bestFor}</div>
            </div>
          );
        })()}
        </div>
      </section>

      {/* ── Blue noise pattern scale ──────────────────────────── */}
      {dithering === 'blue-noise' && (
        <section className="control-group">
          <h3 className="control-title">
            <span className={`section-arrow${collapsedSections['pattern-scale'] ? ' collapsed' : ''}`} onClick={() => onToggleSection('pattern-scale')}>▼</span>
            Масштаб паттерна
          </h3>
          <div className={`control-group-content${collapsedSections['pattern-scale'] ? ' collapsed' : ''}`}>
          <div className="bn-scale-options">
            {BN_SCALES.map(s => (
              <button
                key={s}
                className={`bn-scale-btn ${bnScale === s ? 'active' : ''}`}
                onClick={() => onBnScaleChange(s)}
                disabled={processing}
                title={`${s}×${s} block area per noise threshold`}
              >
                {s}×
              </button>
            ))}
          </div>
          <p className="intensity-hint">
            {bnScale === 1
              ? t('Мелкое зерно — возможны полосы.', 'Fine grain — artifacts possible.')
              : t(`Области ${bnScale}×${bnScale} блока используют один порог шума.`, `${bnScale}×${bnScale} block areas use one noise threshold.`)}
          </p>
          </div>
        </section>
      )}

      {/* ── KlussDither params ───────────────────────────────────── */}
      {dithering === 'kluss' && (
        <section className="control-group">
          <h3 className="control-title">
            <span className={`section-arrow${collapsedSections['klussettings'] ? ' collapsed' : ''}`} onClick={() => onToggleSection('klussettings')}>▼</span>
            {t('Настройки KlussDither', 'KlussDither Settings')}
          </h3>
          <div className={`control-group-content${collapsedSections['klussettings'] ? ' collapsed' : ''}`}>

          {/* Clean threshold */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">{t('Порог чистоты', 'Cleanliness Threshold')}</span>
              <NumInput value={liveKluss.cleanThreshold} min={0.001} max={0.05} step={0.001} decimals={3}
                onCommit={v => { const p = { ...liveKluss, cleanThreshold: v }; setLiveKluss(p); onKlussParamsChange(p); }}
                disabled={processing} />
            </div>
            <input
              type="range" className="intensity-slider"
              min={0.001} max={0.05} step={0.001}
              value={liveKluss.cleanThreshold}
              onChange={e => setLiveKluss(p => ({ ...p, cleanThreshold: Number(e.target.value) }))}
              onMouseUp={e => onKlussParamsChange({ ...liveKluss, cleanThreshold: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={e => onKlussParamsChange({ ...liveKluss, cleanThreshold: Number((e.target as HTMLInputElement).value) })}
              disabled={processing}
            />
            <p className="intensity-hint">{t('Пиксели ближе этого расстояния OKLAB снаппятся без дизеринга. ~0.015 = среднее расстояние палитры Minecraft.', 'Pixels closer than this OKLAB distance snap without dithering. ~0.015 = average Minecraft palette distance.')}</p>
          </div>

          {/* Error strength */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">{t('Сила ошибки', 'Error Strength')}</span>
              <NumInput value={liveKluss.maxCandidateDist} min={0.10} max={3.00} step={0.10} decimals={1}
                onCommit={v => { const p = { ...liveKluss, maxCandidateDist: v }; setLiveKluss(p); onKlussParamsChange(p); }}
                disabled={processing} />
            </div>
            <input
              type="range" className="intensity-slider"
              min={0.10} max={3.00} step={0.10}
              value={liveKluss.maxCandidateDist}
              onChange={e => setLiveKluss(p => ({ ...p, maxCandidateDist: Number(e.target.value) }))}
              onMouseUp={e => onKlussParamsChange({ ...liveKluss, maxCandidateDist: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={e => onKlussParamsChange({ ...liveKluss, maxCandidateDist: Number((e.target as HTMLInputElement).value) })}
              disabled={processing}
            />
            <p className="intensity-hint">{t('Сила диффузии Stucki. 1.0 = стандарт; 3.0 = усиленный; 0.1 = едва заметный.', 'Stucki diffusion strength. 1.0 = standard; 3.0 = enhanced; 0.1 = subtle.')}</p>
          </div>

          {/* Error cap */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">{t('Предел ошибки', 'Error Cap')}</span>
              <span className="intensity-value">{Math.max(1, Math.round(liveKluss.errorCap)) * 64} RGB</span>
            </div>
            <input
              type="range" className="intensity-slider"
              min={1} max={4} step={1}
              value={Math.max(1, Math.round(liveKluss.errorCap))}
              onChange={e => setLiveKluss(p => ({ ...p, errorCap: Number(e.target.value) }))}
              onMouseUp={e => onKlussParamsChange({ ...liveKluss, errorCap: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={e => onKlussParamsChange({ ...liveKluss, errorCap: Number((e.target as HTMLInputElement).value) })}
              disabled={processing}
            />
            <p className="intensity-hint">{t('Макс. распространение ошибки на канал. Меньше = мягче переходы; 256 = без ограничений (полный Stucki).', 'Max error spread per channel. Lower = softer transitions; 256 = unlimited (full Stucki).')}</p>
          </div>

          {/* Zone boundary threshold */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">{t('Граница зон', 'Zone Boundary')}</span>
              <NumInput value={liveKluss.zoneBoundaryThreshold} min={0.02} max={0.50} step={0.01} decimals={2}
                onCommit={v => { const p = { ...liveKluss, zoneBoundaryThreshold: v }; setLiveKluss(p); onKlussParamsChange(p); }}
                disabled={processing} />
            </div>
            <input
              type="range" className="intensity-slider"
              min={0.02} max={0.50} step={0.01}
              value={liveKluss.zoneBoundaryThreshold}
              onChange={e => setLiveKluss(p => ({ ...p, zoneBoundaryThreshold: Number(e.target.value) }))}
              onMouseUp={e => onKlussParamsChange({ ...liveKluss, zoneBoundaryThreshold: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={e => onKlussParamsChange({ ...liveKluss, zoneBoundaryThreshold: Number((e.target as HTMLInputElement).value) })}
              disabled={processing}
            />
            <p className="intensity-hint">{t('Жёсткие края цветов снаппятся чисто — предотвращает диффузию через резкие границы зон.', 'Hard color edges snap cleanly — prevents diffusion across sharp zone boundaries.')}</p>
          </div>

          {/* Jitter */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">{t('Джиттер', 'Jitter')}</span>
              <NumInput value={liveKluss.jitter} min={0} max={24} step={1} decimals={0}
                onCommit={v => { const p = { ...liveKluss, jitter: v }; setLiveKluss(p); onKlussParamsChange(p); }}
                disabled={processing} />
            </div>
            <input
              type="range" className="intensity-slider"
              min={0} max={24} step={1}
              value={liveKluss.jitter}
              onChange={e => setLiveKluss(p => ({ ...p, jitter: Number(e.target.value) }))}
              onMouseUp={e => onKlussParamsChange({ ...liveKluss, jitter: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={e => onKlussParamsChange({ ...liveKluss, jitter: Number((e.target as HTMLInputElement).value) })}
              disabled={processing}
            />
            <p className="intensity-hint">{t('Blue-noise возмущение в зоне дизеринга. 0 = выкл; ~8 = слабо; ~20 = сильно. Разбивает структуру Stucki.', 'Blue-noise jitter in dithering zone. 0 = off; ~8 = weak; ~20 = strong. Breaks up Stucki pattern.')}</p>
          </div>

          <button
            className="kluss-reset-btn"
            onClick={() => onKlussParamsChange(DEFAULT_KLUSS_PARAMS)}
            disabled={processing}
          >{t('Сбросить настройки', 'Reset settings')}</button>
          </div>
        </section>
      )}

      {/* ── Intensity ─────────────────────────────────────────── */}
      {showIntensity && (
        <section className="control-group">
          <h3 className="control-title">
            <span className={`section-arrow${collapsedSections['intensity'] ? ' collapsed' : ''}`} onClick={() => onToggleSection('intensity')}>▼</span>
            {t('Интенсивность', 'Intensity')}
            <span className="slider-value-wrap">
              <NumInput value={intensity} min={0} max={100} step={1} onCommit={v => { onIntensityChange(v); onIntensityCommit(v); }} disabled={processing} />
              <span className="num-input-unit">%</span>
            </span>
          </h3>
          <div className={`control-group-content${collapsedSections['intensity'] ? ' collapsed' : ''}`}>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={intensity}
            onChange={(e) => onIntensityChange(Number(e.target.value))}
            onMouseUp={(e) => onIntensityCommit(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => onIntensityCommit(Number((e.target as HTMLInputElement).value))}
            disabled={processing}
            className="intensity-slider"
          />
          <div className="intensity-labels">
            <span>{t('Слабо', 'Low')}</span><span>{t('Полная', 'Full')}</span>
          </div>
          {ERROR_DIFFUSION.includes(dithering) && (
            <p className="intensity-hint">{t('Сила распространения ошибки.', 'Error diffusion strength.')}</p>
          )}
          {dithering === 'blue-noise' && (
            <p className="intensity-hint">{t('Диапазон порога шума.', 'Noise threshold range.')}</p>
          )}
          {dithering === 'yliluoma2' && (
            <p className="intensity-hint">{t('Размер паттерна (1–8 цветов в кластере).', 'Pattern size (1–8 colors per cluster).')}</p>
          )}
          {dithering === 'kluss' && (
            <p className="intensity-hint">{t('0% = без дизеринга (чистый снапп), 100% = полная диффузия Stucki.', '0% = no dithering (pure snap), 100% = full Stucki diffusion.')}</p>
          )}
          </div>
        </section>
      )}

      <section className="control-group">
        <p className="oklab-badge">✓ {t('Подбор цвета OKLAB', 'OKLAB color selection')}</p>
      </section>

      {processing && (
        <div className="processing-badge">{t('Обработка…', 'Processing…')}</div>
      )}

      </div>{/* end ctrl-block: Processing */}
    </div>
  );
}
