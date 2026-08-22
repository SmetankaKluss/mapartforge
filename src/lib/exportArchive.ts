import { uploadCompanionArtifactBlob, type CompanionArtifactUploadTarget } from './companionArtifactUpload';
import { sha256Hex } from './companionArtifacts';
import { getSupabaseClient } from './supabase';

type ArchiveContext = {
  preview: ImageData;
  accessToken: string;
  session: ArchiveSession | null;
  sessionPromise: Promise<ArchiveSession | null> | null;
  previewArchived: boolean;
  disabled: boolean;
};

type ArchiveSession = {
  id: string;
  expiresAt: string;
};

type PrepareResponse = {
  artifactId?: string;
  uploadTarget?: CompanionArtifactUploadTarget;
};

let currentContext: ArchiveContext | null = null;
let archiveQueue: Promise<void> = Promise.resolve();

function imageDataToPngBlob(imageData: ImageData): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('export_archive_canvas_unavailable'));
      return;
    }
    context.putImageData(imageData, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('export_archive_preview_unavailable'));
    }, 'image/png');
  });
}

function newId(): string {
  return crypto.randomUUID();
}

function newAccessToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function exportArchiveClientKey(): string {
  const storageKey = 'mapkluss_export_archive_client';
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const created = newId();
    window.localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return newId();
  }
}

async function startArchiveSession(context: ArchiveContext): Promise<ArchiveSession | null> {
  if (context.disabled) return null;
  if (context.session) return context.session;
  if (context.sessionPromise) return context.sessionPromise;

  context.sessionPromise = (async () => {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.functions.invoke<{
        sessionId?: string;
        expiresAt?: string;
      }>('companion-export-archive', {
        body: {
          action: 'session_start',
          client_key: exportArchiveClientKey(),
          access_token: context.accessToken,
        },
      });
      if (error || !data?.sessionId || !data.expiresAt) {
        context.disabled = true;
        return null;
      }
      context.session = { id: data.sessionId, expiresAt: data.expiresAt };
      return context.session;
    } catch {
      context.disabled = true;
      return null;
    } finally {
      context.sessionPromise = null;
    }
  })();
  return context.sessionPromise;
}

async function archiveFile(
  context: ArchiveContext,
  session: ArchiveSession,
  kind: 'preview' | 'export',
  filename: string,
  blob: Blob,
): Promise<void> {
  if (context.disabled || blob.size === 0) return;
  const fileId = newId();
  const contentType = blob.type || 'application/octet-stream';
  const sha256 = await sha256Hex(blob);
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<PrepareResponse>('companion-export-archive', {
    body: {
      action: 'file_prepare',
      session_id: session.id,
      access_token: context.accessToken,
      file_id: fileId,
      kind,
      filename,
      content_type: contentType,
      size_bytes: blob.size,
      sha256,
    },
  });
  if (error || !data?.artifactId || !data.uploadTarget) {
    context.disabled = true;
    return;
  }
  await uploadCompanionArtifactBlob(data.artifactId, blob, data.uploadTarget);
  const { error: completeError } = await client.functions.invoke('companion-export-archive', {
    body: {
      action: 'file_complete',
      session_id: session.id,
      access_token: context.accessToken,
      file_id: data.artifactId,
    },
  });
  if (completeError) context.disabled = true;
}

async function archivePreviewIfNeeded(context: ArchiveContext, session: ArchiveSession): Promise<void> {
  if (context.previewArchived) return;
  context.previewArchived = true;
  const preview = await imageDataToPngBlob(context.preview);
  await archiveFile(context, session, 'preview', 'preview.png', preview);
}

/**
 * ExportPanel owns this context. A new rendered ImageData starts a new private
 * archive session; ordinary re-renders keep downloaded formats together.
 */
export function setExportArchivePreview(preview: ImageData | null): void {
  if (!preview) {
    currentContext = null;
    return;
  }
  if (currentContext?.preview === preview) return;
  currentContext = {
    preview,
    accessToken: newAccessToken(),
    session: null,
    sessionPromise: null,
    previewArchived: false,
    disabled: false,
  };
}

/**
 * Intentionally best-effort: browser download is already complete before this
 * work starts, and storage errors must never block a local export.
 */
export function archiveDownloadedExport(blob: Blob, filename: string): void {
  const context = currentContext;
  if (!context || context.disabled) return;
  archiveQueue = archiveQueue
    .catch(() => undefined)
    .then(async () => {
      const session = await startArchiveSession(context);
      if (!session) return;
      await archivePreviewIfNeeded(context, session);
      if (!context.disabled) await archiveFile(context, session, 'export', filename, blob);
    })
    .catch(() => {
      context.disabled = true;
    });
}

export function resetExportArchiveForTests(): void {
  currentContext = null;
  archiveQueue = Promise.resolve();
}
