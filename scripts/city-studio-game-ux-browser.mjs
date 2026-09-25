// Tool belt, storey rail, hotkeys and context card for the game-style construction studio.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5173'}/city?demo=1&cityStudio=1&cityStudioTest=1${process.env.CITY_BACKEND==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:60000});
 await page.evaluate(async()=>{const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{upgradeStudioInterior}=await import('/src/domain/cityStudioInteriors.ts'),key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];plot.owner=LAND_OWNER;plot.purchaseId='game-ux-browser';plot.revision=1;const draft=studioExample(initialLandDraft(plot),0,plot.size);draft.sculpt.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:12,startFloor:0,spanFloors:3}];draft.sculpt=upgradeStudioInterior(draft.sculpt);plot.draft=draft;localStorage.setItem(key,JSON.stringify(world));});
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 const state=()=>page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStudio||'{}'));
 const floorIs=n=>page.waitForFunction(n=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).floor===n,n,{timeout:10000});
 const belt=page.getByRole('navigation',{name:'Building tools'});
 for(const name of ['Build','Roof','Paint','Openings','Decorate','Garden','Rooms','Furniture'])await belt.getByRole('button',{name,exact:true}).waitFor();
 // Number keys pick tools; the belt reflects the choice.
 await page.locator('canvas').click({position:{x:40,y:40},button:'middle'}).catch(()=>{});
 await page.keyboard.press('3');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).category==='Surfaces');
 assert.equal(await belt.getByRole('button',{name:'Paint',exact:true}).getAttribute('aria-pressed'),'true');
 await page.keyboard.press('7');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).category==='Rooms');
 // Storey rail is shared by every tool and follows PageUp/PageDown.
 const rail=page.getByRole('complementary',{name:'Storeys'});
 await rail.getByRole('button',{name:'Floor 2',exact:true}).click();await floorIs(1);
 await page.keyboard.press('PageUp');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).floor===2);
 await page.keyboard.press('PageUp');await page.waitForTimeout(300);assert.equal((await state()).floor,2,'rail stops at the top storey');
 await page.keyboard.press('PageDown');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).floor===1);
 assert.equal(await rail.getByRole('button',{name:'This floor view'}).getAttribute('aria-pressed'),'true','interior tools isolate the storey');
 await page.keyboard.press('1');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).category==='Shape');
 await rail.getByRole('button',{name:'Floor 1',exact:true}).click();await floorIs(0);
 // Selecting a part opens the floating context card with its actions.
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(300);
 const box=await page.locator('canvas').boundingBox(),s=await state(),bay=(await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStudio).bays))[0];
 assert.ok(bay&&box&&s,'bays are exposed');
 await page.mouse.click(bay.x,bay.y);
 await page.getByRole('button',{name:'Duplicate part'}).waitFor({timeout:15000});
 assert.ok(await page.locator('.city-studio.is-floating .studio-selection').isVisible(),'context card floats above the part');
 await page.screenshot({path:'output/city-studio-game-ux.png'});
 assert.deepEqual(errors,[]);
 console.log('Studio game UX: tool belt, number keys, storey rail with PageUp/PageDown, walls view and floating context card passed.');
}finally{await browser.close();}
