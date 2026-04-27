import { useState } from 'react';
import { createBuildSession, buildThumbnail } from '../lib/buildSession';
import { buildLitematicBytes } from '../lib/exportLitematic';
import type { SessionMaterial } from '../lib/buildSession';
import type { ComputedPalette } from '../lib/dithering';
import type { BlockSelection } from '../lib/paletteBlocks';
import { useLocale } from '../lib/locale';
import '../buildTracker.css';

interface Props {
  materials: SessionMaterial[];
  imageData: ImageData;
  mapGrid: { wide: number; tall: number };
  cp: ComputedPalette;
  blockGroups: BlockSelection;
  onClose: () => void;
}

export function BuildTrackerModal({ materials, imageData, mapGrid, cp, blockGroups, onClose }: Props) {
  const { t } = useLocale();
  const [state, setState] = useState<'idle' | 'creating' | 'done' | 'error'>('idle');
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const [title, setTitle]  = useState('');
  const [server, setServer] = useState('');
  const [coords, setCoords] = useState('');
  const [description, setDesc] = useState('');

  async function handleCreate() {
    setState('creating');
    try {
      const preview = buildThumbnail(imageData);

      let litematicB64: string | undefined;
      try {
        const bytes = await buildLitematicBytes(imageData, cp, blockGroups, title.trim() || 'MapArt', 'flat');
        litematicB64 = btoa(String.fromCharCode(...bytes));
      } catch { /* non-fatal */ }

      const id = await createBuildSession(mapGrid, preview, materials, {
        title: title.trim() || undefined,
        server: server.trim() || undefined,
        coords: coords.trim() || undefined,
        description: description.trim() || undefined,
      }, litematicB64);

      setUrl(`${window.location.origin}/build/${id}`);
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
          <span className="bt-title">⛏ {t('ТРЕКЕР', 'TRACKER')}</span>
          <button className="bt-close" onClick={onClose}>✕</button>
        </div>

        {state !== 'done' && (
          <div className="bt-body">
            <p className="bt-desc">
              {t(
                'Создайте общую ссылку для команды строителей. Каждый может отмечать сколько блоков собрал и поставил — прогресс виден в реальном времени.',
                "Create a shared link for your build team. Everyone can track how many blocks they've gathered and placed — progress is visible in real time.",
              )}
            </p>

            <div className="bt-stats-row">
              <span className="bt-stat"><strong>{materials.length}</strong> {t('видов блоков', 'block types')}</span>
              <span className="bt-stat"><strong>{total.toLocaleString()}</strong> {t('блоков', 'blocks')}</span>
              <span className="bt-stat"><strong>{mapGrid.wide}×{mapGrid.tall}</strong> {t('карт', 'maps')}</span>
            </div>

            <div className="bt-divider" />

            <div className="bt-info-form">
              <label className="bt-info-label">
                {t('Название арта', 'Art title')}
                <input
                  className="bt-info-input"
                  type="text"
                  placeholder={t('Dragon Art, Аниме арт…', 'Dragon Art, Anime art…')}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  disabled={state === 'creating'}
                />
              </label>

              <div className="bt-info-row">
                <label className="bt-info-label">
                  {t('Сервер', 'Server')}
                  <input
                    className="bt-info-input"
                    type="text"
                    placeholder="Hermitcraft, 2b2t…"
                    value={server}
                    onChange={e => setServer(e.target.value)}
                    disabled={state === 'creating'}
                  />
                </label>
                <label className="bt-info-label">
                  {t('Координаты', 'Coords')}
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
                {t('Заметки', 'Notes')}
                <textarea
                  className="bt-info-textarea"
                  placeholder={t('Координаты склада, кто что строит…', 'Warehouse coords, who is building what…')}
                  value={description}
                  onChange={e => setDesc(e.target.value)}
                  disabled={state === 'creating'}
                />
              </label>
            </div>

            {state === 'error' && (
              <p className="bt-error">⚠ {t('Не удалось создать сессию. Попробуйте ещё раз.', 'Failed to create session. Try again.')}</p>
            )}

            <button
              className="bt-btn bt-btn--create"
              onClick={handleCreate}
              disabled={state === 'creating'}
            >
              {state === 'creating'
                ? t('Создание…', 'Creating…')
                : `+ ${t('Создать трекер', 'Create tracker')}`}
            </button>
          </div>
        )}

        {state === 'done' && (
          <div className="bt-body">
            <p className="bt-success">✓ {t('Трекер создан! Поделитесь ссылкой с командой:', 'Tracker created! Share the link with your team:')}</p>
            <div className="bt-link-row">
              <input
                className="bt-link-input"
                value={url}
                readOnly
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button className="bt-btn bt-btn--copy" onClick={handleCopy}>
                {copied ? `✓ ${t('Скопировано!', 'Copied!')}` : t('Копировать', 'Copy')}
              </button>
            </div>
            <button className="bt-btn bt-btn--open" onClick={() => window.open(url, '_blank')}>
              {t('Открыть трекер →', 'Open tracker →')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
