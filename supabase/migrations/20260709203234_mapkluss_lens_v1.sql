create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mapkluss-lens', 'mapkluss-lens', false, 8388608, array['image/png']::text[])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.companion_lens_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  owner_key text not null check (owner_key ~ '^[a-f0-9]{64}$'),
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'active'
    check (status in ('active', 'offline', 'closed', 'expired')),
  grid_wide smallint not null check (grid_wide between 1 and 100),
  grid_tall smallint not null check (grid_tall between 1 and 100),
  map_mode text not null check (map_mode in ('2d', '3d')),
  session_code_hash text not null check (session_code_hash ~ '^[a-f0-9]{64}$'),
  realtime_topic text not null check (
    char_length(realtime_topic) between 32 and 128
    and realtime_topic ~ '^lens:[a-f0-9]+$'
  ),
  publisher_lease_hash text not null check (publisher_lease_hash ~ '^[a-f0-9]{64}$'),
  publisher_lease_expires_at timestamptz not null,
  preview_path text,
  preview_sha256 text check (preview_sha256 is null or preview_sha256 ~ '^[a-f0-9]{64}$'),
  preview_width integer check (preview_width is null or preview_width between 16 and 4096),
  preview_height integer check (preview_height is null or preview_height between 16 and 4096),
  tile_resolution smallint check (tile_resolution is null or tile_resolution in (16, 32, 64, 128)),
  revision bigint not null default 0 check (revision >= 0),
  last_editor_seen_at timestamptz not null default now(),
  last_mod_seen_at timestamptz,
  owner_device_token_hash text check (
    owner_device_token_hash is null or owner_device_token_hash ~ '^[a-f0-9]{64}$'
  ),
  last_published_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companion_lens_sessions_preview_consistency check (
    (revision = 0 and preview_path is null and preview_sha256 is null
      and preview_width is null and preview_height is null and tile_resolution is null)
    or
    (revision > 0 and preview_path is not null and preview_sha256 is not null
      and preview_width is not null and preview_height is not null and tile_resolution is not null)
  ),
  constraint companion_lens_sessions_preview_dimensions check (
    preview_width is null
    or (
      preview_width = grid_wide * tile_resolution
      and preview_height = grid_tall * tile_resolution
      and preview_width::bigint * preview_height::bigint <= 16777216
    )
  ),
  constraint companion_lens_sessions_expiry_order check (expires_at > created_at),
  constraint companion_lens_sessions_lease_order check (publisher_lease_expires_at > created_at),
  unique (id, owner_id)
);

create unique index companion_lens_sessions_one_live_owner_idx
  on public.companion_lens_sessions (owner_id)
  where status in ('active', 'offline');
create unique index companion_lens_sessions_live_code_idx
  on public.companion_lens_sessions (session_code_hash)
  where status in ('active', 'offline');
create unique index companion_lens_sessions_live_topic_idx
  on public.companion_lens_sessions (realtime_topic)
  where status in ('active', 'offline');
create index companion_lens_sessions_expiry_idx
  on public.companion_lens_sessions (expires_at)
  where status in ('active', 'offline');
create index companion_lens_sessions_owner_updated_idx
  on public.companion_lens_sessions (owner_id, updated_at desc);

create table public.companion_lens_placements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.companion_lens_sessions(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  owner_key text not null check (owner_key ~ '^[a-f0-9]{64}$'),
  owner_device_token_hash text not null check (owner_device_token_hash ~ '^[a-f0-9]{64}$'),
  title text not null check (char_length(title) between 1 and 120),
  visibility text not null check (visibility in ('personal', 'group')),
  server_hash text check (server_hash is null or server_hash ~ '^[a-f0-9]{64}$'),
  dimension_id text check (dimension_id is null or char_length(dimension_id) between 1 and 128),
  anchor_x integer not null check (anchor_x between -30000000 and 30000000),
  anchor_y integer not null check (anchor_y between -2048 and 2048),
  anchor_z integer not null check (anchor_z between -30000000 and 30000000),
  facing text not null check (facing in ('north', 'south', 'east', 'west')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companion_lens_placements_session_owner_fk
    foreign key (session_id, owner_id)
    references public.companion_lens_sessions(id, owner_id)
    on delete cascade,
  constraint companion_lens_placements_server_context check (
    (server_hash is null and dimension_id is null and visibility = 'personal')
    or (server_hash is not null and dimension_id is not null)
  ),
  unique (id, session_id)
);

create index companion_lens_placements_session_idx
  on public.companion_lens_placements (session_id, last_seen_at desc);
create index companion_lens_placements_owner_idx
  on public.companion_lens_placements (owner_id, last_seen_at desc);
create index companion_lens_placements_context_idx
  on public.companion_lens_placements (server_hash, dimension_id, last_seen_at desc)
  where visibility = 'group';

create or replace function public.enforce_companion_lens_placement_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  if (
    select count(*)
    from public.companion_lens_placements
    where owner_id = new.owner_id
  ) >= 8 then
    raise exception using errcode = '23514', message = 'placement_limit';
  end if;
  return new;
end;
$$;

create trigger companion_lens_placement_limit
before insert on public.companion_lens_placements
for each row execute function public.enforce_companion_lens_placement_limit();

create table public.companion_lens_subscribers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.companion_lens_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_token_hash text not null check (device_token_hash ~ '^[a-f0-9]{64}$'),
  subscription_kind text not null default 'group' check (subscription_kind = 'group'),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, device_token_hash, subscription_kind)
);

create index companion_lens_subscribers_device_idx
  on public.companion_lens_subscribers (device_token_hash, last_seen_at desc);
create index companion_lens_subscribers_session_idx
  on public.companion_lens_subscribers (session_id, last_seen_at desc);

create table public.companion_lens_reports (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null,
  session_id uuid not null references public.companion_lens_sessions(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reporter_device_token_hash text not null check (reporter_device_token_hash ~ '^[a-f0-9]{64}$'),
  reason text not null check (reason in ('spam', 'sexual', 'hateful', 'other')),
  created_at timestamptz not null default now(),
  unique (placement_id, reporter_device_token_hash),
  constraint companion_lens_reports_placement_session_fk
    foreign key (placement_id, session_id)
    references public.companion_lens_placements(id, session_id)
    on delete cascade
);

create index companion_lens_reports_session_idx
  on public.companion_lens_reports (session_id, created_at desc);
create index companion_lens_reports_reporter_idx
  on public.companion_lens_reports (reporter_device_token_hash, created_at desc);

create table public.companion_lens_rate_limits (
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  action text not null check (char_length(action) between 1 and 64),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (key_hash, action)
);

create index companion_lens_rate_limits_updated_idx
  on public.companion_lens_rate_limits (updated_at);

create or replace function public.companion_lens_consume_rate_limit(
  p_key_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_ms integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_window_started_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_key_hash !~ '^[a-f0-9]{64}$'
    or char_length(p_action) not between 1 and 64
    or p_limit < 1
    or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments';
  end if;

  insert into public.companion_lens_rate_limits as limits (
    key_hash,
    action,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_key_hash,
    p_action,
    v_now,
    1,
    v_now
  )
  on conflict (key_hash, action) do update
  set
    window_started_at = case
      when limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
      else limits.request_count + 1
    end,
    updated_at = v_now
  returning request_count, window_started_at
  into v_count, v_window_started_at;

  allowed := v_count <= p_limit;
  retry_after_ms := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (
        v_window_started_at + make_interval(secs => p_window_seconds) - v_now
      )) * 1000)::integer
    )
  end;
  return next;
end;
$$;

create unique index device_codes_access_token_hash_unique_idx
  on public.device_codes (access_token_hash)
  where access_token_hash is not null;

alter table public.companion_lens_sessions enable row level security;
alter table public.companion_lens_placements enable row level security;
alter table public.companion_lens_subscribers enable row level security;
alter table public.companion_lens_reports enable row level security;
alter table public.companion_lens_rate_limits enable row level security;

revoke all on table public.companion_lens_sessions from anon, authenticated;
revoke all on table public.companion_lens_placements from anon, authenticated;
revoke all on table public.companion_lens_subscribers from anon, authenticated;
revoke all on table public.companion_lens_reports from anon, authenticated;
revoke all on table public.companion_lens_rate_limits from anon, authenticated;
revoke all on function public.companion_lens_consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.enforce_companion_lens_placement_limit()
  from public, anon, authenticated;

grant all on table public.companion_lens_sessions to service_role;
grant all on table public.companion_lens_placements to service_role;
grant all on table public.companion_lens_subscribers to service_role;
grant all on table public.companion_lens_reports to service_role;
grant all on table public.companion_lens_rate_limits to service_role;
grant execute on function public.companion_lens_consume_rate_limit(text, text, integer, integer)
  to service_role;
grant execute on function public.enforce_companion_lens_placement_limit()
  to service_role;

create or replace function public.invoke_mapkluss_lens_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'mapkluss_lens_function_url'
  limit 1;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'mapkluss_lens_maintenance_secret'
  limit 1;

  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-lens-maintenance-secret', v_secret
    ),
    body := jsonb_build_object(
      'action', 'maintenance_cleanup',
      'principalKind', 'server'
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.invoke_mapkluss_lens_cleanup()
  from public, anon, authenticated;

select cron.schedule(
  'mapkluss-lens-cleanup',
  '*/5 * * * *',
  'select public.invoke_mapkluss_lens_cleanup()'
);
