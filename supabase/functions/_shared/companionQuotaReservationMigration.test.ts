import { assertMatch, assertNotMatch } from 'jsr:@std/assert@1';

const migration = await Deno.readTextFile(
  new URL('../../migrations/20260801170353_optimize_companion_storage_quota_reservations.sql', import.meta.url),
);

Deno.test('art quota is charged once at reservation time under the profile lock', () => {
  assertMatch(migration, /enforce_companion_art_reservation_storage_quota/i);
  assertMatch(migration, /from public\.profiles[\s\S]*where id = new\.owner_id[\s\S]*for update/i);
  assertMatch(migration, /physical_private_bytes[\s\S]*legacy_published_bytes[\s\S]*unuploaded_art_bytes/i);
  assertMatch(migration, /unuploaded_import_bytes[\s\S]*requested_delta_bytes/i);
  assertMatch(migration, /before insert or update on public\.companion_art_save_reservations/i);
});

Deno.test('per-object upload policy validates the reservation without rescanning storage quota', () => {
  const policy = migration.slice(migration.indexOf('create or replace function public.can_upload_reserved_companion_object'));
  assertMatch(policy, /reservation\.owner_id = current_user_id/i);
  assertMatch(policy, /reservation\.status = 'uploading'/i);
  assertMatch(policy, /artifact ->> 'storagePath' = requested_name/i);
  assertMatch(policy, /completed_size <> expected_size/i);
  assertNotMatch(policy, /physical_private_bytes|legacy_published_bytes|from storage\.objects/i);
});
