// Trim parts proof: free openings dressed with stretchable Blender trims (shutters, window boxes,
// keystones, hood moulds, lintels, sill brackets, a door canopy and lanterns).
// Needs the Vite dev server: CITY_TEST_ORIGIN (default http://localhost:5180); CITY_BACKEND=webgl for WebGL2.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://localhost:5180'}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:60000});
 await page.evaluate(async()=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts'),{setFreeTrims}=await import('/src/domain/cityStudioTrimParts.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='trims-browser';plot.revision=1;
  const draft=studioExample(initialLandDraft(plot),0,plot.size);let r=draft.sculpt;
  r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:3},{id:'wing',kind:'rectangle',operation:'add',x:8,z:-1,width:5,depth:6,startFloor:0,spanFloors:2}];
  Object.assign(r.studio,{openings:[],assemblies:[],stamps:undefined,variation:undefined});r.studio.defaults.family='pastel-stucco';r.studio.defaults.roof='terrace';
  const at=(id,x,bottom,width,height,shape,extra={})=>({id,shapeId:'main',side:'north',u:x/12,bottom,width,height,shape,...extra});
  r.studio.freeOpenings=[
   at('door',6,0,1.3,2.5,'rect',{style:'timber'}),at('g-left',2.6,.9,1.2,1.5,'rect'),at('g-arch',9.6,.8,1.1,2,'arch',{style:'stone'}),
   at('narrow',1.9,4.2,.8,1.5,'rect'),at('wide',5.6,4.2,2.2,1.6,'rect'),at('arch',9.4,4.1,1.1,2,'arch',{style:'stone'}),
   at('pointed',2.8,6.6,1,1.9,'pointed',{style:'stone'}),at('rose',5.9,7.1,1.1,1.1,'round',{style:'stone'}),at('top',9,6.8,1.3,1.5,'rect'),
   {id:'wing-door',shapeId:'wing',side:'east',u:.45,bottom:0,width:1.2,height:2.5,shape:'arch',style:'stone'},
   {id:'wing-win',shapeId:'wing',side:'east',u:.5,bottom:3.8,width:1.4,height:1.4,shape:'rect'},
  ];
  for(const [id,kinds] of Object.entries({door:['canopy','lamps'],'g-left':['shutters','sill-brackets'],'g-arch':['keystone','shutters'],narrow:['shutters','hood','sill-brackets'],wide:['window-box','lintel','shutters'],arch:['keystone','window-box','shutters'],pointed:['keystone'],top:['hood','shutters','sill-brackets'],'wing-door':['keystone','lamps'],'wing-win':['window-box','hood','shutters']}))r=setFreeTrims(r,id,kinds);
  plot.draft=studioDraft(draft,r);localStorage.setItem(key,JSON.stringify(world));
 });
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 const stats=await page.waitForFunction(()=>{const s=window.__cityStudioTrims;return s?.status==='ready'&&s.instances>0?s:null;},null,{timeout:60000}).then(h=>h.jsonValue());
 console.log(JSON.stringify(stats));
 assert.deepEqual(stats.skipped,[],'every requested trim fits');assert.ok(stats.placements>=40,'placements');assert.ok(stats.triangles<30000,'triangle budget');
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(2500);
 await page.screenshot({path:`output/city-studio-trims${suffix}.png`});
 const box=await page.locator('canvas').first().boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height*.42;
 await page.mouse.move(cx,cy);for(let i=0;i<7;i++){await page.mouse.wheel(0,-240);await page.waitForTimeout(80);}
 await page.mouse.move(box.x+box.width/2,box.y+150);await page.waitForTimeout(1800);await page.screenshot({path:`output/city-studio-trims-close${suffix}.png`});
 await page.mouse.move(cx+200,cy);await page.mouse.down({button:'right'});for(let i=1;i<=10;i++){await page.mouse.move(cx+200-i*11,cy+i*2);await page.waitForTimeout(30);}await page.mouse.up({button:'right'});await page.mouse.move(box.x+box.width/2,box.y+150);
 await page.waitForTimeout(1800);await page.screenshot({path:`output/city-studio-trims-angle${suffix}.png`});
 for(let i=0;i<4;i++){await page.mouse.move(cx,cy+120);await page.mouse.wheel(0,-240);await page.waitForTimeout(80);}await page.mouse.move(box.x+box.width/2,box.y+150);
 await page.waitForTimeout(1800);await page.screenshot({path:`output/city-studio-trims-detail${suffix}.png`});
 for(let i=0;i<3;i++){await page.mouse.move(cx-150,cy+60);await page.mouse.wheel(0,-240);await page.waitForTimeout(80);}await page.mouse.move(box.x+box.width/2,box.y+150);
 await page.waitForTimeout(1800);await page.screenshot({path:`output/city-studio-trims-macro${suffix}.png`});
 // Swing round to the wing's east face (a second face frame: rotated trims).
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(1500);
 await page.mouse.move(cx+300,cy);await page.mouse.down({button:'right'});for(let i=1;i<=10;i++){await page.mouse.move(cx+300-i*21,cy+i*2);await page.waitForTimeout(30);}await page.mouse.up({button:'right'});
 for(let i=0;i<5;i++){await page.mouse.move(cx+120,cy+140);await page.mouse.wheel(0,-240);await page.waitForTimeout(80);}await page.mouse.move(box.x+box.width/2,box.y+150);
 await page.waitForTimeout(1800);await page.screenshot({path:`output/city-studio-trims-east${suffix}.png`});
 // UI: in Freeform, click an existing opening to select it and toggle a trim from the dress panel.
 const studio=()=>page.locator('canvas').evaluateAll(cs=>JSON.parse(cs.find(c=>c.dataset.cityStudio)?.dataset.cityStudio||'{}'));
 const trims=()=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.stringify(JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.freeTrims??[]);});
 await page.getByRole('button',{name:'Front view',exact:true}).click();await page.waitForTimeout(800);
 await page.keyboard.press('4');await page.getByRole('button',{name:'Freeform',exact:true}).click();await page.getByRole('button',{name:'Cut Window',exact:true}).click();await page.waitForTimeout(400);
 let target=null;for(const b of (await studio()).bays.filter(b=>b.x>150&&b.x<1450&&b.y>120&&b.y<650)){await page.mouse.move(b.x,b.y);await page.waitForTimeout(180);const st=await studio();if(st.hover===b.id&&!st.freeGhost){target=b;break;}}
 assert.ok(target,'an existing free opening under the pointer');
 await page.mouse.click(target.x,target.y);
 const dress=page.getByRole('group',{name:'Dress this opening'});await dress.waitFor({timeout:5000});
 const before=await trims(),toggle=dress.getByRole('button').first();const pressed=await toggle.getAttribute('aria-pressed');await toggle.click();
 await page.waitForFunction(b=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.stringify(JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.freeTrims??[])!==b;},before,{timeout:15000});
 await page.waitForFunction(p=>document.querySelector('[aria-label="Dress this opening"] button')?.getAttribute('aria-pressed')!==p,pressed,{timeout:5000});
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000});await page.waitForTimeout(600);
 await page.screenshot({path:`output/city-studio-trims-dress${suffix}.png`});
 await toggle.click();await page.waitForFunction(p=>document.querySelector('[aria-label="Dress this opening"] button')?.getAttribute('aria-pressed')===p,pressed,{timeout:15000});
 assert.deepEqual(errors.filter(e=>!/favicon|ResizeObserver/.test(e)),[]);
 console.log(`Trim parts (${backend}): ${stats.placements} placements, ${stats.instances} instances in ${stats.batches} batches, ${stats.triangles} triangles.`);
}finally{await browser.close();}
