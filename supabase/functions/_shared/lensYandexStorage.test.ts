import {
  deleteLensPreviewPaths,
  lensYandexObjectKey,
  type LensYandexStorageConfig,
  lensYandexWritesEnabled,
  listLensPreviewPaths,
  presignLensYandexRequest,
  readLensYandexStorageConfig,
  signLensPreviewDownload,
  uploadImmutableLensPreview,
} from "./lensYandexStorage.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertRejects(
  action: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(pattern.test(message), `Expected ${pattern}, received ${message}`);
    return;
  }
  throw new Error(`Expected rejection matching ${pattern}`);
}

const config: LensYandexStorageConfig = {
  accessKeyId: "lens-access",
  secretAccessKey: "lens-secret",
  bucket: "private-lens-target",
  prefix: "lens/v1",
  endpoint: "https://storage.yandexcloud.net",
  region: "ru-central1",
};

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const pngSha256 =
  "4353a1de7e0dcc4e87350e22d5c9ee9f3e70e8ce9c31533ec991bee8870c4814";
const now = new Date("2026-08-12T12:34:56.000Z");

Deno.test("Lens Yandex config requires its explicit flag and every separate credential", () => {
  const values = new Map<string, string>([
    ["MAPKLUSS_YANDEX_LENS_STORAGE", "true"],
    ["YANDEX_LENS_STORAGE_ACCESS_KEY_ID", "access"],
    ["YANDEX_LENS_STORAGE_SECRET_ACCESS_KEY", "secret"],
    ["YANDEX_LENS_STORAGE_BUCKET", "private-bucket"],
  ]);
  const loaded = readLensYandexStorageConfig({ get: (key) => values.get(key) });
  assert(loaded?.prefix === "lens/v1");
  assert(loaded?.endpoint === "https://storage.yandexcloud.net");
  assert(loaded?.region === "ru-central1");
  values.set("MAPKLUSS_YANDEX_LENS_STORAGE", "false");
  assert(
    readLensYandexStorageConfig({ get: (key) => values.get(key) }) !== null,
  );
  assert(!lensYandexWritesEnabled({ get: (key) => values.get(key) }));
  values.set("MAPKLUSS_YANDEX_LENS_STORAGE", "true");
  values.delete("YANDEX_LENS_STORAGE_SECRET_ACCESS_KEY");
  let rejected = false;
  try {
    readLensYandexStorageConfig({ get: (key) => values.get(key) });
  } catch {
    rejected = true;
  }
  assert(rejected);
});

Deno.test("Lens keys are namespaced and unsafe logical paths are rejected", () => {
  assert(
    lensYandexObjectKey(config, "owner/session/3-abcd.png") ===
      "lens/v1/mapkluss-lens/owner/session/3-abcd.png",
  );
  let rejected = false;
  try {
    lensYandexObjectKey(config, "owner/../secret.png");
  } catch {
    rejected = true;
  }
  assert(rejected);
});

Deno.test("Lens signed GET is deterministic, encoded and limited to sixty seconds", async () => {
  const url = new URL(
    await signLensPreviewDownload(
      config,
      "owner id/session/3-!'()*.png",
      600,
      now,
    ),
  );
  assert(
    url.pathname.endsWith(
      "/lens/v1/mapkluss-lens/owner%20id/session/3-%21%27%28%29%2A.png",
    ),
  );
  assert(url.searchParams.get("X-Amz-Expires") === "60");
  assert(url.searchParams.get("X-Amz-Algorithm") === "AWS4-HMAC-SHA256");
  assert(url.searchParams.get("X-Amz-Signature")?.length === 64);
  assert(!url.href.includes("lens-secret"));
  const repeated = await signLensPreviewDownload(
    config,
    "owner id/session/3-!'()*.png",
    60,
    now,
  );
  assert(repeated === url.href);
});

Deno.test("Lens list signing includes sorted, encoded S3 query parameters", async () => {
  const url = await presignLensYandexRequest(config, "GET", null, 60, {
    prefix: "lens/v1/mapkluss-lens/owner name/",
    "max-keys": "25",
    "list-type": "2",
  }, now);
  assert(url.includes("list-type=2"));
  assert(url.includes("max-keys=25"));
  assert(url.includes("prefix=lens%2Fv1%2Fmapkluss-lens%2Fowner%20name%2F"));
  assert(url.indexOf("X-Amz-Algorithm") < url.indexOf("list-type=2"));
});

Deno.test("Lens immutable PUT signs its If-None-Match precondition", async () => {
  const url = new URL(
    await presignLensYandexRequest(
      config,
      "PUT",
      "owner/session/1-hash.png",
      60,
      {},
      now,
      { "If-None-Match": "*" },
    ),
  );
  assert(url.searchParams.get("X-Amz-SignedHeaders") === "host;if-none-match");
});

Deno.test("Lens immutable upload writes once and verifies the stored bytes", async () => {
  const calls: string[] = [];
  const result = await uploadImmutableLensPreview(
    config,
    "owner/session/1-hash.png",
    png,
    pngSha256,
    async (_input, init) => {
      calls.push(init?.method ?? "GET");
      if (calls.length === 1) {
        assert(init?.method === "PUT");
        assert(
          (init.headers as Record<string, string>)["content-type"] ===
            "image/png",
        );
        assert(
          (init.headers as Record<string, string>)["if-none-match"] === "*",
        );
        return new Response(null, { status: 200 });
      }
      return new Response(png, { status: 200 });
    },
    now,
  );
  assert(calls.join(",") === "PUT,GET");
  assert(!result.reused);
  assert(result.sha256 === pngSha256);
  assert(result.size === png.length);
});

Deno.test("Lens immutable upload reuses an identical retry without writing", async () => {
  let calls = 0;
  const result = await uploadImmutableLensPreview(
    config,
    "owner/session/1-hash.png",
    png,
    pngSha256,
    async (_input, init) => {
      calls += 1;
      if (calls === 1) {
        assert(init?.method === "PUT");
        return new Response(null, { status: 412 });
      }
      assert(init?.method === "GET");
      return new Response(png, { status: 200 });
    },
    now,
  );
  assert(calls === 2);
  assert(result.reused);
});

Deno.test("Lens immutable upload refuses an occupied path with different bytes", async () => {
  let writes = 0;
  await assertRejects(() =>
    uploadImmutableLensPreview(
      config,
      "owner/session/1-hash.png",
      png,
      pngSha256,
      async (_input, init) => {
        if (init?.method === "PUT") {
          writes += 1;
          return new Response(null, { status: 409 });
        }
        return new Response(new Uint8Array([...png.slice(0, -1), 9]), {
          status: 200,
        });
      },
      now,
    ), /already exists with a different SHA-256/);
  assert(writes === 1);
});

Deno.test("Lens upload fails closed on storage HTTP errors", async () => {
  await assertRejects(() =>
    uploadImmutableLensPreview(
      config,
      "owner/session/1-hash.png",
      png,
      pngSha256,
      async () => new Response(null, { status: 503 }),
      now,
    ), /upload failed with HTTP 503/);
});

Deno.test("Lens list returns only bounded paths inside its private namespace", async () => {
  const xml = `<?xml version="1.0"?><ListBucketResult>
    <IsTruncated>true</IsTruncated>
    <NextContinuationToken>next&amp;page</NextContinuationToken>
    <Contents><Key>lens/v1/mapkluss-lens/owner/session/1-a.png</Key></Contents>
    <Contents><Key>lens/v1/mapkluss-lens/owner/session/2-b&amp;c.png</Key></Contents>
    <Contents><Key>somewhere-else/private.png</Key></Contents>
  </ListBucketResult>`;
  const listed = await listLensPreviewPaths(
    config,
    "owner/session/",
    10,
    async () => new Response(xml, { status: 200 }),
    now,
  );
  assert(listed.truncated);
  assert(listed.nextCursor === "next&page");
  assert(
    listed.paths.join("|") === "owner/session/1-a.png|owner/session/2-b&c.png",
  );
});

Deno.test("Lens list sends a continuation token for the next bounded page", async () => {
  let requestUrl = "";
  const listed = await listLensPreviewPaths(
    config,
    "",
    100,
    async (input) => {
      requestUrl = String(input);
      return new Response(
        "<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>",
        { status: 200 },
      );
    },
    now,
    "next&page",
  );
  assert(!listed.truncated);
  assert(
    new URL(requestUrl).searchParams.get("continuation-token") === "next&page",
  );
  assert(
    new URL(requestUrl).searchParams.get("prefix") === "lens/v1/mapkluss-lens",
  );
});

Deno.test("Lens delete is bounded, idempotent for missing paths and stops on errors", async () => {
  const methods: string[] = [];
  const deleted = await deleteLensPreviewPaths(
    config,
    ["owner/session/1.png", "owner/session/2.png"],
    async (_input, init) => {
      methods.push(init?.method ?? "GET");
      return new Response(null, { status: methods.length === 1 ? 204 : 404 });
    },
    now,
  );
  assert(deleted === 2);
  assert(methods.join(",") === "DELETE,DELETE");
  await assertRejects(() =>
    deleteLensPreviewPaths(
      config,
      ["owner/session/3.png"],
      async () => new Response(null, { status: 403 }),
      now,
    ), /delete failed with HTTP 403/);
});

Deno.test("Lens list fails on non-success responses and oversized XML", async () => {
  await assertRejects(() =>
    listLensPreviewPaths(
      config,
      "owner/session/",
      10,
      async () => new Response(null, { status: 500 }),
      now,
    ), /list failed with HTTP 500/);
  await assertRejects(() =>
    listLensPreviewPaths(
      config,
      "owner/session/",
      10,
      async () =>
        new Response("x", {
          status: 200,
          headers: { "content-length": "3000000" },
        }),
      now,
    ), /exceeds the allowed size/);
});
