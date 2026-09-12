import { motionNavigationPlan } from './motionNavigation.ts'
import { z } from 'zod'
import { motionProfileSchema, defaultMotionProfile, type MotionProfile } from './motionProfile.ts'
import { animationStateSchema, type ClipRevision, type MotionRecipe } from './animation.ts'
import { animationRecipeProfile } from './animationProfiles.ts'
import { motionbricksRecipe } from './animationProviders.ts'
import { hashGameValue } from '../compiler.ts'
import type { Design } from './spec.ts'
export const MOTION_SET_CATALOG = 'humanoid-motion-2.0.0'
export const locomotionRoles = ['idle','walk','run','backward','strafe_left','strafe_right'] as const
export const motionSetSchema=z.object({version:z.literal(1),id:z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),actorDefinition:z.string().min(1).max(100),group:z.enum(['locomotion','traversal']),catalogVersion:z.literal(MOTION_SET_CATALOG),profile:motionProfileSchema,rigRevision:z.string().regex(/^[a-f0-9]{64}$/),states:z.array(animationStateSchema).min(1).max(25)}).strict().refine(s=>new Set(s.states).size===s.states.length,'Duplicate motion role')
export type MotionSet=z.infer<typeof motionSetSchema>
export type CapabilityStatus='unsupported'|'experimental'|'technically_validated'|'release_ready'
export function motionCapability(provider:'kimodo'|'motionbricks',profile:MotionProfile,state:MotionRecipe['state']):{status:CapabilityStatus;admissible:boolean;reason:string}{
  if(profile.style!=='neutral')return {status:'experimental',admissible:false,reason:'This archetype gait has no validated target-rig adapter'}
  if(provider==='motionbricks')return ['idle','walk'].includes(state)&&profile.rig!=='humanoid.mannequin.v1'
    ?{status:'technically_validated',admissible:true,reason:'Native G1 and target-rig bake passed; user review is required'}
    :{status:'experimental',admissible:false,reason:state==='run'?'No validated running primitive; accelerated walking is not running':'Directional or traversal adapter requires validation'}
  if(profile.rig==='humanoid.fabric-ybot.v1'&&(locomotionRoles as readonly string[]).includes(state))return {status:'technically_validated',admissible:true,reason:'Saved Kimodo source passed Fabric retarget and export validation; review is required'}
  return (locomotionRoles as readonly string[]).includes(state)?{status:'technically_validated',admissible:true,reason:'Validated neutral locomotion on the original rig; user review is required'}:{status:'experimental',admissible:false,reason:'Requires validated gameplay milestone and contact constraints'}
}
export function requiredMotionStates(design:Design,actorId:string):MotionRecipe['state'][]{
  const actor=design.nodes.find(n=>n.kind==='actor_definition'&&n.id===actorId)
  if(!actor||actor.kind!=='actor_definition')return []
  const movement=design.nodes.find(n=>n.kind==='movement'&&n.id===actor.movement)
  const states:MotionRecipe['state'][]=[...locomotionRoles]
  if(movement?.kind==='movement'&&movement.sprint<=movement.speed)states.splice(states.indexOf('run'),1)
  if(movement?.kind==='movement'&&movement.jump>0)states.push('takeoff','airborne','landing')
  if(design.nodes.some(n=>n.kind==='ability'&&n.op==='roll'&&actor.abilities.includes(n.id)))states.push('roll')
  if(actor.canClimb)states.push('catch','hang','shimmy_left','shimmy_right','climb')
  if(design.mechanics?.traversal?.some(t=>t.actorDefinition===actorId))states.push('vault')
  for(const ability of design.mechanics?.performance?.abilities??[])if(ability.actorDefinition===actorId)states.push(ability.kind)
  for(const reaction of design.mechanics?.performance?.reactions??[])if(reaction.actorDefinitions.includes(actorId))states.push('recoil','fall_back','prone','get_up')
  return [...new Set(states)]
}
export function makeMotionSet(design:Design,actorDefinition:string,rigRevision:string,profile:MotionProfile=defaultMotionProfile,group:'locomotion'|'traversal'='locomotion'):MotionSet{
  return motionSetSchema.parse({version:1,id:`motion.${actorDefinition}.${group}`,actorDefinition,group,catalogVersion:MOTION_SET_CATALOG,rigRevision,profile,states:requiredMotionStates(design,actorDefinition).filter(s=>(locomotionRoles as readonly string[]).includes(s)===(group==='locomotion'))})
}
export function reusableClip(set:MotionSet,state:MotionRecipe['state'],clips:ClipRevision[]){
  return clips.find(c=>c.state===state&&c.rigRevision===set.rigRevision&&!c.motionContract&&(c.style??'neutral')===set.profile.style&&c.validation.accepted)
}
export function motionSetRequirements(set:MotionSet,accepted:ClipRevision[]){
  return set.states.map(state=>({state,group:(locomotionRoles as readonly string[]).includes(state)?'locomotion':'traversal',clipRevision:reusableClip(set,state,accepted)?.id??null,
    providers:(['motionbricks','kimodo'] as const).map(provider=>({provider,...motionCapability(provider,set.profile,state),...(provider==='motionbricks'?{navigation:motionNavigationPlan(state,set.profile)}:{})})),
    stages:['constraints','inference/reuse','retarget','process','export','validate','review','binding'],approximation:true}))
}
export function recipeForSet(set:MotionSet,state:MotionRecipe['state'],provider:'kimodo'|'motionbricks'){
  if(state==='custom'||!set.states.includes(state)||!motionCapability(provider,set.profile,state).admissible)throw Error('Motion capability is not admitted for this set')
  let recipe=animationRecipeProfile(state,set.rigRevision)
  if(provider==='kimodo'&&set.profile.rig==='humanoid.fabric-ybot.v1')recipe={...recipe,version:1,model:'Kimodo-SOMA-RP-v1.1',retargetRevision:'soma-fabric-1.0.0'}
  return provider==='motionbricks'?motionbricksRecipe(recipe):recipe
}
export async function motionSetRevision(set:MotionSet){return hashGameValue(motionSetSchema.parse(set))}
export function validateMotionSet(set:MotionSet,clips:ClipRevision[]){
  const failures:string[]=[]
  for(const state of set.states){const clip=reusableClip(set,state,clips);if(!clip){failures.push(`Missing compatible accepted ${state}`);continue}
    if((locomotionRoles as readonly string[]).includes(state)&&(!clip.loop||(state!=='idle'&&clip.naturalSpeed<.15)))failures.push(`Invalid locomotion cycle: ${state}`)
    if((locomotionRoles as readonly string[]).includes(state)&&state!=='idle'){
      if(!['left_foot','right_foot'].every(side=>clip.contacts?.some(c=>c.effector===side&&c.end>c.start)))failures.push(`Missing gait phase evidence: ${state}`)
      const end=clip.rootCurve?.at(-1)?.position, direction=state==='backward'?[0,-1]:state==='strafe_left'?[1,0]:state==='strafe_right'?[-1,0]:[0,1]
      if(!end||Math.hypot(end[0],end[2])<.001||(end[0]*direction[0]+end[2]*direction[1])/Math.hypot(end[0],end[2])<.7)failures.push(`Wrong root direction: ${state}`)
    }
  }
  return failures
}

/** Phase zero is left-foot touchdown. Idle is independent of gait synchronization. */
export function gaitPhaseOffset(clip:Pick<ClipRevision,'state'|'duration'|'contacts'>):number {
  if(clip.state==='idle')return 0
  const touchdown=clip.contacts.filter(c=>c.effector==='left_foot'&&c.end>c.start).sort((a,b)=>a.start-b.start)[0]
  return touchdown?touchdown.start/clip.duration:0
}
