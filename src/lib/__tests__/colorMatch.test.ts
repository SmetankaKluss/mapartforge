import { describe, it, expect } from 'vitest';
import { colorCoords, colorCoordsInto } from '../colorMatch';
import { rgbToOklab } from '../oklab';

function hueChromaTone(r: number, g: number, b: number) {
  const [tone, a, bb] = colorCoords(r, g, b, 'hct');
  let hue = (Math.atan2(bb, a) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return { hue, chroma: Math.hypot(a, bb), tone };
}

describe('colorMatch', () => {
  it('rgb mode returns raw channels', () => {
    expect(colorCoords(10, 20, 30, 'rgb')).toEqual([10, 20, 30]);
  });

  it('oklab mode matches rgbToOklab exactly (default behaviour preserved)', () => {
    const lab = rgbToOklab(123, 201, 77);
    expect(colorCoords(123, 201, 77, 'oklab')).toEqual([lab.L, lab.a, lab.b]);
  });

  it('cielab mode matches known reference for pure red', () => {
    const [L, a, b] = colorCoords(255, 0, 0, 'cielab');
    expect(L).toBeCloseTo(53.24, 1);
    expect(a).toBeCloseTo(80.09, 1);
    expect(b).toBeCloseTo(67.20, 1);
  });

  // Reference values captured from @material/material-color-utilities Hct.fromInt.
  it('hct mode matches material-color-utilities reference', () => {
    const cases: [number, number, number, number, number, number][] = [
      // r, g, b, hue, chroma, tone
      [66, 133, 244, 265.98, 62.27, 56.55],
      [255, 0, 0, 27.41, 113.36, 53.23],
      [0, 128, 0, 142.23, 71.14, 46.23],
      [123, 201, 77, 137.24, 65.30, 73.88],
      [255, 255, 255, 209.49, 2.87, 100.0],
    ];
    for (const [r, g, b, hue, chroma, tone] of cases) {
      const got = hueChromaTone(r, g, b);
      expect(got.tone).toBeCloseTo(tone, 1);
      expect(got.chroma).toBeCloseTo(chroma, 0);
      // hue is undefined for achromatic white; skip when chroma tiny
      if (chroma > 5) expect(got.hue).toBeCloseTo(hue, 0);
    }
  });

  it('colorCoordsInto writes into scratch buffer', () => {
    const out = new Float64Array(3);
    colorCoordsInto(255, 0, 0, 'rgb', out);
    expect([out[0], out[1], out[2]]).toEqual([255, 0, 0]);
  });
});
