import { actionRecipe } from '../src/domain/game/v3/actionMechanics.ts'
import { acceptActionGame } from './game-action-browser-acceptance.mjs'
import { createServer } from 'node:http'
import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { resolve,extname,sep } from 'node:path'
import { chromium } from 'playwright'
import { createUnified } from '../src/domain/game/v3/recipes.ts'
import { of } from '../src/domain/game/v3/spec.ts'
import { mechanicRecipe } from '../src/domain/game/v3/mechanics.ts'
import { compile } from '../src/domain/game/v3/compiler.ts'
const motion=process.argv.includes('--motion')
const directory=resolve(motion?'output/game-motion-browser':'output/game-mechanics'),root=resolve('dist-game'),reports=[],errors=[]
await mkdir(directory,{recursive:true})
const design=createUnified('exploration')
of(design,'world')[0].boxes.push({id:'wall',position:{x:1,y:3,z:0},size:{x:1,y:6,z:12},ramp:false})
of(design,'actor_instance').find(a=>a.id===design.player).position={x:.1,y:0,z:-4}
design.mechanics={version:1,packages:[mechanicRecipe('wall_run','character.player')],surfaces:[{id:'surface.wall',collider:'wall',face:'x-',capabilities:['wall_run','wall_slide','wall_jump']}]}
if(motion)design.mechanics.motionProfile='motion-1.0.0'
const identity={id:crypto.randomUUID(),projectId:crypto.randomUUID(),draftId:crypto.randomUUID(),sourceRevision:1}
let manifest=await compile(design,identity)
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname
  if(pathname==='/candidate.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({manifest,assetUrls:{}}))}
  if(pathname==='/creator'){res.setHeader('Content-Type','text/html');return res.end('<iframe src="/?acceptance=1" style="width:1200px;height:800px"></iframe><script>window.messages=[];addEventListener("message",e=>{messages.push(e.data);if(e.data.type==="listening")fetch("/candidate.json").then(r=>r.json()).then(v=>e.source.postMessage({...v,protocol:"graphcore.game.v1",type:"load",session:"browser-test-session"},location.origin))})</script>')}
  const file=resolve(root,pathname==='/'?'index.html':pathname.slice(1))
  if(!file.startsWith(root+sep))return res.writeHead(403).end()
  const bytes=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm'})[extname(file)]??'application/octet-stream');res.end(bytes)
 }catch{res.writeHead(404).end()}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try{
 const page=await browser.newPage({viewport:{width:1280,height:950}})
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
 await page.goto(origin+'/creator')
 const frame=page.frames().find(f=>f.url().includes('acceptance=1'))
 await frame.waitForFunction(()=>window.__gameAcceptance?.ready,undefined,{timeout:60000})
 if(motion){await page.screenshot({path:resolve(directory,'neutral.png')})}
 const snapshot=()=>frame.evaluate(()=>({state:window.__gameAcceptance.state(),mechanics:window.__gameAcceptance.metrics().mechanics}))
 await frame.locator('canvas').focus()
 await page.keyboard.down('w');await page.waitForTimeout(180)
 await page.keyboard.down('v');await page.keyboard.press('Space')
 await frame.waitForFunction(()=>Object.values(window.__gameAcceptance.metrics().mechanics).some(s=>s.phase==='attached'),undefined,{timeout:8000})
 const attached=await snapshot()
 reports.push({test:'keyboard_wall_run',passed:true,position:attached.state.actors.find(a=>a.id===design.player).position})
 await page.keyboard.press('Space')
 await frame.waitForFunction(()=>Object.values(window.__gameAcceptance.metrics().mechanics).some(s=>s.jumps===1),undefined,{timeout:3000})
 await page.keyboard.up('v');await page.keyboard.up('w')
 const departure=await snapshot()
 reports.push({test:'keyboard_wall_jump',passed:departure.mechanics[design.player].jumps===1})
 await page.screenshot({path:resolve(directory,'wall-departure.png')})
 await frame.waitForFunction(()=>window.__gameAcceptance.state().actors.find(a=>a.id===window.__gameAcceptance.state().player).mode==='ground',undefined,{timeout:10000})
 const replacement=structuredClone(design);replacement.mechanics.packages=[mechanicRecipe('wall_slide','character.player')]
 const next=await compile(replacement,{...identity,id:crypto.randomUUID(),sourceRevision:2})
 const before=await snapshot()
 const send=async(target,from,session='browser-test-session')=>page.evaluate(({target,from,session})=>document.querySelector('iframe').contentWindow.postMessage({protocol:'graphcore.game.v1',type:'apply_mechanics',session,requestId:target.id,fromBuildId:from,manifest:target},location.origin),{target,from,session})
 await send(next,manifest.id,'wrong-session');await page.waitForTimeout(150)
 reports.push({test:'reject_wrong_session',passed:(await snapshot()).state.buildId===manifest.id})
 await send(next,manifest.id)
 await page.waitForFunction(id=>window.messages.some(m=>m.type==='mechanics_applied'&&m.buildId===id),next.id,{timeout:8000})
 const after=await snapshot()
 reports.push({test:'live_apply_preserves_mission',passed:JSON.stringify(before.state.mission)===JSON.stringify(after.state.mission)&&after.state.buildId===next.id})
 await frame.locator('#restart').click();await frame.locator('canvas').focus()
 await page.keyboard.down('v');await page.keyboard.press('Space')
 await frame.waitForFunction(()=>Object.values(window.__gameAcceptance.metrics().mechanics).some(s=>s.phase==='attached'),undefined,{timeout:4000})
 const slide=await snapshot()
 reports.push({test:'keyboard_wall_slide',passed:slide.mechanics[design.player].velocity.y>=-2.001})
 await send(manifest,next.id)
 await page.waitForFunction(id=>window.messages.some(m=>m.type==='mechanics_rejected'&&m.requestId===id),manifest.id)
 reports.push({test:'reject_airborne_apply',passed:(await snapshot()).state.buildId===next.id})
 await page.keyboard.up('v')
 await frame.waitForFunction(()=>window.__gameAcceptance.state().actors.find(a=>a.id===window.__gameAcceptance.state().player).mode==='ground',undefined,{timeout:8000})
 const invalid=structuredClone(next);invalid.id=crypto.randomUUID();invalid.design.nodes.find(n=>n.kind==='world').boxes[0].size.x+=1
 await send(invalid,next.id)
 await page.waitForFunction(id=>window.messages.some(m=>m.type==='mechanics_rejected'&&m.requestId===id),invalid.id)
 reports.push({test:'reject_live_geometry',passed:(await snapshot()).state.buildId===next.id})
 await send(manifest,next.id)
 await page.waitForFunction(id=>window.messages.some(m=>m.type==='mechanics_applied'&&m.buildId===id),manifest.id)
 reports.push({test:'rollback',passed:(await snapshot()).state.buildId===manifest.id})
 await frame.locator('#save').click();await frame.locator('#restart').click();await frame.locator('#load').click()
 reports.push({test:'checkpoint_after_rollback',passed:(await snapshot()).state.buildId===manifest.id})
 const baselineDesign=structuredClone(design);delete baselineDesign.mechanics
 const baseline=await compile(baselineDesign,{...identity,id:crypto.randomUUID(),sourceRevision:0})
 await send(baseline,manifest.id)
 await page.waitForFunction(id=>window.messages.some(m=>m.type==='mechanics_applied'&&m.buildId===id),baseline.id)
 reports.push({test:'rollback_to_pre_mechanic_runtime',passed:(await snapshot()).state.buildId===baseline.id})
 const actionDesign=structuredClone(baselineDesign)
 actionDesign.mechanics={version:1,packages:[],surfaces:[],actions:[actionRecipe('combo','character.player'),actionRecipe('dash','character.player')]}
 if(motion)actionDesign.mechanics.motionProfile='motion-1.0.0'
 const actions=await compile(actionDesign,{...identity,id:crypto.randomUUID(),sourceRevision:3})
 const preserved=await snapshot()
 await send(actions,baseline.id)
 await page.waitForFunction(id=>window.messages.some(m=>m.type==='mechanics_applied'&&m.buildId===id),actions.id)
 reports.push({test:'live_action_install_preserves_progress',passed:JSON.stringify(preserved.state.mission)===JSON.stringify((await snapshot()).state.mission)})
 await acceptActionGame({locator:frame.locator.bind(frame),evaluate:frame.evaluate.bind(frame),waitForFunction:frame.waitForFunction.bind(frame),keyboard:page.keyboard},reports,actionDesign)
 await frame.locator('#save').click();await frame.locator('#restart').click();await frame.locator('#load').click()
 reports.push({test:'actions_checkpoint',passed:(await snapshot()).state.buildId===actions.id})
 await frame.locator('#restart').click();await frame.locator('canvas').focus()
 await page.keyboard.press('1')
 await frame.waitForFunction(()=>window.__gameAcceptance.state().events.some(e=>e.type==='release'&&e.detail==='ability.bolt'),undefined,{timeout:4000})
 reports.push({test:'original_loadout_still_accessible',passed:true})
 await frame.locator('#restart').click()
 await send(baseline,actions.id)
 await page.waitForFunction(id=>window.messages.some(m=>m.type==='mechanics_applied'&&m.buildId===id),baseline.id)
 reports.push({test:'action_rollback',passed:(await snapshot()).state.buildId===baseline.id})
 reports.push({test:'runtime_errors' ,passed:errors.length===0,errors})
 await writeFile(resolve(directory,'report.json'),JSON.stringify(reports,null,2))
 console.log(JSON.stringify(reports,null,2))
 if(reports.some(r=>!r.passed))throw new Error('Mechanic browser acceptance failed')
}finally{await browser.close();await new Promise(r=>server.close(r))}
