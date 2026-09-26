// Paint rules on generated walls: a two-part building (box + round tower) with a facade rhythm gets a
// building-wide brick plinth, a ground-floor finish on the tower only (picked in 3D), string courses, a
// building-wide band from Shift+Band and a hand stroke on top; the stroke is undone and redone, a rule is
// reordered and edited, and everything survives a reload. Needs a running dev server (CITY_TEST_ORIGIN,
// default http://localhost:5180). CITY_BACKEND=webgl runs the WebGL2 fallback.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1300}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(process.env.DEBUG){page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('console',m.type(),m.text().slice(0,300));});page.on('framenavigated',f=>{if(f===page.mainFrame())console.log('navigated',new Date().toISOString());});}
 // Other work may edit sources while this runs: keep the Vite HMR socket inert so edits never reload the page mid-test.
 await page.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=function(url,protocols){if(String(protocols).includes('vite-hmr')){const stub=new EventTarget();Object.assign(stub,{readyState:0,send(){},close(){},url:String(url)});return stub;}return new Native(url,protocols);};Object.assign(window.WebSocket,{CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3,prototype:Native.prototype});});
 await page.goto(`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 await page.evaluate(async()=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts'),{newFacadeRhythm}=await import('/src/domain/cityStudioFacadeRhythm.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='paint-rules-browser';plot.revision=(plot.revision??0)+1;
  const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
  r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:-3.5,z:0,width:12,depth:9,startFloor:0,spanFloors:3},{id:'tower',kind:'ellipse',operation:'add',x:6,z:0,width:7,depth:7,startFloor:0,spanFloors:3}];
  Object.assign(r.studio,{openings:[],assemblies:[],surfaces:[],stamps:undefined,variation:undefined,freeOpenings:undefined,freeTrims:undefined,roofOpenings:undefined,roofDetails:undefined,paintRegions:undefined,paintRules:undefined,parts:{},facadeRhythm:newFacadeRhythm('townhouse',3)});
  r.studio.defaults.family='pastel-stucco';r.studio.defaults.roof='terrace';
  plot.draft=studioDraft(draft,r);localStorage.setItem(key,JSON.stringify(world));
 });
 const open=async()=>{await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:90000});await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready'&&!document.querySelector('.studio-preparing'),null,{timeout:90000});};
 const sculpt=()=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt;});
 const rules=async()=>(await sculpt()).studio.paintRules??[],regions=async()=>(await sculpt()).studio.paintRegions??[];
 const until=async(fn,label)=>{const t=Date.now();while(Date.now()-t<20000){if(await fn())return;await page.waitForTimeout(150);}await page.screenshot({path:`output/city-studio-paint-rules-failure${suffix}.png`});throw Error(`Timed out: ${label}\n${JSON.stringify((await sculpt()).studio.paintRules)}`);};
 const settle=async()=>{await page.waitForFunction(()=>!document.querySelector('.studio-preparing')&&!JSON.parse(document.querySelector('canvas').dataset.cityStudio||'{}').busy,null,{timeout:30000}).catch(()=>{});await page.waitForTimeout(900);};
 const state=()=>page.locator('canvas').evaluateAll(cs=>JSON.parse(cs.find(c=>c.dataset.cityStudio)?.dataset.cityStudio||'{}'));
 const swatch=async i=>{const b=page.locator('.studio-swatches button').nth(i);await b.click();await page.waitForFunction(i=>document.querySelectorAll('.studio-swatches button')[i]?.getAttribute('aria-pressed')==='true',i,{timeout:5000});return (await b.getAttribute('aria-label')).replace('Paint ','');};
 const resolved=()=>page.evaluate(async()=>{const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),d=JSON.parse(localStorage.getItem(k)).plots[0].draft,t=performance.now(),s=resolveSculpt(d.sculpt,d.design).studio,ms=performance.now()-t;return {ms,faces:(s.freeFaces??[]).map(f=>({id:f.id,part:f.shapeId,side:f.side,paint:(f.geometry.wallPaint??[]).map(p=>`${p.finish.color??''}|${p.finish.texture??''}`)})),inactive:s.inactive};});
 const key=f=>`${f.color??''}|${f.texture??''}`;
 await open();
 const base=await resolved();assert.ok(base.faces.some(f=>f.side==='curve')&&base.faces.filter(f=>f.part==='main').length>=2,`generated walls on both parts (${base.faces.map(f=>f.id)})`);
 await page.getByRole('button',{name:'Paint',exact:true}).click();
 // Front view, then pan the building up so its ground floor clears the paint dock.
 const frontView=async()=>{await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(1600);await page.mouse.move(800,420);await page.mouse.wheel(0,240);await page.waitForTimeout(300);await page.mouse.move(800,420);await page.mouse.down({button:'middle'});for(let i=1;i<=10;i++){await page.mouse.move(800,420-26*i);await page.waitForTimeout(25);}await page.mouse.up({button:'middle'});await page.waitForTimeout(900);};
 await frontView();
 const panel=page.getByRole('group',{name:'Paint rules'});
 await page.getByRole('button',{name:/^Paint rules/}).click();await panel.waitFor({timeout:5000});
 // 1) Plinth for the whole building, in brick.
 await page.getByRole('button',{name:'Brick',exact:true}).click();const brickColor=await swatch(6);
 await panel.getByRole('button',{name:'Add Plinth rule'}).click();
 await until(async()=>(await rules()).length===1,'plinth rule');
 const plinth=(await rules())[0];assert.deepEqual([plinth.kind,plinth.band,plinth.scope,plinth.finish.texture],['band',{at:'base',offset:0,height:.9},undefined,'brick']);
 // 2) Ground floor finish on the tower only: pick the part in 3D.
 await page.getByRole('button',{name:'Smooth',exact:true}).click();const groundColor=await swatch(3);
 await panel.getByRole('radio',{name:'These parts'}).click();
 await until(async()=>(await state()).tool==='surface','surface tool');
 const dockTop=async()=>(await page.locator('.studio-dock').boundingBox()).y-16;
 const hoverBay=async(filter)=>{const top=await dockTop();for(const b of (await state()).bays.filter(b=>filter(b)&&b.x>80&&b.x<1520&&b.y>90&&b.y<top)){await page.mouse.move(b.x,b.y);await page.waitForTimeout(160);if((await state()).hover===b.id)return b;}return null;};
 const towerBay=await hoverBay(b=>b.part==='tower'&&b.floor===1);assert.ok(towerBay,'a tower wall on screen');
 await page.screenshot({path:`output/city-studio-paint-rules-pick${suffix}.png`});
 await page.mouse.click(towerBay.x,towerBay.y);
 await panel.locator('.rhythm-targets span').first().waitFor({timeout:5000});
 assert.equal((await regions()).length,0,'picking never paints');
 await panel.getByRole('button',{name:'Add Ground floor rule'}).click();
 await until(async()=>(await rules()).length===2,'tower ground rule');
 assert.deepEqual((await rules())[1].scope,{parts:['tower']});
 // 3) String courses for the whole building.
 await panel.getByRole('radio',{name:'Whole building'}).click();const courseColor=await swatch(0);
 await panel.getByRole('button',{name:'Add String courses rule'}).click();
 await until(async()=>(await rules()).length===3,'string courses');
 await settle();
 let r=await resolved();assert.deepEqual(r.inactive.filter(i=>!i.id.startsWith('generated/')),[]);
 for(const f of r.faces){assert.ok(f.paint.includes(key(plinth.finish)),`plinth on ${f.id}`);assert.ok(f.paint.includes(key({color:courseColor})),`courses on ${f.id}`);assert.equal(f.paint.includes(key({color:groundColor})),f.part==='tower',`ground floor only on the tower (${f.id})`);}
 // 4) Shift+Band on the front: becomes a building-wide band rule anchored to its floor.
 const s=await state(),north=s.bays.filter(b=>b.part==='main'&&b.side==='north'),row=f=>north.filter(b=>b.floor===f).sort((a,b)=>a.x-b.x),g=row(0),u=row(1);
 assert.ok(g.length>=2&&u.length>=2,'front bays on screen');
 const design=await page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots[0].draft.design;});
 const gh=design.groundHeight,uh=design.upperHeight??3,yAt=h=>g[0].y+(h-gh/2)*(u[0].y-g[0].y)/((gh+uh/2)-gh/2);
 const bandColor=await swatch(4);
 if(process.env.DEBUG)await page.screenshot({path:`output/city-studio-paint-rules-debug-preband${suffix}.png`});
 await page.getByRole('button',{name:'Band',exact:true}).click();
 const bx=(g[0].x+g[1].x)/2;await page.mouse.move(bx,yAt(gh+1.1));await page.waitForTimeout(200);
 await page.keyboard.down('Shift');await page.mouse.down();for(let i=1;i<=8;i++){await page.mouse.move(bx+i,yAt(gh+1.1+.45*i/8));await page.waitForTimeout(25);}await page.mouse.up();await page.keyboard.up('Shift');
 await until(async()=>(await rules()).length===4,'around band rule');
 if(process.env.DEBUG)await page.screenshot({path:`output/city-studio-paint-rules-debug-band${suffix}.png`});
 const around=(await rules())[3];assert.equal(around.kind,'band');assert.equal(around.band.at,'floor');assert.equal(around.band.floor,1);assert.ok(around.band.height>.25&&around.band.height<.7&&Math.abs(around.band.offset-1.1)<.3,JSON.stringify(around.band));
 assert.equal(around.finish.color,bandColor);assert.equal((await regions()).length,0,'Shift+Band makes no per-wall region');
 // 5) A hand stroke on top of the rules (medium brush across the ground floor).
 await page.getByRole('button',{name:'Band',exact:true}).click();
 await page.getByRole('group',{name:'Brush size'}).getByRole('button',{name:'Medium'}).click();const strokeColor=await swatch(7);
 const sy=yAt(gh+1.3),sx0=(g[0].x+g[1].x)/2,sx1=(g.at(-2).x+g.at(-1).x)/2;await page.mouse.move(sx0,sy);await page.mouse.down();await page.mouse.move(sx1,sy,{steps:14});await page.mouse.up();
 await until(async()=>(await regions()).length===1,'hand stroke');
 await settle();
 r=await resolved();const front=r.faces.find(f=>f.id==='main/north');
 assert.ok(front.paint.includes(key({color:strokeColor}))&&front.paint.includes(key({color:bandColor})),`stroke and band on the front (${front.paint})`);
 const hit=await page.evaluate(async()=>{const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),{studioFacePaint}=await import('/src/domain/cityStudioFreeFaces.ts'),{paintRuleFace}=await import('/src/domain/cityStudioPaintRules.ts'),{paintPartition,paintSlotAt}=await import('/src/domain/cityStudioPaintGeometry.ts'),{studioFaceFrame}=await import('/src/domain/cityStudioFreeOpenings.ts');
  const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),d=JSON.parse(localStorage.getItem(k)).plots[0].draft,f=studioFaceFrame(d.sculpt,d.design,'main','north'),g=d.sculpt.studio.paintRegions[0],x=(g.rects[0][0]+g.rects[0][1])/2,y=(g.rects[0][2]+g.rects[0][3])/2;
  const paint=studioFacePaint(d.sculpt,'main','north',f,[],{},paintRuleFace(d.sculpt,d.design,'main','north',f)),p=paintPartition(f.length,f.height,paint.wall,undefined);void resolveSculpt;return p.slots[paintSlotAt(p,x,y)].finish;});
 assert.equal(hit.color,strokeColor,'the hand stroke paints over the building band rule');
 // 6) Undo removes the stroke only; redo brings it back.
 await page.getByRole('button',{name:'Undo'}).click();await until(async()=>(await regions()).length===0&&(await rules()).length===4,'undo stroke');
 await page.getByRole('button',{name:'Redo'}).click();await until(async()=>(await regions()).length===1,'redo stroke');
 // Known studio issue (also in city-studio-paint-regions screenshots before this change): after a brush commit the
 // canvas can keep showing an eye-level interior view for a while; shots are taken after undo/redo and a view reset.
 const nudge=async()=>{await page.mouse.move(800,300);await page.mouse.wheel(0,-60);await page.waitForTimeout(250);await page.mouse.wheel(0,60);await page.mouse.move(20,300);await page.waitForTimeout(900);};
 await page.getByRole('button',{name:'Orbit view',exact:true}).click();await settle();await frontView();await page.mouse.move(20,300);await settle();
 if(process.env.DEBUG)await page.screenshot({path:`output/city-studio-paint-rules-debug-after-redo${suffix}.png`});
 // 7) Reorder and edit: move the band up (one step), change the plinth height (one step), then undo the edit.
 await panel.getByRole('button',{name:/^Move Band on floor 2 .* up$/}).click();await until(async()=>(await rules())[2].id===around.id,'band moved up');
 const plinthRow=panel.locator('.paint-rule-pick').first();await plinthRow.click();
 const height=panel.getByRole('spinbutton',{name:'Band height'});await height.fill('1.2');
 await until(async()=>(await rules())[0].band.height===1.2,'plinth height 1.2');
 await settle();await nudge();await page.locator('.studio-dock').screenshot({path:`output/city-studio-paint-rules-edit${suffix}.png`});
 await page.getByRole('button',{name:'Undo'}).click();await until(async()=>(await rules())[0].band.height===.9,'undo height');
 await plinthRow.click();
 // Drag-to-reorder: drop the tower ground rule on the first row.
 const tower=panel.locator('.paint-rule-list li').nth(1);await tower.dragTo(panel.locator('.paint-rule-list li').nth(0));
 await until(async()=>(await rules())[0].scope?.parts?.[0]==='tower','drag reorder');const dragged=true;
 await settle();
 await page.locator('.studio-dock').screenshot({path:`output/city-studio-paint-rules-panel${suffix}.png`});
 await page.getByRole('button',{name:'Orbit view',exact:true}).click();await settle();await page.mouse.move(20,300);await page.waitForTimeout(800);
 await page.screenshot({path:`output/city-studio-paint-rules-orbit${suffix}.png`});
 // 8) Reload: rules and regions persist and render.
 const saved=await sculpt();await open();const after=await sculpt();
 assert.deepEqual(after.studio.paintRules,saved.studio.paintRules,'rules survive save and reload');assert.deepEqual(after.studio.paintRegions,saved.studio.paintRegions);
 await frontView();await page.mouse.move(20,300);await page.waitForTimeout(800);
 await page.screenshot({path:`output/city-studio-paint-rules-reload${suffix}.png`});
 await page.getByRole('button',{name:'Paint',exact:true}).click();await page.getByRole('button',{name:/^Paint rules/}).click();await panel.waitFor({timeout:5000});
 await frontView();await page.mouse.move(20,300);await settle();
 await page.screenshot({path:`output/city-studio-paint-rules${suffix}.png`});
 // The selected part rule highlights its scope (the tower) and shows its editor.
 await panel.locator('.paint-rule-pick').nth(0).click();await page.waitForTimeout(600);await page.screenshot({path:`output/city-studio-paint-rules-scope${suffix}.png`});
 r=await resolved();
 assert.deepEqual(errors.filter(e=>!/favicon|ResizeObserver/.test(e)),[]);
 console.log(JSON.stringify({backend,rules:after.studio.paintRules.map(x=>({kind:x.kind,scope:x.scope,band:x.band,floors:x.floors,finish:x.finish})),dragReorder:dragged,resolveMs:Math.round(r.ms),baseResolveMs:Math.round(base.ms),faces:r.faces.map(f=>`${f.id}:${f.paint.length}`)}));
 console.log(`Paint rules (${backend}): plinth, tower ground floor (3D pick), string courses, Shift+Band around the building, hand stroke on top, undo/redo, reorder, edit and reload passed.`);
}finally{await browser.close();}
