import { saveCompanionArt, getCurrentCompanionAuthUser } from './lib/companionCloud';
import { initializeSupabase } from './lib/supabase';
import { imageDataToBase64 } from './lib/projectFile';
import { buildComputedPalette, type DitheringMode } from './lib/dithering';
import type { PaletteColor } from './lib/palette';
import type { BlockSelection } from './lib/paletteBlocks';
import type { MinecraftVersion } from './lib/versionPresets';

export interface ClassicCloudSaveInput {
  title: string;
  pixels: Uint8ClampedArray;
  grid: { wide: number; tall: number };
  colors: PaletteColor[];
  blockSelection: BlockSelection;
  mode: '2d' | '3d';
  buildTechnique: 'standard' | 'suppression_two_layer';
  minecraftVersion: MinecraftVersion;
  supportBlock: string;
  dithering: DitheringMode;
  intensity: number;
  bnScale?: number;
  colorMatch: 'oklab' | 'rgb';
}

export async function getClassicCloudAccount() {
  await initializeSupabase();
  return getCurrentCompanionAuthUser();
}

export async function saveClassicToCloud(input: ClassicCloudSaveInput): Promise<string> {
  await initializeSupabase();
  const account = await getCurrentCompanionAuthUser();
  if (!account) throw new Error('Sign in to MapKluss before saving.');

  const { wide, tall } = input.grid;
  const bnScale = input.bnScale ?? 2;
  if (![1, 2].includes(bnScale)) throw new Error('Invalid Blue Noise scale.');
  const width = wide * 128;
  const height = tall * 128;
  if (!Number.isInteger(wide) || !Number.isInteger(tall) || wide < 1 || tall < 1
    || wide > 16 || tall > 16 || wide * tall > 64
    || input.pixels.length !== width * height * 4 || input.colors.length === 0) {
    throw new Error('The Classic preview is not ready for Cloud save.');
  }
  const title = input.title.trim().slice(0, 80);
  if (!title) throw new Error('Give the art a name before saving.');

  const imageData = new ImageData(new Uint8ClampedArray(input.pixels), width, height);
  const palette = buildComputedPalette(input.colors, input.colorMatch);
  const layerId = crypto.randomUUID();
  const projectJson = JSON.stringify({
    version: 4,
    project: {
      version: 1,
      grid: input.grid,
      activeLayerId: layerId,
      layers: [{
        id: layerId,
        name: title,
        visible: true,
        locked: false,
        groupId: null,
        imageDataB64: imageDataToBase64(imageData),
        width,
        height,
        opacity: 100,
        buildMode: input.mode === '3d' ? '3d-optimized' : '2d',
        mapMode: input.mode,
        staircaseMode: 'optimized',
        isDirty: true,
      }],
    },
    groups: [],
    settings: {
      dithering: input.dithering,
      intensity: input.intensity,
      blockSelection: input.blockSelection,
      adjustments: { brightness: 0, contrast: 0, saturation: 0, red: 0, green: 0, blue: 0 },
      colorMatch: input.colorMatch,
      mapMode: input.mode,
      staircaseMode: 'optimized',
      bnScale,
      minecraftVersion: input.minecraftVersion,
      platformMode: 'java',
      buildTechnique: input.buildTechnique,
      supportBlock: input.supportBlock,
      supportMode: 1,
    },
  });

  const saved = await saveCompanionArt({
    title,
    privacy: 'private',
    projectJson,
    imageData,
    previewImageData: imageData,
    grid: input.grid,
    mode: input.mode,
    staircaseMode: 'optimized',
    supportBlock: input.supportBlock,
    supportMode: 1,
    palette,
    blockSelection: input.blockSelection,
    minecraftVersion: input.minecraftVersion,
    dithering: input.dithering,
    intensity: input.intensity,
    bnScale,
    platformMode: 'java',
    buildTechnique: input.buildTechnique,
  });
  return saved.artId;
}

// This file is a separate Vite entry. Expose the bridge as a browser side effect,
// since application entry exports are otherwise removed by the production bundler.
(window as typeof window & { MapKlussClassicCloud?: {
  getClassicCloudAccount: typeof getClassicCloudAccount;
  saveClassicToCloud: typeof saveClassicToCloud;
} }).MapKlussClassicCloud = { getClassicCloudAccount, saveClassicToCloud };
