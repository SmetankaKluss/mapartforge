import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import {
  drainCompanionStorageDeleteOutbox,
} from '../_shared/companionStorageCleanup.ts';
import {
  CompanionScanUploadError,
  processCompanionScanUpload,
} from '../_shared/companionScanUpload.ts';

// Generated database types are not available in this standalone Edge bundle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

type ArtifactKind =
  | 'project'
  | 'preview_png'
  | 'litematic'
  | 'litematic_tiles_zip'
  | 'materials_txt'
  | 'materials_csv'
  | 'mapdat_zip'
  | 'frame_commands'
  | 'frame_datapack'
  | 'suppression_litematic'
  | 'suppression_plan'
  | 'suppression_bundle';

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
  suppression_litematic: 'litematic',
  suppression_plan: 'json',
  suppression_bundle: 'zip',
};

const artifactSuffixes: Partial<Record<ArtifactKind, string>> = {
  materials_txt: 'materials',
  materials_csv: 'materials',
  litematic_tiles_zip: 'litematic_tiles',
  mapdat_zip: 'mapdat',
  frame_commands: 'frames',
  frame_datapack: 'frames_datapack',
  suppression_litematic: 'suppression',
  suppression_plan: 'suppression_plan',
  suppression_bundle: 'two_layer',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

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

function normalizeEditablePrivacy(value: string): 'private' | 'unlisted' | null {
  if (value === 'private' || value === 'unlisted') return value;
  return null;
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

async function getBearerUserId(admin: AdminClient, req: Request): Promise<string | null> {
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
  return String(deviceToken.user_id);
}

async function createPreviewSignedUrl(
  admin: AdminClient,
  artId: string,
  versionId: string | null,
  previewPath: string | null,
) {
  if (!previewPath) return null;
  if (/^(https?:|data:|blob:)/i.test(previewPath)) return null;
  if (!versionId) return null;
  const { data: artifact, error: artifactError } = await admin
    .from('art_artifacts')
    .select('*')
    .eq('art_id', artId)
    .eq('version_id', versionId)
    .eq('kind', 'preview_png')
    .eq('storage_path', previewPath)
    .maybeSingle();
  if (artifactError) throw artifactError;
  if (!artifact) return null;
  const { data } = await admin.storage
    .from(String(artifact.bucket_id ?? 'mapartforge'))
    .createSignedUrl(artifact.storage_path, 60 * 30);
  return data?.signedUrl ?? null;
}

async function mapLibraryRow(admin: AdminClient, row: LibraryRow, isFavorite = false) {
  return {
    artId: row.id,
    currentVersionId: row.current_version_id,
    title: row.title,
    privacy: row.privacy,
    grid: row.map_grid,
    mode: row.map_mode,
    previewUrl: await createPreviewSignedUrl(admin, row.id, row.current_version_id, row.preview_path),
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

async function listOwnedArts(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from('arts')
    .select('id,current_version_id,title,privacy,map_grid,map_mode,preview_path,updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return Promise.all((data ?? []).map(row => mapLibraryRow(admin, row as LibraryRow)));
}

async function listFavoriteArts(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from('favorites')
    .select('art_id,created_at,arts(id,current_version_id,title,privacy,map_grid,map_mode,preview_path,updated_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = await Promise.all((data ?? [])
    .map(row => row.arts ? mapLibraryRow(admin, row.arts as unknown as LibraryRow, true) : null));
  return rows.filter((item): item is NonNullable<typeof item> => item !== null);
}

async function listRecentArts(admin: AdminClient, userId: string) {
  const [owned, favorites] = await Promise.all([
    listOwnedArts(admin, userId),
    listFavoriteArts(admin, userId),
  ]);
  const byId = new Map<string, Awaited<ReturnType<typeof mapLibraryRow>>>();
  for (const item of owned) byId.set(item.artId, item);
  for (const item of favorites) {
    const existing = byId.get(item.artId);
    byId.set(item.artId, existing ? { ...existing, isFavorite: true } : item);
  }
  return Array.from(byId.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 30);
}

async function listCollections(admin: AdminClient, userId: string) {
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

async function refreshProfileUsage(admin: AdminClient, userId: string): Promise<void> {
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

  const { data: imports, error: importsError } = await admin
    .from('companion_imports')
    .select('size_bytes')
    .eq('owner_id', userId);
  if (importsError) throw importsError;

  const storageUsedBytes = [...(artifacts ?? []), ...(imports ?? [])].reduce((sum, item) => {
    const size = Number(item.size_bytes ?? 0);
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

function storagePathWithFilename(storagePath: string, filename: string): string {
  const slashIndex = storagePath.lastIndexOf('/');
  if (slashIndex < 0) return filename;
  return `${storagePath.slice(0, slashIndex + 1)}${filename}`;
}

async function renameCurrentVersionArtifacts(
  admin: AdminClient,
  params: {
    ownerId: string;
    artId: string;
    versionId: string;
    title: string;
    grid: { wide: number; tall: number };
    now: string;
  },
) {
  const { ownerId, versionId, title, grid, now } = params;
  const { data: artifacts, error: artifactError } = await admin
    .from('art_artifacts')
    .select('*')
    .eq('version_id', versionId)
    .eq('owner_id', ownerId);
  if (artifactError) throw artifactError;

  let previewPath: string | null = null;
  let projectPath: string | null = null;

  for (const artifact of artifacts ?? []) {
    const kind = artifact.kind as ArtifactKind;
    if (!(kind in artifactExtensions)) continue;
    // Suppression files are immutable and cross-reference each other by exact
    // filename and SHA-256. Art renames must not mutate this pinned pair.
    if (kind === 'suppression_litematic' || kind === 'suppression_plan' || kind === 'suppression_bundle') continue;

    const nextFilename = companionArtifactFilename(title, grid, kind);
    const currentPath = String(artifact.storage_path ?? '');
    const nextPath = currentPath ? storagePathWithFilename(currentPath, nextFilename) : currentPath;

    if (currentPath && nextPath && currentPath !== nextPath) {
      const { error: moveError } = await admin.storage
        .from(String(artifact.bucket_id ?? 'mapartforge'))
        .move(currentPath, nextPath);
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

async function getArtManifest(admin: AdminClient, userId: string | null, artId: string, requestedVersionId?: string) {
  const { data: art, error: artError } = await admin
    .from('arts')
    .select('id,owner_id,current_version_id,title,privacy,map_grid,map_mode,minecraft_version,preview_path,updated_at')
    .eq('id', artId)
    .single();
  if (artError || !art) return null;
  if (art.privacy === 'private' && art.owner_id !== userId) return null;
  const versionId = requestedVersionId || art.current_version_id;
  if (!versionId) return null;

  const { data: version, error: versionError } = await admin
    .from('art_versions')
    .select('id,settings')
    .eq('id', versionId)
    .eq('art_id', art.id)
    .eq('owner_id', art.owner_id)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!version) return null;
  const versionSettings = version.settings && typeof version.settings === 'object'
    ? version.settings as Record<string, unknown>
    : {};

  const { data: artifacts, error: artifactError } = await admin
    .from('art_artifacts')
    .select('*')
    .eq('version_id', versionId)
    .eq('art_id', art.id)
    .eq('owner_id', art.owner_id);
  if (artifactError) throw artifactError;

  let manifestArtifacts = artifacts ?? [];
  const suppressionGrid = versionSettings.grid && typeof versionSettings.grid === 'object'
    ? versionSettings.grid as { wide?: unknown; tall?: unknown }
    : null;
  const suppressionWide = Math.floor(Number(suppressionGrid?.wide ?? 1));
  const suppressionTall = Math.floor(Number(suppressionGrid?.tall ?? 1));
  const isMultiMapSuppression = versionSettings.buildTechnique === 'suppression_two_layer'
    && suppressionWide * suppressionTall > 1;
  if (isMultiMapSuppression) {
    const { data: bundlePin, error: bundlePinError } = await admin
      .from('art_version_suppression_bundle_pins')
      .select('*')
      .eq('art_id', art.id)
      .eq('version_id', versionId)
      .eq('owner_id', art.owner_id)
      .maybeSingle();
    if (bundlePinError) throw bundlePinError;
    if (!bundlePin) return null;
    manifestArtifacts = manifestArtifacts
      .filter(row => row.kind !== 'suppression_bundle'
        && row.kind !== 'suppression_plan' && row.kind !== 'suppression_litematic')
      .concat([{
        id: bundlePin.artifact_id,
        kind: 'suppression_bundle',
        filename: bundlePin.filename,
        bucket_id: bundlePin.bucket_id,
        storage_path: bundlePin.storage_path,
        content_type: bundlePin.content_type,
        size_bytes: bundlePin.size_bytes,
        sha256: bundlePin.sha256,
        updated_at: bundlePin.updated_at,
      }]);
  } else if (versionSettings.buildTechnique === 'suppression_two_layer' && versionId === art.current_version_id) {
    const { data: pin, error: pinError } = await admin
      .from('art_current_suppression_pins')
      .select('*')
      .eq('art_id', art.id)
      .eq('version_id', versionId)
      .eq('owner_id', art.owner_id)
      .maybeSingle();
    if (pinError) throw pinError;
    if (!pin) return null;
    manifestArtifacts = manifestArtifacts
      .filter(row => row.kind !== 'suppression_plan' && row.kind !== 'suppression_litematic')
      .concat([
        {
          id: pin.plan_artifact_id,
          kind: 'suppression_plan',
          filename: pin.plan_filename,
          bucket_id: pin.plan_bucket_id ?? 'mapartforge',
          storage_path: pin.plan_storage_path,
          content_type: pin.plan_content_type,
          size_bytes: pin.plan_size_bytes,
          sha256: pin.plan_sha256,
          updated_at: pin.updated_at,
        },
        {
          id: pin.litematic_artifact_id,
          kind: 'suppression_litematic',
          filename: pin.litematic_filename,
          bucket_id: pin.litematic_bucket_id ?? 'mapartforge',
          storage_path: pin.litematic_storage_path,
          content_type: pin.litematic_content_type,
          size_bytes: pin.litematic_size_bytes,
          sha256: pin.litematic_sha256,
          updated_at: pin.updated_at,
        },
      ]);
  }

  const artifactRows = [];
  let signedPreviewUrl: string | null = null;
  for (const row of manifestArtifacts) {
    const { data: signed, error: signedError } = await admin.storage
      .from(String(row.bucket_id ?? 'mapartforge'))
      .createSignedUrl(row.storage_path, 60 * 10);
    if (signedError || !signed?.signedUrl) throw signedError ?? new Error('artifact signing failed');
    if (row.kind === 'preview_png') signedPreviewUrl = signed?.signedUrl ?? null;
    artifactRows.push({
      id: row.id,
      kind: row.kind,
      filename: row.filename,
      storagePath: row.storage_path,
      signedUrl: signed.signedUrl,
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
    versionId,
    ownerId: art.owner_id,
    title: art.title,
    privacy: art.privacy,
    grid: versionSettings.grid ?? art.map_grid,
    mode: versionSettings.mode === '2d' || versionSettings.mode === '3d' ? versionSettings.mode : art.map_mode,
    dithering: typeof versionSettings.dithering === 'string' ? versionSettings.dithering : undefined,
    minecraftVersion: typeof versionSettings.minecraftVersion === 'string' ? versionSettings.minecraftVersion : art.minecraft_version,
    buildTechnique: versionSettings.buildTechnique === 'suppression_two_layer' ? 'suppression_two_layer' : 'standard',
    previewUrl: signedPreviewUrl,
    isFavorite,
    collectionIds,
    updatedAt: art.updated_at,
    artifacts: artifactRows,
  };
}

async function getBuildSessionForAccess(admin: AdminClient, req: Request, sessionId: string) {
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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'server_not_configured' }, 500);

  const admin = createClient(supabaseUrl, serviceKey);
  const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(payload.action ?? '');

  try {
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
      return json({ favorite });
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
      const { data: collection, error: collectionError } = await admin
        .from('collections')
        .select('id')
        .eq('id', collectionId)
        .eq('owner_id', userId)
        .single();
      if (collectionError || !collection) return json({ error: 'collection_not_found' }, 404);
      const { data, error } = await admin
        .from('collection_items')
        .select('added_at,arts(id,current_version_id,title,privacy,map_grid,map_mode,preview_path,updated_at)')
        .eq('collection_id', collectionId)
        .order('added_at', { ascending: false });
      if (error) throw error;
      return json({
        items: (await Promise.all((data ?? [])
          .map(row => row.arts ? mapLibraryRow(admin, row.arts as unknown as LibraryRow) : null)))
          .filter(Boolean),
      });
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
      try {
        return json(await processCompanionScanUpload(admin, userId, payload));
      } catch (error) {
        if (error instanceof CompanionScanUploadError) {
          const response = json({ error: error.code, retryAfterMs: error.retryAfterMs }, error.responseStatus);
          if (error.retryAfterMs) {
            response.headers.set('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))));
          }
          return response;
        }
        throw error;
      }
    }

    if (action === 'scan_get') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);
      const importId = String(payload.import_id ?? '');
      const { data, error } = await admin
        .from('companion_imports')
        .select('id,created_art_id')
        .eq('id', importId)
        .eq('owner_id', userId)
        .single();
      if (error || !data) return json({ error: 'not_found' }, 404);
      return json({
        importId: data.id,
        createdArtId: data.created_art_id,
      });
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
        .select('*')
        .eq('art_id', art.id)
        .eq('version_id', art.current_version_id)
        .eq('kind', 'materials_csv')
        .maybeSingle();
      if (csvArtifact?.storage_path) {
        const { data: csvBlob, error: csvError } = await admin.storage
          .from(String(csvArtifact.bucket_id ?? 'mapartforge'))
          .download(csvArtifact.storage_path);
        if (csvError) throw csvError;
        materials = parseMaterialsCsv(await csvBlob.text());
      }

      const imagePreview = await createPreviewSignedUrl(
        admin, String(art.id), String(art.current_version_id), art.preview_path,
      ) ?? '';

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
      if (payload.gathered && typeof payload.gathered === 'object') patch.gathered = payload.gathered;
      if (payload.placed && typeof payload.placed === 'object') patch.placed = payload.placed;
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
      if (!privacy) return json({ error: 'bad_privacy' }, 400);

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
          artId,
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

      const { error: deleteError } = await admin
        .from('arts')
        .delete()
        .eq('id', artId)
        .eq('owner_id', userId);
      if (deleteError) throw deleteError;
      await refreshProfileUsage(admin, userId);
      const cleanup = await drainCompanionStorageDeleteOutbox(admin, userId).catch(() => ({ removed: 0, deferred: 1 }));
      return json({ ok: true, removedObjects: cleanup.removed, cleanupDeferred: cleanup.deferred > 0 });
    }

    if (action === 'manifest') {
      const userId = await getBearerUserId(admin, req);
      const artId = String(payload.art_id ?? '');
      const versionId = payload.version_id ? String(payload.version_id) : undefined;
      const manifest = await getArtManifest(admin, userId, artId, versionId);
      if (!manifest) return json({ error: 'not_found' }, 404);
      return json(manifest);
    }

    return json({ error: 'unsupported_mod_action' }, 400);
  } catch {
    console.error(`Companion mod action failed: ${action || 'missing'}`);
    return json({ error: 'request_failed' }, 500);
  }
});
