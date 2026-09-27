import test from 'node:test';
import assert from 'node:assert/strict';
// @deno-types="npm:@types/three@0.186.0"
import {Color} from 'three';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioFloorCount} from './cityStudio.ts';
import {upgradeStudioInterior} from './cityStudioInteriors.ts';
import {newFacadeRhythm} from './cityStudioFacadeRhythm.ts';
import {buildStudioDetailBatches,type DetailBatch,type StudioDetailBatches} from './cityStudioDetailBatches.ts';
import {OPENING_INSTANCING,openingPieceSpec} from './cityStudioFreeOpeningGeometry.ts';
import {lookupOpeningPiece,openingPiece,openingTransferables,transformOpeningInstances,unitRectPiece,type OpeningPieceGeometry,type StudioOpeningInstances} from './cityStudioOpeningPieces.ts';
import {buildSculptCityBake} from './citySculptCityBake.ts';
import type {StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const rect=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:14,depth:10,startFloor:0,spanFloors:2,...patch});
const free=(id:string,side:StudioFreeOpening['side'],u:number,bottom:number,width:number,height:number,shape:StudioFreeOpening['shape']='rect',extra:Partial<StudioFreeOpening>={}):StudioFreeOpening=>({id,shapeId:'main',side,u,bottom,width,height,shape,...extra});
const OPENINGS=[free('door','south',.15,0,1.4,2.4,'arch',{style:'timber'}),free('shop','south',.32,0,1.2,2.55,'rect',{style:'painted',glazing:true}),free('carriage','south',.52,0,2.5,3,'arch',{style:'timber'}),free('arcade','south',.72,0,1.5,2.7,'arch',{style:'stone'}),free('win','south',.88,1,1.1,1.4),
 free('a','north',.15,.9,1,1.6),free('b','north',.85,.9,1,1.6,'arch',{style:'stone'}),free('c','north',.3,4.2,1,1.5,'pointed',{style:'stone'}),free('open','north',.7,4.2,1.1,1.5,'rect',{glazing:false}),free('o','north',.5,4.3,1.1,1.1,'round',{style:'stone'}),free('e','east',.5,.9,1.2,1.5)];
const studioRecipe=(volumes:SculptVolume[],extra:Partial<StudioRecipe['studio']>):StudioRecipe=>({version:5,volumes,attachments:[],plotSize:24,studio:{...freshStudio(),...extra}});
const resolve=(r:StudioRecipe,instanced=true)=>{OPENING_INSTANCING.enabled=instanced;try{return resolveSculpt(r,{...newDesign('opening-pieces'),groundHeight:3.2,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none',roof:'flat'}).studio!;}finally{OPENING_INSTANCING.enabled=true;}};
const FIXTURES:[string,StudioRecipe][]=[
 ['free openings (v5)',studioRecipe([rect()],{freeOpenings:OPENINGS})],
 ['free openings (v6, openable doors)',upgradeStudioInterior(studioRecipe([rect()],{freeOpenings:OPENINGS}))],
 ['townhouse rhythm with a wing',studioRecipe([rect({width:11,depth:9,spanFloors:4}),rect({id:'wing',x:7.6,z:-1.5,width:5,depth:6,spanFloors:3})],{facadeRhythm:newFacadeRhythm('townhouse',4)})],
 ['curved tower and wing with a rhythm',studioRecipe([{id:'tower',kind:'ellipse',operation:'add',x:-3.5,z:.5,width:7,depth:7,startFloor:0,spanFloors:4},{id:'wing',kind:'ellipse',operation:'add',x:3.5,z:0,width:9,depth:6,startFloor:0,spanFloors:2}],{facadeRhythm:{...newFacadeRhythm('civic',5),trims:'rich'}})],
];

/** Area, area-weighted centroid and colour (tints resolved) of an index range. */
type Stats={triangles:number;area:number;centroid:[number,number,number];color:[number,number,number]};
const empty=():Stats=>({triangles:0,area:0,centroid:[0,0,0],color:[0,0,0]});
function accumulate(s:Stats,pos:(k:number)=>[number,number,number],col:(k:number)=>[number,number,number],indices:ArrayLike<number>,start:number,count:number){
 for(let i=start;i<start+count;i+=3){const a=pos(indices[i]),b=pos(indices[i+1]),c=pos(indices[i+2]);
  const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;
  s.triangles++;s.area+=area;for(let k=0;k<3;k++){s.centroid[k]+=area*(a[k]+b[k]+c[k])/3;const ca=col(indices[i]),cb=col(indices[i+1]),cc=col(indices[i+2]);s.color[k]+=area*(ca[k]+cb[k]+cc[k])/3;}}
}
const finish=(s:Stats)=>({triangles:s.triangles,area:s.area,centroid:s.centroid.map(v=>v/(s.area||1)),color:s.color.map(v=>v/(s.area||1))});
const glassColor=(b:DetailBatch)=>{const m=b.material;if(m.kind!=='glass')return [1,1,1] as [number,number,number];const c=new Color(m.color);return [c.r,c.g,c.b] as [number,number,number];};
/** Free-face painted and see-through glass detail of a building (merged batches plus expanded instances), near and far. */
function opening(d:StudioDetailBatches,tier:'near'|'far'){
 const out={painted:empty(),glass:empty()};
 for(const b of d.batches){const kind=b.material.kind==='painted'?'painted':b.material.kind==='glass'&&b.material.seeThrough?'glass':null;if(!kind)continue;
  const [start,count]=tier==='near'?[0,b.near]:[b.farStart,b.far],gc=glassColor(b);
  accumulate(out[kind],k=>[b.positions[k*3],b.positions[k*3+1],b.positions[k*3+2]],k=>kind==='glass'?gc:[b.colors![k*3],b.colors![k*3+1],b.colors![k*3+2]],b.indices,start,count);}
 for(const g of d.openings?.groups??[]){const piece=lookupOpeningPiece(g.key)!;
  for(const [kind,geo] of [['painted',piece.painted],['glass',piece.glass]] as ['painted'|'glass',OpeningPieceGeometry|undefined][]){if(!geo)continue;const [start,count]=tier==='near'?[0,geo.near]:[geo.farStart,geo.far];
   for(let i=0;i<g.owners.length;i++){const m=g.matrices.subarray(i*16,i*16+16),t=g.tints.subarray(i*12,i*12+12);
    const pos=(k:number):[number,number,number]=>{const x=geo.positions[k*3],y=geo.positions[k*3+1],z=geo.positions[k*3+2];return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];};
    const col=(k:number):[number,number,number]=>{if(kind==='glass')return [t[9],t[10],t[11]];const s=geo.slots[k];return s?[t[(s-1)*3],t[(s-1)*3+1],t[(s-1)*3+2]]:[geo.colors[k*3],geo.colors[k*3+1],geo.colors[k*3+2]];};
    accumulate(out[kind],pos,col,geo.indices,start,count);}}}
 return {painted:finish(out.painted),glass:finish(out.glass)};
}

for(const [name,r] of FIXTURES)test(`instanced openings draw exactly what the merged detail drew: ${name}`,()=>{
 const legacy=buildStudioDetailBatches(resolve(r,false)),instanced=buildStudioDetailBatches(resolve(r));
 assert.ok(instanced.openings&&instanced.openings.count>0,'openings are instanced');
 for(const tier of ['near','far'] as const){const a=opening(legacy,tier),b=opening(instanced,tier);
  for(const kind of ['painted','glass'] as const){const x=a[kind],y=b[kind],label=`${name} ${tier} ${kind}`;
   assert.equal(y.triangles,x.triangles,`${label}: triangles`);
   assert.ok(Math.abs(y.area-x.area)<=Math.max(1e-3,x.area*2e-3),`${label}: area ${y.area} vs ${x.area}`);
   // Curved faces: instances apply the chord stretch exactly; the canonical pieces are quantised to 0.1 mm.
   for(let k=0;k<3;k++){assert.ok(Math.abs(y.centroid[k]-x.centroid[k])<2e-3,`${label}: centroid ${y.centroid} vs ${x.centroid}`);assert.ok(Math.abs(y.color[k]-x.color[k])<2e-3,`${label}: colour ${y.color} vs ${x.color}`);}
  }}
 // The wall with its cut holes is untouched.
 const wall=(d:StudioDetailBatches)=>d.batches.filter(b=>b.material.kind==='wall').reduce((n,b)=>n+b.indices.length,0);assert.equal(wall(instanced),wall(legacy));
});

test('repeated openings share one piece; most free-face detail becomes instanced',()=>{
 const d=buildStudioDetailBatches(resolve(FIXTURES[2][1])),legacy=buildStudioDetailBatches(resolve(FIXTURES[2][1],false)),o=d.openings!;
 assert.ok(o.groups.length*3<=o.count,`${o.count} openings from ${o.groups.length} pieces`);
 const merged=(x:StudioDetailBatches)=>x.batches.filter(b=>b.material.kind==='painted'||b.material.kind==='glass').reduce((n,b)=>n+b.near/3,0);
 assert.equal(merged(d),0,'no painted or glass detail left merged on straight faces');assert.ok(merged(legacy)>0);
 assert.ok(Math.abs(o.triangles.near-merged(legacy))<1,'instanced near triangles equal the merged ones they replace');
 const curved=buildStudioDetailBatches(resolve(FIXTURES[3][1]));assert.ok(merged(curved)>0,'curved surrounds follow the arc and stay merged');
 assert.ok(curved.openings!.triangles.near>merged(curved),'still most curved detail is instanced');
});

test('pieces are a pure function of their key: translated groups share it, and the tiers follow the options',()=>{
 const s=resolve(FIXTURES[0][1]),face=s.freeFaces!.find(f=>f.side==='north')!,g=face.groups.find(x=>x.members.includes('a'))!;
 const moved={...g,x0:g.x0+3.21,x1:g.x1+3.21,y0:g.y0+1.1,y1:g.y1+1.1,spring:g.spring+1.1,outline:g.outline.map(([x,y])=>[x+3.21,y+1.1] as [number,number]),panels:g.panels.map(p=>({...p,x0:p.x0+3.21,x1:p.x1+3.21,y0:p.y0+1.1,y1:p.y1+1.1,spring:p.spring+1.1})),mullions:g.mullions.map(m=>({x:m.x+3.21,y0:m.y0+1.1,y1:m.y1+1.1}))};
 const o={openable:false,surround:true,thickness:.3},a=openingPieceSpec(g,o),b=openingPieceSpec(moved,o);
 assert.equal(a.key,b.key);assert.ok(Math.abs(b.x-a.x-3.21)<1e-9&&Math.abs(b.y-a.y-1.1)<1e-9);
 assert.notEqual(openingPieceSpec(g,{...o,surround:false}).key,a.key);assert.notEqual(openingPieceSpec(g,{...o,openable:true}).key,a.key);
 assert.equal(openingPiece(moved,o),openingPiece(g,o),'one registry entry');
 // Doors: leaf in both tiers when closed, far only when an openable portal takes over near the camera.
 const door=s.freeFaces!.find(f=>f.side==='south')!.groups.find(x=>x.members.includes('door'))!,closed=openingPiece(door,o).painted!,open=openingPiece(door,{...o,openable:true}).painted!;
 assert.equal(closed.farStart,open.farStart,'trim and frame near-only either way');assert.ok(closed.near>open.near,'the openable leaf leaves the near range');assert.equal(closed.far,open.far,'far keeps the static leaf');
 assert.ok([...closed.slots].some(v=>v===3)&&[...closed.slots].some(v=>v===1)&&[...closed.slots].some(v=>v===0),'leaf, trim and fixed-colour (handle) slots');
});

test('city bakes carry the openings in world space and transfer only fresh arrays',()=>{
 const s=resolveSculpt(FIXTURES[2][1],{...newDesign('opening-pieces'),groundHeight:3.2,floors:4,middleFloors:3,crown:'none',roof:'flat'}),d=buildStudioDetailBatches(s.studio!);
 const bake=buildSculptCityBake(s,d,{design:newDesign('opening-pieces'),transform:{x:100,z:-50,rotation:Math.PI/2,scale:2}}),o=bake.openings!;
 assert.equal(o.count,d.openings!.count);assert.ok((bake.triangles.openings??0)>0);
 const local=d.openings!.groups[0].matrices,world=o.groups[0].matrices;
 // Local translation (x,y,z) → (100+2z, 2y, -50-2x) under a quarter turn and scale 2.
 assert.ok(Math.abs(world[12]-(100+2*local[14]))<1e-4&&Math.abs(world[13]-2*local[13])<1e-4&&Math.abs(world[14]-(-50-2*local[12]))<1e-4);
 const moved:StudioOpeningInstances=structuredClone(o,{transfer:openingTransferables(o)});
 assert.ok(o.groups.every(g=>g.matrices.byteLength===0),'instance arrays transferred');assert.ok(moved.pieces.every(p=>(p.painted?.positions.byteLength??1)>0),'pieces were copied, the registry keeps its own');
 assert.ok(d.openings!.groups[0].matrices.byteLength>0,'the building-local instances are untouched');
 assert.equal(transformOpeningInstances(d.openings!,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]).groups[0].matrices[12],d.openings!.groups[0].matrices[12]);
});

test('rectangular windows are far unit rectangles: same triangles, area and depth as their own far range',()=>{
 const d=buildStudioDetailBatches(resolve(FIXTURES[2][1])),pieces=d.openings!.groups.map(g=>lookupOpeningPiece(g.key)!),rects=pieces.filter(p=>p.farRect);
 assert.ok(rects.length>0&&rects.length<pieces.length,'rectangles and shaped windows both occur');
 for(const p of rects){const r=p.farRect!,unit=unitRectPiece(r.kind,r.z).glass!,own=p.glass!;
  assert.equal(own.far,unit.far,`${p.key}: triangles`);assert.equal(p.painted?.far??0,0,'no painted far detail');
  const far=(g:OpeningPieceGeometry,sx=1,sy=1)=>{const s=empty();accumulate(s,k=>[g.positions[k*3]*sx,g.positions[k*3+1]*sy,g.positions[k*3+2]],()=>[1,1,1],g.indices,g.farStart,g.far);return finish(s);};
  const a=far(own),b=far(unit,r.width,r.height);assert.ok(Math.abs(a.area-b.area)<1e-6,`${p.key}: area ${a.area} vs ${b.area}`);for(let k=0;k<3;k++)assert.ok(Math.abs(a.centroid[k]-b.centroid[k])<1e-6,`${p.key}: centroid`);
 }
 assert.equal(unitRectPiece('glass',-.05),unitRectPiece('glass',-.05),'one shared unit piece per kind and depth');
});
