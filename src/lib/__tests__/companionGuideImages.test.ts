import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { companionGuideImages, companionGuideSections } from '../../components/CompanionGuide';

describe('Companion illustrated guide', () => {
  it('uses existing sections and ten valid screenshots with bilingual captions', () => {
    const sections = new Set<string>(companionGuideSections.map(([id]) => id));
    const names = new Set<string>();
    for (const [section, images] of Object.entries(companionGuideImages)) {
      expect(sections.has(section)).toBe(true);
      for (const [name, ru, en] of images) {
        expect(names.has(name)).toBe(false);
        names.add(name);
        expect(ru.length).toBeGreaterThan(20);
        expect(en.length).toBeGreaterThan(20);
        const png = readFileSync(new URL(`../../../public/images/companion-guide/${name}.png`, import.meta.url));
        expect(png.subarray(1, 4).toString()).toBe('PNG');
        expect(png.readUInt32BE(16)).toBeGreaterThan(1000);
        expect(png.readUInt32BE(20)).toBeGreaterThan(700);
      }
    }
    expect(names.size).toBe(10);
  });
});
