import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try{
 for(const blocked of [false,true]){
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
  const errors=[];let workers=0;
  page.on('worker',()=>workers++);page.on('pageerror',e=>errors.push(e.message));
  if(blocked)await context.addInitScript(()=>{window.Worker=class{constructor(){throw new Error('Fixture: worker disabled');}};});
  await page.goto('http://127.0.0.1:5188/city?demo=1');
  await page.waitForFunction(()=>{const canvas=document.querySelector('canvas');const stats=JSON.parse(canvas?.dataset.cityRenderStats||'{}');return stats.triangles>150000;},{},{timeout:60000});
  await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.waitForTimeout(800);
  await page.getByRole('button',{name:'Back to map',exact:true}).click();
  if(!blocked)assert.ok(workers>0,'city must use background worker');
  assert.deepEqual(errors,[]);console.log(blocked?'Worker failure fallback rendered the city.':'Background worker rendered the city.');
  await context.close();
 }
}finally{await browser.close();}
