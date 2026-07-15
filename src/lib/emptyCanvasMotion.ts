export const EMPTY_CANVAS_FPS = 30;
export const EMPTY_CANVAS_DURATION = 210;
export const EMPTY_CANVAS_WIDTH = 960;
export const EMPTY_CANVAS_HEIGHT = 480;
export const EMPTY_CANVAS_REDUCED_MOTION_FRAME = 150;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const phase = (frame: number, start: number, end: number) => {
  if (end <= start) return frame >= end ? 1 : 0;
  return clamp01((frame - start) / (end - start));
};

export interface EmptyCanvasTimeline {
  cycleOpacity: number;
  sourceArrival: number;
  sourceTransfer: number;
  mapArrival: number;
  pixelReveal: number;
  scanProgress: number;
}

export function getEmptyCanvasTimeline(frame: number): EmptyCanvasTimeline {
  const fadeIn = 0.18 + phase(frame, 0, 12) * 0.82;
  const fadeOut = 1 - phase(frame, 190, EMPTY_CANVAS_DURATION - 1);
  const scanFrame = Math.max(0, frame - 52);

  return {
    cycleOpacity: Math.min(fadeIn, fadeOut),
    sourceArrival: phase(frame, 6, 34),
    sourceTransfer: phase(frame, 34, 82),
    mapArrival: phase(frame, 18, 52),
    pixelReveal: phase(frame, 46, 148),
    scanProgress: frame < 52 ? 0 : (scanFrame % 86) / 86,
  };
}
