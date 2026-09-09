import { performanceSchema } from './performance.ts'
import { actionPackageSchema } from './actionMechanics.ts'
import { MOTION_PROFILE } from './motionPresentation.ts'
import { z } from 'zod'
import { vec } from '../v2/spec.ts'

export const MECHANIC_CATALOG = 'mechanics-1.0.0'
export const MECHANIC_RUNTIME = 'gameplay-3.2.0'
const id = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/)
export const primitiveSchema = z.discriminatedUnion('op', [
  z.object({
    id,
    op: z.literal('query_surface'),
    reach: z.number().min(.05).max(1),
  }).strict(),
  z.object({
    id,
    op: z.literal('require_air'),
    minimumSpeed: z.number().min(0).max(6),
    activation: z.enum(['hold', 'jump']),
  }).strict(),
  z.object({
    id,
    op: z.literal('tangent_motion'),
    speed: z.number().min(0).max(8),
  }).strict(),
  z.object({
    id,
    op: z.literal('gravity_scale'),
    factor: z.number().min(0).max(1),
    maximumDescent: z.number().min(.1).max(12),
  }).strict(),
  z.object({
    id,
    op: z.literal('maintain_clearance'),
    distance: z.number().min(.01).max(.15),
  }).strict(),
  z.object({
    id,
    op: z.literal('consume_stamina'),
    perSecond: z.number().min(0).max(40),
  }).strict(),
  z.object({
    id,
    op: z.literal('exit_impulse'),
    outward: z.number().min(0).max(8),
    upward: z.number().min(0).max(8),
  }).strict(),
  z.object({
    id,
    op: z.literal('contact_pose'),
    hands: z.boolean(),
    maximumCorrection: z.number().min(.01).max(.15),
  }).strict(),
])
export const mechanicPackageSchema = z.object({
  version: z.literal(1),
  catalog: z.literal(MECHANIC_CATALOG),
  id,
  actorDefinition: id,
  label: z.string().min(1).max(200),
  capability: z.enum(['wall_run', 'wall_slide', 'wall_jump']),
  duration: z.number().min(.1).max(3),
  cooldown: z.number().min(.25).max(3),
  primitives: z.array(primitiveSchema).length(8),
}).strict().superRefine((p, c) => {
  if (
    new Set(p.primitives.map((n) => n.id)).size !== p.primitives.length ||
    new Set(p.primitives.map((n) => n.op)).size !== 8
  ) {
    c.addIssue({
      code: 'custom',
      message:
        'Each required primitive must occur exactly once with a unique ID',
    })
  }
})
export const surfaceProfileSchema = z.object({
  id,
  collider: id,
  face: z.enum(['x+', 'x-', 'z+', 'z-']),
  capabilities: z.array(z.enum(['wall_run', 'wall_slide', 'wall_jump'])).min(1)
    .max(3),
}).strict()
export const mechanicBundleSchema = z.object({
  performance: performanceSchema.optional(),
  motionProfile: z.literal(MOTION_PROFILE).optional(),
  version: z.literal(1),
  packages: z.array(mechanicPackageSchema).max(12),
  actions: z.array(actionPackageSchema).max(2).optional(),
  surfaces: z.array(surfaceProfileSchema).max(80),
}).strict().superRefine((b, c) => {
  for (const values of [b.packages, b.surfaces]) {
    if (new Set(values.map((v) => v.id)).size !== values.length) {
      c.addIssue({
        code: 'custom',
        message: 'Duplicate mechanic or surface ID',
      })
    }
  }
  if (
    new Set(b.actions?.map((a) => a.capability)).size !==
      (b.actions?.length ?? 0)
  ) c.addIssue({ code: 'custom', message: 'Duplicate action capability' })
  if (new Set(b.actions?.map((a) => a.id)).size !== (b.actions?.length ?? 0)) {
    c.addIssue({ code: 'custom', message: 'Duplicate action ID' })
  }
  const keys = b.packages.map((p) => `${p.actorDefinition}:${p.capability}`)
  if (new Set(keys).size !== keys.length) {
    c.addIssue({ code: 'custom', message: 'Duplicate capability for actor' })
  }
})
export type MechanicPackage = z.infer<typeof mechanicPackageSchema>
export type MechanicBundle = z.infer<typeof mechanicBundleSchema>
export type SurfaceProfile = z.infer<typeof surfaceProfileSchema>
export type SurfaceContact = {
  surface: string
  collider: string
  point: z.infer<typeof vec>
  normal: z.infer<typeof vec>
  tangent: z.infer<typeof vec>
  distance: number
}
export const mechanicStateSchema = z.object({
  phase: z.enum(['inactive', 'attached', 'departing']),
  version: z.literal(1),
  packageId: id.nullable(),
  surface: id.nullable(),
  elapsed: z.number().finite().nonnegative(),
  cooldown: z.number().finite().nonnegative(),
  jumps: z.number().int().min(0).max(1),
  direction: z.number().min(-1).max(1),
  velocity: vec,
  previousPosition: vec,
  contacts: z.record(
    z.string(),
    z.object({ cycle: z.number().int(), point: vec }).strict(),
  ).default({}),
}).strict()
export type MechanicState = z.infer<typeof mechanicStateSchema>
export const emptyMechanicState = (
  position: z.infer<typeof vec>,
): MechanicState => ({
  phase: 'inactive',
  version: 1,
  packageId: null,
  surface: null,
  elapsed: 0,
  cooldown: 0,
  jumps: 0,
  direction: 1,
  velocity: { x: 0, y: 0, z: 0 },
  previousPosition: { ...position },
  contacts: {},
})
export function mechanicRecipe(
  capability: MechanicPackage['capability'],
  actorDefinition: string,
): MechanicPackage {
  return mechanicPackageSchema.parse({
    version: 1,
    catalog: MECHANIC_CATALOG,
    id: `mechanic.${actorDefinition}.${capability}`,
    actorDefinition,
    label: capability.replaceAll('_', ' '),
    capability,
    duration: 1.5,
    cooldown: .25,
    primitives: [
      { id: 'sense', op: 'query_surface', reach: .3 },
      {
        id: 'eligibility',
        op: 'require_air',
        minimumSpeed: capability === 'wall_run' ? 2 : 0,
        activation: capability === 'wall_jump' ? 'jump' : 'hold',
      },
      {
        id: 'travel',
        op: 'tangent_motion',
        speed: capability === 'wall_run' ? 5 : 0,
      },
      {
        id: 'gravity',
        op: 'gravity_scale',
        factor: capability === 'wall_run' ? .25 : 1,
        maximumDescent: capability === 'wall_slide' ? 2 : 8,
      },
      { id: 'clearance', op: 'maintain_clearance', distance: .03 },
      { id: 'resource', op: 'consume_stamina', perSecond: 10 },
      { id: 'departure', op: 'exit_impulse', outward: 3.5, upward: 5 },
      {
        id: 'presentation',
        op: 'contact_pose',
        hands: false,
        maximumCorrection: .1,
      },
    ],
  })
}
export function primitive<
  K extends MechanicPackage['primitives'][number]['op'],
>(p: MechanicPackage, op: K) {
  return p.primitives.find((n) => n.op === op) as Extract<
    MechanicPackage['primitives'][number],
    { op: K }
  >
}
