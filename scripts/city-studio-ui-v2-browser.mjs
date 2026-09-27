// Studio UI v2 (docs/city-studio-ui-v2.md): tool rail + hotkeys, Select granularity with hover and breadcrumb,
// inspector actions on a part and a wall, the brush (colour, opening, erase), bulk erase, the blocks palette and
// the phone layout. Screenshots land in output/ui-v2-*.png.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {brush,brushSize,inspector,openings,rail,savedSculpt,selectLevel,studioState,studioUrl,visibleBays} from './city-studio-ui.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1600,height:950}});
try{
const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(studioUrl());
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:60000});
 await page.evaluate(async()=>{const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{upgradeStudioInterior}=await import('/src/domain/cityStudioInteriors.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts'),key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];plot.owner=LAND_OWNER;plot.purchaseId='ui-v2-browser';plot.revision=1;const draft=studioExample(initialLandDraft(plot),0,plot.size);draft.sculpt.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:12,startFloor:0,spanFloors:3}];draft.sculpt.studio.openings=[];draft.sculpt.studio.assemblies=[];draft.sculpt=upgradeStudioInterior(draft.sculpt);plot.draft=studioDraft(draft,draft.sculpt);localStorage.setItem(key,JSON.stringify(world));localStorage.removeItem('city-studio-hotbar-v1');});
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 const state=()=>studioState(page),sculpt=()=>savedSculpt(page),until=(fn,arg,timeout=15000)=>page.waitForFunction(fn,arg,{timeout});
 const is=(key,value)=>until(([k,v])=>JSON.stringify(JSON.parse(document.querySelector('canvas').dataset.cityStudio||'{}')[k])===JSON.stringify(v),[key,value],10000);
 const idle=()=>until(()=>{const d=JSON.parse(document.querySelector('canvas').dataset.cityStudio||'{}');return !d.busy&&!document.querySelector('.studio-preparing');},null,30000);
 const count=async fn=>fn(await sculpt());
 const tools=page.getByRole('navigation',{name:'Building tools'});
 for(const name of ['Select','Build','Paint','Erase','Roof','Garden','Rooms','Furnish'])await tools.getByRole('button',{name,exact:true}).waitFor();
 await inspector(page).waitFor();
 // Hotkeys switch rail tools; each palette gets a desktop screenshot.
 await page.locator('canvas').click({position:{x:800,y:40},button:'middle'}).catch(()=>{});
 for(const [key,id] of [['b','build'],['p','paint'],['e','erase'],['e','paint'],['r','roof'],['g','garden'],['i','rooms'],['f','furnish'],['v','select']]){
  await page.keyboard.press(key);await is('rail',id);assert.equal(await tools.getByRole('button',{name:{build:'Build',paint:'Paint',erase:'Erase',roof:'Roof',garden:'Garden',rooms:'Rooms',furnish:'Furnish',select:'Select'}[id],exact:true}).getAttribute('aria-pressed'),'true');
  if(key!=='e'||id==='erase'){await page.waitForTimeout(250);await page.screenshot({path:`output/ui-v2-${id}.png`});}
 }
 await page.keyboard.press('?');await page.getByRole('dialog',{name:'Keyboard shortcuts'}).waitFor();await page.screenshot({path:'output/ui-v2-shortcuts.png'});await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'Keyboard shortcuts'}).waitFor({state:'detached'});
 await page.getByRole('button',{name:'Front view',exact:true}).click();await page.waitForTimeout(400);await idle();
 const front=async()=>(await visibleBays(page,b=>b.part==='main'&&b.side==='north')).sort((a,b)=>a.floor-b.floor||a.x-b.x);
 let bays=await front();assert.ok(bays.length>=4,`front bays on screen (${bays.length})`);
 const hoverUntil=async(b,key,fn)=>{for(let i=0;i<6;i++){await page.mouse.move(b.x+i,b.y);await page.waitForTimeout(150);if(fn((await state())[key]))return true;}return false;};
 // Part level: hover glows the part, click selects it and the inspector shows the part with its breadcrumb.
 await selectLevel(page,'part');
 const tile=bays.find(b=>b.floor===1)??bays[0];
 assert.ok(await hoverUntil(tile,'hoverPart',v=>v==='main'),'part hover');
 await page.mouse.click(tile.x,tile.y);await until(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).selection.level==='part');
 const crumbs=page.getByRole('navigation',{name:'Selection path'});
 assert.deepEqual(await crumbs.getByRole('button').allTextContents(),['Building','Main part']);
 await page.screenshot({path:'output/ui-v2-inspector-part.png'});
 // Inspector action on the part: duplicate, then undo.
 await inspector(page).getByRole('button',{name:'Duplicate part',exact:true}).click();
 await until(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.volumes.length===2;});
 await page.getByRole('button',{name:'Undo',exact:true}).click();await until(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.volumes.length===1;});
 await idle();await page.getByRole('button',{name:'Front view',exact:true}).click();await page.waitForTimeout(400);bays=await front();
 // Double-click drills Part → Wall; Tab cycles the level; Escape steps up the breadcrumb.
 const b1=bays.find(b=>b.floor===1)??bays[0];
 await page.mouse.dblclick(b1.x,b1.y);await until(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).selection.level==='wall');
 assert.equal((await state()).level,'wall');
 assert.deepEqual((await state()).selection.walls,[{shapeId:'main',side:'north'}]);
 assert.deepEqual(await crumbs.getByRole('button').allTextContents(),['Building','Main part','Front wall']);
 await page.screenshot({path:'output/ui-v2-inspector-wall.png'});
 await page.keyboard.press('Escape');await until(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).selection.level==='part');
 await page.keyboard.press('Tab');await is('level','wall');
 // Wall level: hover shows the wall, click selects it; Shift adds another wall.
 assert.ok(await hoverUntil(b1,'hover',v=>!!v&&v.startsWith('main/north/')),'wall hover');
 await page.mouse.click(b1.x,b1.y);await until(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).selection.level==='wall');
 // Inspector action on a wall: paint it with the current brush colour.
 await page.getByRole('toolbar',{name:'Hotbar'}).getByRole('button',{name:/^Slot 3:/}).click();await is('rail','paint');
 await selectLevel(page,'wall');await page.mouse.click(b1.x,b1.y);await until(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).selection.level==='wall');
 const painted=await count(r=>r.studio.surfaces.length);
 await inspector(page).getByRole('button',{name:'Paint this wall',exact:true}).click();
 await until(n=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.studio.surfaces.length>n;},painted);
 // Tile level: one bay; the breadcrumb ends in Tile.
 await selectLevel(page,'tile');await is('level','tile');
 await page.mouse.click(b1.x,b1.y);await until(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).selection.level==='tile');
 assert.equal((await crumbs.getByRole('button').allTextContents()).at(-1),'Tile');
 await page.screenshot({path:'output/ui-v2-inspector-tile.png'});
 // Object level: brush a wall light onto the tile, select it as an object, and Delete removes just it.
 await brush(page,'Decorations');await page.getByRole('button',{name:'Light',exact:true}).click();await is('tool','light');
 const lights=async()=>(await sculpt()).studio.assemblies.filter(a=>a.kind==='light').length;
 await page.mouse.move(b1.x,b1.y);await page.waitForTimeout(200);await page.mouse.click(b1.x,b1.y);
 await until(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.studio.assemblies.some(a=>a.kind==='light');},undefined,20000);await idle();
 await selectLevel(page,'object');
 await page.mouse.click(b1.x+4,b1.y);await until(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).selection.level==='object');
 assert.equal((await crumbs.getByRole('button').allTextContents()).at(-1),'Light');
 await page.screenshot({path:'output/ui-v2-inspector-object.png'});
 const parts=(await sculpt()).volumes.length;await page.keyboard.press('Delete');
 await until(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return !JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.studio.assemblies.some(a=>a.kind==='light');});
 assert.equal((await sculpt()).volumes.length,parts,'Delete at object level keeps the part');assert.equal(await lights(),0);
 // Brush: paint a colour on a whole wall.
 await brush(page,'Material');await brushSize(page,'Wall');await page.locator('.studio-swatches button').nth(5).click();
 const beforeWall=(await sculpt()).studio.surfaces.filter(s=>s.scope==='wall').length;
 const east=(await visibleBays(page,b=>b.part==='main'&&b.side==='north'&&b.floor===2))[0]??b1;
 await page.mouse.click(east.x,east.y);await until(f=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.studio.surfaces.some(s=>s.scope==='wall'&&s.anchor.floor===f&&s.finish.color==='#b07858');},east.floor);
 await page.screenshot({path:'output/ui-v2-brush-paint.png'});
 // Brush: an opening onto a tile.
 await openings(page,'Freeform');await page.getByRole('button',{name:'Cut Window',exact:true}).click();await is('tool','free-opening');
 const free=async()=>((await sculpt()).studio.freeOpenings??[]).length;
 bays=await front();const t1=bays.find(b=>b.floor===1&&b.x<800)??bays[0],t2=bays.filter(b=>b.floor===1).at(-1)??bays.at(-1);
 for(const t of [t1,t2]){const n=await free();await page.mouse.move(t.x,t.y);await page.waitForTimeout(250);await page.mouse.click(t.x,t.y);await until(n=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return (JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.studio.freeOpenings??[]).length>n;},n);await idle();}
 assert.equal(await free(),2,'two openings brushed onto the front wall');
 await page.screenshot({path:'output/ui-v2-brush-opening.png'});
 // Opening level: select a brushed opening; the inspector dresses it.
 await selectLevel(page,'opening');await idle();
 let opening=(await state()).freeOpenings[0];
 assert.ok(await hoverUntil(opening,'hoverPick',v=>v?.freeOpeningId===opening.id),'opening hover');
 await page.mouse.click(opening.x,opening.y);await until(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).selection.level==='opening');
 await inspector(page).getByRole('group',{name:'Dress this opening'}).waitFor();
 await page.screenshot({path:'output/ui-v2-inspector-opening.png'});
 // Erase mode honours the target: only the clicked opening goes.
 await brush(page,'Openings',{erase:true});await brushSize(page,'Tile');await is('tool','pick');
 opening=(await state()).freeOpenings[0];await page.mouse.move(opening.x,opening.y);await page.waitForTimeout(250);
 await page.screenshot({path:'output/ui-v2-erase-hover.png'});
 await page.mouse.click(opening.x,opening.y);await until(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return (JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.studio.freeOpenings??[]).length===1;});
 assert.equal((await sculpt()).studio.surfaces.filter(s=>s.scope==='wall').length>=beforeWall,true,'erasing openings keeps paint');
 await page.keyboard.press('Control+z');await until(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return (JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.studio.freeOpenings??[]).length===2;});
 // Bulk erase: select the wall and erase all of its openings in one step.
 await selectLevel(page,'wall');await idle();bays=await front();
 const w=bays.find(b=>b.floor===2)??bays[0];await page.mouse.click(w.x,w.y);await until(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).selection.level==='wall');
 await inspector(page).getByRole('button',{name:'Erase all openings on this wall',exact:true}).click();
 await until(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return !(JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.studio.freeOpenings??[]).length;});
 await page.locator('.studio-toast').waitFor({state:'detached',timeout:8000}).catch(()=>{});
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('.studio-toast').filter({hasText:'Remove openings on this wall'}).waitFor({timeout:5000});
 await until(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return (JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.studio.freeOpenings??[]).length===2;});
 // Blocks palette: draw a box and an oval on the plot.
 await page.getByRole('button',{name:'Orbit view',exact:true}).click();await page.waitForTimeout(500);await idle();
 const draw=async(shape,from,to)=>{await rail(page,'Build');await page.getByRole('button',{name:shape,exact:true}).click();await is('tool',shape==='Box'?'block':'oval');const g=(await state()).ground,a=g[from],b=g[to],n=(await sculpt()).volumes.length;await page.mouse.move(a.x,a.y);await page.mouse.down();for(let i=1;i<=8;i++){await page.mouse.move(a.x+(b.x-a.x)*i/8*.35,a.y+(b.y-a.y)*i/8*.35);await page.waitForTimeout(30);}await page.mouse.up();await until(n=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.volumes.length>n;},n);await idle();};
 await draw('Box','frontLeft','front');
 await draw('Oval','frontRight','right');
 const kinds=(await sculpt()).volumes.map(v=>v.kind);assert.ok(kinds.includes('ellipse')&&kinds.filter(k=>k==='rectangle').length>=2,`box and oval drawn (${kinds})`);
 await page.screenshot({path:'output/ui-v2-build.png'});
 assert.equal((await state()).rail,'select','a drawn block is selected for editing');
 // Phone width: rail, stage and hotbar fit without horizontal scrolling.
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(600);
 const overflow=await page.evaluate(()=>{const s=document.querySelector('.city-studio.studio-v2'),shell=document.querySelector('.studio-shell');return {scroll:Math.max(s.scrollWidth-s.clientWidth,shell.scrollWidth-shell.clientWidth,document.documentElement.scrollWidth-document.documentElement.clientWidth),rail:document.querySelector('.studio-toolrail')?.getBoundingClientRect().toJSON(),hotbar:document.querySelector('.studio-hotbar')?.getBoundingClientRect().toJSON()};});
 assert.ok(overflow.scroll<=1,`no horizontal overflow (${overflow.scroll})`);assert.ok(overflow.rail&&overflow.rail.right<=391&&overflow.hotbar.bottom<=845,JSON.stringify(overflow));
 await page.screenshot({path:'output/ui-v2-mobile-select.png'});
 for(const [name,id] of [['Paint','paint'],['Erase','erase'],['Build','build'],['Roof','roof'],['Garden','garden'],['Rooms','rooms'],['Furnish','furnish']]){await rail(page,name);await page.waitForTimeout(400);await page.screenshot({path:`output/ui-v2-mobile-${id}.png`});}
 await rail(page,'Select');const onScreen=(await visibleBays(page,b=>b.part==='main'))[0];if(onScreen){await page.mouse.click(onScreen.x,onScreen.y);await page.waitForTimeout(500);await page.screenshot({path:'output/ui-v2-mobile-inspector.png'});}
 assert.deepEqual(errors,[]);
 console.log('Studio UI v2: rail hotkeys, part/wall/tile/opening/object selection with hover and breadcrumb, double-click drill and Esc step-up, level-aware Delete, inspector duplicate and wall paint, brush colour on a wall, brushed openings, target-filtered erase, bulk wall erase with one-step undo, box and oval blocks and the phone layout passed.');
}catch(e){await page.screenshot({path:'output/ui-v2-failure.png'}).catch(()=>{});console.log(JSON.stringify(await studioState(page).catch(()=>null),(k,v)=>k==='bays'?undefined:v).slice(0,2500));console.log(await page.locator('.studio-feedback').textContent().catch(()=>''));throw e;}finally{await browser.close();}
