import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = Reflect.get(error, 'message');
    if (typeof message === 'string' && message.trim()) return message;
    const details = Reflect.get(error, 'details');
    const hint = Reflect.get(error, 'hint');
    const code = Reflect.get(error, 'code');
    return JSON.stringify({ code, message, details, hint });
  }
  return String(error);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(bytes = 24): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data)).replace(/[+/=]/g, '').slice(0, bytes * 2);
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
  return String(deviceToken.user_id);
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

async function insertSeedArtifact(
  admin: ReturnType<typeof createClient>,
  params: {
    ownerId: string;
    artId: string;
    versionId: string;
    title: string;
    grid: { wide: number; tall: number };
    kind: ArtifactKind;
    body: Uint8Array;
    contentType: string;
  },
) {
  const { ownerId, artId, versionId, title, grid, kind, body, contentType } = params;
  const filename = companionArtifactFilename(title, grid, kind);
  const storagePath = `companion/${ownerId}/${artId}/${versionId}/${filename}`;
  const sha256 = await sha256Bytes(body);
  const { error: uploadError } = await admin.storage
    .from('mapartforge')
    .upload(storagePath, new Blob([body], { type: contentType }), { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { data, error } = await admin
    .from('art_artifacts')
    .insert({
      art_id: artId,
      version_id: versionId,
      owner_id: ownerId,
      kind,
      filename,
      storage_path: storagePath,
      content_type: contentType,
      size_bytes: body.byteLength,
      sha256,
    })
    .select('id,kind,filename,storage_path,content_type,size_bytes,sha256,updated_at')
    .single();
  if (error) throw error;
  return data;
}

function buildSeedArtifacts(
  title: string,
  grid: { wide: number; tall: number },
  now: string,
): Array<{ kind: ArtifactKind; body: Uint8Array; contentType: string }> {
  const previewBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7d8AAAAASUVORK5CYII='), c => c.charCodeAt(0));
  const litematicBytes = Uint8Array.from(atob(
    'H4sIAAAAAAAACu3dQW7TQBTG8c84ah0nVRWJBUdgDTt2kJYNCopo6LYaxa9hFGccPBOp7Y4jcAJuwPlYgh2FSBXqls3/t5v3ye+N5wKvlHI9n/lgy9bdpguX3LW10TdBOv+a6/TvSSelipklV7nkCg0+uo1psnHbdb2L8SaaVTev7l4XOnm7S1+aVsXMbT90WaHRhcVl67ep7zTQaOE3Nm3NJauk7MfLn99/DTTuqrOm8rf+WC51dhmWdRN9WF35B8uV3UmZcmX3krJc2YOUfVOu0Sdb+SZMm11IXTTUi4WvbdqE5Hyw9jIkn+77OO9ydUqd7j+L5T/+plQxb6Lv7r0frMNg7Qf3HQZPXmyoybu6Wa6vkks2d7WlZKWkZ4dHPNscnv+N860O5fNjOaYmmMYaHRtFaVx8BgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/92w27lQW78YwVvsthJoqOLReTK3UPmw6pcPLPxy/Th4X+98dQz++A3HAyFiV2IAAA==',
  ), c => c.charCodeAt(0));
  const materialsCsv = new TextEncoder().encode(
    'Block Name,NBT Name,Count\n"Stone","minecraft:stone",128\n"Glass","minecraft:glass",32\n',
  );
  const projectBytes = new TextEncoder().encode(JSON.stringify({
    source: 'mapkluss_fixture',
    title,
    grid,
    mode: '2d',
    createdAt: now,
  }));
  return [
    { kind: 'project', body: projectBytes, contentType: 'application/json' },
    { kind: 'preview_png', body: previewBytes, contentType: 'image/png' },
    { kind: 'litematic', body: litematicBytes, contentType: 'application/octet-stream' },
    { kind: 'materials_csv', body: materialsCsv, contentType: 'text/csv' },
  ];
}

async function removeStoragePaths(admin: ReturnType<typeof createClient>, paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  for (let i = 0; i < uniquePaths.length; i += 100) {
    const chunk = uniquePaths.slice(i, i + 100);
    if (chunk.length === 0) continue;
    const { error } = await admin.storage.from('mapartforge').remove(chunk);
    if (error) throw error;
  }
}

function storagePathWithFilename(storagePath: string, filename: string): string {
  const slashIndex = storagePath.lastIndexOf('/');
  if (slashIndex < 0) return filename;
  return `${storagePath.slice(0, slashIndex + 1)}${filename}`;
}

async function renameCurrentVersionArtifacts(
  admin: ReturnType<typeof createClient>,
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

async function repairSeedArtifactsForArt(
  admin: ReturnType<typeof createClient>,
  params: {
    ownerId: string;
    artId: string;
    versionId: string;
    title: string;
    grid: { wide: number; tall: number };
  },
) {
  const { ownerId, artId, versionId, title, grid } = params;
  const now = new Date().toISOString();
  const projectFilename = companionArtifactFilename(title, grid, 'project');
  const previewFilename = companionArtifactFilename(title, grid, 'preview_png');
  const projectPath = `companion/${ownerId}/${artId}/${versionId}/${projectFilename}`;
  const previewPath = `companion/${ownerId}/${artId}/${versionId}/${previewFilename}`;

  const { data: existingArtifacts, error: existingArtifactsError } = await admin
    .from('art_artifacts')
    .select('id,storage_path')
    .eq('version_id', versionId)
    .eq('owner_id', ownerId);
  if (existingArtifactsError) throw existingArtifactsError;

  await removeStoragePaths(admin, (existingArtifacts ?? []).map(row => String(row.storage_path ?? '')));

  const { error: deleteArtifactsError } = await admin
    .from('art_artifacts')
    .delete()
    .eq('version_id', versionId)
    .eq('owner_id', ownerId);
  if (deleteArtifactsError) throw deleteArtifactsError;

  for (const artifact of buildSeedArtifacts(title, grid, now)) {
    await insertSeedArtifact(admin, {
      ownerId,
      artId,
      versionId,
      title,
      grid,
      kind: artifact.kind,
      body: artifact.body,
      contentType: artifact.contentType,
    });
  }

  const { error: versionError } = await admin
    .from('art_versions')
    .update({
      project_path: projectPath,
      preview_path: previewPath,
    })
    .eq('id', versionId)
    .eq('owner_id', ownerId);
  if (versionError) throw versionError;

  const { error: artError } = await admin
    .from('arts')
    .update({
      preview_path: previewPath,
      updated_at: now,
    })
    .eq('id', artId)
    .eq('owner_id', ownerId);
  if (artError) throw artError;
}

async function getArtManifest(admin: ReturnType<typeof createClient>, userId: string | null, artId: string) {
  const { data: art, error: artError } = await admin
    .from('arts')
    .select('id,owner_id,current_version_id,title,privacy,map_grid,map_mode,minecraft_version,preview_path,updated_at')
    .eq('id', artId)
    .single();
  if (artError || !art) return null;
  if (art.privacy === 'private' && art.owner_id !== userId) return null;

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
          .update({ title, metadata, size_bytes: bytes.byteLength })
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

    if (action === 'dev_seed_art') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);

      const title = String(payload.title ?? 'mapkluss_fixture_art').trim().slice(0, 120) || 'mapkluss_fixture_art';
      const grid = { wide: 2, tall: 3 };
      const artId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const now = new Date().toISOString();
      const settings = {
        title,
        grid,
        mode: '2d',
        supportMode: 1,
        minecraftVersion: '1.21.11',
        source: 'mapkluss_fixture',
      };
      const projectPath = `companion/${userId}/${artId}/${versionId}/${companionArtifactFilename(title, grid, 'project')}`;
      const previewPath = `companion/${userId}/${artId}/${versionId}/${companionArtifactFilename(title, grid, 'preview_png')}`;

      const { error: artError } = await admin
        .from('arts')
        .insert({
          id: artId,
          owner_id: userId,
          title,
          privacy: 'unlisted',
          map_grid: grid,
          map_mode: '2d',
          minecraft_version: '1.21.11',
          preview_path: previewPath,
          created_at: now,
          updated_at: now,
        });
      if (artError) throw artError;

      const { error: versionError } = await admin
        .from('art_versions')
        .insert({
          id: versionId,
          art_id: artId,
          owner_id: userId,
          version_number: 1,
          settings,
          project_path: projectPath,
          preview_path: previewPath,
          created_at: now,
        });
      if (versionError) throw versionError;

      const { error: currentVersionError } = await admin
        .from('arts')
        .update({
          current_version_id: versionId,
          updated_at: now,
        })
        .eq('id', artId)
        .eq('owner_id', userId);
      if (currentVersionError) throw currentVersionError;

      await repairSeedArtifactsForArt(admin, { ownerId: userId, artId, versionId, title, grid });

      await refreshProfileUsage(admin, userId);
      const manifest = await getArtManifest(admin, userId, artId);
      return json({ ok: true, artId, versionId, manifest });
    }

    if (action === 'dev_repair_artifacts') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);

      const requestedArtId = String(payload.art_id ?? '').trim();
      const artQuery = admin
        .from('arts')
        .select('id,current_version_id,title,map_grid')
        .eq('owner_id', userId);
      const { data: arts, error: artsError } = requestedArtId
        ? await artQuery.eq('id', requestedArtId)
        : await artQuery.order('updated_at', { ascending: false });
      if (artsError) throw artsError;

      const repaired: Array<{ artId: string; versionId: string }> = [];
      for (const art of arts ?? []) {
        const versionId = String(art.current_version_id ?? '');
        if (!versionId) continue;
        const gridRaw = art.map_grid as { wide?: number; tall?: number } | null;
        const grid = {
          wide: Math.max(1, Number(gridRaw?.wide ?? 1) || 1),
          tall: Math.max(1, Number(gridRaw?.tall ?? 1) || 1),
        };
        await repairSeedArtifactsForArt(admin, {
          ownerId: userId,
          artId: String(art.id),
          versionId,
          title: String(art.title ?? 'mapkluss_fixture_art'),
          grid,
        });
        repaired.push({ artId: String(art.id), versionId });
      }

      await refreshProfileUsage(admin, userId);
      return json({ ok: true, repaired });
    }

    if (action === 'manifest') {
      const userId = await getBearerUserId(admin, req);
      const artId = String(payload.art_id ?? '');
      const manifest = await getArtManifest(admin, userId, artId);
      if (!manifest) return json({ error: 'not_found' }, 404);
      return json(manifest);
    }

    return json({ error: 'unsupported_mod_action' }, 400);
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
});
