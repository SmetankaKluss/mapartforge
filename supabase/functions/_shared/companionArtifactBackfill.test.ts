import { createHash } from "node:crypto";
import {
  classifyCompanionArtifactBackfillState,
  copyVerifiedCompanionArtifactToPrivate,
  type LegacyCompanionArtifact,
} from "./companionArtifactBackfill.ts";

function assert(condition: unknown, message = "assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function response(bytes: Uint8Array | null, contentType: string, status = 200): Response {
  const body = bytes
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    : null;
  return new Response(body, {
    status,
    headers: bytes
      ? { "content-type": contentType, "content-length": String(bytes.byteLength) }
      : undefined,
  });
}

Deno.test("legacy artifact backfill verifies, streams and re-verifies the private copy", async () => {
  const bytes = new TextEncoder().encode("MapKluss streaming backfill");
  const artifact: LegacyCompanionArtifact = {
    artifactId: "00000000-0000-4000-8000-000000000001",
    kind: "project",
    filename: "project.mapkluss",
    storagePath: "companion/owner/art/version/project.mapkluss",
    contentType: "application/json",
    sizeBytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
  let privateBytes: Uint8Array | null = null;
  let publicReads = 0;
  let streamedUpload = false;
  let upsertHeader = "";
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes("/object/public/")) {
      publicReads += 1;
      return response(bytes, artifact.contentType);
    }
    if (url.includes("/object/mapkluss-companion-private/")) {
      streamedUpload = init?.body instanceof ReadableStream;
      upsertHeader = new Headers(init?.headers).get("x-upsert") ?? "";
      privateBytes = new Uint8Array(await new Response(init?.body).arrayBuffer());
      return new Response(JSON.stringify({ Key: artifact.storagePath }), { status: 200 });
    }
    if (url.includes("/object/authenticated/mapkluss-companion-private/")) {
      return privateBytes ? response(privateBytes, artifact.contentType) : response(null, artifact.contentType, 404);
    }
    throw new Error(`unexpected URL ${url}`);
  };

  await copyVerifiedCompanionArtifactToPrivate(
    artifact,
    "https://example.supabase.co",
    "service-key",
    fetcher,
  );

  assert(publicReads === 2, "public bytes must be read once for verification and once for streaming");
  assert(streamedUpload, "upload body must remain a ReadableStream");
  assert(upsertHeader === "true", "retry must replace only the same verified private path");
  assert(privateBytes && sha256(privateBytes) === artifact.sha256, "private bytes must match exactly");
});

Deno.test("legacy artifact backfill rejects a private copy that changed during transfer", async () => {
  const expected = new TextEncoder().encode("expected");
  const changed = new TextEncoder().encode("tampered");
  const artifact: LegacyCompanionArtifact = {
    artifactId: "00000000-0000-4000-8000-000000000001",
    kind: "project",
    filename: "project.mapkluss",
    storagePath: "companion/owner/art/version/project.mapkluss",
    contentType: "application/json",
    sizeBytes: expected.byteLength,
    sha256: sha256(expected),
  };
  let publicReads = 0;
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes("/object/public/")) {
      publicReads += 1;
      return response(publicReads === 1 ? expected : changed, artifact.contentType);
    }
    if (url.includes("/object/mapkluss-companion-private/")) {
      await new Response(init?.body).arrayBuffer();
      return new Response("ok", { status: 200 });
    }
    if (url.includes("/object/authenticated/mapkluss-companion-private/")) {
      return response(changed, artifact.contentType);
    }
    throw new Error(`unexpected URL ${url}`);
  };

  let rejected = false;
  try {
    await copyVerifiedCompanionArtifactToPrivate(
      artifact,
      "https://example.supabase.co",
      "service-key",
      fetcher,
    );
  } catch {
    rejected = true;
  }
  assert(rejected, "a changed copy must never be promoted");
});

Deno.test("lost promotion responses and concurrent promotion reconcile without deleting private bytes", () => {
  const bytes = new TextEncoder().encode("reconcile");
  const artifact: LegacyCompanionArtifact = {
    artifactId: "00000000-0000-4000-8000-000000000001",
    kind: "project",
    filename: "project.mapkluss",
    storagePath: "companion/owner/art/version/project.mapkluss",
    contentType: "application/json",
    sizeBytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
  const exact = {
    id: artifact.artifactId,
    owner_id: "owner",
    storage_path: artifact.storagePath,
    content_type: artifact.contentType,
    size_bytes: artifact.sizeBytes,
    sha256: artifact.sha256,
  };
  assert(
    classifyCompanionArtifactBackfillState(
      { ...exact, bucket_id: "mapkluss-companion-private" },
      artifact,
      "owner",
    ) === "promoted",
    "a committed promotion with a lost response must reconcile as success",
  );
  assert(
    classifyCompanionArtifactBackfillState(
      { ...exact, bucket_id: "mapartforge" },
      artifact,
      "owner",
    ) === "legacy",
    "an unchanged legacy row remains retryable",
  );
  assert(
    classifyCompanionArtifactBackfillState(
      { ...exact, bucket_id: "mapkluss-companion-private", sha256: "0".repeat(64) },
      artifact,
      "owner",
    ) === "unknown",
    "metadata drift must fail closed",
  );
});
