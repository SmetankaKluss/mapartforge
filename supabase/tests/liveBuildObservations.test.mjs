import assert from 'node:assert/strict';

// Fresh disposable database only. SQL, authorization and merge are exercised without mocks.
export async function testLiveBuildObservations(db, controlSql, observationsSql) {
  await db.exec(`create schema auth; create table auth.users(id uuid primary key);
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema auth,public to service_role,anon,authenticated;
    grant select,update on auth.users to service_role;`);
  await db.exec(controlSql); await db.exec(observationsSql);
  const owner='11111111-1111-4111-8111-111111111111';
  const friend='22222222-2222-4222-8222-222222222222';
  const outsider='33333333-3333-4333-8333-333333333333';
  await db.query('insert into auth.users values($1),($2),($3)',[owner,friend,outsider]);
  await db.exec('set role service_role');
  let checks=0;
  const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
  const deny=async(fn,code)=>{await assert.rejects(fn,e=>e.code===code);checks++;};
  const rpc=async(actor,action,input,kind='observations')=>(await db.query(
    `select public.companion_live_build_${kind}($1,$2,$3::jsonb) result`,[actor,action,JSON.stringify(input)])).rows[0].result;
  const control=(actor,action,input)=>rpc(actor,action,input,'control');
  let s=await control(owner,'create',{source_sha256:'a'.repeat(64),grid_wide:2,grid_tall:1,consent:true});
  const id=s.id;
  s=await control(owner,'invite',{build_id:id,expected_revision:s.revision,invite_hash:'b'.repeat(64)});
  s=await control(friend,'join',{invite_hash:'b'.repeat(64),consent:true});
  const place={build_id:id,tile:0,consent:true,target_sha256:'c'.repeat(64),phase:-1,cell_count:4,
    world_binding:owner,dimension:'minecraft:overworld',origin_x:0,origin_y:64,origin_z:0,rotation:0,mirrored:false};
  s=await control(owner,'place',{...place,expected_revision:s.revision});
  let key={build_id:id,tile:0,page:0,placement_revision:s.placements[0].revision,
    source_sha256:'a'.repeat(64),target_sha256:place.target_sha256,phase:-1,world_binding:owner};
  const read=()=>rpc(owner,'observations',key);
  const lease=actor=>rpc(actor,'observe_begin',{build_id:id,consent:true});
  eq((await read()).states,'0000');
  await deny(()=>rpc(outsider,'observations',key),'42501');
  await deny(()=>rpc(friend,'observe_begin',{build_id:id,consent:false}),'22023');
  await deny(()=>rpc(owner,'observations',{...key,page:1}),'22023');
  for(const bad of [{placement_revision:1},{target_sha256:'d'.repeat(64)},{source_sha256:'d'.repeat(64)},{phase:1},{world_binding:friend},{tile:1}])
    await deny(()=>rpc(owner,'observations',{...key,...bad}),'40001');
  let l=await lease(friend);
  let packet={...key,lease:l.lease,sequence:1,states:'1230',offsets_ms:[0,0,0,0]};
  eq(await rpc(friend,'observe',packet),{accepted:true});
  const first=await read(); eq(first.states,'1230');
  eq(await rpc(friend,'observe',packet),{duplicate:true});
  eq((await read()).observed_ms,first.observed_ms); eq((await read()).revision,first.revision);
  await deny(()=>rpc(friend,'observe',{...packet,states:'1110'}),'40001');
  await rpc(friend,'observe',{...packet,sequence:2,states:'0000'});
  eq((await read()).observed_ms,first.observed_ms); eq((await read()).states,'1230');
  // Same-time conflicting evidence chooses the conservative wrong/missing status.
  await rpc(friend,'observe',{...packet,sequence:3,states:'3210'});
  eq((await read()).states,'3230');
  await deny(()=>rpc(friend,'observe',packet),'40001');
  for(const bad of [{states:'1'},{states:'9999'},{offsets_ms:[0]},{offsets_ms:[0.5,0,0,0]},
    {offsets_ms:[30001,0,0,0]},{offsets_ms:[30000,0,0,0]},{offsets_ms:[-120000,0,0,0]}])
    await deny(()=>rpc(friend,'observe',{...packet,sequence:4,...bad}),'22023');
  l=await lease(friend);
  await deny(()=>rpc(friend,'observe',{...packet,sequence:4}),'40001');
  packet={...packet,lease:l.lease,sequence:1,states:'1110'};
  await rpc(friend,'observe',packet); eq((await read()).states,'1110');
  s=await control(owner,'read',{build_id:id});
  s=await control(owner,'remove_member',{build_id:id,expected_revision:s.revision,member_id:friend});
  eq((await read()).states,'0000');
  await deny(()=>rpc(friend,'observe',packet),'42501');
  s=await control(owner,'invite',{build_id:id,expected_revision:s.revision,invite_hash:'e'.repeat(64)});
  s=await control(friend,'join',{invite_hash:'e'.repeat(64),consent:true});
  eq((await read()).states,'0000');
  await deny(()=>rpc(friend,'observe',packet),'40001');
  l=await lease(owner); packet={...key,lease:l.lease,sequence:1,states:'1231',offsets_ms:[0,0,0,0]};
  await rpc(owner,'observe',packet);
  // Controlled clock fixture avoids a two-minute sleep and does not touch real data.
  await db.exec(`update public.companion_live_builds set consent_at=consent_at-interval '1 day';
    update public.companion_live_build_pages set observed_ms=array(select x-121000 from unnest(observed_ms) x);`);
  eq((await read()).states,'4444');
  await db.exec(`update public.companion_live_build_leases set issued_at=issued_at-interval '31 seconds'`);
  await deny(()=>rpc(owner,'observe',{...packet,sequence:2}),'40001');
  s=await control(owner,'place',{...place,origin_x:20,expected_revision:s.revision});
  await deny(()=>read(),'40001');
  key={...key,placement_revision:s.placements[0].revision};
  eq((await read()).states,'0000');
  eq((await db.query('select count(*)::integer n from public.companion_live_build_pages')).rows[0].n,0);
  for(const role of ['anon','authenticated']) {
    await db.exec(`reset role; set role ${role}`);
    await deny(()=>read(),'42501');
    for(const table of ['companion_live_build_pages','companion_live_build_leases'])
      await deny(()=>db.query(`select * from public.${table}`),'42501');
  }
  await db.exec('reset role; set role service_role');
  // Maximum page and the exact tail are accepted, not silently truncated.
  s=await control(owner,'place',{...place,cell_count:4097,expected_revision:s.revision});
  key={...key,placement_revision:s.placements[0].revision};
  l=await lease(owner);
  await rpc(owner,'observe',{...key,lease:l.lease,sequence:1,states:'1'.repeat(4096),offsets_ms:Array(4096).fill(0)});
  eq((await read()).states.length,4096);
  eq((await read()).states,'1'.repeat(4096));
  eq((await rpc(owner,'observations',{...key,page:1})).states,'0');
  await deny(()=>rpc(owner,'observe',{...key,page:1,lease:l.lease,sequence:2,states:'11',offsets_ms:[0,0]}),'22023');
  // Different cells age independently; arrival sequence is not observation time.
  await db.exec(`update public.companion_live_build_leases set issued_at=clock_timestamp()-interval '2 seconds'`);
  const tail={...key,page:1,lease:l.lease,sequence:2,states:'2',offsets_ms:[1000]};
  await rpc(owner,'observe',tail);
  eq((await rpc(owner,'observations',{...key,page:1})).states,'2');
  await rpc(owner,'observe',{...tail,sequence:3,states:'1',offsets_ms:[500]});
  eq((await rpc(owner,'observations',{...key,page:1})).states,'2');
  await rpc(owner,'observe',{...tail,sequence:4,states:'1',offsets_ms:[1500]});
  eq((await rpc(owner,'observations',{...key,page:1})).states,'1');
  eq((await read()).states,'1'.repeat(4096));
  return checks;
}
