-- Private, short-lived export archives. These are intentionally separate from
-- Cloud arts: an editor download must never create a library item or public URL.
create table public.export_archive_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  client_key_hash text not null check (client_key_hash ~ '^[a-f0-9]{64}$'),
  access_token_hash text not null check (access_token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  preview_file_id uuid,
  file_count integer not null default 0,
  total_size_bytes bigint not null default 0,
  constraint export_archive_sessions_file_count_check
    check (file_count between 0 and 25),
  constraint export_archive_sessions_total_size_check
    check (total_size_bytes between 0 and 67108864)
);

create table public.export_archive_files (
  id uuid primary key,
  session_id uuid not null references public.export_archive_sessions(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('preview', 'export')),
  filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 33554432),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  bucket_id text not null default 'mapkluss-export-archives',
  storage_path text not null unique,
  storage_provider text not null default 'yandex' check (storage_provider = 'yandex'),
  status text not null default 'reserved' check (status in ('reserved', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint export_archive_files_filename_check
    check (length(filename) between 1 and 180 and filename !~ '[[:cntrl:]]'),
  constraint export_archive_files_preview_filename_check
    check (kind <> 'preview' or (filename = 'preview.png' and content_type = 'image/png'))
);

alter table public.export_archive_sessions
  add constraint export_archive_sessions_preview_file_fk
  foreign key (preview_file_id) references public.export_archive_files(id)
  on delete set null;

create index export_archive_sessions_client_expiry_idx
  on public.export_archive_sessions(client_key_hash, expires_at desc);
create index export_archive_sessions_expiry_idx
  on public.export_archive_sessions(expires_at);
create index export_archive_files_session_created_idx
  on public.export_archive_files(session_id, created_at);
create index export_archive_files_expiry_cleanup_idx
  on public.export_archive_files(owner_id, status, created_at);

alter table public.export_archive_sessions enable row level security;
alter table public.export_archive_files enable row level security;

-- A random per-session capability is checked by the Edge Function. No browser
-- role receives table privileges or a direct policy.
revoke all on table public.export_archive_sessions from public, anon, authenticated;
revoke all on table public.export_archive_files from public, anon, authenticated;

create or replace function public.start_private_export_archive_session(
  requested_owner_id uuid,
  requested_client_key_hash text,
  requested_access_token_hash text
)
returns table(id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count integer;
begin
  if requested_client_key_hash !~ '^[a-f0-9]{64}$'
     or requested_access_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid export archive access key';
  end if;

  if requested_owner_id is not null then
    perform 1 from public.profiles where profiles.id = requested_owner_id for update;
    if not found then
      raise exception using errcode = '42501', message = 'export archive owner is unavailable';
    end if;
  end if;

  select count(*) into active_count
  from public.export_archive_sessions
  where client_key_hash = requested_client_key_hash and expires_at > now();
  if active_count >= 4 then
    raise exception using errcode = 'P0001', message = 'export archive session limit reached';
  end if;

  return query
  insert into public.export_archive_sessions(
    owner_id,
    client_key_hash,
    access_token_hash,
    expires_at
  )
  values (
    requested_owner_id,
    requested_client_key_hash,
    requested_access_token_hash,
    now() + case
      when requested_owner_id is null then interval '24 hours'
      else interval '7 days'
    end
  )
  returning export_archive_sessions.id, export_archive_sessions.expires_at;
end
$$;

revoke all on function public.start_private_export_archive_session(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.start_private_export_archive_session(uuid, text, text)
  to service_role;

create or replace function public.prepare_private_export_archive_file(
  requested_session_id uuid,
  requested_access_token_hash text,
  requested_file_id uuid,
  requested_kind text,
  requested_filename text,
  requested_content_type text,
  requested_size_bytes bigint,
  requested_sha256 text
)
returns table(
  id uuid,
  bucket_id text,
  storage_path text,
  content_type text,
  sha256 text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  archive_session public.export_archive_sessions%rowtype;
  existing_file public.export_archive_files%rowtype;
  safe_filename text;
  normalized_content_type text;
  normalized_sha256 text;
  next_path text;
begin
  normalized_content_type := lower(trim(requested_content_type));
  normalized_sha256 := lower(trim(requested_sha256));
  if requested_session_id is null or requested_file_id is null
     or requested_access_token_hash !~ '^[a-f0-9]{64}$'
     or requested_kind not in ('preview', 'export')
     or length(trim(requested_filename)) not between 1 and 180
     or requested_size_bytes not between 1 and 33554432
     or normalized_sha256 !~ '^[a-f0-9]{64}$'
     or split_part(normalized_content_type, ';', 1) not in (
       'image/png', 'application/octet-stream', 'application/zip',
       'application/json', 'text/plain', 'text/csv'
     ) then
    raise exception using errcode = '22023', message = 'invalid export archive file metadata';
  end if;
  if requested_kind = 'preview' and (
    requested_filename <> 'preview.png' or normalized_content_type <> 'image/png'
  ) then
    raise exception using errcode = '22023', message = 'invalid export archive preview metadata';
  end if;

  select * into archive_session
  from public.export_archive_sessions
  where export_archive_sessions.id = requested_session_id
    and export_archive_sessions.access_token_hash = requested_access_token_hash
    and export_archive_sessions.expires_at > now()
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'export archive session is unavailable';
  end if;

  select * into existing_file
  from public.export_archive_files
  where export_archive_files.id = requested_file_id;
  if found then
    if existing_file.session_id <> requested_session_id
       or existing_file.kind <> requested_kind
       or existing_file.filename <> requested_filename
       or existing_file.content_type <> normalized_content_type
       or existing_file.size_bytes <> requested_size_bytes
       or existing_file.sha256 <> normalized_sha256 then
      raise exception using errcode = '22023', message = 'export archive file id conflict';
    end if;
    return query select existing_file.id, existing_file.bucket_id,
      existing_file.storage_path, existing_file.content_type,
      existing_file.sha256, existing_file.status;
    return;
  end if;

  if archive_session.file_count >= 25
     or archive_session.total_size_bytes + requested_size_bytes > 67108864 then
    raise exception using errcode = 'P0001', message = 'export archive size limit reached';
  end if;
  if requested_kind = 'preview' and archive_session.preview_file_id is not null then
    raise exception using errcode = '22023', message = 'export archive preview already exists';
  end if;

  safe_filename := regexp_replace(lower(requested_filename), '[^a-z0-9._-]+', '_', 'g');
  safe_filename := trim(both '_' from safe_filename);
  if safe_filename = '' then safe_filename := 'export.bin'; end if;
  next_path := format(
    'exports/%s/%s/%s-%s',
    coalesce(archive_session.owner_id::text, 'anonymous'), requested_session_id, requested_file_id, safe_filename
  );

  insert into public.export_archive_files(
    id, session_id, owner_id, kind, filename, content_type, size_bytes, sha256, storage_path
  ) values (
    requested_file_id, requested_session_id, archive_session.owner_id, requested_kind,
    requested_filename, normalized_content_type, requested_size_bytes, normalized_sha256, next_path
  );
  update public.export_archive_sessions
  set file_count = file_count + 1,
      total_size_bytes = total_size_bytes + requested_size_bytes,
      preview_file_id = case when requested_kind = 'preview' then requested_file_id else preview_file_id end,
      updated_at = now()
  where export_archive_sessions.id = requested_session_id;

  return query select requested_file_id, 'mapkluss-export-archives'::text,
    next_path, normalized_content_type, normalized_sha256, 'reserved'::text;
end
$$;

revoke all on function public.prepare_private_export_archive_file(uuid, text, uuid, text, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.prepare_private_export_archive_file(uuid, text, uuid, text, text, text, bigint, text)
  to service_role;

create or replace function public.complete_private_export_archive_file(
  requested_session_id uuid,
  requested_access_token_hash text,
  requested_file_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.export_archive_files file
  set status = 'ready', finalized_at = coalesce(file.finalized_at, now())
  from public.export_archive_sessions archive_session
  where file.id = requested_file_id
    and file.session_id = requested_session_id
    and archive_session.id = file.session_id
    and archive_session.access_token_hash = requested_access_token_hash
    and archive_session.expires_at > now();
  return found;
end
$$;

revoke all on function public.complete_private_export_archive_file(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_private_export_archive_file(uuid, text, uuid)
  to service_role;
