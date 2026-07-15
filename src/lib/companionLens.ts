import { getSupabaseClient } from './supabase';

export const LENS_API_VERSION = 1 as const;

export type LensStatus = 'active' | 'offline' | 'closed' | 'expired';
export type LensMapMode = '2d' | '3d';
export type LensTileResolution = 16 | 32 | 64 | 128;

export interface LensGrid {
  wide: number;
  tall: number;
}

export interface LensRealtimeConfig {
  websocketUrl: string;
  apiKey: string;
  topic: string;
}

export interface LensSession {
  sessionId: string;
  title: string;
  status: LensStatus;
  grid: LensGrid;
  mapMode: LensMapMode;
  revision: number;
  tileResolution: LensTileResolution;
  previewWidth: number;
  previewHeight: number;
  viewerCount: number;
  editorLastSeenAt: string;
  expiresAt: string;
  sessionCode?: string;
  ownedByUser: boolean;
  realtime?: LensRealtimeConfig;
}

export interface LensCapabilities {
  apiVersion: 1;
  enabled: boolean;
  limits?: Record<string, number>;
  timing?: Record<string, number>;
}

export interface LensSessionResponse {
  apiVersion: 1;
  session: LensSession;
  publisherLease?: string;
}

export type LensErrorCode =
  | 'lens_disabled'
  | 'unauthorized'
  | 'publisher_required'
  | 'not_found'
  | 'forbidden'
  | 'revision_conflict'
  | 'session_gone'
  | 'invalid_preview'
  | 'preview_too_large'
  | 'rate_limited'
  | 'invalid_request';

export class CompanionLensError extends Error {
  readonly code: LensErrorCode | string;
  readonly retryAfterMs?: number;

  constructor(
    code: LensErrorCode | string,
    message?: string,
    retryAfterMs?: number,
  ) {
    super(message || code);
    this.name = 'CompanionLensError';
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

interface LensErrorPayload {
  error?: string;
  message?: string;
  retryAfterMs?: number;
}

async function unwrapLensResponse<T>(data: T | LensErrorPayload | null, error: unknown): Promise<T> {
  if (error && typeof error === 'object') {
    const functionError = error as {
      message?: string;
      context?: { json?: () => Promise<unknown>; text?: () => Promise<string> };
    };
    if (functionError.context?.json) {
      try {
        const payload = await functionError.context.json() as LensErrorPayload;
        if (payload?.error) throw new CompanionLensError(payload.error, payload.message, payload.retryAfterMs);
      } catch (contextError) {
        if (contextError instanceof CompanionLensError) throw contextError;
      }
    }
    throw new CompanionLensError('request_failed', functionError.message || 'Lens request failed.');
  }
  const payload = data as LensErrorPayload | null;
  if (payload?.error) throw new CompanionLensError(payload.error, payload.message, payload.retryAfterMs);
  if (!data) throw new CompanionLensError('invalid_response', 'Lens returned an empty response.');
  return data as T;
}

async function invokeJson<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke('companion-lens', {
    body: { principalKind: 'website', ...body },
  });
  return await unwrapLensResponse<T>(data, error);
}

export async function getLensCapabilities(): Promise<LensCapabilities> {
  return invokeJson<LensCapabilities>({ action: 'capabilities' });
}

export async function startLensSession(input: {
  title: string;
  grid: LensGrid;
  mapMode: LensMapMode;
}): Promise<LensSessionResponse> {
  return invokeJson<LensSessionResponse>({ action: 'session_start', ...input });
}

export async function getLensSessionStatus(sessionId: string, publisherLease: string): Promise<LensSessionResponse> {
  return invokeJson<LensSessionResponse>({ action: 'session_status', sessionId, publisherLease });
}

export async function reacquireLensSession(sessionId: string): Promise<LensSessionResponse> {
  return invokeJson<LensSessionResponse>({ action: 'session_reacquire', sessionId });
}

export async function rotateLensSessionCode(
  sessionId: string,
  publisherLease: string,
): Promise<LensSessionResponse> {
  return invokeJson<LensSessionResponse>({ action: 'session_rotate_code', sessionId, publisherLease });
}

export async function closeLensSession(
  sessionId: string,
  publisherLease: string,
): Promise<{ apiVersion: 1; stale?: boolean }> {
  return invokeJson<{ apiVersion: 1; stale?: boolean }>({ action: 'session_close', sessionId, publisherLease });
}

export async function publishLensPreview(input: {
  sessionId: string;
  baseRevision: number;
  title: string;
  grid: LensGrid;
  mapMode: LensMapMode;
  tileResolution: LensTileResolution;
  sha256: string;
  preview: Blob;
  publisherLease: string;
}): Promise<LensSessionResponse> {
  const form = new FormData();
  form.set('action', 'session_publish');
  form.set('principalKind', 'website');
  form.set('sessionId', input.sessionId);
  form.set('baseRevision', String(input.baseRevision));
  form.set('title', input.title);
  form.set('gridWide', String(input.grid.wide));
  form.set('gridTall', String(input.grid.tall));
  form.set('mapMode', input.mapMode);
  form.set('tileResolution', String(input.tileResolution));
  form.set('sha256', input.sha256);
  form.set('publisherLease', input.publisherLease);
  form.set('preview', input.preview, 'preview.png');
  const { data, error } = await getSupabaseClient().functions.invoke('companion-lens', { body: form });
  return await unwrapLensResponse<LensSessionResponse>(data, error);
}
