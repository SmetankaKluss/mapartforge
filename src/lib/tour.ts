import { driver } from 'driver.js';
import { flushSync } from 'react-dom';

const BASIC_TOUR_KEY = 'mapkluss_basic_tour_done';
const ADVANCED_TOUR_KEY = 'mapkluss_advanced_tour_done';

const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

type Tab = 'settings' | 'palette' | 'export';

export type TourType = 'basic' | 'advanced';

/**
 * Basic tour: Essential features for newcomers
 * Covers: upload, grid, mode, dithering, adjustments, preview, toolbar basics, export
 */
function createBasicTour(switchTab?: (tab: Tab) => void, lang: 'ru' | 'en' = 'ru') {
  const ru = (r: string, e: string) => lang === 'ru' ? r : e;
  const switchSync = (tab: Tab) => {
    if (!isMobile() || !switchTab) return;
    flushSync(() => switchTab(tab));
  };

  const d = driver({
    animate: true,
    smoothScroll: true,
    allowClose: true,
    overlayOpacity: 0.7,
    stagePadding: 6,
    stageRadius: 2,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: ru('ДАЛЕЕ ›', 'NEXT ›'),
    prevBtnText: ru('‹ НАЗАД', '‹ BACK'),
    doneBtnText: ru('ГОТОВО ✓', 'DONE ✓'),
    onDestroyStarted: () => {
      localStorage.setItem(BASIC_TOUR_KEY, 'true');
      d.destroy();
    },
    steps: [
      // ── 1. Upload ──────────────────────────────────────────────────────────
      {
        element: '.upload-zone',
        popover: {
          title: ru('1. ЗАГРУЗИ ИЗОБРАЖЕНИЕ', '1. LOAD YOUR IMAGE'),
          description: ru(
            'Перетащи любое изображение сюда, нажми для выбора файла или нажми <b>Ctrl+V</b> для вставки из буфера обмена. ' +
            'PNG, JPG, WebP — любой размер подойдёт, изображение будет масштабировано под сетку карт.',
            'Drop any image here, click to browse, or press <b>Ctrl+V</b> to paste from clipboard. ' +
            'PNG, JPG, WebP — any size works, the image will be scaled to fit the map grid.',
          ),
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 2. Map grid ────────────────────────────────────────────────────────
      {
        element: '.grid-options',
        popover: {
          title: ru('2. РАЗМЕР КАРТЫ', '2. MAP SIZE'),
          description: ru(
            'Каждая карта Minecraft — это <b>128×128 блоков</b>. Выбери, сколько карт займёт твой арт — ' +
            '1×1 — одна карта, 2×3 — холст 256×384 блока. ' +
            'Больше сетка = больше деталей, но и больше блоков нужно.',
            'Each Minecraft map is <b>128×128 blocks</b>. Choose how many maps your art spans — ' +
            '1×1 is a single map, 2×3 gives you a 256×384 block canvas. ' +
            'Larger grids = more detail but more blocks to build.',
          ),
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 3. 2D / 3D mode ───────────────────────────────────────────────────
      {
        element: '.mode-toggle',
        popover: {
          title: ru('3. РЕЖИМ ПОСТРОЙКИ', '3. BUILD MODE'),
          description: ru(
            '<b>2D Flat</b> — все блоки на одном уровне, ~61 цвет. Просто строить в выживании. ' +
            '<b>3D Staircase</b> — блоки на разных высотах создают 3 оттенка на цвет, итого ~183 цвета. ' +
            'Даёт намного более детальный результат, но требует мод Litematica для точной постройки.',
            '<b>2D Flat</b> — all blocks on one level, ~61 colors. Simple to build in survival. ' +
            '<b>3D Staircase</b> — blocks at different heights create 3 shading tones per color, giving ~183 colors. ' +
            'Produces much richer results but requires the Litematica mod to build accurately.',
          ),
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 4. Dithering ──────────────────────────────────────────────────────
      {
        element: '.dither-options',
        popover: {
          title: ru('4. ДИЗЕРИНГ', '4. DITHERING'),
          description: ru(
            'Дизеринг смешивает соседние пиксели для имитации цветов, которых нет в палитре блоков. ' +
            '<b>None</b> = только ближайший цвет. <b>KlussDither</b> = кастомный алгоритм, лучший для иллюстраций. ' +
            '<b>Floyd-Steinberg</b> = классика, универсален. Поэкспериментируй, чтобы найти лучший для твоего изображения.',
            'Dithering blends nearby pixels to simulate colors not in the block palette. ' +
            '<b>None</b> = flat nearest-color only. <b>KlussDither</b> = custom algorithm, great for illustrations. ' +
            '<b>Floyd-Steinberg</b> = classic, versatile. Experiment to find the best for your image.',
          ),
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 5. Adjustments ────────────────────────────────────────────────────
      {
        element: '.adj-sliders',
        popover: {
          title: ru('5. КОРРЕКЦИЯ ИЗОБРАЖЕНИЯ', '5. IMAGE ADJUSTMENTS'),
          description: ru(
            'Твой исходный образ перед конвертацией. ' +
            'Увеличение <b>контраста</b> и небольшое повышение <b>насыщенности</b> часто значительно улучшают результат — ' +
            'палитра Minecraft менее яркая, чем большинство фотографий.',
            'Tweak the source image before conversion. ' +
            'Bumping <b>contrast</b> and slightly increasing <b>saturation</b> often improves results — ' +
            'Minecraft\'s palette is less vibrant than most photos.',
          ),
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 6. Canvas / preview ───────────────────────────────────────────────
      {
        element: '.canvas-area',
        popover: {
          title: ru('6. ПРЕДПРОСМОТР', '6. PREVIEW'),
          description: ru(
            'Обработанный мап-арт появляется здесь. ' +
            '<b>Перетащи разделитель</b> влево/вправо для сравнения оригинала с результатом. ' +
            '<b>Наведи на пиксель</b> чтобы увидеть название блока. ' +
            'Скролл для масштабирования, перетащи для перемещения.',
            'The processed map art appears here. ' +
            '<b>Drag the split slider</b> left/right to compare original with result. ' +
            '<b>Hover any pixel</b> to see the block name. ' +
            'Scroll to zoom, drag to pan.',
          ),
          side: 'left',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 7. Export ──────────────────────────────────────────────────────────
      {
        element: '#tour-export',
        popover: {
          title: ru('7. ЭКСПОРТ', '7. EXPORT'),
          description: ru(
            '<b>PNG</b> — скачать изображение. ' +
            '<b>MAP.DAT</b> — готовые файлы карт для Minecraft. ' +
            '<b>LITEMATIC</b> — схема для <a href="https://www.curseforge.com/minecraft/mc-mods/litematica" target="_blank">мода Litematica</a>. ' +
            '<b>LINK</b> — поделись настройками с другими через облако.',
            '<b>PNG</b> — download as image. ' +
            '<b>MAP.DAT</b> — ready-made Minecraft map files. ' +
            '<b>LITEMATIC</b> — schematic for <a href="https://www.curseforge.com/minecraft/mc-mods/litematica" target="_blank">Litematica mod</a>. ' +
            '<b>LINK</b> — share settings with others via cloud.',
          ),
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('export'),
      },

      // ── 8. Next steps ──────────────────────────────────────────────────────
      {
        element: '.tour-btn',
        popover: {
          title: ru('ВСЁ ГОТОВО! 🎉', 'ALL SET! 🎉'),
          description: ru(
            'Это основные функции. Ты готов создавать мап-арт! ' +
            'Когда почувствуешь себя увереннее, используй <b>ГИД (продвинутый)</b> чтобы узнать о многослойности, паттернах, градиентах и других крутых инструментах. ' +
            'Удачи! 🚀',
            'That\'s the essentials. You\'re ready to create map art! ' +
            'When you feel more comfortable, use <b>GUIDE (advanced)</b> to learn about layers, patterns, gradients, and other cool tools. ' +
            'Good luck! 🚀',
          ),
          side: 'left',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },
    ],
  });

  return d;
}

/**
 * Advanced tour: For users who want to master the tool
 * Covers: layers, selections, patterns, gradient, text, project save/load, palette editor, keyboard shortcuts
 */
function createAdvancedTour(switchTab?: (tab: Tab) => void, lang: 'ru' | 'en' = 'ru') {
  const ru = (r: string, e: string) => lang === 'ru' ? r : e;
  const switchSync = (tab: Tab) => {
    if (!isMobile() || !switchTab) return;
    flushSync(() => switchTab(tab));
  };

  const d = driver({
    animate: true,
    smoothScroll: true,
    allowClose: true,
    overlayOpacity: 0.7,
    stagePadding: 6,
    stageRadius: 2,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: ru('ДАЛЕЕ ›', 'NEXT ›'),
    prevBtnText: ru('‹ НАЗАД', '‹ BACK'),
    doneBtnText: ru('ГОТОВО ✓', 'DONE ✓'),
    onDestroyStarted: () => {
      localStorage.setItem(ADVANCED_TOUR_KEY, 'true');
      d.destroy();
    },
    steps: [
      // ── 1. Layers ──────────────────────────────────────────────────────────
      {
        element: '.panel-right',
        popover: {
          title: ru('1. СЛОИ', '1. LAYERS'),
          description: ru(
            'Работай с несколькими слоями одновременно! Создавай слои для разных частей твоего арта, ' +
            'обрезай их независимо, применяй разные дизеринг/режимы к каждому. ' +
            'Переименуй, блокируй, управляй видимостью. <b>Экспорт гибрид</b> собирает все видимые слои в одну схему.',
            'Work with multiple layers at once! Create separate layers for different parts of your art, ' +
            'crop them independently, apply different dithering/modes to each. ' +
            'Rename, lock, control visibility. <b>Hybrid export</b> combines all visible layers into one schematic.',
          ),
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('palette'),
      },

      // ── 2. Selection tools ─────────────────────────────────────────────────
      {
        element: '.toolbar',
        popover: {
          title: ru('2. ИНСТРУМЕНТЫ ВЫДЕЛЕНИЯ', '2. SELECTION TOOLS'),
          description: ru(
            '<b>Rect</b> (R) — прямоугольное выделение. ' +
            '<b>Lasso</b> (L) — рисуй произвольную форму. ' +
            '<b>Magic</b> (M) — выдели область одного цвета (flood fill). ' +
            '<b>Pixel</b> — выдели конкретный пиксель. ' +
            'Все инструменты поддерживают <b>объединение</b> (Shift + клик) и <b>вычитание</b> (Ctrl + клик).',
            '<b>Rect</b> (R) — rectangular selection. ' +
            '<b>Lasso</b> (L) — draw freeform shape. ' +
            '<b>Magic</b> (M) — select contiguous color (flood fill). ' +
            '<b>Pixel</b> — select individual pixel. ' +
            'All support <b>union</b> (Shift+click) and <b>subtract</b> (Ctrl+click).',
          ),
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 3. Pattern tool ───────────────────────────────────────────────────
      {
        element: '.toolbar',
        popover: {
          title: ru('3. ПАТТЕРНЫ', '3. PATTERNS'),
          description: ru(
            'Создавай и рисуй повторяющиеся паттерны! Нажми <b>Паттерн</b> (P) и редактируй (кнопка редактирования). ' +
            '<b>Tile</b> — заливает область паттерном по сетке (идеально для фонов). ' +
            '<b>Stamp</b> — штампует паттерн один раз в позицию. ' +
            'Импортируй/экспортируй паттерны как JSON для обмена с друзьями.',
            'Create and paint repeating patterns! Press <b>Pattern</b> (P) and edit (edit button). ' +
            '<b>Tile</b> — fills area with pattern grid (perfect for backgrounds). ' +
            '<b>Stamp</b> — stamps pattern once at position. ' +
            'Import/export patterns as JSON to share with friends.',
          ),
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 4. Gradient ────────────────────────────────────────────────────────
      {
        element: '.toolbar',
        popover: {
          title: ru('4. ГРАДИЕНТ', '4. GRADIENT'),
          description: ru(
            'Рисуй плавные переходы между блоками! Нажми <b>Градиент</b> (G), выбери 2+ цвета-остановки. ' +
            'Система интерполирует цвета в OKLab пространстве для максимально точных переходов. ' +
            'Используй <b>упорядоченный дизеринг (Байер)</b> для сглаживания границ между остановками.',
            'Paint smooth transitions between blocks! Press <b>Gradient</b> (G), choose 2+ color stops. ' +
            'System interpolates in OKLab color space for smooth transitions. ' +
            'Use <b>ordered dithering (Bayer)</b> to smooth stop boundaries.',
          ),
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 5. Text tool ──────────────────────────────────────────────────────
      {
        element: '.toolbar',
        popover: {
          title: ru('5. ТЕКСТ', '5. TEXT'),
          description: ru(
            'Добавляй текст на свой мап-арт! Нажми <b>Текст</b> (T), нажми на холст, введи текст. ' +
            'Выбери шрифт (моноширинный, sans-serif и т.д.) и размер. ' +
            'Текст преобразуется в блоки используя выбранный дизеринг.',
            'Add text to your map art! Press <b>Text</b> (T), click on canvas, type. ' +
            'Choose font (monospace, sans-serif, etc) and size. ' +
            'Text is rasterized to blocks using your current dithering.',
          ),
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 6. Project save/load ───────────────────────────────────────────────
      {
        element: '.panel-right',
        popover: {
          title: ru('6. СОХРАНИТЬ ПРОЕКТ', '6. SAVE PROJECT'),
          description: ru(
            'Сохраняй свои проекты локально! <b>↓ Сохранить проект</b> сохраняет все слои, настройки, историю в файл. ' +
            '<b>↑ Загрузить проект</b> загружает сохранённый файл. ' +
            'Это позволяет продолжить работу позже. Или используй <b>облачные проекты</b> в панели слоёв (Artist Mode).',
            'Save your projects locally! <b>↓ Save project</b> saves all layers, settings, history to file. ' +
            '<b>↑ Load project</b> restores a saved file. ' +
            'Continue your work later. Or use <b>cloud projects</b> in layers panel (Artist Mode).',
          ),
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('palette'),
      },

      // ── 7. Palette editor & blocks ─────────────────────────────────────────
      {
        element: '.panel-right',
        popover: {
          title: ru('7. РАСШИРЕННАЯ ПАЛИТРА', '7. ADVANCED PALETTE'),
          description: ru(
            'Версионирование: выбери версию Minecraft и автоматически получишь доступные блоки. ' +
            'Поиск по названию, пресеты для быстрой настройки. ' +
            'Нажми на иконку блока, чтобы выбрать конкретный вариант. ' +
            'Поделись палитрой через <b>ПОДЕЛИТЬСЯ</b> — кодируется в URL.',
            'Version support: choose Minecraft version to get available blocks. ' +
            'Search by name, presets for quick setup. ' +
            'Click block icon to pick specific variant. ' +
            'Share palette via <b>SHARE</b> — encoded in URL.',
          ),
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('palette'),
      },

      // ── 8. Materials & keyboard shortcuts ───────────────────────────────────
      {
        element: '.toolbar',
        popover: {
          title: ru('8. ФИНАЛЬНЫЕ СОВЕТЫ', '8. FINAL TIPS'),
          description: ru(
            'Используй <b>материалы</b> (export tab) для плана закупок. ' +
            'Открой <b>горячие клавиши</b> (клавиатурный значок) для полного списка сочетаний. ' +
            'Вступи на Discord сервер сообщества для советов и шеринга своего арта! ' +
            'Ты готов к мастерству! 🎨',
            'Use <b>materials list</b> (export tab) to plan your shopping. ' +
            'Open <b>keyboard shortcuts</b> (keyboard icon) for full list of bindings. ' +
            'Join the community Discord for tips and to share your art! ' +
            'You\'re ready to master the tool! 🎨',
          ),
          side: 'left',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },
    ],
  });

  return d;
}

/**
 * Create appropriate tour based on type
 */
export function createTour(tourType: TourType = 'basic', switchTab?: (tab: Tab) => void, lang: 'ru' | 'en' = 'ru') {
  return tourType === 'advanced' ? createAdvancedTour(switchTab, lang) : createBasicTour(switchTab, lang);
}

export function shouldAutoStart(): boolean {
  return !localStorage.getItem(BASIC_TOUR_KEY);
}

export function isBasicTourDone(): boolean {
  return !!localStorage.getItem(BASIC_TOUR_KEY);
}

export function isAdvancedTourDone(): boolean {
  return !!localStorage.getItem(ADVANCED_TOUR_KEY);
}

export function markTourDone(tourType: TourType = 'basic'): void {
  const key = tourType === 'advanced' ? ADVANCED_TOUR_KEY : BASIC_TOUR_KEY;
  localStorage.setItem(key, 'true');
}
