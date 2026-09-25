import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
mkdirSync('output/playwright',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 let failKit=process.env.CITY_FAIL_KIT==='1';
 if(failKit)await page.route('**/synarc-kit/v4/kit.glb',r=>r.fulfill({status:503,body:'Asset recovery test'}));
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://localhost:5173'}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 await page.evaluate(async()=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts');const {nycPreset}=await import('/src/domain/cityNycPresets.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='nyc-browser';plot.revision=1;plot.draft=nycPreset(initialLandDraft(plot),3,plot.size);localStorage.setItem(key,JSON.stringify(world));
 });
 const open=async()=>{await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:90000});if(failKit){await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='fallback',null,{timeout:90000});await page.unroute('**/synarc-kit/v4/kit.glb');await page.evaluate(()=>window.dispatchEvent(new Event('online')));failKit=false;}await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:90000});};
 await open();
 const keys=await page.evaluate(async()=>[...(await (await import('/src/features/city/CityStudioMeshes.tsx')).loadStudioKit(4)).keys()]);
 assert.equal(keys.length,105);assert.ok(keys.includes('wall-nyc-garage'));
 await page.getByRole('button',{name:'Front view',exact:true}).click();
 await page.screenshot({path:`output/playwright/city-nyc-garage-${backend}.png`});
 await page.getByRole('button',{name:'Facade',exact:true}).click();await page.getByRole('button',{name:'Doors & windows',exact:true}).click();await page.getByRole('button',{name:'Walls',exact:true}).click();await page.getByRole('button',{name:'Wide roller shutter · closed',exact:true}).waitFor();
 const garage=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStudio).bays.find(b=>b.module==='wall-nyc-garage'));
 await page.getByRole('button',{name:'Erase',exact:true}).click();await page.mouse.click(garage.x,garage.y);
 await page.waitForFunction(()=>!JSON.parse(document.querySelector('canvas').dataset.cityStudio).bays.some(b=>b.module==='wall-nyc-garage'));
 await page.getByRole('button',{name:'Wide roller shutter · closed',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.studio-openings .studio-tile')].some(button=>button.getAttribute('aria-label')==='Wide roller shutter · closed'&&button.getAttribute('aria-pressed')==='true'),null,{timeout:10000});
 const raw=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStudio).bays.filter(b=>b.floor===0&&b.side==='north').sort((a,b)=>Number(a.id.split('/').at(-1))-Number(b.id.split('/').at(-1)))[1]);
 await page.mouse.click(raw.x,raw.y);await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).bays.some(b=>b.module==='wall-nyc-garage'),null,{timeout:30000});
 await page.getByRole('button',{name:'Extras',exact:true}).click();await page.getByRole('button',{name:'Stone belt course',exact:true}).waitFor();
 const records=[];
 for(const name of ['Corner deli','Neighborhood café','SoHo cast-iron loft','Garage workshop loft','Balcony apartments','Ornate commercial corner']){
  await page.getByRole('button',{name:'Structure',exact:true}).click();await page.getByRole('button',{name:'Starting ideas',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();await page.getByRole('button',{name:'Replace building',exact:true}).click();
  await page.waitForFunction(name=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(k)).plots.some(p=>p.owner&&p.draft?.name===name)),name,{timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:60000});
  await page.getByRole('button',{name:'Orbit view',exact:true}).click();await page.waitForTimeout(900);
  const data=await page.evaluate(()=>{const canvas=document.querySelector('canvas');return {state:JSON.parse(canvas.dataset.cityStudio),backend:canvas.dataset.cityBackend,stats:canvas.dataset.cityRenderStats};});
  assert.ok(data.state.bays.some(b=>b.module.includes('nyc')));records.push({name,...data});
  await page.screenshot({path:`output/playwright/city-nyc-${name.split(' ')[0].toLowerCase()}-${backend}.png`});
 }
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByLabel('Building name',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="Building name"]')?.value==='Balcony apartments');
 await page.getByRole('button',{name:'Redo',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Building name"]')?.value==='Ornate commercial corner');
 await page.getByRole('button',{name:'Select',exact:true}).click();
 const wall=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStudio).bays.find(b=>b.floor===3&&b.side==='north'));
 await page.mouse.click(wall.x,wall.y);await page.getByRole('button',{name:'Roof',exact:true}).click();await page.getByRole('button',{name:'Roof exhaust vent',exact:true}).click();await page.getByRole('button',{name:'Front left',exact:true}).click();
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(k)).plots.some(p=>p.owner&&p.draft?.sculpt?.studio?.roofDetails?.some(d=>d.module==='nyc-vent'))),null,{timeout:30000});
 await page.getByRole('button',{name:'Inside',exact:true}).click();await page.getByRole('button',{name:'Add interiors',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing')&&Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(k)).plots.some(p=>p.owner&&p.draft?.sculpt?.version===6)),null,{timeout:60000});
 await page.getByRole('button',{name:'Walk around',exact:true}).click();await page.getByRole('button',{name:'Return to building E'}).click();
 await open();
 const saved=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(key)).plots.find(p=>p.owner).draft;});
 assert.equal(saved.sculpt.version,6);assert.equal(saved.sculpt.studio.catalogue,'synarc-kit-4');assert.equal(saved.name,'Ornate commercial corner');
 assert.deepEqual(errors,[]);writeFileSync(`output/city-nyc-browser-${backend}.json`,JSON.stringify({records,errors},null,2));console.log(`Six NYC presets, catalog, interior conversion, walkthrough and persistence passed (${backend}).`);
}finally{await browser.close();}
