export interface SeoFaqItem {
  questionRu: string;
  questionEn: string;
  answerRu: string;
  answerEn: string;
}

export interface SeoLinkItem {
  href: string;
  labelRu: string;
  labelEn: string;
}

export interface SeoPageDefinition {
  path: string;
  title: string;
  description: string;
  kickerRu: string;
  kickerEn: string;
  h1Ru: string;
  h1En: string;
  introRu: string;
  introEn: string;
  bodyRu: string;
  bodyEn: string;
  highlightsRu: string[];
  highlightsEn: string[];
  workflowRu: string[];
  workflowEn: string[];
  exampleIds: string[];
  faq: SeoFaqItem[];
  related: SeoLinkItem[];
}

export const SEO_PAGES: SeoPageDefinition[] = [
  {
    path: '/minecraft-map-art-generator',
    title: 'Minecraft Map Art Generator & Litematic Export | MapKluss',
    description: 'Convert images into Minecraft map art in your browser. Preview 2D and 3D stair results, tune dithering and palette, then export Litematic, MAP.DAT, and materials.',
    kickerRu: 'Инструмент',
    kickerEn: 'Tool',
    h1Ru: 'Генератор Minecraft map art',
    h1En: 'Minecraft Map Art Generator',
    introRu: 'MapKluss превращает изображение в готовый Minecraft map art прямо в браузере. Загрузи картинку, выбери размер карты, настрой дизеринг и экспортируй Litematic, MAP.DAT и список материалов.',
    introEn: 'MapKluss turns an image into buildable Minecraft map art directly in the browser. Upload an image, choose map size, tune dithering, and export Litematic, MAP.DAT, and materials.',
    bodyRu: 'Это редактор и генератор для игроков, которым нужен не просто PNG-превью, а полный workflow: палитра, 2D/3D режимы, сравнение алгоритмов, ручная правка, материалы и файлы для постройки.',
    bodyEn: 'It is built for players who need more than a quick preview. You get palette control, 2D and 3D stair modes, dithering comparisons, manual cleanup tools, materials, and build-ready exports.',
    highlightsRu: [
      '2D Flat и 3D Stair режимы для разного уровня детализации',
      'Палитра Minecraft-блоков с ручным отключением лишних материалов',
      'Экспорт Litematic, MAP.DAT, PNG и списка материалов',
    ],
    highlightsEn: [
      '2D Flat and 3D Stair modes for different build/detail tradeoffs',
      'Minecraft block palette control with manual material filtering',
      'Litematic, MAP.DAT, PNG, and materials export in one workflow',
    ],
    workflowRu: [
      'Загрузи изображение или вставь его из буфера.',
      'Выбери размер карты, режим 2D/3D и алгоритм дизеринга.',
      'Проверь preview, материалы и экспортируй файл для постройки.',
    ],
    workflowEn: [
      'Upload an image or paste it from the clipboard.',
      'Choose map size, 2D/3D mode, and a dithering algorithm.',
      'Check the preview, materials, and export the build file you need.',
    ],
    exampleIds: ['anime-portrait', 'anime-illustration'],
    faq: [
      {
        questionRu: 'Подходит ли MapKluss для Litematic?',
        questionEn: 'Does MapKluss work with Litematic?',
        answerRu: 'Да. Ты можешь экспортировать схему как .litematic и использовать её в Minecraft через Litematica.',
        answerEn: 'Yes. You can export a .litematic file and use it in Minecraft with Litematica.',
      },
      {
        questionRu: 'Можно ли делать 3D staircase map art?',
        questionEn: 'Can it generate 3D staircase map art?',
        answerRu: 'Да. В режиме 3D Stair MapKluss использует перепады высоты для дополнительных оттенков и даёт отдельный 3D preview сложности.',
        answerEn: 'Yes. In 3D Stair mode MapKluss uses height changes for extra shades and provides a dedicated 3D complexity preview.',
      },
      {
        questionRu: 'Нужна ли регистрация?',
        questionEn: 'Do I need an account?',
        answerRu: 'Нет. Основной workflow работает прямо в браузере без обычной регистрации.',
        answerEn: 'No. The core workflow runs directly in the browser without normal account setup.',
      },
    ],
    related: [
      { href: '/mapartcraft-alternative', labelRu: 'Альтернатива MapartCraft', labelEn: 'MapartCraft alternative' },
      { href: '/minecraft-litematic-map-art-generator', labelRu: 'Экспорт Litematic', labelEn: 'Litematic export' },
      { href: '/minecraft-map-dat-generator', labelRu: 'Экспорт MAP.DAT', labelEn: 'MAP.DAT export' },
    ],
  },
  {
    path: '/mapartcraft-alternative',
    title: 'MapartCraft Alternative for Minecraft Map Art | MapKluss',
    description: 'Looking for a modern MapartCraft alternative? Compare MapKluss for browser-based Minecraft map art, 2D/3D preview, Litematic export, MAP.DAT, materials, and build workflow tools.',
    kickerRu: 'Сравнение',
    kickerEn: 'Comparison',
    h1Ru: 'Современная альтернатива MapartCraft',
    h1En: 'A Modern MapartCraft Alternative',
    introRu: 'Если старые map art инструменты кажутся тебе устаревшими, MapKluss закрывает тот же запрос, но даёт более глубокий workflow: preview, материалы, Litematic, MAP.DAT, 3D preview и ручную правку.',
    introEn: 'If older map-art tools feel dated, MapKluss covers the same core need but adds a deeper workflow: preview, materials, Litematic, MAP.DAT, 3D preview, and manual cleanup.',
    bodyRu: 'Эта страница нужна не для пустого хейта конкурента, а для понятного ответа: почему builder или content creator может захотеть перейти на более современный workflow.',
    bodyEn: 'This page is not just here to attack a competitor. It answers a practical question: why a builder or content creator might switch to a more modern workflow.',
    highlightsRu: [
      'Больше контроля над палитрой, дизерингом и режимами 2D/3D',
      'Материалы, build tracker и share links для реальной постройки',
      'Более честный preview и отдельный 3D просмотр схематики',
    ],
    highlightsEn: [
      'More control over palette, dithering, and 2D/3D modes',
      'Materials, build tracker, and share links for real build workflows',
      'A more trustworthy preview plus a dedicated schematic 3D view',
    ],
    workflowRu: [
      'Сравни результат на одном и том же изображении.',
      'Проверь, какие форматы экспорта тебе реально нужны.',
      'Посмотри, как MapKluss ведёт тебя от картинки до постройки.',
    ],
    workflowEn: [
      'Compare the result on the same image.',
      'Check which export formats you actually need.',
      'See how MapKluss gets you from image to finished build workflow.',
    ],
    exampleIds: ['logo-flat', 'large-showcase'],
    faq: [
      {
        questionRu: 'Чем MapKluss отличается от старых map art генераторов?',
        questionEn: 'What makes MapKluss different from older map-art generators?',
        answerRu: 'Главное отличие — это не только конвертация изображения, но и весь build workflow: палитра, сравнение, материалы, Litematic, MAP.DAT и build tracker.',
        answerEn: 'The main difference is that it is not only an image converter. It supports the full build workflow: palette control, compare mode, materials, Litematic, MAP.DAT, and build tracking.',
      },
      {
        questionRu: 'Подходит ли MapKluss для больших артов?',
        questionEn: 'Is MapKluss good for large multi-map art?',
        answerRu: 'Да. Он поддерживает сетки нескольких карт, ZIP-экспорт отдельных схем, материалы и большие 3D/2D проекты.',
        answerEn: 'Yes. It supports multi-map grids, ZIP export for separate schematics, materials planning, and larger 2D/3D projects.',
      },
      {
        questionRu: 'Можно ли использовать его без установки?',
        questionEn: 'Can I use it without installing anything?',
        answerRu: 'Да. Основной генератор работает в браузере. Отдельно тебе могут понадобиться только инструменты внутри самого Minecraft, например Litematica.',
        answerEn: 'Yes. The core generator runs in the browser. The only extra tools you may need are inside Minecraft itself, such as Litematica.',
      },
    ],
    related: [
      { href: '/minecraft-map-art-generator', labelRu: 'Генератор map art', labelEn: 'Map art generator' },
      { href: '/minecraft-litematic-map-art-generator', labelRu: 'Litematic workflow', labelEn: 'Litematic workflow' },
      { href: '/examples', labelRu: 'Примеры', labelEn: 'Examples' },
    ],
  },
  {
    path: '/minecraft-litematic-map-art-generator',
    title: 'Minecraft Map Art Litematic Generator | MapKluss',
    description: 'Generate Litematic files for Minecraft map art. Convert images, preview the result, and export build-ready .litematic files with 2D or 3D stair structure.',
    kickerRu: 'Экспорт',
    kickerEn: 'Export',
    h1Ru: 'Генератор Litematic для Minecraft map art',
    h1En: 'Generate Litematic Files for Minecraft Map Art',
    introRu: 'Если тебе нужен `.litematic` для Litematica, MapKluss умеет сразу собрать схему из готового map art. Это удобнее, чем вручную переносить результат из обычного image converter.',
    introEn: 'If you need a `.litematic` for Litematica, MapKluss can generate the schematic directly from your map art result. It is a cleaner workflow than manually rebuilding from a plain image converter.',
    bodyRu: 'Экспорт схематики особенно важен для survival builders и серверных проектов: ты сразу получаешь buildable output, а не просто красивый preview.',
    bodyEn: 'Schematic export matters most for survival builders and server projects because it turns the result into a buildable output instead of just a nice preview.',
    highlightsRu: [
      'Плоская 2D схема или 3D staircase-схема с дополнительными оттенками',
      'Материалы и количество блоков можно проверить до экспорта',
      'Подходит для одиночных и multi-map проектов',
    ],
    highlightsEn: [
      'Flat 2D schematics or 3D staircase schematics with extra shades',
      'Check materials and block counts before exporting',
      'Works for single-map and larger multi-map projects',
    ],
    workflowRu: [
      'Загрузи изображение и настрой результат под Minecraft-палитру.',
      'Проверь, насколько сложной будет схема в 2D или 3D.',
      'Экспортируй `.litematic` и открывай её в Litematica.',
    ],
    workflowEn: [
      'Upload your image and tune it to the Minecraft palette.',
      'Preview how complex the result will be in 2D or 3D.',
      'Export the `.litematic` and open it in Litematica.',
    ],
    exampleIds: ['anime-illustration', 'large-showcase'],
    faq: [
      {
        questionRu: 'Что лучше для схематики: 2D или 3D?',
        questionEn: 'Which is better for a schematic: 2D or 3D?',
        answerRu: '2D проще и дешевле строить. 3D staircase даёт больше оттенков, но требует больше внимания к высоте и опорам.',
        answerEn: '2D is simpler and cheaper to build. 3D staircase gives you more shades but demands more attention to height and supports.',
      },
      {
        questionRu: 'Можно ли экспортировать большие multi-map схемы?',
        questionEn: 'Can I export larger multi-map schematics?',
        answerRu: 'Да. MapKluss поддерживает большие сетки карт и ZIP-экспорт по отдельным 128×128 секциям.',
        answerEn: 'Yes. MapKluss supports larger map grids and ZIP export split into individual 128×128 sections.',
      },
      {
        questionRu: 'Нужна ли Litematica?',
        questionEn: 'Do I need Litematica?',
        answerRu: 'Для `.litematic` экспорта — да, если ты хочешь использовать схему в игре. Но тот же проект можно готовить и ради материалов, PNG или MAP.DAT.',
        answerEn: 'For `.litematic` export, yes, if you want to use the schematic in-game. The same project can also be used for materials, PNG, or MAP.DAT workflows.',
      },
    ],
    related: [
      { href: '/minecraft-map-dat-generator', labelRu: 'MAP.DAT export', labelEn: 'MAP.DAT export' },
      { href: '/minecraft-map-art-generator', labelRu: 'Общий генератор', labelEn: 'Main generator' },
      { href: '/examples', labelRu: 'Галерея примеров', labelEn: 'Examples gallery' },
    ],
  },
  {
    path: '/minecraft-map-dat-generator',
    title: 'Minecraft MAP.DAT Generator for Map Art | MapKluss',
    description: 'Generate MAP.DAT files for Minecraft map art. Convert an image, preview the result, and export one or more map.dat files for direct map workflows.',
    kickerRu: 'Экспорт',
    kickerEn: 'Export',
    h1Ru: 'Генератор MAP.DAT для Minecraft map art',
    h1En: 'Generate MAP.DAT Files for Minecraft Map Art',
    introRu: 'MapKluss умеет экспортировать не только PNG и `.litematic`, но и `MAP.DAT` для тех, кто работает через карты напрямую и хочет быстрый Minecraft-ready output.',
    introEn: 'MapKluss can export more than PNG and `.litematic`. It also supports `MAP.DAT` for players who want a direct map-based workflow and a Minecraft-ready output.',
    bodyRu: 'Это полезно, если тебе нужен map-based pipeline: ты сразу видишь картинку в Minecraft-формате и можешь распределять проект по отдельным картам.',
    bodyEn: 'This is useful when you want a map-based pipeline: you can prepare the image in Minecraft map format and split larger builds into separate maps.',
    highlightsRu: [
      'Экспорт одного или нескольких `map.dat` файлов по сетке карт',
      'Подходит для vanilla-oriented и survival-oriented workflow',
      'Можно комбинировать с палитрой, материалами и preview до финального экспорта',
    ],
    highlightsEn: [
      'Export one or more `map.dat` files based on your selected map grid',
      'Useful for vanilla-oriented and survival-oriented workflows',
      'Works together with palette control, materials, and preview before export',
    ],
    workflowRu: [
      'Выбери размер карты и настрой изображение.',
      'Проверь итоговое распределение цветов и материалов.',
      'Экспортируй `MAP.DAT` по одной карте или целой сеткой.',
    ],
    workflowEn: [
      'Choose map size and tune the image.',
      'Check the final color distribution and materials.',
      'Export `MAP.DAT` for one map or an entire grid.',
    ],
    exampleIds: ['anime-portrait', 'pixel-art'],
    faq: [
      {
        questionRu: 'Когда MAP.DAT лучше, чем Litematic?',
        questionEn: 'When is MAP.DAT better than Litematic?',
        answerRu: 'Когда тебе важнее map-based workflow и работа именно через карты. Для блочной постройки и визуальной схематики удобнее Litematic.',
        answerEn: 'When the map-based workflow matters more and you want to work directly with maps. For block-by-block building guidance, Litematic is usually better.',
      },
      {
        questionRu: 'Можно ли экспортировать несколько карт сразу?',
        questionEn: 'Can I export multiple maps at once?',
        answerRu: 'Да. Для multi-map артов MapKluss умеет экспортировать несколько `MAP.DAT` файлов — по одному на каждую карту.',
        answerEn: 'Yes. For multi-map art, MapKluss can export multiple `MAP.DAT` files, one per map.',
      },
      {
        questionRu: 'Нужно ли предварительно настраивать палитру?',
        questionEn: 'Do I need to tune the palette first?',
        answerRu: 'Лучше да. Даже для MAP.DAT качество результата зависит от палитры, дизеринга и выбора 2D/3D режима.',
        answerEn: 'Usually yes. Even for MAP.DAT, output quality still depends on palette, dithering, and your 2D/3D choices.',
      },
    ],
    related: [
      { href: '/minecraft-litematic-map-art-generator', labelRu: 'Litematic export', labelEn: 'Litematic export' },
      { href: '/minecraft-map-art-generator', labelRu: 'Главный генератор', labelEn: 'Main generator' },
      { href: '/examples', labelRu: 'Примеры map art', labelEn: 'Map art examples' },
    ],
  },
  {
    path: '/how-to-make-minecraft-map-art',
    title: 'How to Make Minecraft Map Art: Full Beginner Guide | MapKluss',
    description: 'Learn how to make Minecraft map art from an image. Choose map size, 2D or 3D stair mode, dithering, palette, and export Litematic, MAP.DAT, or materials.',
    kickerRu: 'Гайд',
    kickerEn: 'Guide',
    h1Ru: 'Как сделать Minecraft map art',
    h1En: 'How to Make Minecraft Map Art',
    introRu: 'Если ты делаешь map art впервые, основной путь выглядит так: взять исходную картинку, подогнать её под палитру Minecraft, выбрать размер карт и решить, нужен ли тебе 2D Flat или 3D Stair.',
    introEn: 'If this is your first map-art project, the basic workflow is simple: start with an image, fit it to the Minecraft palette, choose map size, and decide whether you need 2D Flat or 3D Stair.',
    bodyRu: 'MapKluss закрывает весь путь в одном месте: preview, дизеринг, палитра, материалы и экспорт. Тебе не нужно собирать workflow из нескольких старых инструментов и проверять всё уже внутри игры.',
    bodyEn: 'MapKluss covers that workflow in one place: preview, dithering, palette control, materials, and export. You do not need to stitch together multiple older tools and validate everything in-game.',
    highlightsRu: [
      'Подходит для логотипов, аниме, фото, пиксель-арта и больших multi-map проектов',
      'Даёт выбор между более простой 2D постройкой и более детализированным 3D Stair',
      'Сразу показывает материалы, размеры и итоговый build-ready экспорт',
    ],
    highlightsEn: [
      'Works for logos, anime, photos, pixel art, and larger multi-map builds',
      'Lets you choose between simpler 2D builds and more detailed 3D Stair output',
      'Shows materials, map size, and build-ready export before you commit',
    ],
    workflowRu: [
      'Загрузи изображение и выбери размер: 1x1, 2x2, 4x4 или больше.',
      'Настрой палитру и дизеринг, затем сравни 2D Flat и 3D Stair результат.',
      'Проверь материалы, preview и экспортируй Litematic, MAP.DAT или PNG.',
    ],
    workflowEn: [
      'Upload an image and choose a size: 1x1, 2x2, 4x4, or larger.',
      'Tune the palette and dithering, then compare 2D Flat and 3D Stair output.',
      'Review materials, preview the result, and export Litematic, MAP.DAT, or PNG.',
    ],
    exampleIds: ['anime-portrait', 'logo-flat'],
    faq: [
      {
        questionRu: 'Что лучше для первого арта: 2D или 3D?',
        questionEn: 'What is better for a first project: 2D or 3D?',
        answerRu: 'Для первого проекта обычно лучше 2D Flat: он проще в постройке и легче читается. 3D Stair полезен, когда тебе нужно больше оттенков и ты готов работать с высотами.',
        answerEn: 'For a first project, 2D Flat is usually better because it is simpler to build and easier to read. 3D Stair is useful when you need more shades and are ready to manage height changes.',
      },
      {
        questionRu: 'Нужно ли самому подбирать палитру?',
        questionEn: 'Do I need to tune the palette manually?',
        answerRu: 'Часто да. Особенно это важно для логотипов, фото и сложных цветовых сцен. MapKluss позволяет отключать лишние блоки и подгонять результат под реальную постройку.',
        answerEn: 'Often yes. This matters most for logos, photos, and more difficult color scenes. MapKluss lets you disable unwanted blocks and tune the result for a real build.',
      },
      {
        questionRu: 'Что экспортировать после генерации?',
        questionEn: 'What should I export after generating the art?',
        answerRu: 'Если тебе нужна схематика для постройки, бери Litematic. Если работаешь через карты напрямую, используй MAP.DAT. Для оценки стоимости постройки смотри список материалов.',
        answerEn: 'If you want a schematic for building, export Litematic. If you work directly with maps, use MAP.DAT. For build cost planning, use the materials list.',
      },
    ],
    related: [
      { href: '/best-dithering-for-minecraft-map-art', labelRu: 'Гайд по дизерингу', labelEn: 'Dithering guide' },
      { href: '/2d-vs-3d-stair-map-art', labelRu: '2D vs 3D Stair', labelEn: '2D vs 3D Stair' },
      { href: '/minecraft-map-art-generator', labelRu: 'Открыть генератор', labelEn: 'Open the generator' },
    ],
  },
  {
    path: '/best-dithering-for-minecraft-map-art',
    title: 'Best Dithering for Minecraft Map Art | MapKluss',
    description: 'Compare dithering modes for Minecraft map art. Learn when to use clean conversion, ordered noise, Floyd-Steinberg, or other approaches for logos, photos, anime, and pixel art.',
    kickerRu: 'Качество',
    kickerEn: 'Quality',
    h1Ru: 'Какой дизеринг лучше для Minecraft map art',
    h1En: 'Best Dithering for Minecraft Map Art',
    introRu: 'Универсального лучшего дизеринга для map art не существует. Логотип, аниме-арт, фото и пиксель-арт ведут себя по-разному, поэтому правильный режим зависит от типа изображения и от того, насколько чистой должна быть постройка.',
    introEn: 'There is no universal best dithering mode for map art. Logos, anime art, photos, and pixel art behave differently, so the right choice depends on the image and on how clean you need the build to be.',
    bodyRu: 'MapKluss позволяет быстро переключать режимы и сравнивать результат до экспорта. Это особенно важно, потому что неправильный дизеринг может либо разрушить чистые края, либо, наоборот, слишком сильно упростить сложную картинку.',
    bodyEn: 'MapKluss lets you switch modes quickly and compare the result before exporting. That matters because the wrong dithering can either destroy clean edges or oversimplify a detailed image.',
    highlightsRu: [
      'Для логотипов и чистых форм часто лучше слабый дизеринг или его отсутствие',
      'Для фото и сложных градиентов помогают более распределённые алгоритмы',
      'Правильный выбор видно не по названию режима, а по preview и материалам',
    ],
    highlightsEn: [
      'For logos and clean shapes, lighter dithering or no dithering often works best',
      'For photos and difficult gradients, more distributed algorithms usually help',
      'The right choice comes from previewing the result, not from the mode name alone',
    ],
    workflowRu: [
      'Начни с исходника и посмотри результат без дизеринга или с самым мягким режимом.',
      'Переключай режимы и следи, где пропадают чистые края или появляются лишние шумовые точки.',
      'Сравни результат по preview, материалам и читаемости уже как будущей постройки.',
    ],
    workflowEn: [
      'Start from the source image and inspect the result with no dithering or the lightest mode.',
      'Switch between modes and watch where clean edges disappear or extra noise starts to dominate.',
      'Compare by preview, materials, and how readable the build will feel in Minecraft.',
    ],
    exampleIds: ['anime-illustration', 'pixel-art'],
    faq: [
      {
        questionRu: 'Когда лучше отключать дизеринг полностью?',
        questionEn: 'When should I disable dithering completely?',
        answerRu: 'Когда тебе важны чистые края, простые заливки и предсказуемый набор блоков. Это особенно полезно для логотипов, иконок и пиксель-арта.',
        answerEn: 'When clean edges, simple fills, and predictable block usage matter most. This is especially useful for logos, icons, and pixel art.',
      },
      {
        questionRu: 'Почему фото часто требуют другой режим?',
        questionEn: 'Why do photos often need a different mode?',
        answerRu: 'У фото обычно больше мягких переходов и полутонов. Без подходящего дизеринга такие изображения могут выглядеть слишком плоско после перевода в палитру Minecraft.',
        answerEn: 'Photos usually contain softer gradients and more half-tones. Without the right dithering, they can look too flat after being reduced to the Minecraft palette.',
      },
      {
        questionRu: 'Можно ли выбрать один режим и всегда пользоваться только им?',
        questionEn: 'Can I pick one mode and use it for everything?',
        answerRu: 'Практически нет. Один и тот же режим может хорошо работать на аниме-арте и плохо на логотипах или фото, поэтому сравнение в preview остаётся обязательным.',
        answerEn: 'Not really. The same mode can work well on anime art but poorly on logos or photos, so preview-based comparison stays essential.',
      },
    ],
    related: [
      { href: '/how-to-make-minecraft-map-art', labelRu: 'Полный гайд', labelEn: 'Full beginner guide' },
      { href: '/2d-vs-3d-stair-map-art', labelRu: '2D vs 3D Stair', labelEn: '2D vs 3D Stair' },
      { href: '/examples', labelRu: 'Примеры результата', labelEn: 'Examples gallery' },
    ],
  },
  {
    path: '/2d-vs-3d-stair-map-art',
    title: '2D Flat vs 3D Stair Minecraft Map Art | MapKluss',
    description: 'Compare 2D Flat and 3D Stair Minecraft map art. Learn when to use simpler flat builds and when extra height-based shades are worth the added build complexity.',
    kickerRu: 'Сравнение',
    kickerEn: 'Comparison',
    h1Ru: '2D Flat vs 3D Stair в Minecraft map art',
    h1En: '2D Flat vs 3D Stair Map Art',
    introRu: 'Главный выбор в Minecraft map art — строить плоский 2D арт или использовать 3D Stair для дополнительных оттенков. Разница не только во внешнем виде, но и в сложности постройки, количестве опор и в том, насколько проект удобен для survival.',
    introEn: 'One of the main choices in Minecraft map art is whether to build a flat 2D result or use 3D Stair for extra shades. The difference is not just visual. It affects build difficulty, supports, and how manageable the project feels in survival.',
    bodyRu: 'MapKluss показывает оба режима на одном и том же изображении, а также даёт 3D preview схематики. Это помогает не гадать, а сразу видеть, где 3D действительно оправдан, а где проще и лучше оставить 2D.',
    bodyEn: 'MapKluss can show both modes on the same source image and includes a schematic 3D preview. That means you can see where 3D is actually worth it and where 2D stays cleaner and easier.',
    highlightsRu: [
      '2D Flat проще строить, легче проверять и обычно дешевле по ресурсам',
      '3D Stair добавляет оттенки через высоту, но повышает сложность и требования к опорам',
      'Лучший выбор зависит от изображения, размера карты и твоего build workflow',
    ],
    highlightsEn: [
      '2D Flat is easier to build, easier to verify, and usually cheaper in resources',
      '3D Stair adds shades through height changes but increases complexity and support requirements',
      'The best choice depends on the image, map size, and your intended build workflow',
    ],
    workflowRu: [
      'Сначала посмотри 2D результат и оцени, хватает ли тебе читаемости и цветов.',
      'Потом переключись на 3D Stair и проверь, действительно ли дополнительные оттенки улучшают картинку.',
      'Открой 3D preview и проверь, насколько сложной станет схема до финального экспорта.',
    ],
    workflowEn: [
      'Start with the 2D result and check whether the image already reads well enough.',
      'Then switch to 3D Stair and evaluate whether the extra shades actually improve the art.',
      'Open the 3D preview and inspect how complex the schematic becomes before exporting.',
    ],
    exampleIds: ['large-showcase', 'anime-illustration'],
    faq: [
      {
        questionRu: 'Когда 2D лучше 3D?',
        questionEn: 'When is 2D better than 3D?',
        answerRu: 'Когда тебе важны простота постройки, скорость, предсказуемые материалы и чистый силуэт. Для многих логотипов, пиксель-арта и простых сцен 2D оказывается лучшим вариантом.',
        answerEn: 'When simplicity, speed, predictable materials, and a clean silhouette matter most. For many logos, pixel-art pieces, and simple scenes, 2D is the better choice.',
      },
      {
        questionRu: 'Когда 3D Stair действительно оправдан?',
        questionEn: 'When is 3D Stair actually worth it?',
        answerRu: 'Когда исходник сильно зависит от полутонов, теней и мягких переходов. В таких случаях дополнительные оттенки через высоты могут заметно улучшить результат.',
        answerEn: 'When the source depends heavily on half-tones, shadows, and softer transitions. In those cases, height-based extra shades can noticeably improve the final art.',
      },
      {
        questionRu: 'Как понять, не слишком ли сложным станет 3D проект?',
        questionEn: 'How do I know if the 3D project becomes too complex?',
        answerRu: 'Смотри 3D preview и список материалов. Если перепады высот и число опор резко растут, возможно, практичнее остаться в 2D или упростить палитру.',
        answerEn: 'Use the 3D preview and materials list. If height variation and support count grow too much, it may be more practical to stay in 2D or simplify the palette.',
      },
    ],
    related: [
      { href: '/how-to-make-minecraft-map-art', labelRu: 'Как сделать map art', labelEn: 'How to make map art' },
      { href: '/best-dithering-for-minecraft-map-art', labelRu: 'Выбор дизеринга', labelEn: 'Choosing dithering' },
      { href: '/minecraft-litematic-map-art-generator', labelRu: 'Экспорт схематики', labelEn: 'Schematic export' },
    ],
  },
];

export function getSeoPageByPath(path: string): SeoPageDefinition | undefined {
  return SEO_PAGES.find(page => page.path === path);
}
