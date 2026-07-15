export const MIN_CANVAS_ZOOM = 50;
export const MAX_CANVAS_ZOOM = 800;
export const CANVAS_PAN_THRESHOLD = 3;

const ZOOM_RANGE = MAX_CANVAS_ZOOM / MIN_CANVAS_ZOOM;

export function clampCanvasZoom(value: number): number {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, value));
}

/** Exponential slider mapping keeps the useful low-zoom range precise. */
export function sliderToCanvasZoom(sliderValue: number): number {
  const normalized = Math.min(100, Math.max(0, sliderValue)) / 100;
  const zoom = MIN_CANVAS_ZOOM * Math.pow(ZOOM_RANGE, normalized);
  return Math.round(zoom * 10) / 10;
}

export function canvasZoomToSlider(zoom: number): number {
  const clamped = clampCanvasZoom(zoom);
  return Math.log(clamped / MIN_CANVAS_ZOOM) / Math.log(ZOOM_RANGE) * 100;
}

/** Keep a click a click until the pointer has moved far enough to be a pan. */
export function hasCanvasPanStarted(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
): boolean {
  return Math.hypot(clientX - startX, clientY - startY) >= CANVAS_PAN_THRESHOLD;
}

export function canStartCanvasPan(
  activeToolSelected: boolean,
  compareMode: boolean,
  forcedBySpace: boolean,
): boolean {
  return forcedBySpace || compareMode || !activeToolSelected;
}

/**
 * Convert wheel motion into a continuous multiplicative zoom step.
 * Trackpads keep their fine-grained deltas while large mouse-wheel notches are
 * capped so one event can never throw the canvas across the workspace.
 */
export function canvasZoomFromWheel(
  currentZoom: number,
  deltaY: number,
  deltaMode: number,
  viewportHeight = 800,
): number {
  if (deltaY === 0) return clampCanvasZoom(currentZoom);

  const pixels = deltaMode === 1
    ? deltaY * 16
    : deltaMode === 2
      ? deltaY * viewportHeight
      : deltaY;
  const boundedPixels = Math.min(120, Math.max(-120, pixels));
  const next = currentZoom * Math.exp(-boundedPixels * 0.0015);
  return Math.round(clampCanvasZoom(next) * 10) / 10;
}
