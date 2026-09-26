// Free openings spike: a studio building whose front face is a generated wall with real holes.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5173'}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:60000});
 await page.evaluate(async()=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='free-openings-browser';plot.revision=1;
  const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
  r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:3},{id:'wing',kind:'rectangle',operation:'add',x:8,z:-1,width:5,depth:6,startFloor:0,spanFloors:2}];
  Object.assign(r.studio,{openings:[],assemblies:[],stamps:undefined,variation:undefined});r.studio.defaults.family='pastel-stucco';r.studio.defaults.roof='terrace';
  const at=(id,x,bottom,width,height,shape,extra={})=>({id,shapeId:'main',side:'north',u:x/12,bottom,width,height,shape,...extra});
  r.studio.freeOpenings=[
   at('door',6,0,1.5,2.75,'arch',{style:'timber'}),
   at('shop-a',2.35,.85,1.05,1.7,'rect'),at('shop-b',3.55,.9,1.05,1.65,'rect'),
   at('arch-g',9.6,.8,1.2,2.1,'arch',{style:'stone'}),
   at('gothic-l',2.6,4.1,1.05,2.3,'pointed',{style:'stone'}),at('rose',6,4.55,1.25,1.25,'round',{style:'stone'}),at('gothic-r',9.4,4.1,1.05,2.3,'pointed',{style:'stone'}),
   at('top-a',4.85,7.1,1,1.55,'rect'),at('top-b',6,7.12,1,1.55,'rect'),at('top-c',7.15,7.1,1,1.55,'rect'),
   at('top-arch',1.9,7.05,.9,1.6,'arch'),at('top-round',10.2,7.4,.95,.95,'round'),
   {id:'wing-door',shapeId:'wing',side:'east',u:.4,bottom:0,width:1.2,height:2.5,shape:'pointed',style:'stone'},
   {id:'wing-win',shapeId:'wing',side:'east',u:.75,bottom:4.3,width:1.4,height:1.5,shape:'arch'},
  ];
  plot.draft=studioDraft(draft,r);localStorage.setItem(key,JSON.stringify(world));
 });
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:60000}).catch(()=>{});
 const faces=await page.evaluate(async()=>{
  const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),plot=JSON.parse(localStorage.getItem(key)).plots.find(p=>p.purchaseId==='free-openings-browser');
  const started=performance.now(),out=resolveSculpt(plot.draft.sculpt,plot.draft.design).studio,ms=performance.now()-started;
  return {ms,inactive:out.inactive,faces:out.freeFaces.map(f=>({id:f.id,groups:f.groups.map(g=>`${g.role}:${g.members.join('+')}`),triangles:f.geometry.triangles}))};
 });
 console.log(JSON.stringify(faces));
 assert.deepEqual(faces.inactive,[],'every free opening fits');
 assert.equal(faces.faces.length,2);assert.ok(faces.faces[0].groups.includes('window:shop-a+shop-b')&&faces.faces[0].groups.includes('window:top-a+top-b+top-c'),'neighbours merged');
 assert.ok(faces.faces[0].groups.includes('door:door')&&faces.faces[1].groups.includes('door:wing-door'),'ground openings became doors');
 const scene=await page.waitForFunction(()=>{const root=[...document.querySelectorAll('canvas')].find(c=>c.dataset.cityStudio);return root?JSON.parse(root.dataset.cityStudio||'{}'):null;},null,{timeout:30000}).then(h=>h.jsonValue()).catch(()=>null);void scene;
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(2500);
 await page.screenshot({path:`output/city-studio-free-openings${suffix}.png`});
 // Closer three-quarter look: orbit a little and zoom towards the facade.
 const box=await page.locator('canvas').first().boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height*.42;
 await page.mouse.move(cx,cy);for(let i=0;i<7;i++){await page.mouse.wheel(0,-240);await page.waitForTimeout(80);}
 await page.mouse.move(box.x+box.width/2,box.y+150);await page.waitForTimeout(1800);await page.screenshot({path:`output/city-studio-free-openings-close${suffix}.png`});
 await page.mouse.move(cx+200,cy);await page.mouse.down({button:'right'});for(let i=1;i<=10;i++){await page.mouse.move(cx+200-i*11,cy+i*2);await page.waitForTimeout(30);}await page.mouse.up({button:'right'});await page.mouse.move(box.x+box.width/2,box.y+150);
 await page.waitForTimeout(1800);await page.screenshot({path:`output/city-studio-free-openings-angle${suffix}.png`});
 for(let i=0;i<4;i++){await page.mouse.move(cx,cy+120);await page.mouse.wheel(0,-240);await page.waitForTimeout(80);}await page.mouse.move(box.x+box.width/2,box.y+150);
 await page.waitForTimeout(1800);await page.screenshot({path:`output/city-studio-free-openings-detail${suffix}.png`});
 // UI: Freeform tray, ghost, click to cut, drag to move, remove.
 const studio=()=>page.locator('canvas').evaluateAll(cs=>JSON.parse(cs.find(c=>c.dataset.cityStudio)?.dataset.cityStudio||'{}'));
 const free=()=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.freeOpenings??[];});
 const before=(await free()).length;
 await page.getByRole('button',{name:'Orbit view',exact:true}).click();await page.waitForTimeout(800);
 await page.keyboard.press('4');await page.getByRole('button',{name:'Freeform',exact:true}).click();await page.getByRole('button',{name:'Cut Arch',exact:true}).click();
 let spot=null;for(const b of (await studio()).bays.filter(b=>b.floor===2&&b.x>200&&b.x<1400&&b.y>120&&b.y<650)){await page.mouse.move(b.x,b.y);await page.waitForTimeout(160);const st=await studio();if(st.freeGhost&&!st.freeGhost.door){spot=b;break;}}
 assert.ok(spot,'a wall spot shows the arch ghost');await page.screenshot({path:`output/city-studio-free-openings-ghost${suffix}.png`});
 await page.mouse.click(spot.x,spot.y);await page.waitForFunction(n=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return (JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.freeOpenings??[]).length===n+1;},before,{timeout:15000});
 const added=(await free()).at(-1);assert.equal(added.shape,'arch');
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000});await page.waitForTimeout(400);
 await page.mouse.move(spot.x,spot.y);await page.mouse.down();for(let i=1;i<=8;i++){await page.mouse.move(spot.x+i*7,spot.y);await page.waitForTimeout(90);}await page.mouse.up();
 await page.waitForFunction(([id,u])=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));const o=(JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.freeOpenings??[]).find(o=>o.id===id);return o&&Math.abs(o.u-u)>.01;},[added.id,added.u],{timeout:15000});
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000});await page.waitForTimeout(400);
 await page.screenshot({path:`output/city-studio-free-openings-placed${suffix}.png`});
 // One undo returns the moved opening to where it was cut; then Remove takes it out.
 await page.keyboard.press('Control+z');await page.waitForFunction(([id,u])=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));const o=(JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.freeOpenings??[]).find(o=>o.id===id);return o&&Math.abs(o.u-u)<.001;},[added.id,added.u],{timeout:15000});
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000});await page.waitForTimeout(400);
 await page.getByRole('button',{name:'Remove free opening',exact:true}).click();await page.waitForTimeout(500);await page.mouse.click(spot.x,spot.y);
 await page.waitForFunction(n=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return (JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.freeOpenings??[]).length===n;},before,{timeout:15000});
 assert.deepEqual(errors.filter(e=>!/favicon|ResizeObserver/.test(e)),[]);
 console.log(`Free openings (${backend}): ${faces.faces.map(f=>`${f.id} ${f.groups.length} groups/${f.triangles} tris`).join(', ')}; resolveSculpt ${faces.ms.toFixed(1)} ms in page; freeform tray ghost, cut, drag and remove passed.`);
}finally{await browser.close();}
