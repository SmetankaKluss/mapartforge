import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { COMPANION_EMAIL_COOLDOWN_MS, getCompanionTrackerForArt, getCurrentCompanionAuthUser, isCompanionEmailRateLimitError, listCompanionFavorites, listCompanionLibrary, listCompanionRecent, normalizeCompanionEmailError, setCompanionFavorite, signInWithCompanionEmail } from '../lib/companionCloud';
import type { CompanionLibraryItem } from '../lib/companionTypes';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';
import { useLocale } from '../lib/useLocale';

type CloudArtTab = 'my' | 'favorites' | 'recent';

interface CloudArtsPanelProps {
  onClose: () => void;
  onOpenArt: (artId: string) => void;
  defaultEmail?: string | null;
}

function relativeDate(value: string, t: (ru: string, en: string) => string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return t('только что', 'just now');
  if (minutes < 60) return t(`${minutes} мин назад`, `${minutes} min ago`);
  if (hours < 24) return t(`${hours} ч назад`, `${hours}h ago`);
  if (days < 7) return t(`${days} дн назад`, `${days}d ago`);
  return new Date(value).toLocaleDateString(t('ru-RU', 'en-US'));
}

function tabTitle(tab: CloudArtTab, t: (ru: string, en: string) => string): string {
  if (tab === 'favorites') return t('Избранное', 'Favorites');
  if (tab === 'recent') return t('Недавние', 'Recent');
  return t('Мои арты', 'My arts');
}

function emptyTitle(tab: CloudArtTab, t: (ru: string, en: string) => string): string {
  if (tab === 'favorites') return t('В избранном пока пусто.', 'Favorites are empty.');
  if (tab === 'recent') return t('Недавних артов пока нет.', 'There are no recent arts yet.');
  return t('В облаке пока нет твоих артов.', 'There are no cloud arts yet.');
}

function privacyLabel(value: string, t: (ru: string, en: string) => string): string {
  if (value === 'private') return t('Приватный', 'Private');
  if (value === 'public') return t('Публичный', 'Public');
  if (value === 'unlisted') return t('По ссылке', 'Unlisted');
  return value;
}

function modeLabel(value: string): string {
  if (value === '2d') return '2D';
  if (value === '3d') return '3D';
  if (value === 'flat') return '2D Flat';
  if (value === 'stair') return '3D Stair';
  return value;
}

function itemSearchText(item: CompanionLibraryItem): string {
  return [
    item.title,
    item.artId,
    item.currentVersionId,
    item.privacy,
    item.privacy === 'private' ? 'private приватный' : item.privacy === 'public' ? 'public публичный' : 'unlisted по ссылке',
    item.mode,
    modeLabel(item.mode),
    item.isFavorite ? 'избранное в избранном favorite' : '',
    `${item.grid.wide}x${item.grid.tall}`,
    `${item.grid.wide} ${item.grid.tall}`,
    item.updatedAt,
  ].join(' ').toLocaleLowerCase('ru-RU');
}

function mockUpdatedAt(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function mockCloudArt(input: {
  artId: string;
  title: string;
  wide: number;
  tall: number;
  mode: CompanionLibraryItem['mode'];
  privacy: CompanionLibraryItem['privacy'];
  favorite?: boolean;
  previewUrl?: string | null;
  minutesAgo: number;
}): CompanionLibraryItem {
  return {
    artId: input.artId,
    currentVersionId: `${input.artId}-v1`,
    title: input.title,
    privacy: input.privacy,
    grid: { wide: input.wide, tall: input.tall },
    mode: input.mode,
    previewUrl: input.previewUrl ?? null,
    updatedAt: mockUpdatedAt(input.minutesAgo),
    isFavorite: Boolean(input.favorite),
  };
}

export function CloudArtsPanel({ onClose, onOpenArt, defaultEmail }: CloudArtsPanelProps) {
  const { t } = useLocale();
  const [tab, setTab] = useState<CloudArtTab>('my');
  const [items, setItems] = useState<CompanionLibraryItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [emailCooldownUntil, setEmailCooldownUntil] = useState(0);
  const [emailCooldownNow, setEmailCooldownNow] = useState(Date.now());
  const [favoriteBusyArtId, setFavoriteBusyArtId] = useState<string | null>(null);
  const [trackerBusyArtId, setTrackerBusyArtId] = useState<string | null>(null);
  const useMockCloud = import.meta.env.DEV && new URLSearchParams(window.location.search).get('cloudFolderMock') === '1';
  const emailCooldownRemaining = Math.max(0, Math.ceil((emailCooldownUntil - emailCooldownNow) / 1000));
  const emailCooldownActive = emailCooldownRemaining > 0;

  useEffect(() => {
    if (!emailCooldownActive) return;
    const timer = window.setInterval(() => setEmailCooldownNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [emailCooldownActive]);

  async function load(nextTab = tab) {
    setLoading(true);
    setError(null);
    try {
      if (useMockCloud) {
        const own = [
          mockCloudArt({
            artId: 'mock-editor-neon-rabbit',
            title: 'Neon Rabbit Server Wall',
            wide: 3,
            tall: 2,
            mode: '2d',
            privacy: 'unlisted',
            favorite: true,
            previewUrl: '/examples/logo-flat/mapkluss.png',
            minutesAgo: 16,
          }),
          mockCloudArt({
            artId: 'mock-editor-archive-logo',
            title: 'Archive Logo Draft',
            wide: 1,
            tall: 1,
            mode: '3d',
            privacy: 'private',
            minutesAgo: 140,
          }),
        ];
        const favorite = [
          own[0],
          mockCloudArt({
            artId: 'mock-editor-spawn-banner',
            title: 'Spawn Banner From Link',
            wide: 2,
            tall: 3,
            mode: '2d',
            privacy: 'unlisted',
            favorite: true,
            minutesAgo: 42,
          }),
        ];
        setSignedIn(true);
        setItems(nextTab === 'favorites' ? favorite : nextTab === 'recent' ? [favorite[1], ...own] : own);
        return;
      }
      const user = await getCurrentCompanionAuthUser();
      setSignedIn(Boolean(user));
      if (!user) {
        setItems([]);
        return;
      }
      const nextItems = nextTab === 'favorites'
        ? await listCompanionFavorites()
        : nextTab === 'recent'
          ? await listCompanionRecent()
          : await listCompanionLibrary();
      setItems(nextItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function switchTab(nextTab: CloudArtTab) {
    setTab(nextTab);
    setQuery('');
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  async function sendEmailLink() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || authBusy || emailCooldownActive) return;
    setAuthBusy(true);
    setAuthMessage(null);
    setError(null);
    try {
      await signInWithCompanionEmail(trimmedEmail, window.location.href);
      const nextCooldown = Date.now() + COMPANION_EMAIL_COOLDOWN_MS;
      setEmailCooldownUntil(nextCooldown);
      setEmailCooldownNow(Date.now());
      setAuthMessage(t('Ссылка для входа отправлена. Проверь почту и вернись в редактор.', 'Sign-in link sent. Check your email and return to the editor.'));
    } catch (err) {
      if (isCompanionEmailRateLimitError(err)) {
        const nextCooldown = Date.now() + COMPANION_EMAIL_COOLDOWN_MS;
        setEmailCooldownUntil(nextCooldown);
        setEmailCooldownNow(Date.now());
      }
      setError(normalizeCompanionEmailError(err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function toggleFavorite(item: CompanionLibraryItem) {
    if (favoriteBusyArtId) return;
    const nextFavorite = !item.isFavorite;
    setFavoriteBusyArtId(item.artId);
    setError(null);
    try {
      const confirmedFavorite = useMockCloud
        ? nextFavorite
        : await setCompanionFavorite(item.artId, nextFavorite);
      setItems(currentItems => {
        const updatedItems = currentItems.map(currentItem => currentItem.artId === item.artId
          ? { ...currentItem, isFavorite: confirmedFavorite }
          : currentItem);
        return tab === 'favorites' && !confirmedFavorite
          ? updatedItems.filter(currentItem => currentItem.artId !== item.artId)
          : updatedItems;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFavoriteBusyArtId(null);
    }
  }

  async function openTracker(item: CompanionLibraryItem) {
    if (trackerBusyArtId) return;
    setTrackerBusyArtId(item.artId);
    setError(null);
    try {
      if (useMockCloud) {
        window.open(`/build/mock-${encodeURIComponent(item.artId)}`, '_blank', 'noopener,noreferrer');
        return;
      }
      const session = await getCompanionTrackerForArt(item.artId);
      window.open(`/build/${session.id}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTrackerBusyArtId(null);
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = normalizedQuery
    ? items.filter(item => itemSearchText(item).includes(normalizedQuery.toLocaleLowerCase('ru-RU')))
    : items;
  const resultSummary = query.trim()
    ? `${visibleItems.length}/${items.length}`
    : `${items.length}`;

  return (
    <div className="projects-panel cloud-arts-panel" onClick={onClose} onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className="panel-box" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <span className="panel-title">{t('Папка артов', 'Art folder')}</span>
          <div className="cloud-panel-actions">
            <button className={tab === 'my' ? 'active' : ''} onClick={() => switchTab('my')}>{t('Мои', 'Mine')}</button>
            <button className={tab === 'favorites' ? 'active' : ''} onClick={() => switchTab('favorites')}>{t('Избранное', 'Favorites')}</button>
            <button className={tab === 'recent' ? 'active' : ''} onClick={() => switchTab('recent')}>{t('Недавние', 'Recent')}</button>
            <button className="cloud-panel-icon-btn" onClick={() => void load(tab)} title={t('Обновить список', 'Refresh list')} aria-label={t('Обновить список', 'Refresh list')}>
              <IconGlyph icon={mkIcons.reset} />
            </button>
            <a
              href="/cloud"
              className="cloud-panel-settings"
              target="_blank"
              rel="noopener noreferrer"
              title={t('Открыть облако и настройки мода в новой вкладке', 'Open Cloud and mod settings in a new tab')}
              aria-label={t('Открыть облако и настройки мода в новой вкладке', 'Open Cloud and mod settings in a new tab')}
            >
              {t('Настройки', 'Settings')}
            </a>
            <button className="panel-close-btn" onClick={onClose} title={t('Закрыть', 'Close')}>x</button>
          </div>
        </div>

        <div className="cloud-panel-tools">
          <span>{tabTitle(tab, t)}</span>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('Поиск по названию, размеру, режиму или приватности', 'Search by title, size, mode, or privacy')}
            maxLength={80}
          />
          <button className="cloud-panel-clear" onClick={() => setQuery('')} disabled={!query.trim()}>
            {t('Сброс', 'Reset')}
          </button>
          {signedIn && !loading && <span className="cloud-panel-count">{resultSummary}</span>}
        </div>

        {loading && <div className="projects-empty">{t('Загружаю облако...', 'Loading Cloud...')}</div>}

        {!loading && signedIn === false && (
          <div className="cloud-panel-auth">
            <strong>{t('Вход в облако MapKluss', 'MapKluss Cloud sign-in')}</strong>
            <span>{t('Этот аккаунт будет использоваться в редакторе и в Minecraft-моде.', 'This account will be used in the editor and Minecraft mod.')}</span>
            <div className="cloud-panel-auth-row">
              <input
                value={email}
                onChange={event => setEmail(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && !emailCooldownActive) void sendEmailLink(); }}
                placeholder="email@example.com"
                autoComplete="email"
                type="email"
              />
              <button className="cloud-panel-primary" onClick={() => void sendEmailLink()} disabled={authBusy || !email.trim() || emailCooldownActive}>
                {emailCooldownActive ? t(`Повтор через ${emailCooldownRemaining}с`, `Retry in ${emailCooldownRemaining}s`) : authBusy ? t('Отправляю...', 'Sending...') : t('Войти по почте', 'Sign in by email')}
              </button>
            </div>
            <div className="cloud-panel-auth-links">
              <a
                href="/cloud"
                target="_blank"
                rel="noopener noreferrer"
                title={t('Открыть Telegram и настройки аккаунта в новой вкладке', 'Open Telegram and account settings in a new tab')}
                aria-label={t('Открыть Telegram и настройки аккаунта в новой вкладке', 'Open Telegram and account settings in a new tab')}
              >
                {t('Telegram и настройки аккаунта', 'Telegram and account settings')}
              </a>
            </div>
            {authMessage && <p className="cloud-panel-auth-note">{authMessage}</p>}
          </div>
        )}

        {!loading && signedIn && error && (
          <div className="projects-empty">{error}</div>
        )}

        {!loading && signedIn && !error && visibleItems.length === 0 && (
          <div className="projects-empty">
            {emptyTitle(tab, t)}<br />
            {t('Сохрани арт из редактора или добавь чужой арт в избранное.', 'Save an art from the editor or add someone else’s art to favorites.')}
          </div>
        )}

        {!loading && signedIn && !error && visibleItems.length > 0 && (
          <div className="projects-grid">
            {visibleItems.map(item => (
              <article
                key={`${tab}-${item.artId}`}
                className="project-card cloud-art-card"
              >
                <button
                  className="cloud-art-open"
                  onClick={() => onOpenArt(item.artId)}
                  title={t(`Открыть в редакторе: ${item.title}`, `Open in editor: ${item.title}`)}
                  aria-label={t(`Открыть в редакторе: ${item.title}`, `Open in editor: ${item.title}`)}
                >
                  <div className="card-thumbnail">
                    {item.previewUrl
                      ? <img src={item.previewUrl} alt={item.title} />
                      : <span className="card-thumb-placeholder">{item.grid.wide}x{item.grid.tall}</span>
                    }
                  </div>
                  <div className="card-info">
                    <span className="card-name">{item.title}</span>
                    <span className="card-date">{item.grid.wide}x{item.grid.tall} / {modeLabel(item.mode)} / {relativeDate(item.updatedAt, t)}</span>
                    <span className="card-date">{item.isFavorite ? t('В избранном', 'In favorites') : privacyLabel(item.privacy, t)}</span>
                  </div>
                </button>
                <div className="cloud-art-card-actions">
                  <button
                    className={`cloud-favorite-action${item.isFavorite ? ' is-favorite' : ''}`}
                    onClick={() => void toggleFavorite(item)}
                    disabled={favoriteBusyArtId === item.artId}
                    title={item.isFavorite ? t(`Убрать из избранного: ${item.title}`, `Remove from favorites: ${item.title}`) : t(`Добавить в избранное: ${item.title}`, `Add to favorites: ${item.title}`)}
                    aria-label={item.isFavorite ? t(`Убрать из избранного: ${item.title}`, `Remove from favorites: ${item.title}`) : t(`Добавить в избранное: ${item.title}`, `Add to favorites: ${item.title}`)}
                  >
                    {favoriteBusyArtId === item.artId ? '...' : item.isFavorite ? t('Убрать', 'Remove') : t('В избранное', 'Favorite')}
                  </button>
                  <button
                    onClick={() => void openTracker(item)}
                    disabled={trackerBusyArtId === item.artId}
                    title={t(`Открыть трекер: ${item.title}`, `Open tracker: ${item.title}`)}
                    aria-label={t(`Открыть трекер: ${item.title}`, `Open tracker: ${item.title}`)}
                  >
                    {trackerBusyArtId === item.artId ? '...' : t('Трекер', 'Tracker')}
                  </button>
                  <a
                    href={`/art/${item.artId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t(`Открыть страницу арта: ${item.title}`, `Open art page: ${item.title}`)}
                    aria-label={t(`Открыть страницу арта: ${item.title}`, `Open art page: ${item.title}`)}
                  >
                    {t('Страница', 'Page')}
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
