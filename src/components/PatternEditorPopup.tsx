import { useState, useRef, useEffect, useCallback } from 'react';
import type { PaintBlock } from './PreviewCanvas';
import type { ComputedPalette } from '../lib/dithering';
import type { PatternDefinition } from '../lib/patternTool';
import { resizePattern } from '../lib/patternTool';
import { BlockPickerPopup } from './BlockPickerPopup';
import type { BlockSelection } from '../lib/paletteBlocks';

interface Props {
  pattern: PatternDefinition;
  paintBlock: PaintBlock | null;
  cp: ComputedPalette;
  blockSelection: BlockSelection;
  mapMode?: '2d' | '3d';
  onSave: (p: PatternDefinition) => void;
  onClose: () => void;
}

function getBlockColor(block: PaintBlock, cp: ComputedPalette): string {
  const c = cp.colors.find(c => c.baseId === block.baseId && c.shade === block.shade)
    ?? cp.colors.find(c => c.baseId === block.baseId);
  return c ? `rgb(${c.r},${c.g},${c.b})` : 'transparent';
}

export function PatternEditorPopup({ pattern: initialPattern, paintBlock, cp, blockSelection, mapMode, onSave, onClose }: Props) {
  const [pattern, setPattern] = useState<PatternDefinition>(initialPattern);
  const [widthInput, setWidthInput] = useState(String(initialPattern.width));
  const [heightInput, setHeightInput] = useState(String(initialPattern.height));
  const [showBlockPicker, setShowBlockPicker] = useState<number | null>(null);
  const [isErasing, setIsErasing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Drag-to-move state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on Escape only (no outside-click close — allows other popups to stay open)
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Header drag handlers
  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    dragStartRef.current = { mx: e.clientX, my: e.clientY, px: rect.left, py: rect.top };

    function onMove(ev: MouseEvent) {
      if (!dragStartRef.current) return;
      const dx = ev.clientX - dragStartRef.current.mx;
      const dy = ev.clientY - dragStartRef.current.my;
      setPos({ x: dragStartRef.current.px + dx, y: dragStartRef.current.py + dy });
    }
    function onUp() {
      dragStartRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  function applySize() {
    const w = Math.max(1, Math.min(16, parseInt(widthInput) || pattern.width));
    const h = Math.max(1, Math.min(16, parseInt(heightInput) || pattern.height));
    if (w !== pattern.width || h !== pattern.height) {
      setPattern(resizePattern(pattern, w, h));
      setWidthInput(String(w));
      setHeightInput(String(h));
    }
  }

  function paintCell(idx: number, erase: boolean) {
    setPattern(prev => {
      const pixels = [...prev.pixels];
      pixels[idx] = erase ? null : (paintBlock && paintBlock.baseId !== -1 ? paintBlock : null);
      return { ...prev, pixels };
    });
  }

  function handleCellMouseDown(idx: number, e: React.MouseEvent) {
    e.preventDefault();
    const erase = e.button === 2 || !paintBlock || paintBlock.baseId === -1;
    setIsErasing(erase);
    setIsDragging(true);
    paintCell(idx, erase);
  }

  function handleCellMouseEnter(idx: number, e: React.MouseEvent) {
    if (!isDragging) return;
    e.preventDefault();
    paintCell(idx, isErasing);
  }

  function handleMouseUp() { setIsDragging(false); }

  const CELL_SIZE = Math.max(20, Math.min(48, Math.floor(240 / Math.max(pattern.width, pattern.height))));

  const style: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, transform: 'none' }
    : {};

  return (
    <div
      ref={ref}
      className="pattern-editor-popup"
      style={style}
      onMouseUp={handleMouseUp}
      onContextMenu={e => e.preventDefault()}
    >
      <div
        className="pattern-editor-header"
        onMouseDown={onHeaderMouseDown}
        style={{ cursor: 'grab' }}
      >
        <span className="pattern-editor-title">Редактор паттерна</span>
        <button className="pattern-editor-close" onClick={onClose}>×</button>
      </div>

      {/* Size controls */}
      <div className="pattern-editor-size-row">
        <label>W</label>
        <input
          type="number" min={1} max={16} value={widthInput}
          onChange={e => setWidthInput(e.target.value)}
          onBlur={applySize}
          onKeyDown={e => e.key === 'Enter' && applySize()}
          className="pattern-editor-size-input"
        />
        <label>H</label>
        <input
          type="number" min={1} max={16} value={heightInput}
          onChange={e => setHeightInput(e.target.value)}
          onBlur={applySize}
          onKeyDown={e => e.key === 'Enter' && applySize()}
          className="pattern-editor-size-input"
        />
        <button className="pattern-editor-apply-btn" onClick={applySize}>OK</button>
      </div>

      {/* Pixel grid */}
      <div
        className="pattern-editor-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${pattern.width}, ${CELL_SIZE}px)`,
          gap: 1,
          userSelect: 'none',
        }}
      >
        {pattern.pixels.map((block, idx) => (
          <div
            key={idx}
            className="pattern-editor-cell"
            style={{
              width: CELL_SIZE,
              height: CELL_SIZE,
              background: block && block.baseId !== -1
                ? getBlockColor(block, cp)
                : undefined,
              cursor: 'crosshair',
            }}
            onMouseDown={e => { if (e.button === 0 || e.button === 2) handleCellMouseDown(idx, e); }}
            onMouseEnter={e => handleCellMouseEnter(idx, e)}
          />
        ))}
      </div>

      {/* Info row */}
      <div className="pattern-editor-info">
        <span className="pattern-editor-hint">ЛКМ — красить, ПКМ — стереть</span>
        <span className="pattern-editor-dims">{pattern.width}×{pattern.height}</span>
      </div>

      {/* Actions */}
      <div className="pattern-editor-actions">
        <button className="pattern-editor-clear-btn" onClick={() => setPattern(p => ({ ...p, pixels: Array(p.width * p.height).fill(null) }))}>
          Очистить
        </button>
        <button className="pattern-editor-save-btn" onClick={() => { onSave(pattern); onClose(); }}>
          Сохранить
        </button>
      </div>

      {showBlockPicker !== null && (
        <BlockPickerPopup
          blockSelection={blockSelection}
          current={pattern.pixels[showBlockPicker]}
          onSelect={_b => {
            paintCell(showBlockPicker, false);
            setShowBlockPicker(null);
          }}
          onClose={() => setShowBlockPicker(null)}
          mapMode={mapMode}
        />
      )}
    </div>
  );
}
