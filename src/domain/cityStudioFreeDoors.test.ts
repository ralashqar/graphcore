import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioFloorCount} from './cityStudio.ts';
import {upgradeStudioInterior} from './cityStudioInteriors.ts';
import {buildStudioDetailBatches,withoutDetailGeometry} from './cityStudioDetailBatches.ts';
import {FREE_DOOR,freeDoorLeaves,freeDoorPortalId} from './cityStudioFreeDoors.ts';
import {FREE_FACE} from './cityStudioFreeOpeningGeometry.ts';
import {resetStudioDoors,removeStudioDoors,stepStudioDoors,studioDoorTarget,toggleStudioDoor} from './cityStudioDoorState.ts';
import {StudioWalkingCollision} from './cityStudioCollision.ts';
import type {StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const volume=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:14,depth:10,startFloor:0,spanFloors:2,...patch});
const free=(id:string,u:number,bottom:number,width:number,height:number,shape:StudioFreeOpening['shape']='rect',extra:Partial<StudioFreeOpening>={}):StudioFreeOpening=>({id,shapeId:'main',side:'south',u,bottom,width,height,shape,...extra});
/** South face: an arched timber door, a glazed shop door, a wide carriage door, a stone arcade and a window. */
const OPENINGS=[free('door',.15,0,1.4,2.4,'arch',{style:'timber'}),free('shop',.32,0,1.2,2.55,'rect',{style:'painted',glazing:true}),free('carriage',.52,0,2.5,3,'arch',{style:'timber'}),free('arcade',.72,0,1.5,2.7,'arch',{style:'stone'}),free('win',.88,1,1.1,1.4)];
const recipe=(v6:boolean,openings=OPENINGS):StudioRecipe=>{const r:StudioRecipe={version:5,volumes:[volume()],attachments:[],plotSize:24,studio:{...freshStudio(),freeOpenings:openings}};return v6?upgradeStudioInterior(r):r;};
const resolve=(r:StudioRecipe)=>resolveSculpt(r,{...newDesign('free-doors'),groundHeight:3.2,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none',roof:'flat'}).studio!;
const close=(a:number,b:number,e=1e-6)=>Math.abs(a-b)<e;

test('free door groups become exterior portals on v6 buildings; stone arcades stay open',()=>{
 const out=resolve(recipe(true)),face=out.freeFaces![0],ids=(out.portals??[]).filter(p=>p.id.startsWith('exterior/free/')).map(p=>p.id).sort();
 assert.deepEqual(out.inactive,[]);assert.equal(face.openable,true);assert.equal(face.shell,undefined,'interiors replace the shell');
 assert.deepEqual(ids,['exterior/free/carriage','exterior/free/carriage#2','exterior/free/door','exterior/free/shop']);
 const door=face.groups.find(g=>g.id==='door')!,portal=out.portals!.find(p=>p.id==='exterior/free/door')!;
 // Transform: centre of the clear opening at the glazing plane, face rotation, threshold at the part base.
 const c=Math.cos(face.rotation),s=Math.sin(face.rotation),x=(door.x0+door.x1)/2,z=FREE_FACE.thickness/2-FREE_FACE.inset;
 assert.ok(close(portal.x,face.origin[0]+x*c+z*s)&&close(portal.z,face.origin[1]-x*s+z*c));
 assert.ok(close(portal.rotation,face.rotation)&&close(portal.y,face.base)&&portal.floor===0);
 assert.ok(close(portal.width,door.x1-door.x0-2*FREE_DOOR.frame)&&close(portal.height,door.spring-door.y0),'leaf fills the opening below the arch spring');
 assert.equal(portal.hinge,'left');assert.equal(portal.style,'panelled');
 assert.equal(out.portals!.find(p=>p.id==='exterior/free/shop')!.style,'glazed');
 const pair=out.portals!.filter(p=>p.id.startsWith('exterior/free/carriage'));assert.deepEqual(pair.map(p=>p.hinge),['left','right'],'wide doors open as a pair');
 assert.ok(close(pair[0].width+pair[1].width,face.groups.find(g=>g.id==='carriage')!.x1-face.groups.find(g=>g.id==='carriage')!.x0-2*FREE_DOOR.frame));
 assert.deepEqual(freeDoorLeaves(face.groups.find(g=>g.id==='arcade')!),[],'arcades have no leaf');
 assert.ok(out.decks.some(d=>d.id==='entry/free/door'&&close(d.y+(d.rise??0),face.base+.04)),'a ramp climbs to the threshold');assert.ok(out.decks.some(d=>d.id==='entry/free/door/landing'&&close(d.y,face.base+.04)),'a level doorstep');
 assert.ok(!out.decks.some(d=>d.id==='entry/free/arcade'));
 assert.ok(!out.portals!.some(p=>p.id.startsWith('exterior/main/south/')),'kit doors on an owned face never become portals');
});

test('static leaves are not duplicated near the camera when a portal takes over',()=>{
 const out=resolve(recipe(true)),face=out.freeFaces![0];assert.ok(face.geometry.door.indices.length>0&&face.geometry.doorGlass!.indices.length>0);
 const openable=buildStudioDetailBatches({freeFaces:[face]}),closed=buildStudioDetailBatches({freeFaces:[{...face,openable:false}]});
 const painted=(d:typeof openable)=>d.batches.find(b=>b.material.kind==='painted')!,glass=(d:typeof openable)=>d.batches.find(b=>b.material.kind==='glass')!;
 assert.equal(painted(closed).near-painted(openable).near,face.geometry.door.indices.length,'leaf, rail, bar and handle leave the near range');
 assert.equal(painted(closed).far,painted(openable).far,'the far view keeps its static leaves');
 assert.equal(glass(closed).near-glass(openable).near,face.geometry.doorGlass!.indices.length,'glazed leaves too');
 // The fanlight above the spring and the transom stay baked in both.
 assert.ok(glass(openable).near>0);
});

test('free-face glazing is see-through; roof and far fills keep opaque glass keys',()=>{
 const out=resolve(recipe(false)),d=buildStudioDetailBatches(out),glass=d.batches.filter(b=>b.material.kind==='glass');
 assert.equal(glass.length,1);assert.ok(glass[0].material.kind==='glass'&&glass[0].material.seeThrough===true);assert.match(glass[0].key,/\|see$/);
 assert.ok(glass[0].far>0,'aperture fills and glass remain in the far range (drawn opaque there)');
 const shell=d.batches.find(b=>b.material.kind==='shell')!;assert.ok(shell.near>0);assert.equal(shell.far,0,'window shells are near-only');
 assert.ok(shell.colors&&shell.colors.length===shell.positions.length);
 assert.equal(withoutDetailGeometry(out).freeFaces![0].shell,undefined,'shell buffers ride only in the batches');
});

test('v5 buildings keep closed static leaves with blockers and get interior shells',()=>{
 const out=resolve(recipe(false)),face=out.freeFaces![0];
 assert.equal(out.portals,undefined);assert.notEqual(face.openable,true);
 assert.deepEqual(out.blockers.filter(b=>b.id.startsWith('free-door/')).map(b=>b.id).sort(),['free-door/carriage','free-door/door','free-door/shop']);
 assert.ok(!out.blockers.some(b=>b.id==='free-door/arcade'),'arcades stay open');
 const shell=face.shell!;assert.ok(shell.indices.length>0);
 // Every shell vertex sits behind the inner skin and inside the storey band.
 for(let k=0;k<shell.positions.length;k+=3)assert.ok(shell.positions[k+2]<=-FREE_FACE.thickness/2&&shell.positions[k+2]>=-FREE_FACE.thickness/2-FREE_DOOR.shellDepth-.01);
 // The shell never reaches the opposite (north) wall: 10 m deep part, depth is capped.
 assert.ok(Math.min(...Array.from(shell.positions).filter((_,k)=>k%3===2))>-5);
});

test('closed leaves block the doorway; opening the group lets you walk through',()=>{
 const out=resolve(recipe(true)),collision=new StudioWalkingCollision(),portals=out.portals!;
 resetStudioDoors('free',portals);collision.set({id:'free',x:0,z:0,rotation:0,scale:1,result:out});
 const check=(id:string)=>{const p=portals.find(q=>q.id===id)!,nx=Math.sin(p.rotation),nz=Math.cos(p.rotation),y=p.y+.2,group=portals.filter(q=>q.id.split('#')[0]===id),cx=group.reduce((s,q)=>s+q.x,0)/group.length,cz=group.reduce((s,q)=>s+q.z,0)/group.length;return collision.sweep(cx+nx*1.2,y,cz+nz*1.2,-nx*2.4,-nz*2.4,.3).t;};
 for(const id of ['exterior/free/door','exterior/free/carriage']){
  assert.ok(check(id)<1,`${id} is closed`);
  const near=collision.nearestDoor(portals.find(p=>p.id===id)!.x,portals.find(p=>p.id===id)!.y+.2,portals.find(p=>p.id===id)!.z);assert.ok(near?.doorId.startsWith(id));
  assert.equal(toggleStudioDoor('free',near!.doorId),true);stepStudioDoors(1);
  assert.equal(check(id),1,`${id} opens a clear gap`);
 }
 assert.equal(studioDoorTarget('free','exterior/free/carriage#2'),1,'both leaves of a pair open together');
 const face=out.freeFaces![0],arcade=face.groups.find(g=>g.id==='arcade')!,c=Math.cos(face.rotation),s=Math.sin(face.rotation),ax=(arcade.x0+arcade.x1)/2,ox=face.origin[0]+ax*c,oz=face.origin[1]-ax*s,nx=Math.sin(face.rotation),nz=Math.cos(face.rotation);
 assert.equal(collision.sweep(ox+nx*1.2,face.base+.2,oz+nz*1.2,-nx*2.4,-nz*2.4,.3).t,1,'the arcade is an open passage');
 removeStudioDoors('free');
});

test('interior partitions and stairs must leave free doorways clear; rooms are unaffected',()=>{
 const r=recipe(true,[free('door',.5,0,1.4,2.4,'arch',{style:'timber'})]);if(r.version!==6)return;
 const face=resolve(r).freeFaces![0],g=face.groups[0],c=Math.cos(face.rotation),s=Math.sin(face.rotation),at=(x:number,z:number):[number,number]=>[face.origin[0]+x*c+z*s,face.origin[1]-x*s+z*c];
 // A partition running straight into the doorway, and another one well clear of it.
 const mid=(g.x0+g.x1)/2;r.interior.partitions.push({id:'into',floor:0,a:at(mid,-.2),b:at(mid,-4)},{id:'clear',floor:0,a:at(mid+3,-.3),b:at(mid+3,-4.5)});
 const out=resolve(r);
 assert.deepEqual(out.inactive.map(i=>[i.id,i.reason]),[['into','Leave the doorway clear.']]);
 const stair=recipe(true,[free('door',.5,0,1.4,2.4,'arch',{style:'timber'})]);if(stair.version!==6)return;
 stair.interior.stairs.push({id:'stair',floor:0,...(([x,z])=>({x,z}))(at(mid,-1)),rotation:face.rotation+Math.PI,layout:'straight',flip:false});
 assert.deepEqual(resolve(stair).inactive.map(i=>[i.id,i.reason]),[['stair','Leave the doorway clear.']]);
 stair.interior.stairs[0]={...stair.interior.stairs[0],...(([x,z])=>({x,z}))(at(mid+3.5,-1.5))};
 assert.deepEqual(resolve(stair).inactive,[],'a stair beside the doorway fits');
 assert.ok(out.portals!.some(p=>p.id===freeDoorPortalId('door',0)));
 assert.ok(out.interiorLevels![0].rooms.length>=1);
});
