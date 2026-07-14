import type { DitheringMode } from './dithering';
import type { MapGrid } from './types';

export interface ShowcaseOptions {
  originalImage: HTMLImageElement | null;
  processed: ImageData;
  mapGrid: MapGrid;
  mapMode: '2d' | '3d';
  dithering: DitheringMode;
  colors: number;
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceW: number,
  sourceH: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.min(w / sourceW, h / sourceH);
  const dw = sourceW * scale;
  const dh = sourceH * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(source, dx, dy, dw, dh);
}

function makeImageDataCanvas(data: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return canvas;
}

function labelForDithering(mode: DitheringMode): string {
  return {
    none: 'None',
    'floyd-steinberg': 'Floyd-Steinberg',
    stucki: 'Stucki',
    jjn: 'JJN',
    atkinson: 'Atkinson',
    'blue-noise': 'Blue Noise',
    yliluoma2: 'Yliluoma #2',
    kluss: 'KlussDither',
  }[mode];
}

export async function generateShowcaseImage(options: ShowcaseOptions): Promise<Blob> {
  const out = document.createElement('canvas');
  out.width = 1600;
  out.height = 900;
  const ctx = out.getContext('2d')!;

  const panelY = 92;
  const panelH = 610;
  const gap = 36;
  const panelW = (out.width - 96 * 2 - gap) / 2;
  const leftX = 96;
  const rightX = leftX + panelW + gap;
  const processedCanvas = makeImageDataCanvas(options.processed);

  const bg = ctx.createLinearGradient(0, 0, out.width, out.height);
  bg.addColorStop(0, '#101014');
  bg.addColorStop(0.55, '#17171c');
  bg.addColorStop(1, '#0b0b0f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);

  ctx.fillStyle = 'rgba(87,255,110,0.04)';
  for (let x = -40; x < out.width; x += 40) ctx.fillRect(x, 0, 1, out.height);
  for (let y = -20; y < out.height; y += 40) ctx.fillRect(0, y, out.width, 1);

  ctx.font = '700 42px Tektur, sans-serif';
  ctx.fillStyle = '#57ff6e';
  ctx.fillText('MAPKLUSS', 96, 56);
  ctx.font = '22px JetBrains Mono, monospace';
  ctx.fillStyle = 'rgba(219,210,188,0.72)';
  ctx.fillText('Minecraft Map Art Generator', 355, 55);

  const drawPanel = (x: number, title: string) => {
    ctx.fillStyle = '#0d0d12';
    ctx.fillRect(x, panelY, panelW, panelH);
    ctx.strokeStyle = 'rgba(87,255,110,0.32)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, panelY, panelW, panelH);
    ctx.fillStyle = 'rgba(87,255,110,0.12)';
    ctx.fillRect(x, panelY, panelW, 46);
    ctx.font = '700 21px Tektur, sans-serif';
    ctx.fillStyle = '#dbd2bc';
    ctx.fillText(title, x + 22, panelY + 31);
  };

  drawPanel(leftX, options.originalImage ? 'ORIGINAL IMAGE' : 'MAPKLUSS PREVIEW');
  drawPanel(rightX, 'MINECRAFT MAP ART PREVIEW');

  ctx.imageSmoothingEnabled = false;
  if (options.originalImage) {
    drawContain(ctx, options.originalImage, options.originalImage.naturalWidth, options.originalImage.naturalHeight, leftX + 22, panelY + 68, panelW - 44, panelH - 92);
  } else {
    drawContain(ctx, processedCanvas, processedCanvas.width, processedCanvas.height, leftX + 22, panelY + 68, panelW - 44, panelH - 92);
  }
  drawContain(ctx, processedCanvas, processedCanvas.width, processedCanvas.height, rightX + 22, panelY + 68, panelW - 44, panelH - 92);

  ctx.fillStyle = '#17171c';
  ctx.fillRect(96, 738, out.width - 192, 104);
  ctx.strokeStyle = 'rgba(200,98,42,0.55)';
  ctx.strokeRect(96, 738, out.width - 192, 104);

  ctx.font = '700 25px Tektur, sans-serif';
  ctx.fillStyle = '#c8622a';
  ctx.fillText('Generated with MapKluss', 124, 778);

  const info = [
    `Mode: ${options.mapMode === '3d' ? '3D Stair' : '2D Flat'}`,
    `Size: ${options.mapGrid.wide}x${options.mapGrid.tall} maps`,
    `Colors: ${options.colors}`,
    `Dithering: ${labelForDithering(options.dithering)}`,
  ];
  ctx.font = '20px JetBrains Mono, monospace';
  ctx.fillStyle = '#dbd2bc';
  info.forEach((line, i) => ctx.fillText(line, 124 + i * 330, 817));

  ctx.font = '700 20px JetBrains Mono, monospace';
  ctx.fillStyle = 'rgba(87,255,110,0.78)';
  ctx.fillText('mapkluss.art', out.width - 250, 866);

  return new Promise((resolve, reject) => {
    out.toBlob(blob => blob ? resolve(blob) : reject(new Error('showcase export failed')), 'image/png');
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
