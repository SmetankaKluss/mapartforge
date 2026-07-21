import { useEffect, useRef } from 'react';
import { isTourDone, type TourType } from '../lib/tour';
import type { Lang } from '../lib/localeContext';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';

interface TourSelectorProps {
  lang: Lang;
  hasArtwork: boolean;
  isWelcome?: boolean;
  onSelect: (tourType: TourType) => void;
  onClose: () => void;
}

export function TourSelector({ lang, hasArtwork, isWelcome = false, onSelect, onClose }: TourSelectorProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const t = (ru: string, en: string) => lang === 'ru' ? ru : en;
  const tours: Array<{
    id: TourType;
    icon: typeof mkIcons.play;
    title: string;
    description: string;
    duration: string;
    disabled: boolean;
  }> = [
    {
      id: 'first-art',
      icon: mkIcons.play,
      title: t('Первый арт', 'First art'),
      description: t('Загрузка, размер, режим, обработка, палитра и экспорт.', 'Upload, size, mode, processing, palette, and export.'),
      duration: t('≈ 2 мин', '≈ 2 min'),
      disabled: false,
    },
    {
      id: 'editing',
      icon: mkIcons.brush,
      title: t('Точная правка', 'Precise editing'),
      description: t('Холст, инструменты, параметры, коррекция, палитра и слои.', 'Canvas, tools, settings, adjustments, palette, and layers.'),
      duration: t('≈ 1 мин', '≈ 1 min'),
      disabled: !hasArtwork,
    },
    {
      id: 'building',
      icon: mkIcons.hammer,
      title: t('Экспорт и строительство', 'Export and building'),
      description: t('Версия Minecraft, материалы, файлы, Cloud и Companion.', 'Minecraft version, materials, files, Cloud, and Companion.'),
      duration: t('≈ 1 мин', '≈ 1 min'),
      disabled: !hasArtwork,
    },
  ];

  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="tour-selector-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        className="tour-selector-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-selector-title"
        aria-describedby="tour-selector-description"
      >
        <button ref={closeRef} type="button" className="tour-selector-close" onClick={onClose} aria-label={t('Закрыть', 'Close')}>
          <IconGlyph icon={mkIcons.close} size={15} />
        </button>

        <header className="tour-selector-heading">
          <span className="tour-selector-heading-icon" aria-hidden="true"><IconGlyph icon={mkIcons.guide} /></span>
          <div>
            <span>{isWelcome ? t('Добро пожаловать', 'Welcome') : t('Интерактивный тур', 'Interactive tour')}</span>
            <h2 id="tour-selector-title">{t('Освой MapKluss по задаче', 'Learn MapKluss by task')}</h2>
          </div>
        </header>
        <p className="tour-selector-desc" id="tour-selector-description">{t(
          'Выбери короткий сценарий. Тур откроет нужные панели и покажет только действия, которые ведут к результату.',
          'Choose a short workflow. The tour opens the right panels and shows only the actions that lead to a result.',
        )}</p>

        <div className="tour-selector-btns">
          {tours.map(tour => {
            const done = isTourDone(tour.id);
            return (
              <button
                key={tour.id}
                type="button"
                className={`tour-selector-btn tour-selector-btn--${tour.id}`}
                onClick={() => onSelect(tour.id)}
                disabled={tour.disabled}
                title={tour.disabled ? t('Сначала загрузи или создай арт', 'Load or create an art first') : undefined}
              >
                <span className="tour-selector-btn-icon"><IconGlyph icon={tour.icon} /></span>
                <span className="tour-selector-btn-body">
                  <span className="tour-selector-btn-title">{tour.title}</span>
                  <span className="tour-selector-btn-sub">{tour.disabled ? t('Доступно после загрузки арта', 'Available after loading an art') : tour.description}</span>
                </span>
                <span className={`tour-selector-btn-status${done ? ' is-done' : ''}`}>{done ? t('Пройден', 'Done') : tour.duration}</span>
                <IconGlyph icon={mkIcons.chevronRight} className="tour-selector-btn-arrow" />
              </button>
            );
          })}
        </div>

        <footer className="tour-selector-footer">
          <a href="/wiki"><IconGlyph icon={mkIcons.wiki} /> {t('Открыть полную Wiki', 'Open the full Wiki')}</a>
          <button type="button" onClick={onClose}>{t('Я разберусь сам', 'I’ll explore on my own')}</button>
        </footer>
      </div>
    </div>
  );
}
