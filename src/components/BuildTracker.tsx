import { useState, useEffect, useCallback, useRef } from 'react';
import '../buildTracker.css';
import {
  getSession, updateGathered, updatePlaced,
  switchToBuilding, subscribeSession,
} from '../lib/buildSession';
import type { BuildSession, SessionMaterial } from '../lib/buildSession';

function fmtStacks(n: number) {
  const stacks = Math.floor(n / 64);
  const rem    = n % 64;
  if (stacks === 0) return `${rem}`;
  if (rem === 0)    return `${stacks}ст`;
  return `${stacks}ст + ${rem}`;
}

function totalBlocks(materials: SessionMaterial[]) {
  return materials.reduce((s, m) => s + m.count, 0);
}

function totalPlaced(placed: Record<string, number>, materials: SessionMaterial[]) {
  return materials.reduce((s, m) => s + Math.min(placed[m.nbtName] ?? 0, m.count), 0);
}

function totalGathered(gathered: Record<string, number>, materials: SessionMaterial[]) {
  return materials.reduce((s, m) => s + Math.min(gathered[m.nbtName] ?? 0, m.count), 0);
}

interface RowProps {
  mat: SessionMaterial;
  value: number;
  onChange: (nbtName: string, val: number) => void;
  mode: 'gathering' | 'building';
}

function MaterialRow({ mat, value, onChange, mode }: RowProps) {
  const pct   = Math.min(100, (value / mat.count) * 100);
  const done  = value >= mat.count;
  const color = mode === 'gathering' ? '#57FF6E' : '#FFD700';

  return (
    <div className={`bt-row${done ? ' bt-row--done' : ''}`}>
      <div className="bt-row-name">{mat.displayName}</div>
      <div className="bt-row-need">{fmtStacks(mat.count)}</div>
      <div className="bt-row-bar-wrap">
        <div className="bt-row-bar">
          <div className="bt-row-bar-fill" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="bt-row-pct">{Math.round(pct)}%</span>
      </div>
      <input
        className="bt-row-input"
        type="number"
        min={0}
        max={mat.count}
        value={value || ''}
        placeholder="0"
        onChange={(e) => {
          const v = Math.max(0, Math.min(mat.count, parseInt(e.target.value) || 0));
          onChange(mat.nbtName, v);
        }}
      />
      {done && <span className="bt-row-check">✓</span>}
    </div>
  );
}

interface Props {
  sessionId: string;
}

export function BuildTracker({ sessionId }: Props) {
  const [session, setSession]   = useState<BuildSession | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [switching, setSwitching] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local state for inputs (optimistic UI)
  const [gathered, setGathered] = useState<Record<string, number>>({});
  const [placed,   setPlaced]   = useState<Record<string, number>>({});

  useEffect(() => {
    getSession(sessionId)
      .then((s) => {
        setSession(s);
        setGathered(s.gathered);
        setPlaced(s.placed);
        setLoading(false);
      })
      .catch(() => {
        setError('Сессия не найдена или была удалена.');
        setLoading(false);
      });

    const unsub = subscribeSession(sessionId, (s) => {
      setSession(s);
      setGathered(s.gathered);
      setPlaced(s.placed);
    });
    return unsub;
  }, [sessionId]);

  const debounceSave = useCallback((newGathered: Record<string, number>, newPlaced: Record<string, number>, mode: 'gathering' | 'building') => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (mode === 'gathering') updateGathered(sessionId, newGathered).catch(console.error);
      else updatePlaced(sessionId, newPlaced).catch(console.error);
    }, 600);
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
    } catch {
      alert('Ошибка при смене режима.');
    } finally {
      setSwitching(false);
      setShowConfirm(false);
    }
  }

  if (loading) return (
    <div className="bt-page bt-page--loading">
      <div className="bt-spinner" />
      <p>Загрузка трекера…</p>
    </div>
  );

  if (error) return (
    <div className="bt-page bt-page--error">
      <p>⚠ {error}</p>
      <a href="/" className="bt-back-link">← На главную</a>
    </div>
  );

  const s = session!;
  const mode = s.mode;
  const total    = totalBlocks(s.materials);
  const gotCount = mode === 'gathering' ? totalGathered(gathered, s.materials) : totalPlaced(placed, s.materials);
  const pctDone  = total > 0 ? Math.min(100, (gotCount / total) * 100) : 0;
  const grayscale = mode === 'building' ? Math.max(0, 1 - pctDone / 100) : 1;

  const label    = mode === 'gathering' ? 'Собрано' : 'Поставлено';
  const barColor = mode === 'gathering' ? '#57FF6E' : '#FFD700';

  return (
    <div className="bt-page">
      {/* Header */}
      <div className="bt-page-header">
        <a href="/" className="bt-back-link">← MapKluss</a>
        <div className="bt-page-title">⛏ ТРЕКЕР ПОСТРОЙКИ</div>
        <div className="bt-page-meta">{s.map_grid.wide}×{s.map_grid.tall} карт • {s.materials.length} видов блоков</div>
      </div>

      <div className="bt-page-body">
        {/* Left: preview + progress */}
        <div className="bt-sidebar">
          <div className="bt-preview-wrap">
            <img
              src={s.image_preview}
              alt="map art preview"
              className="bt-preview-img"
              style={{ filter: `grayscale(${grayscale})`, transition: 'filter 0.8s ease' }}
            />
            {mode === 'building' && pctDone > 0 && (
              <div className="bt-preview-pct-badge">{Math.round(pctDone)}%</div>
            )}
          </div>

          <div className="bt-progress-block">
            <div className="bt-progress-label">
              <span>{mode === 'gathering' ? '⛏ Сбор ресурсов' : '🏗 Строительство'}</span>
              <span className="bt-progress-num">{Math.round(pctDone)}%</span>
            </div>
            <div className="bt-progress-bar">
              <div className="bt-progress-fill" style={{ width: `${pctDone}%`, background: barColor }} />
            </div>
            <div className="bt-progress-counts">
              {gotCount.toLocaleString()} / {total.toLocaleString()} блоков
            </div>
          </div>

          {mode === 'gathering' && (
            <button
              className="bt-switch-btn"
              onClick={() => setShowConfirm(true)}
              disabled={switching}
            >
              🏗 Начать строительство
            </button>
          )}
          {mode === 'building' && (
            <div className="bt-mode-badge">🏗 Режим строительства</div>
          )}
        </div>

        {/* Right: materials table */}
        <div className="bt-table-wrap">
          <div className="bt-table-header">
            <span>Материал</span>
            <span>Нужно</span>
            <span>Прогресс</span>
            <span>{label}</span>
          </div>
          <div className="bt-table-body">
            {s.materials.map((mat) => (
              <MaterialRow
                key={mat.nbtName}
                mat={mat}
                value={mode === 'gathering' ? (gathered[mat.nbtName] ?? 0) : (placed[mat.nbtName] ?? 0)}
                onChange={mode === 'gathering' ? handleGatheredChange : handlePlacedChange}
                mode={mode}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Confirm switch modal */}
      {showConfirm && (
        <div className="bt-confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="bt-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <p className="bt-confirm-title">Начать строительство?</p>
            <p className="bt-confirm-desc">
              Режим переключится на отслеживание поставленных блоков.
              Данные сбора ресурсов сохранятся.
            </p>
            <div className="bt-confirm-btns">
              <button className="bt-btn bt-btn--cancel" onClick={() => setShowConfirm(false)}>Отмена</button>
              <button className="bt-btn bt-btn--confirm" onClick={handleSwitchToBuilding} disabled={switching}>
                {switching ? 'Переключение…' : 'Да, начать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
