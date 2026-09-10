-- Bounded shared evidence. Placement deletion/replacement invalidates all its pages.
create table public.companion_live_build_leases (
  build_id uuid not null references public.companion_live_builds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nonce uuid not null default gen_random_uuid(),
  issued_at timestamptz not null default clock_timestamp(),
  last_sequence bigint not null default 0,
  last_hash text,
  primary key(build_id,user_id)
);
create table public.companion_live_build_pages (
  build_id uuid not null,
  tile smallint not null,
  page integer not null check(page between 0 and 488),
  revision bigint not null default 1,
  states smallint[] not null,
  observed_ms bigint[] not null,
  reporters uuid[] not null,
  primary key(build_id,tile,page),
  foreign key(build_id,tile) references public.companion_live_build_placements(build_id,tile) on delete cascade,
  check(cardinality(states) between 1 and 4096),
  check(cardinality(states)=cardinality(observed_ms) and cardinality(states)=cardinality(reporters))
);
alter table public.companion_live_build_leases enable row level security;
alter table public.companion_live_build_pages enable row level security;
revoke all on public.companion_live_build_leases, public.companion_live_build_pages from public,anon,authenticated;
grant select,insert,update,delete on public.companion_live_build_leases, public.companion_live_build_pages to service_role;

create function public.companion_live_build_observations(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  s public.companion_live_builds%rowtype;
  t public.companion_live_build_placements%rowtype;
  l public.companion_live_build_leases%rowtype;
  pg public.companion_live_build_pages%rowtype;
  allowed text[];
  consent timestamptz;
  now_ms bigint;
  base_ms bigint;
  page_index integer;
  n integer;
  seq bigint;
  digest text;
  incoming smallint[];
  times bigint[];
  merged_states smallint[];
  merged_times bigint[];
  merged_reporters uuid[];
  result jsonb;
  state_text text;
begin
  if p_actor is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>65536 then
    raise exception using errcode='22023',message='invalid_observation_request';
  end if;
  allowed:=case p_action
    when 'observe_begin' then array['build_id','consent']
    when 'observations' then array['build_id','tile','page','placement_revision','source_sha256','target_sha256','phase','world_binding','known_revision','membership_revision']
    when 'observe' then array['build_id','tile','page','placement_revision','source_sha256','target_sha256','phase','world_binding','lease','sequence','states','offsets_ms']
    else null end;
  if allowed is null or exists(select 1 from jsonb_object_keys(p_input) k where not(k=any(allowed))) then
    raise exception using errcode='22023',message='invalid_observation_request';
  end if;
  -- Same lock order as lifecycle RPC: revocation cannot race an accepted write.
  select * into s from public.companion_live_builds where id=(p_input->>'build_id')::uuid for update;
  if not found or s.status<>'active' or s.expires_at<=clock_timestamp() then
    raise exception using errcode='42501',message='build_access_denied';
  end if;
  if s.owner_id=p_actor then consent:=s.consent_at;
  else select consent_at into consent from public.companion_live_build_members where build_id=s.id and user_id=p_actor;
  end if;
  if consent is null then raise exception using errcode='42501',message='build_access_denied'; end if;
  now_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  if p_action='observe_begin' then
    if p_input->'consent' is distinct from 'true'::jsonb then
      raise exception using errcode='22023',message='sharing_consent_required';
    end if;
    insert into public.companion_live_build_leases(build_id,user_id) values(s.id,p_actor)
      on conflict(build_id,user_id) do update set nonce=gen_random_uuid(),issued_at=clock_timestamp(),last_sequence=0,last_hash=null
      returning * into l;
    return jsonb_build_object('lease',l.nonce,'issued_ms',floor(extract(epoch from l.issued_at)*1000)::bigint,'valid_ms',30000);
  end if;
  select * into t from public.companion_live_build_placements where build_id=s.id and tile=(p_input->>'tile')::integer;
  if not found or (p_input->>'placement_revision')::bigint is distinct from t.revision
    or p_input->>'source_sha256' is distinct from s.source_sha256
    or p_input->>'target_sha256' is distinct from t.target_sha256
    or (p_input->>'phase')::integer is distinct from t.phase
    or (p_input->>'world_binding')::uuid is distinct from t.world_binding then
    raise exception using errcode='40001',message='placement_conflict';
  end if;
  page_index:=(p_input->>'page')::integer;
  if page_index is null or page_index<0 or page_index>(t.cell_count-1)/4096 then
    raise exception using errcode='22023',message='invalid_observation_page';
  end if;
  n:=least(4096,t.cell_count-page_index*4096);
  select * into pg from public.companion_live_build_pages where build_id=s.id and tile=t.tile and page=page_index;
  if not found then
    pg.states:=array_fill(0::smallint,array[n]); pg.observed_ms:=array_fill(0::bigint,array[n]);
    pg.reporters:=array_fill(null::uuid,array[n]); pg.revision:=0;
  end if;
  if p_action='observations' then
    if (p_input->>'known_revision')::bigint=pg.revision and (p_input->>'membership_revision')::bigint=s.revision then
      return jsonb_build_object('unchanged',true,'revision',pg.revision,'membership_revision',s.revision,'server_ms',now_ms);
    end if;
    -- No reporter identity is returned. Revoked/rejoined reporters cannot revive old evidence.
    select jsonb_build_object('states',string_agg(case
      when cell.state=0 or eligible.since is null or cell.at_ms<eligible.since then '0'
      when now_ms-cell.at_ms>120000 then '4' else cell.state::text end,'' order by i),
      'observed_ms',jsonb_agg(case when eligible.since is null or cell.at_ms<eligible.since then 0 else cell.at_ms end order by i),
      'revision',pg.revision,'membership_revision',s.revision,'server_ms',now_ms) into result
    from unnest(pg.states,pg.observed_ms,pg.reporters) with ordinality cell(state,at_ms,reporter,i)
    left join public.companion_live_build_members m on m.build_id=s.id and m.user_id=cell.reporter
    cross join lateral (select ceil(extract(epoch from case when cell.reporter=s.owner_id then s.consent_at else m.consent_at end)*1000)::bigint since) eligible;
    return result;
  end if;
  select * into l from public.companion_live_build_leases where build_id=s.id and user_id=p_actor;
  if not found or (p_input->>'lease')::uuid is distinct from l.nonce or l.issued_at<consent
    or clock_timestamp()>l.issued_at+interval '30 seconds' then
    raise exception using errcode='40001',message='observation_lease_expired';
  end if;
  seq:=(p_input->>'sequence')::bigint;
  digest:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  if seq=l.last_sequence and digest=l.last_hash then return jsonb_build_object('duplicate',true); end if;
  if seq is null or seq<=l.last_sequence or seq>2147483647 then
    raise exception using errcode='40001',message='observation_sequence_conflict';
  end if;
  if jsonb_typeof(p_input->'states') is distinct from 'string' or length(p_input->>'states')<>n
    or p_input->>'states' !~ '^[0-3]+$' or jsonb_typeof(p_input->'offsets_ms') is distinct from 'array' then
    raise exception using errcode='22023',message='invalid_observation_data';
  end if;
  if jsonb_array_length(p_input->'offsets_ms')<>n or exists(select 1 from jsonb_array_elements(p_input->'offsets_ms') v
      where jsonb_typeof(v)<>'number' or v::text !~ '^-?[0-9]+$' or (v::text)::numeric not between -120000 and 30000) then
    raise exception using errcode='22023',message='invalid_observation_time';
  end if;
  base_ms:=floor(extract(epoch from l.issued_at)*1000)::bigint;
  state_text:=p_input->>'states';
  select array_agg(st.value::smallint order by offsets.i),
    array_agg(base_ms+v::integer order by offsets.i)
    into incoming,times from jsonb_array_elements_text(p_input->'offsets_ms') with ordinality offsets(v,i)
    join unnest(string_to_array(state_text,null)) with ordinality st(value,i) on st.i=offsets.i;
  if exists(select 1 from generate_series(1,n) i where incoming[i]<>0 and
    (times[i]>now_ms or times[i]<ceil(extract(epoch from consent)*1000)::bigint or now_ms-times[i]>120000)) then
    raise exception using errcode='22023',message='invalid_observation_time';
  end if;
  -- Set-based merge, not repeated array writes. Unknown never erases or refreshes evidence.
  select array_agg(case when take_new then cell.new_state else cell.old_state end order by i),
    array_agg(case when take_new then cell.new_ms else cell.old_ms end order by i),
    array_agg(case when take_new then p_actor else cell.reporter end order by i)
    into merged_states,merged_times,merged_reporters
  from unnest(incoming,times,pg.states,pg.observed_ms,pg.reporters) with ordinality cell(new_state,new_ms,old_state,old_ms,reporter,i)
  left join public.companion_live_build_members m on m.build_id=s.id and m.user_id=cell.reporter
  cross join lateral (select ceil(extract(epoch from case when cell.reporter=s.owner_id then s.consent_at else m.consent_at end)*1000)::bigint since) eligible
  cross join lateral (
    select cell.new_state<>0 and (eligible.since is null or cell.old_ms<eligible.since or
      cell.new_ms>cell.old_ms or (cell.new_ms=cell.old_ms and cell.new_state>cell.old_state)) take_new
  ) choice;
  if merged_states is distinct from pg.states or merged_times is distinct from pg.observed_ms or merged_reporters is distinct from pg.reporters then
    insert into public.companion_live_build_pages(build_id,tile,page,revision,states,observed_ms,reporters)
      values(s.id,t.tile,page_index,pg.revision+1,merged_states,merged_times,merged_reporters)
      on conflict(build_id,tile,page) do update set revision=excluded.revision,states=excluded.states,
        observed_ms=excluded.observed_ms,reporters=excluded.reporters;
  end if;
  update public.companion_live_build_leases set last_sequence=seq,last_hash=digest where build_id=s.id and user_id=p_actor;
  return jsonb_build_object('accepted',true);
end $$;
revoke all on function public.companion_live_build_observations(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.companion_live_build_observations(uuid,text,jsonb) to service_role;
