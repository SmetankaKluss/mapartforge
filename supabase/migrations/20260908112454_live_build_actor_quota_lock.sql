-- Auth is validated by Edge; the owner FK validates existence without granting Auth table access.
-- Serialize per-owner quota checks without requiring SELECT/UPDATE on managed auth.users.
create or replace function public.companion_live_build_control(p_actor uuid, p_action text, p_input jsonb)
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
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('mapkluss-live-build-owner:' || p_actor::text, 0));
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
