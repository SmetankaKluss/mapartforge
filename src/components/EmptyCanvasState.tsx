import { lazy, Suspense, useEffect, useState } from 'react';
import { EMPTY_CANVAS_REDUCED_MOTION_FRAME } from '../lib/emptyCanvasMotion';
import { useLocale } from '../lib/useLocale';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';

const EmptyCanvasMotion = lazy(() => import('./EmptyCanvasMotion').then(module => ({ default: module.EmptyCanvasMotion })));

function StaticMotionFallback() {
  return (
    <div className="empty-canvas-static" aria-hidden="true">
      <span /><span /><span /><span /><span /><span /><span />
    </div>
  );
}

export function EmptyCanvasState() {
  const { t } = useLocale();
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const playing = !reducedMotion && !paused;

  return (
    <div className="canvas-placeholder">
      <div className="empty-canvas-motion-shell" aria-hidden="true">
        <Suspense fallback={<StaticMotionFallback />}>
          <EmptyCanvasMotion
            key={reducedMotion ? 'reduced' : 'animated'}
            playing={playing}
            initialFrame={reducedMotion ? EMPTY_CANVAS_REDUCED_MOTION_FRAME : 0}
          />
        </Suspense>
      </div>
      <div className="empty-canvas-copy">
        <p className="ph-title">{t('Перетащи арт на холст', 'Drop art onto the canvas')}</p>
        <p className="ph-hint">{t('или нажми, чтобы выбрать файл · Ctrl+V', 'or click to choose a file · Ctrl+V')}</p>
        <p className="ph-formats">PNG · JPG · WEBP · GIF · MAP.DAT</p>
      </div>
      {!reducedMotion && (
        <button
          type="button"
          className="empty-canvas-motion-toggle"
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            setPaused(current => !current);
          }}
          onPointerDown={event => event.stopPropagation()}
          aria-pressed={paused}
          aria-label={playing ? t('Остановить анимацию', 'Pause animation') : t('Продолжить анимацию', 'Resume animation')}
          title={playing ? t('Остановить анимацию', 'Pause animation') : t('Продолжить анимацию', 'Resume animation')}
        >
          <IconGlyph icon={playing ? mkIcons.pause : mkIcons.play} />
        </button>
      )}
    </div>
  );
}
