import {
  compileCinematicSequence,
  deriveCinematicScriptFromSequence,
  getCinematicSequence,
  getCinematicTakeNodeConfig,
  type CinematicSequence,
} from './cinematics.ts'
import type { GraphDefinition, NodeDefinition } from './graphcore.ts'
import { normalizeNode } from './nodeLibrary.ts'

const CINEMATIC_REF_X = 180
const CINEMATIC_REF_START_Y = 180
const CINEMATIC_REF_GAP_Y = 126
const CINEMATIC_START_X = 460
const CINEMATIC_TAKE_Y = 92
const CINEMATIC_START_WIDTH = 240
const CINEMATIC_TAKE_WIDTH = 420
const CINEMATIC_TAKE_GAP_X = 120
const CINEMATIC_TAKE_START_X = CINEMATIC_START_X + CINEMATIC_START_WIDTH + 150
const CINEMATIC_TAKE_STEP_X = CINEMATIC_TAKE_WIDTH + CINEMATIC_TAKE_GAP_X
const CINEMATIC_END_GAP_X = 260

const CINEMATIC_REF_NODE_TYPES = new Set(['asset_ref', 'composite_ref', 'storyboard_ref'])

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

function buildShortDeterministicId(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).slice(0, 6) || 'takeid'
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
    previewImageAssetKey: take.previewImageAssetKey ?? null,
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
        return [typeof config.takeIndex === 'number' ? `index:${config.takeIndex}` : `id:${config.id}`, config] as const
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

export function layoutCinematicTakeOnlyNodes(input: {
  nodes: GraphDefinition['nodes']
  sequence: CinematicSequence
  preserveTakePositions?: boolean
  preserveExistingPositions?: boolean
}) {
  const takePositionByIndex = new Map<number, { x: number; y: number }>()
  const existingNodeByKey = new Map(input.nodes.map((node) => [node.key, node] as const))
  let nextTakeX = CINEMATIC_TAKE_START_X

  for (const [index, take] of input.sequence.takes.entries()) {
    const takeNode = input.nodes.find((node) => {
      if (node.type !== 'cinematic_take') return false
      const config = getCinematicTakeNodeConfig(node)
      return (typeof config.takeIndex === 'number' ? config.takeIndex === index : config.id === take.id)
    }) ?? null
    const preservedPosition = (input.preserveExistingPositions || input.preserveTakePositions) && takeNode?.position
      ? { x: takeNode.position.x, y: input.preserveExistingPositions ? takeNode.position.y : CINEMATIC_TAKE_Y }
      : null
    const position = preservedPosition ?? { x: nextTakeX, y: CINEMATIC_TAKE_Y }
    takePositionByIndex.set(index, position)
    nextTakeX = Math.max(nextTakeX, position.x + CINEMATIC_TAKE_STEP_X)
  }

  const lastTakeIndex = input.sequence.takes.length - 1
  const lastTakePosition = lastTakeIndex >= 0 ? takePositionByIndex.get(lastTakeIndex) ?? null : null
  const endX = (lastTakePosition?.x ?? CINEMATIC_START_X) + CINEMATIC_TAKE_WIDTH + CINEMATIC_END_GAP_X

  const orderedRefNodes = input.nodes
    .filter((node) => CINEMATIC_REF_NODE_TYPES.has(node.type))
    .slice()
    .sort((left, right) => {
      const leftType = left.type
      const rightType = right.type
      if (leftType !== rightType) return leftType.localeCompare(rightType)
      return left.title.localeCompare(right.title)
    })

  const refIndexByKey = new Map(orderedRefNodes.map((node, index) => [node.key, index] as const))

  return input.nodes.map((node) => {
    if (CINEMATIC_REF_NODE_TYPES.has(node.type)) {
      if (input.preserveExistingPositions) {
        const existingNode = existingNodeByKey.get(node.key)
        if (existingNode?.position) return node
      }
      const index = refIndexByKey.get(node.key) ?? 0
      return {
        ...node,
        position: {
          x: CINEMATIC_REF_X,
          y: CINEMATIC_REF_START_Y + index * CINEMATIC_REF_GAP_Y,
        },
      }
    }

    if (node.type === 'start') {
      if (input.preserveExistingPositions) {
        const existingNode = existingNodeByKey.get(node.key)
        if (existingNode?.position) return node
      }
      return {
        ...node,
        position: { x: CINEMATIC_START_X, y: CINEMATIC_TAKE_Y },
      }
    }

    if (node.type === 'end') {
      if (input.preserveExistingPositions) {
        const existingNode = existingNodeByKey.get(node.key)
        if (existingNode?.position) return node
      }
      return {
        ...node,
        position: { x: endX, y: CINEMATIC_TAKE_Y },
      }
    }

    if (node.type === 'cinematic_take') {
      if (input.preserveExistingPositions) {
        const existingNode = existingNodeByKey.get(node.key)
        if (existingNode?.position) return node
      }
      const takeConfig = getCinematicTakeNodeConfig(node)
      const takeIndex = typeof takeConfig.takeIndex === 'number' ? takeConfig.takeIndex : null
      return {
        ...node,
        position: (takeIndex !== null ? takePositionByIndex.get(takeIndex) : null) ?? node.position,
      }
    }

    return node
  })
}

export function projectSequenceToTakeOnlyGraph(
  graph: GraphDefinition,
  sequenceInput: CinematicSequence,
) {
  const compiledSequence = compileCinematicSequence(sequenceInput)
  const runtimeTakeByIndex = new Map(sequenceInput.takes.map((take, index) => [index, pickTakeRuntimeFields(take)] as const))
  const sequence = {
    ...compiledSequence,
    takes: compiledSequence.takes.map((take, index) => ({
      ...take,
      ...(runtimeTakeByIndex.get(index) ?? {}),
    })),
  } satisfies CinematicSequence
  const scriptDoc = deriveCinematicScriptFromSequence(sequence)
  const existingTakeNodes = graph.nodes.filter((node) => node.type === 'cinematic_take')
  const existingTakeNodeByTakeId = new Map<string, NodeDefinition>()
  const existingTakeNodeByIndex = new Map<number, NodeDefinition>()

  existingTakeNodes.forEach((node, index) => {
    const config = getCinematicTakeNodeConfig(node)
    existingTakeNodeByTakeId.set(config.id, node)
    existingTakeNodeByIndex.set(typeof config.takeIndex === 'number' ? config.takeIndex : index, node)
  })

  const preservedNodes = graph.nodes.filter((node) => node.type !== 'cinematic_take' && node.type !== 'cinematic_shot')
  const usedKeys = new Set(preservedNodes.map((node) => node.key))
  const nextTakeNodes = sequence.takes.map((take, index) => {
    const existingNode = existingTakeNodeByIndex.get(index) ?? existingTakeNodeByTakeId.get(take.id) ?? null
    const takeKeySuffix = buildShortDeterministicId(`${graph.key}|${take.id}|${index}`)
    const baseKey = `${graph.key}.cinematic_take_${index + 1}_${takeKeySuffix}`
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
        imageAssetKey: existingNode?.body?.imageAssetKey ?? take.previewImageAssetKey ?? take.outputStillAssetKey ?? take.storyboardAssetKey ?? null,
      },
      position: deriveDefaultTakePosition(graph, take, index, existingNode),
      metadata: {
        ...(existingNode?.metadata ?? {}),
        ...take,
        takeId: take.id,
        takeIndex: index,
      },
      display: {
        ...(existingNode?.display ?? { iconAssetKey: null, compactPreview: false }),
        iconAssetKey: existingNode?.display?.iconAssetKey ?? take.previewImageAssetKey ?? take.outputStillAssetKey ?? take.storyboardAssetKey ?? null,
      },
    })
  })

  const takeNodeKeyByTakeIndex = new Map(nextTakeNodes.map((node) => {
    const config = getCinematicTakeNodeConfig(node)
    return [typeof config.takeIndex === 'number' ? config.takeIndex : 0, node.key] as const
  }))
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

  sequence.takes.forEach((_take, index) => {
    const takeNodeKey = takeNodeKeyByTakeIndex.get(index)
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
      const previousTakeNodeKey = takeNodeKeyByTakeIndex.get(index - 1)
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
    ? takeNodeKeyByTakeIndex.get(sequence.takes.length - 1) ?? null
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

  const laidOutNodes = layoutCinematicTakeOnlyNodes({
    nodes: [...preservedNodes, ...nextTakeNodes],
    sequence,
    preserveTakePositions: existingTakeNodes.length > 0 && !graph.nodes.some((node) => node.type === 'cinematic_shot'),
    preserveExistingPositions: existingTakeNodes.length > 0 && !graph.nodes.some((node) => node.type === 'cinematic_shot'),
  })

  return {
    ...graph,
    metadata: {
      ...(graph.metadata ?? {}),
      cinematicSequence: sequence,
      cinematicScript: scriptDoc,
    },
    nodes: laidOutNodes,
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
  const runtimeTakeByIndex = new Map(input.sequence.takes.map((take, index) => [index, pickTakeRuntimeFields(take)] as const))
  const sequence = {
    ...compiledSequence,
    takes: compiledSequence.takes.map((take, index) => ({
      ...take,
      ...(runtimeTakeByIndex.get(index) ?? {}),
    })),
  } satisfies CinematicSequence
  const takeNodeConfigByTakeIdentity = readTakeNodeMetadata(input.graph)
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
      const runtimeTake =
        takeNodeConfigByTakeIdentity.get(`index:${index}`)
        ?? takeNodeConfigByTakeIdentity.get(`id:${take.id}`)
        ?? null
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
