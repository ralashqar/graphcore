import { z } from 'zod'
import { hashGameValue } from '../compiler.ts'

export const STUDIO_VERSION = 'animation-studio-1.0.0'
const id = z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/)
export const motionRole = z.enum(['idle', 'walk', 'run', 'backward', 'strafe_left', 'strafe_right', 'sword_strike'])
export const stanceSchema = z.object({
  id, label: z.string().min(1).max(100), equipment: z.enum(['none', 'one_handed_sword']),
  description: z.string().min(1).max(600), guardHeight: z.number().min(-.15).max(.15),
  torsoTurn: z.number().min(-.4).max(.4), handedness: z.literal('right'),
}).strict()
export const motionNodeSchema = z.object({
  id, group: id, kind: z.enum(['locomotion', 'action']), role: motionRole,
  label: z.string().min(1).max(100), description: z.string().min(10).max(1000),
  duration: z.number().min(.5).max(8), loop: z.boolean(), speed: z.number().min(0).max(8),
  entry: id, exit: id, impact: z.number().min(.05).max(.95),
  clipId: z.string().uuid().nullable(), contractHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).strict()
export const transitionSchema = z.object({
  id, from: id, to: id, event: z.enum(['attack', 'finished', 'toggle_combat']),
  earliest: z.number().min(0).max(1), latest: z.number().min(0).max(1),
  blendSeconds: z.number().min(0).max(.3), priority: z.number().int().min(0).max(100),
}).strict()
export const graphSchema = z.object({
  version: z.literal(2), catalog: z.literal(STUDIO_VERSION), name: z.string().min(1).max(120),
  prompt: z.string().max(4000), rig: z.literal('humanoid.fabric-ybot.v1'), entry: id,
  stances: z.array(stanceSchema).min(1).max(8), nodes: z.array(motionNodeSchema).min(1).max(80),
  transitions: z.array(transitionSchema).max(160),
  dependencies: z.array(z.object({ node: id, predecessor: id, candidateId: z.string().uuid() }).strict()).max(80),
  gaps: z.array(z.string().max(500)).max(30),
  inputs: z.object({ attack: z.string().regex(/^Key[A-Z]$/), toggle_combat: z.string().regex(/^Key[A-Z]$/) }).strict(),
}).strict()
export type StudioGraph = z.infer<typeof graphSchema>
export type MotionNode = z.infer<typeof motionNodeSchema>
export type StudioStance = z.infer<typeof stanceSchema>
export type Transition = z.infer<typeof transitionSchema>

export function validateGraph(graph: StudioGraph): string[] {
  const errors: string[] = [], nodes = new Map(graph.nodes.map(n => [n.id, n]))
  const groups = new Set(graph.stances.map(s => s.id))
  if (nodes.size !== graph.nodes.length || groups.size !== graph.stances.length) errors.push('Node and stance IDs must be unique')
  if (!nodes.has(graph.entry)) errors.push('Entry node is missing')
  if (new Set(graph.transitions.map(t => t.id)).size !== graph.transitions.length) errors.push('Transition IDs must be unique')
  if (graph.inputs.attack === graph.inputs.toggle_combat || ['KeyW','KeyA','KeyS','KeyD'].some(k => Object.values(graph.inputs).includes(k))) errors.push('Action keys must be distinct from movement keys')
  for (const node of graph.nodes) {
    if (!groups.has(node.group)) errors.push(`${node.id}: unknown stance`)
    if (node.kind === 'action' && (node.role !== 'sword_strike' || node.loop)) errors.push(`${node.id}: actions must be non-looping sword strikes`)
    if (node.kind === 'locomotion' && (node.role === 'sword_strike' || !node.loop)) errors.push(`${node.id}: locomotion must loop`)
    if (node.kind === 'action' && !graph.transitions.some(t => t.from === node.id && t.event === 'finished')) errors.push(`${node.id}: missing recovery transition`)
  }
  for (const group of groups) {
    const roles = graph.nodes.filter(n => n.group === group && n.kind === 'locomotion').map(n => n.role)
    if (!['idle','walk','run','backward','strafe_left','strafe_right'].every(r => roles.includes(r as MotionNode['role']))) errors.push(`${group}: incomplete locomotion set`)
    if (new Set(roles).size !== roles.length) errors.push(`${group}: duplicate locomotion role`)
  }
  const signatures = new Set<string>()
  for (const t of graph.transitions) {
    if (!nodes.has(t.from) || !nodes.has(t.to)) errors.push(`${t.id}: missing transition endpoint`)
    if (t.earliest > t.latest) errors.push(`${t.id}: invalid transition window`)
    const signature = `${t.from}:${t.event}:${t.priority}`
    if (signatures.has(signature)) errors.push(`${t.id}: ambiguous transition priority`)
    signatures.add(signature)
  }
  // Movement implicitly reaches the other locomotion nodes within a stance.
  const reached = new Set([graph.entry])
  for (let i = 0; i < nodes.size; i++) {
    for (const n of graph.nodes) if (reached.has(n.id) && n.kind === 'locomotion') graph.nodes.filter(x => x.group === n.group && x.kind === 'locomotion').forEach(x => reached.add(x.id))
    for (const t of graph.transitions) if (reached.has(t.from)) reached.add(t.to)
  }
  for (const n of graph.nodes) if (!reached.has(n.id)) errors.push(`${n.id}: unreachable node`)
  const visiting = new Set<string>(), visited = new Set<string>()
  function visit(node: string): boolean {
    if (visiting.has(node)) return false
    if (visited.has(node)) return true
    visiting.add(node)
    for (const d of graph.dependencies.filter(d => d.node === node)) if (!nodes.has(d.predecessor) || !visit(d.predecessor)) return false
    visiting.delete(node); visited.add(node); return true
  }
  for (const d of graph.dependencies) if (!nodes.has(d.node) || !visit(d.node)) { errors.push('Generation dependencies must form an acyclic graph of existing nodes'); break }
  return errors
}
export function parseGraph(value: unknown): StudioGraph {
  const graph = graphSchema.parse(value), errors = validateGraph(graph)
  if (errors.length) throw new Error(errors.join('\n'))
  return graph
}
export async function nodeContract(graph: StudioGraph, node: MotionNode) {
  return hashGameValue({ version: STUDIO_VERSION, rig: graph.rig, node: { ...node, clipId: null, contractHash: null },
    stance: graph.stances.find(s => s.id === node.group),
    adjacent: graph.transitions.filter(t => t.from === node.id || t.to === node.id).map(t => ({ ...t, fromDescription: graph.nodes.find(n => n.id === t.from)?.description, toDescription: graph.nodes.find(n => n.id === t.to)?.description })),
    dependencies: graph.dependencies.filter(d => d.node === node.id),
  })
}
export async function freezeGraph(value: unknown): Promise<StudioGraph> {
  const graph = parseGraph(value)
  return { ...graph, nodes: await Promise.all(graph.nodes.map(async node => {
    const contractHash = await nodeContract(graph, node)
    return { ...node, clipId: node.contractHash === contractHash ? node.clipId : null, contractHash }
  })) }
}
export function graphDiff(before: StudioGraph, after: StudioGraph) {
  const changes = after.nodes.filter(n => JSON.stringify(n) !== JSON.stringify(before.nodes.find(b => b.id === n.id))).map(n => n.id)
    .concat(before.nodes.filter(n => !after.nodes.some(a => a.id === n.id)).map(n => n.id))
  for (const field of ['name', 'entry', 'stances', 'transitions', 'dependencies', 'inputs', 'gaps'] as const) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) changes.push(field)
  }
  return changes
}
