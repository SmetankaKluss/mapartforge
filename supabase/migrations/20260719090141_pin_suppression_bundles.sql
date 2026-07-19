-- A large Two-layer art is stored as one immutable, exact-version ZIP. Each
-- tile inside it still uses the existing suppression-plan v3 contract.

alter table public.art_artifacts
  drop constraint if exists art_artifacts_suppression_payload_check;

alter table public.art_artifacts
  add constraint art_artifacts_suppression_payload_check check (
    (kind not in ('suppression_litematic', 'suppression_plan', 'suppression_bundle'))
    or (
      kind = 'suppression_litematic'
      and size_bytes between 1 and 16777216
      and content_type = 'application/octet-stream'
      and filename ~ '\.litematic$'
    )
    or (
      kind = 'suppression_plan'
      and size_bytes between 1 and 4194304
      and content_type in (
        'application/vnd.mapkluss.suppression-plan+json;version=1',
        'application/vnd.mapkluss.suppression-plan+json;version=2',
        'application/vnd.mapkluss.suppression-plan+json;version=3'
      )
      and filename ~ '\.json$'
    )
    or (
      kind = 'suppression_bundle'
      and size_bytes between 1 and 134217728
      and content_type = 'application/vnd.mapkluss.suppression-bundle+zip;version=2'
      and filename ~ '\.zip$'
    )
  );

alter table public.art_artifacts
  add constraint art_artifacts_id_version_art_owner_unique
  unique (id, version_id, art_id, owner_id);

create table public.art_version_suppression_bundle_pins (
  version_id uuid primary key,
  art_id uuid not null,
  owner_id uuid not null,
  artifact_id uuid not null unique,
  filename text not null,
  bucket_id text not null check (bucket_id = 'mapkluss-companion-private'),
  storage_path text not null,
  content_type text not null check (
    content_type = 'application/vnd.mapkluss.suppression-bundle+zip;version=2'
  ),
  size_bytes bigint not null check (size_bytes between 1 and 134217728),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint art_version_suppression_bundle_pin_version_fk
    foreign key (version_id, art_id, owner_id)
    references public.art_versions(id, art_id, owner_id)
    on delete cascade,
  constraint art_version_suppression_bundle_pin_artifact_fk
    foreign key (artifact_id, version_id, art_id, owner_id)
    references public.art_artifacts(id, version_id, art_id, owner_id)
    on delete no action deferrable initially deferred,
  constraint art_version_suppression_bundle_pin_path_check check (
    char_length(filename) between 1 and 180
    and filename ~ '\.zip$'
    and strpos(filename, '/') = 0
    and strpos(filename, chr(92)) = 0
    and storage_path = (
      'companion/' || owner_id::text || '/' || art_id::text || '/'
      || version_id::text || '/' || filename
    )
  )
);

alter table public.art_version_suppression_bundle_pins enable row level security;
revoke all on table public.art_version_suppression_bundle_pins from public, anon, authenticated;
grant select, insert, update, delete on table public.art_version_suppression_bundle_pins to service_role;

create or replace function public.pin_suppression_bundle_artifact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'suppression_bundle' then
    return new;
  end if;
  insert into public.art_version_suppression_bundle_pins (
    version_id, art_id, owner_id, artifact_id, filename, bucket_id,
    storage_path, content_type, size_bytes, sha256, updated_at
  ) values (
    new.version_id, new.art_id, new.owner_id, new.id, new.filename, new.bucket_id,
    new.storage_path, new.content_type, new.size_bytes, new.sha256, now()
  );
  return new;
end
$$;

revoke all on function public.pin_suppression_bundle_artifact() from public, anon, authenticated;

create trigger art_artifacts_pin_suppression_bundle
after insert on public.art_artifacts
for each row
when (new.kind = 'suppression_bundle')
execute function public.pin_suppression_bundle_artifact();

create or replace function public.guard_current_suppression_artifact()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.art_current_suppression_pins as pin
    where pin.plan_artifact_id = old.id or pin.litematic_artifact_id = old.id
  ) and not exists (
    select 1
    from public.art_version_suppression_bundle_pins as pin
    where pin.artifact_id = old.id
  ) then
    return new;
  end if;

  -- Preserve the already rehearsed byte-identical promotion of legacy
  -- current-version artifacts from the public rollback bucket to the private
  -- bucket. Multi-map bundles are born private and never use this exception.
  if auth.role() = 'service_role'
     and old.bucket_id = 'mapartforge'
     and new.bucket_id = 'mapkluss-companion-private'
     and row(new.id, new.art_id, new.version_id, new.owner_id, new.kind, new.filename,
             new.storage_path, new.content_type, new.size_bytes, new.sha256, new.created_at)
         is not distinct from
         row(old.id, old.art_id, old.version_id, old.owner_id, old.kind, old.filename,
             old.storage_path, old.content_type, old.size_bytes, old.sha256, old.created_at)
     and exists (
       select 1 from storage.objects object
       where object.bucket_id = 'mapkluss-companion-private'
         and object.name = old.storage_path
         and coalesce((object.metadata ->> 'size')::bigint, -1) = old.size_bytes
         and lower(split_part(coalesce(object.metadata ->> 'mimetype', ''), ';', 1))
             = lower(split_part(old.content_type, ';', 1))
     ) then
    return new;
  end if;

  raise exception using
    errcode = '23514',
    message = 'pinned Two-layer artifacts are immutable';
end
$$;

revoke all on function public.guard_current_suppression_artifact() from public, anon, authenticated;

create or replace function public.refresh_art_current_suppression_pin(requested_art_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner_id uuid;
  current_version_id uuid;
  joined_version_id uuid;
  version_settings jsonb;
  grid_wide integer;
  grid_tall integer;
  plan_artifact public.art_artifacts%rowtype;
  litematic_artifact public.art_artifacts%rowtype;
begin
  select art.owner_id, art.current_version_id, version.id, version.settings
    into current_owner_id, current_version_id, joined_version_id, version_settings
  from public.arts art
  left join public.art_versions version
    on version.id = art.current_version_id and version.art_id = art.id and version.owner_id = art.owner_id
  where art.id = requested_art_id;
  if not found or current_version_id is null then
    delete from public.art_current_suppression_pins where art_id = requested_art_id;
    return;
  end if;
  if joined_version_id is null then
    raise exception using errcode = '23514', message = 'current version does not belong to the same art and owner';
  end if;
  if version_settings ->> 'buildTechnique' is distinct from 'suppression_two_layer' then
    delete from public.art_current_suppression_pins where art_id = requested_art_id;
    return;
  end if;
  grid_wide := coalesce((version_settings -> 'grid' ->> 'wide')::integer, 1);
  grid_tall := coalesce((version_settings -> 'grid' ->> 'tall')::integer, 1);
  if grid_wide * grid_tall > 1 then
    delete from public.art_current_suppression_pins where art_id = requested_art_id;
    if not exists (
      select 1 from public.art_version_suppression_bundle_pins pin
      where pin.version_id = current_version_id
        and pin.art_id = requested_art_id
        and pin.owner_id = current_owner_id
    ) then
      raise exception using errcode = '23514', message = 'current multi-map Two-layer version has no pinned bundle';
    end if;
    return;
  end if;
  select * into strict plan_artifact from public.art_artifacts
  where art_id = requested_art_id and version_id = current_version_id
    and owner_id = current_owner_id and kind = 'suppression_plan';
  select * into strict litematic_artifact from public.art_artifacts
  where art_id = requested_art_id and version_id = current_version_id
    and owner_id = current_owner_id and kind = 'suppression_litematic';
  insert into public.art_current_suppression_pins (
    art_id, version_id, owner_id,
    plan_artifact_id, plan_filename, plan_bucket_id, plan_storage_path, plan_content_type, plan_size_bytes, plan_sha256,
    litematic_artifact_id, litematic_filename, litematic_bucket_id, litematic_storage_path,
    litematic_content_type, litematic_size_bytes, litematic_sha256, updated_at
  ) values (
    requested_art_id, current_version_id, current_owner_id,
    plan_artifact.id, plan_artifact.filename, plan_artifact.bucket_id, plan_artifact.storage_path,
    plan_artifact.content_type, plan_artifact.size_bytes, plan_artifact.sha256,
    litematic_artifact.id, litematic_artifact.filename, litematic_artifact.bucket_id,
    litematic_artifact.storage_path, litematic_artifact.content_type, litematic_artifact.size_bytes,
    litematic_artifact.sha256, now()
  )
  on conflict (art_id) do update set
    version_id = excluded.version_id,
    owner_id = excluded.owner_id,
    plan_artifact_id = excluded.plan_artifact_id,
    plan_filename = excluded.plan_filename,
    plan_bucket_id = excluded.plan_bucket_id,
    plan_storage_path = excluded.plan_storage_path,
    plan_content_type = excluded.plan_content_type,
    plan_size_bytes = excluded.plan_size_bytes,
    plan_sha256 = excluded.plan_sha256,
    litematic_artifact_id = excluded.litematic_artifact_id,
    litematic_filename = excluded.litematic_filename,
    litematic_bucket_id = excluded.litematic_bucket_id,
    litematic_storage_path = excluded.litematic_storage_path,
    litematic_content_type = excluded.litematic_content_type,
    litematic_size_bytes = excluded.litematic_size_bytes,
    litematic_sha256 = excluded.litematic_sha256,
    updated_at = now();
end
$$;

revoke all on function public.refresh_art_current_suppression_pin(uuid) from public, anon, authenticated;

create or replace function public.enforce_art_current_version_contract()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  version_settings jsonb;
  grid_wide integer;
  grid_tall integer;
begin
  if new.current_version_id is null then return new; end if;
  select version.settings into version_settings
  from public.art_versions version
  where version.id = new.current_version_id
    and version.art_id = new.id
    and version.owner_id = new.owner_id;
  if version_settings is null then
    raise exception using errcode = '23514', message = 'current art version must belong to the same art and owner';
  end if;
  if version_settings ->> 'buildTechnique' = 'suppression_two_layer' then
    grid_wide := coalesce((version_settings -> 'grid' ->> 'wide')::integer, 1);
    grid_tall := coalesce((version_settings -> 'grid' ->> 'tall')::integer, 1);
    if grid_wide * grid_tall > 1 then
      if not exists (
        select 1 from public.art_version_suppression_bundle_pins pin
        where pin.version_id = new.current_version_id
          and pin.art_id = new.id
          and pin.owner_id = new.owner_id
      ) then
        raise exception using errcode = '23514', message = 'a multi-map Two-layer current version requires a pinned bundle';
      end if;
    elsif not exists (
      select 1 from public.art_artifacts plan
      join public.art_artifacts schematic
        on schematic.version_id = plan.version_id
       and schematic.art_id = plan.art_id
       and schematic.owner_id = plan.owner_id
       and schematic.kind = 'suppression_litematic'
      where plan.version_id = new.current_version_id
        and plan.art_id = new.id
        and plan.owner_id = new.owner_id
        and plan.kind = 'suppression_plan'
    ) then
      raise exception using errcode = '23514', message = 'a 1x1 Two-layer current version requires a complete artifact pair';
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.enforce_art_current_version_contract() from public, anon, authenticated;

-- Backfill any bundles inserted by a rehearsal before this migration and then
-- re-evaluate every current-version pin under the new grid-aware contract.
insert into public.art_version_suppression_bundle_pins (
  version_id, art_id, owner_id, artifact_id, filename, bucket_id,
  storage_path, content_type, size_bytes, sha256, created_at, updated_at
)
select artifact.version_id, artifact.art_id, artifact.owner_id, artifact.id,
  artifact.filename, artifact.bucket_id, artifact.storage_path,
  artifact.content_type, artifact.size_bytes, artifact.sha256,
  artifact.created_at, artifact.updated_at
from public.art_artifacts artifact
where artifact.kind = 'suppression_bundle'
on conflict (version_id) do nothing;

do $$
declare candidate uuid;
begin
  for candidate in select id from public.arts where current_version_id is not null
  loop
    perform public.refresh_art_current_suppression_pin(candidate);
  end loop;
end
$$;
