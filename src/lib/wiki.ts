export type WikiArticleId =
  | 'welcome'
  | 'first-art'
  | 'image-processing'
  | 'build-modes'
  | 'palette-versions'
  | 'editing-tools'
  | 'layers-projects'
  | 'export-files'
  | 'cloud-companion'
  | 'lens'
  | 'two-layer'
  | 'shortcuts'
  | 'troubleshooting';

export type WikiGroupId = 'start' | 'editor' | 'build' | 'reference';

export interface WikiArticleMeta {
  id: WikiArticleId;
  group: WikiGroupId;
  titleRu: string;
  titleEn: string;
  summaryRu: string;
  summaryEn: string;
  keywords: string[];
}

export interface WikiGroupMeta {
  id: WikiGroupId;
  titleRu: string;
  titleEn: string;
}

export const WIKI_GROUPS: WikiGroupMeta[] = [
  { id: 'start', titleRu: 'Начало работы', titleEn: 'Get started' },
  { id: 'editor', titleRu: 'Редактор', titleEn: 'Editor' },
  { id: 'build', titleRu: 'Постройка и Companion', titleEn: 'Building & Companion' },
  { id: 'reference', titleRu: 'Справка', titleEn: 'Reference' },
];

export const WIKI_ARTICLES: WikiArticleMeta[] = [
  {
    id: 'welcome',
    group: 'start',
    titleRu: 'Обзор MapKluss',
    titleEn: 'MapKluss overview',
    summaryRu: 'Что умеют редактор, Cloud и Companion и с чего лучше начать.',
    summaryEn: 'What the editor, Cloud, and Companion do and where to begin.',
    keywords: ['overview', 'обзор', 'mapkluss', 'возможности', 'features'],
  },
  {
    id: 'first-art',
    group: 'start',
    titleRu: 'Первый арт за 5 минут',
    titleEn: 'Your first art in 5 minutes',
    summaryRu: 'Короткий путь от изображения до PNG, MAP.DAT или Litematic.',
    summaryEn: 'The shortest path from an image to PNG, MAP.DAT, or Litematic.',
    keywords: ['start', 'начало', 'upload', 'загрузка', 'первый арт', 'quickstart'],
  },
  {
    id: 'image-processing',
    group: 'editor',
    titleRu: 'Размер и обработка изображения',
    titleEn: 'Size and image processing',
    summaryRu: 'Сетка карт, обрезка, коррекция, подбор цвета и дизеринг.',
    summaryEn: 'Map grid, crop, adjustments, colour matching, and dithering.',
    keywords: ['size', 'размер', 'crop', 'обрезка', 'dither', 'дизеринг', 'oklab', 'contrast'],
  },
  {
    id: 'build-modes',
    group: 'editor',
    titleRu: '2D, 3D и Two-layer',
    titleEn: '2D, 3D, and Two-layer',
    summaryRu: 'Как выбрать способ строительства под качество, время и материалы.',
    summaryEn: 'Choose a build method for the right quality, time, and material cost.',
    keywords: ['2d', '3d', 'two-layer', 'режим', 'лестницы', 'suppression'],
  },
  {
    id: 'palette-versions',
    group: 'editor',
    titleRu: 'Палитра и версии Minecraft',
    titleEn: 'Palette and Minecraft versions',
    summaryRu: 'Блоки, пресеты, ограничения версий Java и Bedrock.',
    summaryEn: 'Blocks, presets, and Java or Bedrock version limits.',
    keywords: ['palette', 'палитра', 'blocks', 'блоки', '26.2', '1.21.11', 'bedrock', 'preset'],
  },
  {
    id: 'editing-tools',
    group: 'editor',
    titleRu: 'Инструменты редактирования',
    titleEn: 'Editing tools',
    summaryRu: 'Курсор, кисть, заливка, выделения, паттерн, градиент и текст.',
    summaryEn: 'Cursor, brush, fill, selections, pattern, gradient, and text.',
    keywords: ['tools', 'инструменты', 'brush', 'кисть', 'pattern', 'gradient', 'selection', 'text'],
  },
  {
    id: 'layers-projects',
    group: 'editor',
    titleRu: 'Слои и локальные проекты',
    titleEn: 'Layers and local projects',
    summaryRu: 'Режим художника, группы, блокировка и сохранение .mapkluss.',
    summaryEn: 'Artist mode, groups, locking, and .mapkluss project files.',
    keywords: ['layers', 'слои', 'artist', 'project', 'проект', 'mapkluss file'],
  },
  {
    id: 'export-files',
    group: 'build',
    titleRu: 'Экспорт и файлы',
    titleEn: 'Export and files',
    summaryRu: 'PNG, MAP.DAT, Litematic, ZIP, структуры и datapack.',
    summaryEn: 'PNG, MAP.DAT, Litematic, ZIP, structures, and datapacks.',
    keywords: ['export', 'экспорт', 'png', 'map.dat', 'litematic', 'zip', 'datapack', 'structure'],
  },
  {
    id: 'cloud-companion',
    group: 'build',
    titleRu: 'Cloud и MapKluss Companion',
    titleEn: 'Cloud and MapKluss Companion',
    summaryRu: 'Как сохранить арт в аккаунт и открыть его прямо в моде.',
    summaryEn: 'Save an art to your account and open it directly in the mod.',
    keywords: ['cloud', 'облако', 'companion', 'мод', 'account', 'аккаунт', 'login'],
  },
  {
    id: 'lens',
    group: 'build',
    titleRu: 'Lens: фантомный арт в мире',
    titleEn: 'Lens: a phantom art in your world',
    summaryRu: 'Привязка полотна и синхронный просмотр результата из редактора.',
    summaryEn: 'Anchor a canvas and preview the editor result inside Minecraft.',
    keywords: ['lens', 'линз', 'фантомный', 'preview', 'превью', 'realtime'],
  },
  {
    id: 'two-layer',
    group: 'build',
    titleRu: 'Two-layer Builder',
    titleEn: 'Two-layer Builder',
    summaryRu: 'Полное качество 3D без постоянных длинных лестниц.',
    summaryEn: 'Full 3D colour quality without permanent long staircases.',
    keywords: ['two-layer', 'suppression', 'два слоя', 'строительство', 'builder', 'litematica'],
  },
  {
    id: 'shortcuts',
    group: 'reference',
    titleRu: 'Горячие клавиши',
    titleEn: 'Keyboard shortcuts',
    summaryRu: 'Быстрые клавиши редактора, выделения и навигации по холсту.',
    summaryEn: 'Fast keys for editing, selections, and canvas navigation.',
    keywords: ['shortcuts', 'клавиши', 'hotkeys', 'keyboard', 'ctrl', 'space'],
  },
  {
    id: 'troubleshooting',
    group: 'reference',
    titleRu: 'Если что-то не работает',
    titleEn: 'Troubleshooting',
    summaryRu: 'Загрузка, производительность, экспорт, Cloud и обращение за помощью.',
    summaryEn: 'Upload, performance, export, Cloud, and getting help.',
    keywords: ['help', 'помощь', 'error', 'ошибка', 'troubleshooting', 'не работает'],
  },
];

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getWikiArticle(id: string | null | undefined): WikiArticleMeta {
  return WIKI_ARTICLES.find(article => article.id === id) ?? WIKI_ARTICLES[0];
}

export function getWikiArticleFromHash(hash: string): WikiArticleMeta {
  return getWikiArticle(hash.replace(/^#/, '').split('/')[0]);
}

export function getWikiArticleFromPath(pathname: string): WikiArticleMeta {
  const match = pathname.match(/^\/wiki(?:\/([a-z0-9-]+))?\/?$/i);
  return getWikiArticle(match?.[1]);
}

export function isWikiPath(pathname: string): boolean {
  return /^\/wiki(?:\/[a-z0-9-]+)?\/?$/i.test(pathname);
}

export function searchWiki(query: string, lang: 'ru' | 'en'): WikiArticleMeta[] {
  const needle = normalize(query);
  if (!needle) return WIKI_ARTICLES;

  return WIKI_ARTICLES
    .map((article, index) => {
      const title = normalize(lang === 'ru' ? article.titleRu : article.titleEn);
      const otherTitle = normalize(lang === 'ru' ? article.titleEn : article.titleRu);
      const summary = normalize(lang === 'ru' ? article.summaryRu : article.summaryEn);
      const keywords = normalize(article.keywords.join(' '));
      const score = title === needle
        ? 100
        : title.startsWith(needle)
          ? 80
          : title.includes(needle)
            ? 60
            : otherTitle.includes(needle)
              ? 45
              : keywords.includes(needle)
                ? 35
                : summary.includes(needle)
                  ? 20
                  : 0;
      return { article, score, index };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(result => result.article);
}
