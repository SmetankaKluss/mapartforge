import { useState } from 'react';
import '../buildTracker.css';
import { createBuildSession, buildThumbnail } from '../lib/buildSession';
import type { SessionMaterial } from '../lib/buildSession';

interface Props {
  materials: SessionMaterial[];
  imageData: ImageData;
  mapGrid: { wide: number; tall: number };
  onClose: () => void;
}

export function BuildTrackerModal({ materials, imageData, mapGrid, onClose }: Props) {
  const [state, setState] = useState<'idle' | 'creating' | 'done' | 'error'>('idle');
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setState('creating');
    try {
      const preview = buildThumbnail(imageData);
      const id = await createBuildSession(mapGrid, preview, materials);
      const link = `${window.location.origin}/build/${id}`;
      setUrl(link);
      setState('done');
    } catch {
      setState('error');
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const total = materials.reduce((s, m) => s + m.count, 0);

  return (
    <div className="bt-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bt-modal">
        <div className="bt-header">
          <span className="bt-title">⛏ ТРЕКЕР ПОСТРОЙКИ</span>
          <button className="bt-close" onClick={onClose}>✕</button>
        </div>

        {state !== 'done' && (
          <div className="bt-body">
            <p className="bt-desc">
              Создай общую ссылку для команды строителей. Каждый сможет
              отмечать сколько материалов собрал и поставил — прогресс
              виден всем в реальном времени.
            </p>
            <div className="bt-stats-row">
              <span className="bt-stat"><strong>{materials.length}</strong> видов блоков</span>
              <span className="bt-stat"><strong>{total.toLocaleString()}</strong> блоков всего</span>
              <span className="bt-stat"><strong>{mapGrid.wide}×{mapGrid.tall}</strong> карт</span>
            </div>

            {state === 'error' && (
              <p className="bt-error">Ошибка при создании сессии. Попробуй ещё раз.</p>
            )}

            <button
              className="bt-btn bt-btn--create"
              onClick={handleCreate}
              disabled={state === 'creating'}
            >
              {state === 'creating' ? 'Создание…' : '+ Создать трекер'}
            </button>
          </div>
        )}

        {state === 'done' && (
          <div className="bt-body">
            <p className="bt-success">✓ Трекер создан! Поделись ссылкой с командой:</p>
            <div className="bt-link-row">
              <input className="bt-link-input" value={url} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
              <button className="bt-btn bt-btn--copy" onClick={handleCopy}>
                {copied ? '✓ Скопировано' : 'Копировать'}
              </button>
            </div>
            <button
              className="bt-btn bt-btn--open"
              onClick={() => window.open(url, '_blank')}
            >
              Открыть трекер →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
