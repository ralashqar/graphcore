// Theme brush and theme-card drag (docs/city-studio-themes.md › Theme brush), native WebGPU by default:
//  1. two parts: Paint › Themes brushes Tokyo zakkyo onto one part and Paris Haussmann onto the other;
//  2. Alt-click picks up the first part's theme (seed, colours, tuning) and paints it onto the second;
//  3. Erase › Themes removes a part theme; Shift-click themes the whole building;
//  4. a palette card dragged onto a part applies it; Esc cancels a drag;
//  5. a gallery card dragged onto an empty plot starts a themed block;
//  6. undo/redo labels throughout. Screenshots output/theme-brush-*.png.
//   CITY_TEST_ORIGIN=http://localhost:5180 node scripts/city-studio-theme-brush-browser.mjs   (CITY_BACKEND=webgl: WebGL2)
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {backend,captureStage,openStudio,savedSculpt,seedPlot,settle,until} from './city-studio-themes-shared.mjs';
const suffix=backend==='webgl'?'-webgl':'';
mkdirSync('output',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];globalThis.__errors=errors;page.on('pageerror',e=>errors.push(e.message));
 await seedPlot(page,[{id:'main',width:9,depth:9,floors:5,x:-4.5,z:1},{id:'wing',width:7,depth:8,floors:3,x:5,z:1}],'Theme brush');await openStudio(page);
 const data=()=>page.evaluate(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio||'{}'));
 if(backend==='native')assert.notEqual(await page.evaluate(()=>document.querySelector('canvas').dataset.cityBackend),'webgl','native WebGPU run');
 const refs=async()=>(await savedSculpt(page)).studio.facadeThemes??[];
 const ref=async part=>(await refs()).find(x=>x.partId===part);
 const tools=page.getByRole('navigation',{name:'Building tools'});
 const palette=()=>page.locator('.studio-brush-palette');
 const undoLabels=[];
 /** Undo then redo, checking the toast names the step. */
 const undoRedo=async(label,check)=>{const before=JSON.stringify(await savedSculpt(page));await page.keyboard.press('Control+z');await page.getByRole('status').filter({hasText:`Undid: ${label}`}).first().waitFor({timeout:8000});undoLabels.push(label);
  await page.keyboard.press('Control+Shift+z');await until(page,async()=>JSON.stringify(await savedSculpt(page))===before,`redo ${label}`);if(check)await check();await settle(page,300);};
 /** A screen point on a part: the bay nearest the view centre whose hover resolves to that part. */
 const partPoint=async part=>{const d=await data(),vp=page.viewportSize(),cands=d.bays.filter(b=>b.part===part&&b.x>vp.width*.28&&b.x<vp.width*.72&&b.y>vp.height*.12&&b.y<vp.height*.85).sort((a,b)=>Math.hypot(a.x-vp.width/2,a.y-vp.height/2)-Math.hypot(b.x-vp.width/2,b.y-vp.height/2));
  for(const b of cands.slice(0,24)){await page.mouse.move(b.x,b.y);await page.waitForTimeout(260);if((await data()).themeHover===part)return b;}
  throw Error(`no visible point on ${part}`);};
 const clickPart=async(part,mod)=>{const p=await partPoint(part);if(mod)await page.keyboard.down(mod);await page.mouse.click(p.x,p.y);if(mod)await page.keyboard.up(mod);return p;};
 const chooseCard=async label=>{await palette().getByRole('textbox',{name:'Search themes'}).fill(label);await palette().getByRole('button',{name:`Paint ${label}`,exact:true}).click();await palette().getByRole('textbox',{name:'Search themes'}).fill('');};

 // 1. Paint › Themes: theme A on main, theme B on wing.
 await tools.getByRole('button',{name:'Paint',exact:true}).click();
 await page.getByRole('group',{name:'Brush target'}).getByRole('button',{name:'Themes',exact:true}).click();
 await until(page,async()=>(await data()).target==='themes','themes target');
 const sizes=page.getByRole('group',{name:'Brush size'});
 assert.equal(await sizes.getByRole('button',{name:'Wall',exact:true}).isDisabled(),true,'Wall size disabled for themes');
 assert.match(await sizes.getByRole('button',{name:'Wall',exact:true}).getAttribute('title'),/whole parts/);
 await chooseCard('Tokyo zakkyo building');
 await until(page,async()=>(await data()).themeBrush.theme==='tokyo-zakkyo','brush holds Tokyo');
 await partPoint('main');await page.waitForTimeout(300);
 const hoverLabel=await page.locator('[data-theme-label]').first().textContent();assert.equal(hoverLabel,'Apply Tokyo zakkyo building','ghost label on hover');
 await clickPart('main');
 await until(page,async()=>(await ref('main'))?.theme==='tokyo-zakkyo','Tokyo on main');
 await undoRedo('Theme part: Tokyo zakkyo building',async()=>assert.equal((await ref('main'))?.theme,'tokyo-zakkyo'));
 await chooseCard('Paris Haussmann');
 await settle(page,800);await partPoint('wing');await page.waitForTimeout(400);assert.equal(await page.locator('[data-theme-label]').first().textContent(),'Apply Paris Haussmann');
 await page.screenshot({path:`output/theme-brush-hover${suffix}.png`});
 await clickPart('wing');
 await until(page,async()=>(await ref('wing'))?.theme==='paris-haussmann','Haussmann on wing');
 {const r=await savedSculpt(page),rule=id=>r.studio.facadeRhythm.rules.find(x=>x.partId===id&&x.side===undefined&&x.fromFloor===undefined);
  assert.equal((await refs()).length,2);assert.equal(rule('main').style,'tokyo');assert.equal(rule('wing').style,'townhouse');
  assert.notDeepEqual(r.studio.parts.main.finishes,r.studio.parts.wing.finishes,'each part looks different');
  const pieces=await page.evaluate(async()=>{const {resolveSculpt}=await import('/src/domain/citySculpt.ts');const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),d=JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft,s=resolveSculpt(d.sculpt,d.design).studio;return {inactive:s.inactive.length,main:s.pieces.filter(p=>p.id.startsWith('theme/part-main/')).map(p=>p.module).sort(),wing:s.pieces.filter(p=>p.id.startsWith('theme/part-wing/')).map(p=>p.module).sort()};});
  assert.equal(pieces.inactive,0);assert.notDeepEqual(pieces.main,pieces.wing,'themed pieces differ per part');}
 await settle(page,1200);await captureStage(page,`output/theme-brush-parts${suffix}.png`);

 // 2. Eyedropper: Alt-click main picks up its look; paint it onto wing.
 const mainRef=await ref('main');
 await clickPart('main','Alt');
 await until(page,async()=>{const b=(await data()).themeBrush;return b.theme==='tokyo-zakkyo'&&b.seed===mainRef.seed&&b.from==='main';},'picked up main');
 assert.match((await data()).themeNote,/Picked up Tokyo zakkyo building/);
 await clickPart('wing');
 await until(page,async()=>(await ref('wing'))?.theme==='tokyo-zakkyo','eyedropped onto wing');
 {const r=await savedSculpt(page),w=await ref('wing');assert.equal(w.seed,mainRef.seed);assert.equal(w.palette,mainRef.palette);assert.deepEqual(r.studio.parts.wing.finishes,r.studio.parts.main.finishes);}
 await undoRedo('Theme part: Tokyo zakkyo building');
 await settle(page,1000);await captureStage(page,`output/theme-brush-eyedropper${suffix}.png`,null);

 // 3. Erase with the Themes target removes the wing theme; Shift-click paints the building.
 await page.keyboard.press('e');await until(page,async()=>(await data()).rail==='erase','erase');
 assert.equal((await data()).target,'themes');
 await partPoint('wing');await page.waitForTimeout(250);assert.equal(await page.locator('[data-theme-label]').first().textContent(),'Remove theme');
 await clickPart('wing');
 await until(page,async()=>!(await ref('wing')),'wing theme erased');assert.ok(await ref('main'));
 await undoRedo('Remove theme: Tokyo zakkyo building',async()=>assert.equal(await ref('wing'),undefined));
 await page.keyboard.press('e');await until(page,async()=>(await data()).rail==='paint','paint');
 await chooseCard('Brutalist civic');
 await clickPart('main','Shift');
 await until(page,async()=>{const r=await refs();return r.length===1&&r[0].theme==='brutalist-civic'&&r[0].partId===undefined;},'building themed by Shift-click');
 await undoRedo('Theme building: Brutalist civic');
 await settle(page,1000);await captureStage(page,`output/theme-brush-building${suffix}.png`,null);

 // 4. Drag a palette card onto a part; Esc cancels a drag.
 const drag=async(card,to,{esc=false,steps=14}={})=>{await card.scrollIntoViewIfNeeded();await page.mouse.move(5,5);const box=await card.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  for(let i=1;i<=steps;i++){await page.mouse.move(box.x+box.width/2+(to.x-box.x-box.width/2)*i/steps,box.y+box.height/2+(to.y-box.y-box.height/2)*i/steps);await page.waitForTimeout(25);}
  await page.waitForTimeout(250);const ghost=await page.locator('.studio-theme-drag-ghost').getAttribute('data-outcome',{timeout:3000}).catch(()=>null),shot=await page.screenshot({path:'output/theme-brush-dragging.png'});
  if(esc)await page.keyboard.press('Escape');await page.mouse.up();return {ghost,shot};};
 const wingPoint=await partPoint('wing');await page.mouse.move(5,5);
 await palette().getByRole('textbox',{name:'Search themes'}).fill('NYC walk-up');
 const nycCard=palette().getByRole('button',{name:'Paint NYC walk-up tenement',exact:true});
 const cancelled=await drag(nycCard,wingPoint,{esc:true});assert.equal(cancelled.ghost,'part','drop highlight over a part');
 await page.waitForTimeout(600);assert.equal((await refs()).some(r=>r.theme==='nyc-tenement'),false,'Esc cancels the drop');
 assert.equal(await page.locator('.studio-theme-drag-ghost').count(),0);
 const dropped=await drag(nycCard,wingPoint);assert.equal(dropped.ghost,'part');
 await until(page,async()=>(await ref('wing'))?.theme==='nyc-tenement','dropped onto wing');
 assert.equal((await refs()).find(r=>r.partId===undefined)?.theme,'brutalist-civic','building theme kept for main');
 await undoRedo('Theme part: NYC walk-up tenement');
 {const box=await nycCard.boundingBox(),outside={x:box.x+box.width/2,y:box.y-60};const before=JSON.stringify(await refs());await drag(nycCard,outside);await page.waitForTimeout(500);assert.equal(JSON.stringify(await refs()),before,'dropping outside the view cancels');}
 // Touch: long-press, then drag (synthetic touch pointer events).
 {await palette().getByRole('textbox',{name:'Search themes'}).fill('Seaside');const card=palette().getByRole('button',{name:'Paint Beach and seaside',exact:true}),box=await card.boundingBox();
  await card.evaluate((el,[x,y])=>el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:77,pointerType:'touch',isPrimary:true,button:0,buttons:1,clientX:x,clientY:y})),[box.x+box.width/2,box.y+box.height/2]);
  await page.waitForTimeout(500);
  for(let i=1;i<=8;i++){const x=box.x+box.width/2+(wingPoint.x-box.x-box.width/2)*i/8,y=box.y+box.height/2+(wingPoint.y-box.y-box.height/2)*i/8;await page.evaluate(([x,y])=>window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:77,pointerType:'touch',clientX:x,clientY:y})),[x,y]);await page.waitForTimeout(30);}
  await page.evaluate(([x,y])=>window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:77,pointerType:'touch',clientX:x,clientY:y})),[wingPoint.x,wingPoint.y]);
  await until(page,async()=>(await ref('wing'))?.theme==='seaside','touch drag onto wing');}
 await settle(page,1200);await captureStage(page,`output/theme-brush-drag${suffix}.png`,null);

 // 5. Gallery card dragged onto an empty plot: a themed starter block.
 await seedPlot(page,[],'Empty plot');await openStudio(page);
 await tools.getByRole('button',{name:'Build',exact:true}).click();
 await page.getByRole('button',{name:'Themes',exact:true}).click();
 const gallery=page.getByRole('complementary',{name:'Themes'});await gallery.waitFor();
 await gallery.getByRole('textbox',{name:'Search themes'}).fill('Italian palazzo');
 const ground=(await data()).ground,pts=Object.values(ground),mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
 const c=mid(ground.front,ground.back),out=(p,k)=>({x:c.x+(p.x-c.x)*k,y:c.y+(p.y-c.y)*k});
 // Inside the plot (build limit 10.5 m; ground points are 8.5 m out), clear of the gallery sheet.
 const cands=[c,...pts,...[1.1,1.18].flatMap(k=>[ground.back,ground.left,ground.right].map(p=>out(p,k)))];
 let spot=null;for(const p of cands){if(await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.tagName==='CANVAS',[p.x,p.y])){spot=p;break;}}
 if(!spot)console.log(JSON.stringify(ground),JSON.stringify(await Promise.all(cands.map(p=>page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.className+'|'+document.elementFromPoint(x,y)?.tagName,[p.x,p.y])))));
 assert.ok(spot,'a visible ground point in the plot');
 const starter=await drag(gallery.getByRole('button',{name:'Apply Italian palazzo',exact:true}),spot);assert.equal(starter.ghost,'starter');
 await until(page,async()=>{const r=await savedSculpt(page);return r.volumes.length===1&&r.studio.facadeThemes?.[0]?.theme==='italian-palazzo';},'themed starter from drop');
 await undoRedo('Theme building: Italian palazzo');
 await settle(page,1500);await captureStage(page,`output/theme-brush-starter${suffix}.png`);

 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({backend,undo:undoLabels,screenshots:['hover','parts','eyedropper','building','drag','starter'].map(x=>`output/theme-brush-${x}${suffix}.png`)},null,1));
}catch(e){const pages=browser.contexts().flatMap(c=>c.pages());if(pages[0]){await pages[0].screenshot({path:'output/theme-brush-failure.png'}).catch(()=>{});}console.error('page errors:',JSON.stringify(globalThis.__errors??[]));throw e;}finally{await browser.close();}
