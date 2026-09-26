// Click-to-place roof details: choose a detail, see a ghost on the flat roof, click to place, R to turn.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5173'}/city?demo=1&cityStudio=1&cityStudioTest=1${process.env.CITY_BACKEND==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:60000});
 await page.evaluate(async()=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='roof-details-browser';plot.revision=1;
  const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
  r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:10,startFloor:0,spanFloors:2}];
  Object.assign(r.studio,{catalogue:'synarc-kit-5',assemblyRevision:'connected-access-1',openings:[],assemblies:[],roofDetails:[],stamps:undefined,variation:undefined});r.studio.defaults.roof='flat';r.studio.parts={};
  plot.draft=studioDraft(draft,r);localStorage.setItem(key,JSON.stringify(world));
 });
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 const state=()=>page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStudio||'{}'));
 const details=()=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.roofDetails??[];});
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000});
 await page.keyboard.press('2');await page.getByRole('button',{name:'Top view',exact:true}).click();await page.waitForTimeout(600);
 const tray=page.getByRole('group',{name:'Roof details'}).or(page.locator('[aria-label="Roof details"]'));
 await tray.getByRole('button').first().click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).tool==='roof-detail',null,{timeout:5000});
 const box=await page.locator('canvas').boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height*.42;
 await page.mouse.move(cx-40,cy);await page.mouse.move(cx,cy);await page.waitForTimeout(300);
 await page.keyboard.press('r');await page.waitForTimeout(200);await page.screenshot({path:'output/city-studio-roof-detail-ghost.png'});
 await page.mouse.click(cx,cy);
 await page.waitForFunction(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return (JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.roofDetails??[]).length===1;},null,{timeout:20000});
 const [placed]=await details();assert.equal(placed.rotation,1,'R turned the detail before placing');assert.ok(Math.abs(placed.u)<.2&&Math.abs(placed.v)<.3,`placed near the clicked roof centre (${placed.u.toFixed(2)}, ${placed.v.toFixed(2)})`);
 await page.mouse.click(cx+140,cy+40);
 await page.waitForFunction(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return (JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.roofDetails??[]).length===2;},null,{timeout:20000});
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000});await page.waitForTimeout(500);
 await page.screenshot({path:'output/city-studio-roof-details.png'});
 await page.keyboard.press('Escape');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).tool!=='roof-detail',null,{timeout:5000});
 assert.deepEqual(errors,[]);
 console.log('Roof details: tray pick, roof ghost, R to turn, click to place twice and Escape to finish passed.');
}finally{await browser.close();}
