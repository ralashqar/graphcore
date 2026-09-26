// Roof openings spike: skylights and dormers on a gable roof and a hipped wing, rendered on WebGPU (or CITY_BACKEND=webgl).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:950},deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://localhost:5180'}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:60000});
 await page.evaluate(async()=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='roof-openings-browser';plot.revision=1;
  const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
  r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:-1.5,z:0,width:11,depth:9,startFloor:0,spanFloors:2},{id:'wing',kind:'rectangle',operation:'add',x:6.6,z:.5,width:5,depth:7,startFloor:0,spanFloors:1}];
  Object.assign(r.studio,{openings:[],assemblies:[],stamps:undefined,variation:undefined,roofDetails:undefined,roofRevision:'roof-envelope-2'});r.studio.defaults.family='pastel-stucco';r.studio.defaults.roof='pitched';
  r.studio.parts={main:{roof:'pitched',roofSettings:{rise:3.8,overhang:.3,ridge:'x',finish:'slate'}},wing:{family:'warm-brick',roof:'hip',roofSettings:{rise:2.6,overhang:.3,ridge:'x',finish:'terracotta'}}};
  r.studio.roofOpenings=[
   {id:'sky-a',partId:'main',facing:0,u:.13,v:.55,width:.9,height:1.3,kind:'skylight'},
   {id:'gable',partId:'main',facing:0,u:.42,v:.22,width:1.7,height:1.45,kind:'dormer',roof:'gable',shape:'rect'},
   {id:'arched',partId:'main',facing:0,u:.72,v:.22,width:1.6,height:1.7,kind:'dormer',roof:'gable',shape:'arch'},
   {id:'sky-b',partId:'main',facing:0,u:.92,v:.6,width:.8,height:1.1,kind:'skylight'},
   {id:'shed',partId:'main',facing:180,u:.45,v:.22,width:3.4,height:1.35,kind:'dormer',roof:'shed',shape:'rect'},
   {id:'wing-sky',partId:'wing',facing:180,u:.5,v:.35,width:.8,height:1.1,kind:'skylight'},
   {id:'wing-dormer',partId:'wing',facing:0,u:.5,v:.15,width:1.4,height:1.2,kind:'dormer',roof:'flat',shape:'rect'},
  ];
  plot.draft=studioDraft(draft,r);localStorage.setItem(key,JSON.stringify(world));
 });
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:60000}).catch(()=>{});
 const report=await page.evaluate(async()=>{
  const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),plot=JSON.parse(localStorage.getItem(key)).plots.find(p=>p.purchaseId==='roof-openings-browser');
  resolveSculpt(plot.draft.sculpt,plot.draft.design);const started=performance.now(),out=resolveSculpt(plot.draft.sculpt,plot.draft.design).studio,ms=performance.now()-started;
  const bare=structuredClone(plot.draft.sculpt);delete bare.studio.roofOpenings;resolveSculpt(bare,plot.draft.design);const s2=performance.now();resolveSculpt(bare,plot.draft.design);const baseMs=performance.now()-s2;
  return {ms,baseMs,inactive:out.inactive,parts:(out.roofOpenings??[]).map(p=>({part:p.partId,openings:p.openings.map(o=>o.id),triangles:p.geometry.triangles}))};
 });
 console.log(JSON.stringify(report));
 assert.deepEqual(report.inactive,[],'every roof opening fits');
 assert.equal(report.parts.reduce((n,p)=>n+p.openings.length,0),7);
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(2500);
 await page.screenshot({path:`output/city-studio-roof-openings${suffix}.png`});
 const box=await page.locator('canvas').first().boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height*.42;
 const zoom=async(n,y=cy)=>{await page.mouse.move(cx,y);for(let i=0;i<n;i++){await page.mouse.wheel(0,-240);await page.waitForTimeout(80);}await page.mouse.move(cx,box.y+120);await page.waitForTimeout(1800);};
 const orbit=async(dx,dy=0)=>{await page.mouse.move(cx+200,cy);await page.mouse.down({button:'right'});for(let i=1;i<=12;i++){await page.mouse.move(cx+200+dx*i/12,cy+dy*i/12);await page.waitForTimeout(30);}await page.mouse.up({button:'right'});await page.mouse.move(cx,box.y+120);await page.waitForTimeout(1800);};
 const pan=async(dx,dy)=>{await page.mouse.move(cx,cy);await page.mouse.down({button:'middle'});for(let i=1;i<=12;i++){await page.mouse.move(cx+dx*i/12,cy+dy*i/12);await page.waitForTimeout(30);}await page.mouse.up({button:'middle'});await page.waitForTimeout(600);};
 await pan(0,95);await zoom(14,cy-40);await page.screenshot({path:`output/city-studio-roof-openings-close${suffix}.png`});
 await page.screenshot({path:`output/city-studio-roof-openings-zoom${suffix}.png`,clip:{x:500,y:430,width:520,height:260}});
 await orbit(-90,60);await page.screenshot({path:`output/city-studio-roof-openings-angle${suffix}.png`});
 await orbit(-120,-40);await page.screenshot({path:`output/city-studio-roof-openings-side${suffix}.png`});
 await orbit(-380,0);await page.screenshot({path:`output/city-studio-roof-openings-back${suffix}.png`});
 // UI: add a skylight by clicking a free patch of slope, then a dormer; restyle the dormer and remove it.
 const studio=()=>page.locator('canvas').evaluateAll(cs=>JSON.parse(cs.find(c=>c.dataset.cityStudio)?.dataset.cityStudio||'{}'));
 const roofs=()=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.roofOpenings??[];});
 const before=(await roofs()).length;
 await page.getByRole('button',{name:'Orbit view',exact:true}).click();await page.waitForTimeout(800);
 await page.keyboard.press('2');await page.getByRole('button',{name:'Add Skylight',exact:true}).click();await page.waitForTimeout(400);
 const view=await page.locator('canvas').first().boundingBox();let spot=null;
 for(let gy=0;gy<14&&!spot;gy+=2)for(let gx=0;gx<16&&!spot;gx+=2){const x=view.x+view.width*(.36+gx*.018),y=view.y+view.height*(.34+gy*.016);await page.mouse.move(x,y);await page.waitForTimeout(180);const g=(await studio()).roofGhost;if(g?.valid)spot={x,y};}
 assert.ok(spot,'a slope where the skylight ghost fits');await page.screenshot({path:`output/city-studio-roof-openings-ghost${suffix}.png`});
 await page.mouse.click(spot.x,spot.y);
 await page.waitForFunction(n=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return (JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.roofOpenings??[]).length===n+1;},before,{timeout:15000});
 const added=(await roofs()).at(-1);assert.equal(added.kind,'skylight');
 const panel=page.getByRole('group',{name:'Selected roof opening'});await panel.waitFor({timeout:5000});
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000});await page.waitForTimeout(600);
 await page.screenshot({path:`output/city-studio-roof-openings-placed${suffix}.png`});
 await panel.getByRole('button',{name:'Remove this roof opening',exact:true}).click();
 await page.waitForFunction(n=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return (JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.roofOpenings??[]).length===n;},before,{timeout:15000});
 assert.deepEqual(errors.filter(e=>!/favicon|ResizeObserver/.test(e)),[]);
 console.log(`Roof openings (${backend}): ${report.parts.map(p=>`${p.part} ${p.openings.length} openings/${p.triangles} tris`).join(', ')}; resolveSculpt ${report.ms.toFixed(1)} ms with openings vs ${report.baseMs.toFixed(1)} ms without (page thread).`);
}finally{await browser.close();}
