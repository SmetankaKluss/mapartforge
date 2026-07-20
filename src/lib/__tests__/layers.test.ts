import { beforeAll, describe, expect, it } from 'vitest';
import { createLayer, mergeLayersDown, mergeVisible } from '../layers';

class TestImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(widthOrData: number | Uint8ClampedArray, width: number, height?: number) {
    if (typeof widthOrData === 'number') {
      this.width = widthOrData;
      this.height = width;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = widthOrData;
      this.width = width;
      this.height = height ?? Math.floor(widthOrData.length / 4 / width);
    }
  }
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'ImageData', { value: TestImageData, configurable: true });
});

function pixel(r: number, g: number, b: number, a = 255): ImageData {
  return new ImageData(new Uint8ClampedArray([r, g, b, a]), 1, 1);
}

describe('layer merging', () => {
  it('bakes source opacity exactly once when merging down', () => {
    const bottom = { ...createLayer('Bottom', pixel(255, 0, 0)), opacity: 50 };
    const top = { ...createLayer('Top', pixel(0, 0, 255)), opacity: 50 };
    const [merged] = mergeLayersDown([bottom, top], top.id, 1, 1);
    expect(merged.opacity).toBe(100);
    expect(merged.isText).toBe(false);
    expect(merged.imageData?.data[3]).toBeGreaterThan(0);
  });

  it('normalizes opacity and text metadata when merging visible layers', () => {
    const bottom = { ...createLayer('Bottom', pixel(255, 0, 0)), opacity: 35, isText: true };
    const top = { ...createLayer('Top', pixel(0, 255, 0)), opacity: 80 };
    const [merged] = mergeVisible([bottom, top], 1, 1);
    expect(merged.opacity).toBe(100);
    expect(merged.isText).toBe(false);
    expect(merged.text).toBeUndefined();
  });
});
