// Stairs and entrances (docs/city-stairs-entrances.md), on the running dev server (CITY_TEST_ORIGIN, default
// http://localhost:5180; CITY_BACKEND=webgl for the fallback renderer).
//  1. Entrances: a building with ten doors, each with its own entrance (every preset). In the studio the Building ›
//     Entrances section is exercised (then undone). After Done the character walks around the building to each door,
//     up its steps, stoop, porch or ramp, checks it stands at the threshold, opens the door with E and walks inside.
//     Screenshots: output/entrance-<preset>.png.
//  2. Stairs: a building with every stair shape. The Rooms › Inside stair ghost is shown and a U stair is placed through
//     the UI (then undone). After Done the character enters, climbs each stair to the floor above and back down, and
//     the straight stair's stairwell guard stops a walk into the opening. Screenshots: output/stair-*.png.
//  3. A labelled contact sheet of the stair parts pack: output/stair-pack-contact-sheet.png.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180',backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
let page;const errors=[];
const PRESETS=[['south',.17,'grand'],['south',.5,'stoop'],['south',.83,'porch'],['north',.2,'ramp'],['north',.72,'railed-steps'],['north',.9,'vestibule'],['east',.27,'canopy'],['east',.73,'hood'],['west',.27,'steps'],['west',.73,'slope']];
// Stairs climb +z from the open south half (z ≈ -0.5), leaving room at (0, -4) for the UI placement.
const STAIRS=[['straight',{x:-9.3,z:-.5,rail:'timber'}],['l',{x:-7.3,z:-.5,rail:'iron'}],['core',{x:-2.8,z:-.5,rail:'steel'}],['u',{x:4,z:-.5,rail:'glass'}],['spiral',{x:7.9,z:0,rail:'iron'}]];
const explore=()=>page.locator('canvas').evaluateAll(cs=>{const c=cs.find(c=>c.dataset.cityExploration);return c?JSON.parse(c.dataset.cityExploration):null;});
const held=new Set();const hold=async want=>{for(const k of [...held])if(!want.has(k)){await page.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}};
const goTo=async(target,{tolerance=.4,ms=16000}={})=>{
 await page.keyboard.down('Shift');const started=Date.now();let e=await explore();
 try{while(Date.now()-started<ms){e=await explore();const dx=target.x-e.foot.x,dz=target.z-e.foot.z,dist=Math.hypot(dx,dz);if(dist<tolerance)break;
  const rel=Math.atan2(dx,dz)-e.camera.heading,f=Math.cos(rel),l=Math.sin(rel),want=new Set();if(f>.38)want.add('w');if(f<-.38)want.add('s');if(l>.38)want.add('a');if(l<-.38)want.add('d');await hold(want);await page.waitForTimeout(dist<1.2?60:120);}}
 finally{await hold(new Set());await page.keyboard.up('Shift');}
 await page.waitForTimeout(300);return explore();
};
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const faceTowards=async target=>{const box=await page.locator('canvas').first().boundingBox(),x0=box.x+box.width*.5,y0=box.y+box.height*.42;let gain=-.006;
 for(let i=0;i<8;i++){const e=await explore(),want=Math.atan2(target.x-e.foot.x,target.z-e.foot.z),diff=wrap(want-e.camera.heading);if(Math.abs(diff)<.08)break;
  const px=Math.max(-500,Math.min(500,diff/gain));await page.mouse.move(x0,y0);await page.mouse.down({button:'right'});await page.mouse.move(x0+px,y0,{steps:12});await page.mouse.up({button:'right'});await page.waitForTimeout(400);
  const after=(await explore()).camera.heading,moved=wrap(after-e.camera.heading);if(Math.abs(px)>20&&Math.abs(moved)>.02)gain=moved/px;}};
/** Seed plot 0 with a recipe built in the page (`build` runs with the domain modules) and open the studio on it. */
async function seedAndOpen(tag,build){
 await page.goto(`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:60000});
 const seeded=await page.evaluate(async([tag,src])=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts'),{resolveSculpt}=await import('/src/domain/citySculpt.ts'),{moduleOpeningSpec}=await import('/src/domain/cityStudioModuleSpec.ts'),{emptyInterior}=await import('/src/domain/cityStudioInteriors.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];plot.owner=LAND_OWNER;plot.purchaseId=tag;plot.revision=(plot.revision??0)+1;
  const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
  Object.assign(r.studio,{catalogue:'synarc-kit-5',facade:undefined,openings:[],assemblies:[],stamps:undefined,variation:undefined,paintRegions:undefined,paintRules:undefined,freeTrims:undefined,roofOpenings:undefined,facadeThemes:undefined,facadeRhythm:undefined,entrances:undefined});r.studio.defaults.family='pastel-stucco';r.studio.defaults.roof='flat';r.studio.defaults.window='window-sash';
  const door=(id,side,u)=>{const s=moduleOpeningSpec('door-panelled');return {id,shapeId:'main',side,u,bottom:0,width:s.width,height:s.height,shape:'rect',module:'door-panelled'};};
  new Function('r','door','emptyInterior',src)(r,door,emptyInterior);
  const design={...draft.design,floors:2,middleFloors:1};plot.draft=studioDraft({...draft,design},r);localStorage.setItem(key,JSON.stringify(world));
  const out=resolveSculpt(r,design).studio;return {size:plot.size,inactive:out.inactive,entrances:(out.stairwork??[]).filter(w=>w.kind==='entrance').map(w=>[w.door?.target,w.label]),stairs:(out.stairwork??[]).filter(w=>w.kind==='stair').map(w=>[w.id,w.label])};
 },[tag,build]);
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:60000});await page.waitForTimeout(2000);
 return seeded;
}
/** The plot transform and the resolved result of the saved recipe (the published plot resolves the same). */
async function planOf(tag){return page.evaluate(async tag=>{
 const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),{landPosition}=await import('/src/domain/cityLand.ts'),{fitStairIntent}=await import('/src/domain/cityStudioStairs.ts'),{sculptFloorBottom}=await import('/src/domain/citySculpt.ts');
 const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),plot=JSON.parse(localStorage.getItem(key)).plots.find(p=>p.purchaseId===tag),r=plot.draft.sculpt,d=plot.draft.design,res=resolveSculpt(r,d),out=res.studio,centre=landPosition(plot),rotation=plot.rotation*Math.PI/2,scale=plot.size/24;
 const doors=(out.stairwork??[]).filter(w=>w.door).map(w=>({label:w.label,target:w.door.target,...w.door,portal:(out.portals??[]).filter(p=>p.id.startsWith('exterior/')).sort((a,b)=>Math.hypot(a.x-w.door.x,a.z-w.door.z)-Math.hypot(b.x-w.door.x,b.z-w.door.z))[0]}));
 const stairs=r.version===6?r.interior.stairs.map(s=>{const f=res.floors,low=sculptFloorBottom(0,d.groundHeight,d.upperHeight)+.04,top=sculptFloorBottom(1,d.groundHeight,d.upperHeight)+.04,segs=fl=>r.interior.partitions.filter(p=>p.floor===fl).map(p=>[p.a,p.b]);const fit=fitStairIntent(s,{lower:f[0].polygons,upper:f[1].polygons,low,top,floor:0,upperHeight:f[1].top-f[1].bottom,lowerPartitions:segs(0),upperPartitions:segs(1)});return {id:s.id,shape:fit.shape,reason:fit.reason,route:fit.route,void:fit.void,top};}):[];
 return {centre,rotation,scale,doors,stairs,inactive:out.inactive};
},tag);}
const toWorld=(plan,x,z)=>{const c=Math.cos(plan.rotation),s=Math.sin(plan.rotation);return {x:plan.centre.x+plan.scale*(x*c+z*s),z:plan.centre.z+plan.scale*(-x*s+z*c)};};
const toLocal=(plan,p)=>{const dx=(p.x-plan.centre.x)/plan.scale,dz=(p.z-plan.centre.z)/plan.scale,c=Math.cos(plan.rotation),s=Math.sin(plan.rotation);return {x:dx*c-dz*s,z:dx*s+dz*c};};
async function done(){
 await page.getByRole('button',{name:'Done'}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({state:'detached',timeout:30000});
 await page.waitForFunction(()=>[...document.querySelectorAll('canvas')].some(c=>c.dataset.cityExploration),null,{timeout:30000});
 for(let i=0;i<3&&(await explore())?.mode!=='on-foot';i++){await page.keyboard.press('e');await page.waitForTimeout(1500);}
 assert.equal((await explore())?.mode,'on-foot','walking after Done');await page.waitForTimeout(800);
}

try{
 page=await browser.newPage({viewport:{width:1600,height:950}});page.on('pageerror',e=>errors.push(e.message));
 if(process.env.CITY_ONLY!=='stairs'){
 // ---------------------------------------------------------------------------------------------- 1. Entrances
 const doorsSrc=`r.version=5;delete r.interior;r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:16,depth:9,startFloor:0,spanFloors:2}];
  r.studio.freeOpenings=${JSON.stringify(PRESETS)}.map(([side,u,preset],i)=>door('door-'+preset,side,u));
  r.studio.entrances=${JSON.stringify(PRESETS)}.map(([side,u,preset])=>({id:'e-'+preset,target:'free:door-'+preset,preset,...(preset==='railed-steps'?{rail:'iron',surround:'pediment'}:{})}));`;
 const seeded=await seedAndOpen('stairs-entrances-doors',doorsSrc);
 console.log(JSON.stringify({entrances:seeded.entrances,inactive:seeded.inactive}));
 for(const [,,preset] of PRESETS)assert.ok(seeded.entrances.some(([t,l])=>t===`free:door-${preset}`&&l===preset),`${preset} resolves as itself (${JSON.stringify(seeded.entrances)})`);
 await page.screenshot({path:`output/entrance-studio${suffix}.png`});
 // Building › Entrances: pick a default in the inspector, check the recipe, undo it.
 await page.keyboard.press('Escape');await page.waitForTimeout(400);
 const section=page.getByRole('button',{name:'Building entrances'});
 if(await section.count()){await section.click();await page.getByRole('button',{name:'Entrance: Porch'}).first().click();
  await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(k)).plots.some(p=>p.draft?.sculpt?.studio?.entrances?.some(e=>e.target==='building'&&e.preset==='porch'))),null,{timeout:20000});
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(k)).plots.some(p=>p.purchaseId==='stairs-entrances-doors'&&!p.draft?.sculpt?.studio?.entrances?.some(e=>e.target==='building'))),null,{timeout:20000});
  console.log('Building › Entrances section: set and undone');}
 else console.log('Building entrances section not visible at this selection level (skipped)');
 // Brush › Openings › Doors: the entrance brush arms and highlights every door.
 const brushRail=page.getByRole('navigation',{name:'Building tools'}).getByRole('button',{name:'Paint',exact:true});
 if(await brushRail.count()){await brushRail.first().click();await page.waitForTimeout(400);const openings=page.getByRole('group',{name:'Brush target'}).getByRole('button',{name:/Openings/});if(await openings.count()){await openings.first().click();await page.getByRole('group',{name:'Opening type'}).getByRole('button',{name:'Doors',exact:true}).click();
  const arm=page.getByRole('button',{name:'Entrance brush'});await arm.waitFor({timeout:8000});await page.getByRole('button',{name:'Entrance: Porch'}).first().click();await arm.click();
  const box=await page.locator('canvas').first().boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.55,{steps:4});await page.waitForTimeout(900);await page.screenshot({path:`output/entrance-brush${suffix}.png`});
  assert.equal(await arm.getAttribute('aria-pressed'),'true','the entrance brush is armed');await arm.click();console.log('Entrance brush tray: armed and disarmed');}}
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:60000});
 await done();
 let plan=await planOf('stairs-entrances-doors');
 if(process.env.DEBUG_WALK){const e0=await explore();console.log(JSON.stringify({spawn:toLocal(plan,e0.foot),y:e0.foot.y,camera:e0.camera}));await page.screenshot({path:'output/stairs-entrances-spawn.png'});for(const k of ['w','a','s','d']){await page.keyboard.down(k);await page.waitForTimeout(1500);await page.keyboard.up(k);const e=await explore();console.log(k,JSON.stringify(toLocal(plan,e.foot)),e.foot.y);}process.exit(0);}
 const ring=[[10.5,8.1],[-10.5,8.1],[-10.5,-8.1],[10.5,-8.1]].map(([x,z])=>toWorld(plan,x,z));
 const sideOf=p=>{const l=toLocal(plan,p);return Math.abs(l.z)/4.5>Math.abs(l.x)/8?(l.z>0?0:2):(l.x<0?1:3);};
 // First step straight out to the ring (never along the wall, where entrances stand), then corner to corner.
 const toRing=async()=>{const l=toLocal(plan,(await explore()).foot),inside=Math.abs(l.x)<10.5&&Math.abs(l.z)<8.1,k=Math.min(10.5/Math.max(Math.abs(l.x),.01),8.1/Math.max(Math.abs(l.z),.01)),x=inside?l.x*k:Math.max(-10.5,Math.min(10.5,l.x)),z=inside?l.z*k:Math.max(-8.1,Math.min(8.1,l.z));if(Math.hypot(x-l.x,z-l.z)>.3)await goTo(toWorld(plan,x,z),{tolerance:.8,ms:15000});};
 const around=async target=>{await toRing();let e=await explore(),from=sideOf(e.foot);const to=sideOf(target);for(let guard=0;from!==to&&guard<6;guard++){const step=((to-from+4)%4)<=2?1:-1,corner=step>0?(from+1)%4:from;let got=await goTo(ring[corner],{tolerance:.8,ms:24000});for(let retry=0;retry<3&&Math.hypot(got.foot.x-ring[corner].x,got.foot.z-ring[corner].z)>1.6;retry++){// Caught on garden ground or a kerb: side-step outward or inward, then carry on.
   const l=toLocal(plan,got.foot);console.log(JSON.stringify({stuckAt:l,corner,retry}));const k=retry===1?.8:1.15;await goTo(toWorld(plan,l.x*(Math.abs(l.x)>Math.abs(l.z)*1.2?k:1),l.z*(Math.abs(l.x)>Math.abs(l.z)*1.2?1:k)),{tolerance:.5,ms:6000});got=await goTo(ring[corner],{tolerance:.8,ms:24000});}from=(from+step+4)%4;}return goTo(target,{tolerance:.45,ms:24000});};
 const entranceResults={};
 for(const [,,preset] of PRESETS){
  const door=plan.doors.find(d=>d.target===`free:door-${preset}`),p=door.portal,nx=Math.sin(door.rotation),nz=Math.cos(door.rotation),at=(k)=>toWorld(plan,p.x+nx*k,p.z+nz*k);
  const side=PRESETS.find(x=>x[2]===preset)[0],outside=at(preset==='grand'||preset==='porch'?4.2:side==='east'||side==='west'?2.5:3.4),centre=toWorld(plan,p.x,p.z);
  let e=await around(outside);if(Math.hypot(e.foot.x-outside.x,e.foot.z-outside.z)>=1)console.log(JSON.stringify({debug:preset,centre:plan.centre,rotation:plan.rotation,outsideLocal:toLocal(plan,outside),footLocal:toLocal(plan,e.foot),doorLocal:{x:p.x,z:p.z,rot:door.rotation}}));assert.ok(Math.hypot(e.foot.x-outside.x,e.foot.z-outside.z)<1,`${preset}: reached the street in front (${JSON.stringify(e.foot)})`);
  // East and west doors sit near the plot's garden wall: shoot them from along the wall so the camera stays on the plot.
  if(side==='east'||side==='west'){const tx=Math.cos(door.rotation),tz=-Math.sin(door.rotation),k=Math.sign(p.x*tx+p.z*tz)||1;e=await goTo(toWorld(plan,p.x+nx*2+tx*k*3.4,p.z+nz*2+tz*k*3.4),{tolerance:.4,ms:9000});}
  await faceTowards(centre);await page.waitForTimeout(700);await page.screenshot({path:`output/entrance-${preset}${suffix}.png`});
  if(side==='east'||side==='west')e=await goTo(outside,{tolerance:.45,ms:9000});
  e=await goTo(at(.5),{tolerance:.3,ms:9000});const onLanding=e.foot.y/plan.scale;
  assert.ok(Math.abs(onLanding-door.top)<.06,`${preset}: climbed to the threshold (${onLanding.toFixed(3)} vs ${door.top.toFixed(3)})`);
  const before=(await explore()).door;assert.ok(before&&before.id.startsWith('exterior/'),`${preset}: next to the door (${JSON.stringify(before)})`);
  await page.keyboard.press('e');await page.getByText('Door opened').waitFor({timeout:3000});await page.waitForTimeout(900);
  e=await goTo(at(-2),{tolerance:.45,ms:9000});const inside=(e.foot.x-centre.x)*Math.sin(door.rotation+plan.rotation)+(e.foot.z-centre.z)*Math.cos(door.rotation+plan.rotation);
  assert.ok(inside<-1.2,`${preset}: walked in through the door (${inside.toFixed(2)})`);
  e=await goTo(at(.5),{tolerance:.35,ms:9000});e=await goTo(outside,{tolerance:.5,ms:12000});
  entranceResults[preset]={threshold:+onLanding.toFixed(3),inside:+inside.toFixed(2)};
 }
 console.log(JSON.stringify({entrances:entranceResults}));
 }
 // ---------------------------------------------------------------------------------------------- 2. Stairs
 const stairsSrc=`r.version=6;r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:20,depth:12,startFloor:0,spanFloors:2}];r.interior=emptyInterior();
  r.studio.freeOpenings=[door('door-main','north',.5)];r.studio.entrances=[{id:'e-main',target:'free:door-main',preset:'steps'}];
  r.interior.stairs=${JSON.stringify(STAIRS)}.map(([layout,o])=>({id:'stair-'+layout,floor:0,x:o.x,z:o.z,rotation:0,layout,flip:false,rail:o.rail}));`;
 const stairSeed=await seedAndOpen('stairs-entrances-stairs',stairsSrc);
 console.log(JSON.stringify({stairs:stairSeed.stairs,inactive:stairSeed.inactive}));
 for(const [shape] of STAIRS)assert.ok(stairSeed.stairs.some(([id,l])=>id===`stair-${shape}`&&l===shape),`${shape} stair fits (${JSON.stringify(stairSeed.inactive)})`);
 // Rooms shows the ground floor cut away: an overview of every stair, then the placement ghost.
 await page.getByRole('button',{name:'Rooms',exact:true}).click();await page.waitForTimeout(2500);await page.screenshot({path:`output/stair-overview${suffix}.png`});await page.getByRole('button',{name:'Inside stair'}).click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.cityStudio||'{}').tool==='interior-stair',null,{timeout:15000});
 await page.getByRole('group',{name:'Interior stair shape'}).getByRole('button',{name:'U',exact:true}).click();
 const anchors=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStudio).interiorAnchors);
 await page.mouse.move(anchors.stairStart.x,anchors.stairStart.y,{steps:4});await page.mouse.move(anchors.stairStart.x+2,anchors.stairStart.y+1,{steps:2});
 await page.locator('.studio-stair-ghost-label').first().waitFor({timeout:10000});const ghostLabel=await page.locator('.studio-stair-ghost-label').first().innerText();
 await page.screenshot({path:`output/stair-ghost${suffix}.png`});console.log(JSON.stringify({ghost:ghostLabel}));
 await page.mouse.move(anchors.stairStart.x,anchors.stairStart.y);await page.mouse.down();await page.mouse.move(anchors.stairEnd.x,anchors.stairEnd.y,{steps:12});await page.mouse.up();
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(k)).plots.some(p=>p.purchaseId==='stairs-entrances-stairs'&&p.draft?.sculpt?.interior?.stairs?.some(s=>s.layout==='u'&&!s.id.startsWith('stair-')))),null,{timeout:20000});
 console.log('Placed a U stair through Rooms › Inside stair');
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:60000});
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(k)).plots.some(p=>p.purchaseId==='stairs-entrances-stairs'&&p.draft?.sculpt?.interior?.stairs?.length===5)),null,{timeout:20000});
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:60000});await page.waitForTimeout(800);
 await done();
 const plan=await planOf('stairs-entrances-stairs');
 const main=plan.doors.find(d=>d.target==='free:door-main'),mp=main.portal,mnx=Math.sin(main.rotation),mnz=Math.cos(main.rotation);
 await goTo(toWorld(plan,mp.x+mnx*3.2,mp.z+mnz*3.2),{tolerance:.5,ms:24000});await goTo(toWorld(plan,mp.x+mnx*.5,mp.z+mnz*.5),{tolerance:.3,ms:9000});
 await page.keyboard.press('e');await page.getByText('Door opened').waitFor({timeout:3000});await page.waitForTimeout(900);
 await goTo(toWorld(plan,mp.x-mnx*2,mp.z-mnz*2),{tolerance:.4,ms:9000});
 const stairResults={};
 for(const s of plan.stairs){if(process.env.ONLY_SHAPE&&s.shape!==process.env.ONLY_SHAPE)continue;
  assert.ok(!s.reason,`${s.id}: ${s.reason}`);const route=s.route.map(p=>({...toWorld(plan,p[0],p[2]),y:p[1]}));
  // Along the open middle of the ground floor to the stair's entry.
  let e=await explore();const mid=toWorld(plan,toLocal(plan,route[0]).x,-2.7);await goTo(mid,{tolerance:.5,ms:20000});e=await goTo(route[0],{tolerance:.35,ms:15000});
  await faceTowards(route[1]);await page.waitForTimeout(600);await page.screenshot({path:`output/stair-${s.shape}${suffix}.png`});
  for(const p of route.slice(1)){e=await goTo(p,{tolerance:.3,ms:12000});if(process.env.DEBUG_ROUTE)console.log(s.shape,JSON.stringify({want:toLocal(plan,p),wantY:p.y,at:toLocal(plan,e.foot),y:e.foot.y/plan.scale}));}
  const up=e.foot.y/plan.scale;assert.ok(Math.abs(up-s.top)<.08,`${s.shape}: reached the floor above (${up.toFixed(2)} vs ${s.top.toFixed(2)})`);
  await faceTowards(route[Math.max(0,route.length-3)]);await page.waitForTimeout(600);await page.screenshot({path:`output/stair-${s.shape}-top${suffix}.png`});
  let guard=null;
  if(s.shape==='straight'){// Stairwell guard: beside the opening on the floor above, walking across it is stopped by the guard.
   const l=toLocal(plan,e.foot),beside=toWorld(plan,-8.25,l.z),side=toWorld(plan,-8.25,l.z-2),across=toWorld(plan,-11,l.z-2);e=await goTo(beside,{tolerance:.3,ms:8000});e=await goTo(side,{tolerance:.3,ms:8000});
   const beforeY=e.foot.y;e=await goTo(across,{tolerance:.3,ms:3000});const x=toLocal(plan,e.foot).x;guard={x:+x.toFixed(2),y:+(e.foot.y/plan.scale).toFixed(2)};
   assert.ok(x>-8.75&&Math.abs(e.foot.y-beforeY)<.05,`the stairwell guard stops the walk (${JSON.stringify(guard)})`);
   await page.screenshot({path:`output/stair-well-guard${suffix}.png`});e=await goTo(beside,{tolerance:.3,ms:8000});e=await goTo(route.at(-1),{tolerance:.3,ms:8000});
  }
  for(const p of [...route].reverse().slice(1))e=await goTo(p,{tolerance:.3,ms:12000});
  const down=e.foot.y/plan.scale;assert.ok(down<.8,`${s.shape}: back down (${down.toFixed(2)})`);
  stairResults[s.shape]={top:+up.toFixed(2),down:+down.toFixed(2),...(guard?{guard}:{})};
 }
 console.log(JSON.stringify({stairs:stairResults}));
 // ---------------------------------------------------------------------------------------------- 3. Pack contact sheet
 const catalogue=JSON.parse(readFileSync('public/city/stairs/v1/catalogue.json','utf8'));
 const sheet=await browser.newPage({viewport:{width:1240,height:720}});
 await sheet.goto(`${origin}/city/stairs/v1/catalogue.json`);
 await sheet.setContent(`<html><body style="margin:0;background:#efe9df;font:13px system-ui"><h2 style="margin:14px 18px 4px">City stair parts v1 <small style="font-weight:400;color:#6a655c">(${Object.keys(catalogue.parts).length} parts; full / medium triangles)</small></h2><div style="display:grid;grid-template-columns:repeat(6,190px);gap:10px;padding:10px 18px">${Object.entries(catalogue.parts).map(([id,p])=>`<figure style="margin:0;background:#fff;border-radius:8px;padding:6px;text-align:center"><img src="${origin}${p.thumbnail}" style="width:170px;height:170px;object-fit:contain"><figcaption><b>${p.label}</b><br><code>${id}</code> · ${p.triangles} / ${p.trianglesMedium}</figcaption></figure>`).join('')}</div></body></html>`);
 await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:20000});await sheet.screenshot({path:'output/stair-pack-contact-sheet.png',fullPage:true});await sheet.close();
 assert.deepEqual(errors,[]);
 console.log('Stairs and entrances: every entrance climbed and entered, every stair climbed and descended, the stairwell guard holds.');
}catch(error){if(page)await page.screenshot({path:`output/stairs-entrances-failure${suffix}.png`}).catch(()=>{});throw error;}finally{await browser.close();}
