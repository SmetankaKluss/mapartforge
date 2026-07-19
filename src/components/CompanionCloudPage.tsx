import { useCallback, useEffect, useState } from 'react';
import { COMPANION_EMAIL_COOLDOWN_MS, TELEGRAM_LOGIN_BOT_USERNAME, createCompanionCollection, deleteCompanionAccount, deleteCompanionScanImport, getCompanionCloudOverview, getCompanionScanImport, getCompanionTrackerForArt, getCurrentCompanionAuthUser, isCompanionEmailRateLimitError, isTelegramLoginHostAllowed, linkCompanionTelegram, normalizeCompanionEmailError, signInWithCompanionEmail, signInWithCompanionTelegram, signOutCompanion, unlinkCompanionTelegram } from '../lib/companionCloud';
import type { CompanionCollection, CompanionLibraryItem, CompanionProfileSummary, CompanionScanImport, CompanionUsageSummary, TelegramAuthPayload } from '../lib/companionTypes';
import { useLocale } from '../lib/useLocale';
import { applyPageMeta } from '../lib/meta';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';
import { PublicSiteHeader } from './PublicSiteHeader';

declare global {
  interface Window {
    mapKlussTelegramAuth?: (user: TelegramAuthPayload) => void;
    mapKlussTelegramLogin?: (user: TelegramAuthPayload) => void;
  }
}

function formatStorage(value: number): string {
  const megabytes = value / (1024 * 1024);
  if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(2)} GB`;
  return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
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

function formatImportSource(source: CompanionScanImport['source'], t: (ru: string, en: string) => string): string {
  switch (source) {
    case 'hand':
      return t('Из руки', 'From hand');
    case 'frame':
      return t('Одна рамка', 'Single frame');
    case 'wall':
      return t('Автоскан стены', 'Wall autoscan');
    case 'manual_wall':
      return t('Ручной выбор стены', 'Manual wall selection');
    default:
      return source;
  }
}

function formatMode(mode: CompanionLibraryItem['mode']): string {
  return mode === '3d' ? '3D Stair' : '2D Flat';
}

function formatPrivacy(privacy: CompanionLibraryItem['privacy'], t: (ru: string, en: string) => string): string {
  if (privacy === 'private') return t('Приватный', 'Private');
  if (privacy === 'public') return t('Публичный', 'Public');
  return t('По ссылке', 'Unlisted');
}

function formatShortId(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function artThumbLabel(art: CompanionLibraryItem): string {
  return `${art.grid.wide}x${art.grid.tall}`;
}

function companionPreviewSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:|blob:)/i.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  return null;
}

function usageRatio(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(100, (used / limit) * 100));
}

type ImportFilter = 'all' | 'needs_save' | 'saved' | 'missing_maps';
type LibraryTab = 'arts' | 'favorites' | 'recent';

const COMPANION_MOD_DOWNLOAD_REV = '20260719-large-two-layer';

const COMPANION_MOD_VERSION_OPTIONS = [
  {
    minecraftVersion: '1.21.8',
    label: 'Minecraft 1.21.8',
    badge: 'рекомендуемая',
    href: `/downloads/mod/mapkluss-companion-1.21.8-0.7.0.jar?v=${COMPANION_MOD_DOWNLOAD_REV}`,
    filename: 'mapkluss-companion-1.21.8-0.7.0.jar',
  },
  {
    minecraftVersion: '1.21.11',
    label: 'Minecraft 1.21.11',
    badge: 'новая',
    href: `/downloads/mod/mapkluss-companion-1.21.11-0.7.0.jar?v=${COMPANION_MOD_DOWNLOAD_REV}`,
    filename: 'mapkluss-companion-1.21.11-0.7.0.jar',
  },
] as const;

type CompanionModVersion = typeof COMPANION_MOD_VERSION_OPTIONS[number]['minecraftVersion'];

const COMPANION_MODRINTH_URL = 'https://modrinth.com/mod/mapkluss-companion';
const COMPANION_CURSEFORGE_URL = 'https://www.curseforge.com/minecraft/mc-mods/mapkluss-companion';

function mockUpdatedAt(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function mockLibraryItem(input: {
  artId: string;
  title: string;
  privacy: CompanionLibraryItem['privacy'];
  wide: number;
  tall: number;
  mode: CompanionLibraryItem['mode'];
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
    previewUrl: null,
    updatedAt: mockUpdatedAt(input.minutesAgo),
    isFavorite: Boolean(input.favorite),
  };
}

function importMatchesFilter(item: CompanionScanImport, filter: ImportFilter): boolean {
  switch (filter) {
    case 'needs_save':
      return !item.createdArtId;
    case 'saved':
      return Boolean(item.createdArtId);
    case 'missing_maps':
      return item.missingMaps > 0;
    case 'all':
    default:
      return true;
  }
}

function importStatusChips(item: CompanionScanImport, t: (ru: string, en: string) => string): Array<{ label: string; tone: 'neutral' | 'success' | 'warning' }> {
  const chips: Array<{ label: string; tone: 'neutral' | 'success' | 'warning' }> = [];
  chips.push(item.createdArtId ? { label: t('Сохранено', 'Saved'), tone: 'success' } : { label: t('Нужно сохранить', 'Needs save'), tone: 'neutral' });
  if (item.missingMaps > 0) chips.push({ label: t(`Нет карт: ${item.missingMaps}`, `Missing maps: ${item.missingMaps}`), tone: 'warning' });
  return chips;
}

function matchesLibraryQuery(item: CompanionLibraryItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    item.title,
    item.mode,
    formatMode(item.mode),
    item.privacy,
    item.privacy === 'private' ? 'private приватный' : item.privacy === 'public' ? 'public публичный' : 'unlisted по ссылке',
    `${item.grid.wide}x${item.grid.tall}`,
    item.isFavorite ? 'favorite' : '',
    item.isFavorite ? 'избранное' : '',
  ].join(' ').toLowerCase();
  return haystack.includes(normalized);
}

function TelegramLinkCard(props: {
  profile: CompanionProfileSummary | null;
  onProfileChange: (profile: CompanionProfileSummary) => void;
  onError: (message: string | null) => void;
}) {
  const { t } = useLocale();
  const { profile, onProfileChange, onError } = props;
  const [busy, setBusy] = useState(false);
  const widgetHostId = 'mapkluss-telegram-widget';
  const telegramLinked = Boolean(profile?.telegramId);
  const telegramEnabled = Boolean(TELEGRAM_LOGIN_BOT_USERNAME);
  const telegramDomainAllowed = isTelegramLoginHostAllowed();

  const handleTelegramAuth = useCallback(async (auth: TelegramAuthPayload) => {
    setBusy(true);
    onError(null);
    try {
      onProfileChange(await linkCompanionTelegram(auth));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [onError, onProfileChange]);

  useEffect(() => {
    if (!telegramEnabled || telegramLinked || !telegramDomainAllowed) return;
    window.mapKlussTelegramAuth = (user) => { void handleTelegramAuth(user); };
    const host = document.getElementById(widgetHostId);
    if (!host) return;
    host.innerHTML = '';
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', TELEGRAM_LOGIN_BOT_USERNAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-onauth', 'mapKlussTelegramAuth(user)');
    host.appendChild(script);
    return () => {
      if (window.mapKlussTelegramAuth) delete window.mapKlussTelegramAuth;
      host.innerHTML = '';
    };
  }, [handleTelegramAuth, telegramDomainAllowed, telegramEnabled, telegramLinked]);

  async function unlinkTelegram() {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      onProfileChange(await unlinkCompanionTelegram());
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="companion-panel">
      <h2>Telegram</h2>
      {telegramLinked ? (
        <>
          <p className="companion-muted">
            {t('Привязан', 'Linked')} {profile?.telegramUsername ? `@${profile.telegramUsername}` : `Telegram ID ${profile?.telegramId}`}.
          </p>
          <div className="companion-actions">
            <button onClick={() => void unlinkTelegram()} disabled={busy}>
              {busy ? t('Отвязываю...', 'Unlinking...') : t('Отвязать Telegram', 'Unlink Telegram')}
            </button>
          </div>
        </>
      ) : telegramEnabled && telegramDomainAllowed ? (
        <>
          <p className="companion-muted">{t('Привяжи Telegram к этому профилю. Мод всё равно входит через код устройства, а основной вход на сайте остаётся через почту.', 'Link Telegram to this profile. The mod still signs in through a device code, while the main site login remains email-based.')}</p>
          <div id={widgetHostId} className="companion-telegram-widget" />
          {busy && <p className="companion-muted">{t('Проверяю Telegram...', 'Checking Telegram...')}</p>}
        </>
      ) : (
        <p className="companion-muted">{t('Telegram можно привязать после входа на официальном сайте MapKluss.', 'Telegram can be linked after signing in on the official MapKluss site.')}</p>
      )}
    </section>
  );
}

function TelegramLoginCard(props: {
  onLoggedIn: () => void;
  onError: (message: string | null) => void;
}) {
  const { t } = useLocale();
  const { onLoggedIn, onError } = props;
  const [busy, setBusy] = useState(false);
  const widgetHostId = 'mapkluss-telegram-login-widget';
  const telegramEnabled = Boolean(TELEGRAM_LOGIN_BOT_USERNAME);
  const telegramDomainAllowed = isTelegramLoginHostAllowed();

  const handleTelegramLogin = useCallback(async (auth: TelegramAuthPayload) => {
    setBusy(true);
    onError(null);
    try {
      await signInWithCompanionTelegram(auth);
      onLoggedIn();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [onError, onLoggedIn]);

  useEffect(() => {
    if (!telegramEnabled || !telegramDomainAllowed) return;
    window.mapKlussTelegramLogin = (user) => { void handleTelegramLogin(user); };
    const host = document.getElementById(widgetHostId);
    if (!host) return;
    host.innerHTML = '';
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', TELEGRAM_LOGIN_BOT_USERNAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-onauth', 'mapKlussTelegramLogin(user)');
    host.appendChild(script);
    return () => {
      if (window.mapKlussTelegramLogin) delete window.mapKlussTelegramLogin;
      host.innerHTML = '';
    };
  }, [handleTelegramLogin, telegramDomainAllowed, telegramEnabled]);

  return (
    <div className="companion-telegram-login">
      <div className="companion-section-head">
        <div>
          <h3>Telegram</h3>
          <p className="companion-muted">
            {telegramEnabled
              ? t('Если Telegram уже привязан к аккаунту, можно войти без письма.', 'If Telegram is already linked to your account, you can sign in without email.')
              : t('Пока используй вход по почте.', 'Use email login for now.')}
          </p>
        </div>
      </div>
      {telegramEnabled && telegramDomainAllowed ? (
        <>
          <div id={widgetHostId} className="companion-telegram-widget" />
          {busy && <p className="companion-muted">{t('Вхожу через Telegram...', 'Signing in with Telegram...')}</p>}
        </>
      ) : (
        <p className="companion-muted">{t('Пока используй вход по почте.', 'Use email login for now.')}</p>
      )}
    </div>
  );
}

function CompanionModDownloadPanel({
  selectedVersion,
  onSelectedVersionChange,
}: {
  selectedVersion: CompanionModVersion;
  onSelectedVersionChange: (version: CompanionModVersion) => void;
}) {
  const { t } = useLocale();
  const selected = COMPANION_MOD_VERSION_OPTIONS.find(option => option.minecraftVersion === selectedVersion)
    ?? COMPANION_MOD_VERSION_OPTIONS[0];

  return (
    <section className="companion-panel companion-mod-download-panel">
      <div className="companion-mod-download-copy">
        <strong>{t('Скачать мод', 'Download mod')}</strong>
        <small>Fabric / Java 21</small>
      </div>
      <label className="companion-mod-version-field">
        <span>{t('Версия', 'Version')}</span>
        <select
          value={selected.minecraftVersion}
          onChange={event => onSelectedVersionChange(event.target.value as CompanionModVersion)}
          aria-label={t('Версия Minecraft для Fabric', 'Minecraft version for Fabric')}
        >
          {COMPANION_MOD_VERSION_OPTIONS.map(option => (
            <option key={option.minecraftVersion} value={option.minecraftVersion}>
              Fabric {option.minecraftVersion}
            </option>
          ))}
        </select>
      </label>
      <div className="companion-mod-download-actions">
        <a className="companion-primary-download" href={selected.href} download={selected.filename}>
          {t('Скачать', 'Download')}
        </a>
        <div className="companion-mod-market-links" aria-label={t('Площадки мода', 'Mod platforms')}>
          <a href={COMPANION_MODRINTH_URL} target="_blank" rel="noopener noreferrer">Modrinth</a>
          <a href={COMPANION_CURSEFORGE_URL} target="_blank" rel="noopener noreferrer">CurseForge</a>
        </div>
      </div>
    </section>
  );
}

function CompanionArtThumb({ art }: { art: CompanionLibraryItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const previewSrc = imageFailed ? null : companionPreviewSrc(art.previewUrl);

  return (
    <>
      {previewSrc ? (
        <img
          src={previewSrc}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="companion-art-thumb-placeholder">{artThumbLabel(art)}</span>
      )}
    </>
  );
}

export function CompanionCloudPage() {
  const { lang, toggle, t } = useLocale();
  const dateLocale = lang === 'en' ? 'en-US' : 'ru-RU';
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<CompanionProfileSummary | null>(null);
  const [usage, setUsage] = useState<CompanionUsageSummary | null>(null);
  const [arts, setArts] = useState<CompanionLibraryItem[]>([]);
  const [favorites, setFavorites] = useState<CompanionLibraryItem[]>([]);
  const [recent, setRecent] = useState<CompanionLibraryItem[]>([]);
  const [collections, setCollections] = useState<CompanionCollection[]>([]);
  const [imports, setImports] = useState<CompanionScanImport[]>([]);
  const [importFilter, setImportFilter] = useState<ImportFilter>('all');
  const [scanImport, setScanImport] = useState<CompanionScanImport | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailCooldownUntil, setEmailCooldownUntil] = useState(0);
  const [emailCooldownNow, setEmailCooldownNow] = useState(Date.now());
  const [selectedModVersion, setSelectedModVersion] = useState<CompanionModVersion>('1.21.8');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('arts');
  const [trackerArtId, setTrackerArtId] = useState<string | null>(null);
  const [deletingImportId, setDeletingImportId] = useState<string | null>(null);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('deleteConfirmPreview') === '1',
  );
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = new URLSearchParams(window.location.search);
  const importId = searchParams.get('import');
  const useMockCloud = import.meta.env.DEV && searchParams.get('cloudMock') === '1';
  const emailCooldownRemaining = Math.max(0, Math.ceil((emailCooldownUntil - emailCooldownNow) / 1000));
  const emailCooldownActive = emailCooldownRemaining > 0;
  const libraryArtCount = new Set([...arts, ...favorites].map(item => item.artId)).size;

  useEffect(() => {
    applyPageMeta({
      title: t('Облако и MapKluss Companion | MapKluss', 'Cloud and MapKluss Companion | MapKluss'),
      description: t('Аккаунт, арты, коллекции, импорты и подключение Minecraft Companion.', 'Account, arts, collections, imports, and Minecraft Companion connection.'),
      robots: 'noindex,nofollow',
    });
  }, [t]);

  useEffect(() => {
    if (!emailCooldownActive) return;
    const timer = window.setInterval(() => setEmailCooldownNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [emailCooldownActive]);
  const filteredImports = imports.filter(item => importMatchesFilter(item, importFilter));
  const filteredArts = arts.filter(item => matchesLibraryQuery(item, libraryQuery));
  const filteredFavorites = favorites.filter(item => matchesLibraryQuery(item, libraryQuery));
  const filteredRecent = recent.filter(item => matchesLibraryQuery(item, libraryQuery));
  const activeLibraryItems = libraryTab === 'favorites'
    ? filteredFavorites
    : libraryTab === 'recent'
      ? filteredRecent
      : filteredArts;
  const activeLibraryEmpty = libraryTab === 'favorites'
    ? t('В избранном пока нет артов.', 'There are no favorite arts yet.')
    : libraryTab === 'recent'
      ? t('Недавних артов пока нет.', 'There are no recent arts yet.')
      : t('В облаке пока нет артов.', 'There are no cloud arts yet.');
  const deleteConfirmValid = ['УДАЛИТЬ', 'DELETE'].includes(deleteConfirmText.trim().toLocaleUpperCase('ru-RU'));

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

  async function deleteScanImport(importIdToDelete: string) {
    if (deletingImportId) return;
    setDeletingImportId(importIdToDelete);
    setError(null);
    try {
      if (!useMockCloud) {
        await deleteCompanionScanImport(importIdToDelete);
      }
      setImports(current => current.filter(item => item.importId !== importIdToDelete));
      if (scanImport?.importId === importIdToDelete) setScanImport(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingImportId(null);
    }
  }

  function renderArtRows(items: CompanionLibraryItem[], emptyCopy: string) {
    return (
      <>
        {items.length === 0 ? (
          <p className="companion-muted">{libraryQuery.trim() ? t('По этому поиску ничего не найдено.', 'Nothing matched this search.') : emptyCopy}</p>
        ) : items.map(art => (
          <article className="companion-art companion-library-art" key={`${libraryTab}-${art.artId}`}>
            <a className="companion-art-thumb" href={`/art/${art.artId}`} aria-label={t(`Открыть арт ${art.title}`, `Open art ${art.title}`)}>
              <CompanionArtThumb art={art} />
            </a>
            <div className="companion-import-copy">
              <strong>{art.title}</strong>
              <div className="companion-art-meta" aria-label={t('Параметры арта', 'Art details')}>
                <span>{art.grid.wide}x{art.grid.tall} {t('карт', 'maps')}</span>
                <span>{formatMode(art.mode)}</span>
                <span>{formatPrivacy(art.privacy, t)}</span>
              </div>
              <div className="companion-import-meta">
                <span>{art.isFavorite ? t('Избранное', 'Favorite') : t('Библиотека', 'Library')}</span>
                <span>{t('Обновлено', 'Updated')} {formatDateTime(art.updatedAt, dateLocale)}</span>
              </div>
            </div>
            <div className="companion-actions companion-art-actions">
              <a className="companion-action-link" href={`/art/${art.artId}`}>{t('Страница', 'Page')}</a>
              <a className="companion-action-link" href={`/?art=${art.artId}`}>{t('Редактор', 'Editor')}</a>
              <button onClick={() => void openTracker(art.artId)} disabled={trackerArtId === art.artId}>
                {trackerArtId === art.artId ? t('Открываю...', 'Opening...') : t('Трекер', 'Tracker')}
              </button>
            </div>
          </article>
        ))}
      </>
    );
  }

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (useMockCloud) {
        const ownArt = mockLibraryItem({
          artId: 'mock-neon-rabbit',
          title: 'Neon Rabbit Server Wall',
          privacy: 'unlisted',
          wide: 3,
          tall: 2,
          mode: '2d',
          favorite: true,
          minutesAgo: 18,
        });
        const privateArt = mockLibraryItem({
          artId: 'mock-archive-logo',
          title: 'Archive Logo Draft',
          privacy: 'private',
          wide: 1,
          tall: 1,
          mode: '3d',
          minutesAgo: 145,
        });
        const favoriteArt = mockLibraryItem({
          artId: 'mock-spawn-banner',
          title: 'Spawn Banner From Link',
          privacy: 'unlisted',
          wide: 2,
          tall: 3,
          mode: '2d',
          favorite: true,
          minutesAgo: 42,
        });
        const mockImport: CompanionScanImport = {
          importId: 'mock-import-wall',
          source: 'wall',
          title: 'Скан стены с сервера',
          mapGrid: { wide: 2, tall: 2 },
          imagePath: 'mock/import-wall.png',
          sizeBytes: 384 * 1024,
          sha256: 'mock-sha256',
          createdArtId: null,
          metadata: {},
          missingMaps: 1,
          createdAt: mockUpdatedAt(65),
        };
        setUserId('mock-user-1234567890abcdef');
        setUserEmail('builder@example.com');
        setProfile({
          userId: 'mock-user-1234567890abcdef',
          displayName: 'Builder Preview',
          avatarUrl: null,
          telegramId: '123456789',
          telegramUsername: 'map_builder',
        });
        setUsage({
          artCount: 2,
          artLimit: 100,
          storageUsedBytes: 42 * 1024 * 1024,
          storageLimitBytes: 250 * 1024 * 1024,
        });
        setArts([ownArt, privateArt]);
        setFavorites([ownArt, favoriteArt]);
        setRecent([favoriteArt, ownArt, privateArt]);
        setCollections([{
          id: 'mock-collection-server',
          name: 'Серверные стены',
          createdAt: mockUpdatedAt(500),
          updatedAt: mockUpdatedAt(20),
          itemCount: 3,
        }]);
        setImports([mockImport]);
        setScanImport(importId ? mockImport : null);
        return;
      }
      const user = await getCurrentCompanionAuthUser();
      setUserId(user?.userId ?? null);
      setUserEmail(user?.email ?? null);
      if (user) {
        const overview = await getCompanionCloudOverview();
        setProfile(overview.profile);
        setUsage(overview.usage);
        setArts(overview.arts);
        setFavorites(overview.favorites);
        setRecent(overview.recent);
        setCollections(overview.collections);
        setImports(overview.imports);
        setScanImport(importId ? await getCompanionScanImport(importId) : null);
      } else {
        setProfile(null);
        setUsage(null);
        setArts([]);
        setFavorites([]);
        setRecent([]);
        setCollections([]);
        setImports([]);
        setScanImport(null);
        setUserEmail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [importId, useMockCloud]);

  useEffect(() => { void reload(); }, [reload]);

  async function createCollection() {
    const name = newCollectionName.trim();
    if (!name || creatingCollection) return;
    setCreatingCollection(true);
    setError(null);
    try {
      const collection = await createCompanionCollection(name);
      setCollections(current => [collection, ...current]);
      setNewCollectionName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingCollection(false);
    }
  }

  async function deleteAccount() {
    if (deletingAccount) return;
    if (!deleteConfirmValid) {
      setDeleteConfirmOpen(true);
      return;
    }
    setDeletingAccount(true);
    setError(null);
    try {
      if (!useMockCloud) {
        await deleteCompanionAccount();
      }
      setUserId(null);
      setUserEmail(null);
      setProfile(null);
      setUsage(null);
      setArts([]);
      setFavorites([]);
      setRecent([]);
      setCollections([]);
      setImports([]);
      setScanImport(null);
      setDeleteConfirmText('');
      setDeleteConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingAccount(false);
    }
  }

  async function signInEmail() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || emailCooldownActive) return;
    setBusy(true);
    setError(null);
    setEmailSent(false);
    try {
      await signInWithCompanionEmail(trimmedEmail, window.location.href);
      const nextCooldown = Date.now() + COMPANION_EMAIL_COOLDOWN_MS;
      setEmailCooldownUntil(nextCooldown);
      setEmailCooldownNow(Date.now());
      setEmailSent(true);
    } catch (err) {
      if (isCompanionEmailRateLimitError(err)) {
        const nextCooldown = Date.now() + COMPANION_EMAIL_COOLDOWN_MS;
        setEmailCooldownUntil(nextCooldown);
        setEmailCooldownNow(Date.now());
      }
      setError(normalizeCompanionEmailError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-shell companion-shell companion-cloud-shell">
      <PublicSiteHeader active="cloud" lang={lang} onToggleLanguage={toggle} />

      <main className="companion-page companion-cloud-workbench">
        <header className="companion-header companion-workbench-header">
          <div>
            <h1>{t('Облако и мод', 'Cloud and mod')}</h1>
            <p>{t('Аккаунт MapKluss, папка артов, мод Minecraft Companion, импорты и коллекции.', 'MapKluss account, art folder, Minecraft Companion mod, imports, and collections.')}</p>
          </div>
          <div className="companion-workbench-status" aria-label={t('Статус облака', 'Cloud status')}>
            <span>{userId ? t('Вход выполнен', 'Signed in') : t('Вход не выполнен', 'Signed out')}</span>
            <strong>{userId ? (userEmail ?? t('Аккаунт MapKluss', 'MapKluss account')) : t('Гостевой режим', 'Guest mode')}</strong>
          </div>
        </header>

      {!userId ? (
        <section className="companion-cloud-guest" aria-labelledby="cloud-guest-title">
          <div className="companion-guest-overview">
            <div className="companion-guest-purpose">
              <IconGlyph icon={mkIcons.cloud} />
              <span>{t('Единый аккаунт MapKluss', 'One MapKluss account')}</span>
            </div>
            <h2 id="cloud-guest-title">{t('Продолжай арт между браузером и Minecraft', 'Continue your art between the browser and Minecraft')}</h2>
            <p className="companion-guest-lead">
              {t('Войди один раз, чтобы сохранять проекты, открывать их в моде и не терять прогресс стройки.', 'Sign in once to save projects, open them in the mod, and keep your build progress in sync.')}
            </p>

            <ol className="companion-guest-flow">
              <li>
                <span className="companion-guest-flow__icon"><IconGlyph icon={mkIcons.projectEditor} /></span>
                <div>
                  <strong>{t('Создай в редакторе', 'Create in the editor')}</strong>
                  <span>{t('Настрой палитру, дизеринг и размер карты.', 'Tune the palette, dithering, and map size.')}</span>
                </div>
              </li>
              <li>
                <span className="companion-guest-flow__icon"><IconGlyph icon={mkIcons.cloud} /></span>
                <div>
                  <strong>{t('Сохрани в облако', 'Save to Cloud')}</strong>
                  <span>{t('Версии, избранное и коллекции останутся в одном профиле.', 'Keep versions, favorites, and collections in one profile.')}</span>
                </div>
              </li>
              <li>
                <span className="companion-guest-flow__icon"><IconGlyph icon={mkIcons.map} /></span>
                <div>
                  <strong>{t('Продолжи в Minecraft', 'Continue in Minecraft')}</strong>
                  <span>{t('Companion покажет арты, схемы, материалы и трекер стройки.', 'Companion brings your art, schematics, materials, and build tracker into the game.')}</span>
                </div>
              </li>
            </ol>

            <div className="companion-guest-actions">
              <a className="public-action public-action--primary" href="/"><IconGlyph icon={mkIcons.projectEditor} /> {t('Открыть редактор', 'Open editor')}</a>
              <a className="public-action" href="/device"><IconGlyph icon={mkIcons.login} /> {t('Подключить мод', 'Connect mod')}</a>
            </div>
          </div>

          <div className="companion-guest-access">
            <section className="companion-panel companion-login-primary" id="cloud-sign-in">
              <div className="companion-guest-auth-title">
                <span className="companion-guest-auth-icon"><IconGlyph icon={mkIcons.login} /></span>
                <div>
                  <h2>{t('Войти в MapKluss', 'Sign in to MapKluss')}</h2>
                  <p className="companion-muted">{t('Пароль не нужен — пришлём одноразовую ссылку на почту.', 'No password needed—we will send a one-time link to your email.')}</p>
                </div>
              </div>
              <label className="companion-field">
              <span>{t('Электронная почта', 'Email address')}</span>
              <div className="companion-inline-form">
                <input
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter' && !emailCooldownActive) void signInEmail(); }}
                  placeholder="email@example.com"
                  type="email"
                  autoComplete="email"
                />
                <button onClick={() => void signInEmail()} disabled={busy || !email.trim() || emailCooldownActive}>
                  {emailCooldownActive ? t(`Повтор через ${emailCooldownRemaining}с`, `Retry in ${emailCooldownRemaining}s`) : t('Отправить ссылку', 'Send link')}
                </button>
              </div>
            </label>
              <p className="companion-guest-auth-note"><IconGlyph icon={mkIcons.lock} /> {t('Ссылка одноразовая и ведёт обратно на MapKluss.', 'The link is single-use and returns you directly to MapKluss.')}</p>
            <TelegramLoginCard onLoggedIn={() => { void reload(); }} onError={setError} />
            {emailSent && <p className="companion-status" role="status">{t('Проверь почту и открой ссылку для входа.', 'Check your email and open the sign-in link.')}</p>}
            {error && <p className="companion-status companion-status--error companion-login-error" role="alert">{error}</p>}
            </section>

            <CompanionModDownloadPanel
              selectedVersion={selectedModVersion}
              onSelectedVersionChange={setSelectedModVersion}
            />
          </div>
        </section>
      ) : (
        <>
          <section className="companion-panel companion-cloud-flow-panel">
            <div className="companion-editor-banner-copy">
              <strong>{t('Рабочий поток MapKluss', 'MapKluss workflow')}</strong>
              <span>{t('Создавай арт в редакторе, сохраняй его в папку, а мод подтянет избранное, схемы и прогресс стройки.', 'Create art in the editor, save it to your folder, and the mod will sync favorites, schematics, and build progress.')}</span>
            </div>
            <div className="companion-workflow-actions">
              <a href="/">{t('Редактор', 'Editor')}</a>
              <a href="/?cloudFolder=1">{t('Папка артов', 'Art folder')}</a>
              <a href="/device">{t('Вход мода', 'Mod login')}</a>
            </div>
          </section>

          <section className="companion-cloud-layout">
            <aside className="companion-cloud-rail">
          <section className="companion-panel companion-account-bar companion-cloud-account-panel">
            <div className="companion-account-identity">
              <h2>{t('Аккаунт', 'Account')}</h2>
              {userEmail && <p className="companion-muted">{userEmail}</p>}
              <p className="companion-muted companion-user-id" title={userId}>{t('Профиль', 'Profile')}: {formatShortId(userId)}</p>
              {profile?.displayName && profile.displayName !== userEmail && <p className="companion-muted">{profile.displayName}</p>}
            </div>
            <div className="companion-account-methods" aria-label="Connected auth methods">
              <span>{t('Почта', 'Email')}</span>
              <span className={profile?.telegramId ? 'is-linked' : 'is-muted'}>Telegram</span>
            </div>
            <div className="companion-actions">
              <button onClick={() => void reload()}>{t('Обновить', 'Refresh')}</button>
              <button onClick={() => void signOutCompanion().then(reload)}>{t('Выйти', 'Sign out')}</button>
            </div>
          </section>
          <CompanionModDownloadPanel
            selectedVersion={selectedModVersion}
            onSelectedVersionChange={setSelectedModVersion}
          />
            </aside>

            <div className="companion-cloud-main">

          <section className="companion-panel companion-mod-panel">
            <div className="companion-section-head">
              <div>
                <h2>{t('Мод Minecraft', 'Minecraft mod')}</h2>
                <p className="companion-muted">{t('Сессия мода, сканы из игры, папка сохранённых артов и синхронизация файлов.', 'Mod session, in-game scans, saved art folder, and file sync.')}</p>
              </div>
            </div>
            <div className="companion-mod-grid">
              <article>
                <span>{t('Вход', 'Login')}</span>
                <strong>{t('Код', 'Code')}</strong>
                <small>{t('Почта / Telegram', 'Email / Telegram')}</small>
              </article>
              <article>
                <span>{t('Библиотека', 'Library')}</span>
                <strong>{libraryArtCount}</strong>
                <small>{t('уникальных артов', 'unique arts')}</small>
              </article>
              <article>
                <span>{t('Импорты', 'Imports')}</span>
                <strong>{imports.length}</strong>
                <small>{t('сканы из Minecraft', 'Minecraft scans')}</small>
              </article>
              <article>
                <span>{t('Файлы', 'Files')}</span>
                <strong>Litematic</strong>
                <small>{t('установлены из мода', 'installed by mod')}</small>
              </article>
            </div>
          </section>

          {usage && (
            <section className="companion-summary-strip">
              <div className="companion-summary-card">
                <span>{t('Арты', 'Arts')}</span>
                <strong>{usage.artCount} / {usage.artLimit}</strong>
                <div className="companion-usage-bar" aria-hidden="true">
                  <span style={{ width: `${usageRatio(usage.artCount, usage.artLimit)}%` }} />
                </div>
              </div>
              <div className="companion-summary-card">
                <span>{t('Хранилище', 'Storage')}</span>
                <strong>{formatStorage(usage.storageUsedBytes)} / {formatStorage(usage.storageLimitBytes)}</strong>
                <div className="companion-usage-bar" aria-hidden="true">
                  <span style={{ width: `${usageRatio(usage.storageUsedBytes, usage.storageLimitBytes)}%` }} />
                </div>
              </div>
              <div className="companion-summary-card">
                <span>{t('Коллекции', 'Collections')}</span>
                <strong>{collections.length}</strong>
              </div>
              <div className="companion-summary-card">
                <span>{t('Импорты', 'Imports')}</span>
                <strong>{imports.length}</strong>
              </div>
            </section>
          )}

          {scanImport && (
            <section className="companion-panel companion-import-card">
              <div className="companion-import-copy">
                <h2>{t('Импортированный скан', 'Imported scan')}</h2>
                <p className="companion-muted">
                  {scanImport.title}
                </p>
                <div className="companion-import-meta">
                  <span>{scanImport.mapGrid.wide}x{scanImport.mapGrid.tall}</span>
                  <span>{formatImportSource(scanImport.source, t)}</span>
                  <span>{formatBytes(scanImport.sizeBytes)}</span>
                  <span>{formatDateTime(scanImport.createdAt, dateLocale)}</span>
                </div>
                <div className="companion-chip-row">
                  {importStatusChips(scanImport, t).map(chip => (
                    <span key={`${scanImport.importId}-${chip.label}`} className={`companion-chip companion-chip-${chip.tone}`}>{chip.label}</span>
                  ))}
                </div>
                {scanImport.missingMaps > 0 && (
                  <p className="companion-warning">
                    {t(`В этом скане не хватает карт: ${scanImport.missingMaps}.`, `This scan is missing maps: ${scanImport.missingMaps}.`)}
                  </p>
                )}
              </div>
              {scanImport.signedUrl && (
                <img className="companion-import-preview" src={scanImport.signedUrl} alt={scanImport.title} />
              )}
              <div className="companion-actions">
                <a className="companion-action-link" href={`/?companionImport=${encodeURIComponent(scanImport.importId)}`}>
                  {scanImport.createdArtId ? t('Обновить в редакторе', 'Update in editor') : t('Сохранить в редакторе', 'Save in editor')}
                </a>
                {scanImport.createdArtId && <a className="companion-action-link" href={`/art/${scanImport.createdArtId}`}>{t('Открыть арт', 'Open art')}</a>}
                {scanImport.signedUrl && <a className="companion-action-link" href={scanImport.signedUrl}>{t('Скачать PNG', 'Download PNG')}</a>}
              </div>
            </section>
          )}

          <section className="companion-panel companion-library-panel">
            <div className="companion-section-head">
              <div>
                <h2>{t('Библиотека для мода', 'Mod library')}</h2>
                <p className="companion-muted">
                  {t('Здесь лежат арты, которые видит Minecraft Companion. Создавать и обновлять арт лучше прямо из редактора.', 'These are the arts visible to Minecraft Companion. Create and update art directly from the editor.')}
                </p>
                <p className="companion-muted">
                  {t(`Найдено: ${filteredArts.length} своих / ${filteredFavorites.length} избранных / ${filteredRecent.length} недавних.`, `Found: ${filteredArts.length} own / ${filteredFavorites.length} favorites / ${filteredRecent.length} recent.`)}
                </p>
              </div>
              <div className="companion-tab-row">
                <button className={libraryTab === 'arts' ? 'is-active' : ''} aria-pressed={libraryTab === 'arts'} onClick={() => setLibraryTab('arts')}>{t('Мои арты', 'My arts')}</button>
                <button className={libraryTab === 'favorites' ? 'is-active' : ''} aria-pressed={libraryTab === 'favorites'} onClick={() => setLibraryTab('favorites')}>{t('Избранное', 'Favorites')}</button>
                <button className={libraryTab === 'recent' ? 'is-active' : ''} aria-pressed={libraryTab === 'recent'} onClick={() => setLibraryTab('recent')}>{t('Недавние', 'Recent')}</button>
              </div>
            </div>
            <label className="companion-field">
              <span>{t('Поиск в библиотеке', 'Search library')}</span>
              <div className="companion-inline-form">
                <input
                  value={libraryQuery}
                  onChange={event => setLibraryQuery(event.target.value)}
                  placeholder={t('Название, размер или режим', 'Title, size, or mode')}
                  maxLength={80}
                  type="search"
                />
                {libraryQuery && <button onClick={() => setLibraryQuery('')}>{t('Очистить', 'Clear')}</button>}
              </div>
            </label>
            <div className="companion-list">
              {renderArtRows(activeLibraryItems, activeLibraryEmpty)}
            </div>
          </section>

          <section className="companion-grid companion-secondary-grid">
            <div className="companion-panel">
              <h2>{t('Коллекции', 'Collections')}</h2>
              <label className="companion-field">
                <span>{t('Название новой коллекции', 'New collection name')}</span>
                <div className="companion-inline-form">
                  <input value={newCollectionName} onChange={event => setNewCollectionName(event.target.value)} placeholder={t('Например, стены сервера', 'For example, server walls')} maxLength={80} />
                  <button onClick={() => void createCollection()} disabled={creatingCollection || !newCollectionName.trim()}>{t('Создать', 'Create')}</button>
                </div>
              </label>
              {collections.length === 0 ? (
                <p className="companion-muted">{t('Коллекций пока нет.', 'There are no collections yet.')}</p>
              ) : collections.map(collection => (
                <article className="companion-art" key={collection.id}>
                  <strong>{collection.name}</strong>
                  <span>
                    {t('Артов', 'Arts')}: {(collection.itemCount ?? 0)} / {new Date(collection.updatedAt).toLocaleDateString(dateLocale)}
                  </span>
                  <a href={`/collection/${collection.id}`}>{t('открыть', 'open')}</a>
                </article>
              ))}
            </div>

            <div className="companion-panel">
              <h2>{t('Последние импорты', 'Recent imports')}</h2>
              <div className="companion-filter-row">
                <button className={importFilter === 'all' ? 'is-active' : ''} aria-pressed={importFilter === 'all'} onClick={() => setImportFilter('all')}>{t('Все', 'All')}</button>
                <button className={importFilter === 'needs_save' ? 'is-active' : ''} aria-pressed={importFilter === 'needs_save'} onClick={() => setImportFilter('needs_save')}>{t('Нужно сохранить', 'Needs save')}</button>
                <button className={importFilter === 'saved' ? 'is-active' : ''} aria-pressed={importFilter === 'saved'} onClick={() => setImportFilter('saved')}>{t('Сохранённые', 'Saved')}</button>
                <button className={importFilter === 'missing_maps' ? 'is-active' : ''} aria-pressed={importFilter === 'missing_maps'} onClick={() => setImportFilter('missing_maps')}>{t('Нет карт', 'Missing maps')}</button>
              </div>
              {imports.length === 0 ? (
                <p className="companion-muted">{t('Сканов из мода пока нет.', 'There are no mod scans yet.')}</p>
              ) : filteredImports.length === 0 ? (
                <p className="companion-muted">{t('Под этот фильтр ничего не подходит.', 'Nothing matches this filter.')}</p>
              ) : filteredImports.map(item => (
                <article className="companion-art companion-import-list-item" key={item.importId}>
                  <div className="companion-import-copy">
                    <strong>{item.title}</strong>
                    <span>{item.mapGrid.wide}x{item.mapGrid.tall} / {formatImportSource(item.source, t)}</span>
                    <div className="companion-import-meta">
                      <span>{formatBytes(item.sizeBytes)}</span>
                      <span>{formatDateTime(item.createdAt, dateLocale)}</span>
                    </div>
                    <div className="companion-chip-row">
                      {importStatusChips(item, t).map(chip => (
                        <span key={`${item.importId}-${chip.label}`} className={`companion-chip companion-chip-${chip.tone}`}>{chip.label}</span>
                      ))}
                    </div>
                  </div>
                  <div className="companion-actions">
                    <a className="companion-action-link" href={`/cloud?import=${encodeURIComponent(item.importId)}`}>{t('Детали', 'Details')}</a>
                    <a className="companion-action-link" href={`/?companionImport=${encodeURIComponent(item.importId)}`}>
                      {item.createdArtId ? t('Редактировать', 'Edit') : t('Сохранить', 'Save')}
                    </a>
                    {item.createdArtId && <a className="companion-action-link" href={`/art/${item.createdArtId}`}>{t('Открыть арт', 'Open art')}</a>}
                    <button
                      className="companion-danger-mini"
                      onClick={() => void deleteScanImport(item.importId)}
                      disabled={deletingImportId === item.importId}
                      title={t('Удалить импортированный скан', 'Delete imported scan')}
                      aria-label={t(`Удалить импорт ${item.title}`, `Delete import ${item.title}`)}
                    >
                      {deletingImportId === item.importId ? '...' : t('Удалить', 'Delete')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="companion-grid companion-secondary-grid">
            <TelegramLinkCard profile={profile} onProfileChange={setProfile} onError={setError} />

            <section className="companion-panel companion-danger-zone">
              <div>
                <h2>{t('Удалить аккаунт/данные', 'Delete account/data')}</h2>
                <p className="companion-muted">{t('Навсегда удаляет облачные арты, избранное, коллекции, импорты, сессии мода, файлы в хранилище и аккаунт.', 'Permanently deletes cloud arts, favorites, collections, imports, mod sessions, stored files, and the account.')}</p>
              </div>
              {!deleteConfirmOpen ? (
                <button className="companion-danger-button" onClick={() => setDeleteConfirmOpen(true)} disabled={deletingAccount}>
                  {t('Удалить', 'Delete')}
                </button>
              ) : (
                <div className="companion-delete-confirm">
                  <label>
                    <span>{t('Для подтверждения напиши УДАЛИТЬ', 'Type DELETE to confirm')}</span>
                    <input
                      value={deleteConfirmText}
                      onChange={event => setDeleteConfirmText(event.target.value)}
                      onKeyDown={event => { if (event.key === 'Enter' && deleteConfirmValid) void deleteAccount(); }}
                      placeholder={t('УДАЛИТЬ', 'DELETE')}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <div className="companion-actions">
                    <button
                      className="companion-danger-button"
                      onClick={() => void deleteAccount()}
                      disabled={deletingAccount || !deleteConfirmValid}
                    >
                      {deletingAccount ? t('Удаляю...', 'Deleting...') : t('Удалить навсегда', 'Delete permanently')}
                    </button>
                    <button
                      onClick={() => {
                        setDeleteConfirmOpen(false);
                        setDeleteConfirmText('');
                      }}
                      disabled={deletingAccount}
                    >
                      {t('Отмена', 'Cancel')}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </section>
            </div>
          </section>
        </>
      )}

        {busy && <p className="companion-status" role="status" aria-live="polite">{t('Обновляю данные облака…', 'Refreshing Cloud data…')}</p>}
        {error && userId && <p className="companion-status companion-status--error" role="alert">{error}</p>}
      </main>
    </div>
  );
}
