import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,validateSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,paintStudio,studioBays,studioFinish,studioFloorCount} from './cityStudio.ts';
import type {StudioRecipe,StudioResolved} from './cityStudioTypes.ts';
import {StudioWalkingCollision} from './cityStudioCollision.ts';
import {DriveWorld} from './cityDriveWorld.ts';
import {WalkingWorld,advanceFoot,createFootState} from './cityExploration.ts';
import {STUDIO_MODULES} from './cityStudioCatalog.ts';

const volume=(id='main',patch:Partial<SculptVolume>={}):SculptVolume=>({id,kind:'rectangle',operation:'add',x:0,z:0,width:10,depth:8,startFloor:0,spanFloors:3,...patch});
const recipe=(volumes=[volume()]):StudioRecipe=>({version:5,volumes,attachments:[],plotSize:24,studio:freshStudio()});
const design=(r:StudioRecipe)=>({...newDesign('studio-test'),groundHeight:3,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const resolved=(r:StudioRecipe)=>resolveSculpt(r,design(r)).studio!;
const blank=():StudioResolved=>({bays:[],pieces:[],blockers:[],decks:[],inactive:[],roof:[],roofNotes:[]});

test('catalogue contains exactly 64 distinct compatible modules',()=>{
 assert.equal(STUDIO_MODULES.length,64);assert.equal(new Set(STUDIO_MODULES.map(m=>m.id)).size,64);
 for(const part of STUDIO_MODULES){assert.ok(part.size.every(v=>v>0));assert.ok(part.connectors.left);if(part.opening)assert.ok(part.opening.width<part.size[0]);}
});
test('empty studios save before the first solid, while cuts alone are invalid',()=>{
 assert.equal(validateSculpt(recipe([]),1),null);assert.equal(resolved(recipe([])).pieces.length,0);
 assert.ok(validateSculpt(recipe([volume('cut',{operation:'subtract'})]),1));
});
test('union facade segmentation keeps both source owners and no internal wall',()=>{
 const r=recipe([volume('left',{x:-3,width:6}),volume('right',{x:3,width:6})]);
 const bays=studioBays(r,design(r));assert.ok(bays.some(b=>b.anchor.shapeId==='left'));assert.ok(bays.some(b=>b.anchor.shapeId==='right'));
 assert.ok(!bays.some(b=>Math.abs(b.x)<.001&&Math.abs(Math.sin(b.rotation))>.9));
});
test('spot finish wins over wall and part; erase restores the inherited finish',()=>{
 let r=recipe();const a=studioBays(r,design(r))[0].anchor;
 r=paintStudio(r,a,'part','wall',{color:'#112233'});r=paintStudio(r,a,'wall','wall',{color:'#445566'});r=paintStudio(r,a,'spot','wall',{color:'#778899'});
 assert.equal(studioFinish(r,a,'wall')?.color,'#778899');r=paintStudio(r,a,'spot','wall',null);assert.equal(studioFinish(r,a,'wall')?.color,'#445566');
});
test('connected balcony across three bays has one front per bay and only two ends',()=>{
 const r=recipe(),bays=studioBays(r,design(r)).filter(b=>b.anchor.floor===1&&b.anchor.side==='north').slice(0,3);
 assert.equal(bays.length,3);r.studio.assemblies.push({id:'balcony',kind:'balcony',anchors:bays.map(b=>b.anchor),look:'simple'});
 const out=resolved(r);assert.deepEqual(out.inactive,[]);assert.equal(out.pieces.filter(p=>p.id.startsWith('balcony/')&&p.id.includes('/end')).length,2);assert.equal(out.decks.filter(d=>d.id.startsWith('balcony/')).length,3);
});
test('deleting a host preserves inactive assembly intent; undoing restores it',()=>{
 const r=recipe(),b=studioBays(r,design(r)).find(b=>b.anchor.floor===1)!;r.studio.assemblies.push({id:'balcony',kind:'balcony',anchors:[b.anchor],look:'simple'});
 const altered={...r,volumes:[volume('other')]};assert.equal(resolved(altered).inactive[0].id,'balcony');assert.equal(resolved(r).inactive.length,0);
});
test('stair surfaces reach their requested landing at both plot scales',()=>{
 for(const size of [24,48] as const){const r=recipe([volume('main',{width:12,depth:7})]);r.plotSize=size;const b=studioBays(r,design(r)).find(b=>b.anchor.floor===0&&b.anchor.side==='north'&&Math.abs(b.x)<2)!;
 r.studio.assemblies.push({id:'stairs',kind:'stair',anchors:[b.anchor],look:'simple',destination:2});const out=resolved(r);assert.deepEqual(out.inactive,[]);const ramps=out.decks.filter(d=>d.id.includes('/ramp'));assert.ok(ramps.length);assert.equal(Math.max(...ramps.map(d=>d.y+(d.rise??0))),6.65);}
});
test('pitched and mansard roofs differ from flat and preserve a courtyard hole',()=>{
 const r=recipe([volume(),volume('court',{operation:'subtract',width:3,depth:3})]),flat=resolved(r).roof;
 r.studio.defaults.roof='pitched';const pitched=resolved(r).roof;assert.ok(Math.max(...pitched.filter((_,i)=>i%3===1))>9.65);assert.notDeepEqual(pitched,flat);
 r.studio.defaults.roof='mansard';const mansard=resolved(r).roof;assert.notDeepEqual(mansard,pitched);
 for(let i=0;i<mansard.length;i+=9){const x=(mansard[i]+mansard[i+3]+mansard[i+6])/3,z=(mansard[i+2]+mansard[i+5]+mansard[i+8])/3;assert.ok(Math.abs(x)>=1.49||Math.abs(z)>=1.49);}
});
test('pedestrian surfaces support stacked decks without snapping up from underneath',()=>{
 const collision=new StudioWalkingCollision(),result=blank();result.decks=[{id:'balcony',x:0,z:0,y:4,width:4,depth:3,rotation:0}];collision.set({id:'p',x:0,z:0,scale:1,rotation:0,result});
 assert.equal(collision.ground(0,0,1),.18);assert.equal(collision.ground(0,0,4.3),4);assert.equal(collision.ceiling(0,0,.2),3.85);
});
test('walking can enter a constructed plot, cars retain the plot collider',()=>{
 const world=new DriveWorld(100);world.sync([{id:'p',minX:-10,maxX:10,minZ:-10,maxZ:10}]);const walk=new WalkingWorld(world);walk.studio.set({id:'p',x:0,z:0,scale:1,rotation:0,result:blank()});
 assert.equal(world.clear(0,0,.34),false);assert.equal(walk.clear(0,0),true);assert.equal(walk.sweep(-12,0,5,0,.34).t,1);
});
test('walking ascends a collision ramp and stays on its landing',()=>{
 const world=new DriveWorld(100),walk=new WalkingWorld(world),result=blank();result.decks=[{id:'ramp',x:0,z:0,y:.18,width:2,depth:6,rise:3,rotation:0},{id:'landing',x:0,z:4,y:3.18,width:2,depth:2,rotation:0}];walk.studio.set({id:'p',x:0,z:0,scale:1,rotation:0,result});
 const foot=createFootState(0,-3);for(let i=0;i<200;i++)advanceFoot(foot,{forward:true,reverse:false,left:false,right:false,walk:true},0,1/60,walk);
 assert.ok(foot.y>3);assert.equal(foot.grounded,true);
});

test('generated piece identities remain unique when walls need header infill',()=>{
 const r=recipe(),d={...design(r),groundHeight:4.2};const out=resolveSculpt(r,d).studio!;
 assert.equal(new Set(out.pieces.map(p=>p.id)).size,out.pieces.length);
 assert.ok(out.pieces.filter(p=>p.id.endsWith('/header')).every(p=>p.module==='wall-full'));
});
test('each switchback storey landing follows the actual floor elevation',()=>{
 const r=recipe([volume('main',{width:12,depth:7})]),d={...design(r),groundHeight:4.2},b=studioBays(r,d).find(b=>b.anchor.floor===0&&b.anchor.side==='north'&&Math.abs(b.x)<2)!;
 r.studio.assemblies.push({id:'stairs',kind:'stair',anchors:[b.anchor],look:'simple',destination:3});
 const out=resolveSculpt(r,d).studio!;assert.equal(out.inactive.length,0);
 for(let storey=1;storey<=3;storey++)assert.ok(Math.abs(out.decks.find(d=>d.id===`stairs/landing${storey*2-1}`)!.y-(4.85+(storey-1)*3))<1e-8);
});
test('camera sees deck undersides and pedestrian recovery rejects a wall',()=>{
 const result=blank();result.decks=[{id:'deck',x:0,z:0,y:4,width:4,depth:4,rotation:0}];result.blockers=[{id:'wall',x:3,y:2,z:0,width:.3,height:4,depth:4,rotation:0}];
 const collision=new StudioWalkingCollision();collision.set({id:'p',x:0,z:0,rotation:0,scale:1,result});
 assert.ok(collision.camera(0,1,0,0,5,0,.1)<.7);assert.equal(collision.clear(3,0,0,.34),false);assert.equal(collision.clear(3,5,0,.34),true);
});
test('unsupported catalogue, texture and malformed intent are rejected at the save boundary',()=>{
 const r=recipe();r.studio.defaults.finishes={wall:{texture:'missing'}};assert.ok(validateSculpt(r,3));
 const invalid=structuredClone(r);invalid.studio=null as never;assert.ok(validateSculpt(invalid,3));
});

import {createLandWorld,initialLandDraft,LocalLandRepository} from './cityLand.ts';
import {studioExample,STUDIO_EXAMPLES} from './cityStudioExamples.ts';
test('all three reference properties resolve and reopen with their pinned catalogue',async()=>{
 for(const size of [24,48] as const){const initial=createLandWorld([],72,size),store=new Map<string,string>(),storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);}},repo=new LocalLandRepository(storage,initial);
 for(let index=0;index<3;index++){const plot=initial.plots[index],owned=await repo.purchase(plot.id,0,`studio-${index}`),draft=studioExample(initialLandDraft(plot),index,size),out=resolveSculpt(draft.sculpt!,draft.design).studio!;
 assert.deepEqual(out.inactive,[],STUDIO_EXAMPLES[index].name);assert.equal(new Set(out.pieces.map(p=>p.id)).size,out.pieces.length);
 const saved=await repo.finish(plot.id,owned.revision,draft),loaded=(await new LocalLandRepository(storage,initial).list()).plots.find(p=>p.id===plot.id)!;
 assert.deepEqual(loaded.finished,JSON.parse(JSON.stringify(saved.finished)));assert.equal(loaded.finished?.sculpt?.version,5);
 }}
});


test('character follows generated switchback flights and landings to the terrace',()=>{
 const r=recipe([volume('main',{width:12,depth:7})]),b=studioBays(r,design(r)).find(b=>b.anchor.floor===0&&b.anchor.side==='north'&&Math.abs(b.x)<2)!;
 r.studio.defaults.roof='terrace';r.studio.assemblies.push({id:'stairs',kind:'stair',anchors:[b.anchor],look:'simple',destination:3});const out=resolved(r);
 const ramps=out.decks.filter(d=>d.id.includes('/ramp')),world=new WalkingWorld(new DriveWorld(100));world.studio.set({id:'p',x:0,z:0,rotation:0,scale:1,result:out});
 const end=(d:typeof ramps[number],sign:number)=>({x:d.x+Math.sin(d.rotation)*d.depth/2*sign,z:d.z+Math.cos(d.rotation)*d.depth/2*sign});
 const start=end(ramps[0],-1),foot=createFootState(start.x,start.z);foot.y=.18;
 const points=ramps.flatMap((r,i)=>{const landing=out.decks.find(d=>d.id===`stairs/landing${i}`)!;return [end(r,-1),end(r,1),{x:landing.x,z:landing.z}];});
 const finalLanding=points.at(-1)!;points.push({x:finalLanding.x-Math.sin(b.rotation)*2.1,z:finalLanding.z-Math.cos(b.rotation)*2.1});
 for(const point of points){let ticks=0;while(Math.hypot(foot.x-point.x,foot.z-point.z)>.13&&ticks++<900){advanceFoot(foot,{forward:true,reverse:false,left:false,right:false,walk:true},Math.atan2(point.x-foot.x,point.z-foot.z),1/60,world);}assert.ok(ticks<900,`Stuck at ${JSON.stringify(point)} from ${foot.x},${foot.y},${foot.z}`);}
 assert.ok(foot.y>9.6,JSON.stringify({foot,points,roof:out.decks.filter(d=>d.id.startsWith("roof"))}));
});

import {liftStudioAnchors} from './cityStudio.ts';
test('lifting a part carries its surface intent; a cut does not rehost it on a neighbouring bay',()=>{
 const r=recipe(),b=studioBays(r,design(r)).filter(b=>b.anchor.side==='north'&&b.anchor.floor===1).sort((a,b)=>Math.abs(a.x)-Math.abs(b.x))[0];
 r.studio.assemblies.push({id:'balcony',kind:'balcony',anchors:[b.anchor],look:'simple'});
 const lifted=liftStudioAnchors({...r,volumes:r.volumes.map(v=>({...v,startFloor:1}))},'main',1);
 assert.equal(lifted.studio.assemblies[0].anchors[0].floor,2);assert.equal(resolved(lifted).inactive.length,0);
 r.volumes.push(volume('cut',{operation:'subtract',x:b.x,z:4,width:2,depth:2}));assert.ok(resolved(r).inactive.some(a=>a.id==='balcony'));
});
