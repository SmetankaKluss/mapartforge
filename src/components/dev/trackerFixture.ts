import type { BuildSession } from '../../lib/buildSession';

export function trackerFixture(id: string): BuildSession {
  return {
    id, created_at: '2026-09-08T12:00:00Z', map_grid: { wide: 3, tall: 2 },
    image_preview: '/examples/great-wave/result.png', mode: 'gathering',
    info: { title: 'The Great Wave', description: 'Demo' },
    materials: [
      { nbtName: 'minecraft:sand', displayName: 'Sand', count: 24000 },
      { nbtName: 'minecraft:blue_wool', displayName: 'Blue Wool', count: 14600 },
      { nbtName: 'minecraft:white_wool', displayName: 'White Wool', count: 20500 },
      { nbtName: 'minecraft:light_gray_wool', displayName: 'Light Gray Wool', count: 8400 },
      { nbtName: 'minecraft:black_wool', displayName: 'Black Wool', count: 7800 },
      { nbtName: 'minecraft:gray_wool', displayName: 'Gray Wool', count: 7900 },
      { nbtName: 'minecraft:light_blue_wool', displayName: 'Light Blue Wool', count: 9300 },
      { nbtName: 'minecraft:cyan_wool', displayName: 'Cyan Wool', count: 5804 },
    ],
    gathered: { 'minecraft:sand': 24000, 'minecraft:blue_wool': 7300, 'minecraft:white_wool': 12000 },
    placed: {},
  };
}
