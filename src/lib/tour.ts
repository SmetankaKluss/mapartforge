import { driver, type DriveStep, type Driver } from 'driver.js';
import { flushSync } from 'react-dom';

const TOUR_VERSION = 2;
const OFFER_KEY = `mapkluss_tour_v${TOUR_VERSION}_offer_dismissed`;
const LEGACY_BASIC_KEY = 'mapkluss_tour_basic_done';

type Tab = 'settings' | 'palette' | 'export';
type TourStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type TourType = 'first-art' | 'editing' | 'building';

export interface TourOptions {
  lang?: 'ru' | 'en';
  switchTab?: (tab: Tab) => void;
  onComplete?: (tourType: TourType) => void;
  onDismiss?: (tourType: TourType) => void;
}

function storageKey(tourType: TourType): string {
  return `mapkluss_tour_v${TOUR_VERSION}_${tourType}_done`;
}

function browserStorage(): TourStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function safeRead(key: string, storage = browserStorage()): boolean {
  try {
    return storage?.getItem(key) === '1' || storage?.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function safeWrite(key: string, storage = browserStorage()): void {
  try {
    storage?.setItem(key, '1');
  } catch {
    // Tours remain optional when local storage is blocked.
  }
}

export function shouldAutoStart(storage = browserStorage()): boolean {
  if (!storage) return false;
  return !safeRead(OFFER_KEY, storage)
    && !safeRead(storageKey('first-art'), storage)
    && !safeRead(LEGACY_BASIC_KEY, storage);
}

export function markTourOfferDismissed(storage = browserStorage()): void {
  safeWrite(OFFER_KEY, storage);
}

export function isTourDone(tourType: TourType, storage = browserStorage()): boolean {
  return safeRead(storageKey(tourType), storage);
}

export function markTourDone(tourType: TourType, storage = browserStorage()): void {
  safeWrite(storageKey(tourType), storage);
  safeWrite(OFFER_KEY, storage);
}

function documentationLink(article: string, lang: 'ru' | 'en'): string {
  const label = lang === 'ru' ? 'Подробнее в Wiki' : 'Read more in the Wiki';
  return `<a class="tour-doc-link" href="/wiki#${article}" target="_blank" rel="noreferrer">${label} ↗</a>`;
}

function createSteps(tourType: TourType, lang: 'ru' | 'en', switchTab?: (tab: Tab) => void): DriveStep[] {
  const t = (ru: string, en: string) => lang === 'ru' ? ru : en;
  const switchSync = (tab: Tab) => {
    if (!switchTab) return;
    flushSync(() => switchTab(tab));
  };
  const step = (
    element: string,
    tab: Tab,
    titleRu: string,
    titleEn: string,
    bodyRu: string,
    bodyEn: string,
    article: string,
    side: 'top' | 'right' | 'bottom' | 'left' = 'right',
  ): DriveStep => ({
    element: `[data-tour="${element}"]`,
    onHighlightStarted: () => switchSync(tab),
    popover: {
      title: t(titleRu, titleEn),
      description: `${t(bodyRu, bodyEn)}${documentationLink(article, lang)}`,
      side,
      align: 'center',
    },
  });

  if (tourType === 'editing') {
    return [
      step('toolbar', 'settings', 'Выбери инструмент', 'Choose a tool',
        'Здесь находятся отмена, кисть, заливка, выделения, паттерн, градиент, текст и режимы просмотра. Наведи на кнопку, чтобы увидеть горячую клавишу.',
        'Undo, brush, fill, selections, pattern, gradient, text, and view modes live here. Hover a button to see its shortcut.',
        'editing-tools', 'bottom'),
      step('tool-context', 'settings', 'Только нужные настройки', 'Only relevant settings',
        'Контекстная строка меняется вместе с инструментом: размер кисти, блок, оттенок, точки градиента или параметры выделения не смешиваются в одну панель.',
        'The context bar follows the active tool. Brush size, block, shade, gradient stops, and selection settings do not compete in one panel.',
        'editing-tools', 'bottom'),
      step('canvas', 'settings', 'Работай прямо на арте', 'Work directly on the art',
        'Ctrl/⌘ + колесо плавно приближает. Space + ЛКМ временно двигает холст из любого инструмента. Обычный клик курсором открывает действия пикселя.',
        'Ctrl/⌘ + wheel zooms smoothly. Space + LMB temporarily pans from any tool. A normal cursor click opens pixel actions.',
        'editing-tools', 'top'),
      step('adjustments', 'settings', 'Исправляй исходник точно', 'Tune the source precisely',
        'Меняй яркость, контраст и каналы небольшими шагами. Удерживай − или + для ускорения, затем оцени детали на холсте.',
        'Change brightness, contrast, and channels in small steps. Hold − or + to accelerate, then inspect fine details on the canvas.',
        'image-processing', 'right'),
      step('palette-panel', 'palette', 'Палитра и слои', 'Palette and layers',
        'Здесь выбираются версия Minecraft, доступные блоки и пресеты. В режиме художника сверху появляются слои, группы, видимость и блокировка.',
        'Choose the Minecraft version, available blocks, and presets here. Artist mode adds layers, groups, visibility, and locking above the palette.',
        'palette-versions', 'left'),
    ];
  }

  if (tourType === 'building') {
    return [
      step('build-mode', 'settings', 'Сначала выбери способ стройки', 'Choose the build method first',
        '2D проще всего. 3D даёт больше оттенков обычными лестницами. Two-layer сохраняет качество 3D, а Companion ведёт пошаговый демонтаж.',
        '2D is the simplest. 3D adds shades with standard stair geometry. Two-layer keeps 3D quality while Companion guides the removal phases.',
        'build-modes', 'right'),
      step('minecraft-version', 'palette', 'Версия должна совпадать', 'Match the Minecraft version',
        'Версия управляет доступными блоками и метаданными файлов. Для Companion выбирай тот же релиз, что установлен в игре.',
        'The version controls available blocks and file metadata. For Companion, select the same release that is installed in Minecraft.',
        'palette-versions', 'left'),
      step('palette-panel', 'palette', 'Проверь материалы до экспорта', 'Review materials before export',
        'Убери недоступные блоки или примени пресет. Больше цветов обычно улучшает результат, но усложняет сбор ресурсов.',
        'Remove unavailable blocks or apply a preset. More colours usually improve the result but make resource gathering harder.',
        'palette-versions', 'left'),
      step('materials', 'export', 'Список считается автоматически', 'Materials update automatically',
        'Смотри точное количество блоков, стеков и шалкеров. Для больших артов можно оценить максимум на одну карту.',
        'See exact block, stack, and shulker counts. For large arts, you can inspect the maximum needed for one map.',
        'export-files', 'left'),
      step('export', 'export', 'Выбери результат под задачу', 'Choose the right output',
        'PNG — превью, MAP.DAT — данные карт, Litematic — схема. Two-layer создаёт проверяемый ZIP с планом всех частей.',
        'PNG is a preview, MAP.DAT contains map data, and Litematic is a schematic. Two-layer creates a verified ZIP with every tile plan.',
        'export-files', 'left'),
      step('cloud', 'settings', 'Cloud передаёт арт в Companion', 'Cloud hands the art to Companion',
        'Сохрани арт в аккаунт, чтобы открыть его в моде без ручного переноса файлов. Здесь же запускается Lens.',
        'Save the art to your account to open it in the mod without manual file transfer. Lens also starts here.',
        'cloud-companion', 'bottom'),
    ];
  }

  return [
    step('upload', 'settings', 'Начни с изображения', 'Start with an image',
      'Нажми, перетащи файл или вставь через Ctrl/⌘+V. Поддерживаются PNG, JPG, WebP, GIF и MAP.DAT.',
      'Click, drop a file, or paste with Ctrl/⌘+V. PNG, JPG, WebP, GIF, and MAP.DAT are supported.',
      'first-art', 'right'),
    step('map-size', 'settings', 'Одна карта — 128×128', 'One map is 128×128',
      'Для первого арта выбери 1×1 или 2×2. Большая сетка сохраняет больше деталей, но требует больше памяти и блоков.',
      'For a first art, choose 1×1 or 2×2. A larger grid keeps more detail but requires more memory and blocks.',
      'image-processing', 'right'),
    step('build-mode', 'settings', 'Выбери способ строительства', 'Choose a build method',
      '2D — плоско и просто. 3D — больше оттенков с перепадами высоты. Two-layer — отдельный пошаговый способ с Companion.',
      '2D is flat and simple. 3D adds shades with height changes. Two-layer is a separate guided Companion workflow.',
      'build-modes', 'right'),
    step('dithering', 'settings', 'Подбери характер изображения', 'Choose the image character',
      'Floyd–Steinberg — надёжный старт для фото, KlussDither часто лучше для иллюстраций. Переключай варианты и сравнивай холст.',
      'Floyd–Steinberg is a reliable start for photos; KlussDither often suits illustrations. Switch methods and compare the canvas.',
      'image-processing', 'right'),
    step('canvas', 'settings', 'Проверь важные детали', 'Inspect important details',
      'Приблизь лицо, контуры и тени. Сравнение показывает оригинал и обработанный результат, а наведение — точный блок пикселя.',
      'Zoom into faces, edges, and shadows. Compare shows the source and result; hover reveals the exact block for a pixel.',
      'editing-tools', 'top'),
    step('palette-panel', 'palette', 'Оставь только доступные блоки', 'Keep only available blocks',
      'Выбери версию Minecraft и отключи блоки, которых у тебя нет. Не сужай палитру без причины: это уменьшает точность цвета.',
      'Choose the Minecraft version and disable blocks you cannot use. Do not narrow the palette without a reason; it reduces colour accuracy.',
      'palette-versions', 'left'),
    step('export', 'export', 'Готово к экспорту', 'Ready to export',
      'Скачай PNG для проверки, MAP.DAT для карт или Litematic для строительства. Полная справка всегда доступна через Wiki в шапке.',
      'Download PNG for review, MAP.DAT for maps, or Litematic for building. The full Wiki is always available from the header.',
      'export-files', 'left'),
  ];
}

export function createTour(tourType: TourType, options: TourOptions = {}): Driver {
  const lang = options.lang ?? 'ru';
  let completed = false;
  let dismissalReported = false;

  const reportDismissal = () => {
    if (completed || dismissalReported) return;
    dismissalReported = true;
    markTourOfferDismissed();
    options.onDismiss?.(tourType);
  };

  return driver({
    steps: createSteps(tourType, lang, options.switchTab),
    animate: true,
    smoothScroll: true,
    allowClose: true,
    allowKeyboardControl: true,
    overlayClickBehavior: 'close',
    overlayOpacity: 0.76,
    stagePadding: 7,
    stageRadius: 0,
    popoverOffset: 12,
    popoverClass: `mapkluss-tour mapkluss-tour--${tourType}`,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: lang === 'ru' ? 'Далее' : 'Next',
    prevBtnText: lang === 'ru' ? 'Назад' : 'Back',
    doneBtnText: lang === 'ru' ? 'Завершить' : 'Finish',
    onNextClick: (_, __, { driver: activeDriver }) => {
      if (!activeDriver.isLastStep()) {
        activeDriver.moveNext();
        return;
      }
      completed = true;
      markTourDone(tourType);
      options.onComplete?.(tourType);
      activeDriver.destroy();
    },
    onCloseClick: (_, __, { driver: activeDriver }) => {
      reportDismissal();
      activeDriver.destroy();
    },
    onDestroyed: reportDismissal,
  });
}
