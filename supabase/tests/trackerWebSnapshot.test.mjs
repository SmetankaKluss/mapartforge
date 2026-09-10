import assert from 'node:assert/strict';
export async function testTrackerWeb(db, groupMigration, webMigration) {
  await db.exec(`create schema auth; create table auth.users(id uuid primary key);
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public,auth to service_role;
    create table public.arts(id uuid primary key,owner_id uuid);
    create table public.build_sessions(id uuid primary key,art_id uuid,art_version_id uuid,created_at timestamptz default now(),
      map_grid jsonb,image_preview text,materials jsonb,gathered jsonb,placed jsonb,mode text,info jsonb);
    grant select on public.arts,public.build_sessions to service_role;`);
  await db.exec(groupMigration); await db.exec(webMigration);
  const owner='11111111-1111-4111-8111-111111111111', stranger='22222222-2222-4222-8222-222222222222';
  const art='33333333-3333-4333-8333-333333333333', version='44444444-4444-4444-8444-444444444444', session='55555555-5555-4555-8555-555555555555';
  const publisher='66666666-6666-4666-8666-666666666666';
  await db.query('insert into auth.users values($1),($2)',[owner,stranger]);
  await db.query('insert into arts values($1,$2)',[art,owner]);
  await db.query(`insert into build_sessions(id,art_id,art_version_id,map_grid,materials,gathered,placed,info,mode) values($1,$2,$3,'{"wide":1,"tall":1}','[]','{}','{}','{"title":"Fixture","server":"must not leak"}','building')`,[session,art,version]);
  await db.exec('set role service_role');
  const call=async(actor,action,input)=>(await db.query('select public.companion_tracker_web_control($1,$2,$3::jsonb) as value',[actor,action,JSON.stringify(input)])).rows[0].value;
  const identity={art_id:art,art_version_id:version,source_sha256:'a'.repeat(64),publisher};
  await assert.rejects(()=>call(stranger,'web_begin',identity),e=>e.code==='42501');
  const lease=await call(owner,'web_begin',identity);
  const update={...identity,...lease,age_ms:0,sequence:1,snapshot:{width:1,height:1,palette:[-16777216],pixels:'AAA=',summary:[1,1,0,0,0,0],parts:[[1,1,0,0,0,0]],materials:{'minecraft:stone':1}}};
  await call(owner,'web_publish',update);
  let read=await call(owner,'web_read',{session_id:session});
  assert.equal(read.fresh,true);assert.equal(read.snapshot.materials['minecraft:stone'],1);assert.deepEqual(read.session.info,{title:'Fixture'});
  await assert.rejects(()=>call(stranger,'web_read',{session_id:session}),e=>e.code==='42501');
  await assert.rejects(()=>call(owner,'web_publish',{...update,sequence:2,lease:null}),e=>e.code==='40001');
  await assert.rejects(()=>call(owner,'web_publish',update),e=>e.code==='40001');
  read=await call(owner,'web_read',{session_id:session,publisher,sequence:1});assert.equal(read.snapshot,null);
  await call(owner,'web_stop',update);assert.equal((await call(owner,'web_read',{session_id:session})).fresh,false);
  await db.exec('reset role;set role authenticated');
  await assert.rejects(()=>db.query('select * from companion_tracker_web'),e=>e.code==='42501');
  return 10;
}
