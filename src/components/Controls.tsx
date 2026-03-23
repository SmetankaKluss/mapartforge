import { useState, useRef, useEffect } from 'react';
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
  processing: boolean;
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
    desc: 'Nearest OKLAB color only',
    tooltip: {
      fullName: 'No Dithering',
      description: 'Maps each pixel directly to the nearest palette color using OKLAB perceptual distance. No error propagation.',
      bestFor: 'Logos, pixel art, and images with few flat colors.',
    },
  },
  {
    value: 'floyd-steinberg',
    label: 'Floyd–Steinberg',
    desc: 'Classic serpentine diffusion',
    tooltip: {
      fullName: 'Floyd–Steinberg',
      description: 'Distributes quantization error to 4 neighboring pixels in a serpentine scan. Classic and fast.',
      bestFor: 'Photos and general-purpose use.',
    },
  },
  {
    value: 'stucki',
    label: 'Stucki',
    desc: 'Smooth 12-neighbor diffusion',
    tooltip: {
      fullName: 'Stucki',
      description: 'Spreads error across 12 neighbors with a wider kernel. Produces smoother gradients than Floyd–Steinberg.',
      bestFor: 'Smooth gradients and portraits.',
    },
  },
  {
    value: 'jjn',
    label: 'JJN',
    desc: 'Jarvis-Judice-Ninke',
    tooltip: {
      fullName: 'Jarvis–Judice–Ninke',
      description: 'A 12-pixel kernel with different weight distribution for rounder, more diffuse error spread.',
      bestFor: 'Detailed photos with fine textures.',
    },
  },
  {
    value: 'atkinson',
    label: 'Atkinson',
    desc: 'Apple HyperCard style',
    tooltip: {
      fullName: 'Atkinson',
      description: 'Propagates only ¾ of the error, preserving bright highlights and producing a crisper look.',
      bestFor: 'High-contrast images and illustrations.',
    },
  },
  {
    value: 'blue-noise',
    label: 'Blue Noise',
    desc: 'Aperiodic ordered (IGN)',
    tooltip: {
      fullName: 'Blue Noise (IGN)',
      description: 'Ordered dithering using an interleaved gradient noise pattern. Avoids repetitive banding artifacts.',
      bestFor: 'Artistic output and stylized map art.',
    },
  },
  {
    value: 'yliluoma2',
    label: 'Yliluoma #2',
    desc: 'Pattern dithering for pixel art',
    tooltip: {
      fullName: 'Yliluoma Algorithm #2',
      description: 'Clusters pixels into palette-color patterns rather than diffusing error. Produces a crisp, painterly look.',
      bestFor: 'Pixel art style and large multi-map grids.',
    },
  },
  {
    value: 'kluss',
    label: 'KlussDither',
    desc: 'IGN blend dithering for anime art',
    tooltip: {
      fullName: 'KlussDither',
      description: 'Clean-zone detection snaps flat fills directly. Dither zones use IGN (blue noise) threshold selection between the two nearest palette colors, guaranteeing a visible dither pattern wherever two colors compete. Mild Stucki error diffusion smooths gradients on top.',
      bestFor: 'Anime art, illustrations, and images with large flat colour regions.',
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
  processing,
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
        <h3 className="control-title">Map grid</h3>
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
            title="Custom grid size"
          >
            <svg width="22" height="15" viewBox="0 0 22 15" aria-hidden fill="currentColor" opacity="0.8">
              <rect x="0" y="0" width="6" height="6" rx="1"/>
              <rect x="8" y="0" width="6" height="6" rx="1"/>
              <rect x="16" y="0" width="6" height="6" rx="1"/>
              <rect x="0" y="9" width="6" height="6" rx="1"/>
              <rect x="8" y="9" width="6" height="6" rx="1"/>
              <rect x="16" y="9" width="6" height="6" rx="1"/>
            </svg>
            <span className="grid-label">Custom</span>
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
              >Apply</button>
            </div>
            <p className="custom-grid-info">
              {customW}×{customH} maps — <strong>{customW * MAP_BLOCK_SIZE}×{customH * MAP_BLOCK_SIZE}</strong> blocks
              {(customW > 5 || customH > 5) && (
                <span className="custom-grid-warn"> ⚠ Large grid may be slow</span>
              )}
            </p>
          </div>
        )}

        <p className="grid-info">
          {mapGrid.wide}×{mapGrid.tall} maps — <strong>{blockW}×{blockH}</strong> blocks
        </p>
      </section>

      {/* ── Dithering ─────────────────────────────────────────── */}
      <section className="control-group">
        <h3 className="control-title">Dithering</h3>
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
              <div className="dither-tooltip-best"><span className="dither-tooltip-best-label">Best for:</span> {opt.tooltip.bestFor}</div>
            </div>
          );
        })()}
      </section>

      {/* ── Blue noise pattern scale ──────────────────────────── */}
      {dithering === 'blue-noise' && (
        <section className="control-group">
          <h3 className="control-title">Pattern scale</h3>
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
              ? 'Fine grain — may show ribbing pattern.'
              : `${bnScale}×${bnScale} block areas share one noise threshold.`}
          </p>
        </section>
      )}

      {/* ── KlussDither params ───────────────────────────────────── */}
      {dithering === 'kluss' && (
        <section className="control-group">
          <h3 className="control-title">KlussDither settings</h3>

          {/* Clean threshold */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">Clean threshold</span>
              <span className="intensity-value">{liveKluss.cleanThreshold.toFixed(3)}</span>
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
            <p className="intensity-hint">Pixels closer than this OKLAB dist snap cleanly (no dither). ~0.015 = avg Minecraft palette dist.</p>
          </div>

          {/* Error strength */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">Error strength</span>
              <span className="intensity-value">{liveKluss.maxCandidateDist.toFixed(1)}</span>
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
            <p className="intensity-hint">Stucki diffusion strength. 1.0 = standard; 3.0 = amplified dithering; 0.1 = very subtle.</p>
          </div>

          {/* Error cap */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">Error cap</span>
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
            <p className="intensity-hint">Max error spread per channel. Lower = softer transitions; 256 = uncapped (full Stucki).</p>
          </div>

          {/* Zone boundary threshold */}
          <div className="kluss-param">
            <div className="kluss-param-header">
              <span className="kluss-param-label">Zone boundary</span>
              <span className="intensity-value">{liveKluss.zoneBoundaryThreshold.toFixed(2)}</span>
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
            <p className="intensity-hint">Hard colour edges snap cleanly — prevents diffusion from bleeding across sharp zone boundaries.</p>
          </div>

          <button
            className="kluss-reset-btn"
            onClick={() => onKlussParamsChange(DEFAULT_KLUSS_PARAMS)}
            disabled={processing}
          >Reset to defaults</button>
        </section>
      )}

      {/* ── Intensity ─────────────────────────────────────────── */}
      {showIntensity && (
        <section className="control-group">
          <h3 className="control-title">
            Intensity
            <span className="intensity-value">{intensity}%</span>
          </h3>
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
            <span>Subtle</span><span>Full</span>
          </div>
          {ERROR_DIFFUSION.includes(dithering) && (
            <p className="intensity-hint">Error spread strength.</p>
          )}
          {dithering === 'blue-noise' && (
            <p className="intensity-hint">Noise threshold range.</p>
          )}
          {dithering === 'yliluoma2' && (
            <p className="intensity-hint">Pattern size (1–8 colors per cluster).</p>
          )}
          {dithering === 'kluss' && (
            <p className="intensity-hint">0% = no dithering (pure snap), 100% = full Stucki diffusion at the set error strength.</p>
          )}
        </section>
      )}

      <section className="control-group">
        <p className="oklab-badge">✓ OKLAB color matching</p>
      </section>

      {processing && (
        <div className="processing-badge">Processing…</div>
      )}
    </div>
  );
}
