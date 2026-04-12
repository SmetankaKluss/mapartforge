import React, { useEffect, useRef } from 'react';
import { MAP_BLOCK_SIZE } from '../lib/types';

interface Props {
  imageData: ImageData | null;
  originalData: ImageData | null;
  showOriginal: boolean;
  showGrid: boolean;
  width: number;
  height: number;
  scale: number;
  overlayRef?: React.RefObject<HTMLCanvasElement | null>;
}

const PIXEL_GRID_COLOR = 'rgba(0,0,0,0.15)';
const MAP_BORDER_COLOR = 'rgba(0,0,0,0.55)';

export function drawImageData(
  canvas: HTMLCanvasElement,
  data: ImageData,
  width: number,
  height: number,
  scale: number,
  showGrid: boolean,
) {
  const ctx = canvas.getContext('2d')!;
  const dw = width  * scale;
  const dh = height * scale;
  canvas.width  = dw;
  canvas.height = dh;

  const tmp = new OffscreenCanvas(width, height);
  tmp.getContext('2d')!.putImageData(data, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, dw, dh);

  if (!showGrid) return;

  ctx.strokeStyle = PIXEL_GRID_COLOR;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= width; x++) {
    ctx.beginPath(); ctx.moveTo(x * scale, 0); ctx.lineTo(x * scale, dh); ctx.stroke();
  }
  for (let y = 0; y <= height; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * scale); ctx.lineTo(dw, y * scale); ctx.stroke();
  }

  const mapsWide = width  / MAP_BLOCK_SIZE;
  const mapsTall = height / MAP_BLOCK_SIZE;
  if (mapsWide > 1 || mapsTall > 1) {
    ctx.strokeStyle = MAP_BORDER_COLOR;
    ctx.lineWidth = 1.5;
    for (let mx = 1; mx < mapsWide; mx++) {
      const px = mx * MAP_BLOCK_SIZE * scale;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, dh); ctx.stroke();
    }
    for (let my = 1; my < mapsTall; my++) {
      const py = my * MAP_BLOCK_SIZE * scale;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(dw, py); ctx.stroke();
    }
  }
}

export function MapCanvas({
  imageData, originalData, showOriginal, showGrid,
  width, height, scale, overlayRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeData = showOriginal ? originalData : imageData;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeData) return;
    drawImageData(canvas, activeData, width, height, scale, showGrid && !showOriginal);
  }, [activeData, width, height, scale, showOriginal, showGrid]);

  if (!imageData && !originalData) {
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
        <p className="ph-title">Перетащи изображение сюда</p>
        <p className="ph-hint">или нажми для выбора файла · Ctrl+V</p>
      </div>
    );
  }

  return (
    <div className="canvas-wrapper" style={{ position: 'relative' }}>
      <canvas ref={canvasRef} className="map-canvas" />
      {overlayRef && (
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        />
      )}
    </div>
  );
}
