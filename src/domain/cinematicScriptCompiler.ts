import {
  buildCinematicSequenceFromScriptDoc,
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

function uniqueRefIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(
    values
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim()),
  ))
}

function getAvailableCompositeRefIds(scriptDoc: CinematicScriptDoc) {
  return new Set(
    scriptDoc.compositeRefs
      .filter((entry) => typeof entry.outputAssetKey === 'string' && entry.outputAssetKey.trim().length > 0)
      .map((entry) => entry.id),
  )
}

function getAvailableStoryboardRefIds(scriptDoc: CinematicScriptDoc) {
  return new Set([
    ...(scriptDoc.storyboard?.sequenceAssetKey ? ['storyboard_sequence'] : []),
    ...((scriptDoc.storyboard?.panels ?? [])
      .filter((panel) => typeof panel.assetKey === 'string' && panel.assetKey.trim().length > 0)
      .map((panel) => panel.id)),
  ])
}

function buildShotSourceRefIds(scriptDoc: CinematicScriptDoc, shot: CinematicScriptDoc['shots'][number]) {
  const entityBindingIds = new Set(scriptDoc.entityBindings.map((binding) => binding.id))
  const availableCompositeRefIds = getAvailableCompositeRefIds(scriptDoc)
  const availableStoryboardRefIds = getAvailableStoryboardRefIds(scriptDoc)
  const explicitSourceRefIds = uniqueRefIds(shot.requiredSourceRefIds).filter((refId) => (
    entityBindingIds.has(refId)
    || availableCompositeRefIds.has(refId)
    || availableStoryboardRefIds.has(refId)
  ))
  if (explicitSourceRefIds.length > 0) return explicitSourceRefIds

  const defaultStoryboardRefIds = scriptDoc.storyboard?.panels
    .filter((panel) => panel.shotId === shot.id && panel.assetKey)
    .map((panel) => panel.id)
    ?? []

  return uniqueRefIds([
    ...shot.storyboardRefIds.filter((refId) => availableStoryboardRefIds.has(refId)),
    ...defaultStoryboardRefIds,
    ...shot.compositeRefIds.filter((refId) => availableCompositeRefIds.has(refId)),
    ...shot.participantRefIds,
    shot.locationRefId,
    ...shot.propRefIds,
  ])
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
      templateKey:
        assetRole === 'character'
          ? 'character_ref'
          : assetRole === 'environment'
            ? 'location_ref'
            : assetRole === 'item'
              ? 'prop_ref'
              : assetRole === 'audio'
                ? 'audio_ref'
                : 'style_ref',
      subtitle: binding.role,
      position: { x: 280, y: 120 + index * 130 },
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
      templateKey: 'equipped_character_ref',
      subtitle: composite.summary || 'Composite reference',
      position: { x: 280, y: 160 + (scriptDoc.entityBindings.length + index) * 130 },
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
      templateKey: storyboardRef.storyboardKind === 'sequence_board' ? 'sequence_board_ref' : 'shot_panel_ref',
      subtitle: storyboardRef.storyboardKind === 'sequence_board' ? 'storyboard' : 'panel',
      position: { x: 280, y: 220 + (scriptDoc.entityBindings.length + scriptDoc.compositeRefs.length + index) * 130 },
      body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: true },
      metadata: {
        storyboardId: storyboardRef.id,
        panelId: storyboardRef.storyboardKind === 'shot_panel' ? storyboardRef.id : null,
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
  const orderedShots = [...scriptDoc.shots].sort((left, right) => left.orderIndex - right.orderIndex)

  for (const [index, scriptShot] of orderedShots.entries()) {
    const sourceRefIds = buildShotSourceRefIds(scriptDoc, scriptShot)
    const sequenceShot = cinematicShotSpecSchema.parse({
      id: scriptShot.id,
      title: scriptShot.title,
      subtitle: scriptShot.subtitle,
      beat: scriptShot.beat,
      shotType: scriptShot.shotType,
      framing: scriptShot.framing,
      cameraAngle: scriptShot.cameraAngle,
      cameraMovement: scriptShot.cameraMovement,
      lensPreference: scriptShot.lensPreference,
      visualPrompt: scriptShot.visualPrompt,
      compositionGuide: scriptShot.compositionGuide,
      participantRefIds: scriptShot.participantRefIds,
      locationRefId: scriptShot.locationRefId,
      propRefIds: scriptShot.propRefIds,
      requiredSourceRefIds: sourceRefIds,
      compositeRefIds: scriptShot.compositeRefIds,
      storyboardRefIds: uniqueRefIds(scriptShot.storyboardRefIds),
      durationSeconds: scriptShot.durationSeconds,
      seedanceModePreference:
        scriptShot.storyboardRefIds.length > 0 || scriptShot.compositeRefIds.length > 0 || sourceRefIds.length > 1
          ? 'reference-to-video'
          : 'auto',
      beats: scriptShot.beats,
      dialogue: scriptShot.dialogue,
      actions: scriptShot.actions,
      audio: scriptShot.audio,
    })
    const key = `${graph.key}.cinematic_shot_${index + 1}`
    const node = normalizeNode({
      id: `node-cinematic-shot-${sequenceShot.id}-${index}`,
      key,
      type: 'cinematic_shot',
      title: sequenceShot.title,
      templateKey: sequenceShot.shotType === 'custom' ? 'cinematic_shot' : `cinematic_${sequenceShot.shotType}`,
      subtitle: sequenceShot.subtitle,
      position: { x: 720 + index * 360, y: 240 },
      body: { text: sequenceShot.beat, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: false },
      metadata: {
        ...sequenceShot,
        sequenceShotId: sequenceShot.id,
      },
    })
    nodes.push(node)
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

    for (const sourceRefId of sourceRefIds) {
      const sourceNodeKey = sourceNodeKeyByRefId.get(sourceRefId)
      if (!sourceNodeKey) continue
      edges.push({
        id: `edge-asset-${index}-${sourceRefId}`,
        key: `edge.${sourceNodeKey.split('.').pop() ?? 'asset'}_${key.split('.').pop() ?? 'shot'}`,
        source: { nodeKey: sourceNodeKey, portId: 'asset_out' },
        target: { nodeKey: key, portId: 'asset_in' },
        label: null,
        condition: null,
        metadata: {},
      })
    }
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

  const cinematicSequence = buildCinematicSequenceFromScriptDoc({
    ...scriptDoc,
    shots: orderedShots.map((shot) => ({
      ...shot,
      requiredSourceRefIds: buildShotSourceRefIds(scriptDoc, shot),
    })),
  })
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
