import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const watchdog=setTimeout(()=>{console.error('Transition profile exceeded five minutes');void browser.close();},300000);watchdog.unref();
 const page=await browser.newPage({viewport:{width:1000,height:750}});
 const errors=[];page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|WebGPU|GPUValidation|GL_INVALID/i.test(m.text()))errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(mode=>{localStorage.setItem('city-scene-look-v1',JSON.stringify({look:'daylight',quality:'balanced',occlusion:mode}));window.cityLongTasks=[];new PerformanceObserver(list=>window.cityLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});},process.env.CITY_AO_MODE||'architectural');
 const started=Date.now();await page.goto((process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5188')+'/city?demo=1'+(process.env.CITY_BACKEND==='webgl'?'&cityBackend=webgl':''));
 await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.cityPreparedBuildings)>=72,null,{timeout:180000});
 console.log('ready',Date.now()-started,await page.locator('canvas').getAttribute('data-city-backend'));
 const results=[];
 const cdp=process.env.CITY_CPU_PROFILE?await page.context().newCDPSession(page):null;
 if(cdp)await cdp.send("Profiler.enable");
 for(let i=0;i<3;i++){
  if(cdp&&i===1)await cdp.send("Profiler.start");
  for(const name of ['Drive mode','Back to map']){
   const before=await page.evaluate(()=>performance.now());
   await page.getByRole('button',{name,exact:true}).click();
   await page.getByRole('button',{name:name==='Drive mode'?'Back to map':'Drive mode',exact:true}).waitFor();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const after=await page.evaluate(()=>performance.now());
   const pipelines=Number(await page.locator('canvas').getAttribute('data-city-ao-pipelines'));
   if(process.env.CITY_AO_MODE==='screen')assert.equal(pipelines,2,'Retain exactly one AO pipeline per camera kind');
   results.push({name,pipelines,ms:after-before,longTasks:await page.evaluate(t=>window.cityLongTasks.filter(e=>e.start>=t),before)});
   await page.waitForTimeout(1500);
  }
 }
 if(cdp){const {profile}=await cdp.send("Profiler.stop");await writeFile("output/playwright/city-transition.cpuprofile",JSON.stringify(profile));}
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({mode:process.env.CITY_AO_MODE||'architectural',results,errors},null,2));
}finally{await browser.close();}
