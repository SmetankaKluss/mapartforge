import { useCallback, useEffect, useState } from 'react';
import { deleteCompanionCollection, getCompanionCollectionOverview, getCompanionTrackerForArt, setCompanionCollectionItem, updateCompanionCollection } from '../lib/companionCloud';
import type { CompanionCollection, CompanionLibraryItem } from '../lib/companionTypes';
import { useLocale } from '../lib/useLocale';
import { applyPageMeta } from '../lib/meta';
import { PublicSiteHeader } from './PublicSiteHeader';

interface Props {
  collectionId: string;
}

function privacyLabel(value: string, t: (ru: string, en: string) => string): string {
  switch (value) {
    case 'private':
      return t('приватный', 'private');
    case 'public':
      return t('публичный', 'public');
    case 'unlisted':
      return t('по ссылке', 'unlisted');
    default:
      return value;
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

function mockCollectionItem(input: {
  artId: string;
  title: string;
  wide: number;
  tall: number;
  mode: CompanionLibraryItem['mode'];
  privacy: CompanionLibraryItem['privacy'];
  favorite?: boolean;
  minutesAgo: number;
}): CompanionLibraryItem {
  return {
    artId: input.artId,
    currentVersionId: `${input.artId}-v1`,
    title: input.title,
    privacy: input.privacy,
    grid: { wide: input.wide, tall: input.tall },
    mode: input.mode,
    previewUrl: input.artId.includes('rabbit') ? '/examples/starry-night/result.png' : '/examples/mapkluss-logo/result.png',
    updatedAt: mockDate(input.minutesAgo),
    isFavorite: Boolean(input.favorite),
  };
}

function buildMockCollectionOverview(collectionId: string): { collection: CompanionCollection; items: CompanionLibraryItem[] } {
  const items = [
    mockCollectionItem({
      artId: 'mock-neon-rabbit',
      title: 'Neon Rabbit Server Wall',
      wide: 3,
      tall: 2,
      mode: '2d',
      privacy: 'unlisted',
      favorite: true,
      minutesAgo: 18,
    }),
    mockCollectionItem({
      artId: 'mock-archive-logo',
      title: 'Archive Logo Draft',
      wide: 1,
      tall: 1,
      mode: '3d',
      privacy: 'private',
      minutesAgo: 145,
    }),
  ];
  return {
    collection: {
      id: collectionId,
      name: 'Серверные стены',
      createdAt: mockDate(500),
      updatedAt: mockDate(20),
      itemCount: items.length,
    },
    items,
  };
}

export function CompanionCollectionPage({ collectionId }: Props) {
  const { lang, toggle, t } = useLocale();
  const dateLocale = lang === 'en' ? 'en-US' : 'ru-RU';
  const [collection, setCollection] = useState<CompanionCollection | null>(null);
  const [items, setItems] = useState<CompanionLibraryItem[]>([]);
  const [nameDraft, setNameDraft] = useState('');
  const [query, setQuery] = useState('');
  const [removingArtId, setRemovingArtId] = useState<string | null>(null);
  const [trackerArtId, setTrackerArtId] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [deletingCollection, setDeletingCollection] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('deleteConfirmPreview') === '1',
  );
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const useMockCollection = import.meta.env.DEV && new URLSearchParams(window.location.search).get('collectionMock') === '1';
  const deleteConfirmValid = ['УДАЛИТЬ', 'DELETE'].includes(deleteConfirmText.trim().toLocaleUpperCase('ru-RU'));
  const filteredItems = items.filter(item => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return [
      item.title,
      item.mode,
      modeLabel(item.mode),
      item.privacy,
      item.privacy === 'private' ? 'private приватный' : item.privacy === 'public' ? 'public публичный' : 'unlisted по ссылке',
      `${item.grid.wide}x${item.grid.tall}`,
    ].join(' ').toLowerCase().includes(normalized);
  });

  useEffect(() => {
    applyPageMeta({
      title: collection?.name ? `${collection.name} | MapKluss` : t('Коллекция MapKluss', 'MapKluss collection'),
      description: t('Коллекция облачных артов MapKluss.', 'A collection of MapKluss cloud arts.'),
      robots: 'noindex,nofollow',
    });
  }, [collection, t]);

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (useMockCollection) {
        const overview = buildMockCollectionOverview(collectionId);
        setCollection(overview.collection);
        setNameDraft(overview.collection.name);
        setItems(overview.items);
        return;
      }
      const overview = await getCompanionCollectionOverview(collectionId);
      setCollection(overview.collection);
      setNameDraft(overview.collection.name);
      setItems(overview.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [collectionId, useMockCollection]);

  useEffect(() => { void reload(); }, [reload]);

  async function removeArt(artId: string) {
    if (removingArtId) return;
    setRemovingArtId(artId);
    setError(null);
    try {
      const stillSelected = useMockCollection ? false : await setCompanionCollectionItem(collectionId, artId, false);
      if (!stillSelected) {
        setItems(current => current.filter(item => item.artId !== artId));
        setCollection(current => current ? {
          ...current,
          itemCount: Math.max(0, (current.itemCount ?? items.length) - 1),
        } : current);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingArtId(null);
    }
  }

  async function saveName() {
    if (!collection || savingName) return;
    const nextName = nameDraft.trim();
    if (!nextName) {
      setError(t('Введите название коллекции.', 'Enter a collection name.'));
      return;
    }
    if (nextName === collection.name) return;
    setSavingName(true);
    setError(null);
    try {
      const updated = useMockCollection ? { ...collection, name: nextName, updatedAt: new Date().toISOString() } : await updateCompanionCollection(collection.id, nextName);
      setCollection(updated);
      setNameDraft(updated.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingName(false);
    }
  }

  async function deleteCollection() {
    if (!collection || deletingCollection) return;
    if (!deleteConfirmValid) {
      setDeleteConfirmOpen(true);
      return;
    }
    setDeletingCollection(true);
    setError(null);
    try {
      if (useMockCollection) {
        setCollection(null);
        setItems([]);
        setDeleteConfirmOpen(false);
        setDeleteConfirmText('');
      } else {
        await deleteCompanionCollection(collection.id);
        window.location.href = '/cloud';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingCollection(false);
    }
  }

  async function openTracker(artId: string) {
    if (trackerArtId) return;
    setTrackerArtId(artId);
    setError(null);
    try {
      const session = await getCompanionTrackerForArt(artId);
      window.open(`/build/${session.id}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTrackerArtId(null);
    }
  }

  return (
    <div className="public-shell">
      <PublicSiteHeader active="cloud" lang={lang} onToggleLanguage={toggle} />
      <main className="companion-page companion-collection-page">
      <header className="companion-header">
        <div>
          <nav className="public-breadcrumbs" aria-label={t('Навигационная цепочка', 'Breadcrumb')}>
            <a href="/cloud">{t('Облако', 'Cloud')}</a>
            <span className="public-breadcrumbs__separator" aria-hidden="true">/</span>
            <span aria-current="page">{collection?.name ?? t('Коллекция', 'Collection')}</span>
          </nav>
          <h1>{collection?.name ?? t('Коллекция', 'Collection')}</h1>
          <p>{t('артов', 'arts')}: {collection?.itemCount ?? items.length}</p>
        </div>
      </header>

      {busy && <p className="companion-status" role="status" aria-live="polite">{t('Загружаю коллекцию…', 'Loading collection…')}</p>}
      {error && <p className="companion-status companion-status--error" role="alert">{error}</p>}

      {collection && (
      <>
      <section className="companion-panel companion-row">
        <div>
          <h2>{collection?.name ?? collectionId}</h2>
          <p className="companion-muted">
            {collection ? t(`артов: ${collection.itemCount ?? items.length} / обновлено ${new Date(collection.updatedAt).toLocaleString(dateLocale)}`, `arts: ${collection.itemCount ?? items.length} / updated ${new Date(collection.updatedAt).toLocaleString(dateLocale)}`) : t('Загружаю данные коллекции...', 'Loading collection data...')}
          </p>
        </div>
        <button onClick={() => void reload()} disabled={busy}>{t('Обновить', 'Refresh')}</button>
      </section>

      <section className="companion-panel">
        <h2>{t('Настройки', 'Settings')}</h2>
        <div className="companion-stack-form">
          <label>
            <span>{t('Название коллекции', 'Collection name')}</span>
            <input value={nameDraft} onChange={event => setNameDraft(event.target.value)} maxLength={80} />
          </label>
          <button onClick={() => void saveName()} disabled={savingName || !nameDraft.trim() || !collection}>
            {savingName ? t('Сохраняю...', 'Saving...') : t('Сохранить', 'Save')}
          </button>
        </div>
        <p className="companion-muted">{t('Коллекции группируют облачные арты для сайта, мода и быстрого открытия в редакторе.', 'Collections group cloud arts for the site, mod, and quick editor access.')}</p>
      </section>

      <section className="companion-panel">
        <h2>{t('Арты', 'Arts')}</h2>
        <label className="companion-field">
          <span>{t('Поиск по коллекции', 'Search collection')}</span>
          <div className="companion-inline-form">
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Название, размер или режим', 'Title, size, or mode')} maxLength={80} type="search" />
            {query && <button onClick={() => setQuery('')}>{t('Очистить', 'Clear')}</button>}
          </div>
        </label>
        {items.length === 0 && !busy ? (
          <p className="companion-muted">{t('В этой коллекции пока нет артов.', 'There are no arts in this collection yet.')}</p>
        ) : filteredItems.length === 0 ? (
          <p className="companion-muted">{t('Под этот поиск ничего не подходит.', 'Nothing matches this search.')}</p>
        ) : filteredItems.map(art => (
          <article className="companion-art companion-library-art" key={art.artId}>
            <a className="companion-art-thumb" href={`/art/${art.artId}`} aria-label={t(`Открыть арт ${art.title}`, `Open art ${art.title}`)}>
              {art.previewUrl ? <img src={art.previewUrl} alt="" /> : <span>{art.grid.wide}×{art.grid.tall}</span>}
            </a>
            <div className="companion-import-copy">
              <strong>{art.title}</strong>
              <div className="companion-art-meta" aria-label={t('Параметры арта', 'Art details')}>
                <span>{art.grid.wide}x{art.grid.tall} {t('карт', 'maps')}</span>
                <span>{modeLabel(art.mode)}</span>
                <span>{privacyLabel(art.privacy, t)}</span>
              </div>
              <div className="companion-import-meta">
                <span>{art.isFavorite ? t('избранное', 'favorite') : t('в коллекции', 'in collection')}</span>
                <span>{t('обновлено', 'updated')} {new Date(art.updatedAt).toLocaleString(dateLocale)}</span>
              </div>
            </div>
            <div className="companion-actions companion-art-actions">
              <a href={`/art/${art.artId}`}>{t('Открыть', 'Open')}</a>
              <a href={`/?art=${art.artId}`}>{t('Редактор', 'Editor')}</a>
              <button onClick={() => void openTracker(art.artId)} disabled={trackerArtId === art.artId}>
                {trackerArtId === art.artId ? t('Открываю...', 'Opening...') : t('Трекер', 'Tracker')}
              </button>
              <button onClick={() => void removeArt(art.artId)} disabled={removingArtId === art.artId}>
              {removingArtId === art.artId ? t('Убираю...', 'Removing...') : t('Убрать', 'Remove')}
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="companion-panel companion-danger-zone">
        <h2>{t('Удаление коллекции', 'Delete collection')}</h2>
        <p className="companion-muted">{t('Удаляется только коллекция и связи с артами. Сами арты останутся в облаке.', 'Only the collection and art links are deleted. The arts stay in Cloud.')}</p>
        {!deleteConfirmOpen ? (
          <button className="companion-danger-button" onClick={() => setDeleteConfirmOpen(true)} disabled={deletingCollection || !collection}>
            {t('Удалить коллекцию', 'Delete collection')}
          </button>
        ) : (
          <div className="companion-delete-confirm">
            <label>
              <span>{t('Для подтверждения напиши УДАЛИТЬ', 'Type DELETE to confirm')}</span>
              <input
                value={deleteConfirmText}
                onChange={event => setDeleteConfirmText(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && deleteConfirmValid) void deleteCollection(); }}
                placeholder={t('УДАЛИТЬ', 'DELETE')}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="companion-actions">
              <button
                className="companion-danger-button"
                onClick={() => void deleteCollection()}
                disabled={deletingCollection || !collection || !deleteConfirmValid}
              >
                {deletingCollection ? t('Удаляю...', 'Deleting...') : t('Удалить навсегда', 'Delete permanently')}
              </button>
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteConfirmText('');
                }}
                disabled={deletingCollection}
              >
                {t('Отмена', 'Cancel')}
              </button>
            </div>
          </div>
        )}
      </section>
      </>
      )}
      </main>
    </div>
  );
}
