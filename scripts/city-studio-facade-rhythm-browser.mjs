// Facade rhythm: generated openings for each style, re-laid when a part is resized, and unpacked
// (materialized) into manual openings with their trims. Needs a running dev server (CITY_TEST_ORIGIN).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180';
const only=process.env.RHYTHM_ONLY?.split(',');
const SCENES=[
 {name:'townhouse',style:'townhouse',family:'pastel-stucco',roof:'mansard',volumes:[{id:'main',x:0,z:0,width:11,depth:9,spanFloors:4},{id:'wing',x:7.6,z:-1.5,width:5,depth:6,spanFloors:3}]},
 {name:'shopfront',style:'shopfront',family:'warm-brick',roof:'terrace',volumes:[{id:'main',x:0,z:0,width:14,depth:9,spanFloors:3}]},
 {name:'civic',style:'civic',family:'pale-limestone',roof:'terrace',volumes:[{id:'main',x:0,z:0,width:17,depth:10,spanFloors:3}]},
 {name:'cottage',style:'cottage',family:'pastel-stucco',roof:'pitched',volumes:[{id:'main',x:0,z:0,width:10,depth:7,spanFloors:2},{id:'wing',x:6.5,z:-1,width:4,depth:5,spanFloors:1}]},
 {name:'warehouse',style:'warehouse',family:'warm-brick',roof:'pitched',volumes:[{id:'main',x:0,z:0,width:16,depth:10,spanFloors:3}]},
 {name:'loft',style:'loft',family:'warm-brick',roof:'terrace',volumes:[{id:'main',x:0,z:0,width:13,depth:9,spanFloors:5}]},
 {name:'townhouse-wide',style:'townhouse',family:'pastel-stucco',roof:'mansard',volumes:[{id:'main',x:0,z:0,width:17,depth:9,spanFloors:4},{id:'wing',x:10.5-2.5,z:-5,width:5,depth:6,spanFloors:3}]},
 {name:'townhouse-materialized',style:'townhouse',family:'pastel-stucco',roof:'mansard',trims:'rich',materialize:{shapeId:'main',side:'north'},volumes:[{id:'main',x:0,z:0,width:11,depth:9,spanFloors:4},{id:'wing',x:7.6,z:-1.5,width:5,depth:6,spanFloors:3}]},
];
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const results=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 for(const scene of SCENES.filter(s=>!only||only.includes(s.name))){
  const info=await page.evaluate(async scene=>{
   const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft,validateStudio}=await import('/src/domain/cityStudio.ts');
   const {newFacadeRhythm,materializeFacadeRhythm,expandFacadeRhythm}=await import('/src/domain/cityStudioFacadeRhythm.ts'),{resolveSculpt}=await import('/src/domain/citySculpt.ts');
   const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
   plot.owner=LAND_OWNER;plot.purchaseId='facade-rhythm-browser';plot.revision=(plot.revision??0)+1;
   const draft=studioExample(initialLandDraft(plot),0,plot.size);let r=draft.sculpt;
   r.volumes=scene.volumes.map(v=>({kind:'rectangle',operation:'add',startFloor:0,...v}));
   Object.assign(r.studio,{openings:[],assemblies:[],surfaces:[],stamps:undefined,variation:undefined,freeOpenings:undefined,freeTrims:undefined,roofOpenings:undefined,roofDetails:undefined,parts:{}});
   r.studio.defaults.family=scene.family;r.studio.defaults.roof=scene.roof;
   r.studio.facadeRhythm={...newFacadeRhythm(scene.style,3),...(scene.trims?{trims:scene.trims}:{})};
   let d={...studioDraft(draft,r).design,floors:Math.max(...r.volumes.map(v=>v.startFloor+v.spanFloors))};
   if(scene.materialize){const m=materializeFacadeRhythm(r,d,scene.materialize);if('reason' in m)return {error:m.reason};r=m.recipe;}
   const error=validateStudio(r);if(error)return {error};
   plot.draft=studioDraft(draft,r);plot.draft.design.floors=Math.max(...r.volumes.map(v=>v.startFloor+v.spanFloors));d=plot.draft.design;localStorage.setItem(key,JSON.stringify(world));
   const t=performance.now(),studio=resolveSculpt(r,d).studio,ms=performance.now()-t;
   return {ms,inactive:studio.inactive,faces:(studio.freeFaces??[]).map(f=>`${f.id}:${f.groups.map(g=>g.role[0]).join('')}`),openings:(studio.freeFaces??[]).reduce((n,f)=>n+f.groups.reduce((m,g)=>m+g.members.length,0),0),trims:(studio.freeTrims??r.studio.freeTrims??[]).length,manual:(r.studio.freeOpenings??[]).length};
  },scene);
  assert.ok(!info.error,`${scene.name}: ${info.error}`);
  assert.deepEqual(info.inactive,[],`${scene.name}: every generated opening fits`);
  assert.ok(info.faces.length>0&&info.faces.some(f=>f.includes('d')),`${scene.name}: generated faces with a door`);
  if(scene.materialize)assert.ok(info.manual>0,'materialized into manual openings');
  await page.reload();
  await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
  await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000}).catch(async e=>{await page.screenshot({path:'output/city-studio-facade-rhythm-failure.png'});throw e;});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:60000}).catch(()=>{});
  await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000}).catch(()=>{});
  await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(2600);
  const box=await page.locator('canvas').first().boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height*.45;
  // Three-quarter view: orbit left a little so the front and one side read together.
  await page.mouse.move(cx+200,cy);await page.mouse.down({button:'right'});for(let i=1;i<=10;i++){await page.mouse.move(cx+200-i*9,cy+i*1.5);await page.waitForTimeout(30);}await page.mouse.up({button:'right'});
  await page.mouse.move(cx,box.y+120);await page.waitForTimeout(2200);
  const path=`output/city-studio-facade-rhythm-${scene.name}${suffix}.png`;await page.screenshot({path});
  results.push({scene:scene.name,...info,path});console.log(JSON.stringify(results.at(-1)));
 }
 assert.deepEqual(errors.filter(e=>!/favicon|ResizeObserver/.test(e)),[]);
 const town=results.find(r=>r.scene==='townhouse'),wide=results.find(r=>r.scene==='townhouse-wide');
 if(town&&wide)assert.ok(wide.openings>town.openings,'the wider townhouse re-lays with more openings');
 console.log(`Facade rhythm (${backend}): ${results.map(r=>`${r.scene} ${r.openings} openings/${r.trims} trims ${r.ms.toFixed(0)} ms`).join(', ')}`);
}finally{await browser.close();}
