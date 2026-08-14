-- Additive provider routing for ordinary Companion artifacts. Existing clients
-- and rows remain on Supabase; only server-prepared reservations can opt into
-- Yandex writes.
alter table public.art_artifacts
  add column if not exists storage_provider text not null default 'supabase';

alter table public.art_artifacts
  drop constraint if exists art_artifacts_storage_provider_check;
alter table public.art_artifacts
  add constraint art_artifacts_storage_provider_check
  check (storage_provider in ('supabase', 'yandex')) not valid;
alter table public.art_artifacts validate constraint art_artifacts_storage_provider_check;

alter table public.companion_storage_delete_outbox
  add column if not exists storage_provider text not null default 'supabase';
alter table public.companion_storage_delete_outbox
  drop constraint if exists companion_storage_delete_outbox_storage_provider_check;
alter table public.companion_storage_delete_outbox
  add constraint companion_storage_delete_outbox_storage_provider_check
  check (storage_provider in ('supabase', 'yandex')) not valid;
alter table public.companion_storage_delete_outbox
  validate constraint companion_storage_delete_outbox_storage_provider_check;
create unique index if not exists companion_storage_delete_outbox_provider_path_uidx
  on public.companion_storage_delete_outbox(storage_provider, bucket_id, object_path);

create or replace function public.validate_companion_art_save_storage_provider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from jsonb_array_elements(new.artifacts) artifact
    where coalesce(artifact ->> 'storageProvider', 'supabase') not in ('supabase', 'yandex')
  ) or (
    select count(distinct coalesce(artifact ->> 'storageProvider', 'supabase'))
    from jsonb_array_elements(new.artifacts) artifact
  ) <> 1 then
    raise exception using errcode = '22023', message = 'invalid Companion artifact storage provider';
  end if;
  return new;
end
$$;

revoke all on function public.validate_companion_art_save_storage_provider()
  from public, anon, authenticated;
drop trigger if exists validate_companion_art_save_storage_provider
  on public.companion_art_save_reservations;
create trigger validate_companion_art_save_storage_provider
before insert or update of artifacts on public.companion_art_save_reservations
for each row execute function public.validate_companion_art_save_storage_provider();

create or replace function public.queue_deleted_companion_artifact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.companion_storage_delete_outbox(
    owner_id, storage_provider, bucket_id, object_path, reason
  ) values (
    old.owner_id, old.storage_provider, old.bucket_id, old.storage_path, 'artifact_deleted'
  )
  on conflict (storage_provider, bucket_id, object_path) do update set
    owner_id = excluded.owner_id,
    reason = excluded.reason,
    available_at = least(public.companion_storage_delete_outbox.available_at, now()),
    last_error = null,
    updated_at = now();
  return old;
end
$$;

create or replace function public.queue_cancelled_companion_art_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare artifact jsonb;
begin
  if old.status is distinct from 'cancelled' and new.status = 'cancelled' then
    for artifact in select value from jsonb_array_elements(new.artifacts)
    loop
      insert into public.companion_storage_delete_outbox(
        owner_id, storage_provider, bucket_id, object_path, reason
      ) values (
        new.owner_id,
        coalesce(artifact ->> 'storageProvider', 'supabase'),
        artifact ->> 'bucketId',
        artifact ->> 'storagePath',
        'art_upload_cancelled'
      )
      on conflict (storage_provider, bucket_id, object_path) do update set
        owner_id = excluded.owner_id,
        reason = excluded.reason,
        available_at = least(public.companion_storage_delete_outbox.available_at, now()),
        last_error = null,
        updated_at = now();
    end loop;
  end if;
  return new;
end
$$;

create or replace function public.enforce_companion_art_reservation_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  physical_private_bytes bigint;
  external_published_bytes bigint;
  unuploaded_art_bytes bigint;
  unuploaded_import_bytes bigint;
  requested_delta_bytes bigint;
begin
  if new.status not in ('uploading', 'verifying') or new.expires_at <= now() then
    return new;
  end if;

  perform 1 from public.profiles where id = new.owner_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'save owner does not exist';
  end if;

  if exists (
    select 1 from storage.objects object
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
      where owner_id = new.owner_id
        and (bucket_id = 'mapartforge' or storage_provider = 'yandex')), 0)
    + coalesce((select sum(size_bytes) from public.companion_imports
      where owner_id = new.owner_id and bucket_id = 'mapartforge'), 0)
  into external_published_bytes;

  select coalesce(sum((artifact ->> 'sizeBytes')::bigint), 0)
  into unuploaded_art_bytes
  from public.companion_art_save_reservations reservation,
       jsonb_array_elements(reservation.artifacts) artifact
  where reservation.owner_id = new.owner_id
    and reservation.version_id <> new.version_id
    and reservation.status in ('uploading', 'verifying')
    and reservation.expires_at > now()
    and (
      coalesce(artifact ->> 'storageProvider', 'supabase') = 'yandex'
      or not exists (
        select 1 from storage.objects object
        where object.bucket_id = artifact ->> 'bucketId'
          and object.name = artifact ->> 'storagePath'
      )
    );

  select coalesce(sum(reservation.size_bytes), 0)
  into unuploaded_import_bytes
  from public.companion_import_upload_reservations reservation
  where reservation.owner_id = new.owner_id
    and reservation.status = 'uploading'
    and reservation.expires_at > now()
    and not exists (
      select 1 from storage.objects object
      where object.bucket_id = reservation.bucket_id
        and object.name = reservation.object_path
    );

  select coalesce(sum(
    (artifact.value ->> 'sizeBytes')::bigint
      - case when coalesce(artifact.value ->> 'storageProvider', 'supabase') = 'supabase'
        then coalesce((object.metadata ->> 'size')::bigint, 0) else 0 end
  ), 0)
  into requested_delta_bytes
  from jsonb_array_elements(new.artifacts) as artifact(value)
  left join storage.objects object
    on coalesce(artifact.value ->> 'storageProvider', 'supabase') = 'supabase'
   and object.bucket_id = artifact.value ->> 'bucketId'
   and object.name = artifact.value ->> 'storagePath';

  if physical_private_bytes + external_published_bytes + unuploaded_art_bytes
     + unuploaded_import_bytes + requested_delta_bytes > 262144000 then
    raise exception using errcode = 'P0001', message = 'storage quota exceeded';
  end if;
  return new;
end
$$;

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
  if declared_size_text is not null then declared_size := declared_size_text::bigint; end if;
  if completed_size_text is not null then completed_size := completed_size_text::bigint; end if;
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
    and coalesce(artifact ->> 'storageProvider', 'supabase') = 'supabase'
    and artifact ->> 'bucketId' = requested_bucket
    and artifact ->> 'storagePath' = requested_name;
  if not found or requested_mime <> expected_mime then return false; end if;
  if completed_size is not null and completed_size <> expected_size then return false; end if;
  if declared_size is not null
     and (declared_size < expected_size
       or declared_size > expected_size + multipart_overhead_limit) then
    return false;
  end if;
  return true;
end
$$;

create or replace function public.is_unpublished_companion_object(
  requested_bucket text,
  requested_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.companion_art_save_reservations reservation,
         jsonb_array_elements(reservation.artifacts) artifact
    where reservation.owner_id = auth.uid()
      and reservation.status = 'cancelled'
      and coalesce(artifact ->> 'storageProvider', 'supabase') = 'supabase'
      and artifact ->> 'bucketId' = requested_bucket
      and artifact ->> 'storagePath' = requested_name
  ) and not exists (
    select 1 from public.art_artifacts artifact
    where artifact.storage_provider = 'supabase'
      and artifact.bucket_id = requested_bucket
      and artifact.storage_path = requested_name
  );
$$;

drop function if exists public.classify_companion_storage_deletes(jsonb);
create function public.classify_companion_storage_deletes(requested_objects jsonb)
returns table(storage_provider text, bucket_id text, object_path text, disposition text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(requested_objects) is distinct from 'array'
     or jsonb_array_length(requested_objects) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid Storage cleanup batch';
  end if;
  if exists (
    select 1 from jsonb_array_elements(requested_objects) item
    where coalesce(item ->> 'storageProvider', 'supabase') not in ('supabase', 'yandex')
       or coalesce(item ->> 'bucketId', '') not in ('mapartforge', 'mapkluss-companion-private')
       or char_length(coalesce(item ->> 'objectPath', '')) not between 1 and 1024
  ) then
    raise exception using errcode = '22023', message = 'invalid Storage cleanup object';
  end if;

  return query
  select
    coalesce(item ->> 'storageProvider', 'supabase'),
    item ->> 'bucketId',
    item ->> 'objectPath',
    case
      when exists (
        select 1 from public.art_artifacts artifact
        where artifact.storage_provider = coalesce(item ->> 'storageProvider', 'supabase')
          and artifact.bucket_id = item ->> 'bucketId'
          and artifact.storage_path = item ->> 'objectPath'
      ) or (
        coalesce(item ->> 'storageProvider', 'supabase') = 'supabase'
        and exists (
          select 1 from public.companion_imports scan_import
          where scan_import.bucket_id = item ->> 'bucketId'
            and scan_import.image_path = item ->> 'objectPath'
        )
      ) then 'referenced'
      when exists (
        select 1
        from public.companion_art_save_reservations reservation,
             jsonb_array_elements(reservation.artifacts) artifact
        where reservation.status in ('uploading', 'verifying')
          and reservation.expires_at > now()
          and coalesce(artifact ->> 'storageProvider', 'supabase')
            = coalesce(item ->> 'storageProvider', 'supabase')
          and artifact ->> 'bucketId' = item ->> 'bucketId'
          and artifact ->> 'storagePath' = item ->> 'objectPath'
      ) or (
        coalesce(item ->> 'storageProvider', 'supabase') = 'supabase'
        and exists (
          select 1 from public.companion_import_upload_reservations reservation
          where reservation.status = 'uploading'
            and reservation.expires_at > now()
            and reservation.bucket_id = item ->> 'bucketId'
            and reservation.object_path = item ->> 'objectPath'
        )
      ) then 'defer'
      else 'delete'
    end
  from jsonb_array_elements(requested_objects) item;
end
$$;

revoke all on function public.classify_companion_storage_deletes(jsonb)
  from public, anon, authenticated;
grant execute on function public.classify_companion_storage_deletes(jsonb)
  to service_role;

create or replace function public.publish_verified_companion_art_save(
  requested_owner_id uuid,
  requested_version_id uuid,
  requested_verification_token uuid,
  verified_artifacts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := requested_owner_id;
  reservation public.companion_art_save_reservations%rowtype;
  artifact jsonb;
  version_number_value integer;
  created_new_art boolean;
  now_value timestamptz := now();
  project_path_value text;
  preview_path_value text;
  verified_artifact_count integer;
  stored_object_count integer;
  expected_supabase_object_count integer;
  existing_art_id uuid;
  current_art_count integer;
  current_storage_bytes bigint;
  reserved_other_art_bytes bigint;
  reserved_import_bytes bigint;
begin
  if current_user_id is null or requested_version_id is null
     or requested_verification_token is null
     or jsonb_typeof(verified_artifacts) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid verified save metadata';
  end if;

  select * into reservation
  from public.companion_art_save_reservations
  where version_id = requested_version_id
    and owner_id = current_user_id
    and expires_at > now()
    and status = 'verifying'
    and verification_token = requested_verification_token
  for update;
  if not found then
    select art_id, version_number, created_at
      into existing_art_id, version_number_value, now_value
    from public.art_versions
    where id = requested_version_id and owner_id = current_user_id;
    if found then
      return jsonb_build_object(
        'artId', existing_art_id,
        'versionId', requested_version_id,
        'versionNumber', version_number_value,
        'createdNewArt', false,
        'updatedAt', now_value
      );
    end if;
    raise exception using errcode = '22023', message = 'verification lease is missing or expired';
  end if;

  if jsonb_array_length(verified_artifacts) <> jsonb_array_length(reservation.artifacts)
     or (select count(distinct value ->> 'artifactId') from jsonb_array_elements(verified_artifacts))
        <> jsonb_array_length(verified_artifacts) then
    raise exception using errcode = '22023', message = 'verified artifact manifest does not match reservation';
  end if;

  select count(*) into verified_artifact_count
  from jsonb_array_elements(reservation.artifacts) as reserved(value)
  join jsonb_array_elements(verified_artifacts) as verified(value)
    on verified.value ->> 'artifactId' = reserved.value ->> 'artifactId'
   and verified.value ->> 'bucketId' = reserved.value ->> 'bucketId'
   and verified.value ->> 'storagePath' = reserved.value ->> 'storagePath'
   and verified.value ->> 'contentType' = reserved.value ->> 'contentType'
   and coalesce(verified.value ->> 'storageProvider', 'supabase')
       = coalesce(reserved.value ->> 'storageProvider', 'supabase')
   and coalesce((verified.value ->> 'sizeBytes')::bigint, -1)
       = (reserved.value ->> 'sizeBytes')::bigint
   and verified.value ->> 'sha256' = reserved.value ->> 'sha256';
  if verified_artifact_count <> jsonb_array_length(reservation.artifacts) then
    raise exception using errcode = '22023', message = 'verified artifact manifest does not match reservation';
  end if;

  select count(*) into expected_supabase_object_count
  from jsonb_array_elements(reservation.artifacts) value
  where coalesce(value ->> 'storageProvider', 'supabase') = 'supabase';
  select count(*) into stored_object_count
  from jsonb_array_elements(reservation.artifacts) value
  join storage.objects object
    on object.bucket_id = value ->> 'bucketId'
   and object.name = value ->> 'storagePath'
   and coalesce((object.metadata ->> 'size')::bigint, -1)
       = (value ->> 'sizeBytes')::bigint
   and lower(split_part(coalesce(object.metadata ->> 'mimetype', ''), ';', 1))
       = lower(split_part(value ->> 'contentType', ';', 1))
  where coalesce(value ->> 'storageProvider', 'supabase') = 'supabase';
  if stored_object_count <> expected_supabase_object_count then
    raise exception using errcode = '22023', message = 'reserved artifacts are missing or have unexpected metadata';
  end if;

  perform 1 from public.profiles where id = current_user_id for update;
  perform pg_advisory_xact_lock(hashtextextended(reservation.art_id::text, 0));
  if exists (
    select 1 from public.arts
    where id = reservation.art_id and owner_id <> current_user_id
  ) then
    raise exception using errcode = '42501', message = 'art belongs to another owner';
  end if;
  created_new_art := not exists (
    select 1 from public.arts where id = reservation.art_id
  );
  select count(*) into current_art_count
  from public.arts where owner_id = current_user_id;
  select
    coalesce((select sum(size_bytes) from public.art_artifacts
      where owner_id = current_user_id), 0)
    + coalesce((select sum(size_bytes) from public.companion_imports
      where owner_id = current_user_id), 0)
  into current_storage_bytes;
  select coalesce(sum(total_size_bytes), 0) into reserved_other_art_bytes
  from public.companion_art_save_reservations
  where owner_id = current_user_id
    and version_id <> reservation.version_id
    and status in ('uploading', 'verifying')
    and expires_at > now();
  select coalesce(sum(size_bytes), 0) into reserved_import_bytes
  from public.companion_import_upload_reservations
  where owner_id = current_user_id
    and status = 'uploading'
    and expires_at > now();
  if created_new_art and current_art_count >= 100 then
    raise exception using errcode = 'P0001', message = 'art quota exceeded';
  end if;
  if current_storage_bytes + reserved_other_art_bytes + reserved_import_bytes
     + reservation.total_size_bytes > 262144000 then
    raise exception using errcode = 'P0001', message = 'storage quota exceeded';
  end if;

  select value ->> 'storagePath' into project_path_value
  from jsonb_array_elements(reservation.artifacts) value
  where value ->> 'kind' = 'project';
  select value ->> 'storagePath' into preview_path_value
  from jsonb_array_elements(reservation.artifacts) value
  where value ->> 'kind' = 'preview_png';

  insert into public.arts (
    id, owner_id, title, privacy, map_grid, map_mode, minecraft_version,
    preview_path, created_at, updated_at
  ) values (
    reservation.art_id, current_user_id, reservation.title, reservation.privacy,
    reservation.map_grid, reservation.map_mode, reservation.minecraft_version,
    preview_path_value, now_value, now_value
  )
  on conflict (id) do update set
    title = excluded.title,
    privacy = excluded.privacy,
    map_grid = excluded.map_grid,
    map_mode = excluded.map_mode,
    minecraft_version = excluded.minecraft_version,
    preview_path = excluded.preview_path,
    updated_at = excluded.updated_at
  where arts.owner_id = current_user_id;

  select coalesce(max(version_number), 0) + 1 into version_number_value
  from public.art_versions where art_id = reservation.art_id;
  insert into public.art_versions (
    id, art_id, owner_id, version_number, settings, project_path,
    preview_path, created_at
  ) values (
    reservation.version_id, reservation.art_id, current_user_id,
    version_number_value, reservation.settings, project_path_value,
    preview_path_value, now_value
  );

  for artifact in select value from jsonb_array_elements(reservation.artifacts)
  loop
    insert into public.art_artifacts (
      id, art_id, version_id, owner_id, kind, filename, bucket_id,
      storage_path, storage_provider, content_type, size_bytes, sha256,
      created_at, updated_at
    ) values (
      (artifact ->> 'artifactId')::uuid,
      reservation.art_id,
      reservation.version_id,
      current_user_id,
      (artifact ->> 'kind')::public.art_artifact_kind,
      artifact ->> 'filename',
      artifact ->> 'bucketId',
      artifact ->> 'storagePath',
      coalesce(artifact ->> 'storageProvider', 'supabase'),
      artifact ->> 'contentType',
      (artifact ->> 'sizeBytes')::bigint,
      artifact ->> 'sha256',
      now_value,
      now_value
    );
  end loop;

  update public.arts
  set current_version_id = reservation.version_id,
      preview_path = preview_path_value,
      updated_at = now_value
  where id = reservation.art_id and owner_id = current_user_id;

  update public.profiles
  set art_count = (
        select count(*) from public.arts where owner_id = current_user_id
      ),
      storage_used_bytes = (
        coalesce((select sum(size_bytes) from public.art_artifacts
          where owner_id = current_user_id), 0)
        + coalesce((select sum(size_bytes) from public.companion_imports
          where owner_id = current_user_id), 0)
      ),
      updated_at = now_value
  where id = current_user_id;

  delete from public.companion_art_save_reservations
  where version_id = reservation.version_id;
  return jsonb_build_object(
    'artId', reservation.art_id,
    'versionId', reservation.version_id,
    'versionNumber', version_number_value,
    'createdNewArt', created_new_art,
    'updatedAt', now_value
  );
end
$$;

revoke all on function public.publish_verified_companion_art_save(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_verified_companion_art_save(uuid, uuid, uuid, jsonb)
  to service_role;
