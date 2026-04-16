import {
  compileCinematicSequence,
  deriveCinematicScriptFromSequence,
  getCinematicSequence,
  getCinematicTakeNodeConfig,
  type CinematicSequence,
} from './cinematics.ts'
import type { GraphDefinition, NodeDefinition } from './graphcore.ts'
import { normalizeNode } from './nodeLibrary.ts'

type TakeDocumentShotLike = {
  title: string
  beat: string
  participantRefIds: string[]
  locationRefId: string | null
  propRefIds: string[]
  compositeRefIds: string[]
  storyboardRefIds: string[]
}

function truncateLine(value: string, max = 160) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function createUniqueEdgeKey(edges: GraphDefinition['edges'], source: string, target: string) {
  const base = `edge.${source.split('.').pop() ?? 'source'}_${target.split('.').pop() ?? 'target'}`
  let candidate = base
  let index = 2
  while (edges.some((edge) => edge.key === candidate)) {
    candidate = `${base}_${index}`
    index += 1
  }
  return candidate
}

function buildTakeSummary(shots: TakeDocumentShotLike[]) {
  const beat = shots.map((shot) => shot.beat.trim()).find((entry) => entry.length > 0)
  if (beat) return truncateLine(beat, 180)
  const titles = shots.map((shot) => shot.title.trim()).filter((entry) => entry.length > 0)
  return titles.length > 0 ? truncateLine(titles.join(' -> '), 180) : ''
}

function buildTakeTagBundle(shots: TakeDocumentShotLike[]) {
  return {
    participantRefIds: Array.from(new Set(shots.flatMap((shot) => shot.participantRefIds))),
    environmentRefIds: Array.from(new Set(
      shots
        .map((shot) => shot.locationRefId)
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0),
    )),
    propRefIds: Array.from(new Set(shots.flatMap((shot) => shot.propRefIds))),
    compositeRefIds: Array.from(new Set(shots.flatMap((shot) => shot.compositeRefIds))),
    storyboardRefIds: Array.from(new Set(shots.flatMap((shot) => shot.storyboardRefIds))),
  }
}

function pickTakeRuntimeFields(take: Partial<CinematicSequence['takes'][number]> | null | undefined) {
  if (!take) return {}
  return {
    storyboardAssetKey: take.storyboardAssetKey ?? null,
    outputVideoAssetKey: take.outputVideoAssetKey ?? null,
    outputStillAssetKey: take.outputStillAssetKey ?? null,
    approvedForVideo: take.approvedForVideo ?? false,
    approvalNotes: take.approvalNotes ?? '',
    lastRunId: take.lastRunId ?? null,
    lastStoryboardJobId: take.lastStoryboardJobId ?? null,
    lastStillJobId: take.lastStillJobId ?? null,
    lastVideoJobId: take.lastVideoJobId ?? null,
    provider: take.provider ?? null,
    providerModel: take.providerModel ?? null,
    providerRequestId: take.providerRequestId ?? null,
    executionPlan: take.executionPlan ?? null,
  }
}

function readTakeNodeMetadata(graph: GraphDefinition | null | undefined) {
  if (!graph) return new Map<string, ReturnType<typeof getCinematicTakeNodeConfig>>()
  return new Map(
    graph.nodes
      .filter((node) => node.type === 'cinematic_take')
      .map((node) => {
        const config = getCinematicTakeNodeConfig(node)
        return [config.id, config] as const
      }),
  )
}

function deriveDefaultTakePosition(
  graph: GraphDefinition,
  take: CinematicSequence['takes'][number],
  index: number,
  existingTakeNode: NodeDefinition | null,
) {
  if (existingTakeNode?.position) return existingTakeNode.position

  const legacyShotNodes = graph.nodes
    .filter((node) => node.type === 'cinematic_shot')
    .filter((node) => take.shotIds.includes((typeof node.metadata?.sequenceShotId === 'string'
      ? String(node.metadata.sequenceShotId)
      : typeof node.metadata?.id === 'string'
        ? String(node.metadata.id)
        : '')))

  if (legacyShotNodes.length > 0) {
    const meanX = legacyShotNodes.reduce((sum, node) => sum + node.position.x, 0) / legacyShotNodes.length
    const meanY = legacyShotNodes.reduce((sum, node) => sum + node.position.y, 0) / legacyShotNodes.length
    return { x: meanX, y: meanY }
  }

  return { x: 620 + index * 420, y: 520 }
}

export function projectSequenceToTakeOnlyGraph(
  graph: GraphDefinition,
  sequenceInput: CinematicSequence,
) {
  const compiledSequence = compileCinematicSequence(sequenceInput)
  const runtimeTakeById = new Map(sequenceInput.takes.map((take) => [take.id, pickTakeRuntimeFields(take)] as const))
  const sequence = {
    ...compiledSequence,
    takes: compiledSequence.takes.map((take) => ({
      ...take,
      ...(runtimeTakeById.get(take.id) ?? {}),
    })),
  } satisfies CinematicSequence
  const scriptDoc = deriveCinematicScriptFromSequence(sequence)
  const existingTakeNodes = graph.nodes.filter((node) => node.type === 'cinematic_take')
  const existingTakeNodeByTakeId = new Map<string, NodeDefinition>()
  const existingTakeNodeByIndex = new Map<number, NodeDefinition>()

  existingTakeNodes.forEach((node, index) => {
    existingTakeNodeByIndex.set(index, node)
    existingTakeNodeByTakeId.set(getCinematicTakeNodeConfig(node).id, node)
  })

  const preservedNodes = graph.nodes.filter((node) => node.type !== 'cinematic_take' && node.type !== 'cinematic_shot')
  const usedKeys = new Set(preservedNodes.map((node) => node.key))
  const nextTakeNodes = sequence.takes.map((take, index) => {
    const existingNode = existingTakeNodeByTakeId.get(take.id) ?? existingTakeNodeByIndex.get(index) ?? null
    const baseKey = `${graph.key}.cinematic_take_${index + 1}`
    let nextKey = existingNode?.key ?? baseKey
    if (!existingNode) {
      let counter = 1
      while (usedKeys.has(nextKey)) {
        counter += 1
        nextKey = `${baseKey}_${counter}`
      }
    }
    usedKeys.add(nextKey)

    return normalizeNode({
      ...(existingNode ?? {
        id: `node-cinematic-take-${take.id}-${index}`,
        key: nextKey,
        type: 'cinematic_take',
        title: take.title,
        templateKey: 'cinematic_take',
        subtitle: `${take.durationSeconds}s`,
        position: deriveDefaultTakePosition(graph, take, index, existingNode),
        body: { text: take.shotIds.join(', '), imageAssetKey: null, audioAssetKey: null, choices: [] },
        condition: null,
        effects: [],
        ports: [],
        display: { iconAssetKey: null, compactPreview: false },
        metadata: {},
      }),
      key: nextKey,
      type: 'cinematic_take',
      title: take.title,
      templateKey: existingNode?.templateKey ?? 'cinematic_take',
      subtitle: `${take.durationSeconds}s`,
      body: {
        ...(existingNode?.body ?? { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] }),
        text: take.shotIds.join(', '),
        imageAssetKey: take.storyboardAssetKey ?? take.outputStillAssetKey ?? existingNode?.body?.imageAssetKey ?? null,
      },
      position: deriveDefaultTakePosition(graph, take, index, existingNode),
      metadata: {
        ...(existingNode?.metadata ?? {}),
        ...take,
        takeId: take.id,
      },
      display: {
        ...(existingNode?.display ?? { iconAssetKey: null, compactPreview: false }),
        iconAssetKey: take.storyboardAssetKey ?? take.outputStillAssetKey ?? existingNode?.display?.iconAssetKey ?? null,
      },
    })
  })

  const takeNodeKeyByTakeId = new Map(nextTakeNodes.map((node) => [getCinematicTakeNodeConfig(node).id, node.key] as const))
  const retainedEdges = graph.edges.filter((edge) => {
    const sourceNode = graph.nodes.find((node) => node.key === edge.source.nodeKey) ?? null
    const targetNode = graph.nodes.find((node) => node.key === edge.target.nodeKey) ?? null
    if (!sourceNode || !targetNode) return true
    if (sourceNode.type === 'cinematic_shot' || sourceNode.type === 'cinematic_take') return false
    if (targetNode.type === 'cinematic_shot' || targetNode.type === 'cinematic_take') return false
    const flowTypes = new Set(['start', 'end', 'cinematic_shot', 'cinematic_take'])
    if (flowTypes.has(sourceNode.type) && flowTypes.has(targetNode.type)) return false
    return true
  })
  const nextEdges = [...retainedEdges]
  const startNodeKey = preservedNodes.find((node) => node.type === 'start')?.key ?? null
  const endNodeKey = preservedNodes.find((node) => node.type === 'end')?.key ?? null

  sequence.takes.forEach((take, index) => {
    const takeNodeKey = takeNodeKeyByTakeId.get(take.id)
    if (!takeNodeKey) return
    if (index === 0 && startNodeKey) {
      nextEdges.push({
        id: `edge-flow-start-take-${index}`,
        key: createUniqueEdgeKey(nextEdges, startNodeKey, takeNodeKey),
        source: { nodeKey: startNodeKey, portId: 'out' },
        target: { nodeKey: takeNodeKey, portId: 'in' },
        label: null,
        condition: null,
        metadata: {},
      })
    }
    if (index > 0) {
      const previousTakeNodeKey = takeNodeKeyByTakeId.get(sequence.takes[index - 1].id)
      if (previousTakeNodeKey) {
        nextEdges.push({
          id: `edge-take-flow-${index}`,
          key: createUniqueEdgeKey(nextEdges, previousTakeNodeKey, takeNodeKey),
          source: { nodeKey: previousTakeNodeKey, portId: 'out' },
          target: { nodeKey: takeNodeKey, portId: 'in' },
          label: null,
          condition: null,
          metadata: {},
        })
      }
    }
  })

  const lastTakeNodeKey = sequence.takes.length > 0
    ? takeNodeKeyByTakeId.get(sequence.takes[sequence.takes.length - 1].id) ?? null
    : null
  if (endNodeKey && (lastTakeNodeKey || startNodeKey)) {
    nextEdges.push({
      id: 'edge-take-end',
      key: createUniqueEdgeKey(nextEdges, lastTakeNodeKey ?? startNodeKey!, endNodeKey),
      source: { nodeKey: lastTakeNodeKey ?? startNodeKey!, portId: 'out' },
      target: { nodeKey: endNodeKey, portId: 'in' },
      label: null,
      condition: null,
      metadata: {},
    })
  }

  return {
    ...graph,
    metadata: {
      ...(graph.metadata ?? {}),
      cinematicSequence: sequence,
      cinematicScript: scriptDoc,
    },
    nodes: [...preservedNodes, ...nextTakeNodes],
    edges: nextEdges,
  } satisfies GraphDefinition
}

export function normalizeCinematicGraphProjection(graph: GraphDefinition) {
  if (graph.graphType !== 'cinematic_flow') return graph
  const metadata = graph.metadata && typeof graph.metadata === 'object'
    ? graph.metadata as Record<string, unknown>
    : {}
  if (!('cinematicSequence' in metadata) && !('cinematicScript' in metadata)) return graph

  const nextGraph = projectSequenceToTakeOnlyGraph(graph, getCinematicSequence(graph.metadata))
  return JSON.stringify(nextGraph) === JSON.stringify(graph) ? graph : nextGraph
}

export function buildTakeFirstCinematicDocument(input: {
  graph?: GraphDefinition | null
  sequence: CinematicSequence
}) {
  const compiledSequence = compileCinematicSequence(input.sequence)
  const runtimeTakeById = new Map(input.sequence.takes.map((take) => [take.id, pickTakeRuntimeFields(take)] as const))
  const sequence = {
    ...compiledSequence,
    takes: compiledSequence.takes.map((take) => ({
      ...take,
      ...(runtimeTakeById.get(take.id) ?? {}),
    })),
  } satisfies CinematicSequence
  const takeNodeConfigByTakeId = readTakeNodeMetadata(input.graph)
  const shotById = new Map(sequence.shots.map((shot, index) => [shot.id, { shot, sequenceIndex: index }] as const))

  return {
    title: sequence.title,
    logline: sequence.logline,
    tone: sequence.tone,
    continuityNotes: sequence.continuityNotes,
    statusPayoffType: sequence.statusPayoffType,
    narrativeArcTemplate: sequence.narrativeArcTemplate,
    references: sequence.references,
    scenes: sequence.scenes,
    relationships: sequence.relationships,
    compositeRefs: sequence.compositeRefs,
    storyboard: sequence.storyboard,
    takes: sequence.takes.map((take, index) => {
      const runtimeTake = takeNodeConfigByTakeId.get(take.id)
      const shots = take.shotIds
        .map((shotId, takeShotIndex) => {
          const resolved = shotById.get(shotId)
          if (!resolved) return null
          const { shot, sequenceIndex } = resolved
          const { takeId: _takeId, takeIndex: _takeIndex, ...shotFields } = shot
          return {
            ...shotFields,
            sequenceIndex,
            takeShotIndex,
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      const tags = buildTakeTagBundle(shots)

      return {
        ...take,
        ...(runtimeTake ?? {}),
        orderIndex: index,
        summary: buildTakeSummary(shots),
        ...tags,
        shots,
      }
    }),
  }
}
