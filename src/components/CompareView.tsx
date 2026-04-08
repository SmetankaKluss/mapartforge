import { useEffect, useRef, useState, useCallback } from 'react';
import { drawImageData } from './MapCanvas';

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
        <span style={{ position: 'relative', top: 36 }}>{'Preview will appear here'}</span>
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
