import { useEffect, useRef, useState, useCallback } from 'react';
import { drawImageData } from './MapCanvas';
import { useLocale } from '../lib/locale';

interface CompareViewProps {
  leftData:  ImageData | null;
  rightData: ImageData | null;
  leftLabel:  string;
  rightLabel: string;
  width:  number;
  height: number;
  scale:  number;
  showGrid: boolean;
  splitPos: number;
  onSplitPosChange: (pos: number) => void;
}

export function CompareView({
  leftData, rightData, leftLabel, rightLabel,
  width, height, scale, showGrid, splitPos, onSplitPosChange,
}: CompareViewProps) {
  const { t } = useLocale();
  const leftRef      = useRef<HTMLCanvasElement>(null);
  const rightRef     = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onSplitPosChangeRef = useRef(onSplitPosChange);
  onSplitPosChangeRef.current = onSplitPosChange;

  useEffect(() => {
    if (!leftRef.current || !leftData) return;
    drawImageData(leftRef.current, leftData, width, height, scale, showGrid);
  }, [leftData, width, height, scale, showGrid]);

  useEffect(() => {
    if (!rightRef.current || !rightData) return;
    drawImageData(rightRef.current, rightData, width, height, scale, showGrid);
  }, [rightData, width, height, scale, showGrid]);

  // Show labels briefly on mount and when splitPos first activates
  useEffect(() => {
    setLabelsVisible(true);
    clearTimeout(labelTimerRef.current);
    labelTimerRef.current = setTimeout(() => setLabelsVisible(false), 2000);
    return () => clearTimeout(labelTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Global mouse drag ───────────────────────────────────────────────────────
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      onSplitPosChangeRef.current(pos);
    }
    function onMouseUp() { isDraggingRef.current = false; }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // ── Global touch drag ───────────────────────────────────────────────────────
  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      if (!isDraggingRef.current || !containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(100, ((e.touches[0].clientX - rect.left) / rect.width) * 100));
      onSplitPosChangeRef.current(pos);
    }
    function onTouchEnd() { isDraggingRef.current = false; }
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
  }, []);

  const handleDividerTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
  }, []);

  if (!leftData && !rightData) {
    return (
      <div className="canvas-placeholder">
        <svg className="ph-icon" width="80" height="80" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="8" height="2" fill="#57FF6E" opacity="0.5"/><rect x="0" y="0" width="2" height="8" fill="#57FF6E" opacity="0.5"/>
          <rect x="64" y="0" width="8" height="2" fill="#57FF6E" opacity="0.5"/><rect x="70" y="0" width="2" height="8" fill="#57FF6E" opacity="0.5"/>
          <rect x="0" y="70" width="8" height="2" fill="#57FF6E" opacity="0.5"/><rect x="0" y="64" width="2" height="8" fill="#57FF6E" opacity="0.5"/>
          <rect x="64" y="70" width="8" height="2" fill="#57FF6E" opacity="0.5"/><rect x="70" y="64" width="2" height="8" fill="#57FF6E" opacity="0.5"/>
          <rect x="24" y="8" width="6" height="6" fill="#57FF6E" opacity="0.6"/><rect x="30" y="8" width="6" height="6" fill="#57FF6E" opacity="0.72"/><rect x="36" y="8" width="6" height="6" fill="#57FF6E" opacity="0.6"/>
          <rect x="18" y="14" width="6" height="6" fill="#57FF6E" opacity="0.5"/><rect x="24" y="14" width="6" height="6" fill="#57FF6E" opacity="0.65"/><rect x="30" y="14" width="6" height="6" fill="#57FF6E" opacity="0.75"/><rect x="36" y="14" width="6" height="6" fill="#57FF6E" opacity="0.65"/><rect x="42" y="14" width="6" height="6" fill="#57FF6E" opacity="0.5"/>
          <rect x="24" y="20" width="6" height="6" fill="#57FF6E" opacity="0.6"/><rect x="30" y="20" width="6" height="6" fill="#57FF6E" opacity="0.7"/><rect x="36" y="20" width="6" height="6" fill="#57FF6E" opacity="0.6"/>
          <rect x="12" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/><rect x="18" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/><rect x="24" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/><rect x="30" y="26" width="6" height="6" fill="#7B4A1B" opacity="0.85"/><rect x="36" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/><rect x="42" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/><rect x="48" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/><rect x="54" y="26" width="6" height="6" fill="#57FF6E" opacity="0.4"/>
          <rect x="12" y="32" width="6" height="6" fill="#8B6040" opacity="0.5"/><rect x="18" y="32" width="6" height="6" fill="#C8922A" opacity="0.5"/><rect x="24" y="32" width="6" height="6" fill="#8B6040" opacity="0.5"/><rect x="30" y="32" width="6" height="6" fill="#8B6040" opacity="0.55"/><rect x="36" y="32" width="6" height="6" fill="#8B6040" opacity="0.5"/><rect x="42" y="32" width="6" height="6" fill="#C8922A" opacity="0.45"/><rect x="48" y="32" width="6" height="6" fill="#8B6040" opacity="0.45"/><rect x="54" y="32" width="6" height="6" fill="#8B6040" opacity="0.4"/>
          <rect x="12" y="38" width="6" height="6" fill="#555" opacity="0.32"/><rect x="18" y="38" width="6" height="6" fill="#555" opacity="0.28"/><rect x="24" y="38" width="6" height="6" fill="#555" opacity="0.32"/><rect x="30" y="38" width="6" height="6" fill="#555" opacity="0.28"/><rect x="36" y="38" width="6" height="6" fill="#555" opacity="0.32"/><rect x="42" y="38" width="6" height="6" fill="#555" opacity="0.28"/><rect x="48" y="38" width="6" height="6" fill="#555" opacity="0.32"/><rect x="54" y="38" width="6" height="6" fill="#555" opacity="0.28"/>
          <rect x="33" y="50" width="6" height="8" fill="#57FF6E" opacity="0.35"/><rect x="27" y="54" width="18" height="4" fill="#57FF6E" opacity="0.3"/><rect x="30" y="58" width="12" height="4" fill="#57FF6E" opacity="0.25"/><rect x="33" y="62" width="6" height="3" fill="#57FF6E" opacity="0.2"/>
        </svg>
        <p className="ph-title">{t('Перетащи изображение сюда', 'Drag image here')}</p>
        <p className="ph-hint">{t('или нажми для выбора файла · Ctrl+V', 'or click to select file · Ctrl+V')}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="split-canvas-container">
      {/* Bottom: left dithering (full width) */}
      <canvas ref={leftRef} className="map-canvas" />

      {/* Top: right dithering, clipped to right side of divider */}
      {rightData && (
        <div
          className="split-original-layer"
          style={{ clipPath: `inset(0 0 0 ${splitPos}%)` }}
        >
          <canvas ref={rightRef} className="map-canvas" />
        </div>
      )}

      {/* Draggable divider */}
      <div
        className="split-divider"
        style={{ left: `${splitPos}%` }}
        onMouseDown={handleDividerMouseDown}
        onTouchStart={handleDividerTouchStart}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="split-handle"
          onMouseDown={handleDividerMouseDown}
          onClick={e => e.stopPropagation()}
        >◀▶</div>
      </div>

      {/* Labels */}
      <span className={`split-label split-label-left${labelsVisible ? ' visible' : ''}`}>{leftLabel}</span>
      <span className={`split-label split-label-right${labelsVisible ? ' visible' : ''}`}>{rightLabel}</span>
    </div>
  );
}
