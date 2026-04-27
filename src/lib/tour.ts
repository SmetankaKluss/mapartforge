import { driver } from 'driver.js';
import { flushSync } from 'react-dom';

const BASIC_TOUR_KEY    = 'mapkluss_tour_basic_done';
const ADVANCED_TOUR_KEY = 'mapkluss_tour_advanced_done';

const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

type Tab = 'settings' | 'palette' | 'export';

export type TourType = 'basic' | 'advanced';

// ─── Basic Tour ────────────────────────────────────────────────────────────────

function createBasicTour(switchTab?: (tab: Tab) => void, lang: 'ru' | 'en' = 'ru') {
  const ru = (r: string, e: string) => lang === 'ru' ? r : e;
  const switchSync = (tab: Tab) => {
    if (!isMobile() || !switchTab) return;
    flushSync(() => switchTab(tab));
  };

  return driver({
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
    onDestroyStarted: (_, __, opts) => {
      localStorage.setItem(BASIC_TOUR_KEY, 'true');
      opts.driver.destroy();
    },
    steps: [
      // ── 1. Загрузка ────────────────────────────────────────────────────────
      {
        element: '.upload-zone',
        popover: {
          title: ru('1. ЗАГРУЗИ ИЗОБРАЖЕНИЕ', '1. LOAD YOUR IMAGE'),
          description: ru(
            'Перетащи любое изображение сюда, нажми для выбора файла или нажми <b>Ctrl+V</b> чтобы вставить из буфера обмена. ' +
            'Подойдёт PNG, JPG, WebP — любого размера. ' +
            'Нажми <b>Обрезать</b> чтобы выбрать нужный фрагмент перед конвертацией.',
            'Drop any image here, click to browse, or press <b>Ctrl+V</b> to paste from clipboard. ' +
            'PNG, JPG, WebP — any size works. ' +
            'Use <b>Crop</b> to select just the part you need before converting.',
          ),
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 2. Размер карты ────────────────────────────────────────────────────
      {
        element: '.grid-options',
        popover: {
          title: ru('2. РАЗМЕР КАРТЫ', '2. MAP SIZE'),
          description: ru(
            'Каждая карта Minecraft — <b>128×128 блоков</b>. Выбери, сколько карт займёт арт: ' +
            '1×1 — одна карта, 3×3 — девять карт (384×384 блока). ' +
            'Больше карт = больше деталей, но и больше блоков нужно добыть.',
            'Each Minecraft map covers <b>128×128 blocks</b>. Choose how many maps your art spans: ' +
            '1×1 is a single map, 3×3 gives nine maps (384×384 blocks). ' +
            'More maps = more detail, but more blocks to gather.',
          ),
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 3. Режим постройки ─────────────────────────────────────────────────
      {
        element: '.mode-toggle',
        popover: {
          title: ru('3. РЕЖИМ ПОСТРОЙКИ', '3. BUILD MODE'),
          description: ru(
            '<b>2D Flat</b> — все блоки на одном уровне, ~61 базовый цвет. ' +
            'Просто строить в выживании без модов. ' +
            '<br><b>3D Staircase</b> — блоки на разных высотах дают 3 оттенка на цвет (~183 цвета). ' +
            'Намного более детальный результат, но требует мода <b>Litematica</b> для точной постройки.',
            '<b>2D Flat</b> — all blocks at one level, ~61 base colors. ' +
            'Easy to build in survival without mods. ' +
            '<br><b>3D Staircase</b> — blocks at different heights create 3 shading tones per color (~183 colors). ' +
            'Much richer result, but requires the <b>Litematica</b> mod to build accurately.',
          ),
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 4. Дизеринг ────────────────────────────────────────────────────────
      {
        element: '.dither-options',
        popover: {
          title: ru('4. ДИЗЕРИНГ', '4. DITHERING'),
          description: ru(
            'Дизеринг смешивает соседние пиксели для имитации цветов которых нет в палитре блоков. ' +
            '<br><b>None</b> — только ближайший цвет, без смешения. Чётко, но грубо. ' +
            '<br><b>KlussDither</b> — наш алгоритм, лучший для аниме и иллюстраций. ' +
            '<br><b>Floyd-Steinberg</b> — классика, хороший выбор по умолчанию. ' +
            '<br>Используй слайдер <b>Intensity</b> для настройки силы эффекта.',
            'Dithering blends nearby pixels to simulate colors missing from the block palette. ' +
            '<br><b>None</b> — flat nearest-color only. Sharp but rough. ' +
            '<br><b>KlussDither</b> — our custom algorithm, best for anime and illustrations. ' +
            '<br><b>Floyd-Steinberg</b> — classic, reliable general-purpose choice. ' +
            '<br>Use the <b>Intensity</b> slider to control the effect strength.',
          ),
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 5. Превью ──────────────────────────────────────────────────────────
      {
        element: '.canvas-area',
        popover: {
          title: ru('5. ПРЕДПРОСМОТР', '5. PREVIEW'),
          description: ru(
            'Готовый мап-арт появляется здесь. ' +
            '<br>• <b>Тяни разделитель</b> влево/вправо — сравни оригинал с результатом. ' +
            '<br>• <b>Скролл</b> — масштабирование, <b>ПКМ</b> — перемещение. ' +
            '<br>• <b>Наведи на пиксель</b> — узнай название блока, цветовой ID и оттенок.',
            'The processed map art appears here. ' +
            '<br>• <b>Drag the split slider</b> left/right to compare original vs result. ' +
            '<br>• <b>Scroll</b> to zoom, <b>right-click drag</b> to pan. ' +
            '<br>• <b>Hover any pixel</b> to see the block name, color ID, and shade.',
          ),
          side: 'left',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 6. Панель инструментов ─────────────────────────────────────────────
      {
        element: '.toolbar',
        popover: {
          title: ru('6. ИНСТРУМЕНТЫ', '6. TOOLS'),
          description: ru(
            '<b>↩↪</b> Отменить / Повторить (Ctrl+Z / Ctrl+Y). ' +
            '<br>После загрузки изображения появляются инструменты: ' +
            '<br>• <b>Пипетка (E)</b> — выбрать цвет блока ' +
            '<br>• <b>Кисть (B)</b> — рисовать пиксели ' +
            '<br>• <b>Заливка (F)</b> — закрасить область ' +
            '<br>• <b>Ластик (X)</b> — стереть до прозрачности ' +
            '<br>Также: переключение <b>текстур блоков</b>, <b>сетки</b> и <b>сравнения</b>.',
            '<b>↩↪</b> Undo / Redo (Ctrl+Z / Ctrl+Y). ' +
            '<br>After loading, paint tools appear: ' +
            '<br>• <b>Eyedropper (E)</b> — pick a block color ' +
            '<br>• <b>Brush (B)</b> — paint pixels ' +
            '<br>• <b>Fill (F)</b> — flood-fill an area ' +
            '<br>• <b>Eraser (X)</b> — erase to transparency ' +
            '<br>Also: toggle <b>block textures</b>, <b>grid overlay</b>, and <b>compare mode</b>.',
          ),
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 7. Экспорт ─────────────────────────────────────────────────────────
      {
        element: '#tour-export',
        popover: {
          title: ru('7. ЭКСПОРТ', '7. EXPORT'),
          description: ru(
            '<b>↓ PNG</b> — скачать результат как картинку. ' +
            '<br><b>↓ MAP.DAT</b> — готовые файлы карт Minecraft; положи в папку сохранений. ' +
            '<br><b>↓ LITEMATIC</b> — схема для мода <b>Litematica</b>. ' +
            '<br><b>↓ ZIP</b> — несколько .litematic файлов по одному на тайл (для больших сеток).',
            '<b>↓ PNG</b> — download the result as an image. ' +
            '<br><b>↓ MAP.DAT</b> — ready Minecraft map files; place them in your saves folder. ' +
            '<br><b>↓ LITEMATIC</b> — building schematic for the <b>Litematica</b> mod. ' +
            '<br><b>↓ ZIP</b> — multiple .litematic files, one per tile (for large grids).',
          ),
          side: 'top',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('export'),
      },

      // ── 8. Ссылка ──────────────────────────────────────────────────────────
      {
        element: '.link-export-btn',
        popover: {
          title: ru('8. ПОДЕЛИТЬСЯ', '8. SHARE LINK'),
          description: ru(
            'Генерирует <b>постоянную ссылку</b> с твоим изображением и всеми настройками (сетка, дизеринг, палитра). ' +
            '<br>Поделись с другими строителями или сохрани в закладки — аккаунт не нужен.',
            'Generates a <b>permanent link</b> encoding your image and all settings (grid, dithering, palette). ' +
            '<br>Share with other builders or bookmark to resume later — no account needed.',
          ),
          side: 'top',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('export'),
      },
    ],
  });
}

// ─── Advanced Tour ─────────────────────────────────────────────────────────────

function createAdvancedTour(switchTab?: (tab: Tab) => void, lang: 'ru' | 'en' = 'ru') {
  const ru = (r: string, e: string) => lang === 'ru' ? r : e;
  const switchSync = (tab: Tab) => {
    if (!isMobile() || !switchTab) return;
    flushSync(() => switchTab(tab));
  };

  return driver({
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
    onDestroyStarted: (_, __, opts) => {
      localStorage.setItem(ADVANCED_TOUR_KEY, 'true');
      opts.driver.destroy();
    },
    steps: [
      // ── 1. Режим художника ─────────────────────────────────────────────────
      {
        element: '.artist-mode-btn',
        popover: {
          title: ru('1. РЕЖИМ ХУДОЖНИКА', '1. ARTIST MODE'),
          description: ru(
            'Включает продвинутые инструменты: слои, выделение, паттерны, градиент, текст. ' +
            '<br>Переключайся между <b>Simple</b> (быстрая конвертация) и <b>Artist</b> (полный редактор). ' +
            '<br>В Artist режиме в правой панели появляется раздел <b>Слои</b>.',
            'Unlocks advanced tools: layers, selection, patterns, gradient, text. ' +
            '<br>Switch between <b>Simple</b> (quick convert) and <b>Artist</b> (full editor). ' +
            '<br>In Artist mode the right panel shows a <b>Layers</b> section.',
          ),
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 2. Слои ────────────────────────────────────────────────────────────
      {
        element: '.panel-right',
        popover: {
          title: ru('2. СЛОИ', '2. LAYERS'),
          description: ru(
            'Каждый слой — отдельное изображение со своими настройками дизеринга и режима постройки. ' +
            '<br>• Смешивай <b>2D и 3D</b> слои в одном проекте для гибридного экспорта. ' +
            '<br>• Управляй <b>прозрачностью</b>, <b>видимостью</b> и <b>блокировкой</b> слоёв. ' +
            '<br>• <b>Слияние слоёв</b> — объединяй вниз или все видимые сразу.',
            'Each layer is a separate image with its own dithering and build mode settings. ' +
            '<br>• Mix <b>2D and 3D</b> layers in one project for hybrid export. ' +
            '<br>• Control layer <b>opacity</b>, <b>visibility</b>, and <b>locking</b>. ' +
            '<br>• <b>Merge layers</b> — merge down or all visible at once.',
          ),
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('palette'),
      },

      // ── 3. Палитра блоков ──────────────────────────────────────────────────
      {
        element: '.panel-right',
        popover: {
          title: ru('3. ПАЛИТРА БЛОКОВ', '3. BLOCK PALETTE'),
          description: ru(
            'Включай и выключай цвета блоков. <b>Больше блоков = больше цветов = лучше качество.</b> ' +
            '<br>• Нажми на <b>точку</b> рядом с цветом — переключить ряд. ' +
            '<br>• Нажми на <b>иконку блока</b> — выбрать вариант блока. ' +
            '<br>• <b>Поиск</b>, <b>пресеты версий</b> и <b>Поделиться палитрой</b> — в верхней части.',
            'Enable or disable block color rows. <b>More blocks = more colors = better quality.</b> ' +
            '<br>• Click the <b>dot</b> next to a color to toggle it. ' +
            '<br>• Click a <b>block icon</b> to choose a variant. ' +
            '<br>• <b>Search</b>, <b>version presets</b>, and <b>Share palette</b> are at the top.',
          ),
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('palette'),
      },

      // ── 4. Опорные блоки ───────────────────────────────────────────────────
      {
        element: '.support-block-section',
        popover: {
          title: ru('4. ОПОРНЫЕ БЛОКИ (3D)', '4. SUPPORT BLOCKS (3D)'),
          description: ru(
            'В 3D-режиме некоторые блоки (песок, гравий, лишайник…) не могут висеть в воздухе. ' +
            '<br>Выбери твёрдый блок для автоматической подстановки под них в схеме Litematica. ' +
            '<br><b>Глубина 1</b> — только под плавающими · <b>2</b> — под каждым блоком · <b>3</b> — два блока под каждым.',
            'In 3D mode some blocks (sand, gravel, lichen…) can\'t float in mid-air. ' +
            '<br>Choose a solid block to place underneath them automatically in the Litematica schematic. ' +
            '<br><b>Depth 1</b> — under floating blocks only · <b>2</b> — one block under every art block · <b>3</b> — two blocks under each.',
          ),
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('palette'),
      },

      // ── 5. Инструменты выделения ───────────────────────────────────────────
      {
        element: '.toolbar',
        popover: {
          title: ru('5. ВЫДЕЛЕНИЕ', '5. SELECTION TOOLS'),
          description: ru(
            'В Artist режиме доступны инструменты выделения: ' +
            '<br>• <b>Прямоугольник (R)</b> — выделить прямоугольную область. ' +
            '<br>• <b>Лассо (L)</b> — свободное выделение. ' +
            '<br>• <b>Волшебная палочка (W)</b> — выделить связную область одного цвета. ' +
            '<br>С выделением работают: кисть, заливка, ластик, паттерн, градиент. ' +
            'Delete / Backspace — удалить выделенное.',
            'In Artist mode, selection tools are available: ' +
            '<br>• <b>Rectangle (R)</b> — drag to select a rectangular area. ' +
            '<br>• <b>Lasso (L)</b> — freehand selection. ' +
            '<br>• <b>Magic Wand (W)</b> — select a connected region of the same color. ' +
            '<br>All paint tools respect the selection. Delete / Backspace — erase selected area.',
          ),
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 6. Паттерн-инструмент ──────────────────────────────────────────────
      {
        element: '.toolbar',
        popover: {
          title: ru('6. ПАТТЕРНЫ (P)', '6. PATTERNS (P)'),
          description: ru(
            'Инструмент <b>Паттерн (P)</b> рисует повторяющимся тайлом из нескольких блоков. ' +
            '<br>• Добавь до 8 блоков в паттерн-кисть прямо в тулбаре. ' +
            '<br>• Открой <b>редактор паттернов</b> для создания пиксельных паттернов любой формы. ' +
            '<br>Идеально для текстур травы, кирпича, камня и других повторяющихся элементов.',
            'The <b>Pattern tool (P)</b> paints with a repeating tile of multiple blocks. ' +
            '<br>• Add up to 8 blocks to the pattern brush directly in the toolbar. ' +
            '<br>• Open the <b>Pattern editor</b> to design pixel-art patterns of any shape. ' +
            '<br>Perfect for grass, brick, stone textures and other repeating elements.',
          ),
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 7. Градиент ────────────────────────────────────────────────────────
      {
        element: '.toolbar',
        popover: {
          title: ru('7. ГРАДИЕНТ (G)', '7. GRADIENT (G)'),
          description: ru(
            'Инструмент <b>Градиент (G)</b> заливает область плавным переходом между блоками. ' +
            '<br>• Добавь несколько цветовых остановок в тулбаре. ' +
            '<br>• Нарисуй линию — от начальной до конечной точки. ' +
            '<br>• Работает внутри выделения для точного контроля. ' +
            '<br>Опция <b>Ordered dithering</b> смягчает переходы между блоками.',
            'The <b>Gradient tool (G)</b> fills an area with a smooth transition between blocks. ' +
            '<br>• Add multiple color stops in the toolbar. ' +
            '<br>• Draw a line from start to end point. ' +
            '<br>• Works within a selection for precise control. ' +
            '<br>The <b>Ordered dithering</b> option softens transitions between blocks.',
          ),
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 8. Коррекция изображения ───────────────────────────────────────────
      {
        element: '.adj-sliders',
        popover: {
          title: ru('8. КОРРЕКЦИЯ', '8. IMAGE ADJUSTMENTS'),
          description: ru(
            'Настрой исходное изображение до конвертации. ' +
            '<br>Небольшое увеличение <b>контраста</b> и <b>насыщенности</b> часто значительно улучшает результат — ' +
            'палитра Minecraft менее яркая, чем большинство фотографий. ' +
            '<br>Изменения применяются до дизеринга — видишь превью в реальном времени.',
            'Tweak the source image before converting. ' +
            '<br>Slightly increasing <b>contrast</b> and <b>saturation</b> often improves results significantly — ' +
            'Minecraft\'s palette is less vibrant than most photos. ' +
            '<br>Changes apply before dithering — you see the preview in real time.',
          ),
          side: 'bottom',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 9. Список материалов ───────────────────────────────────────────────
      {
        element: '.mat-header',
        popover: {
          title: ru('9. МАТЕРИАЛЫ', '9. MATERIALS LIST'),
          description: ru(
            'Показывает все блоки в арте с точным количеством в <b>стаках</b> (64) и <b>шалкерах</b> (1728). ' +
            '<br>Переключи <b>Макс/карта</b> для просмотра максимума на один тайл 128×128 — ' +
            'удобно знать сколько брать за одну сессию. ' +
            '<br>Список автоматически обновляется при изменении палитры или изображения.',
            'Shows all blocks in your art with exact counts in <b>stacks</b> (64) and <b>shulker boxes</b> (1728). ' +
            '<br>Toggle <b>Max/map</b> to see the max needed for a single 128×128 tile — ' +
            'useful for knowing what to bring per session. ' +
            '<br>The list updates automatically when you change the palette or image.',
          ),
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('export'),
      },
    ],
  });
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function createTour(
  tourType: TourType,
  switchTab?: (tab: Tab) => void,
  lang: 'ru' | 'en' = 'ru',
) {
  return tourType === 'advanced'
    ? createAdvancedTour(switchTab, lang)
    : createBasicTour(switchTab, lang);
}

export function shouldAutoStart(): boolean {
  return !localStorage.getItem(BASIC_TOUR_KEY);
}

export function markTourDone(tourType: TourType): void {
  const key = tourType === 'advanced' ? ADVANCED_TOUR_KEY : BASIC_TOUR_KEY;
  localStorage.setItem(key, 'true');
}
