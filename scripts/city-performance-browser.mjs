import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error' && /shader|WebGL|GL_INVALID/.test(m.text()))errors.push(m.text());});
 await page.goto(`${process.env.CITY_TEST_ORIGIN || 'http://127.0.0.1:5188'}/city?demo=1`);await page.locator('canvas').waitFor();await page.waitForTimeout(12000);
 const results=[];
 async function sample(label,pan=false){
  const task=page.evaluate(()=>new Promise(resolve=>{const values=[];let previous=performance.now(),start=previous;function tick(now){values.push(now-previous);previous=now;if(now-start<5000)requestAnimationFrame(tick);else{values.sort((a,b)=>a-b);const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');resolve({fps:values.length*1000/(now-start),p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],render:JSON.parse(canvas.dataset.cityRenderStats),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,residents:document.querySelector('[data-city-resident-count]')?.dataset.cityResidentCount,heap:performance.memory?.usedJSHeapSize});}}requestAnimationFrame(tick);}));
  if(pan){await page.mouse.move(900,450);await page.mouse.down({button:'right'});for(let i=0;i<20;i++){await page.mouse.move(900+Math.sin(i*.3)*180,450+Math.cos(i*.3)*70,{steps:3});await page.waitForTimeout(80);}await page.mouse.up({button:'right'});}
  results.push({label,...await task});console.log(JSON.stringify(results.at(-1)));
 }
 await sample('idle');await page.screenshot({path:'output/playwright/city-performance-map.png'});await sample('pan',true);
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.waitForTimeout(3000);await page.keyboard.down('w');await sample('drive');await page.keyboard.up('w');await page.screenshot({path:'output/playwright/city-performance-drive.png'});
 await mkdir('output/playwright',{recursive:true});await writeFile('output/playwright/city-performance-latest.json',JSON.stringify({results,errors},null,2));if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}
