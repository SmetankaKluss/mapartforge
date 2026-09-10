export const companionGuideSections = [
  [
    "install",
    "Установка",
    "Installation",
    [
      [
        "Скачай Companion для своей версии Minecraft на странице «Облако и мод». Поддерживаются Fabric 1.21.4, 1.21.8, 1.21.11 и 26.2. JAR от другой версии не подходит.",
        "Download Companion for your Minecraft version from Cloud and mod. Supported Fabric targets are 1.21.4, 1.21.8, 1.21.11 and 26.2. Do not use a JAR built for another version."
      ],
      [
        "Установи Fabric Loader и Fabric API. Для 1.21.x нужна Java 21, для 26.2 — Java 25. Положи JAR в папку mods нужного экземпляра игры и перезапусти Minecraft. Не оставляй две версии Companion одновременно.",
        "Install Fabric Loader and Fabric API. Use Java 21 for 1.21.x and Java 25 for 26.2. Put the JAR in that instance’s mods folder and restart Minecraft. Keep only one active Companion JAR."
      ],
      [
        "Для размещения схем установи совместимые Litematica и MaLiLib. Для библиотеки, Lens и входа они не нужны. Серверу Companion не требуется; правила сервера всё равно действуют.",
        "Install matching Litematica and MaLiLib versions for schematic placement. They are not required for the library, Lens or sign-in. The server does not need Companion; its rules still apply."
      ]
    ]
  ],
  [
    "login",
    "Первый вход",
    "First sign-in",
    [
      [
        "Нажми K. Если меню не открывается, проверь назначение клавиши MapKluss в настройках управления Minecraft и конфликты с другими модами.",
        "Press K. If nothing opens, check the MapKluss binding in Minecraft controls and look for conflicts with other mods."
      ],
      [
        "Открой «Аккаунт» → «Получить код». Перейди по предложенной ссылке, войди в свой аккаунт MapKluss и подтверди код устройства. Вернись в игру и нажми «Проверить», если вход ещё не завершился автоматически.",
        "Open Account → Get code. Follow the link, sign in to your MapKluss account and approve the device code. Return to the game and press Check if sign-in has not completed automatically."
      ],
      [
        "На сайте и в моде используй один аккаунт. Пароль и ссылку из письма не нужно вставлять в Minecraft. Не отправляй код входа другим людям.",
        "Use the same account on the website and in the mod. Do not paste your password or email sign-in link into Minecraft. Do not share the login code."
      ]
    ]
  ],
  [
    "library",
    "Библиотека и Cloud",
    "Library and Cloud",
    [
      [
        "Сохрани работу в Cloud из редактора. Затем открой библиотеку мода и обнови список. Скачивание PNG или схемы на компьютер само по себе не добавляет работу в твою Cloud-библиотеку.",
        "Save your work to Cloud in the editor, then refresh the mod library. Downloading a PNG or schematic to your computer does not add it to your Cloud library."
      ],
      [
        "Выбери арт в списке: справа появятся превью и действия. Поиск, избранное, недавние работы и коллекции помогают найти нужный арт. Дополнительные операции находятся в «Ещё» и на странице арта.",
        "Select an art to see its preview and actions. Search, favorites, recent arts and collections help you find it. More actions are available under More and on the art page."
      ],
      [
        "После изменения Cloud-версии обнови библиотеку и схему. Уже размещённая схема и текущая стройка не становятся новой версией автоматически. Перед заменой проверь, с какой версией ты работаешь.",
        "After updating a Cloud art, refresh the library and schematic. An existing placement or build does not automatically switch to the new version. Check which version you are using before replacing it."
      ]
    ]
  ],
  [
    "placement",
    "Схема и размещение",
    "Schematics and placement",
    [
      [
        "«Схема» скачивает файл для Litematica. «Вставить» размещает её призрачное изображение в мире. Блоки ты ставишь сам. Для проверки стройки отдельно закрепи арт в трекере.",
        "Schematic downloads the Litematica file. Place positions its ghost in the world. You place the blocks yourself. Anchor the art separately in Tracker to check construction."
      ],
      [
        "У большого арта выбери нужную часть в библиотеке перед размещением. Для следующей карты выбери другую часть. Two-layer размещается через ту же кнопку, но использует свой набор схем.",
        "For a multi-map art, select the required part in the library before placing it. Select another part for the next map. Two-layer uses the same Place button with its own schematic set."
      ],
      [
        "Если схемы нет, сначала дождись её загрузки. Если «Вставить» не работает, проверь Litematica и MaLiLib. Ручное перемещение схемы не переносит уже закреплённую точку трекера.",
        "If the schematic is missing, wait for its download. If Place fails, check Litematica and MaLiLib. Moving a schematic manually does not move an existing Tracker anchor."
      ]
    ]
  ],
  [
    "gather",
    "Сбор ресурсов",
    "Gathering materials",
    [
      [
        "Выбери арт → «Трекер» → «Сбор». Отмечай собранное кнопками добавления и убавления, выбирай удобный шаг. Ошибочную отметку можно отменить.",
        "Select an art → Tracker → Gathering. Record collected materials with the add and subtract controls and choose a useful step size. Undo an incorrect entry."
      ],
      [
        "Превью окрашивается по собранным материалам: собрал весь материал — его участки становятся цветными; собрал часть — окрашивается часть. У старых превью одинаковые оттенки могут объединяться, поэтому смотри и на числа в списке.",
        "The preview gains color as you collect each material: completing one reveals its areas; collecting part reveals a portion. Older previews may pool identical shades, so also check the numeric material list."
      ],
      [
        "Сбор — это учёт отмеченных ресурсов, а не подтверждение поставленных блоков. Для проверки мира переключись в «Стройку».",
        "Gathering records collected resources. It does not confirm placed blocks. Switch to Building to check the world."
      ]
    ]
  ],
  [
    "build",
    "Проверка стройки",
    "Tracking construction",
    [
      [
        "Открой «Стройку» и загрузи арт, если он ещё не выбран. Для большого арта выбери одну карту. Нажми «Закрепить»: координаты обозначают угол изображения выбранной карты, а не служебный ряд схемы. Кнопка «Здесь» берёт твою текущую позицию. Поворот и отражение должны совпадать с размещением.",
        "Open Building and load the art if needed. Select one map for a multi-map art. Press Anchor: the coordinates refer to that map’s artwork corner, not the schematic’s reference row. Here uses your current position. Rotation and mirroring must match the placement."
      ],
      [
        "Трекер сравнивает схему с блоками, которые загружены у твоего клиента. Подойди к постройке и дай участкам загрузиться. Превью и счётчики поставленных материалов обновляются по результатам сканирования; вручную заполнять их не нужно.",
        "Tracker compares the schematic with blocks loaded by your client. Approach the build and allow its chunks to load. The preview and placed-material counters update from scanning; you do not need to fill them manually."
      ],
      [
        "Виден весь арт, но проверяются только закреплённые части. «Карта» показывает готовность выбранной части, «Всего» — всего арта. Одна готовая карта из четырёх не означает 100% общего прогресса. Красный цвет означает несовпадение: сначала проверь часть, координаты, поворот и файл схемы, а уже потом переделывай блоки.",
        "The whole art stays visible, but only anchored parts are checked. Map shows the selected part’s completion; Total covers the whole art. Completing one map out of four does not mean 100% overall. Red means a mismatch: check the part, coordinates, rotation and schematic file before rebuilding blocks."
      ],
      [
        "Если переносишь постройку, открепи старое размещение и закрепи новое. «Остановить» завершает отслеживание, но не удаляет блоки из мира.",
        "If you move the build, unanchor the old placement and anchor the new one. Stop ends tracking; it does not remove world blocks."
      ]
    ]
  ],
  [
    "friends",
    "Друзья и сайт",
    "Friends and the website",
    [
      [
        "В стройке открой «Друзья». Создай общую сессию и передай приглашение участнику. Другу нужны Companion, вход в аккаунт и согласие на участие. Код стройки и код Lens — разные приглашения.",
        "Open Friends in Building. Create a shared session and give a participant the invitation. They need Companion, an account and must agree to join. Build and Lens codes are different invitations."
      ],
      [
        "Участники должны работать с той же схемой и правильным размещением. Видимый результат зависит от загруженных участков и отправленных наблюдений; вход друга в группу сам по себе не подтверждает всю постройку.",
        "Participants must use the same schematic and correct placement. Progress depends on loaded areas and submitted observations; joining a group does not verify the entire build."
      ],
      [
        "На странице трекера сайта открой «Стройку» в аккаунте с доступом к сессии. Сейчас передача живого превью на сайт требует подключённого мода владельца. Без него нельзя рассчитывать на новые данные от друзей на сайте.",
        "On the website tracker page, open Building with an account that has access. The current website preview relay requires the owner’s connected mod. Without it, do not expect new observations from friends to reach the website."
      ]
    ]
  ],
  [
    "lens",
    "Lens",
    "Lens",
    [
      [
        "Lens — превью поверх рамок, а не настоящие карты и не схема строительства. Выбери свой арт в библиотеке и нажми Lens под превью. Верхняя вкладка Lens только открывает список сессий.",
        "Lens is a preview over item frames, not real maps or a construction schematic. Select your own art in the library and press Lens below its preview. The top Lens tab only opens the session list."
      ],
      [
        "Когда сессия появится, закрой меню, наведи прицел на нижнюю левую рамку будущего арта, снова открой Lens и нажми «Закрепить по рамке». Для пола точка начала — ближний левый угол. Личное размещение видно тебе; групповое требует доступа по коду.",
        "Once the session appears, close the menu, aim at the future art’s bottom-left frame, reopen Lens and press Place on frame. For a floor, start at the near-left corner. Personal placements are visible to you; group placements require code access."
      ],
      [
        "Нажми «Редактор» у своей сессии Lens и войди на сайте в тот же аккаунт. После загрузки проекта редактор подключится к этой сессии. Меняй изображение, палитру или размер: результат обновляется без нового экспорта. Не запускай вместо неё вторую сессию. При увеличении арта проверь, что рамок хватает.",
        "Press Editor on your Lens session and use the same account on the website. Once the project loads, the editor joins that session. Edit the image, palette or size to update it without another export. Do not replace it with a second session. If you enlarge the art, check that there are enough frames."
      ]
    ]
  ],
  [
    "two-layer",
    "Two-layer",
    "Two-layer",
    [
      [
        "Сохрани арт в режиме Two-layer и обнови библиотеку. Для размещения используй «Вставить», для пошаговой работы — Two-layer. Не подменяй этот набор обычной 3D-схемой того же изображения.",
        "Save the art in Two-layer mode and refresh the library. Use Place for placement and Two-layer for the guided workflow. Do not substitute an ordinary 3D schematic of the same image."
      ],
      [
        "Для локального набора используй «Импорт Two-layer». Выбери часть, закрепи рабочее положение и следуй текущему этапу. Карты нужно обновлять в нужные моменты, а блоки убирать вручную. Клавиша J выполняет действие текущего этапа в мире; это не автоматическое строительство.",
        "For a local bundle, use Import Two-layer. Select a part, anchor the work area and follow the current phase. Update maps at the appropriate stages and remove blocks manually. J performs the current phase action in the world; it is not automatic building."
      ],
      [
        "Если прервался, продолжи существующую сессию, а не начинай последовательность заново на уже изменённой постройке. Подробная механика описана в отдельной статье Two-layer.",
        "If interrupted, resume the existing session rather than restarting the sequence on an already modified build. The separate Two-layer article explains the mechanics."
      ]
    ]
  ],
  [
    "scan",
    "Scan и AutoFrame",
    "Scan and AutoFrame",
    [
      [
        "В разделе «Скан» выбери источник: «Из руки», «Рамка», «Стена» или «По углам». Для руки возьми заполненную карту, для рамки наведи прицел на неё. Карты должны быть загружены клиентом.",
        "In Scan, select From hand, Frame, Wall or By corners. Hold a filled map for hand scanning, or aim at a frame. The map data must be loaded by your client."
      ],
      [
        "Проверь результат, затем сохрани PNG или отправь его кнопкой «В облако». История позволяет вернуться к сканам. Скан готовой карты не восстанавливает исходный редактируемый проект со слоями.",
        "Check the result, then save a PNG or use To cloud. History lets you revisit scans. Scanning a finished map does not recover the original layered editor project."
      ],
      [
        "Для AutoFrame возьми карту арта в основную руку, наведи прицел на нижнюю левую рамку стены и нажми O. Затем нажимай по рамкам правой кнопкой: мод помогает выбрать нужные распознанные части. На полу начни с ближнего левого угла. Приседание временно обходит AutoFrame.",
        "For AutoFrame, hold an art map in your main hand, aim at the wall’s bottom-left frame and press O. Then right-click frames: the mod helps select the correct recognized tiles. On a floor, start at the near-left corner. Sneaking temporarily bypasses AutoFrame."
      ]
    ]
  ],
  [
    "settings",
    "Настройки",
    "Settings",
    [
      [
        "В «Аккаунте» меняются язык RU/EN и тёмная тема. Настройки сохраняются между запусками. Назначения клавиш меняются в настройках управления Minecraft.",
        "Account contains RU/EN language and dark-theme choices. Settings persist between launches. Change key bindings in Minecraft controls."
      ],
      [
        "Перед обновлением закрой игру и замени старый JAR совместимым новым. Выход из аккаунта не удаляет скачанные схемы и построенные блоки. Анонимная статистика включается только с согласия и отключается в аккаунте.",
        "Close the game before replacing the old JAR with a compatible update. Signing out does not delete downloaded schematics or world blocks. Anonymous statistics require consent and can be disabled in Account."
      ]
    ]
  ],
  [
    "problems",
    "Если что-то не работает",
    "Troubleshooting",
    [
      [
        "Пустая библиотека: проверь аккаунт, сохранение именно в Cloud и обнови список. Нет превью: проверь соединение и повтори загрузку. Не нужно пересоздавать арт при каждом сетевом сбое.",
        "Empty library: check your account, confirm the art was saved to Cloud and refresh. Missing preview: check the connection and retry. You do not need to recreate the art after every network failure."
      ],
      [
        "Много ошибок на готовом арте: проверь 2D/3D/Two-layer, выбранную часть, версию файла и координаты закрепления. Схема с другим основанием или опорами действительно может не совпадать с миром.",
        "Many errors on a finished art: check 2D/3D/Two-layer, the selected part, file version and anchor coordinates. A schematic with a different base or supports may genuinely differ from the world."
      ],
      [
        "Прогресс не меняется: подойди к закреплённой части и проверь, что стройка не остановлена. На сайте дополнительно проверь аккаунт и соединение мода владельца. Счётчики сбора ресурсов не заменяют сканирование стройки.",
        "Progress not changing: approach the anchored part and check that tracking is not stopped. On the website, also check the account and owner mod connection. Gathering counters do not replace construction scanning."
      ],
      [
        "При сообщении об ошибке укажи версию Minecraft и Companion, последнее действие и приложи скрин. Не отправляй токены, ссылки входа или файлы аккаунта.",
        "When reporting an error, include Minecraft and Companion versions, the last action and a screenshot. Never send tokens, sign-in links or account files."
      ]
    ]
  ]
] as const;

export const companionGuideImages: Record<string, readonly (readonly [string, string, string])[]> = {
  library: [
    ['library', 'Выбери арт слева. Под превью находятся схема, размещение, Lens и трекер; рамка на изображении отмечает выбранную карту.', 'Select an art on the left. Schematic, placement, Lens and Tracker actions sit below the preview; the outline marks the selected map.'],
    ['collections', 'Чтобы создать коллекцию, введи название в верхнем поле и нажми «Создать». На этом снимке коллекций ещё нет.', 'To create a collection, enter its name in the top field and press Create. This screenshot shows an empty collection list.'],
  ],
  placement: [
    ['art-files', 'На странице арта можно скачать схему целиком или по картам и открыть папку схем.', 'The art page lets you download the whole schematic or individual maps and open the schematic folder.'],
  ],
  gather: [
    ['gathering', 'Превью сбора: цвет вернулся в участки, для которых уже отмечены материалы. Это ещё не прогресс поставленных блоков.', 'Gathering preview: color returns to areas with recorded materials. This is not placed-block progress.'],
  ],
  friends: [
    ['friends', 'Создай группу или введи код приглашения и нажми «Войти по коду». Остальные действия станут доступны после подключения.', 'Create a group, or enter an invitation code and press Join by code. The remaining actions become available after joining.'],
  ],
  lens: [
    ['lens-session', 'Активная сессия Lens. «Закрепить по рамке» задаёт размещение, «Редактор» открывает эту сессию на сайте.', 'An active Lens session. Place on frame sets its position; Editor opens this session on the website.'],
    ['lens-world', 'Так выглядит размещённое превью Lens в мире. Оно не заменяет настоящие карты.', 'A placed Lens preview in the world. It does not replace real maps.'],
  ],
  'two-layer': [
    ['two-layer', 'Выбор карты Two-layer: выдели часть слева и нажми «Начать». На превью остаётся весь арт.', 'Two-layer map selection: select a part on the left and press Start. The preview keeps the whole art visible.'],
  ],
  scan: [
    ['scan', 'Результат сканирования карты из руки. Его можно сохранить кнопкой PNG или отправить в Cloud.', 'A hand-scan result. Save it with PNG or send it to Cloud.'],
  ],
  settings: [
    ['account', 'В «Аккаунте» находятся оформление, RU/EN, синхронизация, проверка обновлений и выбор анонимной статистики.', 'Account contains appearance, RU/EN, sync, update checking and the anonymous statistics preference.'],
  ],
};

export function CompanionGuide({ t }: { t: (ru: string, en: string) => string }) {
  const dimensions: Record<string, readonly [number, number]> = {
    account: [1919, 1054], 'lens-world': [1918, 1057], scan: [1918, 1057], 'two-layer': [1917, 1056],
  };
  return <>{companionGuideSections.map(([id, ru, en, paragraphs]) =>
    <section key={id} id={id}>
      <h2>{t(ru, en)}</h2>
      {paragraphs.map(([ruText, enText], i) => <p key={i}>{t(ruText, enText)}</p>)}
      {id === 'placement' && <p>{t(
        'При вставке обычной 2D/3D-схемы через мод встань на северо-западный угол полотна: изображение начнётся в этой точке, а северный теневой ряд окажется на блок за полотном. Уже вставленные схемы не сдвигаются сами.',
        'When placing a standard 2D/3D schematic through the mod, stand at the canvas’s northwest corner. The artwork starts there; its northern reference row sits one block outside the canvas. Existing placements do not move automatically.'
      )}</p>}
      {(companionGuideImages[id] ?? []).map(([name, captionRu, captionEn]) =>
        <figure className="companion-guide-figure" key={name}>
          <a href={`/images/companion-guide/${name}.png`} target="_blank" rel="noopener noreferrer" title={t('Открыть скриншот полностью', 'Open full-size screenshot')}>
            <img src={`/images/companion-guide/${name}.png`} alt={t(captionRu, captionEn)}
              width={(dimensions[name] ?? [1920, 1080])[0]} height={(dimensions[name] ?? [1920, 1080])[1]}
              loading="lazy" decoding="async" />
          </a>
          <figcaption>{t(captionRu, captionEn)}</figcaption>
        </figure>
      )}
    </section>
  )}</>;
}
