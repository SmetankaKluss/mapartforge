-- Source bytes live in private object storage, never in PostgreSQL or public artifacts.
create table public.companion_live_build_sources (
  build_id uuid primary key references public.companion_live_builds(id) on delete cascade,
  kind text not null check (kind in ('litematic','two_layer_zip')),
  size_bytes integer not null check (size_bytes between 1 and 134217728),
  part_sha256 jsonb not null check (jsonb_typeof(part_sha256)='array' and jsonb_array_length(part_sha256) between 1 and 64),
  ready boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.companion_live_build_sources enable row level security;
revoke all on public.companion_live_build_sources from public,anon,authenticated;
grant select,insert,update,delete on public.companion_live_build_sources to service_role;

create function public.companion_live_build_source(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  g jsonb;
  s public.companion_live_build_sources%rowtype;
  n integer;
  size_value integer;
  allowed text[];
begin
  if p_actor is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>8192 then
    raise exception using errcode='22023',message='invalid_source_request';
  end if;
  allowed:=case p_action
    when 'source_begin' then array['build_id','kind','size_bytes','part_sha256','consent']
    when 'source_read' then array['build_id']
    when 'source_part_read' then array['build_id','part']
    when 'source_part_write' then array['build_id','part']
    when 'source_commit' then array['build_id']
    else null end;
  if allowed is null or exists(select 1 from jsonb_object_keys(p_input) k where not(k=any(allowed))) then
    raise exception using errcode='22023',message='invalid_source_request';
  end if;
  -- The existing control RPC checks expiry/membership and holds the group row lock.
  g:=public.companion_live_build_control(p_actor,'read',jsonb_build_object('build_id',p_input->>'build_id'));
  if p_action in ('source_begin','source_part_write','source_commit') and g->>'role'<>'owner' then
    raise exception using errcode='42501',message='source_owner_required';
  end if;
  select * into s from public.companion_live_build_sources where build_id=(g->>'id')::uuid;
  if p_action='source_begin' then
    size_value:=(p_input->>'size_bytes')::integer;
    if p_input->'consent' is distinct from 'true'::jsonb
      or p_input->>'kind' is null or p_input->>'kind' not in ('litematic','two_layer_zip')
      or size_value is null or size_value<1 or size_value>(case when p_input->>'kind'='litematic' then 16777216 else 134217728 end)
      or jsonb_typeof(p_input->'part_sha256') is distinct from 'array' then
      raise exception using errcode='22023',message='invalid_source_manifest';
    end if;
    if jsonb_array_length(p_input->'part_sha256')<>(size_value+2097151)/2097152
      or exists(select 1 from jsonb_array_elements(p_input->'part_sha256') h where jsonb_typeof(h)<>'string' or h#>>'{}' !~ '^[a-f0-9]{64}$') then
      raise exception using errcode='22023',message='invalid_source_parts';
    end if;
    if s.build_id is not null then
      if s.kind<>p_input->>'kind' or s.size_bytes<>size_value or s.part_sha256<>p_input->'part_sha256' then
        raise exception using errcode='40001',message='source_manifest_immutable';
      end if;
    else
      insert into public.companion_live_build_sources(build_id,kind,size_bytes,part_sha256)
        values((g->>'id')::uuid,p_input->>'kind',size_value,p_input->'part_sha256') returning * into s;
    end if;
  end if;
  if s.build_id is null then return jsonb_build_object('available',false); end if;
  if p_action in ('source_part_read','source_read') and not s.ready and g->>'role'<>'owner' then
    return jsonb_build_object('available',false);
  end if;
  if p_action in ('source_part_write','source_part_read') then
    n:=(p_input->>'part')::integer;
    if n is null or n<0 or n>=jsonb_array_length(s.part_sha256) then
      raise exception using errcode='22023',message='invalid_source_part';
    end if;
    if p_action='source_part_write' and s.ready then
      raise exception using errcode='40001',message='source_already_ready';
    end if;
    return jsonb_build_object('available',true,'build_id',s.build_id,'source_sha256',g->>'source_sha256',
      'part',n,'sha256',s.part_sha256->>n,'size_bytes',least(2097152,s.size_bytes-n*2097152));
  end if;
  -- INTERNAL ONLY: Edge must verify stored bytes and whole SHA before invoking commit.
  if p_action='source_commit' then
    update public.companion_live_build_sources set ready=true where build_id=s.build_id returning * into s;
  end if;
  return (to_jsonb(s)-'created_at') || jsonb_build_object('available',true,'source_sha256',g->>'source_sha256',
    'grid_wide',g->'grid_wide','grid_tall',g->'grid_tall','part_bytes',2097152);
end;
$$;
revoke all on function public.companion_live_build_source(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.companion_live_build_source(uuid,text,jsonb) to service_role;
