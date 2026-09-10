import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { getSession, updateGathered, updatePlaced, switchToBuilding, subscribeSession } from '../lib/buildSession';
import type { BuildSession, SessionMaterial } from '../lib/buildSession';
import { applyPageMeta } from '../lib/meta';
import { base64ToBytes } from '../lib/base64';
import { materialColour } from '../lib/trackerPreview';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';
import { BlockIcon } from './BlockIcon';
import { PublicSiteHeader } from './PublicSiteHeader';
import { TrackerPreview } from './TrackerPreview';
import { useTrackerLive } from './useTrackerLive';
import { trackerMaterialCounts } from '../lib/trackerMaterialCounts';
import '../trackerWorkspace.css';

type Lang = 'ru' | 'en';
type Mode = 'gathering' | 'building';
const TrackerDevLogin = import.meta.env.DEV ? lazy(() => import('./dev/TrackerDevLogin')) : null;
const emptyPatch = () => ({ gathering: {} as Record<string, number>, building: {} as Record<string, number> });
const safeCount = (value: number, max: number) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;

function MaterialRow({ mat, value, lang, onChange, readOnly }: { mat: SessionMaterial; value: number; lang: Lang; onChange: (value: number) => void; readOnly?: boolean }) {
  const [amount, setAmount] = useState('64');
  const colour = materialColour(mat.nbtName);
  const done = safeCount(value, mat.count);
  const percent = mat.count > 0 ? Math.round(done / mat.count * 100) : 0;
  return <li className={`bt-material${done >= mat.count ? ' is-complete' : ''}`}>
    <div className="bt-material-name">
      {colour ? <BlockIcon className="bt-material-icon" nbtName={colour.block.nbtName} blockId={colour.block.blockId} csId={colour.row.csId} r={colour.row.r} g={colour.row.g} b={colour.row.b} /> : <IconGlyph icon={mkIcons.package} />}
      <span title={mat.displayName}>{mat.displayName}</span><span className="bt-material-percent">{percent}%</span>
    </div>
    <progress value={done} max={Math.max(1, mat.count)} aria-label={mat.displayName} />
    <fieldset className="bt-material-controls" disabled={readOnly} style={{ border: 0, margin: 0, minWidth: 0 }}>
      <span>{done.toLocaleString()} <span className="bt-muted">/ {mat.count.toLocaleString()}</span></span>
      <input type="number" min="1" max={mat.count} step="1" value={amount} aria-label={`${lang === 'ru' ? 'Количество' : 'Amount'}: ${mat.displayName}`} onChange={event => setAmount(event.target.value)} />
      <button type="button" title={lang === 'ru' ? 'Убрать' : 'Subtract'} aria-label={`${lang === 'ru' ? 'Убрать' : 'Subtract'}: ${mat.displayName}`} disabled={done === 0} onClick={() => onChange(Math.max(0, done - safeCount(Number(amount), mat.count)))}><IconGlyph icon={mkIcons.minus} /></button>
      <button type="button" title={lang === 'ru' ? 'Добавить' : 'Add'} aria-label={`${lang === 'ru' ? 'Добавить' : 'Add'}: ${mat.displayName}`} disabled={done >= mat.count} onClick={() => onChange(Math.min(mat.count, done + safeCount(Number(amount), mat.count)))}><IconGlyph icon={mkIcons.plus} /></button>
      <button type="button" title={lang === 'ru' ? 'Собрано полностью' : 'Complete material'} aria-label={`${lang === 'ru' ? 'Готово' : 'Complete'}: ${mat.displayName}`} disabled={done >= mat.count} onClick={() => onChange(mat.count)}><IconGlyph icon={mkIcons.check} /></button>
    </fieldset>
  </li>;
}

export function BuildTracker({ sessionId }: { sessionId: string }) {
  const [lang, setLang] = useState<Lang>(() => { try { return localStorage.getItem('bt_lang') === 'en' ? 'en' : 'ru'; } catch { return 'ru'; } });
  const text = (ru: string, en: string) => lang === 'ru' ? ru : en;
  const [loadedSession, setSession] = useState<BuildSession | null>(null);
  const [error, setError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);
  const [view, setView] = useState<Mode>('gathering');
  const [selected, setSelected] = useState(-1);
  const [original, setOriginal] = useState(false);
  const [search, setSearch] = useState('');
  const [remainingOnly, setRemainingOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const pending = useRef(emptyPatch());
  const editRevision = useRef(0);
  const fixtureMode = useRef<Mode>('gathering');
  const save = useRef<(() => void) | null>(null);
  const refresh = useRef<(() => void) | null>(null);
  const mock = import.meta.env.DEV && new URLSearchParams(location.search).get('trackerMock') === '1';
  const live = useTrackerLive(sessionId, mock);
  const session = loadedSession ?? live?.value.session ?? null;
  const scanned = view === 'building' && !!live?.value.snapshot;

  useEffect(() => { applyPageMeta({ title: 'MapKluss Build Tracker', description: 'Minecraft map art build tracker.', url: `${location.origin}${location.pathname}`, robots: 'noindex,nofollow' }); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    let stopped = false;
    let fetching = false;
    let dirtyRead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let writing = false;
    let initialized = false;
    let fixture: BuildSession | null = null;
    pending.current = emptyPatch();
    fixtureMode.current = 'gathering';
    const merge = (next: BuildSession) => {
      if (stopped) return;
      setSession({ ...next, gathered: { ...next.gathered, ...pending.current.gathering }, placed: { ...next.placed, ...pending.current.building } });
      if (!initialized) { initialized = true; setView(next.mode); }
      setLastUpdated(Date.now()); setError(false);
    };
    const load = async () => {
      if (stopped || document.hidden) return;
      if (fetching) { dirtyRead = true; return; }
      fetching = true;
      const revision = editRevision.current;
      try {
        if (mock) { fixture ??= (await import('./dev/trackerFixture')).trackerFixture(sessionId); merge({ ...fixture, mode: fixtureMode.current }); }
        else {
          const next = await getSession(sessionId);
          if (revision === editRevision.current) merge(next); else dirtyRead = true;
        }
      } catch (failure) {
        if (!stopped) {
          setError(true);
          const status = (failure as { context?: { status?: number } })?.context?.status;
          if (status === 401 || status === 403) { setSession(null); pending.current = emptyPatch(); }
        }
      }
      finally { fetching = false; if (dirtyRead && !stopped) { dirtyRead = false; void load(); } }
    };
    const flush = async () => {
      if (stopped || writing) return;
      writing = true; setSaving(true);
      let succeeded = false;
      try {
        for (const mode of ['gathering', 'building'] as const) {
          const patch = { ...pending.current[mode] };
          if (!Object.keys(patch).length) continue;
          if (mock && fixture) {
            const key = mode === 'gathering' ? 'gathered' : 'placed';
            fixture = { ...fixture, [key]: { ...fixture[key], ...patch } };
          } else {
            // The legacy endpoint replaces this field; retain untouched materials.
            const remote = await getSession(sessionId);
            if (stopped) return;
            if (mode === 'gathering') await updateGathered(sessionId, { ...remote.gathered, ...patch });
            else await updatePlaced(sessionId, { ...remote.placed, ...patch });
          }
          if (stopped) return;
          for (const [key, value] of Object.entries(patch)) if (pending.current[mode][key] === value) delete pending.current[mode][key];
        }
        editRevision.current++;
        succeeded = true; setSaveError(false); void load();
      } catch { if (!stopped) setSaveError(true); }
      finally {
        writing = false;
        if (!stopped) {
          setSaving(false);
          if (succeeded && (Object.keys(pending.current.gathering).length || Object.keys(pending.current.building).length)) timer = setTimeout(() => { void flush(); }, 400);
        }
      }
    };
    save.current = () => { clearTimeout(timer); timer = setTimeout(() => { void flush(); }, 400); };
    refresh.current = () => { void load(); };
    void load();
    let unsubscribe = () => {};
    try { if (!mock) unsubscribe = subscribeSession(sessionId, () => { void load(); }); } catch { /* The bounded refresh remains available. */ }
    const interval = setInterval(() => { void load(); }, 15000);
    const visible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', visible);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (Object.keys(pending.current.gathering).length || Object.keys(pending.current.building).length) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { stopped = true; clearTimeout(timer); clearInterval(interval); unsubscribe(); document.removeEventListener('visibilitychange', visible); window.removeEventListener('beforeunload', beforeUnload); };
  }, [sessionId, mock]);

  const record = view === 'gathering' ? session?.gathered ?? {} : live?.value.snapshot
    ? trackerMaterialCounts(session?.materials ?? [], live.value.snapshot.materials) : session?.placed ?? {};
  const materials = session?.materials ?? [];
  const total = materials.reduce((sum, material) => sum + material.count, 0);
  const done = materials.reduce((sum, material) => sum + safeCount(record[material.nbtName], material.count), 0);
  const summary = scanned ? (selected >= 0 ? live?.value.snapshot?.parts[selected] : live?.value.snapshot?.summary) : null;
  const progressTotal = scanned ? summary?.[0] ?? 0 : total;
  const progressDone = scanned ? summary?.[1] ?? 0 : done;
  const pct = progressTotal ? Math.round(progressDone / progressTotal * 100) : 0;
  const filtered = materials.filter(material => (!remainingOnly || safeCount(record[material.nbtName], material.count) < material.count)
    && `${material.displayName} ${material.nbtName}`.toLowerCase().includes(search.toLowerCase()));
  function change(nbtName: string, count: number) {
    if (scanned || !loadedSession) return;
    editRevision.current++;
    pending.current[view][nbtName] = count;
    setSession(current => current ? { ...current, [view === 'gathering' ? 'gathered' : 'placed']: { ...(view === 'gathering' ? current.gathered : current.placed), [nbtName]: count } } : current);
    save.current?.();
  }
  function toggleLanguage() {
    const next = lang === 'ru' ? 'en' : 'ru'; setLang(next);
    try { localStorage.setItem('bt_lang', next); } catch { /* In-memory preference remains usable. */ }
  }
  async function startBuilding() {
    setBusy(true);
    try { if (!mock) await switchToBuilding(sessionId); else fixtureMode.current = 'building'; editRevision.current++; setSession(current => current ? { ...current, mode: 'building' } : current); setView('building'); setSaveError(false); }
    catch { setSaveError(true); }
    finally { setBusy(false); }
  }
  function download() {
    if (!session?.litematic_b64) return;
    const bytes = base64ToBytes(session.litematic_b64);
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'application/octet-stream' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${session.info.title || 'MapKluss'}.litematic`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}`); setCopied(true); }
    catch { setCopied(false); }
  }
  return <div className="public-shell bt-shell">
    <PublicSiteHeader active="cloud" lang={lang} onToggleLanguage={toggleLanguage} />
    {!mock && TrackerDevLogin && <Suspense fallback={null}><TrackerDevLogin lang={lang} /></Suspense>}
    {!session ? <main className="bt-empty" aria-busy={!error}>
      <IconGlyph icon={error ? mkIcons.alert : mkIcons.hammer} />
      <h1>{error ? text('Трекер недоступен', 'Tracker unavailable') : text('Открываю трекер…', 'Opening tracker…')}</h1>
      {error && <><a href="/cloud">{text('Аккаунт', 'Account')}</a><button onClick={() => refresh.current?.()}>{text('Повторить', 'Retry')}</button></>}
    </main> : <main className="bt-workspace">
      <header className="bt-heading">
        <a href="/cloud" className="bt-icon-button" title={text('Облако', 'Cloud')} aria-label={text('Облако', 'Cloud')}><IconGlyph icon={mkIcons.arrowLeft} /></a>
        <div className="bt-heading-title"><h1>{session.info?.title || text('Трекер постройки', 'Build tracker')}</h1><span className="bt-muted">{session.map_grid.wide} × {session.map_grid.tall} · {text('Трекер', 'Tracker')}{mock ? ' · Demo' : ''}</span></div>
        <span className={`bt-sync${error || saveError ? ' is-error' : ''}`} role="status">{saveError ? text('Не сохранено', 'Not saved') : error ? text('Нет связи', 'Disconnected') : saving ? text('Сохраняю…', 'Saving…') : lastUpdated ? `${text('Обновлено', 'Updated')} ${new Date(lastUpdated).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
        <button className="bt-icon-button" onClick={() => { if (saveError) save.current?.(); refresh.current?.(); }} title={text('Обновить', 'Refresh')} aria-label={text('Обновить', 'Refresh')}><IconGlyph icon={mkIcons.reset} /></button>
        <button className="bt-icon-button" onClick={copyLink} title={text('Скопировать ссылку', 'Copy link')} aria-label={text('Скопировать ссылку', 'Copy link')}><IconGlyph icon={copied ? mkIcons.check : mkIcons.link} /></button>
      </header>
      <div className="bt-workbench">
        <section className="bt-artwork" aria-label={text('Арт', 'Artwork')}>
          <div className="bt-view-toolbar">
            <div className="bt-segments" role="group" aria-label={text('Режим просмотра', 'View mode')}>
              <button aria-pressed={view === 'gathering'} onClick={() => setView('gathering')}><IconGlyph icon={mkIcons.pickaxe} />{text('Сбор', 'Gather')}</button>
              <button aria-pressed={view === 'building'} onClick={() => setView('building')}><IconGlyph icon={mkIcons.hammer} />{text('Стройка', 'Build')}</button>
            </div>
            <button className="bt-icon-button" aria-pressed={original} onClick={() => setOriginal(value => !value)} title={text('Оригинал', 'Original')} aria-label={text('Оригинал', 'Original')}><IconGlyph icon={mkIcons.eye} /></button>
            <select aria-label={text('Карта', 'Map')} value={selected} onChange={event => setSelected(Number(event.target.value))}>
              <option value={-1}>{text('Весь арт', 'Whole art')}</option>
              {Array.from({ length: Math.min(100, session.map_grid.wide * session.map_grid.tall) }, (_, index) => <option key={index} value={index}>{text('Карта', 'Map')} {index + 1} · {index % session.map_grid.wide + 1}:{Math.floor(index / session.map_grid.wide) + 1}</option>)}
            </select>
          </div>
          <TrackerPreview src={session.image_preview} materials={materials} gathered={session.gathered} original={original} building={view === 'building'} wide={session.map_grid.wide} tall={session.map_grid.tall} selected={selected} lang={lang} liveImage={live?.image} />
          <footer className="bt-art-footer">
            <span>{original ? text('Оригинал', 'Original') : view === 'gathering' ? text('По собранным материалам', 'Gathered materials') : live?.access === 'login' ? text('Войди в аккаунт для синхронизации', 'Sign in to sync progress') : live?.access === 'denied' ? text('У этого аккаунта нет доступа к стройке', 'This account cannot access the build') : scanned ? live?.fresh ? text('Minecraft · обновляется', 'Minecraft · updating') : text('Minecraft · последнее состояние', 'Minecraft · last snapshot') : text('Ожидаю сканирование в Minecraft', 'Waiting for Minecraft scan')}{scanned && (live?.value.participants ?? 1) > 1 ? ` · ${live?.value.participants} ${text('участников', 'participants')}` : ''}</span>
            {session.litematic_b64 && <button onClick={download}><IconGlyph icon={mkIcons.download} />{text('Схема', 'Schematic')}</button>}
          </footer>
        </section>
        <aside className="bt-inspector">
          <div className="bt-summary">
            <div><h2>{view === 'gathering' ? text('Собрано', 'Gathered') : scanned ? text('Построено', 'Built') : text('Поставлено вручную', 'Manually recorded')}</h2><strong>{pct}%</strong></div>
            <progress value={progressDone} max={Math.max(1, progressTotal)} aria-label={text('Общий прогресс', 'Total progress')} />
            <div className="bt-muted"><span>{progressDone.toLocaleString()} / {progressTotal.toLocaleString()}</span><span>{materials.length} {text('материалов', 'materials')}</span></div>
            {summary && <div className="bt-muted">{text('Ошибки', 'Wrong')}: {summary[3]} · {text('Не проверено', 'Unchecked')}: {summary[4] + summary[5]}</div>}
          </div>
          <div className="bt-material-toolbar">
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={text('Найти материал', 'Find material')} aria-label={text('Найти материал', 'Find material')} />
            <button className="bt-icon-button" aria-pressed={remainingOnly} onClick={() => setRemainingOnly(value => !value)} title={text('Только недостающие', 'Remaining only')} aria-label={text('Только недостающие', 'Remaining only')}><IconGlyph icon={mkIcons.tracker} /></button>
          </div>
          <ul className="bt-materials" aria-label={text('Материалы', 'Materials')}>
            {filtered.map(material => <MaterialRow key={material.nbtName} mat={material} value={record[material.nbtName] ?? 0} lang={lang} readOnly={scanned || !loadedSession} onChange={value => change(material.nbtName, value)} />)}
            {!filtered.length && <li className="bt-no-results">{text('Нет материалов', 'No materials')}</li>}
          </ul>
          <div className="bt-session-actions">
            {session.mode === 'gathering' && <button onClick={startBuilding} disabled={busy || saving || !loadedSession}><IconGlyph icon={mkIcons.hammer} />{text('Начать стройку', 'Start building')}</button>}
            {(session.info?.server || session.info?.coords || session.info?.description) && <details><summary>{text('Детали', 'Details')}</summary><p>{session.info.server}</p><p>{session.info.coords}</p><p>{session.info.description}</p></details>}
          </div>
        </aside>
      </div>
    </main>}
  </div>;
}
