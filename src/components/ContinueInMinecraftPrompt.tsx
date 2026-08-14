import { useEffect, useState } from 'react';
import type { MinecraftVersion } from '../lib/versionPresets';
import {
  COMPANION_MOD_VERSION_OPTIONS,
  FABRIC_API_URL,
  LITEMATICA_URL,
  MALILIB_URL,
  companionDownloadOption,
  companionVersionForMinecraft,
  isCompanionMinecraftVersion,
  type CompanionModVersion,
} from '../lib/companionDownloads';
import { trackEvent } from '../lib/analytics';
import { useLocale } from '../lib/useLocale';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';

export type MinecraftContinuationSource = 'export' | 'cloud';

interface Props {
  minecraftVersion: MinecraftVersion;
  source: MinecraftContinuationSource;
  onSaveToCloud: () => void;
  onClose: () => void;
}

export function ContinueInMinecraftPrompt({ minecraftVersion, source, onSaveToCloud, onClose }: Props) {
  const { t } = useLocale();
  const [selectedVersion, setSelectedVersion] = useState<CompanionModVersion>(() => (
    companionVersionForMinecraft(minecraftVersion)
  ));
  const selected = companionDownloadOption(selectedVersion);
  const exactVersion = isCompanionMinecraftVersion(minecraftVersion);

  useEffect(() => {
    trackEvent('minecraft_continue_visible', {
      source,
      minecraft_version: minecraftVersion,
      exact_version: exactVersion,
    });
  }, [exactVersion, minecraftVersion, source]);

  function trackAction(action: string) {
    trackEvent('minecraft_continue_action', {
      action,
      source,
      minecraft_version: selectedVersion,
    });
  }

  return (
    <section className="minecraft-continue" aria-labelledby="minecraft-continue-title">
      <div className="minecraft-continue-head">
        <IconGlyph icon={mkIcons.hammer} size={18} />
        <div>
          <strong id="minecraft-continue-title">{t('Продолжить в Minecraft', 'Continue in Minecraft')}</strong>
          <span>
            {source === 'cloud'
              ? t('Арт уже доступен в My Arts.', 'Your art is already available in My Arts.')
              : t('Сохрани арт в Cloud, чтобы мод увидел его.', 'Save the art to Cloud so the mod can see it.')}
          </span>
        </div>
        <button
          type="button"
          className="minecraft-continue-close"
          onClick={onClose}
          aria-label={t('Закрыть', 'Close')}
          title={t('Закрыть', 'Close')}
        >
          <IconGlyph icon={mkIcons.close} size={14} />
        </button>
      </div>

      {!exactVersion && (
        <p className="minecraft-continue-warning" role="status">
          {t(
            `Companion начинается с Minecraft 1.21.4. Для ${minecraftVersion} выбрана ближайшая версия.`,
            `Companion starts at Minecraft 1.21.4. The nearest version was selected for ${minecraftVersion}.`,
          )}
        </p>
      )}

      <div className="minecraft-continue-controls">
        <label>
          <span>{t('Fabric версия', 'Fabric version')}</span>
          <select
            value={selectedVersion}
            onChange={event => setSelectedVersion(event.target.value as CompanionModVersion)}
            aria-label={t('Версия Minecraft для Companion', 'Minecraft version for Companion')}
          >
            {COMPANION_MOD_VERSION_OPTIONS.map(option => (
              <option key={option.minecraftVersion} value={option.minecraftVersion}>
                {option.minecraftVersion} · {option.badge}
              </option>
            ))}
          </select>
        </label>
        <a
          className="minecraft-continue-primary"
          href={selected.href}
          download={selected.filename}
          onClick={() => trackAction('download')}
        >
          <IconGlyph icon={mkIcons.download} size={15} />
          {t('Скачать мод', 'Download mod')}
        </a>
        {source === 'cloud' ? (
          <a
            className="minecraft-continue-secondary"
            href="/device/"
            onClick={() => trackAction('device_login')}
          >
            <IconGlyph icon={mkIcons.login} size={15} />
            {t('Вход мода', 'Mod login')}
          </a>
        ) : (
          <button
            type="button"
            className="minecraft-continue-secondary"
            onClick={() => {
              trackAction('save_cloud');
              onSaveToCloud();
            }}
          >
            <IconGlyph icon={mkIcons.save} size={15} />
            {t('Сохранить в Cloud', 'Save to Cloud')}
          </button>
        )}
      </div>

      <div className="minecraft-continue-foot">
        <span>{t('Нужно:', 'Requires:')}</span>
        <a href={FABRIC_API_URL} target="_blank" rel="noopener noreferrer" onClick={() => trackAction('fabric_api')}>Fabric API</a>
        <span aria-hidden="true">·</span>
        <span>{t('Для схем:', 'For schematics:')}</span>
        <a href={LITEMATICA_URL} target="_blank" rel="noopener noreferrer" onClick={() => trackAction('litematica')}>Litematica</a>
        <span aria-hidden="true">+</span>
        <a href={MALILIB_URL} target="_blank" rel="noopener noreferrer" onClick={() => trackAction('malilib')}>MaLiLib</a>
      </div>
      {source === 'cloud' && (
        <p className="minecraft-continue-next">
          {t('В моде выбери арт и открой Схему, Lens или Tracker.', 'Select the art in the mod, then open Schematic, Lens, or Tracker.')}
        </p>
      )}
    </section>
  );
}
