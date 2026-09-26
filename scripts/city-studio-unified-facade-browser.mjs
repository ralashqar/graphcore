// Unified facades (docs/city-unified-facades.md): open a New York kit-tile building, convert it with
// "Convert to editable facade" and compare the look before/after (same camera), undo/redo the conversion,
// then on a unified rhythm building place a kit window from the Windows tray (a free kit piece the rhythm
// fills around) and paint a storefront stamp (a manual span on the generated wall). The `cityFacade=unified`
// flag converts a kit building silently when the studio opens. Needs a running dev server (CITY_TEST_ORIGIN).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180',backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const preset=Number(process.env.CITY_UNIFIED_PRESET??0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
/** Share of pixels whose colour differs by more than `threshold` (0..255 per channel) and the mean difference. */
async function imageDiff(a,b,threshold=40){
 const [x,y]=await Promise.all([a,b].map(p=>sharp(p).removeAlpha().raw().toBuffer({resolveWithObject:true})));
 let changed=0,sum=0;const n=x.info.width*x.info.height;
 for(let i=0;i<n;i++){const d=Math.max(Math.abs(x.data[i*3]-y.data[i*3]),Math.abs(x.data[i*3+1]-y.data[i*3+1]),Math.abs(x.data[i*3+2]-y.data[i*3+2]));sum+=d;if(d>threshold)changed++;}
 return {changed:changed/n,mean:sum/n};
}
try{
 const page=await browser.newPage({viewport:{width:1600,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=(flag='')=>`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}${flag}`;
 await page.goto(url());
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 const setDraft=(kind,index)=>page.evaluate(async([kind,index])=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{nycPreset}=await import('/src/domain/cityNycPresets.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts'),{newFacadeRhythm}=await import('/src/domain/cityStudioFacadeRhythm.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='unified-facade-browser';plot.revision=(plot.revision??0)+1;
  if(kind==='nyc')plot.draft=nycPreset(initialLandDraft(plot),index,plot.size);
  else{
   // A unified rhythm building: every wall generated, townhouse rhythm, Blender catalog for storefronts.
   const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
   r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:14,depth:9,startFloor:0,spanFloors:4}];
   Object.assign(r.studio,{catalogue:'synarc-kit-5',openings:[],assemblies:[],surfaces:[],stamps:undefined,variation:undefined,freeOpenings:undefined,freeTrims:undefined,facade:'unified',facadeRhythm:newFacadeRhythm('townhouse',5),parts:{}});
   r.studio.defaults.family='warm-brick';r.studio.defaults.roof='terrace';
   plot.draft=studioDraft({...draft,design:{...draft.design,groundHeight:3.8}},r);plot.draft.design.floors=4;
  }
  localStorage.setItem(key,JSON.stringify(world));
 },[kind,index]);
 const open=async(flag='')=>{
  await page.goto(url(flag));
  await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
  await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:90000});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:90000}).catch(()=>{});
 };
 const settle=async(ms=1600)=>{await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000}).catch(()=>{});await page.waitForTimeout(ms);};
 const saved=()=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.purchaseId==='unified-facade-browser').draft;});
 const until=async(fn,label,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){if(await fn())return;await page.waitForTimeout(150);}await page.screenshot({path:`output/city-studio-unified-failure${suffix}.png`});throw Error(`Timed out: ${label}`);};
 const resolved=()=>page.evaluate(async()=>{
  const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),draft=JSON.parse(localStorage.getItem(k)).plots.find(p=>p.purchaseId==='unified-facade-browser').draft;
  const t=performance.now(),s=resolveSculpt(draft.sculpt,draft.design).studio,ms=performance.now()-t;
  return {ms,inactive:s.inactive,faces:(s.freeFaces??[]).length,triangles:(s.freeFaces??[]).reduce((n,f)=>n+f.geometry.triangles,0),kit:s.pieces.filter(p=>p.id.startsWith('free/')).length,pieces:s.pieces.length,bays:s.bays.length};
 });
 const state=()=>page.locator('canvas').evaluateAll(cs=>JSON.parse(cs.find(c=>c.dataset.cityStudio)?.dataset.cityStudio||'{}'));
 const frame=async()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(null)))));
 const renderInfo=()=>page.evaluate(()=>{try{const s=JSON.parse(document.querySelector('canvas')?.dataset.cityRenderStats||'null');return s&&{calls:s.calls,triangles:s.triangles};}catch{return null;}});

 // 1. A New York kit building, as it looks with kit tiles.
 await setDraft('nyc',preset);await open();await settle(2500);
 await page.keyboard.press('4');await page.getByRole('button',{name:'Windows',exact:true}).click();
 await page.getByRole('button',{name:'Front view'}).click();await settle(2800);await frame();
 const beforeShot=`output/city-studio-unified-before${suffix}.png`;await page.screenshot({path:beforeShot});
 const kitState=await resolved();assert.equal(kitState.faces,0,'kit tiles, no generated walls yet');const kitInfo=await renderInfo();

 // 2. Convert (Openings → Convert to editable facade): same look, every wall generated, undoable.
 await page.getByRole('button',{name:'Convert to editable facade'}).click();
 await until(async()=>(await saved()).sculpt.studio.facade==='unified','converted');
 await page.getByRole('status').filter({hasText:'Updated to unified facades'}).first().waitFor({timeout:5000});
 const unified=await resolved();assert.deepEqual(unified.inactive,[],'nothing inactive after conversion');assert.equal(unified.faces,4);assert.ok(unified.kit>=80,`${unified.kit} kit pieces`);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await until(async()=>(await saved()).sculpt.studio.facade===undefined,'undo restores kit tiles');
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await until(async()=>(await saved()).sculpt.studio.facade==='unified','redo converts again');
 // Same camera for the comparison: reopen the saved (converted) plot and repeat the steps of the before shot.
 // (After a large commit the known eye-level frame from docs/city-studio-game-ux.md can persist in this session.)
 await open();await settle(2500);await page.keyboard.press('4');await page.getByRole('button',{name:'Windows',exact:true}).click();
 await page.getByRole('button',{name:'Front view'}).click();await settle(2800);await frame();
 const afterShot=`output/city-studio-unified-after${suffix}.png`;await page.screenshot({path:afterShot});const unifiedInfo=await renderInfo();
 const diff=await imageDiff(beforeShot,afterShot);
 console.log(`Parity (${backend}): ${(diff.changed*100).toFixed(2)}% pixels differ by >40, mean ${diff.mean.toFixed(2)}/255; resolve ${kitState.ms.toFixed(0)} ms kit → ${unified.ms.toFixed(0)} ms unified; ${unified.faces} generated walls, ${unified.triangles} wall triangles, ${unified.kit} kit pieces${kitInfo&&unifiedInfo?`; whole scene ${kitInfo.calls}→${unifiedInfo.calls} draw calls, ${kitInfo.triangles}→${unifiedInfo.triangles} triangles`:''}`);
 assert.ok(diff.changed<.06,`converted look stays close (${(diff.changed*100).toFixed(2)}% changed)`);

 // 3. Behind ?cityFacade=unified a kit building converts silently when the studio opens (undo keeps the tiles).
 // The notice is brief: record it from page load on.
 await page.addInitScript(()=>{new MutationObserver(()=>{if(document.body?.textContent?.includes('Updated to unified facades'))window.__unifiedNotice=true;}).observe(document,{subtree:true,childList:true,characterData:true});});
 await setDraft('nyc',1);await open('&cityFacade=unified');await settle();
 await until(async()=>(await saved()).sculpt.studio.facade==='unified','silent conversion');
 assert.ok(await page.evaluate(()=>!!window.__unifiedNotice),'the silent conversion is labelled');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await until(async()=>(await saved()).sculpt.studio.facade===undefined,'undo the silent conversion');
 await page.waitForTimeout(1200);assert.equal((await saved()).sculpt.studio.facade,undefined,'not converted again after undo');

 // 4. A unified rhythm building: place a kit window from the Windows tray on a rhythm wall.
 await setDraft('rhythm',0);await open();await settle(2500);
 await page.getByRole('button',{name:'Orbit view',exact:true}).click();await settle();
 await page.keyboard.press('4');await page.getByRole('button',{name:'Windows',exact:true}).click();
 await page.getByRole('button',{name:'Shuttered',exact:true}).click();
 await until(async()=>(await state()).tool==='free-opening','free kit tool');
 const bayOnScreen=async floor=>{for(const b of (await state()).bays.filter(b=>b.floor===floor&&b.x>200&&b.x<1400&&b.y>120&&b.y<650)){await page.mouse.move(b.x,b.y);await page.waitForTimeout(170);const st=await state();if(st.freeGhost)return b;}return null;};
 const spot=await bayOnScreen(2);assert.ok(spot,'a wall to place on (ghost shown)');
 await page.mouse.click(spot.x,spot.y);
 await until(async()=>((await saved()).sculpt.studio.freeOpenings??[]).some(o=>o.module==='window-shuttered'),'kit window placed');
 const placed=(await saved()).sculpt.studio.freeOpenings.find(o=>o.module==='window-shuttered');
 const around=await page.evaluate(async id=>{
  const {expandFacadeRhythm}=await import('/src/domain/cityStudioFacadeRhythm.ts'),{studioBays}=await import('/src/domain/cityStudio.ts'),{resolveSculpt}=await import('/src/domain/citySculpt.ts');
  const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),draft=JSON.parse(localStorage.getItem(k)).plots.find(p=>p.purchaseId==='unified-facade-browser').draft,r=draft.sculpt,d=draft.design,o=r.studio.freeOpenings.find(x=>x.id===id);
  const gen=expandFacadeRhythm(r,d,studioBays(r,d)).freeOpenings.filter(g=>g.shapeId===o.shapeId&&g.side===o.side),s=resolveSculpt(r,d).studio,f=s.freeFaces.find(f=>f.id===`${o.shapeId}/${o.side}`);
  const L=f.length,x=o.u*L,clear=gen.every(g=>{const gx=g.u*L;return Math.abs(gx-x)>=(g.width+o.width)/2-.01||g.bottom>=o.bottom+o.height-.01||g.bottom+g.height<=o.bottom+.01;});
  return {generated:gen.length,clear,piece:s.pieces.some(p=>p.id===`free/${id}`),inactive:s.inactive};
 },placed.id);
 assert.ok(around.piece,'drawn as a kit piece');assert.ok(around.generated>0&&around.clear,'the rhythm fills around the kit window');assert.deepEqual(around.inactive,[]);
 await settle();await page.screenshot({path:`output/city-studio-unified-kit-window${suffix}.png`});

 // 5. A storefront stamp on the generated ground floor reserves its span; the rhythm fills around it.
 await page.getByRole('button',{name:'Storefronts',exact:true}).click();await page.getByRole('button',{name:/^Paint Café · 4 m$/}).click();
 await until(async()=>(await state()).tool==='opening','stamp tool');
 let stamped=false;for(const b of (await state()).bays.filter(b=>b.floor===0&&b.x>200&&b.x<1400&&b.y>150&&b.y<800)){await page.mouse.click(b.x,b.y);await page.waitForTimeout(900);if(((await saved()).sculpt.studio.stamps??[]).length){stamped=true;break;}}
 assert.ok(stamped,'a storefront stamp was placed');
 const stampState=await page.evaluate(async()=>{
  const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),draft=JSON.parse(localStorage.getItem(k)).plots.find(p=>p.purchaseId==='unified-facade-browser').draft,s=resolveSculpt(draft.sculpt,draft.design).studio;
  const id=draft.sculpt.studio.stamps[0].id;return {tiles:s.pieces.filter(p=>p.id.startsWith(`free/kit/stamp/${id}/`)).length,canopy:s.pieces.some(p=>p.id.startsWith(`stamp/${id}/`)),inactive:s.inactive};
 });
 assert.ok(stampState.tiles>=2&&stampState.canopy,'the storefront renders as kit pieces with its canopy');assert.deepEqual(stampState.inactive,[]);
 await page.keyboard.press('Escape');await settle();await page.screenshot({path:`output/city-studio-unified-stamp${suffix}.png`});
 assert.deepEqual(errors,[],'no page errors');
 console.log(`Unified facades (${backend}): converted, undo/redo, silent flag conversion, kit window on a rhythm wall (${around.generated} generated openings around it) and a storefront stamp passed.`);
}finally{await browser.close();}
