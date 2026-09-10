import assert from 'node:assert/strict';

// Run only against a fresh disposable PostgreSQL database, never a linked project.
export async function testLiveBuildControl(db, migration, actorQuotaMigration = null) {
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key);
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    grant usage on schema auth, public to service_role, anon, authenticated;
    grant select,update on auth.users to service_role;
  `);
  await db.exec(migration);
  if (actorQuotaMigration) {
    await db.exec(actorQuotaMigration);
    await db.exec('revoke all on auth.users from service_role');
  }
  const owner = '11111111-1111-4111-8111-111111111111';
  const friend = '22222222-2222-4222-8222-222222222222';
  const outsider = '33333333-3333-4333-8333-333333333333';
  await db.query('insert into auth.users values($1),($2),($3)', [owner,friend,outsider]);
  await db.exec('set role service_role');
  let checks = 0;
  const rpc = async (actor, action, input) => (await db.query(
    'select public.companion_live_build_control($1,$2,$3::jsonb) as result',
    [actor,action,JSON.stringify(input)])).rows[0].result;
  const deny = async (operation, code) => {
    await assert.rejects(operation, error => error.code === code); checks++;
  };
  const equal = (actual, expected) => { assert.deepEqual(actual,expected); checks++; };
  const create = {source_sha256:'a'.repeat(64),grid_wide:2,grid_tall:1,consent:true};
  await deny(()=>rpc(owner,'create',{...create,consent:false}),'22023');
  await deny(()=>rpc(owner,'create',{...create,server:'private server'}),'22023');
  await deny(()=>rpc(owner,'create',{...create,grid_wide:11}),'23514');
  let session=await rpc(owner,'create',create);
  const id=session.id;
  equal(session.role,'owner'); equal(session.placements,[]);
  assert.ok(!('invite_hash' in session)); checks++;
  await deny(()=>rpc(outsider,'read',{build_id:id}),'42501');
  await deny(()=>rpc(friend,'join',{invite_hash:'b'.repeat(64),consent:true}),'42501');
  session=await rpc(owner,'invite',{build_id:id,expected_revision:session.revision,invite_hash:'b'.repeat(64)});
  await deny(()=>rpc(friend,'join',{invite_hash:'b'.repeat(64),consent:false}),'22023');
  session=await rpc(friend,'join',{invite_hash:'b'.repeat(64),consent:true});
  equal(session.role,'member'); equal(session.members,[]);
  equal((await rpc(friend,'join',{invite_hash:'b'.repeat(64),consent:true})).revision,session.revision);
  await deny(()=>rpc(friend,'invite',{build_id:id,expected_revision:session.revision,invite_hash:'c'.repeat(64)}),'42501');
  const place={build_id:id,expected_revision:session.revision,tile:0,consent:true,
    target_sha256:'d'.repeat(64),phase:-1,cell_count:16384,world_binding:owner,
    dimension:'minecraft:overworld',origin_x:100,origin_y:64,origin_z:200,rotation:0,mirrored:false};
  await deny(()=>rpc(friend,'place',place),'42501');
  await deny(()=>rpc(owner,'place',{...place,consent:false}),'22023');
  await deny(()=>rpc(owner,'place',{...place,tile:2}),'22023');
  session=await rpc(owner,'place',place);
  equal(session.placements.length,1);
  equal(session.placements[0].tile,0);
  equal((await rpc(friend,'read',{build_id:id})).placements,session.placements);
  await deny(()=>rpc(owner,'place',place),'40001');
  const before=session.placements;
  await deny(()=>rpc(owner,'place',{...place,expected_revision:session.revision,rotation:5}),'23514');
  equal((await rpc(owner,'read',{build_id:id})).placements,before);
  session=await rpc(owner,'place',{...place,expected_revision:session.revision,tile:1});
  equal(session.placements.length,2);
  session=await rpc(owner,'unplace',{build_id:id,expected_revision:session.revision,tile:1});
  equal(session.placements,before);
  await deny(()=>rpc(owner,'remove_member',{build_id:id,expected_revision:session.revision}),'22023');
  equal((await rpc(owner,'read',{build_id:id})).revision,session.revision);
  equal((await rpc(friend,'join',{invite_hash:'b'.repeat(64),consent:true})).revision,session.revision);
  session=await rpc(owner,'remove_member',{build_id:id,expected_revision:session.revision,member_id:friend});
  await deny(()=>rpc(friend,'read',{build_id:id}),'42501');
  await deny(()=>rpc(friend,'join',{invite_hash:'b'.repeat(64),consent:true}),'42501');
  session=await rpc(owner,'invite',{build_id:id,expected_revision:session.revision,invite_hash:'e'.repeat(64)});
  await rpc(friend,'join',{invite_hash:'e'.repeat(64),consent:true});
  equal(await rpc(friend,'leave',{build_id:id}),{left:true});
  await deny(()=>rpc(friend,'read',{build_id:id}),'42501');
  await deny(()=>rpc(owner,'leave',{build_id:id}),'22023');

  // Client roles cannot call the service RPC or directly access its tables.
  await db.exec('reset role; set role anon');
  await deny(()=>rpc(owner,'read',{build_id:id}),'42501');
  await deny(()=>db.query('select * from public.companion_live_builds'),'42501');
  await db.exec('reset role; set role authenticated');
  await deny(()=>rpc(owner,'read',{build_id:id}),'42501');
  await deny(()=>db.query('select * from public.companion_live_build_placements'),'42501');
  for (const role of ['anon','authenticated']) {
    await db.exec(`reset role; set role ${role}`);
    for (const table of ['companion_live_builds','companion_live_build_members','companion_live_build_placements']) {
      await deny(()=>db.query(`delete from public.${table}`),'42501');
      await deny(()=>db.query(`insert into public.${table} default values`),'42501');
    }
  }
  // RLS remains deny-by-default even if an accidental read grant is added later.
  await db.exec('reset role; grant select on public.companion_live_builds to authenticated; set role authenticated');
  equal((await db.query('select * from public.companion_live_builds')).rows,[]);
  await db.exec('reset role; revoke select on public.companion_live_builds from authenticated; set role service_role');
  session=await rpc(owner,'read',{build_id:id});
  await rpc(owner,'close',{build_id:id,expected_revision:session.revision});
  await deny(()=>rpc(owner,'read',{build_id:id}),'42501');
  await deny(()=>rpc(friend,'join',{invite_hash:'e'.repeat(64),consent:true}),'42501');
  for(let i=0;i<5;i++)session=await rpc(owner,'create',create);
  await deny(()=>rpc(owner,'create',create),'54000');
  session=await rpc(owner,'invite',{build_id:session.id,expected_revision:session.revision,invite_hash:'f'.repeat(64)});
  await db.query("update public.companion_live_builds set invite_expires_at=clock_timestamp()-interval '1 second' where id=$1",[session.id]);
  await deny(()=>rpc(friend,'join',{invite_hash:'f'.repeat(64),consent:true}),'42501');
  await db.query("update public.companion_live_builds set expires_at=clock_timestamp()-interval '1 second' where id=$1",[session.id]);
  await deny(()=>rpc(owner,'read',{build_id:session.id}),'42501');
  // Per-build aggregate capacity and accepted-member limits are enforced in the transaction.
  session=await rpc(owner,'create',{...create,grid_wide:10,grid_tall:10});
  for(let tile=0;tile<4;tile++) session=await rpc(owner,'place',{
    ...place,build_id:session.id,expected_revision:session.revision,tile,cell_count:2000000});
  await deny(()=>rpc(owner,'place',{
    ...place,build_id:session.id,expected_revision:session.revision,tile:4,cell_count:1}),'54000');
  equal((await rpc(owner,'read',{build_id:session.id})).placements.length,4);
  session=await rpc(owner,'invite',{build_id:session.id,expected_revision:session.revision,invite_hash:'9'.repeat(64)});
  const members=Array.from({length:20},(_,i)=>`44444444-4444-4444-8444-${String(i).padStart(12,'0')}`);
  await db.exec('reset role');
  for(const member of members)await db.query('insert into auth.users values($1)',[member]);
  await db.exec('set role service_role');
  for(const member of members.slice(0,19))await rpc(member,'join',{invite_hash:'9'.repeat(64),consent:true});
  await deny(()=>rpc(members[19],'join',{invite_hash:'9'.repeat(64),consent:true}),'54000');
  session=await rpc(owner,'read',{build_id:session.id});
  equal(session.members.length,19);
  await rpc(owner,'close',{build_id:session.id,expected_revision:session.revision});
  // Closing sessions cannot bypass retained-storage limits before scheduled retention cleanup.
  while((await db.query('select count(*)::int n from public.companion_live_builds where owner_id=$1',[owner])).rows[0].n<20){
    session=await rpc(owner,'create',create);
    await rpc(owner,'close',{build_id:session.id,expected_revision:session.revision});
  }
  await deny(()=>rpc(owner,'create',create),'54000');
  await db.exec('reset role');
  equal((await db.query("select count(*)::int n from pg_class where relname like 'companion_live_build%' and relkind='r' and relrowsecurity")).rows[0].n,3);
  return checks;
}
