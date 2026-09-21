import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN || 'http://localhost:5183'}/city?demo=1`);
 await page.getByLabel('Demo city rendering').waitFor();
 await page.screenshot({path:'output/playwright/city-preset-demo-loading.png'});
 assert.equal(await page.getByLabel('Demo city rendering').inputValue(),'presets');
 await page.locator('[data-city-resident-count]').waitFor();
 await page.waitForTimeout(6000);
 await page.screenshot({path:'output/playwright/city-preset-demo.png'});
 console.log('residents',await page.locator('[data-city-resident-count]').getAttribute('data-city-resident-count'));
 await page.mouse.move(800,500); await page.mouse.down({button:'right'}); await page.mouse.move(1050,650,{steps:3}); await page.mouse.up({button:'right'});
 await page.waitForTimeout(1000);
 await page.screenshot({path:'output/playwright/city-preset-demo-pan.png'});
 assert.deepEqual(errors,[]);
 console.log('Preset demo city renders and pans without page errors.');
} finally {await browser.close();}

