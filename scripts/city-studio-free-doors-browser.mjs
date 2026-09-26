// Free doors and see-through glass: a v6 studio building whose street face is a generated wall with a free
// arched door and glazed windows. Checks the door portal, see-through glazing into the furnished interior,
// then walks the character to the door, opens it with E and walks inside. Screenshots go to output/.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
let page;
try{
 page=await browser.newPage({viewport:{width:1600,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://localhost:5180'}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:60000});
 await page.evaluate(async()=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts'),{upgradeStudioInterior}=await import('/src/domain/cityStudioInteriors.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='free-doors-browser';plot.revision=1;
  const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
  r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:8,startFloor:0,spanFloors:2}];
  Object.assign(r.studio,{openings:[],assemblies:[],stamps:undefined,variation:undefined,facadeRhythm:undefined});r.studio.defaults.family='warm-brick';r.studio.defaults.roof='flat';
  const at=(id,x,bottom,width,height,shape,extra={})=>({id,shapeId:'main',side:'north',u:x/12,bottom,width,height,shape,...extra});
  r.studio.freeOpenings=[at('door',6,0,1.4,2.5,'arch',{style:'timber'}),at('left',2.4,.9,1.5,1.8,'rect'),at('right',9.6,.9,1.5,1.8,'arch'),at('up-l',2.4,4.2,1.2,1.5,'rect'),at('up-m',6,4.2,1.2,1.5,'rect'),at('up-r',9.6,4.2,1.2,1.5,'rect')];
  const v6=upgradeStudioInterior(r);
  v6.interior.floorFinish='timber';v6.interior.wallColor='#e9dcc4';
  v6.interior.furniture=[{id:'sofa',floor:0,kind:'sofa',x:-3.6,z:2.3,rotation:Math.PI},{id:'table',floor:0,kind:'round-table',x:3.6,z:2.2,rotation:0},{id:'lamp',floor:0,kind:'lamp',x:-1.9,z:2.9,rotation:0},{id:'shelf',floor:0,kind:'bookcase',x:-4.8,z:-3.4,rotation:0},{id:'upper-sofa',floor:1,kind:'armchair',x:0,z:2.4,rotation:Math.PI}];
  plot.draft=studioDraft(draft,v6);localStorage.setItem(key,JSON.stringify(world));return plot.id;
 });
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:60000}).catch(()=>{});
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:60000});
 const resolved=await page.evaluate(async()=>{
  const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),{buildStudioDetailBatches}=await import('/src/domain/cityStudioDetailBatches.ts'),key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),plot=JSON.parse(localStorage.getItem(key)).plots.find(p=>p.purchaseId==='free-doors-browser');
  const out=resolveSculpt(plot.draft.sculpt,plot.draft.design).studio,batches=buildStudioDetailBatches(out).batches;
  return {inactive:out.inactive,portals:(out.portals??[]).map(p=>p.id),openable:out.freeFaces.map(f=>f.openable),glass:batches.filter(b=>b.material.kind==='glass').map(b=>b.key),shell:batches.some(b=>b.material.kind==='shell')};
 });
 console.log(JSON.stringify(resolved));
 assert.deepEqual(resolved.inactive,[]);assert.ok(resolved.portals.includes('exterior/free/door'),'the free door is a portal');
 assert.deepEqual(resolved.openable,[true]);assert.ok(resolved.glass.every(k=>k.endsWith('|see')),'free-face glass is see-through');assert.equal(resolved.shell,false,'interiors replace window shells');
 // Glass: a close front view through the windows into the furnished rooms.
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(1500);
 const box=await page.locator('canvas').first().boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height*.5;
 for(let i=0;i<9;i++){await page.mouse.move(cx,cy+110);await page.mouse.wheel(0,-240);await page.waitForTimeout(80);}
 await page.mouse.move(box.x+box.width/2,box.y+120);await page.waitForTimeout(2200);
 await page.screenshot({path:`output/city-studio-glass${suffix}.png`});
 await page.mouse.move(cx+220,cy);await page.mouse.down({button:'right'});for(let i=1;i<=10;i++){await page.mouse.move(cx+220-i*14,cy+i*2);await page.waitForTimeout(30);}await page.mouse.up({button:'right'});
 await page.mouse.move(box.x+box.width/2,box.y+120);await page.waitForTimeout(2000);
 await page.screenshot({path:`output/city-studio-glass-angle${suffix}.png`});
 // Walk-through: go to the door, check it blocks, open it with E, walk inside.
 await page.getByRole('button',{name:'Walk around'}).click();
 const explore=()=>page.locator('canvas').evaluateAll(cs=>{const c=cs.find(c=>c.dataset.cityExploration);return c?JSON.parse(c.dataset.cityExploration):null;});
 await page.waitForFunction(()=>[...document.querySelectorAll('canvas')].some(c=>c.dataset.cityExploration&&JSON.parse(c.dataset.cityExploration).mode==='on-foot'),null,{timeout:30000});
 await page.waitForTimeout(800);
 // Door in world space: the resolved portal through the plot transform (same as the published collision plot).
 const door=await page.evaluate(async()=>{const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),{landPosition}=await import('/src/domain/cityLand.ts'),key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),plot=JSON.parse(localStorage.getItem(key)).plots.find(p=>p.purchaseId==='free-doors-browser');
  const out=resolveSculpt(plot.draft.sculpt,plot.draft.design).studio,d=out.portals.find(q=>q.id==='exterior/free/door'),centre=landPosition(plot),rotation=plot.rotation*Math.PI/2,scale=plot.size/24,c=Math.cos(rotation),s=Math.sin(rotation),w=(lx,lz)=>({x:centre.x+scale*(lx*c+lz*s),z:centre.z+scale*(-lx*s+lz*c)}),nx=Math.sin(d.rotation),nz=Math.cos(d.rotation);
  return {centre:w(d.x,d.z),outside:w(d.x+nx*2.2,d.z+nz*2.2),inside:w(d.x-nx*2.4,d.z-nz*2.4),near:w(d.x-nx*.6,d.z-nz*.6),window:w(d.x+Math.cos(d.rotation)*3.6,d.z-Math.sin(d.rotation)*3.6),windowFront:w(d.x+Math.cos(d.rotation)*3.6+nx*2.6,d.z-Math.sin(d.rotation)*3.6+nz*2.6),normal:{x:nx*c+nz*s,z:-nx*s+nz*c},scale,y:d.y};});
 const outward=f=>(f.x-door.centre.x)*door.normal.x+(f.z-door.centre.z)*door.normal.z;
 const held=new Set();const hold=async want=>{for(const k of [...held])if(!want.has(k)){await page.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}};
 const goTo=async(target,{tolerance=.4,ms=14000,stopWhen}={})=>{
  await page.keyboard.down('Shift');const started=Date.now();let e=await explore();
  try{while(Date.now()-started<ms){e=await explore();const dx=target.x-e.foot.x,dz=target.z-e.foot.z,dist=Math.hypot(dx,dz);if(dist<tolerance||stopWhen?.(e))break;
   const rel=Math.atan2(dx,dz)-e.camera.heading,f=Math.cos(rel),l=Math.sin(rel),want=new Set();if(f>.38)want.add('w');if(f<-.38)want.add('s');if(l>.38)want.add('a');if(l<-.38)want.add('d');await hold(want);await page.waitForTimeout(dist<1.2?70:140);}}
  finally{await hold(new Set());await page.keyboard.up('Shift');}
  await page.waitForTimeout(400);return explore();
 };
 // Orbit the follow camera (right drag) until it looks from the character towards a point.
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const faceTowards=async target=>{const box=await page.locator('canvas').first().boundingBox(),x0=box.x+box.width*.5,y0=box.y+box.height*.42;let gain=-.006;
  for(let i=0;i<8;i++){const e=await explore(),want=Math.atan2(target.x-e.foot.x,target.z-e.foot.z),diff=wrap(want-e.camera.heading);if(Math.abs(diff)<.08)break;
   const px=Math.max(-500,Math.min(500,diff/gain));await page.mouse.move(x0,y0);await page.mouse.down({button:'right'});await page.mouse.move(x0+px,y0,{steps:12});await page.mouse.up({button:'right'});await page.waitForTimeout(450);
   const after=(await explore()).camera.heading,moved=wrap(after-e.camera.heading);if(Math.abs(px)>20&&Math.abs(moved)>.02)gain=moved/px;}};
 await faceTowards(door.centre);
 // Through the glass from the street: the furnished ground-floor room behind the right-hand window.
 await goTo(door.windowFront,{tolerance:.45,ms:25000});await faceTowards(door.window);
 {const box=await page.locator('canvas').first().boundingBox(),x0=box.x+box.width*.5,y0=box.y+box.height*.42;await page.mouse.move(x0,y0);await page.mouse.wheel(0,500);await page.mouse.down({button:'right'});await page.mouse.move(x0,y0-50,{steps:8});await page.mouse.up({button:'right'});}
 await page.waitForTimeout(1200);
 await page.screenshot({path:`output/city-studio-glass-street${suffix}.png`});
 let e=await goTo(door.outside,{tolerance:.45,ms:25000});assert.ok(Math.hypot(e.foot.x-door.outside.x,e.foot.z-door.outside.z)<.8,`reached the door front ${JSON.stringify(e.foot)} ${JSON.stringify(door)}`);
 await faceTowards(door.centre);await page.waitForTimeout(600);
 await page.screenshot({path:`output/city-studio-free-door-closed${suffix}.png`});
 e=await goTo(door.inside,{ms:2500});assert.ok(outward(e.foot)>.2,`the closed leaf blocks the doorway (${outward(e.foot).toFixed(2)} m outside)`);
 console.log(JSON.stringify({blockedAt:e.foot,outward:outward(e.foot),door}));
 await page.keyboard.press('e');
 await page.getByText('Door opened').waitFor({timeout:3000});
 await page.waitForTimeout(700);await page.screenshot({path:`output/city-studio-free-door-open${suffix}.png`});
 e=await goTo(door.inside,{tolerance:.45,ms:12000});
 assert.ok(outward(e.foot)<-1.4,`walked inside through the open door (${outward(e.foot).toFixed(2)} m)`);
 assert.ok(Math.abs(e.foot.y-(door.y+.04)*door.scale)<.12,`standing on the ground-floor slab (y ${e.foot.y.toFixed(2)})`);
 await faceTowards(door.centre);await page.waitForTimeout(700);await page.screenshot({path:`output/city-studio-free-door-inside${suffix}.png`});
 // Close it again from inside once clear of the swing.
 e=await goTo(door.near,{tolerance:.3,ms:6000});
 await page.keyboard.press('e');const closedAgain=await page.getByText(/Door closed|Step clear/).textContent({timeout:3000});
 // Without interiors (v5): no portal, the closed leaf stays baked, and window shells fill the glass.
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots.find(p=>p.purchaseId==='free-doors-browser');const {interior,...rest}=plot.draft.sculpt;void interior;plot.draft.sculpt={...rest,version:5};localStorage.setItem(key,JSON.stringify(world));});
 await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:60000});
 const v5=await page.evaluate(async()=>{const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),plot=JSON.parse(localStorage.getItem(key)).plots.find(p=>p.purchaseId==='free-doors-browser'),out=resolveSculpt(plot.draft.sculpt,plot.draft.design).studio;return {version:plot.draft.sculpt.version,portals:out.portals?.length??0,shell:!!out.freeFaces[0].shell,blocker:out.blockers.some(b=>b.id==='free-door/door')};});
 assert.deepEqual(v5,{version:5,portals:0,shell:true,blocker:true});
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(1500);
 for(let i=0;i<9;i++){await page.mouse.move(cx,cy+110);await page.mouse.wheel(0,-240);await page.waitForTimeout(80);}
 await page.mouse.move(box.x+box.width/2,box.y+120);await page.waitForTimeout(2200);await page.screenshot({path:`output/city-studio-glass-shell${suffix}.png`});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({backend,door:{outsideBlockedAt:true,opened:true,inside:outward(e.foot).toFixed(2),closedAgain}}));
 console.log('Free doors are portals: E opens the door, the character walks in; windows show the furnished interior.');
}catch(error){if(page)await page.screenshot({path:`output/city-studio-free-door-failure${suffix}.png`}).catch(()=>{});throw error;}finally{await browser.close();}
