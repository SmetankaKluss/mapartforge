create index if not exists art_artifacts_owner_size_idx
  on public.art_artifacts (owner_id)
  include (size_bytes);

create index if not exists art_artifacts_art_id_idx
  on public.art_artifacts (art_id);

create index if not exists companion_imports_owner_size_idx
  on public.companion_imports (owner_id)
  include (size_bytes);

create index if not exists collections_owner_updated_idx
  on public.collections (owner_id, updated_at desc, id);

create index if not exists collection_items_art_collection_idx
  on public.collection_items (art_id, collection_id);

create or replace function public.refresh_companion_profile_usage(requested_owner_id uuid)
returns table (
  art_count bigint,
  storage_used_bytes bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_art_count bigint;
  next_storage_used_bytes bigint;
begin
  perform 1
  from public.profiles
  where id = requested_owner_id
  for update;
  if not found then
    return;
  end if;

  select
    (select count(*) from public.arts where owner_id = requested_owner_id),
    coalesce((select sum(size_bytes) from public.art_artifacts where owner_id = requested_owner_id), 0)
      + coalesce((select sum(size_bytes) from public.companion_imports where owner_id = requested_owner_id), 0)
  into next_art_count, next_storage_used_bytes;

  update public.profiles
  set
    art_count = next_art_count,
    storage_used_bytes = next_storage_used_bytes,
    updated_at = now()
  where id = requested_owner_id;

  return query select next_art_count, next_storage_used_bytes;
end;
$$;

revoke all on function public.refresh_companion_profile_usage(uuid) from public, anon, authenticated;
grant execute on function public.refresh_companion_profile_usage(uuid) to service_role;
