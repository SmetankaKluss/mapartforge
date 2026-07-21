export const EMPTY_CANVAS_FPS = 30;
export const EMPTY_CANVAS_DURATION = 114;
export const EMPTY_CANVAS_WIDTH = 640;
export const EMPTY_CANVAS_HEIGHT = 240;
export const EMPTY_CANVAS_REDUCED_MOTION_FRAME = 84;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const phase = (frame: number, start: number, end: number) => {
  if (end <= start) return frame >= end ? 1 : 0;
  return clamp01((frame - start) / (end - start));
};

export interface EmptyCanvasTimeline {
  cycleOpacity: number;
  stackArrival: number;
  mapOpen: number;
  emblemReveal: number;
  lightSweep: number;
}

export function getEmptyCanvasTimeline(frame: number): EmptyCanvasTimeline {
  const fadeIn = phase(frame, 0, 9);
  const fadeOut = 1 - phase(frame, 106, EMPTY_CANVAS_DURATION - 1);
  const mapOpen = frame < 80
    ? phase(frame, 15, 44)
    : 1 - phase(frame, 80, 106);

  return {
    cycleOpacity: Math.min(fadeIn, fadeOut),
    stackArrival: phase(frame, 1, 24),
    mapOpen,
    emblemReveal: Math.min(phase(frame, 34, 57), 1 - phase(frame, 79, 99)),
    lightSweep: phase(frame, 48, 77),
  };
}
