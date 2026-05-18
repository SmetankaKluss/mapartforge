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
];

export function getSeoPageByPath(path: string): SeoPageDefinition | undefined {
  return SEO_PAGES.find(page => page.path === path);
}
