create or replace function public.enforce_art_artifact_ownership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.arts as art
    join public.art_versions as version
      on version.id = new.version_id
     and version.art_id = art.id
     and version.owner_id = art.owner_id
    where art.id = new.art_id
      and art.owner_id = new.owner_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'artifact owner, art, and version must belong to the same account';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_art_artifact_ownership() from public;
revoke all on function public.enforce_art_artifact_ownership() from anon;
revoke all on function public.enforce_art_artifact_ownership() from authenticated;

do $$
begin
  if exists (
    select 1
    from public.art_artifacts as artifact
    left join public.arts as art
      on art.id = artifact.art_id
     and art.owner_id = artifact.owner_id
    left join public.art_versions as version
      on version.id = artifact.version_id
     and version.art_id = artifact.art_id
     and version.owner_id = artifact.owner_id
    where art.id is null or version.id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'existing artifact ownership mismatch must be audited before this migration';
  end if;
end;
$$;

drop trigger if exists art_artifacts_enforce_ownership on public.art_artifacts;

create trigger art_artifacts_enforce_ownership
before insert or update of art_id, version_id, owner_id
on public.art_artifacts
for each row
execute function public.enforce_art_artifact_ownership();
