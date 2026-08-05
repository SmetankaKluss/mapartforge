-- Charge physical private bytes and every still-unuploaded reservation once,
-- while the owner's profile row is locked. Storage INSERT policy checks can
-- then validate only the exact reservation instead of rescanning the user's
-- entire Storage prefix for every artifact in one save.
create or replace function public.enforce_companion_art_reservation_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  physical_private_bytes bigint;
  legacy_published_bytes bigint;
  unuploaded_art_bytes bigint;
  unuploaded_import_bytes bigint;
  requested_delta_bytes bigint;
begin
  if new.status not in ('uploading', 'verifying') or new.expires_at <= now() then
    return new;
  end if;

  perform 1
  from public.profiles
  where id = new.owner_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'save owner does not exist';
  end if;

  if exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'mapkluss-companion-private'
      and object.name like ('companion/' || new.owner_id::text || '/%')
      and coalesce(object.metadata ->> 'size', '') !~ '^[1-9][0-9]*$'
  ) then
    raise exception using errcode = 'P0001', message = 'private storage metadata is invalid';
  end if;

  select coalesce(sum((object.metadata ->> 'size')::bigint), 0)
  into physical_private_bytes
  from storage.objects object
  where object.bucket_id = 'mapkluss-companion-private'
    and object.name like ('companion/' || new.owner_id::text || '/%');

  select
    coalesce((select sum(size_bytes) from public.art_artifacts
      where owner_id = new.owner_id and bucket_id = 'mapartforge'), 0)
    + coalesce((select sum(size_bytes) from public.companion_imports
      where owner_id = new.owner_id and bucket_id = 'mapartforge'), 0)
  into legacy_published_bytes;

  select coalesce(sum((artifact ->> 'sizeBytes')::bigint), 0)
  into unuploaded_art_bytes
  from public.companion_art_save_reservations reservation,
       jsonb_array_elements(reservation.artifacts) artifact
  where reservation.owner_id = new.owner_id
    and reservation.version_id <> new.version_id
    and reservation.status in ('uploading', 'verifying')
    and reservation.expires_at > now()
    and not exists (
      select 1
      from storage.objects object
      where object.bucket_id = artifact ->> 'bucketId'
        and object.name = artifact ->> 'storagePath'
    );

  select coalesce(sum(reservation.size_bytes), 0)
  into unuploaded_import_bytes
  from public.companion_import_upload_reservations reservation
  where reservation.owner_id = new.owner_id
    and reservation.status = 'uploading'
    and reservation.expires_at > now()
    and not exists (
      select 1
      from storage.objects object
      where object.bucket_id = reservation.bucket_id
        and object.name = reservation.object_path
    );

  select coalesce(sum(
    (artifact.value ->> 'sizeBytes')::bigint
      - coalesce((object.metadata ->> 'size')::bigint, 0)
  ), 0)
  into requested_delta_bytes
  from jsonb_array_elements(new.artifacts) as artifact(value)
  left join storage.objects object
    on object.bucket_id = artifact.value ->> 'bucketId'
   and object.name = artifact.value ->> 'storagePath';

  if physical_private_bytes + legacy_published_bytes + unuploaded_art_bytes
     + unuploaded_import_bytes + requested_delta_bytes > 262144000 then
    raise exception using errcode = 'P0001', message = 'storage quota exceeded';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_companion_art_reservation_storage_quota()
  from public, anon, authenticated;

drop trigger if exists companion_art_reservation_storage_quota
  on public.companion_art_save_reservations;
create trigger companion_art_reservation_storage_quota
before insert or update on public.companion_art_save_reservations
for each row execute function public.enforce_companion_art_reservation_storage_quota();

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
  return true;
end
$$;

revoke all on function public.can_upload_reserved_companion_object(text, text, jsonb)
  from public, anon;
grant execute on function public.can_upload_reserved_companion_object(text, text, jsonb)
  to authenticated;
