-- Keep private export archives easy to inspect in Object Storage without
-- weakening their capability-based access model. New sessions group files by
-- UTC date/time, then retain a short unique suffix for collision resistance.
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
  session_date text;
  session_time text;
  file_index integer;
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

  -- ISO-like UTC fragments sort lexicographically in the same order as time.
  session_date := to_char(archive_session.created_at at time zone 'UTC', 'YYYY-MM-DD');
  session_time := to_char(archive_session.created_at at time zone 'UTC', 'HH24-MI-SS') || 'Z';
  file_index := archive_session.file_count + 1;
  next_path := format(
    'exports/%s/%s/%s_%s/%s_%s',
    coalesce(archive_session.owner_id::text, 'anonymous'),
    session_date,
    session_time,
    left(requested_session_id::text, 8),
    lpad(file_index::text, 2, '0'),
    safe_filename
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
