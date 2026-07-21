import { describe, expect, it } from 'vitest';
import {
  EMPTY_CANVAS_DURATION,
  EMPTY_CANVAS_REDUCED_MOTION_FRAME,
  getEmptyCanvasTimeline,
} from '../emptyCanvasMotion';

describe('empty canvas Remotion timeline', () => {
  it('stages the map stack, unfold, emblem, and fold before the loop fade', () => {
    expect(getEmptyCanvasTimeline(0).cycleOpacity).toBe(0);
    expect(getEmptyCanvasTimeline(24).stackArrival).toBe(1);
    expect(getEmptyCanvasTimeline(44).mapOpen).toBe(1);
    expect(getEmptyCanvasTimeline(57).emblemReveal).toBe(1);
    expect(getEmptyCanvasTimeline(106).mapOpen).toBe(0);
    expect(getEmptyCanvasTimeline(EMPTY_CANVAS_DURATION - 1).cycleOpacity).toBe(0);
  });

  it('uses a fully resolved frame for reduced motion', () => {
    const state = getEmptyCanvasTimeline(EMPTY_CANVAS_REDUCED_MOTION_FRAME);
    expect(state.mapOpen).toBeGreaterThan(0.75);
    expect(state.emblemReveal).toBeGreaterThan(0.6);
    expect(state.cycleOpacity).toBe(1);
  });
});
