import { createContext } from 'react';

export type Lang = 'ru' | 'en';

export interface LocaleCtx {
  lang: Lang;
  toggle: () => void;
  t: (ru: string, en: string) => string;
}

export const LOCALE_STORAGE_KEY = 'mapart_lang';

export const LocaleContext = createContext<LocaleCtx>({
  lang: 'ru',
  toggle: () => {},
  t: (ru) => ru,
});
