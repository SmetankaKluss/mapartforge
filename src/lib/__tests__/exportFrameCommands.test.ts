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

  it('builds commands that place glowing item frames with maps', () => {
    const commands = buildFrameFillCommands({
      mapGrid: { wide: 2, tall: 2 },
      startMapId: 7,
    });

    expect(commands).toContain('Maps: map_7.dat ... map_10.dat');
    expect(commands).toContain('anchored eyes positioned ^0 ^0 ^2');
    expect(commands).toContain('kill @e[type=minecraft:item_frame,distance=..0.8]');
    expect(commands).toContain('kill @e[type=minecraft:glow_item_frame,distance=..0.8]');
    expect(commands).toContain('summon minecraft:glow_item_frame ~ ~ ~ {Facing:2b,Item:{id:"minecraft:filled_map",Count:1b,tag:{map:9}}}');
    expect(commands).toContain('anchored eyes positioned ^-1 ^1 ^2');
    expect(commands).toContain('summon minecraft:glow_item_frame ~ ~ ~ {Facing:3b,Item:{id:"minecraft:filled_map",Count:1b,tag:{map:8}}}');
    expect(commands.match(/summon minecraft:glow_item_frame/g)).toHaveLength(20);
    expect(commands.match(/kill @e\[type=minecraft:item_frame,distance=\.\.0\.8\]/g)).toHaveLength(4);
    expect(commands.match(/kill @e\[type=minecraft:glow_item_frame,distance=\.\.0\.8\]/g)).toHaveLength(4);
  });

  it('can still build 1.21 component commands when requested', () => {
    const commands = buildFrameFillCommands({
      mapGrid: { wide: 1, tall: 1 },
      startMapId: 42,
      minecraftVersion: '1.21.4',
    });

    expect(commands).toContain('summon minecraft:glow_item_frame ~ ~ ~ {Facing:2b,Item:{id:"minecraft:filled_map",count:1,components:{"minecraft:map_id":42}}}');
    expect(commands).toContain('kill @e[type=minecraft:glow_item_frame,distance=..0.8]');
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
    expect(files[0].content).toContain('"pack_format": 15');
    expect(files[1].content).toContain('/function mapkluss:fill_frames');
    expect(files[1].content).toContain('tag:{map:42}');
  });

  it('uses the minor-aware pack metadata required by Minecraft 26.2', () => {
    const files = buildFrameFillDatapackFiles({
      mapGrid: { wide: 1, tall: 1 },
      startMapId: 0,
      minecraftVersion: '26.2',
    });
    const meta = JSON.parse(files[0].content) as { pack: Record<string, unknown> };
    expect(meta.pack).toMatchObject({ min_format: [107, 1], max_format: [107, 1] });
    expect(meta.pack).not.toHaveProperty('pack_format');
  });
});
