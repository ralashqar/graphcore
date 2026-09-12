import { flexibleGraphSchema } from './flexible.ts'
import { mapFlexibleLocomotion } from './gameMapping.ts'
import { z } from 'zod'
import { graphSchema, validateGraph } from './graph.ts'
import { clipRevisionSchema } from '../v3/animation.ts'
import type { Design } from '../v3/spec.ts'
export const studioBindingSchema=z.object({graph:graphSchema,sourceGraph:flexibleGraphSchema.optional(),mapping:z.record(z.string(),z.string()).optional(),actorDefinition:z.string(),clips:z.array(clipRevisionSchema).max(80)}).strict()
export type StudioBinding=z.infer<typeof studioBindingSchema>
export function bindingProblems(binding:StudioBinding,design:Design):string[]{
 const errors=validateGraph(binding.graph)
 if(binding.sourceGraph){try{if(JSON.stringify(mapFlexibleLocomotion(binding.sourceGraph,binding.mapping??{},binding.clips))!==JSON.stringify(binding.graph))errors.push('Game mapping differs from frozen graph')}catch(e){errors.push(String(e))}}
 const actor=design.nodes.find(n=>n.kind==='actor_definition'&&n.id===binding.actorDefinition)
 if(!actor||actor.kind!=='actor_definition'||actor.motionProfile?.rig!=='humanoid.fabric-ybot.v1')errors.push('Target actor requires the Fabric motion profile')
 for(const node of binding.graph.nodes){const clip=binding.clips.find(c=>c.id===node.clipId);if(!clip||clip.motionContract!==node.contractHash||(!node.loop&&Math.abs(clip.duration-node.duration)>1/30+.001))errors.push(`${node.id}: reviewed clip contract mismatch`)}
 const actions=binding.graph.nodes.filter(n=>n.kind==='action'),combo=design.mechanics?.actions?.find(p=>p.capability==='combo'&&p.actorDefinition===binding.actorDefinition)
 if(actions.length){
  if(!combo||combo.capability!=='combo')errors.push('A separately reviewed three-strike combo mechanic is required')
  else for(let i=0;i<3;i++){
   const node=binding.graph.nodes.find(n=>n.id===`sword.strike_${i+1}`),strike=combo.strikes[i]
   if(!node||Math.abs(node.duration-(strike.windup+strike.active+strike.recovery))>1/30+.001||Math.abs(node.impact*node.duration-strike.windup)>1/30+.001)errors.push(`Strike ${i+1}: animation duration/impact differs from gameplay timing; regenerate or review a mechanic proposal`)
  }
 }
 return errors
}
