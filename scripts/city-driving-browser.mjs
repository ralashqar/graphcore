import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser=await chromium.launch({
 ...(process.env.CITY_BROWSER_CHANNEL?{channel:process.env.CITY_BROWSER_CHANNEL}:{}),headless:true,args:["--use-angle=d3d11"]});
try {
 const watchdog=setTimeout(()=>{console.error("Driving audit exceeded five minutes");void browser.close();},300000);watchdog.unref();
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],deviceLosses=[];
 page.on("console",m=>{if(/WebGPU Device Lost/.test(m.text())){deviceLosses.push(m.text());return;}if(m.type()==="error" && /shader|WebGL|WebGPU|GPUValidation|GL_INVALID/i.test(m.text())){errors.push(m.text());console.error(m.text());}});
 page.on("pageerror",e=>{errors.push(e.message);console.log("pageerror",e.message);});
 if(process.env.CITY_SCENE_QUALITY || process.env.CITY_AO_MODE)await page.addInitScript(settings=>localStorage.setItem("city-scene-look-v1",JSON.stringify(settings)),{look:"daylight",quality:process.env.CITY_SCENE_QUALITY||"balanced",occlusion:process.env.CITY_AO_MODE||"architectural"});
 if(process.env.CITY_CAR_FAILURE==='1')await page.route('**/assets/city/car/hatchback-sports.glb',r=>r.abort());
 if(process.env.CITY_REDUCED==='1')await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(`${process.env.CITY_TEST_ORIGIN||"http://localhost:5183"}/city?demo=1${process.env.CITY_BACKEND==="webgl"?"&cityBackend=webgl":""}`);
 console.log("City navigation complete");
 await page.locator("canvas").waitFor();
 await page.getByRole("button",{name:"Drive mode",exact:true}).click();
 await page.getByRole("region",{name:"Driving controls"}).waitFor();
 await page.waitForFunction(()=>document.querySelector("canvas")?.dataset.cityDriving);
 if(process.env.CITY_AO_MODE==="screen")await page.waitForFunction(()=>document.querySelector("canvas")?.dataset.cityScreenAo==="half-resolution");
 console.log("Entered driving",await page.locator("canvas").evaluate(c=>({...c.dataset})));
 const progress=setInterval(()=>page.locator("canvas").evaluate(c=>({...c.dataset})).then(s=>console.log("Preparation",s.cityPreparedBuildings,s.cityDeviceLost)).catch(()=>{}),15000);progress.unref();
 await page.waitForFunction(()=>{
  const canvas=document.querySelector("canvas"),resident=Number(document.querySelector("[data-city-resident-count]")?.getAttribute("data-city-resident-count"));
  return resident>0 && Number(canvas?.dataset.cityPreparedBuildings)>=resident;
 },null,{timeout:180000});
 clearInterval(progress);
 console.log("All resident buildings prepared");
 if(process.env.CITY_CAR_FAILURE==='1')assert.equal(await page.locator('canvas').getAttribute('data-city-car'),'fallback');
 else {await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityCar==='kenney-hatchback');const car=JSON.parse(await page.locator('canvas').getAttribute('data-city-car-details'));assert.equal(car.wheels,4);assert.equal(car.textured,true);}

 const state=()=>page.locator("canvas").evaluate(el=>JSON.parse(el.dataset.cityDriving));
 await page.waitForTimeout(process.env.CITY_SCENE_QUALITY === "high" ? 2500 : 0);
 const start=await state();
 assert.equal(await page.locator(".city-header").isVisible(),false);
 assert.equal(await page.locator(".city-look-controls").count(),0);
 const residents=await page.locator("[data-city-resident-count]").getAttribute("data-city-resident-count");
 const bounds=await page.locator("canvas").boundingBox();
 assert.ok(bounds.y===0 && bounds.height===1000);

 await page.keyboard.down("w");await page.waitForTimeout(1800);await page.keyboard.up("w");
 await page.keyboard.down(" ");await page.waitForTimeout(700);await page.keyboard.up(" ");
 assert.ok((await state()).z>start.z+2);
 assert.equal(await page.locator("[data-city-resident-count]").getAttribute("data-city-resident-count"),residents);
 await page.mouse.move(900,350);await page.mouse.down({button:"right"});await page.mouse.move(1030,390,{steps:3});await page.mouse.up({button:"right"});
 await page.screenshot({path:"output/playwright/city-driving.png"});
 await page.keyboard.press("r");await page.waitForTimeout(400);assert.ok(Math.abs((await state()).speed)<.01);assert.ok(Math.abs((await state()).wheelAngle)<.01);
 await page.keyboard.press("Escape");
 await page.getByRole("button",{name:"Drive mode",exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector("canvas")?.dataset.cityDriving);
 await page.mouse.move(900,450);await page.mouse.down({button:"right"});await page.mouse.move(1000,500,{steps:3});await page.mouse.up({button:"right"});
 await page.getByRole("button",{name:"Drive mode",exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 const accelerate=page.getByRole("button",{name:"Accelerate",exact:true});
 const box=await accelerate.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.waitForTimeout(600);await page.mouse.up();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.getByRole("button",{name:"Back to map",exact:true}).click();
 if(deviceLosses.length)assert.equal(await page.locator("canvas").getAttribute("data-city-backend"),"webgl2","Driver loss must recover with compatibility rendering");
 console.log("Renderer",await page.locator("canvas").getAttribute("data-city-backend"),"recovered device losses",deviceLosses.length);
 assert.deepEqual(errors,[]);
 console.log("Driving movement, brake, look-around, map return/re-entry and mobile controls passed.");
}finally{await browser.close();}
