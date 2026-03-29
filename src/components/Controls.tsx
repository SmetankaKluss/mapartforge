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
  collapsedSections: Record<string, boolean>;
  onToggleSection: (key: string) => void;
}

const BN_SCALES = [1, 2] as const;

interface DitheringOption {
  value: DitheringMode;
  label: string;
  desc: string;
  tooltip: { fullName: string; description: string; bestFor: string };
}

const DITHERING_OPTIONS: DitheringOption[] = [
  {
    value: 'none',
    label: 'None',
    desc: 'Ближайший цвет OKLAB',
    tooltip: {
      fullName: 'Без дизеринга',
      description: 'Каждый пиксель напрямую заменяется ближайшим цветом палитры по расстоянию OKLAB. Без распространения ошибки.',
      bestFor: 'Логотипы, пиксель-арт и изображения с небольшим количеством плоских цветов.',
    },
  },
  {
    value: 'floyd-steinberg',
    label: 'Floyd–Steinberg',
    desc: 'Классическая змейковая диффузия',
    tooltip: {
      fullName: 'Floyd–Steinberg',
      description: 'Распределяет ошибку квантования на 4 соседних пикселя при змейковом сканировании. Классика, быстро работает.',
      bestFor: 'Фотографии и общее использование.',
    },
  },
  {
    value: 'stucki',
    label: 'Stucki',
    desc: 'Плавная диффузия на 12 соседей',
    tooltip: {
      fullName: 'Stucki',
      description: 'Распространяет ошибку на 12 соседей через более широкое ядро. Даёт более плавные градиенты, чем Floyd–Steinberg.',
      bestFor: 'Плавные градиенты и портреты.',
    },
  },
  {
    value: 'jjn',
    label: 'JJN',
    desc: 'Jarvis–Judice–Ninke',
    tooltip: {
      fullName: 'Jarvis–Judice–Ninke',
      description: '12-пиксельное ядро с иным распределением весов — более округлое и размытое распространение ошибки.',
      bestFor: 'Детальные фото с мелкими текстурами.',
    },
  },
  {
    value: 'atkinson',
    label: 'Atkinson',
    desc: 'Стиль Apple HyperCard',
    tooltip: {
      fullName: 'Atkinson',
      description: 'Распространяет только ¾ ошибки, сохраняя яркие блики и давая более чёткий результат.',
      bestFor: 'Контрастные изображения и иллюстрации.',
    },
  },
  {
    value: 'blue-noise',
    label: 'Blue Noise',
    desc: 'Апериодический (IGN)',
    tooltip: {
      fullName: 'Blue Noise (IGN)',
      description: 'Упорядоченный дизеринг на основе чересстрочного градиентного шума. Избегает повторяющихся полосовых артефактов.',
      bestFor: 'Художественный результат и стилизованный мап-арт.',
    },
  },
  {
    value: 'yliluoma2',
    label: 'Yliluoma #2',
    desc: 'Паттерновый дизеринг для пиксель-арта',
    tooltip: {
      fullName: 'Алгоритм Yliluoma #2',
      description: 'Группирует пиксели в паттерны из цветов палитры вместо диффузии ошибки. Даёт чёткий, живописный результат.',
      bestFor: 'Пиксель-арт стиль и большие мультикарточные сетки.',
    },
  },
  {
    value: 'kluss',
    label: 'KlussDither',
    desc: 'IGN-дизеринг для аниме-арта',
    tooltip: {
      fullName: 'KlussDither',
      description: 'Определяет «чистые зоны» и снаппит их напрямую. В зонах дизеринга использует IGN-пороговое выделение между двумя ближайшими цветами палитры. Мягкая диффузия Stucki сглаживает градиенты поверх.',
      bestFor: 'Аниме-арт, иллюстрации и изображения с большими плоскими областями.',
    },
  },
];

const ERROR_DIFFUSION: DitheringMode[] = ['floyd-steinberg', 'stucki', 'jjn', 'atkinson'];

const MAX_CUSTOM = 10;

function isPreset(g: MapGrid): boolean {
  return MAP_GRID_OPTIONS.some(o => o.wide === g.wide && o.tall === g.tall);
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
  collapsedSections, onToggleSection,
}: Props) {
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
  const [customW, setCustomW] = useState(mapGrid.wide);
  const [customH, setCustomH] = useState(mapGrid.tall);

  const customIsActive = !isPreset(mapGrid);

  function applyCustom() {
    const w = Math.max(1, Math.min(MAX_CUSTOM, customW));
    const h = Math.max(1, Math.min(MAX_CUSTOM, customH));
    onMapGridChange({ wide: w, tall: h });
    setShowCustom(false);
  }

  function handleCustomKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') applyCustom();
    if (e.key === 'Escape') setShowCustom(false);
  }

  return (
    <div className="controls">

      {/* ── Map grid selector ─────────────────────────────────── */}
      <section className="control-group">
        <h3 className="control-title">
          <span className={`section-arrow${collapsedSections['map-grid'] ? ' collapsed' : ''}`} onClick={() => onToggleSection('map-grid')}>▼</span>
          Карта
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
            title="Произвольный размер"
          >
            <svg width="22" height="15" viewBox="0 0 22 15" aria-hidden fill="currentColor" opacity="0.8">
              <rect x="0" y="0" width="6" height="6" rx="1"/>
              <rect x="8" y="0" width="6" height="6" rx="1"/>
              <rect x="16" y="0" width="6" height="6" rx="1"/>
              <rect x="0" y="9" width="6" height="6" rx="1"/>
              <rect x="8" y="9" width="6" height="6" rx="1"/>
              <rect x="16" y="9" width="6" height="6" rx="1"/>
            </svg>
            <span className="grid-label">Свой</span>
          </button>
        </div>

        {/* Custom grid inputs */}
        {showCustom && (
          <div className="custom-grid-inputs">
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
              >Применить</button>
            </div>
            <p className="custom-grid-info">
              {customW}×{customH} карт — <strong>{customW * MAP_BLOCK_SIZE}×{customH * MAP_BLOCK_SIZE}</strong> блоков
              {(customW > 5 || customH > 5) && (
                <span className="custom-grid-warn"> ⚠ Большая сетка может быть медленной</span>
              )}
            </p>
          </div>
        )}

        <p className="grid-info">
          {mapGrid.wide}×{mapGrid.tall} карт — <strong>{blockW}×{blockH}</strong> блоков
        </p>
        </div>
      </section>

      {/* ── Map mode (2D/3D) ──────────────────────────────────── */}
      <section className="control-group">
        <h3 className="control-title">
          <span className={`section-arrow${collapsedSections['map-mode'] ? ' collapsed' : ''}`} onClick={() => onToggleSection('map-mode')}>▼</span>
          Режим
        </h3>
        <div className={`control-group-content${collapsedSections['map-mode'] ? ' collapsed' : ''}`}>
          <div className="mode-toggle">
            <button
              className={`mode-btn${mapMode === '2d' ? ' active' : ''}`}
              onClick={() => onMapModeChange('2d')}
              disabled={processing}
              title="2D плоский — один оттенок на цвет, ~61 цвет"
            >2D ПЛОСКИЙ</button>
            <button
              className={`mode-btn${mapMode === '3d' ? ' active' : ''}`}
              onClick={() => onMapModeChange('3d')}
              disabled={processing}
              title="3D лестница — 3 оттенка на цвет, ~183 цвета"
            >3D ЛЕСТНИЦА</button>
          </div>
          {mapMode === '3d' && (
            <div className="mode-toggle" style={{ marginTop: '6px' }}>
              <button
                className={`mode-btn${staircaseMode === 'classic' ? ' active' : ''}`}
                onClick={() => onStaircaseModeChange('classic')}
                disabled={processing}
                title="Классический: каждый оттенок на своей высоте"
                style={{ fontSize: '10px' }}
              >Классик</button>
              <button
                className={`mode-btn${staircaseMode === 'optimized' ? ' active' : ''}`}
                onClick={() => onStaircaseModeChange('optimized')}
                disabled={processing}
                title="Оптимизированный: все оттенки на высоте 0, только текстура"
                style={{ fontSize: '10px' }}
              >Оптим.</button>
            </div>
          )}
        </div>
      </section>

      {/* ── Dithering ─────────────────────────────────────────── */}
      <section className="control-group">
        <h3 className="control-title">
          <span className={`section-arrow${collapsedSections['dithering'] ? ' collapsed' : ''}`} onClick={() => onToggleSection('dithering')}>▼</span>
          Дизеринг
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
              ? 'Мелкое зерно — возможны полосы.'
              : `Области ${bnScale}×${bnScale} блока используют один порог шума.`}
          </p>
          </div>
        </section>
      )}

      {/* ── KlussDither params ───────────────────────────────────── */}
      {dithering === 'kluss' && (
        <section className="control-group">
          <h3 className="control-title">
            <span className={`section-arrow${collapsedSections['klussettings'] ? ' collapsed' : ''}`} onClick={() => onToggleSection('klussettings')}>▼</span>
            Настройки KlussDither
          </h3>
          <div className={`control-group-content${collapsedSections['klussettings'] ? ' collapsed' : ''}`}>

          {/* Clean threshold */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">Порог чистоты</span>
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
            <p className="intensity-hint">Пиксели ближе этого расстояния OKLAB снаппятся без дизеринга. ~0.015 = среднее расстояние палитры Minecraft.</p>
          </div>

          {/* Error strength */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">Сила ошибки</span>
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
            <p className="intensity-hint">Сила диффузии Stucki. 1.0 = стандарт; 3.0 = усиленный; 0.1 = едва заметный.</p>
          </div>

          {/* Error cap */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">Предел ошибки</span>
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
            <p className="intensity-hint">Макс. распространение ошибки на канал. Меньше = мягче переходы; 256 = без ограничений (полный Stucki).</p>
          </div>

          {/* Zone boundary threshold */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">Граница зон</span>
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
            <p className="intensity-hint">Жёсткие края цветов снаппятся чисто — предотвращает диффузию через резкие границы зон.</p>
          </div>

          {/* Jitter */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">Джиттер</span>
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
            <p className="intensity-hint">Blue-noise возмущение в зоне дизеринга. 0 = выкл; ~8 = слабо; ~20 = сильно. Разбивает структуру Stucki.</p>
          </div>

          <button
            className="kluss-reset-btn"
            onClick={() => onKlussParamsChange(DEFAULT_KLUSS_PARAMS)}
            disabled={processing}
          >Сбросить настройки</button>
          </div>
        </section>
      )}

      {/* ── Intensity ─────────────────────────────────────────── */}
      {showIntensity && (
        <section className="control-group">
          <h3 className="control-title">
            <span className={`section-arrow${collapsedSections['intensity'] ? ' collapsed' : ''}`} onClick={() => onToggleSection('intensity')}>▼</span>
            Интенсивность
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
            <span>Слабо</span><span>Полная</span>
          </div>
          {ERROR_DIFFUSION.includes(dithering) && (
            <p className="intensity-hint">Сила распространения ошибки.</p>
          )}
          {dithering === 'blue-noise' && (
            <p className="intensity-hint">Диапазон порога шума.</p>
          )}
          {dithering === 'yliluoma2' && (
            <p className="intensity-hint">Размер паттерна (1–8 цветов в кластере).</p>
          )}
          {dithering === 'kluss' && (
            <p className="intensity-hint">0% = без дизеринга (чистый снапп), 100% = полная диффузия Stucki.</p>
          )}
          </div>
        </section>
      )}

      <section className="control-group">
        <p className="oklab-badge">✓ Подбор цвета OKLAB</p>
      </section>

      {processing && (
        <div className="processing-badge">Обработка…</div>
      )}
    </div>
  );
}
