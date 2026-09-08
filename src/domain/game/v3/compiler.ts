import {
  designSchema,
  of,
  VERSION,
  CATALOG,
  manifestSchema,
  type Design,
  type Node,
} from './spec.ts'
import {
  nodeSchema as legacySchema,
  dependencies as legacyDependencies,
  type Design as LegacyDesign,
  type Node as LegacyNode,
} from '../v2/spec.ts'
import { validateComponents } from '../v2/compiler.ts'
import { hashGameValue } from '../compiler.ts'

export function dependencies(n: Node): string[] {
  switch (n.kind) {
    case 'actor_definition':
      return [
        ...n.abilities,
        n.movement,
        n.rig,
        ...(n.behavior ? [n.behavior] : []),
      ]
    case 'actor_instance':
      return [n.definition, ...(n.activation ? [n.activation] : [])]
    case 'pickup':
      return [n.item, ...n.prerequisites]
    case 'dialogue':
      return [n.actor, ...n.prerequisites]
    case 'objective':
      return [
        n.target,
        ...n.prerequisites,
        ...(n.item ? [n.item] : []),
        ...n.rewards.map((r) => r.item),
      ]
    case 'lock':
      return [n.entity, n.item]
    case 'ability_effects':
      return [n.ability, ...n.effects]
    case 'effect':
      return n.projectile ? [n.projectile] : []
    case 'item':
    case 'region':
      return []
    default:
      return legacyDependencies(n)
  }
}
export function runtimeDesign(d: Design): LegacyDesign {
  // Runtime mechanism locks and controllers must never mutate the frozen design.
  d = structuredClone(d)
  const nodes = d.nodes.filter(
    (n) => legacySchema.safeParse(n).success,
  ) as LegacyNode[]
  const actors = of(d, 'actor_instance').map((instance) => {
    const def = of(d, 'actor_definition').find(
      (n) => n.id === instance.definition,
    )!
    if (!def) throw new Error(`Missing actor definition ${instance.definition}`)
    return {
      ...def,
      id: instance.id,
      label: instance.label,
      kind: 'actor' as const,
      role:
        instance.id === d.player
          ? ('mage' as const)
          : def.team === 'hostile'
            ? ('enemy' as const)
            : ('target' as const),
      spawn: instance.position,
    }
  })
  return {
    schemaVersion: 2,
    template: 'combat_traversal.v1',
    title: d.title,
    brief: d.brief,
    defaultActor: 'mage',
    assets: [],
    nodes: [
      ...nodes,
      ...actors,
      {
        id: 'runtime.scenario',
        kind: 'scenario',
        version: 1,
        label: d.title,
        objective: d.brief,
        requireClimb: false,
        requireEnemyDefeat: false,
        seed: d.seed,
      },
    ],
  }
}
export function validate(input: unknown) {
  const parsed = designSchema.safeParse(input)
  if (!parsed.success)
    return parsed.error.issues.map((i) => ({
      nodeKey: String(i.path.join('.')),
      message: i.message,
    }))
  const d = parsed.data,
    errors: { nodeKey: string; message: string }[] = [],
    byId = new Map(d.nodes.map((n) => [n.id, n]))
  const fail = (id: string, message: string) =>
    errors.push({ nodeKey: id, message })
  const expect = (n: Node, id: string, kinds: Node['kind'][]) => {
    if (!kinds.includes(byId.get(id)?.kind as Node['kind']))
      fail(n.id, `Expected ${kinds.join('/')} at ${id}`)
  }
  if (byId.size !== d.nodes.length) fail('design', 'Duplicate node IDs')
  if (d.nodes.some((n) => n.id.startsWith('runtime.')))
    fail('design', 'Reserved runtime namespace')
  if (of(d, 'world').length !== 1)
    fail('world', 'Exactly one connected level is required')
  if (!of(d, 'actor_instance').some((n) => n.id === d.player))
    fail('player', 'Player must reference an actor instance')
  if (!of(d, 'objective').some((n) => n.required))
    fail('objectives', 'At least one required objective is needed')
  for (const n of d.nodes) {
    if ('position' in n) {
      const w = of(d, 'world')[0]
      if (
        w &&
        (Math.abs(n.position.x) > w.width / 2 ||
          Math.abs(n.position.z) > w.depth / 2 ||
          n.position.y !== 0)
      )
        fail(n.id, 'Instances require supported ground inside level bounds')
    }
    if (n.kind === 'actor' || n.kind === 'scenario')
      fail(n.id, 'Use actor definitions/instances and objectives')
    for (const ref of dependencies(n))
      if (!byId.has(ref)) fail(n.id, `Missing dependency ${ref}`)
    if (n.kind === 'actor_instance') {
      expect(n, n.definition, ['actor_definition'])
      if (n.activation) expect(n, n.activation, ['objective'])
      if (n.id === d.player && n.activation)
        fail(n.id, 'Player cannot have delayed activation')
    }
    if (n.kind === 'actor_definition') {
      expect(n, n.movement, ['movement'])
      expect(n, n.rig, ['rig'])
      for (const a of n.abilities) expect(n, a, ['ability'])
      if (n.behavior) expect(n, n.behavior, ['behavior'])
    }
    if ('prerequisites' in n)
      for (const p of n.prerequisites) expect(n, p, ['objective'])
    if (n.kind === 'pickup') expect(n, n.item, ['item'])
    if (n.kind === 'dialogue') expect(n, n.actor, ['actor_instance'])
    if (n.kind === 'lock') {
      expect(n, n.entity, ['interactive_entity'])
      expect(n, n.item, ['item'])
      const e = byId.get(n.entity)
      if (e?.kind === 'interactive_entity' && !e.mechanism)
        fail(n.id, 'Lock requires a mechanism')
    }
    if (n.kind === 'objective') {
      n.rewards.forEach((r) => expect(n, r.item, ['item']))
      expect(
        n,
        n.target,
        n.op === 'talk'
          ? ['dialogue']
          : n.op === 'collect'
            ? ['pickup']
            : n.op === 'reach'
              ? ['region']
              : n.op === 'defeat'
                ? ['actor_instance']
                : n.op === 'interact'
                  ? ['interactive_entity']
                  : ['actor_instance'],
      )
      if (n.op === 'deliver' && !n.item) fail(n.id, 'Delivery requires an item')
      if (n.item) expect(n, n.item, ['item'])
    }
    if (n.kind === 'ability_effects') {
      expect(n, n.ability, ['ability'])
      n.effects.forEach((e) => expect(n, e, ['effect']))
      if (
        n.phase === 'hit' &&
        n.effects.some((id) => {
          const e = byId.get(id)
          return e?.kind === 'effect' && e.op === 'projectile'
        })
      )
        fail(n.id, 'Projectile effects may only run on release')
    }
    if (n.kind === 'effect') {
      if (n.op === 'projectile' && !n.projectile)
        fail(n.id, 'Projectile effect requires definition')
      if (n.projectile) expect(n, n.projectile, ['projectile'])
      if (n.op === 'status' && (n.amount < 0.2 || n.amount > 1))
        fail(n.id, 'Slow multiplier must be 0.2–1')
    }
  }
  const visiting = new Set<string>(),
    done = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) {
      fail(id, 'Cyclic objective/activation dependency')
      return
    }
    if (done.has(id)) return
    visiting.add(id)
    const n = byId.get(id)
    if (n) for (const ref of dependencies(n)) visit(ref)
    visiting.delete(id)
    done.add(id)
  }
  d.nodes.forEach((n) => visit(n.id))
  if (!errors.length) errors.push(...validateComponents(runtimeDesign(d), true))
  return errors
}
export async function compile(
  d: Design,
  identity: {
    id: string
    projectId: string
    draftId: string
    sourceRevision: number
  },
) {
  const errors = validate(d)
  if (errors.length)
    throw new Error(errors.map((e) => `${e.nodeKey}: ${e.message}`).join('\n'))
  const nodeHashes: Record<string, string> = {}
  for (const n of d.nodes)
    nodeHashes[n.id] = await hashGameValue({
      runtime: VERSION,
      catalog: CATALOG,
      node: n,
      dependencies: dependencies(n).map((id) =>
        d.nodes.find((x) => x.id === id),
      ),
    })
  return manifestSchema.parse({
    ...identity,
    schemaVersion: 3,
    runtimeVersion: VERSION,
    catalogVersion: CATALOG,
    sourceHash: await hashGameValue({ d, VERSION, CATALOG }),
    nodeHashes,
    design: d,
    assets: [],
  })
}
