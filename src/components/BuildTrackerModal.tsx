import { useState } from 'react';
import { createBuildSession, buildThumbnail } from '../lib/buildSession';
import type { SessionMaterial } from '../lib/buildSession';
import '../buildTracker.css';

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

  // Info fields
  const [title, setTitle]       = useState('');
  const [server, setServer]     = useState('');
  const [coords, setCoords]     = useState('');
  const [description, setDesc]  = useState('');

  async function handleCreate() {
    setState('creating');
    try {
      const preview = buildThumbnail(imageData);
      const id = await createBuildSession(mapGrid, preview, materials, {
        title: title.trim() || undefined,
        server: server.trim() || undefined,
        coords: coords.trim() || undefined,
        description: description.trim() || undefined,
      });
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
          <span className="bt-title">⛏ TRACKER / ТРЕКЕР</span>
          <button className="bt-close" onClick={onClose}>✕</button>
        </div>

        {state !== 'done' && (
          <div className="bt-body">
            <p className="bt-desc">
              Create a shared link for your build team. Everyone can track
              how many materials they've gathered and placed — progress is
              visible in real time.
            </p>

            <div className="bt-stats-row">
              <span className="bt-stat"><strong>{materials.length}</strong> block types</span>
              <span className="bt-stat"><strong>{total.toLocaleString()}</strong> blocks total</span>
              <span className="bt-stat"><strong>{mapGrid.wide}×{mapGrid.tall}</strong> maps</span>
            </div>

            <div className="bt-divider" />

            <div className="bt-info-form">
              <label className="bt-info-label">
                Art title / Название арта
                <input
                  className="bt-info-input"
                  type="text"
                  placeholder="e.g. Dragon Art, Аниме арт…"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  disabled={state === 'creating'}
                />
              </label>

              <div className="bt-info-row">
                <label className="bt-info-label">
                  Server / Сервер
                  <input
                    className="bt-info-input"
                    type="text"
                    placeholder="e.g. Hermitcraft, 2b2t…"
                    value={server}
                    onChange={e => setServer(e.target.value)}
                    disabled={state === 'creating'}
                  />
                </label>
                <label className="bt-info-label">
                  Coords / Координаты
                  <input
                    className="bt-info-input"
                    type="text"
                    placeholder="X Y Z"
                    value={coords}
                    onChange={e => setCoords(e.target.value)}
                    disabled={state === 'creating'}
                  />
                </label>
              </div>

              <label className="bt-info-label">
                Notes / Заметки
                <textarea
                  className="bt-info-textarea"
                  placeholder="Warehouse coords, who is building what, etc."
                  value={description}
                  onChange={e => setDesc(e.target.value)}
                  disabled={state === 'creating'}
                />
              </label>
            </div>

            {state === 'error' && (
              <p className="bt-error">⚠ Failed to create session. Try again.</p>
            )}

            <button
              className="bt-btn bt-btn--create"
              onClick={handleCreate}
              disabled={state === 'creating'}
            >
              {state === 'creating' ? 'Creating…' : '+ Create tracker / Создать трекер'}
            </button>
          </div>
        )}

        {state === 'done' && (
          <div className="bt-body">
            <p className="bt-success">✓ Tracker created! Share the link with your team:</p>
            <div className="bt-link-row">
              <input
                className="bt-link-input"
                value={url}
                readOnly
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button className="bt-btn bt-btn--copy" onClick={handleCopy}>
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
            <button className="bt-btn bt-btn--open" onClick={() => window.open(url, '_blank')}>
              Open tracker →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
