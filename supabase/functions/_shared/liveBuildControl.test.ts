import {
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type BuildControlDependencies,
  buildHash,
  handleBuildControl,
  isBuildObservationAction,
} from "./liveBuildControl.ts";

function fixture() {
  const calls: {
    actor: string;
    action: string;
    input: Record<string, unknown>;
  }[] = [];
  const deps: BuildControlDependencies = {
    actor: () => Promise.resolve("verified-owner"),
    consume: () => Promise.resolve(true),
    control: (actor, action, input) => {
      calls.push({ actor, action, input });
      return Promise.resolve({ data: { revision: 1 }, error: null });
    },
  };
  const request = (input: unknown) =>
    new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(input),
    });
  return { calls, deps, request };
}
Deno.test("source commit and raw storage actions cannot use generic JSON control", async () => {
  const f = fixture();
  for (
    const action of ["source_commit", "source_part_write", "source_part_read"]
  ) {
    assertEquals(
      (await handleBuildControl(f.request({ action }), f.deps)).status,
      400,
    );
  }
  assertEquals(f.calls.length, 0);
});
Deno.test("observation actions have bounded upload and retain auth/rate guards", async () => {
  const f = fixture();
  for (
    const action of [
      "observe_begin",
      "observe",
      "observations",
      "observe_batch",
      "observations_batch",
    ]
  ) {
    assertEquals(isBuildObservationAction(action), true);
    assertEquals(
      (await handleBuildControl(f.request({ action }), f.deps)).status,
      200,
    );
  }
  assertEquals(isBuildObservationAction("place"), false);
  assertEquals(
    (await handleBuildControl(
      f.request({
        action: "observe",
        states: "1".repeat(4096),
        offsets_ms: Array(4096).fill(-1000),
      }),
      f.deps,
    )).status,
    200,
  );
  const count = f.calls.length;
  assertEquals(
    (await handleBuildControl(
      f.request({ action: "observe", blob: "x".repeat(65536) }),
      f.deps,
    )).status,
    413,
  );
  assertEquals(f.calls.length, count);
  f.deps.consume = () => Promise.resolve(false);
  assertEquals(
    (await handleBuildControl(f.request({ action: "observe" }), f.deps)).status,
    429,
  );
  assertEquals(f.calls.length, count);
});
Deno.test("build batches preserve separate body ceilings", async () => {
  const f = fixture();
  for (
    const [action, limit] of [
      ["observe_batch", 393216],
      ["observations_batch", 32768],
      ["observe", 65536],
      ["read", 8192],
    ] as const
  ) {
    assertEquals(
      (await handleBuildControl(
        f.request({ action, blob: "x".repeat(limit - 100) }),
        f.deps,
      )).status,
      200,
    );
    const count = f.calls.length;
    assertEquals(
      (await handleBuildControl(
        f.request({ action, blob: "x".repeat(limit) }),
        f.deps,
      )).status,
      413,
    );
    assertEquals(f.calls.length, count);
  }
});
Deno.test("build control requires verified actor before reading or dispatching", async () => {
  const f = fixture();
  f.deps.actor = () => Promise.resolve(null);
  assertEquals(
    (await handleBuildControl(f.request({ action: "read" }), f.deps)).status,
    401,
  );
  assertEquals(f.calls.length, 0);
});
Deno.test("build control bounds bodies and rejects malformed actions", async () => {
  const f = fixture();
  for (const input of [null, [], { action: "unknown" }]) {
    assertEquals(
      (await handleBuildControl(f.request(input), f.deps)).status,
      400,
    );
  }
  assertEquals(
    (await handleBuildControl(
      f.request({ action: "read", blob: "x".repeat(9000) }),
      f.deps,
    )).status,
    413,
  );
  assertEquals(f.calls.length, 0);
});
Deno.test("build invite code is random and only its domain-separated hash reaches storage", async () => {
  const f = fixture();
  const response = await handleBuildControl(
    f.request({ action: "invite", build_id: "test", expected_revision: 1 }),
    f.deps,
  );
  const body = await response.json();
  assertEquals(response.status, 200);
  assertMatch(body.code, /^[a-f0-9]{32}$/);
  assertEquals(f.calls[0].actor, "verified-owner");
  assertEquals(
    f.calls[0].input.invite_hash,
    await buildHash("build-invite-v1:" + body.code),
  );
  assertEquals("code" in f.calls[0].input, false);
  assertEquals(
    (await handleBuildControl(
      f.request({ action: "invite", invite_hash: "a".repeat(64) }),
      f.deps,
    )).status,
    400,
  );
});
Deno.test("join consumes rate gate and does not forward plaintext code", async () => {
  const f = fixture();
  const code = "a".repeat(32);
  assertEquals(
    (await handleBuildControl(
      f.request({ action: "join", code, consent: true }),
      f.deps,
    )).status,
    200,
  );
  assertEquals(f.calls[0].input, {
    consent: true,
    invite_hash: await buildHash("build-invite-v1:" + code),
  });
  f.deps.consume = () => Promise.resolve(false);
  assertEquals(
    (await handleBuildControl(
      f.request({ action: "join", code, consent: true }),
      f.deps,
    )).status,
    429,
  );
  assertEquals(f.calls.length, 1);
});
Deno.test("build control sanitizes database errors and never retries mutations", async () => {
  const f = fixture();
  let calls = 0;
  for (
    const [code, status] of [["42501", 403], ["40001", 409], ["54000", 429], [
      "23514",
      400,
    ], ["XX000", 503]] as const
  ) {
    f.deps.control = () => {
      calls++;
      return Promise.resolve({ data: null, error: { code } });
    };
    assertEquals(
      (await handleBuildControl(f.request({ action: "place" }), f.deps)).status,
      status,
    );
  }
  assertEquals(calls, 5);
});
