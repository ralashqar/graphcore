import type { Design } from './spec.ts'
import type { MotionRecipe, ClipRevision } from './animation.ts'
export const ANIMATION_CATALOG = 'humanoid-motion-1.0.0'
export const locomotionStates = ['idle','walk','run','backward','strafe_left','strafe_right'] as const
export function actorAnimationRequirements(design: Design, actorId: string): MotionRecipe['state'][] {
  const actor = design.nodes.find(n=>n.kind==='actor_definition'&&n.id===actorId)
  if (!actor || actor.kind!=='actor_definition') return []
  const movement = design.nodes.find(n=>n.kind==='movement'&&n.id===actor.movement)
  const states: MotionRecipe['state'][] = [...locomotionStates]
  if(movement?.kind==='movement'&&movement.jump>0) states.push('takeoff','airborne','landing')
  if(design.nodes.some(n=>n.kind==='ability'&&n.op==='roll'&&actor.abilities.includes(n.id)))states.push('roll')
  if(actor.canClimb)states.push('catch','hang','shimmy_left','shimmy_right','climb')
  return states
}
export function proposeAnimations(design: Design, rigRevision: string, accepted: ClipRevision[]) {
  return design.nodes.filter(n=>n.kind==='actor_definition').map(actor=>({ actorDefinition: actor.id, catalogVersion: ANIMATION_CATALOG,
    requirements: actorAnimationRequirements(design,actor.id).map(state=>({ state, recipeProfile:`humanoid.${state}.v1`,
      clipRevision: accepted.find(c=>c.state===state&&c.rigRevision===rigRevision)?.id??null,
      support: (locomotionStates as readonly string[]).includes(state)?'validated_locomotion':'awaiting_motion_acceptance',
    })) }))
}
