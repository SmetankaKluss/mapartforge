import { createHash } from "node:crypto";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";
import {
  drainCompanionStorageDeleteOutbox,
} from "./companionStorageCleanup.ts";

// Generated database types are not available in this standalone Edge bundle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>;

const MAX_IMPORT_BYTES = 12 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024;
const MAX_GRID_SIDE = 16;
const PRIVATE_BUCKET = "mapkluss-companion-private";
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const SOURCES = new Set(["hand", "frame", "wall", "manual_wall"]);

export class CompanionScanUploadError extends Error {
  constructor(
    public readonly code: string,
    public readonly responseStatus: number,
    public readonly retryAfterMs?: number,
  ) {
    super(code);
  }
}

export type CompanionScanUploadResult = {
  importId: string;
  imagePath: string;
  signedUrl: string | null;
  sha256: string;
  createdAt: string;
  reused: boolean;
};

function badRequest(code: string): never {
  throw new CompanionScanUploadError(code, 400);
}

function parseGrid(value: unknown): { wide: number; tall: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    badRequest("bad_map_grid");
  }
  const wide = Number(Reflect.get(value, "wide"));
  const tall = Number(Reflect.get(value, "tall"));
  if (
    !Number.isInteger(wide) || !Number.isInteger(tall) ||
    wide < 1 || tall < 1 || wide > MAX_GRID_SIDE || tall > MAX_GRID_SIDE
  ) {
    badRequest("bad_map_grid");
  }
  return { wide, tall };
}

export function decodeAndValidateCompanionPng(
  value: unknown,
  grid: { wide: number; tall: number },
): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string") badRequest("missing_image");
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match) badRequest("invalid_png_data_url");
  const base64 = match[1];
  if (base64.length === 0 || base64.length % 4 !== 0) {
    badRequest("invalid_png_data_url");
  }
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const decodedSize = (base64.length / 4) * 3 - padding;
  if (decodedSize < 24 || decodedSize > MAX_IMPORT_BYTES) {
    badRequest("image_too_large");
  }

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    badRequest("invalid_png_data_url");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (bytes.byteLength !== decodedSize) badRequest("invalid_png_data_url");
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) badRequest("invalid_png");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ihdrLength = view.getUint32(8, false);
  const ihdrType = String.fromCharCode(
    bytes[12],
    bytes[13],
    bytes[14],
    bytes[15],
  );
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (
    ihdrLength !== 13 || ihdrType !== "IHDR" ||
    width !== grid.wide * 128 || height !== grid.tall * 128 ||
    width > 2048 || height > 2048
  ) {
    badRequest("unexpected_png_dimensions");
  }
  return bytes;
}

function parseMetadata(
  value: unknown,
  missingMaps: number,
): Record<string, unknown> {
  if (value == null) value = {};
  if (typeof value !== "object" || Array.isArray(value)) {
    badRequest("bad_metadata");
  }
  const metadata = {
    ...(value as Record<string, unknown>),
    missing_maps: missingMaps,
  };
  let encoded: Uint8Array;
  try {
    encoded = new TextEncoder().encode(JSON.stringify(metadata));
  } catch {
    badRequest("bad_metadata");
  }
  if (encoded.byteLength > MAX_METADATA_BYTES) badRequest("metadata_too_large");
  return metadata;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function consumeRateLimit(
  admin: AdminClient,
  keyHash: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const { data, error } = await admin.rpc("companion_lens_consume_rate_limit", {
    p_key_hash: keyHash,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new CompanionScanUploadError("rate_limit_unavailable", 503);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.allowed) {
    throw new CompanionScanUploadError(
      "scan_upload_rate_limited",
      429,
      Math.max(1, Number(result?.retry_after_ms ?? 1000) || 1000),
    );
  }
}

export async function processCompanionScanUpload(
  admin: AdminClient,
  userId: string,
  payload: Record<string, unknown>,
): Promise<CompanionScanUploadResult> {
  const source = String(payload.source ?? "wall");
  if (!SOURCES.has(source)) badRequest("bad_scan_source");
  const title = String(payload.title ?? "Imported map art").trim();
  if (title.length < 1 || title.length > 120) badRequest("bad_title");
  const grid = parseGrid(payload.map_grid ?? { wide: 1, tall: 1 });
  const missingMaps = Number(payload.missing_maps ?? 0);
  if (
    !Number.isInteger(missingMaps) || missingMaps < 0 ||
    missingMaps > grid.wide * grid.tall
  ) {
    badRequest("bad_missing_maps");
  }
  const metadata = parseMetadata(payload.metadata, missingMaps);
  const bytes = decodeAndValidateCompanionPng(payload.image_base64, grid);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const userKey = await sha256Hex(userId);
  await consumeRateLimit(admin, userKey, "scan_upload_minute", 12, 60);
  await consumeRateLimit(admin, userKey, "scan_upload_day", 200, 86400);

  const storagePath = `companion/${userId}/imports/${crypto.randomUUID()}.png`;
  const { error: reservationError } = await admin.rpc(
    "reserve_companion_import_upload",
    {
      requested_owner_id: userId,
      requested_image_path: storagePath,
      requested_size_bytes: bytes.byteLength,
      requested_sha256: sha256,
    },
  );
  if (reservationError) {
    const message = String(reservationError.message ?? "");
    if (message.includes("quota exceeded")) {
      throw new CompanionScanUploadError("storage_quota_exceeded", 409);
    }
    throw new CompanionScanUploadError("scan_reservation_failed", 503);
  }

  const { error: uploadError } = await admin.storage
    .from(PRIVATE_BUCKET)
    .upload(storagePath, new Blob([bytes], { type: "image/png" }), {
      contentType: "image/png",
      upsert: false,
    });

  const { data, error: publishError } = await admin.rpc(
    "publish_companion_import",
    {
      requested_owner_id: userId,
      requested_bucket_id: PRIVATE_BUCKET,
      requested_source: source,
      requested_title: title,
      requested_map_grid: grid,
      requested_image_path: storagePath,
      requested_size_bytes: bytes.byteLength,
      requested_sha256: sha256,
      requested_metadata: metadata,
    },
  );
  let result = data as {
    state?: string;
    importId?: string;
    bucketId?: string;
    imagePath?: string;
    createdAt?: string;
  } | null;
  if (publishError) {
    const { data: reconciled, error: reconcileError } = await admin
      .from("companion_imports")
      .select("id,bucket_id,image_path,created_at")
      .eq("owner_id", userId)
      .eq("bucket_id", PRIVATE_BUCKET)
      .eq("image_path", storagePath)
      .eq("size_bytes", bytes.byteLength)
      .eq("sha256", sha256)
      .maybeSingle();
    if (reconcileError) {
      throw new CompanionScanUploadError("scan_publish_failed", 503);
    }
    if (reconciled) {
      result = {
        state: "created",
        importId: String(reconciled.id),
        bucketId: String(reconciled.bucket_id),
        imagePath: String(reconciled.image_path),
        createdAt: String(reconciled.created_at),
      };
    } else {
      await admin.from("companion_import_upload_reservations")
        .update({ status: "cancelled" })
        .eq("owner_id", userId)
        .eq("bucket_id", PRIVATE_BUCKET)
        .eq("object_path", storagePath)
        .eq("status", "uploading");
      await drainCompanionStorageDeleteOutbox(admin, userId).catch(() => undefined);
    }
    const message = String(publishError.message ?? "");
    if (!result && message.includes("quota exceeded")) {
      throw new CompanionScanUploadError(
        message.includes("storage")
          ? "storage_quota_exceeded"
          : "import_quota_exceeded",
        409,
      );
    }
    if (!result) {
      throw new CompanionScanUploadError(
        uploadError ? "scan_upload_failed" : "scan_publish_failed",
        503,
      );
    }
  }

  if (!result?.importId || !result.bucketId || !result.imagePath || !result.createdAt) {
    await admin.from("companion_import_upload_reservations")
      .update({ status: "cancelled" })
      .eq("owner_id", userId)
      .eq("bucket_id", PRIVATE_BUCKET)
      .eq("object_path", storagePath)
      .eq("status", "uploading");
    throw new CompanionScanUploadError("scan_publish_failed", 503);
  }
  await drainCompanionStorageDeleteOutbox(admin, userId).catch(() => undefined);
  const { data: signed, error: signedError } = await admin.storage
    .from(result.bucketId)
    .createSignedUrl(result.imagePath, 60 * 30);
  if (signedError) throw new CompanionScanUploadError("scan_sign_failed", 503);
  return {
    importId: result.importId,
    imagePath: result.imagePath,
    signedUrl: signed?.signedUrl ?? null,
    sha256,
    createdAt: result.createdAt,
    reused: result.state === "reused",
  };
}
