create table public.companion_tracker_web (
  session_id uuid primary key references public.build_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  publisher uuid not null,
  lease uuid not null default gen_random_uuid(),
  sequence bigint not null default 0,
  snapshot jsonb,
  group_id uuid references public.companion_live_builds(id) on delete set null,
  group_revision bigint,
  updated_at timestamptz not null default clock_timestamp(),
  fresh_until timestamptz not null default clock_timestamp(),
  check(snapshot is null or octet_length(snapshot::text) <= 4600000)
);
create index companion_tracker_web_owner on public.companion_tracker_web(owner_id);
alter table public.companion_tracker_web enable row level security;
revoke all on public.companion_tracker_web from public,anon,authenticated;
grant select,insert,update,delete on public.companion_tracker_web to service_role;

create function public.companion_tracker_web_control(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  s public.build_sessions%rowtype;
  w public.companion_tracker_web%rowtype;
  owner uuid;
  g public.companion_live_builds%rowtype;
  sid uuid;
  at timestamptz := clock_timestamp();
  fresh boolean;
  participant_count integer := 1;
begin
  if p_actor is null then raise exception using errcode='42501',message='access denied'; end if;
  if p_action not in ('web_begin','web_read','web_publish','web_stop') then raise exception using errcode='22023',message='invalid action'; end if;
  if p_action='web_begin' then
    select b.* into s from public.build_sessions b
      where b.art_id=(p_input->>'art_id')::uuid and b.art_version_id=(p_input->>'art_version_id')::uuid;
  else
    select * into s from public.build_sessions where id=(p_input->>'session_id')::uuid;
  end if;
  if s.id is null or s.art_id is null then raise exception using errcode='42501',message='access denied'; end if;
  sid:=s.id;
  select owner_id into owner from public.arts where id=s.art_id;
  if owner is null then raise exception using errcode='42501',message='access denied'; end if;
  -- Serialize publisher replacement and writes without touching managed Auth tables.
  perform pg_advisory_xact_lock(hashtextextended('tracker-web:'||sid::text,0));
  select * into w from public.companion_tracker_web where session_id=sid for update;
  if p_action='web_read' then
    if w.group_id is not null then
      select * into g from public.companion_live_builds where id=w.group_id for share;
    end if;
    if owner<>p_actor and not (g.id is not null and g.status='active' and g.expires_at>at
      and exists(select 1 from public.companion_live_build_members where build_id=g.id and user_id=p_actor)) then
      raise exception using errcode='42501',message='access denied';
    end if;
    if w.session_id is null then return jsonb_build_object('available',false); end if;
    fresh:=w.snapshot is not null and w.fresh_until>at and (w.group_id is null or
      (g.status='active' and g.expires_at>at and g.revision=w.group_revision));
    if g.id is not null and g.status='active' and g.expires_at>at then
      select count(*)+1 into participant_count from public.companion_live_build_members where build_id=g.id;
    end if;
    return jsonb_build_object('available',w.snapshot is not null,'fresh',fresh,'publisher',w.publisher,
      'sequence',w.sequence,'updated_at',w.updated_at,'fresh_for_ms',greatest(0,extract(epoch from(w.fresh_until-at))*1000)::integer,
      'participants',participant_count,'grid',s.map_grid,'invalidated',(g.id is not null and g.revision<>w.group_revision),
      'snapshot',case when (g.id is not null and g.revision<>w.group_revision) then null
        when p_input->>'publisher'=w.publisher::text and coalesce((p_input->>'sequence')::bigint,-1)=w.sequence then null else w.snapshot end,
      'session',jsonb_build_object('id',s.id,'created_at',s.created_at,'map_grid',s.map_grid,
        'image_preview',s.image_preview,'materials',s.materials,'gathered',s.gathered,'placed',s.placed,
        'mode',s.mode,'info',jsonb_build_object('title',s.info->>'title')));
  end if;
  if owner<>p_actor then raise exception using errcode='42501',message='access denied'; end if;
  if p_action='web_begin' then
    if coalesce(p_input->>'source_sha256','') !~ '^[a-f0-9]{64}$' or p_input->>'publisher' is null then raise exception using errcode='22023',message='invalid source'; end if;
    perform pg_advisory_xact_lock(hashtextextended('tracker-web-owner:'||owner::text,0));
    -- At most five fresh publishers; old snapshots are bounded by the owner's Cloud art quota.
    if w.session_id is null and (select count(*) from public.companion_tracker_web where owner_id=owner and fresh_until>at)>=5 then
      raise exception using errcode='54000',message='publisher limit'; end if;
    insert into public.companion_tracker_web(session_id,owner_id,source_sha256,publisher)
      values(sid,owner,p_input->>'source_sha256',(p_input->>'publisher')::uuid)
      on conflict(session_id) do update set source_sha256=excluded.source_sha256,publisher=excluded.publisher,
        lease=gen_random_uuid(),sequence=0,snapshot=null,group_id=null,group_revision=null,updated_at=at,fresh_until=at
      returning * into w;
    return jsonb_build_object('session_id',sid,'lease',w.lease);
  end if;
  if w.session_id is null or w.lease is distinct from (p_input->>'lease')::uuid or w.publisher is distinct from (p_input->>'publisher')::uuid
    or w.source_sha256 is distinct from p_input->>'source_sha256' then raise exception using errcode='40001',message='publisher changed'; end if;
  if p_action='web_stop' then
    update public.companion_tracker_web set fresh_until=at where session_id=sid;
    return jsonb_build_object('ok',true);
  end if;
  if p_action<>'web_publish' then raise exception using errcode='22023',message='invalid action'; end if;
  if p_input->>'sequence' is null or (p_input->>'sequence')::bigint<=w.sequence then raise exception using errcode='40001',message='old sequence'; end if;
  if p_input->>'group_id' is not null then
    select * into g from public.companion_live_builds where id=(p_input->>'group_id')::uuid for share;
    if g.id is null or g.owner_id<>owner or g.status<>'active' or g.expires_at<=at or g.source_sha256<>w.source_sha256
      or g.revision is distinct from (p_input->>'group_revision')::bigint then raise exception using errcode='40001',message='group changed'; end if;
  end if;
  if p_input->>'age_ms' is null or (p_input->>'age_ms')::integer not between 0 and 10000 or jsonb_typeof(p_input->'snapshot') is distinct from 'object' then
    raise exception using errcode='22023',message='invalid snapshot'; end if;
  update public.companion_tracker_web set snapshot=p_input->'snapshot',sequence=(p_input->>'sequence')::bigint,
    group_id=g.id,group_revision=g.revision,updated_at=at,
    fresh_until=at+make_interval(secs=>greatest(0,15-(p_input->>'age_ms')::double precision/1000)) where session_id=sid;
  return jsonb_build_object('ok',true,'session_id',sid);
end $$;
revoke all on function public.companion_tracker_web_control(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.companion_tracker_web_control(uuid,text,jsonb) to service_role;
