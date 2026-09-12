import { locomotionWeights } from '../v3/animationMixer.ts'
import type { StudioGraph, Transition } from './graph.ts'

export type StudioInput = { x: number; z: number; sprint: boolean; attack: boolean; toggleCombat: boolean }
export const emptyStudioInput = (): StudioInput => ({ x: 0, z: 0, sprint: false, attack: false, toggleCombat: false })
export type StudioState = { node: string; elapsed: number; gait: number; bufferedUntil: number; time: number; weights: Record<string, number>; previousWeights: Record<string, number>; blendElapsed: number; blendDuration: number; transition: string | null; history: string[] }
export function initialStudioState(graph: StudioGraph): StudioState {
  return { node: graph.entry, elapsed: 0, gait: 0, time: 0, bufferedUntil: -1, weights: { [graph.entry]: 1 }, previousWeights: {}, blendElapsed: 1, blendDuration: 0, transition: null, history: [] }
}
export function allowedTransition(graph: StudioGraph, state: StudioState, transition: Transition): boolean {
  const node = graph.nodes.find(n => n.id === state.node)
  if (!node || transition.from !== node.id) return false
  const phase = node.loop ? 0 : Math.min(1, state.elapsed / node.duration)
  return phase >= transition.earliest && phase <= transition.latest
}
export function studioWeights(state: StudioState): Record<string, number> {
  const t = state.blendDuration ? Math.min(1, state.blendElapsed / state.blendDuration) : 1
  const result: Record<string, number> = {}
  for (const key of new Set([...Object.keys(state.previousWeights), ...Object.keys(state.weights)])) {
    const weight = (state.previousWeights[key] ?? 0) * (1-t) + (state.weights[key] ?? 0)*t
    if (weight > .0001) result[key] = weight
  }
  return result
}
/** Same bounded evaluator for studio preview and game presentation. One transition per tick. */
export function advanceStudio(graph: StudioGraph, previous: StudioState, input: StudioInput, delta: number): StudioState {
  const dt = Math.max(0, Math.min(.1, Number.isFinite(delta) ? delta : 0))
  const state = { ...previous, elapsed: previous.elapsed + dt, time: previous.time + dt, gait: previous.gait + dt, blendElapsed: previous.blendElapsed + dt }
  let node = graph.nodes.find(n => n.id === state.node) ?? graph.nodes.find(n => n.id === graph.entry)!
  if (input.attack) state.bufferedUntil = state.time + .35
  const event = input.toggleCombat ? 'toggle_combat' : state.bufferedUntil >= state.time ? 'attack' : null
  const transitions = graph.transitions.filter(t => t.from === node.id).sort((a,b) => b.priority-a.priority || a.id.localeCompare(b.id))
  const transition = transitions.find(t => allowedTransition(graph, state, t) && (t.event === event || (t.event === 'finished' && !node.loop && state.elapsed >= node.duration)))
  let weights: Record<string, number>
  if (transition) {
    node = graph.nodes.find(n => n.id === transition.to)!
    state.node = node.id; state.elapsed = 0; state.transition = transition.id
    state.history = [...state.history.slice(-11), `${transition.from} → ${transition.to}`]
    if (transition.event === 'attack') state.bufferedUntil = -1
  }
  if (node.kind === 'locomotion') {
    const length = Math.max(1, Math.hypot(input.x, input.z)), speed = input.sprint ? 4 : 1.5
    const blend = locomotionWeights(input.x / length * speed, input.z / length * speed)
    weights = Object.fromEntries(graph.nodes.filter(n => n.group === node.group && n.kind === 'locomotion').map(n => [n.id, blend[n.role as keyof typeof blend] ?? 0]))
    state.node = Object.entries(weights).sort((a,b) => b[1]-a[1])[0][0]
  } else weights = { [node.id]: 1 }
  if (transition || Object.keys(weights).some(k => Math.abs(weights[k]-(previous.weights[k]??0))>.001)) {
    state.previousWeights = studioWeights(previous); state.blendElapsed = 0; state.blendDuration = transition?.blendSeconds ?? .12
  }
  state.weights = weights
  return state
}
