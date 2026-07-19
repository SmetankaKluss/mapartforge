import {
  drainCompanionStorageDeleteOutbox,
  queueCompanionStorageDelete,
} from "./companionStorageCleanup.ts";

type Result = { data: unknown; error: unknown };

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

class AwaitableQuery implements PromiseLike<Result> {
  constructor(private readonly result: Result) {}
  lte(): this {
    return this;
  }
  order(): this {
    return this;
  }
  limit(): this {
    return this;
  }
  eq(): this {
    return this;
  }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function fakeAdmin(
  removeError: unknown = null,
  dispositions: Record<string, "delete" | "referenced" | "defer"> = {},
) {
  const rows = [
    {
      id: 1,
      bucket_id: "mapartforge",
      object_path: "companion/u/a.png",
      attempt_count: 0,
    },
    {
      id: 2,
      bucket_id: "mapartforge",
      object_path: "companion/u/b.png",
      attempt_count: 2,
    },
  ];
  const updates: Array<Record<string, unknown>> = [];
  const deletedIds: number[][] = [];
  const upserts: Array<Record<string, unknown>> = [];
  const removedPaths: string[][] = [];
  const admin = {
    rpc(name: string) {
      assert(name === "classify_companion_storage_deletes");
      return Promise.resolve({
        data: rows.map((row) => ({
          bucket_id: row.bucket_id,
          object_path: row.object_path,
          disposition: dispositions[row.object_path] ?? "delete",
        })),
        error: null,
      });
    },
    from(table: string) {
      assert(table === "companion_storage_delete_outbox");
      return {
        select: () => new AwaitableQuery({ data: rows, error: null }),
        delete: () => ({
          in: (_column: string, ids: number[]) => {
            deletedIds.push(ids);
            return Promise.resolve({ data: null, error: null });
          },
        }),
        update: (value: Record<string, unknown>) => ({
          eq: () => {
            updates.push(value);
            return Promise.resolve({ data: null, error: null });
          },
        }),
        upsert: (value: Record<string, unknown>) => {
          upserts.push(value);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    storage: {
      from(bucket: string) {
        assert(bucket === "mapartforge");
        return {
          remove(paths: string[]) {
            removedPaths.push(paths);
            return Promise.resolve({ data: null, error: removeError });
          },
        };
      },
    },
  };
  return { admin, rows, updates, deletedIds, upserts, removedPaths };
}

Deno.test("successful Storage cleanup deletes the durable outbox rows", async () => {
  const fake = fakeAdmin();
  const result = await drainCompanionStorageDeleteOutbox(
    fake.admin as never,
    "owner",
    500,
  );
  assert(
    result.removed === 2 && result.deferred === 0 && result.protected === 0,
  );
  assert(fake.removedPaths.length === 1 && fake.removedPaths[0].length === 2);
  assert(
    fake.deletedIds.length === 1 && fake.deletedIds[0].join(",") === "1,2",
  );
  assert(fake.updates.length === 0);
});

Deno.test("failed Storage cleanup preserves rows with exponential retry state", async () => {
  const fake = fakeAdmin(new Error("temporary Storage failure"));
  const before = Date.now();
  const result = await drainCompanionStorageDeleteOutbox(
    fake.admin as never,
    "owner",
  );
  assert(result.removed === 0 && result.deferred === 2);
  assert(fake.deletedIds.length === 0);
  assert(fake.updates.length === 2);
  assert(
    fake.updates[0].attempt_count === 1 && fake.updates[1].attempt_count === 3,
  );
  for (const update of fake.updates) {
    assert(update.last_error === "storage_remove_failed");
    assert(Date.parse(String(update.available_at)) > before);
  }
});

Deno.test("explicit cleanup queue truncates reason and records the exact object", async () => {
  const fake = fakeAdmin();
  await queueCompanionStorageDelete(
    fake.admin as never,
    "owner",
    "mapartforge",
    "companion/owner/imports/a.png",
    "x".repeat(100),
  );
  assert(fake.upserts.length === 1);
  assert(fake.upserts[0].reason === "x".repeat(64));
  assert(fake.upserts[0].object_path === "companion/owner/imports/a.png");
});

Deno.test("referenced objects are protected and live reservations are deferred", async () => {
  const fake = fakeAdmin(null, {
    "companion/u/a.png": "referenced",
    "companion/u/b.png": "defer",
  });
  const result = await drainCompanionStorageDeleteOutbox(fake.admin as never);
  assert(
    result.removed === 0 && result.deferred === 1 && result.protected === 1,
  );
  assert(fake.removedPaths.length === 0);
  assert(fake.deletedIds.length === 1 && fake.deletedIds[0][0] === 1);
  assert(fake.updates.length === 1);
  assert(fake.updates[0].last_error === "object_still_live");
});
