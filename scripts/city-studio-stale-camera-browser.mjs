// Studio camera inside a neighbouring building (docs/city-studio-game-ux.md, "Camera clearance"). The canvas used
// to show an eye-level wall close-up that looked like a stale frame: the Front/orbit presets put the camera up to
// 1.25 plot sizes from the plot, inside a neighbouring demo building that streams in a few seconds after the studio
// opens. Open the test plot N times, use the unified-facade test's steps (Openings → Windows → Front view), and check
// that no view ray from the rendered camera hits another property's building within a few metres, and that the
// canvas still follows view changes. Needs a running dev server (CITY_TEST_ORIGIN). CITY_REPEAT sets the loop count.
import {chromium} from 'playwright';
import sharp from 'sharp';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180',backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const repeat=Number(process.env.CITY_REPEAT??10);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
/** Share of pixels whose colour differs by more than 40 (0..255 per channel), clear of the UI edges. */
async function imageDiff(a,b){
 const [x,y]=await Promise.all([a,b].map(p=>sharp(p).removeAlpha().raw().toBuffer({resolveWithObject:true})));let changed=0,n=0;
 for(let py=90;py<640;py+=3)for(let px=90;px<1500;px+=3){const i=(py*x.info.width+px)*3;n++;if(Math.max(Math.abs(x.data[i]-y.data[i]),Math.abs(x.data[i+1]-y.data[i+1]),Math.abs(x.data[i+2]-y.data[i+2]))>40)changed++;}
 return changed/n;
}
/** Rays through a 3×3 grid of the drawn view: how many hit a neighbouring city building within 12 m of the camera. */
const blocked=page=>page.evaluate(async()=>{
 const fiber=performance.getEntriesByType('resource').map(r=>r.name).find(n=>n.includes('/@react-three_fiber.js?'));
 const three=performance.getEntriesByType('resource').map(r=>r.name).find(n=>/\/deps\/three\.js\?/.test(n));
 const [{_roots},{Raycaster,Vector2}]=await Promise.all([import(fiber),import(three)]);
 const canvas=[...document.querySelectorAll('canvas')].find(c=>c.dataset.cityConstructionCamera),state=_roots.get(canvas)?.store.getState();
 const camera=JSON.parse(canvas?.dataset.cityConstructionCamera||'null');if(!state)return {camera,rays:-1,near:[]};
 const ray=new Raycaster();let rays=0;const near=new Set();
 for(const x of [-.6,0,.6])for(const y of [-.3,.2,.6]){ray.setFromCamera(new Vector2(x,y),state.camera);ray.far=12;
  const hit=ray.intersectObjects(state.scene.children,true).find(h=>h.object.userData?.cityInstances?.[h.instanceId]?.property);
  if(hit){rays++;near.add(hit.object.userData.cityInstances[hit.instanceId].property.id);}}
 return {camera,rays,near:[...near]};
});
let stale=0;const runs=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`;
 await page.goto(url);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 // Own the first plot with a New York kit building, as the unified-facade test does.
 await page.evaluate(async()=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{nycPreset}=await import('/src/domain/cityNycPresets.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='stale-camera-browser';plot.revision=(plot.revision??0)+1;plot.draft=nycPreset(initialLandDraft(plot),0,plot.size);
  localStorage.setItem(key,JSON.stringify(world));
 });
 for(let i=0;i<repeat;i++){
  await page.goto(url);
  await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
  await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:90000});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:90000}).catch(()=>{});
  await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000}).catch(()=>{});
  await page.waitForTimeout(2500);
  const open=await blocked(page);
  await page.keyboard.press('4');await page.getByRole('button',{name:'Windows',exact:true}).click();
  await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(2800);
  const front=await blocked(page);
  // Neighbours keep arriving as their recipes finish preparing; look again once they have.
  await page.waitForTimeout(Number(process.env.CITY_LATE_MS??6000));
  const later=await blocked(page),frontShot=await page.screenshot({path:`output/city-studio-stale-camera${suffix}.png`});
  await page.getByRole('button',{name:'Top view'}).click();await page.waitForTimeout(1800);const topShot=await page.screenshot();
  const follows=await imageDiff(frontShot,topShot);
  // -1: no studio canvas to inspect (for example a compatibility remount after device loss); reported, not scored.
  const lost=[open,front,later].some(r=>r.rays<0);if(lost)await sharp(frontShot).toFile(`output/city-studio-stale-camera-lost-${i}${suffix}.png`);
  const bad=open.rays>2||front.rays>2||later.rays>2||!lost&&follows<.15;
  if(bad){stale++;await sharp(frontShot).toFile(`output/city-studio-stale-camera-${i}${suffix}.png`);}
  runs.push({i,bad,lost,open:open.rays,front:front.rays,later:later.rays,near:[...new Set([...open.near,...front.near,...later.near])],follows:+follows.toFixed(2),camera:later.camera?.position?.map(v=>+v.toFixed(1))});
  console.log(JSON.stringify(runs.at(-1)));
 }
 console.log(`Camera inside a neighbouring building (${backend}): ${stale}/${repeat}${errors.length?`; page errors: ${errors.join(' | ')}`:''}`);
 process.exitCode=stale?1:0;
}finally{await browser.close();}
