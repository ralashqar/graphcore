// Every door opens (docs/city-free-doors-glass.md): a studio building WITHOUT interiors (recipe v5): the main part has a
// classic kit door tile (west wall), a Tokyo sliding door and a storefront double door as kit pieces in its generated
// north wall; a separate annex carries a facade-rhythm shopfront (a part with a manual door gets no generated one). Press Done, walk the character to each door, press E, check the door
// state opens (swing, slide or roll), walk through it into the implicit empty interior and back out. Screenshots:
// output/kit-doors-*.png. Run against the dev server (CITY_TEST_ORIGIN, default http://localhost:5180);
// CITY_BACKEND=webgl for the fallback renderer.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
let page;
try{
 page=await browser.newPage({viewport:{width:1600,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://localhost:5180'}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:60000});
 const seeded=await page.evaluate(async()=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft,studioBays}=await import('/src/domain/cityStudio.ts'),{resolveSculpt}=await import('/src/domain/citySculpt.ts'),{moduleOpeningSpec}=await import('/src/domain/cityStudioModuleSpec.ts'),{newFacadeRhythm}=await import('/src/domain/cityStudioFacadeRhythm.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='kit-doors-browser';plot.revision=1;
  const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
  r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:-4,z:0,width:10,depth:10,startFloor:0,spanFloors:2},{id:'annex',kind:'rectangle',operation:'add',x:6,z:-1,width:6,depth:8,startFloor:0,spanFloors:2}];
  r.version=5;delete r.interior;
  Object.assign(r.studio,{catalogue:'synarc-kit-5',facade:undefined,openings:[],assemblies:[],stamps:undefined,variation:undefined,paintRegions:undefined,paintRules:undefined,freeTrims:undefined,roofOpenings:undefined});r.studio.defaults.family='pastel-stucco';r.studio.defaults.roof='flat';r.studio.defaults.window='window-sash';
  const kit=(id,module,u)=>{const s=moduleOpeningSpec(module);return {id,shapeId:'main',side:'north',u,bottom:0,width:s.width,height:s.height,shape:'rect',module};};
  r.studio.freeOpenings=[kit('tokyo','door-tokyo-sliding',.25),kit('shop','door-shop-aluminium',.72)];
  const design={...draft.design,floors:2,middleFloors:1};
  const west=studioBays(r,design).filter(b=>b.anchor.side==='west'&&b.anchor.floor===0).sort((a,b)=>a.anchor.u-b.anchor.u);
  r.studio.openings=[{id:'tile-door',anchor:west[Math.floor(west.length/2)].anchor,module:'door-panelled'}];
  // A shopfront rhythm on the annex only; pick a seed that puts a door on its ground floor.
  let chosen=null;
  for(let seed=1;seed<30&&!chosen;seed++){r.studio.facadeRhythm={...newFacadeRhythm('shopfront',seed),rules:[{partId:'main',off:true}]};
   const out=resolveSculpt(r,design).studio;if((out.portals??[]).some(p=>p.id.includes('generated/')&&p.floor===0))chosen=seed;}
  plot.draft=studioDraft({...draft,design},r);localStorage.setItem(key,JSON.stringify(world));
  const last=resolveSculpt(r,design).studio;return {plot:plot.id,size:plot.size,seed:chosen,portals:chosen?undefined:(last.portals??[]).map(p=>p.id),inactive:last.inactive};
 });
 console.log(JSON.stringify(seeded));assert.ok(seeded.seed,'a rhythm seed with a ground-floor door');
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:60000}).catch(()=>{});
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:60000});
 await page.waitForTimeout(1500);
 await page.getByRole('button',{name:'Done'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({state:'detached',timeout:30000});
 const explore=()=>page.locator('canvas').evaluateAll(cs=>{const c=cs.find(c=>c.dataset.cityExploration);return c?JSON.parse(c.dataset.cityExploration):null;});
 await page.waitForFunction(()=>[...document.querySelectorAll('canvas')].some(c=>c.dataset.cityExploration),null,{timeout:30000});
 for(let i=0;i<3&&(await explore())?.mode!=='on-foot';i++){await page.keyboard.press('e');await page.waitForTimeout(1500);}
 assert.equal((await explore())?.mode,'on-foot','walking after Done');
 await page.waitForTimeout(800);
 // Doors in world space, grouped per door, from the saved recipe (the same resolve as the published plot).
 const plan=await page.evaluate(async()=>{
  const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),{landPosition}=await import('/src/domain/cityLand.ts'),{doorGroupKey}=await import('/src/domain/cityStudioDoorMotion.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),plot=JSON.parse(localStorage.getItem(key)).plots.find(p=>p.purchaseId==='kit-doors-browser');
  const out=resolveSculpt(plot.draft.sculpt,plot.draft.design).studio,centre=landPosition(plot),rotation=plot.rotation*Math.PI/2,scale=plot.size/24,c=Math.cos(rotation),s=Math.sin(rotation);
  const w=(lx,lz)=>({x:centre.x+scale*(lx*c+lz*s),z:centre.z+scale*(-lx*s+lz*c)});
  const groups=new Map();for(const p of out.portals)if(p.id.startsWith('exterior/')&&p.floor===0){const k=doorGroupKey(p.id);(groups.get(k)??groups.set(k,[]).get(k)).push(p);}
  const pick=test=>[...groups.entries()].find(([k])=>test(k));
  const doors={tile:pick(k=>k.startsWith('exterior/kit/main/west')),tokyo:pick(k=>k==='exterior/kit/free/tokyo'),storefront:pick(k=>k==='exterior/kit/free/shop'),rhythm:pick(k=>k.includes('generated/'))};
  const view={};for(const [name,entry] of Object.entries(doors)){if(!entry){view[name]=null;continue;}const [id,leaves]=entry,p=leaves[0],x=leaves.reduce((a,q)=>a+q.x,0)/leaves.length,z=leaves.reduce((a,q)=>a+q.z,0)/leaves.length,nx=Math.sin(p.rotation),nz=Math.cos(p.rotation);
   view[name]={id,leaves:leaves.map(q=>q.id),motion:p.motion??'swing',local:{x,z,nx,nz},centre:w(x,z),outside:w(x+nx*1.7,z+nz*1.7),front:w(x+nx*.5,z+nz*.5),inside:w(x-nx*2.4,z-nz*2.4),normal:{x:nx*c+nz*s,z:-nx*s+nz*c},y:Math.min(...leaves.map(q=>q.y))*scale};}
  // Inside the garden walls, which now block walking (docs/city-ground-contact.md).
  const corners=[[10.2,7.6],[-10.2,7.6],[-10.2,-7.6],[10.2,-7.6]].map(([x,z])=>w(x,z));
  return {plot:plot.id,implicit:!!out.implicitInterior,doors:view,corners,centre,scale,rotation};
 });
 console.log(JSON.stringify({implicit:plan.implicit,doors:Object.fromEntries(Object.entries(plan.doors).map(([k,v])=>[k,v&&{id:v.id,leaves:v.leaves.length,motion:v.motion}]))}));
 assert.equal(plan.implicit,true,'a building without interiors resolves an implicit one');
 for(const name of ['tile','tokyo','storefront','rhythm'])assert.ok(plan.doors[name],`${name} door is a portal`);
 assert.equal(plan.doors.tokyo.motion,'slide');assert.equal(plan.doors.storefront.leaves.length,2);
 const held=new Set();const hold=async want=>{for(const k of [...held])if(!want.has(k)){await page.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}};
 // Keys steer in eight directions (the one nearest the target). Pressing along a direction square to a face (the side
 // riser of an entrance's first stone step) leaves no tangential velocity to slide on, so after .7 s without progress
 // the walker holds the neighbouring direction on the target's side for .45 s, as a player would.
 const keysFor=a=>{const f=Math.cos(a),l=Math.sin(a),want=new Set();if(f>.38)want.add('w');if(f<-.38)want.add('s');if(l>.38)want.add('a');if(l<-.38)want.add('d');return want;};
 const goTo=async(target,{tolerance=.4,ms=16000}={})=>{
  await page.keyboard.down('Shift');const started=Date.now();let e=await explore(),best=Infinity,progressAt=Date.now(),detourUntil=0,detour=0;
  try{while(Date.now()-started<ms){e=await explore();const dx=target.x-e.foot.x,dz=target.z-e.foot.z,dist=Math.hypot(dx,dz);if(dist<tolerance)break;
   const rel=Math.atan2(dx,dz)-e.camera.heading,step=Math.PI/4,q=Math.round(rel/step),now=Date.now();
   if(dist<best-.08){best=dist;progressAt=now;}else if(now-progressAt>700&&now>detourUntil){const off=rel-q*step;detour=(q+(off>=0?1:-1))*step;detourUntil=now+450;progressAt=now+450;}
   await hold(keysFor(now<detourUntil?detour:q*step));await page.waitForTimeout(dist<1.2?70:140);}}
  finally{await hold(new Set());await page.keyboard.up('Shift');}
  await page.waitForTimeout(350);return explore();
 };
 // Walk around the building through its corners (local ring NE, NW, SW, SE) to reach a door's front.
 const local=p=>{const dx=(p.x-plan.centre.x)/plan.scale,dz=(p.z-plan.centre.z)/plan.scale,c=Math.cos(plan.rotation),s=Math.sin(plan.rotation);return {x:dx*c-dz*s,z:dx*s+dz*c};};
 const sideOf=p=>{const l=local(p);return Math.abs(l.z)/5>Math.abs(l.x)/9?(l.z>0?0:2):(l.x<0?1:3);};// 0 north, 1 west, 2 south, 3 east of the whole footprint
 const around=async target=>{
  let e=await explore(),from=sideOf(e.foot);const to=sideOf(target);
  while(from!==to){const step=((to-from+4)%4)<=2?1:-1,corner=step>0?(from+1)%4:from;await goTo(plan.corners[corner],{tolerance:.7,ms:20000});from=(from+step+4)%4;}
  return goTo(target,{tolerance:.45,ms:20000});
 };
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const faceTowards=async target=>{const box=await page.locator('canvas').first().boundingBox(),x0=box.x+box.width*.5,y0=box.y+box.height*.42;let gain=-.006;
  for(let i=0;i<8;i++){const e=await explore(),want=Math.atan2(target.x-e.foot.x,target.z-e.foot.z),diff=wrap(want-e.camera.heading);if(Math.abs(diff)<.08)break;
   const px=Math.max(-500,Math.min(500,diff/gain));await page.mouse.move(x0,y0);await page.mouse.down({button:'right'});await page.mouse.move(x0+px,y0,{steps:12});await page.mouse.up({button:'right'});await page.waitForTimeout(450);
   const after=(await explore()).camera.heading,moved=wrap(after-e.camera.heading);if(Math.abs(px)>20&&Math.abs(moved)>.02)gain=moved/px;}};
 // The nearest door and its open fraction, as the game reads them (exploration test data).
 const doorState=async()=>(await explore()).door;
 const results={};
 for(const name of ['rhythm','storefront','tokyo','tile']){
  const door=plan.doors[name],outward=f=>(f.x-door.centre.x)*door.normal.x+(f.z-door.centre.z)*door.normal.z;
  let e=await around(door.outside);assert.ok(Math.hypot(e.foot.x-door.outside.x,e.foot.z-door.outside.z)<1,`${name}: reached the front ${JSON.stringify(e.foot)} target ${JSON.stringify(door.outside)}`);
  await faceTowards(door.centre);await page.waitForTimeout(500);await page.screenshot({path:`output/kit-doors-${name}-closed${suffix}.png`});
  e=await goTo(door.inside,{ms:2600});const blocked=outward(e.foot);assert.ok(blocked>.15,`${name}: the closed door blocks (${blocked.toFixed(2)} m outside)`);
  e=await goTo(door.front,{tolerance:.3,ms:5000});
  const before=await doorState();assert.ok(before&&door.leaves.includes(before.id)&&before.angle===0,`${name}: the nearest door is this one, closed (${JSON.stringify(before)})`);
  await page.keyboard.press('e');await page.getByText('Door opened').waitFor({timeout:3000});await page.waitForTimeout(900);
  const opened=await doorState();assert.ok(opened&&door.leaves.includes(opened.id)&&opened.angle>.95,`${name}: the leaf opened (${JSON.stringify(opened)})`);
  await faceTowards(door.centre);await page.waitForTimeout(400);await page.screenshot({path:`output/kit-doors-${name}-open${suffix}.png`});
  e=await goTo(door.inside,{tolerance:.45,ms:12000});const inside=outward(e.foot);assert.ok(inside<-1.2,`${name}: walked in through the open door (${inside.toFixed(2)} m)`);
  await faceTowards(door.centre);await page.waitForTimeout(600);await page.screenshot({path:`output/kit-doors-${name}-inside${suffix}.png`});
  e=await goTo(door.outside,{tolerance:.45,ms:12000});assert.ok(outward(e.foot)>1.2,`${name}: back out`);
  results[name]={motion:door.motion,leaves:door.leaves.length,blockedAt:+blocked.toFixed(2),inside:+inside.toFixed(2)};
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({backend,results}));
 console.log('Every door opens: kit tile, Tokyo sliding, storefront double and rhythm doors open with E and let the character through.');
}catch(error){if(page)await page.screenshot({path:`output/kit-doors-failure${suffix}.png`}).catch(()=>{});throw error;}finally{await browser.close();}
