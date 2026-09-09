import { MOTION_PROFILE } from './motionPresentation.ts'
import { type ActionPackage, actionRecipe } from './actionMechanics.ts'
import { z } from 'zod'
import { performanceSchema, type Performance } from './performance.ts'
import {
  type MechanicBundle,
  mechanicBundleSchema,
  type MechanicPackage,
  mechanicRecipe,
  type SurfaceProfile,
  surfaceProfileSchema,
} from './mechanics.ts'
const common = {
  projectId: z.string().uuid(),
  draftId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
}
export const mechanicCommandSchema = z.discriminatedUnion('action', [
  z.object({
    ...common,
    action: z.literal('plan_mechanic'),
    prompt: z.string().min(1).max(8000),
    actorDefinition: z.string().min(1).max(64),
    surfaces: z.array(surfaceProfileSchema).max(80),
  }).strict(),
  z.object({
    ...common,
    action: z.literal('materialize_mechanic'),
    planJobId: z.string().uuid(),
  }).strict(),
])
export const mechanicProposalSchema = z.object({
  version: z.literal(1),
  sourceRevision: z.number().int().nonnegative(),
  explanation: z.string().max(4000),
  unsupported: z.array(z.string().max(500)).max(20),
  bundle: mechanicBundleSchema,
}).strict()
export type MechanicProposal = z.infer<typeof mechanicProposalSchema>

export function mergeScopedMechanics(
  current: MechanicBundle | undefined,
  actor: string,
  packages: MechanicPackage[],
  surfaces: SurfaceProfile[],
  actions: ActionPackage[] = [],
  performance?: Performance,
) {
  if(performance?.abilities.some(a=>a.actorDefinition!==actor))throw new Error('Planner changed performance actor scope')
  const old=current?.performance
  const mergedPerformance=performance?performanceSchema.parse({version:1,
    sequences:[...(old?.sequences.filter(s=>!performance.sequences.some(n=>n.id===s.id))??[]),...performance.sequences],
    abilities:[...(old?.abilities.filter(s=>!performance.abilities.some(n=>n.id===s.id))??[]),...performance.abilities],
    reactions:[...(old?.reactions.filter(s=>!performance.reactions.some(n=>n.id===s.id))??[]),...performance.reactions],
  }):old
  for (const p of actions) {
    if (
      p.actorDefinition !== actor ||
      p.id !== actionRecipe(p.capability, actor).id
    ) throw new Error('Planner changed action identity or actor scope')
  }
  for (const p of packages) {
    if (
      p.actorDefinition !== actor ||
      p.id !== mechanicRecipe(p.capability, actor).id
    ) throw new Error('Planner changed mechanic identity or actor scope')
    const previous = current?.packages.find((old) => old.id === p.id)
    if (previous && previous.actorDefinition !== actor) {
      throw new Error('Mechanic belongs to another actor')
    }
  }
  const mergedSurfaces = surfaces.map((s) => {
    const old = current?.surfaces.find((p) => p.id === s.id)
    if (old && (old.collider !== s.collider || old.face !== s.face)) {
      throw new Error('Existing surface identity cannot be redirected')
    }
    return {
      ...s,
      capabilities: [
        ...new Set([...(old?.capabilities ?? []), ...s.capabilities]),
      ],
    }
  })
  return mechanicBundleSchema.parse({
    version: 1,
    ...(mergedPerformance?{performance:mergedPerformance}:{}),
    motionProfile:current?.motionProfile??MOTION_PROFILE,
    ...(actions.length || current?.actions
      ? {
        actions: [
          ...(current?.actions?.filter((p) =>
            !actions.some((n) => n.id === p.id)
          ) ?? []),
          ...actions,
        ],
      }
      : {}),
    packages: [
      ...(current?.packages.filter((p) =>
        !packages.some((n) => n.id === p.id)
      ) ?? []),
      ...packages,
    ],
    surfaces: [
      ...(current?.surfaces.filter((s) =>
        !surfaces.some((n) => n.id === s.id)
      ) ?? []),
      ...mergedSurfaces,
    ],
  })
}
