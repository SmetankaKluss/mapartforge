import { describe, expect, it } from 'vitest';
import type { Layer, LayerGroup } from '../layers';
import { deserializeFullProject, serializeFullProject, type FullProjectSettings } from '../projectFile';

const settings: FullProjectSettings = {
  dithering: 'floyd-steinberg',
  intensity: 100,
  blockSelection: {},
  adjustments: { brightness: 0, contrast: 0, saturation: 0, red: 0, green: 0, blue: 0 },
  colorMatch: 'oklab',
  mapMode: '2d',
  staircaseMode: 'optimized',
  bnScale: 2,
  minecraftVersion: '1.21.4',
  platformMode: 'java',
};

describe('full project format', () => {
  it('round-trips layer metadata and groups in version 3', () => {
    const groups: LayerGroup[] = [{ id: 'group-1', name: 'Faces', visible: true, collapsed: true }];
    const layers: Layer[] = [{
      id: 'layer-1',
      name: 'Portrait',
      visible: true,
      locked: true,
      opacity: 63,
      groupId: 'group-1',
      imageData: null,
      buildMode: '3d-optimized',
      mapMode: '3d',
      staircaseMode: 'optimized',
      dithering: 'atkinson',
      ditheringIntensity: 75,
      isDirty: true,
    }];

    const json = serializeFullProject(layers, 'layer-1', { wide: 2, tall: 3 }, settings, groups);
    expect((JSON.parse(json) as { version: number }).version).toBe(3);
    const restored = deserializeFullProject(json);
    expect(restored?.groups).toEqual(groups);
    expect(restored?.layers[0]).toMatchObject({
      opacity: 63,
      buildMode: '3d-optimized',
      groupId: 'group-1',
      mapMode: '3d',
      dithering: 'atkinson',
      isDirty: true,
    });
  });

  it('continues to read legacy version 2 projects with safe defaults', () => {
    const legacy = JSON.stringify({
      version: 2,
      project: {
        version: 1,
        grid: { wide: 1, tall: 1 },
        activeLayerId: 'legacy',
        layers: [{
          id: 'legacy',
          name: 'Legacy',
          visible: true,
          locked: false,
          groupId: null,
          imageDataB64: null,
          width: 0,
          height: 0,
        }],
      },
      settings,
    });

    const restored = deserializeFullProject(legacy);
    expect(restored?.groups).toEqual([]);
    expect(restored?.layers[0]).toMatchObject({ opacity: 100, buildMode: '2d' });
  });
});
