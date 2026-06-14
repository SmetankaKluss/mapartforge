import { describe, expect, it } from 'vitest';
import { buildFrameFillCommands, mapIdForBottomLeftFrame } from '../exportFrameCommands';

describe('frame fill command export', () => {
  it('maps bottom-left frame order to top-to-bottom map.dat ids', () => {
    const mapGrid = { wide: 3, tall: 2 };

    expect(mapIdForBottomLeftFrame(mapGrid, 100, 0, 0)).toBe(103);
    expect(mapIdForBottomLeftFrame(mapGrid, 100, 1, 0)).toBe(104);
    expect(mapIdForBottomLeftFrame(mapGrid, 100, 2, 0)).toBe(105);
    expect(mapIdForBottomLeftFrame(mapGrid, 100, 0, 1)).toBe(100);
    expect(mapIdForBottomLeftFrame(mapGrid, 100, 2, 1)).toBe(102);
  });

  it('builds one command per item frame using local coordinates', () => {
    const commands = buildFrameFillCommands({
      mapGrid: { wide: 2, tall: 2 },
      startMapId: 7,
    });

    expect(commands).toContain('Maps: map_7.dat ... map_10.dat');
    expect(commands).toContain('positioned ^0 ^0 ^1');
    expect(commands).toContain('"minecraft:map_id":9');
    expect(commands).toContain('positioned ^-1 ^1 ^1');
    expect(commands).toContain('"minecraft:map_id":8');
    expect(commands.match(/data merge entity/g)).toHaveLength(4);
  });
});
