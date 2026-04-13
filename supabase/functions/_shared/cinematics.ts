import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  cinematicRunJobSchema,
  cinematicRunSchema,
  getAssetRefNodeConfig,
  getCinematicSettings,
  getCinematicShotNodeConfig,
  updateNodeMetadataWithShot,
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

export function resolveShotSources(snapshot: { definitions?: unknown[]; assets?: unknown[] }, graph: SnapshotGraph, shotNodeKey: string) {
  const definitions = Array.isArray(snapshot.definitions) ? snapshot.definitions.map((entry) => asRecord(entry) as SnapshotDefinition) : []
  const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map((entry) => asRecord(entry) as SnapshotAsset) : []

  return graph.edges
    .filter((edge) => asString(asRecord(edge.target).nodeKey) === shotNodeKey)
    .filter((edge) => isAssetDependencyEdge(graph, edge))
    .map((edge) => {
      const sourceNode = findNode(graph, String(asRecord(edge.source).nodeKey ?? ''))
      if (!sourceNode || sourceNode.type !== 'asset_ref') return null
      const sourceConfig = getAssetRefNodeConfig(sourceNode)
      const definition = definitions.find((entry) => entry.key === sourceConfig.definitionKey) ?? null
      const previewAssetKey = resolveDefinitionDisplayAssetKey(definition)
      const asset = assets.find((entry) => entry.key === previewAssetKey) ?? null
      const imageUrl = resolveAssetUrl(asset)
      return {
        node: sourceNode,
        definition,
        asset,
        imageUrl,
        config: sourceConfig,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
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
