import { z } from 'zod'
const id = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/)
export const vector = z
  .object({
    x: z.number().finite().min(-80).max(80),
    y: z.number().finite().min(-80).max(80),
    z: z.number().finite().min(-80).max(80),
  })
  .strict()
const base = { id, label: z.string().min(1).max(500), version: z.literal(1) }
export const bodySchema = z
  .object({
    ...base,
    kind: z.literal('body'),
    family: z.enum(['humanoid', 'quadruped', 'rigid']),
    height: z.number().min(0.5).max(3),
    width: z.number().min(0.1).max(3),
    length: z.number().min(0.1).max(5),
    legLength: z.number().min(0.1).max(1.5),
  })
  .strict()
export const anchorsSchema = z
  .object({
    ...base,
    kind: z.literal('anchor_set'),
    anchors: z
      .array(
        z
          .object({
            id,
            position: vector,
            yaw: z.number().min(-6.3).max(6.3),
            role: z.enum(['approach', 'pelvis', 'contact', 'exit', 'hinge']),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
export const contactPoseSchema = z
  .object({
    ...base,
    kind: z.literal('contact_pose'),
    body: id,
    anchors: id,
    pelvis: id,
    contacts: z
      .array(
        z
          .object({
            joint: z.enum(['leftHand', 'rightHand', 'leftFoot', 'rightFoot']),
            anchor: id,
            tolerance: z.number().min(0.01).max(0.3),
          })
          .strict(),
      )
      .max(4),
  })
  .strict()
export const interactionSchema = z
  .object({
    ...base,
    kind: z.literal('interaction'),
    body: id,
    anchors: id,
    slot: id,
    mode: z.enum(['seat', 'ride', 'drive', 'door']),
    approach: id,
    exits: z.array(id).min(1).max(4),
    maxDistance: z.number().min(0.5).max(3),
    targetMotionTolerance: z.number().min(0.01).max(0.5),
    phases: z
      .array(
        z
          .object({
            id,
            seconds: z.number().min(0.15).max(3),
            pose: id.nullable(),
            op: z.enum(['align', 'contact', 'attach', 'actuate']),
          })
          .strict(),
      )
      .min(2)
      .max(6),
  })
  .strict()
export const mechanismSchema = z
  .object({
    ...base,
    kind: z.literal('mechanism'),
    type: z.literal('hinge'),
    size: vector,
    openAngle: z.number().min(0.3).max(2.6),
    seconds: z.number().min(0.3).max(3),
    locked: z.boolean(),
  })
  .strict()
export const locomotorSchema = z
  .object({
    ...base,
    kind: z.literal('locomotor'),
    type: z.enum(['quadruped', 'vehicle']),
    maxSpeed: z.number().min(0.5).max(8),
    acceleration: z.number().min(0.5).max(8),
    braking: z.number().min(1).max(12),
    turnRate: z.number().min(0.2).max(3),
  })
  .strict()
export const interactiveEntitySchema = z
  .object({
    ...base,
    kind: z.literal('interactive_entity'),
    body: id,
    anchors: id,
    interactions: z.array(id).min(1).max(4),
    motor: id.nullable(),
    mechanism: id.nullable(),
    position: vector,
    yaw: z.number().min(-6.3).max(6.3),
    enabled: z.boolean(),
  })
  .strict()
export const interactionSchemas = {
  body: bodySchema,
  anchor_set: anchorsSchema,
  contact_pose: contactPoseSchema,
  interaction: interactionSchema,
  mechanism: mechanismSchema,
  locomotor: locomotorSchema,
  interactive_entity: interactiveEntitySchema,
}
export const interactionNodeSchema = z.discriminatedUnion('kind', [
  bodySchema,
  anchorsSchema,
  contactPoseSchema,
  interactionSchema,
  mechanismSchema,
  locomotorSchema,
  interactiveEntitySchema,
])
export type InteractionNode = z.infer<typeof interactionNodeSchema>
export type Body = z.infer<typeof bodySchema>
export type Anchors = z.infer<typeof anchorsSchema>
export type ContactPose = z.infer<typeof contactPoseSchema>
export type Interaction = z.infer<typeof interactionSchema>
export type Entity = z.infer<typeof interactiveEntitySchema>
export type Locomotor = z.infer<typeof locomotorSchema>
export type Vec = z.infer<typeof vector>
export type Transform = { position: Vec; yaw: number }
export function interactionDependencies(n: InteractionNode): string[] {
  if (n.kind === 'contact_pose') return [n.body,n.anchors]
  if (n.kind === 'interaction')
    return [
      n.body,
      n.anchors,
      ...n.phases.flatMap((p) => (p.pose ? [p.pose] : [])),
    ]
  if (n.kind === 'interactive_entity')
    return [
      n.body,
      n.anchors,
      ...n.interactions,
      ...(n.motor ? [n.motor] : []),
      ...(n.mechanism ? [n.mechanism] : []),
    ]
  return []
}
