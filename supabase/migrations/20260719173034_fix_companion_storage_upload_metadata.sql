-- Supabase Storage performs its pre-upload RLS probe with a lightweight
-- metadata object whose byte count is named `contentLength`. Completed object
-- rows use `size`. Accept both shapes while keeping the reservation, owner,
-- path, MIME and quota checks unchanged.
create or replace function public.can_upload_reserved_companion_object(
  requested_bucket text,
  requested_name text,
  requested_metadata jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  requested_size_text text := coalesce(
    nullif(requested_metadata ->> 'contentLength', ''),
    nullif(requested_metadata ->> 'size', ''),
    ''
  );
  requested_size bigint;
  requested_mime text;
  expected_size bigint;
  expected_mime text;
  physical_private_bytes bigint;
  legacy_published_bytes bigint;
begin
  if current_user_id is null
     or requested_size_text !~ '^[1-9][0-9]*$'
     or coalesce(requested_metadata ->> 'mimetype', '') = '' then
    return false;
  end if;
  requested_size := requested_size_text::bigint;
  requested_mime := lower(replace(requested_metadata ->> 'mimetype', ' ', ''));

  perform pg_advisory_xact_lock(hashtextextended('companion-storage:' || current_user_id::text, 0));

  select
    (artifact ->> 'sizeBytes')::bigint,
    lower(replace(artifact ->> 'contentType', ' ', ''))
  into expected_size, expected_mime
  from public.companion_art_save_reservations reservation,
       jsonb_array_elements(reservation.artifacts) artifact
  where reservation.owner_id = current_user_id
    and reservation.expires_at > now()
    and reservation.status = 'uploading'
    and artifact ->> 'bucketId' = requested_bucket
    and artifact ->> 'storagePath' = requested_name;
  if not found or requested_size <> expected_size or requested_mime <> expected_mime then
    return false;
  end if;

  if exists (
    select 1 from storage.objects object
    where object.bucket_id = 'mapkluss-companion-private'
      and object.name like ('companion/' || current_user_id::text || '/%')
      and object.name <> requested_name
      and coalesce(object.metadata ->> 'size', '') !~ '^[1-9][0-9]*$'
  ) then
    return false;
  end if;

  select coalesce(sum((object.metadata ->> 'size')::bigint), 0)
  into physical_private_bytes
  from storage.objects object
  where object.bucket_id = 'mapkluss-companion-private'
    and object.name like ('companion/' || current_user_id::text || '/%')
    and object.name <> requested_name;

  select
    coalesce((select sum(size_bytes) from public.art_artifacts
      where owner_id = current_user_id and bucket_id = 'mapartforge'), 0)
    + coalesce((select sum(size_bytes) from public.companion_imports
      where owner_id = current_user_id and bucket_id = 'mapartforge'), 0)
  into legacy_published_bytes;

  return physical_private_bytes + legacy_published_bytes + requested_size <= 262144000
    and exists (
    select 1
    from public.companion_art_save_reservations reservation,
         jsonb_array_elements(reservation.artifacts) artifact
    where reservation.owner_id = current_user_id
      and reservation.expires_at > now()
      and reservation.status = 'uploading'
      and artifact ->> 'bucketId' = requested_bucket
      and artifact ->> 'storagePath' = requested_name
  );
end
$$;

revoke all on function public.can_upload_reserved_companion_object(text, text, jsonb)
  from public, anon;
grant execute on function public.can_upload_reserved_companion_object(text, text, jsonb)
  to authenticated;
