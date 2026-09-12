export async function acceptTraversalComponents(page,reports,design){
 const state=()=>page.evaluate(()=>window.__gameAcceptance.state())
 const release=async()=>{for(const key of ['w','a','s','d','e'])await page.keyboard.up(key)}
 const pulse=async key=>{const t=(await state()).tick;await page.keyboard.down(key);try{await page.waitForFunction(t=>window.__gameAcceptance.state().tick>t,t)}finally{await page.keyboard.up(key)}}
 for(const component of design.mechanics?.traversal??[]){
  try{
   await release();await page.locator('#restart').click();await page.locator('canvas').focus()
   const actor=design.nodes.find(n=>n.id===component.actorDefinition),box=design.nodes.find(n=>n.kind==='world').boxes.find(b=>b.id===component.collider)
   const target={x:box.position.x,z:box.position.z-box.size.z/2-actor.radius-.2}
   const path=await page.evaluate(p=>window.__gameAcceptance.pathToPoint(p),target)
   if(!path)throw Error('No keyboard path to vault approach')
   for(const point of [...path,target]){
    const deadline=Date.now()+10000
    while(true){
     const s=await state(),p=s.actors.find(a=>a.id===s.player).position,dx=point.x-p.x,dz=point.z-p.z
     if(Math.hypot(dx,dz)<.18)break
     if(Date.now()>deadline)throw Error('Vault keyboard approach timed out')
     await pulse(Math.abs(dx)>Math.abs(dz)?dx>0?'d':'a':dz>0?'w':'s')
    }
   }
   await pulse('w');await pulse('e')
   await page.waitForFunction(id=>window.__gameAcceptance.state().events.some(e=>e.type==='vault_completed'&&e.detail===id),component.id,{timeout:10000})
   const s=await state();if(s.actors.find(a=>a.id===s.player).mode!=='ground')throw Error('Vault did not land')
   reports.push({nodeKey:component.id+'.keyboard',passed:true,message:'Keyboard approach, authored vault and supported landing'})
  }catch(e){reports.push({nodeKey:component.id+'.keyboard',passed:false,message:String(e)})}finally{await release()}
 }
}
