import { z } from 'zod'
import {
  nodeSchema as legacyNode,
  actorSchema,
  idSchema as id,
  vec,
} from '../v2/spec.ts'

export const VERSION = 'gameplay-3.0.0' as const
export const CATALOG = 'modules-3.0.0' as const
const base = { id, label: z.string().min(1).max(500), version: z.literal(1) }
export const actorDefinition = actorSchema
  .omit({ role: true, spawn: true })
  .extend({ kind: z.literal('actor_definition') })
export const actorInstance = z
  .object({
    ...base,
    kind: z.literal('actor_instance'),
    definition: id,
    position: vec,
    activation: id.nullable(),
  })
  .strict()
export const item = z
  .object({
    ...base,
    kind: z.literal('item'),
    stackLimit: z.number().int().min(1).max(50),
  })
  .strict()
export const pickup = z
  .object({
    ...base,
    kind: z.literal('pickup'),
    item: id,
    quantity: z.number().int().min(1).max(50),
    position: vec,
    prerequisites: z.array(id).max(20),
  })
  .strict()
export const dialogue = z
  .object({
    ...base,
    kind: z.literal('dialogue'),
    actor: id,
    text: z.string().min(1).max(2000),
    prerequisites: z.array(id).max(20),
  })
  .strict()
export const objective = z
  .object({
    ...base,
    kind: z.literal('objective'),
    op: z.enum(['talk', 'collect', 'reach', 'defeat', 'interact', 'deliver']),
    target: id,
    item: id.nullable(),
    quantity: z.number().int().min(1).max(50),
    prerequisites: z.array(id).max(20),
    required: z.boolean(),
    rewards: z
      .array(
        z
          .object({ item: id, quantity: z.number().int().min(1).max(50) })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict()
export const region = z
  .object({
    ...base,
    kind: z.literal('region'),
    position: vec,
    radius: z.number().min(0.5).max(10),
  })
  .strict()
export const lock = z
  .object({
    ...base,
    kind: z.literal('lock'),
    entity: id,
    item: id,
    consume: z.boolean(),
  })
  .strict()
export const effect = z
  .object({
    ...base,
    kind: z.literal('effect'),
    op: z.enum([
      'damage',
      'heal',
      'resource',
      'status',
      'impulse',
      'projectile',
    ]),
    target: z.enum(['self', 'hit']),
    amount: z.number().min(-100).max(100),
    duration: z.number().min(0).max(10),
    projectile: id.nullable(),
  })
  .strict()
export const abilityEffects = z
  .object({
    ...base,
    kind: z.literal('ability_effects'),
    ability: id,
    phase: z.enum(['release', 'hit']),
    effects: z.array(id).min(1).max(8),
  })
  .strict()
export const nodeSchema = z.union([
  actorDefinition,
  actorInstance,
  item,
  pickup,
  dialogue,
  objective,
  region,
  lock,
  effect,
  abilityEffects,
  ...legacyNode.options,
])
export type Node = z.infer<typeof nodeSchema>
export const designSchema = z
  .object({
    schemaVersion: z.literal(3),
    template: z.literal('unified.v1'),
    title: z.string().min(1).max(500),
    brief: z.string().min(1).max(2000),
    player: id,
    seed: z.number().int().min(0).max(2147483647),
    inventoryCapacity: z.number().int().min(1).max(50),
    nodes: z.array(nodeSchema).min(4).max(240),
    assets: z.array(z.never()).length(0),
  })
  .strict()
export type Design = z.infer<typeof designSchema>
export const manifestSchema = z
  .object({
    schemaVersion: z.literal(3),
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    draftId: z.string().uuid(),
    sourceRevision: z.number().int().nonnegative(),
    sourceHash: z.string().length(64),
    runtimeVersion: z.literal(VERSION),
    catalogVersion: z.literal(CATALOG),
    design: designSchema,
    nodeHashes: z.record(z.string(), z.string()),
    assets: z.array(z.never()).length(0),
  })
  .strict()
export type Manifest = z.infer<typeof manifestSchema>
export const recipeName = z.enum(['chair', 'horse', 'car', 'door'])
export const planSchema = z
  .object({
    version: z.literal(1),
    intent: z.enum(['new_game', 'add_content', 'refine', 'explain']),
    title: z.string().min(1).max(500),
    explanation: z.string().max(4000),
    preset: z.enum(['exploration', 'combat', 'courier', 'observatory']),
    unsupported: z.array(z.string().max(500)).max(20),
    visualRequirements: z.array(z.string().max(500)).max(20),
    recipes: z
      .array(
        z.object({ kind: recipeName, instanceId: id, position: vec }).strict(),
      )
      .max(20),
    edits: z.array(nodeSchema).max(40),
    removeNodeIds: z.array(id).max(40).default([]),
    sourceRevision: z.number().int().nonnegative(),
    catalogVersion: z.literal(CATALOG),
  })
  .strict()
export type GamePlan = z.infer<typeof planSchema>
export function of<K extends Node['kind']>(
  d: Design,
  kind: K,
): Extract<Node, { kind: K }>[] {
  return d.nodes.filter((n) => n.kind === kind) as Extract<Node, { kind: K }>[]
}
