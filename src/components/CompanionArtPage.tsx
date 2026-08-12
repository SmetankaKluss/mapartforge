import { useEffect, useState } from 'react';
import { createCompanionCollection, deleteCompanionArt, getCompanionArtManifest, getCompanionArtOverview, getCompanionTrackerForArt, setCompanionCollectionItem, setCompanionFavorite, updateCompanionArtMetadata } from '../lib/companionCloud';
import { normalizeEditableArtPrivacy, type ArtPrivacy, type CompanionArtifactManifestEntry, type CompanionArtManifest, type CompanionArtVersionSummary, type CompanionCollection, type CompanionProfileSummary } from '../lib/companionTypes';
import { useLocale } from '../lib/useLocale';
import { applyPageMeta } from '../lib/meta';
import { PublicSiteHeader } from './PublicSiteHeader';

interface Props {
  artId: string;
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  if (value >= 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${value} B`;
}

function formatDateTime(value: string, locale = undefined as string | undefined): string {
  return new Date(value).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatVersionDate(value: string, locale: string, now = new Date()): { primary: string; full: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { primary: value, full: value };

  const full = formatDateTime(value, locale);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysFromToday = Math.round((startOfDate.getTime() - startOfToday.getTime()) / 86_400_000);
  if (Math.abs(daysFromToday) > 6) return { primary: full, full };

  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(daysFromToday, 'day');
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return { primary: `${relative}, ${time}`, full };
}

function artifactLabel(kind: CompanionArtifactManifestEntry['kind'], t: (ru: string, en: string) => string): string {
  switch (kind) {
    case 'project':
      return t('Проект MapKluss', 'MapKluss project');
    case 'preview_png':
      return t('Превью PNG', 'PNG preview');
    case 'litematic':
      return 'Litematic';
    case 'litematic_tiles_zip':
      return t('Litematic по картам ZIP', 'Tiled Litematic ZIP');
    case 'suppression_litematic':
      return 'Two-layer Litematic';
    case 'suppression_plan':
      return t('План Two-layer', 'Two-layer plan');
    case 'materials_txt':
      return t('Материалы TXT', 'Materials TXT');
    case 'materials_csv':
      return t('Материалы CSV', 'Materials CSV');
    case 'mapdat_zip':
      return 'MAP.DAT ZIP';
    case 'frame_commands':
      return t('Команды для рамок', 'Frame commands');
    case 'frame_datapack':
      return t('Датапак рамок', 'Frame datapack');
    default:
      return kind;
  }
}

function privacyLabel(value: ArtPrivacy, t: (ru: string, en: string) => string): string {
  switch (value) {
    case 'private':
      return t('приватный', 'private');
    case 'public':
      return t('публичный', 'public');
    case 'unlisted':
    default:
      return t('по ссылке', 'unlisted');
  }
}

function modeLabel(value: string): string {
  if (value === 'stair') return '3D Stair';
  if (value === 'flat') return '2D Flat';
  if (value === '2d') return '2D Flat';
  if (value === '3d') return '3D Stair';
  return value;
}

function mockDate(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function buildMockArtOverview(artId: string, requestedTitle?: string | null): {
  manifest: CompanionArtManifest;
  owner: CompanionProfileSummary;
  collections: CompanionCollection[];
  versions: CompanionArtVersionSummary[];
} {
  const versionId = 'mock-version-current';
  return {
    manifest: {
      artId,
      versionId,
      ownerId: 'mock-user-1234567890abcdef',
      title: requestedTitle?.trim().slice(0, 120) || 'Neon Rabbit Server Wall',
      privacy: 'unlisted',
      grid: { wide: 3, tall: 2 },
      mode: '2d',
      minecraftVersion: '1.21.4',
      previewUrl: null,
      isFavorite: true,
      collectionIds: ['mock-collection-server'],
      updatedAt: mockDate(18),
      artifacts: [
        {
          id: 'mock-artifact-litematic',
          kind: 'litematic',
          filename: 'neon-rabbit-server-wall_3x2.litematic',
          storagePath: 'mock/litematic',
          contentType: 'application/octet-stream',
          sizeBytes: 148_320,
          sha256: 'mock-litematic-sha256',
          updatedAt: mockDate(18),
        },
        {
          id: 'mock-artifact-materials',
          kind: 'materials_txt',
          filename: 'neon-rabbit-server-wall_3x2_materials.txt',
          storagePath: 'mock/materials',
          contentType: 'text/plain;charset=utf-8',
          sizeBytes: 6_240,
          sha256: 'mock-materials-sha256',
          updatedAt: mockDate(18),
        },
      ],
    },
    owner: {
      userId: 'mock-user-1234567890abcdef',
      displayName: 'Builder Preview',
      avatarUrl: null,
      telegramId: '123456789',
      telegramUsername: 'map_builder',
    },
    collections: [
      {
        id: 'mock-collection-server',
        name: 'Серверные стены',
        createdAt: mockDate(500),
        updatedAt: mockDate(20),
        itemCount: 3,
      },
      {
        id: 'mock-collection-drafts',
        name: 'Черновики',
        createdAt: mockDate(900),
        updatedAt: mockDate(145),
        itemCount: 1,
      },
    ],
    versions: [
      {
        id: versionId,
        versionNumber: 2,
        createdAt: mockDate(18),
        grid: { wide: 3, tall: 2 },
        mode: '2d',
        minecraftVersion: '1.21.4',
        artifactCount: 7,
        isCurrent: true,
        previewUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8WQAAAABJRU5ErkJggg==',
        projectUrl: 'data:application/json,%7B%22mock%22%3Atrue%7D',
      },
      {
        id: 'mock-version-old',
        versionNumber: 1,
        createdAt: mockDate(600),
        grid: { wide: 2, tall: 2 },
        mode: '2d',
        minecraftVersion: '1.21.4',
        artifactCount: 7,
        isCurrent: false,
        projectUrl: 'data:application/json,%7B%22mock%22%3Atrue%7D',
      },
    ],
  };
}

export function CompanionArtPage({ artId }: Props) {
  const { lang, toggle, t } = useLocale();
  const dateLocale = lang === 'en' ? 'en-US' : 'ru-RU';
  const [manifest, setManifest] = useState<CompanionArtManifest | null>(null);
  const [owner, setOwner] = useState<CompanionProfileSummary | null>(null);
  const [collections, setCollections] = useState<CompanionCollection[]>([]);
  const [versions, setVersions] = useState<CompanionArtVersionSummary[]>([]);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [privacyDraft, setPrivacyDraft] = useState<ArtPrivacy>('unlisted');
  const [busy, setBusy] = useState(true);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [collectionBusy, setCollectionBusy] = useState<string | null>(null);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [trackerBusy, setTrackerBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('deleteConfirmPreview') === '1',
  );
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mockParams = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
  const useMockArt = mockParams?.get('artMock') === '1';
  const mockTitle = mockParams?.get('mockTitle');
  const deleteConfirmValid = ['УДАЛИТЬ', 'DELETE'].includes(deleteConfirmText.trim().toLocaleUpperCase('ru-RU'));

  useEffect(() => {
    applyPageMeta({
      title: manifest?.title ? `${manifest.title} | MapKluss` : t('Арт MapKluss', 'MapKluss art'),
      description: manifest
        ? t(`Арт ${manifest.grid.wide}×${manifest.grid.tall}, файлы, версии и настройки доступа.`, `${manifest.grid.wide}×${manifest.grid.tall} art, files, versions, and privacy settings.`)
        : t('Страница облачного арта MapKluss.', 'MapKluss cloud art page.'),
      robots: 'noindex,nofollow',
    });
  }, [manifest, t]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      setError(null);
      try {
        if (useMockArt) {
          const loaded = buildMockArtOverview(artId, mockTitle);
          if (!cancelled) {
            setManifest(loaded.manifest);
            setOwner(loaded.owner);
            setTitleDraft(loaded.manifest.title);
            setPrivacyDraft(normalizeEditableArtPrivacy(loaded.manifest.privacy));
            setCollections(loaded.collections);
            setVersions(loaded.versions);
          }
          return;
        }
        const loaded = await getCompanionArtOverview(artId);
        if (!cancelled) {
          setManifest(loaded.manifest);
          setOwner(loaded.owner);
          setTitleDraft(loaded.manifest.title);
          setPrivacyDraft(normalizeEditableArtPrivacy(loaded.manifest.privacy));
          setCollections(loaded.collections);
          setVersions(loaded.versions);
        }
      } catch {
        if (!cancelled) setError(t(
          'Арт недоступен. Возможно, он приватный, удалён или у аккаунта нет доступа.',
          'This art is unavailable. It may be private, deleted, or inaccessible to this account.',
        ));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [artId, mockTitle, t, useMockArt]);

  async function toggleFavorite() {
    if (!manifest || favoriteBusy) return;
    setFavoriteBusy(true);
    setError(null);
    try {
      const isFavorite = await setCompanionFavorite(manifest.artId, !manifest.isFavorite);
      setManifest({ ...manifest, isFavorite });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function toggleCollection(collectionId: string) {
    if (!manifest || collectionBusy) return;
    const currentIds = manifest.collectionIds ?? [];
    const selected = !currentIds.includes(collectionId);
    setCollectionBusy(collectionId);
    setError(null);
    try {
      const confirmed = await setCompanionCollectionItem(collectionId, manifest.artId, selected);
      setManifest({
        ...manifest,
        collectionIds: confirmed
          ? [...new Set([...currentIds, collectionId])]
          : currentIds.filter(id => id !== collectionId),
      });
      setCollections(current => current.map(collection => {
        if (collection.id !== collectionId) return collection;
        const currentCount = collection.itemCount ?? 0;
        return {
          ...collection,
          itemCount: confirmed
            ? currentIds.includes(collectionId) ? currentCount : currentCount + 1
            : Math.max(0, currentCount - 1),
        };
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCollectionBusy(null);
    }
  }

  async function createCollectionForArt() {
    if (!manifest || creatingCollection) return;
    const name = newCollectionName.trim();
    if (!name) {
      setError(t('Введи название коллекции.', 'Enter a collection name.'));
      return;
    }
    setCreatingCollection(true);
    setError(null);
    try {
      const created = await createCompanionCollection(name);
      await setCompanionCollectionItem(created.id, manifest.artId, true);
      setCollections(current => [{ ...created, itemCount: 1 }, ...current]);
      setManifest({
        ...manifest,
        collectionIds: [...new Set([...(manifest.collectionIds ?? []), created.id])],
      });
      setNewCollectionName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingCollection(false);
    }
  }

  async function saveMetadata() {
    if (!manifest || metadataBusy) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setError(t('Введи название арта.', 'Enter an art title.'));
      return;
    }
    setMetadataBusy(true);
    setError(null);
    try {
      await updateCompanionArtMetadata(manifest.artId, nextTitle, normalizeEditableArtPrivacy(privacyDraft));
      const reloaded = await getCompanionArtManifest(manifest.artId);
      setManifest(reloaded);
      setTitleDraft(reloaded.title);
      setPrivacyDraft(normalizeEditableArtPrivacy(reloaded.privacy));
      setVersions(current => current.map(version => ({
        ...version,
        isCurrent: version.id === reloaded.versionId,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMetadataBusy(false);
    }
  }

  async function openTracker() {
    if (!manifest || trackerBusy) return;
    setTrackerBusy(true);
    setError(null);
    try {
      const session = await getCompanionTrackerForArt(manifest.artId);
      window.open(`/build/${session.id}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTrackerBusy(false);
    }
  }

  async function deleteArt() {
    if (!manifest || deleteBusy) return;
    if (!deleteConfirmValid) {
      setDeleteConfirmOpen(true);
      return;
    }
    setDeleteBusy(true);
    setError(null);
    try {
      if (useMockArt) {
        setManifest(null);
        setOwner(null);
        setVersions([]);
        setCollections([]);
        setDeleteConfirmOpen(false);
        setDeleteConfirmText('');
      } else {
        await deleteCompanionArt(manifest.artId);
        window.location.href = '/cloud';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  function formatVersionMeta(version: CompanionArtVersionSummary): string {
    const parts = [
      `${version.grid.wide}x${version.grid.tall}`,
      modeLabel(version.mode),
      t(`артефактов: ${version.artifactCount}`, `artifacts: ${version.artifactCount}`),
    ];
    if (version.minecraftVersion) parts.push(version.minecraftVersion);
    return parts.join(' / ');
  }

  return (
    <div className="public-shell">
      <PublicSiteHeader active="cloud" lang={lang} onToggleLanguage={toggle} />
      <main className="companion-page companion-art-detail-page">
      <header className="companion-header companion-detail-header">
        <div>
          <nav className="public-breadcrumbs" aria-label={t('Навигационная цепочка', 'Breadcrumb')}>
            <a href="/cloud">{t('Облако', 'Cloud')}</a>
            <span className="public-breadcrumbs__separator" aria-hidden="true">/</span>
            <span aria-current="page">{manifest?.title ?? t('Арт', 'Art')}</span>
          </nav>
          <h1>{manifest?.title ?? t('Арт MapKluss', 'MapKluss art')}</h1>
          <p>{manifest ? `${manifest.grid.wide}x${manifest.grid.tall} / ${modeLabel(manifest.mode)} / ${privacyLabel(manifest.privacy, t)}` : artId}</p>
          {owner && (
            <p className="companion-muted">
              {t('автор', 'author')}: {owner.displayName?.trim() || owner.telegramUsername?.trim() || owner.userId}
            </p>
          )}
        </div>
      </header>

      {busy && <p className="companion-status" role="status" aria-live="polite">{t('Загружаю арт…', 'Loading art…')}</p>}
      {error && <p className="companion-status companion-status--error" role="alert">{error}</p>}

      {manifest && (
        <>
        <section className="companion-art-hero">
          <div className="companion-panel companion-art-preview-panel">
            <div className="companion-section-head companion-section-head-compact">
              <div>
                <h2>{t('Превью', 'Preview')}</h2>
                <p className="companion-muted">{t('Так этот арт будет отображаться в облаке и моде.', 'This is how the art appears in Cloud and the mod.')}</p>
              </div>
              <div className="companion-art-meta" aria-label={t('Параметры арта', 'Art details')}>
                <span>{manifest.grid.wide}x{manifest.grid.tall} {t('карт', 'maps')}</span>
                <span>{modeLabel(manifest.mode)}</span>
                <span>{privacyLabel(manifest.privacy, t)}</span>
              </div>
            </div>
            <div className="companion-preview-stage">
              {manifest.previewUrl ? (
                <img className="companion-preview companion-preview-large" src={manifest.previewUrl} alt={manifest.title} />
              ) : (
                <div className="companion-preview-placeholder" role="img" aria-label={t('Превью пока недоступно', 'Preview unavailable')}>
                  <strong>{manifest.grid.wide}x{manifest.grid.tall}</strong>
                  <span>{t('Превью появится после следующего сохранения арта.', 'The preview will appear after the next art save.')}</span>
                </div>
              )}
            </div>
          </div>

          <aside className="companion-panel companion-art-command-panel">
            <h2>{t('Действия', 'Actions')}</h2>
            <div className="companion-owner-block">
              {owner?.avatarUrl && <img className="companion-owner-avatar" src={owner.avatarUrl} alt={owner.displayName ?? owner.userId} />}
              <div className="companion-import-copy">
                <strong>{owner?.displayName?.trim() || owner?.telegramUsername?.trim() || owner?.userId || t('Автор скрыт', 'Hidden author')}</strong>
                <span>{t('Автор', 'Author')}</span>
              </div>
            </div>
            <div className="companion-primary-actions">
              <button onClick={() => void toggleFavorite()} disabled={favoriteBusy} aria-pressed={manifest.isFavorite}>
                {manifest.isFavorite ? t('Убрать из избранного', 'Remove from favorites') : t('В избранное', 'Add to favorites')}
              </button>
              <button onClick={() => void openTracker()} disabled={trackerBusy}>
                {trackerBusy ? t('Открываю трекер...', 'Opening tracker...') : t('Трекер стройки', 'Build tracker')}
              </button>
              <a className="companion-action-link" href={`/?art=${manifest.artId}`}>{t('Открыть в редакторе', 'Open in editor')}</a>
              <a className="companion-action-link" href="/cloud">{t('Настройки мода', 'Mod settings')}</a>
            </div>
            <div className="companion-command-summary">
              <span>{t('Файлы', 'Files')}: {manifest.artifacts.length}</span>
              <span>{t('Версий', 'Versions')}: {versions.length}</span>
              <span>{t('Обновлено', 'Updated')}: {formatDateTime(manifest.updatedAt, dateLocale)}</span>
            </div>
          </aside>
        </section>

        <section className="companion-art-detail-grid">
          <div className="companion-panel companion-art-files-panel">
            <h2>{t('Файлы', 'Files')}</h2>
            {manifest.artifacts.length === 0 ? (
              <p className="companion-muted">{t('Файлы ещё не созданы.', 'Files have not been created yet.')}</p>
            ) : manifest.artifacts.map(artifact => (
              <article className="companion-art" key={artifact.id}>
                <div className="companion-import-copy">
                  <strong>{artifactLabel(artifact.kind, t)}</strong>
                  <span>{artifact.filename}</span>
                  <div className="companion-import-meta">
                    <span>{formatBytes(artifact.sizeBytes)}</span>
                    <span>{formatDateTime(artifact.updatedAt, dateLocale)}</span>
                  </div>
                </div>
                {artifact.signedUrl ? <a className="companion-action-link" href={artifact.signedUrl}>{t('Скачать', 'Download')}</a> : <span className="companion-chip">{t('Готовится', 'Preparing')}</span>}
              </article>
            ))}
          </div>

          <div className="companion-panel companion-versions-panel">
            <div className="companion-section-head companion-section-head-compact companion-version-intro">
              <div>
                <h2>{t('История версий', 'Version history')}</h2>
                <p className="companion-muted">{t(
                  'Восстановление откроет выбранную версию в редакторе. Облачный арт изменится только после нового сохранения.',
                  'Restoring opens the selected version in the editor. The cloud art changes only after you save it again.',
                )}</p>
              </div>
              <span className="companion-chip">{t(`Сохранено: ${versions.length}`, `Saved: ${versions.length}`)}</span>
            </div>
            {versions.length === 0 ? (
              <p className="companion-muted">{t('Сохранённых версий пока нет.', 'There are no saved versions yet.')}</p>
            ) : (
              <div className="companion-version-list">
                {versions.map(version => {
                  const date = formatVersionDate(version.createdAt, dateLocale);
                  const hasDownload = Boolean(version.previewUrl || version.projectUrl);
                  return (
                    <article className={`companion-art companion-version-card${version.isCurrent ? ' is-current' : ''}`} key={version.id}>
                      <div className="companion-version-main">
                        <div className="companion-version-heading">
                          <strong>{t(`Версия ${version.versionNumber}`, `Version ${version.versionNumber}`)}</strong>
                          {version.isCurrent && <span className="companion-current-version-badge">{t('Текущая', 'Current')}</span>}
                        </div>
                        <time className="companion-version-date" dateTime={version.createdAt} title={date.full}>{date.primary}</time>
                        {date.primary !== date.full && <span className="companion-version-date-detail">{date.full}</span>}
                        <span className="companion-version-meta">{formatVersionMeta(version)}</span>
                        <div className="companion-version-files" aria-label={t('Доступные файлы версии', 'Available version files')}>
                          <span className="companion-version-files-label">{t(`Сохранено файлов: ${version.artifactCount}`, `Files saved: ${version.artifactCount}`)}</span>
                          <div className="companion-chip-row">
                            {version.previewUrl && <span className="companion-chip companion-chip-success">{t('Превью PNG', 'PNG preview')}</span>}
                            {version.projectUrl && <span className="companion-chip companion-chip-success">{t('Проект MapKluss', 'MapKluss project')}</span>}
                            {!hasDownload && <span className="companion-chip companion-chip-warning">{t('Скачивание недоступно', 'Downloads unavailable')}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="companion-actions companion-version-actions">
                        {version.previewUrl && <a className="companion-action-link" href={version.previewUrl}>{t('Посмотреть превью', 'View preview')}</a>}
                        {version.projectUrl && (
                          <a className="companion-action-link companion-action-link--primary" href={`/?artVersion=${version.id}`}>
                            {version.isCurrent ? t('Открыть в редакторе', 'Open in editor') : t('Восстановить в редакторе', 'Restore in editor')}
                          </a>
                        )}
                        {version.projectUrl && <a className="companion-action-link" href={version.projectUrl}>{t('Скачать проект', 'Download project')}</a>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="companion-panel">
            <h2>{t('Настройки', 'Settings')}</h2>
            <div className="companion-stack-form">
              <label>
                <span>{t('Название', 'Title')}</span>
                <input value={titleDraft} onChange={event => setTitleDraft(event.target.value)} maxLength={120} />
              </label>
              <label>
                <span>{t('Доступ', 'Privacy')}</span>
                <select value={privacyDraft} onChange={event => setPrivacyDraft(event.target.value as ArtPrivacy)}>
                  <option value="private">{t('Приватный', 'Private')}</option>
                  <option value="unlisted">{t('По ссылке', 'Unlisted')}</option>
                </select>
              </label>
              <p className="companion-muted">{t('Публичная галерея появится позже. Сейчас арт можно оставить приватным или открыть по ссылке.', 'The public gallery will come later. For now, keep the art private or unlisted by link.')}</p>
              <button onClick={() => void saveMetadata()} disabled={metadataBusy}>
                {metadataBusy ? t('Сохраняю...', 'Saving...') : t('Сохранить', 'Save')}
              </button>
            </div>
            <p className="companion-muted">{t('При переименовании новые скачивания и схема для мода получат актуальное имя без дублей.', 'After renaming, new downloads and mod schematics use the current name without duplicates.')}</p>
          </div>

          <div className="companion-panel companion-danger-zone">
            <h2>{t('Удаление арта', 'Delete art')}</h2>
            <p className="companion-muted">{t('Навсегда удаляет арт, версии, файлы, избранное, связи с коллекциями и облачные данные.', 'Permanently deletes the art, versions, files, favorites, collection links, and cloud data.')}</p>
            {!deleteConfirmOpen ? (
              <button className="companion-danger-button" onClick={() => setDeleteConfirmOpen(true)} disabled={deleteBusy}>
                {t('Удалить арт', 'Delete art')}
              </button>
            ) : (
              <div className="companion-delete-confirm">
                <label>
                  <span>{t('Для подтверждения напиши УДАЛИТЬ', 'Type DELETE to confirm')}</span>
                  <input
                    value={deleteConfirmText}
                    onChange={event => setDeleteConfirmText(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter' && deleteConfirmValid) void deleteArt(); }}
                    placeholder={t('УДАЛИТЬ', 'DELETE')}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <div className="companion-actions">
                  <button
                    className="companion-danger-button"
                    onClick={() => void deleteArt()}
                    disabled={deleteBusy || !deleteConfirmValid}
                  >
                    {deleteBusy ? t('Удаляю...', 'Deleting...') : t('Удалить навсегда', 'Delete permanently')}
                  </button>
                  <button
                    onClick={() => {
                      setDeleteConfirmOpen(false);
                      setDeleteConfirmText('');
                    }}
                    disabled={deleteBusy}
                  >
                    {t('Отмена', 'Cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="companion-panel">
            <h2>{t('Коллекции', 'Collections')}</h2>
            <label className="companion-field">
              <span>{t('Новая коллекция', 'New collection')}</span>
              <div className="companion-inline-form">
                <input
                  value={newCollectionName}
                  onChange={event => setNewCollectionName(event.target.value)}
                  aria-label={t('Новая коллекция', 'New collection')}
                  placeholder={t('Например, стены сервера', 'For example, server walls')}
                  maxLength={80}
                />
                <button onClick={() => void createCollectionForArt()} disabled={creatingCollection || !newCollectionName.trim()}>
                  {creatingCollection ? t('Создаю...', 'Creating...') : t('Создать + добавить', 'Create + add')}
                </button>
              </div>
            </label>
            {collections.length === 0 ? (
              <p className="companion-muted">{t('Коллекций пока нет. Создай коллекцию здесь, и арт сразу добавится в неё.', 'There are no collections yet. Create one here and the art will be added to it.')}</p>
            ) : collections.map(collection => {
              const selected = Boolean(manifest.collectionIds?.includes(collection.id));
              return (
                <article className="companion-art" key={collection.id}>
                  <div className="companion-import-copy">
                    <strong>{collection.name}</strong>
                    <span>{t('артов', 'arts')}: {collection.itemCount ?? 0}</span>
                  </div>
                  <button onClick={() => void toggleCollection(collection.id)} disabled={collectionBusy === collection.id} aria-pressed={selected}>
                    {selected ? t('Убрать', 'Remove') : t('Добавить', 'Add')}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
        </>
      )}
      </main>
    </div>
  );
}
