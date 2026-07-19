\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end
$$;
create schema if not exists auth;
create schema if not exists storage;

create or replace function auth.role()
returns text language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'postgres') $$;

create type public.art_artifact_kind as enum (
  'project', 'preview_png', 'litematic', 'litematic_tiles_zip',
  'materials_txt', 'materials_csv', 'mapdat_zip', 'frame_commands',
  'frame_datapack', 'suppression_litematic', 'suppression_plan'
);

create table public.arts (
  id uuid primary key,
  owner_id uuid not null,
  current_version_id uuid
);

create table public.art_versions (
  id uuid primary key,
  art_id uuid not null,
  owner_id uuid not null,
  settings jsonb not null,
  unique (id, art_id, owner_id)
);

create table public.art_artifacts (
  id uuid primary key,
  art_id uuid not null,
  version_id uuid not null,
  owner_id uuid not null,
  kind public.art_artifact_kind not null,
  filename text not null,
  bucket_id text not null,
  storage_path text not null,
  content_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version_id, kind)
);

alter table public.art_artifacts
  add constraint art_artifacts_suppression_payload_check check (true);

create table public.art_current_suppression_pins (
  art_id uuid primary key,
  version_id uuid not null,
  owner_id uuid not null,
  plan_artifact_id uuid not null,
  plan_filename text not null,
  plan_bucket_id text not null,
  plan_storage_path text not null,
  plan_content_type text not null,
  plan_size_bytes bigint not null,
  plan_sha256 text not null,
  litematic_artifact_id uuid not null,
  litematic_filename text not null,
  litematic_bucket_id text not null,
  litematic_storage_path text not null,
  litematic_content_type text not null,
  litematic_size_bytes bigint not null,
  litematic_sha256 text not null,
  updated_at timestamptz not null default now()
);

create table storage.objects (
  bucket_id text not null,
  name text not null,
  metadata jsonb
);

create function public.guard_current_suppression_artifact()
returns trigger language plpgsql as $$ begin return new; end $$;

create trigger art_artifacts_guard_current_suppression
before update on public.art_artifacts
for each row execute function public.guard_current_suppression_artifact();

create function public.enforce_art_current_version_contract()
returns trigger language plpgsql as $$ begin return new; end $$;

create trigger arts_enforce_current_version_contract
before insert or update of current_version_id, owner_id on public.arts
for each row execute function public.enforce_art_current_version_contract();

\ir ../migrations/20260719090136_add_suppression_bundle_kind.sql
\ir ../migrations/20260719090141_pin_suppression_bundles.sql

do $$
declare
  owner uuid := '10000000-0000-4000-8000-000000000001';
  multi_art uuid := '20000000-0000-4000-8000-000000000001';
  multi_version uuid := '30000000-0000-4000-8000-000000000001';
  bundle_artifact uuid := '40000000-0000-4000-8000-000000000001';
  single_art uuid := '20000000-0000-4000-8000-000000000002';
  single_version uuid := '30000000-0000-4000-8000-000000000002';
  plan_artifact uuid := '40000000-0000-4000-8000-000000000002';
  schematic_artifact uuid := '40000000-0000-4000-8000-000000000003';
  missing_art uuid := '20000000-0000-4000-8000-000000000004';
  missing_version uuid := '30000000-0000-4000-8000-000000000004';
  rejected boolean := false;
  missing_rejected boolean := false;
begin
  insert into public.arts(id, owner_id) values (multi_art, owner), (single_art, owner), (missing_art, owner);
  insert into public.art_versions(id, art_id, owner_id, settings) values
    (multi_version, multi_art, owner, '{"buildTechnique":"suppression_two_layer","grid":{"wide":2,"tall":1}}'),
    (single_version, single_art, owner, '{"buildTechnique":"suppression_two_layer","grid":{"wide":1,"tall":1}}'),
    (missing_version, missing_art, owner, '{"buildTechnique":"suppression_two_layer","grid":{"wide":2,"tall":2}}');

  begin
    update public.arts set current_version_id = missing_version where id = missing_art;
  exception when check_violation then
    missing_rejected := true;
  end;
  if not missing_rejected then raise exception 'multi-map current version without a pinned bundle was accepted'; end if;

  insert into public.art_artifacts(
    id, art_id, version_id, owner_id, kind, filename, bucket_id,
    storage_path, content_type, size_bytes, sha256
  ) values (
    bundle_artifact, multi_art, multi_version, owner, 'suppression_bundle',
    'large_2x1_two_layer.zip', 'mapkluss-companion-private',
    'companion/' || owner || '/' || multi_art || '/' || multi_version || '/large_2x1_two_layer.zip',
    'application/vnd.mapkluss.suppression-bundle+zip;version=2', 2048, repeat('a', 64)
  );
  update public.arts set current_version_id = multi_version where id = multi_art;
  perform public.refresh_art_current_suppression_pin(multi_art);
  if not exists (
    select 1 from public.art_version_suppression_bundle_pins
    where version_id = multi_version and artifact_id = bundle_artifact
  ) or exists (select 1 from public.art_current_suppression_pins where art_id = multi_art) then
    raise exception 'multi-map bundle pin contract failed';
  end if;

  begin
    update public.art_artifacts set sha256 = repeat('b', 64) where id = bundle_artifact;
  exception when check_violation then
    rejected := true;
  end;
  if not rejected then raise exception 'pinned multi-map bundle was mutable'; end if;

  insert into public.art_artifacts(
    id, art_id, version_id, owner_id, kind, filename, bucket_id,
    storage_path, content_type, size_bytes, sha256
  ) values
    (plan_artifact, single_art, single_version, owner, 'suppression_plan',
     'single_suppression_plan.json', 'mapkluss-companion-private',
     'companion/' || owner || '/' || single_art || '/' || single_version || '/single_suppression_plan.json',
     'application/vnd.mapkluss.suppression-plan+json;version=3', 1024, repeat('c', 64)),
    (schematic_artifact, single_art, single_version, owner, 'suppression_litematic',
     'single_suppression.litematic', 'mapkluss-companion-private',
     'companion/' || owner || '/' || single_art || '/' || single_version || '/single_suppression.litematic',
     'application/octet-stream', 2048, repeat('d', 64));
  update public.arts set current_version_id = single_version where id = single_art;
  perform public.refresh_art_current_suppression_pin(single_art);
  if not exists (
    select 1 from public.art_current_suppression_pins
    where art_id = single_art and plan_artifact_id = plan_artifact
      and litematic_artifact_id = schematic_artifact
  ) then
    raise exception 'legacy 1x1 suppression pair compatibility failed';
  end if;
end
$$;

select 'suppression bundle migration rehearsal passed' as result;
