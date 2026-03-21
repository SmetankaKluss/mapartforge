import { useState } from 'react';
import type { DitheringMode } from '../lib/dithering';
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
  mapGrid: MapGrid;
  onMapGridChange: (g: MapGrid) => void;
  processing: boolean;
}

const BN_SCALES = [1, 2] as const;

const DITHERING_OPTIONS: { value: DitheringMode; label: string; desc: string }[] = [
  { value: 'none',            label: 'None',            desc: 'Nearest OKLAB color only' },
  { value: 'floyd-steinberg', label: 'Floyd–Steinberg', desc: 'Classic serpentine diffusion' },
  { value: 'stucki',          label: 'Stucki',          desc: 'Smooth 12-neighbor diffusion' },
  { value: 'jjn',             label: 'JJN',             desc: 'Jarvis-Judice-Ninke' },
  { value: 'atkinson',        label: 'Atkinson',        desc: 'Apple HyperCard style' },
  { value: 'blue-noise',      label: 'Blue Noise',      desc: 'Aperiodic ordered (IGN)' },
  { value: 'yliluoma2',       label: 'Yliluoma #2',     desc: 'Pattern dithering for pixel art' },
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
  mapGrid, onMapGridChange,
  processing,
}: Props) {
  const showIntensity = dithering !== 'none';
  const blockW = mapGrid.wide * MAP_BLOCK_SIZE;
  const blockH = mapGrid.tall * MAP_BLOCK_SIZE;

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
            <label key={value} className={`dither-option ${dithering === value ? 'active' : ''}`}>
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
