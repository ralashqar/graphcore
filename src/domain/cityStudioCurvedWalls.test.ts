import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,sculptPrimitiveBoundary,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioBays,studioFloorCount} from './cityStudio.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';
import {CURVE,curveLength,curveMaxOpening,curveNormal,curvePoint,curveRadius,curveXAt,type FaceCurve} from './cityStudioFaceCurve.ts';
import {bendFreeFaceBuffers,bendPoint,bendPose,buildFaceBend,curveFacetStep} from './cityStudioCurvedWalls.ts';
import {faceX,freeOpeningHitFromBay,placeFreeOpening,resolveFreeOpenings,resolveStudioFreeFace,studioBayFaceSpans,studioFaceFrame,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {buildFreeOpeningFaceGeometry,FREE_FACE,type FreeFaceBuffers} from './cityStudioFreeOpeningGeometry.ts';
import {expandFacadeRhythm,newFacadeRhythm} from './cityStudioFacadeRhythm.ts';
import {fitFreeTrims} from './cityStudioTrimParts.ts';
import {studioFreeDoorPortals} from './cityStudioFreeDoors.ts';
import {buildStudioDetailBatches} from './cityStudioDetailBatches.ts';

const tower=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'tower',kind:'ellipse',operation:'add',x:0,z:0,width:8,depth:8,startFloor:0,spanFloors:3,...patch});
const recipe=(free:StudioFreeOpening[]=[],volumes=[tower()],extra:Partial<StudioRecipe['studio']>={}):StudioRecipe=>({version:5,volumes,attachments:[],plotSize:24,studio:{...freshStudio(),freeOpenings:free,...extra}});
const design=(r:StudioRecipe)=>({...newDesign('curve-test'),groundHeight:3.4,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const on=(id:string,u:number,bottom:number,width:number,height:number,shape:StudioFreeOpening['shape']='rect',extra:Partial<StudioFreeOpening>={}):StudioFreeOpening=>({id,shapeId:'tower',side:'curve',u,bottom,width,height,shape,...extra});
const triArea=(b:FreeFaceBuffers,i:number)=>{const p=(k:number)=>[b.positions[k*3],b.positions[k*3+1],b.positions[k*3+2]];const [a,c,e]=[p(b.indices[i]),p(b.indices[i+1]),p(b.indices[i+2])];const u=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],v=[e[0]-a[0],e[1]-a[1],e[2]-a[2]];return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;};

test('arc-length face coordinates round-trip and follow the documented convention',()=>{
 const c:FaceCurve={cx:1,cz:-2,a:5,b:3},L=curveLength(c),h=Math.pow(5-3,2)/Math.pow(5+3,2);
 assert.ok(Math.abs(L-Math.PI*8*(1+3*h/(10+Math.sqrt(4-3*h))))<1e-3,'perimeter matches Ramanujan');
 for(let i=0;i<=40;i++){const x=L*i/40,p=curvePoint(c,x),back=curveXAt(c,p[0],p[1]);assert.ok(Math.min(Math.abs(back-x),Math.abs(back-x+L),Math.abs(back-x-L))<1e-6,`x=${x}`);}
 // Seam at the back (-z), front (+z) at L/2, x runs to the viewer's right (+x at the front).
 const seam=curvePoint(c,0),front=curvePoint(c,L/2),ahead=curvePoint(c,L/2+.1);
 assert.ok(Math.abs(seam[0]-1)<1e-6&&Math.abs(seam[1]+5)<1e-6);assert.ok(Math.abs(front[0]-1)<1e-6&&Math.abs(front[1]-1)<1e-6);assert.ok(ahead[0]>front[0]);
 assert.deepEqual(curveNormal(c,L/2).map(v=>Math.round(v*1e6)/1e6+0),[0,1]);
 // Arc length is uniform: consecutive points 0.1 m of x apart are ~0.1 m apart in space.
 for(let x=0;x<L;x+=.37){const a=curvePoint(c,x),b=curvePoint(c,x+.1);assert.ok(Math.abs(Math.hypot(b[0]-a[0],b[1]-a[1])-.1)<2e-3);}
});

test('a round part exposes one curved face: frame, bay spans (seam split) and pointer hits map to arc x',()=>{
 const r=recipe(),d=design(r),f=studioFaceFrame(r,d,'tower','curve');
 assert.ok(!('reason' in f)&&f.curve,'curved frame');if('reason' in f)return;
 assert.ok(Math.abs(f.length-Math.PI*8)<1e-3);assert.equal(f.ground,true);
 const bays=studioBays(r,d).filter(b=>b.anchor.shapeId==='tower'&&b.anchor.floor===0);assert.ok(bays.length>=8);
 const spans=bays.flatMap(b=>studioBayFaceSpans(f,b));
 assert.ok(Math.abs(spans.reduce((s,[a,b])=>s+b-a,0)-f.length)<.05,'bays cover the ring in arc metres');
 assert.ok(bays.some(b=>studioBayFaceSpans(f,b).length===2)||spans.some(([a])=>Math.abs(a)<1e-6),'the seam is covered');
 // Hit on the front bay's chord plane maps to x near L/2 and places an opening there.
 const front=bays.sort((a,b)=>b.z-a.z)[0],hit=freeOpeningHitFromBay(r,d,front,{x:front.x,y:front.y+1.5,z:front.z})!;
 assert.equal(hit.side,'curve');assert.ok(Math.abs(faceX(f,hit.u)-f.length/2)<1.2);
 const placed=placeFreeOpening(r,d,hit,{width:1.2,height:1.5,shape:'rect'},studioBays(r,d));assert.ok(!('reason' in placed),'placed');
});

test('the bend is adaptive, planar per facet, flat across openings and crack-free',()=>{
 const small:FaceCurve={cx:0,cz:0,a:2,b:2},big:FaceCurve={cx:0,cz:0,a:10,b:10},oval:FaceCurve={cx:1,cz:0,a:5,b:2.5};
 for(const c of [small,big,oval]){
  const L=curveLength(c),b=buildFaceBend(c,L,[],{closed:true});
  for(let k=0;k+1<b.xs.length;k++){const chord=Math.hypot(b.px[k+1]-b.px[k],b.pz[k+1]-b.pz[k]),turn=(b.xs[k+1]-b.xs[k])/curveRadius(c,b.xs[k]);assert.ok(chord<=CURVE.maxChord+1e-9&&(turn<=CURVE.maxAngle*1.02||chord<=CURVE.minChord+1e-3),'facet within chord/angle limits');}
 }
 assert.ok(curveFacetStep(small)<curveFacetStep(big),'tighter curves get finer facets');
 assert.ok(buildFaceBend(big,curveLength(big),[]).xs.length<=Math.ceil(curveLength(big)/CURVE.maxChord)+1,'coarse where gentle');
 // A face with openings: build in face space with breaks, then bend.
 const c:FaceCurve={cx:0,cz:0,a:4,b:4},L=curveLength(c),H=9.8;
 const res=resolveFreeOpenings({length:L,height:H,ground:true,maxWidthAt:x=>curveMaxOpening(c,x)},[{id:'door',x:L/2,bottom:0,width:1.3,height:2.6,shape:'arch'},{id:'w1',x:L/2-3,bottom:4,width:1.1,height:1.6,shape:'rect'},{id:'w2',x:L/2+3,bottom:4,width:1,height:2,shape:'pointed'},{id:'rose',x:L/2,bottom:7.2,width:1,height:1,shape:'round'}]);
 assert.equal(res.inactive.length,0);
 const bend=buildFaceBend(c,L,res.groups,{closed:true}),flat=buildFreeOpeningFaceGeometry({length:L,height:H,breaks:bend.xs,seam:true},res.groups);
 // Flat mesh, welded: facet splitting adds no open edge (a slit/T-junction at a facet line would), and no open edge
 // runs along a facet line (where the bend would open a crack).
 const outer=flat.wall,rear=outer.rearStart!;
 const openEdges=(b:FreeFaceBuffers)=>{const pos=(i:number)=>[b.positions[i*3],b.positions[i*3+1],b.positions[i*3+2]],key=(i:number)=>pos(i).map(v=>Math.round(v*1e5)).join(','),edges=new Map<string,number>();
  for(let i=0;i<b.rearStart!;i+=3){const ids=[b.indices[i],b.indices[i+1],b.indices[i+2]];if(pos(ids[0])[2]<FREE_FACE.thickness/2-1e-6)continue;
   for(let e=0;e<3;e++){const a=key(ids[e]),c=key(ids[(e+1)%3]),k=a<c?`${a}|${c}`:`${c}|${a}`;edges.set(k,(edges.get(k)??0)+1);}}
  return [...edges].filter(([,n])=>n===1).map(([k])=>k.split('|').map(t=>t.split(',').map(v=>Number(v)/1e5)));};
 const split=openEdges(outer),plain=openEdges(buildFreeOpeningFaceGeometry({length:L,height:H,seam:true},res.groups).wall),len=(list:number[][][])=>list.reduce((t,[a,b])=>t+Math.hypot(a[0]-b[0],a[1]-b[1]),0);
 assert.ok(len(split)<=len(plain)+1e-6,`open edge length ${len(split).toFixed(3)} <= ${len(plain).toFixed(3)}`);
 assert.ok(!split.some(([a,b])=>Math.abs(a[0]-b[0])<1e-5&&a[0]>1e-4&&a[0]<L-1e-4&&bend.xs.some(x=>Math.abs(x-a[0])<1e-5)),'no open edge along a facet line');
 // Bent: no degenerate triangles, facets planar, outer skin on the offset arc, openings flat.
 const bent=bendFreeFaceBuffers(outer,bend);
 for(let i=0;i<bent.indices.length;i+=3)assert.ok(triArea(bent,i)>1e-8,`triangle ${i/3} degenerate`);
 for(let v=0;v<outer.positions.length/3;v++){
  const x=outer.positions[v*3],y=outer.positions[v*3+1],z=outer.positions[v*3+2],p=bendPoint(bend,x,y,z);
  assert.ok(Math.abs(bent.positions[v*3]-p[0])<1e-4&&Math.abs(bent.positions[v*3+2]-p[2])<1e-4);
  if(Math.abs(z-FREE_FACE.thickness/2)<1e-6){const rad=Math.hypot(p[0],p[2]);assert.ok(Math.abs(rad-4-FREE_FACE.thickness/2)<1e-2,`outer skin follows the arc: radius ${rad}`);}
 }
 // Area: the bent outer skin is the flat one stretched by (r+t)/r (holes included, so they follow the curve).
 let flatArea=0,bentArea=0;for(let i=0;i<rear;i+=3){const z=outer.positions[outer.indices[i]*3+2];if(z<FREE_FACE.thickness/2-1e-6)continue;flatArea+=triArea(outer,i);bentArea+=triArea(bent,i);}
 assert.ok(Math.abs(bentArea/(flatArea*(1+FREE_FACE.thickness/2/4))-1)<.005,`area ${flatArea.toFixed(2)} -> ${bentArea.toFixed(2)}`);
 // Planar parts: each group's glass is flat, inside the wall thickness, and its glazing line meets both jamb reveals.
 const glass=bendFreeFaceBuffers(flat.glass,bend),tags=flat.glass.planar!;assert.ok(tags&&tags.length===flat.glass.positions.length/3);
 res.groups.forEach((g,gi)=>{
  const pl=bend.planes[gi],pts:number[][]=[];for(let v=0;v<tags.length;v++)if(tags[v]===gi)pts.push([glass.positions[v*3],glass.positions[v*3+2]]);
  if(g.role==='window'){assert.ok(pts.length>=3,`${g.id} glass`);for(const [x,z] of pts){assert.ok(Math.abs((x-pl.ax)*pl.nx+(z-pl.az)*pl.nz)<1e-4,'glass is planar');const rad=Math.hypot(x,z);assert.ok(rad>4-FREE_FACE.thickness/2-1e-3&&rad<4+FREE_FACE.thickness/2,`glass inside the wall (${rad.toFixed(3)})`);}}
  for(const x of [g.x0,g.x1]){const p=bendPoint(bend,x,0,pl.z0,gi),a=bendPoint(bend,x,0,FREE_FACE.thickness/2),b=bendPoint(bend,x,0,-FREE_FACE.thickness/2),dx=b[0]-a[0],dz=b[2]-a[2];
   assert.ok(Math.abs(((p[0]-a[0])*dz-(p[2]-a[2])*dx)/Math.hypot(dx,dz))<1e-6,`${g.id}: glazing line meets the jamb reveal`);}
 });
});

test('tight radii narrow wide openings, refuse impossible ones and stop merging at the chord limit',()=>{
 const tight:FaceCurve={cx:0,cz:0,a:1.3,b:1.3},L=curveLength(tight),lim=curveMaxOpening(tight,L/2);
 assert.ok(lim>.3&&lim<1.2,`limit ${lim}`);
 const res=resolveFreeOpenings({length:L,height:6,ground:false,maxWidthAt:x=>curveMaxOpening(tight,x)},[{id:'ok',x:2,bottom:1,width:lim*.9,height:1.4,shape:'rect'},{id:'wide',x:5,bottom:1,width:lim*1.4,height:1.4,shape:'arch'},{id:'huge',x:7,bottom:3.5,width:lim*3,height:1.4,shape:'rect'}]);
 assert.deepEqual(res.inactive,[{id:'huge',reason:'This wall curves too tightly for an opening this wide.'}]);
 const wide=res.groups.find(g=>g.members.includes('wide'))!;assert.ok(wide.clamped&&Math.abs(wide.x1-wide.x0-lim)<1e-9,'narrowed to the limit');
 // Mullioned merging stops before a group outgrows the curve: three touching panels on a tight radius split up.
 const c:FaceCurve={cx:0,cz:0,a:3,b:3},lim3=curveMaxOpening(c,5),panels=[0,1,2].map(i=>({id:`p${i}`,x:4+i*.95,bottom:1,width:.85,height:1.6,shape:'rect' as const}));
 const merged=resolveFreeOpenings({length:curveLength(c),height:6,ground:false,maxWidthAt:x=>curveMaxOpening(c,x)},panels);
 assert.ok(merged.groups.every(g=>g.x1-g.x0<=lim3+1e-9),'groups within the chord limit');
 assert.equal(resolveFreeOpenings({length:20,height:6,ground:false},panels).groups.length,1,'straight faces still merge all three');
});

test('resolveSculpt: a round tower with openings owns its curved wall, suppresses kit tiles and bakes building space',()=>{
 const L=Math.PI*8,free=Array.from({length:12},(_,i)=>on(`w${i}`,((i%6)+.5)/6,i<6?4.3:7.2,1,1.5,i%3===1?'arch':'rect'));
 free.push(on('door',.5,0,1.3,2.5,'arch',{style:'timber'}));free[0]={...free[0],u:.52};free.splice(0,1);
 const r=recipe(free,[tower()],{paintRegions:[{id:'band',shapeId:'tower',side:'curve',channel:'wall',rects:[[0,L,3.2,3.9]],band:true,finish:{color:'#b85c4a'}}]}),d=design(r);
 const started=performance.now(),studio=resolveSculpt(r,d).studio!,ms=performance.now()-started;
 const face=studio.freeFaces!.find(f=>f.side==='curve')!;assert.ok(face&&face.bend&&face.curve,'curved free face');
 assert.deepEqual(studio.inactive.filter(i=>i.id.startsWith('w')||i.id==='door'),[]);
 assert.ok(!studio.pieces.some(p=>p.id.startsWith('tower/curve/')&&!p.id.includes('terrace')),'kit tiles of the curved wall are gone');
 // Paint band became a separately bent wall piece on the arc.
 assert.equal(face.geometry.wallPaint?.length,1);const band=face.geometry.wallPaint![0].buffers;
 for(let v=0;v<band.positions.length/3;v++){const y=band.positions[v*3+1];assert.ok(y>3.2-1e-4&&y<3.9+1e-4);const rad=Math.hypot(band.positions[v*3],band.positions[v*3+2]);assert.ok(rad>3.7&&rad<4.2,`band radius ${rad}`);}
 // Detail batches take curved faces as baked building-space geometry (only the base height is added).
 const batches=buildStudioDetailBatches({freeFaces:[face]}),wall=batches.batches.find(b=>b.material.kind==='wall')!;
 let maxRad=0;for(let v=0;v<wall.positions.length/3;v++)maxRad=Math.max(maxRad,Math.hypot(wall.positions[v*3],wall.positions[v*3+2]));
 assert.ok(maxRad<4+FREE_FACE.thickness/2+.02&&maxRad>4,`batch radius ${maxRad}`);
 assert.ok(Math.abs(wall.sphere[1]-(face.base+face.height/2))<1.5);
 console.log(`round tower, 12 windows + door: ${face.geometry.triangles} triangles near, resolveSculpt ${ms.toFixed(1)} ms, batches near ${batches.triangles.near} / far ${batches.triangles.far}`);
});

test('trims, doors and the facade rhythm work on curved faces',()=>{
 const r=recipe([on('door',.5,0,1.3,2.5,'arch',{style:'timber'}),on('win',.3,4.3,1.1,1.5,'rect')],[tower()],{freeTrims:[{openingId:'win',kinds:['shutters','lintel']},{openingId:'door',kinds:['canopy','lamps']}]}),d=design(r);
 const face=resolveSculpt(r,d).studio!.freeFaces!.find(f=>f.side==='curve')!,bend=face.bend!;
 const fitted=fitFreeTrims({length:face.length,height:face.height,groups:face.groups,groundTop:d.groundHeight-face.base},g=>g.members.includes('win')?['shutters','lintel']:['canopy','lamps']);
 assert.ok(fitted.placements.length>=5,'trims fit on the unrolled face');
 for(const p of fitted.placements){const pose=bendPose(bend,p.x,p.z),n=[Math.sin(pose.rotation),Math.cos(pose.rotation)],rad=Math.hypot(pose.x,pose.z),radial=[pose.x/rad,pose.z/rad];
  assert.ok(n[0]*radial[0]+n[1]*radial[1]>Math.cos(12*Math.PI/180),'trim faces outwards');assert.ok(rad>4-CURVE.sag&&rad<4+.3,`trim on the wall ${rad}`);}
 // Door portal sits on the chord through the doorway, facing out.
 const portals=studioFreeDoorPortals(face);assert.equal(portals.length,1);const gi=face.groups.findIndex(g=>g.role==='door'),g=face.groups[gi],pose=bendPose(bend,(g.x0+g.x1)/2,0,gi);
 assert.ok(Math.abs(portals[0].rotation-pose.rotation)<1e-9);assert.ok(Math.abs(portals[0].z-4)<.4&&Math.abs(portals[0].x)<.3,'door at the front');
 // Rhythm on a round tower lays columns around the ring with a door at the front.
 const rr=recipe([],[tower({width:10,depth:10,spanFloors:4})],{facadeRhythm:newFacadeRhythm('townhouse',3)}),dd=design(rr),exp=expandFacadeRhythm(rr,dd,studioBays(rr,dd));
 const round=exp.freeOpenings.filter(o=>o.side==='curve');assert.ok(round.length>=12,`rhythm openings ${round.length}`);
 const f=studioFaceFrame(rr,dd,'tower','curve');if('reason' in f)throw Error(f.reason);
 const doors=round.filter(o=>o.bottom<=.15);assert.ok(doors.length>=1&&doors.some(o=>Math.abs(faceX(f,o.u)-f.length/2)<2),'door near the front');
 const resolved=resolveStudioFreeFace({...rr,studio:{...rr.studio,freeOpenings:round}},dd,'tower','curve',studioBays(rr,dd));
 assert.ok(!('reason' in resolved)&&resolved.resolution.inactive.length===0,'every generated opening fits the curve');
 // Non-bent callers keep straight faces unchanged.
 const coarse=sculptPrimitiveBoundary(tower());assert.ok(coarse.length>=8);
});
