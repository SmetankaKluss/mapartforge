import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

type PanelPosition = { x: number; y: number };

/**
 * Shared drag behaviour for non-modal editor panels. Pointer moves only update
 * the panel DOM once per animation frame; React receives the final position
 * after release, so a large picker or text form never re-renders mid-drag.
 */
export function useDraggablePanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<PanelPosition | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const applyPosition = useCallback((next: PanelPosition) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.classList.add('is-dragged');
    panel.style.position = 'fixed';
    panel.style.left = `${next.x}px`;
    panel.style.top = `${next.y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.transform = 'none';
    panel.style.setProperty('--panel-drag-left', `${next.x}px`);
    panel.style.setProperty('--panel-drag-top', `${next.y}px`);
  }, []);

  useEffect(() => () => {
    cleanupRef.current?.();
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    document.body.classList.remove('editor-panel-dragging');
  }, []);

  const onDragHandlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button, input, select, textarea, label, a')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    cleanupRef.current?.();

    const maxLeft = Math.max(8, window.innerWidth - Math.min(rect.width, window.innerWidth - 16));
    const maxTop = Math.max(8, window.innerHeight - Math.min(rect.height, window.innerHeight - 16));
    const start = { clientX: event.clientX, clientY: event.clientY, left: rect.left, top: rect.top };
    let didMove = false;
    document.body.classList.add('editor-panel-dragging');

    const flush = () => {
      frameRef.current = null;
      const next = pendingPositionRef.current;
      if (next) applyPosition(next);
    };
    const schedule = (next: PanelPosition) => {
      pendingPositionRef.current = next;
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
    };
    const onMove = (moveEvent: PointerEvent) => {
      const x = Math.max(8, Math.min(maxLeft, start.left + moveEvent.clientX - start.clientX));
      const y = Math.max(8, Math.min(maxTop, start.top + moveEvent.clientY - start.clientY));
      didMove ||= x !== start.left || y !== start.top;
      if (didMove) schedule({ x, y });
    };
    const cleanup = () => {
      document.body.classList.remove('editor-panel-dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      cleanupRef.current = null;
    };
    const onUp = () => {
      const finalPosition = pendingPositionRef.current;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (didMove && finalPosition) {
        applyPosition(finalPosition);
        setPosition(finalPosition);
      }
      pendingPositionRef.current = null;
      cleanup();
    };

    cleanupRef.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
  }, [applyPosition]);

  const draggedStyle: CSSProperties | undefined = position
    ? {
      position: 'fixed',
      left: position.x,
      top: position.y,
      right: 'auto',
      bottom: 'auto',
      transform: 'none',
      '--panel-drag-left': `${position.x}px`,
      '--panel-drag-top': `${position.y}px`,
    } as CSSProperties
    : undefined;

  return { panelRef, draggedStyle, isDragged: position !== null, onDragHandlePointerDown };
}
