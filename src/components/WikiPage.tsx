import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { applyPageMeta } from '../lib/meta';
import { useLocale } from '../lib/useLocale';
import {
  getWikiArticle,
  getWikiArticleFromHash,
  getWikiArticleFromPath,
  searchWiki,
  WIKI_ARTICLES,
  WIKI_GROUPS,
  type WikiArticleId,
} from '../lib/wiki';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';
import { PublicSiteHeader } from './PublicSiteHeader';
import './wikiPage.css';

type Translate = (ru: string, en: string) => string;

const COMPANION_MODRINTH_URL = 'https://modrinth.com/mod/mapkluss-companion';
const COMPANION_CURSEFORGE_URL = 'https://www.curseforge.com/minecraft/mc-mods/mapkluss-companion';
const TELEGRAM_URL = 'https://t.me/mapkluss';

interface TocItem {
  id: string;
  labelRu: string;
  labelEn: string;
}

const ARTICLE_TOC: Record<WikiArticleId, TocItem[]> = {
  welcome: [
    { id: 'what-it-does', labelRu: 'Что умеет MapKluss', labelEn: 'What MapKluss does' },
    { id: 'choose-a-path', labelRu: 'Выбери свой путь', labelEn: 'Choose a path' },
    { id: 'privacy', labelRu: 'Локальная работа и Cloud', labelEn: 'Local work and Cloud' },
  ],
  'first-art': [
    { id: 'load', labelRu: '1. Загрузить', labelEn: '1. Load' },
    { id: 'configure', labelRu: '2. Настроить', labelEn: '2. Configure' },
    { id: 'inspect', labelRu: '3. Проверить', labelEn: '3. Inspect' },
    { id: 'export', labelRu: '4. Экспортировать', labelEn: '4. Export' },
  ],
  'image-processing': [
    { id: 'map-size', labelRu: 'Размер', labelEn: 'Map size' },
    { id: 'crop-adjust', labelRu: 'Обрезка и коррекция', labelEn: 'Crop and adjust' },
    { id: 'colour-match', labelRu: 'Подбор цвета', labelEn: 'Colour matching' },
    { id: 'dithering', labelRu: 'Дизеринг', labelEn: 'Dithering' },
  ],
  'build-modes': [
    { id: 'mode-2d', labelRu: '2D', labelEn: '2D' },
    { id: 'mode-3d', labelRu: '3D', labelEn: '3D' },
    { id: 'mode-two-layer', labelRu: 'Two-layer', labelEn: 'Two-layer' },
    { id: 'mode-choice', labelRu: 'Как выбрать', labelEn: 'How to choose' },
  ],
  'palette-versions': [
    { id: 'version', labelRu: 'Версия Minecraft', labelEn: 'Minecraft version' },
    { id: 'block-choice', labelRu: 'Выбор блоков', labelEn: 'Choosing blocks' },
    { id: 'presets', labelRu: 'Пресеты', labelEn: 'Presets' },
    { id: 'platforms', labelRu: 'Java и Bedrock', labelEn: 'Java and Bedrock' },
  ],
  'editing-tools': [
    { id: 'navigation-tools', labelRu: 'Навигация и цвет', labelEn: 'Navigation and colour' },
    { id: 'paint-tools', labelRu: 'Рисование', labelEn: 'Painting' },
    { id: 'selection-tools', labelRu: 'Выделения', labelEn: 'Selections' },
    { id: 'advanced-tools', labelRu: 'Паттерн, градиент, текст', labelEn: 'Pattern, gradient, text' },
  ],
  'layers-projects': [
    { id: 'artist-mode', labelRu: 'Режим художника', labelEn: 'Artist mode' },
    { id: 'layer-controls', labelRu: 'Управление слоями', labelEn: 'Layer controls' },
    { id: 'project-files', labelRu: 'Файлы проекта', labelEn: 'Project files' },
  ],
  'export-files': [
    { id: 'preview-exports', labelRu: 'PNG и превью', labelEn: 'PNG and previews' },
    { id: 'minecraft-exports', labelRu: 'Minecraft-файлы', labelEn: 'Minecraft files' },
    { id: 'large-art', labelRu: 'Большие арты', labelEn: 'Large arts' },
  ],
  'cloud-companion': [
    { id: 'cloud-save', labelRu: 'Сохранить в Cloud', labelEn: 'Save to Cloud' },
    { id: 'install-companion', labelRu: 'Установить Companion', labelEn: 'Install Companion' },
    { id: 'connect-account', labelRu: 'Подключить аккаунт', labelEn: 'Connect the account' },
  ],
  lens: [
    { id: 'lens-purpose', labelRu: 'Для чего нужен Lens', labelEn: 'What Lens is for' },
    { id: 'lens-flow', labelRu: 'Как запустить', labelEn: 'How to start' },
    { id: 'lens-safety', labelRu: 'Что хранится', labelEn: 'What is stored' },
  ],
  'two-layer': [
    { id: 'two-layer-purpose', labelRu: 'Как работает', labelEn: 'How it works' },
    { id: 'two-layer-export', labelRu: 'Подготовить арт', labelEn: 'Prepare an art' },
    { id: 'two-layer-build', labelRu: 'Строить в Companion', labelEn: 'Build with Companion' },
    { id: 'two-layer-limits', labelRu: 'Ограничения', labelEn: 'Limitations' },
  ],
  shortcuts: [
    { id: 'canvas-keys', labelRu: 'Холст', labelEn: 'Canvas' },
    { id: 'tool-keys', labelRu: 'Инструменты', labelEn: 'Tools' },
    { id: 'selection-keys', labelRu: 'Выделение', labelEn: 'Selection' },
  ],
  troubleshooting: [
    { id: 'upload-problems', labelRu: 'Загрузка', labelEn: 'Upload' },
    { id: 'performance-problems', labelRu: 'Производительность', labelEn: 'Performance' },
    { id: 'export-problems', labelRu: 'Экспорт и Cloud', labelEn: 'Export and Cloud' },
    { id: 'get-help', labelRu: 'Сообщить о проблеме', labelEn: 'Report a problem' },
  ],
};

function Callout({ title, children, tone = 'info' }: { title: string; children: ReactNode; tone?: 'info' | 'success' | 'warning' }) {
  return (
    <aside className={`wiki-callout wiki-callout--${tone}`}>
      <strong>{title}</strong>
      <div>{children}</div>
    </aside>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="wiki-key">{children}</kbd>;
}

function ArticleBody({ articleId, t, onArticle }: { articleId: WikiArticleId; t: Translate; onArticle: (id: WikiArticleId) => void }) {
  switch (articleId) {
    case 'welcome':
      return (
        <>
          <p className="wiki-lead">{t(
            'MapKluss превращает изображение в пригодный для Minecraft мап-арт и помогает пройти весь путь: обработать пиксели, подобрать блоки, выгрузить файлы, сохранить проект и строить с Companion.',
            'MapKluss turns an image into build-ready Minecraft map art and supports the full workflow: process pixels, choose blocks, export files, save a project, and build with Companion.',
          )}</p>
          <section id="what-it-does">
            <h2>{t('Что умеет MapKluss', 'What MapKluss does')}</h2>
            <ul className="wiki-feature-list">
              <li><IconGlyph icon={mkIcons.adjustments} /><span><strong>{t('Редактор', 'Editor')}</strong>{t(' — размеры до больших мозаик, несколько алгоритмов дизеринга, точная коррекция и ручная правка каждого пикселя.', ' — sizes from one map to large mosaics, multiple dithering algorithms, precise adjustments, and pixel-level editing.')}</span></li>
              <li><IconGlyph icon={mkIcons.paletteEditor} /><span><strong>{t('Minecraft-палитра', 'Minecraft palette')}</strong>{t(' — версии от старых Java-релизов до 26.2, варианты блоков, пресеты и точный список материалов.', ' — versions from older Java releases through 26.2, block variants, presets, and exact material counts.')}</span></li>
              <li><IconGlyph icon={mkIcons.cloud} /><span><strong>Cloud</strong>{t(' — приватные и публичные арты, версии, коллекции и передача результата в мод.', ' — private and public arts, versions, collections, and direct handoff to the mod.')}</span></li>
              <li><IconGlyph icon={mkIcons.hammer} /><span><strong>Companion</strong>{t(' — Lens, Two-layer Builder, скан карт, AutoFrame и работа с Litematica.', ' — Lens, Two-layer Builder, map scanning, AutoFrame, and Litematica workflows.')}</span></li>
            </ul>
          </section>
          <section id="choose-a-path">
            <h2>{t('Выбери свой путь', 'Choose a path')}</h2>
            <div className="wiki-path-list">
              <button type="button" onClick={() => onArticle('first-art')}>
                <span className="wiki-path-index">01</span>
                <span><strong>{t('Хочу быстро сделать первый арт', 'I want to make my first art')}</strong><small>{t('Загрузка → обработка → экспорт примерно за 5 минут', 'Upload → process → export in about 5 minutes')}</small></span>
                <IconGlyph icon={mkIcons.arrowRight} />
              </button>
              <button type="button" onClick={() => onArticle('editing-tools')}>
                <span className="wiki-path-index">02</span>
                <span><strong>{t('Хочу точно исправить результат', 'I want to refine the result')}</strong><small>{t('Инструменты, выделения, паттерны, градиент и слои', 'Tools, selections, patterns, gradients, and layers')}</small></span>
                <IconGlyph icon={mkIcons.arrowRight} />
              </button>
              <button type="button" onClick={() => onArticle('cloud-companion')}>
                <span className="wiki-path-index">03</span>
                <span><strong>{t('Хочу строить с модом', 'I want to build with the mod')}</strong><small>{t('Cloud, Companion, Lens и Two-layer', 'Cloud, Companion, Lens, and Two-layer')}</small></span>
                <IconGlyph icon={mkIcons.arrowRight} />
              </button>
            </div>
          </section>
          <section id="privacy">
            <h2>{t('Локальная работа и Cloud', 'Local work and Cloud')}</h2>
            <p>{t('Обычная обработка изображения выполняется в браузере. Аккаунт не нужен, чтобы создать арт и скачать файлы. Cloud используется только когда ты сам входишь и сохраняешь проект.', 'Normal image processing runs in your browser. You do not need an account to create an art and download files. Cloud is used only when you sign in and save a project yourself.')}</p>
            <Callout title={t('Хорошая стартовая точка', 'Best starting point')} tone="success">
              <p>{t('Открой статью «Первый арт за 5 минут» или запусти интерактивный тур кнопкой с вопросительным знаком в шапке редактора.', 'Open “Your first art in 5 minutes” or start the interactive tour with the question-mark button in the editor header.')}</p>
            </Callout>
          </section>
        </>
      );

    case 'first-art':
      return (
        <>
          <p className="wiki-lead">{t('Минимальный рабочий путь без лишних настроек. Сначала получи хороший результат, затем углубляйся в инструменты.', 'The shortest useful workflow without extra settings. Get a good result first, then explore deeper tools.')}</p>
          <section id="load"><h2>{t('1. Загрузить изображение', '1. Load an image')}</h2><p>{t('Нажми на область «Исходник», перетащи файл или вставь изображение через Ctrl/⌘+V. Поддерживаются PNG, JPG, WebP, GIF и импорт MAP.DAT.', 'Click the Source area, drop a file, or paste with Ctrl/⌘+V. PNG, JPG, WebP, GIF, and MAP.DAT imports are supported.')}</p></section>
          <section id="configure"><h2>{t('2. Выбрать размер и режим', '2. Choose size and mode')}</h2><p>{t('Для первой работы возьми 1×1 или 2×2 карты. Оставь 2D, если важна простая стройка, или выбери 3D для большей глубины цвета. Floyd–Steinberg — надёжная отправная точка для фото; KlussDither часто лучше сохраняет иллюстрации.', 'For a first project, use a 1×1 or 2×2 grid. Keep 2D for a simpler build, or choose 3D for a wider shade range. Floyd–Steinberg is a reliable start for photos; KlussDither often preserves illustrations better.')}</p></section>
          <section id="inspect"><h2>{t('3. Проверить результат', '3. Inspect the result')}</h2><p>{t('Сравни оригинал с итогом, приблизь сложные участки и посмотри список материалов. Если лицо, тени или мелкие детали потерялись, слегка измени контраст и насыщенность или попробуй другой дизеринг.', 'Compare the source and result, zoom into difficult areas, and review materials. If faces, shadows, or fine details are lost, make small contrast and saturation changes or try another dithering method.')}</p></section>
          <section id="export"><h2>{t('4. Скачать нужный файл', '4. Download the right file')}</h2><p>{t('PNG подходит для проверки и отправки превью. MAP.DAT создаёт файлы карт. Litematic предназначен для строительства с Litematica. Для больших артов используй ZIP по отдельным картам.', 'PNG is useful for review and sharing. MAP.DAT creates map files. Litematic is intended for building with Litematica. Use ZIP exports for separate tiles of a large art.')}</p><a className="wiki-inline-action" href="/">{t('Открыть редактор', 'Open editor')} <IconGlyph icon={mkIcons.arrowRight} /></a></section>
        </>
      );

    case 'image-processing':
      return (
        <>
          <p className="wiki-lead">{t('Обработка должна сохранять важные детали изображения, а не просто делать его ярче. Меняй по одному параметру и сравнивай результат на холсте.', 'Processing should preserve important details, not simply make the image brighter. Change one parameter at a time and compare the canvas result.')}</p>
          <section id="map-size"><h2>{t('Размер', 'Map size')}</h2><p>{t('Одна карта — 128×128 пикселей и блоков. Пресеты быстро выбирают популярные сетки; «Свой» задаёт точное число карт или пикселей. Чем больше сетка, тем больше деталей, памяти и материалов потребуется.', 'One map is 128×128 pixels and blocks. Presets cover common grids; Custom accepts an exact map or pixel size. Larger grids preserve more detail but require more memory and materials.')}</p></section>
          <section id="crop-adjust"><h2>{t('Обрезка и коррекция', 'Crop and adjust')}</h2><p>{t('Обрезка подгоняет композицию под пропорции выбранной сетки. Коррекция управляет яркостью, контрастом, насыщенностью и цветовыми каналами. Кнопки −/+ позволяют менять значения точно, а удержание ускоряет шаг.', 'Crop matches the composition to the selected grid ratio. Adjustments control brightness, contrast, saturation, and colour channels. −/+ buttons make precise changes and accelerate when held.')}</p></section>
          <section id="colour-match"><h2>{t('Подбор цвета', 'Colour matching')}</h2><p>{t('OKLAB сравнивает цвета ближе к человеческому восприятию и обычно является хорошим выбором. Другие режимы полезны для сравнения, если важен конкретный оттенок или старый рабочий процесс.', 'OKLAB compares colours closer to human perception and is usually the best default. Other modes are useful for comparison when a specific shade or legacy workflow matters.')}</p></section>
          <section id="dithering"><h2>{t('Дизеринг', 'Dithering')}</h2><p>{t('Дизеринг смешивает доступные цвета блоков, чтобы имитировать промежуточные оттенки. Floyd–Steinberg универсален, Stucki мягче на градиентах, Atkinson даёт более выраженный пиксельный характер, KlussDither рассчитан на аккуратные иллюстрации. «Без дизеринга» сохраняет чистые однотонные области.', 'Dithering mixes available block colours to imitate missing shades. Floyd–Steinberg is versatile, Stucki is smoother on gradients, Atkinson has a stronger pixel character, and KlussDither targets clean illustrations. None preserves solid colour regions.')}</p></section>
        </>
      );

    case 'build-modes':
      return (
        <>
          <p className="wiki-lead">{t('Режим определяет не только внешний вид карты, но и способ её строительства. Выбирай его до окончательной ручной правки.', 'The mode changes both the map appearance and the way it is built. Choose it before final manual editing.')}</p>
          <section id="mode-2d"><h2>2D</h2><p>{t('Все видимые блоки лежат на одном уровне. Это самый понятный и быстрый способ строительства, но каждый цвет имеет только основной оттенок карты.', 'All visible blocks sit on one level. This is the simplest and fastest build method, but each map colour has only its base shade.')}</p></section>
          <section id="mode-3d"><h2>3D</h2><p>{t('Высота соседних блоков создаёт тёмные, средние и светлые оттенки. Качество выше, но схема превращается в рельеф или длинные перепады высоты. Litematica почти обязательна для точной постройки.', 'Neighbouring block heights create dark, middle, and bright shades. Quality is higher, but the schematic becomes relief or long height changes. Litematica is strongly recommended.')}</p></section>
          <section id="mode-two-layer"><h2>Two-layer</h2><p>{t('MapKluss строит временную двухслойную конструкцию, записывает нужные оттенки на карту, а Companion поэтапно показывает, какие блоки убрать и где обновить карту. После завершения остаётся плоский арт с качеством 3D.', 'MapKluss builds a temporary two-layer structure, records the required shades, and Companion guides removals and map updates phase by phase. The final result is flat while retaining 3D colour quality.')}</p><Callout title={t('Экспериментальный способ', 'Experimental method')} tone="warning"><p>{t('Two-layer требует MapKluss Companion, Java Edition, совместимой версии и точного следования этапам. Перед первой стройкой прочитай отдельную статью и Telegram-гайд.', 'Two-layer requires MapKluss Companion, Java Edition, a supported version, and exact phase order. Read the dedicated article and Telegram guide before the first build.')}</p></Callout></section>
          <section id="mode-choice"><h2>{t('Как выбрать', 'How to choose')}</h2><div className="wiki-comparison"><div><strong>2D</strong><span>{t('Простота и скорость', 'Simplicity and speed')}</span></div><div><strong>3D</strong><span>{t('Максимум оттенков обычным способом', 'Maximum shades with the standard method')}</span></div><div><strong>Two-layer</strong><span>{t('Качество 3D без постоянных лестниц', '3D quality without permanent stairs')}</span></div></div></section>
        </>
      );

    case 'palette-versions':
      return (
        <>
          <p className="wiki-lead">{t('Палитра определяет, какие блоки MapKluss имеет право использовать. Чем она шире, тем точнее цвет, но тем сложнее сбор материалов.', 'The palette defines which blocks MapKluss may use. A wider palette improves colour accuracy but makes material gathering more complex.')}</p>
          <section id="version"><h2>{t('Версия Minecraft', 'Minecraft version')}</h2><p>{t('Селектор версии скрывает блоки, которых ещё нет в выбранном релизе, и записывает правильные метаданные в экспорт. Текущие основные цели Companion: 26.2, 1.21.11, 1.21.8 и 1.21.4.', 'The version selector hides blocks unavailable in that release and writes matching export metadata. Current main Companion targets are 26.2, 1.21.11, 1.21.8, and 1.21.4.')}</p></section>
          <section id="block-choice"><h2>{t('Выбор блоков', 'Choosing blocks')}</h2><p>{t('Отключай недоступные или дорогие группы и выбирай конкретный вариант блока внутри цвета. Поиск работает по названиям. Изменение блока не меняет цвет карты, но меняет материалы и схему.', 'Disable unavailable or expensive groups and select a concrete block variant for each colour. Search works by block name. A variant change keeps the map colour but changes materials and the schematic.')}</p></section>
          <section id="presets"><h2>{t('Пресеты', 'Presets')}</h2><p>{t('«Все блоки» даёт максимальный выбор. «Только ковры» полезен для обычного плоского арта. Быстрый пресет Two-layer оставляет стабильные блоки, которые быстро ломаются подходящими инструментами или рукой. Пользовательские пресеты сохраняются локально.', 'All blocks maximises colour choice. Carpet Only is useful for standard flat art. The fast Two-layer preset keeps stable blocks that break quickly with the right tool or by hand. Custom presets are stored locally.')}</p></section>
          <section id="platforms"><h2>{t('Java и Bedrock', 'Java and Bedrock')}</h2><p>{t('Часть палитры и экспортов зависит от платформы. Two-layer и Companion предназначены для Java Edition. Если переключить платформу, MapKluss пересчитает доступные блоки и форматы.', 'Some palette entries and exports depend on the platform. Two-layer and Companion target Java Edition. Switching platform recalculates compatible blocks and formats.')}</p></section>
        </>
      );

    case 'editing-tools':
      return (
        <>
          <p className="wiki-lead">{t('Инструменты работают по итоговым пикселям карты. Активный инструмент, горячая клавиша и только его нужные параметры показываются в контекстной строке.', 'Tools edit final map pixels. The context bar shows the active tool, shortcut, and only the settings that tool needs.')}</p>
          <section id="navigation-tools"><h2>{t('Навигация и выбор цвета', 'Navigation and colour picking')}</h2><ul><li><strong>{t('Курсор', 'Cursor')}</strong>{t(' — обычный клик открывает действия пикселя, перетаскивание двигает увеличенный арт.', ' — click for pixel actions; drag to pan a zoomed art.')}</li><li><strong>{t('Пипетка', 'Eyedropper')}</strong>{t(' — берёт блок и оттенок с холста.', ' — samples a block and shade from the canvas.')}</li><li><strong>{t('Временная рука', 'Temporary hand')}</strong>{t(' — Space + ЛКМ двигает холст из любого инструмента, не рисуя.', ' — Space + LMB pans from any tool without painting.')}</li></ul></section>
          <section id="paint-tools"><h2>{t('Рисование', 'Painting')}</h2><ul><li><strong>{t('Кисть', 'Brush')}</strong>{t(' рисует выбранным блоком с интерполяцией быстрых движений.', ' paints with the selected block and interpolates fast strokes.')}</li><li><strong>{t('Заливка', 'Fill')}</strong>{t(' заменяет связанную область одного цвета.', ' replaces a connected area of one colour.')}</li><li><strong>{t('Ластик', 'Eraser')}</strong>{t(' делает пиксели прозрачными там, где формат и слой это допускают.', ' makes pixels transparent where the layer and format allow it.')}</li></ul></section>
          <section id="selection-tools"><h2>{t('Выделения', 'Selections')}</h2><p>{t('Прямоугольник, лассо и волшебная палочка ограничивают последующие операции. Alt вычитает область. Выделение можно удалить, залить, инвертировать или перенести на отдельный слой.', 'Rectangle, lasso, and magic wand constrain later edits. Alt subtracts an area. A selection can be deleted, filled, inverted, or moved to a new layer.')}</p></section>
          <section id="advanced-tools"><h2>{t('Паттерн, градиент и текст', 'Pattern, gradient, and text')}</h2><p>{t('Паттерн повторяет настраиваемую пиксельную сетку и поддерживает непрерывные штрихи. Градиент использует собственные цветовые точки и может добавлять упорядоченный дизеринг. Текст сначала создаётся как редактируемый результат и затем применяется к активному слою.', 'Pattern repeats a configurable pixel grid and supports continuous strokes. Gradient uses its own colour stops and optional ordered dithering. Text is previewed before being applied to the active layer.')}</p><a className="wiki-inline-action" href="/">{t('Открыть редактор', 'Open editor')} <IconGlyph icon={mkIcons.arrowRight} /></a></section>
        </>
      );

    case 'layers-projects':
      return (
        <>
          <p className="wiki-lead">{t('Слои нужны для сложной ручной работы. Для быстрой конвертации одного изображения можно оставаться в обычном режиме.', 'Layers are for detailed manual work. A quick single-image conversion does not require Artist mode.')}</p>
          <section id="artist-mode"><h2>{t('Режим художника', 'Artist mode')}</h2><p>{t('Кнопка режима художника открывает слои, группы и расширенные инструменты. Каждый слой может иметь собственный исходник, прозрачность и способ построения.', 'Artist mode exposes layers, groups, and advanced tools. Each layer may have its own source, opacity, and build mode.')}</p></section>
          <section id="layer-controls"><h2>{t('Управление слоями', 'Layer controls')}</h2><p>{t('Можно менять порядок, видимость, прозрачность и название. Блокировка действительно запрещает рисование и разрушительные операции. Слияние вниз и слияние видимых учитывают прозрачность только один раз.', 'You can change order, visibility, opacity, and name. Locking truly blocks paint and destructive edits. Merge down and merge visible apply opacity only once.')}</p></section>
          <section id="project-files"><h2>{t('Файлы проекта', 'Project files')}</h2><p>{t('Именованные локальные проекты хранятся в браузере. Файл .mapkluss можно скачать для переноса или резервной копии. Новые проекты читают актуальный формат, а MapKluss сохраняет совместимость со старыми поддерживаемыми версиями.', 'Named local projects live in the browser. A .mapkluss file can be downloaded for transfer or backup. New projects use the current format while MapKluss keeps compatibility with supported older versions.')}</p><Callout title={t('Не путай с Cloud', 'Separate from Cloud')}><p>{t('Локальные проекты и Cloud независимы. Сохранение в одном месте не создаёт копию в другом автоматически.', 'Local projects and Cloud are independent. Saving in one place does not automatically create a copy in the other.')}</p></Callout></section>
        </>
      );

    case 'export-files':
      return (
        <>
          <p className="wiki-lead">{t('Экспорт всегда использует текущую версию Minecraft, палитру, режим и видимые слои. Перед скачиванием проверь их в правой панели.', 'Exports always use the current Minecraft version, palette, build mode, and visible layers. Review them in the right panel before downloading.')}</p>
          <section id="preview-exports"><h2>{t('PNG и превью', 'PNG and previews')}</h2><p>{t('PNG сохраняет визуальный результат. Showcase подготавливает изображение для публикации. Эти файлы не строят арт в мире, но подходят для проверки и отправки другим людям.', 'PNG saves the visual result. Showcase prepares a shareable image. These files do not build the art in-world, but they are useful for review and sharing.')}</p></section>
          <section id="minecraft-exports"><h2>{t('Minecraft-файлы', 'Minecraft files')}</h2><ul><li><strong>MAP.DAT</strong>{t(' — готовые данные отдельных карт.', ' — ready data for individual maps.')}</li><li><strong>Litematic</strong>{t(' — схема для Litematica с правильной геометрией и блоками.', ' — a Litematica schematic with matching geometry and blocks.')}</li><li><strong>{t('Структура / datapack', 'Structure / datapack')}</strong>{t(' — версионные игровые форматы с подходящими метаданными.', ' — versioned game formats with matching metadata.')}</li></ul></section>
          <section id="large-art"><h2>{t('Большие арты', 'Large arts')}</h2><p>{t('Большая сетка делится на карты слева направо, затем сверху вниз. ZIP содержит отдельные файлы частей. Two-layer ZIP дополнительно хранит план и контрольные хеши для каждой карты.', 'A large grid is ordered left to right, then top to bottom. ZIP contains separate tile files. A Two-layer ZIP also includes a plan and checksums for every map.')}</p></section>
        </>
      );

    case 'cloud-companion':
      return (
        <>
          <p className="wiki-lead">{t('Cloud связывает сайт и Companion. Обычный редактор остаётся локальным, пока ты явно не сохраняешь арт в аккаунт.', 'Cloud connects the website and Companion. The normal editor remains local until you explicitly save an art to your account.')}</p>
          <section id="cloud-save"><h2>{t('Сохранить в Cloud', 'Save to Cloud')}</h2><p>{t('Открой меню аккаунта в редакторе, войди по email или Telegram и выбери «Сохранить арт». Можно задать название и приватность, а дальнейшие сохранения создают контролируемые версии.', 'Open the account menu in the editor, sign in with email or Telegram, and choose Save art. You can set a title and privacy; later saves create controlled versions.')}</p></section>
          <section id="install-companion"><h2>{t('Установить Companion', 'Install Companion')}</h2><p>{t('Выбери JAR строго под свою версию Minecraft: 26.2, 1.21.11, 1.21.8 или 1.21.4. Для соответствующих функций также нужны совместимые Fabric Loader/API, а для схем — Litematica и MaLiLib.', 'Choose the JAR matching Minecraft exactly: 26.2, 1.21.11, 1.21.8, or 1.21.4. Compatible Fabric Loader/API are required; schematic workflows also use Litematica and MaLiLib.')}</p><div className="wiki-link-row"><a href="/cloud">{t('Скачать на странице Cloud', 'Download from Cloud')}</a><a href={COMPANION_MODRINTH_URL} target="_blank" rel="noreferrer">Modrinth</a><a href={COMPANION_CURSEFORGE_URL} target="_blank" rel="noreferrer">CurseForge</a></div></section>
          <section id="connect-account"><h2>{t('Подключить аккаунт', 'Connect the account')}</h2><p>{t('В меню мода выбери вход, открой код устройства на сайте и подтверди его в уже авторизованном аккаунте. После этого библиотека мода увидит доступные арты и их совместимые артефакты.', 'Choose sign-in in the mod, open the device code on the site, and approve it in an authenticated account. The mod library will then show available arts and compatible artifacts.')}</p><Callout title={t('Без передачи пароля', 'No password sharing')} tone="success"><p>{t('Companion использует код устройства. Пароль или ссылка входа не вводятся внутри Minecraft.', 'Companion uses a device code. You never type a password or email sign-in link inside Minecraft.')}</p></Callout></section>
        </>
      );

    case 'lens':
      return (
        <>
          <p className="wiki-lead">{t('Lens показывает результат редактора как полупрозрачный фантом прямо в мире Minecraft. Это локальный ориентир, а не автоматическая стройка.', 'Lens displays the editor result as a translucent phantom inside Minecraft. It is a local guide, not automatic building.')}</p>
          <section id="lens-purpose"><h2>{t('Для чего нужен Lens', 'What Lens is for')}</h2><p>{t('Можно заранее оценить размер и положение арта, сравнить его со стеной или окружением и видеть изменения редактора без постоянного экспорта новой схемы.', 'You can preview an art’s size and placement, compare it with a wall or surroundings, and see editor changes without repeatedly exporting a schematic.')}</p></section>
          <section id="lens-flow"><h2>{t('Как запустить', 'How to start')}</h2><ol><li>{t('Сохрани или открой арт в Cloud.', 'Save or open an art in Cloud.')}</li><li>{t('В Companion выбери этот арт и запусти Lens.', 'Select that art in Companion and start Lens.')}</li><li>{t('Привяжи положение в мире и открой Lens в редакторе.', 'Anchor its in-world position and open Lens in the editor.')}</li><li>{t('Пока сессия активна, изменения передаются в фантомный preview.', 'While the session is active, updates reach the phantom preview.')}</li></ol></section>
          <section id="lens-safety"><h2>{t('Что хранится', 'What is stored')}</h2><p>{t('Координаты размещения и локальное состояние Companion не превращаются в публичную карту мира. Неактивный Lens не должен постоянно отправлять heartbeat или тяжёлые preview.', 'Placement coordinates and Companion’s local state do not become a public world map. An inactive Lens should not keep sending heartbeats or heavy previews.')}</p></section>
        </>
      );

    case 'two-layer':
      return (
        <>
          <p className="wiki-lead">{t('Two-layer сохраняет оттенки классического 3D-арта, но после пошагового демонтажа оставляет компактную плоскую конструкцию.', 'Two-layer preserves classic 3D map shades but leaves a compact flat structure after guided removal phases.')}</p>
          <section id="two-layer-purpose"><h2>{t('Как работает', 'How it works')}</h2><p>{t('Сайт рассчитывает временную конструкцию из двух рабочих уровней и последовательность фаз. Minecraft сначала записывает нужные оттенки карты, затем Companion проверяет удаление блоков и обновление контрольных областей.', 'The site calculates a temporary two-level structure and an ordered phase plan. Minecraft records the required shades first; Companion then verifies block removals and controlled map updates.')}</p></section>
          <section id="two-layer-export"><h2>{t('Подготовить арт', 'Prepare an art')}</h2><ol><li>{t('Выбери Two-layer рядом с 2D и 3D.', 'Select Two-layer beside 2D and 3D.')}</li><li>{t('Оставь совместимую Java-версию и проверь безопасную палитру.', 'Keep a supported Java version and review the safe palette.')}</li><li>{t('Скачай Two-layer ZIP либо сохрани арт в Cloud.', 'Download the Two-layer ZIP or save the art to Cloud.')}</li><li>{t('Для мозаики пакет содержит отдельную часть для каждой карты.', 'For mosaics, the bundle contains a separate part for every map.')}</li></ol></section>
          <section id="two-layer-build"><h2>{t('Строить в Companion', 'Build with Companion')}</h2><p>{t('Открой ZIP или Cloud-арт, выбери часть, запомни северо-западную опорную точку и установи схему. После начальной проверки Companion по очереди подсвечивает блоки для удаления и точки обновления карты. Переход выполняется только после проверки и команды игрока.', 'Open the ZIP or Cloud art, choose a tile, record the northwest anchor, and place the schematic. After the initial check, Companion highlights removal cells and map update points in order. Progress advances only after verification and player confirmation.')}</p></section>
          <section id="two-layer-limits"><h2>{t('Ограничения', 'Limitations')}</h2><p>{t('Используется незаблокированная карта масштаба 0 в Overworld. Динамические, нестабильные, зависимые от опоры и другие небезопасные блоки исключаются. Companion ничего не ломает и не ставит автоматически.', 'Use an unlocked scale-0 map in the Overworld. Dynamic, unstable, support-dependent, and other unsafe blocks are excluded. Companion does not break or place blocks automatically.')}</p><a className="wiki-inline-action" href={TELEGRAM_URL} target="_blank" rel="noreferrer">{t('Открыть Telegram-гайд', 'Open the Telegram guide')} <IconGlyph icon={mkIcons.arrowRight} /></a></section>
        </>
      );

    case 'shortcuts':
      return (
        <>
          <p className="wiki-lead">{t('Точный список всегда доступен по кнопке клавиатуры над холстом. Комбинации не срабатывают, когда курсор находится в поле ввода.', 'The exact list is always available from the keyboard button above the canvas. Shortcuts do not fire while typing in an input.')}</p>
          <section id="canvas-keys"><h2>{t('Холст', 'Canvas')}</h2><div className="wiki-shortcut-list"><div><span><Key>Ctrl/⌘</Key> + {t('колесо', 'wheel')}</span><strong>{t('Плавное приближение', 'Smooth zoom')}</strong></div><div><span><Key>Space</Key> + <Key>{t('ЛКМ', 'LMB')}</Key></span><strong>{t('Временное перемещение', 'Temporary pan')}</strong></div><div><span><Key>Esc</Key></span><strong>{t('Курсор / отмена текущего действия', 'Cursor / cancel current action')}</strong></div></div></section>
          <section id="tool-keys"><h2>{t('Инструменты', 'Tools')}</h2><div className="wiki-shortcut-list"><div><span><Key>B</Key></span><strong>{t('Кисть', 'Brush')}</strong></div><div><span><Key>E</Key></span><strong>{t('Пипетка', 'Eyedropper')}</strong></div><div><span><Key>F</Key></span><strong>{t('Заливка', 'Fill')}</strong></div><div><span><Key>X</Key></span><strong>{t('Ластик', 'Eraser')}</strong></div><div><span><Key>P</Key> / <Key>G</Key> / <Key>T</Key></span><strong>{t('Паттерн / градиент / текст', 'Pattern / gradient / text')}</strong></div><div><span><Key>Ctrl/⌘ Z</Key></span><strong>{t('Отменить', 'Undo')}</strong></div></div></section>
          <section id="selection-keys"><h2>{t('Выделение', 'Selection')}</h2><div className="wiki-shortcut-list"><div><span><Key>R</Key> / <Key>L</Key> / <Key>W</Key></span><strong>{t('Прямоугольник / лассо / палочка', 'Rectangle / lasso / wand')}</strong></div><div><span><Key>Alt</Key></span><strong>{t('Вычесть область', 'Subtract area')}</strong></div><div><span><Key>Ctrl/⌘ A</Key></span><strong>{t('Выделить всё', 'Select all')}</strong></div><div><span><Key>Delete</Key></span><strong>{t('Удалить выделенное', 'Delete selection')}</strong></div></div></section>
        </>
      );

    case 'troubleshooting':
      return (
        <>
          <p className="wiki-lead">{t('Сначала сохрани исходник или файл проекта. Затем повтори действие после обычного обновления страницы — это помогает отделить временный сбой браузера от ошибки данных.', 'Save the source or project file first. Then retry after a normal reload to separate a temporary browser issue from a data problem.')}</p>
          <section id="upload-problems"><h2>{t('Изображение не загружается', 'Image does not load')}</h2><ul><li>{t('Проверь формат: PNG, JPG, WebP, GIF или MAP.DAT.', 'Check the format: PNG, JPG, WebP, GIF, or MAP.DAT.')}</li><li>{t('Попробуй меньшую копию или обычный PNG без редкого цветового профиля.', 'Try a smaller copy or a standard PNG without an unusual colour profile.')}</li><li>{t('Если вставка не работает, выбери файл через область «Исходник».', 'If paste fails, choose the file through the Source area.')}</li></ul></section>
          <section id="performance-problems"><h2>{t('Редактор работает медленно', 'The editor is slow')}</h2><ul><li>{t('Уменьши сетку карт или размер исходника.', 'Reduce the map grid or source image size.')}</li><li>{t('Выключи сравнение и текстуры блоков во время тяжёлой правки.', 'Disable compare and block textures during heavy editing.')}</li><li>{t('Закрой другие тяжёлые вкладки; большие мозаики требуют много памяти браузера.', 'Close other heavy tabs; large mosaics require substantial browser memory.')}</li></ul></section>
          <section id="export-problems"><h2>{t('Экспорт или Cloud не завершается', 'Export or Cloud does not finish')}</h2><p>{t('Проверь выбранную версию, активную палитру и свободное место. Для Cloud убедись, что аккаунт всё ещё авторизован. Предыдущая рабочая версия арта не должна удаляться при неудачном сохранении.', 'Check the selected version, active palette, and available storage. For Cloud, make sure the account is still authenticated. A failed save should not remove the previous working art version.')}</p></section>
          <section id="get-help"><h2>{t('Сообщить о проблеме', 'Report a problem')}</h2><p>{t('Напиши версию браузера или Minecraft, версию MapKluss/Companion, точные шаги и приложи скриншот. Не отправляй пароль, токен входа или приватные ключи.', 'Include the browser or Minecraft version, MapKluss/Companion version, exact steps, and a screenshot. Never send passwords, sign-in tokens, or private keys.')}</p><a className="wiki-inline-action" href={TELEGRAM_URL} target="_blank" rel="noreferrer">Telegram MapKluss <IconGlyph icon={mkIcons.arrowRight} /></a></section>
        </>
      );
  }
}

export function WikiPage() {
  const { lang, toggle, t } = useLocale();
  const [activeId, setActiveId] = useState<WikiArticleId>(() => (
    window.location.hash
      ? getWikiArticleFromHash(window.location.hash).id
      : getWikiArticleFromPath(window.location.pathname).id
  ));
  const [query, setQuery] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const activeArticle = getWikiArticle(activeId);
  const results = useMemo(() => searchWiki(query, lang), [lang, query]);
  const toc = ARTICLE_TOC[activeId];

  const scrollToHashSection = (behavior: ScrollBehavior = 'auto') => {
    const sectionId = window.location.hash.replace(/^#/, '').split('/')[1];
    if (!sectionId) {
      articleRef.current?.scrollTo({ top: 0, behavior });
      return;
    }
    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior, block: 'start' });
    });
  };

  useEffect(() => {
    const handleHash = () => {
      setActiveId(getWikiArticleFromHash(window.location.hash).id);
      scrollToHashSection();
    };
    window.addEventListener('hashchange', handleHash);
    scrollToHashSection();
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    applyPageMeta({
      title: t('Wiki MapKluss — редактор, Cloud и Companion', 'MapKluss Wiki — Editor, Cloud, and Companion'),
      description: t(
        'Актуальная документация MapKluss: создание Minecraft map art, инструменты редактора, палитра, экспорт, Cloud, Lens и Two-layer Builder.',
        'Current MapKluss documentation for Minecraft map art, editor tools, palette, exports, Cloud, Lens, and Two-layer Builder.',
      ),
      url: `${window.location.origin}/wiki`,
      image: `${window.location.origin}/og-image.png`,
      schema: [{
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: t('Wiki MapKluss', 'MapKluss Wiki'),
        description: t('Документация редактора и мода MapKluss.', 'Documentation for the MapKluss editor and mod.'),
        url: `${window.location.origin}/wiki`,
        inLanguage: lang === 'ru' ? 'ru' : 'en',
      }],
    });
  }, [lang, t]);

  const openArticle = (id: WikiArticleId) => {
    setActiveId(id);
    setQuery('');
    setMobileNavOpen(false);
    window.history.pushState(null, '', `/wiki#${id}`);
    articleRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="public-shell wiki-shell">
      <PublicSiteHeader active="wiki" lang={lang} onToggleLanguage={toggle} />
      <div className="wiki-topbar">
        <div className="wiki-topbar-title">
          <IconGlyph icon={mkIcons.wiki} />
          <span><strong>MapKluss Wiki</strong><small>{t('Документация редактора и мода', 'Editor and mod documentation')}</small></span>
        </div>
        <label className="wiki-search">
          <IconGlyph icon={mkIcons.wand} />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={event => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              if (nextQuery) setMobileNavOpen(true);
            }}
            placeholder={t('Найти статью…', 'Search documentation…')}
            aria-label={t('Поиск по Wiki', 'Search the Wiki')}
          />
          <span aria-hidden="true">/</span>
        </label>
        <button className="wiki-mobile-nav-toggle" type="button" onClick={() => setMobileNavOpen(value => !value)} aria-expanded={mobileNavOpen}>
          <IconGlyph icon={mkIcons.projectEditor} />
          {t('Разделы', 'Sections')}
        </button>
        <a className="wiki-open-editor" href="/"><IconGlyph icon={mkIcons.artboard} /> {t('В редактор', 'Open editor')}</a>
      </div>

      <main className="wiki-layout">
        <aside className={`wiki-navigation${mobileNavOpen ? ' is-open' : ''}`} aria-label={t('Разделы Wiki', 'Wiki sections')}>
          {query ? (
            <div className="wiki-search-results">
              <strong>{t('Результаты', 'Results')} <span>{results.length}</span></strong>
              {results.length ? results.map(article => (
                <button key={article.id} type="button" onClick={() => openArticle(article.id)}>
                  <span>{lang === 'ru' ? article.titleRu : article.titleEn}</span>
                  <small>{lang === 'ru' ? article.summaryRu : article.summaryEn}</small>
                </button>
              )) : <p>{t('Ничего не найдено. Попробуй название функции или файла.', 'Nothing found. Try a feature or file name.')}</p>}
            </div>
          ) : WIKI_GROUPS.map(group => (
            <section className="wiki-nav-group" key={group.id}>
              <h2>{lang === 'ru' ? group.titleRu : group.titleEn}</h2>
              {WIKI_ARTICLES.filter(article => article.group === group.id).map(article => (
                <button
                  key={article.id}
                  type="button"
                  className={article.id === activeId ? 'is-active' : ''}
                  onClick={() => openArticle(article.id)}
                  aria-current={article.id === activeId ? 'page' : undefined}
                >
                  {lang === 'ru' ? article.titleRu : article.titleEn}
                </button>
              ))}
            </section>
          ))}
        </aside>

        <article className="wiki-article" ref={articleRef}>
          <nav className="wiki-breadcrumbs" aria-label={t('Навигационная цепочка', 'Breadcrumb')}>
            <a href="/">MapKluss</a><span>/</span><button type="button" onClick={() => openArticle('welcome')}>Wiki</button><span>/</span><strong>{lang === 'ru' ? activeArticle.titleRu : activeArticle.titleEn}</strong>
          </nav>
          <header className="wiki-article-header">
            <span>{lang === 'ru' ? WIKI_GROUPS.find(group => group.id === activeArticle.group)?.titleRu : WIKI_GROUPS.find(group => group.id === activeArticle.group)?.titleEn}</span>
            <h1>{lang === 'ru' ? activeArticle.titleRu : activeArticle.titleEn}</h1>
            <p>{lang === 'ru' ? activeArticle.summaryRu : activeArticle.summaryEn}</p>
          </header>
          <div className="wiki-article-body">
            <ArticleBody articleId={activeId} t={t} onArticle={openArticle} />
          </div>
          <footer className="wiki-article-footer">
            <span>{t('Не нашёл ответ?', 'Still need help?')}</span>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer">{t('Спроси в Telegram', 'Ask in Telegram')} <IconGlyph icon={mkIcons.arrowRight} /></a>
          </footer>
        </article>

        <aside className="wiki-on-this-page" aria-label={t('В этой статье', 'On this page')}>
          <strong>{t('В этой статье', 'On this page')}</strong>
          {toc.map(item => <a key={item.id} href={`#${activeId}/${item.id}`} onClick={event => {
            event.preventDefault();
            window.history.pushState(null, '', `/wiki#${activeId}/${item.id}`);
            document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>{lang === 'ru' ? item.labelRu : item.labelEn}</a>)}
        </aside>
      </main>
    </div>
  );
}
