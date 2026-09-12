import type { Simulation, ActorState, Input } from '../v2/simulation.ts'
import type { Vec } from '../v2/spec.ts'
import { vaultGeometry,vaultPath,vaultPoint,VAULT_DURATION,type TraversalComponent } from './traversalComponents.ts'
type Session={component:TraversalComponent;points:Vec[];tick:number}
export class VaultController {
  sessions:Record<string,Session>={}
  reset(){this.sessions={}}
  active(id:string){return this.sessions[id]}
  step(sim:Simulation,actor:ActorState,input:Input,components:TraversalComponent[]):boolean{
    let session=this.sessions[actor.id]
    if(!session&&input.interact&&actor.mode==='ground'&&!actor.action&&!sim.interactions.owns(actor.id)){
      const world=sim.design.nodes.find(n=>n.kind==='world')!,spec=sim.actorSpec(actor)
      if(world.kind!=='world')return false
      for(const component of components){
        const box=vaultGeometry(world,component),face=box.position.z-box.size.z/2
        if(Math.abs(actor.position.y)>.05||Math.abs(actor.position.x-box.position.x)>box.size.x/2-spec.radius||face-actor.position.z<spec.radius-.02||face-actor.position.z>spec.radius+.5||Math.cos(actor.yaw)<.8)continue
        const points=vaultPath(box,actor.position,spec.radius)
        if(!sim.physics.supported(points[3])||points.slice(1).some((p,i)=>!sim.physics.actorPathClear(actor.id,points[i],p))){sim.event(actor,'vault_blocked','Vault route or landing is obstructed');return false}
        session={component,points,tick:0};this.sessions[actor.id]=session;actor.action=null;actor.vy=0;sim.transition(actor,'air');sim.event(actor,'vault_started',component.id);break
      }
    }
    if(!session)return false
    if(input.drop||input.cancel||actor.health<=0){delete this.sessions[actor.id];actor.vy=0;sim.transition(actor,'air');sim.event(actor,'vault_cancelled',session.component.id);return false}
    const t=++session.tick/(VAULT_DURATION*60),next=vaultPoint(session.points,t)
    if(!sim.physics.actorPathClear(actor.id,actor.position,next)||!sim.physics.supported(session.points[3])){
      delete this.sessions[actor.id];actor.vy=0;sim.transition(actor,'air');sim.event(actor,'vault_blocked','Vault interrupted by obstruction');return false
    }
    actor.position=next;actor.vy=0
    if(t>=1){delete this.sessions[actor.id];sim.transition(actor,'ground');sim.event(actor,'vault_completed',session.component.id)}
    return true
  }
}
