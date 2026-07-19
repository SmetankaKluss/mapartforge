import { useEffect, useRef } from 'react';
import { trackEvent } from '../lib/analytics';
import { TWO_LAYER_GUIDE_URL } from '../lib/twoLayerGuide';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
  t: (ru: string, en: string) => string;
}

export function TwoLayerGuideModal({ onCancel, onConfirm, t }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [onCancel]);

  return (
    <div className="two-layer-guide-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section
        className="two-layer-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="two-layer-guide-title"
        aria-describedby="two-layer-guide-description"
      >
        <button
          type="button"
          className="two-layer-guide-close"
          onClick={onCancel}
          aria-label={t('Закрыть', 'Close')}
        >
          <IconGlyph icon={mkIcons.close} />
        </button>
        <div className="two-layer-guide-heading">
          <IconGlyph icon={mkIcons.hammer} size={20} />
          <div>
            <span>{t('Новый способ строительства', 'New build method')}</span>
            <h2 id="two-layer-guide-title">Two-layer</h2>
          </div>
        </div>
        <p id="two-layer-guide-description">
          {t(
            'Two-layer записывает карту по этапам. Для правильного результата нужно точно следовать точкам и подсветке Companion.',
            'Two-layer records the map in stages. Follow Companion points and highlights exactly to get the correct result.',
          )}
        </p>
        <div className="two-layer-guide-actions">
          <a
            className="two-layer-guide-link"
            href={TWO_LAYER_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent('two_layer_guide_opened', { location: 'mode_warning' })}
          >
            <IconGlyph icon={mkIcons.guide} />
            {t('Открыть гайд', 'Open guide')}
          </a>
          <button
            ref={confirmRef}
            type="button"
            className="two-layer-guide-confirm"
            onClick={onConfirm}
          >
            <IconGlyph icon={mkIcons.check} />
            {t('Я ознакомлен', 'I understand')}
          </button>
        </div>
      </section>
    </div>
  );
}
