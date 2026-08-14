export const TELEMETRY_EVENTS = [
  "launch",
  "login_completed",
  "library_opened",
  "schematic_installed",
  "lens_started",
  "tracker_created",
] as const;

export type CompanionTelemetryEvent = typeof TELEMETRY_EVENTS[number];

export type CompanionTelemetryPayload = {
  installation_id: string;
  event: CompanionTelemetryEvent;
  mod_version: string;
  minecraft_version: string;
  language: "ru" | "en";
  os_family: "windows" | "macos" | "linux" | "other";
};

const EVENT_SET = new Set<string>(TELEMETRY_EVENTS);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/;

export function parseCompanionTelemetryPayload(
  value: unknown,
): CompanionTelemetryPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_payload");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    "installation_id",
    "event",
    "mod_version",
    "minecraft_version",
    "language",
    "os_family",
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error("unexpected_field");
  }
  if (
    typeof record.installation_id !== "string" ||
    !UUID.test(record.installation_id)
  ) throw new Error("invalid_installation_id");
  if (typeof record.event !== "string" || !EVENT_SET.has(record.event)) {
    throw new Error("invalid_event");
  }
  if (
    typeof record.mod_version !== "string" || !VERSION.test(record.mod_version)
  ) throw new Error("invalid_mod_version");
  if (
    typeof record.minecraft_version !== "string" ||
    !VERSION.test(record.minecraft_version)
  ) throw new Error("invalid_minecraft_version");
  if (record.language !== "ru" && record.language !== "en") {
    throw new Error("invalid_language");
  }
  if (
    !["windows", "macos", "linux", "other"].includes(String(record.os_family))
  ) throw new Error("invalid_os_family");
  return record as CompanionTelemetryPayload;
}

export async function installationDayHash(
  salt: string,
  installationId: string,
  date = new Date(),
): Promise<string> {
  if (salt.length < 32) throw new Error("telemetry_salt_not_configured");
  const day = date.toISOString().slice(0, 10);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${day}:${installationId}`),
  );
  return Array.from(
    new Uint8Array(signature),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
