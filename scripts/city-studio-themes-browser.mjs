// Facade themes in the construction studio (docs/city-studio-themes.md), native WebGPU by default:
//  1. a two-part building: theme one part from Inspector › Part (Tokyo zakkyo), the other with Paris Haussmann;
//  2. theme the whole building from Inspector › Building (NYC tenement) and check the part themes are replaced;
//  3. move sliders (fire escapes off, AC units up), lock an aspect, reroll, check undo/redo restore the recipe;
//  4. the Build palette's Themes idea on an empty plot;
//  5. every theme applied through the gallery, screenshots output/theme-<id>.png and a contact sheet.
//   CITY_TEST_ORIGIN=http://localhost:5180 node scripts/city-studio-themes-browser.mjs   (CITY_BACKEND=webgl: WebGL2)
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {backend,captureStage,openStudio,origin,pickTheme,savedSculpt,seedPlot,settle,until} from './city-studio-themes-shared.mjs';
const suffix=backend==='webgl'?'-webgl':'';
mkdirSync('output',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-webgpu']});
const log=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await seedPlot(page,[{id:'main',width:12,depth:9,floors:5,x:-2.5,z:1.5},{id:'wing',width:6,depth:7,floors:3,x:6.5,z:.5}],'Theme browser');await openStudio(page);
 const data=await page.evaluate(()=>{const c=document.querySelector('canvas');return {backend:c.dataset.cityBackend};});
 if(backend==='native')assert.notEqual(data.backend,'webgl','native WebGPU run');
 const inspector=page.getByRole('complementary',{name:'Inspector'});
 const selectPart=async n=>{await page.getByRole('navigation',{name:'Building tools'}).getByRole('button',{name:'Select',exact:true}).click();await page.getByRole('group',{name:'My parts'}).getByRole('button').nth(n).click();await inspector.getByRole('button',{name:'Part theme'}).waitFor();};
 const buildingInspector=async()=>{await page.getByRole('navigation',{name:'Building tools'}).getByRole('button',{name:'Select',exact:true}).click();await page.getByRole('navigation',{name:'Selection path'}).getByRole('button',{name:'Building',exact:true}).click();await inspector.getByRole('button',{name:'Building theme'}).waitFor();};
 const refs=async()=>(await savedSculpt(page)).studio.facadeThemes??[];
 const inactive=()=>page.evaluate(async()=>{const {resolveSculpt}=await import('/src/domain/citySculpt.ts');const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),d=JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft;return resolveSculpt(d.sculpt,d.design).studio.inactive;});

 // 1. Part themes from Inspector › Part.
 await selectPart(0);
 await inspector.getByRole('button',{name:'Apply theme to this part',exact:true}).click();
 await pickTheme(page,'Tokyo zakkyo building');
 await until(page,async()=>(await refs()).some(x=>x.partId==='main'&&x.theme==='tokyo-zakkyo'),'Tokyo on main');
 await selectPart(1);
 await inspector.getByRole('button',{name:'Apply theme to this part',exact:true}).click();
 await pickTheme(page,'Paris Haussmann');
 await until(page,async()=>(await refs()).length===2,'two part themes');
 const two=await savedSculpt(page);
 assert.equal(two.studio.facadeRhythm.rules.find(r=>r.partId==='main'&&r.side===undefined).style,'tokyo');
 assert.equal(two.studio.facadeRhythm.rules.find(r=>r.partId==='wing'&&r.side===undefined).style,'townhouse');
 assert.deepEqual(await inactive(),[]);
 await settle(page,1200);await captureStage(page,`output/theme-apply-parts${suffix}.png`);

 // 2. Whole building from Inspector › Building.
 await buildingInspector();
 await inspector.getByRole('button',{name:'Apply to whole building',exact:true}).click();
 await pickTheme(page,'NYC walk-up tenement');
 await until(page,async()=>{const r=await refs();return r.length===1&&r[0].theme==='nyc-tenement'&&r[0].partId===undefined;},'building theme');
 assert.deepEqual(await inactive(),[]);
 await settle(page,1200);await captureStage(page,`output/theme-apply-building${suffix}.png`);
 await page.screenshot({path:`output/theme-panel${suffix}.png`});

 // 3. Sliders, lock, reroll, undo/redo.
 const panel=inspector.getByRole('group',{name:'Theme aspects'});
 // Range inputs: the native value setter plus an input event, as a drag would (React reads the input event).
 const slide=(name,value)=>panel.getByRole('slider',{name,exact:true}).evaluate((el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(v));el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 await slide('Fire escapes',0);
 await until(page,async()=>(await refs())[0].tune?.['fire-escape']===0,'fire escapes off');
 await slide('AC units',.8);
 await until(page,async()=>(await refs())[0].tune?.ac===.8,'more AC units').catch(async e=>{console.log(JSON.stringify(await refs()));throw e;});
 await slide('Upper openings',.7);
 await until(page,async()=>(await savedSculpt(page)).studio.facadeRhythm.layers?.upper?.coverage===.7,'upper coverage');
 await panel.getByRole('button',{name:'Lock storefronts',exact:true}).click();
 await until(page,async()=>(await refs())[0].locks?.includes('shops'),'lock shops');
 const beforeRoll=await savedSculpt(page);
 await inspector.getByRole('button',{name:'Reroll theme',exact:true}).click();
 await until(page,async()=>(await refs())[0].seeds?.ac===1,'reroll');
 const rolled=(await refs())[0];assert.equal(rolled.seeds?.shops,undefined,'locked storefronts keep their seed');
 assert.notDeepEqual((await savedSculpt(page)).studio.facadeRhythm.layerSeeds,beforeRoll.studio.facadeRhythm.layerSeeds,'the rhythm reshuffles too');
 await settle(page,1000);await captureStage(page,`output/theme-tuned${suffix}.png`,null);
 await page.keyboard.press('Control+z');
 await until(page,async()=>JSON.stringify(await savedSculpt(page))===JSON.stringify(beforeRoll),'undo restores the look');
 await page.getByRole('status').filter({hasText:'Undid: Reroll theme'}).waitFor({timeout:5000});
 await page.keyboard.press('Control+y').catch(()=>{});await page.keyboard.press('Control+Shift+z');
 await until(page,async()=>(await refs())[0].seeds?.ac===1,'redo');
 assert.deepEqual(await inactive(),[]);

 // 4. Build palette › Themes on an empty plot (themed starter).
 await seedPlot(page,[],'Empty plot');await openStudio(page);
 await page.getByRole('navigation',{name:'Building tools'}).getByRole('button',{name:'Build',exact:true}).click();
 await page.getByRole('button',{name:'Themes',exact:true}).click();
 await pickTheme(page,'Italian palazzo');
 await until(page,async()=>{const r=await savedSculpt(page);return r.volumes.length===1&&r.studio.facadeThemes?.[0]?.theme==='italian-palazzo';},'themed starter');
 assert.deepEqual(await inactive(),[]);

 // 5. Every theme through the gallery on the standard building, screenshots and a contact sheet.
 await seedPlot(page,[{id:'main',width:12,depth:10,floors:4}],'Theme sheet');await openStudio(page);
 const themes=await page.evaluate(async()=>(await import('/src/domain/cityStudioThemeCatalog.ts')).FACADE_THEMES.map(t=>({id:t.id,label:t.label})));
 const shots=[];
 for(const t of themes){
  await buildingInspector();
  const openBtn=inspector.getByRole('button',{name:'Apply to whole building',exact:true});
  if(await openBtn.isVisible().catch(()=>false))await openBtn.click();else await inspector.getByRole('button',{name:'Change theme',exact:true}).click();await pickTheme(page,t.label);
  await until(page,async()=>(await refs())[0]?.theme===t.id,t.id);
  const bad=await inactive();assert.deepEqual(bad,[],`${t.id}: nothing inactive`);
  await settle(page,1200);await captureStage(page,`output/theme-${t.id}${suffix}.png`);shots.push(t);
 }
 const sheet=await browser.newPage({viewport:{width:1500,height:900}});
 const img=id=>`data:image/png;base64,${readFileSync(`output/theme-${id}${suffix}.png`).toString('base64')}`;
 await sheet.setContent(`<!doctype html><html><head><style>body{margin:14px;background:#ecebe6;font:12px system-ui,sans-serif}h1{font-size:16px;margin:0 0 10px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}figure{margin:0;background:#fff;border-radius:6px;padding:5px}img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:4px}figcaption{padding-top:3px;font-weight:600}</style></head><body><h1>Facade themes · ${shots.length} · ${backend}</h1><main>${shots.map(t=>`<figure><img src="${img(t.id)}"><figcaption>${t.label}</figcaption></figure>`).join('')}</main></body></html>`);
 await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
 await sheet.screenshot({path:`output/theme-contact-sheet${suffix}.png`,fullPage:true});
 assert.deepEqual(errors,[]);
 writeFileSync(`output/city-studio-themes-browser${suffix}.json`,JSON.stringify({origin,backend:data.backend,themes:shots.length,notes:log},null,1));
 console.log(`Facade themes: parts, building, sliders, lock, reroll, undo/redo, starter and ${shots.length} gallery themes on ${data.backend}; no page errors.${log.length?' Notes: '+log.join('; '):''}`);
}finally{await browser.close();}
