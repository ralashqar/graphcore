import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  cinematicRunJobSchema,
  cinematicRunSchema,
  getAssetRefNodeConfig,
  getCinematicSequence,
  getCompositeRefNodeConfig,
  getCinematicTakeNodeConfig,
  getCinematicSettings,
  getCinematicShotNodeConfig,
  getStoryboardRefNodeConfig,
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
    ...shot.actions.map((entry) => `Action beat: ${entry.verb}${entry.stagingNotes ? ` (${entry.stagingNotes})` : ''}.`),
    ...shot.dialogue.map((entry) => `Dialogue: ${entry.line}${entry.delivery ? ` (${entry.delivery})` : ''}.`),
    ...shot.audio.map((entry) => `${entry.kind}: ${entry.cue}.`),
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
  const prompt = [
    `Create one continuous ${take.durationSeconds}-second cinematic take titled "${input.takeNode.title}".`,
    input.snapshot.project.summary.trim() ? `Project context: ${input.snapshot.project.summary.trim()}.` : null,
    ...shots.map((shot, index) => {
      const segments = [
        `Shot ${index + 1}: ${shot.title}.`,
        shot.beat.trim() ? `Beat: ${shot.beat.trim()}.` : null,
        shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
        shot.cameraMovement.trim() ? `Camera movement: ${shot.cameraMovement.trim()}.` : null,
        ...shot.dialogue.map((entry) => `Dialogue: ${entry.line}${entry.delivery ? ` (${entry.delivery})` : ''}.`),
        ...shot.actions.map((entry) => `Action: ${entry.verb}${entry.stagingNotes ? ` (${entry.stagingNotes})` : ''}.`),
        ...shot.audio.map((entry) => `${entry.kind}: ${entry.cue}.`),
      ].filter((entry): entry is string => Boolean(entry))
      return segments.join(' ')
    }),
    ...keptReferenceInputs.map((entry, index) => {
      const tag = entry.modality === 'image' ? `@Image${index + 1}` : entry.modality === 'video' ? `@Video${index + 1}` : `@Audio${index + 1}`
      return `${tag} is ${entry.label}.`
    }),
    'Preserve continuity across the full take, and transition naturally between the listed shots without hard cuts unless the action implies one.',
  ].filter((entry): entry is string => Boolean(entry)).join(' ')
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
    `Specialization mode: ${settings.specializationMode}.`,
    `Target aspect ratio: ${settings.stillAspectRatio}.`,
    `Target still resolution: ${settings.stillResolution}.`,
    `Shot title: ${input.shotNode.title}.`,
    shot.shotType !== 'custom' ? `Shot type: ${shot.shotType}.` : null,
    shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
    shot.cameraAngle.trim() ? `Camera angle: ${shot.cameraAngle.trim()}.` : null,
    shot.cameraMovement.trim() ? `Camera movement intent: ${shot.cameraMovement.trim()}.` : null,
    shot.lensPreference.trim() ? `Lens preference: ${shot.lensPreference.trim()}.` : null,
    input.shotNode.body?.text ? `Script beat: ${String(input.shotNode.body.text).trim()}.` : null,
    shot.visualPrompt.trim() ? `Additional visual direction: ${shot.visualPrompt.trim()}.` : null,
    shot.compositionGuide.trim() ? `Composition guide: ${shot.compositionGuide.trim()}.` : null,
    ...sourceDescriptions,
    'Compose all supplied sources into one coherent scene with consistent scale, lighting, staging, and continuity.',
    'No subtitles, logos, watermarks, borders, split panels, or collage layout.',
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
    input.shotNode.body?.text ? `Script beat: ${String(input.shotNode.body.text).trim()}.` : null,
    shot.visualPrompt.trim() ? `Additional visual direction: ${shot.visualPrompt.trim()}.` : null,
    shot.compositionGuide.trim() ? `Composition guide: ${shot.compositionGuide.trim()}.` : null,
    shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
    shot.cameraAngle.trim() ? `Camera angle: ${shot.cameraAngle.trim()}.` : null,
    shot.lensPreference.trim() ? `Lens preference: ${shot.lensPreference.trim()}.` : null,
    input.sourceInputs.map((entry) => `${entry.config.assetRole ?? entry.definition?.kind ?? 'source'}: ${entry.definition?.name ?? entry.node.title}.`).join(' '),
    `Keep the scene visually aligned with a ${settings.specializationMode} cinematic sequence.`,
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
