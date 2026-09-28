// Interior stairs (docs/city-stairs-entrances.md): rise and run, landing placement, entry and exit directions,
// headroom, stairwell cutting and guards, walking up and down every shape, migration of old layouts, validation and
// business rejection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt} from './citySculpt.ts';
import {freshStudio,studioFloorCount,validateStudio} from './cityStudio.ts';
import {upgradeStudioInterior,validateStudioInterior} from './cityStudioInteriors.ts';
import {STAIR,STAIR_SHAPES,fitInteriorStair,fitStairIntent,stairHeadroom,stairShapeOf,type StairFitContext,type StairShape} from './cityStudioStairs.ts';
import {StudioWalkingCollision,studioDeckHeight} from './cityStudioCollision.ts';
import {WalkingWorld,advanceFoot,createFootState} from './cityExploration.ts';
import {DriveWorld} from './cityDriveWorld.ts';
import {validateModularBuilding} from './cityBuildingVariation.ts';
import {RAIL_STYLES} from './cityStudioRailings.ts';
import type {StudioInteriorStair,StudioRecipe,StudioResolved} from './cityStudioTypes.ts';

const box=(w=10,d=12)=>({version:5 as const,volumes:[{id:'main',kind:'rectangle' as const,operation:'add' as const,x:0,z:0,width:w,depth:d,startFloor:0,spanFloors:2}],attachments:[],plotSize:24 as const,studio:freshStudio()});
const design=(r:StudioRecipe)=>({...newDesign('stairs'),groundHeight:3,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const resolve=(r:StudioRecipe)=>resolveSculpt(r,design(r)).studio!;
const LOW=.69,TOP=3.69;
const ctxFor=(w=10,d=12):StairFitContext=>{const ring:[number,number][]=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];return {lower:[[ring]],upper:[[ring]],low:LOW,top:TOP,floor:0,upperHeight:3,lowerPartitions:[],upperPartitions:[]};};
const stair=(patch:Partial<StudioInteriorStair>={}):StudioInteriorStair=>({id:'s',floor:0,x:-1,z:-3,rotation:0,layout:'straight',flip:false,...patch});
const withStair=(patch:Partial<StudioInteriorStair>={})=>{const r=upgradeStudioInterior(box());if(r.version!==6)throw Error('v6');r.interior.stairs.push(stair(patch));return r;};
/** Walk the character along a route (world = plot-local here); returns the heights reached at each waypoint. */
function walkRoute(out:StudioResolved,route:[number,number,number][],reverse=false,scale=1){
 const world=new WalkingWorld(new DriveWorld(300));world.studio.set({id:'w',x:0,z:0,rotation:0,scale,result:out});
 const points=(reverse?[...route].reverse():route).map(p=>[p[0]*scale,p[1]*scale,p[2]*scale] as [number,number,number]),foot=createFootState(points[0][0],points[0][2]);foot.y=points[0][1];
 const reached:number[]=[];
 for(const [x,,z] of points.slice(1)){for(let i=0;i<900;i++){if(Math.hypot(x-foot.x,z-foot.z)<.12)break;advanceFoot(foot,{forward:true,reverse:false,left:false,right:false,walk:true},Math.atan2(x-foot.x,z-foot.z),1/60,world);}reached.push(foot.y);}
 return {foot,reached};
}

test('rise and run: risers at most 0.19 m, a 0.27 m going and a comfortable 2R + G; ramps climb the whole storey',()=>{
 for(const shape of ['straight','l','u','core'] as StairShape[]){
  const fit=fitInteriorStair(stair(),shape,ctxFor());assert.equal(fit.reason,undefined,`${shape}: ${fit.reason}`);
  assert.ok(fit.riser<=STAIR.riserMax+1e-9&&fit.riser>.15,`${shape} riser ${fit.riser}`);assert.equal(fit.going,.27);
  assert.ok(2*fit.riser+fit.going>=.55&&2*fit.riser+fit.going<=.7);assert.equal(fit.risers*fit.riser>TOP-LOW-1e-6,true);
  const ramps=fit.decks.filter(d=>d.id.includes('/ramp')),climbed=ramps.reduce((s,d)=>s+(d.rise??0),0),steps=ramps.length*fit.riser;
  assert.ok(Math.abs(climbed+steps-(TOP-LOW))<1e-6,`${shape}: ramps and half risers make up the storey (${climbed}+${steps})`);
  assert.ok(ramps.every(d=>(d.rise??0)/d.depth<fit.riser/fit.going+1e-6),'no ramp is steeper than the stair pitch');
 }
 const spiral=fitInteriorStair(stair(),'spiral',ctxFor());assert.equal(spiral.reason,undefined);assert.ok(spiral.riser<=STAIR.riserMax);
});

test('landings: an L turns at a quarter landing, a U returns beside itself at a half landing at mid-storey',()=>{
 const l=fitInteriorStair(stair(),'l',ctxFor()),u=fitInteriorStair(stair(),'u',ctxFor()),n=Math.ceil((TOP-LOW)/STAIR.riserMax),h=(TOP-LOW)/n,mid=LOW+Math.ceil(n/2)*h;
 const lq=l.decks.find(d=>d.id==='s/landing0')!,uh=u.decks.find(d=>d.id==='s/landing0')!;
 assert.ok(Math.abs(lq.y-mid)<1e-9&&Math.abs(uh.y-mid)<1e-9,'both landings at the mid-storey level');
 assert.ok(Math.abs(lq.width-STAIR.width)<1e-6&&Math.abs(lq.depth-STAIR.width)<1e-6,'a square quarter landing');
 assert.ok(Math.abs(uh.width-(2*STAIR.width+STAIR.gap))<1e-6,'a half landing spans both flights and the well');
 const run=(Math.ceil(n/2)-1)*STAIR.going;assert.ok(lq.z>-3+run&&uh.z>-3+run,'the landing lies beyond the first flight');
 // L (not flipped) turns left: the second flight heads +x; the U comes back (−z) in a lane to the left (+x).
 const ramp1=l.decks.find(d=>d.id==='s/ramp1')!;assert.ok(Math.abs(Math.sin(ramp1.rotation)-1)<1e-6,'L second flight heads left (+x)');
 const u1=u.decks.find(d=>d.id==='s/ramp1')!;assert.ok(Math.cos(u1.rotation)<-.99&&u1.x>-1+STAIR.width,'U second flight returns beside the first');
 const flipped=fitInteriorStair(stair({flip:true}),'u',ctxFor()).decks.find(d=>d.id==='s/ramp1')!;assert.ok(flipped.x<-1-STAIR.width,'flip turns the U the other way');
 assert.ok(u.exit.dz<0&&l.exit.dx>0,'exits: the U arrives heading back, the L heading left');
});

test('entry and exit sides: a side entry starts with a three-riser flight from that side; a side exit leaves a top landing sideways',()=>{
 const left=fitInteriorStair(stair({entry:'left'}),'straight',ctxFor()),right=fitInteriorStair(stair({entry:'right'}),'straight',ctxFor());
 assert.equal(left.reason,undefined);assert.equal(right.reason,undefined);
 // Approaching from the left (+x side) you walk towards −x; the main flight then climbs +z.
 assert.ok(left.entry.dx<-.1&&Math.abs(left.entry.dz)<1e-6,`left entry heads −x ${JSON.stringify(left.entry)}`);assert.ok(right.entry.dx>.1,'right entry heads +x');
 const first=left.decks.find(d=>d.id==='s/ramp0')!,main=left.decks.find(d=>d.id==='s/ramp1')!;assert.ok(Math.abs(first.rise!-2*left.riser)<1e-9,'three risers: two treads on the side flight');assert.ok(Math.abs(Math.cos(main.rotation)-1)<1e-6,'then the main flight climbs +z');
 const exitLeft=fitInteriorStair(stair({exit:'left',x:-2.5}),'straight',ctxFor()),exitRight=fitInteriorStair(stair({exit:'right',x:1.5}),'straight',ctxFor());
 assert.equal(exitLeft.reason,undefined);assert.equal(exitRight.reason,undefined);
 assert.ok(exitLeft.exit.dx>.1&&exitRight.exit.dx<-.1,'the exit turns left (+x) or right (−x)');
 const top=exitLeft.decks.find(d=>d.id==='s/landing-top')!;assert.ok(Math.abs(top.y-TOP)<1e-9,'the side exit leaves from a landing at the upper floor');
 assert.ok(exitLeft.exits.length===1&&Math.abs(exitLeft.exits[0][0][0]-exitLeft.exits[0][1][0])<1e-6,'the open edge is the landing side (parallel to the flight)');
});

test('headroom: a low storey is refused, and clearance counts the slab and the stair itself',()=>{
 assert.match(fitInteriorStair(stair(),'straight',{...ctxFor(),top:LOW+2}).reason??'',/too low/);
 const tread=(x:number,y:number)=>({pts:[[x,0],[x+1,0],[x+1,1],[x,1]] as [number,number][],y});
 assert.ok(Math.abs(stairHeadroom([tread(0,1)],()=>false,3).clearance-2)<1e-9,'under the slab: underside − tread');
 assert.equal(stairHeadroom([tread(0,1)],()=>true,3).clearance,Infinity,'open to the floor above');
 assert.ok(Math.abs(stairHeadroom([tread(0,1),tread(0,2.5)],()=>true,9).clearance-(2.5-STAIR.slab-1))<1e-9,'a stair passing over itself');
 // The spiral's full turn keeps at least the headroom (its landing passes over the first treads).
 const spiral=fitInteriorStair(stair(),'spiral',ctxFor());assert.equal(spiral.reason,undefined);
 const refuse=fitInteriorStair(stair({x:4.75}),'straight',ctxFor());assert.match(refuse.reason??'',/fit within this floor/);
 const noArrival=fitInteriorStair(stair({z:2.5}),'straight',ctxFor());assert.ok(noArrival.reason,'a stair running into the far wall is refused');
});

test('stairwell: the floor above is cut only where headroom needs it, guarded on every side except the arrival',()=>{
 const out=resolve(withStair()),slab=(x:number,z:number)=>out.decks.some(d=>d.id.startsWith('interior/1/')&&studioDeckHeight(d,x,z)!==null);
 assert.deepEqual(out.inactive.filter(i=>i.id==='s'),[]);
 assert.equal(slab(-1,-1),false,'cut over the upper flight');assert.equal(slab(-1,-2.8),true,'the low end stays covered (enough headroom)');assert.equal(slab(-1,1.5),true,'the arrival is floor');
 const guard=out.stairwork!.find(w=>w.kind==='guard'&&w.id==='s/well')!;assert.ok(guard&&guard.floor===1&&(guard.boxes.length+guard.parts.length)>10,'a guard railing on the floor above');
 const world=new StudioWalkingCollision();world.set({id:'g',x:0,z:0,rotation:0,scale:1,result:out});
 // Standing on the upper floor beside the opening, walking into it sideways is blocked; walking off the top of the flight is not.
 assert.ok(world.sweep(.4,TOP,-.5,-1.2,0,.3).t<1,'the side guard blocks');
 const topOfFlight=-3+(Math.ceil(3/STAIR.riserMax)-1)*STAIR.going;assert.equal(world.sweep(-1,TOP,topOfFlight-.25,0,1.2,.3).t,1,'the arrival edge is open');
});

test('every shape walks up to the floor above and back down',()=>{
 for(const [shape,patch] of [['straight',{}],['l',{}],['u',{}],['core',{}],['spiral',{}],['straight',{entry:'left'}],['straight',{exit:'left',x:-2.5}],['u',{flip:true,x:1.5}],['l',{flip:true,x:1.5}]] as [StairShape,Partial<StudioInteriorStair>][]){
  const r=withStair({layout:shape,...patch}),out=resolve(r);assert.deepEqual(out.inactive.filter(i=>i.id==='s'),[],`${shape} ${JSON.stringify(patch)} fits`);
  const fit=fitStairIntent(stair({layout:shape,...patch}),ctxFor());
  const up=walkRoute(out,fit.route);assert.ok(up.foot.y>TOP-.05,`${shape} ${JSON.stringify(patch)}: reached the upper floor (${up.foot.y.toFixed(2)})`);
  const down=walkRoute(out,fit.route,true);assert.ok(down.foot.y<LOW+.05,`${shape}: back down (${down.foot.y.toFixed(2)})`);
 }
});

test('stair core: walls enclose the U on both floors, leaving the entry and arrival open',()=>{
 const out=resolve(withStair({layout:'core'})),walls=out.interiorLevels!.flatMap(l=>l.blocks.filter(b=>b.id.startsWith('s/')&&b.kind==='wall'));
 assert.ok(walls.some(w=>w.floor===0)&&walls.some(w=>w.floor===1),'walls on the lower and upper floor');
 assert.ok(walls.every(w=>out.blockers.some(b=>b.id===w.id)),'core walls collide');
 const fit=fitStairIntent(stair({layout:'core'}),ctxFor());assert.ok(walkRoute(out,fit.route).foot.y>TOP-.05,'still walkable');
});

test('railing styles: every style draws posts, a handrail and infill, and blocks',()=>{
 for(const rail of RAIL_STYLES){const out=resolve(withStair({rail})),work=out.stairwork!.filter(w=>w.id.startsWith('s'));
  assert.ok(work.some(w=>w.kind==='stair'&&w.label==='straight'));const n=work.reduce((s,w)=>s+w.boxes.length+w.cyls.length+w.parts.length+w.meshes.length,0);assert.ok(n>20,`${rail}: ${n}`);
  assert.ok(out.blockers.some(b=>b.id.startsWith('s/rail')||b.id.startsWith('s/well/well')),`${rail} blocks`);
  if(rail==='timber')assert.ok(work.some(w=>w.parts.some(p=>p.part==='baluster-timber'))&&work.some(w=>w.parts.some(p=>p.part==='newel-timber')));
  if(rail==='iron')assert.ok(work.some(w=>w.parts.some(p=>p.part==='panel-iron-scroll')),'iron guards use scroll panels on level runs');
  if(rail==='stone')assert.ok(work.some(w=>w.parts.some(p=>p.part==='baluster-stone')));
  if(rail==='glass')assert.ok(work.some(w=>w.meshes.some(m=>m.m==='glass')));
 }
});

test('old saved stairs keep working: switchback maps to the U, auto and straight resolve unchanged ids',()=>{
 assert.equal(stairShapeOf('switchback'),'u');assert.equal(stairShapeOf('auto'),null);
 const old=resolve(withStair({layout:'switchback'}));assert.deepEqual(old.inactive.filter(i=>i.id==='s'),[]);assert.ok(old.decks.some(d=>d.id==='s/landing0')&&old.decks.some(d=>d.id==='s/ramp1'));
 for(const layout of ['auto','straight'] as const){const out=resolve(withStair({layout}));assert.ok(out.decks.some(d=>d.id==='s/ramp0')&&out.decks.some(d=>d.id==='s/upper'),layout);}
 // A stored stair without the new optional fields validates.
 const r=withStair({layout:'switchback'});assert.equal(validateStudioInterior(r as Extract<StudioRecipe,{version:6}>),null);assert.equal(validateStudio(r),null);
 for(const shape of STAIR_SHAPES){const ok=withStair({layout:shape,rail:'iron',entry:'right',exit:'ahead',width:1.2});assert.equal(validateStudio(ok),null,shape);}
});

test('validation rejects unknown stair values, and business validators reject local stair and entrance fields',()=>{
 for(const bad of [{layout:'ladder'},{rail:'rope'},{entry:'up'},{exit:'back'},{width:3},{colour:'red'}]){const r=withStair(bad as Partial<StudioInteriorStair>);assert.ok(validateStudio(r),JSON.stringify(bad));}
 const v5=box(),studio={...v5.studio,catalogue:'synarc-kit-5' as const,variation:{version:1 as const,seed:1,rules:[],layers:Object.fromEntries(['ground','windows','corners','balconies','accents','roof','props'].map(k=>[k,{pool:[],coverage:0,spacing:0,pattern:'aligned',uniformity:1,zone:'all',seed:0,locked:false}]))}};
 const modular=(s:object)=>({version:1,template:'test',recipe:{version:5,plotSize:24,volumes:v5.volumes,attachments:[],studio:s}});
 assert.equal(validateModularBuilding(modular(studio)),true,'the control recipe is a valid business building');
 assert.equal(validateModularBuilding(modular({...studio,entrances:[{id:'e',target:'building',preset:'stoop'}]})),false,'entrances are rejected');
 assert.equal(validateModularBuilding({version:1,template:'test',recipe:{...withStair({layout:'spiral'}),studio}}),false,'interiors (and their stairs) are rejected');
});

test('stairs keep out of each other: no standing in, starting in or arriving in another stair',()=>{
 const r=upgradeStudioInterior(box(20,12));if(r.version!==6)return;
 // The old failure: an L whose second flight arrives over a straight stair's opening.
 r.interior.stairs.push(stair({id:'straight',x:-8.5,z:1,rotation:Math.PI}),stair({id:'l',layout:'l',x:-5.5,z:1,rotation:Math.PI}));
 const out=resolve(r);assert.match(out.inactive.find(i=>i.id==='l')?.reason??'',/arrive in another stairwell|in the way/);assert.ok(!out.inactive.some(i=>i.id==='straight'));
 r.interior.stairs=[stair({id:'a',x:0,z:-3}),stair({id:'b',x:.6,z:-2.5})];assert.match(resolve(r).inactive.find(i=>i.id==='b')?.reason??'',/in the way|occupies/);
});

test('large plots scale everything up: every shape still climbs in half-riser steps at twice the size',()=>{
 for(const shape of ['straight','l','u','core','spiral'] as StairShape[]){
  const out=resolve(withStair({layout:shape})),fit=fitStairIntent(stair({layout:shape}),ctxFor());
  const up=walkRoute(out,fit.route,false,2);assert.ok(up.foot.y>2*TOP-.1,`${shape} at scale 2: ${up.foot.y.toFixed(2)}`);
 }
});
