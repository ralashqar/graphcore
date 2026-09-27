// Studio Isolate and empty-plot grounding (docs/city-studio-ui-v2.md "Isolate", docs/city-scene-lighting.md):
// 1. A studio plot surrounded by finished studio neighbours: the top-bar button and the O key toggle Isolate; with it
//    on, every neighbour drops to far chunks / kit proxies (no near overlays), the fade and plot-sized shadow frame
//    are published, the character pauses and the frame stats drop; off restores all of it; the choice is remembered;
//    Done restores the normal city. Screenshots output/isolate-on.png and output/isolate-off.png.
// 2. A newly bought (empty) plot: no ground contact mark, then one after drawing a block and none after removing it.
//    `?cityLowPower=1` opens it with Isolate on by default (no remembered choice). Screenshot output/empty-plot.png.
// Needs the Vite dev server (DEV telemetry): CITY_TEST_ORIGIN (default http://127.0.0.1:5173). CITY_BACKEND=webgl.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {rail,studioState,studioUrl,telemetryIs} from './city-studio-ui.mjs';
mkdirSync('output',{recursive:true});
const NEIGHBOURS=Number(process.env.CITY_ISOLATE_NEIGHBOURS??24);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/shader|WGSL|GPUValidation|GL_INVALID/i.test(m.text()))errors.push(m.text());});
const canvasData=key=>page.evaluate(k=>document.querySelector('canvas')?.dataset[k]??null,key);
const until=(fn,arg,timeout=20000)=>page.waitForFunction(fn,arg,{timeout});
const landKey=()=>page.evaluate(()=>Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')));
/** Mean render stats over ~1.5 s with frame times (the renderer publishes calls/triangles per frame). */
const sample=()=>page.evaluate(()=>new Promise(res=>{const stats=[],frames=[];let last=performance.now();const t0=last;const tick=t=>{frames.push(t-last);last=t;const s=document.querySelector('canvas')?.dataset.cityRenderStats;if(s)stats.push(JSON.parse(s));if(t-t0<3000)requestAnimationFrame(tick);else{const m=k=>Math.round(stats.reduce((n,s)=>n+(s[k]??0),0)/Math.max(1,stats.length));const f=frames.slice(2).sort((a,b)=>a-b);res({calls:m('calls'),triangles:m('triangles'),p50:+f[Math.floor(f.length*.5)]?.toFixed(1),p95:+f[Math.floor(f.length*.95)]?.toFixed(1)});}};requestAnimationFrame(tick);}));
const levels=()=>page.evaluate(()=>{const s=window.__cityGwStats??{};let city={};try{city=JSON.parse(document.querySelector('canvas').dataset.citySculptCity||'{}');}catch{/* none */}return {levels:JSON.parse(s.levels||'{}'),near:city.near??0,overlays:city.overlays??0,ready:city.ready??0};});
/** Draw calls and triangles unchanged for three one-second samples (shader warm-up and uploads are done). */
const settle=async(limit=90000)=>{const t0=Date.now();let last='',stable=0;while(Date.now()-t0<limit&&stable<3){await page.waitForTimeout(1000);const s=await canvasData('cityRenderStats')??'';const t=JSON.parse(s||'{}'),l=JSON.parse(last||'{}');if(t.calls&&t.calls===l.calls&&t.triangles===l.triangles)stable++;else stable=0;last=s;}};
/** The character's mixer advances (it may stall for a moment while shaders compile). */
const animating=async message=>{const t=await canvasData('cityCharacterTime');await until(t=>document.querySelector('canvas').dataset.cityCharacterTime!==t,t,15000).catch(()=>assert.fail(message));};
const isolateButton=()=>page.getByRole('button',{name:'Isolate building',exact:true});
const pressed=async()=>await isolateButton().getAttribute('aria-pressed')==='true';
try{
 await page.goto(studioUrl());
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 // Seed: plot 0 is the edited building; its nearest neighbours are finished studio buildings.
 const seeded=await page.evaluate(async count=>{
  const {initialLandDraft,LAND_OWNER,landPosition,createLandWorld}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts'),{newFacadeRhythm}=await import('/src/domain/cityStudioFacadeRhythm.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key));
  for(const k of Object.keys(localStorage))if(k.startsWith('city-land-v1-')&&k!==key)localStorage.removeItem(k);
  localStorage.removeItem('city-studio-isolate-v1');
  world.plots=createLandWorld(world.occupied,world.capacity,world.size).plots;
  const STYLES=['townhouse','shopfront','civic','loft'];
  const build=(plot,i)=>{const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;Object.assign(r.studio,{openings:[],assemblies:[],surfaces:[],stamps:undefined,variation:undefined,freeOpenings:undefined,freeTrims:undefined,roofOpenings:undefined,roofDetails:undefined,paintRegions:undefined,parts:{}});
   r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:13,depth:9,startFloor:0,spanFloors:3+i%3}];r.studio.facadeRhythm=newFacadeRhythm(STYLES[i%4],i);const d=studioDraft(draft,r);d.design.floors=3+i%3;return d;};
  const o=landPosition(world.plots[0]),near=[...world.plots].sort((a,b)=>{const p=landPosition(a),q=landPosition(b);return Math.hypot(p.x-o.x,p.z-o.z)-Math.hypot(q.x-o.x,q.z-o.z);});
  for(const [i,plot] of near.slice(0,count+1).entries()){const d=build(plot,i);d.name=`Iso ${i}`;plot.owner=LAND_OWNER;plot.purchaseId=`iso-${i}`;plot.revision=1;plot.finished=d;plot.draft=i===0?structuredClone(d):null;}
  localStorage.setItem(key,JSON.stringify(world));return {id:world.plots[0].id,count};
 },NEIGHBOURS);
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:90000});
 await until(()=>!document.querySelector('.studio-preparing'),null,90000);
 // Neighbours prepared and in their distance levels.
 await until(n=>{try{return JSON.parse(document.querySelector('canvas').dataset.citySculptCity||'{}').ready>=n;}catch{return false;}},seeded.count,180000);
 await page.getByRole('button',{name:'Orbit view',exact:true}).click();await page.waitForTimeout(800);
 for(let i=0;i<3;i++){await page.mouse.move(720,300);await page.mouse.wheel(0,400);await page.waitForTimeout(900);}await page.mouse.move(720,120);
 await page.waitForTimeout(4000);
 // Off by default on the desktop path; the key is not stored yet.
 assert.equal(await pressed(),false,'Isolate starts off on the normal path');
 assert.equal(await canvasData('cityIsolate'),null);
 await settle();
 const offLevels=await levels();await animating('the character animates when off');
 assert.ok(Object.keys(offLevels.levels).some(l=>l!=='proxy'&&l!=='hidden')||offLevels.near>0,`neighbours near/full when off (${JSON.stringify(offLevels)})`);
 const off=await sample();await page.screenshot({path:'output/isolate-off.png'});
 // Button on.
 await isolateButton().click();await until(()=>document.querySelector('[aria-label="Isolate building"]')?.getAttribute('aria-pressed')==='true');
 await until(()=>!!document.querySelector('canvas').dataset.cityIsolate);
 const iso=JSON.parse(await canvasData('cityIsolate'));assert.equal(iso.plot,seeded.id);assert.ok(iso.fade.inner>=40&&iso.shadowRadius<100,JSON.stringify(iso));
 await until(()=>{const l=JSON.parse(window.__cityGwStats?.levels||'{}');return Object.keys(l).every(k=>k==='proxy'||k==='hidden')&&(l.proxy??0)>0;});
 await until(()=>JSON.parse(document.querySelector('canvas').dataset.citySculptCity||'{}').overlays===0);
 await settle();
 const onLevels=await levels(),paused0=await canvasData('cityCharacterTime');await page.waitForTimeout(1500);const paused1=await canvasData('cityCharacterTime');
 assert.equal(paused0,paused1,'the character pauses');
 const on=await sample();await page.screenshot({path:'output/isolate-on.png'});
 assert.ok(on.calls<off.calls&&on.triangles<off.triangles,`cheaper with Isolate (off ${JSON.stringify(off)}, on ${JSON.stringify(on)})`);
 assert.equal(await page.evaluate(()=>localStorage.getItem('city-studio-isolate-v1')),'1','remembered on this device');
 // Hotkey off: restores levels, overlays and the character on the same canvas (no remount).
 const canvasId=await page.evaluate(()=>{const c=document.querySelector('canvas');c.dataset.isolateProbe='same';return c.dataset.cityBackend;});
 await page.mouse.move(720,120);await page.keyboard.press('o');await until(()=>document.querySelector('[aria-label="Isolate building"]')?.getAttribute('aria-pressed')==='false');
 await until(()=>!document.querySelector('canvas').dataset.cityIsolate);
 await until(()=>{const l=JSON.parse(window.__cityGwStats?.levels||'{}');return Object.keys(l).some(k=>k!=='proxy'&&k!=='hidden');});
 assert.equal(await canvasData('isolateProbe'),'same','the canvas was not remounted');
 await animating('the character resumes');
 assert.equal(await page.evaluate(()=>localStorage.getItem('city-studio-isolate-v1')),'0');
 // Hotkey on again, then Done restores the normal city.
 await page.keyboard.press('o');await until(()=>!!document.querySelector('canvas').dataset.cityIsolate);
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({state:'detached',timeout:30000});
 await until(()=>!document.querySelector('canvas').dataset.cityIsolate);
 // The on-foot camera: plots in view return to their distance levels and near overlays mount again.
 await until(()=>{const l=JSON.parse(window.__cityGwStats?.levels||'{}'),c=JSON.parse(document.querySelector('canvas').dataset.citySculptCity||'{}');return c.near>0||Object.keys(l).some(k=>k!=='proxy'&&k!=='hidden');},null,30000);
 console.log('isolate',JSON.stringify({off,on,offLevels,onLevels,iso,backend:canvasId}));

 // 2. Empty plot: a newly bought plot (owned, no draft) opens empty; Isolate defaults on for the low-power path.
 await page.evaluate(async()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key));const p=world.plots[0];p.draft=null;p.finished=null;p.revision++;localStorage.setItem(key,JSON.stringify(world));localStorage.removeItem('city-studio-isolate-v1');});
 await page.goto(studioUrl('&cityLowPower=1'));
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:90000});
 await until(()=>!document.querySelector('.studio-preparing'),null,60000);
 assert.equal(await pressed(),true,'Isolate defaults on for the low-power path');
 await isolateButton().click();await until(()=>!document.querySelector('canvas').dataset.cityIsolate);
 const plotId=seeded.id;
 await until(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft?.sculpt?.volumes.length===0;});
 await page.getByRole('button',{name:'Orbit view',exact:true}).click();await page.waitForTimeout(1500);
 await until(id=>window.__cityGrounding&&id in window.__cityGrounding,plotId);
 assert.equal(await page.evaluate(id=>window.__cityGrounding[id],plotId),0,'an empty plot has no ground contact');
 await page.screenshot({path:'output/empty-plot.png'});
 // Draw a block: grounding appears; remove it: grounding goes.
 await rail(page,'Build');await page.getByRole('button',{name:'Box',exact:true}).click();await telemetryIs(page,'tool','block');
 const g=(await studioState(page)).ground,a=g.frontLeft,b=g.back;
 await page.mouse.move(a.x+(b.x-a.x)*.15,a.y+(b.y-a.y)*.15);await page.mouse.down();for(let i=1;i<=10;i++){await page.mouse.move(a.x+(b.x-a.x)*(.15+i*.05)+i*8,a.y+(b.y-a.y)*(.15+i*.05));await page.waitForTimeout(30);}await page.mouse.up();
 await until(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.volumes.length===1;});
 await until(id=>window.__cityGrounding?.[id]===1,plotId);
 await page.waitForTimeout(800);await page.screenshot({path:'output/empty-plot-block.png'});
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await until(id=>window.__cityGrounding?.[id]===0,plotId);
 await until(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.volumes.length===0;});
 // The city view of the finished empty plot draws no contact mark either (CitySculptCity grounds).
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({state:'detached',timeout:30000});
 await until(id=>window.__cityGrounding?.[id]===0,plotId,30000);

 const own=errors.filter(e=>!/favicon|ResizeObserver/.test(e));
 assert.deepEqual(own,[]);
 console.log('PASS isolate button/hotkey/levels/stats/pause/restore/Done, low-power default, empty-plot grounding');
}catch(e){await page.screenshot({path:'output/isolate-failure.png'}).catch(()=>{});throw e;}finally{await browser.close();}
