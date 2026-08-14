import { assertMatch, assertNotMatch } from "jsr:@std/assert@1";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260814031649_companion_opt_in_telemetry.sql",
    import.meta.url,
  ),
);

Deno.test("telemetry migration keeps raw events private and bounded", () => {
  assertMatch(
    migration,
    /alter table public\.companion_telemetry_events enable row level security/i,
  );
  assertMatch(
    migration,
    /alter table public\.companion_telemetry_daily enable row level security/i,
  );
  assertMatch(
    migration,
    /revoke all on table public\.companion_telemetry_events from public, anon, authenticated/i,
  );
  assertMatch(
    migration,
    /revoke all on table public\.companion_telemetry_daily from public, anon, authenticated/i,
  );
  assertMatch(
    migration,
    /revoke all on function public\.record_companion_telemetry\([\s\S]*?\)\s+from public, anon, authenticated/i,
  );
  assertMatch(
    migration,
    /delete from public\.companion_telemetry_events where created_at < now\(\) - interval '30 days'/i,
  );
  assertNotMatch(
    migration,
    /grant\s+(?:select|insert|update|delete|execute)[\s\S]*?\s+to\s+(?:anon|authenticated)/i,
  );
});
