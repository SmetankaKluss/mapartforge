import { libraryBuildTechniques } from './libraryBuildTechnique.ts';

Deno.test('library technique is pinned, scoped and independent from 3D mode', async () => {
  const result = await libraryBuildTechniques([{row:{id:'art',current_version_id:'v2'}}], async ids => {
    if (JSON.stringify(ids) !== '["v2"]') throw new Error('Unbounded query');
    return [
      {id:'v1',art_id:'art',settings:{buildTechnique:'standard'}},
      {id:'v2',art_id:'other',settings:{buildTechnique:'suppression_two_layer'}},
      {id:'v2',art_id:'art',settings:{buildTechnique:'suppression_two_layer'}},
    ];
  });
  if (result.size !== 1 || result.get('art') !== 'suppression_two_layer') throw new Error('Wrong scope');
});

Deno.test('library technique batches and ignores malformed settings', async () => {
  const entries = Array.from({length:81}, (_,i) => ({row:{id:String(i),current_version_id:String(i)}}));
  let calls=0;
  const result = await libraryBuildTechniques(entries, async ids => {
    calls++; if(ids.length>40)throw new Error('Batch exceeded');
    return ids.map(id=>({id,art_id:id,settings:null}));
  });
  if(calls!==3||result.size!==81||[...result.values()].some(v=>v!=='standard'))throw new Error('Invalid defaults');
  await libraryBuildTechniques([],async()=>{throw new Error('Empty list queried');});
});
