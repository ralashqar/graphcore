import { hashGameValue } from '../compiler.ts'
import { motionRecipeSchema, type ClipRevision } from './animation.ts'
import { animationRecipeProfile } from './animationProfiles.ts'
import { evaluateSequence, type PoseSequence } from './poseSequence.ts'
import { forwardPose, type Rig } from './somaPose.ts'
import { validateKimodoConstraints } from './animationTransport.ts'
const effectors = {
  LeftHand: 'left_hand',
  RightHand: 'right_hand',
  LeftFoot: 'left_foot',
  RightFoot: 'right_foot',
} as const
export const motionContractHash = (s: PoseSequence, rigRevision: string) =>
  hashGameValue({ version: 'performance-1.0.0', sequence: s, rigRevision })
/** Compiles approved milestones into the existing typed GPU request; never submits it. */
export async function replacementRecipe(s: PoseSequence, rig: Rig) {
  if (s.role === 'custom')
    throw new Error(
      'Custom motion has no published clip slot; preview its approximation first',
    )
  const base = animationRecipeProfile(s.role, rig.revision)
  const times = [
    ...new Set([
      ...s.keys.map((k) => k.time),
      ...s.contacts.flatMap((c) => [c.start, c.end]),
    ]),
  ].sort((a, b) => a - b)
  const poses = times.map((t) => {
    const fk = forwardPose(rig, evaluateSequence(rig, s, t * s.duration))
    const joints = Object.fromEntries(
      ['Hips', 'LeftLeg', 'RightLeg', ...Object.keys(effectors)].map((name) => {
        const p = fk.positions[name]
        return [name, [p.x, p.y, p.z]]
      }),
    )
    for (const c of s.contacts)
      if (t === c.start || t === c.end) joints[c.effector] = c.position
    return { time: t * s.duration, joints }
  })
  const recipe = motionRecipeSchema.parse({
    ...base,
    id: `approximation.${s.id}`,
    motionContract: await motionContractHash(s, rig.revision),
    duration: s.duration,
    loop: s.loop,
    rootMode: 'in_place',
    prompt: `${base.prompt} Match these timed milestones: ${s.keys.map((k) => `${(k.time * s.duration).toFixed(2)} seconds: ${k.label}`).join('; ')}. Movement displacement is controlled by gameplay.`,
    poses,
    contacts: s.contacts.map((c) => ({
      effector: effectors[c.effector],
      start: c.start * s.duration,
      end: c.end * s.duration,
      position: c.position,
    })),
  })
  validateKimodoConstraints(recipe)
  return recipe
}
export function compatibleReplacement(
  clip: ClipRevision,
  contract: string,
  duration: number,
) {
  return (
    clip.motionContract === contract &&
    Math.abs(clip.duration - duration) <= 1 / 30 + 0.001 &&
    clip.rootMode === 'in_place' &&
    clip.validation.metrics.maxMilestoneError !== undefined &&
    clip.validation.metrics.maxMilestoneError <= 0.12
  )
}
