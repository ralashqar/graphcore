import type { Design } from './spec.ts'
import type { ClipRevision } from './animation.ts'
import { defaultMotionProfile, type MotionProfile } from './motionProfile.ts'
import { makeMotionSet, motionSetRequirements, requiredMotionStates, locomotionRoles, MOTION_SET_CATALOG } from './motionSets.ts'
export const ANIMATION_CATALOG=MOTION_SET_CATALOG
export const locomotionStates=locomotionRoles
export const actorAnimationRequirements=requiredMotionStates
export function proposeAnimations(design:Design,rigRevision:string,accepted:ClipRevision[],rigs:Array<{id:string;revision:string}>=[]){
 return design.nodes.filter(n=>n.kind==='actor_definition').map(actor=>{
  const profile:MotionProfile=actor.motionProfile??{...defaultMotionProfile,rig:(rigs.find(r=>r.revision===rigRevision)?.id??'humanoid.soma.v2') as MotionProfile['rig']}
  const revision=rigs.find(r=>r.id===profile.rig)?.revision??rigRevision
  const sets=(['locomotion','traversal'] as const).flatMap(group=>{
   const states=requiredMotionStates(design,actor.id).filter(s=>(locomotionRoles as readonly string[]).includes(s)===(group==='locomotion'))
   return states.length?[makeMotionSet(design,actor.id,revision,profile,group)]:[]
  })
  return {actorDefinition:actor.id,catalogVersion:ANIMATION_CATALOG,sets,requirements:sets.flatMap(set=>motionSetRequirements(set,accepted).map(r=>({...r,recipeProfile:`humanoid.${r.state}.v1`,providerOptions:r.providers,support:r.providers.some(p=>p.status==='technically_validated')?'technically_validated':'awaiting_motion_acceptance'})))}
 })
}
