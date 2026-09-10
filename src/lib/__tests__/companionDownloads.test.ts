import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import {
  COMPANION_MOD_VERSION_OPTIONS,
  companionDownloadOption,
  companionVersionForMinecraft,
  isCompanionMinecraftVersion,
} from '../companionDownloads';

describe('companion downloads', () => {
  it('ships matching checksums and production-only 0.14.0 jars for every link', async () => {
    const base = new URL('../../../public/downloads/mod/', import.meta.url);
    const checksums = new Map(readFileSync(new URL('SHA256SUMS-0.14.0.txt', base), 'utf8')
      .trim().split(/\r?\n/).map(line => {
        const [hash, name] = line.trim().split(/\s+/);
        return [name, hash];
      }));
    expect(checksums.size).toBe(4);
    for (const option of COMPANION_MOD_VERSION_OPTIONS) {
      const bytes = readFileSync(new URL(option.filename, base));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(checksums.get(option.filename));
      const jar = await JSZip.loadAsync(bytes);
      const metadata = JSON.parse(await jar.file('fabric.mod.json')!.async('string'));
      expect(metadata.version).toBe('0.14.0');
      expect(JSON.stringify(metadata.depends.minecraft)).toContain(option.minecraftVersion);
      expect(Object.keys(jar.files).filter(name => /UiLab|ControlDesk|LibraryHarness|TestFixtures/.test(name))).toEqual([]);
    }
  });
  it('keeps the four supported Fabric targets in one canonical list', () => {
    expect(COMPANION_MOD_VERSION_OPTIONS.map(option => option.minecraftVersion)).toEqual([
      '26.2',
      '1.21.11',
      '1.21.8',
      '1.21.4',
    ]);
    expect(COMPANION_MOD_VERSION_OPTIONS.every(option => option.href.endsWith('20260910-companion-0-14-0'))).toBe(true);
  });

  it('uses the exact target when supported and a safe 1.21.4 fallback otherwise', () => {
    expect(companionVersionForMinecraft('1.21.8')).toBe('1.21.8');
    expect(companionVersionForMinecraft('1.20')).toBe('1.21.4');
    expect(isCompanionMinecraftVersion('26.2')).toBe(true);
    expect(isCompanionMinecraftVersion('1.20')).toBe(false);
    expect(companionDownloadOption('1.21.11').filename).toContain('1.21.11-0.14.0.jar');
  });
});
