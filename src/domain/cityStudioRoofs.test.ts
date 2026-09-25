import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {freshStudio,studioFloorCount} from './cityStudio.ts';
import {resolveSculpt,validateSculpt,type SculptVolume} from './citySculpt.ts';
import {ROOF_TYPES,editStudioRoof,connectedRoofParts} from './cityStudioRoofEnvelope.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';
const volume=(id:string,patch:Partial<SculptVolume>={}):SculptVolume=>({id,kind:'rectangle',operation:'add',x:0,z:0,width:8,depth:10,startFloor:0,spanFloors:1,...patch});
const recipe=(volumes=[volume('wing')]):StudioRecipe=>({version:5,volumes,attachments:[],plotSize:24,studio:{...freshStudio(),roofRevision:'roof-envelope-2',defaults:{roof:'pitched',roofSettings:{rise:2,overhang:0}}}});
const design=(r:StudioRecipe)=>({...newDesign('roof'),groundHeight:3,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const});
const resolve=(r:StudioRecipe)=>resolveSculpt(r,design(r)).studio!;
const area=(r:StudioRecipe,id:string)=>resolve(r).roofFaces!.filter(f=>f.partId===id).reduce((sum,f)=>sum+f.polygon.reduce((a,ring,i)=>a+(i?-1:1)*Math.abs(ring.reduce((s,p,j)=>{const q=ring[(j+1)%ring.length];return s+p[0]*q[1]-p[1]*q[0];},0))/2,0),0);
test('all ten roof families produce finite closed geometry with identifiable faces',()=>{for(const type of ROOF_TYPES){const r=editStudioRoof(recipe(),['wing'],{type:type.id}),out=resolve(r);assert.ok(out.roof.length,type.id);assert.ok(out.roof.every(Number.isFinite),type.id);assert.ok(out.roofFaces!.length,type.id);assert.equal(validateSculpt(r,1),null);}});
test('a low gable terminates at a taller occupied wall and has flashing edges',()=>{const r=recipe([volume('wing',{z:2}),volume('tower',{z:-4,depth:6,spanFloors:3})]),out=resolve(r);assert.ok(out.roofEdges!.some(e=>e.partId==='wing'&&e.kind==='abutment'));for(const f of out.roofFaces!.filter(f=>f.partId==='wing'))for(const ring of f.polygon)assert.ok(ring.every(p=>p[1]>=-1-.001));});
test('an elevated bridge does not erase a low roof beneath it',()=>{const r=recipe(),before=area(r,'wing');r.volumes.push(volume('bridge',{width:4,depth:10,startFloor:4}));assert.ok(Math.abs(area(r,'wing')-before)<.001);});
test('a courtyard cut stays open through every roof family',()=>{for(const type of ROOF_TYPES){const r=editStudioRoof(recipe([volume('wing'),volume('hole',{operation:'subtract',width:3,depth:3})]),['wing'],{type:type.id});for(const f of resolve(r).roofFaces!)for(const ring of f.polygon)for(const p of ring)assert.ok(Math.abs(p[0])>=1.499||Math.abs(p[1])>=1.499,type.id);}});
test('mixed roof resolution does not depend on volume insertion order',()=>{const r=recipe([volume('a',{x:-2,width:8}),volume('b',{x:3,width:6,depth:6})]);r.studio.parts.b={roof:'hip',roofSettings:{rise:3}};const before=area(r,'a')+area(r,'b');r.volumes.reverse();assert.ok(Math.abs(area(r,'a')+area(r,'b')-before)<.0001);});
test('roof edits preserve old snapshots and apply only to connected same-storey parts',()=>{const r=recipe([volume('a'),volume('b',{x:7}),volume('c',{x:-8,width:2,depth:2})]);delete r.studio.roofRevision;const next=editStudioRoof(r,connectedRoofParts(r,'a'),{type:'shed',settings:{rise:3}});assert.equal(r.studio.roofRevision,undefined);assert.equal(next.studio.parts.b.roof,'shed');assert.equal(next.studio.parts.c,undefined);assert.equal(next.studio.roofRevision,'roof-envelope-2');});
test('roof dimensions and finishes are validated before saving',()=>{const r=editStudioRoof(recipe(),['wing'],{settings:{rise:100}});assert.ok(validateSculpt(r,1));});

import {studioRoofExample} from './cityStudioRoofExamples.ts';
import {createLandWorld,initialLandDraft} from './cityLand.ts';
import {StudioWalkingCollision,studioDeckHeight} from './cityStudioCollision.ts';
test('all six roof reference properties resolve at both plot sizes',()=>{for(const size of [24,48] as const){const plot=createLandWorld([],72,size).plots[0];for(let i=0;i<6;i++){const draft=studioRoofExample(initialLandDraft(plot),i,size),out=resolveSculpt(draft.sculpt!,draft.design).studio!;assert.ok(out.roofPatches!.length);assert.ok(out.roof.every(Number.isFinite));if(i===0)assert.ok(out.roofEdges!.some(e=>e.kind==='abutment'));}}});
test('roof rise, direction and eaves affect the generated envelope',()=>{let r=recipe();const base=resolve(r).roof;r=editStudioRoof(r,['wing'],{settings:{rise:4}});assert.notDeepEqual(resolve(r).roof,base);const before=area(r,'wing');r=editStudioRoof(r,['wing'],{settings:{overhang:.6}});assert.ok(area(r,'wing')>before);const raised=resolve(r).roof;r=editStudioRoof(r,['wing'],{settings:{ridge:'x'}});assert.notDeepEqual(resolve(r).roof,raised);});
test('roof collision uses its sloped plane and solid underside',()=>{const r=editStudioRoof(recipe(),['wing'],{type:'shed',settings:{rise:2}}),out=resolve(r),world=new StudioWalkingCollision();world.set({id:'p',x:0,z:0,rotation:0,scale:1,result:out});assert.ok(world.ground(3,0,10)>world.ground(-3,0,10));assert.ok(Math.abs(world.ceiling(0,0,1)-3.65)<.001);});
test('legacy recipes keep the old roof path until an explicit edit',()=>{const r=recipe();delete r.studio.roofRevision;delete r.studio.defaults.roofSettings;assert.equal(resolve(r).roofFaces,undefined);const updated=editStudioRoof(r,['wing'],{type:'hip'});assert.ok(resolve(updated).roofFaces?.length);assert.equal(r.studio.roofRevision,undefined);});

test('external gable closure faces outward so it is visible from the street',()=>{const vertices=resolve(recipe()).roofPatches![0].wallVertices!;let closures=0;for(let i=0;i<vertices.length;i+=9){const a=vertices.slice(i,i+3),b=vertices.slice(i+3,i+6),c=vertices.slice(i+6,i+9);if(Math.abs(a[2]-b[2])<1e-6&&Math.abs(a[2]-c[2])<1e-6&&Math.abs(Math.abs(a[2])-5)<1e-6){const nz=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(nz)>1e-6){assert.ok(nz*a[2]>0);closures++;}}}assert.ok(closures>=4);});

import {sculptFloorBottom,sculptFloorTop} from './citySculpt.ts';
function inVolume(p:number[],v:SculptVolume,strict=true){const e=strict?1e-5:-1e-5;return Math.abs(p[0]-v.x)<v.width/2-e&&Math.abs(p[2]-v.z)<v.depth/2-e&&p[1]>sculptFloorBottom(v.startFloor,3)+e&&p[1]<sculptFloorTop(v.startFloor+v.spanFloors-1,3)-e;}
function assertOutsideBuilding(r:StudioRecipe){
 const out=resolve(r),adds=r.volumes.filter(v=>v.operation==='add'),cuts=r.volumes.filter(v=>v.operation==='subtract');
 for(let i=0;i<out.roof.length;i+=9){const t=[out.roof.slice(i,i+3),out.roof.slice(i+3,i+6),out.roof.slice(i+6,i+9)];
  for(const weights of [[1,0,0],[0,1,0],[0,0,1],[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]){const p=[0,1,2].map(axis=>weights.reduce((sum,w,j)=>sum+w*t[j][axis],0));assert.ok(!adds.some(v=>inVolume(p,v))||cuts.some(v=>inVolume(p,v,false)),`roof penetrates union at ${p}`);}
 }
 return out;
}
test('whole roof solids clear intersecting upper storeys, including undersides and gables',()=>{
 for(const rise of [2,5,8])for(const startFloor of [1,2]){let r=recipe([volume('wing'),volume('upper',{x:1,z:-2,width:5,depth:6,startFloor,spanFloors:1})]);r=editStudioRoof(r,['wing'],{settings:{rise}});assertOutsideBuilding(r);}
});
test('subtracting a tunnel from a raised union preserves roof inside the opening',()=>{
 let r=recipe([volume('wing'),volume('bridge',{width:8,depth:4,startFloor:2}),volume('tunnel',{operation:'subtract',width:3,depth:4,startFloor:2})]);r=editStudioRoof(r,['wing'],{settings:{rise:8}});const out=assertOutsideBuilding(r);
 assert.ok(out.roofFaces!.some(f=>f.partId==='wing'&&studioDeckHeight({id:'probe',x:0,z:0,y:0,width:0,depth:0,rotation:0,polygon:f.polygon,plane:f.plane},0,0)!==null));
});
test('a bridge caps the lower roof without allowing it to re-emerge through the bridge roof',()=>{
 const r=editStudioRoof(recipe([volume('wing'),volume('bridge',{width:4,depth:4,startFloor:2})]),['wing'],{settings:{rise:8}});r.studio.parts.bridge={roof:'flat'};const out=assertOutsideBuilding(r),bottom=sculptFloorBottom(2,3),top=sculptFloorTop(2,3);
 assert.ok(out.roofFaces!.some(f=>f.partId==='wing'&&f.plane[0]===0&&f.plane[1]===0&&f.plane[2]===bottom));
 assert.ok(!out.roofFaces!.some(f=>f.partId==='wing'&&studioDeckHeight({id:'probe',x:0,z:0,y:0,width:0,depth:0,rotation:0,polygon:f.polygon,plane:f.plane},0,0)!==null&&f.plane[2]>top));
 const world=new StudioWalkingCollision();world.set({id:'p',x:0,z:0,rotation:0,scale:1,result:out});assert.equal(world.ceiling(0,0,bottom+.01),top);
});
test('gable infill follows wall finish and only level exposed edges get gutters',()=>{
 const r=recipe();r.studio.parts.wing={finishes:{wall:{color:'#123456'}}};const out=resolve(r);assert.equal(out.roofPatches![0].wallColor,'#123456');assert.ok(out.roofPatches![0].wallVertices!.length);
 assert.ok(out.roofEdges!.some(e=>e.kind==='rake'));for(const e of out.roofEdges!.filter(e=>e.kind==='eave'))assert.ok(Math.abs(e.a[1]-e.b[1])<.001);
});
test('connected selection excludes disjoint round parts with overlapping bounding boxes',()=>{
 const r=recipe([volume('a',{kind:'ellipse',width:4,depth:4}),volume('b',{kind:'ellipse',width:4,depth:4,x:3,z:3})]);assert.deepEqual(connectedRoofParts(r,'a'),['a']);
});
test('ending a wing at its neighbour differs from joining slopes and leaves no union penetration',()=>{
 const r=recipe([volume('a',{x:-2}),volume('b',{x:2})]),joined=resolve(r).roof;
 const ended=editStudioRoof(r,['a'],{settings:{connection:'abut'}});assert.notDeepEqual(resolve(ended).roof,joined);assertOutsideBuilding(ended);
});
test('a ridge crossing source-part ownership remains a ridge, not a valley',()=>{
 const r=recipe([volume('left',{x:-2,width:4}),volume('right',{x:2,width:4})]);
 r.studio.parts.left={roof:'shed'};r.studio.parts.right={roof:'shed',roofSettings:{flip:true}};
 const seams=resolve(r).roofEdges!.filter(e=>Math.abs(e.a[0])<1e-6&&Math.abs(e.b[0])<1e-6);
 assert.ok(seams.length);assert.ok(seams.every(e=>e.kind==='ridge'));
});
test('T-shaped intersecting wings produce valleys and no internal gutters',()=>{
 const r=recipe([volume('hall',{width:12,depth:4,z:-2}),volume('wing',{width:4,depth:8,z:2})]);r.studio.parts.hall={roofSettings:{ridge:'x'}};
 const out=assertOutsideBuilding(r);assert.ok(out.roofEdges!.some(e=>e.kind==='valley'));
 for(const e of out.roofEdges!.filter(e=>e.kind==='eave'))assert.ok(Math.abs(e.a[1]-e.b[1])<.001);
});
test('curved obstruction junctions resolve without non-finite or degenerate triangles',()=>{
 const r=recipe([volume('wing'),volume('tower',{kind:'ellipse',x:1,z:-2,width:5,depth:5,spanFloors:3})]);r.studio.parts.tower={roof:'cone'};
 const out=resolve(r);assert.ok(out.roofEdges!.some(e=>e.kind==='abutment'));assert.ok(out.roof.every(Number.isFinite));
 for(let i=0;i<out.roof.length;i+=9){const [a,b,c]=[out.roof.slice(i,i+3),out.roof.slice(i+3,i+6),out.roof.slice(i+6,i+9)],u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]);assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-10);}
});
test('resizing, moving, serializing and restoring a roof host preserves valid junctions',()=>{
 const r=recipe([volume('wing'),volume('upper',{x:2,z:-2,width:4,depth:5,startFloor:1,spanFloors:2})]);
 const original=resolve(r).roof;
 for(const x of [-2,0,2])for(const width of [3,6]){const edited=structuredClone(r);Object.assign(edited.volumes[1],{x,width});assertOutsideBuilding(JSON.parse(JSON.stringify(edited)));}
 assert.deepEqual(resolve(r).roof,original);
});

import {sculptFootprint,sculptPrimitiveBoundary} from './citySculpt.ts';
import {bevelOutlineCorner,recessOutlineCorner} from './cityStudioOutline.ts';
import {roofFlashingGeometry} from './cityRoofFlashing.ts';
import {ROOF_WALL_CLEARANCE} from './cityStudioRoofEnvelope.ts';
const polygonArea=(polygons:number[][][][])=>polygons.reduce((total,p)=>total+p.reduce((sum,ring,i)=>sum+(i?-1:1)*Math.abs(ring.reduce((s,a,j)=>{const b=ring[(j+1)%ring.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2,0),0);
test('a beveled roof host follows its edited outline and leaves the clipped corner uncovered',()=>{
 const r=recipe([bevelOutlineCorner(volume('wing',{width:8,depth:8}),2,2,'roof-corner')]);
 const out=resolve(r),faces=out.roofFaces!.filter(face=>face.partId==='wing');
 assert.equal(validateSculpt(r,1),null);assert.ok(faces.length);assert.ok(out.roof.every(Number.isFinite));
 for(const face of faces)for(const ring of face.polygon)for(const [x,z] of ring)assert.ok(!(x>2.01&&z>2.01&&x+z>6.01),`roof crosses beveled corner at ${x}, ${z}`);
});
test('a gabled roof over a recessed corner keeps the entry void and finite independent faces',()=>{
 const r=recipe([recessOutlineCorner(volume('wing',{width:8,depth:8}),2,2,'entry')]),out=resolve(r);
 assert.equal(validateSculpt(r,1),null);assert.ok(out.roofFaces!.length);assert.ok(out.roof.every(Number.isFinite));
 for(const face of out.roofFaces!.filter(face=>face.partId==='wing'))for(const ring of face.polygon)for(const [x,z] of ring)assert.ok(!(x>2.01&&z>2.01),`roof bridges recess at ${x}, ${z}`);
});
test('all roof families resolve a concave recessed part without invalid roof triangles',()=>{
 for(const type of ROOF_TYPES)for(const overhang of [0,.6]){const r=editStudioRoof(recipe([recessOutlineCorner(volume('wing',{width:8,depth:8}),2,2,`roof-${type.id}`)]),['wing'],{type:type.id,settings:{overhang}});let out;try{out=resolve(r);}catch(error){throw new Error(`${type.id} overhang ${overhang}: ${error instanceof Error?error.message:error}`);}assert.equal(validateSculpt(r,1),null,type.id);assert.ok(out.roof.every(Number.isFinite),type.id);for(let i=0;i<out.roof.length;i+=9){const a=out.roof.slice(i,i+3),b=out.roof.slice(i+3,i+6),c=out.roof.slice(i+6,i+9),u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]);assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-10,type.id);}}
});
function assertBoundaryFit(r:StudioRecipe){
 const resolved=resolveSculpt(r,design(r)),out=resolved.studio!,walls=resolved.floors[1].polygons,edges=walls.flatMap(p=>p.flatMap(r=>r.map((a,i)=>[a,r[(i+1)%r.length]]))),joins=out.roofEdges!.filter(e=>e.partId==='wing'&&e.kind==='abutment');
 assert.ok(joins.length);
 for(const e of joins)for(const t of [.25,.5,.75]){const p=[e.a[0]+t*(e.b[0]-e.a[0]),e.a[2]+t*(e.b[2]-e.a[2])],edx=e.b[0]-e.a[0],edz=e.b[2]-e.a[2],el=Math.hypot(edx,edz);
  assert.ok(edges.some(([a,b])=>{const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);return Math.abs(edx*dz-edz*dx)/(el*length)<1e-5&&Math.abs((dz*(p[0]-a[0])-dx*(p[1]-a[1]))/length-ROOF_WALL_CLEARANCE)<1e-5;}),`cut lacks a parallel tile face at ${p}`);}
 const perimeter=edges.reduce((sum,[a,b])=>sum+Math.hypot(b[0]-a[0],b[1]-a[1]),0),joined=joins.reduce((sum,e)=>sum+Math.hypot(e.b[0]-e.a[0],e.b[2]-e.a[2]),0);
 assert.ok(joined>perimeter*.85,`wall boundary incomplete: ${joined} / ${perimeter}`);
 const actual=polygonArea(out.roofFaces!.filter(f=>f.partId==='wing').map(f=>f.polygon)),structural=441-polygonArea(walls);
 assert.ok(structural-actual>perimeter*ROOF_WALL_CLEARANCE*.75,`roof did not clear the wall tile: ${actual} / ${structural}`);
}
test('roof cuts clear the visible curved wall tiles at every bay subdivision size',()=>{
 for(const [width,depth] of [[3,3],[6,4],[12,10],[18,14],[20,20]])for(const roof of ['flat','pitched','mansard'] as const){
  const r=recipe([volume('wing',{width:21,depth:21}),volume('tower',{kind:'ellipse',width,depth,startFloor:1,spanFloors:2})]);r.studio.parts.wing={roof};r.studio.parts.tower={roof:'flat'};assertBoundaryFit(r);
 }
});
test('a roof follows the resolved union of curved and rectangular upper walls',()=>{
 const r=recipe([volume('wing',{width:21,depth:21}),volume('round',{kind:'ellipse',width:9,depth:7,x:-1,startFloor:1,spanFloors:2}),volume('rear',{width:5,depth:6,x:2,z:-2,startFloor:1,spanFloors:2})]);r.studio.parts.round={roof:'flat'};r.studio.parts.rear={roof:'flat'};assertBoundaryFit(r);
});
test('circular courtyard cuts and flat circular roofs share the canonical wall facets',()=>{
 const cut=volume('hole',{kind:'ellipse',operation:'subtract',width:5,depth:7});const r=recipe([volume('wing',{width:14,depth:14}),cut]);
 const holeArea=polygonArea(sculptFootprint([{...cut,operation:'add'}]));assert.ok(Math.abs(area(r,'wing')-(196-holeArea))<1e-5);
 const round=volume('round',{kind:'ellipse',width:9,depth:5});const flat=editStudioRoof(recipe([round]),['round'],{type:'flat'}),boundary=sculptPrimitiveBoundary(round);
 assert.ok(Math.abs(area(flat,'round')-polygonArea([[boundary]]))<1e-5);
});
test('conical eaves retain wall facet count and parallel edges when overhang changes',()=>{
 const part=volume('cone',{kind:'ellipse',width:6,depth:4}),boundary=sculptPrimitiveBoundary(part);
 for(const overhang of [0,.2,1.2]){const out=resolve(editStudioRoof(recipe([part]),['cone'],{type:'cone',settings:{overhang}})),eaves=out.roofEdges!.filter(e=>e.kind==='eave');assert.equal(eaves.length,boundary.length);
  for(const e of eaves){const dx=e.b[0]-e.a[0],dz=e.b[2]-e.a[2];assert.ok(boundary.some((p,i)=>{const q=boundary[(i+1)%boundary.length];return Math.abs(dx*(q[1]-p[1])-dz*(q[0]-p[0]))<1e-5;}));}
 }
});
test('wall flashing shares mitred corner sections rather than overlapping independent bars',()=>{
 const vertices=roofFlashingGeometry([{partId:'a',kind:'abutment',a:[0,3,0],b:[2,4,0]},{partId:'a',kind:'abutment',a:[2,4,0],b:[2,5,2]}]);
 assert.equal(vertices.length,20*9);assert.ok(vertices.every(Number.isFinite));
 const corner=[];for(let i=0;i<vertices.length;i+=3)if(Math.abs(vertices[i]-2)<.2&&Math.abs(vertices[i+2])<.2)corner.push(vertices.slice(i,i+3).map(n=>n.toFixed(6)).join('/'));
 assert.equal(new Set(corner).size,4,'both strips must use the same four corner vertices');
});
