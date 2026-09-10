-- Private build collaboration uses existing Auth identities, never legacy link-readable build_sessions.
create table public.companion_live_builds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  grid_wide smallint not null check (grid_wide between 1 and 10),
  grid_tall smallint not null check (grid_tall between 1 and 10),
  status text not null default 'active' check (status in ('active','closed')),
  revision bigint not null default 1 check (revision > 0),
  invite_hash text unique check (invite_hash ~ '^[a-f0-9]{64}$'),
  invite_expires_at timestamptz,
  consent_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  check ((invite_hash is null) = (invite_expires_at is null))
);
create index companion_live_builds_owner on public.companion_live_builds(owner_id, status);
create index companion_live_builds_expiry on public.companion_live_builds(expires_at);

create table public.companion_live_build_members (
  build_id uuid not null references public.companion_live_builds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_at timestamptz not null default clock_timestamp(),
  primary key(build_id,user_id)
);
create index companion_live_build_members_user on public.companion_live_build_members(user_id,build_id);

create table public.companion_live_build_placements (
  build_id uuid not null references public.companion_live_builds(id) on delete cascade,
  tile smallint not null check (tile between 0 and 99),
  revision bigint not null check (revision > 0),
  target_sha256 text not null check (target_sha256 ~ '^[a-f0-9]{64}$'),
  phase integer not null check (phase between -1 and 4095),
  cell_count integer not null check (cell_count between 1 and 2000000),
  -- Opaque group-local binding; server address/name and local world hash never leave the client.
  world_binding uuid not null,
  dimension text not null check (length(dimension) <= 128 and dimension ~ '^[a-z0-9_.-]+:[a-z0-9_./-]+$'),
  origin_x integer not null check (origin_x between -30000000 and 30000000),
  origin_y integer not null check (origin_y between -2048 and 2048),
  origin_z integer not null check (origin_z between -30000000 and 30000000),
  rotation smallint not null check (rotation between 0 and 3),
  mirrored boolean not null,
  shared_at timestamptz not null default clock_timestamp(),
  primary key(build_id,tile)
);

alter table public.companion_live_builds enable row level security;
alter table public.companion_live_build_members enable row level security;
alter table public.companion_live_build_placements enable row level security;
revoke all on public.companion_live_builds, public.companion_live_build_members,
  public.companion_live_build_placements from public,anon,authenticated;
grant select,insert,update,delete on public.companion_live_builds, public.companion_live_build_members,
  public.companion_live_build_placements to service_role;

-- Service-only RPC. The Edge adapter MUST derive p_actor from validated JWT/device credentials.
-- Session row locks serialize membership changes with mutations and revision checks.
create function public.companion_live_build_control(p_actor uuid, p_action text, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s public.companion_live_builds%rowtype;
  member boolean;
  tile_index integer;
  cells integer;
  allowed text[];
  now_at timestamptz := clock_timestamp();
begin
  if p_actor is null or p_action is null or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text) > 4096 then
    raise exception using errcode='22023', message='invalid_build_request';
  end if;
  allowed := case p_action
    when 'create' then array['source_sha256','grid_wide','grid_tall','consent']
    when 'join' then array['invite_hash','consent']
    when 'read' then array['build_id']
    when 'invite' then array['build_id','expected_revision','invite_hash']
    when 'remove_member' then array['build_id','expected_revision','member_id']
    when 'leave' then array['build_id']
    when 'close' then array['build_id','expected_revision']
    when 'unplace' then array['build_id','expected_revision','tile']
    when 'place' then array['build_id','expected_revision','tile','consent','target_sha256','phase',
      'cell_count','world_binding','dimension','origin_x','origin_y','origin_z','rotation','mirrored']
    else null end;
  if allowed is null or exists(select 1 from jsonb_object_keys(p_input) k where not(k=any(allowed))) then
    raise exception using errcode='22023', message='invalid_build_request';
  end if;
  if p_action in ('create','join','place') and p_input->'consent' is distinct from 'true'::jsonb then
    raise exception using errcode='22023', message='sharing_consent_required';
  end if;
  if p_action='create' then
    -- Serializes quota checks for simultaneous creates by the same validated owner.
    perform 1 from auth.users where id=p_actor for update;
    if not found then raise exception using errcode='42501',message='build_access_denied'; end if;
    if (select count(*) from public.companion_live_builds where owner_id=p_actor)>=20
      or (select count(*) from public.companion_live_builds where owner_id=p_actor
        and status='active' and expires_at>now_at)>=5 then
      raise exception using errcode='54000',message='build_quota';
    end if;
    insert into public.companion_live_builds(owner_id,source_sha256,grid_wide,grid_tall)
      values(p_actor,p_input->>'source_sha256',(p_input->>'grid_wide')::smallint,(p_input->>'grid_tall')::smallint)
      returning * into s;
  elsif p_action='join' then
    select * into s from public.companion_live_builds where invite_hash=p_input->>'invite_hash'
      and invite_expires_at>now_at and status='active' and expires_at>now_at for update;
    if not found then raise exception using errcode='42501',message='build_access_denied'; end if;
    if p_actor<>s.owner_id and not exists(select 1 from public.companion_live_build_members
        where build_id=s.id and user_id=p_actor) then
      if (select count(*) from public.companion_live_build_members where build_id=s.id)>=19 then
        raise exception using errcode='54000',message='build_member_quota';
      end if;
      insert into public.companion_live_build_members(build_id,user_id) values(s.id,p_actor);
      update public.companion_live_builds set revision=revision+1 where id=s.id returning * into s;
    end if;
  else
    select * into s from public.companion_live_builds where id=(p_input->>'build_id')::uuid
      and status='active' and expires_at>now_at for update;
    if not found then raise exception using errcode='42501',message='build_access_denied'; end if;
    member := p_actor=s.owner_id or exists(select 1 from public.companion_live_build_members
      where build_id=s.id and user_id=p_actor);
    if not member then raise exception using errcode='42501',message='build_access_denied'; end if;
    if p_action='leave' then
      if p_actor=s.owner_id then raise exception using errcode='22023',message='owner_must_close'; end if;
      delete from public.companion_live_build_members where build_id=s.id and user_id=p_actor;
      update public.companion_live_builds set revision=revision+1 where id=s.id;
      return jsonb_build_object('left',true);
    end if;
    if p_action<>'read' then
      if p_actor<>s.owner_id then raise exception using errcode='42501',message='build_access_denied'; end if;
      if (p_input->>'expected_revision')::bigint is distinct from s.revision then
        raise exception using errcode='40001',message='build_revision_conflict';
      end if;
      if p_action='invite' then
        if p_input->>'invite_hash' is null or p_input->>'invite_hash' !~ '^[a-f0-9]{64}$' then
          raise exception using errcode='22023',message='invalid_build_invite';
        end if;
        update public.companion_live_builds set invite_hash=p_input->>'invite_hash',
          invite_expires_at=now_at+interval '24 hours' where id=s.id;
      elsif p_action='remove_member' then
        if (p_input->>'member_id')::uuid is null or not exists(
            select 1 from public.companion_live_build_members
            where build_id=s.id and user_id=(p_input->>'member_id')::uuid) then
          raise exception using errcode='22023',message='invalid_build_member';
        end if;
        delete from public.companion_live_build_members where build_id=s.id and user_id=(p_input->>'member_id')::uuid;
        -- A removed member cannot reuse the old group code. Other accepted members remain.
        update public.companion_live_builds set invite_hash=null,invite_expires_at=null where id=s.id;
      elsif p_action='close' then
        update public.companion_live_builds set status='closed',invite_hash=null,invite_expires_at=null where id=s.id;
      elsif p_action in ('place','unplace') then
        tile_index := (p_input->>'tile')::integer;
        if tile_index is null or tile_index<0 or tile_index>=s.grid_wide*s.grid_tall then
          raise exception using errcode='22023',message='invalid_build_tile';
        end if;
        if p_action='place' then
          cells := (p_input->>'cell_count')::integer;
          if cells is null or cells<1 or cells>2000000 or cells+(select coalesce(sum(cell_count),0)
              from public.companion_live_build_placements where build_id=s.id and tile<>tile_index)>8000000 then
            raise exception using errcode='54000',message='build_cell_quota';
          end if;
        end if;
        delete from public.companion_live_build_placements where build_id=s.id and tile=tile_index;
        if p_action='place' then
          insert into public.companion_live_build_placements(build_id,tile,revision,target_sha256,phase,cell_count,
            world_binding,dimension,origin_x,origin_y,origin_z,rotation,mirrored)
          values(s.id,tile_index,s.revision+1,p_input->>'target_sha256',(p_input->>'phase')::integer,cells,
            (p_input->>'world_binding')::uuid,p_input->>'dimension',(p_input->>'origin_x')::integer,
            (p_input->>'origin_y')::integer,(p_input->>'origin_z')::integer,
            (p_input->>'rotation')::smallint,(p_input->>'mirrored')::boolean);
        end if;
      end if;
      update public.companion_live_builds set revision=revision+1 where id=s.id returning * into s;
    end if;
  end if;
  -- Never return the invitation hash or another actor's credentials.
  return (to_jsonb(s)-'invite_hash'-'consent_at') || jsonb_build_object(
    'role',case when s.owner_id=p_actor then 'owner' else 'member' end,
    'placements',coalesce((select jsonb_agg(to_jsonb(p) order by tile)
      from public.companion_live_build_placements p where build_id=s.id),'[]'::jsonb),
    'members',case when s.owner_id=p_actor then coalesce((select jsonb_agg(user_id order by user_id)
      from public.companion_live_build_members where build_id=s.id),'[]'::jsonb) else '[]'::jsonb end);
end;
$$;
revoke all on function public.companion_live_build_control(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.companion_live_build_control(uuid,text,jsonb) to service_role;
