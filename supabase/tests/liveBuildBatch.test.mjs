import assert from 'node:assert/strict';

export function packBuildEvidence(states, offsets) {
  assert.equal(states.length,offsets.length);
  const bytes=Buffer.alloc(states.length*2);
  for(let i=0;i<states.length;i++) {
    const units=Math.floor(offsets[i]/100)+1200;
    assert.ok(units>=0 && units<=1500 && /^[0-3]$/.test(states[i]));
    bytes.writeUInt16BE((units<<3)|Number(states[i]),i*2);
  }
  return bytes.toString('base64');
}
export function unpackBuildEvidence(packed) {
  const bytes=Buffer.from(packed,'base64');
  return Array.from({length:bytes.length/2},(_,i)=>{
    const word=bytes.readUInt16BE(i*2); return {state:word&7,ageMs:(word>>3)*100};
  });
}

// Run after the disposable observation fixture, never a linked database.
export async function testLiveBuildBatch(db, migration) {
  await db.exec('reset role');
  await db.exec(migration);
  await db.exec('set role service_role');
  let checks=0;
  const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
  const deny=async(fn,code)=>{await assert.rejects(fn,e=>e.code===code);checks++;};
  const owner='11111111-1111-4111-8111-111111111111';
  const outsider='33333333-3333-4333-8333-333333333333';
  const rpc=async(actor,action,input,kind='batch')=>(await db.query(
    `select public.companion_live_build_${kind}($1,$2,$3::jsonb) result`,[actor,action,JSON.stringify(input)])).rows[0].result;
  let s=await rpc(owner,'create',{source_sha256:'a'.repeat(64),grid_wide:2,grid_tall:1,consent:true},'control');
  const place={build_id:s.id,tile:0,consent:true,target_sha256:'c'.repeat(64),phase:-1,cell_count:131072,
    world_binding:owner,dimension:'minecraft:overworld',origin_x:0,origin_y:64,origin_z:0,rotation:0,mirrored:false};
  s=await rpc(owner,'place',{...place,expected_revision:s.revision},'control');
  const pages=Array.from({length:32},(_,page)=>({tile:0,page,placement_revision:s.placements[0].revision,
    source_sha256:'a'.repeat(64),target_sha256:place.target_sha256,phase:-1,world_binding:owner}));
  const lease=await rpc(owner,'observe_begin',{build_id:s.id,consent:true},'observations');
  const packed=packBuildEvidence('1230'.repeat(1024),Array(4096).fill(0));
  const input={build_id:s.id,lease:lease.lease,sequence:1,pages:pages.map(p=>({...p,packed}))};
  assert.ok(Buffer.byteLength(JSON.stringify(input))<393216); checks++;
  eq(await rpc(owner,'observe_batch',input),{accepted:true,pages:32});
  eq(await rpc(owner,'observe_batch',input),{duplicate:true});
  const response=await rpc(owner,'observations_batch',{build_id:s.id,pages});
  eq(response.pages.length,32);
  eq(unpackBuildEvidence(response.pages[0].packed).map(p=>p.state).join(''),'1230'.repeat(1024));
  assert.ok(Buffer.byteLength(JSON.stringify(response))<393216); checks++;
  const before=response.pages.map(p=>p.revision);
  const cached=pages.map((p,i)=>({...p,known_revision:response.pages[i].revision,membership_revision:response.pages[i].membership_revision}));
  const warm=await rpc(owner,'observations_batch',{build_id:s.id,pages:cached});
  eq(warm.pages.every(p=>p.unchanged===true && !('packed' in p)),true);
  assert.ok(Buffer.byteLength(JSON.stringify(warm))<32768);checks++;
  const staleMembership=await rpc(owner,'observations_batch',{build_id:s.id,pages:[{...cached[0],membership_revision:0}]});
  eq(typeof staleMembership.pages[0].packed,'string');
  await deny(()=>rpc(owner,'observe_batch',{...input,pages:[input.pages[0]]}),'40001');
  await deny(()=>rpc(outsider,'observations_batch',{build_id:s.id,pages}),'42501');
  await deny(()=>rpc(owner,'observe_batch',{...input,sequence:2,pages:[...input.pages,input.pages[0]]}),'22023');
  await deny(()=>rpc(owner,'observe_batch',{...input,sequence:2,pages:[input.pages[0],input.pages[0]]}),'22023');
  // The first page would change, but a malformed second page rolls the whole transaction back.
  const changed={...input.pages[0],packed:packBuildEvidence('3'.repeat(4096),Array(4096).fill(0))};
  await deny(()=>rpc(owner,'observe_batch',{...input,sequence:2,pages:[changed,{...input.pages[1],packed:'AAAA'}]}),'22023');
  eq((await rpc(owner,'observations_batch',{build_id:s.id,pages})).pages.map(p=>p.revision),before);
  for(const packed of ['AA==','!!','////',Buffer.from([0,4]).toString('base64')])
    await deny(()=>rpc(owner,'observe_batch',{...input,sequence:2,pages:[{...input.pages[0],packed}]}),'22023');
  await deny(()=>rpc(owner,'observe_batch',{...input,sequence:2,pages:[{...input.pages[0],build_id:s.id}]}),'22023');
  await rpc(owner,'observe_batch',{...input,sequence:2,pages:[changed]});
  const delta=await rpc(owner,'observations_batch',{build_id:s.id,pages:cached});
  eq(delta.pages.filter(p=>typeof p.packed==='string').length,1);
  eq(unpackBuildEvidence((await rpc(owner,'observations_batch',{build_id:s.id,pages:[pages[0]]})).pages[0].packed)[0].state,3);
  await deny(()=>rpc(owner,'observe_batch',input),'40001');
  const raw=await rpc(owner,'observations',{build_id:s.id,...pages[0]},'observations');
  const compact=(await rpc(owner,'observations_batch',{build_id:s.id,pages:[pages[0]]})).pages[0];
  const decoded=unpackBuildEvidence(compact.packed);
  assert.ok(decoded[0].ageMs>=compact.server_ms-raw.observed_ms[0]); checks++;
  s=await rpc(owner,'read',{build_id:s.id},'control');
  await rpc(owner,'invite',{build_id:s.id,expected_revision:s.revision,invite_hash:'f'.repeat(64)},'control');
  eq((await rpc(owner,'observations_batch',{build_id:s.id,pages:cached})).pages.every(p=>typeof p.packed==='string'),true);
  for(const role of ['anon','authenticated']) {
    await db.exec(`reset role; set role ${role}`);
    await deny(()=>rpc(owner,'observations_batch',{build_id:s.id,pages}),'42501');
  }
  await db.exec('reset role; set role service_role');
  return checks;
}
