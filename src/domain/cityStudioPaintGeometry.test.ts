import test from 'node:test';
import assert from 'node:assert/strict';
import {Color} from 'three';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioBays,studioFloorCount,validateStudio} from './cityStudio.ts';
import {buildFreeOpeningFaceGeometry,freeOpeningDistance,FREE_FACE,type FreeFaceBuffers} from './cityStudioFreeOpeningGeometry.ts';
import {resolveFreeOpenings,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {buildStudioDetailBatches} from './cityStudioDetailBatches.ts';
import {finishKey,paintPartition,type FacePaint} from './cityStudioPaintGeometry.ts';
import {addPaintStroke,brushRect,fillPaintFace,paintBand,recolorPaintRegion,erasePaintAt,paintRegionAt} from './cityStudioPaintRegions.ts';
import {validateModularBuilding} from './cityBuildingVariation.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const t=FREE_FACE.thickness/2;
type Tri={a:number[];b:number[];c:number[];ids:number[]};
function outerTris(b:FreeFaceBuffers,end=b.rearStart??b.indices.length):Tri[]{
 const out:Tri[]=[],p=(k:number)=>[b.positions[k*3],b.positions[k*3+1],b.positions[k*3+2]];
 for(let i=0;i<end;i+=3){const ids=[b.indices[i],b.indices[i+1],b.indices[i+2]];if(ids.every(k=>Math.abs(b.positions[k*3+2]-t)<1e-6&&b.normals[k*3+2]>.99))out.push({a:p(ids[0]),b:p(ids[1]),c:p(ids[2]),ids});}
 return out;
}
const area=(list:Tri[])=>list.reduce((s,{a,b,c})=>s+Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/2,0);
const centroid=({a,b,c}:Tri)=>[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3];

const face={length:8,height:6};
const groups=resolveFreeOpenings({...face,ground:true},[{id:'w',x:2.5,bottom:1,width:1.2,height:1.6,shape:'arch'},{id:'d',x:6,bottom:0,width:1.2,height:2.4,shape:'rect'}]).groups;
const paint:FacePaint={base:undefined,
 wall:[{finish:{color:'#aa0000'},rects:[[1,4,0,3.2]]},{finish:{texture:'brick'},rects:[[-1e4,1e4,0,.8]]},{finish:{color:'#aa0000'},rects:[[6.5,7.5,4,5]]}],
 trim:[{finish:{color:'#112233'},rects:[[1.5,3.5,.5,3]]}]};
/** Expected finish of a face point: topmost layer containing it, clipped to the face. */
const expected=(x:number,y:number)=>{for(let i=paint.wall.length-1;i>=0;i--)if(paint.wall[i].rects.some(q=>x>=Math.max(0,q[0])&&x<=Math.min(face.length,q[1])&&y>=q[2]&&y<=q[3]))return finishKey(paint.wall[i].finish);return finishKey(undefined);};

test('painted outer skin: area preserved, pieces carry their region finish, wear distance kept',()=>{
 const plain=buildFreeOpeningFaceGeometry(face,groups),painted=buildFreeOpeningFaceGeometry(face,groups,undefined,paint);
 assert.equal(plain.wallPaint,undefined);
 assert.deepEqual(painted.wallPaint!.map(p=>finishKey(p.finish)).sort(),[finishKey({color:'#aa0000'}),finishKey({texture:'brick'})].sort(),'one buffer per distinct finish');
 const base=outerTris(painted.wall),pieces=painted.wallPaint!.map(p=>({key:finishKey(p.finish),tris:outerTris(p.buffers)}));
 const total=area(base)+pieces.reduce((s,p)=>s+area(p.tris),0);
 assert.ok(Math.abs(total-area(outerTris(plain.wall)))<1e-3,`outer skin area preserved (${total.toFixed(4)} vs ${area(outerTris(plain.wall)).toFixed(4)})`);
 for(const tri of base){const [x,y]=centroid(tri);assert.equal(expected(x,y),finishKey(undefined),`base triangle at ${x.toFixed(2)},${y.toFixed(2)}`);}
 for(const p of pieces)for(const tri of p.tris){const [x,y]=centroid(tri);assert.equal(expected(x,y),p.key,`painted triangle at ${x.toFixed(2)},${y.toFixed(2)}`);}
 // Region areas: the red square minus the band and the window hole, the band minus the door.
 const red=pieces.find(p=>p.key===finishKey({color:'#aa0000'}))!,brick=pieces.find(p=>p.key===finishKey({texture:'brick'}))!;
 assert.ok(area(red.tris)>3*2.4-1.2*1.6-.1&&area(red.tris)<3*2.4+1+.01,`red area ${area(red.tris).toFixed(3)}`);
 assert.ok(Math.abs(area(brick.tris)-(8*.8-1.2*.8))<.02,`band minus the door (${area(brick.tris).toFixed(3)})`);
 // Wear: every painted skin vertex carries the distance the unpainted wall interpolates at that point.
 const plainTris=outerTris(plain.wall),plainD=plain.wall.distance!,interp=(x:number,y:number)=>{for(const tri of plainTris){const [a,b,c]=[tri.a,tri.b,tri.c],den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]),l1=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,l2=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,l3=1-l1-l2;if(l1>=-1e-6&&l2>=-1e-6&&l3>=-1e-6)return l1*plainD[tri.ids[0]]+l2*plainD[tri.ids[1]]+l3*plainD[tri.ids[2]];}return null;};
 for(const p of [{buffers:painted.wall},...painted.wallPaint!]){const b=p.buffers;assert.ok(b.distance&&b.distance.length===b.positions.length/3,'distance attribute');
  for(const tri of outerTris(b,b===painted.wall?painted.wall.rearStart:undefined))for(const k of tri.ids){const want=interp(b.positions[k*3],b.positions[k*3+1]);assert.ok(want!==null&&Math.abs(b.distance![k]-want)<1e-4,`distance at ${b.positions[k*3]},${b.positions[k*3+1]}`);}}
 for(let k=0;k<plainD.length;k++)if(plain.wall.normals[k*3+2]>.99)assert.ok(Math.abs(plainD[k]-freeOpeningDistance(plain.wall.positions[k*3],plain.wall.positions[k*3+1],groups))<1e-5);
 // Inner skin untouched and still last in the base wall.
 const rear=(g:typeof plain)=>(g.wall.indices.length-g.wall.rearStart!)/3;assert.equal(rear(painted),rear(plain));
 assert.equal(painted.triangles,(['wall','trim','frame','glass','door'] as const).reduce((s,k)=>s+painted[k].indices.length/3,0)+painted.wallPaint!.reduce((s,p)=>s+p.buffers.indices.length/3,0));
 // Caps split at region edges: the right end of the brick band is brick, above it stays base.
 const brickBuf=painted.wallPaint!.find(p=>p.finish.texture==='brick')!.buffers,capYs:number[]=[];for(let k=0;k<brickBuf.positions.length/3;k++)if(brickBuf.normals[k*3]>.99&&Math.abs(brickBuf.positions[k*3]-8)<1e-6)capYs.push(brickBuf.positions[k*3+1]);
 assert.ok(capYs.length&&Math.max(...capYs)<=.8+1e-6&&Math.min(...capYs)<1e-6,`brick corner cap ${capYs}`);
 // Trim tint reaches the window surround it covers (not the door).
 const tone=new Color('#112233'),c=painted.trim.colors!;let tinted=0,other=0;for(let k=0;k<c.length/3;k++){const x=painted.trim.positions[k*3];if(Math.abs(c[k*3]-tone.r)<1e-5&&Math.abs(c[k*3+2]-tone.b)<1e-5){tinted++;assert.ok(x<4,'only the window');}else other++;}
 assert.ok(tinted>0&&other>0);
});

test('partition merges same-finish layers and ignores base-coloured cover',()=>{
 const p=paintPartition(8,6,paint.wall,undefined)!;assert.equal(p.slots.length,2);
 assert.equal(paintPartition(8,6,[{finish:{color:'#aa0000'},rects:[[1,2,1,2]]}],{color:'#AA0000'}),null,'same as base: nothing to split');
 const covered=paintPartition(8,6,[{finish:{color:'#aa0000'},rects:[[1,3,1,3]]},{finish:{},rects:[[0,8,0,6]]}],{})!;assert.equal(covered,null,'a later base-finish layer hides earlier paint');
});

const volume=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:2,...patch});
function fixture(){
 const r:StudioRecipe={version:5,volumes:[volume()],attachments:[],plotSize:24,studio:{...freshStudio(),freeOpenings:[{id:'d',shapeId:'main',side:'north',u:.5,bottom:0,width:1.3,height:2.5,shape:'arch'},{id:'w',shapeId:'main',side:'north',u:.2,bottom:4.2,width:1,height:1.5,shape:'rect'}] as StudioFreeOpening[]}};
 const design={...newDesign('paint-regions'),groundHeight:3.4,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const};
 return {r,design};
}

test('resolved buildings route painted pieces into per-finish wall batches with valid LOD ranges',()=>{
 const {r,design}=fixture();let next=addPaintStroke(r,{shapeId:'main',side:'north',channel:'wall',rects:[brushRect(2,1.5,1),brushRect(2.5,1.5,1)],finish:{color:'#aa3322'},id:'s'});
 next=paintBand(next,{shapeId:'main',side:'north',channel:'wall',y0:0,y1:.6,finish:{color:'#556677',texture:'concrete'},id:'b'});
 assert.equal(validateStudio(next),null);
 const plain=buildStudioDetailBatches(resolveSculpt(r,design).studio!),studio=resolveSculpt(next,design).studio!,d=buildStudioDetailBatches(studio);
 assert.deepEqual(studio.inactive,[]);
 const walls=d.batches.filter(b=>b.material.kind==='wall');assert.deepEqual(walls.map(b=>b.key).sort(),['wall|#556677|concrete','wall|#aa3322|none',`wall|${(plain.batches.find(b=>b.material.kind==='wall')!.material as {color:string}).color}|none`].sort());
 for(const b of d.batches){const n=b.positions.length/3;assert.ok(b.indices.every(i=>i<n));assert.equal(b.farStart+b.far,b.indices.length);assert.ok(b.farStart<=b.near&&b.near<=b.indices.length);if(b.material.kind==='wall')assert.equal(b.distance!.length,n);}
 for(const b of walls.filter(b=>b.key!=='wall|'+(plain.batches.find(p=>p.material.kind==='wall')!.material as {color:string}).color+'|none'))assert.equal(b.far,b.near,'painted pieces draw near and far');
 assert.ok(d.batches.length<=plain.batches.length+2,'one extra batch per new finish');
 // Fill wall replaces this face's regions; erase and recolour address the topmost region.
 const filled=fillPaintFace(next,{shapeId:'main',side:'north',channel:'wall',height:6.4,finish:{color:'#111111'},id:'f'});assert.deepEqual(filled.studio.paintRegions!.map(g=>g.id),['f']);
 assert.equal(paintRegionAt(next.studio.paintRegions,'main','north',2,.3)!.id,'b');assert.deepEqual(erasePaintAt(next,'main','north',2,.3).studio.paintRegions!.map(g=>g.id),['s']);
 assert.deepEqual(recolorPaintRegion(next,'s',{color:'#000000'}).studio.paintRegions![0].finish,{color:'#000000'});
 assert.equal(erasePaintAt(next,'main','north',2,.3,'trim'),next,'channel filter');
});

test('legacy tile paint on a face that becomes generated converts to face rectangles',()=>{
 const {r,design}=fixture(),bays=studioBays(r,design).filter(b=>b.anchor.shapeId==='main'&&b.anchor.side==='north'),upper=bays.find(b=>b.anchor.floor===1)!,ground=bays.filter(b=>b.anchor.floor===0);
 const painted:StudioRecipe={...r,studio:{...r.studio,surfaces:[{id:'spot',anchor:upper.anchor,scope:'spot',channel:'wall',finish:{color:'#335577'}},...ground.map((b,i)=>({id:`g${i}`,anchor:b.anchor,scope:'wall' as const,channel:'wall' as const,finish:{texture:'brick'}}))]}};
 assert.equal(validateStudio(painted),null);
 const face=resolveSculpt(painted,design).studio!.freeFaces!.find(f=>f.id==='main/north')!;
 assert.equal(face.finishes.wall,undefined,'the face base stays the part finish');
 const keys=face.geometry.wallPaint!.map(p=>finishKey(p.finish)).sort();assert.deepEqual(keys,[finishKey({color:'#335577'}),finishKey({texture:'brick'})].sort());
 const blue=outerTris(face.geometry.wallPaint!.find(p=>p.finish.color==='#335577')!.buffers),brick=outerTris(face.geometry.wallPaint!.find(p=>p.finish.texture==='brick')!.buffers);
 assert.ok(area(blue)<=upper.width*upper.height+1e-3&&area(blue)>upper.width*upper.height-1.5-1e-3,`one bay, minus any window inside it (${area(blue).toFixed(2)})`);
 const door=1.3*(2.5-.65)+Math.PI*.65*.65/2;assert.ok(Math.abs(area(brick)-(12*3.4-door))<.02,`ground floor minus the arched door (${area(brick).toFixed(3)})`);
 for(const tri of brick){const [,y]=centroid(tri);assert.ok(y<=3.4+1e-6,'brick stays on the ground floor');}
});

test('profiles and business imports reject paint regions; the studio validates them',()=>{
 const {r}=fixture(),next=addPaintStroke(r,{shapeId:'main',side:'north',channel:'wall',rects:[brushRect(2,1.5,1)],finish:{color:'#aa3322'},id:'s'});
 assert.equal(validateStudio(next),null);
 for(const bad of [[{id:'s',shapeId:'main',side:'up',channel:'wall',rects:[[0,1,0,1]],finish:{color:'#aa3322'}}],[{id:'s',shapeId:'main',side:'north',channel:'roof',rects:[[0,1,0,1]],finish:{color:'#aa3322'}}],[{id:'s',shapeId:'main',side:'north',channel:'wall',rects:[[0,1,0,1e6]],finish:{color:'#aa3322'}}],[{id:'s',shapeId:'main',side:'north',channel:'wall',rects:[[0,1,0,1]],finish:{texture:'glitter'}}]])
  assert.ok(validateStudio({...next,studio:{...next.studio,paintRegions:bad as never}}),JSON.stringify(bad).slice(0,80));
 const {freeOpenings:_,...studio}=next.studio,local={...next,studio:{...studio,catalogue:'synarc-kit-5' as const}};void _;
 assert.equal(validateModularBuilding({version:1,template:'t',recipe:local}),false,'profile schema rejects paintRegions');
 assert.ok(validateVariationRecipe(JSON.parse(JSON.stringify(local)),2),'business import rejects paintRegions');
});
