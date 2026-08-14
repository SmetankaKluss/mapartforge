import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";
import {
  readCompanionArtifactYandexConfig,
  removeCompanionArtifactYandexObjects,
} from "./companionArtifactYandexStorage.ts";

// Generated database types are not available in this standalone Edge bundle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CompanionStorageCleanupClient = ReturnType<typeof createClient<any>>;

type DeleteOutboxRow = {
  id: number;
  storage_provider: "supabase" | "yandex";
  bucket_id: string;
  object_path: string;
  attempt_count: number;
};

export type StorageCleanupResult = {
  removed: number;
  deferred: number;
  protected: number;
};

export type StorageCleanupOptions = {
  removeYandex?: (
    rows: readonly { bucketId: string; storagePath: string }[],
  ) => Promise<{ removed: number; failed: number }>;
};

export async function queueCompanionStorageDelete(
  admin: CompanionStorageCleanupClient,
  ownerId: string,
  bucketId: string,
  objectPath: string,
  reason: string,
  storageProvider: "supabase" | "yandex" = "supabase",
): Promise<void> {
  const { error } = await admin.from("companion_storage_delete_outbox").upsert({
    owner_id: ownerId,
    storage_provider: storageProvider,
    bucket_id: bucketId,
    object_path: objectPath,
    reason: reason.slice(0, 64),
    available_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "storage_provider,bucket_id,object_path" });
  if (error) throw error;
}

export async function drainCompanionStorageDeleteOutbox(
  admin: CompanionStorageCleanupClient,
  ownerId?: string,
  limit = 100,
  options: StorageCleanupOptions = {},
): Promise<StorageCleanupResult> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  let query = admin
    .from("companion_storage_delete_outbox")
    .select("id,storage_provider,bucket_id,object_path,attempt_count")
    .lte("available_at", new Date().toISOString())
    .order("id", { ascending: true })
    .limit(safeLimit);
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as DeleteOutboxRow[];
  if (rows.length === 0) return { removed: 0, deferred: 0, protected: 0 };

  const { data: classifications, error: classificationError } = await admin.rpc(
    "classify_companion_storage_deletes",
    {
      requested_objects: rows.map((row) => ({
        storageProvider: row.storage_provider,
        bucketId: row.bucket_id,
        objectPath: row.object_path,
      })),
    },
  );
  if (classificationError) throw classificationError;
  const dispositionByObject = new Map<string, string>();
  for (const item of classifications ?? []) {
    dispositionByObject.set(
      `${String(item.storage_provider ?? "supabase")}\n${String(item.bucket_id)}\n${String(item.object_path)}`,
      String(item.disposition),
    );
  }

  const protectedRows = rows.filter((row) =>
    dispositionByObject.get(`${row.storage_provider}\n${row.bucket_id}\n${row.object_path}`) === "referenced"
  );
  if (protectedRows.length > 0) {
    const { error: deleteError } = await admin
      .from("companion_storage_delete_outbox")
      .delete()
      .in("id", protectedRows.map((row) => row.id));
    if (deleteError) throw deleteError;
  }
  const deferredRows = rows.filter((row) =>
    dispositionByObject.get(`${row.storage_provider}\n${row.bucket_id}\n${row.object_path}`) !== "delete" &&
    dispositionByObject.get(`${row.storage_provider}\n${row.bucket_id}\n${row.object_path}`) !== "referenced"
  );
  for (const row of deferredRows) {
    const { error: updateError } = await admin
      .from("companion_storage_delete_outbox")
      .update({
        available_at: new Date(Date.now() + 60_000).toISOString(),
        last_error: "object_still_live",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateError) throw updateError;
  }

  const deletableRows = rows.filter((row) =>
    dispositionByObject.get(`${row.storage_provider}\n${row.bucket_id}\n${row.object_path}`) === "delete"
  );
  const groups = new Map<string, DeleteOutboxRow[]>();
  for (const row of deletableRows) {
    const groupKey = `${row.storage_provider}\n${row.bucket_id}`;
    const group = groups.get(groupKey) ?? [];
    group.push(row);
    groups.set(groupKey, group);
  }

  let removed = 0;
  let deferred = deferredRows.length;
  for (const [groupKey, group] of groups) {
    const [storageProvider, bucketId] = groupKey.split("\n", 2) as ["supabase" | "yandex", string];
    let removeError: unknown = null;
    if (storageProvider === "yandex") {
      try {
        const yandexRows = group.map((row) => ({
          bucketId,
          storagePath: row.object_path,
        }));
        const result = options.removeYandex
          ? await options.removeYandex(yandexRows)
          : await (async () => {
            const config = readCompanionArtifactYandexConfig();
            if (!config) throw new Error("artifact_yandex_storage_unavailable");
            return removeCompanionArtifactYandexObjects(config, yandexRows);
          })();
        if (result.failed > 0) removeError = new Error("storage_remove_failed");
      } catch (error) {
        removeError = error;
      }
    } else {
      const result = await admin.storage
        .from(bucketId)
        .remove(group.map((row) => row.object_path));
      removeError = result.error;
    }
    const ids = group.map((row) => row.id);
    if (!removeError) {
      const { error: deleteError } = await admin
        .from("companion_storage_delete_outbox")
        .delete()
        .in("id", ids);
      if (deleteError) throw deleteError;
      removed += group.length;
      continue;
    }

    deferred += group.length;
    for (const row of group) {
      const attempts = row.attempt_count + 1;
      const delaySeconds = Math.min(3600, 2 ** Math.min(12, attempts));
      const { error: updateError } = await admin
        .from("companion_storage_delete_outbox")
        .update({
          attempt_count: attempts,
          available_at: new Date(Date.now() + delaySeconds * 1000)
            .toISOString(),
          last_error: "storage_remove_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) throw updateError;
    }
  }
  return { removed, deferred, protected: protectedRows.length };
}
