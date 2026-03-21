import { useEffect, useRef } from 'react';
import { applyAdjustments } from '../lib/adjustments';
import type { ImageAdjustments } from '../lib/adjustments';

const THUMB_SIZE = 80; // px

interface Props {
  adjustments:  ImageAdjustments;
  sourceImage:  HTMLImageElement | null;
  onChange:     (adj: ImageAdjustments) => void;
  onCommit:     (adj: ImageAdjustments) => void;
  disabled:     boolean;
}

const SLIDERS: { key: keyof ImageAdjustments; label: string }[] = [
  { key: 'brightness', label: 'Brightness' },
  { key: 'contrast',   label: 'Contrast'   },
  { key: 'saturation', label: 'Saturation' },
];

export function Adjustments({ adjustments, sourceImage, onChange, onCommit, disabled }: Props) {
  const thumbRef = useRef<HTMLCanvasElement>(null);

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
      new ImageData(adjusted, THUMB_SIZE, THUMB_SIZE),
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

  function reset() {
    const zero = { brightness: 0, contrast: 0, saturation: 0 };
    onChange(zero);
    onCommit(zero);
  }

  const isDefault = adjustments.brightness === 0
    && adjustments.contrast   === 0
    && adjustments.saturation === 0;

  return (
    <section className="control-group">
      <h3 className="control-title">
        Adjustments
        {!isDefault && (
          <button className="adj-reset-btn" onClick={reset} disabled={disabled} title="Reset all to 0">
            Reset
          </button>
        )}
      </h3>

      {/* Thumbnail */}
      {sourceImage && (
        <div className="adj-thumb-row">
          <canvas ref={thumbRef} className="adj-thumb" width={THUMB_SIZE} height={THUMB_SIZE} />
          <span className="adj-thumb-label">Preview</span>
        </div>
      )}

      {/* Sliders */}
      <div className="adj-sliders">
        {SLIDERS.map(({ key, label }) => (
          <div key={key} className="adj-slider-row">
            <div className="adj-slider-header">
              <span className="adj-slider-label">{label}</span>
              <span className={`adj-slider-value ${adjustments[key] !== 0 ? 'nonzero' : ''}`}>
                {adjustments[key] > 0 ? '+' : ''}{adjustments[key]}
              </span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              step={1}
              value={adjustments[key]}
              className="intensity-slider"
              disabled={disabled}
              onChange={e  => set(key, Number(e.target.value))}
              onMouseUp={e  => commit(key, Number((e.target as HTMLInputElement).value))}
              onTouchEnd={e => commit(key, Number((e.target as HTMLInputElement).value))}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
