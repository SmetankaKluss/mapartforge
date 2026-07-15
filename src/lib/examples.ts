import type { DitheringMode } from './dithering';
import type { MapGrid } from './types';

export interface ExampleProject {
  id: string;
  titleRu: string;
  titleEn: string;
  descriptionRu: string;
  descriptionEn: string;
  originalUrl: string;
  previewUrl: string;
  sourceNameRu: string;
  sourceNameEn: string;
  sourcePageUrl?: string;
  licenseLabelRu: string;
  licenseLabelEn: string;
  licenseUrl?: string;
  mode: '2d' | '3d';
  size: '1x1' | '1x2' | '2x2';
  colors: number;
  paletteHints: string[];
  trySettings: {
    dithering: DitheringMode;
    intensity: number;
    mapGrid: MapGrid;
    mapMode: '2d' | '3d';
    staircaseMode: 'classic' | 'optimized';
    bnScale: number;
  };
}

const PUBLIC_DOMAIN_MARK = 'https://creativecommons.org/publicdomain/mark/1.0/';

export const EXAMPLES: ExampleProject[] = [
  {
    id: 'mapkluss-logo',
    titleRu: 'Логотип: чистые края 1×1',
    titleEn: 'Logo: clean edges at 1×1',
    descriptionRu: 'Собственный логотип MapKluss показывает, когда лучше отключить дизеринг и сохранить крупные формы.',
    descriptionEn: 'The MapKluss logo shows when disabling dithering preserves bold shapes and clean edges.',
    originalUrl: '/examples/mapkluss-logo/source.png',
    previewUrl: '/examples/mapkluss-logo/result.png',
    sourceNameRu: 'Оригинальный логотип MapKluss',
    sourceNameEn: 'Original MapKluss logo',
    licenseLabelRu: 'Собственный материал MapKluss',
    licenseLabelEn: 'Original MapKluss material',
    mode: '2d',
    size: '1x1',
    colors: 61,
    paletteHints: ['Lime Wool', 'Black Wool', 'Gray Wool'],
    trySettings: {
      dithering: 'none',
      intensity: 100,
      mapGrid: { wide: 1, tall: 1 },
      mapMode: '2d',
      staircaseMode: 'classic',
      bnScale: 2,
    },
  },
  {
    id: 'great-wave',
    titleRu: 'Большая волна: детали 2×2',
    titleEn: 'Great Wave: detail at 2×2',
    descriptionRu: 'Blue Noise удерживает тонкие линии гравюры и не превращает светлое небо в регулярную сетку.',
    descriptionEn: 'Blue Noise retains the print’s fine lines without turning the pale sky into a regular pattern.',
    originalUrl: '/examples/great-wave/source.webp',
    previewUrl: '/examples/great-wave/result.png',
    sourceNameRu: 'Кацусика Хокусай — «Большая волна в Канагаве»',
    sourceNameEn: 'Katsushika Hokusai — The Great Wave at Kanagawa',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:The_Great_Wave_at_Kanagawa.jpg',
    licenseLabelRu: 'Общественное достояние',
    licenseLabelEn: 'Public domain',
    licenseUrl: PUBLIC_DOMAIN_MARK,
    mode: '2d',
    size: '2x2',
    colors: 61,
    paletteHints: ['Blue Wool', 'White Wool', 'Sandstone', 'Black Wool'],
    trySettings: {
      dithering: 'blue-noise',
      intensity: 100,
      mapGrid: { wide: 2, tall: 2 },
      mapMode: '2d',
      staircaseMode: 'classic',
      bnScale: 1,
    },
  },
  {
    id: 'starry-night',
    titleRu: 'Звёздная ночь: оттенки 3D',
    titleEn: 'The Starry Night: 3D shades',
    descriptionRu: '3D Stair и Stucki сохраняют движение мазков и расширяют диапазон синего и жёлтого.',
    descriptionEn: '3D Stair with Stucki preserves the brushwork’s motion and expands the blue and yellow range.',
    originalUrl: '/examples/starry-night/source.webp',
    previewUrl: '/examples/starry-night/result.png',
    sourceNameRu: 'Винсент ван Гог — «Звёздная ночь»',
    sourceNameEn: 'Vincent van Gogh — The Starry Night',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_Starry_Night.jpg',
    licenseLabelRu: 'Общественное достояние',
    licenseLabelEn: 'Public domain',
    licenseUrl: PUBLIC_DOMAIN_MARK,
    mode: '3d',
    size: '2x2',
    colors: 183,
    paletteHints: ['Blue Terracotta', 'Lapis Block', 'Yellow Wool', 'Black Wool'],
    trySettings: {
      dithering: 'stucki',
      intensity: 100,
      mapGrid: { wide: 2, tall: 2 },
      mapMode: '3d',
      staircaseMode: 'classic',
      bnScale: 2,
    },
  },
  {
    id: 'pearl-portrait',
    titleRu: 'Портрет: вертикальный формат 1×2',
    titleEn: 'Portrait: vertical 1×2 format',
    descriptionRu: 'Вертикальная сетка сохраняет силуэт и лицо, а KlussDither смягчает переходы без потери глаз и украшения.',
    descriptionEn: 'A vertical grid keeps the silhouette and face, while KlussDither softens transitions without losing the eyes or earring.',
    originalUrl: '/examples/pearl-portrait/source.webp',
    previewUrl: '/examples/pearl-portrait/result.png',
    sourceNameRu: 'Ян Вермеер — «Девушка с жемчужной серёжкой»',
    sourceNameEn: 'Johannes Vermeer — Girl with a Pearl Earring',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Girl_with_a_Pearl_Earring.jpg',
    licenseLabelRu: 'Общественное достояние',
    licenseLabelEn: 'Public domain',
    licenseUrl: PUBLIC_DOMAIN_MARK,
    mode: '3d',
    size: '1x2',
    colors: 183,
    paletteHints: ['Blue Terracotta', 'Yellow Terracotta', 'Black Wool', 'White Wool'],
    trySettings: {
      dithering: 'kluss',
      intensity: 100,
      mapGrid: { wide: 1, tall: 2 },
      mapMode: '3d',
      staircaseMode: 'classic',
      bnScale: 2,
    },
  },
];

export function getExampleById(id: string | null): ExampleProject | undefined {
  if (!id) return undefined;
  return EXAMPLES.find(example => example.id === id);
}

export function isExamplesIndexPath(path: string): boolean {
  return /^\/examples\/?$/i.test(path);
}

export function getExampleByPath(path: string): ExampleProject | undefined {
  const match = path.match(/^\/examples\/([a-z0-9-]+)\/?$/i);
  return getExampleById(match?.[1] ?? null);
}
