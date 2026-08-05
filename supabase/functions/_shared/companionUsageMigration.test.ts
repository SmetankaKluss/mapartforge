import { assertMatch } from 'jsr:@std/assert@1';

const migration = await Deno.readTextFile(
  new URL('../../migrations/20260801164304_optimize_companion_usage_queries.sql', import.meta.url),
);

Deno.test('usage migration adds bounded aggregate paths and a service-only refresh RPC', () => {
  assertMatch(migration, /art_artifacts_owner_size_idx[\s\S]*owner_id[\s\S]*include\s*\(size_bytes\)/i);
  assertMatch(migration, /companion_imports_owner_size_idx[\s\S]*owner_id[\s\S]*include\s*\(size_bytes\)/i);
  assertMatch(migration, /collections_owner_updated_idx[\s\S]*owner_id[\s\S]*updated_at\s+desc/i);
  assertMatch(migration, /collection_items_art_collection_idx[\s\S]*art_id[\s\S]*collection_id/i);
  assertMatch(migration, /create or replace function public\.refresh_companion_profile_usage\(requested_owner_id uuid\)/i);
  assertMatch(migration, /security invoker/i);
  assertMatch(migration, /set search_path\s*=\s*''/i);
  assertMatch(migration, /from public\.profiles[\s\S]*where id = requested_owner_id[\s\S]*for update/i);
  assertMatch(migration, /revoke all on function public\.refresh_companion_profile_usage\(uuid\) from public, anon, authenticated/i);
  assertMatch(migration, /grant execute on function public\.refresh_companion_profile_usage\(uuid\) to service_role/i);
});
