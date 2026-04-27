import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSession, updateGathered, updatePlaced,
  switchToBuilding, subscribeSession,
} from '../lib/buildSession';
import type { BuildSession, SessionMaterial } from '../lib/buildSession';
import '../buildTracker.css';

// ─── i18n ────────────────────────────────────────────────────────────────────
type Lang = 'ru' | 'en';
const T = {
  back:         { ru: '← Назад', en: '← Back' },
  tracker:      { ru: 'ТРЕКЕР ПОСТРОЙКИ', en: 'BUILD TRACKER' },
  loading:      { ru: 'Загрузка…', en: 'Loading…' },
  notFound:     { ru: 'Сессия не найдена.', en: 'Session not found.' },
  gathering:    { ru: '⛏ Сбор ресурсов', en: '⛏ Gathering' },
  building:     { ru: '🏗 Строительство', en: '🏗 Building' },
  statsTitle:   { ru: 'Статистика', en: 'Progress' },
  blockTypes:   { ru: 'видов блоков', en: 'block types' },
  blocksTotal:  { ru: 'блоков всего', en: 'blocks total' },
  progress:     { ru: 'Прогресс', en: 'Progress' },
  switchBtn:    { ru: '🏗 Начать строительство', en: '🏗 Start building' },
  modeBadge:    { ru: '🏗 Режим строительства', en: '🏗 Building mode' },
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
  downloadLite: { ru: '⬇ Схематика (.litematic)', en: '⬇ Schematic (.litematic)' },
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
}

function MaterialRow({ mat, value, onChange, accentColor, lang }: RowProps) {
  const [addVal, setAddVal] = useState('');
  const pct  = Math.min(100, (value / mat.count) * 100);
  const done = value >= mat.count;

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
    <div className={`bt-row${done ? ' bt-row--done' : ''}`}>
      {/* Name + icon */}
      <div className="bt-cell">
        <img
          className="bt-block-icon"
          src={blockIconUrl(mat.nbtName)}
          alt=""
          loading="lazy"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <span className="bt-row-name">{mat.displayName}</span>
        {done && <span className="bt-row-check">✓</span>}
      </div>

      {/* Need */}
      <div className="bt-cell">
        <span className="bt-row-need">{fmtStacks(mat.count, lang)}</span>
      </div>

      {/* Progress bar */}
      <div className="bt-cell bt-bar-cell">
        <div className="bt-bar-top">
          <span className="bt-bar-gathered">{value.toLocaleString()}</span>
          <span className="bt-bar-pct">{Math.round(pct)}%</span>
        </div>
        <div className="bt-bar">
          <div className="bt-bar-fill" style={{ width: `${pct}%`, background: accentColor }} />
        </div>
      </div>

      {/* Controls */}
      <div className="bt-cell bt-controls-cell">
        <span className="bt-row-total">{value}</span>
        <input
          className="bt-row-add-input"
          type="number"
          placeholder="N"
          value={addVal}
          onChange={e => setAddVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button className="bt-row-sub-btn" onClick={handleSub} title="Убрать / Remove">–</button>
        <button className="bt-row-add-btn" onClick={handleAdd} title="Добавить / Add">+</button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function BuildTracker({ sessionId }: { sessionId: string }) {
  const [session,     setSession]     = useState<BuildSession | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [switching,   setSwitching]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [gathered,    setGathered]    = useState<Record<string, number>>({});
  const [placed,      setPlaced]      = useState<Record<string, number>>({});
  const [lang, setLang] = useState<Lang>(() =>
    (localStorage.getItem('bt_lang') as Lang) ?? 'ru'
  );

  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const colorRef   = useRef<ImageData | null>(null);
  const pctRef     = useRef(0);
  const modeRef    = useRef<'gathering' | 'building'>('gathering');

  function toggleLang() {
    const next: Lang = lang === 'ru' ? 'en' : 'ru';
    setLang(next);
    localStorage.setItem('bt_lang', next);
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
      drawSnakeReveal(canvas, colorRef.current, modeRef.current === 'building' ? pctRef.current : 0);
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

    const unsub = subscribeSession(sessionId, s => {
      setSession(s);
      setGathered(s.gathered);
      setPlaced(s.placed);
      modeRef.current = s.mode;
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const debounceSave = useCallback((g: Record<string, number>, p: Record<string, number>, mode: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (mode === 'gathering') updateGathered(sessionId, g).catch(console.error);
      else updatePlaced(sessionId, p).catch(console.error);
    }, 500);
  }, [sessionId]);

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
    try {
      await switchToBuilding(sessionId);
      setSession(s => s ? { ...s, mode: 'building' } : s);
      modeRef.current = 'building';
    } catch { alert('Error'); }
    finally { setSwitching(false); setShowConfirm(false); }
  }

  function handleDownloadLitematic() {
    const s = session;
    if (!s?.litematic_b64) return;
    const binary = atob(s.litematic_b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${s.info?.title || 'MapArt'}_2d.litematic`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return (
    <div className="bt-page bt-page--loading">
      <div className="bt-spinner" />
      <p>{t('loading', lang)}</p>
    </div>
  );
  if (error) return (
    <div className="bt-page bt-page--error">
      <p>⚠ {t('notFound', lang)}</p>
      <a href="/" className="bt-back-link">{t('back', lang)}</a>
    </div>
  );

  const s       = session!;
  const mode    = s.mode;
  const record  = mode === 'gathering' ? gathered : placed;
  const total   = totalBlocks(s.materials);
  const done    = totalDone(record, s.materials);
  const pctDone = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  pctRef.current = pctDone;

  // Update canvas
  if (canvasRef.current && colorRef.current) {
    drawSnakeReveal(canvasRef.current, colorRef.current, mode === 'building' ? pctDone : 0);
  }

  const accent = mode === 'gathering' ? '#57FF6E' : '#FFD700';
  const info   = s.info ?? {};

  return (
    <div className="bt-page">
      {/* Top bar */}
      <div className="bt-topbar">
        <a href="/" className="bt-back-link">{t('back', lang)}</a>
        <div className="bt-topbar-title">{t('tracker', lang)}</div>
        <div className="bt-topbar-spacer" />
        <button className="bt-lang-btn" onClick={toggleLang}>
          {lang === 'ru' ? 'EN' : 'RU'}
        </button>
      </div>

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
              {t(mode, lang)}
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
              {t('downloadLite', lang)}
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
            <div className="bt-stats-bar">
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
            {t('switchBtn', lang)}
          </button>
        ) : (
          <div className="bt-mode-badge">{t('modeBadge', lang)}</div>
        )}
      </div>

      {/* Table */}
      <div className="bt-table-section">
        <div className="bt-table-toolbar">
          <span className="bt-table-toolbar-title">{t('tableTitle', lang)}</span>
          <span className="bt-table-count">{s.materials.length} {t('blockTypes', lang)}</span>
          <div className="bt-toolbar-spacer" />
          <button
            className="bt-per-map-btn"
            title={lang === 'ru'
              ? `Установить количество на 1 карту из ${s.map_grid.wide * s.map_grid.tall}`
              : `Set amount for 1 map out of ${s.map_grid.wide * s.map_grid.tall}`}
            onClick={() => {
              const totalMaps = s.map_grid.wide * s.map_grid.tall;
              const next = { ...record };
              s.materials.forEach(m => {
                next[m.nbtName] = Math.ceil(m.count / totalMaps);
              });
              if (mode === 'gathering') { setGathered(next); debounceSave(next, placed, 'gathering'); }
              else { setPlaced(next); debounceSave(gathered, next, 'building'); }
            }}
          >
            {t('perMap', lang)} ({s.map_grid.wide}×{s.map_grid.tall})
          </button>
        </div>
        <div className="bt-table-head">
          <div className="bt-th">{t('colBlock', lang)}</div>
          <div className="bt-th">{t('colNeed', lang)}</div>
          <div className="bt-th">{t('colProgress', lang)}</div>
          <div className="bt-th">{mode === 'gathering' ? t('colAction', lang) : t('colActionB', lang)}</div>
        </div>
        <div className="bt-table-body">
          {s.materials.map(mat => (
            <MaterialRow
              key={mat.nbtName}
              mat={mat}
              value={record[mat.nbtName] ?? 0}
              onChange={mode === 'gathering' ? handleGatheredChange : handlePlacedChange}
              accentColor={accent}
              lang={lang}
            />
          ))}
        </div>
      </div>

      {/* Confirm */}
      {showConfirm && (
        <div className="bt-confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="bt-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="bt-confirm-title">{t('confirmTitle', lang)}</p>
            <p className="bt-confirm-desc">{t('confirmDesc', lang)}</p>
            <div className="bt-confirm-btns">
              <button className="bt-btn bt-btn--cancel" onClick={() => setShowConfirm(false)}>
                {t('cancel', lang)}
              </button>
              <button className="bt-btn bt-btn--confirm" onClick={handleSwitch} disabled={switching}>
                {switching ? t('switching', lang) : t('confirmYes', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
