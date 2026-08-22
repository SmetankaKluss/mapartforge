function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function migration(name: string): Promise<string> {
  return await Deno.readTextFile(
    new URL(`../../migrations/${name}`, import.meta.url),
  );
}

async function releaseGate(name: string): Promise<string> {
  return await Deno.readTextFile(
    new URL(`../../release-gates/${name}`, import.meta.url),
  );
}

Deno.test("art save quota reserves space held by concurrent imports", async () => {
  const sql = await migration(
    "20260719090126_atomic_private_companion_saves.sql",
  );
  const prepare = sql.slice(
    sql.indexOf("create or replace function public.prepare_companion_art_save"),
    sql.indexOf(
      "create or replace function public.begin_companion_art_save_verification",
    ),
  );
  const publish = sql.slice(
    sql.indexOf(
      "create or replace function public.publish_verified_companion_art_save",
    ),
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

Deno.test("private Companion upload policy handles multipart preflight overhead", async () => {
  const sql = await migration(
    "20260719174705_fix_companion_storage_multipart_preflight.sql",
  );
  assert(
    sql.includes("requested_metadata ->> 'contentLength'") &&
      sql.includes("requested_metadata ->> 'size'") &&
      sql.includes("multipart_overhead_limit constant bigint := 1048576") &&
      sql.includes(
        "declared_size_text is null and completed_size_text is null",
      ) &&
      sql.includes("declared_size > expected_size + multipart_overhead_limit"),
    "reserved uploads must allow only bounded multipart overhead while retaining exact completed sizes",
  );
  assert(
    sql.includes("legacy_published_bytes + expected_size <= 262144000"),
    "quota accounting must use the server-reserved artifact size instead of HTTP envelope bytes",
  );
  assert(
    sql.includes("reservation.owner_id = current_user_id") &&
      sql.includes("reservation.status = 'uploading'") &&
      sql.includes("artifact ->> 'storagePath' = requested_name"),
    "the metadata compatibility fix must retain owner, active reservation and exact-path checks",
  );
});

Deno.test("private Companion upload policy accepts Storage-normalized media types", async () => {
  const sql = await migration(
    "20260719175941_normalize_companion_storage_upload_mime.sql",
  );
  assert(
    sql.includes("split_part(requested_metadata ->> 'mimetype', ';', 1)") &&
      sql.includes("split_part(artifact ->> 'contentType', ';', 1)"),
    "Storage MIME parameters must be normalized on both sides of the reserved upload comparison",
  );
  assert(
    sql.includes("reservation.owner_id = current_user_id") &&
      sql.includes("reservation.status = 'uploading'") &&
      sql.includes("artifact ->> 'storagePath' = requested_name") &&
      sql.includes("completed_size <> expected_size") &&
      sql.includes("legacy_published_bytes + expected_size <= 262144000"),
    "MIME normalization must retain owner, reservation, path, exact completed size and quota checks",
  );
});

Deno.test("legacy lockdown requires approval and zero artifact/import bytes", async () => {
  const sql = await releaseGate("legacy_companion_save_lockdown.sql");
  assert(
    sql.includes("legacy_companion_save_lockdown"),
    "lockdown must require the release gate",
  );
  assert(
    sql.includes("public.art_artifacts where bucket_id = 'mapartforge'"),
    "artifact rows must reach zero",
  );
  assert(
    sql.includes("public.companion_imports where bucket_id = 'mapartforge'"),
    "import rows must reach zero",
  );
  assert(
    sql.includes("name like 'companion/%'"),
    "public Companion bytes must reach zero",
  );
});

Deno.test("large Two-layer saves require one private hash-pinned bundle", async () => {
  const atomicSave = await migration(
    "20260719090126_atomic_private_companion_saves.sql",
  );
  const enumMigration = await migration(
    "20260719090136_add_suppression_bundle_kind.sql",
  );
  const pinMigration = await migration(
    "20260719090141_pin_suppression_bundles.sql",
  );
  assert(
    enumMigration.includes("add value if not exists 'suppression_bundle'"),
    "the bundle enum value must be committed before dependent DDL",
  );
  assert(
    atomicSave.includes(
      "a multi-map Two-layer save requires one bundle artifact only",
    ) &&
      atomicSave.includes(
        "application/vnd.mapkluss.suppression-bundle+zip;version=2",
      ),
    "atomic saves must reject incomplete or ambiguous multi-map artifacts",
  );
  assert(
    pinMigration.includes(
      "create table public.art_version_suppression_bundle_pins",
    ) &&
      pinMigration.includes(
        "foreign key (artifact_id, version_id, art_id, owner_id)",
      ) &&
      pinMigration.includes("pinned Two-layer artifacts are immutable"),
    "bundle pins must bind the exact artifact/version/owner tuple and stay immutable",
  );
});

Deno.test("ordinary artifact provider migration is additive and fail-closed", async () => {
  const sql = await migration(
    "20260814123000_add_companion_artifact_storage_provider.sql",
  );
  assert(
    sql.includes("storage_provider text not null default 'supabase'") &&
      sql.includes("storage_provider in ('supabase', 'yandex')"),
    "existing rows and clients must remain on Supabase while provider values stay bounded",
  );
  assert(
    sql.includes("coalesce(artifact ->> 'storageProvider', 'supabase')") &&
      sql.includes("verified.value ->> 'storageProvider'") &&
      sql.includes("expected_supabase_object_count"),
    "reservation, verification and publication must bind the chosen provider",
  );
  assert(
    sql.includes("storage_provider = 'yandex'") &&
      sql.includes("external_published_bytes"),
    "quota accounting must include published Yandex bytes",
  );
  assert(
    sql.includes("on conflict (storage_provider, bucket_id, object_path)") &&
      sql.includes("returns table(storage_provider text"),
    "cleanup must preserve provider identity",
  );
});

Deno.test("private export archives use opaque capabilities and keep browser roles out", async () => {
  const sql = await migration("20260822181549_add_private_export_archives.sql");
  const repair = await migration("20260822215500_fix_export_archive_session_expiry_ambiguity.sql");
  assert(
    sql.includes("export_archive_sessions") &&
      sql.includes("export_archive_files") &&
      sql.includes("access_token_hash") &&
      sql.includes("client_key_hash"),
    "export archives need a session, file manifest and only hashed capabilities",
  );
  assert(
    sql.includes("enable row level security") &&
      sql.includes("revoke all on table public.export_archive_sessions from public, anon, authenticated") &&
      sql.includes("grant execute on function public.prepare_private_export_archive_file") &&
      sql.includes("to service_role"),
    "browser roles must not directly read archive metadata or write storage reservations",
  );
  assert(
    sql.includes("file_count >= 25") &&
      sql.includes("total_size_bytes + requested_size_bytes > 67108864") &&
      sql.includes("requested_size_bytes not between 1 and 33554432"),
    "archive uploads need bounded file, session and single-object limits",
  );
  assert(
    repair.includes("archive_session.expires_at > now()") &&
      repair.includes("when requested_owner_id is null then interval '24 hours'"),
    "anonymous archive expiry must be unambiguous and limited to one day",
  );
});
