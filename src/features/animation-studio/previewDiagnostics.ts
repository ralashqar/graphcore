import { ancestors, type FlexibleGraph, type FlexTransition } from '../../domain/game/animation-studio/flexible.ts'
import { transitionReady, type FlexState } from '../../domain/game/animation-studio/flexibleRuntime.ts'

export function transitionReason(graph: FlexibleGraph, state: FlexState, t: FlexTransition): string {
  const label = (id:string) => graph.nodes.find(n=>n.id===id)?.label ?? id
  if (!state.node || !ancestors(graph,state.node).includes(t.from)) return `Play ${label(t.from)} first`
  const node = graph.nodes.find(n=>n.id===state.node)!
  if (t.completion && node.loop) return 'A looping clip cannot complete'
  if (t.completion && state.elapsed < node.duration) return 'Waiting for clip completion'
  const phase = state.locomotion?.samples[node.id] ?? (node.loop ? (state.elapsed % node.duration) / node.duration : Math.min(1,state.elapsed/node.duration))
  if (phase < t.earliest) return `Opens at ${Math.round(t.earliest*100)}% of the clip`
  if (phase > t.latest) return 'Transition window has closed'
  if (!transitionReady(graph,state,t)) return 'Requires ' + t.conditions.map(c=>`${graph.parameters.find(p=>p.id===c.parameter)?.label??c.parameter} ${{eq:'=',ne:'≠',gt:'>',lt:'<',gte:'≥',lte:'≤'}[c.operator]} ${c.value}`).join(' and ')
  return t.event ? `Ready · trigger ${graph.events.find(e=>e.id===t.event)?.label??t.event}` : 'Ready'
}
