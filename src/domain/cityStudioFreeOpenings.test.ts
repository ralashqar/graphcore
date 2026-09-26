import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,validateSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioBays,studioFloorCount,validateStudio} from './cityStudio.ts';
import {validateModularBuilding} from './cityBuildingVariation.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';
import {faceX,freeOpeningHead,freeOpeningHitFromBay,freeOpeningOutline,nudgeFreeOpening,placeFreeOpening,removeFreeOpening,resolveFreeOpenings,resolveStudioFreeFace,studioFaceFrame,validateFreeOpenings,type FreeFaceOpening,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {buildFreeOpeningFaceGeometry,FREE_FACE,type FreeFaceBuffers} from './cityStudioFreeOpeningGeometry.ts';

const face={length:12,height:9.4,ground:true};
const o=(id:string,x:number,bottom:number,width:number,height:number,shape:FreeFaceOpening['shape']='rect'):FreeFaceOpening=>({id,x,bottom,width,height,shape});
const volume=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:10,startFloor:0,spanFloors:3,...patch});
const recipe=(free:StudioFreeOpening[]=[],volumes=[volume()]):StudioRecipe=>({version:5,volumes,attachments:[],plotSize:24,studio:{...freshStudio(),freeOpenings:free}});
const design=(r:StudioRecipe)=>({...newDesign('free-test'),groundHeight:3.4,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const free=(id:string,u:number,bottom:number,width:number,height:number,shape:StudioFreeOpening['shape']='rect',side:StudioFreeOpening['side']='north'):StudioFreeOpening=>({id,shapeId:'main',side,u,bottom,width,height,shape});
const area=(b:FreeFaceBuffers,i:number)=>{const p=(k:number)=>[b.positions[k*3],b.positions[k*3+1],b.positions[k*3+2]];const [a,c,e]=[p(b.indices[i]),p(b.indices[i+1]),p(b.indices[i+2])];const u=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],v=[e[0]-a[0],e[1]-a[1],e[2]-a[2]];return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;};

test('neighbouring windows with similar heights merge into one mullioned group',()=>{
 const r=resolveFreeOpenings(face,[o('a',4,4,1,1.6),o('b',5.15,4.1,1,1.5),o('c',9,4,1,1.6)]);
 assert.deepEqual(r.inactive,[]);assert.equal(r.groups.length,2);
 const merged=r.groups.find(g=>g.members.length===2)!;assert.deepEqual(merged.members,['a','b']);
 assert.equal(merged.mullions.length,1);assert.ok(Math.abs(merged.mullions[0].x-4.575)<1e-9,'mullion sits in the gap');
 assert.ok(merged.x0===3.5&&merged.x1===5.65&&merged.y0===4);assert.equal(merged.role,'window');
 // A tall/short pair shares < 60% of the smaller height and stays apart; too close is refused.
 const apart=resolveFreeOpenings(face,[o('a',4,4,1,1.6),o('b',5.3,5.3,1,1.6)]);assert.equal(apart.groups.length,2);
 const close=resolveFreeOpenings(face,[o('a',4,4,1,1.6),o('b',4.6,5.5,.9,.5,'round')]);assert.deepEqual(close.inactive,[{id:'b',reason:'Too close to another opening.'}]);
});
test('ground-touching openings on a ground-level part become doors',()=>{
 const r=resolveFreeOpenings(face,[o('door',3,.1,1.2,2.4,'arch'),o('win',8,.1,1,1.2)]);
 assert.deepEqual(r.groups.map(g=>g.role),['door','door']);assert.equal(r.groups[0].y0,0,'threshold at the base');assert.ok(Math.abs(r.groups[0].y1-2.5)<1e-9);
 assert.deepEqual(resolveFreeOpenings({...face,ground:false},[o('win',3,.1,1.2,2.4)]).groups.map(g=>g.role),['window'],'upper parts have no doors');
 assert.deepEqual(resolveFreeOpenings(face,[o('high',3,.4,1.2,2)]).groups.map(g=>g.role),['window']);
 assert.deepEqual(resolveFreeOpenings(face,[o('port',3,0,1,1,'round')]).groups.map(g=>g.role),['window'],'round openings never become doors');
});
test('openings are clamped inside the face; impossible ones are inactive with reasons',()=>{
 const r=resolveFreeOpenings(face,[o('edge',.2,4,1,1.5),o('wide',6,4,11.8,1),o('tall',6,1,1,9.5)]);
 assert.equal(r.groups.length,1);assert.equal(r.groups[0].x0,.3);assert.ok(r.groups[0].clamped);
 assert.deepEqual(r.inactive.map(i=>i.id),['wide','tall']);assert.ok(r.inactive.every(i=>i.reason.length>5));
 const hidden=resolveFreeOpenings({...face,region:[[0,6,0,9.4]]},[o('a',3,4,1,1.5),o('b',9,4,1,1.5)]);
 assert.deepEqual(hidden.inactive,[{id:'b',reason:'This part of the wall is hidden by another part.'}]);
});
test('arch and pointed heads tessellate smoothly between their springings',()=>{
 const arch=freeOpeningHead(0,2,3,1,false);assert.deepEqual(arch[0],[2,3]);assert.ok(Math.abs(arch.at(-1)![0])<1e-9&&Math.abs(arch.at(-1)![1]-3)<1e-9);
 for(const p of arch)assert.ok(Math.abs(Math.hypot(p[0]-1,p[1]-3)-1)<1e-9,'semicircle radius');
 assert.ok(arch.length>=16);
 const pointed=freeOpeningHead(0,2,3,1.7,true),apex=pointed.reduce((a,b)=>b[1]>a[1]?b:a);assert.ok(Math.abs(apex[0]-1)<1e-9&&Math.abs(apex[1]-4.7)<1e-9);
 const segmental=freeOpeningHead(0,2,3,.4,false);assert.ok(Math.abs(Math.max(...segmental.map(p=>p[1]))-3.4)<1e-9);
 const outline=freeOpeningOutline({shape:'arch',x0:0,x1:2,y0:0,y1:3,rise:1});
 const signed=outline.reduce((s,p,i)=>{const q=outline[(i+1)%outline.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
 assert.ok(signed>0,'counter-clockwise');assert.ok(Math.abs(signed-(2*2+Math.PI/2))<.03,'area ~ rect + half disc');
});
test('face geometry has real holes, reveals, no degenerate triangles and a bounded distance field',()=>{
 const res=resolveFreeOpenings(face,[o('door',2,0,1.3,2.6,'arch'),o('a',5,4,1,1.6),o('b',6.15,4,1,1.6),o('arch',9.5,4,1.1,2,'pointed'),o('rose',6,7.3,1,1,'round')]);
 assert.equal(res.groups.length,4);
 const g=buildFreeOpeningFaceGeometry(face,res.groups);
 for(const [name,b] of Object.entries(g).filter(([k])=>k!=='triangles') as [string,FreeFaceBuffers][]){
  assert.equal(b.positions.length%3,0);assert.equal(b.indices.length%3,0);assert.ok(b.indices.every(i=>i<b.positions.length/3),name);
  for(let i=0;i<b.indices.length;i+=3)assert.ok(area(b,i)>1e-7,`${name} triangle ${i/3} is degenerate`);
  for(let i=0;i<b.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(b.normals[i],b.normals[i+1],b.normals[i+2])-1)<1e-5,`${name} unit normals`);
 }
 // Front skin area = face minus opening areas (holes really cut).
 const w=g.wall;let front=0;for(let i=0;i<w.indices.length;i+=3){const k=w.indices[i];if(w.normals[k*3+2]>.99&&Math.abs(w.positions[k*3+2]-FREE_FACE.thickness/2)<1e-6)front+=area(w,i);}
 const holes=res.groups.reduce((s,gr)=>s+Math.abs(gr.outline.reduce((t,p,i)=>{const q=gr.outline[(i+1)%gr.outline.length];return t+p[0]*q[1]-q[0]*p[1];},0)/2),0);
 assert.ok(Math.abs(front-(12*9.4-holes))<1e-3,`front skin ${front} vs ${12*9.4-holes}`);
 // Distance attribute: zero on the reveal, bounded, and large far from openings.
 const d=w.distance!;assert.equal(d.length,w.positions.length/3);
 assert.ok(d.every(v=>v>=0&&v<=FREE_FACE.maxDistance+1e-6));assert.ok(d.some(v=>v===0));assert.ok(d.some(v=>v>=FREE_FACE.maxDistance-1e-6));
 let bandVerts=0;for(let k=0;k<d.length;k++)if(d[k]>.05&&d[k]<.46)bandVerts++;assert.ok(bandVerts>40,'band ring gives the wear gradient vertices');
 assert.ok(g.glass.indices.length>0&&g.door.indices.length>0&&g.trim.colors&&g.frame.colors);
});
test('studio faces own their wall: kit tiles removed, bays kept, validators stay strict for profiles',()=>{
 const openings=[free('door',.3,0,1.3,2.6,'arch'),free('a',.55,4.3,1,1.6),free('b',.64,4.3,1,1.6),free('rose',.5,7.6,1,1,'round')];
 const r=recipe(openings),d=design(r);assert.equal(validateStudio(r),null);assert.equal(validateSculpt(r,d.floors),null);
 const out=resolveSculpt(r,d).studio!;
 assert.equal(out.freeFaces?.length,1);const faceOut=out.freeFaces![0];assert.equal(faceOut.id,'main/north');assert.deepEqual(faceOut.floors,[0,1,2]);
 assert.ok(!out.pieces.some(p=>p.id.startsWith('main/north/')),'kit tiles on the free face are gone');
 assert.ok(out.pieces.some(p=>p.id.startsWith('main/south/')),'other faces keep their kit');
 assert.ok(out.bays.some(b=>b.id.startsWith('main/north/')),'bays remain for picking');
 assert.ok(out.bays.find(b=>b.entrance)?.anchor.side==='north','free door becomes the entrance');
 assert.equal(faceOut.groups.length,3);assert.deepEqual(out.inactive,[]);
 const door=faceOut.groups.find(g=>g.role==='door')!;
 assert.ok(!out.blockers.some(b=>b.id.startsWith('main/north/0/')&&Math.abs((b.x+6)-(door.x0+door.x1)/2)<b.width/2-.01),'the doorway is passable');
 // Local only: business modular profiles and preset imports reject the field.
 assert.equal(validateModularBuilding({version:1,template:'t',recipe:r}),false);
 assert.ok(validateVariationRecipe(r,d.floors));
 assert.ok(validateFreeOpenings([{...openings[0],extra:1}]));assert.ok(validateStudio(recipe([{...openings[0],width:40}])));
 assert.ok(validateStudio(recipe(Array.from({length:65},(_,i)=>free(`x${i}`,.5,4,1,1)))));
 assert.ok(validateStudio(recipe([openings[0],openings[0]])),'unique ids');
 // Curved or missing parts report inactive, never throw.
 const round=recipe([{...openings[1],shapeId:'ghost'}]);assert.deepEqual(resolveSculpt(round,design(round)).studio!.inactive.map(i=>i.reason),['This part no longer exists.']);
});
test('placement API maps bay hits, snaps doors, merges neighbours and refuses what cannot fit',()=>{
 const r=recipe(),d=design(r),bays=studioBays(r,d),f=studioFaceFrame(r,d,'main','south');assert.ok(!('reason' in f));
 assert.ok(f.flip,'south face runs against u');
 const bay=bays.find(b=>b.anchor.side==='south'&&b.anchor.floor===0)!;
 const hit=freeOpeningHitFromBay(r,d,bay,{x:bay.x,y:1.2,z:bay.z})!;assert.ok(Math.abs(hit.u-bay.anchor.u)<1e-9);assert.ok(Math.abs(hit.heightAboveBase-(1.2-.65))<1e-9);
 const placed=placeFreeOpening(r,d,hit,{width:1.2,height:2.4,shape:'arch',id:'door'},bays);assert.ok(!('reason' in placed));
 assert.equal(placed.role,'door');assert.equal(placed.opening.bottom,0);
 const window=placeFreeOpening(placed.recipe,d,{shapeId:'main',side:'north',u:.5,heightAboveBase:5},{width:1,height:1.6,shape:'rect',id:'w1'},bays);assert.ok(!('reason' in window));
 const f2=studioFaceFrame(r,d,'main','north');assert.ok(!('reason' in f2));
 const pair=placeFreeOpening(window.recipe,d,{shapeId:'main',side:'north',u:(faceX(f2,.5)+1.15)/12,heightAboveBase:5.1},{width:1,height:1.6,shape:'rect',id:'w2'},bays);assert.ok(!('reason' in pair));assert.ok(pair.merged);
 const moved=nudgeFreeOpening(pair.recipe,d,'w2',{dx:1.5},bays);assert.ok(!('reason' in moved));assert.equal(moved.merged,false);
 const blocked=nudgeFreeOpening(moved.recipe,d,'w2',{u:.5,bottom:5.85},bays);assert.ok('reason' in blocked&&/close/.test(blocked.reason));
 assert.ok('reason' in placeFreeOpening(r,d,hit,{width:12,height:1,shape:'rect'},bays));
 assert.ok('reason' in placeFreeOpening(recipe([],[volume({kind:'ellipse'})]),d,{shapeId:'main',side:'curve',u:.2,heightAboveBase:2},{width:1,height:1,shape:'rect'}));
 const clamped=placeFreeOpening(r,d,{shapeId:'main',side:'east',u:1,heightAboveBase:20},{width:1,height:1.4,shape:'rect'},bays);assert.ok(!('reason' in clamped));
 const east=studioFaceFrame(r,d,'main','east');assert.ok(!('reason' in east));assert.ok(faceX(east,clamped.opening.u)<=east.length-.3-.5+1e-9&&clamped.opening.bottom+1.4<=east.height-.2+1e-9);
 assert.equal(removeFreeOpening(moved.recipe,'w2').studio.freeOpenings!.length,2);assert.equal(removeFreeOpening(recipe([free('x',.5,4,1,1)]),'x').studio.freeOpenings,undefined);
 const faceState=resolveStudioFreeFace(moved.recipe,d,'main','north',bays);assert.ok(!('reason' in faceState)&&faceState.resolution.groups.length===2);
});
test('resolving a face with ten openings stays interactive',()=>{
 const openings=Array.from({length:10},(_,i)=>o(`o${i}`,1+(i%5)*2.3,i<5?.0:4.5,1+(i%3)*.1,i<5?2.3:1.6,(['rect','arch','pointed','round'] as const)[i%4]));
 for(let k=0;k<10;k++)buildFreeOpeningFaceGeometry(face,resolveFreeOpenings(face,openings).groups);
 const start=performance.now();let triangles=0;const runs=20;
 for(let k=0;k<runs;k++){const res=resolveFreeOpenings(face,openings);triangles=buildFreeOpeningFaceGeometry(face,res.groups).triangles;}
 const ms=(performance.now()-start)/runs;console.log(`free face with 10 openings: ${ms.toFixed(2)} ms resolve+geometry, ${triangles} triangles`);
 assert.ok(ms<100,`resolve took ${ms} ms`);
});
