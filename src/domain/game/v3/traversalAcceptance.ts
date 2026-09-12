import { UnifiedSimulation } from './simulation.ts'
import { of,type Design } from './spec.ts'
import { vaultGeometry } from './traversalComponents.ts'
export async function acceptTraversalComponents(design:Design,buildId:string){
  const reports:{nodeKey:string;passed:boolean;message:string}[]=[]
  for(const component of design.mechanics?.traversal??[]){
    const sim=await UnifiedSimulation.createUnified(design,buildId)
    try{
      if(of(design,'actor_instance').find(i=>i.id===design.player)?.definition!==component.actorDefinition)throw Error('Initial vault supports the player controller only')
      const box=vaultGeometry(of(design,'world')[0],component),actor=sim.player,spec=sim.actorSpec(actor)
      actor.position={x:box.position.x,y:0,z:box.position.z-box.size.z/2-spec.radius-.15};actor.yaw=0
      if(!sim.physics.free(actor.id,actor.position))throw Error('Vault approach is obstructed')
      sim.step({interact:true});if(!sim.vaultController.active(actor.id))throw Error('Vault did not start from the canonical approach')
      for(let i=0;i<60;i++)sim.step()
      if(!sim.state.events.some(e=>e.type==='vault_completed')||actor.mode!=='ground')throw Error('Vault did not complete on supported ground')
      const before=actor.position.z;for(let i=0;i<10;i++)sim.step({z:1})
      if(actor.position.z<=before)throw Error('Walking did not resume')
      reports.push({nodeKey:component.id,passed:true,message:'Authored vault route, landing and walking verified'})
    }catch(e){reports.push({nodeKey:component.id,passed:false,message:String(e)})}finally{sim.dispose()}
  }
  return reports
}
