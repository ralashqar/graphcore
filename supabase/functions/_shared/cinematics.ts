import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  getCinematicFormulaFamilyLabel,
  getCinematicFormatSubtypeLabel,
  getCinematicPresetLabel,
  cinematicRunJobSchema,
  cinematicRunSchema,
  getAssetRefNodeConfig,
  getCinematicSequence,
  getCompositeRefNodeConfig,
  getCinematicTakeNodeConfig,
  getCinematicSettings,
  getCinematicShotNodeConfig,
  getStoryboardRefNodeConfig,
  updateNodeMetadataWithStoryboardRef,
  updateNodeMetadataWithTake,
  updateNodeMetadataWithShot,
  type SeedanceExecutionPlan,
  type CinematicRun,
  type CinematicRunJob,
} from '../../../src/domain/cinematics.ts'
import { buildAssetSlug } from '../../../src/domain/assets.ts'

type SnapshotRecord = Record<string, unknown>
type SnapshotGraph = SnapshotRecord & {
  key: string
  name: string
  entryNodeKey?: string | null
  nodes: SnapshotRecord[]
  edges: SnapshotRecord[]
}

type SnapshotNode = SnapshotRecord & {
  key: string
  type: string
  title: string
  body?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

type SnapshotAsset = SnapshotRecord & {
  key: string
  name: string
  kind: string
  mimeType?: string
  storagePath?: string
  metadata?: Record<string, unknown>
}

type SnapshotDefinition = SnapshotRecord & {
  key: string
  kind: string
  name: string
  iconAssetKey?: string | null
  components?: Array<{ type?: string; config?: Record<string, unknown> }>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function describePresetPromptStyle(presetFamily: ReturnType<typeof getCinematicSettings>['presetFamily']) {
  switch (presetFamily) {
    case 'story_movie_tv':
      return 'Use film or TV keyframe language with continuity, staging, and storyboard-level clarity.'
    case 'ugc_creator':
      return 'Use believable creator-shot language for a handheld, native short-form UGC frame. Keep the wording literal and visually direct.'
    case 'ugc_direct_response_ad':
      return 'Use direct-response ad language with a strong hook frame, visible product, and immediate proof. Show the product causing the better outcome.'
    case 'ugc_faceless_format':
      return 'Use faceless short-form language centered on objects, process, screens, or demo action. Keep the frame visually legible without relying on facial acting.'
  }
}

function describeSubtypePromptStyle(formatSubtype: ReturnType<typeof getCinematicSettings>['formatSubtype']) {
  switch (formatSubtype) {
    case 'creator_problem_solution':
      return 'Bias toward creator-native problem, use case, soft proof, and soft CTA. Avoid polished ad-slogan phrasing.'
    case 'creator_reframe':
      return 'Bias toward naming the viewer behavior, reframing it, and landing an emotional payoff through believable creator delivery.'
    case 'creator_validation':
      return 'Bias toward emotional recognition, reassurance, and low-pressure delivery instead of hard selling.'
    case 'ad_problem_solution':
      return 'Bias toward pain, product, proof, and direct response clarity with concrete visible evidence.'
    case 'ad_mechanism_proof':
      return 'Bias toward mechanism visibility, explicit demonstration, and readable proof. Make the function obvious on screen.'
    case 'ad_before_after':
      return 'Bias toward transformation framing with before, intervention, and after contrast that reads clearly on mute.'
    case 'ad_comparison':
      return 'Bias toward side-by-side or option-versus-option clarity with a clear winner and visible proof.'
    case 'faceless_demo':
      return 'Bias toward object, product, or workflow readability without relying on a face.'
    case 'faceless_explainer':
      return 'Bias toward wrong-belief hooks, explanation, mechanism, and clean visual reasoning.'
    case 'faceless_process':
      return 'Bias toward process progression, reveal, and satisfying payoff through visibly different stages.'
    case 'contrast_narrative':
      return 'Bias toward escalating two-pole contrast, status or transformation payoff, and loopable visual storytelling. Keep both poles readable and widen the gap each beat.'
    default:
      return null
  }
}

function subtypeLooksLikeAd(formatSubtype: ReturnType<typeof getCinematicSettings>['formatSubtype']) {
  return typeof formatSubtype === 'string' && (formatSubtype.startsWith('ad_') || formatSubtype === 'contrast_narrative')
}

export function extractFalVideoUrl(data: unknown) {
  const record = asRecord(data)
  const video = asRecord(record.video)
  const output = asRecord(record.output)
  const nestedVideo = asRecord(output.video)

  return asString(video.url)
    ?? asString(nestedVideo.url)
    ?? asString(record.video_url)
    ?? asString(record.url)
}

export function findGraph(snapshot: { graphs?: unknown[] }, graphKey: string) {
  const graphs = Array.isArray(snapshot.graphs) ? snapshot.graphs.map((graph) => asRecord(graph)) : []
  const graph = graphs.find((entry) => entry.key === graphKey)
  if (!graph) return null

  return {
    ...graph,
    key: String(graph.key),
    name: typeof graph.name === 'string' ? graph.name : String(graph.key),
    entryNodeKey: asString(graph.entryNodeKey),
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map((node) => asRecord(node)) : [],
    edges: Array.isArray(graph.edges) ? graph.edges.map((edge) => asRecord(edge)) : [],
  } as SnapshotGraph
}

export function findNode(graph: SnapshotGraph, nodeKey: string) {
  const node = graph.nodes.find((entry) => entry.key === nodeKey)
  if (!node) return null
  return {
    ...node,
    key: String(node.key),
    type: typeof node.type === 'string' ? node.type : 'text',
    title: typeof node.title === 'string' ? node.title : String(node.key),
    body: asRecord(node.body),
    metadata: asRecord(node.metadata),
  } as SnapshotNode
}

function isAssetDependencyEdge(graph: SnapshotGraph, edge: SnapshotRecord) {
  const sourcePort = asString(asRecord(edge.source).portId)
  const targetPort = asString(asRecord(edge.target).portId)
  const sourceNode = findNode(graph, String(asRecord(edge.source).nodeKey ?? ''))
  return sourcePort === 'asset_out' || targetPort === 'asset_in' || sourceNode?.type === 'asset_ref'
}

export function collectReachableShotNodeKeys(graph: SnapshotGraph) {
  const adjacency = new Map<string, string[]>()

  for (const edge of graph.edges) {
    if (isAssetDependencyEdge(graph, edge)) continue
    const sourceNodeKey = asString(asRecord(edge.source).nodeKey)
    const targetNodeKey = asString(asRecord(edge.target).nodeKey)
    if (!sourceNodeKey || !targetNodeKey) continue
    adjacency.set(sourceNodeKey, [...(adjacency.get(sourceNodeKey) ?? []), targetNodeKey])
  }

  const queue = graph.entryNodeKey ? [graph.entryNodeKey] : []
  const visited = new Set<string>()
  const shotNodeKeys: string[] = []

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || visited.has(current)) continue
    visited.add(current)
    const node = findNode(graph, current)
    if (node?.type === 'cinematic_shot') {
      shotNodeKeys.push(node.key)
    }
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        queue.push(next)
      }
    }
  }

  return shotNodeKeys
}

export function resolveDefinitionDisplayAssetKey(definition: SnapshotDefinition | null) {
  if (!definition) return null
  const components = Array.isArray(definition.components) ? definition.components : []

  for (const component of components) {
    if (!component || typeof component !== 'object') continue
    const type = asString((component as { type?: unknown }).type)
    const config = asRecord((component as { config?: unknown }).config)
    if ((type === 'render_3d_binding' || type === 'environment_render_binding' || type === 'world_render_binding') && asString(config.previewImageAssetKey)) {
      return asString(config.previewImageAssetKey)
    }
  }

  return asString(definition.iconAssetKey)
}

export function resolveAssetUrl(asset: SnapshotAsset | null | undefined) {
  if (!asset) return null
  const metadata = asRecord(asset.metadata)
  return asString(metadata.sourceUrl) ?? asString(metadata.previewUrl)
}

function resolveNodeAssetSnapshot(input: {
  sourceNode: SnapshotNode
  definitions: SnapshotDefinition[]
  assets: SnapshotAsset[]
}) {
  if (input.sourceNode.type === 'asset_ref') {
    const sourceConfig = getAssetRefNodeConfig(input.sourceNode)
    const definition = sourceConfig.definitionKey
      ? input.definitions.find((entry) => entry.key === sourceConfig.definitionKey) ?? null
      : null
    const previewAssetKey = sourceConfig.assetKey ?? resolveDefinitionDisplayAssetKey(definition)
    const asset = previewAssetKey ? input.assets.find((entry) => entry.key === previewAssetKey) ?? null : null
    return {
      definition,
      asset,
      config: sourceConfig,
      refId: sourceConfig.entityRefId,
      role: sourceConfig.assetRole ?? sourceConfig.role,
      priority: sourceConfig.priority,
      label: definition?.name ?? sourceConfig.definitionKey ?? sourceConfig.assetKey ?? input.sourceNode.title,
    }
  }

  if (input.sourceNode.type === 'composite_ref') {
    const sourceConfig = getCompositeRefNodeConfig(input.sourceNode)
    const asset = sourceConfig.outputAssetKey
      ? input.assets.find((entry) => entry.key === sourceConfig.outputAssetKey) ?? null
      : null
    return {
      definition: null,
      asset,
      config: sourceConfig,
      refId: sourceConfig.compositeRefId,
      role: 'composite',
      priority: sourceConfig.priority,
      label: sourceConfig.title || input.sourceNode.title,
    }
  }

  if (input.sourceNode.type === 'storyboard_ref') {
    const sourceConfig = getStoryboardRefNodeConfig(input.sourceNode)
    const asset = sourceConfig.assetKey
      ? input.assets.find((entry) => entry.key === sourceConfig.assetKey) ?? null
      : null
    return {
      definition: null,
      asset,
      config: sourceConfig,
      refId: sourceConfig.panelId ?? sourceConfig.storyboardId,
      role: 'storyboard',
      priority: sourceConfig.priority,
      label: input.sourceNode.title,
    }
  }

  return null
}

function resolveRefIdForNode(node: SnapshotNode) {
  if (node.type === 'asset_ref') return getAssetRefNodeConfig(node).entityRefId
  if (node.type === 'composite_ref') return getCompositeRefNodeConfig(node).compositeRefId
  if (node.type === 'storyboard_ref') {
    const config = getStoryboardRefNodeConfig(node)
    return config.panelId ?? config.storyboardId
  }
  return null
}

function buildResolvedSourceEntries(input: {
  snapshot: { definitions?: unknown[]; assets?: unknown[] }
  graph: SnapshotGraph
  refIds: string[]
}) {
  const definitions = Array.isArray(input.snapshot.definitions) ? input.snapshot.definitions.map((entry) => asRecord(entry) as SnapshotDefinition) : []
  const assets = Array.isArray(input.snapshot.assets) ? input.snapshot.assets.map((entry) => asRecord(entry) as SnapshotAsset) : []
  const sourceNodeByRefId = new Map<string, SnapshotNode>()
  for (const rawNode of input.graph.nodes) {
    const node = findNode(input.graph, String(rawNode.key ?? ''))
    if (!node || !['asset_ref', 'composite_ref', 'storyboard_ref'].includes(node.type)) continue
    const refId = resolveRefIdForNode(node)
    if (!refId) continue
    sourceNodeByRefId.set(refId, node)
  }

  return input.refIds
    .map((refId) => {
      const sourceNode = sourceNodeByRefId.get(refId) ?? null
      if (!sourceNode) return null
      const resolved = resolveNodeAssetSnapshot({ sourceNode, definitions, assets })
      if (!resolved) return null
      const assetUrl = resolveAssetUrl(resolved.asset)
      const modality =
        resolved.asset?.kind === 'video'
          ? 'video'
          : resolved.asset?.kind === 'audio'
            ? 'audio'
            : 'image'
      return {
        node: sourceNode,
        definition: resolved.definition,
        asset: resolved.asset,
        imageUrl: modality === 'image' ? assetUrl : null,
        assetUrl,
        modality,
        config: resolved.config,
        refId: resolved.refId,
        role: resolved.role,
        priority: resolved.priority,
        label: resolved.label,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

export function resolveShotSources(snapshot: { definitions?: unknown[]; assets?: unknown[] }, graph: SnapshotGraph, shotNodeKey: string) {
  const edgeSources = graph.edges
    .filter((edge) => asString(asRecord(edge.target).nodeKey) === shotNodeKey)
    .filter((edge) => isAssetDependencyEdge(graph, edge))
    .map((edge) => {
      const definitions = Array.isArray(snapshot.definitions) ? snapshot.definitions.map((entry) => asRecord(entry) as SnapshotDefinition) : []
      const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map((entry) => asRecord(entry) as SnapshotAsset) : []
      const sourceNode = findNode(graph, String(asRecord(edge.source).nodeKey ?? ''))
      if (!sourceNode || !['asset_ref', 'composite_ref', 'storyboard_ref'].includes(sourceNode.type)) return null
      const resolved = resolveNodeAssetSnapshot({
        sourceNode,
        definitions,
        assets,
      })
      if (!resolved) return null
      const assetUrl = resolveAssetUrl(resolved.asset)
      const modality =
        resolved.asset?.kind === 'video'
          ? 'video'
          : resolved.asset?.kind === 'audio'
            ? 'audio'
            : 'image'
      return {
        node: sourceNode,
        definition: resolved.definition,
        asset: resolved.asset,
        imageUrl: modality === 'image' ? assetUrl : null,
        assetUrl,
        modality,
        config: resolved.config,
        refId: resolved.refId,
        role: resolved.role,
        priority: resolved.priority,
        label: resolved.label,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  if (edgeSources.length > 0) return edgeSources

  const shotNode = findNode(graph, shotNodeKey)
  if (!shotNode) return []
  const shot = getCinematicShotNodeConfig(shotNode)
  const refIds = Array.from(new Set(
    shot.requiredSourceRefIds.length > 0
      ? shot.requiredSourceRefIds
      : [
          ...shot.storyboardRefIds,
          ...shot.compositeRefIds,
          ...shot.participantRefIds,
          shot.locationRefId,
          ...shot.propRefIds,
        ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
  ))
  return buildResolvedSourceEntries({ snapshot, graph, refIds })
}

export function resolveTakeSources(snapshot: { definitions?: unknown[]; assets?: unknown[] }, graph: SnapshotGraph, takeNodeKey: string) {
  const takeNode = findNode(graph, takeNodeKey)
  if (!takeNode) return []
  const take = getCinematicTakeNodeConfig(takeNode)
  return buildResolvedSourceEntries({
    snapshot,
    graph,
    refIds: take.requiredSourceRefIds,
  })
}

function resolveStoryboardTargetShots(graph: SnapshotGraph, storyboardNodeKey: string) {
  const storyboardNode = findNode(graph, storyboardNodeKey)
  if (!storyboardNode) return []
  const config = getStoryboardRefNodeConfig(storyboardNode)
  const sequence = getCinematicSequence(graph.metadata)
  const directPanelShotId =
    config.panelId
      ? sequence.storyboard?.panels.find((panel) => panel.id === config.panelId)?.shotId ?? null
      : null
  const referencedShotIds = sequence.shots
    .filter((shot) => {
      const targetRefId = config.panelId ?? config.storyboardId
      if (!targetRefId) return false
      return shot.storyboardRefIds.includes(targetRefId)
    })
    .map((shot) => shot.id)
  const shotIds = Array.from(new Set(
    config.storyboardKind === 'sequence_board'
      ? sequence.shots.slice(0, 6).map((shot) => shot.id)
      : [
          ...(config.shotId ? [config.shotId] : []),
          ...(directPanelShotId ? [directPanelShotId] : []),
          ...referencedShotIds,
        ],
  ))

  return shotIds
    .map((shotId) => sequence.shots.find((shot) => shot.id === shotId) ?? null)
    .filter((shot): shot is typeof sequence.shots[number] => Boolean(shot))
}

export function resolveStoryboardSources(snapshot: { definitions?: unknown[]; assets?: unknown[] }, graph: SnapshotGraph, storyboardNodeKey: string) {
  const storyboardNode = findNode(graph, storyboardNodeKey)
  if (!storyboardNode) return []
  const config = getStoryboardRefNodeConfig(storyboardNode)
  const directEdgeSources = graph.edges
    .filter((edge) => asString(asRecord(edge.target).nodeKey) === storyboardNodeKey)
    .filter((edge) => isAssetDependencyEdge(graph, edge))
    .map((edge) => {
      const definitions = Array.isArray(snapshot.definitions) ? snapshot.definitions.map((entry) => asRecord(entry) as SnapshotDefinition) : []
      const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map((entry) => asRecord(entry) as SnapshotAsset) : []
      const sourceNode = findNode(graph, String(asRecord(edge.source).nodeKey ?? ''))
      if (!sourceNode || !['asset_ref', 'composite_ref', 'storyboard_ref'].includes(sourceNode.type)) return null
      const resolved = resolveNodeAssetSnapshot({
        sourceNode,
        definitions,
        assets,
      })
      if (!resolved) return null
      const assetUrl = resolveAssetUrl(resolved.asset)
      const modality =
        resolved.asset?.kind === 'video'
          ? 'video'
          : resolved.asset?.kind === 'audio'
            ? 'audio'
            : 'image'
      return {
        node: sourceNode,
        definition: resolved.definition,
        asset: resolved.asset,
        imageUrl: modality === 'image' ? assetUrl : null,
        assetUrl,
        modality,
        config: resolved.config,
        refId: resolved.refId,
        role: resolved.role,
        priority: resolved.priority,
        label: resolved.label,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  const shots = resolveStoryboardTargetShots(graph, storyboardNodeKey)
  const targetStoryboardRefId = config.panelId ?? config.storyboardId
  const refIds = Array.from(new Set(
    shots.flatMap((shot) => (
      shot.requiredSourceRefIds.length > 0
        ? shot.requiredSourceRefIds
        : [
            ...shot.participantRefIds,
            ...(shot.locationRefId ? [shot.locationRefId] : []),
            ...shot.propRefIds,
            ...shot.compositeRefIds,
          ]
    )),
  )).filter((refId) => refId !== targetStoryboardRefId)

  const resolvedEntries = buildResolvedSourceEntries({
    snapshot,
    graph,
    refIds,
  })
  const merged = [...directEdgeSources]
  for (const entry of resolvedEntries) {
    if (merged.some((candidate) => (candidate.refId ?? candidate.node.key) === (entry.refId ?? entry.node.key))) continue
    merged.push(entry)
  }
  return merged
}

export function resolveTakeStillReferenceImageUrls(
  snapshot: { assets?: unknown[] },
  graph: SnapshotGraph,
  takeNodeKey: string,
  sourceInputs: ReturnType<typeof resolveTakeSources>,
) {
  const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map((entry) => asRecord(entry) as SnapshotAsset) : []
  const takeNode = findNode(graph, takeNodeKey)
  if (!takeNode) return sourceInputs.map((entry) => entry.imageUrl).filter((entry): entry is string => Boolean(entry))
  const take = getCinematicTakeNodeConfig(takeNode)
  const sequence = getCinematicSequence(graph.metadata)
  const firstShot = take.shotIds
    .map((shotId) => sequence.shots.find((entry) => entry.id === shotId) ?? null)
    .find((entry) => Boolean(entry)) ?? null
  const firstShotStillUrl = firstShot?.stillAssetKey
    ? resolveAssetUrl(assets.find((asset) => asset.key === firstShot.stillAssetKey) ?? null)
    : null

  return Array.from(new Set([
    ...sourceInputs.map((entry) => entry.imageUrl).filter((entry): entry is string => Boolean(entry)),
    ...(firstShotStillUrl ? [firstShotStillUrl] : []),
  ]))
}

export function resolveStoryboardStillReferenceImageUrls(
  snapshot: { assets?: unknown[] },
  graph: SnapshotGraph,
  storyboardNodeKey: string,
  sourceInputs: ReturnType<typeof resolveStoryboardSources>,
) {
  const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map((entry) => asRecord(entry) as SnapshotAsset) : []
  const shotStillUrls = resolveStoryboardTargetShots(graph, storyboardNodeKey)
    .map((shot) => shot.stillAssetKey ? resolveAssetUrl(assets.find((asset) => asset.key === shot.stillAssetKey) ?? null) : null)
    .filter((entry): entry is string => Boolean(entry))

  return Array.from(new Set([
    ...sourceInputs.map((entry) => entry.imageUrl).filter((entry): entry is string => Boolean(entry)),
    ...shotStillUrls,
  ]))
}

export function buildSeedanceExecutionPlan(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  shotNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveShotSources>
}): SeedanceExecutionPlan {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const shot = getCinematicShotNodeConfig(input.shotNode)
  const sortedInputs = [...input.sourceInputs]
    .filter((entry) => Boolean(entry.assetUrl))
    .sort((left, right) => right.priority - left.priority)

  const endpoint =
    shot.seedanceModePreference === 'image-to-video'
      ? 'image-to-video'
      : shot.seedanceModePreference === 'reference-to-video'
        ? 'reference-to-video'
        : sortedInputs.length <= 1 && sortedInputs.every((entry) => entry.modality === 'image')
          ? 'image-to-video'
          : 'reference-to-video'

  const referenceInputs = sortedInputs.map((entry, index) => ({
    id: `${entry.refId ?? entry.node.key}_${index}`,
    sourceRefId: entry.refId ?? null,
    nodeKey: entry.node.key,
    label: entry.label,
    modality: entry.modality,
    url: entry.assetUrl ?? '',
    priority: entry.priority,
    truncated: index >= 12,
  }))

  const keptReferenceInputs = referenceInputs.filter((entry, index) => !entry.truncated && index < 12)
  const droppedRefIds = referenceInputs.filter((entry) => entry.truncated).map((entry) => entry.sourceRefId ?? entry.id)

  const promptLines = [
    `Shot: ${input.shotNode.title}.`,
    input.shotNode.body?.text ? `Action: ${String(input.shotNode.body.text).trim()}.` : null,
    shot.visualPrompt.trim() ? `Visual direction: ${shot.visualPrompt.trim()}.` : null,
    shot.compositionGuide.trim() ? `Composition: ${shot.compositionGuide.trim()}.` : null,
    shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
    shot.cameraAngle.trim() ? `Camera angle: ${shot.cameraAngle.trim()}.` : null,
    shot.cameraMovement.trim() ? `Camera movement: ${shot.cameraMovement.trim()}.` : null,
    shot.lensPreference.trim() ? `Lens: ${shot.lensPreference.trim()}.` : null,
    ...shot.dialogue.map((entry) => `Dialogue: ${entry.line}${entry.delivery ? ` (${entry.delivery})` : ''}.`),
  ].filter((entry): entry is string => Boolean(entry))

  const referenceDirectives = keptReferenceInputs.map((entry, index) => {
    const tag = entry.modality === 'image' ? `@Image${index + 1}` : entry.modality === 'video' ? `@Video${index + 1}` : `@Audio${index + 1}`
    return `${tag} is ${entry.label}.`
  })

  const prompt = [
    `Shot 1: ${promptLines.join(' ')}`,
    ...referenceDirectives,
    'Keep one primary action and one primary camera move. Preserve subject continuity across all references.',
  ].join(' ')

  const imageInputs = keptReferenceInputs.filter((entry) => entry.modality === 'image')
  const videoInputs = keptReferenceInputs.filter((entry) => entry.modality === 'video')
  const audioInputs = keptReferenceInputs.filter((entry) => entry.modality === 'audio')

  return {
    endpoint,
    modeReason:
      endpoint === 'image-to-video'
        ? 'Single strong image reference or explicit image-to-video preference.'
        : 'Multiple references, storyboard references, or non-image modalities require reference-to-video.',
    prompt,
    resolution: settings.videoResolution === '480p' ? '480p' : '720p',
    duration: `${Math.min(15, Math.max(4, shot.durationSeconds ?? settings.defaultClipSeconds))}` as SeedanceExecutionPlan['duration'],
    aspectRatio: settings.stillAspectRatio,
    generateAudio: shot.audio.length > 0 || shot.dialogue.length > 0,
    seed: null,
    imageUrl: endpoint === 'image-to-video' ? (imageInputs[0]?.url ?? null) : null,
    endImageUrl: endpoint === 'image-to-video' && imageInputs.length > 1 ? imageInputs[1]?.url ?? null : null,
    imageUrls: imageInputs.map((entry) => entry.url),
    videoUrls: videoInputs.map((entry) => entry.url),
    audioUrls: audioInputs.map((entry) => entry.url),
    referenceInputs: keptReferenceInputs,
    droppedRefIds,
  }
}

export function buildTakeSeedanceExecutionPlan(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  takeNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveTakeSources>
}) {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const take = getCinematicTakeNodeConfig(input.takeNode)
  const sequence = getCinematicSequence(input.graph.metadata)
  const shots = take.shotIds
    .map((shotId) => sequence.shots.find((entry) => entry.id === shotId) ?? null)
    .filter((entry): entry is typeof sequence.shots[number] => Boolean(entry))
  const sortedInputs = [...input.sourceInputs]
    .filter((entry) => Boolean(entry.assetUrl))
    .sort((left, right) => right.priority - left.priority)
  const endpoint =
    take.seedanceEndpoint === 'image-to-video'
      ? 'image-to-video'
      : sortedInputs.length <= 1 && sortedInputs.every((entry) => entry.modality === 'image')
        ? 'image-to-video'
        : 'reference-to-video'
  const referenceInputs = sortedInputs.map((entry, index) => ({
    id: `${entry.refId ?? entry.node.key}_${index}`,
    sourceRefId: entry.refId ?? null,
    nodeKey: entry.node.key,
    label: entry.label,
    modality: entry.modality,
    url: entry.assetUrl ?? '',
    priority: entry.priority,
    truncated: index >= 12,
  }))
  const keptReferenceInputs = referenceInputs.filter((entry, index) => !entry.truncated && index < 12)
  const droppedRefIds = referenceInputs.filter((entry) => entry.truncated).map((entry) => entry.sourceRefId ?? entry.id)
  const prompt = buildSeedanceTakePrompt({
    projectSummary: input.snapshot.project.summary,
    take,
    takeTitle: input.takeNode.title,
    presetFamily: settings.presetFamily,
    shots,
    keptReferenceInputs,
  })
  const imageInputs = keptReferenceInputs.filter((entry) => entry.modality === 'image')
  const videoInputs = keptReferenceInputs.filter((entry) => entry.modality === 'video')
  const audioInputs = keptReferenceInputs.filter((entry) => entry.modality === 'audio')

  return {
    endpoint,
    modeReason:
      endpoint === 'image-to-video'
        ? 'Single take can be driven from a single primary image reference.'
        : 'Multi-shot continuity or multiple refs require reference-to-video.',
    prompt,
    resolution: settings.videoResolution === '480p' ? '480p' : '720p',
    duration: `${Math.min(15, Math.max(4, take.durationSeconds))}` as SeedanceExecutionPlan['duration'],
    aspectRatio: settings.stillAspectRatio,
    generateAudio: shots.some((shot) => shot.audio.length > 0 || shot.dialogue.length > 0),
    seed: null,
    imageUrl: endpoint === 'image-to-video' ? (imageInputs[0]?.url ?? null) : null,
    endImageUrl: endpoint === 'image-to-video' && imageInputs.length > 1 ? imageInputs[1]?.url ?? null : null,
    imageUrls: imageInputs.map((entry) => entry.url),
    videoUrls: videoInputs.map((entry) => entry.url),
    audioUrls: audioInputs.map((entry) => entry.url),
    referenceInputs: keptReferenceInputs,
    droppedRefIds,
  } satisfies SeedanceExecutionPlan
}

function buildSeedanceTakePrompt(input: {
  projectSummary: string
  take: ReturnType<typeof getCinematicTakeNodeConfig>
  takeTitle: string
  presetFamily: ReturnType<typeof getCinematicSettings>['presetFamily']
  shots: ReturnType<typeof getCinematicSequence>['shots']
  keptReferenceInputs: Array<{
    label: string
    modality: 'image' | 'video' | 'audio'
    sourceRefId: string | null
  }>
}) {
  const continuityAnchors = input.keptReferenceInputs.slice(0, 5).map((entry) => entry.label)
  const arcSummary =
    input.shots.length === 0
      ? null
      : input.shots.length === 1
        ? input.shots[0].beat.trim() || input.shots[0].title
        : `${input.shots[0].title} builds through ${input.shots.slice(1, -1).map((shot) => shot.title).join(', ') || 'the middle beats'} and lands on ${input.shots[input.shots.length - 1].title}.`
  const beatLines = input.shots.map((shot, index) => [
    `Beat ${index + 1}: ${shot.title}.`,
    `Segment duration: ${shot.durationSeconds}s.`,
    shot.hookRole ? `Role: ${shot.hookRole}.` : null,
    shot.targetEmotion.trim() ? `Target emotion: ${shot.targetEmotion.trim()}.` : null,
    shot.personaStyle.trim() ? `Persona or delivery: ${shot.personaStyle.trim()}.` : null,
    shot.beat.trim() ? `On-screen action: ${shot.beat.trim()}.` : null,
    shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
    shot.cameraMovement.trim() ? `Primary camera move: ${shot.cameraMovement.trim()}.` : null,
    shot.proofType.trim() ? `Proof cue: ${shot.proofType.trim()}.` : null,
    shot.ctaType.trim() ? `CTA style: ${shot.ctaType.trim()}.` : null,
    ...shot.dialogue.map((entry) => `Dialogue: ${entry.line}${entry.delivery ? ` (${entry.delivery})` : ''}.`),
  ].filter((entry): entry is string => Boolean(entry)).join(' '))
  const presetDirectives =
    input.presetFamily === 'story_movie_tv'
      ? [
          'Treat this as one continuous cinematic take for film or TV.',
          'Prioritize continuity, motivated camera movement, and readable spatial progression.',
        ]
      : input.presetFamily === 'ugc_direct_response_ad'
        ? [
            'Treat this as a short-form direct-response ad take.',
            'Surface product, proof, and emotional payoff early while keeping the motion native and believable.',
          ]
        : input.presetFamily === 'ugc_faceless_format'
          ? [
              'Treat this as a faceless short-form take focused on process, object, or screen-led storytelling.',
              'Keep readability high for a mobile viewer and avoid dependence on facial acting.',
            ]
          : [
              'Treat this as a creator-native UGC take.',
              'Keep the framing and pacing believable for a handheld or creator-shot short-form video.',
            ]
  const subtypeLabel = input.take.formatSubtype ? getCinematicFormatSubtypeLabel(input.take.formatSubtype) : null
  const formulaLabel = input.take.formulaFamily ? getCinematicFormulaFamilyLabel(input.take.formulaFamily) : null
  const subtypeStyle = describeSubtypePromptStyle(input.take.formatSubtype ?? null)
  const referenceDirectives = input.keptReferenceInputs.map((entry, index) => {
    const tag = entry.modality === 'image' ? `@Image${index + 1}` : entry.modality === 'video' ? `@Video${index + 1}` : `@Audio${index + 1}`
    return `${tag} is ${entry.label}.`
  })

  return [
    `Create one continuous ${input.take.durationSeconds}-second video take titled "${input.takeTitle}".`,
    input.projectSummary.trim() ? `Project context: ${input.projectSummary.trim()}.` : null,
    `Preset family: ${getCinematicPresetLabel(input.presetFamily)}.`,
    subtypeLabel ? `Format subtype: ${subtypeLabel}.` : null,
    formulaLabel ? `Planned script formula: ${formulaLabel}.` : null,
    input.take.dominantTrigger ? `Dominant trigger: ${input.take.dominantTrigger.replace(/_/g, ' ')}.` : null,
    input.take.contrastAxis.trim() ? `Contrast axis: ${input.take.contrastAxis.trim()}.` : null,
    input.take.proofMoment.trim() ? `Proof moment: ${input.take.proofMoment.trim()}.` : null,
    input.take.ctaStyle.trim() ? `CTA style: ${input.take.ctaStyle.trim()}.` : null,
    ...presetDirectives,
    subtypeStyle,
    arcSummary ? `Overall arc: ${arcSummary}` : null,
    'Write motion and staging literally. Avoid metaphor, slogan copy, or polished ad-agency phrasing.',
    'Make each beat readable on mute from the visuals alone.',
    continuityAnchors.length > 0 ? `Lock continuity for these anchors across the whole take: ${continuityAnchors.join(', ')}.` : null,
    ...beatLines,
    ...referenceDirectives,
    'Use one dominant action arc and one primary camera path across the take.',
    input.take.formatSubtype === 'contrast_narrative'
      ? 'Keep both poles visible and readable whenever possible, and make the last beat the strongest winner or payoff image.'
      : null,
    subtypeLooksLikeAd(input.take.formatSubtype ?? null)
      ? 'Show the product or mechanism doing its job on screen and make proof legible early.'
      : null,
    'Preserve identity, wardrobe, product, and environment continuity across all beats and references.',
    'Do not introduce extra characters, props, cuts, captions, logos, or unrelated action.',
  ].filter((entry): entry is string => Boolean(entry)).join(' ')
}

export function buildStillPrompt(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  shotNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveShotSources>
}) {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const shot = getCinematicShotNodeConfig(input.shotNode)
  const sourceDescriptions = input.sourceInputs.map((entry) => {
    const role = entry.config.assetRole ?? entry.definition?.kind ?? 'source'
    const definitionName = entry.definition?.name ?? entry.config.definitionKey ?? entry.node.title
    const staging = entry.config.stagingNotes.trim()
    return staging
      ? `${role}: ${definitionName}. Staging notes: ${staging}.`
      : `${role}: ${definitionName}.`
  })

  return [
    `Create a cinematic keyframe still for the project "${input.snapshot.project.name}".`,
    input.snapshot.project.summary.trim() ? `Project context: ${input.snapshot.project.summary.trim()}.` : null,
    `Preset family: ${getCinematicPresetLabel(settings.presetFamily)}.`,
    settings.formatSubtype ? `Format subtype: ${getCinematicFormatSubtypeLabel(settings.formatSubtype)}.` : null,
    settings.formulaFamily ? `Planned script formula: ${getCinematicFormulaFamilyLabel(settings.formulaFamily)}.` : null,
    settings.dominantTrigger ? `Dominant trigger: ${settings.dominantTrigger.replace(/_/g, ' ')}.` : null,
    describePresetPromptStyle(settings.presetFamily),
    describeSubtypePromptStyle(shot.formatSubtype ?? settings.formatSubtype ?? null),
    `Target aspect ratio: ${settings.stillAspectRatio}.`,
    `Target still resolution: ${settings.stillResolution}.`,
    `Shot title: ${input.shotNode.title}.`,
    shot.shotType !== 'custom' ? `Shot type: ${shot.shotType}.` : null,
    shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
    shot.cameraAngle.trim() ? `Camera angle: ${shot.cameraAngle.trim()}.` : null,
    shot.cameraMovement.trim() ? `Camera movement intent: ${shot.cameraMovement.trim()}.` : null,
    shot.lensPreference.trim() ? `Lens preference: ${shot.lensPreference.trim()}.` : null,
    shot.formatSubtype ? `Shot subtype: ${getCinematicFormatSubtypeLabel(shot.formatSubtype)}.` : null,
    shot.formulaFamily ? `Shot formula: ${getCinematicFormulaFamilyLabel(shot.formulaFamily)}.` : null,
    shot.dominantTrigger ? `Shot trigger: ${shot.dominantTrigger.replace(/_/g, ' ')}.` : null,
    shot.contrastAxis.trim() ? `Contrast axis: ${shot.contrastAxis.trim()}.` : null,
    shot.proofMoment.trim() ? `Proof moment: ${shot.proofMoment.trim()}.` : null,
    shot.ctaStyle.trim() ? `CTA style: ${shot.ctaStyle.trim()}.` : null,
    input.shotNode.body?.text ? `Script beat: ${String(input.shotNode.body.text).trim()}.` : null,
    shot.visualPrompt.trim() ? `Additional visual direction: ${shot.visualPrompt.trim()}.` : null,
    shot.compositionGuide.trim() ? `Composition guide: ${shot.compositionGuide.trim()}.` : null,
    ...sourceDescriptions,
    'Use literal visual staging and readable proof. Avoid poetic metaphor or polished ad copy.',
    subtypeLooksLikeAd(shot.formatSubtype ?? settings.formatSubtype ?? null)
      ? 'If the product is present, show it doing its job with visible proof instead of acting like a passive prop.'
      : null,
    shot.formatSubtype === 'contrast_narrative'
      ? 'Keep both poles readable in the frame and make the stronger winner state immediately obvious.'
      : null,
    'Compose all supplied sources into one coherent scene with consistent scale, lighting, staging, and continuity.',
    'No subtitles, logos, watermarks, borders, split panels, or collage layout.',
  ].filter(Boolean).join(' ')
}

export function buildTakeStillPrompt(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  takeNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveTakeSources>
}) {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const take = getCinematicTakeNodeConfig(input.takeNode)
  const sequence = getCinematicSequence(input.graph.metadata)
  const takeShots = take.shotIds
    .map((shotId) => sequence.shots.find((entry) => entry.id === shotId) ?? null)
    .filter((entry): entry is typeof sequence.shots[number] => Boolean(entry))

  return [
    `Create one representative still frame for the cinematic take "${input.takeNode.title}" in "${input.snapshot.project.name}".`,
    input.snapshot.project.summary.trim() ? `Project context: ${input.snapshot.project.summary.trim()}.` : null,
    `Preset family: ${getCinematicPresetLabel(settings.presetFamily)}.`,
    take.formatSubtype ? `Format subtype: ${getCinematicFormatSubtypeLabel(take.formatSubtype)}.` : null,
    take.formulaFamily ? `Planned script formula: ${getCinematicFormulaFamilyLabel(take.formulaFamily)}.` : null,
    take.dominantTrigger ? `Dominant trigger: ${take.dominantTrigger.replace(/_/g, ' ')}.` : null,
    describePresetPromptStyle(settings.presetFamily),
    describeSubtypePromptStyle(take.formatSubtype ?? settings.formatSubtype ?? null),
    `Target aspect ratio: ${settings.stillAspectRatio}.`,
    `Target still resolution: ${settings.stillResolution}.`,
    take.contrastAxis.trim() ? `Contrast axis: ${take.contrastAxis.trim()}.` : null,
    take.proofMoment.trim() ? `Proof moment: ${take.proofMoment.trim()}.` : null,
    take.ctaStyle.trim() ? `CTA style: ${take.ctaStyle.trim()}.` : null,
    ...takeShots.map((shot, index) => [
      `Take shot ${index + 1}: ${shot.title}.`,
      shot.beat.trim() ? `Beat: ${shot.beat.trim()}.` : null,
      shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
      shot.cameraMovement.trim() ? `Movement: ${shot.cameraMovement.trim()}.` : null,
      shot.visualPrompt.trim() ? `Visual direction: ${shot.visualPrompt.trim()}.` : null,
    ].filter(Boolean).join(' ')),
    ...input.sourceInputs.map((entry) => `${entry.role ?? 'source'}: ${entry.definition?.name ?? entry.node.title}.`),
    'Use literal visual phrasing and visible proof instead of polished ad copy or metaphor.',
    settings.presetFamily === 'story_movie_tv'
      ? 'Choose the strongest storyboard-like keyframe that communicates the take with clear cinematic continuity.'
      : settings.presetFamily === 'ugc_direct_response_ad'
        ? 'Choose the strongest hook or proof frame with readable product visibility, clear mechanism, and immediate clarity.'
        : settings.presetFamily === 'ugc_faceless_format'
          ? 'Choose the cleanest object, demo, or process frame with strong readability for short-form viewing.'
          : 'Choose a believable creator-native frame that feels captured inside a short-form UGC video.',
    take.formatSubtype === 'contrast_narrative'
      ? 'Keep both poles legible and choose the frame where the gap or winner state is most obvious.'
      : null,
    'No subtitles, logos, watermarks, borders, split panels, or collage layout.',
  ].filter(Boolean).join(' ')
}

export function buildStoryboardStillPrompt(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  storyboardNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveStoryboardSources>
}) {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const config = getStoryboardRefNodeConfig(input.storyboardNode)
  const shots = resolveStoryboardTargetShots(input.graph, input.storyboardNode.key)
  const sourceDescriptions = input.sourceInputs.map((entry) => `${entry.role ?? 'source'}: ${entry.definition?.name ?? entry.node.title}.`)

  if (config.storyboardKind === 'sequence_board') {
    return [
    `Create a cinematic storyboard sequence board for "${input.storyboardNode.title}" in "${input.snapshot.project.name}".`,
    input.snapshot.project.summary.trim() ? `Project context: ${input.snapshot.project.summary.trim()}.` : null,
    `Preset family: ${getCinematicPresetLabel(settings.presetFamily)}.`,
    settings.formatSubtype ? `Format subtype: ${getCinematicFormatSubtypeLabel(settings.formatSubtype)}.` : null,
    'Render this as a readable storyboard sheet with multiple ordered panels that clearly progress through the action.',
      'Use strong silhouette, clean panel composition, consistent character likeness, readable staging, and simple environment blocking.',
      'Favor grayscale storyboard aesthetics or restrained monochrome marker rendering over polished final-frame concept art.',
      ...shots.slice(0, 6).map((shot, index) => [
        `Panel ${index + 1}: ${shot.title}.`,
        shot.beat.trim() ? `Beat: ${shot.beat.trim()}.` : null,
        shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
      ].filter(Boolean).join(' ')),
      config.notes.trim() ? `Storyboard notes: ${config.notes.trim()}.` : null,
      config.generationPrompt.trim() ? `Additional direction: ${config.generationPrompt.trim()}.` : null,
      ...sourceDescriptions,
      'No watermarks or decorative mockup chrome. Keep the panels clean and production-usable.',
    ].filter(Boolean).join(' ')
  }

  const primaryShot = shots[0] ?? null
  return [
    `Create one storyboard panel for "${input.storyboardNode.title}" in "${input.snapshot.project.name}".`,
    input.snapshot.project.summary.trim() ? `Project context: ${input.snapshot.project.summary.trim()}.` : null,
    `Preset family: ${getCinematicPresetLabel(settings.presetFamily)}.`,
    settings.formatSubtype ? `Format subtype: ${getCinematicFormatSubtypeLabel(settings.formatSubtype)}.` : null,
    'Render this as a single production-style storyboard panel with clear blocking, silhouette, and readable composition.',
    primaryShot?.title ? `Shot: ${primaryShot.title}.` : null,
    primaryShot?.beat.trim() ? `Beat: ${primaryShot.beat.trim()}.` : null,
    primaryShot?.framing.trim() ? `Framing: ${primaryShot.framing.trim()}.` : null,
    primaryShot?.cameraAngle.trim() ? `Camera angle: ${primaryShot.cameraAngle.trim()}.` : null,
    config.notes.trim() ? `Storyboard notes: ${config.notes.trim()}.` : null,
    config.generationPrompt.trim() ? `Additional direction: ${config.generationPrompt.trim()}.` : null,
    ...sourceDescriptions,
    'Use a storyboard look rather than a polished final cinematic still. No multi-panel layout, no watermarks, and no decorative borders.',
  ].filter(Boolean).join(' ')
}

export function buildVideoPrompt(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  shotNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveShotSources>
}) {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const shot = getCinematicShotNodeConfig(input.shotNode)
  const movementLabel = shot.cameraMovement.trim() ? `[${shot.cameraMovement.trim()}]` : '[Static shot]'

  return [
    movementLabel,
    `Create a ${shot.durationSeconds ?? settings.defaultClipSeconds}-second cinematic clip for "${input.shotNode.title}".`,
    input.snapshot.project.summary.trim() ? `Project context: ${input.snapshot.project.summary.trim()}.` : null,
    `Preset family: ${getCinematicPresetLabel(settings.presetFamily)}.`,
    shot.formatSubtype ? `Format subtype: ${getCinematicFormatSubtypeLabel(shot.formatSubtype)}.` : null,
    shot.formulaFamily ? `Planned script formula: ${getCinematicFormulaFamilyLabel(shot.formulaFamily)}.` : null,
    shot.dominantTrigger ? `Dominant trigger: ${shot.dominantTrigger.replace(/_/g, ' ')}.` : null,
    input.shotNode.body?.text ? `Script beat: ${String(input.shotNode.body.text).trim()}.` : null,
    shot.visualPrompt.trim() ? `Additional visual direction: ${shot.visualPrompt.trim()}.` : null,
    shot.compositionGuide.trim() ? `Composition guide: ${shot.compositionGuide.trim()}.` : null,
    shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
    shot.cameraAngle.trim() ? `Camera angle: ${shot.cameraAngle.trim()}.` : null,
    shot.lensPreference.trim() ? `Lens preference: ${shot.lensPreference.trim()}.` : null,
    input.sourceInputs.map((entry) => `${entry.config.assetRole ?? entry.definition?.kind ?? 'source'}: ${entry.definition?.name ?? entry.node.title}.`).join(' '),
    describePresetPromptStyle(settings.presetFamily),
    describeSubtypePromptStyle(shot.formatSubtype ?? settings.formatSubtype ?? null),
    'Use literal visual phrasing and readable on-screen action rather than polished advertising copy.',
    subtypeLooksLikeAd(shot.formatSubtype ?? settings.formatSubtype ?? null)
      ? 'Show the product or mechanism doing its job and make proof readable in frame.'
      : null,
    shot.formatSubtype === 'contrast_narrative'
      ? 'Keep both poles readable and make the gap visibly wider than the previous beat.'
      : null,
  ].filter(Boolean).join(' ')
}

function inferStorageFileExtension(kind: 'image' | 'video', sourceUrl: string | null, contentType: string | null) {
  if (kind === 'video') return '.mp4'
  if (contentType?.includes('webp') || sourceUrl?.toLowerCase().includes('.webp')) return '.webp'
  return '.png'
}

export async function createStoredGeneratedAsset(input: {
  admin: ReturnType<typeof createClient>
  client: ReturnType<typeof createClient>
  projectId: string
  userId: string
  sourceUrl: string
  graphKey: string
  runId: string
  name: string
  kind: 'image' | 'video'
  metadata: Record<string, unknown>
}) {
  const uploadSource = await fetch(input.sourceUrl)
  if (!uploadSource.ok) {
    throw new Error(`Failed to download generated ${input.kind} from provider output.`)
  }

  const mimeType = uploadSource.headers.get('content-type') ?? (input.kind === 'video' ? 'video/mp4' : 'image/png')
  const extension = inferStorageFileExtension(input.kind, input.sourceUrl, mimeType)
  const assetKey = `${input.kind}.${buildAssetSlug(`${input.name}_${input.runId}`) || crypto.randomUUID()}`
  const storagePath = `generated/cinematics/${buildAssetSlug(input.graphKey) || 'graph'}/${input.runId}/${assetKey}${extension}`
  const blob = await uploadSource.blob()

  const uploadResponse = await input.admin.storage.from('project-assets').upload(storagePath, blob, {
    contentType: mimeType,
    upsert: true,
  })

  if (uploadResponse.error) {
    throw new Error(uploadResponse.error.message)
  }

  const signedResponse = await input.admin.storage.from('project-assets').createSignedUrl(storagePath, 60 * 60)
  const signedUrl = !signedResponse.error && signedResponse.data?.signedUrl ? signedResponse.data.signedUrl : input.sourceUrl

  const insertedAsset = await input.client
    .from('project_assets')
    .insert({
      project_id: input.projectId,
      key: assetKey,
      name: input.name,
      kind: input.kind,
      mime_type: mimeType,
      storage_path: storagePath,
      metadata: {
        ...input.metadata,
        storageBucket: 'project-assets',
        sourceUrl: signedUrl,
        previewUrl: input.kind === 'image' ? signedUrl : input.metadata.previewUrl ?? signedUrl,
      },
      llm_hints: {},
      created_by: input.userId,
    })
    .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
    .single()

  if (insertedAsset.error || !insertedAsset.data) {
    throw new Error(insertedAsset.error?.message ?? `Failed to store generated ${input.kind} asset.`)
  }

  return {
    id: insertedAsset.data.id,
    key: insertedAsset.data.key,
    name: insertedAsset.data.name,
    kind: insertedAsset.data.kind,
    mimeType: insertedAsset.data.mime_type,
    storagePath: insertedAsset.data.storage_path,
    metadata: insertedAsset.data.metadata ?? {},
    llmHints: insertedAsset.data.llm_hints ?? {},
  }
}

export async function persistShotBindingsIfPresent(
  client: ReturnType<typeof createClient>,
  draftId: string,
  graphKey: string,
  shotNodeKey: string,
  changes: {
    bodyImageAssetKey?: string | null
    metadata: Partial<ReturnType<typeof getCinematicShotNodeConfig>>
  },
) {
  const graphRow = await client.from('draft_graphs').select('id').eq('draft_id', draftId).eq('key', graphKey).maybeSingle()
  if (graphRow.error || !graphRow.data) return

  const nodeRow = await client
    .from('draft_graph_nodes')
    .select('body, metadata, display')
    .eq('graph_id', graphRow.data.id)
    .eq('key', shotNodeKey)
    .maybeSingle()

  if (nodeRow.error || !nodeRow.data) return

  const currentBody = asRecord(nodeRow.data.body)
  const currentMetadata = asRecord(nodeRow.data.metadata)
  const currentDisplay = asRecord(nodeRow.data.display)

  await client
    .from('draft_graph_nodes')
    .update({
      body: changes.bodyImageAssetKey === undefined
        ? currentBody
        : {
            ...currentBody,
            imageAssetKey: changes.bodyImageAssetKey,
          },
      display: changes.bodyImageAssetKey === undefined
        ? currentDisplay
        : {
            ...currentDisplay,
            iconAssetKey: changes.bodyImageAssetKey,
          },
      metadata: updateNodeMetadataWithShot(currentMetadata, changes.metadata),
    })
    .eq('graph_id', graphRow.data.id)
    .eq('key', shotNodeKey)
}

export async function persistTakeBindingsIfPresent(
  client: ReturnType<typeof createClient>,
  draftId: string,
  graphKey: string,
  takeNodeKey: string,
  changes: {
    bodyImageAssetKey?: string | null
    metadata: Partial<ReturnType<typeof getCinematicTakeNodeConfig>>
  },
) {
  const graphRow = await client.from('draft_graphs').select('id').eq('draft_id', draftId).eq('key', graphKey).maybeSingle()
  if (graphRow.error || !graphRow.data) return

  const nodeRow = await client
    .from('draft_graph_nodes')
    .select('body, metadata, display')
    .eq('graph_id', graphRow.data.id)
    .eq('key', takeNodeKey)
    .maybeSingle()

  if (nodeRow.error || !nodeRow.data) return

  const currentBody = asRecord(nodeRow.data.body)
  const currentMetadata = asRecord(nodeRow.data.metadata)
  const currentDisplay = asRecord(nodeRow.data.display)

  await client
    .from('draft_graph_nodes')
    .update({
      body: changes.bodyImageAssetKey === undefined
        ? currentBody
        : {
            ...currentBody,
            imageAssetKey: changes.bodyImageAssetKey,
          },
      display: changes.bodyImageAssetKey === undefined
        ? currentDisplay
        : {
            ...currentDisplay,
            iconAssetKey: changes.bodyImageAssetKey,
          },
      metadata: updateNodeMetadataWithTake(currentMetadata, changes.metadata),
    })
    .eq('graph_id', graphRow.data.id)
    .eq('key', takeNodeKey)
}

export async function persistStoryboardBindingsIfPresent(
  client: ReturnType<typeof createClient>,
  draftId: string,
  graphKey: string,
  storyboardNodeKey: string,
  changes: {
    bodyImageAssetKey?: string | null
    metadata: Partial<ReturnType<typeof getStoryboardRefNodeConfig>>
  },
) {
  const graphRow = await client.from('draft_graphs').select('id').eq('draft_id', draftId).eq('key', graphKey).maybeSingle()
  if (graphRow.error || !graphRow.data) return

  const nodeRow = await client
    .from('draft_graph_nodes')
    .select('body, metadata, display')
    .eq('graph_id', graphRow.data.id)
    .eq('key', storyboardNodeKey)
    .maybeSingle()

  if (nodeRow.error || !nodeRow.data) return

  const currentBody = asRecord(nodeRow.data.body)
  const currentMetadata = asRecord(nodeRow.data.metadata)
  const currentDisplay = asRecord(nodeRow.data.display)

  await client
    .from('draft_graph_nodes')
    .update({
      body: changes.bodyImageAssetKey === undefined
        ? currentBody
        : {
            ...currentBody,
            imageAssetKey: changes.bodyImageAssetKey,
          },
      display: changes.bodyImageAssetKey === undefined
        ? currentDisplay
        : {
            ...currentDisplay,
            iconAssetKey: changes.bodyImageAssetKey,
          },
      metadata: updateNodeMetadataWithStoryboardRef(currentMetadata, changes.metadata),
    })
    .eq('graph_id', graphRow.data.id)
    .eq('key', storyboardNodeKey)
}

export function applyShotBindingToGraph(
  graph: SnapshotGraph,
  shotNodeKey: string,
  changes: {
    bodyImageAssetKey?: string | null
    metadata: Partial<ReturnType<typeof getCinematicShotNodeConfig>>
  },
) {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.key !== shotNodeKey) return node
      const currentBody = asRecord(node.body)
      return {
        ...node,
        body: changes.bodyImageAssetKey === undefined
          ? currentBody
          : {
              ...currentBody,
              imageAssetKey: changes.bodyImageAssetKey,
            },
        display: changes.bodyImageAssetKey === undefined
          ? asRecord(node.display)
          : {
              ...asRecord(node.display),
              iconAssetKey: changes.bodyImageAssetKey,
            },
        metadata: updateNodeMetadataWithShot(asRecord(node.metadata), changes.metadata),
      }
    }),
  }
}

export function applyTakeBindingToGraph(
  graph: SnapshotGraph,
  takeNodeKey: string,
  changes: {
    bodyImageAssetKey?: string | null
    metadata: Partial<ReturnType<typeof getCinematicTakeNodeConfig>>
  },
) {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.key !== takeNodeKey) return node
      const currentBody = asRecord(node.body)
      return {
        ...node,
        body: changes.bodyImageAssetKey === undefined
          ? currentBody
          : {
              ...currentBody,
              imageAssetKey: changes.bodyImageAssetKey,
            },
        display: changes.bodyImageAssetKey === undefined
          ? asRecord(node.display)
          : {
              ...asRecord(node.display),
              iconAssetKey: changes.bodyImageAssetKey,
            },
        metadata: updateNodeMetadataWithTake(asRecord(node.metadata), changes.metadata),
      }
    }),
  }
}

export function applyStoryboardBindingToGraph(
  graph: SnapshotGraph,
  storyboardNodeKey: string,
  changes: {
    bodyImageAssetKey?: string | null
    metadata: Partial<ReturnType<typeof getStoryboardRefNodeConfig>>
  },
) {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.key !== storyboardNodeKey) return node
      const currentBody = asRecord(node.body)
      return {
        ...node,
        body: changes.bodyImageAssetKey === undefined
          ? currentBody
          : {
              ...currentBody,
              imageAssetKey: changes.bodyImageAssetKey,
            },
        display: changes.bodyImageAssetKey === undefined
          ? asRecord(node.display)
          : {
              ...asRecord(node.display),
              iconAssetKey: changes.bodyImageAssetKey,
            },
        metadata: updateNodeMetadataWithStoryboardRef(asRecord(node.metadata), changes.metadata),
      }
    }),
  }
}

export function toCinematicRun(input: {
  row: Record<string, unknown>
  jobs: CinematicRunJob[]
}) {
  return cinematicRunSchema.parse({
    id: input.row.id,
    draftId: input.row.draft_id,
    projectId: input.row.project_id,
    graphKey: input.row.graph_key,
    graphName: input.row.graph_name,
    mode: input.row.mode,
    status: input.row.status,
    shotNodeKey: input.row.shot_node_key ?? null,
    diagnostics: Array.isArray(input.row.diagnostics) ? input.row.diagnostics : [],
    createdAt: input.row.created_at,
    updatedAt: input.row.updated_at,
    jobs: input.jobs,
  })
}

export function toCinematicRunJob(row: Record<string, unknown>) {
  return cinematicRunJobSchema.parse({
    id: row.id,
    runId: row.run_id,
    graphKey: row.graph_key,
    shotNodeKey: row.shot_node_key,
    kind: row.kind,
    status: row.status,
    orderIndex: row.order_index ?? 0,
    dependsOnJobIds: asStringArray(row.depends_on_job_ids),
    stillAssetKey: row.still_asset_key ?? null,
    videoAssetKey: row.video_asset_key ?? null,
    provider: row.provider ?? null,
    model: row.model ?? null,
    providerRequestId: row.provider_request_id ?? null,
    errorMessage: row.error_message ?? null,
    prompt: typeof row.prompt === 'string' ? row.prompt : '',
    resultContext: row.result_context ? asRecord(row.result_context) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function isTerminalCinematicRunStatus(status: string) {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status)
}

export function isTerminalCinematicJobStatus(status: string) {
  return ['succeeded', 'failed', 'cancelled', 'skipped'].includes(status)
}
