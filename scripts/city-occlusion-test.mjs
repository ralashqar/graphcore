import assert from 'node:assert/strict';
import {bakeCityOcclusion} from '../src/features/city/CityOcclusionBake.ts';
import {newDesign,resolveCurrent,COMPOSITIONS,applyComposition} from '../src/domain/cityBuildingV3.ts';
const box=(position,size=[1,1,1],color='#777777')=>({kind:'box',position,size,color});
const target=box([0,0,0]);
const isolated=bakeCityOcclusion([target],'#abcdef');
assert.equal(isolated[0].corners.length,24);
assert.ok(isolated[0].corners.every(v=>v===1),'An isolated convex box must not shade itself');
const ceiling=box([0,1,0],[4,.2,4]);
const shaded=bakeCityOcclusion([target,ceiling],'#abcdef');
assert.ok(shaded[0].corners.slice(12,16).some(v=>v<.9),'An overhang must occlude the upward face');
assert.ok(shaded[0].corners.slice(8,12).every(v=>v===1),'The opposite face must remain clear');
const adjacent=bakeCityOcclusion([target,box([1,0,0])],'#abcdef');
assert.ok(adjacent[0].corners.slice(20,24).every(v=>v===1),'Coplanar joins must not introduce a false front seam');
assert.deepEqual(shaded,bakeCityOcclusion([target,ceiling],'#abcdef'),'Bakes are deterministic');
const glass=bakeCityOcclusion([target,{...ceiling,color:'#abcdef'}],'#abcdef');
assert.ok(glass[0].corners.every(v=>v===1),'Glazing must not become an opaque blocker');
const names=['Glass headquarters','Retail flagship','Twin-Tower HQ','Round Tower','Elliptical HQ','Atrium Campus'];
let covered=0;
for(const name of names){
 const index=COMPOSITIONS.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
 assert.ok(index>=0,`Missing required AO fixture: ${name}`);covered++;
 const design=applyComposition(newDesign('ao-fixture'),index);
 const result=resolveCurrent(design,'#335577','near');
 const ao=bakeCityOcclusion(result.parts,design.palette.glass);
 assert.equal(ao.length,result.parts.length);
 ao.forEach((value,index)=>{
  const samples=value.vertices||value.corners||[];
  assert.ok(samples.every(v=>Number.isFinite(v)&&v>=.3&&v<=1));
  if(value.vertices)assert.equal(value.vertices.length,result.parts[index].vertices.length/3);
 });
}
assert.equal(covered,names.length);
console.log('Architectural AO: isolated surfaces, overhangs, coplanar joins, glazing, deterministic bakes and finite samples passed.');

const {cachedCityDesign,hasCityDesign,adoptCityDesign}=await import('../src/features/city/cityDesignCache.ts');
const recipe=newDesign('cache-fixture'),clone=structuredClone(recipe);
const prepared=cachedCityDesign(recipe,'#335577','medium',true);
adoptCityDesign(recipe,clone,'#335577');
assert.ok(hasCityDesign(clone,'#335577','medium',true));
assert.equal(cachedCityDesign(clone,'#335577','medium',true),prepared);
const edited={...clone,seed:clone.seed+1};
adoptCityDesign(clone,edited,'#335577');
assert.ok(!hasCityDesign(edited,'#335577','medium',true),'Edits must not inherit an old bake');
console.log('Equivalent snapshots reuse prepared geometry; edits invalidate it.');
