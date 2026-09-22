import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {cityPlots,emptyCityProfile,buildingTier} from '../src/domain/city.ts';
import {newDesign} from '../src/domain/cityBuildingV3.ts';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const results=[];const watchdog=setTimeout(()=>{console.error('Driving benchmark exceeded eight minutes');void browser.close();},480000);watchdog.unref();
try{for(const count of (process.env.CITY_BENCH_COUNT?[Number(process.env.CITY_BENCH_COUNT)]:[72,400])){
console.log("starting",count);
const page=await browser.newPage({viewport:{width:1000,height:750}}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'&&/WebGPU|shader|GPUValidation|WebGL/i.test(m.text())){errors.push(m.text());console.error(m.text());}});
await page.addInitScript(()=>localStorage.setItem('city-scene-look-v1',JSON.stringify({look:'daylight',quality:'balanced',occlusion:'architectural'})));
if(count===400){const properties=cityPlots().map((p,i)=>({...p,id:`fixture-${i}`,slug:`fixture-${i}`,rank:i+1,tier:buildingTier(10000),landValue:10000,saves:0,claims:0,profile:{...emptyCityProfile(),name:`Fixture ${i+1}`,buildingDesign:newDesign(`drive-${i%6}`),website:'https://example.com'}}));await page.route('**/functions/v1/city-api',r=>r.fulfill({json:{revision:1,capacity:400,total:400,properties,events:[],purchasesEnabled:false,onboardingEnabled:false,demo:true}}));await page.routeWebSocket('**/realtime/**',s=>s.onMessage(()=>{}));}
await page.goto(`http://127.0.0.1:5188/city${count===72?'?demo=1':''}`);
await page.getByRole('button',{name:'Drive mode',exact:true}).click();
const progress=setInterval(()=>page.locator('canvas').evaluate(c=>({prepared:c.dataset.cityPreparedBuildings,resident:document.querySelector('[data-city-resident-count]')?.getAttribute('data-city-resident-count')})).then(v=>console.log(v)).catch(()=>{}),15000);progress.unref();
await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.cityPreparedBuildings)>=Number(document.querySelector('[data-city-resident-count]')?.getAttribute('data-city-resident-count')),null,{timeout:360000});
clearInterval(progress);await page.waitForTimeout(4000);
await page.evaluate(()=>{window.driveFrames=[];window.driveMeasure=true;let last=performance.now();function frame(t){if(!window.driveMeasure)return;window.driveFrames.push(t-last);last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);});
await page.keyboard.down('w');clearInterval(progress);await page.waitForTimeout(4000);await page.keyboard.down('a');await page.waitForTimeout(1200);await page.keyboard.up('a');await page.waitForTimeout(2500);await page.keyboard.down(' ');await page.waitForTimeout(700);await page.keyboard.up(' ');await page.keyboard.up('w');
const data=await page.evaluate(()=>{window.driveMeasure=false;const a=window.driveFrames.slice(2).sort((a,b)=>a-b);return {p95:a[Math.floor(a.length*.95)],p50:a[Math.floor(a.length*.5)],frames:a.length,stats:document.querySelector('canvas').dataset.cityRenderStats,physics:document.querySelector('canvas').dataset.cityDrivePerformance,backend:document.querySelector('canvas').dataset.cityBackend};});results.push({count,...data,errors});console.log(results.at(-1));await writeFile(`output/city-drive-${process.env.CITY_BENCH_LABEL||'after'}.json`,JSON.stringify(results,null,2));await page.close();}
await writeFile(`output/city-drive-${process.env.CITY_BENCH_LABEL||'after'}.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));}finally{await browser.close();}
