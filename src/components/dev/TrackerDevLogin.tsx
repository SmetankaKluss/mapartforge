import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase';
import { trackerLoginLink } from './trackerLoginLink';
import './TrackerDevLogin.css';

export default function TrackerDevLogin({ lang }: { lang: 'ru' | 'en' }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(false);
  const text = (ru: string, en: string) => lang === 'ru' ? ru : en;
  useEffect(() => {
    let active = true, revision = 0;
    const client = getSupabaseClient();
    const { data } = client.auth.onAuthStateChange((_event, session) => { revision++; if (active) setSignedIn(!!session && !session.user.is_anonymous); });
    const initial = revision;
    void client.auth.getSession().then(({ data }) => { if (active && revision === initial) setSignedIn(!!data.session && !data.session.user.is_anonymous); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(false), 60000); return () => clearTimeout(timer); }, [cooldown]);
  if (!import.meta.env.DEV || !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) || signedIn !== false) return null;
  async function send() {
    if (busy || cooldown) return;
    setBusy(true); setError('');
    try {
      const { error } = await getSupabaseClient().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: 'https://mapkluss.art/cloud' } });
      if (error) throw error;
      setSent(true); setCooldown(true);
    } catch { setError(text('Не удалось отправить письмо. Проверь почту или повтори позже.', 'Could not send the email. Check the address or try later.')); }
    finally { setBusy(false); }
  }
  async function login() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const input = trackerLoginLink(link);
      setLink('');
      const { error } = await getSupabaseClient().auth.verifyOtp(input);
      if (error) throw error;
      setEmail('');
    } catch { setLink(''); setError(text('Ссылка неверна или уже использована. Запроси новое письмо.', 'The link is invalid or already used. Request a new email.')); }
    finally { setBusy(false); }
  }
  return <section className="bt-dev-login" aria-label={text('Вход на дев-сайте', 'Local sign-in')}>
    <h2>{text('Вход на дев-сайте', 'Local sign-in')}</h2>
    <form onSubmit={event => { event.preventDefault(); void send(); }}>
      <input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} aria-label="Email" placeholder="Email" disabled={busy} />
      <button disabled={busy || cooldown}>{cooldown ? text('Письмо отправлено', 'Email sent') : text('Получить письмо', 'Send email')}</button>
    </form>
    <p>{text('Скопируй ссылку с кнопки входа в письме, не открывая её.', 'Copy the sign-in link from the email without opening it.')}</p>
    <form onSubmit={event => { event.preventDefault(); void login(); }}>
      <input type="password" required autoComplete="off" spellCheck={false} maxLength={8192} value={link} onChange={event => setLink(event.target.value)} aria-label={text('Ссылка из письма', 'Email sign-in link')} placeholder={text('Ссылка из письма', 'Email sign-in link')} disabled={busy} />
      <button disabled={busy || !link.trim()}>{text('Войти здесь', 'Sign in here')}</button>
    </form>
    <span role="status">{error || (sent ? text('Проверь почту. Ссылку вставь в поле выше.', 'Check your email and paste the link above.') : '')}</span>
  </section>;
}
