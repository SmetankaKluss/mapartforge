import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Lang } from '../lib/localeContext';
import { applyTheme, getAppliedTheme, isThemeId, THEME_OPTIONS, type ThemeId } from '../lib/theme';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';

interface ThemeSelectorProps {
  lang: Lang;
}

export function ThemeSelector({ lang }: ThemeSelectorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => getAppliedTheme());
  const menuId = useId();
  const initialFocusRef = useRef<'selected' | 'first' | 'last'>('selected');
  const isRussian = lang === 'ru';
  const current = THEME_OPTIONS.find(option => option.id === theme) ?? THEME_OPTIONS[0];

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<ThemeId>).detail;
      if (next) setTheme(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'mapkluss_ui_theme') return;
      const next = isThemeId(event.newValue) ? event.newValue : 'classic';
      applyTheme(next, document.documentElement, null);
      setTheme(next);
    };
    globalThis.addEventListener('mapkluss-theme-change', onThemeChange);
    globalThis.addEventListener('storage', onStorage);
    return () => {
      globalThis.removeEventListener('mapkluss-theme-change', onThemeChange);
      globalThis.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const focusFrame = requestAnimationFrame(() => {
      const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
      const target = initialFocusRef.current === 'first'
        ? options[0]
        : initialFocusRef.current === 'last'
          ? options.at(-1)
          : options.find(option => option.getAttribute('aria-checked') === 'true');
      target?.focus();
      initialFocusRef.current = 'selected';
    });

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (event.key === 'Tab') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const chooseTheme = (next: ThemeId) => {
    applyTheme(next);
    setTheme(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const openFromKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    initialFocusRef.current = event.key === 'ArrowUp' ? 'last' : 'first';
    setOpen(true);
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    if (options.length === 0) return;

    event.preventDefault();
    const currentIndex = Math.max(0, options.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : event.key === 'ArrowUp'
          ? (currentIndex - 1 + options.length) % options.length
          : (currentIndex + 1) % options.length;
    options[nextIndex]?.focus();
  };

  return (
    <div className="theme-selector" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="theme-selector__trigger"
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={isRussian ? `Тема: ${current.labelRu}` : `Theme: ${current.label}`}
        title={isRussian ? `Тема: ${current.labelRu}` : `Theme: ${current.label}`}
        onClick={() => setOpen(value => !value)}
        onKeyDown={openFromKeyboard}
      >
        <IconGlyph icon={mkIcons.paletteEditor} />
      </button>

      <div
        ref={menuRef}
        id={menuId}
        className="theme-selector__menu"
        role="menu"
        aria-label={isRussian ? 'Цветовая тема интерфейса' : 'Interface color theme'}
        hidden={!open}
        onKeyDown={handleMenuKeyDown}
      >
        {THEME_OPTIONS.map(option => {
          const selected = option.id === theme;
          return (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              className="theme-selector__option"
              onClick={() => chooseTheme(option.id)}
            >
              <span className="theme-selector__preview" data-preview-theme={option.id} aria-hidden="true" />
              <span className="theme-selector__option-copy">
                <strong>{isRussian ? option.labelRu : option.label}</strong>
                <small>{isRussian ? option.descriptionRu : option.description}</small>
              </span>
              <span className="theme-selector__option-check" aria-hidden="true">
                {selected ? <IconGlyph icon={mkIcons.check} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
