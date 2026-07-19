export const THEME_STORAGE_KEY = 'mapkluss_ui_theme';

export const THEME_IDS = [
  'classic',
  'deep-ocean',
  'ember-forge',
  'amethyst',
  'acid-grove',
  'cobalt-pulse',
  'signal-white',
  'cobalt-print',
  'solar-punch',
  'rose-oxide',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeOption {
  id: ThemeId;
  label: string;
  labelRu: string;
  description: string;
  descriptionRu: string;
  themeColor: string;
  colorScheme: 'dark' | 'light';
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: 'classic',
    label: 'MapKluss Classic',
    labelRu: 'MapKluss Classic',
    description: 'Warm workshop black and signal green',
    descriptionRu: 'Тёплый графит и сигнальный зелёный',
    themeColor: '#111116',
    colorScheme: 'dark',
  },
  {
    id: 'deep-ocean',
    label: 'Deep Ocean',
    labelRu: 'Deep Ocean',
    description: 'Deep navy surfaces and crisp cyan',
    descriptionRu: 'Глубокий синий фон и яркий циан',
    themeColor: '#07141b',
    colorScheme: 'dark',
  },
  {
    id: 'ember-forge',
    label: 'Ember Forge',
    labelRu: 'Ember Forge',
    description: 'Graphite surfaces and hot ember orange',
    descriptionRu: 'Графитовый фон и жаркий оранжевый',
    themeColor: '#15100f',
    colorScheme: 'dark',
  },
  {
    id: 'amethyst',
    label: 'Amethyst',
    labelRu: 'Amethyst',
    description: 'Cold violet-black and clear amethyst',
    descriptionRu: 'Холодный тёмный фон и аметистовый акцент',
    themeColor: '#100e18',
    colorScheme: 'dark',
  },
  {
    id: 'acid-grove',
    label: 'Acid Grove',
    labelRu: 'Acid Grove',
    description: 'Ink-green hardware and sharp acid light',
    descriptionRu: 'Чернильная зелень и резкий кислотный свет',
    themeColor: '#07100a',
    colorScheme: 'dark',
  },
  {
    id: 'cobalt-pulse',
    label: 'Cobalt Pulse',
    labelRu: 'Cobalt Pulse',
    description: 'Midnight cobalt and electric periwinkle',
    descriptionRu: 'Полуночный кобальт и электрический барвинок',
    themeColor: '#080b1a',
    colorScheme: 'dark',
  },
  {
    id: 'signal-white',
    label: 'Signal White',
    labelRu: 'Signal White',
    description: 'Industrial light shell with a grounded workspace',
    descriptionRu: 'Светлая индустриальная оболочка и тёмный workspace',
    themeColor: '#dfe3e1',
    colorScheme: 'light',
  },
  {
    id: 'cobalt-print',
    label: 'Cobalt Print',
    labelRu: 'Cobalt Print',
    description: 'Committed blueprint blue with orange signals',
    descriptionRu: 'Насыщенный чертёжный синий и оранжевые сигналы',
    themeColor: '#cbd7f0',
    colorScheme: 'light',
  },
  {
    id: 'solar-punch',
    label: 'Solar Punch',
    labelRu: 'Solar Punch',
    description: 'Saturated yellow hardware and violet controls',
    descriptionRu: 'Насыщенный жёлтый корпус и фиолетовые контролы',
    themeColor: '#e7d84c',
    colorScheme: 'light',
  },
  {
    id: 'rose-oxide',
    label: 'Rose Oxide',
    labelRu: 'Rose Oxide',
    description: 'Oxidized rose metal and deep berry ink',
    descriptionRu: 'Окисленный розовый металл и ягодные чернила',
    themeColor: '#d9a5b5',
    colorScheme: 'light',
  },
] as const;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.includes(value as ThemeId);
}

export function resolveTheme(attributeValue: unknown, storedValue: unknown): ThemeId {
  if (isThemeId(attributeValue)) return attributeValue;
  if (isThemeId(storedValue)) return storedValue;
  return 'classic';
}

function getBrowserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readStoredTheme(storage?: Pick<Storage, 'getItem'> | null): ThemeId {
  const target = storage === undefined ? getBrowserStorage() : storage;
  try {
    return resolveTheme(undefined, target?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'classic';
  }
}

export function getAppliedTheme(root: HTMLElement = document.documentElement): ThemeId {
  const storage = getBrowserStorage();
  try {
    return resolveTheme(root.dataset.theme, storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return resolveTheme(root.dataset.theme, null);
  }
}

export function applyTheme(
  theme: ThemeId,
  root: HTMLElement = document.documentElement,
  storage?: Pick<Storage, 'setItem'> | null,
): void {
  root.dataset.theme = theme;
  const option = THEME_OPTIONS.find(candidate => candidate.id === theme);
  root.style.colorScheme = option?.colorScheme ?? 'dark';

  const target = storage === undefined ? getBrowserStorage() : storage;
  try {
    target?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this tab when storage is unavailable.
  }

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta && option) meta.content = option.themeColor;

  globalThis.dispatchEvent?.(new CustomEvent<ThemeId>('mapkluss-theme-change', { detail: theme }));
}
