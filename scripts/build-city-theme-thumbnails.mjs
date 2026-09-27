// Theme gallery thumbnails (docs/city-studio-themes.md): renders every facade theme on the same standard test
// building (12 m x 10 m, four storeys, on the first test plot) in the construction studio on native WebGPU, applied
// through the Themes gallery with a fixed seed, and writes public/city/themes/<id>.jpg (320 x 240).
//   CITY_TEST_ORIGIN=http://localhost:5180 node scripts/build-city-theme-thumbnails.mjs [themeId ...]
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {captureStage,openStudio,pickTheme,savedSculpt,seedPlot,settle,thumbnail,until} from './city-studio-themes-shared.mjs';
mkdirSync('public/city/themes',{recursive:true});mkdirSync('output',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await seedPlot(page,[{id:'main',width:12,depth:10,floors:4}],'Theme thumbnails');await openStudio(page);
 const themes=await page.evaluate(async()=>(await import('/src/domain/cityStudioThemeCatalog.ts')).FACADE_THEMES.map(t=>({id:t.id,label:t.label})));
 const only=process.argv.slice(2);
 for(const t of themes.filter(t=>!only.length||only.includes(t.id))){
  await page.getByRole('navigation',{name:'Selection path'}).getByRole('button',{name:'Building',exact:true}).click().catch(()=>{});
  const inspector=page.getByRole('complementary',{name:'Inspector'});
  const open=inspector.getByRole('button',{name:'Apply to whole building',exact:true});
  if(await open.isVisible().catch(()=>false))await open.click();else await inspector.getByRole('button',{name:'Change theme',exact:true}).click();
  await pickTheme(page,t.label);
  await until(page,async()=>(await savedSculpt(page)).studio.facadeThemes?.[0]?.theme===t.id,t.id);
  // A fixed look: the same seed for every thumbnail (the reroll counters stay at zero).
  await settle(page,1200);
  const buffer=await captureStage(page,`output/theme-thumb-${t.id}.png`,'Orbit view',3);await thumbnail(buffer,`public/city/themes/${t.id}.jpg`);
  console.log(`thumbnail ${t.id}`);
 }
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
