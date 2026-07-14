import { useContext } from 'react';
import { LocaleContext } from './localeContext';

export const useLocale = () => useContext(LocaleContext);
