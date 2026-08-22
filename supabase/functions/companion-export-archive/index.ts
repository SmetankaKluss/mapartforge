import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";
import { classifyCompanionBearer } from "../_shared/companionAuthRouting.ts";
import {
  createCompanionArtifactUploadTarget,
  presignCompanionArtifactYandexRequest,
  readCompanionArtifactYandexConfig,
  removeCompanionArtifactYandexObjects,
  type CompanionArtifactYandexConfig,
} from "../_shared/companionArtifactYandexStorage.ts";

// Generated database types are not available in this standalone Edge bundle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>;

type Action = "session_start" | "file_prepare" | "file_complete";

type ArchiveFile = {
  id: string;
  bucket_id: string;
  storage_path: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  status: "reserved" | "ready" | "failed";
};

type Payload = {
  action?: Action;
  client_key?: string;
  access_token?: string;
  session_id?: string;
  file_id?: string;
  kind?: "preview" | "export";
  filename?: string;
  content_type?: string;
  size_bytes?: number;
  sha256?: string;
};

const MAX_REQUEST_BYTES = 4 * 1024;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function mediaType(value: string | null): string {
  return (value ?? "").split(";", 1)[0].trim().toLowerCase();
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readPayload(request: Request): Promise<Payload> {
  const headerLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(headerLength) && headerLength > MAX_REQUEST_BYTES) throw new Error("payload_too_large");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("invalid_content_type");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) throw new Error("payload_too_large");
  const payload = JSON.parse(raw) as Payload;
  if (!payload || typeof payload !== "object") throw new Error("invalid_payload");
  return payload;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validClientKey(value: unknown): value is string {
  return validUuid(value);
}

function validAccessToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{40,100}$/.test(value);
}

async function optionalWebsiteUserId(
  admin: AdminClient,
  authorization: string | null,
): Promise<string | null> {
  const bearer = classifyCompanionBearer(authorization);
  if (!bearer || bearer.kind !== "website_jwt") return null;
  const { data, error } = await admin.auth.getUser(bearer.token);
  return error || !data.user?.id ? null : data.user.id;
}

async function cleanupExpiredArchives(
  admin: AdminClient,
  config: CompanionArtifactYandexConfig,
): Promise<void> {
  const { data: sessions, error } = await admin
    .from("export_archive_sessions")
    .select("id, export_archive_files(bucket_id, storage_path)")
    .lte("expires_at", new Date().toISOString())
    .limit(20);
  if (error || !sessions?.length) return;

  for (const session of sessions as Array<{
    id: string;
    export_archive_files: Array<{ bucket_id: string; storage_path: string }> | null;
  }>) {
    const files = session.export_archive_files ?? [];
    if (files.length) {
      const removed = await removeCompanionArtifactYandexObjects(config, files.map((file) => ({
        bucketId: file.bucket_id,
        storagePath: file.storage_path,
      })));
      if (removed.failed > 0) continue;
    }
    await admin.from("export_archive_sessions").delete().eq("id", session.id);
  }
}

async function verifyUploadedFile(
  config: CompanionArtifactYandexConfig,
  file: ArchiveFile,
): Promise<void> {
  const url = await presignCompanionArtifactYandexRequest(
    config,
    "HEAD",
    file.bucket_id,
    file.storage_path,
    60,
  );
  const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8_000) });
  if (!response.ok ||
    Number(response.headers.get("content-length")) !== file.size_bytes ||
    mediaType(response.headers.get("content-type")) !== mediaType(file.content_type) ||
    response.headers.get("x-amz-meta-sha256")?.trim().toLowerCase() !== file.sha256
  ) throw new Error("archive_upload_verification_failed");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const storage = readCompanionArtifactYandexConfig();
  if (!supabaseUrl || !serviceKey || !storage) return json({ error: "archive_unavailable" }, 503);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const ownerId = await optionalWebsiteUserId(admin, request.headers.get("authorization"));
    const payload = await readPayload(request);
    if (payload.action === "session_start") {
      if (!validClientKey(payload.client_key) || !validAccessToken(payload.access_token)) {
        return json({ error: "invalid_payload" }, 400);
      }
      // Cleanup is best-effort and never delays or exposes the local download.
      await cleanupExpiredArchives(admin, storage).catch(() => undefined);
      const { data, error } = await admin.rpc("start_private_export_archive_session", {
        requested_owner_id: ownerId,
        requested_client_key_hash: await sha256Hex(payload.client_key),
        requested_access_token_hash: await sha256Hex(payload.access_token),
      });
      const session = Array.isArray(data) ? data[0] : data;
      if (error || !session?.id || !session?.expires_at) throw new Error("archive_session_unavailable");
      return json({ sessionId: session.id, expiresAt: session.expires_at });
    }

    if (payload.action === "file_prepare") {
      if (!validUuid(payload.session_id) || !validUuid(payload.file_id) || !validAccessToken(payload.access_token) ||
        (payload.kind !== "preview" && payload.kind !== "export") ||
        typeof payload.filename !== "string" || typeof payload.content_type !== "string" ||
        !Number.isSafeInteger(payload.size_bytes) || typeof payload.sha256 !== "string") {
        return json({ error: "invalid_payload" }, 400);
      }
      const { data, error } = await admin.rpc("prepare_private_export_archive_file", {
        requested_session_id: payload.session_id,
        requested_access_token_hash: await sha256Hex(payload.access_token),
        requested_file_id: payload.file_id,
        requested_kind: payload.kind,
        requested_filename: payload.filename,
        requested_content_type: payload.content_type,
        requested_size_bytes: payload.size_bytes,
        requested_sha256: payload.sha256.toLowerCase(),
      });
      const file = (Array.isArray(data) ? data[0] : data) as ArchiveFile | null;
      if (error || !file) throw new Error("archive_file_unavailable");
      const uploadTarget = await createCompanionArtifactUploadTarget(storage, {
        bucketId: file.bucket_id,
        storagePath: file.storage_path,
        contentType: file.content_type,
        sha256: file.sha256,
      });
      return json({ artifactId: file.id, uploadTarget });
    }

    if (payload.action === "file_complete") {
      if (!validUuid(payload.session_id) || !validUuid(payload.file_id) || !validAccessToken(payload.access_token)) {
        return json({ error: "invalid_payload" }, 400);
      }
      const accessTokenHash = await sha256Hex(payload.access_token);
      const { data: archiveSession, error: archiveSessionError } = await admin
        .from("export_archive_sessions")
        .select("id")
        .eq("id", payload.session_id)
        .eq("access_token_hash", accessTokenHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (archiveSessionError || !archiveSession) throw new Error("archive_file_unavailable");
      const { data, error } = await admin
        .from("export_archive_files")
        .select("id, bucket_id, storage_path, content_type, size_bytes, sha256, status")
        .eq("id", payload.file_id)
        .eq("session_id", payload.session_id)
        .maybeSingle();
      if (error || !data) throw new Error("archive_file_unavailable");
      const file = data as ArchiveFile;
      if (file.status !== "ready") await verifyUploadedFile(storage, file);
      const { data: complete, error: completeError } = await admin.rpc(
        "complete_private_export_archive_file",
        {
          requested_session_id: payload.session_id,
          requested_access_token_hash: accessTokenHash,
          requested_file_id: payload.file_id,
        },
      );
      if (completeError || complete !== true) throw new Error("archive_file_unavailable");
      return json({ ready: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "archive_unavailable";
    const status = message === "payload_too_large" ? 413
      : message === "invalid_content_type" ? 415
      : message.startsWith("invalid_") ? 400
      : message.includes("limit") ? 429
      : 503;
    return json({ error: message }, status);
  }
});
