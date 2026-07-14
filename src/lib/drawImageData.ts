import { MAP_BLOCK_SIZE } from './types';

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
  const dw = width * scale;
  const dh = height * scale;
  canvas.width = Math.max(1, Math.round(dw));
  canvas.height = Math.max(1, Math.round(dh));

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

  const mapsWide = width / MAP_BLOCK_SIZE;
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
