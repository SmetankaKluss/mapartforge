import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

type Action = "telegram_login";

type TelegramAuthPayload = {
  id?: string | number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: string | number;
  hash?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TELEGRAM_AUTH_MAX_AGE_SECONDS = Number(
  Deno.env.get("TELEGRAM_AUTH_MAX_AGE_SECONDS") ?? "900",
);

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(
    new Uint8Array(buffer),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function hmacSha256Hex(
  secret: Uint8Array<ArrayBuffer>,
  input: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input),
  );
  return hex(signature);
}

function buildTelegramDataCheckString(payload: TelegramAuthPayload): string {
  return Object.entries(payload)
    .filter(([key, value]) =>
      key !== "hash" && value != null && String(value).length > 0
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\n");
}

async function verifyTelegramAuth(payload: TelegramAuthPayload): Promise<{
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
}> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) throw new Error("telegram_not_configured");

  const hash = String(payload.hash ?? "").trim().toLowerCase();
  const telegramId = String(payload.id ?? "").trim();
  const firstName = String(payload.first_name ?? "").trim();
  const authDate = Number(payload.auth_date ?? 0);
  if (
    !hash || !telegramId || !firstName || !Number.isFinite(authDate) ||
    authDate <= 0
  ) {
    throw new Error("telegram_bad_payload");
  }

  const authAgeSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (authAgeSeconds < 0 || authAgeSeconds > TELEGRAM_AUTH_MAX_AGE_SECONDS) {
    throw new Error("telegram_auth_expired");
  }

  const secret = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(botToken)),
  );
  const expectedHash = await hmacSha256Hex(
    secret,
    buildTelegramDataCheckString(payload),
  );
  if (expectedHash !== hash) throw new Error("telegram_bad_hash");

  return {
    telegramId,
    username: payload.username ? String(payload.username).trim() || null : null,
    firstName,
    lastName: payload.last_name
      ? String(payload.last_name).trim() || null
      : null,
    photoUrl: payload.photo_url
      ? String(payload.photo_url).trim() || null
      : null,
  };
}

function authErrorStatus(message: string): number {
  if (message === "telegram_not_configured") return 503;
  if (message === "telegram_not_linked") return 404;
  if (message === "telegram_auth_expired") return 401;
  if (message.startsWith("telegram_bad_")) return 401;
  if (message === "telegram_email_required") return 409;
  return 500;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "server_not_configured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const payload = await req.json().catch(() => ({})) as {
    action?: Action;
    telegram_auth?: TelegramAuthPayload;
  };

  try {
    if (payload.action !== "telegram_login") {
      return json({ error: "unknown_action" }, 400);
    }

    const verified = await verifyTelegramAuth(payload.telegram_auth ?? {});
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,display_name,avatar_url,telegram_id,telegram_username")
      .eq("telegram_id", verified.telegramId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error("telegram_not_linked");

    const { data: authUserData, error: authUserError } = await admin.auth.admin
      .getUserById(String(profile.id));
    if (authUserError) throw authUserError;
    const email = authUserData.user?.email?.trim();
    if (!email) throw new Error("telegram_email_required");

    const { data: linkData, error: linkError } = await admin.auth.admin
      .generateLink({
        type: "magiclink",
        email,
      });
    if (linkError) throw linkError;

    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) throw new Error("telegram_token_create_failed");

    return json({
      ok: true,
      tokenHash,
      email,
      profile: {
        userId: String(profile.id),
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        telegramId: profile.telegram_id == null
          ? null
          : String(profile.telegram_id),
        telegramUsername: profile.telegram_username ?? verified.username,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, authErrorStatus(message));
  }
});
