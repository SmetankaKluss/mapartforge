import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';

type Action =
  | 'device_start'
  | 'device_poll'
  | 'device_approve'
  | 'device_logout'
  | 'manifest'
  | 'art_update'
  | 'art_delete'
  | 'library'
  | 'favorites'
  | 'recent'
  | 'favorite_set'
  | 'collections'
  | 'collection_create'
  | 'collection_update'
  | 'collection_delete'
  | 'collection_items'
  | 'collection_item_set'
  | 'scan_upload'
  | 'scan_get'
  | 'scan_attach_art'
  | 'scan_delete'
  | 'tracker_create'
  | 'tracker_get'
  | 'tracker_update'
  | 'tracker_switch'
  | 'tracker_for_art'
  | 'art_version_project'
  | 'account_delete'
  | 'telegram_link'
  | 'telegram_unlink'
  | 'cloud_overview'
  | 'art_overview'
  | 'collection_overview';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://mapkluss.art';
const TELEGRAM_AUTH_MAX_AGE_SECONDS = Number(Deno.env.get('TELEGRAM_AUTH_MAX_AGE_SECONDS') ?? '900');

type LibraryRow = {
  id: string;
  current_version_id: string | null;
  title: string;
  privacy: string;
  map_grid: unknown;
  map_mode: string;
  preview_path: string | null;
  updated_at: string;
};

type TelegramAuthPayload = {
  id?: string | number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: string | number;
  hash?: string;
};

type ArtifactKind =
  | 'project'
  | 'preview_png'
  | 'litematic'
  | 'litematic_tiles_zip'
  | 'materials_txt'
  | 'materials_csv'
  | 'mapdat_zip'
  | 'frame_commands'
  | 'frame_datapack';

const artifactExtensions: Record<ArtifactKind, string> = {
  project: 'mapkluss',
  preview_png: 'png',
  litematic: 'litematic',
  litematic_tiles_zip: 'zip',
  materials_txt: 'txt',
  materials_csv: 'csv',
  mapdat_zip: 'zip',
  frame_commands: 'mcfunction',
  frame_datapack: 'zip',
};

const artifactSuffixes: Partial<Record<ArtifactKind, string>> = {
  materials_txt: 'materials',
  materials_csv: 'materials',
  litematic_tiles_zip: 'litematic_tiles',
  mapdat_zip: 'mapdat',
  frame_commands: 'frames',
  frame_datapack: 'frames_datapack',
};

function companionSlug(input: string): string {
  const cleaned = input
    .replace(/№/g, '')
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9а-яё_-]+/giu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'mapkluss_art';
}

function companionArtifactFilename(title: string, grid: { wide: number; tall: number }, kind: ArtifactKind): string {
  const suffix = artifactSuffixes[kind];
  const middle = suffix ? `${grid.wide}x${grid.tall}_${suffix}` : `${grid.wide}x${grid.tall}`;
  return `${companionSlug(title)}_${middle}.${artifactExtensions[kind]}`;
}

function storagePathWithFilename(storagePath: string, filename: string): string {
  const slashIndex = storagePath.lastIndexOf('/');
  if (slashIndex < 0) return filename;
  return `${storagePath.slice(0, slashIndex + 1)}${filename}`;
}

function normalizeEditablePrivacy(value: string): 'private' | 'unlisted' | null {
  if (value === 'private' || value === 'unlisted') return value;
  return null;
}

async function renameCurrentVersionArtifacts(
  admin: ReturnType<typeof createClient>,
  params: {
    ownerId: string;
    versionId: string;
    title: string;
    grid: { wide: number; tall: number };
    now: string;
  },
) {
  const { ownerId, versionId, title, grid, now } = params;
  const { data: artifacts, error: artifactError } = await admin
    .from('art_artifacts')
    .select('id,kind,filename,storage_path')
    .eq('version_id', versionId)
    .eq('owner_id', ownerId);
  if (artifactError) throw artifactError;

  let previewPath: string | null = null;
  let projectPath: string | null = null;

  for (const artifact of artifacts ?? []) {
    const kind = artifact.kind as ArtifactKind;
    if (!(kind in artifactExtensions)) continue;

    const nextFilename = companionArtifactFilename(title, grid, kind);
    const currentPath = String(artifact.storage_path ?? '');
    const nextPath = currentPath ? storagePathWithFilename(currentPath, nextFilename) : currentPath;

    if (currentPath && nextPath && currentPath !== nextPath) {
      const { error: moveError } = await admin.storage.from('mapartforge').move(currentPath, nextPath);
      if (moveError) throw moveError;
    }

    const patch: Record<string, unknown> = {
      filename: nextFilename,
      updated_at: now,
    };
    if (nextPath) patch.storage_path = nextPath;

    const { error } = await admin
      .from('art_artifacts')
      .update(patch)
      .eq('id', artifact.id)
      .eq('owner_id', ownerId);
    if (error) throw error;

    if (kind === 'preview_png') previewPath = nextPath || currentPath || null;
    if (kind === 'project') projectPath = nextPath || currentPath || null;
  }

  const versionPatch: Record<string, unknown> = {};
  if (projectPath) versionPatch.project_path = projectPath;
  if (previewPath) versionPatch.preview_path = previewPath;
  if (Object.keys(versionPatch).length > 0) {
    const { error: versionError } = await admin
      .from('art_versions')
      .update(versionPatch)
      .eq('id', versionId)
      .eq('owner_id', ownerId);
    if (versionError) throw versionError;
  }

  return { previewPath, projectPath };
}

async function createPreviewSignedUrl(admin: ReturnType<typeof createClient>, previewPath: string | null) {
  if (!previewPath) return null;
  if (/^(https?:|data:|blob:)/i.test(previewPath)) return previewPath;
  const { data } = await admin.storage
    .from('mapartforge')
    .createSignedUrl(previewPath, 60 * 30);
  return data?.signedUrl ?? null;
}

async function mapLibraryRow(admin: ReturnType<typeof createClient>, row: LibraryRow, isFavorite = false) {
  return {
    artId: row.id,
    currentVersionId: row.current_version_id,
    title: row.title,
    privacy: row.privacy,
    grid: row.map_grid,
    mode: row.map_mode,
    previewUrl: await createPreviewSignedUrl(admin, row.preview_path),
    updatedAt: row.updated_at,
    isFavorite,
  };
}

function mapCollectionRow(
  row: { id: string; name: string; created_at: string; updated_at: string },
  itemCount?: number,
) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemCount,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function randomToken(bytes = 24): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data)).replace(/[+/=]/g, '').slice(0, bytes * 2);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function randomUserCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const data = new Uint8Array(8);
  crypto.getRandomValues(data);
  return Array.from(data, b => alphabet[b % alphabet.length]).join('');
}

function decodeBase64DataUrl(value: string): { bytes: Uint8Array; contentType: string } {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/);
  const contentType = match?.[1] ?? 'image/png';
  const base64 = match?.[2] ?? value;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType };
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(key: Uint8Array, value: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value));
  return hex(new Uint8Array(signature));
}

async function getBearerUserId(admin: ReturnType<typeof createClient>, req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (!error && data.user) return data.user.id;

  const tokenHash = await sha256Hex(token);
  const { data: deviceToken } = await admin
    .from('device_codes')
    .select('user_id,expires_at,status')
    .eq('access_token_hash', tokenHash)
    .eq('status', 'approved')
    .single();
  if (!deviceToken || new Date(deviceToken.expires_at).getTime() < Date.now()) return null;
  return deviceToken.user_id as string;
}

async function listStorageObjectPaths(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;
    if (item.metadata) {
      paths.push(path);
    } else {
      paths.push(...await listStorageObjectPaths(admin, bucket, path));
    }
  }
  return paths;
}

async function removeStoragePrefix(admin: ReturnType<typeof createClient>, bucket: string, prefix: string): Promise<number> {
  const paths = await listStorageObjectPaths(admin, bucket, prefix.replace(/\/+$/, ''));
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    if (chunk.length === 0) continue;
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) throw error;
  }
  return paths.length;
}

async function refreshProfileUsage(admin: ReturnType<typeof createClient>, userId: string): Promise<void> {
  const { count, error: countError } = await admin
    .from('arts')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId);
  if (countError) throw countError;

  const { data: artifacts, error: artifactsError } = await admin
    .from('art_artifacts')
    .select('size_bytes')
    .eq('owner_id', userId);
  if (artifactsError) throw artifactsError;

  const storageUsedBytes = (artifacts ?? []).reduce((sum, artifact) => {
    const size = Number(artifact.size_bytes ?? 0);
    return Number.isFinite(size) && size > 0 ? sum + size : sum;
  }, 0);

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      art_count: count ?? 0,
      storage_used_bytes: storageUsedBytes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (updateError) throw updateError;
}

async function getProfileSummary(admin: ReturnType<typeof createClient>, userId: string) {
  await admin.from('profiles').upsert({ id: userId });
  const { data, error } = await admin
    .from('profiles')
    .select('id,display_name,avatar_url,telegram_id,telegram_username,art_count,storage_used_bytes')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return {
    profile: {
      userId: data.id,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      telegramId: data.telegram_id == null ? null : String(data.telegram_id),
      telegramUsername: data.telegram_username,
    },
    usage: {
      artCount: Math.max(0, Number(data.art_count ?? 0) || 0),
      artLimit: 100,
      storageUsedBytes: Math.max(0, Number(data.storage_used_bytes ?? 0) || 0),
      storageLimitBytes: 250 * 1024 * 1024,
    },
  };
}

async function getPublicProfileSummary(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id,display_name,avatar_url,telegram_id,telegram_username')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) {
    return {
      userId,
      displayName: null,
      avatarUrl: null,
      telegramId: null,
      telegramUsername: null,
    };
  }
  return {
    userId: data.id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    telegramId: data.telegram_id == null ? null : String(data.telegram_id),
    telegramUsername: data.telegram_username,
  };
}

async function listOwnedArts(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin
    .from('arts')
    .select('id,current_version_id,title,privacy,map_grid,map_mode,preview_path,updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return Promise.all((data ?? []).map(row => mapLibraryRow(admin, row as LibraryRow)));
}

async function listFavoriteArts(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin
    .from('favorites')
    .select('art_id,created_at,arts(id,current_version_id,title,privacy,map_grid,map_mode,preview_path,updated_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = await Promise.all((data ?? [])
    .map(row => row.arts ? mapLibraryRow(admin, row.arts as unknown as LibraryRow, true) : null));
  return rows.filter(Boolean);
}

async function listRecentArts(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: ownedArts, error: ownedError } = await admin
    .from('arts')
    .select('id,current_version_id,title,privacy,map_grid,map_mode,preview_path,updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
    .limit(30);
  if (ownedError) throw ownedError;

  const { data: favoriteRows, error: favoriteError } = await admin
    .from('favorites')
    .select('art_id,created_at,arts(id,current_version_id,title,privacy,map_grid,map_mode,preview_path,updated_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (favoriteError) throw favoriteError;

  const byId = new Map<string, Awaited<ReturnType<typeof mapLibraryRow>>>();
  for (const row of ownedArts ?? []) {
    const item = await mapLibraryRow(admin, row as LibraryRow);
    byId.set(item.artId, item);
  }
  for (const row of favoriteRows ?? []) {
    if (!row.arts) continue;
    const item = await mapLibraryRow(admin, row.arts as unknown as LibraryRow, true);
    const existing = byId.get(item.artId);
    byId.set(item.artId, existing ? { ...existing, isFavorite: true } : item);
  }

  return Array.from(byId.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 30);
}

async function listCollections(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin
    .from('collections')
    .select('id,name,created_at,updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const itemCounts = new Map<string, number>();
  const collectionIds = rows.map(row => String(row.id));
  if (collectionIds.length > 0) {
    const { data: items, error: itemsError } = await admin
      .from('collection_items')
      .select('collection_id')
      .in('collection_id', collectionIds);
    if (itemsError) throw itemsError;
    for (const item of items ?? []) {
      const collectionId = String(item.collection_id);
      itemCounts.set(collectionId, (itemCounts.get(collectionId) ?? 0) + 1);
    }
  }
  return rows.map(row => mapCollectionRow(row, itemCounts.get(String(row.id)) ?? 0));
}

async function listRecentImports(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin
    .from('companion_imports')
    .select('id,source,title,map_grid,image_path,size_bytes,sha256,created_art_id,metadata,created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw error;

  const items = [];
  for (const row of data ?? []) {
    const { data: signed } = await admin.storage
      .from('mapartforge')
      .createSignedUrl(String(row.image_path), 60 * 30);
    items.push({
      importId: row.id,
      source: row.source,
      title: row.title,
      mapGrid: row.map_grid,
      imagePath: row.image_path,
      signedUrl: signed?.signedUrl,
      sizeBytes: row.size_bytes,
      sha256: row.sha256,
      createdArtId: row.created_art_id,
      metadata: row.metadata,
      createdAt: row.created_at,
    });
  }
  return items;
}

async function getCollectionOverview(admin: ReturnType<typeof createClient>, userId: string, collectionId: string) {
  const { data: collection, error: collectionError } = await admin
    .from('collections')
    .select('id,name,created_at,updated_at')
    .eq('id', collectionId)
    .eq('owner_id', userId)
    .single();
  if (collectionError || !collection) return null;

  const { data, error } = await admin
    .from('collection_items')
    .select('created_at,arts(id,current_version_id,title,privacy,map_grid,map_mode,preview_path,updated_at)')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return {
    collection: mapCollectionRow(collection, (data ?? []).length),
    items: (await Promise.all((data ?? [])
      .map(row => row.arts ? mapLibraryRow(admin, row.arts as unknown as LibraryRow) : null)))
      .filter(Boolean),
  };
}

async function getArtManifest(admin: ReturnType<typeof createClient>, userId: string | null, artId: string) {
  const { data: art, error: artError } = await admin
    .from('arts')
    .select('id,owner_id,current_version_id,title,privacy,map_grid,map_mode,minecraft_version,preview_path,updated_at')
    .eq('id', artId)
    .single();
  if (artError || !art) return null;
  if (art.privacy === 'private' && art.owner_id !== userId) {
    return null;
  }

  const { data: artifacts, error: artifactError } = await admin
    .from('art_artifacts')
    .select('id,kind,filename,storage_path,content_type,size_bytes,sha256,updated_at')
    .eq('version_id', art.current_version_id);
  if (artifactError) throw artifactError;

  const artifactRows = [];
  let signedPreviewUrl: string | null = null;
  for (const row of artifacts ?? []) {
    const { data: signed } = await admin.storage
      .from('mapartforge')
      .createSignedUrl(row.storage_path, 60 * 10);
    if (row.kind === 'preview_png') signedPreviewUrl = signed?.signedUrl ?? null;
    artifactRows.push({
      id: row.id,
      kind: row.kind,
      filename: row.filename,
      storagePath: row.storage_path,
      signedUrl: signed?.signedUrl,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      sha256: row.sha256,
      updatedAt: row.updated_at,
    });
  }

  let isFavorite = false;
  let collectionIds: string[] = [];
  if (userId) {
    const { data: favoriteRow } = await admin
      .from('favorites')
      .select('art_id')
      .eq('user_id', userId)
      .eq('art_id', art.id)
      .maybeSingle();
    isFavorite = Boolean(favoriteRow);

    const { data: collectionRows } = await admin
      .from('collection_items')
      .select('collection_id,collections!inner(owner_id)')
      .eq('art_id', art.id)
      .eq('collections.owner_id', userId);
    collectionIds = (collectionRows ?? []).map(row => String(row.collection_id));
  }

  return {
    artId: art.id,
    versionId: art.current_version_id,
    ownerId: art.owner_id,
    title: art.title,
    privacy: art.privacy,
    grid: art.map_grid,
    mode: art.map_mode,
    minecraftVersion: art.minecraft_version,
    previewUrl: signedPreviewUrl,
    isFavorite,
    collectionIds,
    updatedAt: art.updated_at,
    artifacts: artifactRows,
  };
}

async function listArtVersions(admin: ReturnType<typeof createClient>, artId: string, currentVersionId: string | null) {
  const { data: versions, error: versionsError } = await admin
    .from('art_versions')
    .select('id,version_number,settings,preview_path,created_at')
    .eq('art_id', artId)
    .order('version_number', { ascending: false });
  if (versionsError) throw versionsError;

  const versionIds = (versions ?? []).map(version => String(version.id));
  const artifactCounts = new Map<string, number>();
  const projectPaths = new Map<string, string>();
  if (versionIds.length > 0) {
    const { data: artifacts, error: artifactsError } = await admin
      .from('art_artifacts')
      .select('version_id,kind,storage_path')
      .in('version_id', versionIds);
    if (artifactsError) throw artifactsError;
    for (const artifact of artifacts ?? []) {
      const versionId = String(artifact.version_id);
      artifactCounts.set(versionId, (artifactCounts.get(versionId) ?? 0) + 1);
      if (artifact.kind === 'project' && artifact.storage_path) {
        projectPaths.set(versionId, String(artifact.storage_path));
      }
    }
  }

  const items = [];
  for (const version of versions ?? []) {
    const versionId = String(version.id);
    const settings = (version.settings ?? {}) as Record<string, unknown>;
    const previewPath = typeof version.preview_path === 'string' ? version.preview_path : '';
    const projectPath = projectPaths.get(versionId) ?? '';
    const previewSigned = previewPath
      ? await admin.storage.from('mapartforge').createSignedUrl(previewPath, 60 * 10)
      : { data: null };
    const projectSigned = projectPath
      ? await admin.storage.from('mapartforge').createSignedUrl(projectPath, 60 * 10)
      : { data: null };
    items.push({
      id: versionId,
      versionNumber: Number(version.version_number ?? 0) || 0,
      createdAt: String(version.created_at),
      grid: settings.grid ?? { wide: 1, tall: 1 },
      mode: settings.mode === '3d' ? '3d' : '2d',
      minecraftVersion: typeof settings.minecraftVersion === 'string' ? settings.minecraftVersion : null,
      artifactCount: artifactCounts.get(versionId) ?? 0,
      isCurrent: currentVersionId === versionId,
      previewUrl: previewSigned.data?.signedUrl ?? null,
      projectUrl: projectSigned.data?.signedUrl ?? null,
    });
  }
  return items;
}

async function getArtVersionProject(admin: ReturnType<typeof createClient>, userId: string | null, versionId: string) {
  const { data: version, error: versionError } = await admin
    .from('art_versions')
    .select('id,art_id,version_number,project_path,created_at')
    .eq('id', versionId)
    .single();
  if (versionError || !version) return null;

  const { data: art, error: artError } = await admin
    .from('arts')
    .select('id,owner_id,title,privacy')
    .eq('id', version.art_id)
    .single();
  if (artError || !art) return null;
  if (art.privacy === 'private' && art.owner_id !== userId) return null;
  if (!version.project_path) return null;

  const { data: signed } = await admin.storage
    .from('mapartforge')
    .createSignedUrl(String(version.project_path), 60 * 10);
  if (!signed?.signedUrl) return null;

  return {
    artId: String(art.id),
    versionId: String(version.id),
    versionNumber: Number(version.version_number ?? 0) || 0,
    title: String(art.title),
    createdAt: String(version.created_at),
    projectUrl: signed.signedUrl,
  };
}

async function getBuildSessionForAccess(admin: ReturnType<typeof createClient>, req: Request, sessionId: string) {
  const { data: session, error } = await admin
    .from('build_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error || !session) return { session: null, status: 404 };

  const artId = session.art_id ? String(session.art_id) : '';
  if (!artId) return { session, status: 200 };

  const { data: art, error: artError } = await admin
    .from('arts')
    .select('owner_id,privacy')
    .eq('id', artId)
    .maybeSingle();
  if (artError) throw artError;
  if (!art || art.privacy !== 'private') return { session, status: 200 };

  const userId = await getBearerUserId(admin, req);
  if (art.owner_id !== userId) return { session: null, status: 404 };
  return { session, status: 200 };
}

function limitedText(value: unknown, maxLength: number): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return undefined;
  return text.slice(0, maxLength);
}

function parseTrackerMapGrid(value: unknown): { wide: number; tall: number } | null {
  if (!value || typeof value !== 'object') return null;
  const grid = value as { wide?: unknown; tall?: unknown };
  const wide = Math.floor(Number(grid.wide));
  const tall = Math.floor(Number(grid.tall));
  if (!Number.isFinite(wide) || !Number.isFinite(tall)) return null;
  if (wide < 1 || tall < 1 || wide > 64 || tall > 64) return null;
  return { wide, tall };
}

function parseTrackerMaterials(value: unknown): Array<{ nbtName: string; displayName: string; count: number }> | null {
  if (!Array.isArray(value) || value.length > 512) return null;
  const materials: Array<{ nbtName: string; displayName: string; count: number }> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const row = item as { nbtName?: unknown; displayName?: unknown; count?: unknown };
    const nbtName = limitedText(row.nbtName, 128);
    const displayName = limitedText(row.displayName, 128) ?? nbtName;
    const count = Math.floor(Number(row.count));
    if (!nbtName || !displayName || !Number.isFinite(count) || count < 0 || count > 100_000_000) return null;
    materials.push({ nbtName, displayName, count });
  }
  return materials;
}

function parseTrackerProgress(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 1024) return null;
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim().slice(0, 128);
    const amount = Math.floor(Number(rawValue));
    if (!key || !Number.isFinite(amount) || amount < 0 || amount > 100_000_000) return null;
    out[key] = amount;
  }
  return out;
}

function parseTrackerInfo(value: unknown): Record<string, string> {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const info: Record<string, string> = {};
  const title = limitedText(input.title, 120);
  const server = limitedText(input.server, 80);
  const coords = limitedText(input.coords, 80);
  const description = limitedText(input.description, 600);
  if (title) info.title = title;
  if (server) info.server = server;
  if (coords) info.coords = coords;
  if (description) info.description = description;
  return info;
}

function isSafeTrackerPreview(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return value.startsWith('data:image/png;base64,') && value.length <= 1_500_000;
}

function isSafeTrackerLitematic(value: unknown): value is string {
  if (value == null || value === '') return false;
  return typeof value === 'string' && /^[A-Za-z0-9+/=]+$/.test(value) && value.length <= 16_000_000;
}

function buildTelegramDataCheckString(payload: TelegramAuthPayload): string {
  return Object.entries(payload)
    .filter(([key, value]) => key !== 'hash' && value != null && String(value).length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');
}

async function verifyTelegramAuth(payload: TelegramAuthPayload): Promise<{
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
}> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) throw new Error('telegram_not_configured');

  const hash = String(payload.hash ?? '').trim().toLowerCase();
  const telegramId = String(payload.id ?? '').trim();
  const firstName = String(payload.first_name ?? '').trim();
  const authDate = Number(payload.auth_date ?? 0);
  if (!hash || !telegramId || !firstName || !Number.isFinite(authDate) || authDate <= 0) {
    throw new Error('telegram_bad_payload');
  }

  const authAgeSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (authAgeSeconds < 0 || authAgeSeconds > TELEGRAM_AUTH_MAX_AGE_SECONDS) {
    throw new Error('telegram_auth_expired');
  }

  const secret = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken)));
  const expectedHash = await hmacSha256Hex(secret, buildTelegramDataCheckString(payload));
  if (expectedHash !== hash) throw new Error('telegram_bad_hash');

  return {
    telegramId,
    username: payload.username ? String(payload.username).trim() || null : null,
    firstName,
    lastName: payload.last_name ? String(payload.last_name).trim() || null : null,
    photoUrl: payload.photo_url ? String(payload.photo_url).trim() || null : null,
  };
}

function parseMaterialsCsv(csv: string): Array<{ nbtName: string; displayName: string; count: number }> {
  const materials: Array<{ nbtName: string; displayName: string; count: number }> = [];
  const lines = csv.split(/\r?\n/);
  const hasNbtColumn = /^Block Name,NBT Name,Count/i.test(lines[0]?.trim() ?? '');
  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('Map size') || line.startsWith('Total blocks')) continue;
    const match = hasNbtColumn
      ? line.match(/^"((?:[^"]|"")*)","((?:[^"]|"")*)",(\d+)/)
      : line.match(/^"((?:[^"]|"")*)",(\d+)/);
    if (!match) continue;
    const displayName = match[1].replace(/""/g, '"');
    const explicitNbtName = hasNbtColumn ? match[2].replace(/""/g, '"') : '';
    const count = Number(hasNbtColumn ? match[3] : match[2]);
    if (!displayName || !Number.isFinite(count) || count <= 0) continue;
    materials.push({
      nbtName: explicitNbtName || displayName.toLowerCase().replace(/[^a-z0-9:_-]+/g, '_').replace(/^_+|_+$/g, '') || displayName,
      displayName,
      count,
    });
  }
  return materials;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'server_not_configured' }, 500);

  const admin = createClient(supabaseUrl, serviceKey);
  const payload = await req.json().catch(() => ({})) as { action?: Action; [key: string]: unknown };
  const action = payload.action;

  try {
    if (action === 'device_start') {
      const deviceCode = randomToken(32);
      const userCode = randomUserCode();
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const { error } = await admin.from('device_codes').insert({
        device_code: deviceCode,
        user_code: userCode,
        expires_at: expiresAt,
      });
      if (error) throw error;
      return json({
        deviceCode,
        userCode,
        verificationUri: `${SITE_URL.replace(/\/+$/, '')}/device`,
        expiresIn: 600,
        interval: 5,
      });
    }

    if (action === 'device_poll') {
      const deviceCode = String(payload.device_code ?? '');
      const { data, error } = await admin
        .from('device_codes')
        .select('status,user_id,expires_at,access_token_hash')
        .eq('device_code', deviceCode)
        .single();
      if (error || !data) return json({ status: 'expired' });
      if (new Date(data.expires_at).getTime() < Date.now()) {
        await admin.from('device_codes').update({ status: 'expired' }).eq('device_code', deviceCode);
        return json({ status: 'expired' });
      }
      if (data.status !== 'approved') return json({ status: data.status });
      if (!data.user_id) return json({ status: 'pending' });
      if (data.access_token_hash) return json({ status: 'expired' });
      const accessToken = randomToken(48);
      const accessTokenHash = await sha256Hex(accessToken);
      const { data: claimed, error: claimError } = await admin
        .from('device_codes')
        .update({ access_token_hash: accessTokenHash })
        .eq('device_code', deviceCode)
        .is('access_token_hash', null)
        .select('user_id');
      if (claimError) throw claimError;
      if (!claimed || claimed.length === 0) return json({ status: 'expired' });
      return json({ status: 'approved', userId: claimed[0].user_id, accessToken });
    }

    if (action === 'device_approve') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const userCode = String(payload.user_code ?? '').toUpperCase().trim();
      if (!userCode) return json({ error: 'missing_user_code' }, 400);
      await admin.from('profiles').upsert({ id: userId });
      const { data: updated, error } = await admin
        .from('device_codes')
        .update({
          status: 'approved',
          user_id: userId,
          approved_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
        })
        .eq('user_code', userCode)
        .eq('status', 'pending')
        .select('device_code');
      if (error) throw error;
      if (!updated || updated.length === 0) return json({ error: 'code_not_found_or_already_used' }, 404);
      return json({ ok: true });
    }

    if (action === 'device_logout') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const authHeader = req.headers.get('Authorization') ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) return json({ ok: true, revoked: 0 });

      const tokenHash = await sha256Hex(token);
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from('device_codes')
        .update({
          access_token_hash: null,
          status: 'expired',
          expires_at: now,
        })
        .eq('access_token_hash', tokenHash)
        .eq('user_id', userId)
        .select('device_code');
      if (error) throw error;
      return json({ ok: true, revoked: (data ?? []).length });
    }

    if (action === 'account_delete') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      if (payload.confirm !== 'DELETE') return json({ error: 'confirmation_required' }, 400);

      const removedObjects = await removeStoragePrefix(admin, 'mapartforge', `companion/${userId}`);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true, removedObjects });
    }

    if (action === 'telegram_link') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);

      await admin.from('profiles').upsert({ id: userId });
      const verified = await verifyTelegramAuth((payload.telegram_auth ?? {}) as TelegramAuthPayload);
      const { data: existingProfile, error: existingProfileError } = await admin
        .from('profiles')
        .select('display_name,avatar_url')
        .eq('id', userId)
        .maybeSingle();
      if (existingProfileError) throw existingProfileError;

      const displayName = `${verified.firstName}${verified.lastName ? ` ${verified.lastName}` : ''}`.trim();
      const nextDisplayName = existingProfile?.display_name ? String(existingProfile.display_name) : displayName || null;
      const nextAvatarUrl = existingProfile?.avatar_url ? String(existingProfile.avatar_url) : verified.photoUrl;
      const now = new Date().toISOString();

      const { data: updated, error: updateError } = await admin
        .from('profiles')
        .update({
          telegram_id: verified.telegramId,
          telegram_username: verified.username,
          display_name: nextDisplayName,
          avatar_url: nextAvatarUrl,
          updated_at: now,
        })
        .eq('id', userId)
        .select('id,display_name,avatar_url,telegram_id,telegram_username')
        .single();
      if (updateError) throw updateError;

      return json({
        ok: true,
        profile: {
          userId: updated.id,
          displayName: updated.display_name,
          avatarUrl: updated.avatar_url,
          telegramId: updated.telegram_id == null ? null : String(updated.telegram_id),
          telegramUsername: updated.telegram_username,
        },
      });
    }

    if (action === 'telegram_unlink') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);

      await admin.from('profiles').upsert({ id: userId });
      const { data: updated, error: updateError } = await admin
        .from('profiles')
        .update({
          telegram_id: null,
          telegram_username: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('id,display_name,avatar_url,telegram_id,telegram_username')
        .single();
      if (updateError) throw updateError;

      return json({
        ok: true,
        profile: {
          userId: updated.id,
          displayName: updated.display_name,
          avatarUrl: updated.avatar_url,
          telegramId: null,
          telegramUsername: null,
        },
      });
    }

    if (action === 'cloud_overview') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const [{ profile, usage }, arts, favorites, recent, collections, imports] = await Promise.all([
        getProfileSummary(admin, userId),
        listOwnedArts(admin, userId),
        listFavoriteArts(admin, userId),
        listRecentArts(admin, userId),
        listCollections(admin, userId),
        listRecentImports(admin, userId),
      ]);
      return json({ profile, usage, arts, favorites, recent, collections, imports });
    }

    if (action === 'library') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      return json({ items: await listOwnedArts(admin, userId) });
    }

    if (action === 'favorites') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      return json({ items: await listFavoriteArts(admin, userId) });
    }

    if (action === 'recent') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      return json({ items: await listRecentArts(admin, userId) });
    }

    if (action === 'favorite_set') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const artId = String(payload.art_id ?? '');
      const favorite = Boolean(payload.favorite);
      const { data: art, error: artError } = await admin
        .from('arts')
        .select('id,owner_id,privacy')
        .eq('id', artId)
        .single();
      if (artError || !art) return json({ error: 'not_found' }, 404);
      if (art.privacy === 'private' && art.owner_id !== userId) return json({ error: 'not_found' }, 404);

      if (favorite) {
        const { error } = await admin
          .from('favorites')
          .upsert({ user_id: userId, art_id: artId }, { onConflict: 'user_id,art_id' });
        if (error) throw error;
      } else {
        const { error } = await admin
          .from('favorites')
          .delete()
          .eq('user_id', userId)
          .eq('art_id', artId);
        if (error) throw error;
      }
      return json({ ok: true, isFavorite: favorite });
    }

    if (action === 'collections') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      return json({ items: await listCollections(admin, userId) });
    }

    if (action === 'collection_create') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const name = String(payload.name ?? '').trim().slice(0, 80);
      if (!name) return json({ error: 'missing_name' }, 400);
      const { data, error } = await admin
        .from('collections')
        .insert({ owner_id: userId, name })
        .select('id,name,created_at,updated_at')
        .single();
      if (error) throw error;
      return json({
        collection: {
          id: data.id,
          name: data.name,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          itemCount: 0,
        },
      });
    }

    if (action === 'collection_update') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const collectionId = String(payload.collection_id ?? '');
      const name = String(payload.name ?? '').trim().slice(0, 80);
      if (!collectionId) return json({ error: 'missing_collection_id' }, 400);
      if (!name) return json({ error: 'missing_name' }, 400);

      const now = new Date().toISOString();
      const { data, error } = await admin
        .from('collections')
        .update({ name, updated_at: now })
        .eq('id', collectionId)
        .eq('owner_id', userId)
        .select('id,name,created_at,updated_at')
        .single();
      if (error || !data) return json({ error: 'collection_not_found' }, 404);
      const { count, error: countError } = await admin
        .from('collection_items')
        .select('*', { count: 'exact', head: true })
        .eq('collection_id', collectionId);
      if (countError) throw countError;

      return json({
        collection: {
          id: data.id,
          name: data.name,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          itemCount: count ?? 0,
        },
      });
    }

    if (action === 'collection_delete') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const collectionId = String(payload.collection_id ?? '');
      if (!collectionId) return json({ error: 'missing_collection_id' }, 400);

      const { data: collection, error: collectionError } = await admin
        .from('collections')
        .select('id')
        .eq('id', collectionId)
        .eq('owner_id', userId)
        .single();
      if (collectionError || !collection) return json({ error: 'collection_not_found' }, 404);

      const { error } = await admin
        .from('collections')
        .delete()
        .eq('id', collectionId)
        .eq('owner_id', userId);
      if (error) throw error;
      return json({ ok: true, collectionId });
    }

    if (action === 'collection_items') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const collectionId = String(payload.collection_id ?? '');
      const overview = await getCollectionOverview(admin, userId, collectionId);
      if (!overview) return json({ error: 'collection_not_found' }, 404);
      return json({ items: overview.items });
    }

    if (action === 'collection_overview') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const collectionId = String(payload.collection_id ?? '');
      const overview = await getCollectionOverview(admin, userId, collectionId);
      if (!overview) return json({ error: 'collection_not_found' }, 404);
      return json(overview);
    }

    if (action === 'collection_item_set') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const collectionId = String(payload.collection_id ?? '');
      const artId = String(payload.art_id ?? '');
      const selected = Boolean(payload.selected);

      const { data: collection, error: collectionError } = await admin
        .from('collections')
        .select('id')
        .eq('id', collectionId)
        .eq('owner_id', userId)
        .single();
      if (collectionError || !collection) return json({ error: 'collection_not_found' }, 404);

      const { data: art, error: artError } = await admin
        .from('arts')
        .select('id,owner_id,privacy')
        .eq('id', artId)
        .single();
      if (artError || !art) return json({ error: 'not_found' }, 404);
      if (art.privacy === 'private' && art.owner_id !== userId) return json({ error: 'not_found' }, 404);

      if (selected) {
        const { error } = await admin
          .from('collection_items')
          .upsert({ collection_id: collectionId, art_id: artId }, { onConflict: 'collection_id,art_id' });
        if (error) throw error;
      } else {
        const { error } = await admin
          .from('collection_items')
          .delete()
          .eq('collection_id', collectionId)
          .eq('art_id', artId);
        if (error) throw error;
      }

      await admin
        .from('collections')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', collectionId)
        .eq('owner_id', userId);
      return json({ ok: true, selected });
    }

    if (action === 'scan_upload') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const source = String(payload.source ?? 'wall');
      const title = String(payload.title ?? 'Imported map art').slice(0, 120);
      const mapGrid = payload.map_grid ?? { wide: 1, tall: 1 };
      const imageBase64 = String(payload.image_base64 ?? '');
      const missingMaps = Math.max(0, Number(payload.missing_maps ?? 0) || 0);
      if (!imageBase64) return json({ error: 'missing_image' }, 400);
      const { bytes, contentType } = decodeBase64DataUrl(imageBase64);
      const sha256 = await sha256Bytes(bytes);
      const metadata = { ...((payload.metadata ?? {}) as Record<string, unknown>), missing_maps: missingMaps };
      const { data: existingImports, error: existingImportsError } = await admin
        .from('companion_imports')
        .select('id,title,map_grid,image_path,size_bytes,sha256,metadata,created_at')
        .eq('owner_id', userId)
        .eq('source', source)
        .eq('sha256', sha256)
        .order('created_at', { ascending: false })
        .limit(5);
      if (existingImportsError) throw existingImportsError;

      const existingImport = (existingImports ?? []).find(row =>
        JSON.stringify(row.map_grid ?? null) === JSON.stringify(mapGrid ?? null),
      );
      if (existingImport) {
        const { error: refreshError } = await admin
          .from('companion_imports')
          .update({
            title,
            metadata,
            size_bytes: bytes.byteLength,
          })
          .eq('id', existingImport.id)
          .eq('owner_id', userId);
        if (refreshError) throw refreshError;
        const { data: signed } = await admin.storage.from('mapartforge').createSignedUrl(existingImport.image_path, 60 * 30);
        return json({
          importId: existingImport.id,
          imagePath: existingImport.image_path,
          signedUrl: signed?.signedUrl,
          sha256,
          createdAt: existingImport.created_at,
          reused: true,
        });
      }

      const importId = randomToken(12);
      const storagePath = `companion/${userId}/imports/${importId}.png`;
      const { error: uploadError } = await admin.storage
        .from('mapartforge')
        .upload(storagePath, new Blob([bytes], { type: contentType }), { contentType, upsert: true });
      if (uploadError) throw uploadError;
      const { data, error } = await admin.from('companion_imports').insert({
        owner_id: userId,
        source,
        title,
        map_grid: mapGrid,
        image_path: storagePath,
        size_bytes: bytes.byteLength,
        sha256,
        metadata,
      }).select('id,created_at').single();
      if (error) throw error;
      const { data: signed } = await admin.storage.from('mapartforge').createSignedUrl(storagePath, 60 * 30);
      return json({
        importId: data.id,
        imagePath: storagePath,
        signedUrl: signed?.signedUrl,
        sha256,
        createdAt: data.created_at,
        reused: false,
      });
    }

    if (action === 'scan_get') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const importId = String(payload.import_id ?? '');
      const { data, error } = await admin
        .from('companion_imports')
        .select('id,source,title,map_grid,image_path,size_bytes,sha256,created_art_id,metadata,created_at')
        .eq('id', importId)
        .eq('owner_id', userId)
        .single();
      if (error || !data) return json({ error: 'not_found' }, 404);
      const { data: signed } = await admin.storage
        .from('mapartforge')
        .createSignedUrl(data.image_path, 60 * 30);
        return json({
          importId: data.id,
          source: data.source,
          title: data.title,
          mapGrid: data.map_grid,
          imagePath: data.image_path,
          signedUrl: signed?.signedUrl,
          sizeBytes: data.size_bytes,
          sha256: data.sha256,
          createdArtId: data.created_art_id,
          metadata: data.metadata,
          createdAt: data.created_at,
        });
      }

      if (action === 'scan_attach_art') {
        const userId = await getBearerUserId(admin, req);
        if (!userId) return json({ error: 'unauthorized' }, 401);
        const importId = String(payload.import_id ?? '');
        const artId = String(payload.art_id ?? '');
        if (!importId || !artId) return json({ error: 'missing_import_or_art' }, 400);

        const { data: art, error: artError } = await admin
          .from('arts')
          .select('id')
          .eq('id', artId)
          .eq('owner_id', userId)
          .single();
        if (artError || !art) return json({ error: 'art_not_found' }, 404);

        const { data: linkedImport, error: importError } = await admin
          .from('companion_imports')
          .update({ created_art_id: artId })
          .eq('id', importId)
          .eq('owner_id', userId)
          .select('id,created_art_id')
          .single();
        if (importError || !linkedImport) return json({ error: 'import_not_found' }, 404);

        return json({
          ok: true,
          importId: linkedImport.id,
          createdArtId: linkedImport.created_art_id,
        });
      }

      if (action === 'scan_delete') {
        const userId = await getBearerUserId(admin, req);
        if (!userId) return json({ error: 'unauthorized' }, 401);
        const importId = String(payload.import_id ?? '');
        if (!importId) return json({ error: 'missing_import_id' }, 400);

        const { data: scanImport, error: importError } = await admin
          .from('companion_imports')
          .select('id,image_path')
          .eq('id', importId)
          .eq('owner_id', userId)
          .single();
        if (importError || !scanImport) return json({ error: 'not_found' }, 404);

        let removedObjects = 0;
        if (scanImport.image_path) {
          const { data: removed, error: removeError } = await admin.storage
            .from('mapartforge')
            .remove([scanImport.image_path]);
          if (removeError) throw removeError;
          removedObjects = removed?.length ?? 0;
        }

        const { error: deleteError } = await admin
          .from('companion_imports')
          .delete()
          .eq('id', importId)
          .eq('owner_id', userId);
        if (deleteError) throw deleteError;

        return json({ ok: true, removedObjects });
      }

    if (action === 'tracker_create') {
      const mapGrid = parseTrackerMapGrid(payload.map_grid);
      const materials = parseTrackerMaterials(payload.materials);
      const imagePreview = String(payload.image_preview ?? '');
      if (!mapGrid) return json({ error: 'bad_map_grid' }, 400);
      if (!materials) return json({ error: 'bad_materials' }, 400);
      if (!isSafeTrackerPreview(imagePreview)) return json({ error: 'bad_image_preview' }, 400);
      const insertRow: Record<string, unknown> = {
        map_grid: mapGrid,
        image_preview: imagePreview,
        materials,
        gathered: {},
        placed: {},
        mode: 'gathering',
        info: parseTrackerInfo(payload.info),
      };
      const litematicB64 = payload.litematic_b64;
      if (isSafeTrackerLitematic(litematicB64)) insertRow.litematic_b64 = litematicB64;
      const { data: session, error } = await admin
        .from('build_sessions')
        .insert(insertRow)
        .select('id')
        .single();
      if (error) throw error;
      return json({ id: session.id });
    }

    if (action === 'tracker_get') {
      const sessionId = String(payload.session_id ?? '');
      const { session, status } = await getBuildSessionForAccess(admin, req, sessionId);
      if (!session) return json({ error: 'not_found' }, status);
      return json({ session });
    }

    if (action === 'tracker_for_art') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const artId = String(payload.art_id ?? '');
      const { data: art, error: artError } = await admin
        .from('arts')
        .select('id,owner_id,current_version_id,title,privacy,map_grid,preview_path')
        .eq('id', artId)
        .single();
      if (artError || !art) return json({ error: 'not_found' }, 404);
      if (art.privacy === 'private' && art.owner_id !== userId) return json({ error: 'not_found' }, 404);
      if (!art.current_version_id) return json({ error: 'missing_version' }, 400);

      const { data: existing, error: existingError } = await admin
        .from('build_sessions')
        .select('*')
        .eq('art_id', art.id)
        .eq('art_version_id', art.current_version_id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return json({ session: existing });

      let materials: Array<{ nbtName: string; displayName: string; count: number }> = [];
      const { data: csvArtifact } = await admin
        .from('art_artifacts')
        .select('storage_path')
        .eq('art_id', art.id)
        .eq('version_id', art.current_version_id)
        .eq('kind', 'materials_csv')
        .maybeSingle();
      if (csvArtifact?.storage_path) {
        const { data: csvBlob, error: csvError } = await admin.storage.from('mapartforge').download(csvArtifact.storage_path);
        if (csvError) throw csvError;
        materials = parseMaterialsCsv(await csvBlob.text());
      }

      let imagePreview = art.preview_path ?? '';
      if (art.preview_path) {
        const { data: signed } = await admin.storage.from('mapartforge').createSignedUrl(art.preview_path, 60 * 60);
        imagePreview = signed?.signedUrl ?? art.preview_path;
      }

      const { data: session, error } = await admin
        .from('build_sessions')
        .insert({
          map_grid: art.map_grid,
          image_preview: imagePreview,
          materials,
          gathered: {},
          placed: {},
          mode: 'gathering',
          info: { title: art.title, source: 'mapkluss_cloud_art' },
          art_id: art.id,
          art_version_id: art.current_version_id,
        })
        .select('*')
        .single();
      if (error) throw error;
      return json({ session });
    }

    if (action === 'tracker_update') {
      const sessionId = String(payload.session_id ?? '');
      const patch: Record<string, unknown> = {};
      if (payload.gathered) {
        const gathered = parseTrackerProgress(payload.gathered);
        if (!gathered) return json({ error: 'bad_gathered' }, 400);
        patch.gathered = gathered;
      }
      if (payload.placed) {
        const placed = parseTrackerProgress(payload.placed);
        if (!placed) return json({ error: 'bad_placed' }, 400);
        patch.placed = placed;
      }
      if (Object.keys(patch).length === 0) return json({ error: 'empty_patch' }, 400);
      const { session, status } = await getBuildSessionForAccess(admin, req, sessionId);
      if (!session) return json({ error: 'not_found' }, status);
      const { error } = await admin.from('build_sessions').update(patch).eq('id', sessionId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'tracker_switch') {
      const sessionId = String(payload.session_id ?? '');
      const mode = String(payload.mode ?? 'building');
      if (mode !== 'gathering' && mode !== 'building') return json({ error: 'bad_mode' }, 400);
      const { session, status } = await getBuildSessionForAccess(admin, req, sessionId);
      if (!session) return json({ error: 'not_found' }, status);
      const { error } = await admin.from('build_sessions').update({ mode }).eq('id', sessionId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'art_update') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const artId = String(payload.art_id ?? '');
      const title = String(payload.title ?? '').trim().slice(0, 120);
      const privacy = normalizeEditablePrivacy(String(payload.privacy ?? ''));
      if (!title) return json({ error: 'missing_title' }, 400);
      if (!privacy) {
        return json({ error: 'bad_privacy' }, 400);
      }

      const { data: art, error: artError } = await admin
        .from('arts')
        .select('id,owner_id,current_version_id,map_grid')
        .eq('id', artId)
        .single();
      if (artError || !art || art.owner_id !== userId) return json({ error: 'not_found' }, 404);

      const now = new Date().toISOString();
      const { error: updateError } = await admin
        .from('arts')
        .update({ title, privacy, updated_at: now })
        .eq('id', artId)
        .eq('owner_id', userId);
      if (updateError) throw updateError;

      const grid = art.map_grid as { wide?: number; tall?: number };
      if (art.current_version_id && typeof grid?.wide === 'number' && typeof grid?.tall === 'number') {
        const renamed = await renameCurrentVersionArtifacts(admin, {
          ownerId: userId,
          versionId: String(art.current_version_id),
          title,
          grid: { wide: grid.wide, tall: grid.tall },
          now,
        });
        if (renamed.previewPath) {
          const { error: artPreviewError } = await admin
            .from('arts')
            .update({ preview_path: renamed.previewPath, updated_at: now })
            .eq('id', artId)
            .eq('owner_id', userId);
          if (artPreviewError) throw artPreviewError;
        }
      }

      return json({ ok: true, title, privacy, updatedAt: now });
    }

    if (action === 'art_delete') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const artId = String(payload.art_id ?? '');
      const { data: art, error: artError } = await admin
        .from('arts')
        .select('id,owner_id,preview_path')
        .eq('id', artId)
        .single();
      if (artError || !art || art.owner_id !== userId) return json({ error: 'not_found' }, 404);

      const storagePaths = new Set<string>();
      if (art.preview_path) storagePaths.add(String(art.preview_path));
      const { data: artifacts, error: artifactsError } = await admin
        .from('art_artifacts')
        .select('storage_path')
        .eq('art_id', artId)
        .eq('owner_id', userId);
      if (artifactsError) throw artifactsError;
      for (const artifact of artifacts ?? []) {
        if (artifact.storage_path) storagePaths.add(String(artifact.storage_path));
      }
      const { data: versions, error: versionsError } = await admin
        .from('art_versions')
        .select('project_path,preview_path')
        .eq('art_id', artId)
        .eq('owner_id', userId);
      if (versionsError) throw versionsError;
      for (const version of versions ?? []) {
        if (version.project_path) storagePaths.add(String(version.project_path));
        if (version.preview_path) storagePaths.add(String(version.preview_path));
      }
      const paths = Array.from(storagePaths);
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        if (chunk.length > 0) {
          const { error } = await admin.storage.from('mapartforge').remove(chunk);
          if (error) throw error;
        }
      }

      const { error: deleteError } = await admin
        .from('arts')
        .delete()
        .eq('id', artId)
        .eq('owner_id', userId);
      if (deleteError) throw deleteError;
      await refreshProfileUsage(admin, userId);
      return json({ ok: true, removedObjects: paths.length });
    }

    if (action === 'manifest') {
      const userId = await getBearerUserId(admin, req);
      const artId = String(payload.art_id ?? '');
      const manifest = await getArtManifest(admin, userId, artId);
      if (!manifest) return json({ error: 'not_found' }, 404);
      return json(manifest);
    }

    if (action === 'art_overview') {
      const userId = await getBearerUserId(admin, req);
      const artId = String(payload.art_id ?? '');
      const manifest = await getArtManifest(admin, userId, artId);
      if (!manifest) return json({ error: 'not_found' }, 404);
      return json({
        manifest,
        owner: await getPublicProfileSummary(admin, manifest.ownerId),
        collections: userId ? await listCollections(admin, userId) : [],
        versions: await listArtVersions(admin, artId, manifest.versionId),
      });
    }

    if (action === 'art_version_project') {
      const userId = await getBearerUserId(admin, req);
      const versionId = String(payload.version_id ?? '');
      const version = await getArtVersionProject(admin, userId, versionId);
      if (!version) return json({ error: 'not_found' }, 404);
      return json({ version });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
