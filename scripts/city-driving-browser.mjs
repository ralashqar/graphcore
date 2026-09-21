import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true,args:["--use-angle=d3d11"]});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on("pageerror",e=>{errors.push(e.message);console.log("pageerror",e.message);});
 await page.goto(`${process.env.CITY_TEST_ORIGIN||"http://localhost:5183"}/city?demo=1`);
 await page.locator("canvas").waitFor();
 await page.getByRole("button",{name:"Drive mode",exact:true}).click();
 await page.getByRole("region",{name:"Driving controls"}).waitFor();
 await page.waitForFunction(()=>document.querySelector("canvas")?.dataset.cityDriving);
 const state=()=>page.locator("canvas").evaluate(el=>JSON.parse(el.dataset.cityDriving));
 const start=await state();
 assert.equal(await page.locator(".city-header").isVisible(),false);
 const residents=await page.locator("canvas").getAttribute("data-city-resident-count");
 const bounds=await page.locator("canvas").boundingBox();
 assert.ok(bounds.y===0 && bounds.height===1000);

 await page.keyboard.down("w");await page.waitForTimeout(1800);await page.keyboard.up("w");
 await page.keyboard.down(" ");await page.waitForTimeout(700);await page.keyboard.up(" ");
 assert.ok((await state()).z>start.z+2);
 assert.equal(await page.locator("canvas").getAttribute("data-city-resident-count"),residents);
 await page.mouse.move(900,350);await page.mouse.down({button:"right"});await page.mouse.move(1030,390,{steps:3});await page.mouse.up({button:"right"});
 await page.screenshot({path:"output/playwright/city-driving.png"});
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
 assert.deepEqual(errors,[]);
 console.log("Driving movement, brake, look-around, map return/re-entry and mobile controls passed.");
}finally{await browser.close();}
