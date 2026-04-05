export type SelectionMask = Uint8Array; // length = w*h, 1=selected 0=not

export function selectAllMask(w: number, h: number): SelectionMask {
  return new Uint8Array(w * h).fill(1);
}

export function maskFromRect(x0: number, y0: number, x1: number, y1: number, w: number, h: number): SelectionMask {
  const mask = new Uint8Array(w * h);
  const minX = Math.max(0, Math.min(x0, x1));
  const maxX = Math.min(w - 1, Math.max(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxY = Math.min(h - 1, Math.max(y0, y1));
  for (let py = minY; py <= maxY; py++)
    for (let px = minX; px <= maxX; px++)
      mask[py * w + px] = 1;
  return mask;
}

export function maskFromPolygon(points: { x: number; y: number }[], w: number, h: number): SelectionMask {
  // Ray-casting point-in-polygon for each pixel
  const mask = new Uint8Array(w * h);
  if (points.length < 3) return mask;
  const n = points.length;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      // test center of pixel (px+0.5, py+0.5)
      const cx = px + 0.5, cy = py + 0.5;
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = points[i].x, yi = points[i].y;
        const xj = points[j].x, yj = points[j].y;
        if ((yi > cy) !== (yj > cy) && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi)
          inside = !inside;
      }
      if (inside) mask[py * w + px] = 1;
    }
  }
  return mask;
}

export function maskFromFloodFill(
  imageData: ImageData,
  startX: number, startY: number,
  colorLookup: Map<number, { baseId: number; shade: number }>,
  w: number, h: number,
): SelectionMask {
  const mask = new Uint8Array(w * h);
  const data = imageData.data;
  const startFlat = startY * w + startX;
  const startBI = startFlat * 4;
  const startAlpha = data[startBI + 3];
  const startKey = startAlpha >= 128
    ? (data[startBI] << 16) | (data[startBI + 1] << 8) | data[startBI + 2]
    : -1;
  const startInfo = startKey >= 0 ? colorLookup.get(startKey) : undefined;

  const visited = new Uint8Array(w * h);
  const stack = [startFlat];
  while (stack.length > 0) {
    const flat = stack.pop()!;
    if (visited[flat]) continue;
    visited[flat] = 1;
    const bx = flat % w, by = (flat / w) | 0;
    const bi = flat * 4;
    const alpha = data[bi + 3];
    let matches = false;
    if (startAlpha < 128 && alpha < 128) {
      matches = true;
    } else if (startAlpha >= 128 && alpha >= 128) {
      const key = (data[bi] << 16) | (data[bi + 1] << 8) | data[bi + 2];
      const info = colorLookup.get(key);
      matches = startInfo
        ? info?.baseId === startInfo.baseId && info?.shade === startInfo.shade
        : !info;
    }
    if (!matches) continue;
    mask[flat] = 1;
    if (bx > 0)     stack.push(flat - 1);
    if (bx < w - 1) stack.push(flat + 1);
    if (by > 0)     stack.push(flat - w);
    if (by < h - 1) stack.push(flat + w);
  }
  return mask;
}

export function invertMask(mask: SelectionMask, w: number, h: number): SelectionMask {
  const result = new Uint8Array(w * h);
  for (let i = 0; i < result.length; i++) result[i] = mask[i] ? 0 : 1;
  return result;
}

export function unionMask(a: SelectionMask, b: SelectionMask): SelectionMask {
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) result[i] = (a[i] || b[i]) ? 1 : 0;
  return result;
}

export function subtractMask(base: SelectionMask, sub: SelectionMask): SelectionMask {
  const result = new Uint8Array(base.length);
  for (let i = 0; i < base.length; i++) result[i] = base[i] && !sub[i] ? 1 : 0;
  return result;
}

export function countSelected(mask: SelectionMask): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
  return n;
}

export function drawMarchingAnts(
  ctx: CanvasRenderingContext2D,
  mask: SelectionMask,
  w: number, h: number,
  scale: number,
  phase: number,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const path = new Path2D();
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px;
      if (!mask[i]) continue;
      const x = px * scale, y = py * scale, s = scale;
      if (px === 0 || !mask[i - 1])       { path.moveTo(x, y);   path.lineTo(x,   y+s); }
      if (px === w-1 || !mask[i + 1])     { path.moveTo(x+s, y); path.lineTo(x+s, y+s); }
      if (py === 0 || !mask[i - w])       { path.moveTo(x, y);   path.lineTo(x+s, y);   }
      if (py === h-1 || !mask[i + w])     { path.moveTo(x, y+s); path.lineTo(x+s, y+s); }
    }
  }
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#fff';
  ctx.lineDashOffset = -phase;
  ctx.stroke(path);
  ctx.strokeStyle = '#000';
  ctx.lineDashOffset = -phase + 4;
  ctx.stroke(path);
  ctx.restore();
}
