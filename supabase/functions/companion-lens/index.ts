import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.99.3";

const API_VERSION = 1;
const BUCKET = "mapkluss-lens";
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60;
const SESSION_OFFLINE_MS = 90_000;
const SESSION_EXPIRES_MS = 120_000;
const LEASE_EXPIRES_MS = 120_000;
const PLACEMENT_LIVE_MS = 90_000;
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ORPHAN_SWEEP_PAGE_SIZE = 25;
const ORPHAN_SWEEP_OWNER_PAGES = 1;
const ORPHAN_SWEEP_SESSION_PAGE_SIZE = 100;
const ORPHAN_SWEEP_MAX_OBJECTS = 100;
const ORPHAN_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_DEVICE_SESSIONS = 20;
const CLEANUP_SESSION_BATCH_SIZE = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lens-maintenance-secret",
};

interface DeviceCodeRow {
  [key: string]: unknown;
  user_id: string | null;
  expires_at: string;
  status: string;
  access_token_hash: string | null;
}

interface LensSessionRow {
  [key: string]: unknown;
  id: string;
  owner_id: string;
  owner_key: string;
  title: string;
  status: "active" | "offline" | "closed" | "expired";
  grid_wide: number;
  grid_tall: number;
  map_mode: "2d" | "3d";
  session_code_hash: string;
  realtime_topic: string;
  publisher_lease_hash: string;
  publisher_lease_expires_at: string;
  preview_path: string | null;
  preview_sha256: string | null;
  preview_width: number | null;
  preview_height: number | null;
  tile_resolution: number | null;
  revision: number;
  last_editor_seen_at: string;
  last_mod_seen_at: string | null;
  owner_device_token_hash: string | null;
  last_published_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  group_generation: number;
}

interface LensPlacementRow {
  [key: string]: unknown;
  id: string;
  session_id: string;
  owner_id: string;
  owner_key: string;
  owner_device_token_hash: string;
  title: string;
  visibility: "personal" | "group";
  server_hash: string | null;
  dimension_id: string | null;
  anchor_x: number;
  anchor_y: number;
  anchor_z: number;
  facing: "north" | "south" | "east" | "west";
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

interface LensSubscriberRow {
  [key: string]: unknown;
  id: string;
  session_id: string;
  user_id: string;
  device_token_hash: string;
  subscription_kind: "group";
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  group_generation: number;
}

interface LensReportRow {
  [key: string]: unknown;
  id: string;
  placement_id: string;
  session_id: string;
  reporter_id: string;
  reporter_device_token_hash: string;
  reason: "spam" | "sexual" | "hateful" | "other";
  created_at: string;
}

interface LensRateLimitRow {
  [key: string]: unknown;
  key_hash: string;
  action: string;
  window_started_at: string;
  request_count: number;
  updated_at: string;
}

interface LensCleanupStateRow {
  [key: string]: unknown;
  id: number;
  owner_offset: number;
  updated_at: string;
}

type LensSessionInsert =
  & Record<string, unknown>
  & Partial<LensSessionRow>
  & Pick<
    LensSessionRow,
    | "owner_id"
    | "owner_key"
    | "title"
    | "status"
    | "grid_wide"
    | "grid_tall"
    | "map_mode"
    | "session_code_hash"
    | "realtime_topic"
    | "publisher_lease_hash"
    | "publisher_lease_expires_at"
    | "expires_at"
  >;
type LensPlacementInsert =
  & Record<string, unknown>
  & Partial<LensPlacementRow>
  & Pick<
    LensPlacementRow,
    | "session_id"
    | "owner_id"
    | "owner_key"
    | "owner_device_token_hash"
    | "title"
    | "visibility"
    | "server_hash"
    | "dimension_id"
    | "anchor_x"
    | "anchor_y"
    | "anchor_z"
    | "facing"
  >;
type LensSubscriberInsert =
  & Record<string, unknown>
  & Partial<LensSubscriberRow>
  & Pick<
    LensSubscriberRow,
    | "session_id"
    | "user_id"
    | "device_token_hash"
    | "subscription_kind"
  >;
type LensReportInsert =
  & Record<string, unknown>
  & Partial<LensReportRow>
  & Pick<
    LensReportRow,
    | "placement_id"
    | "session_id"
    | "reporter_id"
    | "reporter_device_token_hash"
    | "reason"
  >;

type Database = {
  public: {
    Tables: {
      device_codes: {
        Row: DeviceCodeRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      companion_lens_sessions: {
        Row: LensSessionRow;
        Insert: LensSessionInsert;
        Update: Partial<LensSessionInsert>;
        Relationships: [];
      };
      companion_lens_placements: {
        Row: LensPlacementRow;
        Insert: LensPlacementInsert;
        Update: Partial<LensPlacementInsert>;
        Relationships: [];
      };
      companion_lens_subscribers: {
        Row: LensSubscriberRow;
        Insert: LensSubscriberInsert;
        Update: Partial<LensSubscriberInsert>;
        Relationships: [];
      };
      companion_lens_reports: {
        Row: LensReportRow;
        Insert: LensReportInsert;
        Update: Partial<LensReportInsert>;
        Relationships: [];
      };
      companion_lens_rate_limits: {
        Row: LensRateLimitRow;
        Insert: LensRateLimitRow;
        Update: Partial<LensRateLimitRow>;
        Relationships: [];
      };
      companion_lens_cleanup_state: {
        Row: LensCleanupStateRow;
        Insert: Partial<LensCleanupStateRow> & Pick<LensCleanupStateRow, "id">;
        Update: Partial<LensCleanupStateRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      companion_lens_consume_rate_limit: {
        Args: {
          p_key_hash: string;
          p_action: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: Array<{ allowed: boolean; retry_after_ms: number }>;
      };
      companion_lens_rotate_group_generation: {
        Args: {
          p_session_id: string;
          p_owner_id: string;
          p_session_code_hash: string;
          p_realtime_topic: string;
          p_expected_publisher_lease_hash: string;
        };
        Returns: LensSessionRow[];
      };
      companion_lens_join_group: {
        Args: {
          p_session_code_hash: string;
          p_user_id: string;
          p_device_token_hash: string;
        };
        Returns: LensSessionRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AdminClient = SupabaseClient<Database>;
type PrincipalKind = "website" | "device" | "server";
type Principal =
  | { kind: "website"; userId: string; tokenHash: string }
  | { kind: "device"; userId: string; tokenHash: string }
  | { kind: "server"; userId: null; tokenHash: string };
type JsonRecord = Record<string, unknown>;

class LensError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message ?? code);
  }
}

function json(payload: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify({ apiVersion: API_VERSION, ...payload }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(
  code: string,
  status: number,
  message?: string,
  retryAfterMs?: number,
): never {
  throw new LensError(code, status, message, retryAfterMs);
}

function errorResponse(error: unknown): Response {
  if (error instanceof LensError) {
    return json({
      error: error.code,
      ...(error.message && error.message !== error.code
        ? { message: error.message }
        : {}),
      ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}),
    }, error.status);
  }
  console.error("companion-lens unexpected error", error);
  return json(
    { error: "invalid_request", message: "Lens request failed." },
    500,
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function futureIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function bearerToken(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
    .trim();
}

async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const input = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function randomHex(byteLength: number): string {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(byteLength)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
    .join("");
}

function requiredString(
  payload: JsonRecord,
  key: string,
  maxLength = 256,
): string {
  const value = typeof payload[key] === "string" ? payload[key].trim() : "";
  if (!value || value.length > maxLength) {
    fail("invalid_request", 400, `Invalid ${key}.`);
  }
  return value;
}

function optionalString(
  payload: JsonRecord,
  key: string,
  maxLength = 256,
): string | null {
  if (
    payload[key] === undefined || payload[key] === null || payload[key] === ""
  ) return null;
  const value = typeof payload[key] === "string" ? payload[key].trim() : "";
  if (!value || value.length > maxLength) {
    fail("invalid_request", 400, `Invalid ${key}.`);
  }
  return value;
}

function integer(
  payload: JsonRecord,
  key: string,
  min: number,
  max: number,
): number {
  const value = Number(payload[key]);
  if (!Number.isInteger(value) || value < min || value > max) {
    fail("invalid_request", 400, `Invalid ${key}.`);
  }
  return value;
}

function uuid(payload: JsonRecord, key: string): string {
  const value = requiredString(payload, key, 36).toLowerCase();
  if (
    !UUID_PATTERN.test(value)
  ) {
    fail("invalid_request", 400, `Invalid ${key}.`);
  }
  return value;
}

function hash64(payload: JsonRecord, key: string): string {
  const value = requiredString(payload, key, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) {
    fail("invalid_request", 400, `Invalid ${key}.`);
  }
  return value;
}

function normalizeCode(value: unknown): string {
  const code = String(value ?? "").toUpperCase().replace(/[\s-]/g, "")
    .replace(/[ILO]/g, (char) => ({ I: "1", L: "1", O: "0" })[char] ?? char);
  if (
    code.length !== 12 ||
    Array.from(code).some((char) => !CODE_ALPHABET.includes(char))
  ) {
    fail("invalid_code", 400);
  }
  return code;
}

function normalizeServerContext(
  payload: JsonRecord,
  required: true,
): { serverHash: string; dimensionId: string };
function normalizeServerContext(
  payload: JsonRecord,
  required: false,
): { serverHash: string | null; dimensionId: string | null };
function normalizeServerContext(
  payload: JsonRecord,
  required: boolean,
): { serverHash: string | null; dimensionId: string | null };
function normalizeServerContext(payload: JsonRecord, required: boolean) {
  const serverHash = optionalString(payload, "serverHash", 64)?.toLowerCase() ??
    null;
  const dimensionId = optionalString(payload, "dimensionId", 128);
  if (
    (serverHash && !/^[a-f0-9]{64}$/.test(serverHash)) ||
    (serverHash !== null && dimensionId === null)
  ) {
    fail("invalid_request", 400, "Invalid server context.");
  }
  if (required && (serverHash === null || dimensionId === null)) {
    fail("invalid_request", 400, "Server context is required.");
  }
  return { serverHash, dimensionId };
}

async function authenticate(
  admin: AdminClient,
  req: Request,
  requestedKind: unknown,
): Promise<Principal> {
  const kind = String(requestedKind ?? "") as PrincipalKind;
  if (!["website", "device", "server"].includes(kind)) {
    fail("unauthorized", 401, "principalKind is required.");
  }

  if (kind === "server") {
    const expected = Deno.env.get("LENS_MAINTENANCE_SECRET") ?? "";
    const supplied = req.headers.get("x-lens-maintenance-secret") ?? "";
    if (!expected || supplied !== expected) fail("unauthorized", 401);
    return {
      kind,
      userId: null,
      tokenHash: await sha256Hex(`server:${supplied}`),
    };
  }

  const token = bearerToken(req);
  if (!token) fail("unauthorized", 401);
  const tokenHash = await sha256Hex(token);

  if (kind === "website") {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) fail("unauthorized", 401);
    return { kind, userId: data.user.id, tokenHash };
  }

  const { data, error } = await admin
    .from("device_codes")
    .select("user_id,expires_at,status")
    .eq("access_token_hash", tokenHash)
    .eq("status", "approved")
    .maybeSingle();
  if (
    error || !data?.user_id || new Date(data.expires_at).getTime() <= Date.now()
  ) {
    fail("unauthorized", 401);
  }
  return { kind, userId: String(data.user_id), tokenHash };
}

function requireKind<K extends PrincipalKind>(
  principal: Principal,
  expected: K,
  code: string,
): asserts principal is Extract<Principal, { kind: K }> {
  if (principal.kind !== expected) fail(code, 403);
}

async function consumeRateLimit(
  admin: AdminClient,
  principal: Principal,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const keyHash = await sha256Hex(
    `lens-rate-v1:${principal.kind}:${
      principal.userId ?? ""
    }:${principal.tokenHash}`,
  );
  const { data, error } = await admin.rpc("companion_lens_consume_rate_limit", {
    p_key_hash: keyHash,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.allowed) {
    fail(
      "rate_limited",
      429,
      undefined,
      Number(result?.retry_after_ms ?? 1000),
    );
  }
}

function realtimeInfo(topic: string): JsonRecord {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  return {
    websocketUrl: `${
      supabaseUrl.replace(/^http/i, "ws")
    }/realtime/v1/websocket`,
    apiKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    topic,
  };
}

async function viewerCount(
  admin: AdminClient,
  session: LensSessionRow,
): Promise<number> {
  const cutoff = new Date(Date.now() - SESSION_OFFLINE_MS).toISOString();
  const { data, error } = await admin
    .from("companion_lens_subscribers")
    .select("device_token_hash")
    .eq("session_id", session.id)
    .gte("last_seen_at", cutoff);
  if (error) throw error;
  const viewers = new Set((data ?? []).map((row) => row.device_token_hash));
  if (
    session.owner_device_token_hash && session.last_mod_seen_at &&
    new Date(session.last_mod_seen_at).getTime() >=
      Date.now() - SESSION_OFFLINE_MS
  ) {
    viewers.add(session.owner_device_token_hash);
  }
  return viewers.size;
}

async function mapSession(
  admin: AdminClient,
  row: LensSessionRow,
  sessionCode?: string,
  viewerUserId?: string | null,
  includeViewerCount = false,
): Promise<JsonRecord> {
  return {
    sessionId: row.id,
    title: row.title,
    status: row.status,
    grid: { wide: row.grid_wide, tall: row.grid_tall },
    mapMode: row.map_mode,
    revision: Number(row.revision),
    tileResolution: row.tile_resolution ?? 16,
    previewWidth: row.preview_width ?? 0,
    previewHeight: row.preview_height ?? 0,
    viewerCount: includeViewerCount ? await viewerCount(admin, row) : 0,
    editorLastSeenAt: row.last_editor_seen_at,
    expiresAt: row.expires_at,
    ...(sessionCode ? { sessionCode } : {}),
    ownedByUser: viewerUserId === row.owner_id,
    realtime: realtimeInfo(row.realtime_topic),
  };
}

function mapPlacement(
  row: LensPlacementRow,
  session: LensSessionRow,
  distanceBlocks?: number,
  deviceTokenHash?: string,
): JsonRecord {
  return {
    placementId: row.id,
    sessionId: row.session_id,
    ownerKey: row.owner_key,
    title: row.title,
    visibility: row.visibility,
    serverHash: row.server_hash,
    dimensionId: row.dimension_id,
    anchor: { x: row.anchor_x, y: row.anchor_y, z: row.anchor_z },
    facing: row.facing,
    grid: { wide: session.grid_wide, tall: session.grid_tall },
    revision: Number(session.revision),
    tileResolution: session.tile_resolution ?? 16,
    lastSeenAt: row.last_seen_at,
    ...(distanceBlocks === undefined ? {} : { distanceBlocks }),
    ownedByDevice: deviceTokenHash === row.owner_device_token_hash,
    realtime: realtimeInfo(session.realtime_topic),
  };
}

async function loadSession(
  admin: AdminClient,
  sessionId: string,
): Promise<LensSessionRow> {
  const { data, error } = await admin
    .from("companion_lens_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) fail("not_found", 404);
  return refreshSessionState(admin, data);
}

async function refreshSessionState(
  admin: AdminClient,
  row: LensSessionRow,
): Promise<LensSessionRow> {
  if (row.status === "closed" || row.status === "expired") return row;
  const editorAge = Date.now() - new Date(row.last_editor_seen_at).getTime();
  const expired = new Date(row.expires_at).getTime() <= Date.now() ||
    editorAge >= SESSION_EXPIRES_MS;
  const nextStatus = expired
    ? "expired"
    : editorAge >= SESSION_OFFLINE_MS
    ? "offline"
    : "active";
  if (nextStatus === row.status) return row;
  const { data, error } = await admin
    .from("companion_lens_sessions")
    .update({ status: nextStatus, updated_at: nowIso() })
    .eq("id", row.id)
    .in("status", ["active", "offline"])
    .eq("last_editor_seen_at", row.last_editor_seen_at)
    .eq("expires_at", row.expires_at)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: current, error: currentError } = await admin
    .from("companion_lens_sessions")
    .select("*")
    .eq("id", row.id)
    .maybeSingle();
  if (currentError) throw currentError;
  return current ?? { ...row, status: nextStatus };
}

async function signedPreviewUrl(
  admin: AdminClient,
  session: LensSessionRow,
): Promise<string | undefined> {
  if (
    !session.preview_path || session.status === "closed" ||
    session.status === "expired"
  ) return undefined;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(
    session.preview_path,
    SIGNED_URL_SECONDS,
  );
  if (error || !data?.signedUrl) {
    throw error ?? new Error("Could not sign Lens preview.");
  }
  return data.signedUrl;
}

function validatePng(
  bytes: Uint8Array,
  expectedWidth: number,
  expectedHeight: number,
): void {
  if (bytes.byteLength > MAX_PREVIEW_BYTES) fail("preview_too_large", 413);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.byteLength < 33 ||
    signature.some((value, index) => bytes[index] !== value)
  ) {
    fail("invalid_preview", 400, "Preview must be a PNG.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ihdrLength = view.getUint32(8);
  const ihdrType = String.fromCharCode(
    bytes[12],
    bytes[13],
    bytes[14],
    bytes[15],
  );
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (
    ihdrLength !== 13 || ihdrType !== "IHDR" || width !== expectedWidth ||
    height !== expectedHeight
  ) {
    fail("invalid_preview", 400, "PNG dimensions do not match the Lens grid.");
  }
}

async function broadcastRevision(
  serviceKey: string,
  session: LensSessionRow,
): Promise<void> {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/realtime/v1/api/broadcast/${
      encodeURIComponent(session.realtime_topic)
    }/events/lens_revision`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: session.id,
        revision: Number(session.revision),
        changedAt: session.updated_at,
      }),
    });
    if (!response.ok) console.warn("Lens Broadcast failed", response.status);
  } catch (error) {
    console.warn("Lens Broadcast failed", error);
  }
}

async function removePathsBestEffort(
  admin: AdminClient,
  paths: string[],
): Promise<{ removed: number; failed: boolean }> {
  let removed = 0;
  let failed = false;
  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    if (!chunk.length) continue;
    const { error } = await admin.storage.from(BUCKET).remove(chunk);
    if (error) {
      failed = true;
      console.warn("Lens Storage cleanup failed", error.message);
    } else removed += chunk.length;
  }
  return { removed, failed };
}

async function listSessionPaths(
  admin: AdminClient,
  session: LensSessionRow,
): Promise<{ paths: string[]; failed: boolean }> {
  const folder = `${session.owner_id}/${session.id}`;
  const { data, error } = await admin.storage.from(BUCKET).list(folder, {
    limit: 1000,
  });
  if (error) {
    console.warn("Lens Storage list failed", error.message);
    return { paths: [], failed: true };
  }
  return {
    paths: (data ?? []).filter((item) => item.name.endsWith(".png")).map((
      item,
    ) => `${folder}/${item.name}`),
    failed: false,
  };
}

async function trimOldRevisions(
  admin: AdminClient,
  session: LensSessionRow,
): Promise<void> {
  const oldestRetainedRevision = Math.max(0, Number(session.revision) - 1);
  const listed = await listSessionPaths(admin, session);
  if (listed.failed) return;
  const stale = listed.paths.filter((path) => {
    const match = /\/(\d+)(?:-[a-f0-9]{64})?\.png$/.exec(path);
    // A future revision can already be uploaded while its DB compare-and-swap
    // is still in flight. Never delete it from a stale cleanup snapshot.
    return !!match && Number(match[1]) < oldestRetainedRevision;
  });
  await removePathsBestEffort(admin, stale);
}

async function clearClosedSessionStorage(
  admin: AdminClient,
  session: LensSessionRow,
): Promise<{ clean: boolean; removed: number }> {
  const before = await listSessionPaths(admin, session);
  if (before.failed) return { clean: false, removed: 0 };
  const removal = await removePathsBestEffort(admin, before.paths);
  if (removal.failed) return { clean: false, removed: removal.removed };
  const after = await listSessionPaths(admin, session);
  return {
    clean: !after.failed && after.paths.length === 0,
    removed: removal.removed,
  };
}

async function getGroupSubscription(
  admin: AdminClient,
  sessionId: string,
  tokenHash: string,
  groupGeneration: number,
): Promise<boolean> {
  const { data, error } = await admin
    .from("companion_lens_subscribers")
    .select("id")
    .eq("session_id", sessionId)
    .eq("device_token_hash", tokenHash)
    .eq("subscription_kind", "group")
    .eq("group_generation", groupGeneration)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function rotateGroupGeneration(
  admin: AdminClient,
  sessionId: string,
  ownerId: string,
  sessionCodeHash: string,
  realtimeTopic: string,
  expectedPublisherLeaseHash: string,
): Promise<LensSessionRow | null> {
  const { data, error } = await admin.rpc(
    "companion_lens_rotate_group_generation",
    {
      p_session_id: sessionId,
      p_owner_id: ownerId,
      p_session_code_hash: sessionCodeHash,
      p_realtime_topic: realtimeTopic,
      p_expected_publisher_lease_hash: expectedPublisherLeaseHash,
    },
  );
  if (error) throw error;
  return data?.[0] ?? null;
}

async function touchModSession(
  admin: AdminClient,
  sessionId: string,
): Promise<void> {
  await admin.from("companion_lens_sessions").update({
    last_mod_seen_at: nowIso(),
  }).eq("id", sessionId);
}

function capabilities(): JsonRecord {
  return {
    enabled: Deno.env.get("LENS_ENABLED") === "true",
    limits: {
      maxPreviewBytes: MAX_PREVIEW_BYTES,
      maxPreviewSide: 4096,
      maxPreviewPixels: 16777216,
      maxGridWide: 100,
      maxGridTall: 100,
      maxPlacements: 8,
      signedUrlSeconds: SIGNED_URL_SECONDS,
      tileResolutions: [128, 64, 32, 16],
    },
    timing: {
      publishDebounceMs: 350,
      publishMinimumIntervalMs: 1000,
      editorHeartbeatMs: 30000,
      editorOfflineMs: SESSION_OFFLINE_MS,
      sessionExpiresMs: SESSION_EXPIRES_MS,
      placementHeartbeatMs: 30000,
      placementOfflineMs: PLACEMENT_LIVE_MS,
      recoveryPollMs: 60000,
    },
  };
}

function gridFrom(payload: JsonRecord): { wide: number; tall: number } {
  const nested = payload.grid && typeof payload.grid === "object"
    ? payload.grid as JsonRecord
    : {};
  const wide = Number(payload.gridWide ?? nested.wide);
  const tall = Number(payload.gridTall ?? nested.tall);
  if (
    !Number.isInteger(wide) || wide < 1 || wide > 100 ||
    !Number.isInteger(tall) || tall < 1 || tall > 100
  ) {
    fail("invalid_request", 400, "Invalid grid.");
  }
  return { wide, tall };
}

function mapModeFrom(payload: JsonRecord): "2d" | "3d" {
  const mode = String(payload.mapMode ?? "");
  if (mode !== "2d" && mode !== "3d") {
    fail("invalid_request", 400, "Invalid mapMode.");
  }
  return mode;
}

async function readRequest(
  req: Request,
): Promise<{ payload: JsonRecord; preview?: File }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_PREVIEW_BYTES + 64 * 1024) {
      fail("preview_too_large", 413);
    }
    const form = await req.formData();
    const payload: JsonRecord = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") payload[key] = value;
    }
    const preview = form.get("preview");
    if (!(preview instanceof File)) {
      fail("invalid_preview", 400, "Missing binary preview.");
    }
    return { payload, preview };
  }
  try {
    const value = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_request", 400);
    }
    return { payload: value as JsonRecord };
  } catch (error) {
    if (error instanceof LensError) throw error;
    fail(
      "invalid_request",
      400,
      "Request body must be JSON or multipart form data.",
    );
  }
}

async function handleSessionStart(
  admin: AdminClient,
  principal: Principal,
  payload: JsonRecord,
) {
  requireKind(principal, "website", "publisher_required");
  await consumeRateLimit(admin, principal, "session_start", 20, 60);
  const ownerId = principal.userId!;
  const title = requiredString(payload, "title", 120);
  const grid = gridFrom(payload);
  const mapMode = mapModeFrom(payload);
  const ownerKey = await sha256Hex(`lens-owner-v1:${ownerId}`);
  const sessionCode = randomCode();
  const publisherLease = randomHex(32);
  const publisherLeaseHash = await sha256Hex(publisherLease);
  const capabilityValues = {
    session_code_hash: await sha256Hex(sessionCode),
    realtime_topic: `lens:${randomHex(24)}`,
  };
  const values = {
    owner_key: ownerKey,
    title,
    status: "active" as const,
    publisher_lease_hash: publisherLeaseHash,
    publisher_lease_expires_at: futureIso(LEASE_EXPIRES_MS),
    last_editor_seen_at: nowIso(),
    expires_at: futureIso(SESSION_EXPIRES_MS),
    updated_at: nowIso(),
  };

  const { data: existing, error: existingError } = await admin
    .from("companion_lens_sessions")
    .select("*")
    .eq("owner_id", ownerId)
    .in("status", ["active", "offline"])
    .maybeSingle();
  if (existingError) throw existingError;
  const live = existing ? await refreshSessionState(admin, existing) : null;

  let session: LensSessionRow;
  if (live && live.status !== "expired") {
    const metadata = Number(live.revision) === 0
      ? { grid_wide: grid.wide, grid_tall: grid.tall, map_mode: mapMode }
      : {};
    const { data, error } = await admin
      .from("companion_lens_sessions")
      .update({ ...values, ...metadata })
      .eq("id", live.id)
      .eq("owner_id", ownerId)
      .select("*")
      .single();
    if (error) throw error;
    session = await rotateGroupGeneration(
      admin,
      data.id,
      ownerId,
      capabilityValues.session_code_hash,
      capabilityValues.realtime_topic,
      publisherLeaseHash,
    ) ?? fail("session_gone", 410);
  } else {
    const { data, error } = await admin
      .from("companion_lens_sessions")
      .insert({
        owner_id: ownerId,
        grid_wide: grid.wide,
        grid_tall: grid.tall,
        map_mode: mapMode,
        ...capabilityValues,
        ...values,
      })
      .select("*")
      .single();
    if (error) throw error;
    session = data;
  }

  return json({
    session: await mapSession(
      admin,
      session,
      sessionCode,
      principal.userId,
      true,
    ),
    publisherLease,
  });
}

async function handleSessionPublish(
  admin: AdminClient,
  serviceKey: string,
  principal: Principal,
  payload: JsonRecord,
  preview?: File,
) {
  requireKind(principal, "website", "publisher_required");
  await consumeRateLimit(admin, principal, "session_publish", 1, 1);
  if (!preview) fail("invalid_preview", 400);
  if (preview.type && preview.type !== "image/png") {
    fail("invalid_preview", 400, "Preview must be image/png.");
  }

  const sessionId = uuid(payload, "sessionId");
  const baseRevision = integer(
    payload,
    "baseRevision",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const title = requiredString(payload, "title", 120);
  const grid = gridFrom(payload);
  const mapMode = mapModeFrom(payload);
  const tileResolution = integer(payload, "tileResolution", 16, 128);
  if (![16, 32, 64, 128].includes(tileResolution)) {
    fail("invalid_request", 400, "Invalid tileResolution.");
  }
  const clientHash = hash64(payload, "sha256");
  const publisherLease = requiredString(payload, "publisherLease", 128);
  const publisherLeaseHash = await sha256Hex(publisherLease);
  const bytes = new Uint8Array(await preview.arrayBuffer());
  const width = grid.wide * tileResolution;
  const height = grid.tall * tileResolution;
  if (width > 4096 || height > 4096 || width * height > 16777216) {
    fail("invalid_preview", 400, "Preview dimensions exceed Lens limits.");
  }
  validatePng(bytes, width, height);
  const serverHash = await sha256Hex(bytes);
  if (serverHash !== clientHash) {
    fail("invalid_preview", 400, "Preview sha256 mismatch.");
  }

  let session = await loadSession(admin, sessionId);
  if (session.owner_id !== principal.userId) fail("forbidden", 403);
  if (session.status === "closed" || session.status === "expired") {
    fail("session_gone", 410);
  }
  if (
    session.publisher_lease_hash !== publisherLeaseHash ||
    new Date(session.publisher_lease_expires_at).getTime() <= Date.now()
  ) {
    fail("publisher_required", 403);
  }
  if (Number(session.revision) !== baseRevision) fail("revision_conflict", 409);

  if (
    session.preview_sha256 === serverHash && session.preview_width === width &&
    session.preview_height === height && session.map_mode === mapMode &&
    session.grid_wide === grid.wide && session.grid_tall === grid.tall &&
    session.tile_resolution === tileResolution
  ) {
    const timestamp = nowIso();
    const { data, error } = await admin
      .from("companion_lens_sessions")
      .update({
        title,
        last_editor_seen_at: timestamp,
        publisher_lease_expires_at: futureIso(LEASE_EXPIRES_MS),
        expires_at: futureIso(SESSION_EXPIRES_MS),
        status: "active",
        updated_at: timestamp,
      })
      .eq("id", sessionId)
      .eq("owner_id", principal.userId)
      .eq("publisher_lease_hash", publisherLeaseHash)
      .eq("revision", baseRevision)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const current = await loadSession(admin, sessionId);
      if (current.publisher_lease_hash !== publisherLeaseHash) {
        fail("publisher_required", 403);
      }
      fail("revision_conflict", 409);
    }
    return json({
      changed: false,
      session: await mapSession(admin, data, undefined, principal.userId, true),
    });
  }

  const nextRevision = baseRevision + 1;
  const path =
    `${principal.userId}/${sessionId}/${nextRevision}-${serverHash}.png`;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(
    path,
    new Blob([bytes], { type: "image/png" }),
    { contentType: "image/png", upsert: false, cacheControl: "60" },
  );
  let uploadedByThisRequest = !uploadError;
  if (uploadError) {
    const current = await loadSession(admin, sessionId);
    if (current.publisher_lease_hash !== publisherLeaseHash) {
      fail("publisher_required", 403);
    }
    if (Number(current.revision) !== baseRevision) {
      fail("revision_conflict", 409);
    }
    // A previous invocation may have uploaded the immutable object and then
    // stopped before the DB compare-and-swap. Reuse only a byte-identical file.
    const { data: existing, error: downloadError } = await admin.storage.from(
      BUCKET,
    ).download(path);
    if (downloadError || !existing) throw uploadError;
    const existingHash = await sha256Hex(
      new Uint8Array(await existing.arrayBuffer()),
    );
    if (existingHash !== serverHash) throw uploadError;
    uploadedByThisRequest = false;
  }

  const timestamp = nowIso();
  const { data, error } = await admin
    .from("companion_lens_sessions")
    .update({
      title,
      grid_wide: grid.wide,
      grid_tall: grid.tall,
      map_mode: mapMode,
      preview_path: path,
      preview_sha256: serverHash,
      preview_width: width,
      preview_height: height,
      tile_resolution: tileResolution,
      revision: nextRevision,
      status: "active",
      last_editor_seen_at: timestamp,
      last_published_at: timestamp,
      publisher_lease_expires_at: futureIso(LEASE_EXPIRES_MS),
      expires_at: futureIso(SESSION_EXPIRES_MS),
      updated_at: timestamp,
    })
    .eq("id", sessionId)
    .eq("owner_id", principal.userId)
    .eq("publisher_lease_hash", publisherLeaseHash)
    .eq("revision", baseRevision)
    .in("status", ["active", "offline"])
    .select("*")
    .maybeSingle();
  if (error || !data) {
    const current = await loadSession(admin, sessionId);
    if (
      Number(current.revision) === nextRevision &&
      current.preview_sha256 === serverHash &&
      current.publisher_lease_hash === publisherLeaseHash
    ) {
      session = current;
      await Promise.allSettled([
        trimOldRevisions(admin, session),
        broadcastRevision(serviceKey, session),
      ]);
      return json({
        changed: true,
        session: await mapSession(
          admin,
          session,
          undefined,
          principal.userId,
          true,
        ),
      });
    }
    const currentUsesUploadedObject =
      Number(current.revision) === nextRevision &&
      current.preview_sha256 === serverHash;
    if (uploadedByThisRequest && !currentUsesUploadedObject) {
      await removePathsBestEffort(admin, [path]);
    }
    if (Number(current.revision) !== baseRevision) {
      fail("revision_conflict", 409);
    }
    if (current.publisher_lease_hash !== publisherLeaseHash) {
      fail("publisher_required", 403);
    }
    throw error ?? new Error("Lens publish update failed.");
  }
  session = data;
  await Promise.allSettled([
    trimOldRevisions(admin, session),
    broadcastRevision(serviceKey, session),
  ]);
  return json({
    changed: true,
    session: await mapSession(
      admin,
      session,
      undefined,
      principal.userId,
      true,
    ),
  });
}

async function handleSessionReacquire(
  admin: AdminClient,
  principal: Principal,
  payload: JsonRecord,
) {
  requireKind(principal, "website", "publisher_required");
  await consumeRateLimit(admin, principal, "session_reacquire", 20, 60);
  const sessionId = uuid(payload, "sessionId");
  const current = await loadSession(admin, sessionId);
  if (current.owner_id !== principal.userId) fail("not_found", 404);
  if (current.status === "closed" || current.status === "expired") {
    fail("session_gone", 410);
  }
  const publisherLease = randomHex(32);
  const { data, error } = await admin
    .from("companion_lens_sessions")
    .update({
      publisher_lease_hash: await sha256Hex(publisherLease),
      publisher_lease_expires_at: futureIso(LEASE_EXPIRES_MS),
      last_editor_seen_at: nowIso(),
      expires_at: futureIso(SESSION_EXPIRES_MS),
      status: "active",
      updated_at: nowIso(),
    })
    .eq("id", sessionId)
    .eq("owner_id", principal.userId)
    .in("status", ["active", "offline"])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) fail("session_gone", 410);
  return json({
    session: await mapSession(admin, data, undefined, principal.userId, true),
    publisherLease,
  });
}

async function handleSessionStatus(
  admin: AdminClient,
  principal: Principal,
  payload: JsonRecord,
) {
  requireKind(principal, "website", "publisher_required");
  await consumeRateLimit(admin, principal, "session_status", 120, 60);
  const sessionId = uuid(payload, "sessionId");
  const publisherLease = requiredString(payload, "publisherLease", 128);
  const publisherLeaseHash = await sha256Hex(publisherLease);
  const session = await loadSession(admin, sessionId);
  if (session.owner_id !== principal.userId) fail("not_found", 404);
  if (
    session.publisher_lease_hash !== publisherLeaseHash ||
    new Date(session.publisher_lease_expires_at).getTime() <= Date.now()
  ) {
    fail("publisher_required", 403);
  }
  if (session.status === "closed" || session.status === "expired") {
    return json({
      session: await mapSession(
        admin,
        session,
        undefined,
        principal.userId,
        true,
      ),
    });
  }
  const timestamp = nowIso();
  const { data, error } = await admin
    .from("companion_lens_sessions")
    .update({
      status: "active",
      last_editor_seen_at: timestamp,
      publisher_lease_expires_at: futureIso(LEASE_EXPIRES_MS),
      expires_at: futureIso(SESSION_EXPIRES_MS),
      updated_at: timestamp,
    })
    .eq("id", sessionId)
    .eq("owner_id", principal.userId)
    .eq("publisher_lease_hash", publisherLeaseHash)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) fail("publisher_required", 403);
  return json({
    session: await mapSession(admin, data, undefined, principal.userId, true),
  });
}

async function handleRotateCode(
  admin: AdminClient,
  serviceKey: string,
  principal: Principal,
  payload: JsonRecord,
) {
  requireKind(principal, "website", "publisher_required");
  await consumeRateLimit(admin, principal, "session_rotate_code", 10, 60);
  const sessionId = uuid(payload, "sessionId");
  const publisherLease = requiredString(payload, "publisherLease", 128);
  const publisherLeaseHash = await sha256Hex(publisherLease);
  const current = await loadSession(admin, sessionId);
  if (current.owner_id !== principal.userId) fail("not_found", 404);
  if (current.status === "closed" || current.status === "expired") {
    fail("session_gone", 410);
  }
  const sessionCode = randomCode();
  const data = await rotateGroupGeneration(
    admin,
    sessionId,
    principal.userId!,
    await sha256Hex(sessionCode),
    `lens:${randomHex(24)}`,
    publisherLeaseHash,
  );
  if (!data) fail("publisher_required", 403);
  await Promise.allSettled([
    broadcastRevision(serviceKey, {
      ...data,
      realtime_topic: current.realtime_topic,
    }),
    broadcastRevision(serviceKey, data),
  ]);
  return json({
    session: await mapSession(admin, data, sessionCode, principal.userId, true),
  });
}

async function handleSessionClose(
  admin: AdminClient,
  serviceKey: string,
  principal: Principal,
  payload: JsonRecord,
) {
  requireKind(principal, "website", "publisher_required");
  await consumeRateLimit(admin, principal, "session_close", 20, 60);
  const sessionId = uuid(payload, "sessionId");
  const publisherLease = requiredString(payload, "publisherLease", 128);
  const publisherLeaseHash = await sha256Hex(publisherLease);
  const { data: closedSession, error: closeError } = await admin
    .from("companion_lens_sessions")
    .update({
      status: "closed",
      updated_at: nowIso(),
      expires_at: futureIso(1),
    })
    .eq("id", sessionId)
    .eq("owner_id", principal.userId)
    .eq("publisher_lease_hash", publisherLeaseHash)
    .in("status", ["active", "offline"])
    .select("*")
    .maybeSingle();
  if (closeError) throw closeError;

  let session = closedSession;
  if (!session) {
    const { data: current, error: findError } = await admin
      .from("companion_lens_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("owner_id", principal.userId)
      .maybeSingle();
    if (findError) throw findError;
    if (
      !current || current.publisher_lease_hash !== publisherLeaseHash ||
      (current.status !== "closed" && current.status !== "expired")
    ) {
      return json({ ok: true, sessionId, stale: true });
    }
    session = current;
  }
  const [placementsDelete, subscribersDelete] = await Promise.all([
    admin.from("companion_lens_placements").delete().eq(
      "session_id",
      sessionId,
    ),
    admin.from("companion_lens_subscribers").delete().eq(
      "session_id",
      sessionId,
    ),
  ]);
  if (placementsDelete.error) throw placementsDelete.error;
  if (subscribersDelete.error) throw subscribersDelete.error;
  await broadcastRevision(serviceKey, {
    ...session,
    status: "closed",
  });
  await clearClosedSessionStorage(admin, session);
  return json({ ok: true, sessionId });
}

async function handleSessionList(admin: AdminClient, principal: Principal) {
  requireKind(principal, "device", "device_required");
  await consumeRateLimit(admin, principal, "session_list", 60, 60);
  const { data: owned, error: ownedError } = await admin
    .from("companion_lens_sessions")
    .select("*")
    .eq("owner_id", principal.userId)
    .in("status", ["active", "offline"])
    .order("updated_at", { ascending: false })
    .limit(MAX_DEVICE_SESSIONS);
  if (ownedError) throw ownedError;
  const { data: subscriptions, error: subscriptionError } = await admin
    .from("companion_lens_subscribers")
    .select("session_id,group_generation")
    .eq("device_token_hash", principal.tokenHash)
    .eq("subscription_kind", "group")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (subscriptionError) throw subscriptionError;
  const joinedIds = Array.from(
    new Set((subscriptions ?? []).map((row) => row.session_id)),
  ).slice(0, MAX_DEVICE_SESSIONS);
  const joinedGenerations = new Map(
    (subscriptions ?? []).map((row) => [
      String(row.session_id),
      Number(row.group_generation),
    ]),
  );
  let joined: LensSessionRow[] = [];
  if (joinedIds.length) {
    const { data, error } = await admin
      .from("companion_lens_sessions")
      .select("*")
      .in("id", joinedIds)
      .in("status", ["active", "offline"])
      .order("updated_at", { ascending: false });
    if (error) throw error;
    joined = (data ?? []).filter((row) =>
      joinedGenerations.get(row.id) === Number(row.group_generation)
    );
  }
  const unique = new Map<string, LensSessionRow>();
  for (
    const row of [...(owned ?? []), ...joined].slice(0, MAX_DEVICE_SESSIONS)
  ) {
    const refreshed = await refreshSessionState(admin, row);
    if (refreshed.status === "active" || refreshed.status === "offline") {
      unique.set(refreshed.id, refreshed);
    }
  }
  return json({
    sessions: await Promise.all(
      Array.from(unique.values()).map((row) =>
        mapSession(admin, row, undefined, principal.userId)
      ),
    ),
  });
}

async function handleSessionJoin(
  admin: AdminClient,
  principal: Principal,
  payload: JsonRecord,
) {
  requireKind(principal, "device", "device_required");
  await consumeRateLimit(admin, principal, "session_join", 10, 60);
  const code = normalizeCode(payload.sessionCode);
  const { data: joined, error } = await admin.rpc("companion_lens_join_group", {
    p_session_code_hash: await sha256Hex(code),
    p_user_id: principal.userId!,
    p_device_token_hash: principal.tokenHash,
  });
  if (error) throw error;
  const data = joined?.[0] ?? null;
  if (!data) fail("invalid_code", 404);
  const session = await refreshSessionState(admin, data);
  if (session.status === "expired" || session.status === "closed") {
    fail("session_gone", 410);
  }
  await touchModSession(admin, session.id);
  return json({
    session: await mapSession(admin, session, undefined, principal.userId),
  });
}

async function handleSessionLeave(
  admin: AdminClient,
  principal: Principal,
  payload: JsonRecord,
) {
  requireKind(principal, "device", "device_required");
  await consumeRateLimit(admin, principal, "session_leave", 30, 60);
  const sessionId = uuid(payload, "sessionId");
  const { error } = await admin
    .from("companion_lens_subscribers")
    .delete()
    .eq("session_id", sessionId)
    .eq("device_token_hash", principal.tokenHash);
  if (error) throw error;
  return json({ ok: true, sessionId });
}

async function reportedPlacementIds(
  admin: AdminClient,
  tokenHash: string,
  ids: string[],
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await admin
    .from("companion_lens_reports")
    .select("placement_id")
    .eq("reporter_device_token_hash", tokenHash)
    .in("placement_id", ids);
  if (error) throw error;
  return new Set((data ?? []).map((row) => String(row.placement_id)));
}

async function sessionPlacements(
  admin: AdminClient,
  principal: Principal,
  session: LensSessionRow,
  groupJoined: boolean,
  serverHash: string | null,
  dimensionId: string | null,
): Promise<JsonRecord[]> {
  const cutoffTime = Date.now() - PLACEMENT_LIVE_MS;
  const { data, error } = await admin
    .from("companion_lens_placements")
    .select("*")
    .eq("session_id", session.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const visible = (data ?? []).filter((row) => {
    const contextMatches = row.server_hash === serverHash &&
      row.dimension_id === dimensionId;
    const ownedByUser = row.owner_id === principal.userId;
    const live = new Date(row.last_seen_at).getTime() >= cutoffTime;
    if (row.visibility === "personal") {
      return ownedByUser && contextMatches;
    }
    if (row.visibility === "group") {
      return contextMatches && (ownedByUser || (groupJoined && live));
    }
    return false;
  });
  const hidden = await reportedPlacementIds(
    admin,
    principal.tokenHash,
    visible.map((row) => row.id),
  );
  return visible.filter((row) => !hidden.has(row.id)).map((row) =>
    mapPlacement(row, session, undefined, principal.tokenHash)
  );
}

async function handleSessionPoll(
  admin: AdminClient,
  principal: Principal,
  payload: JsonRecord,
) {
  requireKind(principal, "device", "device_required");
  await consumeRateLimit(admin, principal, "session_poll", 120, 60);
  const sessionId = uuid(payload, "sessionId");
  const knownRevision = integer(
    payload,
    "knownRevision",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const { serverHash, dimensionId } = normalizeServerContext(payload, false);
  const session = await loadSession(admin, sessionId);
  if (session.status === "closed" || session.status === "expired") {
    fail("session_gone", 410);
  }

  const isOwner = session.owner_id === principal.userId;
  const groupJoined = !isOwner && await getGroupSubscription(
    admin,
    sessionId,
    principal.tokenHash,
    Number(session.group_generation),
  );
  if (!isOwner && !groupJoined) fail("not_joined", 403);

  const changed = knownRevision !== Number(session.revision);
  const placements = await sessionPlacements(
    admin,
    principal,
    session,
    groupJoined,
    serverHash,
    dimensionId,
  );
  return json({
    changed,
    session: await mapSession(admin, session, undefined, principal.userId),
    ...(changed && placements.length > 0
      ? { signedPreviewUrl: await signedPreviewUrl(admin, session) }
      : {}),
    placements,
  });
}

async function handlePlacementUpsert(
  admin: AdminClient,
  serviceKey: string,
  principal: Principal,
  payload: JsonRecord,
) {
  requireKind(principal, "device", "device_required");
  await consumeRateLimit(admin, principal, "placement_upsert", 60, 60);
  const sessionId = uuid(payload, "sessionId");
  const session = await loadSession(admin, sessionId);
  if (session.status === "closed" || session.status === "expired") {
    fail("session_gone", 410);
  }
  if (session.owner_id !== principal.userId) fail("forbidden", 403);
  const visibility = String(
    payload.visibility ?? "",
  ) as LensPlacementRow["visibility"];
  if (!["personal", "group"].includes(visibility)) {
    fail("invalid_request", 400, "Invalid visibility.");
  }
  const context = normalizeServerContext(payload, visibility === "group");
  const anchor = payload.anchor && typeof payload.anchor === "object"
    ? payload.anchor as JsonRecord
    : {};
  const anchorPayload: JsonRecord = { x: anchor.x, y: anchor.y, z: anchor.z };
  const x = integer(anchorPayload, "x", -30000000, 30000000);
  const y = integer(anchorPayload, "y", -2048, 2048);
  const z = integer(anchorPayload, "z", -30000000, 30000000);
  const facing = String(payload.facing ?? "") as LensPlacementRow["facing"];
  if (!["north", "south", "east", "west"].includes(facing)) {
    fail("invalid_request", 400, "Invalid facing.");
  }
  const requestedId = optionalString(payload, "placementId", 36);
  if (
    requestedId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(requestedId)
  ) {
    fail("invalid_request", 400, "Invalid placementId.");
  }
  const timestamp = nowIso();
  const values = {
    session_id: sessionId,
    owner_id: principal.userId,
    owner_key: session.owner_key,
    owner_device_token_hash: principal.tokenHash,
    title: optionalString(payload, "title", 120) ?? session.title,
    visibility,
    server_hash: context.serverHash,
    dimension_id: context.dimensionId,
    anchor_x: x,
    anchor_y: y,
    anchor_z: z,
    facing,
    last_seen_at: timestamp,
    updated_at: timestamp,
  };

  let placement: LensPlacementRow | null = null;
  if (requestedId) {
    const { data: existing, error: existingError } = await admin
      .from("companion_lens_placements")
      .select("*")
      .eq("id", requestedId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.owner_device_token_hash !== principal.tokenHash) {
      fail("forbidden", 403);
    }
    if (existing && existing.session_id !== sessionId) fail("forbidden", 403);
    if (existing) {
      const { data, error } = await admin
        .from("companion_lens_placements")
        .update(values)
        .eq("id", requestedId)
        .eq("owner_device_token_hash", principal.tokenHash)
        .select("*")
        .single();
      if (error) throw error;
      placement = data;
    }
  }
  if (!placement) {
    const { count, error: countError } = await admin
      .from("companion_lens_placements")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId);
    if (countError) throw countError;
    if ((count ?? 0) >= 8) fail("placement_limit", 409);
    const { data, error } = await admin
      .from("companion_lens_placements")
      .insert({ ...(requestedId ? { id: requestedId } : {}), ...values })
      .select("*")
      .single();
    if (error?.message?.includes("placement_limit")) {
      fail("placement_limit", 409);
    }
    if (error) throw error;
    placement = data;
  }
  await touchModSession(admin, sessionId);
  await broadcastRevision(serviceKey, { ...session, updated_at: timestamp });
  return json({
    placement: mapPlacement(placement, session, undefined, principal.tokenHash),
  });
}

async function handlePlacementDelete(
  admin: AdminClient,
  serviceKey: string,
  principal: Principal,
  payload: JsonRecord,
) {
  requireKind(principal, "device", "device_required");
  await consumeRateLimit(admin, principal, "placement_delete", 60, 60);
  const placementId = uuid(payload, "placementId");
  const { data: existing, error: findError } = await admin
    .from("companion_lens_placements")
    .select("id,session_id,owner_device_token_hash")
    .eq("id", placementId)
    .maybeSingle();
  if (findError) throw findError;
  if (!existing) return json({ ok: true, placementId });
  if (existing.owner_device_token_hash !== principal.tokenHash) {
    fail("forbidden", 403);
  }
  const { error } = await admin
    .from("companion_lens_placements")
    .delete()
    .eq("id", placementId)
    .eq("owner_device_token_hash", principal.tokenHash);
  if (error) throw error;
  try {
    const session = await loadSession(admin, existing.session_id);
    await broadcastRevision(serviceKey, { ...session, updated_at: nowIso() });
  } catch (error) {
    console.warn("Lens placement delete Broadcast failed", error);
  }
  return json({ ok: true, placementId });
}

function uuidArray(value: unknown, maxLength: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxLength) {
    fail("invalid_request", 400);
  }
  const result = value.map((item) => String(item).toLowerCase());
  if (
    result.some((item) =>
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        .test(item)
    )
  ) {
    fail("invalid_request", 400);
  }
  return Array.from(new Set(result));
}

async function handlePresenceHeartbeat(
  admin: AdminClient,
  principal: Principal,
  payload: JsonRecord,
) {
  requireKind(principal, "device", "device_required");
  await consumeRateLimit(admin, principal, "presence_heartbeat", 120, 60);
  const sessionIds = uuidArray(payload.sessionIds, 20);
  const placementIds = uuidArray(payload.placementIds, 8);
  if (!sessionIds.length && !placementIds.length) fail("invalid_request", 400);
  const timestamp = nowIso();
  if (sessionIds.length) {
    const [subscriberResult, ownerResult] = await Promise.all([
      admin.from("companion_lens_subscribers").select(
        "session_id,group_generation",
      )
        .eq("device_token_hash", principal.tokenHash).in(
          "session_id",
          sessionIds,
        ),
      admin.from("companion_lens_sessions").select("id")
        .eq("owner_id", principal.userId).in("id", sessionIds),
    ]);
    if (subscriberResult.error) throw subscriberResult.error;
    if (ownerResult.error) throw ownerResult.error;
    const ownerSessionIds = (ownerResult.data ?? []).map((row) =>
      String(row.id)
    );
    const subscriberGenerations = new Map(
      (subscriberResult.data ?? []).map((row) => [
        String(row.session_id),
        Number(row.group_generation),
      ]),
    );
    let currentSubscriberIds: string[] = [];
    if (subscriberGenerations.size) {
      const { data: currentSessions, error: currentSessionsError } = await admin
        .from("companion_lens_sessions")
        .select("id,group_generation")
        .in("id", Array.from(subscriberGenerations.keys()));
      if (currentSessionsError) throw currentSessionsError;
      currentSubscriberIds = (currentSessions ?? []).filter((row) =>
        subscriberGenerations.get(String(row.id)) ===
          Number(row.group_generation)
      ).map((row) => String(row.id));
    }
    if (currentSubscriberIds.length) {
      const { error } = await admin
        .from("companion_lens_subscribers")
        .update({ last_seen_at: timestamp, updated_at: timestamp })
        .eq("device_token_hash", principal.tokenHash)
        .in("session_id", currentSubscriberIds);
      if (error) throw error;
    }
    if (ownerSessionIds.length) {
      const { error: ownerHeartbeatError } = await admin
        .from("companion_lens_sessions")
        .update({
          last_mod_seen_at: timestamp,
          owner_device_token_hash: principal.tokenHash,
        })
        .in("id", ownerSessionIds);
      if (ownerHeartbeatError) throw ownerHeartbeatError;
    }
  }
  if (placementIds.length) {
    const { data, error } = await admin
      .from("companion_lens_placements")
      .update({ last_seen_at: timestamp, updated_at: timestamp })
      .eq("owner_device_token_hash", principal.tokenHash)
      .in("id", placementIds)
      .select("id,session_id");
    if (error) throw error;
    const touchedSessionIds = Array.from(
      new Set((data ?? []).map((row) => row.session_id)),
    );
    if (touchedSessionIds.length) {
      const { error: touchedSessionError } = await admin.from(
        "companion_lens_sessions",
      )
        .update({ last_mod_seen_at: timestamp })
        .in("id", touchedSessionIds);
      if (touchedSessionError) throw touchedSessionError;
    }
  }
  return json({ ok: true, seenAt: timestamp });
}

async function handlePlacementReport(
  admin: AdminClient,
  principal: Principal,
  payload: JsonRecord,
) {
  requireKind(principal, "device", "device_required");
  await consumeRateLimit(admin, principal, "placement_report", 10, 3600);
  const placementId = uuid(payload, "placementId");
  const reason = String(payload.reason ?? "") as LensReportRow["reason"];
  if (!["spam", "sexual", "hateful", "other"].includes(reason)) {
    fail("invalid_request", 400, "Invalid reason.");
  }
  const { data: placement, error: placementError } = await admin
    .from("companion_lens_placements")
    .select("id,session_id,owner_id,visibility")
    .eq("id", placementId)
    .maybeSingle();
  if (placementError) throw placementError;
  if (!placement) fail("not_found", 404);
  const session = await loadSession(admin, placement.session_id);
  if (
    placement.visibility === "personal" &&
    placement.owner_id !== principal.userId
  ) {
    fail("forbidden", 403);
  }
  if (
    placement.visibility === "group" &&
    placement.owner_id !== principal.userId &&
    !await getGroupSubscription(
      admin,
      placement.session_id,
      principal.tokenHash,
      Number(session.group_generation),
    )
  ) {
    fail("not_joined", 403);
  }
  const { error } = await admin.from("companion_lens_reports").upsert({
    placement_id: placement.id,
    session_id: placement.session_id,
    reporter_id: principal.userId,
    reporter_device_token_hash: principal.tokenHash,
    reason,
  }, { onConflict: "placement_id,reporter_device_token_hash" });
  if (error) throw error;
  return json({ ok: true, placementId, hidden: true });
}

async function sweepOrphanedLensPrefixes(
  admin: AdminClient,
): Promise<number> {
  const { data: cleanupState, error: cleanupStateError } = await admin
    .from("companion_lens_cleanup_state")
    .select("owner_offset,updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (cleanupStateError) throw cleanupStateError;
  if (
    cleanupState?.updated_at &&
    new Date(cleanupState.updated_at).getTime() >=
      Date.now() - ORPHAN_SWEEP_INTERVAL_MS
  ) return 0;
  const ownerOffset = Math.max(0, Number(cleanupState?.owner_offset ?? 0));
  const ownerIds: string[] = [];
  let listedOwners = 0;
  let reachedOwnerEnd = false;
  for (let page = 0; page < ORPHAN_SWEEP_OWNER_PAGES; page += 1) {
    const { data, error } = await admin.storage.from(BUCKET).list("", {
      limit: ORPHAN_SWEEP_PAGE_SIZE,
      offset: ownerOffset + page * ORPHAN_SWEEP_PAGE_SIZE,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      console.warn("Lens orphan owner sweep failed", error.message);
      return 0;
    }
    listedOwners += (data ?? []).length;
    ownerIds.push(
      ...(data ?? []).map((item) => item.name.toLowerCase()).filter((name) =>
        UUID_PATTERN.test(name)
      ),
    );
    if ((data ?? []).length < ORPHAN_SWEEP_PAGE_SIZE) {
      reachedOwnerEnd = true;
      break;
    }
  }

  const nextOwnerOffset = reachedOwnerEnd ? 0 : ownerOffset + listedOwners;
  const { error: cursorError } = await admin
    .from("companion_lens_cleanup_state")
    .upsert({ id: 1, owner_offset: nextOwnerOffset, updated_at: nowIso() });
  if (cursorError) throw cursorError;

  const prefixes: Array<{ ownerId: string; sessionId: string }> = [];
  for (const ownerId of ownerIds) {
    const { data, error } = await admin.storage.from(BUCKET).list(ownerId, {
      limit: ORPHAN_SWEEP_SESSION_PAGE_SIZE,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      console.warn("Lens orphan session sweep failed", error.message);
      continue;
    }
    for (const item of data ?? []) {
      const sessionId = item.name.toLowerCase();
      if (UUID_PATTERN.test(sessionId)) prefixes.push({ ownerId, sessionId });
    }
  }
  if (!prefixes.length) return 0;

  const { data: liveSessions, error: sessionError } = await admin
    .from("companion_lens_sessions")
    .select("id,owner_id")
    .in("id", Array.from(new Set(prefixes.map((prefix) => prefix.sessionId))));
  if (sessionError) throw sessionError;
  const livePrefixes = new Set(
    (liveSessions ?? []).map((session) => `${session.owner_id}/${session.id}`),
  );

  let removed = 0;
  for (const prefix of prefixes) {
    if (removed >= ORPHAN_SWEEP_MAX_OBJECTS) break;
    const folder = `${prefix.ownerId}/${prefix.sessionId}`;
    if (livePrefixes.has(folder)) continue;
    const { data, error } = await admin.storage.from(BUCKET).list(folder, {
      limit: Math.min(
        ORPHAN_SWEEP_PAGE_SIZE,
        ORPHAN_SWEEP_MAX_OBJECTS - removed,
      ),
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      console.warn("Lens orphan object sweep failed", error.message);
      continue;
    }
    const paths = (data ?? []).filter((item) => item.name.endsWith(".png")).map(
      (item) => `${folder}/${item.name}`,
    );
    const result = await removePathsBestEffort(admin, paths);
    removed += result.removed;
  }
  return removed;
}

async function handleMaintenanceCleanup(
  admin: AdminClient,
  principal: Principal,
) {
  requireKind(principal, "server", "unauthorized");
  await consumeRateLimit(admin, principal, "maintenance_cleanup", 6, 60);
  const { data: sessions, error } = await admin
    .from("companion_lens_sessions")
    .select("*")
    .or(
      `status.in.(closed,expired),expires_at.lte.${nowIso()}`,
    )
    .order("updated_at", { ascending: true })
    .limit(CLEANUP_SESSION_BATCH_SIZE);
  if (error) throw error;
  let expiredSessions = 0;
  let deletedSessions = 0;
  let removedObjects = 0;
  const trimmedObjects = 0;
  for (const original of sessions ?? []) {
    const session = await refreshSessionState(admin, original);
    if (session.status === "closed" || session.status === "expired") {
      if (original.status !== "expired" && session.status === "expired") {
        expiredSessions += 1;
      }
      await Promise.allSettled([
        admin.from("companion_lens_placements").delete().eq(
          "session_id",
          session.id,
        ),
        admin.from("companion_lens_subscribers").delete().eq(
          "session_id",
          session.id,
        ),
      ]);
      const storage = await clearClosedSessionStorage(admin, session);
      removedObjects += storage.removed;
      if (
        storage.clean &&
        new Date(session.updated_at).getTime() < Date.now() - 10 * 60 * 1000
      ) {
        const { error: deleteError } = await admin
          .from("companion_lens_sessions")
          .delete()
          .eq("id", session.id);
        if (deleteError) throw deleteError;
        deletedSessions += 1;
      }
    }
  }
  const orphanedObjects = await sweepOrphanedLensPrefixes(admin);
  const { error: limitsError } = await admin
    .from("companion_lens_rate_limits")
    .delete()
    .lt("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if (limitsError) {
    console.warn("Lens rate-limit cleanup failed", limitsError.message);
  }
  return json({
    ok: true,
    expiredSessions,
    deletedSessions,
    removedObjects,
    trimmedObjects,
    orphanedObjects,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase service configuration is missing.");
    }
    const admin = createClient<Database>(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { payload, preview } = await readRequest(req);
    const action = requiredString(payload, "action", 64);
    const principal = await authenticate(admin, req, payload.principalKind);

    if (action === "capabilities") {
      return json({ ...capabilities(), principalKind: principal.kind });
    }
    if (action === "maintenance_cleanup") {
      return await handleMaintenanceCleanup(admin, principal);
    }
    if (Deno.env.get("LENS_ENABLED") !== "true") fail("lens_disabled", 503);

    if (action === "session_start") {
      return await handleSessionStart(admin, principal, payload);
    }
    if (action === "session_publish") {
      return await handleSessionPublish(
        admin,
        serviceKey,
        principal,
        payload,
        preview,
      );
    }
    if (action === "session_reacquire") {
      return await handleSessionReacquire(admin, principal, payload);
    }
    if (action === "session_status") {
      return await handleSessionStatus(admin, principal, payload);
    }
    if (action === "session_rotate_code") {
      return await handleRotateCode(admin, serviceKey, principal, payload);
    }
    if (action === "session_close") {
      return await handleSessionClose(admin, serviceKey, principal, payload);
    }
    if (action === "session_list") {
      return await handleSessionList(admin, principal);
    }
    if (action === "session_join") {
      return await handleSessionJoin(admin, principal, payload);
    }
    if (action === "session_leave") {
      return await handleSessionLeave(admin, principal, payload);
    }
    if (action === "session_poll") {
      return await handleSessionPoll(admin, principal, payload);
    }
    if (action === "placement_upsert") {
      return await handlePlacementUpsert(admin, serviceKey, principal, payload);
    }
    if (action === "placement_delete") {
      return await handlePlacementDelete(admin, serviceKey, principal, payload);
    }
    if (action === "presence_heartbeat") {
      return await handlePresenceHeartbeat(admin, principal, payload);
    }
    if (action === "placement_report") {
      return await handlePlacementReport(admin, principal, payload);
    }
    fail("invalid_request", 400, "Unsupported Lens action.");
  } catch (error) {
    return errorResponse(error);
  }
});
