export async function acceptPerformanceGame(page,reports,design){
 if(design.mechanics?.performance?.abilities.some(p=>p.movementPolicy==='momentum-1.0.0')){
  try{
   await page.locator('#restart').click();await page.locator('canvas').focus()
   await page.waitForFunction(()=>{const s=window.__gameAcceptance.state();return s.actors.find(a=>a.id===s.player).mode==='ground'})
   await page.keyboard.down('d')
   const start=await page.evaluate(()=>window.__gameAcceptance.state().tick)
   await page.waitForFunction(t=>window.__gameAcceptance.state().tick>=t+12,start)
   await page.keyboard.down('z')
   await page.waitForFunction(()=>{const s=window.__gameAcceptance.state();return s.actors.find(a=>a.id===s.player).action?.ability==='runtime.program.roll'})
   await page.keyboard.up('z')
   const samples=await page.evaluate(async()=>{
    const samples=[];let previous=null,ended=null
    const deadline=performance.now()+12000
    while(performance.now()<deadline){
     await new Promise(requestAnimationFrame)
     const s=window.__gameAcceptance.state(),a=s.actors.find(a=>a.id===s.player),m=window.__gameAcceptance.metrics()
     if(previous&&s.tick>previous.tick){
      const root=m.presentationPositions?.[s.player],camera=m.cameraTarget
      samples.push({speed:Math.hypot(a.position.x-previous.x,a.position.z-previous.z)*60/(s.tick-previous.tick),cameraError:root&&camera?Math.hypot(camera[0]-root[0],camera[1]-root[1]-1,camera[2]-root[2]):Infinity})
     }
     previous={tick:s.tick,x:a.position.x,z:a.position.z}
     if(!a.action)ended??=s.tick
     if(ended!==null&&s.tick>=ended+6)break
    }
    return samples
   })
   if(samples.length<10||samples.some(s=>s.speed<.2||s.cameraError>1e-6))throw Error('Running roll stalled or camera diverged from presented actor')
   reports.push({nodeKey:'performance.momentum.presentation.keyboard',passed:true,minSpeed:Math.min(...samples.map(s=>s.speed)),cameraError:Math.max(...samples.map(s=>s.cameraError))})
  }catch(e){reports.push({nodeKey:'performance.momentum.presentation.keyboard',passed:false,message:String(e)})}
  finally{await page.keyboard.up('d');await page.keyboard.up('z')}
 }
 for(const p of design.mechanics?.performance?.abilities??[]){
  try{
   await page.locator('#restart').click();await page.locator('canvas').focus()
   await page.waitForFunction(()=>{const s=window.__gameAcceptance.state();return s.actors.find(a=>a.id===s.player).mode==='ground'})
   const before=await page.evaluate(()=>window.__gameAcceptance.state()),key=p.kind==='roll'?'z':'x'
   await page.keyboard.down(key)
   try{await page.waitForFunction(kind=>{const s=window.__gameAcceptance.state();return s.actors.find(a=>a.id===s.player).action?.ability===`runtime.program.${kind}`},p.kind,{timeout:4000})}finally{await page.keyboard.up(key)}
   await page.waitForFunction(()=>{const s=window.__gameAcceptance.state();return !s.actors.find(a=>a.id===s.player).action},{},{timeout:5000})
   const after=await page.evaluate(()=>window.__gameAcceptance.state()),a=after.actors.find(a=>a.id===after.player),b=before.actors.find(a=>a.id===before.player)
   if(a.shieldUntil!==b.shieldUntil||Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)>p.distance+.15)throw Error('Program movement/protection exceeded contract')
   const metrics=await page.evaluate(()=>window.__gameAcceptance.metrics())
   if(!metrics.somaActors?.includes(design.player)||metrics.proceduralFrames<1)throw Error('SOMA pose program was not displayed')
   if(p.kind==='uppercut'){
    const reaction=design.mechanics.performance.reactions.find(r=>r.id===p.reaction)
    const nearby=before.actors.find(t=>t.id!==before.player&&Math.hypot(t.position.x-b.position.x,t.position.z-b.position.z)<p.range&&design.nodes.some(n=>n.kind==='actor_instance'&&n.id===t.id&&reaction?.actorDefinitions.includes(n.definition)))
    if(nearby){
      await page.waitForFunction(id=>window.__gameAcceptance.state().events.some(e=>e.actor===id&&e.type==='reaction_started'),nearby.id,{timeout:4000})
      await page.waitForFunction(id=>window.__gameAcceptance.state().events.some(e=>e.actor===id&&e.type==='reaction_complete'),nearby.id,{timeout:8000})
      reports.push({nodeKey:'performance.receiver.keyboard',passed:true})
    }
   }
   reports.push({nodeKey:`performance.${p.kind}.keyboard`,passed:true})
  }catch(e){reports.push({nodeKey:`performance.${p.kind}.keyboard`,passed:false,message:String(e)})}
 }
}
