// Tokyo pack in the construction studio (docs/city-tokyo-kit.md): every Tokyo starting idea opens on native WebGPU
// with the pack loaded and no page errors; screenshots from street level, front and orbit, plus a thumbnail sheet.
//   CITY_TEST_ORIGIN=http://localhost:5180 node scripts/city-tokyo-kit-browser.mjs   (CITY_BACKEND=webgl: WebGL2)
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180',backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native';
const suffix=backend==='webgl'?'-webgl':'';
const manifest=JSON.parse(readFileSync('public/city/tokyo-kit/v1/manifest.json','utf8'));
mkdirSync('output',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:120000});
 const settle=(ms=1600)=>page.waitForTimeout(ms);
 const place=index=>page.evaluate(async index=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts');const {tokyoPreset}=await import('/src/domain/cityTokyoPresets.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='tokyo-browser';plot.revision=1;plot.draft=tokyoPreset(initialLandDraft(plot),index,plot.size);localStorage.setItem(key,JSON.stringify(world));
  return plot.draft.name;
 },index);
 const open=async()=>{
  await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
  await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:120000});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:120000});
  await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:120000});
  // Dismiss onboarding or tips if the studio shows any.
  for(const name of ['Skip','Close','Got it'])if(await page.getByRole('button',{name,exact:true}).isVisible().catch(()=>false))await page.getByRole('button',{name,exact:true}).click().catch(()=>{});
 };
 const view=async name=>{await page.getByRole('button',{name,exact:true}).click();await settle(2400);await page.mouse.move(700,480);await settle(400);};
 const records=[];
 const presets=await page.evaluate(async()=>(await import('/src/domain/cityTokyoPresets.ts')).TOKYO_PRESETS.map(p=>({id:p.id,name:p.name})));
 for(const [index,preset] of presets.entries()){
  const name=await place(index);assert.equal(name,preset.name);await open();
  const kit=await page.evaluate(async()=>{const pack=await (await import('/src/features/city/CityStudioMeshes.tsx')).loadStudioKit(5);return [...pack.keys()];});
  assert.equal(kit.length,141+manifest.parts.length,'kit v5 plus the Tokyo pack');for(const p of manifest.parts)assert.ok(kit.includes(p.id),p.id);
  const data=await page.evaluate(()=>{const canvas=document.querySelector('canvas');return {backend:canvas.dataset.cityBackend,stats:canvas.dataset.cityRenderStats,state:JSON.parse(canvas.dataset.cityStudio??'{}')};});
  if(backend==='native')assert.notEqual(data.backend,'webgl','native WebGPU run');
  const saved=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(key)).plots.find(p=>p.owner).draft;});
  assert.equal(saved.name,preset.name);assert.equal(saved.sculpt.studio.facadeRhythm.style,'tokyo');
  const shots=[],short=preset.id.replace(/^tokyo-/,'');
  await view('Orbit view');await page.screenshot({path:`output/tokyo-${short}-orbit${suffix}.png`});shots.push('orbit');
  {
   await view('Front view');await page.screenshot({path:`output/tokyo-${short}-front${suffix}.png`});shots.push('front');
   // Street level: from the front view, orbit down to eye height (right drag), pan the target down (middle drag), zoom in.
   await page.keyboard.press('Escape');
   const drag=async button=>{await page.mouse.move(720,300);await page.mouse.down({button});await page.mouse.move(720,120,{steps:15});await page.mouse.up({button});await settle(500);};
   await drag('right');await drag('middle');for(let i=0;i<4;i++){await page.mouse.wheel(0,-250);await settle(200);}await settle(1500);
   await page.screenshot({path:`output/tokyo-${short}-street${suffix}.png`});shots.push('street');
  }
  records.push({preset:preset.id,name:preset.name,backend:data.backend,stats:data.stats,bays:data.state.bays?.length,shots});
 }
 // Close-up thumbnail sheet of every module (the studio's tray thumbnails, with triangle counts).
 const sheet=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const cells=manifest.parts.map(p=>`<figure><img src="${origin}/city/synarc-kit/v5/thumbnails/${p.id}.png"><figcaption><b>${p.label}</b><span>${p.id} · ${p.category} · ${p.triangles} tris</span></figcaption></figure>`).join('');
 await sheet.setContent(`<!doctype html><html><head><style>body{margin:16px;background:#ecebe6;font:12px system-ui,sans-serif;color:#222}h1{font-size:16px;margin:0 0 10px}main{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}figure{margin:0;background:#fff;border-radius:6px;padding:6px;text-align:center}img{width:150px;height:150px;image-rendering:auto}figcaption{display:flex;flex-direction:column;gap:2px}span{color:#666;font-size:10px}</style></head><body><h1>Tokyo pack · ${manifest.parts.length} modules · ${manifest.parts.reduce((n,p)=>n+p.triangles,0)} triangles</h1><main>${cells}</main></body></html>`);
 await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:30000});
 await sheet.screenshot({path:'output/tokyo-kit-thumbnails.png',fullPage:true});
 assert.deepEqual(errors,[]);
 writeFileSync(`output/tokyo-kit-browser${suffix}.json`,JSON.stringify({records,errors},null,2));
 console.log(`Tokyo pack: ${records.length} starting ideas on ${records.map(r=>r.backend).join(', ')}, no page errors; screenshots in output/tokyo-*.png.`);
}finally{await browser.close();}
