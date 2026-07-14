import { useState } from 'react';
import { createBuildSession, buildThumbnail } from '../lib/buildSession';
import { buildLitematicBytes } from '../lib/exportLitematic';
import { bytesToBase64 } from '../lib/base64';
import type { SessionMaterial } from '../lib/buildSession';
import type { ComputedPalette } from '../lib/dithering';
import type { BlockSelection } from '../lib/paletteBlocks';
import { useLocale } from '../lib/useLocale';
import '../buildTracker.css';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';

interface Props {
  materials: SessionMaterial[];
  imageData: ImageData;
  previewImageData?: ImageData;
  mapGrid: { wide: number; tall: number };
  cp: ComputedPalette;
  blockGroups: BlockSelection;
  onClose: () => void;
}

export function BuildTrackerModal({ materials, imageData, previewImageData, mapGrid, cp, blockGroups, onClose }: Props) {
  const { t } = useLocale();
  const donePreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('buildTrackerModalPreview') === 'done';
  const [state, setState] = useState<'idle' | 'creating' | 'done' | 'error'>(donePreview ? 'done' : 'idle');
  const [url, setUrl] = useState(donePreview ? `${window.location.origin}/build/dev-preview` : '');
  const [copied, setCopied] = useState(false);

  const [title, setTitle] = useState('');
  const [server, setServer] = useState('');
  const [coords, setCoords] = useState('');
  const [description, setDesc] = useState('');

  async function handleCreate() {
    setState('creating');
    try {
      const preview = buildThumbnail(previewImageData ?? imageData);

      let litematicB64: string | undefined;
      try {
        const bytes = await buildLitematicBytes(imageData, cp, blockGroups, title.trim() || 'MapArt', 'flat');
        litematicB64 = bytesToBase64(bytes);
      } catch {
        // Litematic export is helpful for cloud sync, but tracker creation should still work without it.
      }

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
          <span className="bt-title">▣ {t('ТРЕКЕР', 'TRACKER')}</span>
          <button className="bt-close" onClick={onClose}>x</button>
        </div>

        {state !== 'done' && (
          <div className="bt-body">
            <p className="bt-desc">
              {t(
                'Создайте общую ссылку для команды строителей. Каждый может отмечать, сколько блоков собрал и поставил - прогресс виден в реальном времени.',
                "Create a shared link for your build team. Everyone can track how many blocks they've gathered and placed - progress is visible in real time.",
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
                  placeholder={t('Dragon Art, Аниме арт...', 'Dragon Art, Anime art...')}
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
                    placeholder="Hermitcraft, 2b2t..."
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
                  placeholder={t('Координаты склада, кто что строит...', 'Warehouse coords, who is building what...')}
                  value={description}
                  onChange={e => setDesc(e.target.value)}
                  disabled={state === 'creating'}
                />
              </label>
            </div>

            {state === 'error' && (
              <p className="bt-error">! {t('Не удалось создать сессию. Попробуйте еще раз.', 'Failed to create session. Try again.')}</p>
            )}

            <button
              className="bt-btn bt-btn--create"
              onClick={handleCreate}
              disabled={state === 'creating'}
            >
              {state === 'creating'
                ? t('Создание...', 'Creating...')
                : `+ ${t('Создать трекер', 'Create tracker')}`}
            </button>
          </div>
        )}

        {state === 'done' && (
          <div className="bt-body">
            <p className="bt-success"><IconGlyph icon={mkIcons.checkCircle} /> {t('Трекер создан! Поделитесь ссылкой с командой:', 'Tracker created! Share the link with your team:')}</p>
            <div className="bt-link-row">
              <input
                className="bt-link-input"
                value={url}
                readOnly
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button className="bt-btn bt-btn--copy" onClick={handleCopy}>
                <IconGlyph icon={copied ? mkIcons.check : mkIcons.copy} /> {copied ? t('Скопировано!', 'Copied!') : t('Копировать', 'Copy')}
              </button>
            </div>
            <button
              className="bt-btn bt-btn--open"
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
              title={t('Открыть трекер в новой вкладке', 'Open tracker in a new tab')}
              aria-label={t('Открыть трекер в новой вкладке', 'Open tracker in a new tab')}
            >
              {t('Открыть трекер ->', 'Open tracker ->')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
