import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { COLOUR_ROWS } from '../lib/paletteBlocks';
import { useLocale } from '../lib/useLocale';
import type { BlockSelection } from '../lib/paletteBlocks';
import type { PaintBlock } from './previewCanvasShared';
import { TRANSPARENT_PAINT_BLOCK } from './previewCanvasShared';
import { SPRITE_URL } from './BlockCanvas';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';

interface Props {
  blockSelection: BlockSelection;
  current: PaintBlock | null;
  onSelect: (block: PaintBlock) => void;
  onClose: () => void;
  mapMode?: '2d' | '3d';
}

export function BlockPickerPopup({ blockSelection, current, onSelect, onClose, mapMode }: Props) {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  void mapMode; // reserved for future use
  const ref = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, []);

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
  const showsTransparent = !q || 'transparent'.includes(q) || 'air'.includes(q)
    || 'прозрачный'.includes(q) || 'воздух'.includes(q);

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

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="block-picker-popup" ref={ref} role="dialog" aria-modal="false" aria-label={t('Выбор блока', 'Block picker')}>
      <div className="block-picker-header">
        <span className="block-picker-title">{t('Выбери блок', 'Choose block')}</span>
        <button className="block-picker-close" onClick={onClose} aria-label={t('Закрыть', 'Close')}><IconGlyph icon={mkIcons.close} /></button>
      </div>
      <div className="block-picker-search-wrap">
        <input
          className="block-picker-search"
          placeholder={t('Поиск блоков…', 'Search blocks…')}
          aria-label={t('Поиск блоков', 'Search blocks')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <div className="block-picker-list" role="listbox" aria-label={t('Доступные блоки', 'Available blocks')}>
        {showsTransparent && (
          <button
            className={`block-picker-item${current?.baseId === -1 ? ' selected' : ''}`}
            onClick={() => onSelect(TRANSPARENT_PAINT_BLOCK)}
            title={t('Прозрачный (Воздух)', 'Transparent (Air)')}
            role="option"
            aria-selected={current?.baseId === -1}
          >
            <div className="block-picker-icon-wrap">
              <span className="block-picker-icon block-picker-icon-transparent" />
            </div>
            <span className="block-picker-name">{t('Прозрачный', 'Transparent')}</span>
            <span className="block-picker-group">{t('Воздух', 'Air')}</span>
          </button>
        )}
        {items.map(item => (
          <button
            key={item.csId}
            className={`block-picker-item${current?.csId === item.csId ? ' selected' : ''}`}
            onClick={() => onSelect(item)}
            title={`${item.displayName} (${item.colourName})`}
            role="option"
            aria-selected={current?.csId === item.csId}
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
        {items.length === 0 && !showsTransparent && (
          <div className="block-picker-empty">{t(`Блоков не найдено «${search}»`, `No blocks match "${search}"`)}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
