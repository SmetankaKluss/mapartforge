import {
  CompanionArtifactVerificationError,
  companionStorageObjectUrl,
  MAX_COMPANION_ARTIFACT_BYTES,
  parseReservedCompanionArtifacts,
  type ReservedCompanionArtifact,
  verifyCompanionArtifactResponse,
} from "./companionSaveVerification.ts";
import { createHash } from "node:crypto";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function artifactFor(
  bytes: Uint8Array,
  overrides: Partial<ReservedCompanionArtifact> = {},
): ReservedCompanionArtifact {
  return {
    artifactId: "00000000-0000-4000-8000-000000000001",
    kind: "project",
    filename: "project.mapkluss",
    bucketId: "mapkluss-companion-private",
    storagePath: "companion/owner/art/version/project.mapkluss",
    contentType: "application/json",
    sizeBytes: bytes.byteLength,
    sha256: "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
    ...overrides,
  };
}

function chunkedResponse(
  chunks: Uint8Array[],
  headers: Record<string, string> = {},
): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
    }),
    { headers: { "content-type": "application/json", ...headers } },
  );
}

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(
      error instanceof CompanionArtifactVerificationError,
      `unexpected error: ${String(error)}`,
    );
    assert(error.code === code, `expected ${code}, received ${error.code}`);
  }
}

Deno.test("verifies SHA-256 incrementally without requiring Content-Length", async () => {
  const bytes = new TextEncoder().encode("123");
  const artifact = artifactFor(bytes);
  const result = await verifyCompanionArtifactResponse(
    artifact,
    chunkedResponse([bytes.slice(0, 1), bytes.slice(1)]),
  );
  assert(result.sizeBytes === 3);
  assert(result.sha256 === artifact.sha256);
});

Deno.test("rejects truncated, oversized, MIME-mismatched and hash-mismatched objects", async () => {
  const bytes = new TextEncoder().encode("123");
  await expectCode(
    verifyCompanionArtifactResponse(
      artifactFor(bytes),
      chunkedResponse([bytes.slice(0, 2)]),
    ),
    "artifact_size_mismatch",
  );
  await expectCode(
    verifyCompanionArtifactResponse(
      artifactFor(bytes),
      chunkedResponse([new TextEncoder().encode("1234")]),
    ),
    "artifact_size_mismatch",
  );
  await expectCode(
    verifyCompanionArtifactResponse(
      artifactFor(bytes),
      chunkedResponse([bytes], { "content-type": "image/png" }),
    ),
    "artifact_mime_mismatch",
  );
  await expectCode(
    verifyCompanionArtifactResponse(
      artifactFor(bytes, { sha256: "0".repeat(64) }),
      chunkedResponse([bytes]),
    ),
    "artifact_sha256_mismatch",
  );
});

Deno.test("classifies Storage 5xx as retryable and a missing object as permanent", async () => {
  const bytes = new TextEncoder().encode("123");
  for (
    const [status, retryable, code] of [
      [503, true, "artifact_download_failed"],
      [404, false, "reserved_artifact_missing"],
    ] as const
  ) {
    try {
      await verifyCompanionArtifactResponse(
        artifactFor(bytes),
        new Response(null, { status }),
      );
      throw new Error("expected verification error");
    } catch (error) {
      assert(error instanceof CompanionArtifactVerificationError);
      assert(error.retryable === retryable);
      assert(error.code === code);
    }
  }
});

Deno.test("strictly parses the server manifest and encodes Storage paths", () => {
  const bytes = new TextEncoder().encode("123");
  const parsed = parseReservedCompanionArtifacts([artifactFor(bytes)]);
  assert(parsed.length === 1);
  assert(
    companionStorageObjectUrl("https://example.supabase.co/", {
      ...parsed[0],
      storagePath: "companion/a folder/file#.json",
    }) ===
      "https://example.supabase.co/storage/v1/object/authenticated/mapkluss-companion-private/companion/a%20folder/file%23.json",
  );
});

Deno.test("verifies the maximum artifact as bounded one-MiB stream chunks", async () => {
  const chunk = new Uint8Array(1024 * 1024);
  const chunkCount = MAX_COMPANION_ARTIFACT_BYTES / chunk.byteLength;
  const expectedHash = createHash("sha256");
  for (let index = 0; index < chunkCount; index += 1) {
    expectedHash.update(chunk);
  }
  let emitted = 0;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted >= chunkCount) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
        emitted += 1;
      },
    }),
    { headers: { "content-type": "application/octet-stream" } },
  );

  const beforeRss = Deno.memoryUsage().rss;
  const result = await verifyCompanionArtifactResponse(
    artifactFor(new Uint8Array(1), {
      kind: "litematic",
      filename: "maximum.litematic",
      contentType: "application/octet-stream",
      sizeBytes: MAX_COMPANION_ARTIFACT_BYTES,
      sha256: expectedHash.digest("hex"),
    }),
    response,
  );
  const rssGrowth = Deno.memoryUsage().rss - beforeRss;
  assert(emitted === chunkCount, "stream was not consumed exactly once");
  assert(result.sizeBytes === MAX_COMPANION_ARTIFACT_BYTES);
  assert(
    rssGrowth < 16 * 1024 * 1024,
    `stream verifier retained too much memory: ${rssGrowth}`,
  );
});
