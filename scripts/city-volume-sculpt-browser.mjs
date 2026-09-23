import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const origin=process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5188';
 await page.goto(`${origin}/city?demo=1${process.env.CITY_BACKEND==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>localStorage.getItem('city-land-v1-48-400'),null,{timeout:60000});
 await page.evaluate(async()=>{const {createLandWorld}=await import('/src/domain/cityLand.ts');const old=JSON.parse(localStorage.getItem('city-land-v1-48-400'));localStorage.setItem(old.id,JSON.stringify(createLandWorld(old.occupied.filter(p=>!(p.x===1&&p.z===1)),400,48)));});
 await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.cityExploration||'{}').character==='ready',null,{timeout:120000});
 await page.keyboard.press('e');await page.getByRole('region',{name:'Walking controls'}).waitFor();
 await page.keyboard.down('s');try{await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.cityExploration||'{}').foot?.z<9.3,null,{timeout:60000});}catch(e){console.log('first movement diagnostics',await page.evaluate(()=>({state:document.querySelector('canvas')?.dataset.cityExploration,body:document.body.innerText.slice(-1200)})),errors);throw e;}await page.keyboard.up('s');
 await page.keyboard.down('a');try{await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.cityExploration||'{}').foot?.x>32,null,{timeout:60000});}catch(e){console.log('movement diagnostics',await page.evaluate(()=>({state:document.querySelector('canvas')?.dataset.cityExploration,body:document.body.innerText.slice(-1200)})),errors);throw e;}await page.keyboard.up('a');
 await page.getByRole('button',{name:'View plot · $5',exact:true}).waitFor({timeout:10000});await page.keyboard.press('e');
 await page.getByRole('button',{name:/Buy land/}).click();await page.getByRole('button',{name:'Save & Finish',exact:true}).waitFor({timeout:60000});
 await page.getByRole('button',{name:'Sculpt',exact:true}).click();await page.getByText('Solid Sculpt',{exact:true}).waitFor();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('city-land-v1-48-400')).plots.find(p=>p.x===1&&p.z===1).draft?.sculpt?.version===4,null,{timeout:30000});
 const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('city-land-v1-48-400')).plots.find(p=>p.x===1&&p.z===1).draft);
 let draft=await read();assert.equal(draft.sculpt.version,4);assert.ok(draft.sculpt.volumes.length);
 await page.locator('.land-sculpt-detail-list button').last().click();
 const beforeFloors=draft.design.floors;
 if(beforeFloors<8){await page.getByRole('button',{name:'Increase Height in floors'}).click();try{await page.waitForFunction(before=>JSON.parse(localStorage.getItem('city-land-v1-48-400')).plots.find(p=>p.x===1&&p.z===1).draft.design.floors===before+1,beforeFloors,{timeout:20000});}catch(e){console.log('height diagnostics',beforeFloors,(await read()).design.floors,await page.getByRole('alert').allTextContents(),await page.locator('.land-sculpt-tools').innerText());throw e;}}
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(before=>JSON.parse(localStorage.getItem('city-land-v1-48-400')).plots.find(p=>p.x===1&&p.z===1).draft.design.floors===before,beforeFloors,{timeout:10000});
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await page.getByRole('button',{name:'Top-down blueprint'}).click();
 await page.getByRole('button',{name:'Cylinder',exact:true}).click();await page.getByRole('button',{name:'Cut volume',exact:true}).click();
 await page.getByRole('button',{name:'Increase starting floor'}).click();
 for(let i=1;i<(await read()).design.floors-1;i++)await page.getByRole('button',{name:'Increase floor span'}).click();
 const beforeCount=(await read()).sculpt.volumes.length;
 await page.mouse.move(675,445);await page.mouse.down();await page.mouse.move(730,500,{steps:8});
 const cutGhost=await page.evaluate(()=>JSON.parse(document.querySelector('canvas')?.dataset.cityVolumeGhost||'null'));
 assert.equal(cutGhost?.startFloor,1);assert.equal(cutGhost?.spanFloors,(await read()).design.floors-1);
 await page.mouse.up();
 try{await page.waitForFunction(before=>JSON.parse(localStorage.getItem('city-land-v1-48-400')).plots.find(p=>p.x===1&&p.z===1).draft.sculpt.volumes.length===before+1,beforeCount,{timeout:15000});}catch(e){console.log('cut diagnostics',await page.locator('.land-sculpt-tools').innerText(),await page.evaluate(()=>document.querySelector('canvas')?.dataset.cityConstructionCamera),JSON.stringify((await read()).sculpt));await page.screenshot({path:'output/playwright/city-volume-cut-failure.png'});throw e;}
 draft=await read();assert.equal(draft.sculpt.volumes.at(-1).operation,'subtract');assert.equal(draft.sculpt.volumes.at(-1).kind,'ellipse');
 await page.getByRole('button',{name:'Entrance door',exact:true}).click();try{await page.waitForFunction(()=>JSON.parse(localStorage.getItem('city-land-v1-48-400')).plots.find(p=>p.x===1&&p.z===1).draft.sculpt.attachments.some(a=>a.kind==='door'),null,{timeout:10000});}catch(e){console.log('door diagnostics',await page.getByRole('alert').allTextContents(),await page.locator('.land-sculpt-tools').innerText());throw e;}draft=await read();
 await page.waitForFunction(()=>!document.querySelector('.city-land-actions button.land-primary')?.disabled,null,{timeout:60000});
 await page.getByRole('button',{name:'Save & Finish',exact:true}).click();await page.getByRole('region',{name:'Walking controls'}).waitFor({timeout:60000});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('city-land-v1-48-400')).plots.find(p=>p.x===1&&p.z===1).finished);
 assert.equal(saved.sculpt.version,4);assert.ok(saved.sculpt.volumes.some(v=>v.operation==='subtract'));assert.deepEqual(errors,[]);
 console.log(`PASS volume Sculpt purchase, height/undo/redo, circular cut, entrance and persistence (${process.env.CITY_BACKEND||'default'})`);
}finally{await browser.close();}
