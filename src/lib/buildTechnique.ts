import type { PlatformMode } from './platformMode';
import type { MinecraftVersion } from './versionPresets';
import type { BlockSelection } from './paletteBlocks';
import { sanitizeSelectionForSuppression } from './suppressionPalette';

export type BuildTechnique = 'standard' | 'suppression_two_layer';

export const DEFAULT_BUILD_TECHNIQUE: BuildTechnique = 'standard';
export const SUPPRESSION_TARGET_VERSIONS = ['26.2', '1.21.11', '1.21.8', '1.21.4'] as const;
export type SuppressionTargetVersion = typeof SUPPRESSION_TARGET_VERSIONS[number];

export type EditorBuildMode = '2d' | '3d' | 'suppression_two_layer';

export function isSuppressionTargetVersion(value: unknown): value is SuppressionTargetVersion {
  return SUPPRESSION_TARGET_VERSIONS.includes(value as SuppressionTargetVersion);
}

export function coerceSuppressionTargetVersion(value: unknown): SuppressionTargetVersion {
  return isSuppressionTargetVersion(value) ? value : '26.2';
}

export function editorBuildMode(
  mapMode: '2d' | '3d',
  buildTechnique: BuildTechnique,
): EditorBuildMode {
  return buildTechnique === 'suppression_two_layer' ? 'suppression_two_layer' : mapMode;
}

export function resolveEditorBuildMode(
  mode: EditorBuildMode,
  currentVersion: MinecraftVersion,
): {
  mapMode: '2d' | '3d';
  buildTechnique: BuildTechnique;
  minecraftVersion: MinecraftVersion;
} {
  if (mode === 'suppression_two_layer') {
    return {
      mapMode: '3d',
      buildTechnique: 'suppression_two_layer',
      minecraftVersion: coerceSuppressionTargetVersion(currentVersion),
    };
  }
  return { mapMode: mode, buildTechnique: 'standard', minecraftVersion: currentVersion };
}

export function normalizeRestoredBuildState(input: {
  mapMode: '2d' | '3d';
  buildTechnique: unknown;
  minecraftVersion: MinecraftVersion;
  platformMode: PlatformMode;
  blockSelection: BlockSelection;
}): {
  mapMode: '2d' | '3d';
  buildTechnique: BuildTechnique;
  minecraftVersion: MinecraftVersion;
  platformMode: PlatformMode;
  blockSelection: BlockSelection;
} {
  const buildTechnique = coerceBuildTechniqueForPlatform(input.buildTechnique, input.platformMode);
  if (buildTechnique !== 'suppression_two_layer') return { ...input, buildTechnique };
  const minecraftVersion = coerceSuppressionTargetVersion(input.minecraftVersion);
  return {
    ...input,
    mapMode: '3d',
    buildTechnique,
    minecraftVersion,
    blockSelection: sanitizeSelectionForSuppression(input.blockSelection, minecraftVersion, input.platformMode),
  };
}

export function coerceBuildTechnique(value: unknown): BuildTechnique {
  return value === 'suppression_two_layer' ? value : DEFAULT_BUILD_TECHNIQUE;
}

export function coerceBuildTechniqueForPlatform(value: unknown, platformMode: PlatformMode): BuildTechnique {
  return platformMode === 'java' ? coerceBuildTechnique(value) : DEFAULT_BUILD_TECHNIQUE;
}

export function isPlatformLockedForBuildTechnique(value: BuildTechnique): boolean {
  return value === 'suppression_two_layer';
}
