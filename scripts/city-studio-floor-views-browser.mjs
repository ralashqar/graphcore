import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:950}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5173'}/city?demo=1&cityStudio=1&cityStudioTest=1`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(key=>key.startsWith('city-land-v1-')),null,{timeout:60000});
 const seed=async(disconnected)=>page.evaluate(async(disconnected)=>{const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{upgradeStudioInterior}=await import('/src/domain/cityStudioInteriors.ts'),key=Object.keys(localStorage).find(item=>item.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];plot.owner=LAND_OWNER;plot.purchaseId='floor-view-browser';plot.revision=1;const draft=studioExample(initialLandDraft(plot),2,plot.size);draft.name=disconnected?'Two separate wings':'Courtyard floors';draft.sculpt=upgradeStudioInterior(draft.sculpt);if(disconnected){draft.sculpt.volumes=[{id:'west',kind:'rectangle',operation:'add',x:-5,z:0,width:4,depth:8,startFloor:0,spanFloors:2},{id:'east',kind:'rectangle',operation:'add',x:5,z:0,width:4,depth:8,startFloor:0,spanFloors:2}];draft.sculpt.studio.assemblies=[];}plot.draft=draft;localStorage.setItem(key,JSON.stringify(world));},disconnected);
 const open=async(name)=>{await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});await page.getByRole('button',{name:'Inside',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000});await page.screenshot({path:`output/playwright/city-studio-floor-${name}-ground.png`});await page.getByRole('button',{name:'Floor 2',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000});};
 mkdirSync('output/playwright',{recursive:true});
 await seed(false);await open('courtyard');await page.screenshot({path:'output/playwright/city-studio-floor-courtyard.png'});
 assert.equal(await page.getByRole('button',{name:'Floor 2',exact:true}).getAttribute('aria-pressed'),'true');
 await seed(true);await open('separated');await page.screenshot({path:'output/playwright/city-studio-floor-separated.png'});
 assert.equal(await page.getByRole('button',{name:'Floor 2',exact:true}).getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);
 console.log('Courtyard and disconnected upper-floor views select one full storey.');
}finally{await browser.close();}
