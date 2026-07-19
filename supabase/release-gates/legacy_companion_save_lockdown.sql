-- Manual production release gate. Do not run through the ordinary migration
-- chain. Apply only after the atomic private-save site has passed staging and
-- production smoke tests and the service-only gate is explicitly approved.

do $$
begin
  if not exists (
       select 1 from public.companion_release_gates
       where name = 'legacy_companion_save_lockdown' and approved_at is not null
     ) then
    raise exception using errcode = '55000',
      message = 'legacy Companion lockdown requires an explicit release-gate approval';
  end if;
  if exists (select 1 from public.art_artifacts where bucket_id = 'mapartforge')
     or exists (select 1 from public.companion_imports where bucket_id = 'mapartforge')
     or exists (
       select 1 from public.companion_storage_delete_outbox
       where bucket_id = 'mapartforge'
         and reason in ('import_private_backfill', 'artifact_private_backfill')
     )
     or exists (
       select 1 from storage.objects
       where bucket_id = 'mapartforge'
         and name like 'companion/%'
     ) then
    raise exception using errcode = '55000',
      message = 'legacy Companion artifact/import backfill and public-byte cleanup must finish before lockdown';
  end if;
end
$$;

drop function if exists public.publish_companion_import(
  uuid, text, text, jsonb, text, bigint, text, jsonb
);

drop policy if exists "Companion owner storage insert" on storage.objects;
drop policy if exists "Companion owner storage select" on storage.objects;
drop policy if exists "Companion owner storage update" on storage.objects;
drop policy if exists "Companion owner storage delete" on storage.objects;

-- Canonical art/version/artifact writes now go through the transaction RPC
-- above or through service-role Edge Functions.
revoke insert, update, delete on public.arts from authenticated;
revoke insert, update, delete on public.art_versions from authenticated;
revoke insert, update, delete on public.art_artifacts from authenticated;
revoke insert, update, delete on public.companion_imports from authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, telegram_id, telegram_username, updated_at) on public.profiles to authenticated;
