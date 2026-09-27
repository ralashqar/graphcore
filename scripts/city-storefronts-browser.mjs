// Storefront pack in the construction studio (docs/city-storefront-kit.md): every storefront street idea opens on
// native WebGPU with the pack loaded on demand and no page errors; street-level screenshots per style, plus a
// labelled thumbnail sheet of every module.
//   CITY_TEST_ORIGIN=http://localhost:5180 node scripts/city-storefronts-browser.mjs   (CITY_BACKEND=webgl: WebGL2)
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180',backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native';
const suffix=backend==='webgl'?'-webgl':'';
const manifest=JSON.parse(readFileSync('public/city/storefront-kit/v1/manifest.json','utf8'));
const tokyo=JSON.parse(readFileSync('public/city/tokyo-kit/v1/manifest.json','utf8'));
mkdirSync('output',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().includes('/storefront-kit/')&&r.url().includes('.glb'))requests.push(r.url().replace(origin,''));});
 await page.goto(`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:120000});
 await page.waitForTimeout(3000);
 // Lazy pack: a city without storefront pieces never fetches it.
 const before=[...requests];assert.deepEqual(before,[],'no storefront kit.glb before a building uses it (the catalogue JSON is part of the app)');
 const settle=(ms=1600)=>page.waitForTimeout(ms);
 const place=index=>page.evaluate(async index=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts');const {storefrontPreset}=await import('/src/domain/cityStorefrontPresets.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='storefront-browser';plot.revision=1;plot.draft=storefrontPreset(initialLandDraft(plot),index,plot.size);localStorage.setItem(key,JSON.stringify(world));
  return plot.draft.name;
 },index);
 const open=async()=>{
  await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
  await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:120000});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:120000});
  await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:120000});
  for(const name of ['Skip','Close','Got it'])if(await page.getByRole('button',{name,exact:true}).isVisible().catch(()=>false))await page.getByRole('button',{name,exact:true}).click().catch(()=>{});
 };
 const view=async name=>{await page.getByRole('button',{name,exact:true}).click();await settle(2400);await page.mouse.move(700,480);await settle(400);};
 const drag=async(button,dx,dy)=>{await page.mouse.move(720,300);await page.mouse.down({button});await page.mouse.move(720+dx,300+dy,{steps:15});await page.mouse.up({button});await settle(500);};
 const records=[];
 const presets=await page.evaluate(async()=>(await import('/src/domain/cityStorefrontPresets.ts')).STOREFRONT_PRESETS.map(p=>({id:p.id,name:p.name,style:p.style})));
 for(const [index,preset] of presets.entries()){
  const name=await place(index);assert.equal(name,preset.name);await open();
  // Wait for the storefront pack: the studio draws the building with it once loaded.
  const kit=await page.evaluate(async()=>{const m=await import('/src/features/city/CityStudioMeshes.tsx');const [plain,full]=await Promise.all([m.loadStudioKit(5),m.loadStudioKit(5,'full',true)]);return {plain:plain.size,full:[...full.keys()]};});
  assert.equal(kit.plain,141+tokyo.parts.length,'kit v5 plus the Tokyo pack, without the storefront pack');
  assert.equal(kit.full.length,141+tokyo.parts.length+manifest.parts.length,'kit v5 plus both packs');for(const p of manifest.parts)assert.ok(kit.full.includes(p.id),p.id);
  await settle(2500);
  const data=await page.evaluate(()=>{const canvas=document.querySelector('canvas');return {backend:canvas.dataset.cityBackend,stats:canvas.dataset.cityRenderStats,state:JSON.parse(canvas.dataset.cityStudio??'{}')};});
  if(backend==='native')assert.notEqual(data.backend,'webgl','native WebGPU run');
  const saved=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(key)).plots.find(p=>p.owner).draft;});
  assert.equal(saved.name,preset.name);assert.ok(saved.sculpt.studio.stamps.length>=4);
  const short=preset.id.replace(/^sf-/,''),shots=[];
  await view('Front view');await page.screenshot({path:`output/storefronts-${short}-front${suffix}.png`});shots.push('front');
  // Street level: from the front view, orbit down to eye height (right drag), pan down (middle drag), zoom in.
  await page.keyboard.press('Escape');
  await drag('right',0,-180);await drag('middle',0,-180);for(let i=0;i<5;i++){await page.mouse.wheel(0,-250);await settle(200);}await settle(1800);
  await page.screenshot({path:`output/storefronts-${short}${suffix}.png`});shots.push('street');
  // Down the pavement: turn along the facade.
  await drag('right',120,0);await page.mouse.wheel(0,250);await settle(1500);
  await page.screenshot({path:`output/storefronts-${short}-along${suffix}.png`});shots.push('along');
  records.push({preset:preset.id,name:preset.name,style:preset.style,backend:data.backend,stats:data.stats,shots});
 }
 assert.ok(requests.some(u=>u.endsWith('/storefront-kit/v1/kit.glb')),'the pack loaded once a storefront building opened');
 // Labelled thumbnail sheet of every module (the studio's tray thumbnails, with triangle counts).
 const sheet=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const group=(title,parts)=>`<h2>${title} · ${parts.length}</h2><main>${parts.map(p=>`<figure><img src="${origin}/city/synarc-kit/v5/thumbnails/${p.id}.png"><figcaption><b>${p.label}</b><span>${p.id}</span><span>${p.style} · ${p.triangles} tris${p.doorSafe?' · door-side':''}</span></figcaption></figure>`).join('')}</main>`;
 const parts=manifest.parts,sections=parts.filter(p=>p.category!=='trim'),overhead=parts.filter(p=>p.category==='trim'&&!p.mount),street=parts.filter(p=>p.mount);
 await sheet.setContent(`<!doctype html><html><head><style>body{margin:16px;background:#ecebe6;font:12px system-ui,sans-serif;color:#222}h1{font-size:17px;margin:0 0 6px}h2{font-size:14px;margin:14px 0 6px}main{display:grid;grid-template-columns:repeat(10,1fr);gap:7px}figure{margin:0;background:#fff;border-radius:6px;padding:5px;text-align:center}img{width:140px;height:140px}figcaption{display:flex;flex-direction:column;gap:1px}span{color:#666;font-size:9.5px}</style></head><body><h1>Storefront pack · ${parts.length} modules · ${parts.reduce((n,p)=>n+p.triangles,0)} triangles</h1>${group('Shopfront sections',sections)}${group('Awnings, fascias and signs',overhead)}${group('Street objects',street)}</body></html>`);
 await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:30000});
 await sheet.screenshot({path:'output/storefronts-thumbnails.png',fullPage:true});
 assert.deepEqual(errors,[]);
 writeFileSync(`output/storefronts-browser${suffix}.json`,JSON.stringify({records,requests,errors},null,2));
 console.log(`Storefront pack: ${records.length} street ideas on ${records.map(r=>r.backend).join(', ')}, pack requests ${requests.length}, no page errors; screenshots in output/storefronts-*.png.`);
}finally{await browser.close();}
