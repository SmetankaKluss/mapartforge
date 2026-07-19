import { VERSION } from '../version';
import type { Lang } from '../lib/localeContext';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';
import { ThemeSelector } from './ThemeSelector';

type PublicSection = 'editor' | 'examples' | 'cloud';

interface PublicSiteHeaderProps {
  active?: PublicSection;
  lang: Lang;
  onToggleLanguage: () => void;
}

export function PublicSiteHeader({ active, lang, onToggleLanguage }: PublicSiteHeaderProps) {
  const isRussian = lang === 'ru';
  const navItems: Array<{
    id: PublicSection;
    href: string;
    label: string;
    shortLabel: string;
    icon: typeof mkIcons.artboard;
  }> = [
    {
      id: 'editor',
      href: '/',
      label: isRussian ? 'Редактор' : 'Editor',
      shortLabel: isRussian ? 'Арт' : 'Art',
      icon: mkIcons.artboard,
    },
    {
      id: 'examples',
      href: '/examples',
      label: isRussian ? 'Примеры' : 'Examples',
      shortLabel: isRussian ? 'Примеры' : 'Examples',
      icon: mkIcons.view,
    },
    {
      id: 'cloud',
      href: '/cloud',
      label: isRussian ? 'Облако и мод' : 'Cloud & mod',
      shortLabel: isRussian ? 'Облако' : 'Cloud',
      icon: mkIcons.cloud,
    },
  ];

  return (
    <header className="public-site-header">
      <div className="public-site-header__inner">
        <a className="public-site-brand" href="/" aria-label={isRussian ? 'Открыть MapKluss' : 'Open MapKluss'}>
          <img src="/logo-opt.png" width="64" height="64" alt="" />
          <span className="public-site-brand__copy">
            <strong>MAPKLUSS</strong>
            <small>MINECRAFT MAP ART WORKSHOP</small>
          </span>
        </a>

        <nav className="public-site-nav" aria-label={isRussian ? 'Основная навигация' : 'Primary navigation'}>
          {navItems.map(item => (
            <a
              key={item.id}
              className={active === item.id ? 'public-site-nav__link is-active' : 'public-site-nav__link'}
              href={item.href}
              aria-current={active === item.id ? 'page' : undefined}
              title={item.label}
            >
              <IconGlyph icon={item.icon} />
              <span className="public-site-nav__label">{item.label}</span>
              <span className="public-site-nav__short-label">{item.shortLabel}</span>
            </a>
          ))}
        </nav>

        <button
          className="public-site-language"
          type="button"
          onClick={onToggleLanguage}
          title={isRussian ? 'Switch to English' : 'Переключить на русский'}
          aria-label={isRussian ? 'Switch to English' : 'Переключить на русский'}
        >
          {isRussian ? 'EN' : 'RU'}
        </button>
        <ThemeSelector lang={lang} />
        <a
          className="public-site-version"
          href="https://t.me/mapkluss"
          target="_blank"
          rel="noopener noreferrer"
          title={isRussian ? 'Новости MapKluss' : 'MapKluss news'}
        >
          {VERSION}
        </a>
      </div>
    </header>
  );
}
