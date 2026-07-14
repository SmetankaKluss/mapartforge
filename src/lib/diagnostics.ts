import type { BlockSelection } from './paletteBlocks';
import type { ImageAdjustments } from './adjustments';
import type { DitheringMode } from './dithering';
import type { MapGrid } from './types';

interface DiagnosticSettings {
  dithering: DitheringMode;
  intensity: number;
  mapGrid: MapGrid;
  blockSelection: BlockSelection;
  adjustments: ImageAdjustments;
  mapMode: '2d' | '3d';
  staircaseMode: 'classic' | 'optimized';
  bnScale: number;
  compareMode?: boolean;
  artistMode?: boolean;
  paletteSize?: number;
}

interface DiagnosticCaptureOptions {
  action: string;
  previewData: ImageData;
  settings: DiagnosticSettings;
  sourceImage?: HTMLImageElement | null;
}

export async function uploadDiagnosticCapture(options: DiagnosticCaptureOptions): Promise<void> {
  void options;
  return;
}
