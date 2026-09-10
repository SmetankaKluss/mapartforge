import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleanupBuildSources } from "./liveBuildSourceCleanup.ts";
Deno.test("cleanup deletes only validated queued paths and acknowledges success", async () => {
  const path = "11111111-1111-4111-8111-111111111111/" + "a".repeat(64) +
    "/0-" + "b".repeat(64);
  const removed: string[] = [], acked: string[] = [];
  const result = await cleanupBuildSources({
    claim: () =>
      Promise.resolve({ lease_id: "lease", paths: [path, "../../other"] }),
    remove: (p) => {
      removed.push(p);
      return Promise.resolve(true);
    },
    acknowledge: (_l, p) => {
      acked.push(p);
      return Promise.resolve(true);
    },
  });
  assertEquals(result, { removed: 1, failed: 1 });
  assertEquals(removed, [path]);
  assertEquals(acked, [path]);
});
Deno.test("failed storage deletion stays queued", async () => {
  let acked = false;
  const result = await cleanupBuildSources({
    claim: () =>
      Promise.resolve({
        lease_id: "lease",
        paths: [
          "11111111-1111-4111-8111-111111111111/" + "a".repeat(64) + "/0-" +
          "b".repeat(64),
        ],
      }),
    remove: () => Promise.resolve(false),
    acknowledge: () => {
      acked = true;
      return Promise.resolve(true);
    },
  });
  assertEquals(result, { removed: 0, failed: 1 });
  assertEquals(acked, false);
});
