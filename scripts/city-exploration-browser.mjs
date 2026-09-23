import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const watchdog=setTimeout(()=>void browser.close(),240000);watchdog.unref();
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],loads=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(/PropertyBinding|GPUValidation|Error compiling|GL_INVALID/.test(m.text()))errors.push(m.text());});
 page.on('request',r=>{if(r.url().includes('/assets/city/character/'))loads.push(r.url());});
 if(process.env.CITY_CHARACTER_FAILURE==='1')await page.route('**/assets/city/character/ranger.glb',r=>r.abort());
 if(process.env.CITY_REDUCED==='1')await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(ao=>localStorage.setItem('city-scene-look-v1',JSON.stringify({look:'daylight',quality:'balanced',occlusion:ao})),process.env.CITY_AO_MODE||'architectural');
 await page.goto(`${process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5188'}/city?demo=1${process.env.CITY_BACKEND==='webgl'?'&cityBackend=webgl':''}`);
 await page.getByRole('button',{name:'Drive mode',exact:true}).click();
 const state=()=>page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityExploration||'null'));
 const car=()=>page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityDriving||'null'));
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityExploration);
 if(process.env.CITY_CHARACTER_FAILURE==='1'){
  await page.getByRole('button',{name:'Retry character'}).waitFor();await page.keyboard.press('e');assert.equal((await state()).mode,'driving');
  await page.unroute('**/assets/city/character/ranger.glb');await page.getByRole('button',{name:'Retry character'}).click();
 }
 await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.cityExploration||'{}').character==='ready');
 await page.waitForFunction(()=>Number(document.querySelector('canvas').dataset.cityPreparedBuildings)>=Number(document.querySelector('[data-city-resident-count]').getAttribute('data-city-resident-count')),null,{timeout:180000});
 console.log('Ready',await state());
 for(let i=0;i<3;i++){await page.keyboard.press('e');await page.getByRole('region',{name:'Walking controls'}).waitFor();await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityExploration).mode==='on-foot');await page.keyboard.press('e');await page.getByRole('region',{name:'Driving controls'}).waitFor();}
 await page.keyboard.down('w');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityDriving).speed>2);await page.keyboard.press('e');await page.keyboard.up('w');await page.getByText('Slow down to exit',{exact:true}).waitFor();await page.keyboard.press('r');await page.waitForTimeout(300);
 await page.keyboard.press('e');await page.getByRole('region',{name:'Walking controls'}).waitFor();await page.waitForTimeout(500);
 await page.screenshot({path:'output/playwright/city-character-idle.png'});
 await page.keyboard.press('g');await page.waitForTimeout(350);assert.equal(await page.locator('canvas').getAttribute('data-city-character-animation'),'wave');
 const start=(await state()).foot;await page.keyboard.down('w');await page.waitForTimeout(1000);await page.keyboard.up('w');await page.waitForTimeout(300);assert.ok((await state()).foot.z>start.z+1);assert.equal((await state()).foot.wave,0);
 await page.keyboard.down('w');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityExploration).foot.speed>5);await page.keyboard.down('Shift');await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('canvas').dataset.cityExploration).foot.speed;return s>2&&s<2.4;});await page.keyboard.press(' ');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityExploration).foot.grounded===false);await page.keyboard.up('w');await page.keyboard.up('Shift');await page.waitForTimeout(900);assert.ok((await state()).foot.grounded);
 await page.screenshot({path:'output/playwright/city-character-walking.png'});
 await page.keyboard.down('w');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityExploration).foot.speed>.1);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('w');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityExploration).foot.speed<.01);
 const saved=(await state()).foot,parked=await car();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.getByRole('region',{name:'Walking controls'}).waitFor();await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityExploration);assert.ok(Math.hypot((await state()).foot.x-saved.x,(await state()).foot.z-saved.z)<.2);assert.ok(Math.hypot((await car()).x-parked.x,(await car()).z-parked.z)<.01);
 const orbitStart=(await state()).camera;
 await page.mouse.move(450,350);await page.mouse.wheel(0,500);await page.waitForFunction(d=>JSON.parse(document.querySelector('canvas').dataset.cityExploration).camera.distance>d,orbitStart.distance);
 await page.mouse.wheel(0,-10000);await page.mouse.wheel(0,-10000);await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityExploration).camera.distance===2.4);
 await page.keyboard.press('-');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityExploration).camera.distance>2.4);
 const yawStart=(await state()).camera.heading;
 for(let i=0;i<3;i++){await page.mouse.move(300,350);await page.mouse.down({button:'left'});await page.mouse.move(1000,450,{steps:10});await page.mouse.up({button:'left'});}
 await page.waitForFunction(h=>Math.abs(JSON.parse(document.querySelector('canvas').dataset.cityExploration).camera.heading-(h-12.6))<.001,yawStart);
 const orbitSaved=(await state()).camera;await page.keyboard.press('Escape');await page.getByRole('button',{name:'Drive mode',exact:true}).click();await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityExploration);assert.deepEqual((await state()).camera,orbitSaved);
 await page.mouse.move(500,350);await page.mouse.down({button:'right'});await page.mouse.move(1024,350,{steps:20});await page.mouse.up({button:'right'});await page.waitForTimeout(600);await page.screenshot({path:'output/playwright/city-character-front.png'});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Jump',exact:true}).dispatchEvent('pointerdown');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityExploration).foot.grounded===false);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.equal(loads.filter(u=>u.endsWith('locomotion.glb')).length,1);assert.equal(loads.filter(u=>u.endsWith('ranger.glb')).length,process.env.CITY_CHARACTER_FAILURE==='1'?2:1);
 await page.keyboard.press('-');await page.keyboard.press('-');await page.waitForTimeout(400);const pinchStart=(await state()).camera.distance;
 const touch=await page.context().newCDPSession(page);
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:330,id:1},{x:220,y:330,id:2}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:90,y:330,id:1},{x:250,y:330,id:2}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(d=>JSON.parse(document.querySelector('canvas').dataset.cityExploration).camera.distance<d,pinchStart);await touch.detach();
 // Validate the second skin against the exact shared runtime clips, without mounting it.
 const rig=await page.evaluate(async()=>{
  const {preloadCityCharacter}=await import('/src/features/city/CityCharacter.tsx');
  const {AnimationMixer,Box3}=await import('/node_modules/three/build/three.module.js');
  const {clone}=await import('/node_modules/three/examples/jsm/utils/SkeletonUtils.js');const result=[];
  for(const skin of ['ranger','rogue']){const {model,animations}=await preloadCityCharacter(skin);const root=clone(model.scene),mixer=new AnimationMixer(root);let min=Infinity,max=-Infinity;
   for(const clip of animations.animations){const a=mixer.clipAction(clip).play();for(let t=0;t<clip.duration;t+=.1){mixer.setTime(t);root.updateMatrixWorld(true);root.traverse(o=>{if(o.isSkinnedMesh)o.computeBoundingBox();});const box=new Box3().setFromObject(root);min=Math.min(min,box.min.y);max=Math.max(max,box.max.y);if(!Number.isFinite(box.min.y))throw Error('Invalid skin bounds');}a.stop();}
   mixer.stopAllAction();result.push({skin,clips:animations.animations.map(c=>c.name),min,max});}
  return result;
 });console.log('Rig playback',rig);assert.ok(Math.abs(rig[0].min-rig[1].min)<.015);assert.ok(rig.every(r=>r.min>-.15&&r.max<3));

 if(process.env.CITY_AO_MODE==='screen')assert.equal(await page.locator('canvas').getAttribute('data-city-ao-pipelines'),'2');
 console.log('Result',{backend:await page.locator('canvas').getAttribute('data-city-backend'),physics:await page.locator('canvas').getAttribute('data-city-drive-performance'),errors,loads});assert.deepEqual(errors,[]);
}finally{await browser.close();}
