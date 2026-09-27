// Shared steps for the facade theme browser suite and the thumbnail builder (docs/city-studio-themes.md).
import sharp from 'sharp';
export const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180';
export const backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native';

/** Seeds the first test plot with a unified Blender-catalogue building: parts [{id,width,depth,floors,x?,z?}]. */
export async function seedPlot(page,parts,name='Theme test'){
 await page.goto(`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1&themeSeed=${process.env.CITY_THEME_SEED??7}${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:120000});
 await page.evaluate(async([parts,name])=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{freshStudio,studioDraft}=await import('/src/domain/cityStudio.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='themes-browser';plot.revision=(plot.revision??0)+1;
  const r={version:5,plotSize:plot.size,attachments:[],volumes:parts.map(p=>({id:p.id,kind:p.kind??'rectangle',operation:'add',x:p.x??0,z:p.z??0,width:p.width,depth:p.depth,startFloor:0,spanFloors:p.floors})),studio:{...freshStudio(),catalogue:'synarc-kit-5',facade:'unified'}};
  const base=initialLandDraft(plot);plot.draft=studioDraft({...base,name,design:{...base.design,groundHeight:3.6}},r);localStorage.setItem(key,JSON.stringify(world));
 },[parts,name]);
}
export async function openStudio(page){
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:120000});
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:120000}).catch(()=>{});
 await settle(page);
 for(const name of ['Skip','Close','Got it'])if(await page.getByRole('button',{name,exact:true}).isVisible().catch(()=>false))await page.getByRole('button',{name,exact:true}).click().catch(()=>{});
}
export async function settle(page,ms=900){await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:60000}).catch(()=>{});await page.waitForTimeout(ms);}
export const savedSculpt=page=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt;});
export async function until(page,fn,label,ms=20000){const t=Date.now();while(Date.now()-t<ms){if(await fn())return;await page.waitForTimeout(150);}throw Error(`Timed out: ${label}`);}
/** Picks a theme card in the open gallery (search narrows the list first). */
export async function pickTheme(page,label){
 const gallery=page.getByRole('complementary',{name:'Themes'});await gallery.waitFor();
 await gallery.getByRole('textbox',{name:'Search themes'}).fill(label);
 await gallery.getByRole('button',{name:`Apply ${label}`,exact:true}).click();
 await gallery.waitFor({state:'detached',timeout:10000});
}
/** Screenshot of the stage without panels (the studio shell hidden for the capture). */
export async function captureStage(page,path,view='Orbit view',zoom=0){
 if(view){await page.getByRole('button',{name:view,exact:true}).click();await page.waitForTimeout(2200);}
 const size=page.viewportSize();if(zoom){await page.mouse.move(size.width/2,size.height*.55);for(let i=0;i<zoom;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(120);}await page.waitForTimeout(900);}
 await page.mouse.move(5,5);await settle(page,500);
 await page.addStyleTag({content:'.studio-shell,.studio-theme-gallery,.city-studio-toast,.studio-starters-sheet{visibility:hidden!important}'});
 await page.waitForTimeout(250);
 const vp=page.viewportSize(),buffer=await page.screenshot({path,clip:{x:vp.width*.22,y:vp.height*.1,width:vp.width*.56,height:vp.height*.8}});
 await page.evaluate(()=>{for(const s of [...document.querySelectorAll('style')].filter(s=>s.textContent?.includes('.studio-shell,.studio-theme-gallery')))s.remove();});
 return buffer;
}
/** 4:3 JPEG thumbnail (320 x 240) from a stage capture. */
export const thumbnail=(buffer,out)=>sharp(buffer).resize(320,240,{fit:'cover',position:'centre'}).jpeg({quality:78,mozjpeg:true}).toFile(out);
