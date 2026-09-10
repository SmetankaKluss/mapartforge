import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";
import { cleanupBuildSources } from "../functions/_shared/liveBuildSourceCleanup.ts";
import {
  readCompanionArtifactYandexConfig,
  removeCompanionArtifactYandexObjects,
} from "../functions/_shared/companionArtifactYandexStorage.ts";

// Operator-only entry point. Never imported by a public Edge request handler.
if (!Deno.args.includes("--execute")) {
  console.log("No changes. Authorized maintenance requires --execute.");
} else {
  const config = readCompanionArtifactYandexConfig();
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!config || !url || !key) {
    throw new Error("Maintenance environment incomplete");
  }
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await cleanupBuildSources({
    async claim(limit) {
      const { data, error } = await admin.rpc(
        "companion_live_build_cleanup_claim",
        { p_limit: limit },
      );
      if (error) throw new Error("Cleanup claim failed");
      return data;
    },
    async remove(path) {
      const result = await removeCompanionArtifactYandexObjects(config, [{
        bucketId: "mapkluss-build-sources",
        storagePath: path,
      }]);
      return result.removed === 1 && result.failed === 0;
    },
    async acknowledge(lease, path) {
      const { data, error } = await admin.rpc(
        "companion_live_build_cleanup_ack",
        { p_lease: lease, p_path: path },
      );
      return !error && data === true;
    },
  });
  console.log(JSON.stringify(result));
  if (result.failed) Deno.exitCode = 1;
}
