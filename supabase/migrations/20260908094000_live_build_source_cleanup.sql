-- Durable per-object deletion ledger survives group/account deletion.
create table public.companion_live_build_source_cleanup (
  path text primary key,
  build_id uuid not null,
  eligible_at timestamptz not null default (clock_timestamp()+interval '10 minutes'),
  lease_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  completed_at timestamptz
);
alter table public.companion_live_build_source_cleanup enable row level security;
revoke all on public.companion_live_build_source_cleanup from public,anon,authenticated;
grant select,insert,update,delete on public.companion_live_build_source_cleanup to service_role;

create function public.companion_live_build_enqueue_source_cleanup()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.status<>'closed' then return new; end if;
  insert into public.companion_live_build_source_cleanup(path,build_id)
    select old.id::text||'/'||old.source_sha256||'/'||(h.ordinality-1)::text||'-'||(h.value#>>'{}'),old.id
    from public.companion_live_build_sources s,
      jsonb_array_elements(s.part_sha256) with ordinality h(value,ordinality)
    where s.build_id=old.id
    on conflict(path) do nothing;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.companion_live_build_enqueue_source_cleanup() from public,anon,authenticated;
create trigger companion_live_build_source_cleanup_close before update of status on public.companion_live_builds
  for each row execute function public.companion_live_build_enqueue_source_cleanup();
create trigger companion_live_build_source_cleanup_delete before delete on public.companion_live_builds
  for each row execute function public.companion_live_build_enqueue_source_cleanup();

create function public.companion_live_build_cleanup_claim(p_limit integer default 8)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare token uuid:=gen_random_uuid(); result jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>32 then raise exception using errcode='22023',message='invalid_cleanup_limit'; end if;
  -- Small expiration sweep. Closing revokes source IO before objects become eligible.
  with expired as (
    select id from public.companion_live_builds where status='active' and expires_at<=clock_timestamp()
      order by expires_at limit 20 for update skip locked
  ) update public.companion_live_builds set status='closed',invite_hash=null,invite_expires_at=null,revision=revision+1
    where id in(select id from expired);
  -- Completed tombstones prevent the deletion trigger from recreating already finished jobs.
  with retired as (
    select g.id from public.companion_live_builds g where status='closed' and expires_at<=clock_timestamp()
      and not exists(select 1 from public.companion_live_build_source_cleanup c where c.build_id=g.id and c.completed_at is null)
      order by expires_at limit 20 for update skip locked
  ) delete from public.companion_live_builds where id in(select id from retired);
  delete from public.companion_live_build_source_cleanup c where completed_at<clock_timestamp()-interval '7 days'
    and not exists(select 1 from public.companion_live_builds g where g.id=c.build_id);
  with picked as (
    select path from public.companion_live_build_source_cleanup
      where completed_at is null and eligible_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp())
      order by eligible_at,path limit p_limit for update skip locked
  ), claimed as (
    update public.companion_live_build_source_cleanup c set lease_id=token,
      lease_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1
      where c.path in(select path from picked) returning c.path
  ) select coalesce(jsonb_agg(path),'[]'::jsonb) into result from claimed;
  return jsonb_build_object('lease_id',token,'paths',result);
end;
$$;
create function public.companion_live_build_cleanup_ack(p_lease uuid,p_path text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.companion_live_build_source_cleanup set completed_at=clock_timestamp(),lease_id=null,lease_until=null
    where path=p_path and lease_id=p_lease and lease_until>clock_timestamp() and completed_at is null;
  return found;
end;
$$;
revoke all on function public.companion_live_build_cleanup_claim(integer),
  public.companion_live_build_cleanup_ack(uuid,text) from public,anon,authenticated;
grant execute on function public.companion_live_build_cleanup_claim(integer),
  public.companion_live_build_cleanup_ack(uuid,text) to service_role;
