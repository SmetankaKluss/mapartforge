import { driver } from 'driver.js';
import { flushSync } from 'react-dom';

const TOUR_KEY = 'mapkluss_tour_done';

const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

type Tab = 'settings' | 'palette' | 'export';

export function createTour(switchTab?: (tab: Tab) => void, lang: 'ru' | 'en' = 'ru') {
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
      localStorage.setItem(TOUR_KEY, 'true');
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
            '<b>None</b> = только ближайший цвет без смешения. <b>KlussDither</b> = наш кастомный алгоритм, лучший для аниме и иллюстраций. ' +
            '<b>Floyd-Steinberg</b> = классика, хорошо подходит для большинства изображений.',
            'Dithering blends nearby pixels to simulate colors that don\'t exist in the block palette. ' +
            '<b>None</b> = flat nearest-color only. <b>KlussDither</b> = our custom algorithm, best for anime and illustrations. ' +
            '<b>Floyd-Steinberg</b> = classic, good general purpose choice.',
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
            'Настрой исходное изображение перед конвертацией. ' +
            'Увеличение <b>контраста</b> и небольшое повышение <b>насыщенности</b> часто значительно улучшают результат — ' +
            'палитра Minecraft менее яркая, чем большинство фотографий и иллюстраций.',
            'Tweak the source image before it\'s converted. ' +
            'Bumping <b>contrast</b> and slightly increasing <b>saturation</b> often improves results significantly — ' +
            'Minecraft\'s palette is less vibrant than most photos and illustrations.',
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
            'Обработанный мап-арт появляется здесь после загрузки изображения. ' +
            '<b>Перетащи разделитель</b> влево/вправо для сравнения оригинала с результатом. ' +
            '<b>Наведи на пиксель</b> для просмотра названия блока, цветового ID и оттенка. ' +
            'Скролл для масштабирования, перетащи для перемещения.',
            'The processed map art appears here after the image is loaded. ' +
            '<b>Drag the split slider</b> left/right to compare the original with the result. ' +
            '<b>Hover any pixel</b> to see the block name, color ID and exact shade. ' +
            'Scroll to zoom, drag to pan.',
          ),
          side: 'left',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 8. Toolbar / paint tools ──────────────────────────────────────────
      {
        element: '.toolbar',
        popover: {
          title: ru('7. ПАНЕЛЬ ИНСТРУМЕНТОВ', '7. TOOLBAR'),
          description: ru(
            '<b>↩↪</b> Отменить / Повторить (Ctrl+Z / Ctrl+Y). ' +
            'После обработки появляются инструменты рисования: <b>курсор</b> (инспекция), <b>пипетка</b> (E — выбрать блок), ' +
            '<b>кисть</b> (B — рисовать пиксели), <b>заливка</b> (F — заливка области). ' +
            'Также: переключение <b>текстур блоков</b>, <b>сетки</b> и <b>режима сравнения</b>.',
            '<b>↩↪</b> Undo / Redo (Ctrl+Z / Ctrl+Y). ' +
            'After processing, paint tools appear: <b>cursor</b> (inspect), <b>eyedropper</b> (E — pick block), ' +
            '<b>brush</b> (B — paint pixels), <b>fill</b> (F — flood fill). ' +
            'Also: toggle <b>block textures</b>, <b>grid overlay</b>, and <b>compare mode</b>.',
          ),
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('settings'),
      },

      // ── 9. Block palette ──────────────────────────────────────────────────
      {
        element: '.panel-right',
        popover: {
          title: ru('8. ПАЛИТРА БЛОКОВ', '8. BLOCK PALETTE'),
          description: ru(
            'Включай или отключай отдельные ряды цветов блоков. <b>Больше блоков = больше цветов = лучше качество.</b> ' +
            'Нажми на точку рядом с цветом для переключения; нажми на иконку блока для выбора варианта. ' +
            'Используй <b>поиск</b> для поиска блоков, <b>пресеты</b> для быстрой настройки и <b>поделиться палитрой</b> для отправки выбора другим.',
            'Enable or disable individual block color rows. <b>More blocks = more colors available = better quality.</b> ' +
            'Click the dot next to a color to toggle it; click a block icon to pick which variant to use. ' +
            'Use <b>Search</b> to find specific blocks, <b>Presets</b> for quick setups, and <b>Share palette</b> to send your selection to others.',
          ),
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('palette'),
      },

      // ── 10. Support block ─────────────────────────────────────────────────
      {
        element: '.support-block-section',
        popover: {
          title: ru('9. ОПОРНЫЕ БЛОКИ (3D)', '9. SUPPORT BLOCKS (3D)'),
          description: ru(
            'В режиме 3D-лестницы некоторые блоки (песок, гравий, лишайник…) не могут висеть в воздухе. ' +
            'Выбери твёрдый блок для автоматической подстановки под них в экспортированной схеме. ' +
            '<b>Глубина 1</b> = только под плавающими · <b>2</b> = под каждым блоком арта · <b>3</b> = два блока под каждым.',
            'In 3D staircase mode some blocks (sand, gravel, lichen…) can\'t float in mid-air. ' +
            'Choose a solid block to place underneath them automatically in the exported schematic. ' +
            '<b>Depth 1</b> = under floating blocks only · <b>2</b> = one block under every art block · <b>3</b> = two blocks under every art block.',
          ),
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('palette'),
      },

      // ── 11. Materials list ────────────────────────────────────────────────
      {
        element: '.mat-header',
        popover: {
          title: ru('10. СПИСОК МАТЕРИАЛОВ', '10. MATERIALS LIST'),
          description: ru(
            'Показывает все типы блоков в твоём мап-арте с точным количеством в <b>стаках</b> (64) и <b>шалкерах</b> (1728). ' +
            'Переключи <b>Макс/карта</b> для просмотра максимума на один тайл 128×128 — удобно знать, что брать за сессию.',
            'Shows every block type used in your map art with exact counts in <b>stacks</b> (64) and <b>shulker boxes</b> (1728). ' +
            'Toggle <b>Max/map</b> to see the maximum needed for a single 128×128 tile — useful for knowing what to bring per session.',
          ),
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('export'),
      },

      // ── 12. Export ────────────────────────────────────────────────────────
      {
        element: '#tour-export',
        popover: {
          title: ru('11. ЭКСПОРТ', '11. EXPORT'),
          description: ru(
            '<b>↓ PNG</b> — скачать обработанное изображение как картинку. ' +
            '<b>↓ MAP.DAT</b> — готовые файлы карт Minecraft; положи в папку сохранений. ' +
            '<b>↓ LITEMATIC</b> — схема постройки для <a href="https://www.curseforge.com/minecraft/mc-mods/litematica" target="_blank">мода Litematica</a>. ' +
            '<b>↓ ZIP</b> — по одному .litematic файлу на каждый тайл 128×128, архивом (для многокарточных сеток).',
            '<b>↓ PNG</b> — download the processed image as a picture. ' +
            '<b>↓ MAP.DAT</b> — ready-to-use Minecraft map files; place in your saves folder. ' +
            '<b>↓ LITEMATIC</b> — building schematic for the <a href="https://www.curseforge.com/minecraft/mc-mods/litematica" target="_blank">Litematica mod</a>. ' +
            '<b>↓ ZIP</b> — one .litematic file per 128×128 tile, zipped (multi-map grids).',
          ),
          side: 'left',
          align: 'start',
        },
        onHighlightStarted: () => switchSync('export'),
      },

      // ── 13. Get Link ──────────────────────────────────────────────────────
      {
        element: '.link-export-btn',
        popover: {
          title: ru('12. ССЫЛКА ДЛЯ SHARE', '12. SHARE LINK'),
          description: ru(
            'Генерирует <b>постоянную ссылку</b>, которая кодирует твоё изображение и все текущие настройки (сетка, дизеринг, палитра, коррекция). ' +
            'Поделись ею с другими строителями или добавь в закладки для продолжения проекта позже — аккаунт не нужен.',
            'Generates a <b>permanent link</b> that encodes your image and all current settings (grid, dithering, palette, adjustments). ' +
            'Share it with other builders or bookmark it to continue your project later — no account needed.',
          ),
          side: 'top',
          align: 'center',
        },
        onHighlightStarted: () => switchSync('export'),
      },
    ],
  });

  return d;
}

export function shouldAutoStart(): boolean {
  return !localStorage.getItem(TOUR_KEY);
}

export function markTourDone(): void {
  localStorage.setItem(TOUR_KEY, 'true');
}
