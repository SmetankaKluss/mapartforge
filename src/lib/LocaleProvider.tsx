import { useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { LocaleContext, LOCALE_STORAGE_KEY } from './localeContext';
import type { Lang } from './localeContext';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const savedLang = localStorage.getItem(LOCALE_STORAGE_KEY);
      return savedLang === 'en' ? 'en' : 'ru';
    } catch {
      return 'ru';
    }
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const toggle = useCallback(() => {
    setLang(currentLang => {
      const nextLang: Lang = currentLang === 'ru' ? 'en' : 'ru';
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, nextLang);
      } catch {
        // Language switching still works when storage is unavailable.
      }
      return nextLang;
    });
  }, []);

  const t = useCallback((ru: string, en: string) => lang === 'ru' ? ru : en, [lang]);

  return (
    <LocaleContext.Provider value={{ lang, toggle, t }}>
      {children}
    </LocaleContext.Provider>
  );
}
