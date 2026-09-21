import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({headless:true, args:process.platform === "win32" ? ["--use-angle=d3d11"] : []});
const page = await browser.newPage({viewport:{width:1440,height:960}});
const errors=[];page.on("pageerror", e=>errors.push(e.message));
await page.route("**/functions/v1/city-*",r=>r.fulfill({json:{error:"Offline demo fixture"}}));
const pose=()=>page.locator("canvas").evaluate(el=>JSON.parse(el.dataset.cityCamera));
async function drag(button, index) {
  const before=await pose();
  await page.mouse.move(820,430);
  await page.mouse.down({button});
  await page.mouse.move(900,480,{steps:12});
  // Cross the camera's region/LOD refresh while a pointer is down.
  await page.waitForTimeout(1300);
  await page.mouse.move(960,510,{steps:12});
  await page.mouse.up({button});
  await page.waitForTimeout(1300);
  const after=await pose();
  assert.ok(Math.hypot(after.x-before.x, after.z-before.z)>2, `${button} drag ${index} stalled`);
}
try {
  await page.goto((process.env.CITY_TEST_ORIGIN||"http://127.0.0.1:5188")+"/city?demo=1");
  await page.waitForFunction(()=>document.querySelector("canvas")?.dataset.cityCamera);
  await page.waitForTimeout(2000);
  for(let i=0;i<6;i++) await drag("right",i);
  await drag("left",0);
  const beforeZoom=await pose();
  await page.mouse.wheel(0,-350);await page.waitForTimeout(1500);
  assert.ok((await pose()).zoom>beforeZoom.zoom);
  await page.mouse.move(820,430);await page.mouse.down({button:"right"});
  await page.mouse.move(850,450,{steps:5});
  await page.evaluate(()=>window.dispatchEvent(new Event("blur")));
  await page.mouse.up({button:"right"});
  await drag("right","after blur");
  await page.getByRole("button",{name:"Return to Central Plaza",exact:true}).click();
  await page.waitForTimeout(1800);
  await drag("right","after reset");
  await page.emulateMedia({reducedMotion:"reduce"});
  await drag("right","reduced motion");
  assert.deepEqual(errors,[]);
  console.log("Navigation passed: repeated held right/left drag, zoom, blur recovery, central reset, reduced motion; no runtime errors.");
} finally {await browser.close();}
