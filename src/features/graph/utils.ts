import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'

import type { ConditionExpr, DefinitionBase, EffectOp, GraphDefinition, NodeDefinition } from '../../domain/graphcore'
import { graphNodeLibrary } from '../../domain/nodeLibrary'

const hiddenCinematicTemplateKeys = new Set([
  'character_ref',
  'location_ref',
  'prop_ref',
  'audio_ref',
  'style_ref',
  'equipped_character_ref',
  'paired_subject_ref',
  'wardrobe_ref',
  'sequence_board_ref',
  'shot_panel_ref',
  'cinematic_shot',
  'cinematic_establishing',
  'cinematic_dialogue',
  'cinematic_reveal',
  'cinematic_action',
  'cinematic_insert',
  'cinematic_transition',
])

export function getPlacementPosition(
  graph: GraphDefinition,
  selectedNode: NodeDefinition | null,
  flowInstance: ReactFlowInstance<Node, Edge> | null,
  canvasElement: HTMLDivElement | null,
) {
  if (selectedNode) return { x: selectedNode.position.x + 260, y: selectedNode.position.y + 40 }
  if (flowInstance && canvasElement) {
    const rect = canvasElement.getBoundingClientRect()
    return flowInstance.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  }
  const maxX = Math.max(0, ...graph.nodes.map((node) => node.position.x))
  return { x: maxX + 240, y: 120 }
}

export function uniqueGraphKey(graphs: GraphDefinition[], base: string) {
  let candidate = base
  let index = 2
  while (graphs.some((graph) => graph.key === candidate)) {
    candidate = `${base}_${index}`
    index += 1
  }
  return candidate
}

export function uniqueEdgeKey(graph: GraphDefinition, source: string, target: string) {
  const base = `edge.${source.split('.').pop() ?? 'source'}_${target.split('.').pop() ?? 'target'}`
  let candidate = base
  let index = 2
  while (graph.edges.some((edge) => edge.key === candidate)) {
    candidate = `${base}_${index}`
    index += 1
  }
  return candidate
}

export function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) {
    const type = (target.type || 'text').toLowerCase()
    return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type)
  }
  return target.isContentEditable
}

export function templateKeyFromType(type: NodeDefinition['type']) {
  const match = graphNodeLibrary.flatMap((group) => group.templates).find((template) => template.baseNodeType === type)
  return match?.key ?? 'story_text'
}

export function filterTemplateGroup(group: typeof graphNodeLibrary[number], query: string, graph: GraphDefinition | null) {
  const normalizedQuery = query.trim().toLowerCase()
  return group.templates.filter((template) => {
    if (graph && !isTemplateAvailableForGraph(template, graph)) return false
    if (!normalizedQuery) return true
    return (
      template.label.toLowerCase().includes(normalizedQuery) ||
      template.key.toLowerCase().includes(normalizedQuery) ||
      template.baseNodeType.toLowerCase().includes(normalizedQuery)
    )
  })
}

export function isTemplateAvailableForGraph(
  template: typeof graphNodeLibrary[number]['templates'][number],
  graph: GraphDefinition,
  currentNode?: NodeDefinition | null,
) {
  if (!template.compatibleGraphTypes.includes(graph.graphType)) return false
  if (
    graph.graphType === 'cinematic_flow'
    && hiddenCinematicTemplateKeys.has(template.key)
    && currentNode?.templateKey !== template.key
  ) {
    return false
  }
  if (template.baseNodeType === 'start') {
    return graph.nodes.every((node) => node.type !== 'start' || node.key === currentNode?.key)
  }
  if (template.baseNodeType === 'end') {
    return graph.nodes.every((node) => node.type !== 'end' || node.key === currentNode?.key)
  }
  return true
}

export function buildCondition(
  type: ConditionExpr['type'],
  itemDefinitions: DefinitionBase[],
  statDefinitions: DefinitionBase[],
  questDefinitions: DefinitionBase[],
  tokenDefinitions: DefinitionBase[],
  locationDefinitions: DefinitionBase[],
): ConditionExpr {
  switch (type) {
    case 'hasItem':
      return { type, itemKey: itemDefinitions[0]?.key ?? '', minQuantity: 1 }
    case 'itemCount':
      return { type, itemKey: itemDefinitions[0]?.key ?? '', comparator: 'gte', value: 1 }
    case 'statCompare':
      return { type, statKey: statDefinitions[0]?.key ?? '', comparator: 'gte', value: 0 }
    case 'questState':
      return { type, questKey: questDefinitions[0]?.key ?? '', state: 'active' }
    case 'tokenPresent':
      return { type, tokenKey: tokenDefinitions[0]?.key ?? '' }
    case 'locationUnlocked':
      return { type, locationKey: locationDefinitions[0]?.key ?? '' }
    case 'flagEquals':
    default:
      return { type: 'flagEquals', flagKey: 'flag.example', value: 'true' }
  }
}

export function buildEffect(
  type: EffectOp['type'],
  itemDefinitions: DefinitionBase[],
  statDefinitions: DefinitionBase[],
  questDefinitions: DefinitionBase[],
  tokenDefinitions: DefinitionBase[],
  locationDefinitions: DefinitionBase[],
  graphs: GraphDefinition[],
): EffectOp {
  switch (type) {
    case 'grantItem':
      return { type, itemKey: itemDefinitions[0]?.key ?? '', quantity: 1 }
    case 'removeItem':
      return { type, itemKey: itemDefinitions[0]?.key ?? '', quantity: 1 }
    case 'setStat':
      return { type, statKey: statDefinitions[0]?.key ?? '', value: { type: 'literal', value: 0 } }
    case 'addStat':
      return { type, statKey: statDefinitions[0]?.key ?? '', value: { type: 'literal', value: 1 } }
    case 'setQuestState':
      return { type, questKey: questDefinitions[0]?.key ?? '', state: 'active' }
    case 'grantToken':
      return { type, tokenKey: tokenDefinitions[0]?.key ?? '' }
    case 'revokeToken':
      return { type, tokenKey: tokenDefinitions[0]?.key ?? '' }
    case 'unlockLocation':
      return { type, locationKey: locationDefinitions[0]?.key ?? '' }
    case 'enqueueNarrative':
      return { type, graphKey: graphs[0]?.key ?? '' }
    case 'emitEvent':
      return { type, eventKey: 'event.example', payload: {} }
  }
}
