import {
  CompanionScanUploadError,
  decodeAndValidateCompanionPng,
  processCompanionScanUpload,
} from "./companionScanUpload.ts";

type QueryResult = { data: unknown; error: unknown };

class ScanQuery implements PromiseLike<QueryResult> {
  constructor(private readonly result: QueryResult) {}
  select(): this { return this; }
  eq(): this { return this; }
  lte(): this { return this; }
  order(): this { return this; }
  limit(): this { return this; }
  maybeSingle(): Promise<QueryResult> { return Promise.resolve(this.result); }
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function scanAdmin(options: {
  uploadError?: unknown;
  publishError?: unknown;
  publishData?: Record<string, unknown> | null;
  reconciled?: Record<string, unknown> | null;
}) {
  const buckets: string[] = [];
  const rpcCalls: string[] = [];
  const admin = {
    rpc(name: string) {
      rpcCalls.push(name);
      if (name === "companion_lens_consume_rate_limit") {
        return Promise.resolve({ data: [{ allowed: true, retry_after_ms: 0 }], error: null });
      }
      if (name === "reserve_companion_import_upload") {
        return Promise.resolve({ data: { ok: true }, error: null });
      }
      if (name === "publish_companion_import") {
        return Promise.resolve({ data: options.publishData ?? null, error: options.publishError ?? null });
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    from(table: string) {
      if (table === "companion_imports") {
        return new ScanQuery({ data: options.reconciled ?? null, error: null });
      }
      if (table === "companion_storage_delete_outbox") {
        return new ScanQuery({ data: [], error: null });
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from(bucket: string) {
        buckets.push(bucket);
        return {
          upload: () => Promise.resolve({ data: null, error: options.uploadError ?? null }),
          createSignedUrl: () => Promise.resolve({ data: { signedUrl: "https://signed.invalid/import.png" }, error: null }),
        };
      },
    },
  };
  return { admin, buckets, rpcCalls };
}

function pngDataUrl(width: number, height: number): string {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

Deno.test("scan PNG validation accepts the exact map grid dimensions", () => {
  const bytes = decodeAndValidateCompanionPng(pngDataUrl(256, 128), {
    wide: 2,
    tall: 1,
  });
  if (bytes.byteLength !== 24) throw new Error("validated PNG bytes changed");
});

Deno.test("scan PNG validation rejects another media type before decoding", () => {
  let error: unknown;
  try {
    decodeAndValidateCompanionPng("data:image/jpeg;base64,AAAA", {
      wide: 1,
      tall: 1,
    });
  } catch (caught) {
    error = caught;
  }
  if (
    !(error instanceof CompanionScanUploadError) ||
    error.code !== "invalid_png_data_url"
  ) {
    throw new Error("non-PNG payload was not rejected");
  }
});

Deno.test("scan PNG validation rejects dimensions outside the declared grid", () => {
  let error: unknown;
  try {
    decodeAndValidateCompanionPng(pngDataUrl(128, 256), { wide: 1, tall: 1 });
  } catch (caught) {
    error = caught;
  }
  if (
    !(error instanceof CompanionScanUploadError) ||
    error.code !== "unexpected_png_dimensions"
  ) {
    throw new Error("unexpected PNG dimensions were not rejected");
  }
});

Deno.test("scan upload uses a private reservation and survives a lost upload response", async () => {
  const created = {
    state: "created",
    importId: "11111111-1111-4111-8111-111111111111",
    bucketId: "mapkluss-companion-private",
    imagePath: "companion/u/imports/22222222-2222-4222-8222-222222222222.png",
    createdAt: "2026-07-18T00:00:00.000Z",
  };
  const fake = scanAdmin({
    uploadError: new Error("response lost"),
    publishData: created,
  });
  const result = await processCompanionScanUpload(fake.admin as never, "u", {
    source: "wall",
    map_grid: { wide: 1, tall: 1 },
    image_base64: pngDataUrl(128, 128),
  });
  if (result.importId !== created.importId) throw new Error("published import was not returned");
  if (!fake.rpcCalls.includes("reserve_companion_import_upload")) throw new Error("import was not reserved");
  if (fake.buckets.some((bucket) => bucket !== "mapkluss-companion-private")) {
    throw new Error("scan import escaped the private bucket");
  }
});

Deno.test("scan upload reconciles a committed import after a lost RPC response", async () => {
  const imagePath = "companion/u/imports/33333333-3333-4333-8333-333333333333.png";
  const fake = scanAdmin({
    publishError: new Error("response lost"),
    reconciled: {
      id: "44444444-4444-4444-8444-444444444444",
      bucket_id: "mapkluss-companion-private",
      image_path: imagePath,
      created_at: "2026-07-18T00:00:00.000Z",
    },
  });
  const result = await processCompanionScanUpload(fake.admin as never, "u", {
    source: "wall",
    map_grid: { wide: 1, tall: 1 },
    image_base64: pngDataUrl(128, 128),
  });
  if (result.importId !== "44444444-4444-4444-8444-444444444444") {
    throw new Error("committed import was not reconciled");
  }
  if (result.imagePath !== imagePath) throw new Error("reconciled path changed");
});
