import { sha256 } from "npm:@noble/hashes@1.8.0/sha256";
import type { BuildControlDependencies } from "./liveBuildControl.ts";

type Descriptor = {
  available: boolean;
  build_id: string;
  source_sha256: string;
  part: number;
  sha256: string;
  size_bytes: number;
};
export interface BuildSourceDependencies extends BuildControlDependencies {
  getPart(part: Descriptor): Promise<Uint8Array>;
  putPart(part: Descriptor, bytes: Uint8Array): Promise<void>;
}
export function sourceDigest(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
}
export async function boundedSourceBytes(
  response: Response | Request,
  limit: number,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing source body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        throw new Error("Source too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
// Only this binary path may call part/commit RPCs; generic JSON control cannot bypass verification.
export async function handleBuildSource(
  request: Request,
  deps: BuildSourceDependencies,
): Promise<Response> {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };
  const reply = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers });
  if (request.method !== "POST") return reply(405, "method_not_allowed");
  try {
    const actor = await deps.actor(request);
    if (!actor) return reply(401, "login_required");
    const mode = new URL(request.url).searchParams.get("source");
    const id = request.headers.get("x-build-id");
    if (
      !id ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        id,
      ) ||
      !mode || !["put", "get", "finalize"].includes(mode)
    ) return reply(400, "invalid_request");
    if (!await deps.consume(actor, "source_" + mode)) {
      return reply(429, "rate_limited");
    }
    const rpc = async (action: string, input: Record<string, unknown>) => {
      const result = await deps.control(actor, action, input);
      if (result.error) throw result.error;
      return result.data as Record<string, unknown>;
    };
    if (mode === "finalize") {
      const manifest = await rpc("source_read", { build_id: id });
      if (!manifest.available) return reply(409, "source_unavailable");
      // Write authorization is checked before expensive object reads, and again on commit.
      await rpc("source_part_write", { build_id: id, part: 0 });
      const hashes = manifest.part_sha256 as string[];
      if (!Array.isArray(hashes) || hashes.length < 1 || hashes.length > 64) {
        throw new Error("Invalid manifest");
      }
      const digest = sha256.create();
      let total = 0;
      for (let part = 0; part < hashes.length; part++) {
        const descriptor = await rpc("source_part_write", {
          build_id: id,
          part,
        }) as unknown as Descriptor;
        const bytes = await deps.getPart(descriptor);
        if (
          bytes.length !== descriptor.size_bytes ||
          sourceDigest(bytes) !== descriptor.sha256
        ) return reply(409, "source_integrity_failed");
        digest.update(bytes);
        total += bytes.length;
      }
      const hash = Array.from(
        digest.digest(),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (total !== manifest.size_bytes || hash !== manifest.source_sha256) {
        return reply(409, "source_integrity_failed");
      }
      const result = await rpc("source_commit", { build_id: id });
      return new Response(JSON.stringify({ source: result }), { headers });
    }
    const raw = request.headers.get("x-build-part");
    if (!raw || !/^(0|[1-9][0-9]?)$/.test(raw) || Number(raw) > 63) {
      return reply(400, "invalid_request");
    }
    const input = { build_id: id, part: Number(raw) };
    const action = mode === "put" ? "source_part_write" : "source_part_read";
    const descriptor = await rpc(action, input) as unknown as Descriptor;
    if (!descriptor.available) return reply(409, "source_unavailable");
    if (mode === "put") {
      const bytes = await boundedSourceBytes(request, 2097152);
      if (
        bytes.length !== descriptor.size_bytes ||
        sourceDigest(bytes) !== descriptor.sha256
      ) return reply(400, "source_integrity_failed");
      await deps.putPart(descriptor, bytes);
      await rpc(action, input);
      return new Response(JSON.stringify({ stored: true }), { headers });
    }
    const bytes = await deps.getPart(descriptor);
    if (
      bytes.length !== descriptor.size_bytes ||
      sourceDigest(bytes) !== descriptor.sha256
    ) return reply(409, "source_integrity_failed");
    await rpc(action, input); // Revocation/close during storage IO must not release the part.
    return new Response(new Uint8Array(bytes).buffer, {
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bytes.length),
      },
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    return reply(
      code === "42501"
        ? 403
        : code === "40001"
        ? 409
        : code?.startsWith("22")
        ? 400
        : 503,
      code === "42501" ? "build_access_denied" : "source_unavailable",
    );
  }
}
