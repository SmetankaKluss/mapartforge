-- New Companion versions are uploaded into a private bucket only after a
-- server-side reservation. Publication is a single database transaction.

insert into storage.buckets (id, name, public, file_size_limit)
values ('mapkluss-companion-private', 'mapkluss-companion-private', false, 134217728)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit;

-- The destructive compatibility lockdown is intentionally guarded by a
-- durable, service-only release switch. A normal migration push may install
-- the additive path, but cannot silently close the rollback window.
create table public.companion_release_gates (
  name text primary key check (char_length(name) between 1 and 80),
  approved_at timestamptz,
  approved_by text,
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.companion_release_gates enable row level security;
revoke all on table public.companion_release_gates from public, anon, authenticated;
grant select, insert, update, delete on table public.companion_release_gates to service_role;
insert into public.companion_release_gates(name, notes)
values ('legacy_companion_save_lockdown', 'Approve only after hosted smoke, rollback rehearsal and byte-verified backfill reach zero.')
on conflict (name) do nothing;

alter table public.arts
  add constraint arts_id_owner_unique unique (id, owner_id);

alter table public.art_versions
  add constraint art_versions_id_art_owner_unique unique (id, art_id, owner_id);

alter table public.art_versions
  add constraint art_versions_exact_art_owner_fk
  foreign key (art_id, owner_id) references public.arts(id, owner_id)
  on delete cascade not valid;

alter table public.art_versions validate constraint art_versions_exact_art_owner_fk;

alter table public.art_artifacts
  add column bucket_id text not null default 'mapartforge';

alter table public.art_artifacts
  add constraint art_artifacts_bucket_check
  check (bucket_id in ('mapartforge', 'mapkluss-companion-private')) not valid;

alter table public.art_artifacts validate constraint art_artifacts_bucket_check;

alter table public.art_artifacts
  add constraint art_artifacts_bucket_path_unique unique (bucket_id, storage_path);

alter table public.art_artifacts
  add constraint art_artifacts_exact_version_owner_fk
  foreign key (version_id, art_id, owner_id)
  references public.art_versions(id, art_id, owner_id)
  on delete cascade not valid;

alter table public.art_artifacts validate constraint art_artifacts_exact_version_owner_fk;

alter table public.art_current_suppression_pins
  add column plan_bucket_id text not null default 'mapartforge',
  add column litematic_bucket_id text not null default 'mapartforge';

do $$
begin
  if exists (
    select 1 from public.companion_imports
    where image_path not like ('companion/' || owner_id::text || '/imports/%')
       or right(image_path, 4) <> '.png'
       or strpos(substr(image_path, char_length('companion/' || owner_id::text || '/imports/') + 1), '/') > 0
  ) then
    raise exception using errcode = '23514', message = 'existing Companion import paths require an ownership audit';
  end if;
end
$$;

alter table public.companion_imports
  add constraint companion_imports_exact_owner_path_check
  check (
    image_path like ('companion/' || owner_id::text || '/imports/%')
    and right(image_path, 4) = '.png'
    and strpos(substr(image_path, char_length('companion/' || owner_id::text || '/imports/') + 1), '/') = 0
  ) not valid;

alter table public.companion_imports validate constraint companion_imports_exact_owner_path_check;

alter table public.companion_imports
  add column bucket_id text not null default 'mapartforge';

alter table public.companion_imports
  add constraint companion_imports_bucket_check
  check (bucket_id in ('mapartforge', 'mapkluss-companion-private')) not valid;

alter table public.companion_imports validate constraint companion_imports_bucket_check;

alter table public.companion_imports
  add constraint companion_imports_bucket_path_unique unique (bucket_id, image_path);

-- All current site/mod import writes already use service-role Edge Functions,
-- so this bypass can close in the additive phase without breaking rollback.
revoke insert, update, delete on public.companion_imports from authenticated;

create table public.companion_storage_delete_outbox (
  id bigint generated always as identity primary key,
  owner_id uuid not null,
  bucket_id text not null check (bucket_id in ('mapartforge', 'mapkluss-companion-private')),
  object_path text not null check (char_length(object_path) between 1 and 1024),
  reason text not null check (char_length(reason) between 1 and 64),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);

alter table public.companion_storage_delete_outbox enable row level security;
revoke all on table public.companion_storage_delete_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.companion_storage_delete_outbox to service_role;
grant usage, select on sequence public.companion_storage_delete_outbox_id_seq to service_role;
create index companion_storage_delete_outbox_ready_idx
  on public.companion_storage_delete_outbox(available_at, id);
create index companion_storage_delete_outbox_owner_idx
  on public.companion_storage_delete_outbox(owner_id, available_at, id);

create table public.companion_import_upload_reservations (
  object_path text primary key check (char_length(object_path) between 1 and 1024),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null default 'mapkluss-companion-private'
    check (bucket_id = 'mapkluss-companion-private'),
  size_bytes bigint not null check (size_bytes between 1 and 12582912),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'uploading' check (status in ('uploading', 'published', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  unique (owner_id, bucket_id, object_path)
);

alter table public.companion_import_upload_reservations enable row level security;
revoke all on table public.companion_import_upload_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.companion_import_upload_reservations to service_role;
create index companion_import_upload_reservations_owner_expiry_idx
  on public.companion_import_upload_reservations(owner_id, expires_at);

create or replace function public.queue_deleted_companion_artifact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.companion_storage_delete_outbox(owner_id, bucket_id, object_path, reason)
  values (old.owner_id, old.bucket_id, old.storage_path, 'artifact_deleted')
  on conflict (bucket_id, object_path) do update set
    owner_id = excluded.owner_id,
    reason = excluded.reason,
    available_at = least(public.companion_storage_delete_outbox.available_at, now()),
    last_error = null,
    updated_at = now();
  return old;
end
$$;

create or replace function public.queue_deleted_companion_import()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.companion_storage_delete_outbox(owner_id, bucket_id, object_path, reason)
  values (old.owner_id, old.bucket_id, old.image_path, 'import_deleted')
  on conflict (bucket_id, object_path) do update set
    owner_id = excluded.owner_id,
    reason = excluded.reason,
    available_at = least(public.companion_storage_delete_outbox.available_at, now()),
    last_error = null,
    updated_at = now();
  return old;
end
$$;

revoke all on function public.queue_deleted_companion_artifact() from public, anon, authenticated;
revoke all on function public.queue_deleted_companion_import() from public, anon, authenticated;

create trigger queue_deleted_companion_artifact
after delete on public.art_artifacts
for each row execute function public.queue_deleted_companion_artifact();

create trigger queue_deleted_companion_import
after delete on public.companion_imports
for each row execute function public.queue_deleted_companion_import();

create or replace function public.queue_cancelled_companion_import_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from 'cancelled' and new.status = 'cancelled' then
    insert into public.companion_storage_delete_outbox(owner_id, bucket_id, object_path, reason)
    values (new.owner_id, new.bucket_id, new.object_path, 'import_upload_cancelled')
    on conflict (bucket_id, object_path) do update set
      owner_id = excluded.owner_id,
      reason = excluded.reason,
      available_at = least(public.companion_storage_delete_outbox.available_at, now()),
      last_error = null,
      updated_at = now();
  end if;
  return new;
end
$$;

revoke all on function public.queue_cancelled_companion_import_upload() from public, anon, authenticated;

create trigger queue_cancelled_companion_import_upload
after update of status on public.companion_import_upload_reservations
for each row execute function public.queue_cancelled_companion_import_upload();

create or replace function public.reserve_companion_import_upload(
  requested_owner_id uuid,
  requested_image_path text,
  requested_size_bytes bigint,
  requested_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  physical_private_bytes bigint;
  legacy_published_bytes bigint;
  unuploaded_art_bytes bigint;
  unuploaded_import_bytes bigint;
  active_reservation_count integer;
  retained_reservation_count integer;
  expires_at_value timestamptz := now() + interval '10 minutes';
begin
  if requested_owner_id is null
     or coalesce(requested_image_path, '') !~ (
       '^companion/' || requested_owner_id::text
       || '/imports/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]png$'
     )
     or coalesce(requested_size_bytes, 0) not between 1 and 12582912
     or coalesce(requested_sha256, '') !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid Companion import reservation';
  end if;

  perform 1 from public.profiles where id = requested_owner_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'import owner does not exist';
  end if;

  update public.companion_import_upload_reservations
  set status = 'cancelled'
  where owner_id = requested_owner_id and status = 'uploading' and expires_at <= now();

  select count(*) into active_reservation_count
  from public.companion_import_upload_reservations
  where owner_id = requested_owner_id
    and object_path <> requested_image_path
    and status = 'uploading'
    and expires_at > now();
  select count(*) into retained_reservation_count
  from public.companion_import_upload_reservations
  where owner_id = requested_owner_id and object_path <> requested_image_path;
  if active_reservation_count >= 4 or retained_reservation_count >= 32 then
    raise exception using errcode = 'P0001', message = 'import reservation quota exceeded';
  end if;

  select coalesce(sum(
    case when coalesce(object.metadata ->> 'size', '') ~ '^[0-9]+$'
      then (object.metadata ->> 'size')::bigint else 0 end
  ), 0)
  into physical_private_bytes
  from storage.objects object
  where object.bucket_id = 'mapkluss-companion-private'
    and object.name like ('companion/' || requested_owner_id::text || '/%');

  select
    coalesce((select sum(size_bytes) from public.art_artifacts
      where owner_id = requested_owner_id and bucket_id = 'mapartforge'), 0)
    + coalesce((select sum(size_bytes) from public.companion_imports
      where owner_id = requested_owner_id and bucket_id = 'mapartforge'), 0)
  into legacy_published_bytes;

  select coalesce(sum((artifact ->> 'sizeBytes')::bigint), 0)
  into unuploaded_art_bytes
  from public.companion_art_save_reservations reservation,
       jsonb_array_elements(reservation.artifacts) artifact
  where reservation.owner_id = requested_owner_id
    and reservation.status in ('uploading', 'verifying')
    and reservation.expires_at > now()
    and not exists (
      select 1 from storage.objects object
      where object.bucket_id = artifact ->> 'bucketId'
        and object.name = artifact ->> 'storagePath'
    );

  select coalesce(sum(reservation.size_bytes), 0)
  into unuploaded_import_bytes
  from public.companion_import_upload_reservations reservation
  where reservation.owner_id = requested_owner_id
    and reservation.status = 'uploading'
    and reservation.expires_at > now()
    and reservation.object_path <> requested_image_path
    and not exists (
      select 1 from storage.objects object
      where object.bucket_id = reservation.bucket_id
        and object.name = reservation.object_path
    );

  if physical_private_bytes + legacy_published_bytes + unuploaded_art_bytes
     + unuploaded_import_bytes + requested_size_bytes > 262144000 then
    raise exception using errcode = 'P0001', message = 'storage quota exceeded';
  end if;

  insert into public.companion_import_upload_reservations(
    object_path, owner_id, bucket_id, size_bytes, sha256, status, expires_at
  ) values (
    requested_image_path, requested_owner_id, 'mapkluss-companion-private',
    requested_size_bytes, requested_sha256, 'uploading', expires_at_value
  )
  on conflict (object_path) do update set expires_at = excluded.expires_at
  where companion_import_upload_reservations.owner_id = requested_owner_id
    and companion_import_upload_reservations.bucket_id = 'mapkluss-companion-private'
    and companion_import_upload_reservations.size_bytes = requested_size_bytes
    and companion_import_upload_reservations.sha256 = requested_sha256
    and companion_import_upload_reservations.status = 'uploading';
  if not found then
    raise exception using errcode = '42501', message = 'import reservation belongs to another upload';
  end if;

  return jsonb_build_object(
    'bucketId', 'mapkluss-companion-private',
    'imagePath', requested_image_path,
    'expiresAt', expires_at_value
  );
end
$$;

revoke all on function public.reserve_companion_import_upload(uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.reserve_companion_import_upload(uuid, text, bigint, text)
  to service_role;

create or replace function public.publish_companion_import(
  requested_owner_id uuid,
  requested_bucket_id text,
  requested_source text,
  requested_title text,
  requested_map_grid jsonb,
  requested_image_path text,
  requested_size_bytes bigint,
  requested_sha256 text,
  requested_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_import public.companion_imports%rowtype;
  inserted_import public.companion_imports%rowtype;
  upload_reservation public.companion_import_upload_reservations%rowtype;
  current_import_count integer;
  current_storage_bytes bigint;
  reserved_storage_bytes bigint;
begin
  if requested_owner_id is null
     or coalesce(requested_bucket_id, '') not in ('mapartforge', 'mapkluss-companion-private')
     or coalesce(requested_source, '') not in ('hand', 'frame', 'wall', 'manual_wall')
     or coalesce(char_length(trim(requested_title)), 0) not between 1 and 120
     or jsonb_typeof(requested_map_grid) is distinct from 'object'
     or (case when jsonb_typeof(requested_map_grid -> 'wide') = 'number'
          then (requested_map_grid ->> 'wide')::integer else 0 end) not between 1 and 16
     or (case when jsonb_typeof(requested_map_grid -> 'tall') = 'number'
          then (requested_map_grid ->> 'tall')::integer else 0 end) not between 1 and 16
     or coalesce(requested_image_path, '') !~ (
       '^companion/' || requested_owner_id::text
       || '/imports/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]png$'
     )
     or coalesce(requested_size_bytes, 0) not between 1 and 12582912
     or coalesce(requested_sha256, '') !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(requested_metadata) is distinct from 'object'
     or coalesce(pg_column_size(requested_metadata), 0) > 16384 then
    raise exception using errcode = '22023', message = 'invalid Companion import metadata';
  end if;

  perform 1 from public.profiles where id = requested_owner_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'import owner does not exist';
  end if;
  select * into existing_import
  from public.companion_imports
  where owner_id = requested_owner_id
    and bucket_id = requested_bucket_id
    and image_path = requested_image_path
    and source = requested_source
    and map_grid = requested_map_grid
    and size_bytes = requested_size_bytes
    and sha256 = requested_sha256;
  if found then
    return jsonb_build_object(
      'state', 'created',
      'importId', existing_import.id,
      'bucketId', existing_import.bucket_id,
      'imagePath', existing_import.image_path,
      'createdAt', existing_import.created_at
    );
  end if;

  if requested_bucket_id = 'mapkluss-companion-private' then
    select * into upload_reservation
    from public.companion_import_upload_reservations
    where owner_id = requested_owner_id
      and bucket_id = requested_bucket_id
      and object_path = requested_image_path
      and size_bytes = requested_size_bytes
      and sha256 = requested_sha256
      and status = 'uploading'
      and expires_at > now()
    for update;
    if not found then
      raise exception using errcode = '22023', message = 'Companion import reservation is missing or expired';
    end if;
  end if;

  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = requested_bucket_id
      and object.name = requested_image_path
      and coalesce((object.metadata ->> 'size')::bigint, -1) = requested_size_bytes
      and lower(split_part(coalesce(object.metadata ->> 'mimetype', ''), ';', 1)) = 'image/png'
  ) then
    raise exception using errcode = '22023', message = 'Companion import object is missing or has unexpected metadata';
  end if;

  select * into existing_import
  from public.companion_imports
  where owner_id = requested_owner_id
    and source = requested_source
    and sha256 = requested_sha256
    and map_grid = requested_map_grid
  order by created_at desc
  limit 1;
  if found then
    update public.companion_imports
    set title = trim(requested_title), metadata = requested_metadata
    where id = existing_import.id and owner_id = requested_owner_id;
    if requested_bucket_id = 'mapkluss-companion-private' then
      update public.companion_import_upload_reservations
      set status = 'cancelled'
      where object_path = requested_image_path and owner_id = requested_owner_id;
    end if;
    insert into public.companion_storage_delete_outbox(owner_id, bucket_id, object_path, reason)
    values (requested_owner_id, requested_bucket_id, requested_image_path, 'deduplicated_import')
    on conflict (bucket_id, object_path) do update set
      owner_id = excluded.owner_id,
      reason = excluded.reason,
      available_at = least(public.companion_storage_delete_outbox.available_at, now()),
      last_error = null,
      updated_at = now();
    return jsonb_build_object(
      'state', 'reused',
      'importId', existing_import.id,
      'bucketId', existing_import.bucket_id,
      'imagePath', existing_import.image_path,
      'createdAt', existing_import.created_at
    );
  end if;

  select count(*) into current_import_count
  from public.companion_imports where owner_id = requested_owner_id;
  if current_import_count >= 100 then
    raise exception using errcode = 'P0001', message = 'import quota exceeded';
  end if;

  select
    coalesce((select sum(size_bytes) from public.art_artifacts where owner_id = requested_owner_id), 0)
    + coalesce((select sum(size_bytes) from public.companion_imports where owner_id = requested_owner_id), 0)
  into current_storage_bytes;
  update public.companion_art_save_reservations
  set status = 'cancelled'
  where owner_id = requested_owner_id
    and expires_at <= now()
    and status in ('uploading', 'verifying');
  select coalesce(sum(total_size_bytes), 0) into reserved_storage_bytes
  from public.companion_art_save_reservations
  where owner_id = requested_owner_id
    and status in ('uploading', 'verifying');
  if current_storage_bytes + reserved_storage_bytes + requested_size_bytes > 262144000 then
    raise exception using errcode = 'P0001', message = 'storage quota exceeded';
  end if;

  insert into public.companion_imports(
    owner_id, source, title, map_grid, bucket_id, image_path, size_bytes, sha256, metadata
  ) values (
    requested_owner_id, requested_source, trim(requested_title), requested_map_grid,
    requested_bucket_id, requested_image_path, requested_size_bytes, requested_sha256, requested_metadata
  ) returning * into inserted_import;

  if requested_bucket_id = 'mapkluss-companion-private' then
    update public.companion_import_upload_reservations
    set status = 'published'
    where object_path = requested_image_path and owner_id = requested_owner_id;
  end if;

  update public.profiles
  set storage_used_bytes = current_storage_bytes + requested_size_bytes,
      updated_at = now()
  where id = requested_owner_id;

  return jsonb_build_object(
    'state', 'created',
    'importId', inserted_import.id,
    'bucketId', inserted_import.bucket_id,
    'imagePath', inserted_import.image_path,
    'createdAt', inserted_import.created_at
  );
end
$$;

revoke all on function public.publish_companion_import(uuid, text, text, text, jsonb, text, bigint, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_companion_import(uuid, text, text, text, jsonb, text, bigint, text, jsonb)
  to service_role;

-- Transitional overload for the currently deployed Edge Function. It remains
-- service-only and is removed by the lockdown migration after rollback has
-- been rehearsed and all new imports use the private bucket.
create or replace function public.publish_companion_import(
  requested_owner_id uuid,
  requested_source text,
  requested_title text,
  requested_map_grid jsonb,
  requested_image_path text,
  requested_size_bytes bigint,
  requested_sha256 text,
  requested_metadata jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.publish_companion_import(
    requested_owner_id,
    'mapartforge',
    requested_source,
    requested_title,
    requested_map_grid,
    requested_image_path,
    requested_size_bytes,
    requested_sha256,
    requested_metadata
  );
$$;

revoke all on function public.publish_companion_import(uuid, text, text, jsonb, text, bigint, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_companion_import(uuid, text, text, jsonb, text, bigint, text, jsonb)
  to service_role;

create or replace function public.promote_companion_import_to_private(
  requested_import_id uuid,
  requested_owner_id uuid,
  requested_image_path text,
  requested_size_bytes bigint,
  requested_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare scan_import public.companion_imports%rowtype;
begin
  select * into scan_import
  from public.companion_imports
  where id = requested_import_id and owner_id = requested_owner_id
  for update;
  if not found
     or scan_import.image_path <> requested_image_path
     or scan_import.size_bytes <> requested_size_bytes
     or scan_import.sha256 <> requested_sha256 then
    raise exception using errcode = '22023', message = 'Companion import backfill metadata changed';
  end if;
  if scan_import.bucket_id = 'mapkluss-companion-private' then
    return true;
  end if;
  if scan_import.bucket_id <> 'mapartforge' then
    raise exception using errcode = '22023', message = 'Companion import bucket is unsupported';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'mapkluss-companion-private'
      and object.name = requested_image_path
      and coalesce((object.metadata ->> 'size')::bigint, -1) = requested_size_bytes
      and lower(split_part(coalesce(object.metadata ->> 'mimetype', ''), ';', 1)) = 'image/png'
  ) then
    raise exception using errcode = '22023', message = 'private Companion import copy is missing';
  end if;

  update public.companion_imports
  set bucket_id = 'mapkluss-companion-private'
  where id = requested_import_id and owner_id = requested_owner_id and bucket_id = 'mapartforge';

  insert into public.companion_storage_delete_outbox(owner_id, bucket_id, object_path, reason)
  values (requested_owner_id, 'mapartforge', requested_image_path, 'import_private_backfill')
  on conflict (bucket_id, object_path) do update set
    owner_id = excluded.owner_id,
    reason = excluded.reason,
    available_at = least(public.companion_storage_delete_outbox.available_at, now()),
    last_error = null,
    updated_at = now();
  return true;
end
$$;

revoke all on function public.promote_companion_import_to_private(uuid, uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.promote_companion_import_to_private(uuid, uuid, text, bigint, text)
  to service_role;

-- Current Two-layer pins remain immutable to users. The only permitted
-- mutation is a service-role, byte-preserving public-to-private bucket move
-- after the exact private object is present.
create or replace function public.guard_current_suppression_artifact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.art_current_suppression_pins pin
    where pin.plan_artifact_id = old.id or pin.litematic_artifact_id = old.id
  ) then
    return new;
  end if;

  if auth.role() = 'service_role'
     and old.bucket_id = 'mapartforge'
     and new.bucket_id = 'mapkluss-companion-private'
     and row(new.id, new.art_id, new.version_id, new.owner_id, new.kind, new.filename,
             new.storage_path, new.content_type, new.size_bytes, new.sha256, new.created_at)
         is not distinct from
         row(old.id, old.art_id, old.version_id, old.owner_id, old.kind, old.filename,
             old.storage_path, old.content_type, old.size_bytes, old.sha256, old.created_at)
     and exists (
       select 1 from storage.objects object
       where object.bucket_id = 'mapkluss-companion-private'
         and object.name = old.storage_path
         and coalesce((object.metadata ->> 'size')::bigint, -1) = old.size_bytes
         and lower(split_part(coalesce(object.metadata ->> 'mimetype', ''), ';', 1))
             = lower(split_part(old.content_type, ';', 1))
     ) then
    return new;
  end if;

  raise exception using
    errcode = '23514',
    message = 'current Two-layer artifacts are immutable';
end
$$;

revoke all on function public.guard_current_suppression_artifact() from public, anon, authenticated;

create or replace function public.promote_companion_artifact_to_private(
  requested_artifact_id uuid,
  requested_owner_id uuid,
  requested_storage_path text,
  requested_content_type text,
  requested_size_bytes bigint,
  requested_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare artifact public.art_artifacts%rowtype;
begin
  select * into artifact
  from public.art_artifacts
  where id = requested_artifact_id and owner_id = requested_owner_id
  for update;
  if not found
     or artifact.storage_path <> requested_storage_path
     or artifact.content_type <> requested_content_type
     or artifact.size_bytes <> requested_size_bytes
     or artifact.sha256 <> requested_sha256 then
    raise exception using errcode = '22023', message = 'Companion artifact backfill metadata changed';
  end if;
  if artifact.bucket_id = 'mapkluss-companion-private' then
    return true;
  end if;
  if artifact.bucket_id <> 'mapartforge' then
    raise exception using errcode = '22023', message = 'Companion artifact bucket is unsupported';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'mapkluss-companion-private'
      and object.name = requested_storage_path
      and coalesce((object.metadata ->> 'size')::bigint, -1) = requested_size_bytes
      and lower(split_part(coalesce(object.metadata ->> 'mimetype', ''), ';', 1))
          = lower(split_part(requested_content_type, ';', 1))
  ) then
    raise exception using errcode = '22023', message = 'private Companion artifact copy is missing';
  end if;

  update public.art_artifacts
  set bucket_id = 'mapkluss-companion-private', updated_at = now()
  where id = requested_artifact_id and owner_id = requested_owner_id and bucket_id = 'mapartforge';

  perform public.refresh_art_current_suppression_pin(artifact.art_id);
  insert into public.companion_storage_delete_outbox(owner_id, bucket_id, object_path, reason)
  values (requested_owner_id, 'mapartforge', requested_storage_path, 'artifact_private_backfill')
  on conflict (bucket_id, object_path) do update set
    owner_id = excluded.owner_id,
    reason = excluded.reason,
    available_at = least(public.companion_storage_delete_outbox.available_at, now()),
    last_error = null,
    updated_at = now();
  return true;
end
$$;

revoke all on function public.promote_companion_artifact_to_private(uuid, uuid, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.promote_companion_artifact_to_private(uuid, uuid, text, text, bigint, text)
  to service_role;

create table public.companion_art_save_reservations (
  version_id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  art_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  privacy public.art_privacy not null,
  map_grid jsonb not null,
  map_mode text not null check (map_mode in ('2d', '3d')),
  minecraft_version text,
  settings jsonb not null,
  artifacts jsonb not null check (jsonb_typeof(artifacts) = 'array'),
  total_size_bytes bigint not null check (total_size_bytes > 0),
  status text not null default 'uploading' check (status in ('uploading', 'verifying', 'cancelled')),
  verification_token uuid,
  verification_started_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  unique (owner_id, art_id, version_id)
);

alter table public.companion_art_save_reservations enable row level security;
revoke all on table public.companion_art_save_reservations from public, anon, authenticated;
create index companion_save_reservations_owner_expiry_idx
  on public.companion_art_save_reservations(owner_id, expires_at);
create index companion_save_reservations_owner_art_idx
  on public.companion_art_save_reservations(owner_id, art_id);

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
      insert into public.companion_storage_delete_outbox(owner_id, bucket_id, object_path, reason)
      values (
        new.owner_id,
        artifact ->> 'bucketId',
        artifact ->> 'storagePath',
        'art_upload_cancelled'
      )
      on conflict (bucket_id, object_path) do update set
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

revoke all on function public.queue_cancelled_companion_art_save() from public, anon, authenticated;

create trigger queue_cancelled_companion_art_save
after update of status on public.companion_art_save_reservations
for each row execute function public.queue_cancelled_companion_art_save();

create or replace function public.prepare_companion_art_save(
  requested_art_id uuid,
  requested_version_id uuid,
  requested_title text,
  requested_privacy public.art_privacy,
  requested_map_grid jsonb,
  requested_map_mode text,
  requested_minecraft_version text,
  requested_settings jsonb,
  requested_artifacts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  artifact jsonb;
  artifact_count integer;
  total_bytes bigint := 0;
  existing_art_owner uuid;
  current_art_count integer;
  current_storage_bytes bigint;
  reserved_storage_bytes bigint;
  reserved_import_storage_bytes bigint;
  reserved_new_art_count integer;
  active_reservation_count integer;
  retained_reservation_count integer;
  created_new_art boolean;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if requested_art_id is null or requested_version_id is null
     or char_length(trim(requested_title)) not between 1 and 120
     or requested_map_mode not in ('2d', '3d')
     or jsonb_typeof(requested_map_grid) <> 'object'
     or coalesce((requested_map_grid ->> 'wide')::integer, 0) not between 1 and 16
     or coalesce((requested_map_grid ->> 'tall')::integer, 0) not between 1 and 16
     or jsonb_typeof(requested_settings) <> 'object'
     or jsonb_typeof(requested_artifacts) <> 'array'
     or pg_column_size(requested_settings) > 262144
     or pg_column_size(requested_artifacts) > 262144 then
    raise exception using errcode = '22023', message = 'invalid Companion save metadata';
  end if;

  artifact_count := jsonb_array_length(requested_artifacts);
  if artifact_count not between 9 and 16 then
    raise exception using errcode = '22023', message = 'invalid Companion artifact count';
  end if;
  if (select count(distinct value ->> 'kind') from jsonb_array_elements(requested_artifacts)) <> artifact_count
     or (select count(distinct value ->> 'artifactId') from jsonb_array_elements(requested_artifacts)) <> artifact_count
     or (select count(distinct value ->> 'storagePath') from jsonb_array_elements(requested_artifacts)) <> artifact_count then
    raise exception using errcode = '22023', message = 'duplicate Companion artifact metadata';
  end if;

  for artifact in select value from jsonb_array_elements(requested_artifacts)
  loop
    if coalesce(artifact ->> 'bucketId', '') <> 'mapkluss-companion-private'
       or coalesce(artifact ->> 'artifactId', '') !~ '^[0-9a-f-]{36}$'
       or coalesce(artifact ->> 'kind', '') not in (
         'project', 'preview_png', 'litematic', 'litematic_tiles_zip', 'materials_txt',
         'materials_csv', 'mapdat_zip', 'frame_commands', 'frame_datapack',
         'suppression_litematic', 'suppression_plan', 'suppression_bundle'
       )
       or char_length(coalesce(artifact ->> 'filename', '')) not between 1 and 180
       or (artifact ->> 'filename') in ('.', '..')
       or strpos((artifact ->> 'filename'), '/') > 0
       or strpos((artifact ->> 'filename'), chr(92)) > 0
       or (artifact ->> 'storagePath') <> (
         'companion/' || current_user_id::text || '/' || requested_art_id::text || '/'
         || requested_version_id::text || '/' || (artifact ->> 'filename')
       )
       or coalesce((artifact ->> 'sizeBytes')::bigint, 0) not between 1 and 134217728
       or coalesce(artifact ->> 'sha256', '') !~ '^[a-f0-9]{64}$'
       or coalesce(artifact ->> 'contentType', '') <> (case (artifact ->> 'kind')
         when 'project' then 'application/json'
         when 'preview_png' then 'image/png'
         when 'litematic' then 'application/octet-stream'
         when 'litematic_tiles_zip' then 'application/zip'
         when 'materials_txt' then 'text/plain;charset=utf-8'
         when 'materials_csv' then 'text/csv;charset=utf-8'
         when 'mapdat_zip' then 'application/zip'
         when 'frame_commands' then 'text/plain;charset=utf-8'
         when 'frame_datapack' then 'text/plain;charset=utf-8'
         when 'suppression_litematic' then 'application/octet-stream'
         when 'suppression_plan' then 'application/vnd.mapkluss.suppression-plan+json;version=3'
         when 'suppression_bundle' then 'application/vnd.mapkluss.suppression-bundle+zip;version=2'
         else ''
       end) then
      raise exception using errcode = '22023', message = 'invalid Companion artifact metadata';
    end if;
    total_bytes := total_bytes + (artifact ->> 'sizeBytes')::bigint;
  end loop;

  if not exists (select 1 from jsonb_array_elements(requested_artifacts) value where value ->> 'kind' = 'project')
     or not exists (select 1 from jsonb_array_elements(requested_artifacts) value where value ->> 'kind' = 'preview_png') then
    raise exception using errcode = '22023', message = 'project and preview artifacts are required';
  end if;
  if requested_settings ->> 'buildTechnique' = 'suppression_two_layer' then
    if ((requested_map_grid ->> 'wide')::integer * (requested_map_grid ->> 'tall')::integer) = 1 then
      if not exists (select 1 from jsonb_array_elements(requested_artifacts) value where value ->> 'kind' = 'suppression_plan')
         or not exists (select 1 from jsonb_array_elements(requested_artifacts) value where value ->> 'kind' = 'suppression_litematic')
         or exists (select 1 from jsonb_array_elements(requested_artifacts) value where value ->> 'kind' = 'suppression_bundle') then
        raise exception using errcode = '22023', message = 'a 1x1 Two-layer save requires the legacy artifact pair only';
      end if;
    elsif not exists (select 1 from jsonb_array_elements(requested_artifacts) value where value ->> 'kind' = 'suppression_bundle')
       or exists (select 1 from jsonb_array_elements(requested_artifacts) value where value ->> 'kind' in ('suppression_plan', 'suppression_litematic')) then
      raise exception using errcode = '22023', message = 'a multi-map Two-layer save requires one bundle artifact only';
    end if;
  elsif exists (
    select 1 from jsonb_array_elements(requested_artifacts) value
    where value ->> 'kind' in ('suppression_plan', 'suppression_litematic', 'suppression_bundle')
  ) then
    raise exception using errcode = '22023', message = 'standard saves cannot contain Two-layer artifacts';
  end if;

  insert into public.profiles (id) values (current_user_id) on conflict (id) do nothing;
  perform 1 from public.profiles where id = current_user_id for update;
  perform pg_advisory_xact_lock(hashtextextended(requested_art_id::text, 0));

  select owner_id into existing_art_owner from public.arts where id = requested_art_id;
  if existing_art_owner is not null and existing_art_owner <> current_user_id then
    raise exception using errcode = '42501', message = 'art belongs to another owner';
  end if;
  created_new_art := existing_art_owner is null;

  select count(*) into current_art_count from public.arts where owner_id = current_user_id;
  select
    coalesce((select sum(size_bytes) from public.art_artifacts where owner_id = current_user_id), 0)
    + coalesce((select sum(size_bytes) from public.companion_imports where owner_id = current_user_id), 0)
  into current_storage_bytes;
  update public.companion_art_save_reservations
  set status = 'cancelled'
  where owner_id = current_user_id
    and expires_at <= now() and status in ('uploading', 'verifying');
  select count(*) into active_reservation_count
  from public.companion_art_save_reservations
  where owner_id = current_user_id
    and version_id <> requested_version_id
    and status in ('uploading', 'verifying')
    and expires_at > now();
  select count(*) into retained_reservation_count
  from public.companion_art_save_reservations
  where owner_id = current_user_id and version_id <> requested_version_id;
  if active_reservation_count >= 4 or retained_reservation_count >= 32 then
    raise exception using errcode = 'P0001', message = 'save reservation quota exceeded';
  end if;
  select coalesce(sum(total_size_bytes), 0) into reserved_storage_bytes
  from public.companion_art_save_reservations
  where owner_id = current_user_id
    and version_id <> requested_version_id
    and status in ('uploading', 'verifying');
  update public.companion_import_upload_reservations
  set status = 'cancelled'
  where owner_id = current_user_id and status = 'uploading' and expires_at <= now();
  select coalesce(sum(size_bytes), 0) into reserved_import_storage_bytes
  from public.companion_import_upload_reservations
  where owner_id = current_user_id
    and status = 'uploading'
    and expires_at > now();
  select count(distinct reservation.art_id) into reserved_new_art_count
  from public.companion_art_save_reservations reservation
  where reservation.owner_id = current_user_id
    and reservation.version_id <> requested_version_id
    and reservation.status in ('uploading', 'verifying')
    and not exists (select 1 from public.arts art where art.id = reservation.art_id);

  if created_new_art and current_art_count + reserved_new_art_count >= 100 then
    raise exception using errcode = 'P0001', message = 'art quota exceeded';
  end if;
  if current_storage_bytes + reserved_storage_bytes + reserved_import_storage_bytes + total_bytes > 262144000 then
    raise exception using errcode = 'P0001', message = 'storage quota exceeded';
  end if;

  insert into public.companion_art_save_reservations (
    version_id, owner_id, art_id, title, privacy, map_grid, map_mode,
    minecraft_version, settings, artifacts, total_size_bytes, expires_at
  ) values (
    requested_version_id, current_user_id, requested_art_id, trim(requested_title), requested_privacy,
    requested_map_grid, requested_map_mode, requested_minecraft_version, requested_settings,
    requested_artifacts, total_bytes, now() + interval '30 minutes'
  )
  on conflict (version_id) do update set
    expires_at = excluded.expires_at
  where companion_art_save_reservations.owner_id = current_user_id
    and companion_art_save_reservations.art_id = requested_art_id
    and companion_art_save_reservations.status = 'uploading'
    and companion_art_save_reservations.title = excluded.title
    and companion_art_save_reservations.privacy = excluded.privacy
    and companion_art_save_reservations.map_grid = excluded.map_grid
    and companion_art_save_reservations.map_mode = excluded.map_mode
    and companion_art_save_reservations.minecraft_version is not distinct from excluded.minecraft_version
    and companion_art_save_reservations.settings = excluded.settings
    and companion_art_save_reservations.artifacts = excluded.artifacts
    and companion_art_save_reservations.total_size_bytes = excluded.total_size_bytes;

  if not found then
    raise exception using errcode = '42501', message = 'save reservation belongs to another owner or art';
  end if;
  return jsonb_build_object('artId', requested_art_id, 'versionId', requested_version_id, 'expiresAt', now() + interval '30 minutes');
end
$$;

create or replace function public.begin_companion_art_save_verification(
  requested_owner_id uuid,
  requested_version_id uuid,
  requested_verification_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.companion_art_save_reservations%rowtype;
  existing_art_id uuid;
  version_number_value integer;
  created_at_value timestamptz;
begin
  if requested_owner_id is null or requested_version_id is null or requested_verification_token is null then
    raise exception using errcode = '22023', message = 'invalid verification request';
  end if;

  select art_id, version_number, created_at
    into existing_art_id, version_number_value, created_at_value
  from public.art_versions
  where id = requested_version_id and owner_id = requested_owner_id;
  if found then
    return jsonb_build_object(
      'state', 'published',
      'result', jsonb_build_object(
        'artId', existing_art_id,
        'versionId', requested_version_id,
        'versionNumber', version_number_value,
        'createdNewArt', false,
        'updatedAt', created_at_value
      )
    );
  end if;

  select * into reservation
  from public.companion_art_save_reservations
  where version_id = requested_version_id and owner_id = requested_owner_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'save reservation is missing or expired';
  end if;
  if reservation.expires_at <= now() or reservation.status = 'cancelled' then
    raise exception using errcode = '22023', message = 'save reservation is missing or expired';
  end if;
  if reservation.status = 'verifying'
     and reservation.verification_token is distinct from requested_verification_token
     and reservation.verification_started_at > now() - interval '5 minutes' then
    return jsonb_build_object('state', 'busy');
  end if;

  update public.companion_art_save_reservations
  set status = 'verifying',
      verification_token = requested_verification_token,
      verification_started_at = now()
  where version_id = reservation.version_id and owner_id = requested_owner_id;

  return jsonb_build_object(
    'state', 'claimed',
    'artId', reservation.art_id,
    'versionId', reservation.version_id,
    'artifacts', reservation.artifacts,
    'totalSizeBytes', reservation.total_size_bytes
  );
end
$$;

create or replace function public.release_companion_art_save_verification(
  requested_owner_id uuid,
  requested_version_id uuid,
  requested_verification_token uuid,
  requested_cancel boolean default false
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with released as (
    update public.companion_art_save_reservations
    set status = case when requested_cancel then 'cancelled' else 'uploading' end,
        verification_token = null,
        verification_started_at = null
    where owner_id = requested_owner_id
      and version_id = requested_version_id
      and status = 'verifying'
      and verification_token = requested_verification_token
    returning 1
  )
  select exists (select 1 from released);
$$;

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
  existing_art_id uuid;
  current_art_count integer;
  current_storage_bytes bigint;
  reserved_other_art_bytes bigint;
  reserved_import_bytes bigint;
begin
  if current_user_id is null or requested_version_id is null or requested_verification_token is null
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
   and coalesce((verified.value ->> 'sizeBytes')::bigint, -1) = (reserved.value ->> 'sizeBytes')::bigint
   and verified.value ->> 'sha256' = reserved.value ->> 'sha256';
  if verified_artifact_count <> jsonb_array_length(reservation.artifacts) then
    raise exception using errcode = '22023', message = 'verified artifact manifest does not match reservation';
  end if;

  select count(*) into stored_object_count
  from jsonb_array_elements(reservation.artifacts) value
  join storage.objects object
    on object.bucket_id = value ->> 'bucketId'
   and object.name = value ->> 'storagePath'
   and coalesce((object.metadata ->> 'size')::bigint, -1) = (value ->> 'sizeBytes')::bigint
   and lower(split_part(coalesce(object.metadata ->> 'mimetype', ''), ';', 1))
       = lower(split_part(value ->> 'contentType', ';', 1));
  if stored_object_count <> jsonb_array_length(reservation.artifacts) then
    raise exception using errcode = '22023', message = 'reserved artifacts are missing or have unexpected metadata';
  end if;

  perform 1 from public.profiles where id = current_user_id for update;
  perform pg_advisory_xact_lock(hashtextextended(reservation.art_id::text, 0));
  if exists (select 1 from public.arts where id = reservation.art_id and owner_id <> current_user_id) then
    raise exception using errcode = '42501', message = 'art belongs to another owner';
  end if;
  created_new_art := not exists (select 1 from public.arts where id = reservation.art_id);
  select count(*) into current_art_count from public.arts where owner_id = current_user_id;
  select
    coalesce((select sum(size_bytes) from public.art_artifacts where owner_id = current_user_id), 0)
    + coalesce((select sum(size_bytes) from public.companion_imports where owner_id = current_user_id), 0)
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
  from jsonb_array_elements(reservation.artifacts) value where value ->> 'kind' = 'project';
  select value ->> 'storagePath' into preview_path_value
  from jsonb_array_elements(reservation.artifacts) value where value ->> 'kind' = 'preview_png';

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
    id, art_id, owner_id, version_number, settings, project_path, preview_path, created_at
  ) values (
    reservation.version_id, reservation.art_id, current_user_id, version_number_value,
    reservation.settings, project_path_value, preview_path_value, now_value
  );

  for artifact in select value from jsonb_array_elements(reservation.artifacts)
  loop
    insert into public.art_artifacts (
      id, art_id, version_id, owner_id, kind, filename, bucket_id, storage_path,
      content_type, size_bytes, sha256, created_at, updated_at
    ) values (
      (artifact ->> 'artifactId')::uuid, reservation.art_id, reservation.version_id, current_user_id,
      (artifact ->> 'kind')::public.art_artifact_kind, artifact ->> 'filename', artifact ->> 'bucketId',
      artifact ->> 'storagePath', artifact ->> 'contentType', (artifact ->> 'sizeBytes')::bigint,
      artifact ->> 'sha256', now_value, now_value
    );
  end loop;

  update public.arts
  set current_version_id = reservation.version_id, preview_path = preview_path_value, updated_at = now_value
  where id = reservation.art_id and owner_id = current_user_id;

  update public.profiles
  set art_count = (select count(*) from public.arts where owner_id = current_user_id),
      storage_used_bytes = (
        coalesce((select sum(size_bytes) from public.art_artifacts where owner_id = current_user_id), 0)
        + coalesce((select sum(size_bytes) from public.companion_imports where owner_id = current_user_id), 0)
      ),
      updated_at = now_value
  where id = current_user_id;

  delete from public.companion_art_save_reservations where version_id = reservation.version_id;
  return jsonb_build_object(
    'artId', reservation.art_id,
    'versionId', reservation.version_id,
    'versionNumber', version_number_value,
    'createdNewArt', created_new_art,
    'updatedAt', now_value
  );
end
$$;

create or replace function public.cancel_companion_art_save(requested_version_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with cancelled as (
    update public.companion_art_save_reservations
    set status = 'cancelled', verification_token = null, verification_started_at = null
    where version_id = requested_version_id
      and owner_id = auth.uid()
      and (
        status = 'uploading'
        or (status = 'verifying' and verification_started_at <= now() - interval '5 minutes')
      )
    returning 1
  )
  select exists (select 1 from cancelled);
$$;

revoke all on function public.prepare_companion_art_save(uuid, uuid, text, public.art_privacy, jsonb, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.cancel_companion_art_save(uuid) from public, anon;
revoke all on function public.begin_companion_art_save_verification(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_companion_art_save_verification(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.publish_verified_companion_art_save(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_companion_art_save(uuid, uuid, text, public.art_privacy, jsonb, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.cancel_companion_art_save(uuid) to authenticated;
grant execute on function public.begin_companion_art_save_verification(uuid, uuid, uuid) to service_role;
grant execute on function public.release_companion_art_save_verification(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.publish_verified_companion_art_save(uuid, uuid, uuid, jsonb) to service_role;

create or replace function public.expire_companion_storage_reservations(requested_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_limit integer := greatest(1, least(coalesce(requested_limit, 100), 100));
  expired_art_count integer := 0;
  expired_import_count integer := 0;
  purged_art_count integer := 0;
  purged_import_count integer := 0;
begin
  with candidates as (
    select version_id
    from public.companion_art_save_reservations
    where status in ('uploading', 'verifying') and expires_at <= now()
    order by expires_at, version_id
    for update skip locked
    limit safe_limit
  )
  update public.companion_art_save_reservations reservation
  set status = 'cancelled', verification_token = null, verification_started_at = null
  from candidates
  where reservation.version_id = candidates.version_id;
  get diagnostics expired_art_count = row_count;

  with candidates as (
    select object_path
    from public.companion_import_upload_reservations
    where status = 'uploading' and expires_at <= now()
    order by expires_at, object_path
    for update skip locked
    limit safe_limit
  )
  update public.companion_import_upload_reservations reservation
  set status = 'cancelled'
  from candidates
  where reservation.object_path = candidates.object_path;
  get diagnostics expired_import_count = row_count;

  with candidates as (
    select reservation.version_id
    from public.companion_art_save_reservations reservation
    where reservation.status = 'cancelled'
      and reservation.created_at < now() - interval '1 hour'
      and not exists (
        select 1
        from jsonb_array_elements(reservation.artifacts) artifact
        join public.companion_storage_delete_outbox pending
          on pending.bucket_id = artifact ->> 'bucketId'
         and pending.object_path = artifact ->> 'storagePath'
      )
      and not exists (
        select 1
        from jsonb_array_elements(reservation.artifacts) artifact
        join storage.objects object
          on object.bucket_id = artifact ->> 'bucketId'
         and object.name = artifact ->> 'storagePath'
      )
    order by reservation.created_at, reservation.version_id
    limit safe_limit
  )
  delete from public.companion_art_save_reservations reservation
  using candidates
  where reservation.version_id = candidates.version_id;
  get diagnostics purged_art_count = row_count;

  with candidates as (
    select reservation.object_path
    from public.companion_import_upload_reservations reservation
    where (
        reservation.status = 'published'
        or (reservation.status = 'cancelled'
          and not exists (
            select 1 from public.companion_storage_delete_outbox pending
            where pending.bucket_id = reservation.bucket_id
              and pending.object_path = reservation.object_path
          )
          and not exists (
            select 1 from storage.objects object
            where object.bucket_id = reservation.bucket_id
              and object.name = reservation.object_path
          ))
      )
      and reservation.created_at < now() - interval '1 hour'
    order by reservation.created_at, reservation.object_path
    limit safe_limit
  )
  delete from public.companion_import_upload_reservations reservation
  using candidates
  where reservation.object_path = candidates.object_path;
  get diagnostics purged_import_count = row_count;

  return jsonb_build_object(
    'expiredArt', expired_art_count,
    'expiredImport', expired_import_count,
    'purgedArt', purged_art_count,
    'purgedImport', purged_import_count
  );
end
$$;

revoke all on function public.expire_companion_storage_reservations(integer)
  from public, anon, authenticated;
grant execute on function public.expire_companion_storage_reservations(integer)
  to service_role;

create or replace function public.classify_companion_storage_deletes(requested_objects jsonb)
returns table(bucket_id text, object_path text, disposition text)
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
    where coalesce(item ->> 'bucketId', '') not in ('mapartforge', 'mapkluss-companion-private')
       or char_length(coalesce(item ->> 'objectPath', '')) not between 1 and 1024
  ) then
    raise exception using errcode = '22023', message = 'invalid Storage cleanup object';
  end if;

  return query
  select
    item ->> 'bucketId',
    item ->> 'objectPath',
    case
      when exists (
        select 1 from public.art_artifacts artifact
        where artifact.bucket_id = item ->> 'bucketId'
          and artifact.storage_path = item ->> 'objectPath'
      ) or exists (
        select 1 from public.companion_imports scan_import
        where scan_import.bucket_id = item ->> 'bucketId'
          and scan_import.image_path = item ->> 'objectPath'
      ) then 'referenced'
      when exists (
        select 1
        from public.companion_art_save_reservations reservation,
             jsonb_array_elements(reservation.artifacts) artifact
        where reservation.status in ('uploading', 'verifying')
          and reservation.expires_at > now()
          and artifact ->> 'bucketId' = item ->> 'bucketId'
          and artifact ->> 'storagePath' = item ->> 'objectPath'
      ) or exists (
        select 1 from public.companion_import_upload_reservations reservation
        where reservation.status = 'uploading'
          and reservation.expires_at > now()
          and reservation.bucket_id = item ->> 'bucketId'
          and reservation.object_path = item ->> 'objectPath'
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
  requested_size bigint;
  requested_mime text;
  expected_size bigint;
  expected_mime text;
  physical_private_bytes bigint;
  legacy_published_bytes bigint;
begin
  if current_user_id is null
     or coalesce(requested_metadata ->> 'size', '') !~ '^[1-9][0-9]*$'
     or coalesce(requested_metadata ->> 'mimetype', '') = '' then
    return false;
  end if;
  requested_size := (requested_metadata ->> 'size')::bigint;
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

revoke all on function public.can_upload_reserved_companion_object(text, text, jsonb) from public, anon;
grant execute on function public.can_upload_reserved_companion_object(text, text, jsonb) to authenticated;

create or replace function public.is_unpublished_companion_object(requested_bucket text, requested_name text)
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
      and artifact ->> 'bucketId' = requested_bucket
      and artifact ->> 'storagePath' = requested_name
  ) and not exists (
    select 1 from public.art_artifacts artifact
    where artifact.bucket_id = requested_bucket and artifact.storage_path = requested_name
  );
$$;

revoke all on function public.is_unpublished_companion_object(text, text) from public, anon;
grant execute on function public.is_unpublished_companion_object(text, text) to authenticated;

-- Browser clients may only upload objects that were reserved above. Once a
-- row is published, only service-role deletion can remove or replace it.
drop policy if exists "Companion private reserved insert" on storage.objects;
drop policy if exists "Companion private owner select" on storage.objects;
drop policy if exists "Companion private unpublished delete" on storage.objects;

create policy "Companion private reserved insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'mapkluss-companion-private'
  and public.can_upload_reserved_companion_object(bucket_id, name, metadata)
);

create policy "Companion private owner select"
on storage.objects for select to authenticated
using (
  bucket_id = 'mapkluss-companion-private'
  and split_part(name, '/', 1) = 'companion'
  and split_part(name, '/', 2) = (select auth.uid())::text
);

create policy "Companion private unpublished delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'mapkluss-companion-private'
  and split_part(name, '/', 1) = 'companion'
  and split_part(name, '/', 2) = (select auth.uid())::text
  and public.is_unpublished_companion_object(bucket_id, name)
);

create or replace function public.refresh_art_current_suppression_pin(requested_art_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner_id uuid;
  current_version_id uuid;
  joined_version_id uuid;
  version_settings jsonb;
  plan_artifact public.art_artifacts%rowtype;
  litematic_artifact public.art_artifacts%rowtype;
begin
  select art.owner_id, art.current_version_id, version.id, version.settings
    into current_owner_id, current_version_id, joined_version_id, version_settings
  from public.arts art
  left join public.art_versions version
    on version.id = art.current_version_id and version.art_id = art.id and version.owner_id = art.owner_id
  where art.id = requested_art_id;
  if not found or current_version_id is null then
    delete from public.art_current_suppression_pins where art_id = requested_art_id;
    return;
  end if;
  if joined_version_id is null then
    raise exception using errcode = '23514', message = 'current version does not belong to the same art and owner';
  end if;
  if version_settings ->> 'buildTechnique' is distinct from 'suppression_two_layer' then
    delete from public.art_current_suppression_pins where art_id = requested_art_id;
    return;
  end if;
  select * into strict plan_artifact from public.art_artifacts
  where art_id = requested_art_id and version_id = current_version_id
    and owner_id = current_owner_id and kind = 'suppression_plan';
  select * into strict litematic_artifact from public.art_artifacts
  where art_id = requested_art_id and version_id = current_version_id
    and owner_id = current_owner_id and kind = 'suppression_litematic';
  insert into public.art_current_suppression_pins (
    art_id, version_id, owner_id,
    plan_artifact_id, plan_filename, plan_bucket_id, plan_storage_path, plan_content_type, plan_size_bytes, plan_sha256,
    litematic_artifact_id, litematic_filename, litematic_bucket_id, litematic_storage_path,
    litematic_content_type, litematic_size_bytes, litematic_sha256, updated_at
  ) values (
    requested_art_id, current_version_id, current_owner_id,
    plan_artifact.id, plan_artifact.filename, plan_artifact.bucket_id, plan_artifact.storage_path,
    plan_artifact.content_type, plan_artifact.size_bytes, plan_artifact.sha256,
    litematic_artifact.id, litematic_artifact.filename, litematic_artifact.bucket_id,
    litematic_artifact.storage_path, litematic_artifact.content_type, litematic_artifact.size_bytes,
    litematic_artifact.sha256, now()
  )
  on conflict (art_id) do update set
    version_id = excluded.version_id,
    owner_id = excluded.owner_id,
    plan_artifact_id = excluded.plan_artifact_id,
    plan_filename = excluded.plan_filename,
    plan_bucket_id = excluded.plan_bucket_id,
    plan_storage_path = excluded.plan_storage_path,
    plan_content_type = excluded.plan_content_type,
    plan_size_bytes = excluded.plan_size_bytes,
    plan_sha256 = excluded.plan_sha256,
    litematic_artifact_id = excluded.litematic_artifact_id,
    litematic_filename = excluded.litematic_filename,
    litematic_bucket_id = excluded.litematic_bucket_id,
    litematic_storage_path = excluded.litematic_storage_path,
    litematic_content_type = excluded.litematic_content_type,
    litematic_size_bytes = excluded.litematic_size_bytes,
    litematic_sha256 = excluded.litematic_sha256,
    updated_at = now();
end
$$;

revoke all on function public.refresh_art_current_suppression_pin(uuid) from public, anon, authenticated;

-- Rebuild snapshots so the bucket is part of the immutable pin.
do $$
declare candidate uuid;
begin
  for candidate in select id from public.arts where current_version_id is not null
  loop
    perform public.refresh_art_current_suppression_pin(candidate);
  end loop;
end
$$;

-- Existing counters may predate Companion imports. Reconcile them once while
-- this additive migration is applied; later mutations keep them current.
update public.profiles profile
set art_count = (select count(*) from public.arts art where art.owner_id = profile.id),
    storage_used_bytes = (
      coalesce((select sum(size_bytes) from public.art_artifacts artifact where artifact.owner_id = profile.id), 0)
      + coalesce((select sum(size_bytes) from public.companion_imports scan_import where scan_import.owner_id = profile.id), 0)
    ),
    updated_at = now();
