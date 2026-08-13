import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocale } from '../lib/useLocale';
import { runAfterPageLoad } from '../lib/deferredWork';
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
  const [paused, setPaused] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const playing = !paused;

  useEffect(() => runAfterPageLoad(() => setMotionReady(true), 1_200), []);

  return (
    <div className="canvas-placeholder">
      <div className="empty-canvas-motion-shell" aria-hidden="true">
        {motionReady ? (
          <Suspense fallback={<StaticMotionFallback />}>
            <EmptyCanvasMotion playing={playing} initialFrame={0} />
          </Suspense>
        ) : <StaticMotionFallback />}
      </div>
      <div className="empty-canvas-copy">
        <p className="ph-title">{t('Перетащи арт на холст', 'Drop art onto the canvas')}</p>
        <p className="ph-hint">{t('или нажми, чтобы выбрать файл · Ctrl+V', 'or click to choose a file · Ctrl+V')}</p>
        <p className="ph-formats">PNG · JPG · WEBP · GIF · MAP.DAT</p>
      </div>
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
    </div>
  );
}
