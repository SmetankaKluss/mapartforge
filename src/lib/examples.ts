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
  minecraftUrl: string;
  mode: '2d' | '3d';
  size: '1x1' | '2x2' | '4x4';
  colors: number;
  materials: string[];
  trySettings: {
    dithering: DitheringMode;
    intensity: number;
    mapGrid: MapGrid;
    mapMode: '2d' | '3d';
    staircaseMode: 'classic' | 'optimized';
    bnScale: number;
  };
}

export const EXAMPLES: ExampleProject[] = [
  {
    id: 'anime-portrait',
    titleRu: 'Аниме-портрет 1x1',
    titleEn: 'Anime Portrait 1x1',
    descriptionRu: 'Компактный портрет для одной карты с чистыми краями и простой палитрой.',
    descriptionEn: 'A compact single-map portrait with clean edges and a simple palette.',
    originalUrl: '/examples/anime-portrait/original.png',
    previewUrl: '/examples/anime-portrait/mapkluss.png',
    minecraftUrl: '/examples/anime-portrait/minecraft.png',
    mode: '2d',
    size: '1x1',
    colors: 61,
    materials: ['White Wool', 'Black Wool', 'Pink Wool', 'Light Gray Wool'],
    trySettings: {
      dithering: 'kluss',
      intensity: 92,
      mapGrid: { wide: 1, tall: 1 },
      mapMode: '2d',
      staircaseMode: 'classic',
      bnScale: 1,
    },
  },
  {
    id: 'anime-illustration',
    titleRu: 'Иллюстрация 3D 2x2',
    titleEn: '3D Illustration 2x2',
    descriptionRu: 'Больше оттенков за счёт 3D staircase, подходит для ярких артов.',
    descriptionEn: 'More shades through 3D staircase mode, useful for colourful artwork.',
    originalUrl: '/examples/anime-illustration/original.png',
    previewUrl: '/examples/anime-illustration/mapkluss.png',
    minecraftUrl: '/examples/anime-illustration/minecraft.png',
    mode: '3d',
    size: '2x2',
    colors: 183,
    materials: ['Terracotta', 'Wool', 'Gold', 'Quartz'],
    trySettings: {
      dithering: 'blue-noise',
      intensity: 88,
      mapGrid: { wide: 2, tall: 2 },
      mapMode: '3d',
      staircaseMode: 'optimized',
      bnScale: 1,
    },
  },
  {
    id: 'logo-flat',
    titleRu: 'Логотип без лишнего шума',
    titleEn: 'Clean Logo Conversion',
    descriptionRu: 'Плоские цвета, минимум зерна, хороший вариант для эмблем и серверных логотипов.',
    descriptionEn: 'Flat colours with minimal noise, ideal for emblems and server logos.',
    originalUrl: '/examples/logo-flat/original.png',
    previewUrl: '/examples/logo-flat/mapkluss.png',
    minecraftUrl: '/examples/logo-flat/minecraft.png',
    mode: '2d',
    size: '1x1',
    colors: 61,
    materials: ['Black Wool', 'Lime Wool', 'Green Wool', 'Deepslate'],
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
    id: 'landscape-photo',
    titleRu: 'Фото / пейзаж 3D',
    titleEn: 'Photo / Landscape 3D',
    descriptionRu: '3D режим помогает передать плавные световые переходы и глубину.',
    descriptionEn: '3D mode helps preserve smooth light transitions and depth.',
    originalUrl: '/examples/landscape-photo/original.png',
    previewUrl: '/examples/landscape-photo/mapkluss.png',
    minecraftUrl: '/examples/landscape-photo/minecraft.png',
    mode: '3d',
    size: '2x2',
    colors: 183,
    materials: ['Stone', 'Dirt', 'Grass', 'Water'],
    trySettings: {
      dithering: 'stucki',
      intensity: 82,
      mapGrid: { wide: 2, tall: 2 },
      mapMode: '3d',
      staircaseMode: 'optimized',
      bnScale: 2,
    },
  },
  {
    id: 'large-showcase',
    titleRu: 'Большой showcase 4x4',
    titleEn: 'Large Showcase 4x4',
    descriptionRu: 'Формат для больших построек, где важны детализация и эффект в Minecraft.',
    descriptionEn: 'A large build format focused on detail and in-game presentation.',
    originalUrl: '/examples/large-showcase/original.png',
    previewUrl: '/examples/large-showcase/mapkluss.png',
    minecraftUrl: '/examples/large-showcase/minecraft.png',
    mode: '3d',
    size: '4x4',
    colors: 183,
    materials: ['Terracotta', 'Concrete', 'Wool', 'Quartz'],
    trySettings: {
      dithering: 'blue-noise',
      intensity: 78,
      mapGrid: { wide: 4, tall: 4 },
      mapMode: '3d',
      staircaseMode: 'optimized',
      bnScale: 1,
    },
  },
  {
    id: 'pixel-art',
    titleRu: 'Пиксель-арт 1x1',
    titleEn: 'Pixel Art 1x1',
    descriptionRu: 'Чёткая стилизация для маленьких картинок, иконок и ретро-арта.',
    descriptionEn: 'A crisp style for small images, icons, and retro pixel art.',
    originalUrl: '/examples/pixel-art/original.png',
    previewUrl: '/examples/pixel-art/mapkluss.png',
    minecraftUrl: '/examples/pixel-art/minecraft.png',
    mode: '2d',
    size: '1x1',
    colors: 61,
    materials: ['Black Wool', 'Green Wool', 'Lime Wool', 'Gray Wool'],
    trySettings: {
      dithering: 'yliluoma2',
      intensity: 100,
      mapGrid: { wide: 1, tall: 1 },
      mapMode: '2d',
      staircaseMode: 'classic',
      bnScale: 2,
    },
  },
];

export function getExampleById(id: string | null): ExampleProject | undefined {
  if (!id) return undefined;
  return EXAMPLES.find(example => example.id === id);
}
