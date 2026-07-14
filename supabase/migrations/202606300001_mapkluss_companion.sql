create extension if not exists pgcrypto;

do $$ begin
  create type public.art_privacy as enum ('private', 'unlisted', 'public');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.art_artifact_kind as enum (
    'project',
    'preview_png',
    'litematic',
    'materials_txt',
    'materials_csv',
    'mapdat_zip',
    'frame_commands',
    'frame_datapack'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  telegram_id bigint unique,
  telegram_username text,
  storage_used_bytes bigint not null default 0 check (storage_used_bytes >= 0),
  art_count integer not null default 0 check (art_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.arts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  privacy public.art_privacy not null default 'unlisted',
  map_grid jsonb not null,
  map_mode text not null check (map_mode in ('2d', '3d')),
  minecraft_version text,
  preview_path text,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.art_versions (
  id uuid primary key default gen_random_uuid(),
  art_id uuid not null references public.arts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  version_number integer not null,
  settings jsonb not null,
  project_path text not null,
  preview_path text,
  created_at timestamptz not null default now(),
  unique (art_id, version_number)
);

alter table public.arts
  drop constraint if exists arts_current_version_fk;
alter table public.arts
  add constraint arts_current_version_fk
  foreign key (current_version_id) references public.art_versions(id) on delete set null;

create table if not exists public.art_artifacts (
  id uuid primary key default gen_random_uuid(),
  art_id uuid not null references public.arts(id) on delete cascade,
  version_id uuid not null references public.art_versions(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind public.art_artifact_kind not null,
  filename text not null,
  storage_path text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version_id, kind)
);

create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  art_id uuid not null references public.arts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, art_id)
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  art_id uuid not null references public.arts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, art_id)
);

create table if not exists public.device_codes (
  device_code text primary key,
  user_code text not null unique,
  user_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'expired')),
  access_token_hash text,
  refresh_token_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz
);

create index if not exists arts_owner_updated_idx on public.arts(owner_id, updated_at desc);
create index if not exists art_versions_art_created_idx on public.art_versions(art_id, created_at desc);
create index if not exists art_artifacts_version_kind_idx on public.art_artifacts(version_id, kind);
create index if not exists favorites_user_created_idx on public.favorites(user_id, created_at desc);
create index if not exists device_codes_user_code_idx on public.device_codes(user_code);

create or replace function public.handle_new_companion_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_companion_profile on auth.users;
create trigger on_auth_user_created_companion_profile
after insert on auth.users
for each row execute function public.handle_new_companion_user();

alter table public.profiles enable row level security;
alter table public.arts enable row level security;
alter table public.art_versions enable row level security;
alter table public.art_artifacts enable row level security;
alter table public.favorites enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.device_codes enable row level security;

create policy "profiles owner read" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles owner insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles owner update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "arts owner read write" on public.arts
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "arts unlisted public read" on public.arts
  for select using (privacy in ('unlisted', 'public'));

create policy "art_versions owner read write" on public.art_versions
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "art_versions unlisted public read" on public.art_versions
  for select using (
    exists (
      select 1 from public.arts a
      where a.id = art_versions.art_id and a.privacy in ('unlisted', 'public')
    )
  );

create policy "art_artifacts owner read write" on public.art_artifacts
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "art_artifacts unlisted public read" on public.art_artifacts
  for select using (
    exists (
      select 1 from public.arts a
      where a.id = art_artifacts.art_id and a.privacy in ('unlisted', 'public')
    )
  );

create policy "favorites owner" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "collections owner" on public.collections
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "collection_items owner" on public.collection_items
  for all using (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id and c.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id and c.owner_id = auth.uid()
    )
  );

create policy "device_codes owner read" on public.device_codes
  for select using (auth.uid() = user_id);
