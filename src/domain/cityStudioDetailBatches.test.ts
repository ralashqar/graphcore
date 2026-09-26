import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioFloorCount} from './cityStudio.ts';
import {editStudioRoof} from './cityStudioRoofEnvelope.ts';
import {FREE_FACE,type FreeFaceBuffers} from './cityStudioFreeOpeningGeometry.ts';
import {buildStudioDetailBatches,detailTransferables,withoutDetailGeometry,type StudioDetailBatches} from './cityStudioDetailBatches.ts';
import type {StudioFreeFace} from './cityStudioFreeFaces.ts';
import type {StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import type {StudioRoofOpening} from './cityStudioRoofOpenings.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const volume=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:2,...patch});
const free=(id:string,side:StudioFreeOpening['side'],u:number,bottom:number,width:number,height:number,shape:StudioFreeOpening['shape']='rect',extra:Partial<StudioFreeOpening>={}):StudioFreeOpening=>({id,shapeId:'main',side,u,bottom,width,height,shape,...extra});
function fixture(){
 const openings:StudioRoofOpening[]=[{id:'sky',partId:'main',facing:0,u:.15,v:.6,width:.9,height:1.3,kind:'skylight'},{id:'dormer',partId:'main',facing:0,u:.5,v:.25,width:1.7,height:1.45,kind:'dormer',roof:'gable',shape:'rect'}];
 let r:StudioRecipe={version:5,volumes:[volume()],attachments:[],plotSize:24,studio:{...freshStudio(),roofOpenings:openings}};
 r=editStudioRoof(r,['main'],{type:'pitched',settings:{rise:3.8,overhang:.3,ridge:'x'}});
 r.studio.freeOpenings=[free('door','north',.5,0,1.3,2.5,'arch',{style:'timber'}),free('a','north',.15,.9,1,1.6),free('b','north',.85,.9,1,1.6,'arch',{style:'stone'}),free('c','north',.3,4.2,1,1.5,'pointed',{style:'stone'}),free('open','north',.7,4.2,1.1,1.5,'rect',{glazing:false}),free('e','east',.5,.9,1.2,1.5)];
 const design={...newDesign('detail-batches'),groundHeight:3.4,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const};
 return resolveSculpt(r,design).studio!;
}
const sum=<T,>(list:T[],f:(t:T)=>number)=>list.reduce((n,t)=>n+f(t),0);
const sources=(s:ReturnType<typeof fixture>):FreeFaceBuffers[]=>[...(s.freeFaces??[]).flatMap(f=>[f.geometry.wall,f.geometry.trim,f.geometry.frame,f.geometry.glass,f.geometry.door,...(f.geometry.aperture?[f.geometry.aperture]:[])]),...(s.roofOpenings??[]).flatMap(p=>[p.geometry.wall,p.geometry.trim,p.geometry.frame,p.geometry.glass,p.geometry.roof,p.geometry.flashing])];
function checkBatches(d:StudioDetailBatches){
 for(const b of d.batches){const count=b.positions.length/3;
  assert.equal(b.normals.length,count*3);assert.equal(b.uvs.length,count*2);if(b.distance)assert.equal(b.distance.length,count);if(b.colors)assert.equal(b.colors.length,count*3);
  assert.ok(b.indices.every(i=>i<count),`${b.key} indices in range`);assert.equal(b.indices instanceof Uint16Array,count<=65535,`${b.key} compact index type`);
  assert.equal(b.farStart+b.far,b.indices.length,`${b.key} far range ends the buffer`);assert.ok(b.farStart<=b.near&&b.near<=b.indices.length,`${b.key} near/far ranges overlap in the shared middle`);
  let at=0;for(const o of b.owners){assert.equal(o.start,at,`${b.key} owners tile the index buffer`);at+=o.count;}assert.equal(at,b.indices.length);
  for(let k=0;k<count;k++){const [x,y,z]=[b.positions[k*3]-b.sphere[0],b.positions[k*3+1]-b.sphere[1],b.positions[k*3+2]-b.sphere[2]];assert.ok(Math.hypot(x,y,z)<=b.sphere[3]+1e-4,`${b.key} bounding sphere`);}
 }
}

test('free wall packaging: inner skin indexed last, unglazed openings get far-only aperture fills',()=>{
 const s=fixture(),north=s.freeFaces!.find(f=>f.side==='north')!,w=north.geometry.wall,t=FREE_FACE.thickness/2;
 assert.ok(w.rearStart!>0&&w.rearStart!<w.indices.length);
 for(let i=w.rearStart!;i<w.indices.length;i++){const k=w.indices[i];assert.ok(w.normals[k*3+2]<-.99&&Math.abs(w.positions[k*3+2]+t)<1e-6,'rear section is the inner skin');}
 assert.ok(north.geometry.aperture&&north.geometry.aperture.indices.length>0,'the unglazed window has a far fill');
 assert.equal(s.freeFaces!.find(f=>f.side==='east')!.geometry.aperture,undefined,'glazed faces need none');
 assert.equal(north.geometry.triangles,sum(['wall','trim','frame','glass','door'] as const,k=>north.geometry[k].indices.length/3),'triangle count unchanged by packaging');
});

test('one building merges into one batch per material with every vertex and index preserved',()=>{
 const s=fixture(),d=buildStudioDetailBatches(s),src=sources(s);
 assert.deepEqual(s.inactive,[]);assert.equal(s.freeFaces!.length,2);assert.equal(s.roofOpenings!.length,1);
 checkBatches(d);
 assert.equal(sum(d.batches,b=>b.positions.length),sum(src,b=>b.positions.length),'vertices preserved');
 assert.equal(sum(d.batches,b=>b.indices.length),sum(src,b=>b.indices.length),'indices preserved');
 assert.deepEqual(d.batches.map(b=>b.material.kind).sort(),['glass','painted','roof','wall'],'wall, painted (trim/frame/door/flashing), glass and roof');
 const faceCalls=sum(s.freeFaces!,f=>(['wall','trim','frame','glass','door'] as const).filter(k=>f.geometry[k].indices.length).length)+sum(s.roofOpenings!,p=>(['wall','trim','frame','glass','roof','flashing'] as const).filter(k=>p.geometry[k].indices.length).length);
 assert.ok(d.batches.length*3<=faceCalls,`${faceCalls} per-face meshes become ${d.batches.length}`);
 assert.ok(d.triangles.far<d.triangles.near*.6,`far LOD drops most detail (${d.triangles.far} of ${d.triangles.near})`);
 const painted=d.batches.find(b=>b.material.kind==='painted')!,wall=d.batches.find(b=>b.material.kind==='wall')!;
 assert.ok(painted.far>0&&painted.far<painted.near*.1,'far keeps door leaves only');assert.equal(wall.near,wall.indices.length,"no far-only wall");assert.ok(wall.far<wall.near,'far wall drops the inner skin');
 assert.deepEqual([...new Set(wall.owners.map(o=>o.id))].sort(),['main/east','main/north','roof/main'],'owners per face and roof part');
});

test('face frames and tiers: rotation, offset and [near-only, both, far-only] index order',()=>{
 const tri=(z:number):FreeFaceBuffers=>({positions:new Float32Array([0,0,z,1,0,z,0,1,z]),normals:new Float32Array([0,0,1,0,0,1,0,0,1]),uvs:new Float32Array(6),indices:new Uint32Array([0,1,2]),distance:new Float32Array([0,.5,1]),colors:new Float32Array([.2,.3,.4,.2,.3,.4,.2,.3,.4])});
 const empty:FreeFaceBuffers={positions:new Float32Array(0),normals:new Float32Array(0),uvs:new Float32Array(0),indices:new Uint32Array(0)};
 const wall=tri(.15);const both={...wall,positions:new Float32Array([...wall.positions,0,0,-.15,0,1,-.15,1,0,-.15]),normals:new Float32Array([...wall.normals,0,0,-1,0,0,-1,0,0,-1]),uvs:new Float32Array(12),distance:new Float32Array(6),indices:new Uint32Array([0,1,2,3,4,5]),rearStart:3};
 const face={id:'f',shapeId:'main',side:'east',origin:[2,3],rotation:Math.PI/2,base:1,length:1,height:1,family:'pastel-stucco',finishes:{},floors:[0],groups:[],geometry:{wall:both,trim:tri(.2),frame:empty,glass:empty,door:empty,aperture:tri(0),triangles:3}} as unknown as StudioFreeFace;
 const d=buildStudioDetailBatches({freeFaces:[face]});checkBatches(d);
 const w=d.batches.find(b=>b.material.kind==='wall')!;
 // Local (1,0,0.15) rotated a quarter turn about +Y then offset: (0.15+2, 1, -1+3).
 assert.deepEqual([...w.positions.slice(3,6)].map(v=>+v.toFixed(5)),[2.15,1,2]);assert.deepEqual([...w.normals.slice(0,3)].map(v=>+v.toFixed(5)),[1,0,0]);
 assert.deepEqual([...w.indices],[3,4,5,0,1,2],'near-only inner skin first');assert.deepEqual([w.near,w.farStart,w.far],[6,3,3]);
 const glass=d.batches.find(b=>b.material.kind==='glass')!;assert.deepEqual([glass.near,glass.farStart,glass.far],[0,0,3],'aperture fills draw only when far');
 const painted=d.batches.find(b=>b.material.kind==='painted')!;assert.deepEqual([painted.near,painted.far],[3,0]);assert.deepEqual([...painted.colors!.slice(0,3)].map(v=>+v.toFixed(3)),[.2,.3,.4]);
});

test('batches transfer without copying and the resolved result is left intact',()=>{
 const s=fixture(),d=buildStudioDetailBatches(s),transfer=detailTransferables(d);
 const arrays=d.batches.flatMap(b=>[b.positions,b.normals,b.uvs,b.indices,b.distance,b.colors].filter(Boolean));
 assert.equal(transfer.length,arrays.length,'one buffer per typed array');assert.equal(new Set(transfer).size,transfer.length);
 const before=s.freeFaces![0].geometry.wall.positions.length,stripped=withoutDetailGeometry(s);
 assert.equal(stripped.freeFaces![0].geometry.wall.positions.length,0);assert.equal(stripped.roofOpenings![0].geometry.roof.indices.length,0);
 assert.equal(stripped.freeFaces![0].geometry.triangles,s.freeFaces![0].geometry.triangles);assert.equal(s.freeFaces![0].geometry.wall.positions.length,before,'input untouched');
 const moved=structuredClone(d,{transfer});
 assert.ok(d.batches.every(b=>b.positions.byteLength===0),'sender buffers are detached');checkBatches(moved);
 assert.ok(s.freeFaces![0].geometry.wall.positions.byteLength>0,'resolver buffers were never transferred');
});
