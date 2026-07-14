alter table public.companion_lens_sessions
  add column if not exists group_generation bigint not null default 1;

alter table public.companion_lens_subscribers
  add column if not exists group_generation bigint;

update public.companion_lens_subscribers as subscriber
set group_generation = session.group_generation
from public.companion_lens_sessions as session
where session.id = subscriber.session_id
  and subscriber.group_generation is null;

alter table public.companion_lens_subscribers
  alter column group_generation set default 1,
  alter column group_generation set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companion_lens_sessions_group_generation_check'
      and conrelid = 'public.companion_lens_sessions'::regclass
  ) then
    alter table public.companion_lens_sessions
      add constraint companion_lens_sessions_group_generation_check
      check (group_generation > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'companion_lens_subscribers_group_generation_check'
      and conrelid = 'public.companion_lens_subscribers'::regclass
  ) then
    alter table public.companion_lens_subscribers
      add constraint companion_lens_subscribers_group_generation_check
      check (group_generation > 0);
  end if;
end
$$;

alter table public.companion_lens_placements
  drop constraint if exists companion_lens_placements_server_context;

alter table public.companion_lens_placements
  add constraint companion_lens_placements_server_context check (
    (visibility = 'personal' and server_hash is null)
    or (server_hash is not null and dimension_id is not null)
  );

create or replace function public.companion_lens_rotate_group_generation(
  p_session_id uuid,
  p_owner_id uuid,
  p_session_code_hash text,
  p_realtime_topic text
)
returns setof public.companion_lens_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.companion_lens_sessions%rowtype;
begin
  if p_session_code_hash !~ '^[a-f0-9]{64}$'
    or char_length(p_realtime_topic) not between 32 and 128
    or p_realtime_topic !~ '^lens:[a-f0-9]+$' then
    raise exception using errcode = '22023', message = 'invalid_lens_capability';
  end if;

  select *
  into v_session
  from public.companion_lens_sessions
  where id = p_session_id
    and owner_id = p_owner_id
    and status in ('active', 'offline')
  for update;

  if not found then
    return;
  end if;

  update public.companion_lens_sessions
  set
    session_code_hash = p_session_code_hash,
    realtime_topic = p_realtime_topic,
    group_generation = group_generation + 1,
    updated_at = clock_timestamp()
  where id = p_session_id
  returning * into v_session;

  delete from public.companion_lens_subscribers
  where session_id = p_session_id
    and subscription_kind = 'group';

  return next v_session;
end;
$$;

create or replace function public.companion_lens_join_group(
  p_session_code_hash text,
  p_user_id uuid,
  p_device_token_hash text
)
returns setof public.companion_lens_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.companion_lens_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_session_code_hash !~ '^[a-f0-9]{64}$'
    or p_device_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_lens_join';
  end if;

  select *
  into v_session
  from public.companion_lens_sessions
  where session_code_hash = p_session_code_hash
    and status in ('active', 'offline')
    and expires_at > v_now
  for update;

  if not found then
    return;
  end if;

  insert into public.companion_lens_subscribers as subscriber (
    session_id,
    user_id,
    device_token_hash,
    subscription_kind,
    group_generation,
    last_seen_at,
    updated_at
  ) values (
    v_session.id,
    p_user_id,
    p_device_token_hash,
    'group',
    v_session.group_generation,
    v_now,
    v_now
  )
  on conflict (session_id, device_token_hash, subscription_kind) do update
  set
    user_id = excluded.user_id,
    group_generation = excluded.group_generation,
    last_seen_at = excluded.last_seen_at,
    updated_at = excluded.updated_at;

  return next v_session;
end;
$$;

revoke all on function public.companion_lens_rotate_group_generation(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.companion_lens_join_group(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.companion_lens_rotate_group_generation(uuid, uuid, text, text)
  to service_role;
grant execute on function public.companion_lens_join_group(text, uuid, text)
  to service_role;

-- pg_net functions are SECURITY DEFINER. Keep them reachable only through the
-- locked-down cleanup wrapper, never directly through Data API roles.
revoke usage on schema net from public, anon, authenticated;
revoke execute on all functions in schema net from public, anon, authenticated;
