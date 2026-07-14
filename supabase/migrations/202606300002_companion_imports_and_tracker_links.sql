create table if not exists public.companion_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('hand', 'frame', 'wall', 'manual_wall')),
  title text not null check (char_length(title) between 1 and 120),
  map_grid jsonb not null,
  image_path text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_art_id uuid references public.arts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.build_sessions
  add column if not exists art_id uuid references public.arts(id) on delete set null,
  add column if not exists art_version_id uuid references public.art_versions(id) on delete set null;

create index if not exists companion_imports_owner_created_idx on public.companion_imports(owner_id, created_at desc);
create index if not exists build_sessions_art_idx on public.build_sessions(art_id);

alter table public.companion_imports enable row level security;

create policy "companion_imports owner" on public.companion_imports
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

