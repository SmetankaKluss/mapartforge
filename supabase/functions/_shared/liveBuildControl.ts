import { validTrackerWebSnapshot } from './trackerWebSnapshot.ts';

export interface BuildControlDependencies {
  actor(request: Request): Promise<string | null>;
  consume(actor: string, action: string): Promise<boolean>;
  control(
    actor: string,
    action: string,
    input: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { code?: string } | null;
  }>;
}

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const actions = new Set([
  "create",
  "read",
  "invite",
  "join",
  "leave",
  "remove_member",
  "close",
  "place",
  "unplace",
  "observe_begin",
  "observe",
  "observations",
  "observe_batch",
  "observations_batch",
  "source_begin",
  "source_read",
  "web_begin", "web_publish", "web_read", "web_stop",
]);
export function isBuildObservationAction(action: string): boolean {
  return action === "observe_begin" || action === "observe" ||
    action === "observations" || action === "observe_batch" ||
    action === "observations_batch";
}
export async function buildHash(value: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(hash),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}

export async function handleBuildControl(
  request: Request,
  dependencies: BuildControlDependencies,
): Promise<Response> {
  const reply = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers });
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return reply(405, { error: "method_not_allowed" });
  }
  try {
    const actor = await dependencies.actor(request);
    if (!actor) return reply(401, { error: "login_required" });
    const reader = request.body?.getReader();
    if (!reader) return reply(400, { error: "invalid_request" });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4600000) {
          await reader.cancel();
          return reply(413, { error: "request_too_large" });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let input: Record<string, unknown>;
    try {
      const value = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error();
      }
      input = value;
    } catch {
      return reply(400, { error: "invalid_request" });
    }
    const action = input.action;
    delete input.action;
    if (typeof action !== "string" || !actions.has(action)) {
      return reply(400, { error: "invalid_request" });
    }
    const bodyLimit = action === 'web_publish' ? 4600000 : action === "observe_batch"
      ? 393216
      : action === "observations_batch"
      ? 32768
      : action === "observe"
      ? 65536
      : 8192;
    if (size > bodyLimit) {
      return reply(413, { error: "request_too_large" });
    }
    // Applied before the operation transaction: failed joins still consume the allowance.
    if (!await dependencies.consume(actor, action)) {
      return reply(429, { error: "rate_limited" });
    }
    if (action === 'web_publish' && !validTrackerWebSnapshot(input.snapshot)) return reply(400, { error: 'invalid_snapshot' });
    let code: string | undefined;
    if (action === "invite") {
      if ("invite_hash" in input || "code" in input) {
        return reply(400, { error: "invalid_request" });
      }
      code = Array.from(
        crypto.getRandomValues(new Uint8Array(16)),
        (n) => n.toString(16).padStart(2, "0"),
      ).join("");
      input.invite_hash = await buildHash("build-invite-v1:" + code);
    } else if (action === "join") {
      if (
        "invite_hash" in input || typeof input.code !== "string" ||
        !/^[a-f0-9]{32}$/.test(input.code)
      ) {
        return reply(400, { error: "invalid_request" });
      }
      input.invite_hash = await buildHash("build-invite-v1:" + input.code);
      delete input.code;
    }
    const result = await dependencies.control(actor, action, input);
    if (result.error) {
      const code = result.error.code;
      if (code === "42501") return reply(403, { error: "build_access_denied" });
      if (code === "40001") return reply(409, { error: "revision_conflict" });
      if (code === "54000") return reply(429, { error: "build_limit" });
      if (code?.startsWith("22") || code?.startsWith("23")) {
        return reply(400, { error: "invalid_request" });
      }
      return reply(503, { error: "temporarily_unavailable" });
    }
    return reply(200, {
      api_version: 1,
      build: result.data,
      ...(code ? { code } : {}),
    });
  } catch {
    return reply(503, { error: "temporarily_unavailable" });
  }
}
