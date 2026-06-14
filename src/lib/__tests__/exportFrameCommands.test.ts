import { describe, expect, it } from 'vitest';
import { buildFrameFillCommands, buildFrameFillDatapackFiles, mapIdForBottomLeftFrame } from '../exportFrameCommands';

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
    expect(commands).toContain('anchored eyes positioned ^0 ^0 ^2');
    expect(commands).toContain('summon minecraft:item_frame ~ ~ ~ {Facing:0b,Item:{id:"minecraft:filled_map",count:1,components:{"minecraft:map_id":9}}}');
    expect(commands).toContain('anchored eyes positioned ^-1 ^1 ^2');
    expect(commands).toContain('summon minecraft:item_frame ~ ~ ~ {Facing:5b,Item:{id:"minecraft:filled_map",count:1,components:{"minecraft:map_id":8}}}');
    expect(commands.match(/summon minecraft:item_frame/g)).toHaveLength(24);
    expect(commands.match(/run kill @s/g)).toHaveLength(4);
    expect(commands.match(/distance=\.\.1\.45/g)).toHaveLength(32);
  });

  it('builds a datapack with modern and legacy function paths', () => {
    const files = buildFrameFillDatapackFiles({
      mapGrid: { wide: 1, tall: 1 },
      startMapId: 42,
    });

    expect(files.map(file => file.path)).toEqual([
      'pack.mcmeta',
      'data/mapkluss/function/fill_frames.mcfunction',
      'data/mapkluss/functions/fill_frames.mcfunction',
    ]);
    expect(files[0].content).toContain('"pack_format": 48');
    expect(files[1].content).toContain('/function mapkluss:fill_frames');
    expect(files[1].content).toContain('"minecraft:map_id":42');
  });
});
