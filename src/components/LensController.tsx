import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';
import {
  closeLensSession,
  CompanionLensError,
  getLensSessionStatus,
  publishLensPreview,
  reacquireLensSession,
  rotateLensSessionCode,
  startLensSession,
  type LensGrid,
  type LensMapMode,
  type LensSession,
  type LensTileResolution,
} from '../lib/companionLens';
import { chooseLensTileResolution, LensPublishQueue } from '../lib/lensPreview';
import { getSupabaseClient } from '../lib/supabase';

interface LensControllerProps {
  imageData: ImageData | null;
  grid: LensGrid;
  mapMode: LensMapMode;
  title: string;
  processing: boolean;
  compareMode: boolean;
  t: (ru: string, en: string) => string;
}

interface PreviewJob {
  imageData: ImageData;
  grid: LensGrid;
  mapMode: LensMapMode;
  title: string;
}

interface WorkerResult {
  id: number;
  blob?: Blob;
  sha256?: string;
  tileResolution?: LensTileResolution;
  error?: string;
}

type LensPhase = 'idle' | 'connecting' | 'live' | 'publishing' | 'offline' | 'error';

const LENS_NETWORK_RETRY_BASE_MS = 2_000;
const LENS_NETWORK_RETRY_MAX_MS = 30_000;
const LENS_STATUS_INTERVAL_MS = 30_000;

function isTerminalSession(session: LensSession): boolean {
  return session.status === 'closed' || session.status === 'expired';
}

function lensErrorMessage(error: unknown, t: LensControllerProps['t']): string {
  if (error instanceof CompanionLensError) {
    if (error.code === 'lens_disabled') return t('Lens пока недоступен.', 'Lens is not available yet.');
    if (error.code === 'unauthorized') return t('Войдите в аккаунт MapKluss.', 'Sign in to your MapKluss account.');
    if (error.code === 'preview_too_large') return t('Превью слишком большое.', 'The preview is too large.');
    if (error.code === 'rate_limited') return t('Слишком часто. Lens повторит попытку.', 'Too many requests. Lens will retry.');
    return error.message;
  }
  return error instanceof Error ? error.message : t('Не удалось подключить Lens.', 'Could not connect Lens.');
}

export function LensController({ imageData, grid, mapMode, title, processing, compareMode, t }: LensControllerProps) {
  const useMockLens = import.meta.env.DEV && new URLSearchParams(window.location.search).get('lensMock') === '1';
  const [expanded, setExpanded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<LensSession | null>(null);
  const [phase, setPhase] = useState<LensPhase>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const workerIdRef = useRef(0);
  const workerJobsRef = useRef(new Map<number, { resolve: (result: WorkerResult) => void; reject: (error: Error) => void }>());
  const queueRef = useRef<LensPublishQueue<PreviewJob> | null>(null);
  const sessionRef = useRef<LensSession | null>(null);
  const ownerUserIdRef = useRef<string | null>(null);
  const enabledRef = useRef(false);
  const lastPublishKeyRef = useRef<string | null>(null);
  const publisherLeaseRef = useRef<string | null>(null);
  const networkRetryPendingRef = useRef(false);
  const lifecycleEpochRef = useRef(0);
  const statusRequestPendingRef = useRef(false);
  const translateRef = useRef(t);
  translateRef.current = t;

  const adoptSession = useCallback((nextSession: LensSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL('../workers/lensPreview.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerResult>) => {
      const pending = workerJobsRef.current.get(event.data.id);
      if (!pending) return;
      workerJobsRef.current.delete(event.data.id);
      if (event.data.error) pending.reject(new Error(event.data.error));
      else pending.resolve(event.data);
    };
    worker.onerror = () => {
      for (const pending of workerJobsRef.current.values()) pending.reject(new Error('preview_worker_failed'));
      workerJobsRef.current.clear();
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    return worker;
  }, []);

  const preparePreview = useCallback(async (job: PreviewJob): Promise<WorkerResult> => {
    const worker = ensureWorker();
    const id = ++workerIdRef.current;
    const bitmap = await createImageBitmap(job.imageData);
    return new Promise((resolve, reject) => {
      workerJobsRef.current.set(id, { resolve, reject });
      try {
        worker.postMessage({
          id,
          bitmap,
          grid: job.grid,
          tileResolution: chooseLensTileResolution(job.grid),
        }, [bitmap]);
      } catch (error) {
        workerJobsRef.current.delete(id);
        bitmap.close();
        reject(error instanceof Error ? error : new Error('preview_worker_unavailable'));
      }
    });
  }, [ensureWorker]);

  const publishJob = useCallback(async (job: PreviewJob) => {
    const activeSession = sessionRef.current;
    const publisherLease = publisherLeaseRef.current;
    if (!enabledRef.current || !activeSession || !publisherLease) return;
    const epoch = lifecycleEpochRef.current;
    const stillCurrent = () => epoch === lifecycleEpochRef.current
      && enabledRef.current
      && sessionRef.current?.sessionId === activeSession.sessionId
      && publisherLeaseRef.current === publisherLease;
    setPhase('publishing');
    const prepared = await preparePreview(job);
    if (!stillCurrent()) return;
    if (!prepared.blob || !prepared.sha256 || !prepared.tileResolution) {
      throw new Error(prepared.error || 'preview_failed');
    }
    const publishKey = [
      prepared.sha256,
      job.grid.wide,
      job.grid.tall,
      job.mapMode,
      job.title,
    ].join(':');
    if (publishKey === lastPublishKeyRef.current) {
      networkRetryPendingRef.current = false;
      setPhase('live');
      return;
    }
    const publish = (baseRevision: number) => publishLensPreview({
        sessionId: activeSession.sessionId,
        baseRevision,
        title: job.title,
        grid: job.grid,
        mapMode: job.mapMode,
        tileResolution: prepared.tileResolution!,
        sha256: prepared.sha256!,
        preview: prepared.blob!,
        publisherLease,
      });
    let response;
    try {
      response = await publish(activeSession.revision);
    } catch (error) {
      if (!(error instanceof CompanionLensError) || error.code !== 'revision_conflict') throw error;
      const refreshed = await getLensSessionStatus(activeSession.sessionId, publisherLease);
      if (!stillCurrent() || isTerminalSession(refreshed.session)) return;
      adoptSession(refreshed.session);
      response = await publish(refreshed.session.revision);
    }
    if (!stillCurrent() || isTerminalSession(response.session)) return;
    lastPublishKeyRef.current = publishKey;
    networkRetryPendingRef.current = false;
    adoptSession(response.session);
    setPhase('live');
    setErrorMessage('');
  }, [adoptSession, preparePreview]);

  useEffect(() => {
    const queue = new LensPublishQueue<PreviewJob>({
      debounceMs: 350,
      minIntervalMs: 1000,
      publish: publishJob,
      onError: error => {
        networkRetryPendingRef.current = !navigator.onLine
          || error instanceof TypeError
          || (error instanceof CompanionLensError
            && (error.code === 'request_failed' || error.code === 'invalid_response'));
        setPhase(navigator.onLine ? 'error' : 'offline');
        setErrorMessage(lensErrorMessage(error, translateRef.current));
      },
      retryDelay: (error, attempt) => {
        if (error instanceof CompanionLensError && error.code === 'rate_limited') {
          return Math.max(1000, error.retryAfterMs ?? 1000);
        }
        const transient = !navigator.onLine
          || error instanceof TypeError
          || (error instanceof CompanionLensError
            && (error.code === 'request_failed' || error.code === 'invalid_response'));
        return transient
          ? Math.min(LENS_NETWORK_RETRY_MAX_MS, LENS_NETWORK_RETRY_BASE_MS * (2 ** Math.min(attempt, 4)))
          : null;
      },
    });
    queueRef.current = queue;
    return () => {
      queue.clear();
      queueRef.current = null;
    };
  }, [publishJob]);

  useEffect(() => {
    const workerJobs = workerJobsRef.current;
    return () => {
      const activeSession = sessionRef.current;
      const publisherLease = publisherLeaseRef.current;
      if (enabledRef.current && activeSession && publisherLease) {
        void closeLensSession(activeSession.sessionId, publisherLease).catch(() => undefined);
      }
      lifecycleEpochRef.current += 1;
      queueRef.current?.clear();
      enabledRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
      for (const pending of workerJobs.values()) pending.reject(new Error('preview_worker_stopped'));
      workerJobs.clear();
    };
  }, []);

  useEffect(() => {
    if (useMockLens) {
      setUser({ id: 'lens-mock-user' } as User);
      return;
    }
    const supabase = getSupabaseClient();
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, authSession) => {
      const nextUser = authSession?.user ?? null;
      setUser(nextUser);
      if (!nextUser || (ownerUserIdRef.current && ownerUserIdRef.current !== nextUser.id)) {
        lifecycleEpochRef.current += 1;
        enabledRef.current = false;
        queueRef.current?.clear();
        adoptSession(null);
        setPhase('idle');
        lastPublishKeyRef.current = null;
        publisherLeaseRef.current = null;
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, [adoptSession, useMockLens]);

  useEffect(() => {
    if (!enabledRef.current || !imageData || processing || compareMode) return;
    queueRef.current?.enqueue({ imageData, grid, mapMode, title });
  }, [compareMode, grid, imageData, mapMode, processing, title]);

  useEffect(() => {
    if (imageData || useMockLens) return;
    const activeSession = sessionRef.current;
    const publisherLease = publisherLeaseRef.current;
    if (!activeSession || !publisherLease) return;
    lifecycleEpochRef.current += 1;
    enabledRef.current = false;
    queueRef.current?.clear();
    adoptSession(null);
    publisherLeaseRef.current = null;
    lastPublishKeyRef.current = null;
    setPhase('idle');
    void closeLensSession(activeSession.sessionId, publisherLease).catch(() => undefined);
  }, [adoptSession, imageData, useMockLens]);

  const refreshStatus = useCallback(async () => {
    const activeSession = sessionRef.current;
    const publisherLease = publisherLeaseRef.current;
    if (!enabledRef.current || !activeSession || !publisherLease || document.hidden || statusRequestPendingRef.current) return;
    const epoch = lifecycleEpochRef.current;
    statusRequestPendingRef.current = true;
    try {
      const response = await getLensSessionStatus(activeSession.sessionId, publisherLease);
      if (epoch !== lifecycleEpochRef.current || sessionRef.current?.sessionId !== activeSession.sessionId) return;
      if (isTerminalSession(response.session)) {
        lifecycleEpochRef.current += 1;
        enabledRef.current = false;
        queueRef.current?.clear();
        adoptSession(null);
        publisherLeaseRef.current = null;
        lastPublishKeyRef.current = null;
        setPhase('idle');
        setErrorMessage(t('Сессия Lens завершена.', 'The Lens session has ended.'));
        return;
      }
      adoptSession(response.session);
      setPhase('live');
      setErrorMessage('');
    } catch (error) {
      let statusError = error;
      if (
        error instanceof CompanionLensError
        && (error.code === 'publisher_required' || error.code === 'session_gone')
        && user && imageData && !processing && !compareMode
      ) {
        try {
          const response = await reacquireLensSession(activeSession.sessionId);
          if (epoch !== lifecycleEpochRef.current || isTerminalSession(response.session)) return;
          if (!response.publisherLease) throw new Error('publisher_lease_missing');
          ownerUserIdRef.current = user.id;
          publisherLeaseRef.current = response.publisherLease;
          enabledRef.current = true;
          adoptSession({
            ...response.session,
            sessionCode: response.session.sessionCode ?? activeSession.sessionCode,
          });
          lastPublishKeyRef.current = null;
          setPhase('live');
          setErrorMessage('');
          queueRef.current?.enqueue({ imageData, grid, mapMode, title });
          return;
        } catch (reconnectError) {
          statusError = reconnectError;
        }
      }
      if (
        statusError instanceof CompanionLensError
        && (statusError.code === 'session_gone' || statusError.code === 'not_found')
      ) {
        enabledRef.current = false;
        queueRef.current?.clear();
        adoptSession(null);
        publisherLeaseRef.current = null;
        lastPublishKeyRef.current = null;
        setPhase('idle');
        setErrorMessage(t(
          'Предыдущая сессия завершена. Запусти Lens снова.',
          'The previous session ended. Start Lens again.',
        ));
        return;
      }
      setPhase(navigator.onLine ? 'error' : 'offline');
      setErrorMessage(lensErrorMessage(statusError, t));
    } finally {
      statusRequestPendingRef.current = false;
    }
  }, [adoptSession, compareMode, grid, imageData, mapMode, processing, t, title, user]);

  useEffect(() => {
    const timer = window.setInterval(() => void refreshStatus(), LENS_STATUS_INTERVAL_MS);
    const reconnect = () => {
      if (networkRetryPendingRef.current) queueRef.current?.retryNow();
      void refreshStatus();
    };
    const focus = () => void refreshStatus();
    const visibility = () => {
      if (!document.hidden) void refreshStatus();
    };
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [refreshStatus]);

  const start = useCallback(async () => {
    if (!user || !imageData || processing || compareMode) return;
    const epoch = lifecycleEpochRef.current + 1;
    lifecycleEpochRef.current = epoch;
    queueRef.current?.clear();
    setPhase('connecting');
    setErrorMessage('');
    try {
      const response = await startLensSession({ title, grid, mapMode });
      if (epoch !== lifecycleEpochRef.current) {
        if (response.publisherLease) {
          void closeLensSession(response.session.sessionId, response.publisherLease).catch(() => undefined);
        }
        return;
      }
      if (!response.publisherLease) throw new Error('publisher_lease_missing');
      ownerUserIdRef.current = user.id;
      publisherLeaseRef.current = response.publisherLease;
      enabledRef.current = true;
      adoptSession(response.session);
      setPhase('live');
      queueRef.current?.enqueue({ imageData, grid, mapMode, title });
    } catch (error) {
      if (epoch !== lifecycleEpochRef.current) return;
      setPhase('error');
      setErrorMessage(lensErrorMessage(error, t));
    }
  }, [adoptSession, compareMode, grid, imageData, mapMode, processing, t, title, user]);

  const stop = useCallback(async () => {
    const activeSession = sessionRef.current;
    const publisherLease = publisherLeaseRef.current;
    lifecycleEpochRef.current += 1;
    enabledRef.current = false;
    queueRef.current?.clear();
    setPhase('idle');
    adoptSession(null);
    lastPublishKeyRef.current = null;
    publisherLeaseRef.current = null;
    if (activeSession && publisherLease) {
      try {
        await closeLensSession(activeSession.sessionId, publisherLease);
      } catch (error) {
        setErrorMessage(lensErrorMessage(error, t));
      }
    }
  }, [adoptSession, t]);

  const rotate = useCallback(async () => {
    const publisherLease = publisherLeaseRef.current;
    if (!session || !publisherLease) return;
    const epoch = lifecycleEpochRef.current;
    setPhase('connecting');
    try {
      const response = await rotateLensSessionCode(session.sessionId, publisherLease);
      if (epoch !== lifecycleEpochRef.current || sessionRef.current?.sessionId !== session.sessionId) return;
      adoptSession(response.session);
      setPhase('live');
      setCopied(false);
    } catch (error) {
      if (epoch !== lifecycleEpochRef.current) return;
      setPhase('error');
      setErrorMessage(lensErrorMessage(error, t));
    }
  }, [adoptSession, session, t]);

  const copyCode = useCallback(async () => {
    if (!session?.sessionCode) return;
    await navigator.clipboard.writeText(session.sessionCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [session]);

  const blocked = processing || compareMode || !imageData;
  const statusText = phase === 'publishing'
    ? t('Отправка превью…', 'Publishing preview…')
    : phase === 'connecting'
      ? t('Подключение…', 'Connecting…')
      : phase === 'offline'
        ? t('Нет сети', 'Offline')
        : phase === 'error'
          ? t('Нужно переподключить', 'Reconnect needed')
          : session
             ? t(`В эфире · ревизия ${session.revision}`, `Live · revision ${session.revision}`)
             : t('Выключен', 'Off');

  if (!user || (!imageData && !useMockLens)) return null;

  return (
    <div className={`lens-menu-section${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="cloud-action-menu-item lens-menu-toggle"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        role="menuitem"
      >
        <IconGlyph icon={mkIcons.view} />
        <span>Lens</span>
        <span className={`lens-menu-state is-${phase}`}>{statusText}</span>
        <IconGlyph icon={mkIcons.chevronDown} className="lens-menu-chevron" />
      </button>
      {expanded && (
        <section className="lens-panel" aria-label="MapKluss Lens">
          <div className="lens-panel-copy">
            <strong>{t('Превью в Minecraft', 'Preview in Minecraft')}</strong>
            <span>{t('Текущий результат появится поверх рамок.', 'The current result appears over item frames.')}</span>
          </div>
          {!user && <p className="lens-panel-note">{t('Сначала войдите в аккаунт.', 'Sign in to your account first.')}</p>}
          {compareMode && <p className="lens-panel-note">{t('Выйдите из режима сравнения для Lens.', 'Leave compare mode to use Lens.')}</p>}
          {processing && <p className="lens-panel-note">{t('Lens ждёт завершения обработки.', 'Lens is waiting for processing to finish.')}</p>}
          {!imageData && <p className="lens-panel-note">{t('Сначала подготовьте изображение.', 'Prepare an image first.')}</p>}
          {session && (
            <div className="lens-session-status" aria-live="polite">
              <div><span>{t('Статус', 'Status')}</span><strong>{statusText}</strong></div>
              <div><span>{t('Зрители', 'Viewers')}</span><strong>{session.viewerCount}</strong></div>
              <div><span>{t('Атлас', 'Atlas')}</span><strong>{session.grid.wide}×{session.grid.tall} · {session.tileResolution}px</strong></div>
            </div>
          )}
          {session?.sessionCode && (
            <div className="lens-code-row">
              <span>{t('Код приглашения в группу', 'Group invite code')}</span>
              <code>{session.sessionCode}</code>
              <button type="button" onClick={() => void copyCode()}>{copied ? t('Скопировано', 'Copied') : t('Копировать', 'Copy')}</button>
            </div>
          )}
          {errorMessage && <p className="lens-panel-error" role="alert">{errorMessage}</p>}
          <div className="lens-panel-actions">
            {!session ? (
              <button type="button" className="is-primary" onClick={() => void start()} disabled={!user || blocked || phase === 'connecting'}>
                <IconGlyph icon={mkIcons.tourAdvanced} /> {t('Запустить', 'Start')}
              </button>
            ) : (
              <>
                {(phase === 'error' || phase === 'offline') && <button type="button" onClick={() => void refreshStatus()}>{t('Переподключить', 'Reconnect')}</button>}
                <button type="button" onClick={() => void rotate()} disabled={phase === 'connecting'}>{t('Новый код группы', 'New group code')}</button>
                <button type="button" className="is-danger" onClick={() => void stop()}>{t('Остановить', 'Stop')}</button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
