// Region painting on generated walls: a building whose front face is owned by free openings is painted
// through the Paint tool (fill, brush stroke, band, trim), sampled, erased, undone, recoloured with the
// quick ring and reloaded. Needs a running dev server (CITY_TEST_ORIGIN, default http://localhost:5180).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1300}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 await page.evaluate(async()=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft,studioBays}=await import('/src/domain/cityStudio.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='paint-regions-browser';plot.revision=(plot.revision??0)+1;
  const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
  r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:3}];
  Object.assign(r.studio,{openings:[],assemblies:[],surfaces:[],stamps:undefined,variation:undefined,facadeRhythm:undefined,freeTrims:undefined,roofOpenings:undefined,roofDetails:undefined,paintRegions:undefined,parts:{}});
  r.studio.defaults.family='pastel-stucco';r.studio.defaults.roof='terrace';
  const at=(id,x,bottom,width,height,shape,extra={})=>({id,shapeId:'main',side:'north',u:x/12,bottom,width,height,shape,...extra});
  r.studio.freeOpenings=[at('door',6,0,1.5,2.75,'arch',{style:'timber'}),at('g-l',2.4,.9,1.2,1.7,'rect'),at('g-r',9.6,.9,1.2,1.7,'arch',{style:'stone'}),at('u-l',2.4,4.3,1.1,1.6,'rect'),at('u-m',6,4.3,1.1,1.6,'rect'),at('u-r',9.6,4.3,1.1,1.6,'rect'),at('t-l',3.6,7.3,1.1,1.5,'arch'),at('t-r',8.4,7.3,1.1,1.5,'arch')];
  // Legacy tile paint on the top floor of the (now generated) front: must survive as a face rectangle.
  plot.draft=studioDraft(draft,r);const bay=studioBays(r,plot.draft.design).filter(b=>b.anchor.shapeId==='main'&&b.anchor.side==='north'&&b.anchor.floor===2).sort((a,b)=>a.x-b.x)[0];
  r.studio.surfaces=[{id:'legacy',anchor:bay.anchor,scope:'spot',channel:'wall',finish:{color:'#7d8fa6'}}];plot.draft=studioDraft(draft,r);
  localStorage.setItem(key,JSON.stringify(world));
 });
 const open=async()=>{await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:90000});await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready'&&!document.querySelector('.studio-preparing'),null,{timeout:90000});};
 const regions=()=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.paintRegions??[];});
 const waitRegions=(test,label)=>page.waitForFunction(src=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),list=JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.paintRegions??[];return new Function('list',`return (${src})(list)`)(list);},test.toString(),{timeout:30000}).catch(async e=>{console.log(label,JSON.stringify(await regions()));await page.screenshot({path:`output/city-studio-paint-regions-failure${suffix}.png`});throw e;});
 const settle=async()=>{await page.waitForFunction(()=>!document.querySelector('.studio-preparing')&&!JSON.parse(document.querySelector('canvas').dataset.cityStudio||'{}').busy,null,{timeout:30000}).catch(()=>{});await page.waitForTimeout(900);};
 const pressed=(selector,text)=>page.waitForFunction(([s,t])=>[...document.querySelectorAll(s)].find(b=>b.textContent?.includes(t)||b.getAttribute('aria-label')===t)?.getAttribute('aria-pressed')==='true',[selector,text],{timeout:10000});
 const swatch=async i=>{const b=page.locator('.studio-swatches button').nth(i);await b.click();await page.waitForFunction(i=>document.querySelectorAll('.studio-swatches button')[i]?.getAttribute('aria-pressed')==='true',i,{timeout:5000});return (await b.getAttribute('aria-label')).replace('Paint ','');};
 await open();
 const prepared=await page.evaluate(async()=>{const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),d=JSON.parse(localStorage.getItem(k)).plots[0].draft,t=performance.now(),s=resolveSculpt(d.sculpt,d.design).studio,ms=performance.now()-t;return {ms,faces:s.freeFaces.map(f=>({id:f.id,paint:(f.geometry.wallPaint??[]).map(p=>p.finish)})),inactive:s.inactive};});
 assert.deepEqual(prepared.inactive,[]);assert.deepEqual(prepared.faces.find(f=>f.id==='main/north').paint,[{color:'#7d8fa6'}],'legacy tile paint becomes a region on the generated face');
 await page.getByRole('button',{name:'Paint',exact:true}).click();
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(1600);
  const screen=async()=>{const st=await page.locator('canvas').evaluateAll(cs=>JSON.parse(cs.find(c=>c.dataset.cityStudio)?.dataset.cityStudio||'{}'));const north=st.bays.filter(b=>b.part==='main'&&b.side==='north');const row=f=>north.filter(b=>b.floor===f).sort((a,b)=>a.x-b.x);return {g:row(0),u:row(1),t:row(2)};};
 let s=await screen();assert.ok(s.g.length>=4&&s.u.length>=4,JSON.stringify(s).slice(0,300));
 await page.getByRole('group',{name:'Brush size'}).waitFor({timeout:10000});
 await page.mouse.move(20,300);await settle();await page.screenshot({path:`output/city-studio-paint-regions-legacy${suffix}.png`});
 // Screen height (px per metre) from the storey centres: ground 0..3.4 m, upper floors 3 m.
 const d=await page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots[0].draft.design;});
 const gh=d.groundHeight,uh=d.upperHeight??3,yAt=h=>s.g[0].y+(h-gh/2)*(s.u[0].y-s.g[0].y)/((gh+uh/2)-gh/2);
 // 1) Fill wall: one full-height band on the generated face.
 await swatch(2);
 await page.getByRole('button',{name:'Fill wall',exact:true}).click();await pressed('.studio-paint-actions button','Fill wall');
 await page.mouse.move(s.u[1].x,s.u[1].y);await page.waitForTimeout(250);await page.mouse.click(s.u[1].x,s.u[1].y);
 await waitRegions(list=>list.length===1&&list[0].band&&list[0].rects[0][2]===0,'fill');
 assert.equal(await page.getByRole('button',{name:'Fill wall',exact:true}).getAttribute('aria-pressed'),'false','fill returns to the brush');
 await settle();
 // 2) Brush stroke with the large brush across the upper storey, between the windows.
 const brushes=page.getByRole('group',{name:'Brush size'});await brushes.getByRole('button',{name:'Large'}).click();
 await swatch(5);
 const pxm=(s.u[1].x-s.u[0].x)/2,y=yAt(gh+uh*.2),x0=s.u[0].x-.6*pxm,x1=s.u.at(-1).x+.6*pxm;
 await page.mouse.move(x0,y);await page.mouse.down();for(let i=1;i<=24;i++){await page.mouse.move(x0+(x1-x0)*i/24,y+Math.sin(i/3)*6);await page.waitForTimeout(16);}await page.mouse.up();
 await waitRegions(list=>list.length===2&&list[1].channel==='wall'&&!list[1].band&&list[1].rects.length>=1,'stroke');
 const stroke=(await regions())[1];const xs=stroke.rects.flatMap(q=>[q[0],q[1]]);assert.ok(Math.max(...xs)-Math.min(...xs)>7,`stroke spans the face (${JSON.stringify(stroke.rects)})`);
 await settle();
 // 3) Band: a brick plinth dragged from the base up to ~0.9 m.
 await page.getByRole('button',{name:'Brick',exact:true}).click();
 await page.getByRole('button',{name:'Band',exact:true}).click();await pressed('.studio-paint-actions button','Band');
 // Start on the wall at ~0.9 m and drag down past the base: the band is clamped to the face.
 const bx=(s.g[0].x+s.g[1].x)/2;await page.mouse.move(bx,yAt(.9));await page.waitForTimeout(150);await page.mouse.down();for(let i=1;i<=10;i++){await page.mouse.move(bx+i,yAt(.9-1.3*i/10));await page.waitForTimeout(20);}await page.mouse.up();
 await waitRegions(list=>list.length===3&&list[2].band&&list[2].finish.texture==='brick','band');
 const band=(await regions())[2].rects[0];assert.ok(band[2]<.2&&band[3]>.6&&band[3]<1.3,`band heights ${band}`);
 await settle();
 // 4) Trim channel: a stroke over the upper-left window tints its surround.
  await page.getByRole('button',{name:'trim',exact:true}).click();await brushes.getByRole('button',{name:'Medium'}).click();const trimColor=await swatch(1);
 const wy=yAt(gh+.9+.8);await page.mouse.move(s.u[0].x,wy);await page.mouse.down();await page.mouse.move(s.u[1].x,wy,{steps:6});await page.mouse.up();
 await waitRegions(list=>list.length===4&&list[3].channel==='trim','trim');
 assert.equal((await regions())[3].finish.color,trimColor,'trim stroke takes the chosen swatch');
 await page.getByRole('button',{name:'wall',exact:true}).click();
 await settle();
 await page.screenshot({path:`output/city-studio-paint-regions${suffix}.png`});
 // 5) Sample the plinth: brick becomes the active material.
 await page.getByRole('button',{name:'Smooth',exact:true}).click();
 await page.getByRole('button',{name:'Sample finish'}).click();await pressed('button[aria-label="Sample finish"]','Sample finish');
 await page.mouse.move(bx,yAt(.4));await page.waitForTimeout(200);await page.mouse.click(bx,yAt(.4));
 await page.waitForFunction(()=>[...document.querySelectorAll('.studio-materials button')].find(b=>b.textContent?.includes('Brick'))?.getAttribute('aria-pressed')==='true',null,{timeout:10000});
 // 6) Restore removes the topmost region under the pointer (the stroke), undo brings it back.
 await page.getByRole('button',{name:'Restore tile'}).click();await pressed('button[aria-label="Restore tile"]','Restore tile');
 await page.mouse.move(s.u[1].x+60,y);await page.waitForTimeout(200);await page.mouse.click(s.u[1].x+60,y);
 await waitRegions(new Function('list',`return list.length===3&&!list.some(g=>g.id===${JSON.stringify(stroke.id)})`),'erase');
 await page.getByRole('button',{name:'Undo'}).click();await waitRegions(new Function('list',`return list.length===4&&list[1].id===${JSON.stringify(stroke.id)}`),'undo');
 await page.getByRole('button',{name:'Restore tile'}).click();
 // 7) Quick paint ring on a region recolours it in place.
 await settle();await page.mouse.move(s.u[1].x+60,y);await page.waitForTimeout(300);await page.keyboard.press('c');
 await page.getByRole('dialog',{name:'Quick paint'}).waitFor({timeout:5000});
 const ringColor=await page.getByRole('dialog',{name:'Quick paint'}).locator('.studio-ring-swatch').nth(0).getAttribute('aria-label');
 await page.getByRole('dialog',{name:'Quick paint'}).locator('.studio-ring-swatch').nth(0).click();
 await waitRegions(new Function('list',`return list.length===4&&list[1].finish.color===${JSON.stringify(ringColor.replace('Paint ',''))}`),'ring');
 await settle();
 // Close-up for edge crispness and z-fighting.
 const box=await page.locator('canvas').first().boundingBox(),cx=box.x+box.width/2;
 await page.mouse.move(cx,yAt(1.5));for(let i=0;i<5;i++){await page.mouse.wheel(0,-240);await page.waitForTimeout(80);}await page.mouse.move(cx,box.y+120);await page.waitForTimeout(1800);
 await page.screenshot({path:`output/city-studio-paint-regions-close${suffix}.png`});
 await page.mouse.move(cx+200,box.y+box.height*.45);await page.mouse.down({button:'right'});for(let i=1;i<=10;i++){await page.mouse.move(cx+200-i*10,box.y+box.height*.45+i*2);await page.waitForTimeout(30);}await page.mouse.up({button:'right'});await page.mouse.move(cx,box.y+120);await page.waitForTimeout(1800);
 await page.screenshot({path:`output/city-studio-paint-regions-angle${suffix}.png`});
 const detail=await page.evaluate(()=>Object.values(window.__cityStudioDetail??{}).find(d=>d.full));
 // 8) Reload: regions persist and render.
 const saved=await regions();await open();assert.deepEqual(await regions(),saved,'paint regions survive save and reload');
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(2200);
 await page.screenshot({path:`output/city-studio-paint-regions-reload${suffix}.png`});
 assert.deepEqual(errors.filter(e=>!/favicon|ResizeObserver/.test(e)),[]);
 console.log(JSON.stringify({backend,regions:saved.map(g=>({channel:g.channel,band:!!g.band,rects:g.rects.length,finish:g.finish})),resolveMs:Math.round(prepared.ms),detail}));
 console.log(`Paint regions (${backend}): fill, stroke, band, trim, sample, restore, undo, quick ring and reload passed.`);
}finally{await browser.close();}
