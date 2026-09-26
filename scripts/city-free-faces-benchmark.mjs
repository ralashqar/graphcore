/**
 * Free-opening City benchmark: many local studio plots dressed with free openings, trims, skylights and
 * dormers, next to the usual populated background (72 fixture properties by default). Reports draw calls,
 * triangles, frame p50/p95/p99 (standing and driving), worker prepare round trips and studio
 * edit-to-frame latency for a free-opening drag.
 * Needs the Vite dev server (DEV datasets): CITY_TEST_ORIGIN (default http://localhost:5180).
 * Env: CITY_BACKEND=webgl, CITY_BENCH_LABEL (before/after), CITY_BENCH_PLOTS (default 12),
 *      CITY_BENCH_BACKGROUND (default 72), CITY_BENCH_VARIANTS (default kit,free).
 * Writes output/city-free-faces-benchmark.json (rows replaced per label/backend/variant/plots).
 */
import {chromium} from 'playwright';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180',backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',label=process.env.CITY_BENCH_LABEL||'current';
const plotCount=Number(process.env.CITY_BENCH_PLOTS||12),background=Number(process.env.CITY_BENCH_BACKGROUND??72),variants=(process.env.CITY_BENCH_VARIANTS||'kit,free').split(',');
const file='output/city-free-faces-benchmark.json',same=r=>r.label===label&&r.backend===backend&&r.plots===plotCount&&r.background===background;
let results=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const pct=(list,p)=>{const s=[...list].sort((a,b)=>a-b);return s.length?+s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(2):null;};
try{for(const variant of variants){
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('city-scene-look-v1',JSON.stringify({look:'daylight',quality:'balanced',occlusion:'architectural'})));
 await page.goto(`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 const seeded=await page.evaluate(async({variant,plotCount,background})=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts'),{setFreeTrims}=await import('/src/domain/cityStudioTrimParts.ts'),{resolveSculpt}=await import('/src/domain/citySculpt.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key));
  if(background>0){
   const {cityPlots,emptyCityProfile,buildingTier}=await import('/src/domain/city.ts'),{newDesign}=await import('/src/domain/cityBuildingV3.ts');
   const local=new Set(world.plots.slice(0,Math.max(40,plotCount*3)).map(p=>`${p.x}:${p.z}`));
   world.occupied=cityPlots(500).filter(p=>!local.has(`${p.x}:${p.z}`)).slice(0,background).map((p,i)=>({...p,id:`fixture-${i}`,slug:`fixture-${i}`,rank:i+1,tier:buildingTier(10000),landValue:10000,saves:0,claims:0,profile:{...emptyCityProfile(),name:`Fixture ${i+1}`,buildingDesign:newDesign(`drive-${i%6}`),website:'https://example.com'}}));
   const occupied=new Set(world.occupied.map(p=>`${p.x}:${p.z}`));world.plots=world.plots.filter(p=>!occupied.has(`${p.x}:${p.z}`));
  }
  const families=['pastel-stucco','warm-brick','pastel-stucco'],report=[];
  // The test plot plus its nearest free plots, so the studio view looks across the others at 24-100 m.
  const {landPosition}=await import('/src/domain/cityLand.ts'),o=landPosition(world.plots[0]),near=[...world.plots].sort((a,b)=>{const p=landPosition(a),q=landPosition(b);return Math.hypot(p.x-o.x,p.z-o.z)-Math.hypot(q.x-o.x,q.z-o.z);});
  for(const [i,plot] of near.slice(0,plotCount).entries()){
   plot.owner=LAND_OWNER;plot.purchaseId=`free-faces-bench-${i}`;plot.revision=1;
   const draft=studioExample(initialLandDraft(plot),0,plot.size);let r=draft.sculpt;
   r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:-1.5,z:0,width:11,depth:9,startFloor:0,spanFloors:2},{id:'wing',kind:'rectangle',operation:'add',x:6.6,z:.5,width:5,depth:7,startFloor:0,spanFloors:1}];
   Object.assign(r.studio,{openings:[],assemblies:[],stamps:undefined,variation:undefined,roofDetails:undefined,roofRevision:'roof-envelope-2'});
   r.studio.defaults.family=families[i%3];r.studio.defaults.roof='pitched';
   r.studio.parts={main:{roof:'pitched',roofSettings:{rise:3.8,overhang:.3,ridge:'x',finish:'slate'}},wing:{family:'warm-brick',roof:'hip',roofSettings:{rise:2.6,overhang:.3,ridge:'x',finish:'terracotta'}}};
   if(variant==='free'){
    const at=(id,side,x,bottom,width,height,shape,extra={})=>({id,shapeId:'main',side,u:x/11,bottom,width,height,shape,...extra});
    r.studio.freeOpenings=[
     at('n-door','north',5.5,0,1.3,2.5,'arch',{style:'timber'}),at('n-g1','north',1.4,.9,1,1.6,'rect'),at('n-g2','north',3.2,.9,1,1.6,'arch',{style:'stone'}),at('n-g3','north',7.8,.9,1,1.6,'rect'),at('n-g4','north',9.6,.9,1,1.6,'arch',{style:'stone'}),
     at('n-u1','north',1.4,4.2,1,1.5,'rect'),at('n-u2','north',3.2,4.1,1,1.7,'pointed',{style:'stone'}),at('n-u3','north',5.5,4.3,1.1,1.1,'round',{style:'stone'}),at('n-u4','north',7.8,4.1,1,1.7,'pointed',{style:'stone'}),at('n-u5','north',9.6,4.2,1,1.5,'rect'),
     at('s-g1','south',2.5,.9,1.8,1.6,'rect'),at('s-g2','south',8.5,.9,1.8,1.6,'rect'),at('s-u1','south',2.5,4.2,1,1.5,'rect'),at('s-u2','south',5.5,4.1,1,1.7,'arch'),at('s-u3','south',8.5,4.2,1,1.5,'rect'),
     {id:'w-door',shapeId:'wing',side:'east',u:.35,bottom:0,width:1.2,height:2.5,shape:'pointed',style:'stone'},{id:'w-win',shapeId:'wing',side:'east',u:.75,bottom:.9,width:1.4,height:1.5,shape:'rect'},
    ];
    r.studio.roofOpenings=[
     {id:'sky-a',partId:'main',facing:0,u:.13,v:.55,width:.9,height:1.3,kind:'skylight'},{id:'gable',partId:'main',facing:0,u:.42,v:.22,width:1.7,height:1.45,kind:'dormer',roof:'gable',shape:'rect'},
     {id:'shed',partId:'main',facing:180,u:.45,v:.22,width:3.4,height:1.35,kind:'dormer',roof:'shed',shape:'rect'},{id:'wing-sky',partId:'wing',facing:180,u:.5,v:.35,width:.8,height:1.1,kind:'skylight'},
    ];
    if(i%2===0)for(const [id,kinds] of Object.entries({'n-door':['canopy','lamps'],'n-g1':['shutters','sill-brackets'],'n-g2':['keystone','shutters'],'n-g3':['shutters','sill-brackets'],'n-g4':['keystone'],'n-u1':['shutters','hood','sill-brackets'],'n-u2':['keystone'],'n-u4':['keystone'],'n-u5':['hood','shutters'],'s-g1':['lintel','shutters'],'s-u1':['window-box','hood'],'s-u2':['keystone','window-box'],'s-u3':['window-box','hood'],'w-door':['keystone','lamps'],'w-win':['hood','shutters']}))r=setFreeTrims(r,id,kinds);
   }
   const d=studioDraft(draft,r);plot.draft=d;plot.finished=structuredClone(d);
   const out=resolveSculpt(d.sculpt,d.design).studio;report.push({plot:plot.id,inactive:out.inactive,faces:out.freeFaces?.length??0,faceTriangles:(out.freeFaces??[]).reduce((n,f)=>n+f.geometry.triangles,0),roofTriangles:(out.roofOpenings??[]).reduce((n,p)=>n+p.geometry.triangles,0)});
  }
  localStorage.setItem(key,JSON.stringify(world));return report;
 },{variant,plotCount,background});
 const inactive=seeded.flatMap(s=>s.inactive);if(inactive.length)console.warn(`inactive (${variant}):`,JSON.stringify(inactive.slice(0,8)));
 await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();
 await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.cityPreparedBuildings)>=Number(document.querySelector('[data-city-resident-count]')?.getAttribute('data-city-resident-count')),null,{timeout:360000});
 // Settle: render stats (sampled once a second) stop changing once the sculpt workers, kit and trims land.
 const loadStarted=Date.now();let last='',stable=0;while(Date.now()-loadStarted<90000&&stable<4){await page.waitForTimeout(1000);const s=await page.evaluate(()=>document.querySelector('canvas')?.dataset.cityRenderStats??'');const t=JSON.parse(s||'{}').triangles;if(t&&t===JSON.parse(last||'{}').triangles)stable++;else stable=0;last=s;}
 await page.waitForTimeout(1500);
 const record=()=>page.evaluate(()=>{window.fbFrames=[];window.fbStats=[];window.fbOn=true;let t0=performance.now();const step=t=>{if(!window.fbOn)return;window.fbFrames.push(t-t0);t0=t;requestAnimationFrame(step);};requestAnimationFrame(step);window.fbTimer=setInterval(()=>{const s=document.querySelector('canvas')?.dataset.cityRenderStats;if(s)window.fbStats.push(JSON.parse(s));},250);});
 const stop=async()=>{const {frames,stats}=await page.evaluate(()=>{window.fbOn=false;clearInterval(window.fbTimer);return {frames:window.fbFrames.slice(2),stats:window.fbStats};});
  const mean=k=>stats.length?Math.round(stats.reduce((n,s)=>n+(s[k]??0),0)/stats.length):null,max=k=>stats.length?Math.max(...stats.map(s=>s[k]??0)):null;
  return {frames:frames.length,p50:pct(frames,.5),p95:pct(frames,.95),p99:pct(frames,.99),max:pct(frames,1),over50:frames.filter(f=>f>50).length,calls:mean('calls'),callsMax:max('calls'),triangles:mean('triangles'),trianglesMax:max('triangles'),geometries:max('geometries'),gpuMB:stats.length?+(max('gpuBytes')/1048576).toFixed(1):null};};
 await record();await page.waitForTimeout(4000);const standing=await stop();
 await record();await page.keyboard.down('w');await page.waitForTimeout(4000);await page.keyboard.down('a');await page.waitForTimeout(1200);await page.keyboard.up('a');await page.waitForTimeout(2500);await page.keyboard.up('w');const driving=await stop();
 // Worker round trips (background lane, cache-busted) versus the same resolve on the page thread.
 const prepare=await page.evaluate(async()=>{
  const {prepareSculpt}=await import('/src/features/city/citySculptService.ts'),{resolveSculpt}=await import('/src/domain/citySculpt.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),plots=JSON.parse(localStorage.getItem(key)).plots.filter(p=>p.purchaseId?.startsWith('free-faces-bench-')).slice(0,6),round=[],page=[],worker=[],merge=[],batches=[];
  for(const [k,p] of plots.entries()){const r=structuredClone(p.finished.sculpt);r.volumes[0].x+=.001*(k+1)+Math.random()*1e-4;
   let t=performance.now();const out=await prepareSculpt(r,p.finished.design,false);round.push(performance.now()-t);if(out.timing){worker.push(out.timing.resolveMs);merge.push(out.timing.mergeMs);}if(out.details)batches.push(out.details.batches.length);t=performance.now();resolveSculpt(r,p.finished.design);page.push(performance.now()-t);}
  const avg=a=>+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1);return {roundTripMs:avg(round),roundTripMax:+Math.max(...round).toFixed(1),pageResolveMs:avg(page),...(worker.length?{workerResolveMs:avg(worker),workerMergeMs:avg(merge)}:{}),...(batches.length?{detailBatchesPerBuilding:avg(batches)}:{})};
 });
 // Studio edit: slide one free opening (or nudge the volume on the kit variant) through the preview lane.
 await page.getByRole('button',{name:'Visit test plot'}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:60000});await page.waitForTimeout(3000);
 // Studio view over the neighbouring seeded plots: pull the camera back, measure, optionally compare LODs.
 await page.getByRole('button',{name:'Orbit view',exact:true}).click().catch(()=>{});await page.waitForTimeout(1200);for(let i=0;i<6;i++){await page.mouse.move(640,300);await page.mouse.wheel(0,400);await page.waitForTimeout(120);}await page.mouse.move(640,120);await page.waitForTimeout(2500);
 await record();await page.waitForTimeout(4000);const studioView=await stop();
 if(process.env.CITY_BENCH_SHOTS&&variant==='free'){for(const lod of ['near','far']){await page.evaluate(l=>{window.__cityStudioDetailForce=l;},lod);await page.waitForTimeout(1500);await page.screenshot({path:`output/city-free-faces-lod-${lod}${backend==='webgl'?'-webgl':''}.png`});}await page.evaluate(()=>{delete window.__cityStudioDetailForce;});await page.waitForTimeout(1000);}
 await record();
 const edits=await page.evaluate(async(variant)=>{
  const {setSculptPreview,clearSculptPreview,sculptPreviewSnapshot}=await import('/src/features/city/citySculptPreview.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),plot=JSON.parse(localStorage.getItem(key)).plots.find(p=>p.owner),canvas=document.querySelector('canvas'),out=[];
  for(let k=1;k<=16;k++){const r=structuredClone(plot.draft.sculpt);if(variant==='free'){const o=r.studio.freeOpenings.find(o=>o.id==='n-u2');o.u+=.004*k;}else r.volumes[0].x+=.02*k;
   setSculptPreview(plot.id,r,plot.draft.design);const revision=sculptPreviewSnapshot(plot.id).revision,started=performance.now();
   while(performance.now()-started<5000){const d=JSON.parse(canvas.dataset.citySculptPreview||'{}');if(d.revision===revision){out.push(d);break;}await new Promise(res=>requestAnimationFrame(res));}
   await new Promise(res=>setTimeout(res,150));}
  clearSculptPreview(plot.id);return out;
 },variant);
 const edit=await stop(),ready=edits.filter(e=>e.state==='ready');
 const row={label,backend,variant,plots:plotCount,background,seeded:{faces:seeded.reduce((n,s)=>n+s.faces,0),faceTriangles:seeded.reduce((n,s)=>n+s.faceTriangles,0),roofTriangles:seeded.reduce((n,s)=>n+s.roofTriangles,0),inactive:inactive.length},standing,driving,studioView,prepare,
  edit:{samples:ready.length,workerMs:pct(ready.map(e=>e.workerMs),.5),frameMsP50:pct(ready.map(e=>e.frameMs),.5),frameMsP95:pct(ready.map(e=>e.frameMs),.95),frameP95:edit.p95,frameP99:edit.p99,frameMax:edit.max,calls:edit.calls,triangles:edit.triangles},errors:errors.filter(e=>!/favicon|ResizeObserver/.test(e))};
 results=results.filter(r=>!(same(r)&&r.variant===variant));results.push(row);writeFileSync(file,JSON.stringify(results,null,2));console.log(JSON.stringify(row));await page.close();
}}finally{await browser.close();}
