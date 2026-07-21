import { useEffect, useRef } from 'react';
import { NumInput } from './NumInput';
import { applyAdjustments } from '../lib/adjustments';
import { useLocale } from '../lib/useLocale';
import type { ImageAdjustments } from '../lib/adjustments';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';

const THUMB_SIZE = 80; // px
const ADJUSTMENT_MIN = -100;
const ADJUSTMENT_MAX = 100;
const ADJUSTMENT_STEP = 1;
const HOLD_DELAY_MS = 320;

interface Props {
  adjustments:  ImageAdjustments;
  sourceImage:  HTMLImageElement | null;
  onChange:     (adj: ImageAdjustments) => void;
  onCommit:     (adj: ImageAdjustments) => void;
  disabled:     boolean;
  showAdjustments: boolean;
  onToggleAdjustments: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function Adjustments({ adjustments, sourceImage, onChange, onCommit, disabled, showAdjustments, onToggleAdjustments, collapsed, onToggle }: Props) {
  const { t } = useLocale();

  const SLIDERS: { key: keyof ImageAdjustments; label: string }[] = [
    { key: 'brightness', label: t('Яркость', 'Brightness')      },
    { key: 'contrast',   label: t('Контраст', 'Contrast')        },
    { key: 'saturation', label: t('Насыщенность', 'Saturation') },
    { key: 'red',        label: t('Красный', 'Red')              },
    { key: 'green',      label: t('Зелёный', 'Green')            },
    { key: 'blue',       label: t('Синий', 'Blue')               },
  ];
  const thumbRef = useRef<HTMLCanvasElement>(null);
  const adjustmentsRef = useRef(adjustments);
  const holdTimerRef = useRef<number | null>(null);
  const holdChangedRef = useRef(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    adjustmentsRef.current = adjustments;
  }, [adjustments]);

  useEffect(() => () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
  }, []);

  // Redraw thumbnail whenever source image or adjustments change
  useEffect(() => {
    const canvas = thumbRef.current;
    if (!canvas || !sourceImage) return;

    const offscreen = new OffscreenCanvas(THUMB_SIZE, THUMB_SIZE);
    const octx = offscreen.getContext('2d')!;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(sourceImage, 0, 0, THUMB_SIZE, THUMB_SIZE);

    const rawData  = octx.getImageData(0, 0, THUMB_SIZE, THUMB_SIZE);
    const adjusted = applyAdjustments(rawData.data, adjustments);

    canvas.width  = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    canvas.getContext('2d')!.putImageData(
      new ImageData(new Uint8ClampedArray(adjusted), THUMB_SIZE, THUMB_SIZE),
      0, 0,
    );
  }, [sourceImage, adjustments]);

  function set(key: keyof ImageAdjustments, value: number) {
    onChange({ ...adjustments, [key]: value });
  }

  function commit(key: keyof ImageAdjustments, value: number) {
    const next = { ...adjustments, [key]: value };
    onCommit(next);
  }

  function applyStep(key: keyof ImageAdjustments, direction: -1 | 1, commitImmediately: boolean) {
    const currentAdjustments = adjustmentsRef.current;
    const current = currentAdjustments[key];
    const next = Math.max(
      ADJUSTMENT_MIN,
      Math.min(ADJUSTMENT_MAX, current + direction * ADJUSTMENT_STEP),
    );
    if (next === current) return false;

    const nextAdjustments = { ...currentAdjustments, [key]: next };
    adjustmentsRef.current = nextAdjustments;
    if (commitImmediately) onCommit(nextAdjustments);
    else onChange(nextAdjustments);
    return true;
  }

  function clearHoldTimer() {
    if (holdTimerRef.current === null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }

  function finishHold() {
    clearHoldTimer();
    const changed = holdChangedRef.current;
    holdChangedRef.current = false;
    if (changed) onCommit(adjustmentsRef.current);
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  }

  function beginHold(key: keyof ImageAdjustments, direction: -1 | 1) {
    clearHoldTimer();
    suppressClickRef.current = true;
    holdChangedRef.current = applyStep(key, direction, false);
    let repeatCount = 0;

    const repeat = () => {
      const changed = applyStep(key, direction, false);
      holdChangedRef.current = holdChangedRef.current || changed;
      if (!changed) {
        finishHold();
        return;
      }

      repeatCount += 1;
      const interval = repeatCount < 4 ? 140 : repeatCount < 12 ? 85 : repeatCount < 26 ? 52 : 34;
      holdTimerRef.current = window.setTimeout(repeat, interval);
    };

    holdTimerRef.current = window.setTimeout(repeat, HOLD_DELAY_MS);
  }

  function clickStep(key: keyof ImageAdjustments, direction: -1 | 1) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    applyStep(key, direction, true);
  }

  function reset() {
    const zero: ImageAdjustments = { brightness: 0, contrast: 0, saturation: 0, red: 0, green: 0, blue: 0 };
    onChange(zero);
    onCommit(zero);
  }

  const isDefault = adjustments.brightness === 0
    && adjustments.contrast   === 0
    && adjustments.saturation === 0
    && (adjustments.red    ?? 0) === 0
    && (adjustments.green  ?? 0) === 0
    && (adjustments.blue   ?? 0) === 0;

  return (
    <section className={`control-group${disabled ? ' adj-disabled' : ''}`}>
      <h2 className="control-title">
        <button type="button" className={`section-arrow${collapsed ? ' collapsed' : ''}`} onClick={onToggle} aria-expanded={!collapsed} aria-label={t('Свернуть или развернуть коррекцию', 'Collapse or expand adjustments')}><IconGlyph icon={mkIcons.chevronDown} /></button>
        <button
          className={`adj-toggle-btn${showAdjustments ? ' active' : ''}`}
          onClick={onToggleAdjustments}
          title={t('Отключить коррекцию', 'Disable adjustments')}
          aria-pressed={showAdjustments}
          aria-label={t('Включить или выключить коррекцию', 'Enable or disable adjustments')}
        ><IconGlyph icon={mkIcons.adjustments} /></button>
        {!isDefault && (
          <button className="adj-reset-btn" onClick={reset} disabled={disabled} title={t('Сбросить всё на 0', 'Reset all to 0')}>
            {t('Сброс', 'Reset')}
          </button>
        )}
        <span style={{ flex: 1, textAlign: 'right' }}>{t('Коррекция', 'Adjustments')}</span>
      </h2>

      <div className={`control-group-content${collapsed ? ' collapsed' : ''}`}>

      {/* Thumbnail */}
      {sourceImage && (
        <div className="adj-thumb-row">
          <canvas ref={thumbRef} className="adj-thumb" width={THUMB_SIZE} height={THUMB_SIZE} />
          <span className="adj-thumb-label">{t('Предпросмотр', 'Preview')}</span>
        </div>
      )}

      {/* Sliders */}
      <div className="adj-sliders" data-tour="adjustments">
        {SLIDERS.map(({ key, label }) => (
          <div key={key} className="adj-slider-row">
            <div className="adj-slider-header">
              <span className="adj-slider-label">{label}</span>
              <div className="adj-stepper" role="group" aria-label={label}>
                <button
                  type="button"
                  className="adj-step-btn"
                  onPointerDown={e => {
                    if (e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    beginHold(key, -1);
                  }}
                  onPointerUp={finishHold}
                  onPointerCancel={finishHold}
                  onBlur={finishHold}
                  onClick={() => clickStep(key, -1)}
                  disabled={disabled || adjustments[key] <= ADJUSTMENT_MIN}
                  aria-label={t(`Уменьшить ${label.toLowerCase()} на 1. Удерживайте для ускорения`, `Decrease ${label.toLowerCase()} by 1. Hold to accelerate`)}
                  title={t('Уменьшить на 1 · удерживай для ускорения', 'Decrease by 1 · hold to accelerate')}
                >
                  <IconGlyph icon={mkIcons.minus} />
                </button>
                <NumInput
                  value={adjustments[key]}
                  min={ADJUSTMENT_MIN}
                  max={ADJUSTMENT_MAX}
                  step={ADJUSTMENT_STEP}
                  onCommit={v => commit(key, v)}
                  disabled={disabled}
                  ariaLabel={label}
                />
                <button
                  type="button"
                  className="adj-step-btn"
                  onPointerDown={e => {
                    if (e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    beginHold(key, 1);
                  }}
                  onPointerUp={finishHold}
                  onPointerCancel={finishHold}
                  onBlur={finishHold}
                  onClick={() => clickStep(key, 1)}
                  disabled={disabled || adjustments[key] >= ADJUSTMENT_MAX}
                  aria-label={t(`Увеличить ${label.toLowerCase()} на 1. Удерживайте для ускорения`, `Increase ${label.toLowerCase()} by 1. Hold to accelerate`)}
                  title={t('Увеличить на 1 · удерживай для ускорения', 'Increase by 1 · hold to accelerate')}
                >
                  <IconGlyph icon={mkIcons.plus} />
                </button>
              </div>
            </div>
            <input
              type="range"
              min={ADJUSTMENT_MIN}
              max={ADJUSTMENT_MAX}
              step={ADJUSTMENT_STEP}
              value={adjustments[key]}
              className="intensity-slider"
              aria-label={label}
              disabled={disabled}
              onChange={e  => set(key, Number(e.target.value))}
              onMouseUp={e  => commit(key, Number((e.target as HTMLInputElement).value))}
              onTouchEnd={e => commit(key, Number((e.target as HTMLInputElement).value))}
            />
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}
