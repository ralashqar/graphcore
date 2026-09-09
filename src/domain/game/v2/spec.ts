import { z } from 'zod'
import {
  interactionSchemas,
  interactionDependencies,
  type InteractionNode,
} from '../interactions/spec.ts'

export const TEMPLATE = 'combat_traversal.v1' as const
export const IMPLEMENTATION = 'gameplay-2.1.0' as const
export const idSchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/)
const label = z.string().trim().min(1).max(500)
export const vec = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
  })
  .strict()
export type Vec = z.infer<typeof vec>
const boundedVec = vec.refine(
  (v) => Object.values(v).every((n) => Math.abs(n) <= 80),
  'Coordinate exceeds arena bounds',
)
export const locomotionStates = [
  'ground',
  'air',
  'hang',
  'climb',
  'dead',
] as const
export const socketIds = [
  'hand.right.cast',
  'weapon.primary.muzzle',
  'weapon.primary.tip',
  'foot.left',
  'foot.right',
  'grip.left',
  'grip.right',
  'chest',
] as const
const base = { id: idSchema, label, version: z.literal(1) }
export const abilitySchema = z
  .object({
    ...base,
    kind: z.literal('ability'),
    op: z.enum(['strike', 'bolt', 'dodge', 'shield', 'roll']),
    pose: idSchema,
    projectile: idSchema.nullable(),
    cost: z.number().min(0).max(80),
    cooldown: z.number().min(0.1).max(30),
    windup: z.number().min(0.05).max(3),
    active: z.number().min(0.05).max(2),
    recovery: z.number().min(0.05).max(3),
    range: z.number().min(0.1).max(30),
    amount: z.number().min(1).max(100),
    distance: z.number().min(0).max(8),
    duration: z.number().min(0.1).max(10),
  })
  .strict()
export const actorSchema = z
  .object({
    ...base,
    kind: z.literal('actor'),
    role: z.enum(['mage', 'melee', 'enemy', 'target']),
    team: z.enum(['player', 'hostile', 'neutral']),
    health: z.number().min(1).max(500),
    stamina: z.number().min(1).max(200),
    height: z.number().min(1.2).max(2.4),
    radius: z.number().min(0.2).max(0.6),
    abilities: z.array(idSchema).max(4),
    movement: idSchema,
    rig: idSchema,
    behavior: idSchema.nullable(),
    canClimb: z.boolean(),
    spawn: boundedVec,
  })
  .strict()
export const movementSchema = z
  .object({
    ...base,
    kind: z.literal('movement'),
    speed: z.number().min(1).max(6),
    sprint: z.number().min(1).max(10),
    jump: z.number().min(3).max(8),
    gravity: z.number().min(5).max(25),
    staminaRecovery: z.number().min(1).max(30),
    sprintDrain: z.number().min(1).max(30),
    grabReach: z.number().min(0.2).max(1.2),
    climbSeconds: z.number().min(0.3).max(2),
    shimmySpeed: z.number().min(0.2).max(2),
    transitions: z
      .array(
        z
          .object({
            from: z.enum(locomotionStates),
            to: z.enum(locomotionStates),
            guard: z.enum([
              'jump',
              'unsupported',
              'landed',
              'grip',
              'climb',
              'drop',
              'finished',
              'death',
            ]),
          })
          .strict(),
      )
      .min(8)
      .max(12),
  })
  .strict()
export const projectileSchema = z
  .object({
    ...base,
    kind: z.literal('projectile'),
    socket: z.enum(socketIds),
    speed: z.number().min(1).max(80),
    gravity: z.number().min(-20).max(0),
    radius: z.number().min(0.03).max(0.5),
    lifetime: z.number().min(0.1).max(8),
    damage: z.number().min(1).max(100),
    slowFactor: z.number().min(0.2).max(1),
    slowSeconds: z.number().min(0).max(8),
  })
  .strict()
export const poseSchema = z
  .object({
    ...base,
    kind: z.literal('pose'),
    style: z.enum(['cast', 'strike', 'dodge', 'shield', 'grip']),
    anticipation: z.number().min(0).max(0.45),
    extension: z.number().min(0.1).max(1),
    lift: z.number().min(-0.3).max(0.4),
    socket: z.enum(socketIds),
  })
  .strict()
export const rigSchema = z
  .object({
    ...base,
    kind: z.literal('rig'),
    type: z.literal('canonical_humanoid'),
    sockets: z
      .array(
        z
          .object({
            id: z.enum(socketIds),
            joint: z.enum([
              'rightHand',
              'leftHand',
              'rightFoot',
              'leftFoot',
              'chest',
            ]),
            offset: vec,
            forward: vec,
          })
          .strict(),
      )
      .length(8),
  })
  .strict()
export const behaviorSchema = z
  .object({
    ...base,
    kind: z.literal('behavior'),
    mode: z.literal('patrol_chase_attack'),
    detectionRange: z.number().min(2).max(20),
    attackRange: z.number().min(0.5).max(8),
    patrolRadius: z.number().min(0).max(5),
    thinkTicks: z.number().int().min(6).max(60),
  })
  .strict()
const ledgeSchema = z
  .object({
    id: idSchema,
    start: boundedVec,
    end: boundedVec,
    normal: vec,
    landing: boundedVec,
    connects: z.array(idSchema).max(2),
  })
  .strict()
export const worldSchema = z
  .object({
    ...base,
    kind: z.literal('world'),
    width: z.number().min(16).max(60),
    depth: z.number().min(16).max(60),
    boxes: z
      .array(
        z
          .object({
            id: idSchema,
            position: boundedVec,
            size: vec,
            ramp: z.boolean(),
          })
          .strict(),
      )
      .max(80),
    ledges: z.array(ledgeSchema).max(20),
    objective: boundedVec,
  })
  .strict()
export const scenarioSchema = z
  .object({
    ...base,
    kind: z.literal('scenario'),
    objective: label,
    requireEnemyDefeat: z.boolean(),
    requireClimb: z.boolean(),
    seed: z.number().int().min(0).max(2147483647),
  })
  .strict()
export const nodeSchemas = {
  ...interactionSchemas,
  actor: actorSchema,
  ability: abilitySchema,
  movement: movementSchema,
  projectile: projectileSchema,
  pose: poseSchema,
  rig: rigSchema,
  behavior: behaviorSchema,
  world: worldSchema,
  scenario: scenarioSchema,
}
export const nodeSchema = z.discriminatedUnion('kind', [
  interactionSchemas.body,
  interactionSchemas.anchor_set,
  interactionSchemas.contact_pose,
  interactionSchemas.interaction,
  interactionSchemas.mechanism,
  interactionSchemas.locomotor,
  interactionSchemas.interactive_entity,
  actorSchema,
  abilitySchema,
  movementSchema,
  projectileSchema,
  poseSchema,
  rigSchema,
  behaviorSchema,
  worldSchema,
  scenarioSchema,
])
export const designSchema = z
  .object({
    schemaVersion: z.literal(2),
    template: z.literal(TEMPLATE),
    title: label,
    brief: label,
    defaultActor: z.enum(['mage', 'melee']),
    nodes: z.array(nodeSchema).min(12).max(120),
    assets: z.array(z.never()).length(0),
  })
  .strict()
export type Node = z.infer<typeof nodeSchema>
export type Design = z.infer<typeof designSchema>
export type Ability = z.infer<typeof abilitySchema>
export type Actor = z.infer<typeof actorSchema>
export type Movement = z.infer<typeof movementSchema>
export type World = z.infer<typeof worldSchema>
export const manifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    draftId: z.string().uuid(),
    sourceRevision: z.number().int().nonnegative(),
    sourceHash: z.string().length(64),
    runtimeVersion: z.enum(['gameplay-2.0.0', IMPLEMENTATION]),
    templateVersion: z.literal(TEMPLATE),
    physicsVersion: z.literal('0.17.3'),
    design: designSchema,
    nodeHashes: z.record(z.string(), z.string()),
    assets: z.array(z.never()).length(0),
  })
  .strict()
export type Manifest = z.infer<typeof manifestSchema>
export function nodesOf<K extends Node['kind']>(
  d: Design,
  kind: K,
): Extract<Node, { kind: K }>[] {
  return d.nodes.filter((n) => n.kind === kind) as Extract<Node, { kind: K }>[]
}
export function dependencies(n: Node): string[] {
  if (n.kind === 'actor')
    return [
      ...n.abilities,
      n.movement,
      n.rig,
      ...(n.behavior ? [n.behavior] : []),
    ]
  if (n.kind === 'ability')
    return [n.pose, ...(n.projectile ? [n.projectile] : [])]
  return interactionDependencies(n as InteractionNode)
}
