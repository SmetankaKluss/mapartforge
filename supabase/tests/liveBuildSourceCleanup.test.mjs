import assert from 'node:assert/strict';
export async function testSourceCleanup(db,migration){
  await db.exec('reset role');await db.exec(migration);
  const owner='11111111-1111-4111-8111-111111111111';
  const create=async()=> (await db.query(`insert into public.companion_live_builds(owner_id,source_sha256,grid_wide,grid_tall)
    values($1,$2,1,1) returning id`,[owner,'a'.repeat(64)])).rows[0].id;
  const source=async id=>db.query(`insert into public.companion_live_build_sources(build_id,kind,size_bytes,part_sha256)
    values($1,'litematic',3,$2::jsonb)`,[id,JSON.stringify(['b'.repeat(64)])]);
  const claim=async()=> (await db.query('select public.companion_live_build_cleanup_claim(8) result')).rows[0].result;
  const count=async()=> Number((await db.query('select count(*) n from public.companion_live_build_source_cleanup where completed_at is null')).rows[0].n);
  const id=await create();await source(id);
  assert.equal(await count(),0);assert.deepEqual((await claim()).paths,[]);
  await db.query("update public.companion_live_builds set status='closed' where id=$1",[id]);
  assert.equal(await count(),1);assert.deepEqual((await claim()).paths,[]);
  await db.query('delete from public.companion_live_builds where id=$1',[id]);assert.equal(await count(),1);
  await db.exec("update public.companion_live_build_source_cleanup set eligible_at=clock_timestamp()-interval '1 minute'");
  const first=await claim();assert.equal(first.paths.length,1);assert.deepEqual((await claim()).paths,[]);
  const ack=async(lease,path)=>(await db.query('select public.companion_live_build_cleanup_ack($1,$2) result',[lease,path])).rows[0].result;
  assert.equal(await ack(owner,first.paths[0]),false);
  await db.exec("update public.companion_live_build_source_cleanup set lease_until=clock_timestamp()-interval '1 second'");
  const second=await claim();assert.equal(await ack(first.lease_id,first.paths[0]),false);
  assert.equal(await ack(second.lease_id,second.paths[0]),true);assert.equal(await count(),0);
  const expired=await create();await source(expired);
  await db.query("update public.companion_live_builds set expires_at=clock_timestamp()-interval '1 second' where id=$1",[expired]);
  await claim();assert.equal(await count(),1);
  const deleted=await create();await source(deleted);await db.query('delete from public.companion_live_builds where id=$1',[deleted]);
  assert.equal(await count(),2);
  await db.exec("update public.companion_live_build_source_cleanup set eligible_at=clock_timestamp()-interval '1 minute'");
  const final=await claim();for(const path of final.paths)assert.equal(await ack(final.lease_id,path),true);
  await claim();assert.equal(Number((await db.query('select count(*) n from public.companion_live_builds where id=$1',[expired])).rows[0].n),0);
  assert.equal(await count(),0); // Parent deletion must not recreate completed jobs.
  await db.exec('set role authenticated');
  await assert.rejects(claim,e=>e.code==='42501');
  return 20;
}
