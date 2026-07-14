create table if not exists public.companion_lens_cleanup_state (
  id smallint primary key default 1 check (id = 1),
  owner_offset bigint not null default 0 check (owner_offset >= 0),
  updated_at timestamptz not null default now()
);

alter table public.companion_lens_cleanup_state enable row level security;

revoke all on table public.companion_lens_cleanup_state
  from public, anon, authenticated;
grant select, insert, update on table public.companion_lens_cleanup_state
  to service_role;

insert into public.companion_lens_cleanup_state (id, owner_offset)
values (1, 0)
on conflict (id) do nothing;
