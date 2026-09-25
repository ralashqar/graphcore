import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:950}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5173'}/city?demo=1&cityStudio=1&cityStudioTest=1${process.env.CITY_BACKEND==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(key=>key.startsWith('city-land-v1-')),null,{timeout:60000});
 await page.evaluate(async()=>{const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),key=Object.keys(localStorage).find(key=>key.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];plot.owner=LAND_OWNER;plot.purchaseId='outline-browser';plot.revision=1;const draft=studioExample(initialLandDraft(plot),0,plot.size);draft.sculpt.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:8,depth:8,startFloor:0,spanFloors:2}];draft.sculpt.studio.assemblies=[];draft.sculpt.studio.openings=[];draft.sculpt.studio.surfaces=[];draft.sculpt.studio.defaults.roof='flat';plot.draft=draft;localStorage.setItem(key,JSON.stringify(world));});
 await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 await page.getByRole('button',{name:'My parts'}).click();await page.getByRole('button',{name:/Part 1 Storeys/}).click();
 await page.getByRole('button',{name:'Sculpt outline'}).click();await page.getByRole('button',{name:'Top view'}).click();
 await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('canvas')?.dataset.cityStudio||'{}');return s.tool==='outline'&&s.handles?.['edge-1'];},null,{timeout:30000});
 const initial=await page.locator('canvas').evaluate(canvas=>JSON.parse(canvas.dataset.cityStudio).handles),handle=initial['edge-1'],oppositeEdge=initial['edge-3'],span=Math.hypot(handle.x-oppositeEdge.x,handle.y-oppositeEdge.y);
 await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+(handle.x-oppositeEdge.x)*72/span,handle.y+(handle.y-oppositeEdge.y)*72/span,{steps:12});
 await page.getByText(/Pull an exposed/).waitFor({timeout:10000});
 await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.citySculptPreview||'{}').state==='ready',null,{timeout:15000});
 await page.mouse.up();
 await page.waitForFunction(()=>Object.keys(localStorage).some(key=>key.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(key)).plots.some(plot=>plot.owner&&plot.draft?.sculpt?.volumes?.[0]?.kind==='polygon')),null,{timeout:30000}).catch(async error=>{console.error(await page.evaluate(()=>({feedback:document.querySelector('.studio-feedback')?.textContent,state:document.querySelector('canvas')?.dataset.cityStudio,volume:JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('city-land-v1-')))).plots.find(plot=>plot.owner)?.draft?.sculpt?.volumes?.[0]})));throw error;});
 await page.getByRole('button',{name:'Recess',exact:true}).click();
 await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('canvas')?.dataset.cityStudio||'{}');return !s.busy&&s.handles?.['corner-2'];},null,{timeout:30000});
 const handles=await page.locator('canvas').evaluate(canvas=>JSON.parse(canvas.dataset.cityStudio).handles),corner=handles['corner-2'],opposite=handles['corner-0'];
 await page.mouse.move(corner.x,corner.y);await page.mouse.down();await page.mouse.move(corner.x+(opposite.x-corner.x)*.32,corner.y+(opposite.y-corner.y)*.32,{steps:12});await page.mouse.up();
 await page.waitForFunction(()=>Object.keys(localStorage).some(key=>key.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(key)).plots.some(plot=>plot.owner&&plot.draft?.sculpt?.volumes?.[0]?.vertices?.length===6)),null,{timeout:30000});
 await page.getByRole('button',{name:'Bay',exact:true}).click();
 await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('canvas')?.dataset.cityStudio||'{}');return Object.keys(s.handles??{}).some(id=>id.startsWith('section-0-'));},null,{timeout:30000});
 const bayHandles=await page.locator('canvas').evaluate(canvas=>JSON.parse(canvas.dataset.cityStudio).handles),bayHandle=Object.entries(bayHandles).find(([id])=>id.startsWith('section-0-'))[1],corners=Object.entries(bayHandles).filter(([id])=>id.startsWith('corner-')).map(([,p])=>p),middle={x:corners.reduce((sum,p)=>sum+p.x,0)/corners.length,y:corners.reduce((sum,p)=>sum+p.y,0)/corners.length},outward={x:bayHandle.x-middle.x,y:bayHandle.y-middle.y},outwardLength=Math.hypot(outward.x,outward.y);
 await page.mouse.move(bayHandle.x,bayHandle.y);await page.mouse.down();await page.mouse.move(bayHandle.x+outward.x*65/outwardLength,bayHandle.y+outward.y*65/outwardLength,{steps:12});await page.mouse.up();
 await page.waitForFunction(()=>Object.keys(localStorage).some(key=>key.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(key)).plots.some(plot=>plot.owner&&plot.draft?.sculpt?.volumes?.[0]?.vertices?.length===10)),null,{timeout:30000});
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.waitForFunction(()=>Object.keys(localStorage).some(key=>key.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(key)).plots.some(plot=>plot.owner&&plot.draft?.sculpt?.volumes?.[0]?.vertices?.length===6)),null,{timeout:30000});
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await page.waitForFunction(()=>Object.keys(localStorage).some(key=>key.startsWith('city-land-v1-')&&JSON.parse(localStorage.getItem(key)).plots.some(plot=>plot.owner&&plot.draft?.sculpt?.volumes?.[0]?.vertices?.length===10)),null,{timeout:30000});
 await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 const saved=await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(key)).plots.find(plot=>plot.owner)?.draft?.sculpt?.volumes?.[0];});
 assert.equal(saved?.kind,'polygon');assert.equal(saved.vertices.length,10);assert.ok(saved.width>8);assert.deepEqual(errors,[]);
 console.log('Wall, corner and bay pulls persist a polygon part with undo, redo, and reload.');
}finally{await browser.close();}
