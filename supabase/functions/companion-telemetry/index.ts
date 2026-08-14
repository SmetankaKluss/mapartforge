import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";
import {
  installationDayHash,
  parseCompanionTelemetryPayload,
} from "../_shared/companionTelemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 2048) {
    return json({ error: "payload_too_large" }, 413);
  }
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) {
    return json({ error: "invalid_content_type" }, 415);
  }

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2048) {
      return json({ error: "payload_too_large" }, 413);
    }
    const payload = parseCompanionTelemetryPayload(JSON.parse(raw));
    const salt = Deno.env.get("COMPANION_TELEMETRY_SALT") ?? "";
    const dayHash = await installationDayHash(salt, payload.installation_id);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await admin.rpc("record_companion_telemetry", {
      p_installation_day_hash: dayHash,
      p_event_name: payload.event,
      p_mod_version: payload.mod_version,
      p_minecraft_version: payload.minecraft_version,
      p_language: payload.language,
      p_os_family: payload.os_family,
    });
    if (error) throw new Error("telemetry_store_failed");
    return json({ accepted: data === true });
  } catch (error) {
    const message = error instanceof SyntaxError ||
        error instanceof Error && error.message.startsWith("invalid_") ||
        error instanceof Error && error.message === "unexpected_field"
      ? "invalid_payload"
      : "telemetry_unavailable";
    return json({ error: message }, message === "invalid_payload" ? 400 : 503);
  }
});
