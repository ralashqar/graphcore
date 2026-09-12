import { studioTemplate } from './templates.ts'
import type { FlexibleGraph } from './flexible.ts'
import type { ClipRevision } from '../v3/animation.ts'
export const locomotionSlots=['idle','walk','run','backward','strafe_left','strafe_right'] as const
/** Compile an explicit supported subset. The living graph remains independent. */
export function mapFlexibleLocomotion(source:FlexibleGraph,mapping:Record<string,string>,clips:ClipRevision[]){
 const graph=studioTemplate(false),used=new Set<string>()
 graph.name=source.name+' · game locomotion'
 graph.nodes=graph.nodes.map(slot=>{
  const n=source.nodes.find(n=>n.id===mapping[slot.role]),clip=clips.find(c=>c.id===n?.clipId)
  if(!n||n.kind!=='clip'||!n.loop||!clip||clip.motionContract!==n.contractHash)throw Error(`${slot.role}: map a reviewed looping clip`)
  if(used.has(n.id))throw Error('Each locomotion role needs a distinct clip');used.add(n.id)
  if(slot.role!=='idle'&&clip.naturalSpeed<.15)throw Error(`${slot.role}: clip has no usable locomotion displacement`)
  return{...slot,label:n.label,description:n.description,duration:n.duration,clipId:clip.id,contractHash:n.contractHash}
 })
 return graph
}
