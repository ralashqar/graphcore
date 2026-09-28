// Surfaces (docs/city-surfaces.md): paints every wall material with a tint, scale and wear through the surface
// library, a rising-damp gradient band, stencilled stripes and a soft-edged stroke on a generated wall; matches a
// finish with the eyedropper; checks undo; sets storey and room floor finishes; and renders a contact sheet of every
// wall pattern. Screenshots: output/surface-wall-*.png, output/surface-floor-*.png, output/surface-swatches.png,
// output/surface-contact-sheet.png (suffix -webgl on CITY_BACKEND=webgl, which runs a shorter smoke pass).
// Needs a running dev server (CITY_TEST_ORIGIN, default http://localhost:5180).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {brush,brushSize,rail} from './city-studio-ui.mjs';
const backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'',smoke=backend==='webgl';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180';
mkdirSync('output',{recursive:true});
const WALLS=['brick-stretcher','brick-flemish','brick-english','stone-ashlar','stone-rubble','render-stucco','weatherboard','shingles','timber-cladding','corrugated-metal','concrete-panel','glazed-tile','tokyo-tile','marble','tile-subway','paint-smooth'];
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-webgpu']});
let page;const report={backend,walls:{},floors:{},pipelines:{}};
try{
 page=await browser.newPage({viewport:{width:1600,height:1300}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|wgsl|glsl|pipeline|compile/i.test(m.text()))errors.push(m.text());});
 await page.goto(`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${smoke?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 const seed=contact=>page.evaluate(async({contact,walls})=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts'),{emptyInterior}=await import('/src/domain/cityStudioInteriors.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='surfaces-browser';plot.revision=(plot.revision??0)+1;
  const draft=studioExample(initialLandDraft(plot),0,plot.size),base=draft.sculpt;
  const r={...base,version:6,interior:{...emptyInterior(),partitions:[{id:'split',floor:0,a:[2.5,-4.5],b:[2.5,4.5]}]}};
  r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:3}];
  Object.assign(r.studio,{openings:[],assemblies:[],surfaces:[],stamps:undefined,variation:undefined,facadeRhythm:undefined,freeTrims:undefined,roofOpenings:undefined,roofDetails:undefined,paintRegions:undefined,paintRules:undefined,facadeThemes:undefined,parts:{}});
  r.studio.defaults.family='pastel-stucco';r.studio.defaults.roof='terrace';
  const at=(id,x,bottom,width,height,shape)=>({id,shapeId:'main',side:'north',u:x/12,bottom,width,height,shape});
  if(contact){r.studio.facade='unified';r.studio.freeOpenings=[];
   // One cell per wall pattern (5 x 3 on the 12 m front), each tinted with its own default.
   const {surfacePattern}=await import('/src/domain/citySurfacePatterns.ts');
   r.studio.paintRegions=walls.slice(0,15).map((p,i)=>{const c=i%5,row=Math.floor(i/5),x0=.1+c*2.38,y0=.15+row*3.05;return {id:`c${i}`,shapeId:'main',side:'north',channel:'wall',rects:[[x0,x0+2.2,y0,y0+2.8]],finish:{color:surfacePattern(p).tint,surface:{pattern:p}}};});}
  else r.studio.freeOpenings=[at('door',6,0,1.5,2.75,'arch'),at('g-l',1.4,.9,1.2,1.7,'rect'),at('u-l',2.4,4.3,1.1,1.6,'rect'),at('u-r',9.6,4.3,1.1,1.6,'rect')];
  plot.draft=studioDraft(draft,r);localStorage.setItem(key,JSON.stringify(world));
 },{contact,walls:WALLS});
 await seed(false);
 const open=async()=>{await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:90000});await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready'&&!document.querySelector('.studio-preparing'),null,{timeout:90000});};
 const sculpt=()=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt;});
 const regions=async()=>(await sculpt()).studio.paintRegions??[];
 const waitFor=(fn,arg,label)=>page.waitForFunction(([src,arg])=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),s=JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt;return new Function('s','arg',`return (${src})(s,arg)`)(s,arg);},[fn.toString(),arg],{timeout:30000}).catch(async e=>{console.log(label,JSON.stringify((await sculpt()).studio.paintRegions).slice(0,600));await page.screenshot({path:`output/surface-failure${suffix}.png`});throw e;});
 const settle=async()=>{await page.waitForFunction(()=>!document.querySelector('.studio-preparing')&&!JSON.parse(document.querySelector('canvas').dataset.cityStudio||'{}').busy,null,{timeout:30000}).catch(()=>{});await page.waitForTimeout(700);};
 const pipelines=()=>page.evaluate(()=>{const r=window.__citySurfaceRenderer;return r?._pipelines?.caches?.size??-1;});
 const shot=async name=>{await page.mouse.move(20,300);await settle();await page.screenshot({path:`output/${name}${suffix}.png`,clip:{x:260,y:120,width:1080,height:900}});};
 await open();
 await brush(page,'Material');
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(1500);
 // Closer than the default framing so joints and grain read in the screenshots.
 await page.mouse.move(800,640);for(let k=0;k<4;k++){await page.mouse.wheel(0,-240);await page.waitForTimeout(120);}await page.waitForTimeout(1200);
 const bays=async()=>{const st=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStudio||'{}'));const north=st.bays.filter(b=>b.part==='main'&&b.side==='north');const row=f=>north.filter(b=>b.floor===f).sort((a,b)=>a.x-b.x);return {g:row(0),u:row(1),t:row(2)};};
 const s=await bays();assert.ok(s.g.length>=3&&s.u.length>=3,'front bays visible');
 const d=(await sculpt()),design=await page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots[0].draft.design;});void d;
 const gh=design.groundHeight,uh=design.upperHeight??3,yAt=h=>s.g[0].y+(h-gh/2)*(s.u[0].y-s.g[0].y)/((gh+uh/2)-gh/2);
 const lib=page.locator('.studio-surface-library');await lib.waitFor({timeout:10000});
 await lib.getByRole('button',{name:'All materials'}).click();
 // Swatch library contact sheet (thumbnails from the same pattern source as the shader).
 await page.evaluate(()=>{const grid=document.querySelector('.studio-surface-library .studio-surface-grid'),sheet=document.createElement('div');sheet.id='surface-sheet';sheet.className='city-studio';
  Object.assign(sheet.style,{position:'fixed',left:'0',top:'0',width:'980px',padding:'14px',background:'#fbf8ee',zIndex:'99999',borderRadius:'0'});const copy=grid.cloneNode(true);Object.assign(copy.style,{maxHeight:'none',overflow:'visible',gridTemplateColumns:'repeat(10,1fr)'});sheet.append(copy);document.body.append(sheet);});
 await page.locator('#surface-sheet').screenshot({path:`output/surface-swatches${suffix}.png`});await page.evaluate(()=>document.getElementById('surface-sheet')?.remove());
 const range=async(label,value)=>{const input=lib.getByRole('slider',{name:label,exact:true});await input.evaluate((el,v)=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,String(v));el.dispatchEvent(new Event('input',{bubbles:true}));},value);};
 // Main-thread cost of first use: long tasks while patterns are picked, warmed and painted.
 await page.evaluate(()=>{window.__surfaceLong=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__surfaceLong.push(Math.round(e.duration));}).observe({type:'longtask',buffered:false});});
 const longTasks=async()=>page.evaluate(()=>{const l=window.__surfaceLong.splice(0);return {count:l.length,max:Math.max(0,...l),total:l.reduce((a,b)=>a+b,0)};});
 // Baseline: plain colour fills (no new shader) for comparison with first use of each pattern.
 await brushSize(page,'Wall');await page.getByRole('button',{name:'Smooth',exact:true}).click();
 for(let k=0;k<4;k++){await page.locator('.studio-swatches button').nth(k).click();await page.mouse.click(s.u[1].x,s.u[1].y);await settle();}
 report.baselineLongTasks=await longTasks();
 // 1) Every wall material: pick, tint with a swatch, scale and wear, fill the front wall; one region each.
 await brushSize(page,'Wall');
 const list=smoke?WALLS.slice(0,4):WALLS;
 for(const [i,pattern] of list.entries()){
  await lib.locator(`[data-pattern="${pattern}"]`).click();await page.waitForFunction(p=>document.querySelector(`[data-pattern="${p}"]`)?.getAttribute('aria-pressed')==='true',pattern);
  const swatch=page.locator('.studio-swatches button').nth(i%7);await swatch.click();const tint=(await swatch.getAttribute('aria-label')).replace('Paint ','');
  const scale=[.71,1,1.41,2][i%4],wear=[0,.3,.6,.15][i%4];await range('Scale',Math.log2(scale));await range('Wear',wear);if(pattern.startsWith('brick')&&i%2)await range('Painted over',.7);else await range('Painted over',0);
  const before=await pipelines();
  await page.mouse.move(s.u[1].x,s.u[1].y);await page.waitForTimeout(150);await page.mouse.click(s.u[1].x,s.u[1].y);
  await waitFor((st,p)=>(st.studio.paintRegions??[]).some(g=>g.finish.surface?.pattern===p),pattern,pattern);
  const g=(await regions()).find(x=>x.finish.surface?.pattern===pattern);
  assert.equal(g.finish.color,tint,`${pattern} tint`);assert.equal(g.finish.surface.scale??1,scale,`${pattern} scale`);assert.equal(g.finish.surface.wear??0,wear,`${pattern} wear`);
  await shot(`surface-wall-${pattern}`);report.walls[pattern]={tint,scale,wear,painted:g.finish.surface.painted??0,pipelinesBefore:before,pipelinesAfter:await pipelines(),longTasks:await longTasks()};
 }
 // 2) Same pattern, new parameters: uniforms only, no new pipeline.
 {const before=await pipelines();await range('Scale',1.5);await range('Wear',.9);await page.mouse.click(s.u[1].x,s.u[1].y);await settle();report.pipelines.retune={before,after:await pipelines(),longTasks:await longTasks()};
  if(before>0)assert.equal(await pipelines(),before,'retuning a painted pattern compiles nothing new');}
 // 3) Eyedropper: pick up the last wall (material, colour and scale) while another pattern is armed.
 const last=list.at(-1),lastRegion=(await regions()).at(-1);
 await lib.locator('[data-pattern="brick-english"]').click();
 await lib.getByRole('button',{name:'Match a finish'}).click();await page.mouse.click(s.u[1].x,s.u[1].y);
 await page.waitForFunction(p=>document.querySelector(`[data-pattern="${p}"]`)?.getAttribute('aria-pressed')==='true',last,{timeout:10000});
 const scaleShown=await lib.locator('.studio-surface-slider output').first().textContent();assert.equal(scaleShown,`${(lastRegion.finish.surface.scale??1).toFixed(2)}×`,'match took the scale');
 report.match={pattern:last,scale:scaleShown};
 // 4) Rising damp band on the ground floor (gradient), then stencilled stripes on the top storey.
 await lib.locator('[data-pattern="render-stucco"]').click();await page.locator('.studio-swatches button').nth(0).click();await range('Scale',0);await range('Wear',0);
 await lib.locator('summary',{hasText:'Brush effects'}).click();
 await lib.getByRole('button',{name:'Rising damp'}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.studio-surface-library button')].find(b=>b.textContent==='Rising damp')?.getAttribute('aria-pressed')==='true',null,{timeout:5000}).catch(async()=>console.log('damp not pressed',await page.getByRole('group',{name:'Brush size'}).innerText()));
 console.log('sizes',await page.getByRole('group',{name:'Brush size'}).innerText());
 const bx=(s.g[0].x+s.g[1].x)/2;await page.mouse.move(bx,yAt(1.3));await page.mouse.down();for(let k=1;k<=10;k++){await page.mouse.move(bx+k,yAt(1.3-1.5*k/10));await page.waitForTimeout(20);}await page.mouse.up();
 await waitFor(st=>(st.studio.paintRegions??[]).some(g=>g.finish.surface?.fade&&g.band),null,'damp');
 const damp=(await regions()).find(g=>g.finish.surface?.fade);assert.ok(damp.finish.surface.fade.y0<damp.finish.surface.fade.y1,'rising damp is darkest at the bottom');
 await shot('surface-wall-gradient');
 await lib.getByRole('group',{name:'Fade'}).getByRole('button',{name:'None',exact:true}).click();
 await lib.getByRole('button',{name:'Stripes',exact:true}).click();await page.locator('.studio-swatches button').nth(4).click();
 const ty=yAt(gh+uh+.4),ty2=yAt(gh+uh+2.4);await page.mouse.move(bx,ty);await page.mouse.down();for(let k=1;k<=10;k++){await page.mouse.move(bx+k,ty+(ty2-ty)*k/10);await page.waitForTimeout(20);}await page.mouse.up();
 await waitFor(st=>(st.studio.paintRegions??[]).some(g=>!g.band&&g.rects.length>4&&g.rects.every(q=>q[3]-q[2]>1)),null,'stripes');
 await shot('surface-wall-band-stripes');
 await lib.getByRole('group',{name:'Stencil stripes'}).getByRole('button',{name:'None',exact:true}).click();
 // 5) Soft-edged stroke.
 await brushSize(page,'Freeform');await page.getByRole('group',{name:'Brush size'}).getByRole('button',{name:'Large'}).click();
 await lib.locator('[data-pattern="paint-smooth"]').click();await page.locator('.studio-swatches button').nth(6).click();await range('Soft edge',.6);
 const sy=yAt(gh+uh*.55),x0=s.u[0].x,x1=s.u.at(-1).x;await page.mouse.move(x0,sy);await page.mouse.down();for(let k=1;k<=16;k++){await page.mouse.move(x0+(x1-x0)*k/16,sy);await page.waitForTimeout(16);}await page.mouse.up();
 await waitFor(st=>(st.studio.paintRegions??[]).some(g=>g.finish.surface?.soft===.6),null,'soft');
 await shot('surface-wall-soft');
 // 6) Undo: one labelled step removes the soft stroke only.
 const count=(await regions()).length;await page.getByRole('button',{name:'Undo',exact:true}).click();
 await waitFor((st,n)=>(st.studio.paintRegions??[]).length===n-1,count,'undo');report.undo={before:count,after:(await regions()).length};
 const toast=await page.locator('.studio-toast, [role=status]').allTextContents().catch(()=>[]);report.undo.toast=toast.join(' | ').slice(0,120);
 // 7) Floors: storey default, per-room finishes and the floor brush.
 await rail(page,'Rooms');await settle();
 const storey=page.locator('[aria-label="Storey floor"]');await storey.waitFor({timeout:15000});
 await page.getByRole('button',{name:'Storey floor: Herringbone',exact:true}).click();
 await waitFor(st=>st.interior.floorSurfaces?.[0]?.surface.pattern==='timber-herringbone',null,'storey floor');
 await shot('surface-floor-herringbone');
 const panel=page.locator('.studio-room-panel');
 const roomFloor=async(n,label,pattern)=>{await panel.getByRole('button',{name:new RegExp(`Room ${n}`)}).click();await page.getByRole('button',{name:`Selected room floor: ${label}`,exact:true}).click();await waitFor((st,p)=>(st.interior.roomFinishes??[]).some(r=>r.floorSurface?.pattern===p),pattern,label);};
 if(await panel.count()){await roomFloor(1,'Tatami','tatami');await shot('surface-floor-tatami');if(!smoke){await roomFloor(2,'Marble · veined','marble');await shot('surface-floor-marble');}}
 const floors=smoke?['Terrazzo']:['Terrazzo','Hex tile','Checker tile','Parquet','Chevron','Cobbles','Carpet','Rubber studded','Stone flags','Polished concrete','Brick paving','Timber planks','Square tile','Subway tile'];
 for(const label of floors){await page.getByRole('button',{name:`Floor brush: ${label}`,exact:true}).click();await page.getByRole('button',{name:'All rooms on this storey'}).click();
  await page.waitForTimeout(250);await settle();const got=(await sculpt()).interior.roomFinishes?.map(r=>r.floorSurface?.pattern);report.floors[label]=got;await shot(`surface-floor-${label.toLowerCase().replace(/[^a-z]+/g,'-')}`);}
 assert.ok(Object.values(report.floors).every(v=>v?.length&&v.every(Boolean)),'the floor brush paints every room');
 // 8) Warm-up and compile budget.
 report.warm=await page.evaluate(()=>window.__citySurfaceWarm??{});
 // 9) Contact sheet: every wall pattern rendered side by side on a generated front.
 if(!smoke){await seed(true);await open();await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(1800);await shot('surface-contact-sheet');}
 assert.deepEqual(errors,[],'no page or shader errors');
 writeFileSync(`output/surface-browser${suffix}.json`,JSON.stringify(report,null,1));
 console.log(`Surfaces (${backend}): ${Object.keys(report.walls).length} wall materials, gradient, stripes, soft edge, match, undo and ${Object.keys(report.floors).length} floor brushes passed.`);
 console.log(JSON.stringify({pipelines:report.pipelines,baseline:report.baselineLongTasks,firstUse:Object.fromEntries(Object.entries(report.walls).map(([k,v])=>[k,v.longTasks])),match:report.match,undo:report.undo}));
}catch(error){if(page){await page.screenshot({path:`output/surface-failure${suffix}.png`}).catch(()=>{});console.error(await page.locator('.studio-feedback').textContent().catch(()=>''));}throw error;}finally{await browser.close();}
