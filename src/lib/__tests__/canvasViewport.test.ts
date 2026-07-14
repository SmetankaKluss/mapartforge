import { describe, expect, it } from 'vitest';
import {
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  canvasZoomFromWheel,
  canvasZoomToSlider,
  sliderToCanvasZoom,
} from '../canvasViewport';

describe('canvas viewport zoom', () => {
  it('maps the exponential slider endpoints and midpoint', () => {
    expect(sliderToCanvasZoom(0)).toBe(MIN_CANVAS_ZOOM);
    expect(sliderToCanvasZoom(50)).toBe(200);
    expect(sliderToCanvasZoom(100)).toBe(MAX_CANVAS_ZOOM);
  });

  it('round-trips representative zoom values', () => {
    for (const zoom of [50, 75, 100, 200, 400, 800]) {
      expect(sliderToCanvasZoom(canvasZoomToSlider(zoom))).toBeCloseTo(zoom, 1);
    }
  });

  it('zooms continuously in the wheel direction and clamps the range', () => {
    expect(canvasZoomFromWheel(100, -10, 0)).toBeGreaterThan(100);
    expect(canvasZoomFromWheel(100, 10, 0)).toBeLessThan(100);
    expect(canvasZoomFromWheel(MAX_CANVAS_ZOOM, -120, 0)).toBe(MAX_CANVAS_ZOOM);
    expect(canvasZoomFromWheel(MIN_CANVAS_ZOOM, 120, 0)).toBe(MIN_CANVAS_ZOOM);
  });
});
