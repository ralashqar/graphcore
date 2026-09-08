import {
  designSchema,
  dependencies,
  nodesOf,
  manifestSchema,
  IMPLEMENTATION,
  TEMPLATE,
  type Design,
  type Node,
} from './spec.ts'
import { TRANSITIONS } from './template.ts'
import { hashGameValue } from '../compiler.ts'
import { validateInteractions } from '../interactions/validate.ts'
export type Finding = { nodeKey: string; message: string }
export function validateDesign(input: unknown): Finding[] {
  const parsed = designSchema.safeParse(input)
  if (!parsed.success)
    return parsed.error.issues.map((i) => ({
      nodeKey: String(i.path[1] ?? 'design'),
      message: `${i.path.join('.')}: ${i.message}`,
    }))
  return validateComponents(parsed.data)
}
// Shared physical contracts; schema-3 supplies its own composition cardinalities.
export function validateComponents(d: Design, composed = false): Finding[] {
  const
    errors: Finding[] = [],
    byId = new Map(d.nodes.map((n) => [n.id, n]))
  const fail = (nodeKey: string, message: string) =>
    errors.push({ nodeKey, message })
  if (byId.size !== d.nodes.length) fail('design', 'Duplicate node ID')
  if (!composed) for (const kind of [
    'world',
    'movement',
    'rig',
    'behavior',
    'scenario',
  ] as const)
    if (nodesOf(d, kind).length !== 1)
      fail(kind, 'Exactly one node is required')
  if (!composed) for (const role of ['mage', 'melee', 'enemy', 'target'])
    if (nodesOf(d, 'actor').filter((n) => n.role === role).length !== 1)
      fail(role, 'Exactly one archetype is required')
  const expect = (n: Node, id: string, kind: Node['kind']) => {
    if (byId.get(id)?.kind !== kind) fail(n.id, `Missing ${kind}: ${id}`)
  }
  for (const n of d.nodes) {
    if (n.kind === 'actor') {
      expect(n, n.rig, 'rig')
      expect(n, n.movement, 'movement')
      n.abilities.forEach((a) => expect(n, a, 'ability'))
      if (n.behavior) expect(n, n.behavior, 'behavior')
      if (n.height <= n.radius * 2)
        fail(n.id, 'Capsule height must exceed diameter')
      if (n.role === 'enemy' && (!n.behavior || !n.abilities.length))
        fail(n.id, 'Enemy requires behavior and ability')
      if (!composed && (
        (n.role === 'mage' || n.role === 'melee') &&
        (!n.canClimb || !n.abilities.length)
      ))
        fail(n.id, 'Player requires climb and abilities')
    }
    if (n.kind === 'ability') {
      expect(n, n.pose, 'pose')
      if (n.op === 'bolt') {
        if (!n.projectile) fail(n.id, 'Bolt requires projectile')
        else expect(n, n.projectile, 'projectile')
      } else if (n.projectile) fail(n.id, 'Only bolts may bind projectiles')
    }
    if (n.kind === 'movement') {
      if (n.sprint < n.speed) fail(n.id, 'Sprint cannot be slower than walk')
      if (JSON.stringify(n.transitions) !== JSON.stringify(TRANSITIONS))
        fail(n.id, 'Required safety transitions must remain intact')
    }
    if (n.kind === 'rig') {
      if (new Set(n.sockets.map((s) => s.id)).size !== 8)
        fail(n.id, 'Sockets must be unique')
      for (const s of n.sockets)
        if (Math.hypot(s.forward.x, s.forward.y, s.forward.z) < 0.9)
          fail(n.id, 'Socket requires forward orientation')
    }
    if (n.kind === 'world') {
      for (const b of n.boxes)
        if (Object.values(b.size).some((v) => v <= 0 || v > 40))
          fail(n.id, 'Positive bounded collider dimensions required')
      if (
        new Set(n.boxes.map((b) => b.id)).size !== n.boxes.length ||
        new Set(n.ledges.map((b) => b.id)).size !== n.ledges.length
      )
        fail(n.id, 'Duplicate geometry ID')
      for (const l of n.ledges) {
        if (
          l.start.y !== l.end.y ||
          l.start.z !== l.end.z ||
          l.start.x >= l.end.x ||
          l.normal.x !== 0 ||
          l.normal.y !== 0 ||
          l.normal.z !== -1
        )
          fail(n.id, 'V1 ledges must be horizontal, run +X and face -Z')
        if (l.landing.y !== l.start.y || l.landing.z <= l.start.z)
          fail(n.id, 'Landing must be behind the grip at its height')
        for (const c of l.connects) {
          const target = n.ledges.find((e) => e.id === c)
          if (
            !target ||
            Math.min(
              Math.hypot(
                target.start.x - l.end.x,
                target.start.z - l.end.z,
                target.start.y - l.end.y,
              ),
              Math.hypot(
                target.end.x - l.start.x,
                target.end.z - l.start.z,
                target.end.y - l.start.y,
              ),
            ) > 0.05
          )
            fail(n.id, 'Shimmy connection must share an endpoint')
        }
      }
    }
  }
  return [...errors, ...validateInteractions(d.nodes)]
}
export async function nodeHashes(d: Design) {
  const out: Record<string, string> = {}
  for (const n of d.nodes)
    out[n.id] = await hashGameValue({ implementation: IMPLEMENTATION, node: n })
  return out
}
export function affectedNodes(d: Design, changed: string[]) {
  const out = new Set(changed)
  let more = true
  while (more) {
    more = false
    for (const n of d.nodes)
      if (!out.has(n.id) && dependencies(n).some((x) => out.has(x))) {
        out.add(n.id)
        more = true
      }
  }
  return [...out]
}
export async function compile(input: {
  id: string
  projectId: string
  draftId: string
  sourceRevision: number
  design: Design
}) {
  const errors = validateDesign(input.design)
  if (errors.length)
    throw new Error(errors.map((e) => `${e.nodeKey}: ${e.message}`).join('\n'))
  return manifestSchema.parse({
    ...input,
    schemaVersion: 2,
    sourceHash: await hashGameValue(input.design),
    runtimeVersion: IMPLEMENTATION,
    templateVersion: TEMPLATE,
    physicsVersion: '0.17.3',
    nodeHashes: await nodeHashes(input.design),
    assets: [],
  })
}
