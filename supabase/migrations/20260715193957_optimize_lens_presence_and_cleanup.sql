-- Keep the placement quota scoped to the current Lens session. Rows left by a
-- terminal session must not block the owner's next live session while bounded
-- cleanup is still converging.
create or replace function public.enforce_companion_lens_placement_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.session_id::text, 0));
  if (
    select count(*)
    from public.companion_lens_placements
    where session_id = new.session_id
  ) >= 8 then
    raise exception using errcode = '23514', message = 'placement_limit';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_companion_lens_placement_limit()
  from public, anon, authenticated;
grant execute on function public.enforce_companion_lens_placement_limit()
  to service_role;

-- Rotate the share capability only while the caller still owns the current
-- publisher lease. The existing four-argument function remains available for
-- rollback to the previous Edge Function, while the optimized release uses
-- this compare-and-swap overload to make late browser requests harmless.
create or replace function public.companion_lens_rotate_group_generation(
  p_session_id uuid,
  p_owner_id uuid,
  p_session_code_hash text,
  p_realtime_topic text,
  p_expected_publisher_lease_hash text
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
    or p_expected_publisher_lease_hash !~ '^[a-f0-9]{64}$'
    or char_length(p_realtime_topic) not between 32 and 128
    or p_realtime_topic !~ '^lens:[a-f0-9]+$' then
    raise exception using errcode = '22023', message = 'invalid_lens_capability';
  end if;

  select *
  into v_session
  from public.companion_lens_sessions
  where id = p_session_id
    and owner_id = p_owner_id
    and publisher_lease_hash = p_expected_publisher_lease_hash
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
    and owner_id = p_owner_id
    and publisher_lease_hash = p_expected_publisher_lease_hash
  returning * into v_session;

  delete from public.companion_lens_subscribers
  where session_id = p_session_id
    and subscription_kind = 'group';

  return next v_session;
end;
$$;

revoke all on function public.companion_lens_rotate_group_generation(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.companion_lens_rotate_group_generation(uuid, uuid, text, text, text)
  to service_role;

create index if not exists companion_lens_sessions_terminal_cleanup_idx
  on public.companion_lens_sessions (updated_at, id)
  where status in ('closed', 'expired');

-- Presence timestamps are updated often. Static lookup indexes keep those
-- writes out of the new index keys.
create index if not exists companion_lens_subscribers_device_session_idx
  on public.companion_lens_subscribers (device_token_hash, session_id);

create index if not exists companion_lens_placements_session_owner_idx
  on public.companion_lens_placements (session_id, owner_id);

create index if not exists companion_lens_reports_placement_session_idx
  on public.companion_lens_reports (placement_id, session_id);

create index if not exists companion_lens_reports_reporter_user_idx
  on public.companion_lens_reports (reporter_id);

create index if not exists companion_lens_subscribers_user_idx
  on public.companion_lens_subscribers (user_id);
