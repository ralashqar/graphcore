// Ground contact and plot-ground walking (docs/city-ground-contact.md).
// 1. Low-angle close-ups of building bases: the edited studio building (studio view) and finished neighbours in the
//    city (NYC preset, Tokyo, storefront street, a Blender kit-tile house) plus a business building from the demo
//    city. Screenshots output/ground-<GROUND_TAG>-<name>.png (GROUND_TAG defaults to "after").
// 2. Play mode: walks the character from the pavement onto the plot, up the kerb, along the plot surface, against
//    the garden wall (blocked) and through the gate and entrance path to the door, asserting heights and positions.
// Needs the Vite dev server (DEV test hooks): CITY_TEST_ORIGIN (default http://localhost:5180). CITY_BACKEND=webgl.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
mkdirSync('output',{recursive:true});
const TAG=process.env.GROUND_TAG||'after',ORIGIN=process.env.CITY_TEST_ORIGIN||'http://localhost:5180';
const SHOTS_ONLY=process.env.GROUND_SHOTS_ONLY==='1';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const watchdog=setTimeout(()=>void browser.close(),900000);watchdog.unref();
let page;
try{
 page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|WGSL|GPUValidation|GL_INVALID/i.test(m.text()))errors.push(m.text());});
 const url=`${ORIGIN}/city?demo=1&cityStudio=1&cityStudioTest=1&cityGroundTest=1${process.env.CITY_BACKEND==='webgl'?'&cityBackend=webgl':''}`;
 await page.addInitScript(()=>{localStorage.setItem('city-scene-look-v1',JSON.stringify({look:'daylight',quality:'balanced',occlusion:'architectural'}));localStorage.setItem('city-studio-isolate-v1','0');});
 await page.goto(url);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:120000});
 // Seed: plot 0 is edited in the studio (Corner café); its nearest plots are finished studio presets.
 const seeded=await page.evaluate(async()=>{
  const {initialLandDraft,LAND_OWNER,landPosition,createLandWorld}=await import('/src/domain/cityLand.ts');
  const {studioExample,BLENDER_EXAMPLE_START,TOKYO_EXAMPLE_START,STOREFRONT_EXAMPLE_START}=await import('/src/domain/cityStudioExamples.ts');
  const {NYC_PRESETS}=await import('/src/domain/cityNycPresets.ts');
  const {upgradeStudio}=await import('/src/domain/cityStudio.ts');
  const {resolveSculpt}=await import('/src/domain/citySculpt.ts');
  const {plotAxis,estatePlotAxis}=await import('/src/domain/cityLayout.ts');
  // Camera inside the plot's garden wall, looking at the front corner of the base from low down.
  const view=(x,z)=>{let cx=Math.min(10.1,x+2.8),cz=Math.min(10.1,z+3.6);if(Math.hypot(cx-x,cz-z)<2.4){cx=x-3;cz=10.1;}return [cx,cz];};
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key));
  world.plots=createLandWorld(world.occupied,world.capacity,world.size).plots;
  const o=landPosition(world.plots[0]),near=[...world.plots].sort((a,b)=>{const p=landPosition(a),q=landPosition(b);return Math.hypot(p.x-o.x,p.z-o.z)-Math.hypot(q.x-o.x,q.z-o.z);});
  const cases=[['studio-cafe',0],['nyc',BLENDER_EXAMPLE_START],['tokyo',TOKYO_EXAMPLE_START],['storefront',STOREFRONT_EXAMPLE_START],['kit-tiles',BLENDER_EXAMPLE_START+NYC_PRESETS.length]];
  const out=[];
  for(const [i,[name,index]] of cases.entries()){
   const plot=near[i],draft=studioExample(upgradeStudio(initialLandDraft(plot),plot.size),index,plot.size);
   plot.owner=LAND_OWNER;plot.purchaseId=`ground-${name}`;plot.revision=1;plot.finished=structuredClone(draft);plot.draft=i===0?structuredClone(draft):null;
   const r=resolveSculpt(draft.sculpt,draft.design),ring=r.floors[0].polygons.flatMap(p=>p[0]);
   const xs=ring.map(v=>v[0]),zs=ring.map(v=>v[1]),c=landPosition(plot),angle=plot.rotation*Math.PI/2,scale=plot.size/24;
   const w=(x,z)=>({x:c.x+scale*(x*Math.cos(angle)+z*Math.sin(angle)),z:c.z+scale*(-x*Math.sin(angle)+z*Math.cos(angle))});
   out.push({name,id:plot.id,scale,corner:w(Math.max(...xs),Math.max(...zs)),out:w(...view(Math.max(...xs),Math.max(...zs))),entrance:r.entrance?w(r.entrance.x,r.entrance.z):null});
  }
  // A business building: the demo property nearest the plot, drawn by the V3 resolver.
  const axis=world.size===48?estatePlotAxis:plotAxis,business=[...world.occupied].filter(p=>p.profile?.buildingDesign).sort((a,b)=>Math.hypot(axis(a.x)-o.x,axis(a.z)-o.z)-Math.hypot(axis(b.x)-o.x,axis(b.z)-o.z))[0];
  if(business){const d=business.profile.buildingDesign,angle=(d.rotation??0)*Math.PI/2,scale=world.size/24,cx=axis(business.x),cz=axis(business.z),w=(x,z)=>({x:cx+scale*(x*Math.cos(angle)+z*Math.sin(angle)),z:cz+scale*(-x*Math.sin(angle)+z*Math.cos(angle))});
   out.push({name:'business',id:business.id,scale,corner:w(d.width/2,d.depth/2),out:w(d.width/2+1.8,d.depth/2+2.2),kit:!!d.synarcKit,finish:d.finish,design:{v:d.version,w:d.width,d:d.depth,tile:d.tile,enclosure:d.enclosure,grounds:d.grounds,rev:d.generatorRevision}});}
  localStorage.setItem(key,JSON.stringify(world));return out;
 });
 console.log(JSON.stringify(seeded));
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:120000});
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:120000});
 await page.waitForFunction(n=>{try{return JSON.parse(document.querySelector('canvas').dataset.citySculptCity||'{}').ready>=n;}catch{return false;}},seeded.length-2,{timeout:240000}).catch(()=>console.log('neighbours not all reported ready'));
 const pin=p=>page.evaluate(p=>{window.__cityCameraPin=p;},p);
 const shoot=async(c,label=c.name)=>{
  await pin({position:[c.out.x,.62*c.scale,c.out.z],target:[c.corner.x,.45*c.scale,c.corner.z],fov:45});
  await page.addStyleTag({content:'body *{visibility:hidden!important}canvas{visibility:visible!important}'}).then(h=>h.evaluate(e=>e.id='ground-hide'));
  await page.waitForTimeout(2600);await page.screenshot({path:`output/ground-${TAG}-${label}.png`});
  await page.evaluate(()=>document.getElementById('ground-hide')?.remove());
 };
 await shoot(seeded[0],'studio-view');
 await pin(null);
 // The city: leave the studio (Done) and photograph every base where the city draws it (bakes, near overlays).
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({state:'detached',timeout:60000});
 await page.waitForFunction(n=>{try{return JSON.parse(document.querySelector('canvas').dataset.citySculptCity||'{}').ready>=n;}catch{return false;}},seeded.length-1,{timeout:240000}).catch(()=>console.log('city plots not all reported ready'));
 // Close-up shots pin every plot to its near representation (shared kit near, near overlays).
 await page.evaluate(()=>{window.__cityGwForce={overlay:'near',kit:'near'};window.__cityStudioDetailForce='near';});
 await page.waitForTimeout(6000);
 for(const c of seeded)await shoot(c);
 await page.evaluate(()=>{window.__cityGwForce=undefined;window.__cityStudioDetailForce=undefined;});
 await pin(null);
 if(!SHOTS_ONLY){await page.getByRole('button',{name:'Visit test plot'}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:120000});await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:120000});}
 if(!SHOTS_ONLY){
  // Play mode: the published collision plot is the studio building on plot 0.
  await page.getByRole('button',{name:'Walk around'}).click();
  const explore=()=>page.locator('canvas').evaluateAll(cs=>{const c=cs.find(c=>c.dataset.cityExploration);return c?JSON.parse(c.dataset.cityExploration):null;});
  await page.waitForFunction(()=>[...document.querySelectorAll('canvas')].some(c=>c.dataset.cityExploration&&JSON.parse(c.dataset.cityExploration).mode==='on-foot'),null,{timeout:60000});
  await page.waitForTimeout(800);
  const geo=await page.evaluate(async id=>{
   const {landPosition}=await import('/src/domain/cityLand.ts'),{plotGroundProfile}=await import('/src/domain/cityPlotGroundProfile.ts'),{PLOT_GROUND}=await import('/src/domain/cityPlotGround.ts'),{resolveSculpt}=await import('/src/domain/citySculpt.ts');
   const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),plot=JSON.parse(localStorage.getItem(key)).plots.find(p=>p.id===id);
   const c=landPosition(plot),angle=plot.rotation*Math.PI/2,scale=plot.size/24,w=(x,z)=>({x:c.x+scale*(x*Math.cos(angle)+z*Math.sin(angle)),z:c.z+scale*(-x*Math.sin(angle)+z*Math.cos(angle))});
   const {landProperty}=await import('/src/domain/cityLand.ts'),{pavementHeight}=await import('/src/domain/cityDriveWorld.ts');
   const r=resolveSculpt(plot.draft.sculpt,plot.draft.design),e=r.entrance,profile=plotGroundProfile(landProperty(plot,plot.draft).profile.buildingDesign),street=w(0,12.9);
   return {pavement:pavementHeight(street.x,street.z),scale,surface:PLOT_GROUND.surface*scale,kerb:PLOT_GROUND.kerb*scale,datum:PLOT_GROUND.datum*scale,walls:profile.walls.length,
    street:w(0,12.9),kerbPoint:w(0,11.6),gate:w(0,10.7),inside:w(3.5,9.4),wallOutside:w(-8,12.4),wallInside:w(-8,10.2),path:w(e.x,e.z+2.2),door:w(e.x,e.z+.9),
    sideOutside:w(12.8,0),sideInside:w(9.8,0)};
  },seeded[0].id);
  console.log(JSON.stringify(geo));
  assert.ok(geo.walls>0,'the default plot has a garden wall');
  const held=new Set();const hold=async want=>{for(const k of [...held])if(!want.has(k)){await page.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}};
  const trace=[];
  const goTo=async(target,{tolerance=.4,ms=16000}={})=>{
   await page.keyboard.down('Shift');const started=Date.now();let e=await explore(),best=e,stuck=0;
   try{while(Date.now()-started<ms){e=await explore();trace.push(e.foot.y);const dx=target.x-e.foot.x,dz=target.z-e.foot.z,dist=Math.hypot(dx,dz);if(dist<tolerance)break;
    const rel=Math.atan2(dx,dz)-e.camera.heading,f=Math.cos(rel),l=Math.sin(rel),want=new Set();if(f>.38)want.add('w');if(f<-.38)want.add('s');if(l>.38)want.add('a');if(l<-.38)want.add('d');await hold(want);await page.waitForTimeout(dist<1.2?70:140);
    if(Math.hypot(e.foot.x-best.foot.x,e.foot.z-best.foot.z)<.02){if(++stuck>25)break;}else{stuck=0;best=e;}}}
   finally{await hold(new Set());await page.keyboard.up('Shift');}
   await page.waitForTimeout(450);return explore();
  };
  const place=async p=>{await page.evaluate(async p=>{window.__cityFootTeleport=p;},p);await page.waitForTimeout(700);return explore();};
  const near=(a,b,t)=>Math.hypot(a.x-b.x,a.z-b.z)<t;
  // Pavement: the street level.
  let e=await place(geo.street);assert.ok(near(e.foot,geo.street,.3),`placed on the pavement ${JSON.stringify(e.foot)}`);
  assert.ok(Math.abs(e.foot.y-geo.pavement)<.01,`pavement height (${e.foot.y.toFixed(3)} vs ${geo.pavement})`);
  // Up the kerb, through the gate onto the entrance path, then onto the plot surface.
  trace.length=0;e=await goTo(geo.gate,{tolerance:.3});
  assert.ok(trace.some(y=>Math.abs(y-geo.kerb)<.01),`stood on the kerb on the way (${trace.map(y=>y.toFixed(2)).join(' ')})`);
  for(let i=1;i<trace.length;i++)assert.ok(trace[i]>=trace[i-1]-.01,`stepped up, never down (${trace.map(y=>y.toFixed(2)).join(' ')})`);assert.ok(near(e.foot,geo.gate,.5),`through the gate ${JSON.stringify(e.foot)}`);
  assert.ok(e.foot.y>geo.surface+.05&&e.foot.y<geo.surface+.35,`on the raised entrance path (${e.foot.y.toFixed(3)})`);
  e=await goTo(geo.inside,{tolerance:.35});assert.ok(near(e.foot,geo.inside,.6),`walked onto the plot ${JSON.stringify(e.foot)}`);
  assert.ok(Math.abs(e.foot.y-geo.surface)<.03,`standing on the plot surface (${e.foot.y.toFixed(3)} vs ${geo.surface.toFixed(3)})`);
  await pin(null);await page.screenshot({path:`output/ground-${TAG}-walk-on-plot.png`});
  // The garden wall blocks: from the pavement outside, walking in stops at the wall.
  e=await place(geo.wallOutside);e=await goTo(geo.wallInside,{ms:4000});
  assert.ok(!near(e.foot,geo.wallInside,1.2),`the garden wall blocks (${JSON.stringify(e.foot)})`);
  await page.screenshot({path:`output/ground-${TAG}-wall-blocks.png`});
  // The side wall blocks too.
  e=await place(geo.sideOutside);e=await goTo(geo.sideInside,{ms:4000});
  assert.ok(!near(e.foot,geo.sideInside,1.2),`the side wall blocks (${JSON.stringify(e.foot)})`);
  // Gate and entrance path stay walkable to the door step.
  e=await place(geo.street);e=await goTo(geo.gate,{tolerance:.3});assert.ok(near(e.foot,geo.gate,.5),`through the gate ${JSON.stringify(e.foot)}`);
  e=await goTo(geo.path,{tolerance:.35});assert.ok(near(e.foot,geo.path,.6),`along the entrance path ${JSON.stringify(e.foot)}`);
  assert.ok(e.foot.y>=geo.surface-.02&&e.foot.y<=geo.surface+.35,`on the path (${e.foot.y.toFixed(3)})`);
  e=await goTo(geo.door,{tolerance:.3,ms:8000});
  assert.ok(e.foot.y>geo.surface+.05,`up the entrance step towards the door (${e.foot.y.toFixed(3)})`);
  await page.screenshot({path:`output/ground-${TAG}-entrance.png`});
  console.log(JSON.stringify({walk:'ok',door:e.foot}));
 }
 assert.deepEqual(errors,[]);
 console.log('Ground contact: bases reach the plot ground; the plot surface, kerb and garden wall shape walking.');
}catch(error){if(page)await page.screenshot({path:`output/ground-${TAG}-failure.png`}).catch(()=>{});throw error;}finally{await browser.close();}
