import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {nycPreset} from './cityNycPresets.ts';
import {createLandWorld,initialLandDraft} from './cityLand.ts';
import {resolveSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioFloorCount} from './cityStudio.ts';
import {convertToUnifiedFacade} from './cityStudioUnifiedFacade.ts';
import {clearFaceCache,faceCacheStats,FACE_CACHE,InputHash,resetFaceCacheStats} from './cityStudioFaceCache.ts';
import {buildFreeOpeningFaceGeometry,FREE_FACE,OPENING_INSTANCING} from './cityStudioFreeOpeningGeometry.ts';
import {freeRegion,resolveFreeOpenings,type FreeRect,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {moduleOpeningSpec} from './cityStudioModuleSpec.ts';
import {newFacadeRhythm,RHYTHM_STYLE_IDS} from './cityStudioFacadeRhythm.ts';
import {buildStudioDetailBatches,type StudioDetailBatches} from './cityStudioDetailBatches.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const rect=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:3,...patch});
const recipe=(extra:Partial<StudioRecipe['studio']>,volumes=[rect()]):StudioRecipe=>({version:5,volumes,attachments:[],plotSize:24,studio:{...freshStudio(),...extra}});
const design=(r:StudioRecipe)=>({...newDesign('face-cache'),groundHeight:3.2,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const free=(id:string,u:number,bottom:number,side:StudioFreeOpening['side']='north',extra:Partial<StudioFreeOpening>={}):StudioFreeOpening=>({id,shapeId:'main',side,u,bottom,width:1,height:1.5,shape:'arch',...extra});

test('unchanged faces are reused: an edit rebuilds only the face it touches, identical results either way',()=>{
 const openings=[free('a',.2,1),free('b',.7,1),free('c',.4,4.3,'south'),free('d',.5,1,'east')],r=recipe({freeOpenings:openings});
 clearFaceCache();resetFaceCacheStats();
 const first=resolveSculpt(r,design(r)).studio!;const built=faceCacheStats();assert.equal(built.hits,0);assert.equal(built.misses,first.freeFaces!.length);
 const again=resolveSculpt(r,design(r)).studio!;assert.equal(faceCacheStats().hits,first.freeFaces!.length,'every face from the cache');
 again.freeFaces!.forEach((f,i)=>assert.equal(f.geometry,first.freeFaces![i].geometry,'shared, read-only geometry'));
 // Move one opening on the north face: only that face is rebuilt.
 resetFaceCacheStats();const moved=recipe({freeOpenings:openings.map(o=>o.id==='a'?{...o,u:.25}:o)});
 const edited=resolveSculpt(moved,design(moved)).studio!;assert.deepEqual([faceCacheStats().hits,faceCacheStats().misses],[first.freeFaces!.length-1,1]);
 assert.notEqual(edited.freeFaces!.find(f=>f.side==='north')!.geometry,first.freeFaces!.find(f=>f.side==='north')!.geometry);
 // Opening ids do not matter; with the cache off the result is the same.
 const renamed=recipe({freeOpenings:openings.map(o=>({...o,id:`x-${o.id}`}))});resetFaceCacheStats();resolveSculpt(renamed,design(renamed));assert.equal(faceCacheStats().misses,0);
 FACE_CACHE.enabled=false;try{const cold=resolveSculpt(r,design(r)).studio!;cold.freeFaces!.forEach((f,i)=>{assert.notEqual(f.geometry,first.freeFaces![i].geometry);assert.deepEqual([...f.geometry.wall.positions],[...first.freeFaces![i].geometry.wall.positions]);});}finally{FACE_CACHE.enabled=true;}
});

test('a design repeated on another plot resolves from the cache (unified New York preset)',()=>{
 const [a,b]=createLandWorld([],72,24).plots,draft=(p:typeof a)=>{const d=nycPreset(initialLandDraft(p),1,24),out=convertToUnifiedFacade(d.sculpt as StudioRecipe,d.design);if('reason' in out)throw Error(out.reason);return {r:out.recipe,d:d.design};};
 clearFaceCache();resetFaceCacheStats();const x=draft(a),y=draft(b);resolveSculpt(x.r,x.d);const misses=faceCacheStats().misses;resetFaceCacheStats();resolveSculpt(y.r,{...y.d,rotation:(y.d.rotation+1)%4 as 0|1|2|3});
 assert.ok(misses>0);assert.equal(faceCacheStats().misses,0,'the second plot builds no face');
});

test('input hashes separate what differs and match what is equal',()=>{
 const k=(...n:number[])=>new InputHash().nums(n).str('x').key();
 assert.equal(k(1,2,3),k(1,2,3));assert.notEqual(k(1,2,3),k(1,2,3.0000000001));assert.notEqual(k(1,2),k(1,2,0));assert.equal(k(0),k(-0));
 assert.notEqual(new InputHash().str('ab').str('c').key(),new InputHash().str('a').str('bc').key());
});

test('kit apertures: holes inside the wall are added as rings, doors at the base are clipped; the wall area is exact',()=>{
 const face={length:12,height:11,ground:true},kit=(id:string,module:string,x:number,bottom:number)=>{const s=moduleOpeningSpec(module)!;return {id,x,bottom,width:s.width,height:s.height,shape:'rect' as const,module};};
 const openings=[kit('w1','window-nyc-sash',2,4),kit('w2','window-nyc-sash',6,4),kit('w3','window-nyc-sash',10,4),kit('d','door-nyc-residential',6,0),kit('w4','window-nyc-sash',2,7.4)];
 const res=resolveFreeOpenings(face,openings);assert.equal(res.inactive.length,0);assert.ok(res.groups.every(g=>g.module));
 const regions:(FreeRect[]|undefined)[]=[undefined,[[0,6,0,11],[6,12,0,11]],[[0,12,0,3.2],[0,12,3.2,11]]];
 for(const region of regions){
  const g=buildFreeOpeningFaceGeometry({...face,region},res.groups),w=g.wall,t=FREE_FACE.thickness/2;let outer=0;
  for(let i=0;i<w.rearStart!;i+=3){const k=[w.indices[i],w.indices[i+1],w.indices[i+2]];if(!k.every(v=>w.normals[v*3+2]>.99&&Math.abs(w.positions[v*3+2]-t)<1e-6))continue;
   const p=k.map(v=>[w.positions[v*3],w.positions[v*3+1]]);outer+=Math.abs((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[2][0]-p[0][0])*(p[1][1]-p[0][1]))/2;}
  const holes=res.groups.reduce((n,x)=>n+(x.x1-x.x0)*(x.y1-x.y0),0);
  assert.ok(Math.abs(outer-(12*11-holes))<1e-4,`outer skin ${outer} = wall minus apertures ${12*11-holes}`);
 }
 assert.equal(freeRegion([[0,6,0,9.6],[6,12,0,9.6]]),freeRegion([[0,6,0,9.6],[6,12,0,9.6]]),'region unions are memoised');
 assert.deepEqual(freeRegion([[0,6,0,9.6],[6,12,0,9.6]]),[[[[0,0],[12,0],[12,9.6],[0,9.6],[0,0]]]],'bays tiling the wall make one rectangle');
});

const openingTriangles=(d:StudioDetailBatches)=>{const t={near:0,far:0};for(const b of d.batches)if(b.material.kind==='painted'||b.material.kind==='glass'&&b.material.seeThrough){t.near+=b.near/3;t.far+=b.far/3;}t.near+=d.openings?.triangles.near??0;t.far+=d.openings?.triangles.far??0;return t;};
test('every facade rhythm style draws the same opening detail instanced as merged',()=>{
 for(const style of RHYTHM_STYLE_IDS)for(const seed of [3,11]){
  const r=recipe({facadeRhythm:newFacadeRhythm(style,seed)},[rect({width:11,depth:9,spanFloors:4}),rect({id:'wing',x:7.6,z:-1.5,width:5,depth:6,spanFloors:3})]);
  OPENING_INSTANCING.enabled=false;let legacy:StudioDetailBatches;try{legacy=buildStudioDetailBatches(resolveSculpt(r,design(r)).studio!);}finally{OPENING_INSTANCING.enabled=true;}
  const now=buildStudioDetailBatches(resolveSculpt(r,design(r)).studio!);
  assert.deepEqual(openingTriangles(now),openingTriangles(legacy),`${style}/${seed}`);assert.ok((now.openings?.count??0)>0);
 }
});
