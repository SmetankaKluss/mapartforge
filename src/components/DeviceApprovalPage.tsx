import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COMPANION_EMAIL_COOLDOWN_MS, TELEGRAM_LOGIN_BOT_USERNAME, isCompanionEmailRateLimitError, isTelegramLoginHostAllowed, normalizeCompanionEmailError, signInWithCompanionEmail, signInWithCompanionTelegram } from '../lib/companionCloud';
import type { TelegramAuthPayload } from '../lib/companionTypes';
import { getSupabaseClient } from '../lib/supabase';
import { useLocale } from '../lib/useLocale';

declare global {
  interface Window {
    mapKlussTelegramDeviceLogin?: (user: TelegramAuthPayload) => void;
  }
}

async function describeSupabaseError(error: unknown): Promise<string> {
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
        if (typeof payload?.error === 'string' && payload.error.trim()) return normalizeDeviceApprovalMessage(payload.error);
        if (typeof payload?.message === 'string' && payload.message.trim()) return normalizeDeviceApprovalMessage(payload.message);
      } catch {
        // Fall through to text/message handling.
      }
    }
    if (context?.text) {
      try {
        const text = await context.text();
        if (text.trim()) return normalizeDeviceApprovalMessage(text);
      } catch {
        // Fall through to generic message handling.
      }
    }
    if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
      return normalizeDeviceApprovalMessage(maybeError.message);
    }
  }
  return normalizeDeviceApprovalMessage(String(error));
}

function normalizeDeviceApprovalMessage(raw: string): string {
  const text = raw.trim();
  const normalized = text.toLowerCase();
  if (!normalized) return 'Не удалось подтвердить вход мода.';
  if (normalized.includes('missing authorization header') || normalized === 'unauthorized') {
    return 'Сначала войди на этой странице, потом подтверди код.';
  }
  if (normalized.includes('missing_user_code')) {
    return 'Сначала введи код из Minecraft.';
  }
  if (normalized.includes('code_not_found_or_already_used')) {
    return 'Код не найден, уже использован или истёк. Запусти вход в моде заново.';
  }
  if (normalized.includes('dev_approve_localhost_only')) {
    return 'Dev-подтверждение работает только с localhost или 127.0.0.1.';
  }
  if (normalized.includes('dev_approve_disabled')) {
    return 'Dev-\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d\u043e. \u0412\u043e\u0439\u0434\u0438 \u0447\u0435\u0440\u0435\u0437 \u043f\u043e\u0447\u0442\u0443 \u0438\u043b\u0438 Telegram.';
  }
  if (normalized.includes('non-2xx')) {
    return 'Сервер отклонил запрос. Войди заново или создай новый код в Minecraft.';
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
      setMessage('Проверь почту, открой ссылку для входа, затем подтверди код.');
    } catch (err) {
      if (isCompanionEmailRateLimitError(err)) {
        const nextCooldown = Date.now() + COMPANION_EMAIL_COOLDOWN_MS;
        setEmailCooldownUntil(nextCooldown);
        setEmailCooldownNow(Date.now());
      }
      setStatus('error');
      setMessage(isCompanionEmailRateLimitError(err) ? normalizeCompanionEmailError(err) : await describeSupabaseError(err));
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
        setMessage('Сначала войди, потом подтверди код.');
        return;
      }
      const { error } = await supabase.functions.invoke('companion-device', {
        body: { action: 'device_approve', user_code: code.trim().toUpperCase() },
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      });
      if (error) throw error;
      setStatus('done');
      setMessage('Вход мода подтверждён. Можно вернуться в Minecraft.');
    } catch (err) {
      setStatus('error');
      setMessage(await describeSupabaseError(err));
    }
  }, [code]);

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
      setMessage('Вход мода подтверждён в local dev режиме. Можно вернуться в Minecraft.');
      await refreshSessionLabel();
    } catch (err) {
      setStatus('error');
      setMessage(await describeSupabaseError(err));
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
        setMessage('Вход через Telegram выполнен. Введи код из Minecraft и подтверди вход мода.');
      }
    } catch (err) {
      setStatus('error');
      setMessage(await describeSupabaseError(err));
    }
  }, [approve, code, refreshSessionLabel]);

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
    <main className="companion-page companion-device-page">
      <header className="companion-header companion-detail-header companion-device-header">
        <a href="/" className="companion-back">MapKluss</a>
        <div>
          <h1>{t('Вход мода', 'Mod login')}</h1>
          <p>{t('Подтверди MapKluss Companion в Minecraft.', 'Approve MapKluss Companion in Minecraft.')}</p>
        </div>
        <button className="lang-toggle-btn" onClick={toggle} title={t('Switch to English', 'Переключить на русский')}>{lang === 'ru' ? 'EN' : 'RU'}</button>
      </header>

      <section className="companion-panel companion-device-panel">
        <h2>{t('Код из мода', 'Code from mod')}</h2>
        <p className="companion-muted">{sessionLabel}</p>
        <div className="companion-auth-methods companion-device-methods">
          <article>
            <strong>{t('Почта', 'Email')}</strong>
            <span>{t('Войди и подтверди код', 'Sign in and approve the code')}</span>
          </article>
          <article className={TELEGRAM_LOGIN_BOT_USERNAME ? '' : 'is-muted'}>
            <strong>Telegram</strong>
            <span>{TELEGRAM_LOGIN_BOT_USERNAME ? t('Привязан в облаке', 'Linked in Cloud') : t('Нужна настройка бота', 'Bot setup required')}</span>
          </article>
        </div>
        {!signedIn && TELEGRAM_LOGIN_BOT_USERNAME && telegramDomainAllowed && (
          <div className="companion-device-telegram-login">
            <div id="mapkluss-telegram-device-widget" className="companion-telegram-widget" />
            <p className="companion-muted">{t('Если Telegram уже привязан, он сразу войдёт на сайт и подтвердит код.', 'If Telegram is already linked, it will sign in and approve the code immediately.')}</p>
          </div>
        )}
        <input
          className="companion-code"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="ABCDEFGH"
          maxLength={12}
        />
        <div className="companion-actions">
          <button onClick={approve} disabled={status === 'busy' || code.trim().length < 4}>{t('Подтвердить', 'Approve')}</button>
          {devApprovalEnabled && (
            <button onClick={() => void approveDev()} disabled={status === 'busy' || code.trim().length < 4}>
              {t('Dev-подтв.', 'Dev approve')}
            </button>
          )}
        </div>
        <div className="companion-inline-form companion-device-email-form">
          <input
            value={email}
            onChange={event => setEmail(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !emailCooldownActive) void signInEmail(); }}
            placeholder="email@example.com"
            type="email"
          />
          <button onClick={() => void signInEmail()} disabled={status === 'busy' || !email.trim() || emailCooldownActive}>
            {emailCooldownActive ? t(`Повтор через ${emailCooldownRemaining}с`, `Retry in ${emailCooldownRemaining}s`) : t('Ссылка на почту', 'Email link')}
          </button>
        </div>
        {devApprovalEnabled && (
          <p className="companion-dev-note">{t('Только localhost: Dev-подтверждение привязывает код к локальному тестовому аккаунту без OAuth.', 'Localhost only: dev approval links the code to a local test account without OAuth.')}</p>
        )}
        {status === 'busy' && !message && <p className="companion-muted">{t('Проверяю вход и подтверждаю мод...', 'Checking sign-in and approving the mod...')}</p>}
        {message && <p className={status === 'error' ? 'companion-error' : 'companion-muted'}>{message}</p>}
      </section>
    </main>
  );
}
