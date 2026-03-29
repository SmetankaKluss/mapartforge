import { createContext, useContext, useState, useCallback } from 'react';

type Lang = 'ru' | 'en';
const STORAGE_KEY = 'mapart_lang';

interface LocaleCtx {
  lang: Lang;
  toggle: () => void;
  t: (ru: string, en: string) => string;
}

const LocaleContext = createContext<LocaleCtx>({
  lang: 'ru',
  toggle: () => {},
  t: (ru) => ru,
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const s = localStorage.getItem(STORAGE_KEY);
    return s === 'en' ? 'en' : 'ru';
  });

  const toggle = useCallback(() => {
    setLang(l => {
      const next: Lang = l === 'ru' ? 'en' : 'ru';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const t = useCallback((ru: string, en: string) => lang === 'ru' ? ru : en, [lang]);

  return (
    <LocaleContext.Provider value={{ lang, toggle, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export const useLocale = () => useContext(LocaleContext);
