// Outline sculpting v2 (docs/city-studio-sculpt-v2.md): draw a box, add corners, drag a corner, push/pull a wall,
// see a refusal, delete a corner, keep content on untouched walls, re-fit content on changed walls, undo.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {rail,studioState,studioUrl,telemetryIs,inspector} from './city-studio-ui.mjs';

mkdirSync('output',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:950}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const saved=()=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner)?.draft?.sculpt;});
 const until=(check,arg,timeout=30000)=>page.waitForFunction(([source,a])=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));const sculpt=JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner)?.draft?.sculpt;return !!sculpt&&new Function('s','a',`return (${source})(s,a)`)(sculpt,a);},[check.toString(),arg],{timeout});
 const enter=async()=>{await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});};
 const idle=()=>page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('canvas')?.dataset.cityStudio||'{}');return !s.busy;},null,{timeout:30000});

 // 1. An empty owned plot; draw a box with Build › Box.
 await page.goto(studioUrl());
 await page.waitForFunction(()=>Object.keys(localStorage).some(key=>key.startsWith('city-land-v1-')),null,{timeout:60000});
 await page.evaluate(async()=>{const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),key=Object.keys(localStorage).find(key=>key.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];plot.owner=LAND_OWNER;plot.purchaseId='sculpt-browser';plot.revision=1;const draft=studioExample(initialLandDraft(plot),0,plot.size);draft.sculpt.volumes=[{id:'seed',kind:'rectangle',operation:'add',x:-7,z:-7,width:3,depth:3,startFloor:0,spanFloors:1}];draft.sculpt.studio.assemblies=[];draft.sculpt.studio.openings=[];draft.sculpt.studio.surfaces=[];delete draft.sculpt.studio.stamps;draft.sculpt.studio.freeOpenings=[];draft.sculpt.studio.defaults.roof='flat';for(const k of Object.keys(draft.sculpt.studio.parts))delete draft.sculpt.studio.parts[k];plot.draft=draft;localStorage.setItem(key,JSON.stringify(world));});
 await page.reload();await enter();
 await rail(page,'Build');await page.getByRole('button',{name:'Box',exact:true}).click();await telemetryIs(page,'tool','block');
 {const g=(await studioState(page)).ground,a=g.frontRight,b=g.back;await page.mouse.move(a.x+(b.x-a.x)*.2,a.y+(b.y-a.y)*.2);await page.mouse.down();for(let i=1;i<=8;i++){await page.mouse.move(a.x+(b.x-a.x)*(.2+i/8*.35),a.y+(b.y-a.y)*(.2+i/8*.35));await page.waitForTimeout(30);}await page.mouse.up();}
 await until(s=>s.volumes.length===2).catch(async e=>{await page.screenshot({path:'output/sculpt-debug.png'});console.error(await page.evaluate(()=>document.querySelector('.studio-feedback,.studio-status')?.textContent),JSON.stringify((await studioState(page)).ground));throw e;});
 await page.screenshot({path:'output/sculpt-box.png'});
 // Normalise the drawn box to 8 × 8 m (two storeys) and give it a window on an untouched wall and one on the wall we will edit.
 const drawn=(await saved()).volumes.find(v=>v.id!=='seed');assert.equal(drawn.kind,'rectangle');
 await page.evaluate(id=>{const key=Object.keys(localStorage).find(key=>key.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots.find(p=>p.owner),s=plot.draft.sculpt;s.volumes=s.volumes.filter(v=>v.id===id).map(v=>({...v,x:0,z:0,width:8,depth:8,startFloor:0,spanFloors:2}));
  plot.draft.design.floors=2;plot.draft.design.middleFloors=1;
  s.studio.freeOpenings=[{id:'keep',shapeId:id,side:'north',u:.5,bottom:3.6,width:1.2,height:1.5,shape:'rect'},{id:'refit',shapeId:id,side:'south',u:.8,bottom:3.6,width:1.2,height:1.5,shape:'rect'}];localStorage.setItem(key,JSON.stringify(world));},drawn.id);
 await page.reload();await enter();
 const base=await saved(),keep=base.studio.freeOpenings.find(o=>o.id==='keep');

 // 2. Edit outline from the Part inspector (top view).
 await page.getByRole('group',{name:'My parts'}).getByRole('button',{name:/Part 1 Storeys/}).click();
 await inspector(page).getByRole('button',{name:'Sculpt outline'}).click();await page.getByRole('button',{name:'Top view'}).click();

 await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('canvas')?.dataset.cityStudio||'{}');return s.tool==='outline'&&s.handles?.['corner-3']&&s.handles?.['edge-0'];},null,{timeout:30000});
 await page.waitForTimeout(900);await idle();
 // Zoom in on the building for readable grips and screenshots.
 {const c=await page.locator('canvas').boundingBox();await page.mouse.move(c.x+c.width/2,c.y+c.height/2);for(let i=0;i<5;i++){await page.mouse.wheel(0,-200);await page.waitForTimeout(120);}await page.waitForTimeout(500);}
 const handles=async()=>(await studioState(page)).handles;
 let h=await handles();
 // Screen mapping in top view: corners 0 (-4,-4), 1 (4,-4), 3 (-4,4) of the 8 m box.
 const o0=h['corner-0'],ex={x:(h['corner-1'].x-o0.x)/8,y:(h['corner-1'].y-o0.y)/8},ez={x:(h['corner-3'].x-o0.x)/8,y:(h['corner-3'].y-o0.y)/8},screen=(x,z)=>({x:o0.x+ex.x*(x+4)+ez.x*(z+4),y:o0.y+ex.y*(x+4)+ez.y*(z+4)});

 // 3. Click the south wall grip: a new corner at its middle; the south window moves to the new half.
 await page.mouse.click(h['edge-0'].x,h['edge-0'].y);
 await until(s=>s.volumes[0].kind==='polygon'&&s.volumes[0].vertices.length===5);
 let s1=await saved();assert.deepEqual(s1.volumes[0].edgeIds.slice(0,1),['south']);assert.deepEqual(s1.studio.freeOpenings.find(o=>o.id==='keep'),keep);
 const moved=s1.studio.freeOpenings.find(o=>o.id==='refit');assert.equal(moved.side,s1.volumes[0].edgeIds[1]);
 // Click on the wall line (not the grip) to add a second corner at 2 m.
 await page.waitForTimeout(500);await idle();
 {const p=screen(2,-4);await page.mouse.click(p.x,p.y);}
 await until(s=>s.volumes[0].vertices.length===6);
 s1=await saved();const refit1=s1.studio.freeOpenings.find(o=>o.id==='refit');assert.ok(refit1,'the straddling window is nudged onto one half');
 await page.screenshot({path:'output/sculpt-insert.png'});

 // 4. Drag corner 1 (0,-4) out to (0,-5.5): lengths and angle labels show during the drag.
 await page.waitForTimeout(500);await idle();h=await handles();
 {const a=h['corner-1'],b=screen(0,-5.5);await page.mouse.move(a.x,a.y);await page.mouse.down();for(let i=1;i<=10;i++){await page.mouse.move(a.x+(b.x-a.x)*i/10,a.y+(b.y-a.y)*i/10);await page.waitForTimeout(25);}
  await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.cityStudio||'{}').outline?.ghost?.labels?.some(l=>/°$/.test(l)),null,{timeout:10000});
  await page.screenshot({path:'output/sculpt-vertex-drag.png'});await page.mouse.up();}
 await until(s=>s.volumes[0].vertices.some(p=>Math.abs(p[1]+s.volumes[0].z+5.5)<.01));
 s1=await saved();assert.deepEqual(s1.studio.freeOpenings.find(o=>o.id==='keep'),keep);

 // 5. A crossing drag is refused in red with a reason and nothing is saved.
 await page.waitForTimeout(500);await idle();h=await handles();
 {const before=JSON.stringify((await saved()).volumes);const a=h['corner-4'],b=screen(0,-7);await page.mouse.move(a.x,a.y);await page.mouse.down();for(let i=1;i<=10;i++){await page.mouse.move(a.x+(b.x-a.x)*i/10,a.y+(b.y-a.y)*i/10);await page.waitForTimeout(25);}
  await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.cityStudio||'{}').outline?.ghost?.valid===false,null,{timeout:10000});
  const refused=(await studioState(page)).outline.ghost.reason;assert.ok(['Walls cannot cross each other.','Keep the outline simple, with clear wall lengths.','A wall cannot fold back on itself.','Keep each wall at least 0.5 m long.'].includes(refused),refused);
  await page.screenshot({path:'output/sculpt-refused.png'});await page.mouse.up();await page.waitForTimeout(800);assert.equal(JSON.stringify((await saved()).volumes),before);}

 // 6. Push the 2 m wall section (edge 2: (2,-4)→(4,-4)) out by 1.5 m: a return wall appears, the east wall stretches,
 //    and the window on the pushed wall keeps its place on it.
 await page.waitForTimeout(300);await idle();h=await handles();
 const pushedId=(await saved()).volumes[0].edgeIds[2];
 {const a=h['edge-2'],b=screen(3,-5.5);await page.mouse.move(a.x,a.y);await page.mouse.down();for(let i=1;i<=10;i++){await page.mouse.move(a.x+(b.x-a.x)*i/10,a.y+(b.y-a.y)*i/10);await page.waitForTimeout(25);}
  await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.cityStudio||'{}').outline?.ghost?.labels?.some(l=>/^Push/.test(l)),null,{timeout:10000});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.citySculptPreview||'{}').state==='ready',null,{timeout:15000});
  await page.screenshot({path:'output/sculpt-extrude.png'});await page.mouse.up();}
 await until(s=>s.volumes[0].vertices.length===7);
 const pushed=await saved(),v=pushed.volumes[0],edgeIndex=v.edgeIds.indexOf(pushedId),a=v.vertices[edgeIndex],b=v.vertices[(edgeIndex+1)%v.vertices.length];
 assert.ok(Math.abs(a[1]+v.z+5.5)<.01&&Math.abs(b[1]+v.z+5.5)<.01,'the pushed wall moved out 1.5 m');
 assert.deepEqual(pushed.studio.freeOpenings.find(o=>o.id==='keep'),keep,'the window on the untouched north wall is unchanged');
 const onPushed=pushed.studio.freeOpenings.find(o=>o.id==='refit'),label=await page.locator('.studio-toast, [role=status]').allTextContents();
 assert.ok(onPushed&&onPushed.side===pushedId||label.some(t=>/removed/.test(t)),'the window on the pushed wall is re-fitted or reported');
 // Look at the pushed (south) side from an orbit view: the new return wall has generated walls and the window.
 await page.getByRole('button',{name:'Orbit view'}).click();await page.waitForTimeout(900);
 {const c=await page.locator('canvas').boundingBox(),cx=c.x+c.width/2,cy=c.y+c.height/2;await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});for(let i=1;i<=12;i++){await page.mouse.move(cx-i*42,cy-i*4);await page.waitForTimeout(20);}await page.mouse.up({button:'right'});}
 await page.waitForTimeout(1200);await idle();await page.screenshot({path:'output/sculpt-after.png'});
 await page.getByRole('button',{name:'Top view'}).click();await page.waitForTimeout(900);

 // 7. Select a corner and delete it with the Delete key; the inspector lists the walls.
 await idle();h=await handles();
 await page.mouse.click(h['corner-5'].x,h['corner-5'].y);await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.cityStudio||'{}').outline?.selected?.includes(5),null,{timeout:10000});
 await page.keyboard.press('Delete');await until(s=>s.volumes[0].vertices.length===6);
 const outlineSection=inspector(page).getByRole('list',{name:'Outline walls'});await outlineSection.waitFor({timeout:10000});
 assert.equal(await outlineSection.getByRole('listitem').count(),6);
 await inspector(page).screenshot({path:'output/sculpt-inspector.png'});
 // Numeric wall length: the first wall becomes 5 m.
 {const input=inspector(page).getByRole('spinbutton',{name:'Wall 1 length'});await input.fill('5');await input.press('Enter');}
 await until(s=>{const p=s.volumes[0].vertices,q=p[1];return Math.abs(Math.hypot(q[0]-p[0][0],q[1]-p[0][1])-5)<.01;});

 // 8. Undo back to the drawn box: every step is one labelled undo, and content comes back exactly.
 for(let i=0;i<6;i++){await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForTimeout(250);}
 await until(s=>s.volumes[0].kind==='rectangle').catch(async e=>{console.error(JSON.stringify((await saved()).volumes[0]));await page.screenshot({path:'output/sculpt-debug.png'});throw e;});
 const restored=await saved();assert.deepEqual(restored.studio.freeOpenings,base.studio.freeOpenings);assert.deepEqual(restored.volumes,base.volumes);
 await page.waitForTimeout(600);await page.screenshot({path:'output/sculpt-undo.png'});
 assert.deepEqual(errors,[]);
 console.log('Box drawn; corners added, dragged, refused and deleted; wall pushed with content kept or re-fitted; numeric length; undo restores.');
}finally{await browser.close();}
