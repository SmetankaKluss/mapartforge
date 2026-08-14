import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  installationDayHash,
  parseCompanionTelemetryPayload,
} from "./companionTelemetry.ts";

const valid = {
  installation_id: "123e4567-e89b-42d3-a456-426614174000",
  event: "launch",
  mod_version: "0.13.0",
  minecraft_version: "1.21.11",
  language: "ru",
  os_family: "windows",
};

Deno.test("telemetry accepts only the documented payload", () => {
  assertEquals(parseCompanionTelemetryPayload(valid), valid);
  assertThrows(
    () => parseCompanionTelemetryPayload({ ...valid, art_id: "private" }),
    Error,
    "unexpected_field",
  );
  assertThrows(
    () => parseCompanionTelemetryPayload({ ...valid, event: "custom" }),
    Error,
    "invalid_event",
  );
});

Deno.test("telemetry daily hash is stable for one day and rotates the next day", async () => {
  const salt = "a-private-server-side-salt-with-32-chars";
  const first = await installationDayHash(
    salt,
    valid.installation_id,
    new Date("2026-08-14T01:00:00Z"),
  );
  const same = await installationDayHash(
    salt,
    valid.installation_id,
    new Date("2026-08-14T23:00:00Z"),
  );
  const next = await installationDayHash(
    salt,
    valid.installation_id,
    new Date("2026-08-15T01:00:00Z"),
  );
  assertEquals(first, same);
  assertEquals(first.length, 64);
  assertEquals(first === next, false);
});

Deno.test("telemetry refuses a missing server salt", async () => {
  await assertRejects(
    () => installationDayHash("short", valid.installation_id),
    Error,
    "telemetry_salt_not_configured",
  );
});
