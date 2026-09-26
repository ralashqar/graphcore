// Curved generated walls: a round tower and an oval wing. Free openings are cut on the curved wall through the
// Freeform tool, a band is painted with the Paint tool, and a facade rhythm dresses both curved parts.
// Needs a running dev server (CITY_TEST_ORIGIN, default http://localhost:5180). CITY_BACKEND=webgl for WebGL2.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const shot=(page,name)=>page.screenshot({path:`output/city-studio-curved-${name}${suffix}.png`});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 const seed=scene=>page.evaluate(async scene=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft,validateStudio}=await import('/src/domain/cityStudio.ts'),{newFacadeRhythm}=await import('/src/domain/cityStudioFacadeRhythm.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='curved-walls-browser';plot.revision=(plot.revision??0)+1;
  const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
  r.volumes=[{id:'tower',kind:'ellipse',operation:'add',x:-3.5,z:.5,width:7,depth:7,startFloor:0,spanFloors:4},{id:'wing',kind:'ellipse',operation:'add',x:3.5,z:0,width:9,depth:6,startFloor:0,spanFloors:2}];
  Object.assign(r.studio,{openings:[],assemblies:[],surfaces:[],stamps:undefined,variation:undefined,facadeRhythm:undefined,freeOpenings:undefined,freeTrims:undefined,roofOpenings:undefined,roofDetails:undefined,paintRegions:undefined,parts:{}});
  r.studio.defaults.family=scene.family;r.studio.defaults.roof='terrace';
  if(scene.rhythm)r.studio.facadeRhythm={...newFacadeRhythm(scene.rhythm,5),trims:'rich'};
  if(scene.wingOpenings){const L=Math.PI*(3*(4.5+3)-Math.sqrt((3*4.5+3)*(4.5+3*3)));// Ramanujan: front of the wing at L/2
   const at=(id,x,bottom,width,height,shape,extra={})=>({id,shapeId:'wing',side:'curve',u:x/L,bottom,width,height,shape,...extra});
   r.studio.freeOpenings=[at('wing-door',L/2+1.2,0,1.3,2.6,'arch',{style:'timber'}),at('wing-g1',L/2-1.2,.9,1.1,1.7,'rect'),at('wing-g2',L/2+3.6,.9,1.1,1.7,'arch',{style:'stone'}),at('wing-u1',L/2-1.2,4.4,1,1.5,'rect'),at('wing-u2',L/2+1.2,4.4,1,1.5,'rect'),at('wing-u3',L/2+3.6,4.4,1,1.5,'round')];
   r.studio.freeTrims=[{openingId:'wing-door',kinds:['canopy','lamps']},{openingId:'wing-u1',kinds:['shutters','lintel']},{openingId:'wing-u2',kinds:['window-box','lintel']}];}
  const error=validateStudio(r);if(error)return {error};
  plot.draft=studioDraft(draft,r);plot.draft.design.floors=4;plot.draft.design.middleFloors=3;localStorage.setItem(key,JSON.stringify(world));return {ok:true};
 },scene);
 const open=async()=>{await page.reload();await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
  await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:90000});await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:90000}).catch(()=>{});await settle();};
 const settle=async()=>{await page.waitForFunction(()=>!document.querySelector('.studio-preparing')&&!JSON.parse([...document.querySelectorAll('canvas')].find(c=>c.dataset.cityStudio)?.dataset.cityStudio||'{}').busy,null,{timeout:30000}).catch(()=>{});await page.waitForTimeout(900);};
 const studio=()=>page.locator('canvas').evaluateAll(cs=>JSON.parse(cs.find(c=>c.dataset.cityStudio)?.dataset.cityStudio||'{}'));
 const saved=()=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio;});
 const resolved=()=>page.evaluate(async()=>{const {resolveSculpt}=await import('/src/domain/citySculpt.ts'),k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),d=JSON.parse(localStorage.getItem(k)).plots[0].draft;
  resolveSculpt(d.sculpt,d.design);const t=performance.now(),s=resolveSculpt(d.sculpt,d.design).studio,ms=performance.now()-t;
  return {ms,inactive:s.inactive,faces:(s.freeFaces??[]).map(f=>({id:f.id,curved:!!f.bend,facets:f.bend?f.bend.xs.length-1:0,groups:f.groups.map(g=>`${g.role}:${g.members.length}`),triangles:f.geometry.triangles,paint:(f.geometry.wallPaint??[]).length})),kitCurveTiles:s.pieces.filter(p=>/\/curve\/\d+\/\d+$/.test(p.id)).map(p=>p.id.split('/')[0])};});
 const orbit=async(dx,dy=0)=>{const box=await page.locator('canvas').first().boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height*.45;await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});for(let i=1;i<=10;i++){await page.mouse.move(cx+dx*i/10,cy+dy*i/10);await page.waitForTimeout(30);}await page.mouse.up({button:'right'});await page.mouse.move(box.x+40,box.y+box.height-40);};
 const zoom=async(ticks,at)=>{const box=await page.locator('canvas').first().boundingBox();await page.mouse.move(at?.x??box.x+box.width/2,at?.y??box.y+box.height*.45);for(let i=0;i<ticks;i++){await page.mouse.wheel(0,-240);await page.waitForTimeout(70);}await page.mouse.move(box.x+40,box.y+box.height-40);};

 // 1) Oval wing with seeded curved openings and trims; round tower plain (kit) for now.
 assert.ok((await seed({family:'pastel-stucco',wingOpenings:true})).ok);await open();
 let info=await resolved();console.log(JSON.stringify(info));
 assert.deepEqual(info.inactive.filter(i=>i.id.startsWith('wing-')),[],'every wing opening fits the curve');
 const wing=info.faces.find(f=>f.id==='wing/curve');assert.ok(wing?.curved&&wing.facets>20,'the oval wing is a bent generated wall');
 assert.ok(!info.kitCurveTiles.includes('wing'),'kit tiles of the owned curved wall are gone');
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(2200);await shot(page,'front');
 await orbit(-160,20);await zoom(5);await page.waitForTimeout(2200);await shot(page,'wing');

 // 2) Freeform on the round tower: hover curved bays until the ghost shows, click to cut.
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(1500);
 await page.keyboard.press('4');await page.getByRole('button',{name:'Freeform',exact:true}).click();await page.getByRole('button',{name:'Cut Window',exact:true}).click();
 const cut=async(floor,offset)=>{
  const all=(await studio()).bays.filter(b=>b.part==='tower'&&b.side==='curve'&&b.floor===floor&&b.x>150&&b.x<1450&&b.y>100&&b.y<900),centre=all.reduce((t,b)=>t+b.x,0)/all.length;
  const before=((await saved()).freeOpenings??[]).length,candidates=all.sort((p,q)=>Math.abs(p.x-centre-offset)-Math.abs(q.x-centre-offset));
  let spot=null;for(const b of candidates){await page.mouse.move(b.x,b.y);await page.waitForTimeout(180);const st=await studio();if(st.freeGhost){spot=b;break;}}
  assert.ok(spot,`a curved bay on floor ${floor} shows the ghost`);await page.mouse.click(spot.x,spot.y);
  await page.waitForFunction(n=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return (JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.freeOpenings??[]).length===n+1;},before,{timeout:15000})
   .catch(async e=>{const st=await studio();console.log('cut failed',floor,JSON.stringify({issue:st.issue,note:st.note,ghost:st.freeGhost,spot}),await page.locator('.studio-issue, [role=alert]').allTextContents().catch(()=>[]));await shot(page,'cut-failure');throw e;});
  await settle();return spot;};
 const s1=await cut(1,0);await shot(page,'freeform-ghost');
 await cut(2,-70);await cut(2,70);await cut(3,0);
 const tower=((await saved()).freeOpenings??[]).filter(o=>o.shapeId==='tower');assert.ok(tower.length===4&&tower.every(o=>o.side==='curve'),'four openings cut on the curved wall through the UI');
 info=await resolved();assert.deepEqual(info.inactive.filter(i=>tower.some(o=>o.id===i.id)),[],'UI-cut openings fit');assert.ok(info.faces.find(f=>f.id==='tower/curve')?.curved);
 // Drag one along the curve.
 const moved=tower[0];await page.mouse.move(s1.x,s1.y);await page.mouse.down();for(let i=1;i<=8;i++){await page.mouse.move(s1.x+i*8,s1.y);await page.waitForTimeout(90);}await page.mouse.up();
 await page.waitForFunction(([id,u])=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));const o=(JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.freeOpenings??[]).find(o=>o.id===id);return o&&Math.abs(o.u-u)>.003;},[moved.id,moved.u],{timeout:15000});
 await settle();await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(1800);await shot(page,'tower-front');
 const tc=(await studio()).bays.filter(b=>b.part==='tower'&&b.floor===2),tx=tc.reduce((t,b)=>t+b.x,0)/tc.length,ty=tc.reduce((t,b)=>t+b.y,0)/tc.length;
 await zoom(9,{x:tx,y:ty});await page.waitForTimeout(2200);await shot(page,'tower-close');
 await orbit(-90,10);await page.waitForTimeout(2200);await shot(page,'tower-angle');

 // 3) Paint a band on the curved tower wall (Paint → Band, drag from the base upwards).
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(1500);
 await page.getByRole('button',{name:'Paint',exact:true}).click();await page.getByRole('button',{name:'Brick',exact:true}).click().catch(()=>{});
 await page.getByRole('button',{name:'Band',exact:true}).click();
 const g0=(await studio()).bays.filter(b=>b.part==='tower'&&b.side==='curve'&&b.floor===0&&b.x>150&&b.x<1450).sort((a,b)=>Math.abs(a.x-700)-Math.abs(b.x-700))[0],g1=(await studio()).bays.find(b=>b.part==='tower'&&b.side==='curve'&&b.floor===1&&Math.abs(b.x-g0.x)<80)??{y:g0.y-120};
 const pxm=(g0.y-g1.y)/3.2,base=g0.y+pxm*1.7;
 await page.mouse.move(g0.x,base-pxm*.9);await page.waitForTimeout(200);await page.mouse.down();for(let i=1;i<=10;i++){await page.mouse.move(g0.x+i,base-pxm*.9+pxm*1.2*i/10);await page.waitForTimeout(25);}await page.mouse.up();
 await page.waitForFunction(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return (JSON.parse(localStorage.getItem(k)).plots[0].draft.sculpt.studio.paintRegions??[]).some(p=>p.shapeId==='tower'&&p.side==='curve'&&p.band);},null,{timeout:20000}).catch(async e=>{await shot(page,'paint-failure');throw e;});
 await settle();info=await resolved();assert.ok(info.faces.find(f=>f.id==='tower/curve').paint>=1,'band painted on the curved wall');
 await page.mouse.move(40,1000);await page.waitForTimeout(600);await orbit(-150,20);await page.waitForTimeout(2000);await shot(page,'painted');
 const tri=info.faces.find(f=>f.id==='tower/curve');

 // 4) Facade rhythm on both curved parts (townhouse, rich trims).
 assert.ok((await seed({family:'pale-limestone',rhythm:'townhouse'})).ok);await open();
 const rh=await resolved();console.log(JSON.stringify(rh));
 assert.ok(rh.faces.some(f=>f.id==='tower/curve'&&f.curved&&f.groups.length>=8)&&rh.faces.some(f=>f.id==='wing/curve'&&f.curved),'rhythm dresses both curved parts');
 assert.deepEqual(rh.inactive.filter(i=>i.id.startsWith('generated/')),[],'every generated opening fits the curves');
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(2200);await orbit(-120,15);await page.waitForTimeout(2200);await shot(page,'rhythm');
 await zoom(5);await page.waitForTimeout(2200);await shot(page,'rhythm-close');
 // Detail: a window on the round tower from close, a little off-axis (facet joints, reveals, frames on the chord).
 await page.getByRole('button',{name:'Front view'}).click();await page.waitForTimeout(1800);
 const t1=(await studio()).bays.filter(b=>b.part==='tower'&&b.floor===1),dx=t1.reduce((t,b)=>t+b.x,0)/t1.length,dy=t1.reduce((t,b)=>t+b.y,0)/t1.length;
 await zoom(14,{x:dx-40,y:dy});await orbit(-70,30);await page.waitForTimeout(2500);await shot(page,'rhythm-detail');
 assert.deepEqual(errors.filter(e=>!/favicon|ResizeObserver/.test(e)),[]);
 console.log(`Curved walls (${backend}): tower ${tri.triangles} tris/${tri.facets} facets, wing ${wing.triangles} tris; rhythm tower ${rh.faces.find(f=>f.id==='tower/curve').groups.length} groups; resolveSculpt ${info.ms.toFixed(1)} ms (openings) / ${rh.ms.toFixed(1)} ms (rhythm) warm in page.`);
}finally{await browser.close();}
