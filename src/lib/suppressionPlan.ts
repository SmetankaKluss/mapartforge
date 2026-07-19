import { bytesToBase64 } from './base64';
import type { ComputedPalette } from './dithering';
import type { BlockVolume } from './exportLitematic';
import {
  COLOUR_ROWS,
  getPreferredBlockState,
  isMandatorySupport,
  type BlockSelection,
} from './paletteBlocks';
import type { PlatformMode } from './platformMode';
import type { MapGrid } from './types';
import type { MinecraftVersion } from './versionPresets';
import {
  isSuppressionSafeBlockName,
} from './suppressionPalette';
import {
  isSuppressionTargetVersion,
  type SuppressionTargetVersion,
} from './buildTechnique';
export type { SuppressionTargetVersion } from './buildTechnique';

export const SUPPRESSION_PLAN_SCHEMA = 'mapkluss.suppression-plan' as const;
export const SUPPRESSION_PLAN_VERSION = 3 as const;
export const SUPPRESSION_MAP_SIZE = 128;
export const SUPPRESSION_PHASE_COUNT = 64;
export const SUPPRESSION_MIN_DWELL_TICKS = 32;
export const SUPPRESSION_MAX_PLAN_BYTES = 4 * 1024 * 1024;
export const SUPPRESSION_MAX_LITEMATIC_BYTES = 16 * 1024 * 1024;
export const SUPPRESSION_MAX_IMPORT_BYTES = 24 * 1024 * 1024;
export const SUPPRESSION_MAX_BUNDLE_BYTES = 128 * 1024 * 1024;
// The site and Companion intentionally share one 192 MiB expanded-payload
// budget. Ten maps per side covers the largest supported editor grid without
// allowing a 16x16 export to retain hundreds of megabytes in the browser.
export const SUPPRESSION_MAX_BUNDLE_EXPANDED_BYTES = 192 * 1024 * 1024;
export const SUPPRESSION_MAX_BUNDLE_DIMENSION = 10;
export const SUPPRESSION_MAX_BUNDLE_TILES = 100;

export type SuppressionBlockRole =
  | 'dominant_target'
  | 'recessive_target'
  | 'shade_filler';

export interface LocalBlockPos {
  x: number;
  y: number;
  z: number;
}

export interface SuppressionEligibilityReason {
  code:
    | 'wrong_grid'
    | 'wrong_size'
    | 'wrong_platform'
    | 'unsupported_version'
    | 'requires_three_shades'
    | 'transparent_pixel'
    | 'unknown_palette_colour'
    | 'unsupported_shade'
    | 'unsupported_block';
  detail?: string;
}

export interface SuppressionEligibility {
  eligible: boolean;
  reasons: SuppressionEligibilityReason[];
}

export interface SuppressionPaletteEntry {
  state: string;
  properties?: Record<string, string>;
  roles: SuppressionBlockRole[];
}

export interface SuppressionRemovalRun {
  xStart: number;
  y: number;
  z: number;
  length: number;
  paletteIndex: number;
}

export interface SuppressionPixelRun {
  xStart: number;
  z: number;
  length: number;
}

export interface SuppressionStandPoint {
  standOn: LocalBlockPos;
  minTicks: number;
}

export interface SuppressionPhase {
  id: string;
  index: number;
  columns: [number, number];
  labelRu: string;
  labelEn: string;
  removeRuns: SuppressionRemovalRun[];
  updatePixelRuns: SuppressionPixelRun[];
  standPoints: SuppressionStandPoint[];
  verifiedTargetPixels: number;
}

export interface SuppressionMaterialCount {
  paletteIndex: number;
  count: number;
}

export interface SuppressionPlanDraftV3 {
  schema: typeof SUPPRESSION_PLAN_SCHEMA;
  version: typeof SUPPRESSION_PLAN_VERSION;
  method: 'two_layer';
  direction: 'west_to_east';
  target: {
    minecraftVersion: SuppressionTargetVersion;
    dimension: 'minecraft:overworld';
    scale: 0;
    width: 128;
    height: 128;
  };
  axes: {
    anchor: 'northwest_baseline';
    east: '+x';
    south: '+z';
    up: '+y';
  };
  structureBounds: { min: LocalBlockPos; max: LocalBlockPos };
  workflowBounds: { min: LocalBlockPos; max: LocalBlockPos };
  palette: SuppressionPaletteEntry[];
  initialMapBytesB64: string;
  targetMapBytesB64: string;
  verification: {
    initialParity: 'recessive_even';
    phaseParity: 'dominant_odd';
    selectiveRing: { innerExclusive: 126; outerExclusive: 128 };
    minDwellTicks: 32;
  };
  initialCapture: {
    standPoints: SuppressionStandPoint[];
  };
  phases: SuppressionPhase[];
  materials: {
    initial: SuppressionMaterialCount[];
    recoverable: SuppressionMaterialCount[];
    totalBlocks: number;
    recoverableBlocks: number;
  };
}

export interface SuppressionPlanV3 extends SuppressionPlanDraftV3 {
  litematic: {
    filename: string;
    sha256: string;
  };
}

export interface SuppressionPlannerInput {
  imageData: Pick<ImageData, 'data' | 'width' | 'height'>;
  palette: ComputedPalette;
  blockSelection: BlockSelection;
  grid: MapGrid;
  mapMode: '2d' | '3d';
  platformMode: PlatformMode;
  minecraftVersion: MinecraftVersion;
  fillerBlockNbt?: string;
}

export interface SuppressionPlanBuild {
  plan: SuppressionPlanDraftV3;
  volume: BlockVolume;
  summary: {
    phases: number;
    initialBlocks: number;
    recoverableBlocks: number;
  };
}

interface PixelSpec {
  baseId: number;
  shade: number;
  mapByte: number;
  blockState: string;
  blockProperties?: Record<string, string>;
}

interface PlacedCell {
  paletteIndex: number;
  baseId: number;
  role: SuppressionBlockRole;
}

// Four even-Z positions cover all odd-Z dominant pixels at dx=-127 and all
// even-Z dominant pixels at dx=-126. A fifth point is safe but redundant.
const STAND_Z = [16, 48, 80, 112] as const;
const LOWER_BASE_Y = 0;
// Two target levels only need one intervening Y level for their +/-1 shade
// references. A four-block split made half of the art appear three layers
// below the other half without adding any correctness benefit.
const UPPER_BASE_Y = 2;
const VOLUME_MIN = { x: 0, y: -1, z: -1 } as const;
const VOLUME_MAX = { x: 127, y: 3, z: 127 } as const;
const WORKFLOW_MAX = { x: 253, y: 3, z: 127 } as const;

function key3(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function normalizeState(nbt: string): string {
  return nbt.startsWith('minecraft:') ? nbt : `minecraft:${nbt}`;
}

function baseIdForBlock(nbt: string): number | null {
  const name = nbt.replace(/^minecraft:/, '');
  const matches = new Set<number>();
  for (const row of COLOUR_ROWS) {
    if (row.blocks.some(block => block.nbtName === name)) matches.add(row.baseId);
  }
  // A filler is selected by name only, so a name that maps to different map
  // colours depending on orientation cannot be resolved safely here.
  return matches.size === 1 ? [...matches][0] : null;
}

function decodePixels(input: SuppressionPlannerInput): {
  pixels: PixelSpec[];
  targetBytes: Uint8Array;
  reasons: SuppressionEligibilityReason[];
} {
  const { imageData, palette, blockSelection } = input;
  const pixels: PixelSpec[] = new Array(imageData.width * imageData.height);
  const targetBytes = new Uint8Array(imageData.width * imageData.height);
  const reasons: SuppressionEligibilityReason[] = [];
  const seenReasons = new Set<string>();

  for (let i = 0; i < pixels.length; i++) {
    const offset = i * 4;
    if (imageData.data[offset + 3] < 255) {
      if (!seenReasons.has('transparent_pixel')) {
        reasons.push({ code: 'transparent_pixel' });
        seenReasons.add('transparent_pixel');
      }
      continue;
    }
    const rgb = (imageData.data[offset] << 16)
      | (imageData.data[offset + 1] << 8)
      | imageData.data[offset + 2];
    const paletteIndex = palette.exactLookup.get(rgb);
    const color = paletteIndex === undefined ? undefined : palette.colors[paletteIndex];
    if (!color) {
      if (!seenReasons.has('unknown_palette_colour')) {
        reasons.push({ code: 'unknown_palette_colour' });
        seenReasons.add('unknown_palette_colour');
      }
      continue;
    }
    if (color.shade < 0 || color.shade > 2) {
      if (!seenReasons.has('unsupported_shade')) {
        reasons.push({ code: 'unsupported_shade', detail: String(color.shade) });
        seenReasons.add('unsupported_shade');
      }
      continue;
    }
    const preferred = getPreferredBlockState(color.baseId, blockSelection);
    if (isMandatorySupport(color.baseId, blockSelection) || !isSuppressionSafeBlockName(preferred.nbtName)) {
      const reasonKey = `unsupported_block:${preferred.nbtName}`;
      if (!seenReasons.has(reasonKey)) {
        reasons.push({ code: 'unsupported_block', detail: preferred.nbtName });
        seenReasons.add(reasonKey);
      }
      continue;
    }
    const spec: PixelSpec = {
      baseId: color.baseId,
      shade: color.shade,
      mapByte: color.baseId * 4 + color.shade,
      blockState: normalizeState(preferred.nbtName),
      blockProperties: preferred.properties,
    };
    pixels[i] = spec;
    targetBytes[i] = spec.mapByte;
  }

  return { pixels, targetBytes, reasons };
}

export function evaluateSuppressionEligibility(input: SuppressionPlannerInput): SuppressionEligibility {
  const reasons: SuppressionEligibilityReason[] = [];
  const validGrid = Number.isInteger(input.grid.wide)
    && Number.isInteger(input.grid.tall)
    && input.grid.wide >= 1
    && input.grid.tall >= 1
    && input.grid.wide <= SUPPRESSION_MAX_BUNDLE_DIMENSION
    && input.grid.tall <= SUPPRESSION_MAX_BUNDLE_DIMENSION
    && input.grid.wide * input.grid.tall <= SUPPRESSION_MAX_BUNDLE_TILES;
  if (!validGrid) reasons.push({ code: 'wrong_grid', detail: `${input.grid.wide}x${input.grid.tall}` });
  const expectedWidth = validGrid ? input.grid.wide * SUPPRESSION_MAP_SIZE : SUPPRESSION_MAP_SIZE;
  const expectedHeight = validGrid ? input.grid.tall * SUPPRESSION_MAP_SIZE : SUPPRESSION_MAP_SIZE;
  if (input.imageData.width !== expectedWidth || input.imageData.height !== expectedHeight) {
    reasons.push({
      code: 'wrong_size',
      detail: `${input.imageData.width}x${input.imageData.height};expected=${expectedWidth}x${expectedHeight}`,
    });
  }
  if (input.platformMode !== 'java') reasons.push({ code: 'wrong_platform' });
  if (!isSuppressionTargetVersion(input.minecraftVersion)) {
    reasons.push({ code: 'unsupported_version', detail: input.minecraftVersion });
  }
  if (input.mapMode !== '3d') reasons.push({ code: 'requires_three_shades' });

  const filler = input.fillerBlockNbt && input.fillerBlockNbt !== 'air'
    ? input.fillerBlockNbt
    : 'cobblestone';
  if (!isSuppressionSafeBlockName(filler) || baseIdForBlock(filler) === null) {
    reasons.push({ code: 'unsupported_block', detail: filler });
  }

  if (input.imageData.width === expectedWidth && input.imageData.height === expectedHeight) {
    reasons.push(...decodePixels(input).reasons);
  }
  return { eligible: reasons.length === 0, reasons };
}

function fillerOffsetForShade(shade: number): number {
  if (shade === 0) return 1;
  if (shade === 2) return -1;
  return 0;
}

function countsFromIndices(indices: Uint32Array): SuppressionMaterialCount[] {
  const counts = new Map<number, number>();
  for (const index of indices) {
    if (index === 0) continue;
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([paletteIndex, count]) => ({ paletteIndex, count }));
}

function compressRemovalRuns(cells: Array<{ x: number; y: number; z: number; paletteIndex: number }>): SuppressionRemovalRun[] {
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.z - b.z || a.paletteIndex - b.paletteIndex || a.x - b.x);
  const runs: SuppressionRemovalRun[] = [];
  for (const cell of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.y === cell.y && last.z === cell.z && last.paletteIndex === cell.paletteIndex
      && last.xStart + last.length === cell.x) {
      last.length++;
    } else {
      runs.push({ xStart: cell.x, y: cell.y, z: cell.z, length: 1, paletteIndex: cell.paletteIndex });
    }
  }
  return runs;
}

export function reconstructExpectedMapBytes(
  initial: Uint8Array,
  target: Uint8Array,
  phases: Pick<SuppressionPhase, 'updatePixelRuns'>[],
  completedPhases: number,
): Uint8Array {
  const result = new Uint8Array(initial);
  for (let phaseIndex = 0; phaseIndex < Math.min(completedPhases, phases.length); phaseIndex++) {
    for (const run of phases[phaseIndex].updatePixelRuns) {
      for (let dx = 0; dx < run.length; dx++) {
        const index = run.z * SUPPRESSION_MAP_SIZE + run.xStart + dx;
        result[index] = target[index];
      }
    }
  }
  return result;
}

export function buildTwoLayerPlanDraft(input: SuppressionPlannerInput): SuppressionPlanBuild {
  if (input.grid.wide !== 1 || input.grid.tall !== 1
    || input.imageData.width !== SUPPRESSION_MAP_SIZE || input.imageData.height !== SUPPRESSION_MAP_SIZE) {
    throw new Error('A suppression plan describes exactly one 128x128 map tile. Build a multi-map bundle before generating tile plans.');
  }
  const eligibility = evaluateSuppressionEligibility(input);
  if (!eligibility.eligible) {
    throw new Error(`Two-layer is not available: ${eligibility.reasons.map(reason => `${reason.code}${reason.detail ? `:${reason.detail}` : ''}`).join(', ')}`);
  }

  const decoded = decodePixels(input);
  const fillerNbt = input.fillerBlockNbt && input.fillerBlockNbt !== 'air'
    ? input.fillerBlockNbt
    : 'cobblestone';
  const fillerState = normalizeState(fillerNbt);
  const fillerBaseId = baseIdForBlock(fillerNbt)!;

  const sizeX = VOLUME_MAX.x - VOLUME_MIN.x + 1;
  const sizeY = VOLUME_MAX.y - VOLUME_MIN.y + 1;
  const sizeZ = VOLUME_MAX.z - VOLUME_MIN.z + 1;
  const indices = new Uint32Array(sizeX * sizeY * sizeZ);
  const blockPalette = ['minecraft:air'];
  const blockPaletteProperties: Array<Record<string, string> | undefined> = [undefined];
  const paletteByState = new Map<string, number>([['minecraft:air', 0]]);
  const paletteRoles = new Map<number, Set<SuppressionBlockRole>>();
  const placedCells = new Map<string, PlacedCell>();
  const upperCells: Array<{ x: number; y: number; z: number; paletteIndex: number }> = [];

  const paletteKey = (state: string, properties?: Record<string, string>): string => {
    const serialized = properties
      ? Object.entries(properties).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(',')
      : '';
    return `${state}[${serialized}]`;
  };

  const paletteIndexFor = (
    state: string,
    properties: Record<string, string> | undefined,
    role: SuppressionBlockRole,
  ): number => {
    const key = paletteKey(state, properties);
    let index = paletteByState.get(key);
    if (index === undefined) {
      index = blockPalette.length;
      blockPalette.push(state);
      blockPaletteProperties.push(properties);
      paletteByState.set(key, index);
    }
    const roles = paletteRoles.get(index) ?? new Set<SuppressionBlockRole>();
    roles.add(role);
    paletteRoles.set(index, roles);
    return index;
  };

  const put = (
    x: number,
    y: number,
    z: number,
    state: string,
    properties: Record<string, string> | undefined,
    baseId: number,
    role: SuppressionBlockRole,
    upper: boolean,
  ) => {
    if (x < VOLUME_MIN.x || x > VOLUME_MAX.x || y < VOLUME_MIN.y || y > VOLUME_MAX.y
      || z < VOLUME_MIN.z || z > VOLUME_MAX.z) {
      throw new Error(`Suppression block outside bounds: ${x},${y},${z}`);
    }
    const paletteIndex = paletteIndexFor(state, properties, role);
    const ix = x - VOLUME_MIN.x;
    const iy = y - VOLUME_MIN.y;
    const iz = z - VOLUME_MIN.z;
    const volumeIndex = iy * sizeZ * sizeX + iz * sizeX + ix;
    if (indices[volumeIndex] !== 0) throw new Error(`Suppression block collision: ${x},${y},${z}`);
    indices[volumeIndex] = paletteIndex;
    placedCells.set(key3(x, y, z), { paletteIndex, baseId, role });
    if (upper) upperCells.push({ x, y, z, paletteIndex });
  };

  for (let z = 0; z < SUPPRESSION_MAP_SIZE; z++) {
    for (let x = 0; x < SUPPRESSION_MAP_SIZE; x++) {
      const pixel = decoded.pixels[z * SUPPRESSION_MAP_SIZE + x];
      const dominant = ((x + z) & 1) === 1;
      const baseY = dominant ? LOWER_BASE_Y : UPPER_BASE_Y;
      const role: SuppressionBlockRole = dominant ? 'dominant_target' : 'recessive_target';
      put(x, baseY, z, pixel.blockState, pixel.blockProperties, pixel.baseId, role, !dominant);
      put(
        x,
        baseY + fillerOffsetForShade(pixel.shade),
        z - 1,
        fillerState,
        undefined,
        fillerBaseId,
        'shade_filler',
        !dominant,
      );
    }
  }

  const topCellAt = (x: number, z: number): { y: number; cell: PlacedCell } => {
    for (let y = VOLUME_MAX.y; y >= VOLUME_MIN.y; y--) {
      const cell = placedCells.get(key3(x, y, z));
      if (cell) return { y, cell };
    }
    throw new Error(`Suppression surface gap: ${x},${z}`);
  };

  const initialBytes = new Uint8Array(SUPPRESSION_MAP_SIZE * SUPPRESSION_MAP_SIZE);
  for (let x = 0; x < SUPPRESSION_MAP_SIZE; x++) {
    let north = topCellAt(x, -1);
    for (let z = 0; z < SUPPRESSION_MAP_SIZE; z++) {
      const current = topCellAt(x, z);
      const shade = current.y > north.y ? 2 : current.y < north.y ? 0 : 1;
      initialBytes[z * SUPPRESSION_MAP_SIZE + x] = current.cell.baseId * 4 + shade;
      north = current;
    }
  }

  const phases: SuppressionPhase[] = [];
  for (let phase = 0; phase < SUPPRESSION_PHASE_COUNT; phase++) {
    const xStart = phase * 2;
    const xEnd = xStart + 1;
    const removalCells = upperCells.filter(cell => cell.x === xStart || cell.x === xEnd);
    const updatePixelRuns: SuppressionPixelRun[] = [];
    for (let z = 0; z < SUPPRESSION_MAP_SIZE; z++) {
      const dominantX = ((xStart + z) & 1) === 1 ? xStart : xEnd;
      updatePixelRuns.push({ xStart: dominantX, z, length: 1 });
    }
    const standX = xStart + 127;
    const standPoints = STAND_Z.map(z => ({
      standOn: {
        x: standX,
        y: phase === 0 ? topCellAt(standX, z).y : UPPER_BASE_Y,
        z,
      },
      minTicks: SUPPRESSION_MIN_DWELL_TICKS,
    }));
    phases.push({
      id: `columns_${String(xStart).padStart(3, '0')}_${String(xEnd).padStart(3, '0')}`,
      index: phase,
      columns: [xStart, xEnd],
      labelRu: `Снять верхние блоки в столбцах ${xStart + 1}–${xEnd + 1}`,
      labelEn: `Remove upper blocks in columns ${xStart + 1}–${xEnd + 1}`,
      removeRuns: compressRemovalRuns(removalCells),
      updatePixelRuns,
      standPoints,
      verifiedTargetPixels: 8192 + (phase + 1) * 128,
    });
  }

  const recoverableCounts = new Map<number, number>();
  for (const cell of upperCells) {
    recoverableCounts.set(cell.paletteIndex, (recoverableCounts.get(cell.paletteIndex) ?? 0) + 1);
  }
  const initialCounts = countsFromIndices(indices);
  const recoverable = [...recoverableCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([paletteIndex, count]) => ({ paletteIndex, count }));
  const totalBlocks = initialCounts.reduce((sum, item) => sum + item.count, 0);
  const recoverableBlocks = recoverable.reduce((sum, item) => sum + item.count, 0);
  const palette: SuppressionPaletteEntry[] = blockPalette.map((state, index) => ({
    state,
    ...(blockPaletteProperties[index] ? { properties: blockPaletteProperties[index] } : {}),
    roles: [...(paletteRoles.get(index) ?? [])].sort(),
  }));

  const centerSurface = topCellAt(64, 64);
  const targetVersion = input.minecraftVersion as SuppressionTargetVersion;
  const plan: SuppressionPlanDraftV3 = {
    schema: SUPPRESSION_PLAN_SCHEMA,
    version: SUPPRESSION_PLAN_VERSION,
    method: 'two_layer',
    direction: 'west_to_east',
    target: {
      minecraftVersion: targetVersion,
      dimension: 'minecraft:overworld',
      scale: 0,
      width: SUPPRESSION_MAP_SIZE,
      height: SUPPRESSION_MAP_SIZE,
    },
    axes: { anchor: 'northwest_baseline', east: '+x', south: '+z', up: '+y' },
    structureBounds: { min: { ...VOLUME_MIN }, max: { ...VOLUME_MAX } },
    workflowBounds: { min: { ...VOLUME_MIN }, max: { ...WORKFLOW_MAX } },
    palette,
    initialMapBytesB64: bytesToBase64(initialBytes),
    targetMapBytesB64: bytesToBase64(decoded.targetBytes),
    verification: {
      initialParity: 'recessive_even',
      phaseParity: 'dominant_odd',
      selectiveRing: { innerExclusive: 126, outerExclusive: 128 },
      minDwellTicks: SUPPRESSION_MIN_DWELL_TICKS,
    },
    initialCapture: {
      standPoints: [{
        standOn: { x: 64, y: centerSurface.y, z: 64 },
        minTicks: SUPPRESSION_MIN_DWELL_TICKS,
      }],
    },
    phases,
    materials: { initial: initialCounts, recoverable, totalBlocks, recoverableBlocks },
  };

  const volume: BlockVolume = {
    sizeX,
    sizeY,
    sizeZ,
    origin: { ...VOLUME_MIN },
    indices,
    palette: blockPalette,
    paletteProperties: blockPaletteProperties,
  };
  return {
    plan,
    volume,
    summary: { phases: phases.length, initialBlocks: totalBlocks, recoverableBlocks },
  };
}

export function isSelectiveUpdateCell(playerX: number, playerZ: number, x: number, z: number): boolean {
  const dx = x - playerX;
  const dz = z - playerZ;
  const distanceSquared = dx * dx + dz * dz;
  if (distanceSquared >= 128 * 128) return false;
  return distanceSquared <= 126 * 126 || ((x + z) & 1) === 1;
}

export function validateSuppressionPlanShape(plan: SuppressionPlanV3): string[] {
  const errors: string[] = [];
  if (plan.schema !== SUPPRESSION_PLAN_SCHEMA || plan.version !== SUPPRESSION_PLAN_VERSION) errors.push('unsupported_schema');
  if (plan.method !== 'two_layer' || plan.direction !== 'west_to_east') errors.push('unsupported_method');
  if (plan.target.width !== 128 || plan.target.height !== 128 || plan.target.scale !== 0) errors.push('unsupported_target');
  if (plan.target.dimension !== 'minecraft:overworld') errors.push('unsupported_dimension');
  if (!isSuppressionTargetVersion(plan.target.minecraftVersion)) errors.push('unsupported_version');
  if (plan.phases.length !== SUPPRESSION_PHASE_COUNT) errors.push('bad_phase_count');
  if (plan.palette.length === 0 || plan.palette.length > 4096) errors.push('bad_palette');
  if (!/^[a-f0-9]{64}$/.test(plan.litematic.sha256)) errors.push('bad_litematic_sha256');
  return errors;
}
