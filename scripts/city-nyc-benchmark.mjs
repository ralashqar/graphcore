/** Controlled populated City comparison: same background, route and six local plots. */
import {chromium} from 'playwright';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']}),results=process.env.CITY_BENCH_COUNT&&existsSync('output/city-nyc-benchmark.json')?JSON.parse(readFileSync('output/city-nyc-benchmark.json','utf8')).filter(r=>r.count!==Number(process.env.CITY_BENCH_COUNT)):[];
try{for(const count of (process.env.CITY_BENCH_COUNT?[Number(process.env.CITY_BENCH_COUNT)]:[72,400]))for(const kit of ['legacy','nyc']){
 const page=await browser.newPage({viewport:{width:1000,height:750}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('city-scene-look-v1',JSON.stringify({look:'daylight',quality:'balanced',occlusion:'architectural'})));
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5188'}/city?demo=1&cityStudio=1`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 await page.evaluate(async({kit,count})=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{nycPreset}=await import('/src/domain/cityNycPresets.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key));
  if(count===400){
   const {cityPlots,emptyCityProfile,buildingTier}=await import('/src/domain/city.ts'),{newDesign}=await import('/src/domain/cityBuildingV3.ts');
   const local=new Set(world.plots.slice(0,6).map(p=>`${p.x}:${p.z}`));
   world.occupied=cityPlots(500).filter(p=>!local.has(`${p.x}:${p.z}`)).slice(0,400).map((p,i)=>({...p,id:`fixture-${i}`,slug:`fixture-${i}`,rank:i+1,tier:buildingTier(10000),landValue:10000,saves:0,claims:0,profile:{...emptyCityProfile(),name:`Fixture ${i+1}`,buildingDesign:newDesign(`drive-${i%6}`),website:'https://example.com'}}));
   const occupied=new Set(world.occupied.map(p=>`${p.x}:${p.z}`));world.plots=world.plots.filter(p=>!occupied.has(`${p.x}:${p.z}`));
  }
  for(const [i,p] of world.plots.slice(0,6).entries()){
   const d=nycPreset(initialLandDraft(p),i,p.size);
   if(kit==='legacy'){
    const s=d.sculpt.studio;s.catalogue='synarc-kit-3';s.defaults.window='window-sash';delete s.roofDetails;
    s.assemblies=s.assemblies.filter(a=>!a.module).map(a=>{const copy={...a};delete copy.variant;return copy;});
    s.openings=s.openings.flatMap(o=>{const module=o.module.startsWith('door-')?'door-shop':'window-shop';if(o.span===2)return [-1,1].map((direction,j)=>({id:o.id+'/'+j,module,anchor:{...o.anchor,u:o.anchor.u+direction/d.sculpt.volumes[0].width}}));return [{id:o.id,anchor:o.anchor,module}];});
   }
   p.owner=LAND_OWNER;p.purchaseId=`benchmark-${i}`;p.revision=1;p.draft=d;p.finished=structuredClone(d);
  }
  localStorage.setItem(key,JSON.stringify(world));
 },{kit,count});
 await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();
 await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.cityPreparedBuildings)>=Number(document.querySelector('[data-city-resident-count]')?.getAttribute('data-city-resident-count')),null,{timeout:360000});
 await page.waitForTimeout(4000);
 await page.evaluate(()=>{window.nycFrames=[];window.nycMeasuring=true;let last=performance.now();function step(t){if(!window.nycMeasuring)return;window.nycFrames.push(t-last);last=t;requestAnimationFrame(step);}requestAnimationFrame(step);});
 await page.keyboard.down('w');await page.waitForTimeout(4000);await page.keyboard.down('a');await page.waitForTimeout(1200);await page.keyboard.up('a');await page.waitForTimeout(2500);await page.keyboard.up('w');
 const data=await page.evaluate(()=>{window.nycMeasuring=false;const frames=window.nycFrames.slice(2).sort((a,b)=>a-b),c=document.querySelector('canvas');return {p95:frames[Math.floor(frames.length*.95)],median:frames[Math.floor(frames.length*.5)],frames:frames.length,stats:JSON.parse(c.dataset.cityRenderStats||'{}'),backend:c.dataset.cityBackend,prepared:c.dataset.cityPreparedBuildings,resident:document.querySelector('[data-city-resident-count]')?.getAttribute('data-city-resident-count')};});
 results.push({count,kit,localPlots:6,...data,errors});writeFileSync('output/city-nyc-benchmark.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));await page.close();
}}finally{await browser.close();}
