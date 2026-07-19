import { createHash } from 'node:crypto';

export const MAX_COMPANION_ARTIFACT_BYTES = 128 * 1024 * 1024;
export const MAX_COMPANION_SAVE_BYTES = 250 * 1024 * 1024;
export const MAX_COMPANION_SAVE_ARTIFACTS = 16;

export type ReservedCompanionArtifact = {
  artifactId: string;
  kind: string;
  filename: string;
  bucketId: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
};

export type VerifiedCompanionArtifact = Pick<
  ReservedCompanionArtifact,
  'artifactId' | 'bucketId' | 'storagePath' | 'contentType' | 'sizeBytes' | 'sha256'
>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class CompanionArtifactVerificationError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly responseStatus: number,
  ) {
    super(code);
    this.name = 'CompanionArtifactVerificationError';
  }
}

function normalizeMime(value: string | null): string {
  return (value ?? '').split(';', 1)[0].trim().toLowerCase();
}

export function parseReservedCompanionArtifacts(value: unknown): ReservedCompanionArtifact[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_COMPANION_SAVE_ARTIFACTS) {
    throw new CompanionArtifactVerificationError('invalid_reserved_manifest', false, 422);
  }

  const artifacts = value.map((entry): ReservedCompanionArtifact => {
    if (!entry || typeof entry !== 'object') {
      throw new CompanionArtifactVerificationError('invalid_reserved_manifest', false, 422);
    }
    const row = entry as Record<string, unknown>;
    const sizeBytes = Number(row.sizeBytes);
    const artifact: ReservedCompanionArtifact = {
      artifactId: String(row.artifactId ?? ''),
      kind: String(row.kind ?? ''),
      filename: String(row.filename ?? ''),
      bucketId: String(row.bucketId ?? ''),
      storagePath: String(row.storagePath ?? ''),
      contentType: String(row.contentType ?? ''),
      sizeBytes,
      sha256: String(row.sha256 ?? ''),
    };
    if (
      !UUID_PATTERN.test(artifact.artifactId)
      || !artifact.kind
      || !artifact.filename
      || artifact.bucketId !== 'mapkluss-companion-private'
      || !artifact.storagePath
      || !artifact.contentType
      || !Number.isSafeInteger(sizeBytes)
      || sizeBytes < 1
      || sizeBytes > MAX_COMPANION_ARTIFACT_BYTES
      || !SHA256_PATTERN.test(artifact.sha256)
    ) {
      throw new CompanionArtifactVerificationError('invalid_reserved_manifest', false, 422);
    }
    return artifact;
  });

  const totalBytes = artifacts.reduce((sum, artifact) => sum + artifact.sizeBytes, 0);
  if (totalBytes > MAX_COMPANION_SAVE_BYTES) {
    throw new CompanionArtifactVerificationError('save_too_large', false, 422);
  }
  if (new Set(artifacts.map(artifact => artifact.artifactId)).size !== artifacts.length
    || new Set(artifacts.map(artifact => `${artifact.bucketId}/${artifact.storagePath}`)).size !== artifacts.length) {
    throw new CompanionArtifactVerificationError('invalid_reserved_manifest', false, 422);
  }
  return artifacts;
}

export async function verifyCompanionArtifactResponse(
  artifact: ReservedCompanionArtifact,
  response: Response,
): Promise<VerifiedCompanionArtifact> {
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
    throw new CompanionArtifactVerificationError(
      response.status === 404 ? 'reserved_artifact_missing' : 'artifact_download_failed',
      retryable,
      retryable ? 503 : 422,
    );
  }
  if (!response.body) {
    throw new CompanionArtifactVerificationError('artifact_download_failed', true, 503);
  }

  const encoding = (response.headers.get('content-encoding') ?? 'identity').trim().toLowerCase();
  if (encoding && encoding !== 'identity') {
    throw new CompanionArtifactVerificationError('artifact_encoding_mismatch', false, 422);
  }
  if (normalizeMime(response.headers.get('content-type')) !== normalizeMime(artifact.contentType)) {
    throw new CompanionArtifactVerificationError('artifact_mime_mismatch', false, 422);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength !== artifact.sizeBytes) {
      throw new CompanionArtifactVerificationError('artifact_size_mismatch', false, 422);
    }
  }

  const hash = createHash('sha256');
  const reader = response.body.getReader();
  let sizeBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      sizeBytes += value.byteLength;
      if (sizeBytes > artifact.sizeBytes || sizeBytes > MAX_COMPANION_ARTIFACT_BYTES) {
        throw new CompanionArtifactVerificationError('artifact_size_mismatch', false, 422);
      }
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (sizeBytes !== artifact.sizeBytes) {
    throw new CompanionArtifactVerificationError('artifact_size_mismatch', false, 422);
  }
  const sha256 = hash.digest('hex');
  if (sha256 !== artifact.sha256) {
    throw new CompanionArtifactVerificationError('artifact_sha256_mismatch', false, 422);
  }

  return {
    artifactId: artifact.artifactId,
    bucketId: artifact.bucketId,
    storagePath: artifact.storagePath,
    contentType: artifact.contentType,
    sizeBytes,
    sha256,
  };
}

export function companionStorageObjectUrl(supabaseUrl: string, artifact: ReservedCompanionArtifact): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  const path = artifact.storagePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
  return `${base}/storage/v1/object/authenticated/${encodeURIComponent(artifact.bucketId)}/${path}`;
}
