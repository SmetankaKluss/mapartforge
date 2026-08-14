import { describe, expect, it } from 'vitest';
import {
  COMPANION_MOD_VERSION_OPTIONS,
  companionDownloadOption,
  companionVersionForMinecraft,
  isCompanionMinecraftVersion,
} from '../companionDownloads';

describe('companion downloads', () => {
  it('keeps the four supported Fabric targets in one canonical list', () => {
    expect(COMPANION_MOD_VERSION_OPTIONS.map(option => option.minecraftVersion)).toEqual([
      '26.2',
      '1.21.11',
      '1.21.8',
      '1.21.4',
    ]);
    expect(COMPANION_MOD_VERSION_OPTIONS.every(option => option.href.endsWith('20260805-companion-0-11-1'))).toBe(true);
  });

  it('uses the exact target when supported and a safe 1.21.4 fallback otherwise', () => {
    expect(companionVersionForMinecraft('1.21.8')).toBe('1.21.8');
    expect(companionVersionForMinecraft('1.20')).toBe('1.21.4');
    expect(isCompanionMinecraftVersion('26.2')).toBe(true);
    expect(isCompanionMinecraftVersion('1.20')).toBe(false);
    expect(companionDownloadOption('1.21.11').filename).toContain('1.21.11-0.11.1.jar');
  });
});
