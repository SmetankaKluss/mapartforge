import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSession, updateGathered, updatePlaced,
  switchToBuilding, subscribeSession,
} from '../lib/buildSession';
import type { BuildSession, SessionMaterial } from '../lib/buildSession';
import '../buildTracker.css';

function fmtStacks(n: number) {
  const stacks = Math.floor(n / 64);
  const rem    = n % 64;
  if (stacks === 0) return `${rem}`;
  if (rem === 0)    return `${stacks}st`;
  return `${stacks}st + ${rem}`;
}

function totalBlocks(materials: SessionMaterial[]) {
  return materials.reduce((s, m) => s + m.count, 0);
}
function totalDone(record: Record<string, number>, materials: SessionMaterial[]) {
  return materials.reduce((s, m) => s + Math.min(record[m.nbtName] ?? 0, m.count), 0);
}

// Draw snake-pattern color reveal on canvas
function drawSnakeReveal(
  canvas: HTMLCanvasElement,
  colorData: ImageData,
  pct: number,
) {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const total    = width * height;
  const revealed = Math.floor(total * Math.min(pct, 100) / 100);
  const src = colorData.data;
  const out = ctx.createImageData(width, height);
  const dst = out.data;

  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / width);
    const col = row % 2 === 0 ? i % width : width - 1 - (i % width);
    const si  = (row * width + col) * 4;

    if (i < revealed) {
      dst[si]   = src[si];
      dst[si+1] = src[si+1];
      dst[si+2] = src[si+2];
      dst[si+3] = src[si+3];
    } else {
      const gray = Math.round(0.299 * src[si] + 0.587 * src[si+1] + 0.114 * src[si+2]);
      dst[si]   = gray;
      dst[si+1] = gray;
      dst[si+2] = gray;
      dst[si+3] = src[si+3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

// ── Material row ────────────────────────────────────────────────────────────
interface RowProps {
  mat: SessionMaterial;
  value: number;
  onChange: (nbtName: string, val: number) => void;
  accentColor: string;
}

function MaterialRow({ mat, value, onChange, accentColor }: RowProps) {
  const [addVal, setAddVal] = useState('');
  const pct  = Math.min(100, (value / mat.count) * 100);
  const done = value >= mat.count;

  function handleAdd() {
    const delta = parseInt(addVal) || 0;
    if (delta <= 0) return;
    const next = Math.min(mat.count, value + delta);
    onChange(mat.nbtName, next);
    setAddVal('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleAdd();
  }

  return (
    <div className={`bt-row${done ? ' bt-row--done' : ''}`}>
      <div className="bt-row-name" title={mat.displayName}>{mat.displayName}</div>
      <div className="bt-row-need">{fmtStacks(mat.count)}</div>
      <div className="bt-row-bar-wrap">
        <div className="bt-row-bar">
          <div className="bt-row-bar-fill" style={{ width: `${pct}%`, background: accentColor }} />
        </div>
        <span className="bt-row-pct">{Math.round(pct)}%</span>
      </div>
      <div className="bt-row-controls">
        <span className="bt-row-total">{value}</span>
        <input
          className="bt-row-add-input"
          type="number"
          min={1}
          placeholder="+?"
          value={addVal}
          onChange={e => setAddVal(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="bt-row-add-btn" onClick={handleAdd} title="Add / Добавить">+</button>
        {done && <span className="bt-row-check">✓</span>}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
interface Props { sessionId: string; }

export function BuildTracker({ sessionId }: Props) {
  const [session,   setSession]   = useState<BuildSession | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [switching, setSwitching] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [gathered, setGathered] = useState<Record<string, number>>({});
  const [placed,   setPlaced]   = useState<Record<string, number>>({});

  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const colorRef    = useRef<ImageData | null>(null);
  const modeRef     = useRef<'gathering' | 'building'>('gathering');
  const pctRef      = useRef(0);

  // Load image into canvas and save color pixels
  function initCanvas(previewSrc: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      colorRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      drawSnakeReveal(canvas, colorRef.current, modeRef.current === 'building' ? pctRef.current : 0);
    };
    img.src = previewSrc;
  }

  useEffect(() => {
    getSession(sessionId)
      .then((s) => {
        setSession(s);
        setGathered(s.gathered);
        setPlaced(s.placed);
        modeRef.current = s.mode;
        setLoading(false);
        setTimeout(() => initCanvas(s.image_preview), 50);
      })
      .catch(() => { setError('Session not found or deleted.'); setLoading(false); });

    const unsub = subscribeSession(sessionId, (s) => {
      setSession(s);
      setGathered(s.gathered);
      setPlaced(s.placed);
      modeRef.current = s.mode;
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Redraw canvas when pct or mode changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const color  = colorRef.current;
    if (!canvas || !color || !session) return;
    const pct = session.mode === 'building' ? pctRef.current : 0;
    drawSnakeReveal(canvas, color, pct);
  });

  const debounceSave = useCallback((g: Record<string, number>, p: Record<string, number>, mode: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (mode === 'gathering') updateGathered(sessionId, g).catch(console.error);
      else updatePlaced(sessionId, p).catch(console.error);
    }, 500);
  }, [sessionId]);

  function handleGatheredChange(nbtName: string, val: number) {
    const next = { ...gathered, [nbtName]: val };
    setGathered(next);
    debounceSave(next, placed, 'gathering');
  }
  function handlePlacedChange(nbtName: string, val: number) {
    const next = { ...placed, [nbtName]: val };
    setPlaced(next);
    debounceSave(gathered, next, 'building');
  }

  async function handleSwitchToBuilding() {
    setSwitching(true);
    try {
      await switchToBuilding(sessionId);
      setSession(s => s ? { ...s, mode: 'building' } : s);
      modeRef.current = 'building';
    } catch { alert('Error switching mode.'); }
    finally { setSwitching(false); setShowConfirm(false); }
  }

  if (loading) return (
    <div className="bt-page bt-page--loading">
      <div className="bt-spinner" />
      <p>Loading tracker…</p>
    </div>
  );
  if (error) return (
    <div className="bt-page bt-page--error">
      <p>⚠ {error}</p>
      <a href="/" className="bt-back-link">← MapKluss</a>
    </div>
  );

  const s       = session!;
  const mode    = s.mode;
  const record  = mode === 'gathering' ? gathered : placed;
  const total   = totalBlocks(s.materials);
  const done    = totalDone(record, s.materials);
  const pctDone = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  pctRef.current = pctDone;

  const accentColor = mode === 'gathering' ? '#57FF6E' : '#FFD700';
  const modeLabel   = mode === 'gathering' ? '⛏ Gathering / Сбор' : '🏗 Building / Строительство';

  const info = s.info ?? {};

  return (
    <div className="bt-page">
      {/* Header */}
      <div className="bt-page-header">
        <a href="/" className="bt-back-link">← MapKluss</a>
        <div className="bt-page-title">
          {info.title ? info.title : '⛏ BUILD TRACKER'}
        </div>
        <div className="bt-page-meta">{s.map_grid.wide}×{s.map_grid.tall} maps • {s.materials.length} block types</div>
      </div>

      {/* Info bar */}
      {(info.server || info.coords || info.description) && (
        <div className="bt-page-info">
          {info.server && (
            <div className="bt-page-info-item">
              <span className="bt-page-info-label">SERVER</span>
              <span className="bt-page-info-value">{info.server}</span>
            </div>
          )}
          {info.coords && (
            <div className="bt-page-info-item">
              <span className="bt-page-info-label">COORDS</span>
              <span className="bt-page-info-value">{info.coords}</span>
            </div>
          )}
          {info.description && (
            <div className="bt-page-info-item">
              <span className="bt-page-info-label">NOTES</span>
              <span className="bt-page-info-value">{info.description}</span>
            </div>
          )}
        </div>
      )}

      <div className="bt-page-body">
        {/* Sidebar */}
        <div className="bt-sidebar">
          <div className="bt-preview-wrap">
            <canvas ref={canvasRef} className="bt-preview-canvas" />
            {mode === 'building' && pctDone > 0 && (
              <div className="bt-preview-pct-badge">{Math.round(pctDone)}%</div>
            )}
          </div>

          <div className="bt-progress-block">
            <div className="bt-progress-label">
              <span>{modeLabel}</span>
              <span className="bt-progress-num" style={{ color: accentColor }}>{Math.round(pctDone)}%</span>
            </div>
            <div className="bt-progress-bar">
              <div className="bt-progress-fill" style={{ width: `${pctDone}%`, background: accentColor }} />
            </div>
            <div className="bt-progress-counts">
              {done.toLocaleString()} / {total.toLocaleString()} blocks
            </div>
          </div>

          {mode === 'gathering' && (
            <button className="bt-switch-btn" onClick={() => setShowConfirm(true)} disabled={switching}>
              🏗 Start building / Начать строительство
            </button>
          )}
          {mode === 'building' && (
            <div className="bt-mode-badge">🏗 Building mode / Режим строительства</div>
          )}
        </div>

        {/* Table */}
        <div className="bt-table-wrap">
          <div className="bt-table-header">
            <span>Block / Блок</span>
            <span>Need / Нужно</span>
            <span>Progress</span>
            <span>{mode === 'gathering' ? 'Gathered / Собрано' : 'Placed / Поставлено'}</span>
          </div>
          <div className="bt-table-body">
            {s.materials.map((mat) => (
              <MaterialRow
                key={mat.nbtName}
                mat={mat}
                value={record[mat.nbtName] ?? 0}
                onChange={mode === 'gathering' ? handleGatheredChange : handlePlacedChange}
                accentColor={accentColor}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="bt-confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="bt-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <p className="bt-confirm-title">Start building?</p>
            <p className="bt-confirm-desc">
              Switch to tracking placed blocks. Gathering data is preserved.
            </p>
            <div className="bt-confirm-btns">
              <button className="bt-btn bt-btn--cancel" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="bt-btn bt-btn--confirm" onClick={handleSwitchToBuilding} disabled={switching}>
                {switching ? 'Switching…' : 'Yes, start'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
