/**
 * City-scale generated walls (docs/city-generated-walls-at-scale.md): fills the demo city's land plots with owned
 * studio buildings and measures the map and driving views, worker preparation, memory and studio edit latency.
 *
 * Buildings (per plot index i, deterministic):
 *   i%6 0-2  New York presets (cycled). `unified`: converted with convertToUnifiedFacade; `kit`: as authored.
 *   i%6 3-4  rhythm buildings (six styles, seed i).              `kit`: the same volumes without a rhythm.
 *   i%6 5    curved (round tower + oval wing) with a rhythm.     `kit`: the same volumes without a rhythm.
 *   the test plot (the edit target) is the 17-opening free-face building of city-free-faces-benchmark.mjs.
 * Views: map (default camera zoomed out), map zoomed in, map pan, drive spawn standing and driving, the studio pulled
 * back over its neighbours; screenshots map, map-zoomed, drive, studio and studio-far (every unedited plot pinned far)
 * with CITY_BENCH_SHOTS=1, compared by scripts/city-generated-walls-parity.mjs.
 *
 * Needs the Vite dev server (DEV datasets): CITY_TEST_ORIGIN (default http://localhost:5180).
 * Env: CITY_BACKEND=webgl, CITY_BENCH_LABEL (default current), CITY_BENCH_VARIANTS (default unified,kit),
 *      CITY_BENCH_PLOTS (land plots to fill, nearest the first plot; default all: the 396 estate plots of the 400-address
 *      city), CITY_BENCH_BACKGROUND (fixture businesses in a ring outside them, default 0), CITY_BENCH_PATH (batched|building: sets
 *      ?cityGwBatch=0 for the per-building path), CITY_BENCH_QUERY (extra URL parameters, e.g. &cityGwKitFar=100000),
 *      CITY_BENCH_SHOTS=1, CITY_BENCH_EDIT=0 to skip the studio (edit test and studio shots), CITY_BENCH_FORCE (JSON for
 *      window.__cityGwForce, e.g. {"overlay":"far"}), CITY_BENCH_VERBOSE=1 (log the settle samples).
 * Writes output/city-generated-walls-benchmark.json (rows replaced per label/backend/variant/plots/path).
 */
import {chromium} from 'playwright';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180',backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',label=process.env.CITY_BENCH_LABEL||'current';
const plotsWanted=process.env.CITY_BENCH_PLOTS&&process.env.CITY_BENCH_PLOTS!=='all'?Number(process.env.CITY_BENCH_PLOTS):Infinity,background=Number(process.env.CITY_BENCH_BACKGROUND??0);
const variants=(process.env.CITY_BENCH_VARIANTS||'unified,kit').split(','),path=process.env.CITY_BENCH_PATH||'default',shots=!!process.env.CITY_BENCH_SHOTS,editTest=process.env.CITY_BENCH_EDIT!=='0';
const file='output/city-generated-walls-benchmark.json';mkdirSync('output',{recursive:true});
let results=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-precise-memory-info']});
const pct=(list,p)=>{const s=[...list].sort((a,b)=>a-b);return s.length?+s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(2):null;};
const suffix=backend==='webgl'?'-webgl':'';
try{for(const variant of variants){
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|GL_INVALID|WGSL|GPUValidation/i.test(m.text()))errors.push(m.text());});
 if(process.env.CITY_BENCH_FORCE)await page.addInitScript(f=>{window.__cityGwForce=JSON.parse(f);},process.env.CITY_BENCH_FORCE);// e.g. {"overlay":"far"}
 await page.addInitScript(()=>localStorage.setItem('city-scene-look-v1',JSON.stringify({look:'daylight',quality:'balanced',occlusion:'architectural'})));
 const url=`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}${path==='building'?'&cityGwBatch=0':''}${process.env.CITY_BENCH_QUERY||''}`;
 await page.goto(url);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-48-')),null,{timeout:90000});
 const seeded=await page.evaluate(async({variant,plotsWanted,background})=>{
  const {initialLandDraft,LAND_OWNER,landPosition}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft,validateStudio}=await import('/src/domain/cityStudio.ts');
  const {nycPreset,NYC_PRESETS}=await import('/src/domain/cityNycPresets.ts'),{convertToUnifiedFacade}=await import('/src/domain/cityStudioUnifiedFacade.ts'),{newFacadeRhythm}=await import('/src/domain/cityStudioFacadeRhythm.ts');
  // The demo uses the estate layout (48 m plots); other saved test worlds only take quota.
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-48-')),world=JSON.parse(localStorage.getItem(key));
  for(const k of Object.keys(localStorage))if(k.startsWith('city-land-v1-')&&k!==key)localStorage.removeItem(k);
  // Fresh world: every estate position of the 400-address city is a land plot (the demo's 72 businesses move to
  // an outer ring, CITY_BENCH_BACKGROUND of them, default none), so the studio plots fill the middle of the map.
  const {createLandWorld}=await import('/src/domain/cityLand.ts');
  world.plots=createLandWorld([],world.capacity,world.size).plots;
  {
   const {cityPlots,emptyCityProfile,buildingTier}=await import('/src/domain/city.ts'),{newDesign}=await import('/src/domain/cityBuildingV3.ts');
   const local=new Set(world.plots.map(p=>`${p.x}:${p.z}`));
   world.occupied=cityPlots(world.capacity+background+100).filter(p=>!local.has(`${p.x}:${p.z}`)).slice(0,background).map((p,i)=>({...p,id:`fixture-${i}`,slug:`fixture-${i}`,rank:i+1,tier:buildingTier(10000),landValue:10000,saves:0,claims:0,profile:{...emptyCityProfile(),name:`Fixture ${i+1}`,buildingDesign:newDesign(`drive-${i%6}`),website:'https://example.com'}}));
  }
  const RHYTHM=['townhouse','shopfront','civic','cottage','warehouse','loft'],families=['pastel-stucco','warm-brick','pale-limestone'];
  const RHYTHM_VOLUMES={townhouse:[{id:'main',x:0,z:0,width:11,depth:9,spanFloors:4},{id:'wing',x:7.6,z:-1.5,width:5,depth:6,spanFloors:3}],shopfront:[{id:'main',x:0,z:0,width:14,depth:9,spanFloors:3}],civic:[{id:'main',x:0,z:0,width:17,depth:10,spanFloors:3}],cottage:[{id:'main',x:0,z:0,width:10,depth:7,spanFloors:2},{id:'wing',x:6.5,z:-1,width:4,depth:5,spanFloors:1}],warehouse:[{id:'main',x:0,z:0,width:16,depth:10,spanFloors:3}],loft:[{id:'main',x:0,z:0,width:13,depth:9,spanFloors:5}]};
  const ROOF={townhouse:'mansard',shopfront:'terrace',civic:'terrace',cottage:'pitched',warehouse:'pitched',loft:'terrace'};
  const clean=r=>Object.assign(r.studio,{openings:[],assemblies:[],surfaces:[],stamps:undefined,variation:undefined,facadeRhythm:undefined,freeOpenings:undefined,freeTrims:undefined,roofOpenings:undefined,roofDetails:undefined,paintRegions:undefined,parts:{}});
  const build=(plot,i)=>{
   const base=initialLandDraft(plot),kind=i%6;
   if(kind<=2){const d=nycPreset(base,(Math.floor(i/6)*3+kind)%NYC_PRESETS.length,plot.size);if(variant==='kit')return {draft:d,type:'nyc'};const out=convertToUnifiedFacade(d.sculpt,d.design);if('reason' in out)return {error:out.reason};return {draft:studioDraft(d,out.recipe),type:'nyc'};}
   const draft=studioExample(base,0,plot.size),r=draft.sculpt;clean(r);
   if(kind<=4){const style=RHYTHM[(Math.floor(i/6)*2+kind-3)%6];r.volumes=RHYTHM_VOLUMES[style].map(v=>({kind:'rectangle',operation:'add',startFloor:0,...v}));r.studio.defaults.family=families[i%3];r.studio.defaults.roof=ROOF[style];
    if(variant!=='kit')r.studio.facadeRhythm={...newFacadeRhythm(style,i),trims:i%12===3?'rich':undefined};const d=studioDraft(draft,r);d.design.floors=Math.max(...r.volumes.map(v=>v.startFloor+v.spanFloors));return {draft:d,type:'rhythm'};}
   r.volumes=[{id:'tower',kind:'ellipse',operation:'add',x:-3.5,z:.5,width:7,depth:7,startFloor:0,spanFloors:4},{id:'wing',kind:'ellipse',operation:'add',x:3.5,z:0,width:9,depth:6,startFloor:0,spanFloors:2}];
   r.studio.defaults.family=families[(i+1)%3];r.studio.defaults.roof='terrace';if(variant!=='kit')r.studio.facadeRhythm={...newFacadeRhythm(RHYTHM[i%6],i),trims:'rich'};
   const d=studioDraft(draft,r);d.design.floors=4;d.design.middleFloors=3;return {draft:d,type:'curved'};
  };
  const freeFaces=plot=>{
   const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
   r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:-1.5,z:0,width:11,depth:9,startFloor:0,spanFloors:2},{id:'wing',kind:'rectangle',operation:'add',x:6.6,z:.5,width:5,depth:7,startFloor:0,spanFloors:1}];
   Object.assign(r.studio,{openings:[],assemblies:[],stamps:undefined,variation:undefined,roofDetails:undefined,roofRevision:'roof-envelope-2'});
   r.studio.defaults.family='pastel-stucco';r.studio.defaults.roof='pitched';
   r.studio.parts={main:{roof:'pitched',roofSettings:{rise:3.8,overhang:.3,ridge:'x',finish:'slate'}},wing:{family:'warm-brick',roof:'hip',roofSettings:{rise:2.6,overhang:.3,ridge:'x',finish:'terracotta'}}};
   const at=(id,side,x,bottom,width,height,shape,extra={})=>({id,shapeId:'main',side,u:x/11,bottom,width,height,shape,...extra});
   r.studio.freeOpenings=[at('n-door','north',5.5,0,1.3,2.5,'arch',{style:'timber'}),at('n-g1','north',1.4,.9,1,1.6,'rect'),at('n-g2','north',3.2,.9,1,1.6,'arch',{style:'stone'}),at('n-g3','north',7.8,.9,1,1.6,'rect'),at('n-g4','north',9.6,.9,1,1.6,'arch',{style:'stone'}),
    at('n-u1','north',1.4,4.2,1,1.5,'rect'),at('n-u2','north',3.2,4.1,1,1.7,'pointed',{style:'stone'}),at('n-u3','north',5.5,4.3,1.1,1.1,'round',{style:'stone'}),at('n-u4','north',7.8,4.1,1,1.7,'pointed',{style:'stone'}),at('n-u5','north',9.6,4.2,1,1.5,'rect'),
    at('s-g1','south',2.5,.9,1.8,1.6,'rect'),at('s-g2','south',8.5,.9,1.8,1.6,'rect'),at('s-u1','south',2.5,4.2,1,1.5,'rect'),at('s-u2','south',5.5,4.1,1,1.7,'arch'),at('s-u3','south',8.5,4.2,1,1.5,'rect'),
    {id:'w-door',shapeId:'wing',side:'east',u:.35,bottom:0,width:1.2,height:2.5,shape:'pointed',style:'stone'},{id:'w-win',shapeId:'wing',side:'east',u:.75,bottom:.9,width:1.4,height:1.5,shape:'rect'}];
   r.studio.roofOpenings=[{id:'sky-a',partId:'main',facing:0,u:.13,v:.55,width:.9,height:1.3,kind:'skylight'},{id:'gable',partId:'main',facing:0,u:.42,v:.22,width:1.7,height:1.45,kind:'dormer',roof:'gable',shape:'rect'}];
   return {draft:studioDraft(draft,r),type:'free'};
  };
  const o=landPosition(world.plots[0]),near=[...world.plots].sort((a,b)=>{const p=landPosition(a),q=landPosition(b);return Math.hypot(p.x-o.x,p.z-o.z)-Math.hypot(q.x-o.x,q.z-o.z);});
  const report={plots:0,types:{},errors:[],invalid:0};
  for(const [i,plot] of near.slice(0,Math.min(near.length,plotsWanted)).entries()){
   const out=i===0?freeFaces(plot):build(plot,i-1);if(out.error){report.errors.push(out.error);continue;}
   if(validateStudio(out.draft.sculpt))report.invalid++;
   plot.owner=LAND_OWNER;plot.purchaseId=`gw-bench-${i}`;plot.revision=1;out.draft.name=`GW ${i}`;plot.finished=out.draft;plot.draft=i===0?structuredClone(out.draft):null;// finished only: 328 recipes must fit the storage quota
   report.plots++;report.types[out.type]=(report.types[out.type]??0)+1;
  }
  localStorage.setItem(key,JSON.stringify(world));return {...report,properties:world.occupied.length+report.plots};
 },{variant,plotsWanted,background});
 if(seeded.errors.length)console.warn(`seed errors (${variant}):`,seeded.errors.slice(0,5));
 const t0=Date.now();await page.reload();await page.locator('canvas').first().waitFor();
 // Loaded: every seeded plot has published its prepared studio result, then render stats stop changing.
 const published=()=>page.evaluate(async()=>{const {subscribeStudioPlots}=await import('/src/features/city/cityStudioRegistry.ts');let count=0;const stop=subscribeStudioPlots(()=>{count++;});stop();return count;});
 for(let n=0;(n=await published())<seeded.plots;){if(Date.now()-t0>600000)throw Error(`only ${n} of ${seeded.plots} plots prepared`);await page.waitForTimeout(500);}
 const prepared=Date.now()-t0;
 // Settled: draw calls and triangles unchanged for four one-second samples while frames keep arriving (a blocked
 // main thread also leaves the sampled stats unchanged, so each sample also needs at least 10 frames).
 const settle=async(limit=180000)=>{const started=Date.now();let last='',stable=0;while(Date.now()-started<limit&&stable<4){const {s,frames}=await page.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now(),tick=()=>{n++;if(performance.now()-t0<1000)requestAnimationFrame(tick);else res({s:document.querySelector('canvas')?.dataset.cityRenderStats??'',frames:n});};requestAnimationFrame(tick);}));const t=JSON.parse(s||'{}');if(process.env.CITY_BENCH_VERBOSE)console.log(`settle ${Math.round((Date.now()-t0)/1000)}s frames=${frames} calls=${t.calls} tris=${t.triangles} geos=${t.geometries}`,await page.evaluate(()=>JSON.stringify(window.__cityGwStats??{})));if(frames>=10&&t.triangles&&t.triangles===JSON.parse(last||'{}').triangles&&t.calls===JSON.parse(last||'{}').calls)stable++;else stable=0;last=s;}return Date.now()-started<limit;};
 await settle();const loaded=Date.now()-t0;await page.waitForTimeout(1500);
 const record=()=>page.evaluate(()=>{window.gwStats0=JSON.stringify(window.__cityGwStats??{});window.gwFrames=[];window.gwStats=[];window.gwOn=true;let t0=performance.now();const step=t=>{if(!window.gwOn)return;window.gwFrames.push(t-t0);t0=t;requestAnimationFrame(step);};requestAnimationFrame(step);window.gwTimer=setInterval(()=>{const s=document.querySelector('canvas')?.dataset.cityRenderStats;if(s)window.gwStats.push(JSON.parse(s));},250);});
 const stop=async()=>{const {frames,stats,heap,delta}=await page.evaluate(()=>{window.gwOn=false;clearInterval(window.gwTimer);const a=JSON.parse(window.gwStats0),b=window.__cityGwStats??{},delta=Object.fromEntries(Object.keys(b).map(k=>[k,typeof b[k]==='number'&&k!=='viewDistance'?+((b[k]-(a[k]??0)).toFixed(1)):b[k]]).filter(([,v])=>v));return {frames:window.gwFrames.slice(2),stats:window.gwStats,heap:performance.memory?.usedJSHeapSize??0,delta};});
  const mean=k=>stats.length?Math.round(stats.reduce((n,s)=>n+(s[k]??0),0)/stats.length):null,max=k=>stats.length?Math.max(...stats.map(s=>s[k]??0)):null;
  return {frames:frames.length,p50:pct(frames,.5),p95:pct(frames,.95),p99:pct(frames,.99),max:pct(frames,1),calls:mean('calls'),callsMax:max('calls'),triangles:mean('triangles'),geometries:max('geometries'),textures:max('textures'),gpuMB:stats.length?+(max('gpuBytes')/1048576).toFixed(1):null,heapMB:+(heap/1048576).toFixed(0),...(Object.keys(delta).length?{batches:delta}:{})};};
 const measure=async(ms=4000)=>{await record();await page.waitForTimeout(ms);return stop();};
 const shot=name=>shots?page.screenshot({path:`output/city-gw-${label}-${variant}-${name}${suffix}.png`}):null;
 const box=await page.locator('canvas').first().boundingBox();
 // Map overview (zoomed fully out: fixtures in the middle, studio plots around them), then panned east over the
 // studio plots and zoomed in, then a repeated pan. Same inputs every run, so screenshots compare pixel for pixel.
 const wheel=async(dy,n,x=.62,y=.5)=>{for(let i=0;i<n;i++){await page.mouse.move(box.x+box.width*x,box.y+box.height*y);await page.mouse.wheel(0,dy);await page.waitForTimeout(150);}await page.mouse.move(box.x+20,box.y+box.height-20);};
 const drag=async(x0,y0,x1,y1)=>{await page.mouse.move(box.x+box.width*x0,box.y+box.height*y0);await page.mouse.down({button:'right'});for(let i=1;i<=12;i++){await page.mouse.move(box.x+box.width*(x0+(x1-x0)*i/12),box.y+box.height*(y0+(y1-y0)*i/12));await page.waitForTimeout(30);}await page.mouse.up({button:'right'});await page.mouse.move(box.x+20,box.y+box.height-20);};
 await wheel(360,8);await settle(30000);await page.waitForTimeout(1500);
 const mapOverview=await measure();await shot('map');
 await drag(.9,.62,.45,.45);await wheel(-360,5,.62,.5);await settle(30000);await page.waitForTimeout(1500);
 const mapZoomed=await measure();await shot('map-zoomed');
 await record();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down({button:'right'});for(let i=0;i<24;i++){await page.mouse.move(box.x+box.width*.5+Math.sin(i*.3)*160,box.y+box.height*.5+Math.cos(i*.3)*60,{steps:3});await page.waitForTimeout(80);}await page.mouse.up({button:'right'});const mapPan=await stop();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click({timeout:300000});await page.waitForTimeout(2500);await settle(30000);await page.waitForTimeout(1000);
 const driveStanding=await measure();await shot('drive');
 await record();await page.keyboard.down('w');await page.waitForTimeout(7000);await page.keyboard.down('a');await page.waitForTimeout(1200);await page.keyboard.up('a');await page.waitForTimeout(3500);await page.keyboard.up('w');const driving=await stop();
 // Worker: cache-busted round trips on six seeded plots (background lane) and the page-thread resolve of the same.
 const prepare=await page.evaluate(async()=>{
  const {prepareSculpt}=await import('/src/features/city/citySculptService.ts'),{resolveSculpt}=await import('/src/domain/citySculpt.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-48-')),plots=JSON.parse(localStorage.getItem(key)).plots.filter(p=>p.purchaseId?.startsWith('gw-bench-')).slice(1,13),round=[],page=[],worker=[],merge=[];
  for(const [k,p] of plots.entries()){const r=structuredClone(p.finished.sculpt);r.volumes[0].x+=.001*(k+1)+Math.random()*1e-4;
   let t=performance.now();const out=await prepareSculpt(r,p.finished.design,false);round.push(performance.now()-t);if(out.timing){worker.push(out.timing.resolveMs);merge.push(out.timing.mergeMs);}t=performance.now();resolveSculpt(r,p.finished.design);page.push(performance.now()-t);}
  const avg=a=>a.length?+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):null;return {roundTripMs:avg(round),roundTripMax:+Math.max(...round).toFixed(1),pageResolveMs:avg(page),workerResolveMs:avg(worker),workerMergeMs:avg(merge)};
 });
 let edit=null,studioView=null;
 if(editTest){
  await page.getByRole('button',{name:'Visit test plot'}).click({timeout:300000});await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:120000});
  await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:120000});await page.waitForTimeout(3000);
  // Studio view pulled back over the neighbouring studio plots (24-100 m: both detail levels in one frame).
  await page.getByRole('button',{name:'Orbit view',exact:true}).click().catch(()=>{});await page.waitForTimeout(1200);// Paced wheel steps: each zoom glide finishes before the next, so slow and fast pages end on the same camera.
  for(let i=0;i<6;i++){await page.mouse.move(640,300);await page.mouse.wheel(0,400);await page.waitForTimeout(1200);}await page.mouse.move(640,120);await page.waitForTimeout(2500);await settle(60000);await page.waitForTimeout(3000);
  studioView=await measure();await shot('studio');
  // Every unedited plot pinned to its far representation (per-building path: __cityStudioDetailForce; batched: __cityGwForce).
  if(shots){await page.evaluate(()=>{window.__cityGwForce={overlay:'far'};window.__cityStudioDetailForce='far';});await page.waitForTimeout(2000);await shot('studio-far');await page.evaluate(()=>{delete window.__cityGwForce;delete window.__cityStudioDetailForce;});await page.waitForTimeout(2000);}
  await record();
  const edits=await page.evaluate(async()=>{
   const {setSculptPreview,clearSculptPreview,sculptPreviewSnapshot}=await import('/src/features/city/citySculptPreview.ts');
   const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-48-')),plot=JSON.parse(localStorage.getItem(key)).plots.find(p=>p.purchaseId==='gw-bench-0'),canvas=document.querySelector('canvas'),out=[];
   for(let k=1;k<=16;k++){const r=structuredClone(plot.draft.sculpt),o=r.studio.freeOpenings.find(o=>o.id==='n-u2');o.u+=.004*k;
    setSculptPreview(plot.id,r,plot.draft.design);const revision=sculptPreviewSnapshot(plot.id).revision,started=performance.now();
    while(performance.now()-started<5000){const d=JSON.parse(canvas.dataset.citySculptPreview||'{}');if(d.revision===revision){out.push(d);break;}await new Promise(res=>requestAnimationFrame(res));}
    await new Promise(res=>setTimeout(res,150));}
   clearSculptPreview(plot.id);return out;
  });
  const frames=await stop(),ready=edits.filter(e=>e.state==='ready');
  edit={samples:ready.length,workerMs:pct(ready.map(e=>e.workerMs),.5),frameMsP50:pct(ready.map(e=>e.frameMs),.5),frameMsP95:pct(ready.map(e=>e.frameMs),.95),frameP95:frames.p95,frameP99:frames.p99,frameMax:frames.max,calls:frames.calls};
 }
 const cityInfo=await page.evaluate(()=>{try{return JSON.parse(document.querySelector('canvas')?.dataset.citySculptCity||'null');}catch{return null;}});
 const row={label,backend,variant,path,plots:seeded.plots,properties:seeded.properties,background,types:seeded.types,invalid:seeded.invalid,loadMs:{prepared,settled:loaded},mapOverview,mapZoomed,mapPan,driveStanding,driving,studioView,prepare,edit,cityInfo,errors:errors.filter(e=>!/favicon|ResizeObserver/.test(e)).slice(0,10)};
 results=results.filter(r=>!(r.label===label&&r.backend===backend&&r.variant===variant&&r.plots===row.plots&&r.path===path));results.push(row);writeFileSync(file,JSON.stringify(results,null,2));console.log(JSON.stringify(row));await page.close();
}}finally{await browser.close();}
