import { describe, expect, it } from 'vitest';
import {
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  canStartCanvasPan,
  canvasPixelAtPoint,
  canvasZoomFromWheel,
  canvasZoomToSlider,
  hasCanvasPanStarted,
  sliderToCanvasZoom,
} from '../canvasViewport';

describe('canvas viewport zoom', () => {
  it('maps pointer positions through the rendered bounds at fractional zoom and CSS scaling', () => {
    for (const scale of [0.5, 1, 1.37, 2.5, 7.99]) {
      const rect = { left: 10.5, top: -3.25, width: 128 * scale, height: 256 * scale };
      expect(canvasPixelAtPoint(rect.left + 42.5 * scale, rect.top + 160.5 * scale, rect, 128, 256))
        .toEqual({ px: 42, py: 160 });
      expect(canvasPixelAtPoint(rect.left + rect.width, rect.top, rect, 128, 256)).toBeNull();
    }
  });

  it('does not select a pixel outside or in an empty canvas', () => {
    const rect = { left: 10, top: 20, width: 256, height: 128 };
    expect(canvasPixelAtPoint(9, 21, rect, 128, 128)).toBeNull();
    expect(canvasPixelAtPoint(11, 19, rect, 128, 128)).toBeNull();
    expect(canvasPixelAtPoint(11, 21, { ...rect, width: 0 }, 128, 128)).toBeNull();
    expect(canvasPixelAtPoint(NaN, 21, rect, 128, 128)).toBeNull();
  });

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

  it('keeps a short cursor press as a click and starts panning at the drag threshold', () => {
    expect(hasCanvasPanStarted(100, 100, 102, 101)).toBe(false);
    expect(hasCanvasPanStarted(100, 100, 103, 100)).toBe(true);
    expect(hasCanvasPanStarted(100, 100, 98, 98)).toBe(false);
  });

  it('allows Space to temporarily pan while a paint tool is active', () => {
    expect(canStartCanvasPan(true, false, false)).toBe(false);
    expect(canStartCanvasPan(true, false, true)).toBe(true);
    expect(canStartCanvasPan(false, false, false)).toBe(true);
    expect(canStartCanvasPan(true, true, false)).toBe(true);
  });

});
