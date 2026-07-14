import React, { useState } from 'react';
import { normalizeEditableArtPrivacy, type ArtPrivacy } from '../lib/companionTypes';
import type { MapGrid } from '../lib/types';
import { useLocale } from '../lib/useLocale';

interface CloudSaveModalProps {
  defaultTitle: string;
  defaultPrivacy: ArtPrivacy;
  isUpdate: boolean;
  mapGrid: MapGrid;
  busy: boolean;
  onSave: (input: { title: string; privacy: ArtPrivacy }) => void;
  onClose: () => void;
}

function privacyOptionCopy(value: ArtPrivacy, t: (ru: string, en: string) => string): { label: string; hint: string } {
  if (value === 'private') {
    return {
      label: t('Приватный', 'Private'),
      hint: t('Доступен только тебе и модулю после входа.', 'Available only to you and the mod after sign-in.'),
    };
  }
  return {
    label: t('По ссылке', 'Unlisted'),
    hint: t('Можно открыть по ссылке, в публичной галерее не видно.', 'Accessible by link, hidden from the public gallery.'),
  };
}

const PRIVACY_OPTIONS: ArtPrivacy[] = ['unlisted', 'private'];

export function CloudSaveModal({ defaultTitle, defaultPrivacy, isUpdate, mapGrid, busy, onSave, onClose }: CloudSaveModalProps) {
  const { t } = useLocale();
  const [title, setTitle] = useState(defaultTitle);
  const [privacy, setPrivacy] = useState<ArtPrivacy>(() => normalizeEditableArtPrivacy(defaultPrivacy));

  const trimmedTitle = title.trim();
  const selectedOption = privacyOptionCopy(privacy, t);

  function handleSave() {
    if (!trimmedTitle || busy) return;
    onSave({ title: trimmedTitle, privacy: normalizeEditableArtPrivacy(privacy) });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className="cloud-save-modal" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="cloud-save-box" onClick={e => e.stopPropagation()}>
        <div className="cloud-save-head">
          <span>{isUpdate ? t('Обновить облачный арт', 'Update cloud art') : t('Сохранить в облако', 'Save to Cloud')}</span>
          <button onClick={onClose} aria-label={t('Закрыть', 'Close')}>x</button>
        </div>

        <div className="cloud-save-form">
          <label>
            <span>{t('Название', 'Title')}</span>
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              maxLength={120}
              autoFocus
              spellCheck={false}
              placeholder={`MapKluss_${mapGrid.wide}x${mapGrid.tall}`}
            />
          </label>

          <label>
            <span>{t('Доступ', 'Privacy')}</span>
            <select value={privacy} onChange={event => setPrivacy(event.target.value as ArtPrivacy)}>
              {PRIVACY_OPTIONS.map(option => (
                <option key={option} value={option}>{privacyOptionCopy(option, t).label}</option>
              ))}
            </select>
          </label>

          <p className="cloud-save-hint">{selectedOption.hint}</p>
          <p className="cloud-save-meta">{t('Публичная галерея появится позже. Сейчас лучше сохранять арт приватно или по ссылке.', 'The public gallery will come later. For now, save art as private or unlisted.')}</p>
          <p className="cloud-save-meta">{t(`${mapGrid.wide}x${mapGrid.tall} карт / новая версия будет доступна на сайте и в моде.`, `${mapGrid.wide}x${mapGrid.tall} maps / the new version will be available on the site and in the mod.`)}</p>
        </div>

        <div className="cloud-save-actions">
          <button className="cloud-save-primary" onClick={handleSave} disabled={busy || !trimmedTitle}>
            {busy ? t('Сохраняю...', 'Saving...') : isUpdate ? t('Обновить', 'Update') : t('Сохранить', 'Save')}
          </button>
          <button onClick={onClose} disabled={busy}>{t('Отмена', 'Cancel')}</button>
        </div>
      </div>
    </div>
  );
}
