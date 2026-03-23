import { useState, useRef } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  onChange?: (v: number) => void;  // live (optional, for slider sync)
  onCommit: (v: number) => void;   // on Enter / blur
  disabled?: boolean;
}

function clampToStep(v: number, min: number, max: number, step: number): number {
  const clamped = Math.max(min, Math.min(max, v));
  const precision = Math.max(0, Math.round(-Math.log10(step)));
  return parseFloat((Math.round(clamped / step) * step).toFixed(precision));
}

export function NumInput({ value, min, max, step = 1, decimals = 0, onChange, onCommit, disabled }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const display = editing ? draft : value.toFixed(decimals);

  function applyDraft(raw: string) {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      const v = clampToStep(parsed, min, max, step);
      onChange?.(v);
      onCommit(v);
    }
    setEditing(false);
  }

  return (
    <input
      ref={ref}
      type="number"
      inputMode="numeric"
      className="num-input"
      value={display}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onFocus={() => { setEditing(true); setDraft(value.toFixed(decimals)); setTimeout(() => ref.current?.select(), 0); }}
      onChange={e => setDraft(e.target.value)}
      onBlur={e => applyDraft(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); applyDraft(draft); ref.current?.blur(); }
        if (e.key === 'Escape') { setEditing(false); ref.current?.blur(); }
      }}
    />
  );
}
