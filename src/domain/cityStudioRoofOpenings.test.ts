import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,validateSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioFloorCount,validateStudio} from './cityStudio.ts';
import {editStudioRoof} from './cityStudioRoofEnvelope.ts';
import {validateModularBuilding} from './cityBuildingVariation.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import type {StudioRecipe,StudioRoofFace} from './cityStudioTypes.ts';
import {findRoofSlope,multiArea,nudgeRoofOpening,placeRoofOpening,removeRoofOpening,resolveRoofOpeningLayouts,roofFaceRayHit,roofOpeningAtHit,roofOpeningGhost,roofOpeningHitFromFace,slopePoint,studioRoofSlopes,validateRoofOpenings,ROOF_OPENING,ROOF_OPENING_PRESETS,type StudioRoofOpening} from './cityStudioRoofOpenings.ts';
import {studioRoofOpeningPass,type RoofOpeningGeometry} from './cityStudioRoofOpeningGeometry.ts';

const volume=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:2,...patch});
const recipe=(openings:StudioRoofOpening[]=[],roof:'pitched'|'hip'|'gambrel'|'flat'='pitched',settings={rise:3.8,overhang:.3,ridge:'x' as const}):StudioRecipe=>{
 const r:StudioRecipe={version:5,volumes:[volume()],attachments:[],plotSize:24,studio:{...freshStudio(),roofOpenings:openings}};
 return editStudioRoof(r,['main'],{type:roof,settings});
};
const design=(r:StudioRecipe)=>({...newDesign('roof-openings'),groundHeight:3.4,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const resolve=(r:StudioRecipe)=>resolveSculpt(r,design(r)).studio!;
const sky=(id:string,u:number,v:number,facing=0,patch:Partial<StudioRoofOpening>={}):StudioRoofOpening=>({id,partId:'main',facing,u,v,width:.9,height:1.3,kind:'skylight',...patch});
const dormer=(id:string,u:number,v:number,roof:'gable'|'flat'|'shed'='gable',facing=0,patch:Partial<StudioRoofOpening>={}):StudioRoofOpening=>({id,partId:'main',facing,u,v,width:1.7,height:1.45,kind:'dormer',roof,shape:'rect',...patch});
const faceArea=(faces:StudioRoofFace[])=>faces.reduce((s,f)=>s+multiArea([f.polygon]),0);
/** True (sloped) area of roof triangles facing the given upward normal. */
function slopeArea(vertices:number[],normal:[number,number,number]){let sum=0;for(let i=0;i<vertices.length;i+=9){const a=vertices.slice(i,i+3),u=[vertices[i+3]-a[0],vertices[i+4]-a[1],vertices[i+5]-a[2]],v=[vertices[i+6]-a[0],vertices[i+7]-a[1],vertices[i+8]-a[2]],n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(n[0],n[1],n[2]);if(l>1e-12&&(n[0]*normal[0]+n[1]*normal[1]+n[2]*normal[2])/l>.999)sum+=l/2;}return sum;}
function checkBuffers(g:RoofOpeningGeometry){
 for(const [name,b] of Object.entries(g)){if(typeof b==='number')continue;const count=b.positions.length/3;
  assert.equal(b.normals.length,count*3,name);if(b.distance)assert.equal(b.distance.length,count,name);if(b.colors)assert.equal(b.colors.length,count*3,name);
  for(let k=0;k<count;k++)assert.ok(Math.abs(Math.hypot(b.normals[k*3],b.normals[k*3+1],b.normals[k*3+2])-1)<1e-4,`${name} unit normal`);
  for(let i=0;i<b.indices.length;i+=3){const p=(j:number)=>[b.positions[j*3],b.positions[j*3+1],b.positions[j*3+2]],[a,c,e]=[p(b.indices[i]),p(b.indices[i+1]),p(b.indices[i+2])];
   assert.ok(b.indices[i]<count&&b.indices[i+1]<count&&b.indices[i+2]<count,name);
   const u=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],v=[e[0]-a[0],e[1]-a[1],e[2]-a[2]],n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],area=Math.hypot(n[0],n[1],n[2])/2;
   assert.ok(area>1e-9,`${name} degenerate triangle`);
   const k=b.indices[i],dot=(n[0]*b.normals[k*3]+n[1]*b.normals[k*3+1]+n[2]*b.normals[k*3+2])/(2*area);assert.ok(dot>0,`${name} winding agrees with its normal`);
  }}
}

test('validation: local studio accepts roof openings, business profiles reject them',()=>{
 const good=[sky('s',.3,.5),dormer('d',.6,.3)];assert.equal(validateRoofOpenings(good),null);
 const r=recipe(good),d=design(r);assert.equal(validateStudio(r),null);assert.equal(validateSculpt(r,d.floors),null);
 for(const bad of [[{...good[0],extra:1}],[{...good[0],kind:'hatch'}],[{...good[0],roof:'gable'}],[{...good[1],roof:'dome'}],[{...good[0],u:1.2}],[{...good[0],width:9}],[{...good[0],facing:360}],[{...good[0],tier:1.5}],[good[0],good[0]]])assert.ok(validateRoofOpenings(bad),JSON.stringify(bad));
 assert.ok(validateRoofOpenings(Array.from({length:ROOF_OPENING.limit+1},(_,i)=>sky(`s${i}`,.5,.5))));
 assert.ok(validateStudio(recipe([{...good[0],width:40}])));
 assert.equal(validateModularBuilding({version:1,template:'t',recipe:r}),false);
 assert.ok(validateVariationRecipe(r,d.floors));
});

test('slopes: gable, hip and gambrel faces get stable facing and tier descriptors',()=>{
 const gable=studioRoofSlopes(resolve(recipe()).roofFaces!);assert.deepEqual(gable.map(s=>s.facing).sort((a,b)=>a-b),[0,180]);assert.ok(gable.every(s=>s.tier===0));
 const front=findRoofSlope(gable,'main',0)!;assert.ok(front.q1-front.q0>4.7&&front.x1-front.x0>12.5,'plan extent includes the eaves');
 const hip=studioRoofSlopes(resolve(recipe([],'hip')).roofFaces!);assert.deepEqual(hip.map(s=>s.facing).sort((a,b)=>a-b),[0,90,180,270]);
 const gambrel=studioRoofSlopes(resolve(recipe([],'gambrel')).roofFaces!).filter(s=>s.facing===0);assert.deepEqual(gambrel.map(s=>s.tier).sort(),[0,1]);
 const lower=findRoofSlope(gambrel,'main',0,0)!,upper=findRoofSlope(gambrel,'main',0,1)!;assert.ok(lower.k>upper.k,'the eave tier is steeper');
 // The descriptor survives rise/overhang edits and gable -> hip; turning the ridge loses it.
 const openings=[sky('s',.5,.5)];assert.deepEqual(resolve(recipe(openings,'pitched',{rise:2.5,overhang:.1,ridge:'x'})).inactive,[]);
 assert.deepEqual(resolve(recipe(openings,'hip')).inactive,[]);
 assert.deepEqual(resolve(recipe(openings,'pitched',{rise:3.8,overhang:.3,ridge:'z' as 'x'})).inactive.map(i=>i.reason),['This roof slope no longer exists.']);
});

test('rules: clamping, overlaps, shallow slopes and unsupported roofs are reported, never moved',()=>{
 const edge=resolveRoofOpeningLayouts(recipe([sky('edge',0,1)]),resolve(recipe()).roofFaces!);assert.deepEqual(edge.inactive,[]);
 const l=edge.layouts[0],s=l.slope,e=Math.max(ROOF_OPENING.edge,.3+.15);assert.ok(l.clamped);
 assert.ok(Math.abs(l.hole[0][0]-(s.x0+e))<1e-6&&Math.abs(l.hole[2][1]-(s.q1-e))<1e-6,'clamped to the margins');
 const r=recipe([sky('a',.3,.5),sky('b',.33,.5),dormer('far',.7,.2),dormer('big',.5,.5,'gable',180,{width:6,height:4}),{...sky('ghost',.5,.5),partId:'nope'},sky('side',.5,.5,90)]);
 assert.deepEqual(resolve(r).inactive,[{id:'b',reason:'Too close to another roof opening.'},{id:'big',reason:'This slope is too shallow for a dormer this tall.'},{id:'ghost',reason:'This part no longer exists.'},{id:'side',reason:'This roof slope no longer exists.'}]);
 assert.equal(r.studio.roofOpenings![1].u,.33,'stored intent unchanged');
 assert.deepEqual(resolve(recipe([dormer('low',.5,.3)],'pitched',{rise:1.2,overhang:.3,ridge:'x'})).inactive.map(i=>i.reason),['This slope is too shallow for a dormer.']);
 assert.deepEqual(resolve(recipe([dormer('short',.5,.3,'gable',0,{height:.8})])).inactive.map(i=>i.reason),['This dormer is too low for a window.']);
 assert.deepEqual(resolve(recipe([sky('flat',.5,.5)],'flat')).inactive.map(i=>i.reason),['Roof openings need a pitched roof.']);
 const legacy=recipe([sky("old",.5,.5)]);delete legacy.studio.roofRevision;delete legacy.studio.parts.main.roofSettings;assert.deepEqual(resolve(legacy).inactive.map(i=>i.reason),['Enable connected roof editing to add roof openings.']);
});

test('holes: the roof loses exactly the opening area, edges along holes get no trim, faces stay whole for picking',()=>{
 const base=recipe(),bare=resolve(base),r=recipe([sky('s',.3,.5)]),out=resolve(r);assert.deepEqual(out.inactive,[]);
 const pass=studioRoofOpeningPass(r,bare.roofFaces!),slope=findRoofSlope(studioRoofSlopes(bare.roofFaces!),'main',0)!;
 assert.ok(Math.abs(faceArea(bare.roofFaces!)-faceArea(pass.faces)-.9*1.3/slope.m)<1e-6,'plan area drops by the hole');
 assert.ok(pass.faces.some(f=>f.polygon.length===2),'the slope face now has a hole ring');
 assert.ok(Math.abs(faceArea(out.roofFaces!)-faceArea(bare.roofFaces!))<1e-9,'published roof faces are not cut');
 const n:[number,number,number]=[slope.k*slope.g[0]/slope.m,1/slope.m,slope.k*slope.g[1]/slope.m],top=(o:typeof out)=>o.roofPatches!.reduce((sum,p)=>sum+slopeArea(p.vertices,n),0);
 assert.ok(Math.abs(top(bare)-top(out)-.9*1.3)<1e-4,`sloped surface loses ${top(bare)-top(out)}`);
 for(const p of out.roofPatches!)for(const list of [p.vertices,p.wallVertices!])for(let i=0;i<list.length;i+=9){const a=list.slice(i,i+3),u=list.slice(i+3,i+6).map((v,k)=>v-a[k]),v=list.slice(i+6,i+9).map((w,k)=>w-a[k]);assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-10);}
 assert.ok(out.roofPatches![0].wallVertices!.length>bare.roofPatches![0].wallVertices!.length,'the shaft is closed by the envelope');
 assert.equal(out.roofEdges!.length,bare.roofEdges!.length,'no eave/rake trims along the hole');
 assert.equal(out.decks.filter(d=>d.id.startsWith('roof/')).length,bare.decks.filter(d=>d.id.startsWith('roof/')).length);
});

test('dormer geometry: closed shells with consistent normals, cheeks and panels meet the slope',()=>{
 const r=recipe([dormer('g',.3,.25,'gable'),dormer('f',.7,.25,'flat'),dormer('s',.5,.25,'shed',180,{width:3.4,height:1.35}),dormer('a',.8,.3,'gable',180,{shape:'arch',width:1.6,height:1.7}),sky('k',.1,.6)]),out=resolve(r);
 assert.deepEqual(out.inactive,[]);const part=out.roofOpenings![0];assert.equal(part.openings.length,5);checkBuffers(part.geometry);
 assert.ok(part.geometry.wall.distance&&part.geometry.trim.colors&&part.geometry.frame.colors&&part.geometry.glass.indices.length&&part.geometry.roof.indices.length&&part.geometry.flashing.indices.length);
 assert.equal(out.blockers.filter(b=>b.id.startsWith('roof-opening/')).length,4,'dormers block walking, skylights do not');
 const faces=resolve(recipe()).roofFaces!,{layouts}=resolveRoofOpeningLayouts(r,faces);
 for(const l of layouts.filter(l=>l.dormer)){const s=l.slope,d=l.dormer!,plane=(x:number,z:number)=>s.plane[0]*x+s.plane[1]*z+s.plane[2];
  // Every roof-panel vertex is above or on the slope (within the panel thickness at its buried back edge).
  const b=part.geometry.roof,near:number[]=[];for(let k=0;k<b.positions.length/3;k++){const x=b.positions[k*3],y=b.positions[k*3+1],z=b.positions[k*3+2],[lx,lq]=[x*s.t[0]+z*s.t[1],-(x*s.g[0]+z*s.g[1])];if(Math.abs(lx-l.xc)<d.hw+.3&&lq>l.qc-.3&&lq<l.qc+d.depth+.2)near.push(y-plane(x,z));}
  assert.ok(near.length&&Math.min(...near)>-ROOF_OPENING.panel-.12,`${l.o.id} panels stay on the slope`);
  assert.ok(Math.abs(slopePoint(s,l.xc+d.hw,l.qc+d.H/(s.k-d.ks))[1]-(d.y0+d.H+d.ks*d.H/(s.k-d.ks)))<1e-9,`${l.o.id} cheek top meets the slope`);
  assert.ok(l.hole.every(p=>Math.abs(p[0]-l.xc)<d.hw&&p[1]>l.qc&&p[1]<l.qc+d.under(p[0]-l.xc)),`${l.o.id} hole stays inside the dormer`);
 }
});

test('UI API: ray hit, place, pick, nudge, ghost and remove',()=>{
 const r=recipe(),d=design(r),faces=resolve(r).roofFaces!,slope=findRoofSlope(studioRoofSlopes(faces),'main',0)!;
 const target=slopePoint(slope,(slope.x0+slope.x1)/2-2,(slope.q0+slope.q1)/2),ray=roofFaceRayHit(faces,[target[0],target[1]+20,target[2]+20],[0,-20/Math.hypot(20,20),-20/Math.hypot(20,20)])!;
 assert.ok(ray&&Math.hypot(ray.point[0]-target[0],ray.point[1]-target[1],ray.point[2]-target[2])<1e-6);
 const hit=roofOpeningHitFromFace(r,d,faces,{x:ray.point[0],y:ray.point[1],z:ray.point[2]})!;assert.equal(hit.partId,'main');assert.equal(hit.facing,0);assert.ok(Math.abs(hit.v-.5)<1e-6);
 assert.equal(roofOpeningHitFromFace(r,d,faces,{x:0,y:0,z:0}),null,'off the roof');
 const ghost=roofOpeningGhost(r,d,faces,hit,ROOF_OPENING_PRESETS[1].preset)!;assert.ok(ghost.valid&&ghost.triangles.length>=27&&ghost.outline.length===5);
 const placed=placeRoofOpening(r,d,faces,hit,{...ROOF_OPENING_PRESETS[1].preset,id:'d1'});assert.ok(!('reason' in placed));
 const opening=placed.recipe.studio.roofOpenings![0];assert.equal(opening.kind,'dormer');assert.equal(opening.roof,'gable');
 const layout=resolveRoofOpeningLayouts(placed.recipe,faces).layouts[0];assert.ok(Math.abs(layout.xc-hit.x)<1e-6&&Math.abs(layout.qc+layout.dormer!.depth/2-hit.q)<1e-6,'dormer footprint centred on the hit');
 assert.equal(roofOpeningAtHit(placed.recipe,d,faces,hit)?.id,'d1');
 const clash=placeRoofOpening(placed.recipe,d,faces,hit,{...ROOF_OPENING_PRESETS[0].preset,id:'s1'});assert.ok('reason' in clash&&/close/.test(clash.reason));
 assert.equal(roofOpeningGhost(placed.recipe,d,faces,hit,ROOF_OPENING_PRESETS[0].preset)!.valid,false);
 const moved=nudgeRoofOpening(placed.recipe,d,faces,'d1',{dx:3});assert.ok(!('reason' in moved));assert.ok(moved.opening.u>opening.u);
 const wide=nudgeRoofOpening(placed.recipe,d,faces,'d1',{roof:'shed',width:3});assert.ok(!('reason' in wide)&&wide.opening.roof==='shed');
 const sky1=placeRoofOpening(moved.recipe,d,faces,hit,{...ROOF_OPENING_PRESETS[0].preset,id:'s1'});assert.ok(!('reason' in sky1));
 assert.equal(removeRoofOpening(sky1.recipe,'d1').studio.roofOpenings!.length,1);assert.equal(removeRoofOpening(placed.recipe,'d1').studio.roofOpenings,undefined);
 assert.ok('reason' in placeRoofOpening(recipe([],'pitched',{rise:1,overhang:.3,ridge:'x'}),d,resolve(recipe([],'pitched',{rise:1,overhang:.3,ridge:'x'})).roofFaces!,hit,ROOF_OPENING_PRESETS[1].preset));
});

test('six openings resolve quickly',()=>{
 const r=recipe([sky('s1',.12,.55),dormer('d1',.38,.22),dormer('d2',.66,.22,'gable',0,{shape:'arch',width:1.6,height:1.7}),sky('s2',.9,.6),dormer('d3',.45,.22,'shed',180,{width:3.4,height:1.35}),sky('s3',.85,.6,180)]),bare=recipe(),d=design(r);
 for(let i=0;i<3;i++){resolveSculpt(r,d);resolveSculpt(bare,d);}
 const runs=10,time=(x:StudioRecipe)=>{const t=performance.now();for(let i=0;i<runs;i++)resolveSculpt(x,d);return (performance.now()-t)/runs;};
 const withMs=time(r),withoutMs=time(bare),faces=resolve(bare).roofFaces!,t=performance.now();for(let i=0;i<runs;i++)studioRoofOpeningPass(r,faces);const passMs=(performance.now()-t)/runs;
 const out=resolve(r);assert.deepEqual(out.inactive,[]);
 console.log(`six roof openings: resolveSculpt ${withMs.toFixed(1)} ms vs ${withoutMs.toFixed(1)} ms bare; opening pass ${passMs.toFixed(1)} ms; ${out.roofOpenings![0].geometry.triangles} triangles`);
 assert.ok(passMs<60,`opening pass took ${passMs} ms`);
});
