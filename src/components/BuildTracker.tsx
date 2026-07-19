import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSession, updateGathered, updatePlaced,
  switchToBuilding, subscribeSession,
} from '../lib/buildSession';
import type { BuildSession, SessionMaterial } from '../lib/buildSession';
import { applyPageMeta } from '../lib/meta';
import '../buildTracker.css';
import { base64ToBytes } from '../lib/base64';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';
import { PublicSiteHeader } from './PublicSiteHeader';

// ─── i18n ────────────────────────────────────────────────────────────────────
type Lang = 'ru' | 'en';
const T = {
  back:         { ru: 'Назад', en: 'Back' },
  tracker:      { ru: 'ТРЕКЕР ПОСТРОЙКИ', en: 'BUILD TRACKER' },
  loading:      { ru: 'Загрузка…', en: 'Loading…' },
  notFound:     { ru: 'Сессия не найдена.', en: 'Session not found.' },
  gathering:    { ru: 'Сбор ресурсов', en: 'Gathering' },
  building:     { ru: 'Строительство', en: 'Building' },
  statsTitle:   { ru: 'Статистика', en: 'Progress' },
  blockTypes:   { ru: 'видов блоков', en: 'block types' },
  blocksTotal:  { ru: 'блоков всего', en: 'blocks total' },
  progress:     { ru: 'Прогресс', en: 'Progress' },
  switchBtn:    { ru: 'Начать строительство', en: 'Start building' },
  modeBadge:    { ru: 'Режим строительства', en: 'Building mode' },
  colBlock:     { ru: 'Материал', en: 'Material' },
  colNeed:      { ru: 'Нужно', en: 'Needed' },
  colProgress:  { ru: 'Прогресс', en: 'Progress' },
  colAction:    { ru: 'Собрано', en: 'Gathered' },
  colActionB:   { ru: 'Поставлено', en: 'Placed' },
  tableTitle:   { ru: 'Список материалов', en: 'Materials list' },
  perMap:       { ru: 'На карту', en: 'Per map' },
  server:       { ru: 'Сервер', en: 'Server' },
  coords:       { ru: 'Координаты', en: 'Coords' },
  notes:        { ru: 'Заметки', en: 'Notes' },
  maps:         { ru: 'Карты', en: 'Maps' },
  confirmTitle: { ru: 'Начать строительство?', en: 'Start building?' },
  confirmDesc:  { ru: 'Режим переключится на отслеживание поставленных блоков. Данные сбора сохранятся.', en: 'Switch to tracking placed blocks. Gathering data is preserved.' },
  cancel:       { ru: 'Отмена', en: 'Cancel' },
  confirmYes:   { ru: 'Да, начать', en: 'Yes, start' },
  switching:    { ru: 'Переключение…', en: 'Switching…' },
  switchError:  { ru: 'Не удалось переключить режим. Попробуйте ещё раз.', en: 'Could not switch mode. Try again.' },
  saveError:    { ru: 'Не удалось сохранить изменение. Проверь соединение и повтори.', en: 'Could not save the change. Check your connection and try again.' },
  retry:        { ru: 'Обновить страницу', en: 'Reload page' },
  downloadLite: { ru: 'Схематика (.litematic)', en: 'Schematic (.litematic)' },
} as const;

function t(key: keyof typeof T, lang: Lang): string {
  return T[key][lang];
}

function fmtStacks(n: number, lang: Lang) {
  const stacks = Math.floor(n / 64);
  const rem    = n % 64;
  const st     = lang === 'ru' ? 'ст' : 'st';
  if (stacks === 0) return `${rem}`;
  if (rem === 0)    return `${stacks}${st}`;
  return `${stacks}${st} + ${rem}`;
}

function totalBlocks(materials: SessionMaterial[]) {
  return materials.reduce((s, m) => s + m.count, 0);
}
function totalDone(record: Record<string, number>, materials: SessionMaterial[]) {
  return materials.reduce((s, m) => s + Math.min(record[m.nbtName] ?? 0, m.count), 0);
}

/** Wiki texture URL for a block nbtName (strips minecraft: prefix) */
function blockIconUrl(nbtName: string): string {
  const simple = nbtName.replace(/^minecraft:/, '');
  const title = simple.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_');
  return `https://minecraft.wiki/w/Special:FilePath/${title}.png`;
}

// Snake-reveal canvas
function drawSnakeReveal(canvas: HTMLCanvasElement, colorData: ImageData, pct: number) {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const total    = width * height;
  const revealed = Math.floor(total * Math.min(pct, 100) / 100);
  const src = colorData.data;
  const out = ctx.createImageData(width, height);
  const dst = out.data;

  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / width);
    const col = row % 2 === 0 ? i % width : width - 1 - (i % width);
    const si  = (row * width + col) * 4;
    if (i < revealed) {
      dst[si] = src[si]; dst[si+1] = src[si+1]; dst[si+2] = src[si+2]; dst[si+3] = src[si+3];
    } else {
      const g = Math.round(0.299*src[si] + 0.587*src[si+1] + 0.114*src[si+2]);
      dst[si] = g; dst[si+1] = g; dst[si+2] = g; dst[si+3] = src[si+3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

// ─── Material row ─────────────────────────────────────────────────────────────
interface RowProps {
  mat: SessionMaterial;
  value: number;
  onChange: (nbtName: string, val: number) => void;
  accentColor: string;
  lang: Lang;
  perMapTarget: number; // effective target (total or per-map)
}

function MaterialRow({ mat, value, onChange, accentColor, lang, perMapTarget }: RowProps) {
  const [addVal, setAddVal] = useState('');
  const pct  = Math.min(100, (value / perMapTarget) * 100);
  const done = value >= perMapTarget;

  function handleAdd() {
    const delta = parseInt(addVal) || 0;
    if (delta === 0) return;
    onChange(mat.nbtName, Math.min(mat.count, Math.max(0, value + delta)));
    setAddVal('');
  }
  function handleSub() {
    const delta = parseInt(addVal) || 0;
    if (delta === 0) return;
    onChange(mat.nbtName, Math.max(0, value - delta));
    setAddVal('');
  }

  return (
    <div className={`bt-row${done ? ' bt-row--done' : ''}`} role="row">
      {/* Name + icon */}
      <div className="bt-cell" role="cell">
        <img
          className="bt-block-icon"
          src={blockIconUrl(mat.nbtName)}
          alt=""
          loading="lazy"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <span className="bt-row-name">{mat.displayName}</span>
        {done && <span className="bt-row-check"><IconGlyph icon={mkIcons.check} /></span>}
      </div>

      {/* Need */}
      <div className="bt-cell" role="cell" data-label={t('colNeed', lang)}>
        <span className="bt-row-need">{fmtStacks(perMapTarget, lang)}</span>
      </div>

      {/* Progress bar */}
      <div className="bt-cell bt-bar-cell" role="cell" data-label={t('colProgress', lang)}>
        <div className="bt-bar-top">
          <span className="bt-bar-gathered">{value.toLocaleString()}</span>
          <span className="bt-bar-pct">{Math.round(pct)}%</span>
        </div>
        <div className="bt-bar" role="progressbar" aria-label={`${mat.displayName}: ${t('progress', lang)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div className="bt-bar-fill" style={{ width: `${pct}%`, background: accentColor }} />
        </div>
      </div>

      {/* Controls */}
      <div className="bt-cell bt-controls-cell" role="cell" data-label={t('colAction', lang)}>
        <span className="bt-row-total">{value}</span>
        <input
          className="bt-row-add-input"
          type="number"
          placeholder="N"
          value={addVal}
          aria-label={lang === 'ru' ? `Изменение количества: ${mat.displayName}` : `Amount change: ${mat.displayName}`}
          onChange={e => setAddVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button className="bt-row-sub-btn" onClick={handleSub} title="Убрать / Remove" aria-label="Убрать / Remove"><IconGlyph icon={mkIcons.minus} /></button>
        <button className="bt-row-add-btn" onClick={handleAdd} title="Добавить / Add" aria-label="Добавить / Add"><IconGlyph icon={mkIcons.plus} /></button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function BuildTracker({ sessionId }: { sessionId: string }) {
  useEffect(() => {
    applyPageMeta({
      title: 'MapKluss Build Tracker',
      description: 'Shared build tracker session for Minecraft map art.',
      url: window.location.href,
      robots: 'noindex,nofollow',
    });
  }, []);

  const [session,     setSession]     = useState<BuildSession | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [actionError, setActionError] = useState('');
  const [switching,   setSwitching]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [gathered,    setGathered]    = useState<Record<string, number>>({});
  const [placed,      setPlaced]      = useState<Record<string, number>>({});
  const [lang, setLang] = useState<Lang>(() =>
    (() => {
      try { return (localStorage.getItem('bt_lang') as Lang) ?? 'ru'; }
      catch { return 'ru'; }
    })()
  );

  const [perMapMode, setPerMapMode] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!showConfirm) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !switching) setShowConfirm(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showConfirm, switching]);

  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const colorRef   = useRef<ImageData | null>(null);
  const pctRef     = useRef(0);
  const modeRef    = useRef<'gathering' | 'building'>('gathering');

  function toggleLang() {
    const next: Lang = lang === 'ru' ? 'en' : 'ru';
    setLang(next);
    try { localStorage.setItem('bt_lang', next); } catch { /* Language still changes without storage. */ }
  }

  function initCanvas(src: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      colorRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      drawSnakeReveal(canvas, colorRef.current, modeRef.current === 'building' ? pctRef.current : 100);
    };
    img.src = src;
  }

  useEffect(() => {
    getSession(sessionId)
      .then(s => {
        setSession(s);
        setGathered(s.gathered);
        setPlaced(s.placed);
        modeRef.current = s.mode;
        setLoading(false);
        setTimeout(() => initCanvas(s.image_preview), 50);
      })
      .catch(() => { setError('not_found'); setLoading(false); });

    let unsub = () => {};
    try {
      unsub = subscribeSession(sessionId, s => {
        setSession(s);
        setGathered(s.gathered);
        setPlaced(s.placed);
        modeRef.current = s.mode;
      });
    } catch {
      setError('not_found');
      setLoading(false);
    }
    return () => unsub();
  }, [sessionId]);

  const debounceSave = useCallback((g: Record<string, number>, p: Record<string, number>, mode: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const request = mode === 'gathering' ? updateGathered(sessionId, g) : updatePlaced(sessionId, p);
      request.then(() => setActionError(''), () => setActionError(t('saveError', lang)));
    }, 500);
  }, [lang, sessionId]);

  function handleGatheredChange(nbtName: string, val: number) {
    const next = { ...gathered, [nbtName]: val };
    setGathered(next);
    debounceSave(next, placed, 'gathering');
  }
  function handlePlacedChange(nbtName: string, val: number) {
    const next = { ...placed, [nbtName]: val };
    setPlaced(next);
    debounceSave(gathered, next, 'building');
  }

  async function handleSwitch() {
    setSwitching(true);
    setActionError('');
    try {
      await switchToBuilding(sessionId);
      setSession(s => s ? { ...s, mode: 'building' } : s);
      modeRef.current = 'building';
    } catch (err) {
      console.error(err);
      setActionError(t('switchError', lang));
    }
    finally { setSwitching(false); setShowConfirm(false); }
  }

  function handleDownloadLitematic() {
    const s = session;
    if (!s?.litematic_b64) return;
    const bytes = base64ToBytes(s.litematic_b64);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${s.info?.title || 'MapArt'}_2d.litematic`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return (
    <div className="public-shell">
      <PublicSiteHeader active="cloud" lang={lang} onToggleLanguage={toggleLang} />
      <main className="bt-page bt-page--loading" aria-busy="true">
        <div className="bt-loading-mark" aria-hidden="true" />
        <p role="status">{t('loading', lang)}</p>
      </main>
    </div>
  );
  if (error) return (
    <div className="public-shell">
      <PublicSiteHeader active="cloud" lang={lang} onToggleLanguage={toggleLang} />
      <main className="bt-page bt-page--error">
        <p role="alert"><IconGlyph icon={mkIcons.alert} /> {t('notFound', lang)}</p>
        <div className="bt-error-actions">
          <button type="button" onClick={() => window.location.reload()}>{t('retry', lang)}</button>
          <a href="/" className="bt-back-link"><IconGlyph icon={mkIcons.arrowLeft} /> {t('back', lang)}</a>
        </div>
      </main>
    </div>
  );

  const s       = session!;
  const mode    = s.mode;
  const record  = mode === 'gathering' ? gathered : placed;
  const total   = totalBlocks(s.materials);
  const done    = totalDone(record, s.materials);
  const pctDone = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  pctRef.current = pctDone;

  // Update canvas: gathering = full color, building = snake reveal by progress
  if (canvasRef.current && colorRef.current) {
    drawSnakeReveal(canvasRef.current, colorRef.current, mode === 'building' ? pctDone : 100);
  }

  const accent = mode === 'gathering' ? 'var(--color-accent)' : 'var(--color-warning)';
  const info   = s.info ?? {};

  return (
    <div className="public-shell">
      <PublicSiteHeader active="cloud" lang={lang} onToggleLanguage={toggleLang} />
      <main className="bt-page">
      {/* Top bar */}
      <header className="bt-topbar">
        <a href="/" className="bt-back-link"><IconGlyph icon={mkIcons.arrowLeft} /> {t('back', lang)}</a>
        <div className="bt-topbar-title">{t('tracker', lang)}</div>
        <div className="bt-topbar-spacer" />
        <span className={`bt-tag bt-tag--mode-${mode}`}><IconGlyph icon={mode === 'gathering' ? mkIcons.pickaxe : mkIcons.hammer} /> {t(mode, lang)}</span>
      </header>

      {/* Project card */}
      <div className="bt-project-card">
        {/* Preview */}
        <div className="bt-project-preview">
          <canvas ref={canvasRef} />
        </div>

        {/* Main info */}
        <div className="bt-project-main">
          <div className="bt-project-title">
            {info.title || t('tracker', lang)}
          </div>
          <div className="bt-project-tags">
            <span className={`bt-tag bt-tag--mode-${mode}`}>
              <IconGlyph icon={mode === 'gathering' ? mkIcons.pickaxe : mkIcons.hammer} /> {t(mode, lang)}
            </span>
          </div>
          <div className="bt-project-meta-grid">
            {info.server && (
              <div className="bt-meta-item">
                <span className="bt-meta-label">{t('server', lang)}</span>
                <span className="bt-meta-value">{info.server}</span>
              </div>
            )}
            {info.coords && (
              <div className="bt-meta-item">
                <span className="bt-meta-label">{t('coords', lang)}</span>
                <span className="bt-meta-value">{info.coords}</span>
              </div>
            )}
            <div className="bt-meta-item">
              <span className="bt-meta-label">{t('maps', lang)}</span>
              <span className="bt-meta-value">{s.map_grid.wide}×{s.map_grid.tall}</span>
            </div>
            {info.description && (
              <div className="bt-meta-item bt-meta-item--wide">
                <span className="bt-meta-label">{t('notes', lang)}</span>
                <span className="bt-meta-value">{info.description}</span>
              </div>
            )}
          </div>

          {s.litematic_b64 && (
            <button className="bt-download-lite" onClick={handleDownloadLitematic}>
              <IconGlyph icon={mkIcons.package} /> {t('downloadLite', lang)}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="bt-project-stats">
          <div className="bt-stats-title">{t('statsTitle', lang)}</div>
          <div className="bt-stat-block">
            <div className="bt-stats-big">{s.materials.length}</div>
            <div className="bt-stats-sub">{t('blockTypes', lang)}</div>
          </div>
          <div className="bt-stat-block">
            <div className="bt-stats-big" style={{ fontSize: 18 }}>{total.toLocaleString()}</div>
            <div className="bt-stats-sub">{t('blocksTotal', lang)}</div>
          </div>
          <div className="bt-stat-block">
            <div className="bt-stats-progress-label">
              <span>{t('progress', lang)}</span>
              <span className="bt-stats-pct" style={{ color: accent }}>{Math.round(pctDone)}%</span>
            </div>
            <div className="bt-stats-bar" role="progressbar" aria-label={t('progress', lang)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pctDone)}>
              <div
                className={`bt-stats-bar-fill bt-stats-bar-fill--${mode}`}
                style={{ width: `${pctDone}%` }}
              />
            </div>
            <div className="bt-stats-done-count" style={{ color: accent }}>
              {done.toLocaleString()} / {total.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Mode switch */}
      <div className="bt-switch-wrap">
        {mode === 'gathering' ? (
          <button className="bt-switch-btn" onClick={() => setShowConfirm(true)} disabled={switching}>
            <IconGlyph icon={mkIcons.hammer} /> {t('switchBtn', lang)}
          </button>
        ) : (
          <div className="bt-mode-badge"><IconGlyph icon={mkIcons.hammer} /> {t('modeBadge', lang)}</div>
        )}
        {actionError && <p className="bt-error bt-action-error">{actionError}</p>}
      </div>

      {/* Table */}
      <div className="bt-table-section">
        <div className="bt-table-toolbar">
          <span className="bt-table-toolbar-title">{t('tableTitle', lang)}</span>
          <span className="bt-table-count">{s.materials.length} {t('blockTypes', lang)}</span>
          <div className="bt-toolbar-spacer" />
          <button
            className={`bt-per-map-btn${perMapMode ? ' bt-per-map-btn--active' : ''}`}
            aria-pressed={perMapMode}
            title={lang === 'ru'
              ? `Показать нужное количество на 1 карту из ${s.map_grid.wide * s.map_grid.tall}`
              : `Show needed amount for 1 map out of ${s.map_grid.wide * s.map_grid.tall}`}
            onClick={() => setPerMapMode(v => !v)}
          >
            {perMapMode ? (lang === 'ru' ? 'Все карты' : 'All maps') : `${t('perMap', lang)} (1/${s.map_grid.wide * s.map_grid.tall})`}
          </button>
        </div>
        <div className="bt-table" role="table" aria-label={t('tableTitle', lang)}>
        <div className="bt-table-head" role="row">
          <div className="bt-th" role="columnheader">{t('colBlock', lang)}</div>
          <div className="bt-th" role="columnheader">{t('colNeed', lang)}</div>
          <div className="bt-th" role="columnheader">{t('colProgress', lang)}</div>
          <div className="bt-th" role="columnheader">{mode === 'gathering' ? t('colAction', lang) : t('colActionB', lang)}</div>
        </div>
        <div className="bt-table-body" role="rowgroup">
          {s.materials.map(mat => {
            const totalMaps = s.map_grid.wide * s.map_grid.tall;
            const perMapTarget = perMapMode ? Math.ceil(mat.count / totalMaps) : mat.count;
            return (
            <MaterialRow
              key={mat.nbtName}
              mat={mat}
              value={record[mat.nbtName] ?? 0}
              onChange={mode === 'gathering' ? handleGatheredChange : handlePlacedChange}
              accentColor={accent}
              lang={lang}
              perMapTarget={perMapTarget}
            />
            );
          })}
        </div>
        </div>
      </div>

      {/* Confirm */}
      {showConfirm && (
        <div className="bt-confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="bt-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="bt-confirm-title" onClick={e => e.stopPropagation()}>
            <p className="bt-confirm-title" id="bt-confirm-title">{t('confirmTitle', lang)}</p>
            <p className="bt-confirm-desc">{t('confirmDesc', lang)}</p>
            <div className="bt-confirm-btns">
              <button className="bt-btn bt-btn--cancel" onClick={() => setShowConfirm(false)} autoFocus>
                {t('cancel', lang)}
              </button>
              <button className="bt-btn bt-btn--confirm" onClick={handleSwitch} disabled={switching}>
                {switching ? t('switching', lang) : t('confirmYes', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
