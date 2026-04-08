import { useState } from 'react';
import type { MapGrid } from '../lib/types';
import { MAP_BLOCK_SIZE } from '../lib/types';
import type { PaletteColor } from '../lib/palette';

interface Props {
  currentGrid: MapGrid;
  paletteColors: PaletteColor[];
  onConfirm: (bg: { r: number; g: number; b: number; a: number } | null, grid: MapGrid) => void;
  onClose: () => void;
}

const GRID_OPTIONS: MapGrid[] = [
  { wide: 1, tall: 1 },
  { wide: 2, tall: 1 },
  { wide: 1, tall: 2 },
  { wide: 2, tall: 2 },
  { wide: 3, tall: 3 },
  { wide: 4, tall: 4 },
];

const MAX_CUSTOM = 10;

function isPresetGrid(g: MapGrid): boolean {
  return GRID_OPTIONS.some(o => o.wide === g.wide && o.tall === g.tall);
}

type BgType = 'white' | 'transparent' | 'color';

export function NewCanvasModal({ currentGrid, paletteColors, onConfirm, onClose }: Props) {
  const [grid, setGrid]         = useState<MapGrid>(currentGrid);
  const [bgType, setBgType]     = useState<BgType>('white');
  const [picked, setPicked]     = useState<PaletteColor | null>(null);
  const [showCustom, setShowCustom] = useState(!isPresetGrid(currentGrid));
  const [customW, setCustomW]   = useState(currentGrid.wide);
  const [customH, setCustomH]   = useState(currentGrid.tall);


  // One swatch per unique baseId (deduplicated palette row colors)
  const swatches = Array.from(
    new Map(paletteColors.map(c => [c.baseId, c])).values(),
  );

  function handleCreate() {
    let bg: { r: number; g: number; b: number; a: number } | null;
    if (bgType === 'white') {
      // Use the lightest color from the active palette (not pure white which may not be in palette)
      const lightest = paletteColors.reduce<PaletteColor | null>((best, c) =>
        !best || (c.r + c.g + c.b) > (best.r + best.g + best.b) ? c : best, null);
      bg = lightest ? { r: lightest.r, g: lightest.g, b: lightest.b, a: 255 } : { r: 255, g: 255, b: 255, a: 255 };
    } else if (bgType === 'transparent') {
      bg = null;
    } else {
      if (!picked) return;
      bg = { r: picked.r, g: picked.g, b: picked.b, a: 255 };
    }
    onConfirm(bg, grid);
  }

  const canCreate = bgType !== 'color' || picked !== null;

  return (
    <div className="crop-backdrop" onClick={onClose}>
      <div className="nc-modal" onClick={e => e.stopPropagation()}>

        <div className="crop-modal-header">
          <span className="crop-modal-title">НОВЫЙ ХОЛСТ</span>
          <button className="crop-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Size ── */}
        <div className="nc-section">
          <div className="nc-label">РАЗМЕР (карт)</div>
          <div className="nc-grid-options">
            {GRID_OPTIONS.map(g => {
              const active = !showCustom && g.wide === grid.wide && g.tall === grid.tall;
              return (
                <button
                  key={`${g.wide}x${g.tall}`}
                  className={`nc-size-btn${active ? ' active' : ''}`}
                  onClick={() => { setGrid(g); setShowCustom(false); }}
                >
                  {g.wide}×{g.tall}
                </button>
              );
            })}
            <button
              className={`nc-size-btn${showCustom ? ' active' : ''}`}
              onClick={() => { setShowCustom(v => !v); if (!showCustom) { setCustomW(grid.wide); setCustomH(grid.tall); } }}
            >
              Свой
            </button>
          </div>
          {showCustom && (
            <div className="nc-custom-row">
              <input
                type="number" className="nc-custom-input"
                min={1} max={MAX_CUSTOM} value={customW}
                onChange={e => { const v = Math.max(1, Math.min(MAX_CUSTOM, Number(e.target.value))); setCustomW(v); setGrid({ wide: v, tall: customH }); }}
              />
              <span className="nc-custom-sep">×</span>
              <input
                type="number" className="nc-custom-input"
                min={1} max={MAX_CUSTOM} value={customH}
                onChange={e => { const v = Math.max(1, Math.min(MAX_CUSTOM, Number(e.target.value))); setCustomH(v); setGrid({ wide: customW, tall: v }); }}
              />
              <span className="nc-custom-unit">карт</span>
            </div>
          )}
          <div className="nc-size-hint">{grid.wide * MAP_BLOCK_SIZE} × {grid.tall * MAP_BLOCK_SIZE} px</div>
        </div>

        {/* ── Background ── */}
        <div className="nc-section">
          <div className="nc-label">ФОН</div>
          <div className="nc-bg-options">

            <button
              className={`nc-bg-btn${bgType === 'white' ? ' active' : ''}`}
              onClick={() => setBgType('white')}
            >
              <span className="nc-bg-preview nc-white" />
              Белый
            </button>

            <button
              className={`nc-bg-btn${bgType === 'transparent' ? ' active' : ''}`}
              onClick={() => setBgType('transparent')}
            >
              <span className="nc-bg-preview nc-transparent" />
              Прозрачный
            </button>

            <button
              className={`nc-bg-btn${bgType === 'color' ? ' active' : ''}`}
              onClick={() => setBgType('color')}
            >
              {picked && bgType === 'color'
                ? <span className="nc-bg-preview" style={{ background: `rgb(${picked.r},${picked.g},${picked.b})` }} />
                : <span className="nc-bg-preview nc-transparent" />
              }
              Из палитры…
            </button>

          </div>

          {bgType === 'color' && (
            <div className="nc-swatches">
              {swatches.length === 0
                ? <span className="nc-no-palette">Сначала выберите пресет палитры</span>
                : swatches.map(c => (
                  <button
                    key={c.baseId}
                    className={`nc-swatch${picked?.baseId === c.baseId ? ' selected' : ''}`}
                    style={{ background: `rgb(${c.r},${c.g},${c.b})` }}
                    title={c.name}
                    onClick={() => setPicked(c)}
                  />
                ))
              }
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="crop-modal-footer">
          <button className="nc-btn" onClick={onClose}>Отмена</button>
          <button
            className="nc-btn nc-btn-create"
            onClick={handleCreate}
            disabled={!canCreate}
          >
            Создать
          </button>
        </div>

      </div>
    </div>
  );
}
