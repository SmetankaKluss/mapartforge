function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function migration(name: string): Promise<string> {
  return await Deno.readTextFile(new URL(`../../migrations/${name}`, import.meta.url));
}

async function releaseGate(name: string): Promise<string> {
  return await Deno.readTextFile(new URL(`../../release-gates/${name}`, import.meta.url));
}

Deno.test("art save quota reserves space held by concurrent imports", async () => {
  const sql = await migration("20260719090126_atomic_private_companion_saves.sql");
  const prepare = sql.slice(
    sql.indexOf("create or replace function public.prepare_companion_art_save"),
    sql.indexOf("create or replace function public.begin_companion_art_save_verification"),
  );
  const publish = sql.slice(
    sql.indexOf("create or replace function public.publish_verified_companion_art_save"),
    sql.indexOf("create or replace function public.cancel_companion_art_save"),
  );
  assert(
    prepare.includes("reserved_import_storage_bytes") &&
      prepare.includes("companion_import_upload_reservations"),
    "prepare must reserve active import bytes",
  );
  assert(
    publish.includes("reserved_import_bytes") &&
      publish.includes("reserved_other_art_bytes"),
    "publish must re-check all concurrent reservations under the profile lock",
  );
});

Deno.test("legacy lockdown requires approval and zero artifact/import bytes", async () => {
  const sql = await releaseGate("legacy_companion_save_lockdown.sql");
  assert(sql.includes("legacy_companion_save_lockdown"), "lockdown must require the release gate");
  assert(sql.includes("public.art_artifacts where bucket_id = 'mapartforge'"), "artifact rows must reach zero");
  assert(sql.includes("public.companion_imports where bucket_id = 'mapartforge'"), "import rows must reach zero");
  assert(sql.includes("name like 'companion/%'"), "public Companion bytes must reach zero");
});

Deno.test("large Two-layer saves require one private hash-pinned bundle", async () => {
  const atomicSave = await migration("20260719090126_atomic_private_companion_saves.sql");
  const enumMigration = await migration("20260719090136_add_suppression_bundle_kind.sql");
  const pinMigration = await migration("20260719090141_pin_suppression_bundles.sql");
  assert(
    enumMigration.includes("add value if not exists 'suppression_bundle'"),
    "the bundle enum value must be committed before dependent DDL",
  );
  assert(
    atomicSave.includes("a multi-map Two-layer save requires one bundle artifact only") &&
      atomicSave.includes("application/vnd.mapkluss.suppression-bundle+zip;version=2"),
    "atomic saves must reject incomplete or ambiguous multi-map artifacts",
  );
  assert(
    pinMigration.includes("create table public.art_version_suppression_bundle_pins") &&
      pinMigration.includes("foreign key (artifact_id, version_id, art_id, owner_id)") &&
      pinMigration.includes("pinned Two-layer artifacts are immutable"),
    "bundle pins must bind the exact artifact/version/owner tuple and stay immutable",
  );
});
