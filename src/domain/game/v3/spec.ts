import { PERFORMANCE_RUNTIME } from './poseSequence.ts'
import { MOTION_RUNTIME } from './motionPresentation.ts'
import { ACTION_RUNTIME } from './actionMechanics.ts'
import { z } from 'zod'
import { mechanicBundleSchema, MECHANIC_RUNTIME } from './mechanics.ts'
import { clipRevisionSchema, animationGraphSchema, rigProfileSchema, validateAnimationBindings } from './animation.ts'
import {
  nodeSchema as legacyNode,
  actorSchema,
  idSchema as id,
  vec,
} from '../v2/spec.ts'

export const VERSION = 'gameplay-3.0.0' as const
export const ANIMATED_VERSION = 'gameplay-3.1.0' as const
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
    mechanics: mechanicBundleSchema.optional(),
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
    runtimeVersion: z.enum([VERSION, ANIMATED_VERSION, MECHANIC_RUNTIME, ACTION_RUNTIME, MOTION_RUNTIME, PERFORMANCE_RUNTIME]),
    catalogVersion: z.literal(CATALOG),
    design: designSchema,
    nodeHashes: z.record(z.string(), z.string()),
    assets: z.array(clipRevisionSchema.safeExtend({ recipeKey: z.string() })).max(100),
    animations: z.object({ version: z.literal(1), rigs: z.array(rigProfileSchema).max(10), graphs: z.array(animationGraphSchema).max(40) }).strict().optional(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    if(manifest.design.mechanics&&manifest.runtimeVersion!==MECHANIC_RUNTIME&&manifest.runtimeVersion!==ACTION_RUNTIME&&manifest.runtimeVersion!==MOTION_RUNTIME&&manifest.runtimeVersion!==PERFORMANCE_RUNTIME)issue('Mechanics require runtime gameplay-3.2.0 or newer')
    if(manifest.design.mechanics?.actions?.length&&manifest.runtimeVersion!==ACTION_RUNTIME&&manifest.runtimeVersion!==MOTION_RUNTIME&&manifest.runtimeVersion!==PERFORMANCE_RUNTIME)issue('Action mechanics require runtime gameplay-3.3.0')
    if(manifest.design.mechanics?.motionProfile && manifest.runtimeVersion!==MOTION_RUNTIME&&manifest.runtimeVersion!==PERFORMANCE_RUNTIME)issue('Motion profile requires runtime gameplay-3.4.0 or newer')
    if(manifest.design.mechanics?.performance&&manifest.runtimeVersion!==PERFORMANCE_RUNTIME)issue('Pose programs require runtime gameplay-3.5.0')
    if (manifest.runtimeVersion === VERSION && (manifest.animations || manifest.assets.length)) issue('Animations require runtime gameplay-3.1.0')
    if (!manifest.animations) {
      if (manifest.assets.length) issue('Animation assets require graph metadata')
      return
    }
    for(const graph of manifest.animations.graphs)for(const binding of graph.bindings){
      const clip=manifest.assets.find(c=>c.id===binding.clipRevision)
      if(!clip?.motionContract)continue
      const sequence=manifest.design.mechanics?.performance?.sequences.find(s=>s.role===binding.state)
      if(!sequence||clip.motionContract!==manifest.nodeHashes[`motion.${sequence.id}`]||Math.abs(clip.duration-sequence.duration)>1/30+.001||clip.validation.metrics.maxMilestoneError===undefined||clip.validation.metrics.maxMilestoneError>.12)issue('Animation replacement does not match approved pose program')
    }
    const rigs = new Set(manifest.animations.rigs.map(rig => rig.revision))
    const actors = new Set(manifest.design.nodes.filter(node => node.kind === 'actor_definition').map(node => node.id))
    if (rigs.size !== manifest.animations.rigs.length) issue('Duplicate rig revision')
    if (new Set(manifest.assets.map(clip => clip.id)).size !== manifest.assets.length || new Set(manifest.assets.map(clip => clip.recipeKey)).size !== manifest.assets.length) issue('Duplicate animation asset')
    if (new Set(manifest.animations.graphs.map(graph => graph.actorDefinition)).size !== manifest.animations.graphs.length) issue('Duplicate actor animation graph')
    for (const graph of manifest.animations.graphs) {
      if(manifest.design.mechanics?.performance&&!['humanoid.soma.v2','humanoid.fabric-ybot.v1'].includes(manifest.animations.rigs.find(r=>r.revision===graph.rigRevision)?.id??''))issue('Pose programs require the SOMA mannequin rig')
      if (!actors.has(graph.actorDefinition)) issue('Animation graph references a missing actor definition')
      if (!rigs.has(graph.rigRevision)) issue('Animation graph references a missing rig')
      validateAnimationBindings(graph, manifest.assets).forEach(issue)
    }
    for (const clip of manifest.assets) if (!rigs.has(clip.rigRevision)) issue('Animation clip references a missing rig')
  })
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
