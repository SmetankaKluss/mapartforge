import React, { useEffect, useRef } from 'react';
import { drawImageData } from '../lib/drawImageData';
import { EmptyCanvasState } from './EmptyCanvasState';

interface Props {
  imageData: ImageData | null;
  originalData: ImageData | null;
  showOriginal: boolean;
  showGrid: boolean;
  width: number;
  height: number;
  scale: number;
  viewScale?: number;
  overlayRef?: React.RefObject<HTMLCanvasElement | null>;
}

export function MapCanvas({
  imageData, originalData, showOriginal, showGrid,
  width, height, scale, viewScale = scale, overlayRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeData = showOriginal ? originalData : imageData;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeData) return;
    drawImageData(canvas, activeData, width, height, scale, showGrid && !showOriginal);
  }, [activeData, width, height, scale, showOriginal, showGrid]);

  if (!imageData && !originalData) {
    return <EmptyCanvasState />;
  }

  return (
    <div className="canvas-wrapper" style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        className="map-canvas"
        style={{ width: width * viewScale, height: height * viewScale }}
      />
      {overlayRef && (
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      )}
    </div>
  );
}
