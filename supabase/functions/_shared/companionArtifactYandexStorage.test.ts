import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  type CompanionArtifactYandexConfig,
  companionArtifactYandexObjectKey,
  companionArtifactYandexWritesEnabled,
  createCompanionArtifactUploadTarget,
  presignCompanionArtifactYandexRequest,
  readCompanionArtifactYandexConfig,
  removeCompanionArtifactYandexObjects,
  signCompanionArtifactYandexDownload,
} from "./companionArtifactYandexStorage.ts";

function environment(values: Record<string, string>) {
  return { get: (name: string) => values[name] };
}

const config: CompanionArtifactYandexConfig = {
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucket: "mapkluss-cloud-private",
  prefix: "cloud/v1",
  endpoint: "https://storage.yandexcloud.net",
  region: "ru-central1",
  kmsKeyId: "kms-test-key",
};

Deno.test("artifact Yandex config stays readable with writes disabled for rollback", () => {
  const env = environment({
    YANDEX_ARTIFACT_STORAGE_ACCESS_KEY_ID: config.accessKeyId,
    YANDEX_ARTIFACT_STORAGE_SECRET_ACCESS_KEY: config.secretAccessKey,
    YANDEX_ARTIFACT_STORAGE_BUCKET: config.bucket,
    YANDEX_ARTIFACT_STORAGE_KMS_KEY_ID: config.kmsKeyId,
  });
  assertEquals(companionArtifactYandexWritesEnabled(env), false);
  assertEquals(readCompanionArtifactYandexConfig(env), config);
});

Deno.test("enabled artifact Yandex writes fail closed when config is incomplete", () => {
  const env = environment({ MAPKLUSS_YANDEX_ARTIFACT_STORAGE_WRITE: "true" });
  assertRejects(
    async () => readCompanionArtifactYandexConfig(env),
    Error,
    "enabled but its configuration is invalid",
  );
});

Deno.test("artifact Yandex object key preserves logical bucket and path", () => {
  assertEquals(
    companionArtifactYandexObjectKey(
      config,
      "mapkluss-companion-private",
      "companion/owner/art/version/example.png",
    ),
    "cloud/v1/mapkluss-companion-private/companion/owner/art/version/example.png",
  );
  assertRejects(
    async () => companionArtifactYandexObjectKey(config, "bucket", "../secret"),
    Error,
    "path is invalid",
  );
});

Deno.test("artifact upload target is immutable, encrypted and checksum-bound", async () => {
  const target = await createCompanionArtifactUploadTarget(config, {
    bucketId: "mapkluss-companion-private",
    storagePath: "companion/owner/art/version/example.png",
    contentType: "image/png",
    sha256: "a".repeat(64),
  }, new Date("2026-08-14T00:00:00Z"));
  assertEquals(target.method, "PUT");
  assertEquals(target.headers["if-none-match"], "*");
  assertEquals(target.headers["x-amz-meta-sha256"], "a".repeat(64));
  assertEquals(target.headers["x-amz-server-side-encryption"], "aws:kms");
  assertEquals(
    target.headers["x-amz-server-side-encryption-aws-kms-key-id"],
    config.kmsKeyId,
  );
  const url = new URL(target.url);
  assertEquals(url.protocol, "https:");
  assertEquals(url.searchParams.get("X-Amz-Expires"), "900");
  const signedHeaders = decodeURIComponent(
    url.searchParams.get("X-Amz-SignedHeaders") ?? "",
  );
  assert(signedHeaders.includes("content-type"));
  assert(signedHeaders.includes("if-none-match"));
  assert(signedHeaders.includes("x-amz-meta-sha256"));
  assert(signedHeaders.includes("x-amz-server-side-encryption"));
  assert(!target.url.includes(config.secretAccessKey));
});

Deno.test("artifact download signature is private and expiry is bounded", async () => {
  const url = await signCompanionArtifactYandexDownload(
    config,
    "mapkluss-companion-private",
    "companion/owner/art/version/example.png",
    99_999,
    new Date("2026-08-14T00:00:00Z"),
  );
  const parsed = new URL(url);
  assertEquals(parsed.searchParams.get("X-Amz-Expires"), "900");
  assert(parsed.searchParams.has("X-Amz-Signature"));
  assert(!url.includes(config.secretAccessKey));
});

Deno.test("artifact request rejects unsafe signed headers", async () => {
  await assertRejects(
    () =>
      presignCompanionArtifactYandexRequest(
        config,
        "PUT",
        "mapkluss-companion-private",
        "companion/owner/art/version/example.png",
        60,
        { "x-test": "safe\r\nunsafe" },
      ),
    Error,
    "signed header is invalid",
  );
});

Deno.test("artifact cleanup treats missing objects as removed and bounds concurrency", async () => {
  let active = 0;
  let maximumActive = 0;
  const result = await removeCompanionArtifactYandexObjects(
    config,
    Array.from({ length: 13 }, (_, index) => ({
      bucketId: "mapkluss-companion-private",
      storagePath: `companion/owner/art/version/${index}.png`,
    })),
    async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return new Response(null, { status: 404 });
    },
  );
  assertEquals(result, { removed: 13, failed: 0 });
  assert(maximumActive <= 3);
});

Deno.test("artifact cleanup verifies a successful delete with exact listing", async () => {
  const methods: string[] = [];
  const urls: string[] = [];
  const result = await removeCompanionArtifactYandexObjects(
    config,
    [{
      bucketId: "mapkluss-companion-private",
      storagePath: "companion/owner/art/version/example.png",
    }],
    async (input, init) => {
      methods.push(init?.method ?? "GET");
      urls.push(String(input));
      return new Response(null, {
        status: init?.method === "DELETE" ? 204 : 200,
      });
    },
  );
  assertEquals(methods, ["DELETE", "GET"]);
  const listUrl = new URL(urls[1]);
  assertEquals(listUrl.searchParams.get("list-type"), "2");
  assertEquals(listUrl.searchParams.get("max-keys"), "1");
  assertEquals(
    listUrl.searchParams.get("prefix"),
    "cloud/v1/mapkluss-companion-private/companion/owner/art/version/example.png",
  );
  assertEquals(result, { removed: 1, failed: 0 });
});

Deno.test("artifact cleanup keeps retry state when exact listing still finds the object", async () => {
  const methods: string[] = [];
  const result = await removeCompanionArtifactYandexObjects(
    config,
    [{
      bucketId: "mapkluss-companion-private",
      storagePath: "companion/owner/art/version/example.png",
    }],
    async (_input, init) => {
      methods.push(init?.method ?? "GET");
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(
        "<ListBucketResult><Key>cloud/v1/mapkluss-companion-private/companion/owner/art/version/example.png</Key></ListBucketResult>",
        { status: 200 },
      );
    },
  );
  assertEquals(methods, ["DELETE", "GET"]);
  assertEquals(result, { removed: 0, failed: 1 });
});
