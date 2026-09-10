import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type BuildSourceDependencies,
  handleBuildSource,
  sourceDigest,
} from "./liveBuildSource.ts";
const id = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = sourceDigest(bytes);
  let commits = 0, puts = 0, reads = 0, denied = false;
  const deps: BuildSourceDependencies = {
    actor: () => Promise.resolve("owner"),
    consume: () => Promise.resolve(true),
    control: (_actor, action) => {
      if (denied) {
        return Promise.resolve({
          data: null,
          error: { code: "42501" },
        });
      }
      if (action === "source_commit") commits++;
      return Promise.resolve({
        error: null,
        data: action === "source_read"
          ? {
            available: true,
            size_bytes: 3,
            source_sha256: hash,
            part_sha256: [hash],
          }
          : {
            available: true,
            build_id: id,
            source_sha256: hash,
            part: 0,
            sha256: hash,
            size_bytes: 3,
          },
      });
    },
    getPart: () => {
      reads++;
      return Promise.resolve(bytes);
    },
    putPart: () => {
      puts++;
      return Promise.resolve();
    },
  };
  const request = (mode: string, body?: Uint8Array) =>
    new Request("http://localhost/?source=" + mode, {
      method: "POST",
      headers: { "x-build-id": id, "x-build-part": "0" },
      body: body ? new Uint8Array(body).buffer : undefined,
    });
  return {
    deps,
    request,
    bytes,
    deny: () => {
      denied = true;
    },
    counts: () => ({ commits, puts, reads }),
  };
}
Deno.test("source parts verify bytes before upload and finalize verifies whole digest", async () => {
  const f = fixture();
  assertEquals(
    (await handleBuildSource(
      f.request("put", new Uint8Array([9, 9, 9])),
      f.deps,
    )).status,
    400,
  );
  assertEquals(f.counts().puts, 0);
  assertEquals(
    (await handleBuildSource(f.request("put", f.bytes), f.deps)).status,
    200,
  );
  assertEquals(
    (await handleBuildSource(f.request("finalize"), f.deps)).status,
    200,
  );
  assertEquals(f.counts().commits, 1);
  const response = await handleBuildSource(f.request("get"), f.deps);
  assertEquals(response.status, 200);
  assertEquals(new Uint8Array(await response.arrayBuffer()), f.bytes);
});
Deno.test("source download rechecks membership after storage read", async () => {
  const f = fixture();
  f.deps.getPart = () => {
    f.deny();
    return Promise.resolve(f.bytes);
  };
  assertEquals((await handleBuildSource(f.request("get"), f.deps)).status, 403);
});
Deno.test("corrupt stored parts never publish", async () => {
  const f = fixture();
  f.deps.getPart = () => Promise.resolve(new Uint8Array([9, 9, 9]));
  assertEquals(
    (await handleBuildSource(f.request("finalize"), f.deps)).status,
    409,
  );
  assertEquals(f.counts().commits, 0);
});
Deno.test("valid part hashes cannot bypass whole source hash", async () => {
  const f = fixture();
  const control = f.deps.control;
  f.deps.control = async (actor, action, input) => {
    const result = await control(actor, action, input);
    if (action === "source_read") {
      return {
        ...result,
        data: {
          ...(result.data as Record<string, unknown>),
          source_sha256: "0".repeat(64),
        },
      };
    }
    return result;
  };
  assertEquals(
    (await handleBuildSource(f.request("finalize"), f.deps)).status,
    409,
  );
  assertEquals(f.counts().commits, 0);
});
Deno.test("unauthenticated and throttled source requests do not touch storage", async () => {
  const f = fixture();
  f.deps.actor = () => Promise.resolve(null);
  assertEquals((await handleBuildSource(f.request("get"), f.deps)).status, 401);
  assertEquals(f.counts().reads, 0);
  f.deps.actor = () => Promise.resolve("owner");
  f.deps.consume = () => Promise.resolve(false);
  assertEquals((await handleBuildSource(f.request("get"), f.deps)).status, 429);
  assertEquals(f.counts().reads, 0);
});
