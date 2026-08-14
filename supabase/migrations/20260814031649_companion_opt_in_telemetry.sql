create table public.companion_telemetry_events (
  id bigint generated always as identity primary key,
  event_date date not null default (timezone('utc', now()))::date,
  installation_day_hash text not null check (installation_day_hash ~ '^[0-9a-f]{64}$'),
  event_name text not null check (event_name in (
    'launch',
    'login_completed',
    'library_opened',
    'schematic_installed',
    'lens_started',
    'tracker_created'
  )),
  mod_version text not null check (char_length(mod_version) between 1 and 32),
  minecraft_version text not null check (char_length(minecraft_version) between 1 and 32),
  language text not null check (language in ('ru', 'en')),
  os_family text not null check (os_family in ('windows', 'macos', 'linux', 'other')),
  created_at timestamptz not null default now()
);

create index companion_telemetry_events_retention_idx
  on public.companion_telemetry_events (created_at);
create index companion_telemetry_events_daily_install_idx
  on public.companion_telemetry_events (event_date, installation_day_hash);

create table public.companion_telemetry_daily (
  event_date date not null,
  event_name text not null check (event_name in (
    'launch',
    'login_completed',
    'library_opened',
    'schematic_installed',
    'lens_started',
    'tracker_created'
  )),
  mod_version text not null,
  minecraft_version text not null,
  language text not null check (language in ('ru', 'en')),
  os_family text not null check (os_family in ('windows', 'macos', 'linux', 'other')),
  event_count bigint not null default 0 check (event_count >= 0),
  primary key (event_date, event_name, mod_version, minecraft_version, language, os_family)
);

alter table public.companion_telemetry_events enable row level security;
alter table public.companion_telemetry_daily enable row level security;

revoke all on table public.companion_telemetry_events from public, anon, authenticated;
revoke all on table public.companion_telemetry_daily from public, anon, authenticated;
grant select, insert, delete on table public.companion_telemetry_events to service_role;
grant select, insert, update on table public.companion_telemetry_daily to service_role;
grant usage, select on sequence public.companion_telemetry_events_id_seq to service_role;

create or replace function public.record_companion_telemetry(
  p_installation_day_hash text,
  p_event_name text,
  p_mod_version text,
  p_minecraft_version text,
  p_language text,
  p_os_family text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (timezone('utc', now()))::date;
begin
  if p_installation_day_hash !~ '^[0-9a-f]{64}$'
    or p_event_name not in ('launch', 'login_completed', 'library_opened', 'schematic_installed', 'lens_started', 'tracker_created')
    or char_length(p_mod_version) not between 1 and 32
    or char_length(p_minecraft_version) not between 1 and 32
    or p_language not in ('ru', 'en')
    or p_os_family not in ('windows', 'macos', 'linux', 'other') then
    raise exception using errcode = '22023', message = 'invalid telemetry event';
  end if;

  -- Serialize one installation's daily counter so concurrent requests cannot
  -- race past the per-installation limit.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_today::text || ':' || p_installation_day_hash, 0)
  );

  -- Bound worst-case public endpoint cost without storing client IP addresses.
  if (
    select count(*)
    from public.companion_telemetry_events
    where event_date = v_today
  ) >= 100000 then
    return false;
  end if;

  if (
    select count(*)
    from public.companion_telemetry_events
    where event_date = v_today
      and installation_day_hash = p_installation_day_hash
  ) >= 200 then
    return false;
  end if;

  insert into public.companion_telemetry_events (
    event_date, installation_day_hash, event_name, mod_version,
    minecraft_version, language, os_family
  ) values (
    v_today, p_installation_day_hash, p_event_name, p_mod_version,
    p_minecraft_version, p_language, p_os_family
  );

  insert into public.companion_telemetry_daily (
    event_date, event_name, mod_version, minecraft_version,
    language, os_family, event_count
  ) values (
    v_today, p_event_name, p_mod_version, p_minecraft_version,
    p_language, p_os_family, 1
  )
  on conflict (event_date, event_name, mod_version, minecraft_version, language, os_family)
  do update set event_count = public.companion_telemetry_daily.event_count + 1;

  return true;
end;
$$;

revoke all on function public.record_companion_telemetry(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_companion_telemetry(text, text, text, text, text, text)
  to service_role;

select cron.schedule(
  'mapkluss-companion-telemetry-retention',
  '17 3 * * *',
  $$delete from public.companion_telemetry_events where created_at < now() - interval '30 days'$$
)
where not exists (
  select 1 from cron.job where jobname = 'mapkluss-companion-telemetry-retention'
);
