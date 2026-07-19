import {
  CompanionArtifactVerificationError,
  type ReservedCompanionArtifact,
  verifyCompanionArtifactResponse,
} from "./companionSaveVerification.ts";

export type LegacyCompanionArtifact = {
  artifactId: string;
  kind: string;
  filename: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
};

export type CompanionArtifactBackfillFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type LegacyCompanionArtifactRowState = {
  id?: unknown;
  owner_id?: unknown;
  bucket_id?: unknown;
  storage_path?: unknown;
  content_type?: unknown;
  size_bytes?: unknown;
  sha256?: unknown;
};

export function classifyCompanionArtifactBackfillState(
  row: LegacyCompanionArtifactRowState | null | undefined,
  artifact: LegacyCompanionArtifact,
  ownerId: string,
): "promoted" | "legacy" | "unknown" {
  if (!row
    || String(row.id ?? "") !== artifact.artifactId
    || String(row.owner_id ?? "") !== ownerId
    || String(row.storage_path ?? "") !== artifact.storagePath
    || String(row.content_type ?? "") !== artifact.contentType
    || Number(row.size_bytes ?? 0) !== artifact.sizeBytes
    || String(row.sha256 ?? "") !== artifact.sha256) {
    return "unknown";
  }
  if (row.bucket_id === "mapkluss-companion-private") return "promoted";
  if (row.bucket_id === "mapartforge") return "legacy";
  return "unknown";
}

function encodedObjectPath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function storageUrl(
  supabaseUrl: string,
  route: "public" | "authenticated" | "upload",
  bucket: string,
  path: string,
): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  const prefix = route === "upload" ? "object" : `object/${route}`;
  return `${base}/storage/v1/${prefix}/${encodeURIComponent(bucket)}/${encodedObjectPath(path)}`;
}

function serviceHeaders(serviceKey: string, contentType?: string): Headers {
  const headers = new Headers({
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Accept-Encoding": "identity",
  });
  if (contentType) headers.set("Content-Type", contentType);
  return headers;
}

function expectedArtifact(
  artifact: LegacyCompanionArtifact,
  bucketId: string,
): ReservedCompanionArtifact {
  return {
    artifactId: artifact.artifactId,
    kind: artifact.kind,
    filename: artifact.filename,
    bucketId,
    storagePath: artifact.storagePath,
    contentType: artifact.contentType,
    sizeBytes: artifact.sizeBytes,
    sha256: artifact.sha256,
  };
}

/**
 * Copy one immutable legacy object without buffering it in the Edge runtime.
 * The public bytes are verified first, streamed on a second read, then the
 * private copy is independently downloaded and verified before callers may
 * promote the database row.
 */
export async function copyVerifiedCompanionArtifactToPrivate(
  artifact: LegacyCompanionArtifact,
  supabaseUrl: string,
  serviceKey: string,
  fetcher: CompanionArtifactBackfillFetch = fetch,
): Promise<void> {
  const publicUrl = storageUrl(
    supabaseUrl,
    "public",
    "mapartforge",
    artifact.storagePath,
  );
  const privateUploadUrl = storageUrl(
    supabaseUrl,
    "upload",
    "mapkluss-companion-private",
    artifact.storagePath,
  );
  const privateDownloadUrl = storageUrl(
    supabaseUrl,
    "authenticated",
    "mapkluss-companion-private",
    artifact.storagePath,
  );
  const headers = serviceHeaders(serviceKey);

  await verifyCompanionArtifactResponse(
    expectedArtifact(artifact, "mapartforge"),
    await fetcher(publicUrl, { headers }),
  );

  const source = await fetcher(publicUrl, { headers });
  if (!source.ok || !source.body) {
    throw new CompanionArtifactVerificationError(
      source.status === 404 ? "legacy_artifact_missing" : "legacy_artifact_download_failed",
      source.status === 408 || source.status === 425 || source.status === 429 || source.status >= 500,
      source.status >= 500 ? 503 : 422,
    );
  }

  const uploadHeaders = serviceHeaders(serviceKey, artifact.contentType);
  uploadHeaders.set("Cache-Control", "3600");
  // Idempotent retries may encounter a complete or partial private copy after
  // a lost response. The public source was already hash-verified, so replacing
  // this exact private path is safe; the result is independently verified.
  uploadHeaders.set("x-upsert", "true");
  const upload = await fetcher(privateUploadUrl, {
    method: "POST",
    headers: uploadHeaders,
    body: source.body,
  });

  try {
    await verifyCompanionArtifactResponse(
      expectedArtifact(artifact, "mapkluss-companion-private"),
      await fetcher(privateDownloadUrl, { headers }),
    );
  } catch (error) {
    if (!upload.ok) {
      throw new CompanionArtifactVerificationError(
        upload.status === 413 ? "artifact_too_large" : "private_artifact_upload_failed",
        upload.status === 408 || upload.status === 425 || upload.status === 429 || upload.status >= 500,
        upload.status >= 500 ? 503 : 422,
      );
    }
    throw error;
  }
}
