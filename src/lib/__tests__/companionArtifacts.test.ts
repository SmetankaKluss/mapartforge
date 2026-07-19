import { describe, expect, it } from 'vitest';
import { companionArtifactFilename, companionSlug } from '../companionArtifacts';

describe('companion artifact naming', () => {
  it('builds stable filenames from art title, grid, and artifact kind', () => {
    expect(companionArtifactFilename('Castle 01', { wide: 2, tall: 3 }, 'litematic'))
      .toBe('castle_01_2x3.litematic');
    expect(companionArtifactFilename('Castle 01', { wide: 2, tall: 3 }, 'mapdat_zip'))
      .toBe('castle_01_2x3_mapdat.zip');
    expect(companionArtifactFilename('Castle 01', { wide: 2, tall: 3 }, 'frame_commands'))
      .toBe('castle_01_2x3_frames.mcfunction');
    expect(companionArtifactFilename('Castle 01', { wide: 1, tall: 1 }, 'suppression_litematic'))
      .toBe('castle_01_1x1_suppression.litematic');
    expect(companionArtifactFilename('Castle 01', { wide: 1, tall: 1 }, 'suppression_plan'))
      .toBe('castle_01_1x1_suppression_plan.json');
    expect(companionArtifactFilename('Castle 01', { wide: 3, tall: 2 }, 'suppression_bundle'))
      .toBe('castle_01_3x2_two_layer.zip');
  });

  it('keeps cyrillic names readable and falls back for empty names', () => {
    expect(companionSlug('  Мой арт №1!  ')).toBe('мой_арт_1');
    expect(companionSlug('***')).toBe('mapkluss_art');
  });
});
