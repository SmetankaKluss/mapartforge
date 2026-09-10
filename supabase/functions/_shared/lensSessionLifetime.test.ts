import { lensSessionStatus } from "./lensSessionLifetime.ts";

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}

Deno.test("device renewal keeps Lens offline but viewable after editor inactivity", () => {
  const now = Date.UTC(2026, 8, 8, 12);
  equal(lensSessionStatus({ status: "active", last_editor_seen_at: new Date(now - 3_600_000).toISOString(),
    expires_at: new Date(now + 120_000).toISOString() }, now, 90_000), "offline");
});

Deno.test("abandoned sessions expire and explicit terminal states never revive", () => {
  const now = Date.UTC(2026, 8, 8, 12);
  const row = { status: "active" as const, last_editor_seen_at: new Date(now).toISOString(), expires_at: new Date(now).toISOString() };
  equal(lensSessionStatus(row, now, 90_000), "expired");
  for (const status of ["closed", "expired"] as const) {
    equal(lensSessionStatus({ ...row, status, expires_at: new Date(now + 120_000).toISOString() }, now, 90_000), status);
  }
});
