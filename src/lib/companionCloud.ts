import { getSupabaseClient } from './supabase';
import { companionArtifactFilename, sha256Hex } from './companionArtifacts';
import { buildLitematicBytes, buildLitematicTilesZipBlob } from './exportLitematic';
import type { SupportMode } from './exportLitematic';
import { buildMapDatZipBlob } from './exportMapDat';
import { buildFrameFillCommands, buildFrameFillDatapackFiles } from './exportFrameCommands';
import { countMaterials, formatMaterialsAsCSV, formatMaterialsAsText } from './exportMaterials';
import type { ComputedPalette, DitheringMode, KlussParams } from './dithering';
import type { BlockSelection } from './paletteBlocks';
import type { MapGrid } from './types';
import type { MinecraftVersion } from './versionPresets';
import type { PlatformMode } from './platformMode';
import type {
  CompanionArtifactKind,
  CompanionArtifactManifestEntry,
  ArtPrivacy,
  CompanionArtManifest,
  CompanionArtOverview,
  CompanionArtVersionProject,
  CompanionBuildSession,
  CompanionCollection,
  CompanionCollectionOverview,
  CompanionCloudOverview,
  CompanionLibraryItem,
  CompanionProfileSummary,
  CompanionScanImport,
  CompanionScanUploadResult,
  TelegramAuthPayload,
  CompanionUsageSummary,
} from './companionTypes';
import { normalizeEditableArtPrivacy } from './companionTypes';

const COMPANION_BUCKET = 'mapartforge';
export const MAX_COMPANION_ARTS = 100;
export const MAX_COMPANION_STORAGE_BYTES = 250 * 1024 * 1024;
export const TELEGRAM_LOGIN_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim() ?? '';
export const TELEGRAM_LOGIN_DOMAIN = import.meta.env.VITE_TELEGRAM_LOGIN_DOMAIN?.trim() || 'mapkluss.art';
export const COMPANION_EMAIL_COOLDOWN_MS = 60_000;

export function isTelegramLoginHostAllowed(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  return hostname.toLowerCase().replace(/\.$/, '') === TELEGRAM_LOGIN_DOMAIN.toLowerCase();
}

export interface SaveCompanionArtInput {
  artId?: string;
  title: string;
  privacy?: ArtPrivacy;
  projectJson: string;
  imageData: ImageData;
  previewImageData?: ImageData;
  grid: MapGrid;
  mode: '2d' | '3d';
  staircaseMode: 'classic' | 'optimized';
  supportBlock: string;
  supportMode: SupportMode;
  palette: ComputedPalette;
  blockSelection: BlockSelection;
  minecraftVersion?: MinecraftVersion;
  dithering?: DitheringMode;
  intensity?: number;
  bnScale?: number;
  klussParams?: KlussParams;
  platformMode?: PlatformMode;
}

interface ArtifactPayload {
  kind: CompanionArtifactKind;
  filename: string;
  body: Blob | Uint8Array | string;
  contentType: string;
}

interface ExistingArtSnapshot {
  id: string;
  title: string;
  privacy: ArtPrivacy;
  map_grid: MapGrid;
  map_mode: '2d' | '3d';
  minecraft_version: string | null;
  preview_path: string | null;
  current_version_id: string | null;
  updated_at: string;
}

function requireUuid(): string {
  return crypto.randomUUID();
}

function blobFromImageData(data: ImageData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/png'),
  );
}

function blobFromDatapack(files: ReturnType<typeof buildFrameFillDatapackFiles>): Blob {
  const chunks: string[] = [];
  for (const file of files) {
    chunks.push(`--- ${file.path} ---\n${file.content}\n`);
  }
  return new Blob(chunks, { type: 'text/plain;charset=utf-8' });
}

function bodySize(body: Blob | Uint8Array | string): number {
  if (typeof body === 'string') return new TextEncoder().encode(body).byteLength;
  if (body instanceof Blob) return body.size;
  return body.byteLength;
}

function bodyToBlob(body: Blob | Uint8Array | string, contentType: string): Blob {
  if (body instanceof Blob) return body;
  if (typeof body === 'string') return new Blob([body], { type: contentType });
  return new Blob([new Uint8Array(body).buffer], { type: contentType });
}

async function uploadArtifact(
  ownerId: string,
  artId: string,
  versionId: string,
  payload: ArtifactPayload,
): Promise<CompanionArtifactManifestEntry> {
  const supabase = getSupabaseClient();
  const sizeBytes = bodySize(payload.body);
  const sha256 = await sha256Hex(payload.body);
  const storagePath = `companion/${ownerId}/${artId}/${versionId}/${payload.filename}`;
  const blob = bodyToBlob(payload.body, payload.contentType);
  const { error: uploadError } = await supabase.storage
    .from(COMPANION_BUCKET)
    .upload(storagePath, blob, { contentType: payload.contentType, upsert: true });
  if (uploadError) throw uploadError;

  const artifactId = requireUuid();
  const now = new Date().toISOString();
  const { error: dbError } = await supabase.from('art_artifacts').insert({
    id: artifactId,
    art_id: artId,
    version_id: versionId,
    owner_id: ownerId,
    kind: payload.kind,
    filename: payload.filename,
    storage_path: storagePath,
    content_type: payload.contentType,
    size_bytes: sizeBytes,
    sha256,
    updated_at: now,
  });
  if (dbError) {
    try {
      await removeStorageObjects([storagePath]);
    } catch (cleanupError) {
      const detail = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      throw new Error(`${dbError.message} (artifact cleanup failed: ${detail})`);
    }
    throw dbError;
  }

  return {
    id: artifactId,
    kind: payload.kind,
    filename: payload.filename,
    storagePath,
    contentType: payload.contentType,
    sizeBytes,
    sha256,
    updatedAt: now,
  };
}

async function removeStorageObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = getSupabaseClient();
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  for (let index = 0; index < uniquePaths.length; index += 100) {
    const chunk = uniquePaths.slice(index, index + 100);
    const { error } = await supabase.storage.from(COMPANION_BUCKET).remove(chunk);
    if (error) throw error;
  }
}

async function rollbackCompanionSave(params: {
  artId: string;
  ownerId: string;
  createdNewArt: boolean;
  versionId: string | null;
  uploadedStoragePaths: string[];
  previousArt: ExistingArtSnapshot | null;
}): Promise<void> {
  const { artId, ownerId, createdNewArt, versionId, uploadedStoragePaths, previousArt } = params;
  const supabase = getSupabaseClient();

  await removeStorageObjects(uploadedStoragePaths);

  if (versionId) {
    const { error: versionDeleteError } = await supabase
      .from('art_versions')
      .delete()
      .eq('id', versionId)
      .eq('owner_id', ownerId);
    if (versionDeleteError) throw versionDeleteError;
  }

  if (createdNewArt) {
    const { error: artDeleteError } = await supabase
      .from('arts')
      .delete()
      .eq('id', artId)
      .eq('owner_id', ownerId);
    if (artDeleteError) throw artDeleteError;
    return;
  }

  if (!previousArt) return;
  const { error: restoreError } = await supabase
    .from('arts')
    .update({
      title: previousArt.title,
      privacy: previousArt.privacy,
      map_grid: previousArt.map_grid,
      map_mode: previousArt.map_mode,
      minecraft_version: previousArt.minecraft_version,
      preview_path: previousArt.preview_path,
      current_version_id: previousArt.current_version_id,
      updated_at: previousArt.updated_at,
    })
    .eq('id', artId)
    .eq('owner_id', ownerId);
  if (restoreError) throw restoreError;
}

export async function getCurrentCompanionUserId(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

export async function getCurrentCompanionAuthUser(): Promise<{ userId: string; email: string | null } | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
  };
}

export async function getCompanionProfileSummary(): Promise<CompanionProfileSummary> {
  const overview = await getCompanionCloudOverview();
  return overview.profile;
}

export async function getCompanionCloudOverview(): Promise<CompanionCloudOverview> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'cloud_overview' },
  });
  if (error) throw error;
  return data as CompanionCloudOverview;
}

export async function signInWithCompanionEmail(email: string, redirectTo = window.location.href): Promise<void> {
  const supabase = getSupabaseClient();
  const normalizedRedirectTo = normalizeCompanionEmailRedirect(redirectTo);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: normalizedRedirectTo,
      shouldCreateUser: true,
    },
  });
  if (error) throw error;
}

export function normalizeCompanionEmailRedirect(redirectTo = window.location.href): string {
  const productionBase = import.meta.env.VITE_SHARE_BASE_URL?.trim() || 'https://mapkluss.art';
  try {
    const target = new URL(redirectTo, productionBase);
    if (['localhost', '127.0.0.1', '::1'].includes(target.hostname)) {
      const canonical = new URL(productionBase);
      canonical.pathname = target.pathname;
      canonical.search = target.search;
      canonical.hash = target.hash;
      return canonical.toString();
    }
    return target.toString();
  } catch {
    return productionBase;
  }
}

export function isCompanionEmailRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('email rate limit')
    || normalized.includes('email_rate_limited')
    || normalized.includes('email_hourly_limited');
}

export function normalizeCompanionEmailError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes('email_hourly_limited')) {
    return 'Слишком много писем на этот адрес за последний час. Попробуй позже или войди через привязанный Telegram.';
  }
  if (isCompanionEmailRateLimitError(error)) {
    return 'Письмо уже отправлено. Повторно запросить ссылку можно примерно через минуту.';
  }
  if (normalized.includes('bad_email')) {
    return 'Проверь адрес почты: он выглядит некорректно.';
  }
  return message;
}

async function readCompanionFunctionError(error: unknown): Promise<string> {
  if (error && typeof error === 'object') {
    const maybeError = error as {
      message?: unknown;
      context?: {
        json?: () => Promise<unknown>;
        text?: () => Promise<string>;
      };
    };
    if (maybeError.context?.json) {
      try {
        const payload = await maybeError.context.json() as { error?: unknown; message?: unknown };
        const code = typeof payload.error === 'string' ? payload.error : '';
        const message = typeof payload.message === 'string' ? payload.message : '';
        if (code || message) return code || message;
      } catch {
        // Fall through to text/message handling.
      }
    }
    if (maybeError.context?.text) {
      try {
        const text = await maybeError.context.text();
        if (text.trim()) return text.trim();
      } catch {
        // Fall through to generic message handling.
      }
    }
    if (typeof maybeError.message === 'string' && maybeError.message.trim()) return maybeError.message.trim();
  }
  return String(error);
}

function normalizeTelegramLoginMessage(message: string): string {
  const normalized = message.trim().toLowerCase();
  if (normalized.includes('telegram_not_configured')) {
    return 'Telegram-вход пока не настроен на сервере.';
  }
  if (normalized.includes('telegram_not_linked')) {
    return 'Этот Telegram не привязан к аккаунту MapKluss. Сначала войди по почте и привяжи Telegram в аккаунте.';
  }
  if (normalized.includes('telegram_auth_expired')) {
    return 'Telegram-подтверждение устарело. Нажми кнопку Telegram ещё раз.';
  }
  if (normalized.includes('telegram_bad_')) {
    return 'Telegram не подтвердил вход. Попробуй ещё раз.';
  }
  if (normalized.includes('telegram_email_required')) {
    return 'У этого профиля нет почты. Сначала войди по почте и привяжи Telegram заново.';
  }
  return message;
}

export async function signInWithCompanionTelegram(payload: TelegramAuthPayload): Promise<CompanionProfileSummary> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-auth', {
    body: { action: 'telegram_login', telegram_auth: payload },
  });
  if (error) throw new Error(normalizeTelegramLoginMessage(await readCompanionFunctionError(error)));

  const tokenHash = String((data as { tokenHash?: unknown }).tokenHash ?? '');
  if (!tokenHash) throw new Error('Telegram-вход не вернул токен сессии.');

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  });
  if (verifyError) throw verifyError;

  const profile = (data as { profile?: CompanionProfileSummary }).profile;
  return {
    userId: String(profile?.userId ?? ''),
    displayName: profile?.displayName ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
    telegramId: profile?.telegramId ?? null,
    telegramUsername: profile?.telegramUsername ?? null,
  };
}

export async function signOutCompanion(): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function deleteCompanionAccount(): Promise<{ removedObjects: number }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'account_delete', confirm: 'DELETE' },
  });
  if (error) throw error;
  await supabase.auth.signOut();
  return {
    removedObjects: Number((data as { removedObjects?: number }).removedObjects ?? 0),
  };
}

export async function linkCompanionTelegram(payload: TelegramAuthPayload): Promise<CompanionProfileSummary> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'telegram_link', telegram_auth: payload },
  });
  if (error) throw error;
  return {
    userId: String((data as { profile: CompanionProfileSummary }).profile.userId),
    displayName: (data as { profile: CompanionProfileSummary }).profile.displayName,
    avatarUrl: (data as { profile: CompanionProfileSummary }).profile.avatarUrl,
    telegramId: (data as { profile: CompanionProfileSummary }).profile.telegramId,
    telegramUsername: (data as { profile: CompanionProfileSummary }).profile.telegramUsername,
  };
}

export async function unlinkCompanionTelegram(): Promise<CompanionProfileSummary> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'telegram_unlink' },
  });
  if (error) throw error;
  return {
    userId: String((data as { profile: CompanionProfileSummary }).profile.userId),
    displayName: (data as { profile: CompanionProfileSummary }).profile.displayName,
    avatarUrl: (data as { profile: CompanionProfileSummary }).profile.avatarUrl,
    telegramId: (data as { profile: CompanionProfileSummary }).profile.telegramId,
    telegramUsername: (data as { profile: CompanionProfileSummary }).profile.telegramUsername,
  };
}

export async function getCompanionUsageSummary(): Promise<CompanionUsageSummary> {
  const overview = await getCompanionCloudOverview();
  return overview.usage;
}

export async function listCompanionLibrary(): Promise<CompanionLibraryItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'library' },
  });
  if (error) throw error;
  return ((data as { items?: CompanionLibraryItem[] }).items ?? []);
}

export async function listCompanionFavorites(): Promise<CompanionLibraryItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'favorites' },
  });
  if (error) throw error;
  return ((data as { items?: CompanionLibraryItem[] }).items ?? []);
}

export async function listCompanionRecent(): Promise<CompanionLibraryItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'recent' },
  });
  if (error) throw error;
  return ((data as { items?: CompanionLibraryItem[] }).items ?? []);
}

export async function listCompanionCollections(): Promise<CompanionCollection[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'collections' },
  });
  if (error) throw error;
  return ((data as { items?: CompanionCollection[] }).items ?? []);
}

export async function createCompanionCollection(name: string): Promise<CompanionCollection> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'collection_create', name },
  });
  if (error) throw error;
  return (data as { collection: CompanionCollection }).collection;
}

export async function updateCompanionCollection(collectionId: string, name: string): Promise<CompanionCollection> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'collection_update', collection_id: collectionId, name },
  });
  if (error) throw error;
  return (data as { collection: CompanionCollection }).collection;
}

export async function deleteCompanionCollection(collectionId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'collection_delete', collection_id: collectionId },
  });
  if (error) throw error;
}

export async function listCompanionCollectionItems(collectionId: string): Promise<CompanionLibraryItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'collection_items', collection_id: collectionId },
  });
  if (error) throw error;
  return ((data as { items?: CompanionLibraryItem[] }).items ?? []);
}

export async function getCompanionCollectionOverview(collectionId: string): Promise<CompanionCollectionOverview> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'collection_overview', collection_id: collectionId },
  });
  if (error) throw error;
  return data as CompanionCollectionOverview;
}

export async function setCompanionCollectionItem(collectionId: string, artId: string, selected: boolean): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'collection_item_set', collection_id: collectionId, art_id: artId, selected },
  });
  if (error) throw error;
  return Boolean((data as { selected?: boolean }).selected);
}

export async function getCompanionArtManifest(artId: string): Promise<CompanionArtManifest> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'manifest', art_id: artId },
  });
  if (error) throw error;
  return data as CompanionArtManifest;
}

export async function getCompanionArtOverview(artId: string): Promise<CompanionArtOverview> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'art_overview', art_id: artId },
  });
  if (error) throw error;
  return data as CompanionArtOverview;
}

export async function downloadCompanionProjectJson(artId: string): Promise<{ manifest: CompanionArtManifest; projectJson: string }> {
  const manifest = await getCompanionArtManifest(artId);
  const project = manifest.artifacts.find(artifact => artifact.kind === 'project');
  if (!project?.signedUrl) throw new Error('Файл проекта для этого арта пока недоступен.');
  const response = await fetch(project.signedUrl);
  if (!response.ok) throw new Error(`Не удалось скачать проект (${response.status}).`);
  return { manifest, projectJson: await response.text() };
}

export async function downloadCompanionArtVersionProjectJson(versionId: string): Promise<{
  version: CompanionArtVersionProject;
  projectJson: string;
}> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'art_version_project', version_id: versionId },
  });
  if (error) throw error;
  const version = (data as { version: CompanionArtVersionProject }).version;
  if (!version?.projectUrl) throw new Error('Файл проекта для этой версии пока недоступен.');
  const response = await fetch(version.projectUrl);
  if (!response.ok) throw new Error(`Не удалось скачать проект (${response.status}).`);
  return { version, projectJson: await response.text() };
}

export async function setCompanionFavorite(artId: string, favorite: boolean): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'favorite_set', art_id: artId, favorite },
  });
  if (error) throw error;
  return Boolean((data as { isFavorite?: boolean }).isFavorite);
}

export async function updateCompanionArtMetadata(artId: string, title: string, privacy: ArtPrivacy): Promise<{
  title: string;
  privacy: ArtPrivacy;
  updatedAt: string;
}> {
  const supabase = getSupabaseClient();
  const editablePrivacy = normalizeEditableArtPrivacy(privacy);
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'art_update', art_id: artId, title, privacy: editablePrivacy },
  });
  if (error) throw error;
  return data as { title: string; privacy: ArtPrivacy; updatedAt: string };
}

export async function deleteCompanionArt(artId: string): Promise<{ removedObjects: number }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'art_delete', art_id: artId },
  });
  if (error) throw error;
  return {
    removedObjects: Number((data as { removedObjects?: number }).removedObjects ?? 0),
  };
}

export async function uploadCompanionScan(input: {
  title: string;
  source: 'hand' | 'frame' | 'wall' | 'manual_wall';
  mapGrid: MapGrid;
  imageBase64: string;
  missingMaps?: number;
  metadata?: Record<string, unknown>;
}): Promise<CompanionScanUploadResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: {
      action: 'scan_upload',
      title: input.title,
      source: input.source,
      map_grid: input.mapGrid,
      missing_maps: input.missingMaps ?? 0,
      image_base64: input.imageBase64,
      metadata: input.metadata ?? {},
    },
  });
  if (error) throw error;
  return data as CompanionScanUploadResult;
}

export async function getCompanionScanImport(importId: string): Promise<CompanionScanImport> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'scan_get', import_id: importId },
  });
  if (error) throw error;
  return normalizeCompanionScanImport(data as CompanionScanImport);
}

export async function attachCompanionImportToArt(importId: string, artId: string): Promise<{ importId: string; createdArtId: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'scan_attach_art', import_id: importId, art_id: artId },
  });
  if (error) throw error;
  return {
    importId: String((data as { importId: string }).importId),
    createdArtId: String((data as { createdArtId: string }).createdArtId),
  };
}

export async function deleteCompanionScanImport(importId: string): Promise<{ removedObjects: number }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'scan_delete', import_id: importId },
  });
  if (error) throw error;
  return {
    removedObjects: Number((data as { removedObjects?: number }).removedObjects ?? 0),
  };
}

export function normalizeCompanionScanImport(input: CompanionScanImport): CompanionScanImport {
  const metadata = input.metadata ?? {};
  const missingMaps = Math.max(0, Number(metadata.missing_maps ?? metadata.missingMaps ?? input.missingMaps ?? 0) || 0);
  return {
    ...input,
    source: input.source === 'manual-wall' ? 'manual_wall' : input.source,
    metadata,
    missingMaps,
  };
}

export async function getCompanionTracker(sessionId: string): Promise<CompanionBuildSession> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'tracker_get', session_id: sessionId },
  });
  if (error) throw error;
  return (data as { session: CompanionBuildSession }).session;
}

export async function getCompanionTrackerForArt(artId: string): Promise<CompanionBuildSession> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'tracker_for_art', art_id: artId },
  });
  if (error) throw error;
  return (data as { session: CompanionBuildSession }).session;
}

export async function updateCompanionTracker(sessionId: string, patch: {
  gathered?: Record<string, number>;
  placed?: Record<string, number>;
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.functions.invoke('companion-api', {
    body: { action: 'tracker_update', session_id: sessionId, ...patch },
  });
  if (error) throw error;
}

export async function saveCompanionArt(input: SaveCompanionArtInput): Promise<CompanionArtManifest> {
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Войдите в аккаунт MapKluss перед сохранением.');
  const ownerId = userData.user.id;
  const artId = input.artId ?? requireUuid();
  const versionId = requireUuid();
  const privacy = normalizeEditableArtPrivacy(input.privacy);
  const previewData = input.previewImageData ?? input.imageData;

  const projectBlob = new Blob([input.projectJson], { type: 'application/json;charset=utf-8' });
  const previewBlob = await blobFromImageData(previewData);
  const structure = input.mode === '3d' ? 'staircase' : 'flat';
  const litematicBytes = await buildLitematicBytes(
    input.imageData,
    input.palette,
    input.blockSelection,
    input.title,
    structure,
    structure === 'staircase' ? input.supportBlock : 'air',
    input.staircaseMode,
    input.supportMode,
  );
  const litematicTilesZip = await buildLitematicTilesZipBlob(
    input.imageData,
    input.palette,
    input.blockSelection,
    input.grid,
    structure,
    input.title,
    structure === 'staircase' ? input.supportBlock : 'air',
    input.supportMode,
    input.staircaseMode,
  );
  const materials = countMaterials(input.imageData, input.palette, input.blockSelection);
  const materialsTxt = formatMaterialsAsText(materials, input.grid);
  const materialsCsv = formatMaterialsAsCSV(materials, input.grid);
  const mapDatZip = await buildMapDatZipBlob(input.imageData, input.grid, input.palette, 0, input.minecraftVersion);
  const frameCommands = buildFrameFillCommands({ mapGrid: input.grid, startMapId: 0, minecraftVersion: input.minecraftVersion });
  const frameDatapack = blobFromDatapack(buildFrameFillDatapackFiles({ mapGrid: input.grid, startMapId: 0, minecraftVersion: input.minecraftVersion }));

  const artifacts: ArtifactPayload[] = [
    { kind: 'project', filename: companionArtifactFilename(input.title, input.grid, 'project'), body: projectBlob, contentType: 'application/json' },
    { kind: 'preview_png', filename: companionArtifactFilename(input.title, input.grid, 'preview_png'), body: previewBlob, contentType: 'image/png' },
    { kind: 'litematic', filename: companionArtifactFilename(input.title, input.grid, 'litematic'), body: litematicBytes, contentType: 'application/octet-stream' },
    { kind: 'litematic_tiles_zip', filename: companionArtifactFilename(input.title, input.grid, 'litematic_tiles_zip'), body: litematicTilesZip, contentType: 'application/zip' },
    { kind: 'materials_txt', filename: companionArtifactFilename(input.title, input.grid, 'materials_txt'), body: materialsTxt, contentType: 'text/plain;charset=utf-8' },
    { kind: 'materials_csv', filename: companionArtifactFilename(input.title, input.grid, 'materials_csv'), body: materialsCsv, contentType: 'text/csv;charset=utf-8' },
    { kind: 'mapdat_zip', filename: companionArtifactFilename(input.title, input.grid, 'mapdat_zip'), body: mapDatZip, contentType: 'application/zip' },
    { kind: 'frame_commands', filename: companionArtifactFilename(input.title, input.grid, 'frame_commands'), body: frameCommands, contentType: 'text/plain;charset=utf-8' },
    { kind: 'frame_datapack', filename: companionArtifactFilename(input.title, input.grid, 'frame_datapack'), body: frameDatapack, contentType: 'text/plain;charset=utf-8' },
  ];

  const totalUploadBytes = artifacts.reduce((sum, artifact) => sum + bodySize(artifact.body), 0);
  const { data: profile } = await supabase
    .from('profiles')
    .select('art_count,storage_used_bytes')
    .eq('id', ownerId)
    .single();
  const artCount = (profile?.art_count as number | undefined) ?? 0;
  const storageUsed = (profile?.storage_used_bytes as number | undefined) ?? 0;

  const { data: previousArtRow, error: previousArtError } = await supabase
    .from('arts')
    .select('id,title,privacy,map_grid,map_mode,minecraft_version,preview_path,current_version_id,updated_at')
    .eq('id', artId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (previousArtError) throw previousArtError;
  const createdNewArt = !previousArtRow;
  if (createdNewArt && artCount >= MAX_COMPANION_ARTS) throw new Error(`Достигнут лимит артов в аккаунте (${MAX_COMPANION_ARTS}).`);
  if (storageUsed + totalUploadBytes > MAX_COMPANION_STORAGE_BYTES) throw new Error('Достигнут лимит облачного хранилища (250 МБ).');

  await supabase.from('profiles').upsert({ id: ownerId });
  const now = new Date().toISOString();
  const previewPath = `companion/${ownerId}/${artId}/${versionId}/${companionArtifactFilename(input.title, input.grid, 'preview_png')}`;
  const projectPath = `companion/${ownerId}/${artId}/${versionId}/${companionArtifactFilename(input.title, input.grid, 'project')}`;
  const uploadedStoragePaths: string[] = [];
  let versionInserted = false;

  try {
    const { error: artError } = await supabase.from('arts').upsert({
      id: artId,
      owner_id: ownerId,
      title: input.title,
      privacy,
      map_grid: input.grid,
      map_mode: input.mode,
      minecraft_version: input.minecraftVersion,
      preview_path: previewPath,
      updated_at: now,
    });
    if (artError) throw artError;

    const { data: existingVersions, error: versionCountError } = await supabase
      .from('art_versions')
      .select('version_number')
      .eq('art_id', artId)
      .order('version_number', { ascending: false })
      .limit(1);
    if (versionCountError) throw versionCountError;
    const versionNumber = ((existingVersions?.[0]?.version_number as number | undefined) ?? 0) + 1;

    const { error: versionError } = await supabase.from('art_versions').insert({
      id: versionId,
      art_id: artId,
      owner_id: ownerId,
      version_number: versionNumber,
      settings: {
        grid: input.grid,
        mode: input.mode,
        staircaseMode: input.staircaseMode,
        supportBlock: input.supportBlock,
        supportMode: input.supportMode,
        minecraftVersion: input.minecraftVersion,
        dithering: input.dithering,
        intensity: input.intensity,
        bnScale: input.bnScale,
        klussParams: input.klussParams,
        platformMode: input.platformMode,
      },
      project_path: projectPath,
      preview_path: previewPath,
    });
    if (versionError) throw versionError;
    versionInserted = true;

    const uploadedArtifacts = [];
    for (const artifact of artifacts) {
      const uploaded = await uploadArtifact(ownerId, artId, versionId, artifact);
      uploadedArtifacts.push(uploaded);
      uploadedStoragePaths.push(uploaded.storagePath);
    }

    const { error: updateError } = await supabase
      .from('arts')
      .update({ current_version_id: versionId, preview_path: previewPath, updated_at: now })
      .eq('id', artId)
      .eq('owner_id', ownerId);
    if (updateError) throw updateError;

    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        art_count: createdNewArt ? artCount + 1 : artCount,
        storage_used_bytes: storageUsed + totalUploadBytes,
        updated_at: now,
      })
      .eq('id', ownerId);
    if (profileUpdateError) throw profileUpdateError;

    return {
      artId,
      versionId,
      ownerId,
      title: input.title,
      privacy,
      grid: input.grid,
      mode: input.mode,
      dithering: input.dithering,
      minecraftVersion: input.minecraftVersion,
      previewUrl: previewPath,
      artifacts: uploadedArtifacts,
      updatedAt: now,
    };
  } catch (error) {
    try {
      await rollbackCompanionSave({
        artId,
        ownerId,
        createdNewArt,
        versionId: versionInserted ? versionId : null,
        uploadedStoragePaths,
        previousArt: previousArtRow as ExistingArtSnapshot | null,
      });
    } catch (rollbackError) {
      const detail = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      const original = error instanceof Error ? error.message : String(error);
      throw new Error(`${original} (rollback failed: ${detail})`);
    }
    throw error;
  }
}
