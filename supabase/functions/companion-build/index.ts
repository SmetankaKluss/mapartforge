import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";
import { classifyCompanionBearer } from "../_shared/companionAuthRouting.ts";
import {
  boundedSourceBytes,
  type BuildSourceDependencies,
  handleBuildSource,
} from "../_shared/liveBuildSource.ts";
import {
  presignCompanionArtifactYandexRequest,
  readCompanionArtifactYandexConfig,
} from "../_shared/companionArtifactYandexStorage.ts";
import {
  buildHash,
  handleBuildControl,
  isBuildObservationAction,
} from "../_shared/liveBuildControl.ts";

Deno.serve((request) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const dependencies: BuildSourceDependencies = {
    async actor(req) {
      const authorization = req.headers.get("Authorization");
      if (
        !authorization || authorization.length > 8192 ||
        !/^Bearer\s+\S+$/i.test(authorization)
      ) return null;
      const bearer = classifyCompanionBearer(authorization);
      if (!bearer) return null;
      if (bearer.kind === "website_jwt") {
        const { data, error } = await admin.auth.getUser(bearer.token);
        return !error && data.user && !data.user.is_anonymous
          ? data.user.id
          : null;
      }
      const { data, error } = await admin.from("device_codes").select(
        "user_id,expires_at",
      )
        .eq("access_token_hash", await buildHash(bearer.token)).eq(
          "status",
          "approved",
        ).maybeSingle();
      return !error && data?.user_id && Date.parse(data.expires_at) > Date.now()
        ? String(data.user_id)
        : null;
    },
    async consume(actor, action) {
      const { data, error } = await admin.rpc(
        "companion_lens_consume_rate_limit",
        {
          p_key_hash: await buildHash("build-rate-v1:" + actor),
          p_action: action === 'web_publish' ? 'build-web-publish' : action === "join"
            ? "build-join"
            : action === "source_finalize"
            ? "build-source-finalize"
            : action.startsWith("source_")
            ? "build-source"
            : isBuildObservationAction(action)
            ? "build-observe"
            : "build-control",
          p_limit: action === 'web_publish' ? 15 : action === "join" || action === "source_finalize" ? 10 : 120,
          p_window_seconds: 60,
        },
      );
      if (error) throw new Error("Rate service unavailable");
      return (Array.isArray(data) ? data[0] : data)?.allowed === true;
    },
    async control(actor, action, input) {
      const { data, error } = await admin.rpc(
        action.startsWith('web_') ? 'companion_tracker_web_control' : action.startsWith("source_")
          ? "companion_live_build_source"
          : action === "observe_batch" || action === "observations_batch"
          ? "companion_live_build_batch"
          : isBuildObservationAction(action)
          ? "companion_live_build_observations"
          : "companion_live_build_control",
        {
          p_actor: actor,
          p_action: action,
          p_input: input,
        },
      );
      return { data, error };
    },
    async getPart(part) {
      const config = readCompanionArtifactYandexConfig();
      if (!config) throw new Error("Storage unavailable");
      const path =
        `${part.build_id}/${part.source_sha256}/${part.part}-${part.sha256}`;
      const url = await presignCompanionArtifactYandexRequest(
        config,
        "GET",
        "mapkluss-build-sources",
        path,
        60,
      );
      const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Source unavailable");
      }
      return boundedSourceBytes(response, 2097152);
    },
    async putPart(part, bytes) {
      const config = readCompanionArtifactYandexConfig();
      if (!config) throw new Error("Storage unavailable");
      const path =
        `${part.build_id}/${part.source_sha256}/${part.part}-${part.sha256}`;
      const headers = {
        "content-type": "application/octet-stream",
        "x-amz-server-side-encryption": "aws:kms",
        "x-amz-server-side-encryption-aws-kms-key-id": config.kmsKeyId,
        "if-none-match": "*",
      };
      const url = await presignCompanionArtifactYandexRequest(
        config,
        "PUT",
        "mapkluss-build-sources",
        path,
        60,
        headers,
      );
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body: new Uint8Array(bytes).buffer,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      await response.body?.cancel();
      if (!response.ok && response.status !== 412) {
        throw new Error("Source upload failed");
      }
    },
  };
  return new URL(request.url).searchParams.has("source")
    ? handleBuildSource(request, dependencies)
    : handleBuildControl(request, dependencies);
});
