export const MAP_BLOCK_SIZE = 128 as const;

export interface MapGrid {
  wide: number;
  tall: number;
}

export const MAP_GRID_OPTIONS: MapGrid[] = [
  { wide: 1, tall: 1 },
  { wide: 2, tall: 1 },
  { wide: 1, tall: 2 },
  { wide: 2, tall: 2 },
  { wide: 3, tall: 2 },
  { wide: 2, tall: 3 },
  { wide: 3, tall: 3 },
];

export function gridPixelWidth(g: MapGrid): number {
  return g.wide * MAP_BLOCK_SIZE;
}

export function gridPixelHeight(g: MapGrid): number {
  return g.tall * MAP_BLOCK_SIZE;
}

/** Visual scale factor so the longest axis fits inside ~420 px */
export function gridScale(g: MapGrid): number {
  const longest = Math.max(g.wide, g.tall) * MAP_BLOCK_SIZE;
  return Math.max(2, Math.floor(420 / longest));
}
