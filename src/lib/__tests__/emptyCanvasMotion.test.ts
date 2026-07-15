import { describe, expect, it } from 'vitest';
import {
  EMPTY_CANVAS_DURATION,
  EMPTY_CANVAS_REDUCED_MOTION_FRAME,
  getEmptyCanvasTimeline,
} from '../emptyCanvasMotion';

describe('empty canvas Remotion timeline', () => {
  it('stages the source, map sheet, pixel reveal, and loop fade in order', () => {
    expect(getEmptyCanvasTimeline(0).cycleOpacity).toBeCloseTo(0.18);
    expect(getEmptyCanvasTimeline(34).sourceArrival).toBe(1);
    expect(getEmptyCanvasTimeline(52).mapArrival).toBe(1);
    expect(getEmptyCanvasTimeline(148).pixelReveal).toBe(1);
    expect(getEmptyCanvasTimeline(EMPTY_CANVAS_DURATION - 1).cycleOpacity).toBe(0);
  });

  it('uses a fully assembled frame for reduced motion', () => {
    const state = getEmptyCanvasTimeline(EMPTY_CANVAS_REDUCED_MOTION_FRAME);
    expect(state.pixelReveal).toBe(1);
    expect(state.cycleOpacity).toBe(1);
  });
});
