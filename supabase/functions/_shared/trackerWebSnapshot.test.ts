import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validTrackerWebSnapshot } from './trackerWebSnapshot.ts';
const snapshot = () => ({width:2,height:1,palette:[-16777216,0],pixels:btoa(String.fromCharCode(0,0,1,0)),summary:[2,1,0,0,1,0],parts:[[2,1,0,0,1,0]],materials:{'minecraft:stone':1}});
Deno.test('tracker snapshot accepts exact indexed native pixels and rejects corrupt/private data',()=>{
  assertEquals(validTrackerWebSnapshot(snapshot()),true);
  for(const invalid of [{...snapshot(),width:1281},{...snapshot(),pixels:btoa(String.fromCharCode(2,0,1,0))},{...snapshot(),summary:[2,3,0,0,0,0]},
    {...snapshot(),filename:'private'},{...snapshot(),materials:{'not a block':1}},{...snapshot(),pixels:'AAAA'}])assertEquals(validTrackerWebSnapshot(invalid),false);
});
