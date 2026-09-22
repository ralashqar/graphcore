import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),assets=[],errors=[];
 page.on('request',r=>{if(r.url().includes('/city/decorators/decorators.glb'))assets.push(r.url());});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5188/city?demo=1');await page.locator('canvas').waitFor();await page.waitForTimeout(5000);
 assert.equal(await page.getByRole('checkbox',{name:'Light mode',exact:true}).isChecked(),true);
 assert.equal(assets.length,0,'light mode must not load Quaternius decoration pack');
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.waitForTimeout(1000);assert.equal(assets.length,0);
 await page.screenshot({path:'output/playwright/city-light-driving.png'});
 await page.getByRole('button',{name:'Back to map',exact:true}).click();
 await page.getByRole('checkbox',{name:'Light mode',exact:true}).uncheck();await page.waitForURL('**cityLight=0');await page.locator('canvas').waitFor();
 await page.waitForFunction(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('/city/decorators/decorators.glb')));
 assert.ok(assets.length>0,'full mode restores the native pack');
 assert.equal(await page.getByRole('checkbox',{name:'Light mode',exact:true}).isChecked(),false);
 assert.deepEqual(errors,[]);console.log('Light mode defaults on, skips native pack in map/drive, and full-mode toggle restores it; no page errors.');
}finally{await browser.close();}
