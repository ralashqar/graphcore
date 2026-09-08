import { interactionTemplate } from '../interactions/template.ts'
import {
  interactionDependencies,
  type InteractionNode,
} from '../interactions/spec.ts'
import { type Node, type Design, type GamePlan, designSchema } from './spec.ts'
import { createCombatTemplate } from '../v2/template.ts'
import { validate } from './compiler.ts'

export function interactionRecipe(
  kind: 'chair' | 'horse' | 'car' | 'door',
  instanceId: string,
  position: { x: number; y: number; z: number },
): Node[] {
  const source = interactionTemplate(),
    ids = new Set<string>()
  const include = (id: string) => {
    if (ids.has(id)) return
    ids.add(id)
    const n = source.find((n) => n.id === id)
    if (!n) throw new Error(`Recipe dependency missing: ${id}`)
    interactionDependencies(n).forEach(include)
  }
  include(`entity.${kind}`)
  const mapping = new Map(
    [...ids].map((id) => [
      id,
      id === `entity.${kind}` ? instanceId : `${instanceId}.${id}`,
    ]),
  )
  const rewrite = (v: unknown): unknown =>
    typeof v === 'string'
      ? (mapping.get(v) ?? v)
      : Array.isArray(v)
        ? v.map(rewrite)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v).map(([k, x]) => [k, rewrite(x)]),
            )
          : v
  const nodes = source
    .filter((n) => ids.has(n.id))
    .map((n) => rewrite(n) as InteractionNode)
  const entity = nodes.find((n) => n.id === instanceId)!
  if (entity.kind === 'interactive_entity') entity.position = { ...position }
  return nodes
}
const base = (id: string, label: string) => ({
  id,
  label,
  version: 1 as const,
})
export function createUnified(preset: GamePlan['preset'] = 'courier'): Design {
  const legacy = createCombatTemplate(),
    courier = preset === 'courier',
    combat = preset === 'combat',
    exploration = preset === 'exploration'
  const title = courier
    ? 'The outpost courier'
    : combat
      ? 'The sentinel trial'
      : exploration
        ? 'The keeper’s key'
        : 'Observatory recovery'
  let nodes: Node[] = legacy.nodes.filter(
    (n) => !['actor', 'world', 'scenario'].includes(n.kind),
  )
  const mage = legacy.nodes.find(
      (n) => n.kind === 'actor' && n.role === 'mage',
    )!,
    enemy = legacy.nodes.find((n) => n.kind === 'actor' && n.role === 'enemy')!
  if (mage.kind !== 'actor' || enemy.kind !== 'actor')
    throw new Error('Missing core definitions')
  const define = (actor: typeof mage, id: string) => {
    const { role: _role, spawn: _spawn, ...rest } = actor
    return { ...rest, id, kind: 'actor_definition' as const }
  }
  nodes.push(
    define(mage, 'character.player'),
    define(enemy, 'character.guard'),
    {
      ...define(mage, 'character.keeper'),
      team: 'neutral',
      abilities: [],
      behavior: null,
      canClimb: false,
    },
  )
  nodes.push({
    ...base('world', 'Connected level'),
    kind: 'world',
    width: 40,
    depth: 40,
    boxes: [],
    ledges: [],
    objective: { x: 7, y: 0, z: 12 },
  })
  nodes.push({
    ...base('player', 'Courier'),
    kind: 'actor_instance',
    definition: 'character.player',
    position: { x: 0, y: 0, z: -12 },
    activation: null,
  })
  nodes.push({
    ...base('keeper', 'Keeper'),
    kind: 'actor_instance',
    definition: 'character.keeper',
    position: { x: -3, y: 0, z: -9 },
    activation: null,
  })
  nodes.push({
    ...base('recipient', 'Outpost recipient'),
    kind: 'actor_instance',
    definition: 'character.keeper',
    position: { x: 7, y: 0, z: 12 },
    activation: null,
  })
  const obj = (
    id: string,
    op: 'talk' | 'collect' | 'reach' | 'defeat' | 'interact' | 'deliver',
    target: string,
    prerequisites: string[],
    label: string,
    item: string | null = null,
  ): Node => ({
    ...base(id, label),
    kind: 'objective',
    op,
    target,
    item,
    quantity: 1,
    prerequisites,
    required: true,
    rewards: [],
  })
  nodes.push({
    ...base('briefing', 'Speak to the keeper'),
    kind: 'dialogue',
    actor: 'keeper',
    text: courier
      ? 'Take the parcel to the outpost. Ride to the marker, then deal with the guard and unlock the door.'
      : 'Recover the supplies and deliver them to the observatory.',
    prerequisites: [],
  })
  nodes.push(obj('quest.talk', 'talk', 'briefing', [], 'Talk to the keeper'))
  nodes.push(
    {
      ...base('item.parcel', courier ? 'Parcel' : 'Supplies'),
      kind: 'item',
      stackLimit: 1,
    },
    {
      ...base('parcel', courier ? 'Collect parcel' : 'Collect supplies'),
      kind: 'pickup',
      item: 'item.parcel',
      quantity: 1,
      position: { x: 2, y: 0, z: -8 },
      prerequisites: ['quest.talk'],
    },
  )
  nodes.push(
    obj(
      'quest.collect',
      'collect',
      'parcel',
      ['quest.talk'],
      'Collect the delivery',
    ),
  )
  let previous = 'quest.collect'
  if (courier) {
    nodes.push(...interactionRecipe('horse', 'mount', { x: -6, y: 0, z: -5 }))
    nodes.push(
      obj('quest.mount', 'interact', 'mount', [previous], 'Mount the horse'),
    )
    nodes.push({
      ...base('outpost', 'Ride to the outpost'),
      kind: 'region',
      position: { x: -6, y: 0, z: 4 },
      radius: 2,
    })
    nodes.push(
      obj(
        'quest.ride',
        'reach',
        'outpost',
        ['quest.mount'],
        'Reach the outpost',
      ),
    )
    previous = 'quest.ride'
  }
  if (!exploration) {
    nodes.push({
      ...base('guard', 'Outpost guard'),
      kind: 'actor_instance',
      definition: 'character.guard',
      position: { x: 5, y: 0, z: 3 },
      activation: previous,
    })
    nodes.push(
      obj('quest.defeat', 'defeat', 'guard', [previous], 'Defeat the guard'),
    )
    previous = 'quest.defeat'
  }
  nodes.push(
    { ...base('item.key', 'Brass key'), kind: 'item', stackLimit: 1 },
    {
      ...base('key', 'Collect key'),
      kind: 'pickup',
      item: 'item.key',
      quantity: 1,
      position: { x: 5, y: 0, z: 6 },
      prerequisites: [previous],
    },
  )
  nodes.push(obj('quest.key', 'collect', 'key', [previous], 'Collect the key'))
  nodes.push(...interactionRecipe('door', 'gate', { x: 5, y: 0, z: 9 }), {
    ...base('gate.lock', 'Key lock'),
    kind: 'lock',
    entity: 'gate',
    item: 'item.key',
    consume: true,
  })
  nodes.push(
    obj(
      'quest.door',
      'interact',
      'gate',
      ['quest.key'],
      'Unlock and open the gate',
    ),
  )
  nodes.push(
    obj(
      'quest.deliver',
      'deliver',
      'recipient',
      ['quest.door'],
      'Deliver the parcel',
      'item.parcel',
    ),
  )
  if (combat) {
    nodes = nodes.filter(
      (n) =>
        ![
          'objective',
          'pickup',
          'item',
          'dialogue',
          'lock',
          'interactive_entity',
        ].includes(n.kind) &&
        n.id !== 'keeper' &&
        n.id !== 'recipient',
    )
    const guard = nodes.find((n) => n.id === 'guard')
    if (guard?.kind === 'actor_instance') guard.activation = null
    nodes.push(
      {
        ...base('finish', 'Finish marker'),
        kind: 'region',
        position: { x: 7, y: 0, z: 12 },
        radius: 2,
      },
      obj('quest.defeat', 'defeat', 'guard', [], 'Defeat the sentinel'),
      obj(
        'quest.finish',
        'reach',
        'finish',
        ['quest.defeat'],
        'Reach the finish marker',
      ),
    )
  }
  if (preset === 'observatory')
    for (const node of nodes)
      if ('position' in node)
        node.position = { ...node.position, x: -node.position.x }
  return designSchema.parse({
    schemaVersion: 3,
    template: 'unified.v1',
    title,
    brief: title,
    player: 'player',
    seed: 17,
    inventoryCapacity: 8,
    nodes,
    assets: [],
  })
}
export function materialize(plan: GamePlan, current: Design | null): Design {
  if (plan.intent === 'explain')
    throw new Error('Explanation plans cannot generate a design')
  if (plan.unsupported.length)
    throw new Error(`Unsupported: ${plan.unsupported.join('; ')}`)
  const design = structuredClone(current ?? createUnified(plan.preset))
  const removed = new Set(plan.removeNodeIds ?? [])
  if ([...removed].some((id) => !design.nodes.some((n) => n.id === id)))
    throw new Error('Plan removes an unknown node')
  if (removed.has(design.player))
    throw new Error('Cannot remove the selected player')
  design.nodes = design.nodes.filter((n) => !removed.has(n.id))
  for (const recipe of plan.recipes) {
    if (design.nodes.some((n) => n.id === recipe.instanceId))
      throw new Error(
        `Recipe ${recipe.instanceId} already exists; refine it instead`,
      )
    design.nodes.push(
      ...interactionRecipe(recipe.kind, recipe.instanceId, recipe.position),
    )
  }
  for (const n of plan.edits) {
    const i = design.nodes.findIndex((x) => x.id === n.id)
    if (i >= 0) {
      if (design.nodes[i].kind !== n.kind)
        throw new Error('Node kind cannot change')
      design.nodes[i] = n
    } else design.nodes.push(n)
  }
  design.title = plan.title
  const errors = validate(design)
  if (errors.length)
    throw new Error(errors.map((e) => `${e.nodeKey}: ${e.message}`).join('\n'))
  return design
}
export const recipeCatalog = [
  'chair',
  'horse',
  'car',
  'door',
  'pickup',
  'locked door',
  'dialogue NPC',
  'hostile encounter',
  'delivery objective',
]
