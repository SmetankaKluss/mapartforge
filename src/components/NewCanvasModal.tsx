import { useState } from 'react';
import type { MapGrid } from '../lib/types';
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

type BgType = 'white' | 'transparent' | 'color';

export function NewCanvasModal({ currentGrid, paletteColors, onConfirm, onClose }: Props) {
  const [grid, setGrid]     = useState<MapGrid>(currentGrid);
  const [bgType, setBgType] = useState<BgType>('white');
  const [picked, setPicked] = useState<PaletteColor | null>(null);

  // One swatch per unique baseId (deduplicated palette row colors)
  const swatches = Array.from(
    new Map(paletteColors.map(c => [c.baseId, c])).values(),
  );

  function handleCreate() {
    let bg: { r: number; g: number; b: number; a: number } | null;
    if (bgType === 'white') {
      bg = { r: 255, g: 255, b: 255, a: 255 };
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
              const active = g.wide === grid.wide && g.tall === grid.tall;
              return (
                <button
                  key={`${g.wide}x${g.tall}`}
                  className={`nc-size-btn${active ? ' active' : ''}`}
                  onClick={() => setGrid(g)}
                >
                  {g.wide}×{g.tall}
                </button>
              );
            })}
          </div>
          <div className="nc-size-hint">{grid.wide * 128} × {grid.tall * 128} px</div>
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
