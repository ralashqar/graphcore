import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioBays,studioFloorCount} from './cityStudio.ts';
import {upgradeStudioInterior} from './cityStudioInteriors.ts';
import {moduleOpeningSpec} from './cityStudioModuleSpec.ts';
import {newFacadeRhythm} from './cityStudioFacadeRhythm.ts';
import {STOREFRONT_MODULE_IDS,TOKYO_MODULE_IDS,studioModules} from './cityStudioCatalog.ts';
import {doorGroupKey,kitDoorMotion,kitLeafMatrix,packDoorMotion,portalLeafBox,splitDoorLeaves,type KitPack} from './cityStudioDoorMotion.ts';
import {resetStudioDoors,removeStudioDoors,stepStudioDoors,toggleStudioDoor,studioDoorTarget} from './cityStudioDoorState.ts';
import {StudioWalkingCollision} from './cityStudioCollision.ts';
import type {StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import type {StudioPortal,StudioRecipe,StudioResolved} from './cityStudioTypes.ts';

const vol=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:10,startFloor:0,spanFloors:2,...patch});
const recipe=(patch:Partial<StudioRecipe['studio']>={},v6=false):StudioRecipe=>{const r:StudioRecipe={version:5,volumes:[vol()],attachments:[],plotSize:24,studio:{...freshStudio(),catalogue:'synarc-kit-5',...patch}};return v6?upgradeStudioInterior(r):r;};
const design=(r:StudioRecipe)=>({...newDesign('door-motion'),groundHeight:3.4,upperHeight:3.2,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const resolve=(r:StudioRecipe)=>resolveSculpt(r,design(r)).studio!;
const kit=(id:string,module:string,u:number):StudioFreeOpening=>{const s=moduleOpeningSpec(module)!;return {id,shapeId:'main',side:'north',u,bottom:0,width:s.width,height:s.height,shape:'rect',module};};
const PACKS:[KitPack,string][]=[[2,'public/city/synarc-kit/v2'],[3,'public/city/synarc-kit/v3'],[4,'public/city/synarc-kit/v4'],[5,'public/city/synarc-kit/v5'],['tokyo','public/city/tokyo-kit/v1'],['storefront','public/city/storefront-kit/v1']];

test('every kit door module has a door motion, with the motion its design implies',()=>{
 for(const [pack,dir] of PACKS){const catalogue=JSON.parse(fs.readFileSync(`${dir}/catalogue.json`,'utf8')) as {parts:{id:string;category:string}[]};
  for(const part of catalogue.parts.filter(p=>p.category==='door'))assert.ok(packDoorMotion(pack,part.id),`${pack}: ${part.id}`);}
 const shape=(module:string,version:2|3|4|5=5)=>{const m=kitDoorMotion(version,module)!;return [m.kind,...m.leaves.map(l=>l.motion==='swing'?`swing-${l.hinge}`:l.motion==='slide'?`slide${l.dir}`:'roll')].join(' ');};
 // Hinged: singles hinge away from the handle; doubles are a left/right pair.
 assert.equal(shape('door-panelled'),'hinged swing-left');assert.equal(shape('door-panelled',2),'hinged swing-left','old kits too');
 assert.equal(shape('door-double'),'hinged swing-left swing-right');assert.equal(shape('door-lobby',3),'hinged swing-left swing-right');
 assert.equal(shape('door-nyc-residential',4),'hinged swing-left');assert.equal(shape('door-collection-museum'),'hinged swing-left swing-right');
 assert.equal(shape('door-tokyo-stair'),'hinged swing-right','the Tokyo stair door has its handle on the left');
 assert.equal(shape('door-shop-victorian'),'hinged swing-left');assert.equal(shape('door-shop-castiron'),'hinged swing-left swing-right');assert.equal(shape('door-shop-aluminium'),'hinged swing-left swing-right');
 assert.equal(shape('door-shop-steel-pivot'),'hinged swing-right');
 // Sliding and roll-up.
 assert.equal(shape('door-tokyo-sliding'),'sliding slide-1 slide1');assert.equal(shape('door-tokyo-noren'),'sliding slide-1 slide1');assert.equal(shape('door-shop-tiled-sliding'),'sliding slide-1 slide1');
 assert.equal(shape('door-tokyo-shop-shutter'),'roll roll roll');
 // Leafless fronts are passable openings.
 for(const id of ['door-shop-stall-open','door-shop-bead-curtain','door-shop-cafe-folding'])assert.equal(shape(id),'open');
 assert.equal(kitDoorMotion(5,'window-sash'),null,'windows are not doors');
 assert.ok(TOKYO_MODULE_IDS.has('door-tokyo-sliding')&&STOREFRONT_MODULE_IDS.has('door-shop-castiron'));
});

test('leaves are taken from the kit geometry: every leaf moves real triangles and the frame stays',async()=>{
 const io=new NodeIO();
 for(const [pack,dir] of PACKS.filter(([p])=>p===5||p==='tokyo'||p==='storefront'||p===2)){
  const doc=await io.read(`${dir}/kit.glb`),scene=doc.getRoot().getDefaultScene()??doc.getRoot().listScenes()[0];
  for(const root of scene.listChildren()){
   const id=root.getName().replace(/^v[2345]\//,''),spec=packDoorMotion(pack,id);if(!spec)continue;
   const positions:number[]=[],normals:number[]=[];
   const walk=(n:typeof root,o:[number,number,number])=>{const t=n.getTranslation(),s=n.getScale(),mesh=n.getMesh();
    if(mesh)for(const p of mesh.listPrimitives()){if(/wall/.test(p.getMaterial()?.getName()??''))continue;const pos=p.getAttribute('POSITION')!,idx=p.getIndices(),count=idx?idx.getCount():pos.getCount(),v=[0,0,0];
     for(let i=0;i<count;i++){pos.getElement(idx?idx.getScalar(i):i,v);positions.push(v[0]*s[0]+t[0]+o[0],v[1]*s[1]+t[1]+o[1],v[2]*s[2]+t[2]+o[2]);normals.push(0,0,1);}}
    for(const c of n.listChildren())walk(c,[o[0]+t[0],o[1]+t[1],o[2]+t[2]]);};
   walk(root,[0,0,0]);
   const split=splitDoorLeaves({positions,normals},spec);
   assert.ok(split.rest.positions.length>0,`${pack}/${id}: the frame stays`);
   split.leaves.forEach((leaf,i)=>{assert.ok(leaf.positions.length>=18,`${pack}/${id}: leaf ${i} carries triangles`);
    for(let k=0;k<leaf.positions.length;k+=3)assert.ok(leaf.positions[k]>=spec.passage.x0-.05&&leaf.positions[k]<=spec.passage.x1+.05,`${pack}/${id}: leaf ${i} stays inside the aperture`);});
   if(spec.cuts.length)assert.ok(split.leaves.every(l=>l.positions.length),`${pack}/${id}: a cut splits the leaves`);
  }
 }
});

test('leaf motion: swings turn inwards about the hinge, slides move along the wall, shutters roll up',()=>{
 const apply=(m:number[],x:number,y:number,z:number)=>[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];
 const single=kitDoorMotion(5,'door-panelled')!.leaves[0],[px,pz]=single.pivot!;
 const free=apply(kitLeafMatrix(single,1),px+1,1,pz);assert.ok(Math.abs(free[0]-px)<1e-9&&free[2]<pz-.99,'the far edge swings inwards (-z)');
 assert.deepEqual(apply(kitLeafMatrix(single,1),px,1,pz).map(v=>+v.toFixed(9)),[px,1,pz],'the hinge stays put');
 const [left,right]=kitDoorMotion(5,'door-double')!.leaves;assert.ok(apply(kitLeafMatrix(right,1),right.pivot![0]-1,1,right.pivot![1])[2]<right.pivot![1]-.99,'a right leaf swings inwards too');
 assert.ok(left.hinge==='left'&&right.hinge==='right');
 const [a,b]=kitDoorMotion(5,'door-tokyo-sliding')!.leaves;assert.ok(apply(kitLeafMatrix(a,1),0,1,0)[0]<-.6&&apply(kitLeafMatrix(b,1),0,1,0)[0]>.6,'sliding leaves part');
 const shutter=kitDoorMotion(5,'door-tokyo-shop-shutter')!.leaves[1],top=shutter.top!;assert.ok(apply(kitLeafMatrix(shutter,1),0,0,0)[1]>top-.2,'the door rolls up into the head');
 // Collision boxes follow the same motions.
 const door:StudioPortal={id:'d',floor:0,x:0,y:0,z:0,width:1,height:2.4,rotation:0,hinge:'left',style:'panelled'};
 assert.ok(Math.abs(portalLeafBox({...door,motion:'slide',dir:1},1).x-.92)<1e-9);
 const rolled=portalLeafBox({...door,motion:'roll',top:2.5},1);assert.ok(rolled.y-rolled.height/2>2.3,'a rolled shutter clears the passage');
 assert.ok(Math.abs(portalLeafBox(door,1).rotation-Math.PI/2)<1e-9);
 assert.equal(doorGroupKey('exterior/kit/a#2'),'exterior/kit/a');
});

/** Sweep across a door group's passage: 1 means the character walks straight through. */
function through(out:StudioResolved,plot:string,id:string){
 const collision=new StudioWalkingCollision();collision.set({id:plot,x:0,z:0,rotation:0,scale:1,result:out});
 const group=out.portals!.filter(p=>doorGroupKey(p.id)===id),p=group[0],nx=Math.sin(p.rotation),nz=Math.cos(p.rotation),cx=group.reduce((s,q)=>s+q.x,0)/group.length,cz=group.reduce((s,q)=>s+q.z,0)/group.length;
 return collision.sweep(cx+nx*1.5,Math.min(...group.map(q=>q.y))+.2,cz+nz*1.5,-nx*3,-nz*3,.25).t;
}
function opens(out:StudioResolved,id:string,label:string){
 const plot=`motion-${label}`;resetStudioDoors(plot,out.portals!);
 assert.ok(through(out,plot,id)<1,`${label}: closed, the door blocks`);
 assert.equal(toggleStudioDoor(plot,id),true);stepStudioDoors(1);
 for(const p of out.portals!.filter(q=>doorGroupKey(q.id)===id))assert.equal(studioDoorTarget(plot,p.id),1,`${label}: every leaf opens`);
 assert.equal(through(out,plot,id),1,`${label}: open, the character walks through`);removeStudioDoors(plot);
}

test('kit tile doors (classic kit) become portals and open on buildings with and without interiors',()=>{
 for(const v6 of [false,true]){
  const r=recipe({},v6),bays=studioBays(r,design(r)),front=bays.find(b=>b.anchor.floor===0&&b.entrance)!;
  r.studio.openings=[{id:'double',anchor:front.anchor,module:'door-double'}];
  const out=resolve(r),piece=out.pieces.find(p=>p.id===front.id)!;assert.equal(piece.module,'door-double');assert.equal(piece.portal,true);
  const ids=out.portals!.filter(p=>p.piece===piece.id).map(p=>[p.id,p.hinge]);assert.deepEqual(ids,[[`exterior/kit/${front.id}`,'left'],[`exterior/kit/${front.id}#2`,'right']]);
  assert.ok(!out.blockers.some(b=>b.id===front.id),'the tile blocker opens around the passage');assert.ok(out.blockers.some(b=>b.id===`${front.id}/head`));
  assert.ok(out.decks.some(d=>d.id===`entry/${front.id}/landing`),'a doorstep to stand on');
  opens(out,`exterior/kit/${front.id}`,v6?'tile-v6':'tile-v5');
  assert.equal(out.implicitInterior,v6?undefined:true);
 }
});

test('kit pieces in generated walls: Tokyo sliding, storefront double and roll-up doors open; open fronts are passable with interiors',()=>{
 const r=recipe({freeOpenings:[kit('slide','door-tokyo-sliding',.2),kit('shop','door-shop-aluminium',.45),kit('shutter','door-tokyo-shop-shutter',.7),kit('stall','door-shop-stall-open',.9)]}),out=resolve(r);
 assert.deepEqual(out.inactive,[]);
 const motions=(id:string)=>out.portals!.filter(p=>p.piece===`free/${id}`).map(p=>p.motion);
 assert.deepEqual(motions('slide'),['slide','slide']);assert.deepEqual(motions('shop'),['swing','swing']);assert.deepEqual(motions('shutter'),['roll','roll']);assert.deepEqual(motions('stall'),[]);
 assert.deepEqual(out.pieces.find(p=>p.id==='free/slide')!.omit,['wall']);
 opens(out,'exterior/kit/free/slide','tokyo-sliding');opens(out,'exterior/kit/free/shop','storefront-double');opens(out,'exterior/kit/free/shutter','tokyo-shutter');
 // The open stall front: a closed recess without interiors, a walk-in opening with them.
 assert.ok(out.blockers.some(b=>b.id==='free-recess/stall'));
 const v6=resolve(upgradeStudioInterior(r));assert.ok(!v6.blockers.some(b=>b.id.startsWith('free-recess/')));
});

test('storefront stamps and facade-rhythm doors open too',()=>{
 const base=recipe(),bays=studioBays(base,design(base)),front=bays.filter(b=>b.anchor.floor===0&&b.anchor.side==='north').sort((a,b)=>a.anchor.u-b.anchor.u);
 for(const stamp of ['stamp-sf-bodega-2','stamp-tokyo-konbini-2','stamp-cafe-2']){
  const r=recipe({stamps:[{id:'shop',stamp,anchor:front[0].anchor}]}),out=resolve(r),doors=(out.portals??[]).filter(p=>p.piece);
  assert.ok(doors.length>=1,`${stamp}: its door is a portal`);opens(out,doorGroupKey(doors[0].id),stamp);
 }
 for(const style of ['shopfront','townhouse','tokyo'] as const){
  const r=recipe({facadeRhythm:newFacadeRhythm(style,4)}),out=resolve(r),doors=(out.portals??[]).filter(p=>p.id.startsWith('exterior/'));
  assert.ok(doors.length>=1,`${style} rhythm has a door portal`);opens(out,doorGroupKey(doors[0].id),`rhythm-${style}`);
 }
});

test('studio modules catalogue: kit v5 in the studio includes the Tokyo and storefront doors',()=>{
 const doors=studioModules(5).filter(p=>p.category==='door');assert.ok(doors.length>=30);
 for(const d of doors)assert.ok(kitDoorMotion(5,d.id),d.id);
});
