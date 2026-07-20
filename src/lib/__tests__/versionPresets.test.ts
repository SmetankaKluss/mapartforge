import { describe, expect, it } from 'vitest';
import {
  MINECRAFT_VERSIONS,
  getVersionLabel,
  isBlockAvailable,
  minecraftDataPackFormat,
  minecraftDataVersion,
} from '../versionPresets';

describe('Minecraft version presets', () => {
  it('publishes Minecraft 26.2 after the legacy targets', () => {
    expect(MINECRAFT_VERSIONS.at(-1)).toBe('26.2');
    expect(getVersionLabel('26.2')).toBe('Java 26.2');
    expect(minecraftDataVersion('26.2')).toBe(4903);
    expect(minecraftDataPackFormat('26.2')).toEqual([107, 1]);
  });

  it('gates new blocks without changing their vanilla map colours', () => {
    for (const block of ['sulfur', 'potent_sulfur', 'cinnabar', 'chiseled_cinnabar']) {
      expect(isBlockAvailable(block, '1.21.11')).toBe(false);
      expect(isBlockAvailable(block, '26.2')).toBe(true);
    }
  });
});
