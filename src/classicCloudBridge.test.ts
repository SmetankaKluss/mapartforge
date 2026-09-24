import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/supabase', () => ({ initializeSupabase: vi.fn(async () => ({})) }));
vi.mock('./lib/companionCloud', () => ({
  getCurrentCompanionAuthUser: vi.fn(async () => ({ userId: 'owner', email: 'builder@example.test' })),
  saveCompanionArt: vi.fn(async () => ({ artId: 'saved-art' })),
}));
vi.mock('./lib/dithering', () => ({ buildComputedPalette: vi.fn(() => ({ colors: [{ r: 1, g: 2, b: 3 }] })) }));

beforeAll(() => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('ImageData', class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  });
});

beforeEach(() => vi.clearAllMocks());

describe('Classic Cloud bridge', () => {
  it('sends an editable v4 project through the existing authenticated save', async () => {
    const bridge = await import('./classicCloudBridge');
    const { saveCompanionArt } = await import('./lib/companionCloud');
    const { deserializeFullProject } = await import('./lib/projectFile');
    const pixels = new Uint8ClampedArray(128 * 128 * 4);
    pixels.set([23, 45, 67, 255], 0);
    const result = await bridge.saveClassicToCloud({
      title: 'Classic test',
      pixels,
      grid: { wide: 1, tall: 1 },
      colors: [{ r: 1, g: 2, b: 3, name: 'test', baseId: 1, shade: 1 }],
      blockSelection: { 0: [1] },
      mode: '2d',
      buildTechnique: 'standard',
      minecraftVersion: '1.21.4',
      supportBlock: 'stone',
      dithering: 'blue-noise',
      bnScale: 1,
      intensity: 100,
      colorMatch: 'oklab',
    });
    expect(result).toBe('saved-art');
    const input = vi.mocked(saveCompanionArt).mock.calls[0][0];
    const project = JSON.parse(input.projectJson);
    expect(project.version).toBe(4);
    expect(project.project.layers[0]).toMatchObject({ width: 128, height: 128, isDirty: true });
    expect(project.settings).toMatchObject({ buildTechnique: 'standard', blockSelection: { 0: [1] }, intensity: 100 });
    expect(input).toMatchObject({ privacy: 'private', title: 'Classic test', grid: { wide: 1, tall: 1 }, bnScale: 1 });
    expect(project.settings.bnScale).toBe(1);
    const reopened = deserializeFullProject(input.projectJson);
    expect(reopened?.grid).toEqual({ wide: 1, tall: 1 });
    expect(reopened?.layers[0].imageData?.data.slice(0, 4)).toEqual(new Uint8ClampedArray([23, 45, 67, 255]));
  });

  it('rejects oversized grids before generating Cloud artifacts', async () => {
    const bridge = await import('./classicCloudBridge');
    const { saveCompanionArt } = await import('./lib/companionCloud');
    await expect(bridge.saveClassicToCloud({
      title: 'oversized', pixels: new Uint8ClampedArray(0), grid: { wide: 16, tall: 5 },
      colors: [{ r: 1, g: 2, b: 3, name: 'test', baseId: 1, shade: 1 }],
      blockSelection: {}, mode: '2d', buildTechnique: 'standard',
      minecraftVersion: '1.21.4', supportBlock: 'stone', dithering: 'none', intensity: 0, colorMatch: 'rgb',
    })).rejects.toThrow('not ready');
    expect(saveCompanionArt).not.toHaveBeenCalled();
  });
});
