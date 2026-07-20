import { describe, expect, it } from 'vitest';
import {
  coerceBuildTechniqueForPlatform,
  isPlatformLockedForBuildTechnique,
  normalizeRestoredBuildState,
  resolveEditorBuildMode,
} from '../buildTechnique';

describe('build technique platform guard', () => {
  it('keeps Two-layer for Java', () => {
    expect(coerceBuildTechniqueForPlatform('suppression_two_layer', 'java')).toBe('suppression_two_layer');
  });

  it('resets hidden Two-layer state for Bedrock', () => {
    expect(coerceBuildTechniqueForPlatform('suppression_two_layer', 'bedrock')).toBe('standard');
  });

  it('locks platform changes only while Two-layer is active', () => {
    expect(isPlatformLockedForBuildTechnique('suppression_two_layer')).toBe(true);
    expect(isPlatformLockedForBuildTechnique('standard')).toBe(false);
  });

  it('enters Two-layer as 3D and defaults unsupported versions to 26.2', () => {
    expect(resolveEditorBuildMode('suppression_two_layer', '1.20')).toEqual({
      mapMode: '3d',
      buildTechnique: 'suppression_two_layer',
      minecraftVersion: '26.2',
    });
  });

  it('preserves 1.21.8 when entering Two-layer', () => {
    expect(resolveEditorBuildMode('suppression_two_layer', '1.21.8').minecraftVersion).toBe('1.21.8');
  });

  it('returns ordinary modes to the standard technique', () => {
    expect(resolveEditorBuildMode('2d', '1.21.11').buildTechnique).toBe('standard');
    expect(resolveEditorBuildMode('3d', '1.21.11').buildTechnique).toBe('standard');
  });

  it('lets the editor enter Two-layer even from a restored Bedrock state', () => {
    const resolved = resolveEditorBuildMode('suppression_two_layer', '1.20');
    expect(resolved).toMatchObject({
      mapMode: '3d',
      buildTechnique: 'suppression_two_layer',
      minecraftVersion: '26.2',
    });
  });

  it('normalizes an unsafe restored Two-layer project atomically', () => {
    const restored = normalizeRestoredBuildState({
      mapMode: '2d',
      buildTechnique: 'suppression_two_layer',
      minecraftVersion: '1.20',
      platformMode: 'java',
      blockSelection: { 0: [0] },
    });
    expect(restored.mapMode).toBe('3d');
    expect(restored.minecraftVersion).toBe('26.2');
    expect(restored.buildTechnique).toBe('suppression_two_layer');
    expect(restored.blockSelection[0]).not.toEqual([0]);
  });
});
