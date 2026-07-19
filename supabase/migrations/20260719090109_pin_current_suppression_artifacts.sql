do $$
begin
  if exists (
    select 1
    from public.art_artifacts as artifact
    where char_length(artifact.filename) not between 1 and 180
       or artifact.filename in ('.', '..')
       or strpos(artifact.filename, '/') > 0
       or strpos(artifact.filename, chr(92)) > 0
       or artifact.filename ~ '[[:cntrl:]]'
       or artifact.storage_path <> (
         'companion/'
         || artifact.owner_id::text || '/'
         || artifact.art_id::text || '/'
         || artifact.version_id::text || '/'
         || artifact.filename
       )
  ) then
    raise exception using
      errcode = '23514',
      message = 'existing artifact storage paths must be audited before exact path enforcement';
  end if;
end
$$;

alter table public.art_artifacts
  add constraint art_artifacts_exact_companion_path_check
  check (
    char_length(filename) between 1 and 180
    and filename not in ('.', '..')
    and strpos(filename, '/') = 0
    and strpos(filename, chr(92)) = 0
    and filename !~ '[[:cntrl:]]'
    and storage_path = (
      'companion/'
      || owner_id::text || '/'
      || art_id::text || '/'
      || version_id::text || '/'
      || filename
    )
  ) not valid;

alter table public.art_artifacts
  validate constraint art_artifacts_exact_companion_path_check;

create table public.art_current_suppression_pins (
  art_id uuid primary key references public.arts(id) on delete cascade,
  version_id uuid not null references public.art_versions(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,

  plan_artifact_id uuid not null unique,
  plan_filename text not null,
  plan_storage_path text not null,
  plan_content_type text not null,
  plan_size_bytes bigint not null,
  plan_sha256 text not null,

  litematic_artifact_id uuid not null unique,
  litematic_filename text not null,
  litematic_storage_path text not null,
  litematic_content_type text not null,
  litematic_size_bytes bigint not null,
  litematic_sha256 text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint art_current_suppression_pins_distinct_artifacts
    check (plan_artifact_id <> litematic_artifact_id),
  constraint art_current_suppression_pins_plan_artifact_fk
    foreign key (plan_artifact_id) references public.art_artifacts(id)
    on delete no action deferrable initially deferred,
  constraint art_current_suppression_pins_litematic_artifact_fk
    foreign key (litematic_artifact_id) references public.art_artifacts(id)
    on delete no action deferrable initially deferred
);

alter table public.art_current_suppression_pins enable row level security;
revoke all on table public.art_current_suppression_pins from public, anon, authenticated;

create or replace function public.refresh_art_current_suppression_pin(requested_art_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_owner_id uuid;
  current_version_id uuid;
  joined_version_id uuid;
  version_settings jsonb;
  plan_artifact public.art_artifacts%rowtype;
  litematic_artifact public.art_artifacts%rowtype;
begin
  select art.owner_id, art.current_version_id, version.id, version.settings
    into current_owner_id, current_version_id, joined_version_id, version_settings
  from public.arts as art
  left join public.art_versions as version
    on version.id = art.current_version_id
   and version.art_id = art.id
   and version.owner_id = art.owner_id
  where art.id = requested_art_id;

  if not found or current_version_id is null then
    delete from public.art_current_suppression_pins where art_id = requested_art_id;
    return;
  end if;

  if joined_version_id is null then
    raise exception using
      errcode = '23514',
      message = 'current version does not belong to the same art and owner';
  end if;

  if version_settings ->> 'buildTechnique' is distinct from 'suppression_two_layer' then
    delete from public.art_current_suppression_pins where art_id = requested_art_id;
    return;
  end if;

  select artifact.* into plan_artifact
  from public.art_artifacts as artifact
  where artifact.art_id = requested_art_id
    and artifact.version_id = current_version_id
    and artifact.owner_id = current_owner_id
    and artifact.kind = 'suppression_plan';
  if not found then
    raise exception using errcode = '23514', message = 'current Two-layer version has no suppression plan';
  end if;

  select artifact.* into litematic_artifact
  from public.art_artifacts as artifact
  where artifact.art_id = requested_art_id
    and artifact.version_id = current_version_id
    and artifact.owner_id = current_owner_id
    and artifact.kind = 'suppression_litematic';
  if not found then
    raise exception using errcode = '23514', message = 'current Two-layer version has no suppression Litematic';
  end if;

  insert into public.art_current_suppression_pins (
    art_id, version_id, owner_id,
    plan_artifact_id, plan_filename, plan_storage_path, plan_content_type, plan_size_bytes, plan_sha256,
    litematic_artifact_id, litematic_filename, litematic_storage_path,
    litematic_content_type, litematic_size_bytes, litematic_sha256, updated_at
  ) values (
    requested_art_id, current_version_id, current_owner_id,
    plan_artifact.id, plan_artifact.filename, plan_artifact.storage_path,
    plan_artifact.content_type, plan_artifact.size_bytes, plan_artifact.sha256,
    litematic_artifact.id, litematic_artifact.filename, litematic_artifact.storage_path,
    litematic_artifact.content_type, litematic_artifact.size_bytes, litematic_artifact.sha256, now()
  )
  on conflict (art_id) do update set
    version_id = excluded.version_id,
    owner_id = excluded.owner_id,
    plan_artifact_id = excluded.plan_artifact_id,
    plan_filename = excluded.plan_filename,
    plan_storage_path = excluded.plan_storage_path,
    plan_content_type = excluded.plan_content_type,
    plan_size_bytes = excluded.plan_size_bytes,
    plan_sha256 = excluded.plan_sha256,
    litematic_artifact_id = excluded.litematic_artifact_id,
    litematic_filename = excluded.litematic_filename,
    litematic_storage_path = excluded.litematic_storage_path,
    litematic_content_type = excluded.litematic_content_type,
    litematic_size_bytes = excluded.litematic_size_bytes,
    litematic_sha256 = excluded.litematic_sha256,
    updated_at = now();
end
$$;

revoke all on function public.refresh_art_current_suppression_pin(uuid) from public, anon, authenticated;

create or replace function public.sync_art_current_suppression_pin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_art_current_suppression_pin(new.id);
  return new;
end
$$;

create or replace function public.sync_current_pin_after_version_settings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_art_id uuid;
begin
  for current_art_id in
    select art.id from public.arts as art where art.current_version_id = new.id
  loop
    perform public.refresh_art_current_suppression_pin(current_art_id);
  end loop;
  return new;
end
$$;

create or replace function public.guard_current_version_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if row(new.art_id, new.owner_id) is distinct from row(old.art_id, old.owner_id)
     and exists (select 1 from public.arts as art where art.current_version_id = old.id) then
    raise exception using
      errcode = '23514',
      message = 'a current art version cannot change art or owner';
  end if;
  return new;
end
$$;

create or replace function public.guard_current_suppression_artifact()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.art_current_suppression_pins as pin
    where pin.plan_artifact_id = old.id or pin.litematic_artifact_id = old.id
  ) then
    raise exception using
      errcode = '23514',
      message = 'current Two-layer artifacts are immutable';
  end if;
  return new;
end
$$;

revoke all on function public.sync_art_current_suppression_pin() from public, anon, authenticated;
revoke all on function public.sync_current_pin_after_version_settings() from public, anon, authenticated;
revoke all on function public.guard_current_version_identity() from public, anon, authenticated;
revoke all on function public.guard_current_suppression_artifact() from public, anon, authenticated;

do $$
declare
  candidate record;
begin
  for candidate in
    select art.id
    from public.arts as art
    join public.art_versions as version
      on version.id = art.current_version_id
     and version.art_id = art.id
     and version.owner_id = art.owner_id
    where version.settings ->> 'buildTechnique' = 'suppression_two_layer'
  loop
    perform public.refresh_art_current_suppression_pin(candidate.id);
  end loop;
end
$$;

create trigger arts_sync_current_suppression_pin_after_insert
after insert on public.arts
for each row execute function public.sync_art_current_suppression_pin();

create trigger arts_sync_current_suppression_pin_after_update
after update of current_version_id, owner_id on public.arts
for each row execute function public.sync_art_current_suppression_pin();

create trigger art_versions_sync_current_suppression_pin
after update of settings on public.art_versions
for each row execute function public.sync_current_pin_after_version_settings();

create trigger art_versions_guard_current_identity
before update of art_id, owner_id on public.art_versions
for each row execute function public.guard_current_version_identity();

create trigger art_artifacts_guard_current_suppression
before update on public.art_artifacts
for each row execute function public.guard_current_suppression_artifact();
