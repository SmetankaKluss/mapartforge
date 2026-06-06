import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseSceneLitematicNbt } from '../sceneLitematic';

describe('parseSceneLitematicNbt', () => {
  it('extracts gallery blocks and frame anchor from the litematic', () => {
    const raw = readFileSync(new URL('../../../public/scene/gallery-wall.litematic', import.meta.url));
    const asset = parseSceneLitematicNbt(gunzipSync(raw));

    expect(asset.size).toEqual({ x: 9, y: 8, z: 19 });
    expect(asset.blocks).toHaveLength(570);
    expect(asset.frame.facing).toBe('west');
    expect(asset.frame.maxWide).toBe(3);
    expect(asset.frame.maxTall).toBe(4);
    expect(asset.frame.center[0]).toBeCloseTo(0.46875, 5);
    expect(asset.frame.center[1]).toBeCloseTo(2.5, 5);
    expect(asset.frame.center[2]).toBeCloseTo(0, 5);
  });
});
