import { useEffect, useRef } from 'react';
import { drawImageData } from './MapCanvas';

interface PanelProps {
  label: string;
  imageData: ImageData | null;
  width: number;
  height: number;
  scale: number;
  showGrid: boolean;
}

function ComparePanel({ label, imageData, width, height, scale, showGrid }: PanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageData) return;
    drawImageData(canvas, imageData, width, height, scale, showGrid);
  }, [imageData, width, height, scale, showGrid]);

  return (
    <div className="compare-panel">
      <div className="compare-panel-label">{label}</div>
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} className="map-canvas" />
      </div>
    </div>
  );
}

interface CompareViewProps {
  leftData:  ImageData | null;
  rightData: ImageData | null;
  leftLabel:  string;
  rightLabel: string;
  width:  number;
  height: number;
  scale:  number;
  showGrid: boolean;
}

export function CompareView({
  leftData, rightData, leftLabel, rightLabel,
  width, height, scale, showGrid,
}: CompareViewProps) {
  if (!leftData && !rightData) {
    return (
      <div className="canvas-placeholder">
        <span>Preview will appear here</span>
      </div>
    );
  }

  return (
    <div className="compare-layout">
      <ComparePanel label={leftLabel}  imageData={leftData}  width={width} height={height} scale={scale} showGrid={showGrid} />
      <ComparePanel label={rightLabel} imageData={rightData} width={width} height={height} scale={scale} showGrid={showGrid} />
    </div>
  );
}
