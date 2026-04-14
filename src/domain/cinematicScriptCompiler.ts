import {
  buildCinematicSequenceFromScriptDoc,
  cinematicTakeSpecSchema,
  cinematicShotSpecSchema,
  cinematicScriptDocSchema,
  type CinematicScriptDoc,
  type CinematicSettings,
} from './cinematics.ts'
import type { GraphDefinition } from './graphcore.ts'
import { createGraphScaffold } from './graphScaffold.ts'
import { normalizeNode } from './nodeLibrary.ts'
import { resourceGenerationMetadataSchema } from './worldBuild.ts'

type CompileCinematicGraphFromScriptInput = {
  graphKey: string
  graphName: string
  graphSummary: string
  graphSettings: Partial<CinematicSettings> | Record<string, unknown>
  scriptDoc: CinematicScriptDoc
  existingMetadata?: Record<string, unknown>
}

function assetRoleForBinding(binding: CinematicScriptDoc['entityBindings'][number]) {
  if (binding.kind === 'audio') return 'audio' as const
  if (binding.kind === 'style') return 'style' as const
  return binding.kind
}

function normalizeGraphLayoutPositions(nodes: GraphDefinition['nodes']) {
  const contentNodes = nodes.filter((node) => node.type !== 'start' && node.type !== 'end')
  if (contentNodes.length === 0) return nodes

  const minX = Math.min(...contentNodes.map((node) => node.position.x))
  const minY = Math.min(...contentNodes.map((node) => node.position.y))
  const targetX = 160
  const targetY = 96
  const deltaX = targetX - minX
  const deltaY = targetY - minY

  return nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x + deltaX,
      y: node.position.y + deltaY,
    },
  }))
}

export function compileCinematicGraphFromScriptDoc(input: CompileCinematicGraphFromScriptInput): GraphDefinition {
  const scriptDoc = cinematicScriptDocSchema.parse(input.scriptDoc)
  const cinematicSequence = buildCinematicSequenceFromScriptDoc(scriptDoc)
  const graph = createGraphScaffold({
    key: input.graphKey,
    name: input.graphName,
    graphType: 'cinematic_flow',
    summary: input.graphSummary,
  })
  const startNode = graph.nodes[0]
  const endNode = graph.nodes[1]
  const nodes = [startNode]
  const edges: GraphDefinition['edges'] = []
  const sourceNodeKeyByRefId = new Map<string, string>()

  for (const [index, binding] of scriptDoc.entityBindings.entries()) {
    const key = `${graph.key}.asset_ref_${index + 1}`
    const assetRole = assetRoleForBinding(binding)
    const node = normalizeNode({
      id: `node-asset-ref-${binding.id}-${index}`,
      key,
      type: 'asset_ref',
      title: binding.label,
      templateKey: 'asset_ref',
      subtitle: binding.role,
      position: { x: 220, y: 120 + index * 126 },
      body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: true },
      metadata: {
        entityRefId: binding.id,
        definitionKey: binding.definitionKey,
        assetKey: binding.assetKey,
        refKind: binding.definitionKey ? 'definition' : assetRole === 'audio' ? 'audio' : assetRole === 'style' ? 'style' : 'asset',
        assetRole,
        role: binding.role,
        priority: binding.priority,
        stagingNotes: binding.stagingNotes,
      },
    })
    nodes.push(node)
    sourceNodeKeyByRefId.set(binding.id, key)
  }

  for (const [index, composite] of scriptDoc.compositeRefs.filter((entry) => entry.outputAssetKey).entries()) {
    const key = `${graph.key}.composite_ref_${index + 1}`
    const node = normalizeNode({
      id: `node-composite-ref-${composite.id}-${index}`,
      key,
      type: 'composite_ref',
      title: composite.title,
      templateKey: 'composite_ref',
      subtitle: composite.summary || 'Composite reference',
      position: { x: 220, y: 160 + (scriptDoc.entityBindings.length + index) * 126 },
      body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: true },
      metadata: {
        compositeRefId: composite.id,
        title: composite.title,
        sourceRefIds: composite.sourceRefIds,
        relationshipType: composite.relationshipType,
        outputAssetKey: composite.outputAssetKey,
        generationPrompt: composite.generationPrompt,
        stagingNotes: composite.stagingNotes,
        priority: composite.priority,
      },
    })
    nodes.push(node)
    sourceNodeKeyByRefId.set(composite.id, key)

    for (const [sourceIndex, sourceRefId] of composite.sourceRefIds.entries()) {
      const sourceNodeKey = sourceNodeKeyByRefId.get(sourceRefId)
      if (!sourceNodeKey) continue
      edges.push({
        id: `edge-composite-${index}-${sourceIndex}`,
        key: `edge.${sourceNodeKey.split('.').pop() ?? 'asset'}_${key.split('.').pop() ?? 'composite'}_${sourceIndex + 1}`,
        source: { nodeKey: sourceNodeKey, portId: 'asset_out' },
        target: { nodeKey: key, portId: 'asset_in' },
        label: null,
        condition: null,
        metadata: {},
      })
    }
  }

  const storyboardRefs = [
    ...(scriptDoc.storyboard?.sequenceAssetKey
      ? [{
          id: 'storyboard_sequence',
          title: 'Sequence Board',
          assetKey: scriptDoc.storyboard.sequenceAssetKey,
          notes: scriptDoc.storyboard.summary,
          storyboardKind: 'sequence_board' as const,
        }]
      : []),
    ...((scriptDoc.storyboard?.panels ?? [])
      .filter((panel) => typeof panel.assetKey === 'string' && panel.assetKey.trim().length > 0)
      .map((panel) => ({
        id: panel.id,
        title: panel.title || `Panel ${panel.orderIndex + 1}`,
        assetKey: panel.assetKey,
        shotId: panel.shotId,
        notes: panel.notes,
        storyboardKind: 'shot_panel' as const,
      }))),
  ]

  for (const [index, storyboardRef] of storyboardRefs.entries()) {
    const key = `${graph.key}.storyboard_ref_${index + 1}`
    const node = normalizeNode({
      id: `node-storyboard-ref-${storyboardRef.id}-${index}`,
      key,
      type: 'storyboard_ref',
      title: storyboardRef.title,
      templateKey: 'storyboard_ref',
      subtitle: storyboardRef.storyboardKind === 'sequence_board' ? 'storyboard' : 'panel',
      position: { x: 220, y: 220 + (scriptDoc.entityBindings.length + scriptDoc.compositeRefs.length + index) * 126 },
      body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: true },
      metadata: {
        storyboardId: storyboardRef.id,
        panelId: storyboardRef.storyboardKind === 'shot_panel' ? storyboardRef.id : null,
        shotId: storyboardRef.storyboardKind === 'shot_panel' ? (storyboardRef.shotId ?? null) : null,
        storyboardKind: storyboardRef.storyboardKind,
        assetKey: storyboardRef.assetKey,
        notes: storyboardRef.notes,
        priority: 90,
      },
    })
    nodes.push(node)
    sourceNodeKeyByRefId.set(storyboardRef.id, key)
  }

  let previousFlowNodeKey = startNode.key
  const orderedShots = [...cinematicSequence.shots]
  const shotNodeKeyByShotId = new Map<string, string>()

  for (const [index, sequenceShot] of orderedShots.entries()) {
    const parsedShot = cinematicShotSpecSchema.parse(sequenceShot)
    const key = `${graph.key}.cinematic_shot_${index + 1}`
    const node = normalizeNode({
      id: `node-cinematic-shot-${parsedShot.id}-${index}`,
      key,
      type: 'cinematic_shot',
      title: parsedShot.title,
      templateKey: parsedShot.shotType === 'custom' ? 'cinematic_shot' : `cinematic_${parsedShot.shotType}`,
      subtitle: parsedShot.subtitle,
      position: { x: 620 + index * 360, y: 220 },
      body: { text: parsedShot.beat, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: false },
      metadata: {
        ...parsedShot,
        sequenceShotId: parsedShot.id,
      },
    })
    nodes.push(node)
    shotNodeKeyByShotId.set(parsedShot.id, key)
    edges.push({
      id: `edge-flow-${index}`,
      key: `edge.${previousFlowNodeKey.split('.').pop() ?? 'flow'}_${key.split('.').pop() ?? 'shot'}`,
      source: { nodeKey: previousFlowNodeKey, portId: 'out' },
      target: { nodeKey: key, portId: 'flow_in' },
      label: null,
      condition: null,
      metadata: {},
    })
    previousFlowNodeKey = key
  }

  let previousTakeNodeKey: string | null = null
  for (const [index, take] of cinematicSequence.takes.entries()) {
    const parsedTake = cinematicTakeSpecSchema.parse(take)
    const key = `${graph.key}.cinematic_take_${index + 1}`
    const node = normalizeNode({
      id: `node-cinematic-take-${parsedTake.id}-${index}`,
      key,
      type: 'cinematic_take',
      title: parsedTake.title,
      templateKey: 'cinematic_take',
      subtitle: `${parsedTake.durationSeconds}s`,
      position: { x: 620 + index * 420, y: 520 },
      body: { text: parsedTake.shotIds.join(', '), imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: false },
      metadata: {
        ...parsedTake,
        takeId: parsedTake.id,
      },
    })
    nodes.push(node)

    for (const [shotIndex, shotId] of parsedTake.shotIds.entries()) {
      const shotNodeKey = shotNodeKeyByShotId.get(shotId)
      if (!shotNodeKey) continue
      edges.push({
        id: `edge-shot-take-${index}-${shotIndex}`,
        key: `edge.${shotNodeKey.split('.').pop() ?? 'shot'}_${key.split('.').pop() ?? 'take'}_${shotIndex + 1}`,
        source: { nodeKey: shotNodeKey, portId: 'out' },
        target: { nodeKey: key, portId: 'in' },
        label: null,
        condition: null,
        metadata: {},
      })
    }

    if (previousTakeNodeKey) {
      edges.push({
        id: `edge-take-flow-${index}`,
        key: `edge.${previousTakeNodeKey.split('.').pop() ?? 'take'}_${key.split('.').pop() ?? 'take'}`,
        source: { nodeKey: previousTakeNodeKey, portId: 'out' },
        target: { nodeKey: key, portId: 'in' },
        label: null,
        condition: null,
        metadata: {},
      })
    }
    previousTakeNodeKey = key
  }

  edges.push({
    id: 'edge-flow-end',
    key: `edge.${previousFlowNodeKey.split('.').pop() ?? 'shot'}_${endNode.key.split('.').pop() ?? 'end'}`,
    source: { nodeKey: previousFlowNodeKey, portId: 'out' },
    target: { nodeKey: endNode.key, portId: 'in' },
    label: null,
    condition: null,
    metadata: {},
  })
  nodes.push(endNode)
  const normalizedNodes = normalizeGraphLayoutPositions(nodes)
  const existingGeneration =
    resourceGenerationMetadataSchema.safeParse(input.existingMetadata?.generation ?? null).success
      ? resourceGenerationMetadataSchema.parse(input.existingMetadata?.generation)
      : undefined

  return {
    ...graph,
    name: input.graphName,
    summary: input.graphSummary,
    metadata: {
      ...(input.existingMetadata ?? {}),
      cinematics: input.graphSettings,
      cinematicScript: scriptDoc,
      cinematicSequence,
      generation: existingGeneration,
    },
    nodes: normalizedNodes,
    edges,
  }
}
