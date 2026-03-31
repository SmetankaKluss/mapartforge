import { useState, useEffect, useRef } from 'react';
import { COLOUR_ROWS } from '../lib/paletteBlocks';
import type { BlockSelection } from '../lib/paletteBlocks';
import type { PaintBlock } from './PreviewCanvas';
import { TRANSPARENT_PAINT_BLOCK } from './PreviewCanvas';
import { SPRITE_URL } from './BlockCanvas';

interface Props {
  blockSelection: BlockSelection;
  current: PaintBlock | null;
  onSelect: (block: PaintBlock) => void;
  onClose: () => void;
  mapMode?: '2d' | '3d';
}

export function BlockPickerPopup({ blockSelection, current, onSelect, onClose, mapMode }: Props) {
  const [search, setSearch] = useState('');
  void mapMode; // reserved for future use
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    // Slight delay so the button click that opened the popup doesn't immediately close it
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = search.toLowerCase().trim();

  const items = COLOUR_ROWS.flatMap(row => {
    const ids = blockSelection[row.csId];
    // Enabled if not explicitly set to [] (empty = disabled via Remove)
    if (ids !== undefined && ids.length === 0) return [];
    const activeIds = ids ?? [];
    const blockId = activeIds[0] ?? row.blocks[0]?.blockId ?? 0;
    const block = row.blocks.find(b => b.blockId === blockId) ?? row.blocks[0];
    if (!block) return [];
    if (q && !block.displayName.toLowerCase().includes(q) && !row.colourName.toLowerCase().includes(q)) return [];
    return [{
      csId: row.csId,
      blockId: block.blockId,
      baseId: row.baseId,
      shade: 1,
      displayName: block.displayName,
      colourName: row.colourName,
    } satisfies PaintBlock];
  });

  return (
    <div className="block-picker-popup" ref={ref}>
      <div className="block-picker-header">
        <span className="block-picker-title">Choose block</span>
        <button className="block-picker-close" onClick={onClose}>✕</button>
      </div>
      <div className="block-picker-search-wrap">
        <input
          className="block-picker-search"
          placeholder="Search blocks…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      </div>
      <div className="block-picker-list">
        {(!q || 'transparent'.includes(q) || 'air'.includes(q)) && (
          <button
            className={`block-picker-item${current?.baseId === -1 ? ' selected' : ''}`}
            onClick={() => onSelect(TRANSPARENT_PAINT_BLOCK)}
            title="Transparent (Air)"
          >
            <div className="block-picker-icon-wrap">
              <span className="block-picker-icon block-picker-icon-transparent" />
            </div>
            <span className="block-picker-name">Transparent</span>
            <span className="block-picker-group">Air</span>
          </button>
        )}
        {items.map(item => (
          <button
            key={item.csId}
            className={`block-picker-item${current?.csId === item.csId ? ' selected' : ''}`}
            onClick={() => onSelect(item)}
            title={`${item.displayName} (${item.colourName})`}
          >
            <div className="block-picker-icon-wrap">
              <span
                className="block-picker-icon"
                style={{
                  backgroundImage: `url(${SPRITE_URL})`,
                  backgroundPosition: `-${item.blockId * 32}px -${item.csId * 32}px`,
                }}
              />
            </div>
            <span className="block-picker-name">{item.displayName}</span>
            <span className="block-picker-group">{item.colourName}</span>
          </button>
        ))}
        {items.length === 0 && (
          <div className="block-picker-empty">No blocks match "{search}"</div>
        )}
      </div>
    </div>
  );
}
