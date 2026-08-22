-- The output parameter `expires_at` of the table-returning function shares a
-- name with the table column. Qualify the table reference so PostgreSQL never
-- resolves it as the PL/pgSQL output variable.
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
  from public.export_archive_sessions as archive_session
  where archive_session.client_key_hash = requested_client_key_hash
    and archive_session.expires_at > now();
  if active_count >= 4 then
    raise exception using errcode = 'P0001', message = 'export archive session limit reached';
  end if;

  return query
  insert into public.export_archive_sessions as archive_session(
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
  returning archive_session.id, archive_session.expires_at;
end
$$;
