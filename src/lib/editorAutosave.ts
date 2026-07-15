import { useCallback, useEffect, useRef, useState } from 'react';
import type { Layer } from './layers';
import { deleteAutosave, loadAutosave, saveAutosave } from './projectStorage';
import { useLocale } from './useLocale';
import { VERSION } from '../version';

const AUTOSAVE_DELAY_MS = 2_000;
const AUTOSAVE_MAX_BYTES = 128 * 1024 * 1024;
const AUTOSAVE_QUOTA_SHARE = 0.25;
const AUTOSAVE_METADATA_ALLOWANCE = 1024 * 1024;

const EXPLICIT_EDITOR_PARAMS = [
  'cloudFolder',
  'companionImport',
  'artVersion',
  'art',
  'example',
] as const;

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'restored' | 'too-large' | 'error';

export interface EditorAutosaveState {
  status: AutosaveStatus;
  savedAt: number | null;
  ready: boolean;
}

interface UseEditorAutosaveOptions {
  hasContent: boolean;
  processing: boolean;
  serializeProject: () => string;
  estimateBytes: () => number;
  restoreProject: (data: string, successMessage?: string) => Promise<boolean>;
  notify: (message: string, kind?: 'info' | 'error') => void;
}

export function shouldRestoreEditorAutosave(pathname: string, search: string): boolean {
  if (pathname !== '/' && pathname !== '/index.html') return false;
  const params = new URLSearchParams(search);
  return !EXPLICIT_EDITOR_PARAMS.some(key => params.has(key));
}

export function estimateAutosaveSnapshotBytes(layers: Layer[], originalData: ImageData | null): number {
  let rawImageBytes = originalData?.data.byteLength ?? 0;
  let storedStringBytes = 0;
  for (const layer of layers) {
    rawImageBytes += layer.imageData?.data.byteLength ?? 0;
    storedStringBytes += (layer.sourceDataUrl?.length ?? 0) * 2;
    storedStringBytes += (layer.name.length + (layer.text?.value.length ?? 0)) * 2;
  }
  const base64Bytes = Math.ceil(rawImageBytes * 4 / 3);
  return base64Bytes + storedStringBytes + AUTOSAVE_METADATA_ALLOWANCE;
}

export function autosaveFitsBudget(
  estimatedBytes: number,
  quota?: number,
  usage?: number,
): boolean {
  const available = quota === undefined
    ? AUTOSAVE_MAX_BYTES
    : Math.max(0, quota - (usage ?? 0));
  const budget = Math.min(AUTOSAVE_MAX_BYTES, available * AUTOSAVE_QUOTA_SHARE);
  return estimatedBytes <= budget;
}

export function useEditorAutosave(options: UseEditorAutosaveOptions): EditorAutosaveState {
  const { t } = useLocale();
  const latestRef = useRef(options);
  latestRef.current = options;
  const restoreAllowedRef = useRef<boolean | null>(null);
  if (restoreAllowedRef.current === null) {
    restoreAllowedRef.current = shouldRestoreEditorAutosave(window.location.pathname, window.location.search);
  }
  const restoreStartedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const hadContentRef = useRef(false);
  const tooLargeNotifiedRef = useRef(false);
  const [state, setState] = useState<EditorAutosaveState>({
    status: 'idle',
    savedAt: null,
    ready: false,
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(async () => {
    const current = latestRef.current;
    if (!current.hasContent || current.processing) return;
    clearTimer();
    const generation = ++generationRef.current;
    setState(previous => ({ ...previous, status: 'saving' }));

    try {
      const estimatedBytes = current.estimateBytes();
      let quota: number | undefined;
      let usage: number | undefined;
      try {
        const estimate = await navigator.storage?.estimate?.();
        quota = estimate?.quota;
        usage = estimate?.usage;
      } catch {
        // The fixed safety ceiling still applies when quota estimation is unavailable.
      }

      if (!autosaveFitsBudget(estimatedBytes, quota, usage)) {
        if (generation === generationRef.current) {
          setState(previous => ({ ...previous, status: 'too-large' }));
        }
        if (!tooLargeNotifiedRef.current) {
          tooLargeNotifiedRef.current = true;
          current.notify(t(
            'Проект слишком большой для безопасного автосохранения. Предыдущее сохранение оставлено.',
            'This project is too large for safe autosave. The previous autosave was kept.',
          ), 'error');
        }
        return;
      }

      const data = current.serializeProject();
      const savedAt = Date.now();
      const write = writeChainRef.current
        .catch(() => undefined)
        .then(() => saveAutosave({
          savedAt,
          appVersion: VERSION,
          estimatedBytes,
          data,
        }));
      writeChainRef.current = write;
      await write;
      tooLargeNotifiedRef.current = false;
      if (generation === generationRef.current) {
        setState({ status: 'saved', savedAt, ready: true });
      }
    } catch (error) {
      console.error('Editor autosave failed', error);
      if (generation === generationRef.current) {
        setState(previous => ({ ...previous, status: 'error' }));
      }
      current.notify(t(
        'Не удалось автоматически сохранить работу. Предыдущее сохранение не удалено.',
        'Could not autosave the project. The previous autosave was not removed.',
      ), 'error');
    }
  }, [clearTimer, t]);

  useEffect(() => {
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;

    if (!restoreAllowedRef.current) {
      setState(previous => ({ ...previous, ready: true }));
      return;
    }

    void (async () => {
      try {
        const record = await loadAutosave();
        if (!record) return;
        const restored = await latestRef.current.restoreProject(
          record.data,
          t('Автосохранённая работа восстановлена.', 'Autosaved work restored.'),
        );
        if (!restored) {
          await deleteAutosave();
          setState({ status: 'error', savedAt: null, ready: true });
          latestRef.current.notify(t(
            'Повреждённое автосохранение удалено. Именованные проекты не затронуты.',
            'The corrupted autosave was removed. Named projects were not affected.',
          ), 'error');
          return;
        }
        hadContentRef.current = true;
        setState({ status: 'restored', savedAt: record.savedAt, ready: true });
      } catch (error) {
        console.error('Editor autosave restore failed', error);
        setState({ status: 'error', savedAt: null, ready: true });
        latestRef.current.notify(t(
          'Не удалось прочитать автосохранение. Именованные проекты не затронуты.',
          'Could not read the autosave. Named projects were not affected.',
        ), 'error');
      } finally {
        setState(previous => previous.ready ? previous : { ...previous, ready: true });
      }
    })();
  }, [t]);

  useEffect(() => {
    if (!state.ready) return;
    clearTimer();

    if (!options.hasContent) {
      if (hadContentRef.current) {
        hadContentRef.current = false;
        generationRef.current += 1;
        void deleteAutosave().catch(error => console.error('Could not clear editor autosave', error));
        setState({ status: 'idle', savedAt: null, ready: true });
      }
      return;
    }

    hadContentRef.current = true;
    if (options.processing) return;
    setState(previous => ({ ...previous, status: 'pending' }));
    timerRef.current = window.setTimeout(() => { void flush(); }, AUTOSAVE_DELAY_MS);
    return clearTimer;
  }, [clearTimer, flush, options.hasContent, options.processing, options.serializeProject, options.estimateBytes, state.ready]);

  useEffect(() => {
    const flushPending = () => {
      if (!state.ready || !latestRef.current.hasContent || latestRef.current.processing) return;
      clearTimer();
      void flush();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', flushPending);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', flushPending);
    };
  }, [clearTimer, flush, state.ready]);

  return state;
}
