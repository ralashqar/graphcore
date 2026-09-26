// Facade rhythm rules panel: apply a style preset, edit opening pools (avoid round, favour arch), change
// coverage, scope a rule to one wall by clicking it, keep a wall plain, and place a manual free opening on a
// rhythm wall while generated openings stay around it. Needs a running dev server (CITY_TEST_ORIGIN).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5180',backend=process.env.CITY_BACKEND==='webgl'?'webgl':'native',suffix=backend==='webgl'?'-webgl':'';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/city?demo=1&cityStudio=1&cityStudioTest=1${backend==='webgl'?'&cityBackend=webgl':''}`);
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('city-land-v1-')),null,{timeout:90000});
 await page.evaluate(async()=>{
  const {initialLandDraft,LAND_OWNER}=await import('/src/domain/cityLand.ts'),{studioExample}=await import('/src/domain/cityStudioExamples.ts'),{studioDraft}=await import('/src/domain/cityStudio.ts');
  const key=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),world=JSON.parse(localStorage.getItem(key)),plot=world.plots[0];
  plot.owner=LAND_OWNER;plot.purchaseId='rhythm-rules-browser';plot.revision=(plot.revision??0)+1;
  const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
  r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:14,depth:9,startFloor:0,spanFloors:4},{id:'wing',kind:'rectangle',operation:'add',x:8.5,z:-1.5,width:4,depth:6,startFloor:0,spanFloors:3}];
  Object.assign(r.studio,{openings:[],assemblies:[],surfaces:[],stamps:undefined,variation:undefined,freeOpenings:undefined,freeTrims:undefined,roofOpenings:undefined,roofDetails:undefined,facadeRhythm:undefined,parts:{}});
  r.studio.defaults.family='pastel-stucco';r.studio.defaults.roof='mansard';
  plot.draft=studioDraft(draft,r);plot.draft.design.floors=4;localStorage.setItem(key,JSON.stringify(world));
 });
 await page.reload();
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('button',{name:'Visit test plot'}).click();
 await page.getByRole('region',{name:'Construction studio'}).waitFor({timeout:60000});
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityStudioKit==='ready',null,{timeout:60000}).catch(()=>{});
 const settle=async()=>{await page.waitForFunction(()=>!document.querySelector('.studio-preparing'),null,{timeout:30000}).catch(()=>{});await page.waitForTimeout(700);};
 await settle();
 const state=()=>page.locator('canvas').evaluateAll(cs=>JSON.parse(cs.find(c=>c.dataset.cityStudio)?.dataset.cityStudio||'{}'));
 const sculpt=()=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt;});
 const rhythm=async()=>(await sculpt()).studio.facadeRhythm;
 const until=async(fn,label)=>{const t=Date.now();while(Date.now()-t<15000){if(await fn())return;await page.waitForTimeout(150);}await page.screenshot({path:`output/city-studio-rhythm-rules-failure${suffix}.png`});throw Error(`Timed out: ${label}\n${JSON.stringify(await rhythm())}`);};
 // Expand the saved recipe in the page (the same pure functions the studio uses).
 const expanded=()=>page.evaluate(async()=>{
  const {expandFacadeRhythm}=await import('/src/domain/cityStudioFacadeRhythm.ts'),{studioBays}=await import('/src/domain/cityStudio.ts'),{resolveSculpt}=await import('/src/domain/citySculpt.ts');
  const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-')),draft=JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft,r=draft.sculpt,d=draft.design;
  const out=expandFacadeRhythm(r,d,studioBays(r,d)),studio=resolveSculpt(r,d).studio;
  return {openings:out.freeOpenings.map(o=>({id:o.id,shapeId:o.shapeId,side:o.side,shape:o.shape,u:o.u,bottom:o.bottom,width:o.width})),faces:out.faces,inactive:studio.inactive,groups:(studio.freeFaces??[]).flatMap(f=>f.groups.map(g=>({face:f.id,members:g.members})))};
 });
 const group=page.getByRole('group',{name:'Facade rhythm'});
 await page.keyboard.press('4');await page.getByRole('button',{name:'Rhythm',exact:true}).click();
 // 1. Style preset.
 await group.getByRole('button',{name:'Townhouse'}).click();
 await until(async()=>(await rhythm())?.style==='townhouse','townhouse');
 assert.equal((await rhythm()).version,2,'new rhythms use the rules model');
 await settle();await page.getByRole('button',{name:'Orbit view',exact:true}).click();await settle();
 const base=await expanded();assert.deepEqual(base.inactive,[]);
 // 2. Pools: favour round on the top storey (it appears), then long-press to avoid it; favour arches above.
 await group.getByRole('tab',{name:/^Top/}).click();
 await group.getByRole('button',{name:'Favour Round',exact:true}).click();await group.getByRole('button',{name:'Favour Round',exact:true}).click();
 await until(async()=>((await rhythm()).layers?.attic?.pool??[]).find(p=>p.id==='round')?.weight>=2,'round favoured');
 assert.ok((await expanded()).openings.some(o=>o.shape==='round'),'favoured round windows appear on the top storey');
 const round=group.getByRole('button',{name:'Round',exact:true});await round.scrollIntoViewIfNeeded();const box=await round.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(800);await page.mouse.up();
 await until(async()=>{const v=await rhythm();return v.layers?.attic?.pool&&!v.layers.attic.pool.some(p=>p.id==='round');},'round avoided by long-press');
 await group.getByRole('tab',{name:/^Upper/}).click();
 await group.getByRole('button',{name:'Arch',exact:true}).click();
 await group.getByRole('button',{name:'Favour Arch',exact:true}).click();await group.getByRole('button',{name:'Favour Arch',exact:true}).click();
 await until(async()=>((await rhythm()).layers?.upper?.pool??[]).find(p=>p.id==='arch')?.weight>=2,'arch favoured');
 const pools=await expanded();
 assert.ok(!pools.openings.some(o=>o.shape==='round'),'no round windows once avoided');
 assert.ok(pools.openings.filter(o=>o.shape==='arch').length>base.openings.filter(o=>o.shape==='arch').length,'more arches once favoured');
 // 3. Coverage (one undo step for the whole drag).
 const slider=group.getByRole('slider',{name:'upper coverage'});
 await slider.evaluate(el=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const v of ['0.9','0.7','0.5']){set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));}});
 await until(async()=>(await rhythm()).layers?.upper?.coverage===.5,'coverage .5');
 const covered=await expanded(),upper=o=>Number(o.id.split('/').at(-3))>0;
 assert.ok(covered.openings.filter(upper).length<pools.openings.filter(upper).length,'half coverage leaves blind bays');
 await settle();await page.screenshot({path:`output/city-studio-rhythm-rules${suffix}.png`});
 // 4. Scope a rule to one wall by clicking it.
 await group.getByRole('radio',{name:'This wall'}).click();
 await until(async()=>(await state()).tool==='rhythm-face','wall picking tool');
 const dockTop=async()=>(await page.locator('.studio-dock').boundingBox()).y-16;
 const pickWall=async(avoid=[])=>{const top=await dockTop();for(const b of (await state()).bays.filter(b=>b.floor>=1&&b.x>120&&b.x<1480&&b.y>90&&b.y<top&&!avoid.includes(`${b.part}/${b.side}`))){await page.mouse.move(b.x,b.y);await page.waitForTimeout(160);if((await state()).hover===b.id)return b;}return null;};
 const wall=await pickWall();assert.ok(wall,'a wall on screen');await page.mouse.click(wall.x,wall.y);
 await group.locator('.rhythm-targets span').first().waitFor({timeout:5000});
 await group.getByRole('button',{name:'Civic'}).click();
 await until(async()=>((await rhythm()).rules??[]).some(r=>r.partId===wall.part&&r.side===wall.side&&r.style==='civic'&&r.fromFloor===undefined),'wall style rule');
 await group.getByRole('tab',{name:/^Upper/}).click();await group.getByRole('button',{name:'Pointed arch',exact:true}).click();
 await until(async()=>((await rhythm()).rules??[]).some(r=>r.partId===wall.part&&r.side===wall.side&&r.layers?.upper?.pool?.some(p=>p.id==='pointed')),'wall pool rule');
 const scoped=await expanded();
 assert.ok(scoped.faces.find(f=>f.shapeId===wall.part&&f.side===wall.side).style==='civic','the clicked wall uses its own preset');
 assert.ok(scoped.faces.filter(f=>!(f.shapeId===wall.part&&f.side===wall.side)&&f.status==='generated').every(f=>f.style==='townhouse'),'other walls keep the building preset');
 await settle();await page.screenshot({path:`output/city-studio-rhythm-rules-wall${suffix}.png`});
 // 4b. Painted region: two clicks on the same wall, then a pool for that region only.
 await group.getByRole('radio',{name:'Painted region'}).click();
 const rowTop=await dockTop(),rowBays=(await state()).bays.filter(b=>b.part===wall.part&&b.side===wall.side&&b.floor>=1&&b.x>120&&b.x<1480&&b.y>90&&b.y<rowTop).sort((p,q)=>p.x-q.x);
 const visible=[];for(const b of rowBays){await page.mouse.move(b.x,b.y);await page.waitForTimeout(140);if((await state()).hover===b.id)visible.push(b);if(visible.length>=2)break;}
 assert.ok(visible.length>=2,'two bays of the chosen wall on screen');
 await page.mouse.click(visible[0].x,visible[0].y);await page.waitForTimeout(200);await page.mouse.click(visible[1].x,visible[1].y);
 await group.locator('.rhythm-targets span').first().waitFor({timeout:5000});
 await group.getByRole('tab',{name:/^Upper/}).click();await group.getByRole('button',{name:'Favour Round',exact:true}).click();await group.getByRole('button',{name:'Favour Round',exact:true}).click();
 await until(async()=>((await rhythm()).rules??[]).some(r=>r.x0!==undefined&&r.partId===wall.part&&r.side===wall.side&&r.fromFloor===Math.min(visible[0].floor,visible[1].floor)&&r.toFloor===Math.max(visible[0].floor,visible[1].floor)&&r.layers?.upper?.pool?.some(p=>p.id==='round'&&p.weight>=2)),'region rule');
 assert.deepEqual((await expanded()).inactive,[],'the region rule resolves');
 // 5. Plain wall: click mode from the whole-building scope (with walls selected it acts on the selection).
 await group.getByRole('radio',{name:'Whole building'}).click();
 await group.getByRole('button',{name:'Plain wall',exact:true}).click();
 await until(async()=>(await state()).tool==='rhythm-face','plain wall tool');
 const plain=await pickWall([`${wall.part}/${wall.side}`]);assert.ok(plain,'another wall to keep plain');await page.mouse.click(plain.x,plain.y);
 await until(async()=>((await rhythm()).rules??[]).some(r=>r.partId===plain.part&&r.side===plain.side&&r.off),'plain wall rule');
 await group.getByRole('button',{name:'Plain wall',exact:true}).click();
 // 6. A manual free opening on a rhythm wall: generated openings stay around it (fill is the default).
 await page.getByRole('button',{name:'Freeform',exact:true}).click();await page.getByRole('button',{name:'Cut Round window',exact:true}).click();
 const before=(await sculpt()).studio.freeOpenings?.length??0;
 let spot=null;
 const top=await dockTop();for(const b of (await state()).bays.filter(b=>b.floor===2&&b.x>150&&b.x<1450&&b.y>100&&b.y<top&&`${b.part}/${b.side}`!==`${plain.part}/${plain.side}`)){await page.mouse.move(b.x,b.y);await page.waitForTimeout(160);const st=await state();if(st.hover===b.id&&st.freeGhost&&!st.freeGhost.door){spot=b;break;}}
 assert.ok(spot,'a spot for a manual window');await page.mouse.click(spot.x,spot.y);
 await until(async()=>((await sculpt()).studio.freeOpenings?.length??0)>before,'manual window placed');
 const manual=(await sculpt()).studio.freeOpenings.at(-1),filled=await expanded();
 const around=filled.openings.filter(o=>o.shapeId===manual.shapeId&&o.side===manual.side);
 assert.ok(around.length>0,'generated openings remain on the wall with the manual window');
 assert.equal(filled.faces.find(f=>f.shapeId===manual.shapeId&&f.side===manual.side).status,'generated');
 assert.deepEqual(filled.inactive,[],'nothing collides');
 assert.ok(filled.groups.filter(g=>g.members.includes(manual.id)).every(g=>g.members.length===1),'the manual window never merges with generated ones');
 await page.getByRole('button',{name:'Orbit view',exact:true}).click();await settle();
 await page.screenshot({path:`output/city-studio-rhythm-rules-manual${suffix}.png`});
 // 7. Keep that wall manual from the rules panel (walls scope acts on the selection directly).
 await page.getByRole('button',{name:'Rhythm',exact:true}).click();
 await group.getByRole('button',{name:'Keep wall manual',exact:true}).click();
 const target=await pickWall();assert.ok(target);
 await page.mouse.click(target.x,target.y);
 await until(async()=>((await rhythm()).rules??[]).some(r=>r.partId===target.part&&r.side===target.side&&r.manual==='own'),'keep manual rule');
 assert.equal((await expanded()).faces.find(f=>f.shapeId===target.part&&f.side===target.side).status,(await sculpt()).studio.freeOpenings.some(o=>o.shapeId===target.part&&o.side===target.side)?'manual':'generated');
 await group.getByRole('button',{name:'Keep wall manual',exact:true}).click();
 const rules=await group.locator('.rhythm-rules li').count();assert.ok(rules>=2&&rules===(await rhythm()).rules.length,`scoped rules are listed (${rules})`);
 // Removing a rule from the list.
 await group.getByRole('button',{name:/^Remove rule /}).first().click();
 await until(async()=>(await rhythm()).rules?.length===rules-1,'rule removed');
 assert.deepEqual(errors.filter(e=>!/favicon|ResizeObserver/.test(e)),[]);
 console.log(`Rhythm rules (${backend}): preset ${base.openings.length} openings, pools ${pools.openings.filter(o=>o.shape==='arch').length} arches/0 round, coverage ${covered.openings.filter(upper).length}/${pools.openings.filter(upper).length} upper, wall rule ${wall.part}/${wall.side}, plain ${plain.part}/${plain.side}, manual window with ${around.length} generated openings around it, ${rules} rules listed.`);
}finally{await browser.close();}
