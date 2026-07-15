import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COMPANION_EMAIL_COOLDOWN_MS, TELEGRAM_LOGIN_BOT_USERNAME, isCompanionEmailRateLimitError, isTelegramLoginHostAllowed, normalizeCompanionEmailError, signInWithCompanionEmail, signInWithCompanionTelegram } from '../lib/companionCloud';
import type { TelegramAuthPayload } from '../lib/companionTypes';
import { getSupabaseClient } from '../lib/supabase';
import { useLocale } from '../lib/useLocale';
import { applyPageMeta } from '../lib/meta';
import { PublicSiteHeader } from './PublicSiteHeader';

declare global {
  interface Window {
    mapKlussTelegramDeviceLogin?: (user: TelegramAuthPayload) => void;
  }
}

type Translator = (ru: string, en: string) => string;

async function describeSupabaseError(error: unknown, t: Translator): Promise<string> {
  if (error && typeof error === 'object') {
    const maybeError = error as {
      message?: unknown;
      context?: {
        json?: () => Promise<unknown>;
        text?: () => Promise<string>;
      };
    };
    const context = maybeError.context;
    if (context?.json) {
      try {
        const payload = await context.json() as { error?: unknown; message?: unknown };
        if (typeof payload?.error === 'string' && payload.error.trim()) return normalizeDeviceApprovalMessage(payload.error, t);
        if (typeof payload?.message === 'string' && payload.message.trim()) return normalizeDeviceApprovalMessage(payload.message, t);
      } catch {
        // Fall through to text/message handling.
      }
    }
    if (context?.text) {
      try {
        const text = await context.text();
        if (text.trim()) return normalizeDeviceApprovalMessage(text, t);
      } catch {
        // Fall through to generic message handling.
      }
    }
    if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
      return normalizeDeviceApprovalMessage(maybeError.message, t);
    }
  }
  return normalizeDeviceApprovalMessage(String(error), t);
}

function normalizeDeviceApprovalMessage(raw: string, t: Translator): string {
  const text = raw.trim();
  const normalized = text.toLowerCase();
  if (!normalized) return t('Не удалось подтвердить вход мода.', 'Could not approve the mod login.');
  if (normalized.includes('missing authorization header') || normalized === 'unauthorized') {
    return t('Сначала войди на этой странице, потом подтверди код.', 'Sign in on this page before approving the code.');
  }
  if (normalized.includes('missing_user_code')) {
    return t('Сначала введи код из Minecraft.', 'Enter the code shown in Minecraft first.');
  }
  if (normalized.includes('code_not_found_or_already_used')) {
    return t('Код не найден, уже использован или истёк. Запусти вход в моде заново.', 'The code was not found, was already used, or expired. Start mod login again.');
  }
  if (normalized.includes('dev_approve_localhost_only')) {
    return t('Dev-подтверждение работает только с localhost или 127.0.0.1.', 'Dev approval only works on localhost or 127.0.0.1.');
  }
  if (normalized.includes('dev_approve_disabled')) {
    return t('Dev-подтверждение выключено. Войди через почту или Telegram.', 'Dev approval is disabled. Sign in with email or Telegram.');
  }
  if (normalized.includes('non-2xx')) {
    return t('Сервер отклонил запрос. Войди заново или создай новый код в Minecraft.', 'The server rejected the request. Sign in again or create a new code in Minecraft.');
  }
  return text;
}

function isLocalDevPage(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function DeviceApprovalPage() {
  const { lang, toggle, t } = useLocale();
  const initialCode = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('code') ?? '';
    return value.trim().toUpperCase();
  }, []);
  const [code, setCode] = useState(initialCode);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [sessionLabel, setSessionLabel] = useState(t('Проверяю сессию...', 'Checking session...'));
  const [signedIn, setSignedIn] = useState(false);
  const telegramDomainAllowed = isTelegramLoginHostAllowed();
  const [emailCooldownUntil, setEmailCooldownUntil] = useState(0);
  const [emailCooldownNow, setEmailCooldownNow] = useState(Date.now());
  const emailCooldownRemaining = Math.max(0, Math.ceil((emailCooldownUntil - emailCooldownNow) / 1000));
  const emailCooldownActive = emailCooldownRemaining > 0;
  const autoApproveAttemptedRef = useRef(false);
  const localDevPage = useMemo(() => isLocalDevPage(), []);
  const devApprovalEnabled = localDevPage && import.meta.env.DEV && import.meta.env.VITE_ALLOW_DEV_DEVICE_APPROVE === 'true';

  useEffect(() => {
    applyPageMeta({
      title: t('Вход MapKluss Companion | MapKluss', 'MapKluss Companion login | MapKluss'),
      description: t('Подтверждение кода входа MapKluss Companion из Minecraft.', 'Approve a MapKluss Companion login code from Minecraft.'),
      robots: 'noindex,nofollow',
    });
  }, [t]);

  useEffect(() => {
    if (!emailCooldownActive) return;
    const timer = window.setInterval(() => setEmailCooldownNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [emailCooldownActive]);

  const refreshSessionLabel = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      const nextLabel = user?.email
        ? t(`Вход выполнен: ${user.email}`, `Signed in: ${user.email}`)
        : user?.id
          ? t(`Вход выполнен: ${user.id}`, `Signed in: ${user.id}`)
          : t('Вход не выполнен', 'Signed out');
      setSignedIn(Boolean(user));
      setSessionLabel(nextLabel);
    } catch {
      setSignedIn(false);
      setSessionLabel(t('Сессия недоступна', 'Session unavailable'));
    }
  }, [t]);

  async function signInEmail() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || emailCooldownActive) return;
    setStatus('busy');
    setMessage('');
    try {
      const nextUrl = new URL(window.location.href);
      if (code.trim()) nextUrl.searchParams.set('code', code.trim().toUpperCase());
      await signInWithCompanionEmail(trimmedEmail, nextUrl.toString());
      const nextCooldown = Date.now() + COMPANION_EMAIL_COOLDOWN_MS;
      setEmailCooldownUntil(nextCooldown);
      setEmailCooldownNow(Date.now());
      setStatus('idle');
      setMessage(t('Проверь почту, открой ссылку для входа, затем подтверди код.', 'Check your inbox, open the sign-in link, then approve the code.'));
    } catch (err) {
      if (isCompanionEmailRateLimitError(err)) {
        const nextCooldown = Date.now() + COMPANION_EMAIL_COOLDOWN_MS;
        setEmailCooldownUntil(nextCooldown);
        setEmailCooldownNow(Date.now());
      }
      setStatus('error');
      setMessage(isCompanionEmailRateLimitError(err) ? normalizeCompanionEmailError(err) : await describeSupabaseError(err, t));
    }
  }

  const approve = useCallback(async () => {
    setStatus('busy');
    setMessage('');
    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setStatus('error');
        setMessage(t('Сначала войди, потом подтверди код.', 'Sign in before approving the code.'));
        return;
      }
      const { error } = await supabase.functions.invoke('companion-device', {
        body: { action: 'device_approve', user_code: code.trim().toUpperCase() },
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      });
      if (error) throw error;
      setStatus('done');
      setMessage(t('Вход мода подтверждён. Можно вернуться в Minecraft.', 'Mod login approved. You can return to Minecraft.'));
    } catch (err) {
      setStatus('error');
      setMessage(await describeSupabaseError(err, t));
    }
  }, [code, t]);

  async function approveDev() {
    if (!devApprovalEnabled) return;
    setStatus('busy');
    setMessage('');
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.functions.invoke('companion-device', {
        body: {
          action: 'device_approve_dev',
          user_code: code.trim().toUpperCase(),
          label: 'Local Dev',
        },
      });
      if (error) throw error;
      setStatus('done');
      setMessage(t('Вход мода подтверждён в local dev режиме. Можно вернуться в Minecraft.', 'Mod login approved in local dev mode. You can return to Minecraft.'));
      await refreshSessionLabel();
    } catch (err) {
      setStatus('error');
      setMessage(await describeSupabaseError(err, t));
    }
  }

  useEffect(() => {
    void refreshSessionLabel();
    const supabase = getSupabaseClient();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void refreshSessionLabel();
    });
    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [refreshSessionLabel]);

  useEffect(() => {
    if (autoApproveAttemptedRef.current) return;
    if (code.trim().length < 4) return;
    autoApproveAttemptedRef.current = true;

    void (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) return;
        await approve();
      } catch {
        // Keep the page usable for manual approval even if session probing fails.
      }
    })();
  }, [approve, code]);

  const handleTelegramLogin = useCallback(async (auth: TelegramAuthPayload) => {
    setStatus('busy');
    setMessage('');
    try {
      await signInWithCompanionTelegram(auth);
      await refreshSessionLabel();
      if (code.trim().length >= 4) {
        await approve();
      } else {
        setStatus('done');
        setMessage(t('Вход через Telegram выполнен. Введи код из Minecraft и подтверди вход мода.', 'Telegram sign-in complete. Enter the Minecraft code and approve the mod login.'));
      }
    } catch (err) {
      setStatus('error');
      setMessage(await describeSupabaseError(err, t));
    }
  }, [approve, code, refreshSessionLabel, t]);

  useEffect(() => {
    if (!TELEGRAM_LOGIN_BOT_USERNAME || signedIn || !telegramDomainAllowed) return;
    window.mapKlussTelegramDeviceLogin = (user) => { void handleTelegramLogin(user); };
    const host = document.getElementById('mapkluss-telegram-device-widget');
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
    script.setAttribute('data-onauth', 'mapKlussTelegramDeviceLogin(user)');
    host.appendChild(script);
    return () => {
      if (window.mapKlussTelegramDeviceLogin) delete window.mapKlussTelegramDeviceLogin;
      host.innerHTML = '';
    };
  }, [handleTelegramLogin, signedIn, telegramDomainAllowed]);

  return (
    <div className="public-shell">
      <PublicSiteHeader active="cloud" lang={lang} onToggleLanguage={toggle} />
      <main className="companion-page companion-device-page">
        <header className="companion-header companion-detail-header companion-device-header">
          <div>
            <nav className="public-breadcrumbs" aria-label={t('Навигационная цепочка', 'Breadcrumb')}>
              <a href="/cloud">{t('Облако и мод', 'Cloud & mod')}</a>
              <span className="public-breadcrumbs__separator" aria-hidden="true">/</span>
              <span aria-current="page">{t('Вход мода', 'Mod login')}</span>
            </nav>
            <h1>{t('Подключение MapKluss Companion', 'Connect MapKluss Companion')}</h1>
            <p>{t('Два шага: войди в аккаунт и подтверди одноразовый код из Minecraft.', 'Two steps: sign in, then approve the one-time code shown in Minecraft.')}</p>
          </div>
          <span className={signedIn ? 'companion-session-badge is-ready' : 'companion-session-badge'}>{sessionLabel}</span>
        </header>

        <section className="companion-panel companion-device-panel">
          <div className="companion-device-step">
            <span className="companion-device-step__index" aria-hidden="true">01</span>
            <div className="companion-device-step__body">
              <div>
                <h2>{t('Войди в MapKluss', 'Sign in to MapKluss')}</h2>
                <p className="companion-muted">{signedIn ? t('Готово. Этот аккаунт будет подключён к моду.', 'Ready. This account will be connected to the mod.') : t('Используй почту или Telegram — тот же аккаунт работает в редакторе и облаке.', 'Use email or Telegram—the same account works in the editor and Cloud.')}</p>
              </div>
              {!signedIn && (
                <>
                  <label className="companion-field">
                    <span>{t('Электронная почта', 'Email address')}</span>
                    <div className="companion-inline-form companion-device-email-form">
                      <input
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter' && !emailCooldownActive) void signInEmail(); }}
                        placeholder="email@example.com"
                        type="email"
                        autoComplete="email"
                      />
                      <button onClick={() => void signInEmail()} disabled={status === 'busy' || !email.trim() || emailCooldownActive}>
                        {emailCooldownActive ? t(`Повтор через ${emailCooldownRemaining}с`, `Retry in ${emailCooldownRemaining}s`) : t('Отправить ссылку', 'Send sign-in link')}
                      </button>
                    </div>
                  </label>
                  {TELEGRAM_LOGIN_BOT_USERNAME && telegramDomainAllowed && (
                    <div className="companion-device-telegram-login">
                      <div id="mapkluss-telegram-device-widget" className="companion-telegram-widget" />
                      <p className="companion-muted">{t('Telegram выполнит вход; код всё равно останется видимым для проверки.', 'Telegram signs you in; the code remains visible so you can verify it.')}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="companion-device-step">
            <span className="companion-device-step__index" aria-hidden="true">02</span>
            <div className="companion-device-step__body">
              <div>
                <h2>{t('Подтверди код из Minecraft', 'Approve the Minecraft code')}</h2>
                <p className="companion-muted">{t('Сверь код с экраном мода. Он одноразовый и истекает автоматически.', 'Match this code with the mod screen. It is single-use and expires automatically.')}</p>
              </div>
              <label className="companion-field">
                <span>{t('Код подключения', 'Connection code')}</span>
                <input
                  className="companion-code"
                  value={code}
                  onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                  placeholder="ABCD-EFGH"
                  maxLength={12}
                  autoComplete="one-time-code"
                  inputMode="text"
                  spellCheck={false}
                />
              </label>
              <div className="companion-actions">
                <button onClick={approve} disabled={!signedIn || status === 'busy' || code.trim().length < 4}>
                  {status === 'busy' ? t('Подтверждаю…', 'Approving…') : t('Подключить мод', 'Connect mod')}
                </button>
                {devApprovalEnabled && (
                  <button onClick={() => void approveDev()} disabled={status === 'busy' || code.trim().length < 4}>{t('Локальный тест', 'Local test')}</button>
                )}
              </div>
              {!signedIn && <p className="companion-muted">{t('Кнопка станет доступна после входа на первом шаге.', 'The button becomes available after sign-in in step one.')}</p>}
            </div>
          </div>

          {devApprovalEnabled && <p className="companion-dev-note">{t('Локальный тест доступен только на localhost и не используется на основном сайте.', 'Local testing is available only on localhost and is not used on the production site.')}</p>}
          <div className={`companion-status${status === 'error' ? ' companion-status--error' : ''}`} aria-live="polite" role={status === 'error' ? 'alert' : 'status'}>
            {status === 'busy' && !message ? t('Проверяю вход и подтверждаю мод…', 'Checking sign-in and approving the mod…') : message || sessionLabel}
          </div>
        </section>
      </main>
    </div>
  );
}
