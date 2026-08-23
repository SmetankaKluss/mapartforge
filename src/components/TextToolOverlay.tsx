import { useEffect, useMemo, useRef } from 'react';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';
import { BlockIcon } from './BlockIcon';
import { TEXT_FONTS, ensureTextFont, getTextLayout, textLocalVector, type TextLayerMeta } from '../lib/textRender';
import { useLocale } from '../lib/useLocale';
import { useDraggablePanel } from './useDraggablePanel';

type TransformKind = 'move' | 'scale' | 'rotate';

export interface TextPaletteBlock {
  csId: number;
  blockId: number;
  nbtName: string;
  displayName: string;
  r: number;
  g: number;
  b: number;
}

interface Props {
  canvasRect: DOMRect | null;
  viewScale: number;
  meta: TextLayerMeta | null;
  isNew: boolean;
  onBeginEdit: () => void;
  onChange: (meta: TextLayerMeta) => void;
  onTransformPreview?: (meta: TextLayerMeta) => void;
  fillPaletteBlock?: TextPaletteBlock | null;
  strokePaletteBlock?: TextPaletteBlock | null;
  onPlace: () => void;
  onCancel: () => void;
}

type DragState = {
  kind: TransformKind;
  start: TextLayerMeta;
  startClientX: number;
  startClientY: number;
  layout: ReturnType<typeof getTextLayout>;
};

const number = (value: string, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

function PaletteBlockHint({ block, label }: { block: TextPaletteBlock | null | undefined; label: string }) {
  if (!block) return null;
  return (
    <span className="text-tool-palette-match" title={block.displayName}>
      <span className="text-tool-palette-label">{label}</span>
      <span className="text-tool-palette-icon-wrap" aria-hidden="true">
        <BlockIcon
          nbtName={block.nbtName}
          blockId={block.blockId}
          csId={block.csId}
          r={block.r}
          g={block.g}
          b={block.b}
          className="text-tool-palette-icon"
        />
      </span>
      <span className="text-tool-palette-name">{block.displayName}</span>
    </span>
  );
}

export function TextToolOverlay({ canvasRect, viewScale, meta, isNew, onBeginEdit, onChange, onTransformPreview, fillPaletteBlock, strokePaletteBlock, onPlace, onCancel }: Props) {
  const { t } = useLocale();
  const dragRef = useRef<DragState | null>(null);
  const transformFrameRef = useRef<number | null>(null);
  const pendingTransformRef = useRef<TextLayerMeta | null>(null);
  const inputSessionRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transformBoxRef = useRef<HTMLDivElement>(null);
  const { panelRef, draggedStyle, isDragged, onDragHandlePointerDown } = useDraggablePanel();
  const layout = useMemo(() => meta ? getTextLayout(meta) : null, [meta]);
  const onChangeRef = useRef(onChange);
  const onTransformPreviewRef = useRef(onTransformPreview);
  const metaRef = useRef(meta);
  const activeFont = meta?.font;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onTransformPreviewRef.current = onTransformPreview;
  }, [onTransformPreview]);

  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  useEffect(() => {
    if (!activeFont) return;
    let active = true;
    void ensureTextFont(activeFont).then(loaded => {
      const current = metaRef.current;
      if (active && loaded && current?.font === activeFont) onChangeRef.current(current);
    });
    return () => { active = false; };
  }, [activeFont]);

  useEffect(() => {
    if (isNew) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [isNew]);

  useEffect(() => {
    const previewTransform = (next: TextLayerMeta) => {
      const drag = dragRef.current;
      const box = transformBoxRef.current;
      if (drag && box && canvasRect) {
        box.style.left = `${canvasRect.left + next.x * viewScale}px`;
        box.style.top = `${canvasRect.top + next.y * viewScale}px`;
        box.style.width = `${Math.max(12, drag.layout.width * next.scaleX * viewScale)}px`;
        box.style.height = `${Math.max(12, drag.layout.height * next.scaleY * viewScale)}px`;
        box.style.transform = `translate(-50%, -50%) rotate(${next.rotation}deg)`;
      }
      onTransformPreviewRef.current?.(next);
    };
    const scheduleTransform = (next: TextLayerMeta) => {
      pendingTransformRef.current = next;
      if (transformFrameRef.current !== null) return;
      transformFrameRef.current = requestAnimationFrame(() => {
        transformFrameRef.current = null;
        const pending = pendingTransformRef.current;
        if (pending) previewTransform(pending);
      });
    };
    function move(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || !canvasRect) return;
      const deltaX = (event.clientX - drag.startClientX) / viewScale;
      const deltaY = (event.clientY - drag.startClientY) / viewScale;
      if (drag.kind === 'move') {
        scheduleTransform({ ...drag.start, x: drag.start.x + deltaX, y: drag.start.y + deltaY });
        return;
      }
      if (drag.kind === 'rotate') {
        const centerX = canvasRect.left + drag.start.x * viewScale;
        const centerY = canvasRect.top + drag.start.y * viewScale;
        const degrees = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI + 90;
        scheduleTransform({ ...drag.start, rotation: (degrees + 360) % 360 });
        return;
      }
      const centerX = canvasRect.left + drag.start.x * viewScale;
      const centerY = canvasRect.top + drag.start.y * viewScale;
      const local = textLocalVector((event.clientX - centerX) / viewScale, (event.clientY - centerY) / viewScale, drag.start.rotation);
      const nextX = Math.max(0.08, Math.min(64, Math.abs(local.x) / Math.max(1, drag.layout.width / 2)));
      const nextY = Math.max(0.08, Math.min(64, Math.abs(local.y) / Math.max(1, drag.layout.height / 2)));
      if (event.shiftKey) {
        const uniform = Math.max(nextX, nextY);
        scheduleTransform({ ...drag.start, scaleX: uniform, scaleY: uniform });
      } else {
        scheduleTransform({ ...drag.start, scaleX: nextX, scaleY: nextY });
      }
    }
    function end() {
      const pending = pendingTransformRef.current;
      if (transformFrameRef.current !== null) {
        cancelAnimationFrame(transformFrameRef.current);
        transformFrameRef.current = null;
      }
      if (pending) onChangeRef.current(pending);
      pendingTransformRef.current = null;
      dragRef.current = null;
      document.body.classList.remove('text-transforming');
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      if (transformFrameRef.current !== null) cancelAnimationFrame(transformFrameRef.current);
      pendingTransformRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [canvasRect, viewScale]);

  if (!meta || !canvasRect || !layout) return null;

  const beginFieldEdit = () => {
    if (inputSessionRef.current) return;
    inputSessionRef.current = true;
    onBeginEdit();
  };
  const finishFieldEdit = () => { inputSessionRef.current = false; };
  const change = (patch: Partial<TextLayerMeta>) => {
    beginFieldEdit();
    onChange({ ...meta, ...patch });
  };
  const beginTransform = (event: React.PointerEvent, kind: TransformKind) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onBeginEdit();
    inputSessionRef.current = false;
    dragRef.current = {
      kind,
      start: meta,
      startClientX: event.clientX,
      startClientY: event.clientY,
      layout,
    };
    document.body.classList.add('text-transforming');
  };

  const centerLeft = canvasRect.left + meta.x * viewScale;
  const centerTop = canvasRect.top + meta.y * viewScale;
  const boxWidth = Math.max(12, layout.width * meta.scaleX * viewScale);
  const boxHeight = Math.max(12, layout.height * meta.scaleY * viewScale);
  const panelTop = Math.max(8, Math.min(window.innerHeight - 236, canvasRect.top + 10));
  const panelLeft = Math.max(8, Math.min(window.innerWidth - 340, canvasRect.left + 12));

  return (
    <>
      <div
        ref={transformBoxRef}
        className="text-transform-box"
        style={{ left: centerLeft, top: centerTop, width: boxWidth, height: boxHeight, transform: `translate(-50%, -50%) rotate(${meta.rotation}deg)` }}
        onPointerDown={event => beginTransform(event, 'move')}
        onMouseDown={event => event.stopPropagation()}
        aria-label={t('Текстовый слой. Перетащи для перемещения.', 'Text layer. Drag to move.')}
      >
        <button className="text-transform-handle text-transform-handle--nw" onPointerDown={event => beginTransform(event, 'scale')} aria-label={t('Изменить размер текста', 'Resize text')} />
        <button className="text-transform-handle text-transform-handle--ne" onPointerDown={event => beginTransform(event, 'scale')} aria-label={t('Изменить размер текста', 'Resize text')} />
        <button className="text-transform-handle text-transform-handle--sw" onPointerDown={event => beginTransform(event, 'scale')} aria-label={t('Изменить размер текста', 'Resize text')} />
        <button className="text-transform-handle text-transform-handle--se" onPointerDown={event => beginTransform(event, 'scale')} aria-label={t('Изменить размер текста', 'Resize text')} />
        <button className="text-transform-rotate" onPointerDown={event => beginTransform(event, 'rotate')} aria-label={t('Повернуть текст', 'Rotate text')}>
          <IconGlyph icon={mkIcons.reset} size={14} />
        </button>
      </div>

      <section
        ref={panelRef}
        className={`text-tool-panel${isDragged ? ' is-dragged' : ''}`}
        style={draggedStyle ?? { left: panelLeft, top: panelTop }}
        onPointerDown={event => event.stopPropagation()}
        onMouseDown={event => event.stopPropagation()}
        aria-label={t('Параметры текста', 'Text settings')}
      >
        <div className="text-tool-panel-head" onPointerDown={onDragHandlePointerDown}>
          <span>{isNew ? t('Новый текст', 'New text') : t('Текст', 'Text')}</span>
          <span className="text-tool-panel-hint">{t('Shift: пропорции', 'Shift: keep proportions')}</span>
        </div>
        <textarea
          ref={textareaRef}
          className="text-tool-value"
          value={meta.value}
          onFocus={beginFieldEdit}
          onBlur={finishFieldEdit}
          onChange={event => change({ value: event.target.value.slice(0, 2_000) })}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); onPlace(); }
          }}
          placeholder={t('Введите текст', 'Type text')}
          spellCheck={false}
          aria-label={t('Текст', 'Text')}
        />
        <div className="text-tool-grid">
          <label>
            <span>{t('Шрифт', 'Font')}</span>
            <select value={meta.font} onFocus={beginFieldEdit} onBlur={finishFieldEdit} onChange={event => change({ font: event.target.value })}>
              {TEXT_FONTS.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}
            </select>
          </label>
          <label>
            <span>{t('Размер', 'Size')}</span>
            <input type="number" min="4" max="1024" value={Math.round(meta.size)} onFocus={beginFieldEdit} onBlur={finishFieldEdit} onChange={event => change({ size: number(event.target.value, meta.size, 4, 1024) })} />
          </label>
          <label className="text-tool-color">
            <span>{t('Цвет', 'Color')}</span>
            <input type="color" value={meta.fillColor} onPointerDown={beginFieldEdit} onChange={event => change({ fillColor: event.target.value })} aria-label={t('Цвет текста', 'Text color')} />
            <PaletteBlockHint block={fillPaletteBlock} label={t('Блок', 'Block')} />
          </label>
          <label className="text-tool-color">
            <span>{t('Контур', 'Outline')}</span>
            <input type="color" value={meta.strokeColor} onPointerDown={beginFieldEdit} onChange={event => change({ strokeColor: event.target.value })} aria-label={t('Цвет контура', 'Outline color')} />
            <PaletteBlockHint block={strokePaletteBlock} label={t('Блок', 'Block')} />
          </label>
          <label>
            <span>{t('Толщина', 'Width')}</span>
            <input type="number" min="0" max="64" value={meta.strokeWidth} onFocus={beginFieldEdit} onBlur={finishFieldEdit} onChange={event => change({ strokeWidth: number(event.target.value, meta.strokeWidth, 0, 64) })} />
          </label>
          <label>
            <span>{t('Интервал', 'Tracking')}</span>
            <input type="number" min="-8" max="80" value={meta.letterSpacing} onFocus={beginFieldEdit} onBlur={finishFieldEdit} onChange={event => change({ letterSpacing: number(event.target.value, meta.letterSpacing, -8, 80) })} />
          </label>
        </div>
        <div className="text-tool-actions">
          <div className="text-tool-toggle-row" role="group" aria-label={t('Стиль текста', 'Text style')}>
            <button className={meta.bold ? 'active' : ''} onPointerDown={beginFieldEdit} onClick={() => change({ bold: !meta.bold })} aria-pressed={meta.bold}><strong>B</strong></button>
            <button className={meta.italic ? 'active' : ''} onPointerDown={beginFieldEdit} onClick={() => change({ italic: !meta.italic })} aria-pressed={meta.italic}><em>I</em></button>
            <button className={meta.underline ? 'active' : ''} onPointerDown={beginFieldEdit} onClick={() => change({ underline: !meta.underline })} aria-pressed={meta.underline}><span className="text-tool-underline">U</span></button>
            <button className={meta.align === 'left' ? 'active' : ''} onPointerDown={beginFieldEdit} onClick={() => change({ align: 'left' })} aria-label={t('По левому краю', 'Align left')}><IconGlyph icon={mkIcons.alignLeft} /></button>
            <button className={meta.align === 'center' ? 'active' : ''} onPointerDown={beginFieldEdit} onClick={() => change({ align: 'center' })} aria-label={t('По центру', 'Align center')}><IconGlyph icon={mkIcons.alignCenter} /></button>
            <button className={meta.align === 'right' ? 'active' : ''} onPointerDown={beginFieldEdit} onClick={() => change({ align: 'right' })} aria-label={t('По правому краю', 'Align right')}><IconGlyph icon={mkIcons.alignRight} /></button>
          </div>
          <label className="text-tool-smooth"><input type="checkbox" checked={meta.smooth} onChange={event => change({ smooth: event.target.checked })} /> {t('Плавный край', 'Smooth edge')}</label>
          <button className="text-tool-place" onClick={onPlace} disabled={!meta.value.trim()}>{isNew ? t('Разместить', 'Place') : t('Готово', 'Done')}</button>
          <button className="text-tool-cancel" onClick={onCancel} aria-label={t('Закрыть текст', 'Close text')}><IconGlyph icon={mkIcons.close} /></button>
        </div>
      </section>
    </>
  );
}
