import { describe, expect, it } from 'vitest';
import type { ComputedPalette } from '../dithering';
import { getPreferredBlockState, type BlockSelection } from '../paletteBlocks';
import {
  buildTwoLayerPlanDraft,
  evaluateSuppressionEligibility,
  isSelectiveUpdateCell,
  reconstructExpectedMapBytes,
  type SuppressionPlannerInput,
} from '../suppressionPlan';
import { base64ToBytes } from '../base64';

const SIZE = 128;
const FILLER_BASE_ID = 11;

function localKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function volumePaletteAt(
  built: ReturnType<typeof buildTwoLayerPlanDraft>,
  x: number,
  y: number,
  z: number,
): number {
  const origin = built.volume.origin!;
  const ix = x - origin.x;
  const iy = y - origin.y;
  const iz = z - origin.z;
  if (ix < 0 || iy < 0 || iz < 0
    || ix >= built.volume.sizeX || iy >= built.volume.sizeY || iz >= built.volume.sizeZ) return 0;
  return built.volume.indices[iy * built.volume.sizeZ * built.volume.sizeX + iz * built.volume.sizeX + ix];
}

function vanillaSurfaceBytes(
  built: ReturnType<typeof buildTwoLayerPlanDraft>,
  target: Uint8Array,
  removed: Set<string>,
): Uint8Array {
  const result = new Uint8Array(SIZE * SIZE);
  const top = (x: number, z: number): { y: number; baseId: number } => {
    for (let y = built.plan.structureBounds.max.y; y >= built.plan.structureBounds.min.y; y--) {
      if (removed.has(localKey(x, y, z)) || volumePaletteAt(built, x, y, z) === 0) continue;
      const targetY = z >= 0 && z < SIZE && x >= 0 && x < SIZE
        ? (((x + z) & 1) === 1 ? 0 : 2)
        : Number.NaN;
      return {
        y,
        baseId: y === targetY ? target[z * SIZE + x] >> 2 : FILLER_BASE_ID,
      };
    }
    // The player-provided platform is outside the exported volume. Exact safe
    // stand points never sample a removed recessive hole, but modelling the
    // platform exposes why carrying the map during travel corrupts it.
    return { y: -2, baseId: FILLER_BASE_ID };
  };

  for (let x = 0; x < SIZE; x++) {
    let north = top(x, -1);
    for (let z = 0; z < SIZE; z++) {
      const current = top(x, z);
      const delta = current.y - north.y;
      const parityBias = (((x + z) & 1) - 0.5) * 0.4;
      const brightness = delta * 4 / 5 + parityBias;
      const shade = brightness > 0.6 ? 2 : brightness < -0.6 ? 0 : 1;
      result[z * SIZE + x] = current.baseId * 4 + shade;
      north = current;
    }
  }
  return result;
}

function vanillaUpdatesAt(playerX: number, playerZ: number, x: number, z: number): boolean {
  const dx = x - playerX;
  const dz = z - playerZ;
  const distanceSquared = dx * dx + dz * dz;
  if (distanceSquared >= 128 * 128) return false;
  return distanceSquared <= 126 * 126 || ((x + z) & 1) === 1;
}

function applyVanillaCapture(current: Uint8Array, surface: Uint8Array, playerX: number, playerZ: number): void {
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      if (vanillaUpdatesAt(playerX, playerZ, x, z)) current[z * SIZE + x] = surface[z * SIZE + x];
    }
  }
}

const red = { r: 153, g: 51, b: 51, name: 'RED_0', baseId: 28, shade: 0 };
const sand = { r: 247, g: 233, b: 163, name: 'SAND_2', baseId: 2, shade: 2 };

const palette: ComputedPalette = {
  colors: [red, sand],
  labs: [],
  exactLookup: new Map([
    [(red.r << 16) | (red.g << 8) | red.b, 0],
    [(sand.r << 16) | (sand.g << 8) | sand.b, 1],
  ]),
  matchMode: 'oklab',
  coords: new Float64Array(0),
};

const blockSelection: BlockSelection = { 27: [0], 1: [1] };

function makeInput(): SuppressionPlannerInput {
  const data = new Uint8ClampedArray(128 * 128 * 4);
  for (let z = 0; z < 128; z++) {
    for (let x = 0; x < 128; x++) {
      const color = ((x + z) & 1) === 0 ? red : sand;
      const offset = (z * 128 + x) * 4;
      data[offset] = color.r;
      data[offset + 1] = color.g;
      data[offset + 2] = color.b;
      data[offset + 3] = 255;
    }
  }
  return {
    imageData: { data, width: 128, height: 128 },
    palette,
    blockSelection,
    grid: { wide: 1, tall: 1 },
    mapMode: '3d',
    platformMode: 'java',
    minecraftVersion: '1.21.11',
    fillerBlockNbt: 'cobblestone',
  };
}

describe('Two-layer suppression planner', () => {
  it('resolves the exact log orientations seen in the fresh-world regression', () => {
    expect(getPreferredBlockState(10, { 8: [0] })).toEqual({
      nbtName: 'jungle_log', properties: { axis: 'y' },
    });
    expect(getPreferredBlockState(13, { 11: [0] })).toEqual({
      nbtName: 'oak_log', properties: { axis: 'y' },
    });
    expect(getPreferredBlockState(34, { 33: [0] })).toEqual({
      nbtName: 'spruce_log', properties: { axis: 'y' },
    });
    expect(getPreferredBlockState(14, { 12: [0] })).toEqual({
      nbtName: 'birch_log', properties: { axis: 'x' },
    });
    expect(getPreferredBlockState(34, { 33: [3] })).toEqual({
      nbtName: 'oak_log', properties: { axis: 'x' },
    });
  });

  it('matches the vanilla inner circle and outer selective ring boundaries', () => {
    expect(isSelectiveUpdateCell(0, 0, 126, 0)).toBe(true); // Inner boundary updates both parities.
    expect(isSelectiveUpdateCell(0, 0, 127, 0)).toBe(true); // Outer ring, dominant parity.
    expect(isSelectiveUpdateCell(0, 0, 127, 1)).toBe(false); // Outer ring, recessive parity.
    expect(isSelectiveUpdateCell(0, 0, 128, 0)).toBe(false); // Outside the map update radius.
  });

  it('rejects unsupported dimensions, transparency, versions and build modes', () => {
    const input = makeInput();
    input.grid = { wide: 2, tall: 1 };
    input.platformMode = 'bedrock';
    input.minecraftVersion = '1.20';
    input.mapMode = '2d';
    input.imageData.data[3] = 0;

    const result = evaluateSuppressionEligibility(input);
    expect(result.eligible).toBe(false);
    expect(result.reasons.map(reason => reason.code)).toEqual(expect.arrayContaining([
      'wrong_size',
      'wrong_platform',
      'unsupported_version',
      'requires_three_shades',
    ]));
  });

  it('accepts a multi-map grid when the processed image matches the full grid', () => {
    const multi = makeInput();
    multi.grid = { wide: 2, tall: 1 };
    const data = new Uint8ClampedArray(256 * 128 * 4);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 256; x++) {
        const color = ((x + y) & 1) === 0 ? red : sand;
        const offset = (y * 256 + x) * 4;
        data[offset] = color.r;
        data[offset + 1] = color.g;
        data[offset + 2] = color.b;
        data[offset + 3] = 255;
      }
    }
    multi.imageData = { data, width: 256, height: 128 };
    const result = evaluateSuppressionEligibility(multi);
    expect(result.reasons.map(reason => reason.code)).not.toContain('wrong_grid');
    expect(result.reasons.map(reason => reason.code)).not.toContain('wrong_size');
    expect(result.eligible).toBe(true);
  });

  it('shares a ten-by-ten maximum grid with Companion', () => {
    const input = makeInput();
    input.grid = { wide: 11, tall: 1 };
    input.imageData = {
      data: new Uint8ClampedArray(11 * 128 * 128 * 4),
      width: 11 * 128,
      height: 128,
    };
    for (let offset = 3; offset < input.imageData.data.length; offset += 4) {
      input.imageData.data[offset] = 255;
    }

    const result = evaluateSuppressionEligibility(input);

    expect(result.eligible).toBe(false);
    expect(result.reasons.map(reason => reason.code)).toContain('wrong_grid');
  });

  it('rejects blocks that can change while covered by the upper layer', () => {
    const input = makeInput();
    input.palette = {
      ...palette,
      colors: [{ ...red, baseId: 1 }, sand],
    };
    input.blockSelection = { 0: [0], 1: [1] };

    const result = evaluateSuppressionEligibility(input);

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContainEqual({ code: 'unsupported_block', detail: 'grass_block' });
  });

  it('preserves vertical and horizontal log axes as separate palette states', () => {
    const verticalOak = { r: 143, g: 119, b: 72, name: 'OAK_1', baseId: 13, shade: 1 };
    const horizontalOak = { r: 129, g: 86, b: 49, name: 'SPRUCE_1', baseId: 34, shade: 1 };
    const axisPalette: ComputedPalette = {
      colors: [verticalOak, horizontalOak],
      labs: [],
      exactLookup: new Map([
        [(verticalOak.r << 16) | (verticalOak.g << 8) | verticalOak.b, 0],
        [(horizontalOak.r << 16) | (horizontalOak.g << 8) | horizontalOak.b, 1],
      ]),
      matchMode: 'oklab',
      coords: new Float64Array(0),
    };
    const axisInput = makeInput();
    axisInput.palette = axisPalette;
    axisInput.blockSelection = { 11: [0], 33: [3] };
    for (let z = 0; z < 128; z++) {
      for (let x = 0; x < 128; x++) {
        const color = ((x + z) & 1) === 0 ? verticalOak : horizontalOak;
        const offset = (z * 128 + x) * 4;
        axisInput.imageData.data[offset] = color.r;
        axisInput.imageData.data[offset + 1] = color.g;
        axisInput.imageData.data[offset + 2] = color.b;
      }
    }

    const built = buildTwoLayerPlanDraft(axisInput);
    const oakEntries = built.plan.palette.filter(entry => entry.state === 'minecraft:oak_log');

    expect(oakEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ properties: { axis: 'y' } }),
      expect.objectContaining({ properties: { axis: 'x' } }),
    ]));
    expect(oakEntries).toHaveLength(2);
    expect(built.volume.paletteProperties).toEqual(expect.arrayContaining([
      { axis: 'y' },
      { axis: 'x' },
    ]));
  });

  it('rejects nylium because it can decay while covered', () => {
    const input = makeInput();
    input.palette = {
      ...palette,
      colors: [{ ...red, baseId: 52 }, sand],
    };
    input.blockSelection = { 51: [0], 1: [1] };

    const result = evaluateSuppressionEligibility(input);

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContainEqual({ code: 'unsupported_block', detail: 'crimson_nylium' });
  });

  it('rejects an orientation-ambiguous filler block', () => {
    const input = makeInput();
    input.fillerBlockNbt = 'oak_log';

    const result = evaluateSuppressionEligibility(input);

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContainEqual({ code: 'unsupported_block', detail: 'oak_log' });
  });

  it('builds two parity surfaces, 64 phases and positioned negative bounds', () => {
    const built = buildTwoLayerPlanDraft(makeInput());

    expect(built.volume.origin).toEqual({ x: 0, y: -1, z: -1 });
    expect(built.plan.structureBounds.max).toEqual({ x: 127, y: 3, z: 127 });
    expect(built.plan.workflowBounds.max).toEqual({ x: 253, y: 3, z: 127 });
    expect(built.plan.phases).toHaveLength(64);
    expect(built.plan.phases[0].columns).toEqual([0, 1]);
    expect(built.plan.phases[63].columns).toEqual([126, 127]);
    expect(built.plan.phases.every(phase => phase.updatePixelRuns.length === 128)).toBe(true);
    expect(built.plan.materials.recoverableBlocks).toBe(16_384);
    expect(built.summary.initialBlocks).toBe(32_768);
    expect(built.volume.sizeX).toBe(128);
    expect(built.plan.palette.every(entry => !entry.roles.includes('marker' as never))).toBe(true);
    expect('canvas' in built.plan).toBe(false);
  });

  it('keeps the two target levels at the minimum collision-free height gap', () => {
    const built = buildTwoLayerPlanDraft(makeInput());
    const origin = built.volume.origin!;
    const paletteAt = (x: number, y: number, z: number) => {
      const ix = x - origin.x;
      const iy = y - origin.y;
      const iz = z - origin.z;
      return built.volume.indices[iy * built.volume.sizeZ * built.volume.sizeX + iz * built.volume.sizeX + ix];
    };

    // Even parity is the removable upper target; odd parity is the retained
    // lower target. Their two-block delta leaves one level for shade refs.
    expect(paletteAt(0, 2, 0)).not.toBe(0);
    expect(paletteAt(1, 0, 0)).not.toBe(0);
    expect(paletteAt(0, 0, 0)).toBe(0);
    expect(paletteAt(1, 2, 0)).toBe(0);
    expect(built.plan.phases[1].standPoints.every(point => point.standOn.y === 2)).toBe(true);
  });

  it('derives safe ring points that cover dominant pixels without touching completed columns', () => {
    const { plan } = buildTwoLayerPlanDraft(makeInput());

    for (const phase of plan.phases) {
      expect(phase.standPoints).toHaveLength(4);
      const [x0, x1] = phase.columns;
      for (let z = 0; z < 128; z++) {
        const dominantX = ((x0 + z) & 1) === 1 ? x0 : x1;
        expect(phase.standPoints.some(point => {
          const dx = dominantX - point.standOn.x;
          const dz = z - point.standOn.z;
          return dx * dx + dz * dz < 128 * 128;
        })).toBe(true);

        const recessiveX = dominantX === x0 ? x1 : x0;
        expect(phase.standPoints.every(point => {
          const dx = recessiveX - point.standOn.x;
          const dz = z - point.standOn.z;
          const distanceSquared = dx * dx + dz * dz;
          return distanceSquared > 126 * 126 || distanceSquared >= 128 * 128;
        })).toBe(true);
      }
      if (x0 > 0) {
        expect(phase.standPoints.every(point => {
          const dx = (x0 - 1) - point.standOn.x;
          return dx * dx >= 128 * 128;
        })).toBe(true);
      }
    }
  });

  it('reconstructs the final target bytes from the initial capture and phase runs', () => {
    const { plan } = buildTwoLayerPlanDraft(makeInput());
    const initial = base64ToBytes(plan.initialMapBytesB64);
    const target = base64ToBytes(plan.targetMapBytesB64);

    expect(reconstructExpectedMapBytes(initial, target, plan.phases, 0)).toEqual(initial);
    expect(reconstructExpectedMapBytes(initial, target, plan.phases, 64)).toEqual(target);
  });

  it('matches an independent vanilla map simulation after every phase', () => {
    const built = buildTwoLayerPlanDraft(makeInput());
    const initial = base64ToBytes(built.plan.initialMapBytesB64);
    const target = base64ToBytes(built.plan.targetMapBytesB64);
    const removed = new Set<string>();
    const actual = vanillaSurfaceBytes(built, target, removed);

    expect(actual).toEqual(initial);

    for (let phaseIndex = 0; phaseIndex < built.plan.phases.length; phaseIndex++) {
      const phase = built.plan.phases[phaseIndex];
      for (const run of phase.removeRuns) {
        for (let dx = 0; dx < run.length; dx++) removed.add(localKey(run.xStart + dx, run.y, run.z));
      }
      const surface = vanillaSurfaceBytes(built, target, removed);
      for (const point of phase.standPoints) {
        applyVanillaCapture(actual, surface, point.standOn.x, point.standOn.z);
      }
      expect(actual, `phase ${phaseIndex + 1}`).toEqual(
        reconstructExpectedMapBytes(initial, target, built.plan.phases, phaseIndex + 1),
      );
    }

    expect(actual).toEqual(target);
  }, 20_000);

  it('demonstrates that holding the map during travel corrupts recessive pixels', () => {
    const built = buildTwoLayerPlanDraft(makeInput());
    const initial = base64ToBytes(built.plan.initialMapBytesB64);
    const target = base64ToBytes(built.plan.targetMapBytesB64);
    const removed = new Set<string>();
    for (const run of built.plan.phases[0].removeRuns) {
      for (let dx = 0; dx < run.length; dx++) removed.add(localKey(run.xStart + dx, run.y, run.z));
    }
    const surface = vanillaSurfaceBytes(built, target, removed);
    const unsafe = new Uint8Array(initial);

    applyVanillaCapture(unsafe, surface, 64, 64);

    let changedRecessive = 0;
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        if (((x + z) & 1) === 0 && unsafe[z * SIZE + x] !== initial[z * SIZE + x]) changedRecessive++;
      }
    }
    expect(changedRecessive).toBeGreaterThan(0);
  });
});
