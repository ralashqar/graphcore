import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5188'}/city?demo=1${process.env.CITY_BACKEND==='webgl'?'&cityBackend=webgl':''}`);
 const kitLoad=await page.evaluate(async()=>{
  try{const {loadSynarcKit}=await import('/src/features/city/CitySynarcKit.ts');return {parts:(await loadSynarcKit()).size};}
  catch(error){return {error:String(error),stack:error?.stack};}
 });
 console.log('direct kit load',kitLoad);
 assert.equal(kitLoad.parts,93,kitLoad.error);
 await page.waitForFunction(()=>localStorage.getItem('city-land-v1-48-400'),null,{timeout:60000});
 await page.evaluate(async()=>{
  const {createLandWorld}=await import('/src/domain/cityLand.ts');
  const old=JSON.parse(localStorage.getItem('city-land-v1-48-400'));
  localStorage.setItem(old.id,JSON.stringify(createLandWorld(old.occupied.filter(p=>!(p.x===1&&p.z===1)),400,48)));
 });
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.cityExploration||'{}').character==='ready',null,{timeout:120000});
 await page.keyboard.press('e');await page.getByRole('region',{name:'Walking controls'}).waitFor();
 await page.keyboard.down('s');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityExploration).foot.z<9.3,null,{timeout:60000});await page.keyboard.up('s');
 await page.keyboard.down('a');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityExploration).foot.x>32,null,{timeout:60000});await page.keyboard.up('a');
 await page.getByRole('button',{name:'View plot · $5',exact:true}).waitFor({timeout:10000});await page.keyboard.press('e');
 await page.getByRole('button',{name:/Buy land/}).click();await page.getByRole('button',{name:'Save & Finish',exact:true}).waitFor({timeout:60000});
 await page.getByRole('button',{name:'Tiles',exact:true}).click();
 await page.getByLabel('Use original low-poly kit').click();
 await page.waitForTimeout(700);
 console.log('kit toggle',await page.getByLabel('Use original low-poly kit').isChecked(),await page.evaluate(()=>JSON.parse(localStorage.getItem('city-land-v1-48-400')).plots.find(p=>p.x===1&&p.z===1).draft?.design?.synarcKit),errors);
 await page.getByRole('button',{name:'Painted townhouse',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('button[aria-label="Painted townhouse"]')?.getAttribute('aria-pressed')==='true');
 await page.getByLabel('Tile kit windows').selectOption('window-detailed');
 await page.waitForFunction(()=>{
  const saved=JSON.parse(localStorage.getItem('city-land-v1-48-400')).plots.find(p=>p.x===1&&p.z===1).draft?.design?.synarcKit;
  return saved?.style==='painted-townhouse'&&saved.window==='window-detailed';
 },null,{timeout:20000});
 await page.getByLabel('Tile wall bay').waitFor();
 const bayOptions=await page.getByLabel('Tile wall bay').locator('option').allTextContents();
 const bayIndex=bayOptions.findIndex((text,index)=>index>0&&text.includes('bay'));
 assert.ok(bayIndex>0,'a paintable wall bay should be available');
 await page.getByLabel('Tile wall bay').selectOption({index:bayIndex});
 await page.getByRole('button',{name:'Paint window detailed',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('city-land-v1-48-400')).plots.find(p=>p.x===1&&p.z===1).draft?.design?.synarcKit?.paints?.length===1,null,{timeout:20000});
 await page.screenshot({path:'output/playwright/city-tile-paint-tab.png'});
 await page.getByRole('button',{name:'Building',exact:true}).click();
 await page.getByRole('button',{name:'Sculpt',exact:true}).click();
 await page.waitForTimeout(6000);
 console.log('sculpt status',await page.evaluate(()=>({kit:document.querySelector('canvas')?.dataset.citySynarcKit,
  prepared:document.querySelector('canvas')?.dataset.cityPreparedBuildings,
  preview:document.querySelector('.city-land-preview-status')?.textContent,
  sculpt:JSON.parse(localStorage.getItem('city-land-v1-48-400')).plots.find(p=>p.x===1&&p.z===1).draft?.sculpt?.version})),errors);
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.citySynarcKit==='ready',null,{timeout:90000});
 console.log('renderer',await page.locator('canvas').getAttribute('data-city-backend'));
 await page.getByRole('button',{name:'Paint tile',exact:true}).waitFor();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('city-land-v1-48-400')).plots.find(p=>p.x===1&&p.z===1).draft.design.synarcKit);
 assert.equal(saved.style,'painted-townhouse');assert.equal(saved.window,'window-detailed');assert.equal(saved.paints.length,1);
 await page.screenshot({path:'output/playwright/city-synarc-kit-construction.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS original tile kit loads through GLB, appears in the Tiles tab, paints a bay, and saves style/window choices');
}finally{await browser.close();}
