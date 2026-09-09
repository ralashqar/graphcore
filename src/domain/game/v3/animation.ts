import { z } from 'zod'

export const ANIMATION_VERSION = 'animation-1.1.0'
export const KIMODO_MODEL = 'Kimodo-SOMA-RP-v1.1'
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/)
const finite = z.number().finite()
const vec = z.tuple([finite, finite, finite])
const rotation = z.tuple([finite, finite, finite, finite]).refine(q => Math.abs(Math.hypot(...q) - 1) < 0.001, 'Quaternion must be normalized')
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const animationStates = ['idle', 'walk', 'run', 'backward', 'strafe_left', 'strafe_right', 'takeoff', 'airborne', 'landing', 'roll', 'catch', 'hang', 'shimmy_left', 'shimmy_right', 'climb'] as const
export const animationStateSchema = z.enum(animationStates)
export const animationStages = ['constraints', 'inference', 'retarget', 'process', 'export', 'validate', 'register'] as const
export const rigProfileSchema = z.object({
  version: z.literal(1), id, revision: hash, units: z.literal('meters'), up: z.literal('Y'), forward: z.literal('Z'),
  joints: z.array(z.object({ id, parent: id.nullable(), translation: vec, rotation, sourceJoint: id }).strict()).min(15).max(100),
  sockets: z.record(id, z.object({ joint: id, translation: vec }).strict()),
}).strict().superRefine((rig, ctx) => {
  const seen = new Set<string>()
  let roots = 0
  for (const joint of rig.joints) {
    if (seen.has(joint.id)) ctx.addIssue({ code: 'custom', message: `Duplicate joint ${joint.id}` })
    if (joint.parent === null) roots++
    else if (!seen.has(joint.parent)) ctx.addIssue({ code: 'custom', message: `Parent must precede joint ${joint.id}` })
    seen.add(joint.id)
  }
  if (roots !== 1) ctx.addIssue({ code: 'custom', message: 'Rig must have exactly one root' })
  for (const socket of Object.values(rig.sockets)) if (!seen.has(socket.joint)) ctx.addIssue({ code: 'custom', message: `Unknown socket joint ${socket.joint}` })
})
const contactSchema = z.object({ effector: z.enum(['left_hand', 'right_hand', 'left_foot', 'right_foot']), start: finite.nonnegative(), end: finite.nonnegative(), position: vec, rotation: rotation.optional() }).strict()
export const motionRecipeSchema = z.object({
  version: z.literal(1), id, state: animationStateSchema,
  rigRevision: hash, model: z.literal(KIMODO_MODEL), prompt: z.string().min(10).max(1500),
  duration: finite.min(0.5).max(8), candidates: z.number().int().min(1).max(3), seed: z.number().int().min(0).max(2147483647),
  loop: z.boolean(), targetSpeed: finite.min(0).max(12),
  rootMode: z.enum(['in_place', 'controller_curve', 'anchor_relative']),
  contacts: z.array(contactSchema).max(16),
  poses: z.array(z.object({ time: finite.nonnegative(), joints: z.record(id, vec) }).strict()).max(16),
  path: z.array(z.object({ time: finite.nonnegative(), x: finite, z: finite }).strict()).max(241),
  thresholds: z.object({ version: z.literal(1), maxContactError: finite.positive().max(0.05), maxBoneLengthError: finite.positive().max(0.01), maxSeamAngle: finite.positive().max(0.15), maxSeamVelocity: finite.positive().max(0.3), maxCorrection: finite.positive().max(0.15) }).strict(),
}).strict().superRefine((recipe, ctx) => {
  for (const c of recipe.contacts) if (c.start > c.end || c.end > recipe.duration) ctx.addIssue({ code: 'custom', message: 'Contact lies outside motion duration' })
  for (const p of [...recipe.poses, ...recipe.path]) if (p.time > recipe.duration) ctx.addIssue({ code: 'custom', message: 'Constraint lies outside motion duration' })
  if (recipe.path.some((p, i) => i > 0 && p.time <= recipe.path[i - 1].time)) ctx.addIssue({ code: 'custom', message: 'Path times must strictly increase' })
  if (recipe.poses.some((p, i) => i > 0 && p.time <= recipe.poses[i - 1].time)) ctx.addIssue({ code: 'custom', message: 'Pose times must strictly increase' })
  for (let i = 0; i < recipe.contacts.length; i++) for (let j = i + 1; j < recipe.contacts.length; j++) {
    const a = recipe.contacts[i], b = recipe.contacts[j]
    if (a.effector === b.effector && a.start <= b.end && b.start <= a.end) ctx.addIssue({ code: 'custom', message: 'Effector contact intervals overlap' })
  }
})
export type MotionRecipe = z.infer<typeof motionRecipeSchema>
export const clipRevisionSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), recipeHash: hash, rigRevision: hash, sourceHash: hash, glbHash: hash,
  storagePath: z.string().min(1).max(500).refine(p => !p.includes('..') && !p.includes('://') && !p.startsWith('/')),
  state: animationStateSchema, duration: finite.positive().max(8), fps: z.literal(30), loop: z.boolean(), naturalSpeed: finite.nonnegative(),
  rootMode: z.enum(['in_place', 'controller_curve', 'anchor_relative']),
  rootCurve: z.array(z.object({ time: finite.nonnegative(), position: vec }).strict()).min(2).max(241),
  contacts: z.array(contactSchema).max(32),
  validation: z.object({ policy: z.enum(['animation-1.0.0', ANIMATION_VERSION]), accepted: z.literal(true), metrics: z.record(z.string(), finite.nonnegative()) }).strict(),
}).strict().superRefine((clip, ctx) => {
  if (clip.rootCurve.some((p, i) => p.time > clip.duration || (i > 0 && p.time <= clip.rootCurve[i - 1].time))) ctx.addIssue({ code: 'custom', message: 'Invalid root curve times' })
  if (clip.contacts.some(c => c.start > c.end || c.end > clip.duration)) ctx.addIssue({ code: 'custom', message: 'Invalid clip contact times' })
})
export const animationGraphSchema = z.object({
  version: z.literal(1), id, actorDefinition: id, rigRevision: hash,
  bindings: z.array(z.object({ state: animationStateSchema, clipRevision: z.string().uuid() }).strict()).max(animationStates.length),
  transitions: z.array(z.object({ from: animationStateSchema, to: animationStateSchema, blendSeconds: finite.min(0).max(0.3), event: z.enum(['movement', 'jump', 'airborne', 'grounded', 'roll', 'finished', 'ledge_caught', 'shimmy', 'climb', 'drop']) }).strict()).max(60),
}).strict().superRefine((graph, ctx) => {
  const states = new Set(graph.bindings.map(b => b.state))
  if (states.size !== graph.bindings.length) ctx.addIssue({ code: 'custom', message: 'Duplicate animation state binding' })
  for (const t of graph.transitions) if (!states.has(t.from) || !states.has(t.to)) ctx.addIssue({ code: 'custom', message: 'Transition references an unbound state' })
})
export type AnimationGraph = z.infer<typeof animationGraphSchema>
export type ClipRevision = z.infer<typeof clipRevisionSchema>
export function validateAnimationBindings(graph: AnimationGraph, clips: ClipRevision[]): string[] {
  return graph.bindings.flatMap(binding => {
    const clip = clips.find(c => c.id === binding.clipRevision)
    return !clip ? [`Missing clip ${binding.clipRevision}`] : clip.rigRevision !== graph.rigRevision || clip.state !== binding.state ? [`Incompatible clip for ${binding.state}`] : []
  })
}
export const setupBudgetPolicy = Object.freeze({ totalCents: 3000, admissionCents: 2500, phases: { benchmark: 1000, integration: 1000, ledge: 500 } })
export type BudgetPhase = keyof typeof setupBudgetPolicy.phases
export function canReserveSetupBudget(committed: Record<BudgetPhase, number>, phase: BudgetPhase, cents: number): boolean {
  return Number.isSafeInteger(cents) && cents > 0 && Object.values(committed).every(n => Number.isSafeInteger(n) && n >= 0) &&
    committed[phase] + cents <= setupBudgetPolicy.phases[phase] && Object.values(committed).reduce((a, b) => a + b, 0) + cents <= setupBudgetPolicy.admissionCents
}
