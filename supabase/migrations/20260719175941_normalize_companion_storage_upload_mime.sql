-- Supabase Storage normalizes multipart MIME metadata to its media type and
-- may drop parameters such as charset or the MapKluss format version. The
-- reservation already validates the complete contentType for each artifact,
-- so the Storage policy compares normalized media types while retaining the
-- exact reservation, path, size, quota and completed-object checks.
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
  declared_size_text text := nullif(requested_metadata ->> 'contentLength', '');
  completed_size_text text := nullif(requested_metadata ->> 'size', '');
  declared_size bigint;
  completed_size bigint;
  requested_mime text;
  expected_size bigint;
  expected_mime text;
  physical_private_bytes bigint;
  legacy_published_bytes bigint;
  multipart_overhead_limit constant bigint := 1048576;
begin
  if current_user_id is null
     or coalesce(requested_metadata ->> 'mimetype', '') = ''
     or (declared_size_text is null and completed_size_text is null) then
    return false;
  end if;

  if declared_size_text is not null
     and (declared_size_text !~ '^[1-9][0-9]*$' or length(declared_size_text) > 18) then
    return false;
  end if;
  if completed_size_text is not null
     and (completed_size_text !~ '^[1-9][0-9]*$' or length(completed_size_text) > 18) then
    return false;
  end if;

  if declared_size_text is not null then
    declared_size := declared_size_text::bigint;
  end if;
  if completed_size_text is not null then
    completed_size := completed_size_text::bigint;
  end if;
  requested_mime := lower(trim(split_part(requested_metadata ->> 'mimetype', ';', 1)));

  perform pg_advisory_xact_lock(hashtextextended('companion-storage:' || current_user_id::text, 0));

  select
    (artifact ->> 'sizeBytes')::bigint,
    lower(trim(split_part(artifact ->> 'contentType', ';', 1)))
  into expected_size, expected_mime
  from public.companion_art_save_reservations reservation,
       jsonb_array_elements(reservation.artifacts) artifact
  where reservation.owner_id = current_user_id
    and reservation.expires_at > now()
    and reservation.status = 'uploading'
    and artifact ->> 'bucketId' = requested_bucket
    and artifact ->> 'storagePath' = requested_name;
  if not found or requested_mime <> expected_mime then
    return false;
  end if;

  if completed_size is not null and completed_size <> expected_size then
    return false;
  end if;
  if declared_size is not null
     and (declared_size < expected_size
       or declared_size > expected_size + multipart_overhead_limit) then
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

  return physical_private_bytes + legacy_published_bytes + expected_size <= 262144000
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
