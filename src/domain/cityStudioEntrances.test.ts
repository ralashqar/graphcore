// Door entrances (docs/city-stairs-entrances.md): every preset fits the door and threshold, walks from the street up
// onto the landing, theme defaults, per-door choices beat part and building ones, fallbacks, validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign,type CityBuildingDesignV3} from './cityBuildingV3.ts';
import {resolveSculpt} from './citySculpt.ts';
import {freshStudio,studioFloorCount,validateStudio} from './cityStudio.ts';
import {ENTRANCE_PRESETS,THEME_ENTRANCES,buildEntrance,entranceChoice,resolveStudioEntrances,setStudioEntrance,validateStudioEntrances,type EntrancePreset} from './cityStudioEntrances.ts';
import {applyFacadeTheme,themeStarterRecipe} from './cityStudioThemes.ts';
import {WalkingWorld,advanceFoot,createFootState} from './cityExploration.ts';
import {DriveWorld} from './cityDriveWorld.ts';
import {StudioWalkingCollision} from './cityStudioCollision.ts';
import type {StudioRecipe,StudioResolved} from './cityStudioTypes.ts';

const box=():StudioRecipe=>({version:5,volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:10,depth:12,startFloor:0,spanFloors:2}],attachments:[],plotSize:24,studio:freshStudio()});
const design=(r:StudioRecipe):CityBuildingDesignV3=>({...newDesign('entrances'),groundHeight:3.4,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none',roof:'flat'});
const resolve=(r:StudioRecipe)=>resolveSculpt(r,design(r)).studio!;
const entrances=(out:StudioResolved)=>(out.stairwork??[]).filter(w=>w.kind==='entrance');
const THRESHOLD=.69;
/** Walk from `out` metres in front of the door straight at it; returns the foot on arrival next to the door. */
function walkToDoor(out:StudioResolved,from=4.4){
 const landing=out.decks.find(d=>d.id.startsWith('entry/')&&d.id.endsWith('/landing'))!,door=out.portals!.filter(p=>p.id.startsWith('exterior/')).sort((a,b)=>Math.hypot(a.x-landing.x,a.z-landing.z)-Math.hypot(b.x-landing.x,b.z-landing.z))[0];
 const nx=Math.sin(landing.rotation),nz=Math.cos(landing.rotation),world=new WalkingWorld(new DriveWorld(300));world.studio.set({id:'e',x:0,z:0,rotation:0,scale:1,result:out});
 const foot=createFootState(door.x+nx*from,door.z+nz*from),tx=door.x+nx*.45,tz=door.z+nz*.45;foot.y=.18;
 for(let i=0;i<900&&Math.hypot(tx-foot.x,tz-foot.z)>.1;i++)advanceFoot(foot,{forward:true,reverse:false,left:false,right:false,walk:true},Math.atan2(tx-foot.x,tz-foot.z),1/60,world);
 return {foot,door,landing,distance:Math.hypot(tx-foot.x,tz-foot.z)};
}

test('every preset fits the door: a level landing at the threshold and a flight from the ground to it',()=>{
 for(const preset of ENTRANCE_PRESETS){
  const r=setStudioEntrance(box(),'building',{preset}),out=resolve(r),work=entrances(out);
  assert.ok(work.some(w=>w.label===preset),`${preset}: resolved (${work.map(w=>w.label)})`);assert.deepEqual(out.inactive,[],preset);
  const landing=out.decks.find(d=>d.id.startsWith('entry/')&&d.id.endsWith('/landing'))!,flight=out.decks.find(d=>d.id===landing.id.replace(/\/landing$/,''))!;
  assert.ok(Math.abs(landing.y-THRESHOLD)<1e-6,`${preset}: the landing is level with the threshold`);
  assert.ok(Math.abs(flight.y-.18)<1e-6&&Math.abs(flight.y+(flight.rise??0)-THRESHOLD)<1e-6,`${preset}: the flight climbs from the ground to the threshold`);
  const door=out.portals!.find(p=>p.id.startsWith('exterior/'))!;assert.ok(flight.width>=Math.min(door.width+.25,1.3),`${preset}: the flight is at least the door wide`);
 }
});

test('the character walks from the street up every entrance and stands at the door',()=>{
 for(const preset of ENTRANCE_PRESETS){
  const out=resolve(setStudioEntrance(box(),'building',{preset})),{foot,distance}=walkToDoor(out);
  assert.ok(distance<.2,`${preset}: reached the door (${distance.toFixed(2)} m short)`);assert.ok(Math.abs(foot.y-THRESHOLD)<.03,`${preset}: on the landing (${foot.y.toFixed(3)})`);
 }
});

test('entrances collide: steps are climbed from the front, rails, cheeks and columns block from the side',()=>{
 for(const preset of ['railed-steps','stoop','porch','grand','vestibule'] as EntrancePreset[]){
  const out=resolve(setStudioEntrance(box(),'building',{preset})),landing=out.decks.find(d=>d.id.startsWith('entry/')&&d.id.endsWith('/landing'))!,c=Math.cos(landing.rotation),s=Math.sin(landing.rotation);
  const world=new StudioWalkingCollision();world.set({id:'c',x:0,z:0,rotation:0,scale:1,result:out});
  // From beside the entrance on the ground, walking along the wall across it is blocked.
  const at=(u:number,v:number)=>({x:landing.x+c*u+s*v,z:landing.z-s*u+c*v}),a=at(-4,.6),b=at(4,.6);
  assert.ok(world.sweep(a.x,.18,a.z,b.x-a.x,b.z-a.z,.3).t<1,`${preset}: blocked from the side`);
 }
});

test('facade themes pick their entrance: brownstone stoop, Georgian railed steps, civic grand stair; shops keep plain steps',()=>{
 const themed=(id:string)=>{const start=themeStarterRecipe(null,design(box()),id,24,7);if('reason' in start)throw Error(start.reason);const r=start.recipe,out=applyFacadeTheme(r,{...design(r),floors:studioFloorCount(r)},id,{seed:7});if('reason' in out)throw Error(out.reason);return entrances(resolveSculpt(out.recipe,{...design(out.recipe),floors:studioFloorCount(out.recipe)}).studio!).map(w=>w.label);};
 assert.ok(themed('nyc-brownstone').includes('stoop'));assert.ok(themed('london-georgian').includes('railed-steps'));assert.ok(themed('civic-classical').includes('grand'));
 const tenement=themed('nyc-tenement');assert.ok(tenement.includes('railed-steps'),`tenement lobby ${tenement}`);assert.ok(tenement.includes('steps'),'its storefronts keep plain steps');
 for(const [id,t] of Object.entries(THEME_ENTRANCES))assert.ok(ENTRANCE_PRESETS.includes(t.preset),id);
});

test('choice order: door beats part beats building beats theme; a treatment that leaves the plot falls back with a reason',()=>{
 let r:StudioRecipe=box();r=setStudioEntrance(r,'building',{preset:'porch'});r=setStudioEntrance(r,'part:main',{preset:'hood'});
 assert.equal(entranceChoice(r,{members:['x'],partId:'main'}).preset,'hood');assert.equal(entranceChoice(r,{members:['x'],partId:'annex'}).preset,'porch');
 r=setStudioEntrance(r,'free:x',{preset:'stoop',rail:'timber'});const own=entranceChoice(r,{members:['x'],partId:'main'});assert.equal(own.preset,'stoop');assert.equal(own.rail,'timber');
 r=setStudioEntrance(r,'stamp:shop1',{preset:'canopy'});assert.equal(entranceChoice(r,{members:['stamp/shop1/opening/0'],partId:'main'}).preset,'canopy');
 r=setStudioEntrance(r,'free:x',null);assert.equal(entranceChoice(r,{members:['x'],partId:'main'}).preset,'hood');
 // A grand stair on a door 1 m from the plot edge does not fit: steps instead, and the explicit choice says why.
 const edge=setStudioEntrance(box(),'building',{preset:'grand'}),ring:[number,number][]=[[5,-3],[11,-3],[11,3],[5,3]];
 const fitted=resolveStudioEntrances(edge,[{key:'d',members:[],partId:'main',origin:[11.15,0],rotation:Math.PI/2,width:1.1,top:THRESHOLD,head:2.9}],[[ring]],12);
 assert.equal(fitted.chosen.d,'steps');assert.match(fitted.inactive[0]?.reason??'',/leave the plot/);
 // Two doors side by side: the second porch would overlap the first, so it becomes steps.
 const pair=resolveStudioEntrances(setStudioEntrance(box(),'building',{preset:'porch'}),[{key:'a',members:[],partId:'main',origin:[-1,6.15],rotation:0,width:1.1,top:THRESHOLD,head:2.9},{key:'b',members:[],partId:'main',origin:[1.2,6.15],rotation:0,width:1.1,top:THRESHOLD,head:2.9}],[[[[-5,-6],[5,-6],[5,6],[-5,6]]]],12);
 assert.equal(pair.chosen.a,'porch');assert.equal(pair.chosen.b,'steps');
 // The ramp tries its other side before giving up.
 const ramp=resolveStudioEntrances(setStudioEntrance(box(),'building',{preset:'ramp',side:'right'}),[{key:'r',members:[],partId:'main',origin:[8,6.15],rotation:0,width:1.1,top:THRESHOLD,head:2.9}],[[[[-5,-6],[5,-6],[5,6],[-5,6]]]],12);
 assert.equal(ramp.chosen.r,'ramp');
});

test('surrounds and parts: pediments and stoop lamps are instanced Blender parts',()=>{
 const door={key:'d',members:[],partId:'main',origin:[0,0] as [number,number],rotation:0,width:1.1,top:THRESHOLD,head:2.9};
 assert.ok(buildEntrance(door,{preset:'steps',rail:'iron',material:'stone',side:'right',surround:'pediment'}).work.parts.some(p=>p.part==='pediment'));
 assert.ok(buildEntrance(door,{preset:'stoop',rail:'iron',material:'brownstone',side:'right',surround:'none'}).work.parts.filter(p=>p.part==='newel-lamp').length===2);
 assert.ok(buildEntrance(door,{preset:'porch',rail:'timber',material:'deck',side:'right',surround:'none'}).work.parts.some(p=>p.part==='porch-column'));
 assert.ok(buildEntrance(door,{preset:'hood',rail:'iron',material:'stone',side:'right',surround:'none'}).work.parts.filter(p=>p.part==='bracket-console').length===2);
 assert.ok(buildEntrance(door,{preset:'grand',rail:'stone',material:'stone',side:'right',surround:'none'}).work.parts.some(p=>p.part==='urn-finial'));
});

test('validation: entrance choices are strict local data',()=>{
 assert.equal(validateStudioEntrances(undefined),null);assert.equal(validateStudioEntrances([{id:'a',target:'building',preset:'stoop',rail:'iron',side:'left',surround:'pediment'}]),null);
 for(const bad of [[{id:'a',target:'building',preset:'moat'}],[{id:'a',target:'roof',preset:'steps'}],[{id:'a',target:'building',preset:'steps',rail:'rope'}],[{id:'a',target:'building',preset:'steps'},{id:'b',target:'building',preset:'porch'}],[{id:'a',target:'building',preset:'steps',colour:'red'}],'x'])assert.ok(validateStudioEntrances(bad),JSON.stringify(bad));
 const r=setStudioEntrance(box(),'kit:door-1',{preset:'grand'});assert.equal(validateStudio(r),null);
 assert.ok(validateStudio({...r,studio:{...r.studio,entrances:[{id:'x',target:'building',preset:'nope' as EntrancePreset}]}}));
});
