export interface SourceCleanupDependencies {
  claim(limit: number): Promise<{ lease_id: string; paths: string[] }>;
  remove(path: string): Promise<boolean>;
  acknowledge(lease: string, path: string): Promise<boolean>;
}
const sourcePath =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{64}\/(?:[0-9]|[1-5][0-9]|6[0-3])-[a-f0-9]{64}$/;
/** Service-only worker; no path is accepted from a client or broad object listing. */
export async function cleanupBuildSources(deps: SourceCleanupDependencies) {
  const batch = await deps.claim(8);
  let removed = 0, failed = 0;
  if (!Array.isArray(batch.paths) || batch.paths.length > 8) {
    throw new Error("Invalid cleanup batch");
  }
  for (const path of batch.paths) {
    if (!sourcePath.test(path)) {
      failed++;
      continue;
    }
    try {
      if (
        await deps.remove(path) && await deps.acknowledge(batch.lease_id, path)
      ) removed++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { removed, failed };
}
