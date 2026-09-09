import { acceptPerformanceGame } from './game-performance-browser-acceptance.mjs'
import { acceptActionGame } from './game-action-browser-acceptance.mjs'
export async function acceptMechanicGame(page,reports,design){
 await acceptActionGame(page,reports,design)
 await acceptPerformanceGame(page,reports,design)
 const bundle=design.mechanics
 if(!bundle?.packages.length)return
 const state=()=>page.evaluate(()=>window.__gameAcceptance.state())
 const pulse=async key=>{
  const before=(await state()).tick
  await page.keyboard.down(key)
  try{await page.waitForFunction(tick=>window.__gameAcceptance.state().tick>tick,before,{timeout:3000})}
  finally{await page.keyboard.up(key)}
 }
 const release=async()=>{for(const k of ['w','a','s','d','v','Space'])await page.keyboard.up(k)}
 for(const package_ of bundle.packages){
  try{
   await release();await page.locator('#restart').click();await page.locator('canvas').focus()
   const profile=bundle.surfaces.find(s=>s.capabilities.includes(package_.capability)),world=design.nodes.find(n=>n.kind==='world'),box=world.boxes.find(b=>b.id===profile?.collider)
   if(!box)throw Error('Missing authored wall')
   const actor=design.nodes.find(n=>n.id===package_.actorDefinition),axis=profile.face.startsWith('x'),sign=profile.face.endsWith('+')?1:-1
   const normal={x:axis?sign:0,z:axis?0:sign},tangent={x:normal.z,z:-normal.x}
   const target={x:box.position.x+normal.x*(box.size.x/2+actor.radius+.04),z:box.position.z+normal.z*(box.size.z/2+actor.radius+.04)}
   const path=await page.evaluate(p=>window.__gameAcceptance.pathToPoint(p),target)
   if(!path)throw Error('No supported keyboard approach to wall')
   const turns=path.filter((p,i)=>i===0||i===path.length-1||(p.x-path[i-1].x)!==(path[i+1].x-p.x)||(p.z-path[i-1].z)!==(path[i+1].z-p.z))
   const approachDeadline=Date.now()+90000
   const movement=design.nodes.find(n=>n.id===actor.movement)
   // The renderer may consume six fixed ticks per input sample. Intermediate
   // waypoints need that spatial tolerance; final wall alignment uses collision.
   const waypointTolerance=Math.max(.25,movement.speed*.1/Math.SQRT2+.03)
   for(const point of turns){
    const initial=await state(),origin=initial.actors.find(a=>a.id===initial.player).position
    const tickBudget=Math.ceil((Math.abs(point.x-origin.x)+Math.abs(point.z-origin.z))/movement.speed*60*2)+120
    const deadline=Math.min(approachDeadline,Date.now()+30000)
    let held=null
    try{
    while(true){
     const s=await state(),a=s.actors.find(a=>a.id===s.player),dx=point.x-a.position.x,dz=point.z-a.position.z
     if(Math.hypot(dx,dz)<waypointTolerance)break
     if(Date.now()>deadline||s.tick-initial.tick>tickBudget)throw Error(`Keyboard wall approach timed out: target=${JSON.stringify(point)} actor=${JSON.stringify(a.position)}`)
     const key=Math.abs(dx)>Math.abs(dz)?dx>0?'d':'a':dz>0?'w':'s'
     if(key!==held){if(held)await page.keyboard.up(held);await page.keyboard.down(key);held=key}
     await page.waitForFunction(tick=>window.__gameAcceptance.state().tick>tick,s.tick,{timeout:3000})
    }
    }finally{if(held)await page.keyboard.up(held)}
   }
   const alignKey=axis?(sign>0?'a':'d'):(sign>0?'s':'w')
   const alignDeadline=Date.now()+5000
   while(true){
    const s=await state(),a=s.actors.find(a=>a.id===s.player)
    const gap=(axis?a.position.x-box.position.x:a.position.z-box.position.z)*sign-(axis?box.size.x:box.size.z)/2-actor.radius
    if(gap<-.02)throw Error('Approach reached the wrong side of the authored wall')
    if(gap<=.08)break
    if(Date.now()>alignDeadline)throw Error('Collision-guided wall alignment timed out')
    await pulse(alignKey)
   }
   const direction=tangent.x?tangent.x>0?'d':'a':tangent.z>0?'w':'s'
   if(package_.capability==='wall_run'){await page.keyboard.down(direction);await page.waitForTimeout(160)}
   await page.keyboard.down('v');await page.keyboard.press('Space')
   if(package_.capability==='wall_jump'){
    // Two jump edges must reach different simulation ticks, even at low render FPS.
    await page.waitForFunction(()=>{const s=window.__gameAcceptance.state();return s.actors.find(a=>a.id===s.player).mode==='air'},undefined,{timeout:3000})
    await page.keyboard.press('Space')
   }
   await page.waitForFunction(({id,capability})=>{
    const m=window.__gameAcceptance.metrics().mechanics,s=window.__gameAcceptance.state(),v=m[s.player]
    return capability==='wall_jump'?v?.jumps===1:v?.phase==='attached'&&v.packageId===id
   },{id:package_.id,capability:package_.capability},{timeout:3000})
   await release()
   // Bound gameplay time separately from software-renderer wall time.
   // A slow render frame can advance at most six fixed ticks.
   const releasedAt=(await state()).tick
   await page.waitForFunction(tick=>{const s=window.__gameAcceptance.state();return s.actors.find(a=>a.id===s.player).mode==='ground'||s.tick-tick>=180},releasedAt,{timeout:30000})
   if((await state()).actors.find(a=>a.id===design.player).mode!=='ground')throw Error('Wall departure did not land within 180 simulation ticks')
   reports.push({nodeKey:`${package_.id}.keyboard`,passed:true,message:'Keyboard approach, activation, release and landing on authored surface'})
  }catch(error){const detail=await page.evaluate(()=>{const s=window.__gameAcceptance.state();return{tick:s.tick,actor:s.actors.find(a=>a.id===s.player),mechanics:window.__gameAcceptance.metrics().mechanics[s.player]}});reports.push({nodeKey:`${package_.id}.keyboard`,passed:false,message:String(error),measured:detail})}
  finally{await release()}
 }
}
