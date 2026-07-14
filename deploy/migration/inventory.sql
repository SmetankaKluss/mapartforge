\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

select jsonb_build_object(
  'postgres_version_num', current_setting('server_version_num')::integer,
  'database_bytes', pg_database_size(current_database()),
  'auth_users', (select count(*) from auth.users),
  'profiles', (select count(*) from public.profiles),
  'arts', (select count(*) from public.arts),
  'art_versions', (select count(*) from public.art_versions),
  'art_artifacts', (select count(*) from public.art_artifacts),
  'favorites', (select count(*) from public.favorites),
  'collections', (select count(*) from public.collections),
  'collection_items', (select count(*) from public.collection_items),
  'companion_imports', (select count(*) from public.companion_imports),
  'build_sessions', (select count(*) from public.build_sessions),
  'lens_sessions', (select count(*) from public.companion_lens_sessions),
  'lens_placements', (select count(*) from public.companion_lens_placements),
  'lens_subscribers', (select count(*) from public.companion_lens_subscribers),
  'lens_reports', (select count(*) from public.companion_lens_reports),
  'storage_buckets', (select count(*) from storage.buckets),
  'storage_objects', (select count(*) from storage.objects),
  'storage_metadata_bytes', coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects where metadata ? 'size'), 0),
  'auth_users_fingerprint', encode(digest(coalesce((select string_agg(id::text, ',' order by id) from auth.users), ''), 'sha256'), 'hex'),
  'profiles_fingerprint', encode(digest(coalesce((select string_agg(id::text, ',' order by id) from public.profiles), ''), 'sha256'), 'hex'),
  'art_ownership_fingerprint', encode(digest(coalesce((select string_agg(id::text || ':' || owner_id::text, ',' order by id) from public.arts), ''), 'sha256'), 'hex'),
  'version_ownership_fingerprint', encode(digest(coalesce((select string_agg(id::text || ':' || art_id::text || ':' || owner_id::text, ',' order by id) from public.art_versions), ''), 'sha256'), 'hex'),
  'artifact_ownership_fingerprint', encode(digest(coalesce((select string_agg(id::text || ':' || art_id::text || ':' || version_id::text || ':' || owner_id::text, ',' order by id) from public.art_artifacts), ''), 'sha256'), 'hex'),
  'import_ownership_fingerprint', encode(digest(coalesce((select string_agg(id::text || ':' || owner_id::text, ',' order by id) from public.companion_imports), ''), 'sha256'), 'hex'),
  'lens_session_ownership_fingerprint', encode(digest(coalesce((select string_agg(id::text || ':' || owner_id::text, ',' order by id) from public.companion_lens_sessions), ''), 'sha256'), 'hex'),
  'lens_placement_ownership_fingerprint', encode(digest(coalesce((select string_agg(id::text || ':' || session_id::text || ':' || owner_id::text, ',' order by id) from public.companion_lens_placements), ''), 'sha256'), 'hex'),
  'storage_objects_fingerprint', encode(digest(coalesce((select string_agg(id::text || ':' || bucket_id || ':' || name, ',' order by id) from storage.objects), ''), 'sha256'), 'hex'),
  'profile_user_orphans', (
    select count(*) from public.profiles p left join auth.users u on u.id = p.id where u.id is null
  ),
  'user_profile_orphans', (
    select count(*) from auth.users u left join public.profiles p on p.id = u.id where p.id is null
  ),
  'art_owner_orphans', (
    select count(*) from public.arts a left join public.profiles p on p.id = a.owner_id where p.id is null
  ),
  'version_art_orphans', (
    select count(*) from public.art_versions v left join public.arts a on a.id = v.art_id where a.id is null
  ),
  'artifact_version_orphans', (
    select count(*) from public.art_artifacts x left join public.art_versions v on v.id = x.version_id where v.id is null
  )
)::text;
