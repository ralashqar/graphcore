import test from 'node:test';
import assert from 'node:assert/strict';
import {createLandWorld,initialLandDraft,landPosition} from './cityLand.ts';
import {nycPreset} from './cityNycPresets.ts';
import {studioDraft} from './cityStudio.ts';
import {studioExample} from './cityStudioExamples.ts';
import {newFacadeRhythm} from './cityStudioFacadeRhythm.ts';
import {convertToUnifiedFacade} from './cityStudioUnifiedFacade.ts';
import {resolveSculpt} from './citySculpt.ts';
import {buildStudioDetailBatches} from './cityStudioDetailBatches.ts';
import {buildSculptCityBake,cityBakeTransferables,type CityPlotTransform} from './citySculptCityBake.ts';
import {chunkDrawIndices,cityChunkKey,mergeCityChunk,CITY_CHUNK} from './citySculptCityChunks.ts';
import type {LandDraft} from './cityLand.ts';

const world=createLandWorld([],400,48),plot=world.plots[0];
function unifiedNyc(index:number):LandDraft{const d=nycPreset(initialLandDraft(plot),index,48),out=convertToUnifiedFacade(d.sculpt as never,d.design);if('reason' in out)throw Error(out.reason);return studioDraft(d,out.recipe);}
function rhythm(style:'townhouse'|'civic',seed:number):LandDraft{
 const draft=studioExample(initialLandDraft(plot),0,48),r=draft.sculpt!;if(r.version!==5&&r.version!==6)throw Error('studio recipe');
 Object.assign(r.studio,{openings:[],assemblies:[],surfaces:[],stamps:undefined,variation:undefined,freeOpenings:undefined,freeTrims:undefined,roofOpenings:undefined,roofDetails:undefined,paintRegions:undefined,parts:{}});
 r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:13,depth:9,startFloor:0,spanFloors:3}];r.studio.defaults.roof='pitched';r.studio.facadeRhythm=newFacadeRhythm(style,seed);
 return studioDraft(draft,r);
}
function bake(d:LandDraft,transform:CityPlotTransform){const resolved=resolveSculpt(d.sculpt!,d.design),details=buildStudioDetailBatches(resolved.studio!);return {resolved,details,bake:buildSculptCityBake(resolved,details,{design:d.design,transform,signName:d.name})};}
const at=(x:number,z:number,rotation=0,scale=2):CityPlotTransform=>({x,z,rotation,scale});

test('the bake keeps every far detail triangle and the roof envelope, in world space', ()=>{
 for(const d of [unifiedNyc(0),unifiedNyc(5),rhythm('townhouse',3)]){
  const {resolved,details,bake:b}=bake(d,at(100,-40,Math.PI/2,2));
  const far=details.batches.reduce((n,x)=>n+x.far/3,0);
  assert.equal(b.triangles.detail,far,'far detail triangles');
  const patches=(resolved.studio!.roofPatches??[]).reduce((n,p)=>n+p.vertices.length/9+(p.wallVertices?.length??0)/9,0);
  assert.ok(b.triangles.envelope>=patches,'roof patches are in the envelope');
  for(const x of b.batches){
   const n=x.positions.length/3;assert.equal(x.normals.length,n*3);assert.equal(x.colors.length,n*3);
   assert.ok(x.indices.every(i=>i<n),`${x.key}: indices in range`);assert.ok(x.envelope<=x.indices.length&&x.envelope%3===0&&x.indices.length%3===0);
   if(x.kind==='wall'){assert.equal(x.uvs?.length,n*2);assert.equal(x.distance?.length,n);}
   for(let k=0;k<n;k++){const len=Math.hypot(x.normals[k*3],x.normals[k*3+1],x.normals[k*3+2]);assert.ok(len===0||Math.abs(len-1)<1e-4,'unit normals');}
  }
  // Everything sits on the plot: within 24 m (plot size 48) of its centre.
  for(const x of b.batches)for(let k=0;k<x.positions.length/3;k++)assert.ok(Math.hypot(x.positions[k*3]-100,x.positions[k*3+2]+40)<36,'on the plot');
  assert.ok(b.sign&&b.sign.width>0,'entrance sign placement');
 }
});

test('world placement applies the plot rotation and scale like the sculpt group', ()=>{
 const d=rhythm('civic',1),a=bake(d,at(0,0,0,1)).bake,b=bake(d,at(30,12,Math.PI/2,2)).bake;
 const ka=a.batches.find(x=>x.key.startsWith('wall|'))!,kb=b.batches.find(x=>x.key===ka.key)!;
 assert.equal(ka.positions.length,kb.positions.length);
 for(let k=0;k<ka.positions.length/3;k+=97){
  const x=ka.positions[k*3],y=ka.positions[k*3+1],z=ka.positions[k*3+2];
  // Rotation +90° about +Y: (x, z) -> (z, -x); then scale 2 and translate.
  assert.ok(Math.abs(kb.positions[k*3]-(30+z*2))<1e-3&&Math.abs(kb.positions[k*3+1]-y*2)<1e-3&&Math.abs(kb.positions[k*3+2]-(12-x*2))<1e-3,'vertex transformed');
  const nx=ka.normals[k*3],nz=ka.normals[k*3+2];assert.ok(Math.abs(kb.normals[k*3]-nz)<1e-4&&Math.abs(kb.normals[k*3+2]+nx)<1e-4,'normal rotated');
 }
 assert.ok(Math.abs(b.sign!.width-a.sign!.width*2)<1e-6&&Math.abs(b.sign!.angle-a.sign!.angle-Math.PI/2)<1e-9,'sign follows the plot');
});

test('far wall colour and aperture fills keep their material', ()=>{
 const d=unifiedNyc(1),{details,bake:b}=bake(d,at(0,0));
 const wall=details.batches.find(x=>x.material.kind==='wall')!,m=wall.material as {color:string;texture:string};
 const baked=b.batches.find(x=>x.key===`wall|${m.texture}`)!;assert.ok(baked,'wall batch keyed by texture');
 assert.ok(b.batches.filter(x=>x.kind==='glass').length<=1,'one glass batch (colour per vertex)');
 const [r,g,bl]=[baked.colors[0],baked.colors[1],baked.colors[2]];assert.ok(r>0&&g>0&&bl>0&&r<=1,'linear vertex colour');
 assert.equal(new Set(b.batches.map(x=>x.key)).size,b.batches.length,'one batch per material key');
 const buffers=cityBakeTransferables(b);assert.equal(new Set(buffers).size,buffers.length);
});

test('chunks concatenate plots and can leave one plot\'s far detail out', ()=>{
 const plots=[unifiedNyc(2),rhythm('townhouse',5),rhythm('civic',9)].map((d,i)=>({id:`p${i}`,bake:bake(d,at(i*60,0)).bake}));
 const chunk=mergeCityChunk(plots);
 for(const c of chunk){
  const members=plots.map(p=>p.bake.batches.find(b=>b.key===c.key)).filter(b=>!!b);
  assert.equal(c.positions.length,members.reduce((n,b)=>n+b!.positions.length,0));assert.equal(c.indices.length,members.reduce((n,b)=>n+b!.indices.length,0));
  const n=c.positions.length/3;assert.ok(c.indices.every(i=>i<n),'offset indices');
  assert.deepEqual(chunkDrawIndices(c,new Set()),c.indices,'nothing left out');
  const seg=c.segments.find(s=>s.id==='p1');
  const without=chunkDrawIndices(c,new Set(['p1']));assert.equal(without.length,c.indices.length-(seg?.detail??0),'only p1\'s detail is left out');
  if(seg)assert.deepEqual([...without.subarray(seg.start,seg.start+seg.envelope)],[...c.indices.subarray(seg.start,seg.start+seg.envelope)],'p1 keeps its envelope');
  for(let k=0;k<3;k++){const [x,y,z,r]=c.sphere;void y;assert.ok(Math.hypot(c.positions[k*3]-x,c.positions[k*3+2]-z)<=r+1e-3);}
 }
 assert.equal(cityChunkKey({x:1,z:-1}),'0:-1');assert.equal(cityChunkKey({x:CITY_CHUNK,z:-CITY_CHUNK}),'0:-1');assert.equal(cityChunkKey({x:CITY_CHUNK+1,z:-CITY_CHUNK-1}),'1:-2');
 void landPosition;
});
