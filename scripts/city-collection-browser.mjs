import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const presets=JSON.parse(readFileSync('public/city/synarc-kit/v5/presets.json')),backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
mkdirSync('output/playwright',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],records=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5188'}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 await page.evaluate(async()=>{const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts');const {collectionPreset}=await import('/src/domain/cityCollectionPresets.ts');const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];plot.owner=LAND_OWNER;plot.purchaseId='collection-browser';plot.revision=1;plot.draft=collectionPreset(initialLandDraft(plot),0,plot.size);localStorage.setItem(key,JSON.stringify(world));});
 const open=async()=>{await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:90000});await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:90000});};
 await open();
 assert.equal(await page.evaluate(async()=>(await (await import('/src/features/city/CityStudioMeshes.tsx')).loadStudioKit(5)).size),141);
 for(const p of presets){
  await page.getByRole('button',{name:'Shape',exact:true}).click();await page.getByRole('button',{name:'Blender collection',exact:true}).click();
  await page.getByLabel('Building collection categories').getByRole('button',{name:p.group,exact:true}).click();
  await page.locator('.studio-collection-card').filter({has:page.getByText(p.name,{exact:true})}).click();await page.getByRole('button',{name:'Replace building',exact:true}).click();
  await page.waitForFunction(name=>document.querySelector('[aria-label="Building name"]')?.value===name,p.name);
  await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:60000});
  await page.getByRole('button',{name:'Orbit view',exact:true}).click();await page.waitForTimeout(300);
  const data=await page.locator('canvas').evaluate(c=>({bays:JSON.parse(c.dataset.cityStudio).bays.length,backend:c.dataset.cityBackend,kit:c.dataset.cityStudioKit}));assert.equal(data.kit,'ready');assert.ok(data.bays>0);records.push({name:p.name,...data});
  if(['garden-cottage','skybridge-towers','classical-museum','garden-cafe'].includes(p.id))await page.screenshot({path:`output/playwright/city-collection-${p.id}-${backend}.png`});
 }
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Building name"]')?.value==='Glass atrium campus');
 await page.getByRole('button',{name:'Redo',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Building name"]')?.value==='Faceted city tower');
 await page.getByRole('button',{name:'Openings',exact:true}).click();await page.getByRole('button',{name:'Cottage shutters',exact:true}).waitFor();
 await page.getByRole('button',{name:'Details',exact:true}).click();await page.getByRole('button',{name:'Civic dentil cornice',exact:true}).waitFor();
 await page.getByRole('button',{name:'Shape',exact:true}).click();await page.getByRole('button',{name:'Select',exact:true}).click();
 const wall=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStudio).bays.filter(b=>b.floor===2).sort((a,b)=>Math.abs(a.x-innerWidth/2)-Math.abs(b.x-innerWidth/2))[0]);
 await page.mouse.click(wall.x,wall.y);await page.getByRole('button',{name:'Roofs',exact:true}).click();await page.getByRole('button',{name:'Solar roof array',exact:true}).click();await page.getByRole('button',{name:'Front left',exact:true}).click();
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(k)).plots.some(p=>p.owner&&p.draft?.sculpt?.studio?.roofDetails?.some(d=>d.module==='collection-solar'))),null,{timeout:30000});
 await open();assert.equal(await page.getByLabel('Building name',{exact:true}).inputValue(),'Faceted city tower');
 await page.getByRole('button',{name:'Shape',exact:true}).click();await page.getByRole('button',{name:'Blender collection',exact:true}).click();
 await page.locator('.studio-collection').waitFor();
 assert.ok(await page.locator('.studio-collection').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'desktop gallery fits its panel');
 await page.screenshot({path:`output/playwright/city-collection-gallery-${backend}.png`});
 await page.setViewportSize({width:390,height:844});await page.getByLabel('Building collection categories').getByRole('button',{name:'Houses',exact:true}).click();
 const bounds=await page.locator('.studio-collection').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
 await page.locator('.studio-collection-card').filter({has:page.getByText('Garden cottage',{exact:true})}).click();await page.getByRole('button',{name:'Replace building',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Building name"]')?.value==='Garden cottage');
 assert.deepEqual(errors,[]);writeFileSync(`output/city-collection-browser-${backend}.json`,JSON.stringify({records,errors},null,2));console.log(`24 collection presets, categories, module loading, undo/redo and persistence passed (${backend}).`);
}finally{await browser.close();}
