alter table public.companion_live_build_leases
  add column batch_nonce uuid,
  add column batch_sequence bigint,
  add column batch_hash text;

-- Compact pages retain the existing per-cell merge and authorization contract.
create function public.companion_live_build_batch(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  l public.companion_live_build_leases%rowtype;
  item jsonb;
  request jsonb;
  result jsonb;
  output jsonb:='[]'::jsonb;
  payload bytea;
  states text;
  offsets jsonb;
  packed text;
  count_pages integer;
  ordinal integer:=0;
  sequence_number bigint;
  digest text;
  allowed text[];
  server_ms bigint;
begin
  allowed:=case p_action when 'observe_batch' then array['build_id','lease','sequence','pages']
    when 'observations_batch' then array['build_id','pages'] else null end;
  if allowed is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>393216 then
    raise exception using errcode='22023',message='invalid_observation_batch';
  end if;
  if exists(select 1 from jsonb_object_keys(p_input) k where not(k=any(allowed)))
    or jsonb_typeof(p_input->'pages') is distinct from 'array' then
    raise exception using errcode='22023',message='invalid_observation_batch';
  end if;
  count_pages:=jsonb_array_length(p_input->'pages');
  if count_pages not between 1 and 32 then
    raise exception using errcode='22023',message='invalid_observation_batch';
  end if;
  -- Lock the same session first, including read, to serialize revoke/unplace with the entire batch.
  perform public.companion_live_build_control(p_actor,'read',jsonb_build_object('build_id',p_input->'build_id'));
  if exists(select 1 from jsonb_array_elements(p_input->'pages') p
    group by p->>'tile',p->>'page' having count(*)>1) then
    raise exception using errcode='22023',message='duplicate_observation_page';
  end if;
  if p_action='observe_batch' then
    select * into l from public.companion_live_build_leases
      where build_id=(p_input->>'build_id')::uuid and user_id=p_actor;
    if not found or l.nonce is distinct from (p_input->>'lease')::uuid
      or clock_timestamp()>l.issued_at+interval '30 seconds' then
      raise exception using errcode='40001',message='observation_lease_expired';
    end if;
    -- Rejoin invalidates the old lease even when its nonce is replayed.
    if exists(select 1 from public.companion_live_build_members m where m.build_id=l.build_id
      and m.user_id=p_actor and m.consent_at>l.issued_at) then
      raise exception using errcode='40001',message='observation_lease_expired';
    end if;
    sequence_number:=(p_input->>'sequence')::bigint;
    digest:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
    if l.batch_nonce=l.nonce and sequence_number=l.batch_sequence and digest=l.batch_hash then
      return jsonb_build_object('duplicate',true);
    end if;
    if sequence_number is null or sequence_number not between 1 and 67108862
      or (l.batch_nonce=l.nonce and sequence_number<=l.batch_sequence) then
      raise exception using errcode='40001',message='observation_sequence_conflict';
    end if;
  end if;
  for item in select value from jsonb_array_elements(p_input->'pages') loop
    ordinal:=ordinal+1;
    if jsonb_typeof(item) is distinct from 'object' or item ? 'build_id' or item ? 'lease'
      or item ? 'sequence' or item ? 'states' or item ? 'offsets_ms' then
      raise exception using errcode='22023',message='invalid_observation_page';
    end if;
    request:=item || jsonb_build_object('build_id',p_input->'build_id');
    if p_action='observe_batch' then
      if jsonb_typeof(item->'packed') is distinct from 'string' or length(item->>'packed')>10924
        or item->>'packed' !~ '^[A-Za-z0-9+/]+={0,2}$' then
        raise exception using errcode='22023',message='invalid_observation_encoding';
      end if;
      payload:=decode(item->>'packed','base64');
      if length(payload) not between 2 and 8192 or length(payload)%2<>0
        or replace(encode(payload,'base64'),E'\n','')<>item->>'packed' then
        raise exception using errcode='22023',message='invalid_observation_encoding';
      end if;
      if exists(select 1 from generate_series(0,length(payload)/2-1) i
        cross join lateral (select get_byte(payload,i*2)*256+get_byte(payload,i*2+1) w) v
        where (w & 7)>3 or (w >> 3)>1500) then
        raise exception using errcode='22023',message='invalid_observation_encoding';
      end if;
      select string_agg((w & 7)::text,'' order by i),jsonb_agg(((w >> 3)-1200)*100 order by i)
        into states,offsets from generate_series(0,length(payload)/2-1) i
        cross join lateral (select get_byte(payload,i*2)*256+get_byte(payload,i*2+1) w) v;
      perform public.companion_live_build_observations(p_actor,'observe',(request-'packed') ||
        jsonb_build_object('lease',p_input->'lease','sequence',sequence_number*32+ordinal,'states',states,'offsets_ms',offsets));
    else
      result:=public.companion_live_build_observations(p_actor,'observations',request);
      if result->'unchanged'='true'::jsonb then
        output:=output || jsonb_build_array(item || result);
        continue;
      end if;
      states:=result->>'states';
      server_ms:=(result->>'server_ms')::bigint;
      -- Age rounds UP: receiving this representation never makes an old sample younger.
      select replace(encode(decode(string_agg(lpad(to_hex((age_units << 3) | state),4,'0'),'' order by observations.i),'hex'),'base64'),E'\n','')
        into packed from jsonb_array_elements_text(result->'observed_ms') with ordinality observations(at_ms,i)
        join unnest(string_to_array(states,null)) with ordinality st(value,i) on st.i=observations.i
        cross join lateral(select st.value::integer state) parsed
        cross join lateral(select case when state=0 then 0 else least(1201,greatest(0,
          ceil((server_ms-at_ms::bigint)/100.0)::integer)) end age_units) ag;
      output:=output || jsonb_build_array(item || jsonb_build_object('packed',packed,
        'revision',result->'revision','membership_revision',result->'membership_revision','server_ms',result->'server_ms'));
    end if;
  end loop;
  if p_action='observe_batch' then
    update public.companion_live_build_leases set batch_nonce=l.nonce,batch_sequence=sequence_number,batch_hash=digest
      where build_id=l.build_id and user_id=p_actor;
    return jsonb_build_object('accepted',true,'pages',count_pages);
  end if;
  return jsonb_build_object('pages',output);
end $$;
revoke all on function public.companion_live_build_batch(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.companion_live_build_batch(uuid,text,jsonb) to service_role;
