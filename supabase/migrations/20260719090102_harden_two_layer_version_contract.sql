alter table public.art_artifacts
  drop constraint if exists art_artifacts_suppression_payload_check;

alter table public.art_artifacts
  add constraint art_artifacts_suppression_payload_check check (
    (kind <> 'suppression_litematic' and kind <> 'suppression_plan')
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
  );

create or replace function public.enforce_art_current_version_contract()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  version_settings jsonb;
begin
  if new.current_version_id is null then
    return new;
  end if;

  select version.settings
    into version_settings
  from public.art_versions as version
  where version.id = new.current_version_id
    and version.art_id = new.id
    and version.owner_id = new.owner_id;

  if version_settings is null then
    raise exception using
      errcode = '23514',
      message = 'current art version must belong to the same art and owner';
  end if;

  if version_settings ->> 'buildTechnique' = 'suppression_two_layer'
    and not exists (
      select 1
      from public.art_artifacts as plan
      join public.art_artifacts as schematic
        on schematic.version_id = plan.version_id
       and schematic.art_id = plan.art_id
       and schematic.owner_id = plan.owner_id
       and schematic.kind = 'suppression_litematic'
      where plan.version_id = new.current_version_id
        and plan.art_id = new.id
        and plan.owner_id = new.owner_id
        and plan.kind = 'suppression_plan'
    ) then
    raise exception using
      errcode = '23514',
      message = 'a Two-layer current version requires a complete pinned artifact pair';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_art_current_version_contract() from public;
revoke all on function public.enforce_art_current_version_contract() from anon;
revoke all on function public.enforce_art_current_version_contract() from authenticated;

do $$
begin
  if exists (
    select 1
    from public.arts as art
    left join public.art_versions as version
      on version.id = art.current_version_id
     and version.art_id = art.id
     and version.owner_id = art.owner_id
    where art.current_version_id is not null
      and version.id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'existing current-version ownership mismatch must be audited before this migration';
  end if;
end;
$$;

drop trigger if exists arts_enforce_current_version_contract on public.arts;

create trigger arts_enforce_current_version_contract
before insert or update of current_version_id, owner_id
on public.arts
for each row
execute function public.enforce_art_current_version_contract();
