// Tool belt, storey rail, hotkeys and context card for the game-style construction studio.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5173'}/city?demo=1&cityStudio=1&cityStudioTest=1${process.env.CITY_BACKEND==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:60000});
 await page.evaluate(async()=>{const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{upgradeStudioInterior}=await import('/src/domain/cityStudioInteriors.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts'),key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];plot.owner=LAND_OWNER;plot.purchaseId='game-ux-browser';plot.revision=1;const draft=studioExample(initialLandDraft(plot),0,plot.size);draft.sculpt.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:12,startFloor:0,spanFloors:3}];draft.sculpt=upgradeStudioInterior(draft.sculpt);plot.draft=studioDraft(draft,draft.sculpt);localStorage.setItem(key,JSON.stringify(world));});
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 const state=()=>page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStudio||'{}'));
 const floorIs=n=>page.waitForFunction(n=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).floor===n,n,{timeout:10000});
 const belt=page.getByRole('navigation',{name:'Building tools'});
 for(const name of ['Build','Roof','Paint','Openings','Decorate','Garden','Rooms','Furniture'])await belt.getByRole('button',{name,exact:true}).waitFor();
 const dock=await page.locator('.studio-dock').boundingBox();assert.ok(dock&&dock.width>600,`build dock keeps its width (${dock?.width})`);await page.screenshot({path:'output/city-studio-build.png'});
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
 // Height handle follows the pointer on the building and snaps to storeys, showing live measurements.
 const spans=()=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.volumes.find(v=>v.id==='main').spanFloors;});
 await page.getByRole('button',{name:'Orbit view',exact:true}).click();await page.waitForTimeout(400);
 const before=await spans();await page.waitForFunction(()=>!!JSON.parse(document.querySelector('canvas').dataset.cityStudio).handles?.height,null,{timeout:10000});
 const handle=(await state()).handles.height;
 await page.mouse.move(handle.x,handle.y);await page.mouse.down();
 for(let i=1;i<=12;i++){await page.mouse.move(handle.x,handle.y-i*14);await page.waitForTimeout(30);}
 await page.locator('.studio-measure').waitFor({timeout:5000});assert.match(await page.locator('.studio-measure').textContent(),/storeys · \d+\.\d m/);
 await page.screenshot({path:'output/city-studio-height-drag.png'});
 await page.mouse.up();await page.waitForFunction(b=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.volumes.find(v=>v.id==='main').spanFloors>b;},before,{timeout:15000});
 const after=await spans();assert.ok(after>before,`height grew from ${before} to ${after}`);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('.studio-toast').waitFor({timeout:5000});await page.waitForFunction(b=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt.volumes.find(v=>v.id==='main').spanFloors===b;},before,{timeout:15000});
 // Paint answers back: one click on a tile spawns a paint splash burst.
 await page.keyboard.press('3');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).category==='Surfaces');
 await page.getByRole('button',{name:'Brick',exact:true}).click();await page.getByRole('button',{name:'Orbit view',exact:true}).click();await page.waitForTimeout(500);
 let tile=null;for(const b of (await state()).bays.filter(b=>b.x>200&&b.x<1400&&b.y>120&&b.y<680)){await page.mouse.move(b.x,b.y);await page.waitForTimeout(180);if((await state()).hover===b.id){tile=b;break;}}
 assert.ok(tile,'a visible tile to paint');await page.mouse.click(tile.x,tile.y);
 await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).bursts>0,null,{timeout:10000});
 await page.screenshot({path:'output/city-studio-paint-burst.png'});
 await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityStudio).bursts===0,null,{timeout:10000});
 // Mute is remembered on this device.
 await page.getByRole('button',{name:'Mute sound'}).click();assert.equal(await page.evaluate(()=>localStorage.getItem('city-studio-muted')),'1');
 await page.getByRole('button',{name:'Turn sound on'}).click();
 await page.screenshot({path:'output/city-studio-game-ux.png'});
 assert.deepEqual(errors,[]);
 console.log('Studio game UX: tool belt, number keys, storey rail with PageUp/PageDown, walls view, floating context card, world-space height handle with live measurement, one-step undo, paint burst and remembered mute passed.');
}finally{await browser.close();}
