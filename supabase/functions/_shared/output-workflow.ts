import {
  buildOutputGuidanceBundleForNode,
  buildOutputWorkflowExecutionPlan,
  buildOutputWorkflowFingerprint,
  defaultOutputWorkflowConcurrency,
  getOutputWorkflowNodeGuidanceConfig,
  getOutputWorkflowNodeExecutionMetadata,
  hashOutputWorkflowValue,
  isTerminalOutputWorkflowRunStatus,
  outputArtifactSchema,
  outputArtifactResponseSchema,
  outputRequestSchema,
  outputRequestStatusProjectionSchema,
  outputWorkflowCancelResponseSchema,
  outputWorkflowEdgeSchema,
  outputWorkflowPlanRequestSchema,
  outputWorkflowPlanResponseSchema,
  outputWorkflowRunSchema,
  outputWorkflowRunStatusResponseSchema,
  outputWorkflowSchema,
  outputWorkflowStartResponseSchema,
  planOutputWorkflow,
  resolveOutputImageGenerationOutputFormat,
  resolveOutputImageGenerationQuality,
  runOutputWorkflowReadyQueue,
  selectOutputWorkflowRunSubgraph,
  topologicallySortOutputWorkflow,
  validateOutputWorkflowGraph,
  type OutputArtifact,
  type OutputRequest,
  type OutputRequestStatusProjection,
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
  type OutputWorkflowRun,
  type OutputWorkflowRunStep,
} from '../../../src/domain/outputWorkflow.ts'
import { buildEbookDocumentMetadata, buildEbookHtmlDocument } from '../../../src/domain/ebookDocument.ts'
import {
  buildCinematicSequenceFromScriptDoc,
  buildCinematicV2StoryboardGroupPlan,
  buildCinematicV2StoryboardLayout,
  buildCinematicV3StoryboardGroupPlan,
  deriveCinematicV2MaxShotCount,
  cinematicScriptDocSchema,
  cinematicV2ParsedScriptSchema,
  cinematicV2KeyframeQaSchema,
  cinematicV2ReferencePlanSchema,
  cinematicV2SceneLayoutPlanSchema,
  cinematicV2SceneStateSchema,
  cinematicV2ScreenplayDraftSchema,
  cinematicV2ShotSchema,
  cinematicV2ShotPlanSchema,
  cinematicV2StoryboardGroupPlanSchema,
  cinematicV2StoryboardLayoutSchema,
  cinematicV2TimelineSchema,
  providerSafeCinematicV2DurationSeconds,
  validateCinematicV2ShotPlanReferences,
} from '../../../src/domain/cinematics.ts'
import { buildFalMediaUsageLine, buildMuapiMediaUsageLine, buildOpenAiUsageLine, summarizeAiUsageLines, type AiUsageLine } from '../../../src/domain/aiUsage.ts'
import { hashOutputGuidanceBundle, outputGuidanceBundleSchema, type OutputGuidanceBundle } from '../../../src/domain/outputSkills.ts'
import {
  readWorldEntityVisualDescription,
  readWorldEntityVisualTraitMap,
  readWorldEntityVisualTraits,
  readWorldEntityVoiceDescription,
  readWorldEntityVoiceIdentity,
} from '../../../src/domain/worldEntityVisuals.ts'
import { recordAiUsageEvent } from './ai-provider-gateway.ts'
import {
  cancelOpenAiResponse,
  createOpenAiBackgroundResponse,
  retrieveOpenAiResponse,
  runOpenAiResponses,
  type OpenAiResponseResult,
} from './openai.ts'
import { aiGenerationSettings } from '../../../src/config/aiGenerationSettings.ts'
import { normalizeStrictJsonSchema } from './structured-output.ts'
import { z } from 'zod'

const OUTPUT_WORKFLOW_EXECUTOR_VERSION = 'output-text-gpt54-v6'
const DEFAULT_OUTPUT_WORKFLOW_TEXT_MODEL = 'gpt-5.4'
const CINEMATIC_MAX_TOTAL_DURATION_SECONDS = 60
const CINEMATIC_STORYBOARD_IMAGE_QUALITY = aiGenerationSettings.outputWorkflow.cinematicStoryboardImageQuality
const DEFAULT_CINEMATIC_STORYBOARD_STYLE_SAFE_MODE = aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStyleSafeModeDefault
const DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT = aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStylePrompt
const DEFAULT_OUTPUT_WORKFLOW_VIDEO_PROVIDER = aiGenerationSettings.outputWorkflow.videoProviderDefault
const DEFAULT_MUAPI_VIDEO_MODEL = aiGenerationSettings.outputWorkflow.videoMuapiModel
const DEFAULT_FAL_VIDEO_MODEL = aiGenerationSettings.outputWorkflow.videoFalModel
const DEFAULT_FAL_VIDEO_HIGH_RESOLUTION_MODEL = aiGenerationSettings.outputWorkflow.videoFalHighResolutionModel
const DEFAULT_CHAPTER_PROSE_TIMEOUT_MS = 3_600_000
const DEFAULT_CHAPTER_PROSE_ATTEMPTS = 2
const FAL_QUEUE_BASE_URL = 'https://queue.fal.run'
const MUAPI_BASE_URL = 'https://api.muapi.ai/api/v1'

export type OutputDocumentRenderer = (input: {
  markdown: string
  title: string
  subtitle: string
  provenance: string
  generatedAt: string
  fileName: string
  renderMode?: 'ebook' | 'comic' | 'reference' | 'designed_reference'
  pageSize?: 'trade_6x9' | 'letter' | 'a4'
  coverImage?: {
    bytes: Uint8Array
    mimeType: string
    assetKey?: string
    storagePath?: string
    width?: number | null
    height?: number | null
    prompt?: string
  } | null
  comicPages?: Array<{
    bytes: Uint8Array
    mimeType: string
    assetKey?: string
    storagePath?: string
    width?: number | null
    height?: number | null
    prompt?: string
    pageNumber: number
  }>
  comicScript?: Record<string, unknown> | null
  referenceImages?: Array<{
    bytes: Uint8Array
    mimeType: string
    key?: string
    entityKey?: string
    title: string
    caption?: string
    type?: string
    assetKey?: string
    storagePath?: string
  }>
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
}) => Promise<{
  bytes: Uint8Array
  metadata: Record<string, unknown>
}>

type DatabaseClient = {
  from: (table: string) => any
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Blob | Uint8Array | ArrayBuffer, options?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
      download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>
      createSignedUrl?: (path: string, expiresIn: number) => Promise<{ data: unknown; error: { message: string } | null }>
    }
  }
}

export const outputWorkflowSelect = 'id, project_id, draft_id, key, name, description, preset, status, created_by, metadata, created_at, updated_at'
export const outputWorkflowNodeSelect = 'id, workflow_id, key, node_type, label, position, config, inputs, outputs, dirty, input_hash, output_hash, metadata, created_at, updated_at'
export const outputWorkflowNodeStatusSelect = 'id, workflow_id, key, node_type, label, position, config, inputs, dirty, input_hash, output_hash, metadata, created_at, updated_at'
export const outputWorkflowEdgeSelect = 'id, workflow_id, key, source_node_key, source_port, target_node_key, target_port, metadata, created_at, updated_at'
export const outputWorkflowRunSelect = 'id, project_id, draft_id, workflow_id, requested_by, status, preset, prompt, target_format, world_snapshot_fingerprint, input, outputs, error_message, worker_id, heartbeat_at, attempt_count, metadata, started_at, completed_at, created_at, updated_at'
export const outputWorkflowRunStatusSelect = 'id, project_id, draft_id, workflow_id, requested_by, status, preset, prompt, target_format, world_snapshot_fingerprint, error_message, worker_id, heartbeat_at, attempt_count, metadata, started_at, completed_at, created_at, updated_at'
export const outputWorkflowRunStepSelect = 'id, run_id, workflow_id, node_id, node_key, node_type, status, order_index, label, input_hash, output_hash, outputs, provider, model, provider_request_id, error_message, metadata, started_at, completed_at, created_at, updated_at'
export const outputWorkflowRunStepStatusSelect = 'id, run_id, workflow_id, node_id, node_key, node_type, status, order_index, label, input_hash, output_hash, provider, model, provider_request_id, error_message, metadata, started_at, completed_at, created_at, updated_at'
export const outputArtifactSelect = 'id, project_id, draft_id, workflow_id, run_id, node_id, key, name, kind, asset_key, mime_type, summary, metadata, created_at, updated_at'
export const outputRequestSelect = 'id, project_id, draft_id, workflow_id, latest_run_id, requested_by, source_surface, prompt, title, intent, output_kind, status, selected_entity_keys, selected_sequence_unit_keys, page_count, target_format, planner_notes, error_message, metadata, created_at, updated_at'
export const outputRequestStatusProjectionSelect = 'request_id, project_id, draft_id, workflow_id, latest_run_id, status, output_kind, title, progress, active_node_key, active_node_label, latest_error, artifact_keys, preview_asset_keys, graph_revision, timeline_revision, terminal, metadata, created_at, updated_at'

type OutputWorkflowRow = {
  id: string
  project_id: string
  draft_id: string
  key: string
  name: string
  description: string | null
  preset: string
  status: string
  created_by: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type OutputWorkflowNodeRow = {
  id: string
  workflow_id: string
  key: string
  node_type: string
  label: string
  position: Record<string, unknown> | null
  config: Record<string, unknown> | null
  inputs: Record<string, unknown> | null
  outputs: Record<string, unknown> | null
  dirty: boolean | null
  input_hash: string | null
  output_hash: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type OutputWorkflowEdgeRow = {
  id: string
  workflow_id: string
  key: string
  source_node_key: string
  source_port: string
  target_node_key: string
  target_port: string
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type OutputWorkflowRunRow = {
  id: string
  project_id: string
  draft_id: string
  workflow_id: string
  requested_by: string | null
  status: string
  preset: string
  prompt: string | null
  target_format: string | null
  world_snapshot_fingerprint: string | null
  input: Record<string, unknown> | null
  outputs: Record<string, unknown> | null
  error_message: string | null
  worker_id: string | null
  heartbeat_at: string | null
  attempt_count: number | null
  metadata: Record<string, unknown> | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

type OutputWorkflowRunStepRow = {
  id: string
  run_id: string
  workflow_id: string
  node_id: string | null
  node_key: string
  node_type: string
  status: string
  order_index: number | null
  label: string
  input_hash: string | null
  output_hash: string | null
  outputs: Record<string, unknown> | null
  provider: string | null
  model: string | null
  provider_request_id: string | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

type OutputArtifactRow = {
  id: string
  project_id: string
  draft_id: string
  workflow_id: string | null
  run_id: string | null
  node_id: string | null
  key: string
  name: string
  kind: string
  asset_key: string | null
  mime_type: string | null
  summary: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type OutputRequestRow = {
  id: string
  project_id: string
  draft_id: string
  workflow_id: string | null
  latest_run_id: string | null
  requested_by: string | null
  source_surface: string | null
  prompt: string | null
  title: string | null
  intent: string | null
  output_kind: string | null
  status: string | null
  selected_entity_keys: string[] | null
  selected_sequence_unit_keys: string[] | null
  page_count: number | null
  target_format: string | null
  planner_notes: string | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type OutputRequestStatusProjectionRow = {
  request_id: string
  project_id: string
  draft_id: string
  workflow_id: string | null
  latest_run_id: string | null
  status: string
  output_kind: string
  title: string
  progress: Record<string, unknown> | null
  active_node_key: string | null
  active_node_label: string | null
  latest_error: string | null
  artifact_keys: string[] | null
  preview_asset_keys: string[] | null
  graph_revision: string | null
  timeline_revision: string | null
  terminal: boolean | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'output'
}

export function mapOutputWorkflowRow(row: OutputWorkflowRow): OutputWorkflow {
  return outputWorkflowSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    key: row.key,
    name: row.name,
    description: row.description ?? '',
    preset: row.preset,
    status: row.status,
    createdBy: row.created_by,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function mapOutputWorkflowNodeRow(row: OutputWorkflowNodeRow): OutputWorkflowNode {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    key: row.key,
    nodeType: row.node_type as OutputWorkflowNode['nodeType'],
    label: row.label,
    position: {
      x: Number(asRecord(row.position).x ?? 0),
      y: Number(asRecord(row.position).y ?? 0),
    },
    config: row.config ?? {},
    inputs: row.inputs ?? {},
    outputs: row.outputs ?? {},
    dirty: row.dirty ?? true,
    inputHash: row.input_hash ?? '',
    outputHash: row.output_hash ?? '',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapOutputRequestRow(row: OutputRequestRow): OutputRequest {
  return outputRequestSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    workflowId: row.workflow_id,
    latestRunId: row.latest_run_id,
    requestedBy: row.requested_by,
    sourceSurface: row.source_surface ?? 'outputs',
    prompt: row.prompt ?? '',
    title: row.title ?? 'Untitled output',
    intent: row.intent ?? 'output_generation',
    outputKind: row.output_kind ?? 'unknown',
    status: row.status ?? 'queued',
    selectedEntityKeys: row.selected_entity_keys ?? [],
    selectedSequenceUnitKeys: row.selected_sequence_unit_keys ?? [],
    pageCount: row.page_count,
    targetFormat: row.target_format ?? 'pdf',
    plannerNotes: row.planner_notes ?? '',
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function mapOutputRequestStatusProjectionRow(row: OutputRequestStatusProjectionRow): OutputRequestStatusProjection {
  return outputRequestStatusProjectionSchema.parse({
    requestId: row.request_id,
    projectId: row.project_id,
    draftId: row.draft_id,
    workflowId: row.workflow_id,
    latestRunId: row.latest_run_id,
    status: row.status,
    outputKind: row.output_kind ?? 'unknown',
    title: row.title ?? 'Untitled output',
    progress: row.progress ?? {},
    activeNodeKey: row.active_node_key,
    activeNodeLabel: row.active_node_label,
    latestError: row.latest_error,
    artifactKeys: row.artifact_keys ?? [],
    previewAssetKeys: row.preview_asset_keys ?? [],
    graphRevision: row.graph_revision ?? '',
    timelineRevision: row.timeline_revision ?? '',
    terminal: row.terminal ?? false,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function mapOutputWorkflowEdgeRow(row: OutputWorkflowEdgeRow): OutputWorkflowEdge {
  return outputWorkflowEdgeSchema.parse({
    id: row.id,
    workflowId: row.workflow_id,
    key: row.key,
    sourceNodeKey: row.source_node_key,
    sourcePort: row.source_port,
    targetNodeKey: row.target_node_key,
    targetPort: row.target_port,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function mapOutputWorkflowRunStepRow(row: OutputWorkflowRunStepRow): OutputWorkflowRunStep {
  return {
    id: row.id,
    runId: row.run_id,
    workflowId: row.workflow_id,
    nodeId: row.node_id,
    nodeKey: row.node_key,
    nodeType: row.node_type as OutputWorkflowRunStep['nodeType'],
    status: row.status as OutputWorkflowRunStep['status'],
    orderIndex: row.order_index ?? 0,
    label: row.label,
    inputHash: row.input_hash ?? '',
    outputHash: row.output_hash ?? '',
    outputs: row.outputs ?? {},
    provider: row.provider,
    model: row.model,
    providerRequestId: row.provider_request_id,
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapOutputArtifactRow(row: OutputArtifactRow): OutputArtifact {
  return outputArtifactSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    workflowId: row.workflow_id,
    runId: row.run_id,
    nodeId: row.node_id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    assetKey: row.asset_key,
    mimeType: row.mime_type ?? '',
    summary: row.summary ?? '',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export async function hydrateOutputArtifactSignedUrls(client: DatabaseClient, artifacts: OutputArtifact[]) {
  const storagePathByAssetKey = new Map<string, string>()
  const missingAssetKeys = Array.from(new Set(artifacts
    .filter((artifact) => {
      const metadata = asRecord(artifact.metadata)
      const existingUrl = readText(metadata.sourceUrl) || readText(metadata.previewUrl)
      const storagePath = readText(metadata.storagePath) || readText(asRecord(metadata.render).storagePath)
      return Boolean(artifact.assetKey && !existingUrl && !storagePath)
    })
    .map((artifact) => artifact.assetKey)
    .filter((assetKey): assetKey is string => Boolean(assetKey))))

  if (missingAssetKeys.length > 0) {
    const assetResponse = await client
      .from('project_assets')
      .select('key, storage_path')
      .in('key', missingAssetKeys)
    if (!assetResponse.error) {
      for (const asset of assetResponse.data ?? []) {
        const key = typeof asset.key === 'string' ? asset.key : ''
        const storagePath = typeof asset.storage_path === 'string' ? asset.storage_path : ''
        if (key && storagePath) storagePathByAssetKey.set(key, storagePath)
      }
    }
  }

  return Promise.all(artifacts.map(async (artifact) => {
    const metadata = asRecord(artifact.metadata)
    const existingUrl = readText(metadata.sourceUrl) || readText(metadata.previewUrl)
    if (existingUrl) return artifact

    const storagePath = readText(metadata.storagePath)
      || readText(asRecord(metadata.render).storagePath)
      || (artifact.assetKey ? storagePathByAssetKey.get(artifact.assetKey) ?? '' : '')
    if (!storagePath) return artifact

    const bucket = client.storage.from('project-assets')
    if (typeof bucket.createSignedUrl !== 'function') return artifact

    const signed = await bucket.createSignedUrl(storagePath, 60 * 60)
    const data = asRecord(signed.data)
    const signedUrl = readText(data.signedUrl) || readText(data.signedURL)
    if (signed.error || !signedUrl) return artifact

    return {
      ...artifact,
      metadata: {
        ...metadata,
        previewUrl: signedUrl,
        sourceUrl: signedUrl,
      },
    }
  }))
}

export function mapOutputWorkflowRunRow(
  row: OutputWorkflowRunRow,
  steps: OutputWorkflowRunStep[] = [],
  artifacts: OutputArtifact[] = [],
): OutputWorkflowRun {
  return outputWorkflowRunSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    workflowId: row.workflow_id,
    requestedBy: row.requested_by,
    status: row.status,
    preset: row.preset,
    prompt: row.prompt ?? '',
    targetFormat: row.target_format ?? 'pdf',
    worldSnapshotFingerprint: row.world_snapshot_fingerprint ?? '',
    input: row.input ?? {},
    outputs: row.outputs ?? {},
    errorMessage: row.error_message,
    workerId: row.worker_id,
    heartbeatAt: row.heartbeat_at,
    attemptCount: row.attempt_count ?? 0,
    metadata: row.metadata ?? {},
    steps,
    artifacts,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function jsonByteLength(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length
  } catch {
    return 0
  }
}

function truncateStatusText(value: string, maxLength = 4000) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n[truncated ${value.length - maxLength} chars]` : value
}

function compactStatusPreview(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return truncateStatusText(value, depth === 0 ? 2400 : 1200)
  if (typeof value !== 'object') return value
  if (depth >= 3) return `[${Array.isArray(value) ? 'array' : 'object'} truncated]`
  if (Array.isArray(value)) {
    const items = value.slice(0, 12).map((entry) => compactStatusPreview(entry, depth + 1))
    return value.length > 12 ? { items, truncatedCount: value.length - 12 } : items
  }
  const record = asRecord(value)
  const entries = Object.entries(record)
  const compacted: Record<string, unknown> = {}
  for (const [key, entry] of entries.slice(0, 40)) {
    compacted[key] = compactStatusPreview(entry, depth + 1)
  }
  if (entries.length > 40) compacted.truncatedKeyCount = entries.length - 40
  return compacted
}

export function compactRecordForStatus(value: Record<string, unknown>, maxBytes = 180_000): Record<string, unknown> {
  const bytes = jsonByteLength(value)
  if (bytes <= maxBytes) return value
  return {
    _truncatedForStatus: true,
    _originalBytes: bytes,
    preview: compactStatusPreview(value),
  }
}

function collectOutputPreviewAssetKeys(value: unknown, assetKeys = new Set<string>(), depth = 0) {
  if (depth > 8 || value == null) return assetKeys
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 80)) collectOutputPreviewAssetKeys(entry, assetKeys, depth + 1)
    return assetKeys
  }
  if (typeof value !== 'object') return assetKeys
  const record = asRecord(value)
  const assetKey = readText(record.assetKey) || readText(record.asset_key)
  if (assetKey) assetKeys.add(assetKey)
  for (const entry of Object.values(record).slice(0, 80)) {
    if (entry && typeof entry === 'object') collectOutputPreviewAssetKeys(entry, assetKeys, depth + 1)
  }
  return assetKeys
}

function firstOutputPreviewText(outputs: Record<string, unknown>) {
  for (const key of ['text', 'screenplayMarkdown', 'prompt', 'providerPrompt', 'markdown', 'summary']) {
    const value = readText(outputs[key])
    if (value) return truncateStatusText(value, 2400)
  }
  return truncateStatusText(JSON.stringify(compactStatusPreview(outputs)), 2400)
}

export function buildOutputWorkflowNodeOutputPreview(input: {
  node: Pick<OutputWorkflowNode, 'key' | 'nodeType' | 'outputHash'>
  outputs?: Record<string, unknown> | null
  provider?: string | null
  model?: string | null
  errorMessage?: string | null
}) {
  const outputs = asRecord(input.outputs)
  const bytes = jsonByteLength(outputs)
  const assetKeys = [...collectOutputPreviewAssetKeys(outputs)].slice(0, 24)
  const role = readText(outputs.role)
    || readText(asRecord(outputs.image).role)
    || readText(asRecord(outputs.video).role)
    || readText(asRecord(outputs.artifact).role)
    || readText(asRecord(asRecord(outputs.image).metadata).role)
    || readText(asRecord(asRecord(outputs.video).metadata).role)
  return {
    nodeKey: input.node.key,
    nodeType: input.node.nodeType,
    outputHash: input.node.outputHash,
    outputBytes: bytes,
    truncated: bytes > 64_000,
    text: input.errorMessage ? truncateStatusText(input.errorMessage, 2400) : firstOutputPreviewText(outputs),
    preview: compactRecordForStatus(outputs, 48_000),
    assetKeys,
    provider: input.provider ?? null,
    model: input.model ?? null,
    role: role || null,
    generatedAt: new Date().toISOString(),
  }
}

export function compactOutputWorkflowNodesForStatus(nodes: OutputWorkflowNode[]): OutputWorkflowNode[] {
  return nodes.map((node) => ({
    ...node,
    outputs: compactRecordForStatus(node.outputs),
  }))
}

export function compactOutputWorkflowRunForStatus(run: OutputWorkflowRun): OutputWorkflowRun {
  return {
    ...run,
    input: compactRecordForStatus(run.input),
    outputs: compactRecordForStatus(run.outputs),
    errorMessage: run.errorMessage ? truncateStatusText(run.errorMessage) : run.errorMessage,
    steps: run.steps.map((step) => ({
      ...step,
      outputs: compactRecordForStatus(step.outputs),
      errorMessage: step.errorMessage ? truncateStatusText(step.errorMessage) : step.errorMessage,
    })),
  }
}

export function planOutputWorkflowFromRequest(raw: unknown) {
  const request = outputWorkflowPlanRequestSchema.parse(raw)
  return outputWorkflowPlanResponseSchema.parse({
    ok: true,
    plan: planOutputWorkflow(request),
  })
}

export function buildOutputWorkflowInputFingerprint(raw: unknown) {
  const input = asRecord(raw)
  return buildOutputWorkflowFingerprint({
    worldEntities: Array.isArray(input.worldEntities) ? input.worldEntities : [],
    worldRelationships: Array.isArray(input.worldRelationships) ? input.worldRelationships : [],
    worldWiki: input.worldWiki ?? {},
  })
}

export async function loadOutputWorkflowRunBundle(
  client: DatabaseClient,
  runId: string,
  options: { includeNodeOutputs?: boolean; includeRunPayload?: boolean; includeStepOutputs?: boolean } = {},
) {
  const includeNodeOutputs = options.includeNodeOutputs !== false
  const includeRunPayload = options.includeRunPayload !== false
  const includeStepOutputs = options.includeStepOutputs !== false
  const runResponse = await client
    .from('output_workflow_runs')
    .select(includeRunPayload ? outputWorkflowRunSelect : outputWorkflowRunStatusSelect)
    .eq('id', runId)
    .single()
  if (runResponse.error || !runResponse.data) throw new Error(runResponse.error?.message ?? 'Output workflow run not found.')
  const runRow = runResponse.data as OutputWorkflowRunRow

  const [workflowResponse, nodeResponse, edgeResponse, stepResponse, artifactResponse] = await Promise.all([
    client
      .from('output_workflows')
      .select(outputWorkflowSelect)
      .eq('id', runRow.workflow_id)
      .single(),
    client
      .from('output_workflow_nodes')
      .select(includeNodeOutputs ? outputWorkflowNodeSelect : outputWorkflowNodeStatusSelect)
      .eq('workflow_id', runRow.workflow_id)
      .order('created_at', { ascending: true }),
    client
      .from('output_workflow_edges')
      .select(outputWorkflowEdgeSelect)
      .eq('workflow_id', runRow.workflow_id)
      .order('created_at', { ascending: true }),
    client
      .from('output_workflow_run_steps')
      .select(includeStepOutputs ? outputWorkflowRunStepSelect : outputWorkflowRunStepStatusSelect)
      .eq('run_id', runRow.id)
      .order('order_index', { ascending: true }),
    client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('run_id', runRow.id)
      .order('created_at', { ascending: true }),
  ])
  if (workflowResponse.error || !workflowResponse.data) throw new Error(workflowResponse.error?.message ?? 'Output workflow not found.')
  if (nodeResponse.error) throw new Error(nodeResponse.error.message)
  if (edgeResponse.error) throw new Error(edgeResponse.error.message)
  if (stepResponse.error) throw new Error(stepResponse.error.message)
  if (artifactResponse.error) throw new Error(artifactResponse.error.message)

  const steps = ((stepResponse.data ?? []) as OutputWorkflowRunStepRow[]).map(mapOutputWorkflowRunStepRow)
  const artifacts = ((artifactResponse.data ?? []) as OutputArtifactRow[]).map(mapOutputArtifactRow)
  return {
    run: mapOutputWorkflowRunRow(runRow, steps, artifacts),
    workflow: mapOutputWorkflowRow(workflowResponse.data as OutputWorkflowRow),
    nodes: ((nodeResponse.data ?? []) as OutputWorkflowNodeRow[]).map(mapOutputWorkflowNodeRow),
    edges: ((edgeResponse.data ?? []) as OutputWorkflowEdgeRow[]).map(mapOutputWorkflowEdgeRow),
  }
}

export async function loadOutputWorkflowRunStatus(
  client: DatabaseClient,
  runId: string,
) {
  const runResponse = await client
    .from('output_workflow_runs')
    .select(outputWorkflowRunStatusSelect)
    .eq('id', runId)
    .single()
  if (runResponse.error || !runResponse.data) throw new Error(runResponse.error?.message ?? 'Output workflow run not found.')
  const runRow = runResponse.data as OutputWorkflowRunRow

  const [stepResponse, artifactResponse] = await Promise.all([
    client
      .from('output_workflow_run_steps')
      .select(outputWorkflowRunStepStatusSelect)
      .eq('run_id', runRow.id)
      .order('order_index', { ascending: true }),
    client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('run_id', runRow.id)
      .order('created_at', { ascending: true }),
  ])
  if (stepResponse.error) throw new Error(stepResponse.error.message)
  if (artifactResponse.error) throw new Error(artifactResponse.error.message)

  return mapOutputWorkflowRunRow(
    runRow,
    ((stepResponse.data ?? []) as OutputWorkflowRunStepRow[]).map(mapOutputWorkflowRunStepRow),
    ((artifactResponse.data ?? []) as OutputArtifactRow[]).map(mapOutputArtifactRow),
  )
}

async function heartbeat(client: DatabaseClient, runId: string, workerId: string, metadataPatch: Record<string, unknown>) {
  const response = await client.rpc('heartbeat_output_workflow_run', {
    run_id: runId,
    worker_id: workerId,
    metadata_patch: metadataPatch,
  })
  if (response.error) throw new Error(response.error.message)
}

async function setStepStatus(
  client: DatabaseClient,
  input: {
    runId: string
    node: OutputWorkflowNode
    status: OutputWorkflowRunStep['status']
    draftId: string
    orderIndex: number
    inputHash?: string
    outputHash?: string
    outputs?: Record<string, unknown>
    provider?: string | null
    model?: string | null
    providerRequestId?: string | null
    errorMessage?: string | null
    metadata?: Record<string, unknown>
  },
) {
  const now = new Date().toISOString()
  const writeStep = async (nodeId: string | null) => client
    .from('output_workflow_run_steps')
    .upsert({
      run_id: input.runId,
      workflow_id: input.node.workflowId,
      node_id: nodeId,
      draft_id: input.draftId,
      node_key: input.node.key,
      node_type: input.node.nodeType,
      status: input.status,
      order_index: input.orderIndex,
      label: input.node.label,
      input_hash: input.inputHash ?? '',
      output_hash: input.outputHash ?? '',
      outputs: input.outputs ?? {},
      provider: input.provider ?? null,
      model: input.model ?? null,
      provider_request_id: input.providerRequestId ?? null,
      error_message: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
      started_at: input.status === 'queued' ? null : now,
      completed_at: ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(input.status) ? now : null,
    }, { onConflict: 'run_id,node_key' })
  let response = await writeStep(input.node.id)
  if (response.error && response.error.code === '23503' && response.error.message.includes('output_workflow_run_steps_node_id_fkey')) {
    const currentNode = await client
      .from('output_workflow_nodes')
      .select('id')
      .eq('workflow_id', input.node.workflowId)
      .eq('key', input.node.key)
      .maybeSingle()
    if (currentNode.error) throw new Error(currentNode.error.message)
    response = await writeStep(typeof currentNode.data?.id === 'string' ? currentNode.data.id : null)
  }
  if (response.error) throw new Error(response.error.message)
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildOutputStepAiUsage(input: {
  run: OutputWorkflowRun
  node: OutputWorkflowNode
  result?: {
    outputs: Record<string, unknown>
    provider?: string | null
    model?: string | null
    providerRequestId?: string | null
  } | null
  skipped?: boolean
}): { line: AiUsageLine | null; summary: Record<string, unknown> | null } {
  if (!input.result || input.skipped) {
    return { line: null, summary: null }
  }
  const provider = readText(input.result.provider)
  const model = readText(input.result.model)
  const outputs = asRecord(input.result.outputs)
  if (provider === 'openai' && model && outputs.usage) {
    const line = buildOpenAiUsageLine({
      model,
      usage: outputs.usage,
      nodeKey: input.node.key,
      nodeLabel: input.node.label,
      nodeType: input.node.nodeType,
      requestId: input.result.providerRequestId ?? null,
      responseId: readText(outputs.providerResponseId) || readText(outputs.responseId) || null,
    })
    return { line, summary: summarizeAiUsageLines([line]) }
  }
  if (provider === 'fal' && model && input.node.nodeType === 'image_generation') {
    const image = asRecord(outputs.image)
    const width = Number(outputs.width ?? image.width ?? 0) || undefined
    const height = Number(outputs.height ?? image.height ?? 0) || undefined
    const line = buildFalMediaUsageLine({
      model,
      modality: 'image',
      operation: 'image_generation',
      nodeKey: input.node.key,
      nodeLabel: input.node.label,
      nodeType: input.node.nodeType,
      requestId: input.result.providerRequestId ?? readText(image.providerRequestId) ?? null,
      responseId: input.result.providerRequestId ?? readText(image.providerRequestId) ?? null,
      width,
      height,
      quality: readText(asRecord(input.node.config).quality) || undefined,
      size: readText(asRecord(input.node.config).imageSize) || undefined,
      metadata: {
        role: readText(outputs.role) || null,
        referenceImageCount: Number(image.referenceImageCount ?? 0) || 0,
      },
    })
    return { line, summary: summarizeAiUsageLines([line]) }
  }
  if (provider === 'fal' && model && input.node.nodeType === 'video_generation') {
    const line = buildFalMediaUsageLine({
      model,
      modality: 'video',
      operation: 'video_generation',
      nodeKey: input.node.key,
      nodeLabel: input.node.label,
      nodeType: input.node.nodeType,
      requestId: input.result.providerRequestId ?? null,
      responseId: input.result.providerRequestId ?? null,
      units: Number(outputs.durationSeconds ?? 0) || undefined,
      durationSeconds: Number(outputs.durationSeconds ?? 0) || undefined,
      metadata: {
        role: readText(asRecord(outputs.video).role) || null,
        blockNumber: Number(asRecord(outputs.video).blockNumber ?? 0) || null,
        referenceImageCount: Number(asRecord(outputs.video).referenceImageCount ?? 0) || 0,
        referenceVideoCount: Number(asRecord(outputs.video).referenceVideoCount ?? 0) || 0,
        referenceAudioCount: Number(asRecord(outputs.video).referenceAudioCount ?? 0) || 0,
      },
    })
    return { line, summary: summarizeAiUsageLines([line]) }
  }
  if (provider === 'muapi' && model && input.node.nodeType === 'video_generation') {
    const line = buildMuapiMediaUsageLine({
      model,
      modality: 'video',
      operation: 'video_generation',
      nodeKey: input.node.key,
      nodeLabel: input.node.label,
      nodeType: input.node.nodeType,
      requestId: input.result.providerRequestId ?? null,
      responseId: input.result.providerRequestId ?? null,
      units: Number(outputs.durationSeconds ?? 0) || undefined,
      durationSeconds: Number(outputs.durationSeconds ?? 0) || undefined,
      metadata: {
        workflowId: input.run.workflowId,
        runId: input.run.id,
        providerMode: readText(asRecord(outputs.video).providerMode),
        providerStatus: readText(asRecord(outputs.video).providerStatus) || 'COMPLETED',
      },
    })
    return { line, summary: summarizeAiUsageLines([line]) }
  }
  return { line: null, summary: null }
}

function hasStoredOutputs(value: unknown) {
  return Object.keys(asRecord(value)).length > 0
}

function isOptionalOutputWorkflowEdge(
  edge: Pick<OutputWorkflowEdge, 'metadata'> | Partial<Pick<OutputWorkflowEdge, 'metadata' | 'sourceNodeKey' | 'targetNodeKey' | 'targetPort'>>,
) {
  const metadata = asRecord(edge.metadata)
  if (metadata.optional === true || metadata.optionalDependency === true) return true
  const sourceNodeKey = readText(edge.sourceNodeKey)
  const targetNodeKey = readText(edge.targetNodeKey)
  const targetPort = readText(edge.targetPort)
  return sourceNodeKey.startsWith('cinematic_v2_shot_')
    && sourceNodeKey.endsWith('_asset_pack')
    && targetNodeKey.startsWith('cinematic_v2_shot_')
    && targetNodeKey.endsWith('_video')
    && targetPort === 'references'
}

function cachedOutputRunId(node: OutputWorkflowNode) {
  return readText(asRecord(asRecord(node.metadata).execution).lastRunId)
}

const cachedUpstreamMediaFields = [
  'image',
  'coverImage',
  'primaryReferenceImage',
  'keyframe',
  'video',
  'videos',
  'videoReferences',
  'referenceVideos',
  'assetPack',
  'asset_pack',
  'prompt',
  'providerPrompt',
  'text',
  'markdown',
  'parsedScript',
  'sceneState',
  'layoutPlan',
  'shotPlan',
  'cinematicReferencePlan',
  'panels',
  'images',
]

function compactOutputWorkflowUpstreamForNodeCache(upstream: Record<string, Record<string, unknown>>) {
  const normalized = Object.fromEntries(
    Object.entries(upstream)
      .map(([key, outputs]) => [key, asRecord(outputs)] as const)
      .filter(([, outputs]) => hasStoredOutputs(outputs)),
  )
  if (jsonByteLength(normalized) <= 900_000) return normalized

  return Object.fromEntries(Object.entries(normalized).map(([key, outputs]) => {
    if (jsonByteLength(outputs) <= 120_000) return [key, outputs] as const
    const mediaSafe = Object.fromEntries(
      cachedUpstreamMediaFields
        .filter((field) => Object.prototype.hasOwnProperty.call(outputs, field))
        .map((field) => [field, outputs[field]] as const),
    )
    return [
      key,
      hasStoredOutputs(mediaSafe)
        ? mediaSafe
        : compactRecordForStatus(outputs, 40_000),
    ] as const
  }))
}

function readCachedInputUpstream(node: OutputWorkflowNode) {
  const execution = asRecord(asRecord(node.metadata).execution)
  const cached = asRecord(execution.cachedInputUpstream ?? execution.cachedUpstream)
  return Object.fromEntries(
    Object.entries(cached)
      .map(([key, outputs]) => [key, asRecord(outputs)] as const)
      .filter(([, outputs]) => hasStoredOutputs(outputs)),
  )
}

function collectCachedExternalUpstream(input: {
  node: OutputWorkflowNode
  nodesByKey: Map<string, OutputWorkflowNode>
  stepsByNodeKey?: Map<string, OutputWorkflowRunStep>
  executionNodeKeys: Set<string>
  edges: OutputWorkflowEdge[]
}) {
  const outputs: Record<string, Record<string, unknown>> = {}
  const reusedNodeKeys: string[] = []
  const staleReusedNodeKeys: string[] = []
  const missingNodeKeys: string[] = []
  const sourceRunIds: string[] = []
  const cachedInputUpstream = readCachedInputUpstream(input.node)
  for (const edge of input.edges) {
    if (edge.targetNodeKey !== input.node.key || input.executionNodeKeys.has(edge.sourceNodeKey)) continue
    const sourceNode = input.nodesByKey.get(edge.sourceNodeKey)
    if (!sourceNode || !hasStoredOutputs(sourceNode.outputs)) {
      const cachedStepOutputs = asRecord(input.stepsByNodeKey?.get(edge.sourceNodeKey)?.outputs)
      if (hasStoredOutputs(cachedStepOutputs)) {
        outputs[edge.sourceNodeKey] = cachedStepOutputs
        reusedNodeKeys.push(edge.sourceNodeKey)
        staleReusedNodeKeys.push(edge.sourceNodeKey)
        const sourceRunId = readText(input.stepsByNodeKey?.get(edge.sourceNodeKey)?.runId)
        if (sourceRunId) sourceRunIds.push(sourceRunId)
        continue
      }
      const cachedSourceOutputs = asRecord(cachedInputUpstream[edge.sourceNodeKey])
      if (hasStoredOutputs(cachedSourceOutputs)) {
        outputs[edge.sourceNodeKey] = cachedSourceOutputs
        reusedNodeKeys.push(edge.sourceNodeKey)
        staleReusedNodeKeys.push(edge.sourceNodeKey)
        continue
      }
      if (!isOptionalOutputWorkflowEdge(edge)) missingNodeKeys.push(edge.sourceNodeKey)
      continue
    }
    outputs[edge.sourceNodeKey] = asRecord(sourceNode.outputs)
    reusedNodeKeys.push(edge.sourceNodeKey)
    if (sourceNode.dirty) staleReusedNodeKeys.push(edge.sourceNodeKey)
    const sourceRunId = cachedOutputRunId(sourceNode)
    if (sourceRunId) sourceRunIds.push(sourceRunId)
  }
  return {
    outputs,
    reusedNodeKeys: [...new Set(reusedNodeKeys)],
    staleReusedNodeKeys: [...new Set(staleReusedNodeKeys)],
    missingNodeKeys: [...new Set(missingNodeKeys)],
    sourceRunIds: [...new Set(sourceRunIds)],
  }
}

function outputWorkflowCacheStatus(input: {
  missingNodeKeys?: string[]
  staleReusedNodeKeys?: string[]
}) {
  const missingNodeKeys = [...new Set(input.missingNodeKeys ?? [])]
  const staleReusedNodeKeys = [...new Set(input.staleReusedNodeKeys ?? [])]
  if (missingNodeKeys.length > 0) return 'missing_upstream'
  if (staleReusedNodeKeys.length > 0) return 'stale_upstream'
  return 'ready'
}

function buildOutputWorkflowNodeExecutionCacheMetadata(input: {
  node: OutputWorkflowNode
  runId: string
  level: number
  resourceClass: string
  inputHash: string
  outputHash: string
  effectiveUpstream: Record<string, Record<string, unknown>>
  reusedNodeKeys?: string[]
  staleReusedNodeKeys?: string[]
  missingNodeKeys?: string[]
  sourceRunIds?: string[]
  recoveredFromRunStep?: boolean
  skippedReason?: string
}) {
  const staleUpstreamKeys = [...new Set(input.staleReusedNodeKeys ?? [])]
  const missingRequiredUpstreamKeys = [...new Set(input.missingNodeKeys ?? [])]
  return {
    ...asRecord(asRecord(input.node.metadata).execution),
    level: input.level,
    resourceClass: input.resourceClass,
    lastRunId: input.runId,
    inputHash: input.inputHash,
    outputHash: input.outputHash,
    recoveredFromRunStep: input.recoveredFromRunStep === true ? true : undefined,
    skippedReason: input.skippedReason || undefined,
    cachedInputUpstream: compactOutputWorkflowUpstreamForNodeCache(input.effectiveUpstream),
    cachedInputNodeKeys: Object.keys(input.effectiveUpstream),
    cachedInputAt: new Date().toISOString(),
    reusedNodeKeys: [...new Set(input.reusedNodeKeys ?? [])],
    staleReusedNodeKeys: staleUpstreamKeys,
    staleUpstreamKeys,
    missingRequiredUpstreamKeys,
    sourceRunIds: [...new Set(input.sourceRunIds ?? [])],
    cacheStatus: outputWorkflowCacheStatus({
      missingNodeKeys: missingRequiredUpstreamKeys,
      staleReusedNodeKeys: staleUpstreamKeys,
    }),
  }
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean) : []
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => readText(value)).filter(Boolean))]
}

function worldEntityVisualSource(entity: Record<string, unknown>) {
  return {
    summary: readText(entity.summary),
    context: readText(entity.context),
    metadata: asRecord(entity.metadata),
    customProperties: asRecord(entity.customProperties ?? entity.custom_properties),
  }
}

function readOutputEntityVisualDescription(entity: Record<string, unknown>) {
  const composed = readWorldEntityVisualDescription(worldEntityVisualSource(entity))
  return composed || readText(entity.visualDescription)
}

function readOutputEntityVisualTraits(entity: Record<string, unknown>) {
  return readWorldEntityVisualTraits(worldEntityVisualSource(entity))
}

function readOutputEntityVisualTraitMap(entity: Record<string, unknown>) {
  return readWorldEntityVisualTraitMap(worldEntityVisualSource(entity))
}

function readOutputEntityVoiceIdentity(entity: Record<string, unknown>) {
  return readWorldEntityVoiceIdentity(worldEntityVisualSource(entity))
}

function readOutputEntityVoiceDescription(entity: Record<string, unknown>) {
  return readWorldEntityVoiceDescription(worldEntityVisualSource(entity))
}

function readEntitySequence(entity: Record<string, unknown>) {
  const customProperties = asRecord(entity.customProperties ?? entity.custom_properties)
  return asRecord(customProperties.sequence)
}

function normalizeComicReferenceText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function collectSequenceReferenceStrings(value: unknown, output = new Set<string>()) {
  if (typeof value === 'string') {
    const normalized = normalizeComicReferenceText(value)
    if (normalized) output.add(normalized)
    return output
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectSequenceReferenceStrings(entry, output)
    return output
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectSequenceReferenceStrings(entry, output)
    }
  }
  return output
}

function sequenceSearchTextForReferences(sequenceUnit: Record<string, unknown>) {
  const sequence = readEntitySequence(sequenceUnit)
  return normalizeComicReferenceText([
    readText(sequenceUnit.name),
    readText(sequenceUnit.summary),
    readText(sequenceUnit.context),
    readText(asRecord(sequenceUnit.metadata).visualDescription),
    readText(sequence.synopsis),
    readText(sequence.dramaticQuestion),
    readText(sequence.outcome),
    JSON.stringify(sequence),
  ].filter(Boolean).join(' '))
}

function entityMentionedBySequence(entity: Record<string, unknown>, sequenceText: string, referenceStrings: Set<string>) {
  const key = normalizeComicReferenceText(readText(entity.key))
  if (key && referenceStrings.has(key)) return true
  const name = normalizeComicReferenceText(readText(entity.name))
  if (name && sequenceText.includes(name)) return true
  for (const alias of readStringArray(entity.aliases)) {
    const normalizedAlias = normalizeComicReferenceText(alias)
    if (normalizedAlias && (sequenceText.includes(normalizedAlias) || referenceStrings.has(normalizedAlias))) return true
  }
  const nodeType = readText(entity.nodeType ?? entity.node_type)
  const nameParts = name.split('_').filter((part) => part.length > 2)
  return nodeType === 'actor' && nameParts.some((part) => sequenceText.includes(part))
}

function chooseComicContextEntityKeys(input: {
  existingSourceEntityKeys: string[]
  sourceSequenceUnitKeys: string[]
  entities: Record<string, unknown>[]
  relationships: Record<string, unknown>[]
}) {
  const keys = new Set(input.existingSourceEntityKeys.filter(Boolean))
  const entityByKey = new Map(input.entities.map((entity) => [readText(entity.key), entity]).filter(([key]) => key))
  for (const sequenceKey of input.sourceSequenceUnitKeys) {
    const sequenceUnit = entityByKey.get(sequenceKey)
    if (!sequenceUnit) continue
    const sequenceText = sequenceSearchTextForReferences(sequenceUnit)
    const referenceStrings = collectSequenceReferenceStrings(sequenceUnit.customProperties ?? sequenceUnit.custom_properties)
    for (const entity of input.entities) {
      const nodeType = readText(entity.nodeType ?? entity.node_type)
      if (nodeType === 'sequence_unit') continue
      if (entityMentionedBySequence(entity, sequenceText, referenceStrings)) keys.add(readText(entity.key))
    }
    for (const relationship of input.relationships) {
      const sourceKey = readText(relationship.sourceEntityKey ?? relationship.source_entity_key)
      const targetKey = readText(relationship.targetEntityKey ?? relationship.target_entity_key)
      const relatedKey = sourceKey === sequenceKey ? targetKey : targetKey === sequenceKey ? sourceKey : ''
      if (!relatedKey) continue
      const related = entityByKey.get(relatedKey)
      if (related && readText(related.nodeType ?? related.node_type) !== 'sequence_unit') keys.add(relatedKey)
    }
  }
  return [...keys].slice(0, 24)
}

function shouldInferContextEntitiesFromSequence(preset: string) {
  return preset === 'comic_issue_from_sequence'
    || preset === 'cinematic_episode_from_sequence'
    || preset === 'cinematic_trailer'
}

function extractWorldContext(run: OutputWorkflowRun, node: OutputWorkflowNode) {
  const input = asRecord(run.input)
  const entities = Array.isArray(input.worldEntities) ? input.worldEntities.map(asRecord) : []
  const relationships = Array.isArray(input.worldRelationships) ? input.worldRelationships.map(asRecord) : []
  const assets = Array.isArray(input.assets) ? input.assets.map(asRecord) : []
  const wiki = asRecord(input.worldWiki)
  const config = asRecord(node.config)
  const configuredSourceEntityKeys = Array.isArray(config.sourceEntityKeys) ? config.sourceEntityKeys.filter((entry): entry is string => typeof entry === 'string') : []
  const sourceSequenceUnitKeys = Array.isArray(config.sourceSequenceUnitKeys) ? config.sourceSequenceUnitKeys.filter((entry): entry is string => typeof entry === 'string') : []
  const strictSourceEntityFilter = config.strictSourceEntityFilter === true
  const sourceEntityKeys = shouldInferContextEntitiesFromSequence(run.preset)
    ? chooseComicContextEntityKeys({
      existingSourceEntityKeys: configuredSourceEntityKeys,
      sourceSequenceUnitKeys,
      entities,
      relationships,
    })
    : configuredSourceEntityKeys
  const sequenceUnits = entities
    .filter((entity) => entity.nodeType === 'sequence_unit' || entity.node_type === 'sequence_unit')
    .filter((entity) => sourceSequenceUnitKeys.length === 0 || sourceSequenceUnitKeys.includes(String(entity.key)))
    .sort((left, right) => Number(readEntitySequence(left).ordinal ?? 0) - Number(readEntitySequence(right).ordinal ?? 0))
  const worldEntities = entities
    .filter((entity) => entity.nodeType !== 'sequence_unit' && entity.node_type !== 'sequence_unit')
    .filter((entity) => strictSourceEntityFilter
      ? sourceEntityKeys.includes(String(entity.key))
      : sourceEntityKeys.length === 0 || sourceEntityKeys.includes(String(entity.key)))
  return {
    wiki,
    entities: worldEntities,
    sequenceUnits,
    relationships,
    assets,
    sourceEntityKeys,
    sourceSequenceUnitKeys,
  }
}

function worldContextFromRunInput(run: OutputWorkflowRun) {
  const input = asRecord(run.input)
  const entities = Array.isArray(input.worldEntities) ? input.worldEntities.map(asRecord) : []
  return {
    wiki: asRecord(input.worldWiki),
    entities: entities.filter((entity) => entity.nodeType !== 'sequence_unit' && entity.node_type !== 'sequence_unit'),
    sequenceUnits: entities.filter((entity) => entity.nodeType === 'sequence_unit' || entity.node_type === 'sequence_unit'),
    relationships: Array.isArray(input.worldRelationships) ? input.worldRelationships.map(asRecord) : [],
    assets: Array.isArray(input.assets) ? input.assets.map(asRecord) : [],
    sourceEntityKeys: Array.isArray(input.sourceEntityKeys) ? input.sourceEntityKeys : [],
    sourceSequenceUnitKeys: Array.isArray(input.sourceSequenceUnitKeys) ? input.sourceSequenceUnitKeys : [],
  }
}

function titleFromContext(context: Record<string, unknown>) {
  const wiki = asRecord(context.wiki)
  return readText(wiki.title) || 'Generated Ebook'
}

function outlineFromContext(context: Record<string, unknown>) {
  const sequenceUnits = Array.isArray(context.sequenceUnits) ? context.sequenceUnits.map(asRecord) : []
  const fallbackChapters = Array.isArray(context.entities) ? context.entities.map(asRecord).slice(0, 6) : []
  const chapters = sequenceUnits.length > 0 ? sequenceUnits : fallbackChapters
  return chapters.map((entry, index) => {
    const sequence = readEntitySequence(entry)
    return {
      number: index + 1,
      title: readText(entry.name) || `Chapter ${index + 1}`,
      synopsis: readText(sequence.synopsis) || readText(entry.summary) || readText(entry.context),
      outcome: readText(sequence.outcome),
    }
  })
}

function readFirstUpstreamText(upstream: Record<string, Record<string, unknown>>, fields = ['markdown', 'text']) {
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = readText(outputs[field])
      if (value) return value
    }
  }
  return ''
}

function readVideoPromptFromUpstream(upstream: Record<string, Record<string, unknown>>) {
  const preferredKeys = Object.keys(upstream).filter((key) => key === 'video_prompt' || key.endsWith('_video_prompt') || key.includes('video_prompt'))
  for (const key of preferredKeys) {
    const outputs = upstream[key]
    for (const field of ['providerPrompt', 'prompt', 'text']) {
      const value = readText(outputs?.[field])
      if (value) return value
    }
  }
  return readFirstUpstreamText(upstream, ['providerPrompt', 'prompt', 'text'])
}

function readFirstUpstreamArray(upstream: Record<string, Record<string, unknown>>, fields: string[]) {
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) return value.map(asRecord)
    }
  }
  return []
}

function readFirstUpstreamImage(upstream: Record<string, Record<string, unknown>>, fields = ['coverImage', 'image']) {
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      const record = asRecord(value)
      if (readText(record.assetKey) || readText(record.storagePath) || readText(record.url)) return record
    }
  }
  return null
}

function readUpstreamImages(upstream: Record<string, Record<string, unknown>>, fields = ['image', 'coverImage']) {
  const images: Record<string, unknown>[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        for (const entry of value) {
          const record = asRecord(entry)
          if (readText(record.assetKey) || readText(record.storagePath) || readText(record.url)) images.push(record)
        }
        continue
      }
      const record = asRecord(value)
      if (readText(record.assetKey) || readText(record.storagePath) || readText(record.url)) images.push(record)
    }
  }
  return images
}

function imageIsPlanningOnly(image: Record<string, unknown>) {
  const metadata = asRecord(image.metadata)
  return image.planningOnly === true
    || image.planning_only === true
    || metadata.planningOnly === true
    || metadata.planning_only === true
}

function normalizeCinematicReferenceMode(value: unknown) {
  const mode = readText(value)
  return mode === 'keyframes' || mode === 'keyframes_and_storyboard' || mode === 'storyboard_sheet' || mode === 'shot_reference_sheet'
    ? mode
    : 'shot_reference_sheet'
}

function cinematicImageReferencePriority(image: Record<string, unknown>, cinematicReferenceMode: string) {
  const role = readText(image.role) || readText(asRecord(image.metadata).role)
  if (role === 'cinematic_beat_sheet' || role === 'cinematic_direction_sheet') {
    return cinematicReferenceMode === 'keyframes' ? 99 : 0
  }
  if (role === 'cinematic_keyframe' || role === 'cinematic_v2_shot_keyframe') {
    const keyframeIndex = Number(image.keyframeIndex ?? asRecord(image.metadata).keyframeIndex ?? 0) || 0
    return cinematicReferenceMode === 'keyframes' ? keyframeIndex : keyframeIndex + 1
  }
  if (role === 'cinematic_atlas') return 10
  return 20
}

function orderCinematicVideoReferenceImages(images: Record<string, unknown>[], cinematicReferenceMode: string) {
  const mode = normalizeCinematicReferenceMode(cinematicReferenceMode)
  return images
    .filter((image) => {
      if (!imageIsPlanningOnly(image)) return true
      const role = readText(image.role) || readText(asRecord(image.metadata).role)
      return (role === 'cinematic_beat_sheet' || role === 'cinematic_direction_sheet') && mode !== 'keyframes'
    })
    .sort((left, right) => cinematicImageReferencePriority(left, mode) - cinematicImageReferencePriority(right, mode))
}

function debugForceVideoGenerationEnabled(run: OutputWorkflowRun, node?: OutputWorkflowNode | null) {
  const runMetadata = asRecord(run.metadata)
  if (runMetadata.debugForceVideoGeneration !== true) return false
  if (!node || node.nodeType !== 'video_generation') return false
  if (isCinematicV2ProductionNode(asRecord(node.config), node) && !cinematicVideoApprovedEnabled(run)) return false
  const runMode = readText(runMetadata.runMode)
  if (!runMode.startsWith('targeted_node')) return false
  const targetNodeKeys = new Set(readStringArray(runMetadata.targetNodeKeys))
  const forceNodeKeys = new Set(readStringArray(runMetadata.forceNodeKeys))
  return targetNodeKeys.has(node.key) && forceNodeKeys.has(node.key)
}

function cinematicVideoApprovedEnabled(run: OutputWorkflowRun) {
  const runInput = asRecord(run.input)
  const runMetadata = asRecord(run.metadata)
  return runInput.cinematicVideoApproved === true || runMetadata.cinematicVideoApproved === true
}

function isCinematicV2ProductionNode(config: Record<string, unknown>, node?: OutputWorkflowNode | null) {
  const purpose = readText(config.purpose)
  const role = readText(config.role)
  const pipelineVersion = readText(config.cinematicPipelineVersion)
  return (pipelineVersion === 'v2_shot_orchestration' || pipelineVersion === 'v3_script_storyboards')
    && (
      purpose === 'cinematic_v2_shot_video'
      || role === 'cinematic_v2_shot_video'
      || purpose === 'cinematic_v2_timeline_assemble'
      || role === 'cinematic_v2_final_timeline'
      || node?.key === 'cinematic_v2_timeline_assemble'
      || purpose === 'cinematic_v3_storyboard_group_video'
      || role === 'cinematic_v3_storyboard_group_video'
      || purpose === 'cinematic_v3_timeline_assemble'
      || role === 'cinematic_v3_final_timeline'
      || node?.key === 'cinematic_v3_timeline_assemble'
    )
}

function debugSkipVideoGenerationEnabled(config: Record<string, unknown>, run: OutputWorkflowRun, node?: OutputWorkflowNode | null) {
  if (isCinematicV2ProductionNode(config, node)) return !cinematicVideoApprovedEnabled(run)
  if (debugForceVideoGenerationEnabled(run, node)) return false
  const runInput = asRecord(run.input)
  const runMetadata = asRecord(run.metadata)
  if (typeof config.debugSkipVideoGeneration === 'boolean') return config.debugSkipVideoGeneration
  if (typeof runInput.debugSkipVideoGeneration === 'boolean') return runInput.debugSkipVideoGeneration
  if (typeof runMetadata.debugSkipVideoGeneration === 'boolean') return runMetadata.debugSkipVideoGeneration
  return true
}

function upstreamHasDebugSkippedVideo(upstream: Record<string, Record<string, unknown>>) {
  for (const outputs of Object.values(upstream)) {
    const video = asRecord(outputs.video)
    if (video.debugSkipVideoGeneration === true || video.skippedReason === 'debug_skip_video_generation') return true
    if (outputs.debugSkipVideoGeneration === true || outputs.skippedReason === 'debug_skip_video_generation') return true
  }
  return false
}

function readUpstreamVideos(upstream: Record<string, Record<string, unknown>>, fields = ['video', 'videos']) {
  const videos: Record<string, unknown>[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        for (const entry of value) {
          const record = asRecord(entry)
          if (readText(record.assetKey) || readText(record.storagePath) || readText(record.url)) videos.push(record)
        }
        continue
      }
      const record = asRecord(value)
      if (readText(record.assetKey) || readText(record.storagePath) || readText(record.url)) videos.push(record)
    }
  }
  return videos
}

function readCinematicStoryboardStyleSafeMode(config: Record<string, unknown>, run?: OutputWorkflowRun | null) {
  if (typeof config.debugCinematicStoryboardStyleSafeMode === 'boolean') return config.debugCinematicStoryboardStyleSafeMode
  const runInput = asRecord(run?.input)
  const runMetadata = asRecord(run?.metadata)
  const cinematicOptions = asRecord(runMetadata.cinematicOptions)
  if (typeof runInput.debugCinematicStoryboardStyleSafeMode === 'boolean') return runInput.debugCinematicStoryboardStyleSafeMode
  if (typeof runMetadata.debugCinematicStoryboardStyleSafeMode === 'boolean') return runMetadata.debugCinematicStoryboardStyleSafeMode
  if (typeof cinematicOptions.debugCinematicStoryboardStyleSafeMode === 'boolean') return cinematicOptions.debugCinematicStoryboardStyleSafeMode
  return DEFAULT_CINEMATIC_STORYBOARD_STYLE_SAFE_MODE
}

function readCinematicStoryboardStyleOverride(config: Record<string, unknown>, run?: OutputWorkflowRun | null) {
  const runInput = asRecord(run?.input)
  const runMetadata = asRecord(run?.metadata)
  const cinematicOptions = asRecord(runMetadata.cinematicOptions)
  return readText(config.cinematicStoryboardStyleOverride)
    || readText(runInput.cinematicStoryboardStyleOverride)
    || readText(runMetadata.cinematicStoryboardStyleOverride)
    || readText(cinematicOptions.cinematicStoryboardStyleOverride)
    || DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT
}

function resolveCinematicStoryboardStylePolicy(config: Record<string, unknown>, run?: OutputWorkflowRun | null) {
  const safeMode = readCinematicStoryboardStyleSafeMode(config, run)
  const stylePrompt = safeMode ? readCinematicStoryboardStyleOverride(config, run) : ''
  return {
    safeMode,
    stylePrompt,
    label: safeMode ? 'painterly comic-book' : 'normal project/user style',
  }
}

function inferCinematicTargetVideoStyle(input: {
  prompt: string
  truthSourceMode: string
  blockScript: Record<string, unknown>
}) {
  const explicitStyle = readText(input.blockScript.targetVideoStyle)
    || readText(input.blockScript.visualStyle)
    || readText(input.blockScript.style)
  if (explicitStyle) return explicitStyle
  const prompt = String(input.prompt || '').toLowerCase()
  const truth = input.truthSourceMode.toLowerCase()
  if (truth.includes('ugc') || /\b(phone|selfie|tiktok|reel|creator|ugc)\b/.test(prompt)) {
    return 'raw UGC phone footage with natural handheld motion and platform-native realism'
  }
  if (truth.includes('broadcast') || /\b(broadcast|live tv|news|sports)\b/.test(prompt)) {
    return 'authentic live broadcast video with practical camera coverage and natural signal texture'
  }
  if (truth.includes('animation') || /\b(anime|animated|animation|2d)\b/.test(prompt)) {
    return 'coherent stylized animation matching the user brief and project art direction'
  }
  if (/\b(comic|graphic novel|illustrated|painterly)\b/.test(prompt)) {
    return 'stylized cinematic graphic-novel animation matching the user brief'
  }
  return 'grounded live-action cinematic video with realistic faces, practical lighting, natural lens behavior, and physical motion'
}

function readFirstUpstreamRecord(upstream: Record<string, Record<string, unknown>>, fields: string[]) {
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      const record = asRecord(value)
      if (Object.keys(record).length > 0) return record
    }
  }
  return {}
}

function readUpstreamGuidanceBundle(upstream: Record<string, Record<string, unknown>>) {
  for (const outputs of Object.values(upstream)) {
    const candidate = outputs.guidance ?? outputs.guidanceBundle
    const parsed = outputGuidanceBundleSchema.safeParse(candidate)
    if (parsed.success) return parsed.data
  }
  return null
}

function mergeGuidanceBundles(primary: OutputGuidanceBundle | null, secondary: OutputGuidanceBundle | null) {
  if (!primary && !secondary) return outputGuidanceBundleSchema.parse({})
  if (!primary) return secondary!
  if (!secondary) return primary
  const skillKeys = [...new Set([...primary.skillKeys, ...secondary.skillKeys])]
  const guidance = [...new Set([...primary.guidance, ...secondary.guidance])]
  const avoid = [...new Set([...primary.avoid, ...secondary.avoid])]
  const skillsByKey = new Map([...primary.skills, ...secondary.skills].map((skill) => [skill.key, skill]))
  const bundleWithoutHash = {
    skillKeys,
    skillVersions: { ...primary.skillVersions, ...secondary.skillVersions },
    guidanceMode: secondary.guidanceMode === 'strict' ? 'strict' : primary.guidanceMode,
    guidance,
    avoid,
    structuredDirectives: { ...primary.structuredDirectives, ...secondary.structuredDirectives },
    resolvedGuidancePreview: [
      ...guidance.slice(0, 5),
      ...avoid.slice(0, 3).map((entry) => `Avoid: ${entry}`),
    ].join(' '),
    skills: [...skillsByKey.values()],
    diagnostics: [...primary.diagnostics, ...secondary.diagnostics],
  }
  return outputGuidanceBundleSchema.parse({
    ...bundleWithoutHash,
    guidanceHash: hashOutputGuidanceBundle(bundleWithoutHash),
  })
}

function resolveGuidanceForExecution(input: {
  run: OutputWorkflowRun
  node: OutputWorkflowNode
  upstream: Record<string, Record<string, unknown>>
}) {
  const upstreamBundle = readUpstreamGuidanceBundle(input.upstream)
  const nodeBundle = buildOutputGuidanceBundleForNode({
    node: input.node,
    worldWiki: asRecord(input.run.input).worldWiki,
  })
  return mergeGuidanceBundles(upstreamBundle, nodeBundle)
}

function guidanceMarkdown(bundle: OutputGuidanceBundle) {
  if (bundle.skillKeys.length === 0 && bundle.guidance.length === 0 && bundle.avoid.length === 0) return ''
  return [
    bundle.skillKeys.length > 0 ? `Guidance skills: ${bundle.skillKeys.join(', ')}.` : '',
    bundle.guidance.length > 0 ? `Guidance:\n${bundle.guidance.map((entry) => `- ${entry}`).join('\n')}` : '',
    bundle.avoid.length > 0 ? `Avoid:\n${bundle.avoid.map((entry) => `- ${entry}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

function guidanceStepMetadata(value: unknown) {
  const parsed = outputGuidanceBundleSchema.safeParse(value)
  if (!parsed.success) return {}
  return {
    skillKeys: parsed.data.skillKeys,
    skillVersions: parsed.data.skillVersions,
    guidanceHash: parsed.data.guidanceHash,
    guidanceMode: parsed.data.guidanceMode,
    resolvedGuidancePreview: parsed.data.resolvedGuidancePreview,
  }
}

function outputWorkflowTextModel() {
  return Deno.env.get('OUTPUT_WORKFLOW_TEXT_MODEL')?.trim() || DEFAULT_OUTPUT_WORKFLOW_TEXT_MODEL
}

function outputWorkflowComicTextModel() {
  return Deno.env.get('OUTPUT_WORKFLOW_COMIC_TEXT_MODEL')?.trim() || outputWorkflowTextModel()
}

function outputWorkflowChapterTimeoutMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_CHAPTER_TIMEOUT_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(60_000, Math.floor(parsed))
    : DEFAULT_CHAPTER_PROSE_TIMEOUT_MS
}

function outputWorkflowChapterAttempts() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_CHAPTER_ATTEMPTS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(4, Math.max(1, Math.floor(parsed)))
    : DEFAULT_CHAPTER_PROSE_ATTEMPTS
}

function isRetryableOpenAiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return lower.includes('timed out')
    || lower.includes('timeout')
    || lower.includes('rate limit')
    || lower.includes('temporarily unavailable')
    || lower.includes('overloaded')
    || lower.includes('status 408')
    || lower.includes('status 409')
    || lower.includes('status 429')
    || lower.includes('status 500')
    || lower.includes('status 502')
    || lower.includes('status 503')
    || lower.includes('status 504')
}

function retryDelayMs(attempt: number) {
  return Math.min(10_000, 1_500 * attempt)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function outputWorkflowImageModel(configModel?: unknown) {
  const configured = readText(configModel) || Deno.env.get('OUTPUT_WORKFLOW_IMAGE_MODEL')?.trim() || 'openai/gpt-image-2'
  return configured === 'gpt-image-2' ? 'openai/gpt-image-2' : configured
}

function outputWorkflowFalTimeoutMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_FAL_TIMEOUT_MS') ?? Deno.env.get('VISUAL_GENERATION_FAL_TIMEOUT_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(60_000, Math.floor(parsed)) : 1_200_000
}

function outputWorkflowFalPollIntervalMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_FAL_POLL_INTERVAL_MS') ?? Deno.env.get('VISUAL_GENERATION_FAL_POLL_INTERVAL_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1_000, Math.floor(parsed)) : 3_000
}

function outputWorkflowMuapiTimeoutMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_MUAPI_TIMEOUT_MS') ?? Deno.env.get('OUTPUT_WORKFLOW_FAL_TIMEOUT_MS') ?? Deno.env.get('VISUAL_GENERATION_FAL_TIMEOUT_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(60_000, Math.floor(parsed)) : 1_200_000
}

function outputWorkflowMuapiPollIntervalMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_MUAPI_POLL_INTERVAL_MS') ?? Deno.env.get('OUTPUT_WORKFLOW_FAL_POLL_INTERVAL_MS') ?? Deno.env.get('VISUAL_GENERATION_FAL_POLL_INTERVAL_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1_000, Math.floor(parsed)) : 3_000
}

function outputWorkflowMuapiWebhookSecret() {
  return Deno.env.get('OUTPUT_WORKFLOW_MUAPI_WEBHOOK_SECRET')?.trim()
    || Deno.env.get('MUAPI_WEBHOOK_SECRET')?.trim()
    || ''
}

export function buildOutputWorkflowMuapiWebhookUrl() {
  const secret = outputWorkflowMuapiWebhookSecret()
  if (!secret) return ''

  const overrideUrl = Deno.env.get('OUTPUT_WORKFLOW_MUAPI_WEBHOOK_URL')?.trim()
  if (overrideUrl) {
    try {
      const url = new URL(overrideUrl)
      if (!url.searchParams.has('secret')) {
        url.searchParams.set('secret', secret)
      }
      return url.toString()
    } catch {
      return ''
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/+$/, '')
  if (!supabaseUrl) return ''
  const url = new URL(`${supabaseUrl}/functions/v1/muapi-webhook`)
  url.searchParams.set('secret', secret)
  return url.toString()
}

function normalizeOutputVideoProvider(value: unknown) {
  const provider = readText(value).toLowerCase()
  return provider === 'fal' || provider === 'muapi' ? provider : DEFAULT_OUTPUT_WORKFLOW_VIDEO_PROVIDER
}

function resolveOutputVideoProvider(config: Record<string, unknown>) {
  return normalizeOutputVideoProvider(readText(config.provider) || readText(config.videoProvider) || Deno.env.get('OUTPUT_WORKFLOW_VIDEO_PROVIDER'))
}

function resolveFalVideoModel(resolution: string) {
  return resolution === '1080p' ? DEFAULT_FAL_VIDEO_HIGH_RESOLUTION_MODEL : DEFAULT_FAL_VIDEO_MODEL
}

function buildFalHeaders(apiKey: string) {
  return new Headers({
    Authorization: `Key ${apiKey}`,
    'Content-Type': 'application/json',
  })
}

function buildMuapiHeaders(apiKey: string) {
  return new Headers({
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  })
}

async function fetchFalJson(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const rawText = await response.text().catch(() => '')
  let body: Record<string, unknown> = {}
  if (rawText.trim()) {
    try {
      body = JSON.parse(rawText) as Record<string, unknown>
    } catch {
      body = {}
    }
  }
  return { response, body, rawText }
}

async function fetchMuapiJson(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const rawText = await response.text().catch(() => '')
  let body: Record<string, unknown> = {}
  if (rawText.trim()) {
    try {
      body = JSON.parse(rawText) as Record<string, unknown>
    } catch {
      body = {}
    }
  }
  return { response, body, rawText }
}

function muapiErrorMessage(body: Record<string, unknown>, fallback: string) {
  const direct = readText(body.error_message)
    || readText(body.error)
    || readText(body.message)
    || readText(body.detail)
    || readText(asRecord(body.error).message)
    || readText(asRecord(body.data).error_message)
    || readText(asRecord(body.result).error_message)
  return direct || fallback
}

export function buildMuapiVideoPayload(input: {
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
}) {
  return {
    prompt: input.prompt,
    images_list: input.referenceImageUrls ?? [],
    video_files: input.referenceVideoUrls ?? [],
    audio_files: input.referenceAudioUrls ?? [],
    aspect_ratio: input.aspectRatio ?? '16:9',
    duration: input.durationSeconds,
  }
}

function extractStringUrl(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  const record = asRecord(value)
  return readText(record.video_url)
    || readText(record.videoUrl)
    || readText(record.url)
    || readText(record.file_url)
    || readText(record.fileUrl)
}

export function extractMuapiVideoUrlFromResult(value: unknown): string {
  const record = asRecord(value)
  const direct = extractStringUrl(record.video_url)
    || extractStringUrl(record.videoUrl)
    || extractStringUrl(record.url)
    || extractStringUrl(record.output)
    || extractStringUrl(record.result)
    || extractStringUrl(record.data)
  if (direct) return direct

  for (const key of ['output', 'result', 'data']) {
    const nested = record[key]
    if (nested && typeof nested === 'object') {
      const url = extractMuapiVideoUrlFromResult(nested)
      if (url) return url
    }
  }

  for (const key of ['videos', 'video_urls', 'videoUrls', 'response', 'outputs']) {
    const array = Array.isArray(record[key]) ? record[key] : []
    for (const entry of array) {
      const url = extractStringUrl(entry) || extractMuapiVideoUrlFromResult(entry)
      if (url) return url
    }
  }
  return ''
}

function readMuapiRequestId(body: Record<string, unknown>) {
  return readText(body.request_id)
    || readText(body.requestId)
    || readText(body.id)
    || readText(body.prediction_id)
    || readText(body.predictionId)
    || readText(asRecord(body.data).request_id)
    || readText(asRecord(body.data).id)
}

function readMuapiProviderStatus(body: Record<string, unknown>) {
  return (readText(body.status)
    || readText(body.state)
    || readText(body.task_status)
    || readText(body.taskStatus)
    || readText(asRecord(body.data).status)
    || readText(asRecord(body.result).status)
    || 'UNKNOWN').toUpperCase()
}

function muapiStatusIsComplete(status: string) {
  return ['COMPLETED', 'COMPLETE', 'SUCCEEDED', 'SUCCESS', 'DONE', 'FINISHED'].includes(status)
}

function muapiStatusIsFailed(status: string) {
  return ['FAILED', 'ERROR', 'CANCELED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(status)
}

function falErrorMessage(body: Record<string, unknown>, fallback: string) {
  if (Array.isArray(body.detail)) {
    const details = body.detail
      .map((entry) => {
        const record = asRecord(entry)
        const loc = Array.isArray(record.loc) ? record.loc.map(String).join('.') : readText(record.loc)
        const msg = readText(record.msg) || readText(record.message)
        const type = readText(record.type)
        const ctx = asRecord(record.ctx)
        const extra = asRecord(ctx.extra_info)
        const reason = readText(extra.reason) || readText(ctx.reason)
        return [
          loc ? `loc=${loc}` : '',
          type ? `type=${type}` : '',
          reason ? `reason=${reason}` : '',
          msg,
        ].filter(Boolean).join(' ')
      })
      .filter(Boolean)
    if (details.length > 0) return details.join('; ').slice(0, 2000)
  }
  if (typeof body.detail === 'string' && body.detail.trim()) return body.detail.trim()
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim()
  if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
  if (body.detail !== undefined) {
    try {
      return JSON.stringify(body.detail)
    } catch {
      // Fall through to the generic fallback below.
    }
  }
  if (body.error !== undefined) {
    try {
      return JSON.stringify(body.error)
    } catch {
      // Fall through to the generic fallback below.
    }
  }
  return fallback
}

function isFalReferencePolicyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /content_policy_violation|partner_validation_failed|likenesses of real people|private information|loc=body\.image_urls|image_urls/i.test(message)
}

function normalizeFalResultBody(body: Record<string, unknown>) {
  return body && typeof body.response === 'object' && body.response !== null
    ? body.response as Record<string, unknown>
    : body
}

function extractFalImageRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  const images = Array.isArray(record.images) ? record.images : []
  for (const image of images) {
    if (typeof image === 'string' && /^https?:\/\//i.test(image)) return { url: image }
    const imageRecord = asRecord(image)
    const url = readText(imageRecord.url)
    if (url) return imageRecord
  }
  for (const key of ['image', 'output', 'response', 'data', 'result']) {
    const nested = extractFalImageRecord(record[key])
    if (nested) return nested
  }
  const directUrl = readText(record.url) || readText(record.output_url)
  return directUrl ? { url: directUrl } : null
}

function extractFalVideoRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  for (const key of ['video', 'output', 'response', 'data', 'result']) {
    const nested = record[key]
    if (typeof nested === 'string' && /^https?:\/\//i.test(nested)) return { url: nested }
    const nestedRecord = asRecord(nested)
    const url = readText(nestedRecord.url) || readText(nestedRecord.output_url)
    if (url) return nestedRecord
    const recursive = extractFalVideoRecord(nested)
    if (recursive) return recursive
  }
  const videos = Array.isArray(record.videos) ? record.videos : []
  for (const video of videos) {
    if (typeof video === 'string' && /^https?:\/\//i.test(video)) return { url: video }
    const videoRecord = asRecord(video)
    const url = readText(videoRecord.url) || readText(videoRecord.output_url)
    if (url) return videoRecord
  }
  const directUrl = readText(record.url) || readText(record.output_url)
  return directUrl ? { url: directUrl } : null
}

function normalizeImageSize(value: unknown) {
  const record = asRecord(value)
  const width = Number(record.width)
  const height = Number(record.height)
  if (Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0) {
    const normalizeDimension = (dimension: number) => Math.max(16, Math.min(3840, Math.round(dimension / 16) * 16))
    return {
      width: normalizeDimension(width),
      height: normalizeDimension(height),
    }
  }
  const text = readText(value)
  return text || { width: 1792, height: 2688 }
}

async function submitFalImageRequest(input: {
  apiKey: string
  model: string
  prompt: string
  imageSize: unknown
  quality: string
  outputFormat: string
  referenceImageUrls?: string[]
}) {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    image_size: normalizeImageSize(input.imageSize),
    quality: input.quality,
    num_images: 1,
    output_format: input.outputFormat,
    sync_mode: false,
  }
  if (input.referenceImageUrls && input.referenceImageUrls.length > 0) {
    body.image_urls = input.referenceImageUrls
  }
  return fetchFalJson(`${FAL_QUEUE_BASE_URL}/${input.model}`, {
    method: 'POST',
    headers: buildFalHeaders(input.apiKey),
    body: JSON.stringify(body),
  })
}

async function submitFalVideoRequest(input: {
  apiKey: string
  model: string
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  resolution?: string
  generateAudio?: boolean
  syncMode?: boolean
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
}) {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: input.durationSeconds,
    aspect_ratio: input.aspectRatio ?? '16:9',
    resolution: input.resolution ?? '720p',
    generate_audio: input.generateAudio ?? true,
    sync_mode: input.syncMode ?? false,
  }
  if (input.referenceImageUrls && input.referenceImageUrls.length > 0) {
    body.image_urls = input.referenceImageUrls
  }
  if (input.referenceVideoUrls && input.referenceVideoUrls.length > 0) {
    body.video_urls = input.referenceVideoUrls
  }
  if (input.referenceAudioUrls && input.referenceAudioUrls.length > 0) {
    body.audio_urls = input.referenceAudioUrls
  }
  return fetchFalJson(`${FAL_QUEUE_BASE_URL}/${input.model}`, {
    method: 'POST',
    headers: buildFalHeaders(input.apiKey),
    body: JSON.stringify(body),
  })
}

async function submitMuapiVideoRequest(input: {
  apiKey: string
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
  webhookUrl?: string
}) {
  const url = new URL(`${MUAPI_BASE_URL}/seedance-2-vip-omni-reference`)
  if (input.webhookUrl) {
    url.searchParams.set('webhook', input.webhookUrl)
  }
  return fetchMuapiJson(url.toString(), {
    method: 'POST',
    headers: buildMuapiHeaders(input.apiKey),
    body: JSON.stringify(buildMuapiVideoPayload(input)),
  })
}

async function getMuapiResult(input: {
  apiKey: string
  requestId: string
}) {
  return fetchMuapiJson(`${MUAPI_BASE_URL}/predictions/${encodeURIComponent(input.requestId)}/result`, {
    method: 'GET',
    headers: buildMuapiHeaders(input.apiKey),
  })
}

async function getFalStatus(input: {
  apiKey: string
  model: string
  requestId: string
  statusUrl?: string | null
}) {
  const candidates = [
    `${FAL_QUEUE_BASE_URL}/${input.model}/requests/${input.requestId}/status`,
    input.statusUrl,
  ].filter((url, index, urls): url is string => (
    typeof url === 'string' && url.trim().length > 0 && urls.indexOf(url) === index
  ))

  let lastResult: Awaited<ReturnType<typeof fetchFalJson>> | null = null
  for (const candidate of candidates) {
    const url = new URL(candidate)
    url.searchParams.set('logs', '1')
    const result = await fetchFalJson(url.toString(), {
      method: 'GET',
      headers: buildFalHeaders(input.apiKey),
    })
    lastResult = result
    if (result.response.ok) return result
    if (result.response.status !== 404 && result.response.status !== 405) return result
  }
  const url = new URL(`${FAL_QUEUE_BASE_URL}/${input.model}/requests/${input.requestId}/status`)
  url.searchParams.set('logs', '1')
  return lastResult ?? fetchFalJson(url.toString(), {
    method: 'GET',
    headers: buildFalHeaders(input.apiKey),
  })
}

async function getFalResult(input: {
  apiKey: string
  model: string
  requestId: string
  responseUrl?: string | null
}) {
  const candidates = [
    `${FAL_QUEUE_BASE_URL}/${input.model}/requests/${input.requestId}/response`,
    `${FAL_QUEUE_BASE_URL}/${input.model}/requests/${input.requestId}`,
    input.responseUrl,
  ].filter((url, index, urls): url is string => (
    typeof url === 'string' && url.trim().length > 0 && urls.indexOf(url) === index
  ))

  let lastResult: Awaited<ReturnType<typeof fetchFalJson>> | null = null
  for (const url of candidates) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await fetchFalJson(url, {
        method: 'GET',
        headers: buildFalHeaders(input.apiKey),
      })
      lastResult = result
      if (result.response.ok) return result
      const transient = [500, 502, 503, 504].includes(result.response.status)
      if (!transient) break
      await sleep(1000 * (attempt + 1))
    }
    if (
      lastResult
      && lastResult.response.status !== 404
      && lastResult.response.status !== 405
      && ![500, 502, 503, 504].includes(lastResult.response.status)
    ) return lastResult
  }
  return lastResult ?? fetchFalJson(`${FAL_QUEUE_BASE_URL}/${input.model}/requests/${input.requestId}/response`, {
    method: 'GET',
    headers: buildFalHeaders(input.apiKey),
  })
}

class WorkflowCancelledError extends Error {
  workflowCancelled = true

  constructor(message = 'Output workflow run was cancelled.') {
    super(message)
    this.name = 'WorkflowCancelledError'
  }
}

function compactForPrompt(value: unknown, maxLength = 12_000) {
  const serialized = JSON.stringify(value, null, 2)
  return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}\n[truncated]` : serialized
}

function buildChapterPlan(context: Record<string, unknown>, outline: Array<Record<string, unknown>>) {
  const sequenceUnits = Array.isArray(context.sequenceUnits) ? context.sequenceUnits.map(asRecord) : []
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  return outline.map((chapter, index) => {
    const sequenceUnit = sequenceUnits[index] ?? {}
    const sequence = readEntitySequence(sequenceUnit)
    const povCharacterKey = readText(sequence.povCharacterKey ?? sequence.povActorKey ?? sequence.focalCharacterKey)
    return {
      number: Number(chapter.number ?? index + 1),
      title: readText(chapter.title) || readText(sequenceUnit.name) || `Chapter ${index + 1}`,
      narrationPov: readText(asRecord(context.wiki).narrationPov),
      povCharacterKey,
      povCharacterName: readText(sequence.povCharacterName)
        || readText(entities.find((entity) => readText(entity.key) === povCharacterKey)?.name),
      povNotes: readText(sequence.povNotes),
      synopsis: readText(chapter.synopsis) || readText(sequence.synopsis) || readText(sequenceUnit.summary),
      dramaticQuestion: readText(sequence.dramaticQuestion),
      outcome: readText(chapter.outcome) || readText(sequence.outcome),
      sequenceUnitKey: readText(sequenceUnit.key),
    }
  })
}

function buildChapterSectionPlan(input: {
  context: Record<string, unknown>
  chapterPlan: Array<Record<string, unknown>>
  chapterNumber: number
  sequenceUnitKey: string
  sequenceUnitName: string
  sectionCount: number
}) {
  const chapter = input.chapterPlan.find((entry) => readText(entry.sequenceUnitKey) === input.sequenceUnitKey)
    ?? input.chapterPlan.find((entry) => Number(entry.number) === input.chapterNumber)
    ?? input.chapterPlan[input.chapterNumber - 1]
    ?? {}
  const chapterTitle = readText(chapter.title) || input.sequenceUnitName || `Chapter ${input.chapterNumber}`
  const synopsis = readText(chapter.synopsis)
  const dramaticQuestion = readText(chapter.dramaticQuestion)
  const outcome = readText(chapter.outcome)
  const movements = [
    'Opening pressure and orientation',
    'Complication and active pursuit',
    'Reversal, reveal, or emotional turn',
    'Outcome, consequence, and transition',
  ]
  const openingStrategies = [
    'Open on a character doing something concrete under pressure, not on weather, skyline, light, mood, or abstract atmosphere.',
    'Open on a direct obstacle, interruption, or consequence from the previous beat, not on weather or city description.',
    'Open on discovery, dialogue, or a tactical choice, not on a metaphor or sensory panorama.',
    'Open on the cost of the chapter choice or the next necessary action, not on atmospheric scene-setting.',
  ]
  return Array.from({ length: input.sectionCount }, (_, index) => ({
    chapterNumber: input.chapterNumber,
    sectionNumber: index + 1,
    sectionCount: input.sectionCount,
    chapterTitle,
    title: movements[index] ?? `Section ${index + 1}`,
    openingStrategy: openingStrategies[index % openingStrategies.length],
    synopsis,
    dramaticQuestion,
    outcome,
    sequenceUnitKey: input.sequenceUnitKey,
    sequenceUnitName: input.sequenceUnitName,
  }))
}

function buildEbookCoverPromptInstruction(input: {
  context: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
}) {
  const wiki = asRecord(input.context.wiki)
  const title = titleFromContext(input.context)
  const logline = readText(wiki.logline)
  const synopsis = readText(wiki.synopsis)
  const genre = readText(wiki.genre)
  const coreConflict = readText(wiki.coreConflict)
  const artStyleDescription = readText(wiki.artStyleDescription)
  const toneTags = Array.isArray(wiki.toneTags) ? wiki.toneTags.filter((entry): entry is string => typeof entry === 'string') : []
  const visualMotifs = Array.isArray(wiki.visualMotifs) ? wiki.visualMotifs.filter((entry): entry is string => typeof entry === 'string') : []
  const entities = Array.isArray(input.context.entities) ? input.context.entities.map(asRecord).slice(0, 14) : []
  const sequenceUnits = Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord).slice(0, 8) : []
  const entityVisuals = entities.map((entity) => ({
    name: readText(entity.name),
    type: readText(entity.nodeType ?? entity.node_type),
    summary: readText(entity.summary),
    visualDescription: readOutputEntityVisualDescription(entity),
    visualTraits: readOutputEntityVisualTraits(entity),
    visualTraitMap: readOutputEntityVisualTraitMap(entity),
    voice: readOutputEntityVoiceIdentity(entity),
    voiceDescription: readOutputEntityVoiceDescription(entity),
  })).filter((entry) => entry.name || entry.summary || entry.visualDescription)

  return [
    'Create one production-ready GPT Image 2 prompt for a finished ebook front cover.',
    `Exact title text to render on the cover: "${title}"`,
    'The generated image should be a complete front cover design with title typography included in the image.',
    'Use a 2:3 vertical book-cover composition suitable for a 6x9 ebook PDF.',
    logline ? `Logline: ${logline}` : '',
    genre ? `Genre: ${genre}` : '',
    toneTags.length > 0 ? `Tone tags: ${toneTags.join(', ')}` : '',
    coreConflict ? `Core conflict: ${coreConflict}` : '',
    artStyleDescription ? `Art direction: ${artStyleDescription}` : '',
    visualMotifs.length > 0 ? `Visual motifs: ${visualMotifs.join(', ')}` : '',
    synopsis ? `Synopsis context, for cover direction only: ${synopsis}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    '',
    'World context to translate into visible cover design. Do not mention internal keys in the final image prompt:',
    compactForPrompt({
      entities: entityVisuals,
      sequenceUnits: sequenceUnits.map((unit) => ({
        name: readText(unit.name),
        summary: readText(unit.summary),
        sequence: readEntitySequence(unit),
      })),
    }, 8000),
    '',
    'Output requirements:',
    '- Return only the final image-generation prompt, no notes or markdown.',
    '- Include the exact title text and ask for clean, legible typography.',
    '- Describe cover composition, subject, setting, typography placement, color palette, lighting, material finish, and genre cues.',
    '- Avoid GraphCore wording, workflow/node terminology, schema labels, hidden lore, IDs, or non-visual explanation.',
    '- Avoid overstuffing the cover. Prefer one strong readable cover idea over a collage of every story element.',
  ].filter(Boolean).join('\n')
}

function parseJsonObject(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const candidate = fenced || trimmed
  try {
    return asRecord(JSON.parse(candidate))
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return asRecord(JSON.parse(candidate.slice(start, end + 1)))
      } catch {
        return {}
      }
    }
  }
  return {}
}

function configuredBibleSections(nodeConfig: Record<string, unknown>) {
  const sections = Array.isArray(nodeConfig.sections)
    ? nodeConfig.sections.map(asRecord)
    : []
  return sections
    .map((section, index) => ({
      key: readText(section.key) || `section_${index + 1}`,
      title: readText(section.title) || `Section ${index + 1}`,
      description: readText(section.description),
      order: Number(section.order ?? index + 1) || index + 1,
    }))
    .filter((section) => section.key && section.title)
}

function buildBibleSectionPlan(config: Record<string, unknown>, context: Record<string, unknown>) {
  const sections = configuredBibleSections(config)
  const fallbackSections = sections.length > 0 ? sections : [
    { key: 'core_premise', title: 'Core Premise', description: 'Project premise and core conflict.', order: 1 },
    { key: 'world_overview', title: 'World Overview', description: 'Main world context and status quo.', order: 2 },
    { key: 'main_characters', title: 'Main Characters', description: 'Primary character dossiers.', order: 3 },
  ]
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  const sequenceUnits = Array.isArray(context.sequenceUnits) ? context.sequenceUnits.map(asRecord) : []
  return fallbackSections.map((section) => ({
    ...section,
    entityCount: entities.length,
    sequenceUnitCount: sequenceUnits.length,
    canonPolicy: 'Use only current world graph canon. If information is missing, state "Not yet defined in canon."',
  }))
}

function buildBibleSectionInstruction(input: {
  context: Record<string, unknown>
  sectionPlan: Array<Record<string, unknown>>
  sectionKey: string
  sectionTitle: string
  sectionDescription: string
  prompt: string
  guidance: OutputGuidanceBundle
}) {
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  const sectionBrief = input.sectionPlan.find((section) => readText(section.key) === input.sectionKey) ?? {}
  const entities = Array.isArray(input.context.entities) ? input.context.entities.map(asRecord) : []
  const sequenceUnits = Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord) : []
  const relationships = Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord) : []
  const threads = Array.isArray(input.context.threads) ? input.context.threads.map(asRecord) : []
  const assets = Array.isArray(input.context.assets) ? input.context.assets.map(asRecord) : []
  const normalizedSection = `${input.sectionKey} ${input.sectionTitle}`.toLowerCase()
  const entityMatchesSection = (entity: Record<string, unknown>) => {
    const type = readText(entity.nodeType ?? entity.node_type).toLowerCase()
    if (normalizedSection.includes('character') || normalizedSection.includes('cast')) return ['actor', 'character', 'persona'].includes(type)
    if (normalizedSection.includes('location') || normalizedSection.includes('place') || normalizedSection.includes('environment')) return ['place', 'location', 'environment'].includes(type)
    if (normalizedSection.includes('faction') || normalizedSection.includes('group') || normalizedSection.includes('organization') || normalizedSection.includes('brand')) return ['group', 'faction', 'organization', 'brand'].includes(type)
    if (normalizedSection.includes('object') || normalizedSection.includes('item') || normalizedSection.includes('technology') || normalizedSection.includes('concept') || normalizedSection.includes('rule') || normalizedSection.includes('lore')) return ['object', 'item', 'prop', 'concept', 'technology', 'system'].includes(type)
    if (normalizedSection.includes('visual') || normalizedSection.includes('tone') || normalizedSection.includes('style')) return true
    return false
  }
  const sectionEntities = entities.filter(entityMatchesSection)
  const entityContext = (sectionEntities.length > 0 ? sectionEntities : entities)
    .slice(0, sectionEntities.length > 0 ? 32 : 18)
  const includeSequenceContext = normalizedSection.includes('sequence')
    || normalizedSection.includes('chapter')
    || normalizedSection.includes('timeline')
    || normalizedSection.includes('arc')
    || normalizedSection.includes('chronology')
    || normalizedSection.includes('overview')
  const includeRelationshipContext = normalizedSection.includes('relationship')
    || normalizedSection.includes('faction')
    || normalizedSection.includes('group')
    || normalizedSection.includes('timeline')
    || normalizedSection.includes('continuity')
    || normalizedSection.includes('rule')
  return [
    `Write the "${input.sectionTitle}" section for a designed canon reference document.`,
    input.sectionDescription ? `Section purpose: ${input.sectionDescription}` : '',
    Object.keys(sectionBrief).length > 0 ? `Planner section brief: ${compactForPrompt(sectionBrief, 1800)}` : '',
    input.prompt ? `User request: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    '',
    'Output requirements:',
    '- Return Markdown for this section only.',
    `- Start with exactly this heading: ## ${input.sectionTitle}`,
    '- Write a curated production-bible section, not a raw world-context dump.',
    '- Select the highest-signal canon for this section and arrange it into a readable editorial layout.',
    '- Prefer compact paragraphs, short labeled bullets, and useful subheadings over exhaustive lists.',
    '- Do not repeat the same synopsis, premise, or entity descriptions across sections unless needed for clarity.',
    '- Write reference material, not fiction prose, chapter prose, screenplay, marketing copy, or a schema explanation.',
    '- When entities have imageAssetKeys, write copy that can sit beside visual reference cards, but do not paste URLs or internal asset keys into prose.',
    '- Use only current world graph canon. Do not invent missing names, backstory, rules, or chronology.',
    '- If a subsection lacks canon, write "Not yet defined in canon" and identify what would be useful to define next.',
    '- Include continuity notes, constraints, and unresolved questions when relevant.',
    '',
    'Current world context:',
    compactForPrompt({
      wiki,
      entities: entityContext.map((entity) => ({
        key: readText(entity.key),
        name: readText(entity.name),
        type: readText(entity.nodeType ?? entity.node_type),
        summary: readText(entity.summary),
        context: readText(entity.context),
        visualDescription: readOutputEntityVisualDescription(entity),
        visualTraits: readOutputEntityVisualTraits(entity),
        visualTraitMap: readOutputEntityVisualTraitMap(entity),
        voice: readOutputEntityVoiceIdentity(entity),
        voiceDescription: readOutputEntityVoiceDescription(entity),
        imageAssetKeys: entityAssetKeys(entity, assets),
        customProperties: entity.customProperties,
      })),
      sequenceUnits: includeSequenceContext ? sequenceUnits.map((unit) => ({
        key: readText(unit.key),
        name: readText(unit.name),
        summary: readText(unit.summary),
        sequence: readEntitySequence(unit),
      })).slice(0, 36) : [],
      relationships: includeRelationshipContext ? relationships.slice(0, 70) : relationships.slice(0, 18),
      threads: threads.slice(0, 18),
    }, 12000),
  ].filter(Boolean).join('\n\n')
}

function assembleBibleMarkdown(input: {
  context: Record<string, unknown>
  upstream: Record<string, unknown>
  configuredSections: Array<{ key: string; title: string; description: string; order: number }>
  outputKind?: string
}) {
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  const title = titleFromContext(input.context)
  const subtitle = readText(wiki.logline) || readText(wiki.synopsis)
  const documentLabel = input.outputKind === 'lore_guide'
    ? 'Lore Guide'
    : input.outputKind === 'character_dossier_pack'
      ? 'Character Dossier Pack'
      : input.outputKind === 'world_reference_document'
        ? 'Reference Guide'
        : 'Story Bible'
  const sectionRecords = Object.values(input.upstream)
    .map(asRecord)
    .filter((output) => readText(output.sectionKey) || readText(output.markdown) || readText(output.text))
    .map((output) => ({
      sectionKey: readText(output.sectionKey),
      sectionTitle: readText(output.sectionTitle),
      sectionOrder: Number(output.sectionOrder ?? 9999) || 9999,
      markdown: readText(output.markdown) || readText(output.text),
    }))
    .filter((section) => section.markdown)
  const configuredOrder = new Map(input.configuredSections.map((section) => [section.key, section.order]))
  sectionRecords.sort((left, right) => {
    const leftOrder = configuredOrder.get(left.sectionKey) ?? left.sectionOrder
    const rightOrder = configuredOrder.get(right.sectionKey) ?? right.sectionOrder
    return leftOrder - rightOrder || left.sectionTitle.localeCompare(right.sectionTitle)
  })
  return [
    `# ${title} ${documentLabel}`,
    subtitle ? `> ${subtitle}` : '',
    '',
    '## About This Reference',
    'This document summarizes the current GraphCore world canon for writing, art direction, comics, video, and continuity work. Sections marked "Not yet defined in canon" are gaps in the source graph rather than new canon.',
    '',
    ...sectionRecords.map((section) => section.markdown),
  ].filter(Boolean).join('\n\n')
}

const comicSceneScriptJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'premise', 'sequenceOutcome', 'canonConstraints', 'characters', 'dramaticBeats', 'visualMoments', 'dialogueBeats', 'emotionalTurns'],
  properties: {
    title: { type: 'string' },
    premise: { type: 'string' },
    sequenceOutcome: { type: 'string' },
    canonConstraints: { type: 'array', items: { type: 'string' } },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'name', 'want', 'pressure', 'visualContinuity'],
        properties: {
          key: { type: 'string' },
          name: { type: 'string' },
          want: { type: 'string' },
          pressure: { type: 'string' },
          visualContinuity: { type: 'string' },
        },
      },
    },
    dramaticBeats: {
      type: 'array',
      minItems: 5,
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['beatNumber', 'function', 'action', 'conflict', 'turn', 'consequence', 'requiredEntityKeys'],
        properties: {
          beatNumber: { type: 'integer', minimum: 1, maximum: 24 },
          function: { type: 'string' },
          action: { type: 'string' },
          conflict: { type: 'string' },
          turn: { type: 'string' },
          consequence: { type: 'string' },
          requiredEntityKeys: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    visualMoments: { type: 'array', items: { type: 'string' } },
    dialogueBeats: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['speaker', 'intent', 'sampleLine'],
        properties: {
          speaker: { type: 'string' },
          intent: { type: 'string' },
          sampleLine: { type: 'string' },
        },
      },
    },
    emotionalTurns: { type: 'array', items: { type: 'string' } },
  },
}

const comicPagePlanJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'pageCount', 'pages'],
  properties: {
    title: { type: 'string' },
    pageCount: { type: 'integer', minimum: 1, maximum: 12 },
    pages: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pageNumber', 'storyFunction', 'includedBeats', 'omittedOrMergedBeats', 'pageTurn', 'setting', 'requiredEntityKeys', 'panelBudget', 'dialogueCaptionIntent'],
        properties: {
          pageNumber: { type: 'integer', minimum: 1, maximum: 12 },
          storyFunction: { type: 'string' },
          includedBeats: { type: 'array', items: { type: 'string' } },
          omittedOrMergedBeats: { type: 'array', items: { type: 'string' } },
          pageTurn: { type: 'string' },
          setting: { type: 'string' },
          requiredEntityKeys: { type: 'array', items: { type: 'string' } },
          panelBudget: { type: 'integer', minimum: 3, maximum: 6 },
          dialogueCaptionIntent: { type: 'string' },
        },
      },
    },
  },
}

const comicScriptJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'logline', 'pageCount', 'pages'],
  properties: {
    title: { type: 'string' },
    logline: { type: 'string' },
    pageCount: { type: 'integer', minimum: 1, maximum: 12 },
    pages: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pageNumber', 'panelLayout', 'setting', 'mood', 'requiredEntityKeys', 'continuityNotes', 'panels'],
        properties: {
          pageNumber: { type: 'integer', minimum: 1, maximum: 12 },
          panelLayout: { type: 'string' },
          setting: { type: 'string' },
          mood: { type: 'string' },
          requiredEntityKeys: { type: 'array', items: { type: 'string' } },
          continuityNotes: { type: 'string' },
          panels: {
            type: 'array',
            minItems: 3,
            maxItems: 6,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['panelNumber', 'shot', 'action', 'dialogue', 'caption', 'characters'],
              properties: {
                panelNumber: { type: 'integer', minimum: 1, maximum: 6 },
                shot: { type: 'string' },
                action: { type: 'string' },
                dialogue: { type: 'string' },
                caption: { type: 'string' },
                characters: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  },
}

function isDirectReferenceUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value)
}

function isProjectAssetStoragePath(value: string) {
  return /^generated\//i.test(value) || /^uploads\//i.test(value) || /^project-assets\//i.test(value)
}

function mimeTypeForStoragePath(storagePath: string) {
  const lower = storagePath.toLowerCase()
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  return 'image/png'
}

function referenceValuePriority(value: string) {
  const lower = value.toLowerCase()
  if (lower.includes('entity-reference-sheet') || lower.includes('entity_reference_sheet')) return 0
  if (lower.includes('reference-sheet') || lower.includes('reference_sheet')) return 1
  if (lower.includes('world_icon') || lower.includes('world-icons')) return 8
  if (lower.includes('icon')) return 7
  return 3
}

function sortReferenceValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => {
      const priorityDelta = referenceValuePriority(left) - referenceValuePriority(right)
      if (priorityDelta !== 0) return priorityDelta
      return left.localeCompare(right)
    })
}

function entityAssetKeys(entity: Record<string, unknown>, assets: Record<string, unknown>[]) {
  const metadata = asRecord(entity.metadata)
  const referenceVariants = Array.isArray(metadata.referenceVariants)
    ? metadata.referenceVariants.map(asRecord)
    : Array.isArray(entity.referenceVariants)
      ? entity.referenceVariants.map(asRecord)
      : []
  const selectedReferenceVariantAssetKey = readText(metadata.selectedReferenceVariantAssetKey)
    || readText(entity.selectedReferenceVariantAssetKey)
  const variantAssetKeys = referenceVariants
    .map((variant) => readText(variant.assetKey))
    .filter(Boolean)
  const keys = [
    selectedReferenceVariantAssetKey,
    readText(metadata.referenceSheetAssetKey),
    ...readStringArray(metadata.referenceSheetAssetKeys),
    ...variantAssetKeys,
    readText(metadata.referenceSheetUrl),
    readText(metadata.referenceSheetImageUrl),
    readText(metadata.referenceSheetStoragePath),
    readText(metadata.imageUrl),
    readText(metadata.image_url),
    readText(metadata.sourceUrl),
    readText(metadata.sourceAssetUrl),
    readText(entity.imageUrl),
    readText(entity.image_url),
    readText(entity.sourceUrl),
    readText(entity.source_url),
    readText(entity.thumbnailAssetKey),
    readText(entity.thumbnail_asset_key),
    readText(metadata.brandAtlasAssetKey),
    readText(metadata.assetKey),
    readText(metadata.storagePath),
  ].filter(Boolean)
  const matching = assets
    .filter((asset) => keys.includes(readText(asset.key)))
    .map((asset) => readText(asset.key))
  return sortReferenceValues([...keys, ...matching])
}

const referenceVariantStopWords = new Set([
  'about',
  'after',
  'again',
  'asset',
  'character',
  'default',
  'entity',
  'from',
  'generate',
  'guidance',
  'image',
  'inside',
  'into',
  'look',
  'make',
  'reference',
  'sheet',
  'shot',
  'that',
  'their',
  'them',
  'this',
  'variant',
  'visual',
  'with',
])

const referenceVariantCueWords = new Set([
  'armor',
  'armour',
  'blue',
  'cafe',
  'cape',
  'chamber',
  'costume',
  'dress',
  'gear',
  'gold',
  'green',
  'hall',
  'hat',
  'inside',
  'interior',
  'market',
  'military',
  'outfit',
  'pact',
  'red',
  'robe',
  'room',
  'samurai',
  'silver',
  'suit',
  'temple',
  'uniform',
  'wearing',
  'wears',
  'within',
])

function normalizeReferenceVariantText(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function referenceVariantAssetKey(variant: Record<string, unknown>) {
  return readText(variant.assetKey) || readText(variant.asset_key)
}

function referenceVariantStatus(variant: Record<string, unknown>) {
  return readText(variant.status).toLowerCase()
}

function referenceVariantHasUsableAsset(variant: Record<string, unknown>) {
  if (!referenceVariantAssetKey(variant)) return false
  const status = referenceVariantStatus(variant)
  return !['failed', 'cancelled', 'deleted', 'queued', 'pending', 'running'].includes(status)
}

function referenceVariantCandidatePhrases(variant: Record<string, unknown>) {
  return [
    readText(variant.variantKey),
    readText(variant.variant_key),
    readText(variant.label),
    readText(variant.summary),
    readText(variant.guidance),
    readText(variant.variantType),
    readText(variant.variant_type),
  ]
    .map(normalizeReferenceVariantText)
    .filter((value) => value.length >= 3)
}

function referenceVariantWords(variant: Record<string, unknown>) {
  return [...new Set(referenceVariantCandidatePhrases(variant)
    .flatMap((phrase) => phrase.split(' '))
    .filter((word) => word.length >= 3 && !referenceVariantStopWords.has(word)))]
}

function referenceVariantMatchScore(variant: Record<string, unknown>, prompt: string) {
  const haystack = normalizeReferenceVariantText(prompt)
  if (!haystack) return 0
  let score = 0
  for (const phrase of referenceVariantCandidatePhrases(variant)) {
    if (phrase.length >= 4 && haystack.includes(phrase)) score += phrase.split(' ').length > 1 ? 80 : 40
  }
  for (const word of referenceVariantWords(variant)) {
    if (haystack.split(' ').includes(word) || haystack.includes(word)) score += word.length <= 3 ? 8 : 12
  }
  return score
}

function referenceVariantMatchesPrompt(variant: Record<string, unknown>, prompt: string) {
  return referenceVariantMatchScore(variant, prompt) > 0
}

function promptHasReferenceVariantCue(prompt: string) {
  const words = normalizeReferenceVariantText(prompt).split(' ').filter(Boolean)
  return words.some((word) => referenceVariantCueWords.has(word))
}

function selectReferenceVariantForPromptDetailed(variants: Record<string, unknown>[], prompt: string, entityKey = '') {
  const scored = variants
    .map((variant) => ({
      variant,
      score: referenceVariantMatchScore(variant, prompt),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return readText(left.variant.label).localeCompare(readText(right.variant.label))
    })

  const diagnostics: string[] = []
  const completed = scored.find((entry) => referenceVariantHasUsableAsset(entry.variant))
  if (completed) {
    return {
      selectedVariant: completed.variant,
      reason: 'variant_match',
      diagnostics,
    }
  }

  const matchedUnavailable = scored[0]?.variant
  if (matchedUnavailable) {
    const key = readText(matchedUnavailable.variantKey) || readText(matchedUnavailable.variant_key)
    const status = referenceVariantStatus(matchedUnavailable)
    diagnostics.push(`${status === 'queued' || status === 'running' || status === 'pending' ? 'variant_pending' : 'variant_unavailable'}:${entityKey}:${key || 'unknown'}`)
  } else if (variants.length > 0 && promptHasReferenceVariantCue(prompt)) {
    diagnostics.push(`variant_not_found:${entityKey}`)
  }

  return {
    selectedVariant: null,
    reason: 'default',
    diagnostics,
  }
}

function selectReferenceVariantForPrompt(variants: Record<string, unknown>[], prompt: string) {
  return selectReferenceVariantForPromptDetailed(variants, prompt).selectedVariant
}

function defaultReferenceAssetKeyForEntity(entity: Record<string, unknown>, assets: Record<string, unknown>[]) {
  const metadata = asRecord(entity.metadata)
  const keys = [
    readText(metadata.referenceSheetAssetKey),
    ...readStringArray(metadata.referenceSheetAssetKeys),
    readText(metadata.referenceSheetUrl),
    readText(metadata.referenceSheetImageUrl),
    readText(metadata.referenceSheetStoragePath),
    readText(metadata.imageUrl),
    readText(metadata.image_url),
    readText(metadata.sourceUrl),
    readText(metadata.sourceAssetUrl),
    readText(entity.imageUrl),
    readText(entity.image_url),
    readText(entity.sourceUrl),
    readText(entity.source_url),
    readText(entity.thumbnailAssetKey),
    readText(entity.thumbnail_asset_key),
    readText(metadata.assetKey),
    readText(metadata.storagePath),
  ].filter(Boolean)
  const matching = assets
    .filter((asset) => keys.includes(readText(asset.key)))
    .map((asset) => readText(asset.key))
  return sortReferenceValues([...keys, ...matching])[0] ?? ''
}

function resolveImageOutputReferenceSelection(entity: Record<string, unknown>, assets: Record<string, unknown>[], prompt: string) {
  const metadata = asRecord(entity.metadata)
  const entityKey = readText(entity.key)
  const referenceVariants = Array.isArray(metadata.referenceVariants)
    ? metadata.referenceVariants.map(asRecord)
    : Array.isArray(entity.referenceVariants)
      ? entity.referenceVariants.map(asRecord)
      : []
  const selected = selectReferenceVariantForPromptDetailed(referenceVariants, prompt, entityKey)
  const selectedVariant = selected.selectedVariant
  const selectedVariantAssetKey = selectedVariant ? referenceVariantAssetKey(selectedVariant) : ''
  const defaultAssetKey = defaultReferenceAssetKeyForEntity(entity, assets)
  const primaryAssetKey = selectedVariantAssetKey || defaultAssetKey
  const selectedReferenceVariantKey = selectedVariant
    ? readText(selectedVariant.variantKey) || readText(selectedVariant.variant_key)
    : 'default'
  return {
    primaryAssetKey,
    selectedReferenceVariantKey,
    selectedReferenceVariantAssetKey: selectedVariantAssetKey,
    selectedReferenceVariantLabel: selectedVariant ? readText(selectedVariant.label) || selectedReferenceVariantKey : 'Default',
    selectedReferenceVariantSummary: selectedVariant ? readText(selectedVariant.summary) : '',
    selectedReferenceVariantType: selectedVariant ? readText(selectedVariant.variantType) || readText(selectedVariant.variant_type) : 'default',
    referenceSelectionReason: selected.reason,
    referenceDiagnostics: primaryAssetKey ? selected.diagnostics : [...selected.diagnostics, `missing_reference:${entityKey}`],
    referenceVariants,
  }
}

function buildDeterministicComicAssetPack(context: Record<string, unknown>) {
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  const assets = Array.isArray(context.assets) ? context.assets.map(asRecord) : []
  const packedEntities = entities.slice(0, 16).map((entity) => ({
    key: readText(entity.key),
    name: readText(entity.name),
    type: readText(entity.nodeType ?? entity.node_type),
    role: readText(entity.nodeType ?? entity.node_type),
    summary: readText(entity.summary),
    visualDescription: readOutputEntityVisualDescription(entity),
    visualTraits: readOutputEntityVisualTraits(entity),
    visualTraitMap: readOutputEntityVisualTraitMap(entity),
    voice: readOutputEntityVoiceIdentity(entity),
    voiceDescription: readOutputEntityVoiceDescription(entity),
    referenceVariants: Array.isArray(asRecord(entity.metadata).referenceVariants) ? asRecord(entity.metadata).referenceVariants : [],
    selectedReferenceVariantKey: readText(asRecord(entity.metadata).selectedReferenceVariantKey) || readText(entity.selectedReferenceVariantKey) || 'default',
    assetKeys: entityAssetKeys(entity, assets),
  })).filter((entity) => entity.key || entity.name)
  return {
    entities: packedEntities,
    missingReferenceEntityKeys: packedEntities.filter((entity) => entity.assetKeys.length === 0).map((entity) => entity.key),
  }
}

async function refreshWorldContextVisualReferences(client: DatabaseClient, run: OutputWorkflowRun, context: Record<string, unknown>) {
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  if (entities.length === 0) return context
  const entityKeys = [...new Set(entities.map((entity) => readText(entity.key)).filter(Boolean))]
  if (entityKeys.length === 0) return context

  const latestResponse = await client
    .from('world_entities')
    .select('key, thumbnail_asset_key, metadata, updated_at')
    .eq('draft_id', run.draftId)
    .in('key', entityKeys)
  const latestRows = latestResponse.error ? [] : (latestResponse.data ?? []).map(asRecord)
  const latestByKey = new Map(latestRows.map((row) => [readText(row.key), row]).filter(([key]) => key))
  const variantResponse = await client
    .from('world_entity_visual_variants')
    .select('entity_key, variant_key, label, summary, variant_type, asset_key, guidance, status, metadata')
    .eq('draft_id', run.draftId)
    .in('entity_key', entityKeys)
  const variantsByEntityKey = new Map<string, Record<string, unknown>[]>()
  if (!variantResponse.error) {
    for (const row of variantResponse.data ?? []) {
      const record = asRecord(row)
      const entityKey = readText(record.entity_key)
      if (!entityKey) continue
      const entry = {
        variantKey: readText(record.variant_key),
        label: readText(record.label),
        summary: readText(record.summary),
        variantType: readText(record.variant_type),
        assetKey: readText(record.asset_key),
        guidance: readText(record.guidance),
        status: readText(record.status),
        metadata: asRecord(record.metadata),
      }
      variantsByEntityKey.set(entityKey, [...(variantsByEntityKey.get(entityKey) ?? []), entry])
    }
  }
  const refreshedEntities = entities.map((entity) => {
    const key = readText(entity.key)
    const latest = latestByKey.get(key)
    const variants = variantsByEntityKey.get(key) ?? []
    const selectedVariant = selectReferenceVariantForPrompt(variants, run.prompt)
    if (!latest && variants.length === 0) return entity
    const entityMetadata = asRecord(entity.metadata)
    const latestMetadata = asRecord(latest?.metadata)
    const latestThumbnail = readText(latest?.thumbnail_asset_key)
    return {
      ...entity,
      thumbnailAssetKey: latestThumbnail || readText(entity.thumbnailAssetKey),
      thumbnail_asset_key: latestThumbnail || readText(entity.thumbnail_asset_key),
      metadata: {
        ...entityMetadata,
        ...latestMetadata,
        referenceVariants: variants,
        selectedReferenceVariantKey: selectedVariant ? readText(selectedVariant.variantKey) : 'default',
        selectedReferenceVariantAssetKey: selectedVariant ? readText(selectedVariant.assetKey) : '',
      },
      referenceVariants: variants,
      selectedReferenceVariantKey: selectedVariant ? readText(selectedVariant.variantKey) : 'default',
      selectedReferenceVariantAssetKey: selectedVariant ? readText(selectedVariant.assetKey) : '',
      updatedAt: readText(latest?.updated_at) || readText(entity.updatedAt),
      updated_at: readText(latest?.updated_at) || readText(entity.updated_at),
    }
  })

  const existingAssets = Array.isArray(context.assets) ? context.assets.map(asRecord) : []
  const existingAssetKeys = new Set(existingAssets.map((asset) => readText(asset.key)).filter(Boolean))
  const referencedAssetKeys = refreshedEntities
    .flatMap((entity) => entityAssetKeys(entity, existingAssets))
    .filter((value) => value && !isDirectReferenceUrl(value) && !isProjectAssetStoragePath(value) && !existingAssetKeys.has(value))
  const missingAssetKeys = [...new Set(referencedAssetKeys)]
  let hydratedAssets: Record<string, unknown>[] = []
  if (missingAssetKeys.length > 0) {
    const assetResponse = await client
      .from('project_assets')
      .select('key, name, kind, mime_type, storage_path, metadata')
      .eq('project_id', run.projectId)
      .in('key', missingAssetKeys)
    hydratedAssets = assetResponse.error
      ? []
      : (assetResponse.data ?? []).map((asset) => ({
        key: readText(asRecord(asset).key),
        name: readText(asRecord(asset).name),
        kind: readText(asRecord(asset).kind),
        mimeType: readText(asRecord(asset).mime_type),
        mime_type: readText(asRecord(asset).mime_type),
        storagePath: readText(asRecord(asset).storage_path),
        storage_path: readText(asRecord(asset).storage_path),
        metadata: asRecord(asRecord(asset).metadata),
      }))
  }

  return {
    ...context,
    entities: refreshedEntities,
    assets: [...existingAssets, ...hydratedAssets],
    refreshedVisualReferences: true,
    refreshedVisualReferenceAssetKeys: hydratedAssets.map((asset) => readText(asset.key)).filter(Boolean),
  }
}

function buildDeterministicImageAssetPack(context: Record<string, unknown>, options: number | { limit?: number; prompt?: string } = 8) {
  const limit = typeof options === 'number' ? options : Math.max(1, Math.floor(Number(options.limit ?? 8) || 8))
  const prompt = typeof options === 'number' ? '' : readText(options.prompt)
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  const assets = Array.isArray(context.assets) ? context.assets.map(asRecord) : []
  const packedEntities = entities.slice(0, limit).map((entity) => {
    const visualDescription = readOutputEntityVisualDescription(entity)
    const referenceSelection = resolveImageOutputReferenceSelection(entity, assets, prompt)
    return {
      key: readText(entity.key),
      name: readText(entity.name),
      type: readText(entity.nodeType ?? entity.node_type),
      role: readText(entity.nodeType ?? entity.node_type),
      summary: readText(entity.summary),
      visualDescription,
      visualTraits: readOutputEntityVisualTraits(entity),
      visualTraitMap: readOutputEntityVisualTraitMap(entity),
      referenceVariants: referenceSelection.referenceVariants,
      selectedReferenceVariantKey: referenceSelection.selectedReferenceVariantKey,
      selectedReferenceVariantLabel: referenceSelection.selectedReferenceVariantLabel,
      selectedReferenceVariantSummary: referenceSelection.selectedReferenceVariantSummary,
      selectedReferenceVariantType: referenceSelection.selectedReferenceVariantType,
      selectedReferenceVariantAssetKey: referenceSelection.selectedReferenceVariantAssetKey,
      referenceSelectionReason: referenceSelection.referenceSelectionReason,
      referenceDiagnostics: referenceSelection.referenceDiagnostics,
      primaryAssetKey: referenceSelection.primaryAssetKey,
      assetKeys: referenceSelection.primaryAssetKey ? [referenceSelection.primaryAssetKey] : [],
    }
  }).filter((entity) => entity.key || entity.name)
  const referenceDiagnostics = [...new Set(packedEntities.flatMap((entity) => readStringArray(entity.referenceDiagnostics)))]
  return {
    entities: packedEntities,
    selectedReferenceVariants: packedEntities
      .filter((entity) => readText(entity.selectedReferenceVariantKey) && readText(entity.selectedReferenceVariantKey) !== 'default')
      .map((entity) => ({
        entityKey: entity.key,
        entityName: entity.name,
        variantKey: entity.selectedReferenceVariantKey,
        label: entity.selectedReferenceVariantLabel,
        summary: entity.selectedReferenceVariantSummary,
        variantType: entity.selectedReferenceVariantType,
        assetKey: entity.selectedReferenceVariantAssetKey,
      })),
    referenceDiagnostics,
    missingReferenceEntityKeys: packedEntities.filter((entity) => entity.assetKeys.length === 0).map((entity) => entity.key),
  }
}

function mergeComicSelectedEntitiesWithFallback(selectedEntities: Array<Record<string, unknown>>, fallbackPack: Record<string, unknown>) {
  const fallbackEntities = Array.isArray(fallbackPack.entities) ? fallbackPack.entities.map(asRecord) : []
  const fallbackByKey = new Map(fallbackEntities.map((entity) => [readText(entity.key), entity]).filter(([key]) => key))
  const merged = selectedEntities.length > 0 ? selectedEntities : fallbackEntities
  return merged.map((entity) => {
    const key = readText(entity.key)
    const fallback = fallbackByKey.get(key) ?? {}
    const assetKeys = [
      ...readStringArray(fallback.assetKeys),
      ...readStringArray(entity.assetKeys),
    ]
    const fallbackVisualDescription = readText(fallback.visualDescription)
    const visualTraits = [
      ...readStringArray(fallback.visualTraits),
      ...readStringArray(entity.visualTraits),
    ]
    const fallbackTraitMap = asRecord(fallback.visualTraitMap)
    const entityTraitMap = asRecord(entity.visualTraitMap)
    return {
      key,
      name: readText(entity.name) || readText(fallback.name),
      type: readText(entity.type) || readText(fallback.type),
      role: readText(entity.role) || readText(fallback.role) || readText(entity.type) || readText(fallback.type),
      summary: readText(entity.summary) || readText(fallback.summary),
      visualDescription: fallbackVisualDescription || readText(entity.visualDescription),
      visualTraits: [...new Set(visualTraits)].filter(Boolean),
      visualTraitMap: { ...fallbackTraitMap, ...entityTraitMap },
      assetKeys: [...new Set(assetKeys)].filter(Boolean),
    }
  }).filter((entity) => entity.key || entity.name).slice(0, 16)
}

export function buildDeterministicCinematicAssetPack(context: Record<string, unknown>) {
  return buildDeterministicComicAssetPack(context)
}

function cinematicAssetPackEntities(assetPack: Record<string, unknown>) {
  return Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
}

function cinematicAssetPackEntityKeys(assetPack: Record<string, unknown>) {
  return cinematicAssetPackEntities(assetPack).map((entity) => readText(entity.key)).filter(Boolean)
}

function referencePlanKeys(plan: Record<string, unknown>) {
  return [...new Set([
    ...readStringArray(plan.primaryCastRefIds),
    ...readStringArray(plan.supportingCastRefIds),
    ...readStringArray(plan.locationRefIds),
    ...readStringArray(plan.propRefIds),
    ...readStringArray(plan.conceptRefIds),
    ...readStringArray(plan.continuityAnchorRefIds),
  ].filter(Boolean))]
}

function cloneCinematicAssetPackEntity(entity: Record<string, unknown>, maxAssetKeys = 2) {
  return {
    ...entity,
    assetKeys: sortReferenceValues(readStringArray(entity.assetKeys)).slice(0, Math.max(1, maxAssetKeys)),
  }
}

function filterCinematicAssetPack(assetPack: Record<string, unknown>, keys: string[], limit = 16, maxAssetKeysPerEntity = 2) {
  const keySet = new Set(keys.filter(Boolean))
  const entities = cinematicAssetPackEntities(assetPack)
    .filter((entity) => keySet.has(readText(entity.key)))
    .slice(0, Math.max(1, limit))
    .map((entity) => cloneCinematicAssetPackEntity(entity, maxAssetKeysPerEntity))
  const selectedKeys = new Set(entities.map((entity) => readText(entity.key)).filter(Boolean))
  return {
    ...assetPack,
    entities,
    selectedEntityKeys: [...selectedKeys],
    missingReferenceEntityKeys: readStringArray(assetPack.missingReferenceEntityKeys)
      .filter((key) => selectedKeys.has(key)),
  }
}

function buildFallbackCinematicV2ReferencePlan(assetPack: Record<string, unknown>, maxReferenceCount = 16) {
  const entities = cinematicAssetPackEntities(assetPack)
  const byType = (types: string[]) => entities
    .filter((entity) => types.includes(readText(entity.type) || readText(entity.role)))
    .map((entity) => readText(entity.key))
    .filter(Boolean)
  const primaryCastRefIds = byType(['actor', 'character', 'group']).slice(0, 5)
  const locationRefIds = byType(['place', 'environment', 'location', 'location_spot']).slice(0, 3)
  const propRefIds = byType(['object', 'item', 'inventory_item', 'prop']).slice(0, 4)
  const conceptRefIds = byType(['concept']).slice(0, 3)
  const selected = [...new Set([...primaryCastRefIds, ...locationRefIds, ...propRefIds, ...conceptRefIds])]
    .slice(0, Math.max(1, maxReferenceCount))
  return cinematicV2ReferencePlanSchema.parse({
    primaryCastRefIds: selected.filter((key) => primaryCastRefIds.includes(key)),
    supportingCastRefIds: [],
    locationRefIds: selected.filter((key) => locationRefIds.includes(key)),
    propRefIds: selected.filter((key) => propRefIds.includes(key)),
    conceptRefIds: selected.filter((key) => conceptRefIds.includes(key)),
    continuityAnchorRefIds: selected.filter((key) => !primaryCastRefIds.includes(key) && !locationRefIds.includes(key) && !propRefIds.includes(key) && !conceptRefIds.includes(key)),
    rejectedRefs: cinematicAssetPackEntityKeys(assetPack)
      .filter((key) => !selected.includes(key))
      .map((refId) => ({ refId, reason: 'Not selected by deterministic cinematic reference fallback.' })),
    rationale: 'Deterministic fallback selected the most likely cast, location, prop, and concept references from the sequence-scoped asset pack.',
    confidence: selected.length > 0 ? 0.55 : 0.2,
  })
}

function sanitizeCinematicV2ReferencePlan(plan: Record<string, unknown>, assetPack: Record<string, unknown>, maxReferenceCount = 16) {
  const allowed = new Set(cinematicAssetPackEntityKeys(assetPack))
  const takeValid = (values: string[]) => values.filter((key, index) => key && allowed.has(key) && values.indexOf(key) === index)
  const raw = cinematicV2ReferencePlanSchema.parse(plan)
  const ordered = [
    ...takeValid(raw.primaryCastRefIds),
    ...takeValid(raw.supportingCastRefIds),
    ...takeValid(raw.locationRefIds),
    ...takeValid(raw.propRefIds),
    ...takeValid(raw.conceptRefIds),
    ...takeValid(raw.continuityAnchorRefIds),
  ]
  const capped = new Set([...new Set(ordered)].slice(0, Math.max(1, maxReferenceCount)))
  const invalidRejected = referencePlanKeys(raw)
    .filter((key) => !allowed.has(key))
    .map((refId) => ({ refId, reason: 'Rejected because it is not in the sequence-scoped cinematic asset pack.' }))
  const unselectedRejected = cinematicAssetPackEntityKeys(assetPack)
    .filter((key) => !capped.has(key))
    .map((refId) => ({ refId, reason: 'Not needed for this cinematic-level reference plan.' }))
  const sanitized = cinematicV2ReferencePlanSchema.parse({
    ...raw,
    primaryCastRefIds: takeValid(raw.primaryCastRefIds).filter((key) => capped.has(key)),
    supportingCastRefIds: takeValid(raw.supportingCastRefIds).filter((key) => capped.has(key)),
    locationRefIds: takeValid(raw.locationRefIds).filter((key) => capped.has(key)),
    propRefIds: takeValid(raw.propRefIds).filter((key) => capped.has(key)),
    conceptRefIds: takeValid(raw.conceptRefIds).filter((key) => capped.has(key)),
    continuityAnchorRefIds: takeValid(raw.continuityAnchorRefIds).filter((key) => capped.has(key)),
    rejectedRefs: [...raw.rejectedRefs, ...invalidRejected, ...unselectedRejected]
      .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.refId === entry.refId) === index),
  })
  if (referencePlanKeys(sanitized).length > 0) return sanitized
  return buildFallbackCinematicV2ReferencePlan(assetPack, maxReferenceCount)
}

function entityMentionedInShotText(entity: Record<string, unknown>, shotText: string) {
  const candidates = [
    readText(entity.key),
    readText(entity.name),
    ...readStringArray(entity.aliases),
  ]
  return candidates
    .map((candidate) => normalizeComicReferenceText(candidate).replace(/_/g, ' '))
    .filter((candidate) => candidate.length > 2)
    .some((candidate) => shotText.includes(candidate))
}

export function buildCinematicV2ShotAssetPack(input: {
  assetPack: Record<string, unknown>
  referencePlan?: Record<string, unknown> | null
  shot: Record<string, unknown>
  maxEntityCount?: number
  maxAssetKeysPerEntity?: number
}) {
  const shot = cinematicV2ShotSchema.parse(input.shot)
  const parsedReferencePlan = cinematicV2ReferencePlanSchema.safeParse(input.referencePlan ?? {})
  const referencePlan = parsedReferencePlan.success && referencePlanKeys(parsedReferencePlan.data).length > 0
    ? parsedReferencePlan.data
    : buildFallbackCinematicV2ReferencePlan(input.assetPack)
  const plannedKeys = new Set(referencePlanKeys(referencePlan))
  const byKey = new Map(cinematicAssetPackEntities(input.assetPack).map((entity) => [readText(entity.key), entity]).filter(([key]) => key))
  const shotText = normalizeComicReferenceText([
    shot.title,
    shot.description,
    shot.action,
    shot.continuityInputs.join(' '),
    shot.camera.framing,
    shot.camera.angle,
    shot.camera.movement,
    shot.camera.screenDirectionRule,
    ...shot.dialogue.map((line) => `${line.speakerRefId} ${line.text} ${line.emotion}`),
  ].filter(Boolean).join(' ')).replace(/_/g, ' ')
  const priorityKeys = [
    ...shot.speakerRefIds,
    ...shot.visibleCharacterRefIds,
    ...(shot.locationRefId ? [shot.locationRefId] : []),
    ...shot.propRefIds,
  ].filter((key) => plannedKeys.has(key) && byKey.has(key))
  const continuityKeys = referencePlan.continuityAnchorRefIds
    .filter((key) => plannedKeys.has(key) && byKey.has(key))
    .filter((key) => entityMentionedInShotText(byKey.get(key) ?? {}, shotText))
  const textMentionedKeys = [...plannedKeys]
    .filter((key) => byKey.has(key))
    .filter((key) => entityMentionedInShotText(byKey.get(key) ?? {}, shotText))
  const fallbackKeys = [
    ...referencePlan.primaryCastRefIds,
    ...referencePlan.locationRefIds,
    ...referencePlan.propRefIds,
    ...referencePlan.conceptRefIds,
  ].filter((key) => plannedKeys.has(key) && byKey.has(key))
  const directKeys = [...new Set([
    ...priorityKeys,
    ...continuityKeys,
    ...textMentionedKeys,
  ])]
  const selectedKeys = (directKeys.length > 0 ? directKeys : fallbackKeys)
    .slice(0, Math.max(1, input.maxEntityCount ?? 6))
  const shotAssetPack = filterCinematicAssetPack(input.assetPack, selectedKeys, input.maxEntityCount ?? 6, input.maxAssetKeysPerEntity ?? 2)
  return {
    ...shotAssetPack,
    shotId: shot.id,
    shotIndex: shot.index,
    shotReferenceKeys: selectedKeys,
    referencePlan,
    text: JSON.stringify(shotAssetPack, null, 2),
  }
}

function cinematicContextBrief(context: Record<string, unknown>) {
  const wiki = asRecord(context.wiki ?? context.worldWiki)
  const sequenceUnits = Array.isArray(context.sequenceUnits) ? context.sequenceUnits.map(asRecord) : []
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  const relationships = Array.isArray(context.relationships) ? context.relationships.map(asRecord) : []
  return {
    wiki: {
      title: readText(wiki.title),
      logline: readText(wiki.logline),
      synopsis: readText(wiki.synopsis),
      genre: readText(wiki.genre),
      toneTags: readStringArray(wiki.toneTags),
      visualStyle: readText(wiki.artStyleDescription) || readText(wiki.visualStyle),
    },
    sequenceUnits: sequenceUnits.slice(0, 4).map((unit) => ({
      key: readText(unit.key),
      name: readText(unit.name),
      summary: readText(unit.summary),
      sequence: readEntitySequence(unit),
    })),
    entities: entities.slice(0, 18).map((entity) => ({
      key: readText(entity.key),
      name: readText(entity.name),
      type: readText(entity.nodeType ?? entity.node_type),
      summary: readText(entity.summary),
      visualDescription: readOutputEntityVisualDescription(entity),
      visualTraits: readOutputEntityVisualTraits(entity),
      visualTraitMap: readOutputEntityVisualTraitMap(entity),
      voice: readOutputEntityVoiceIdentity(entity),
      voiceDescription: readOutputEntityVoiceDescription(entity),
    })),
    relationships: relationships.slice(0, 32),
  }
}

function isUgcCinematicPresetFamily(presetFamily: string) {
  const normalized = presetFamily.toLowerCase()
  return normalized.startsWith('ugc') || normalized.includes('brand') || normalized.includes('ad')
}

function cinematicScriptAuthoringJsonSchemaForPreset(presetFamily: string) {
  const includeUgcDirectives = isUgcCinematicPresetFamily(presetFamily)
  const schema: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: [
      'title',
      'logline',
      'tone',
      'continuityLock',
      'scenes',
      'entityRefs',
      'shots',
      ...(includeUgcDirectives ? ['ugcDirectives'] : []),
    ],
    properties: {
      title: { type: 'string' },
      logline: { type: 'string' },
      tone: { type: 'string' },
      continuityLock: { type: 'string' },
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'title', 'summary', 'location'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            summary: { type: 'string' },
            location: { type: 'string' },
          },
        },
      },
      entityRefs: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'role'],
          properties: {
            id: { type: 'string' },
            role: { type: 'string' },
          },
        },
      },
      shots: {
        type: 'array',
        minItems: 1,
        maxItems: 36,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'sceneId',
            'title',
            'beat',
            'emotionalBeat',
            'durationSeconds',
            'framing',
            'cameraMovement',
            'visualAction',
            'composition',
            'participants',
            'location',
            'props',
            'actions',
            'audioCues',
            'dialogue',
            'forceTakeBreak',
          ],
          properties: {
            id: { type: 'string' },
            sceneId: { type: 'string' },
            title: { type: 'string' },
            beat: { type: 'string' },
            emotionalBeat: { type: 'string' },
            durationSeconds: { type: 'number' },
            framing: { type: 'string' },
            cameraMovement: { type: 'string' },
            visualAction: { type: 'string' },
            composition: { type: 'string' },
            participants: { type: 'array', items: { type: 'string' } },
            location: { type: 'string' },
            props: { type: 'array', items: { type: 'string' } },
            actions: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['actor', 'verb', 'target', 'prop', 'stagingNotes', 'startSeconds', 'endSeconds'],
                properties: {
                  actor: { type: 'string' },
                  verb: { type: 'string' },
                  target: { type: 'string' },
                  prop: { type: 'string' },
                  stagingNotes: { type: 'string' },
                  startSeconds: { type: 'number' },
                  endSeconds: { type: 'number' },
                },
              },
            },
            audioCues: { type: 'array', items: { type: 'string' } },
            dialogue: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['speaker', 'line', 'delivery', 'startSeconds', 'endSeconds'],
                properties: {
                  speaker: { type: 'string' },
                  line: { type: 'string' },
                  delivery: { type: 'string' },
                  startSeconds: { type: 'number' },
                  endSeconds: { type: 'number' },
                },
              },
            },
            forceTakeBreak: { type: 'boolean' },
          },
        },
      },
    },
  }
  if (includeUgcDirectives) {
    const properties = asRecord(schema.properties)
    properties.ugcDirectives = {
      type: 'object',
      additionalProperties: false,
      required: ['formulaFamily', 'hookType', 'proofMoment', 'ctaType'],
      properties: {
        formulaFamily: { type: 'string' },
        hookType: { type: 'string' },
        proofMoment: { type: 'string' },
        ctaType: { type: 'string' },
      },
    }
  }
  return schema
}

function normalizeMaybeNullString(value: unknown) {
  return readText(value) || null
}

function clampShotDuration(value: unknown, fallback = 4) {
  const numeric = typeof value === 'number' ? value : Number(readText(value))
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(1, Math.min(15, Math.round(numeric)))
}

function coerceCinematicShotType(value: unknown) {
  const text = readText(value)
  return ['establishing', 'dialogue', 'reveal', 'action', 'insert', 'transition', 'custom'].includes(text) ? text : 'custom'
}

function coerceCinematicAudioKind(value: unknown) {
  const text = readText(value)
  return ['dialogue', 'ambience', 'sfx', 'music', 'silence', 'offscreen'].includes(text) ? text : 'ambience'
}

function canonicalCinematicEntityKey(entity: Record<string, unknown>, fallbackId: string) {
  const assetKey = readStringArray(entity.assetKeys)[0] ?? readText(entity.assetKey)
  const name = readText(entity.name)
  const key = readText(entity.key) || readText(entity.id) || fallbackId
  return [
    name ? `name:${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}` : '',
    assetKey ? `asset:${assetKey}` : '',
    key ? `key:${key.toLowerCase().replace(/^world\.[^.]+\./, '').replace(/[^a-z0-9]+/g, '')}` : '',
  ].filter(Boolean)[0] ?? `fallback:${fallbackId}`
}

function buildCinematicEntityBindings(assetPack: Record<string, unknown>) {
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  const byKey = new Map<string, Record<string, unknown>>()
  for (const [index, entity] of entities.entries()) {
    const canonicalKey = canonicalCinematicEntityKey(entity, `entity_${index + 1}`)
    const existing = byKey.get(canonicalKey)
    if (!existing) {
      byKey.set(canonicalKey, { ...entity, _originalIndex: index })
      continue
    }
    const existingAsset = readStringArray(existing.assetKeys)[0] ?? readText(existing.assetKey)
    const nextAsset = readStringArray(entity.assetKeys)[0] ?? readText(entity.assetKey)
    if (!existingAsset && nextAsset) {
      byKey.set(canonicalKey, { ...entity, _originalIndex: readText(existing._originalIndex) || index })
    }
  }
  return Array.from(byKey.values()).slice(0, 16).map((entity, index) => {
    const type = readText(entity.type)
    const role = readText(entity.role) || type || 'reference'
    const kind = type === 'place' || role === 'place' || role === 'environment'
      ? 'environment'
      : type === 'item' || role === 'item' || role === 'prop'
        ? 'item'
        : role === 'group'
          ? 'character'
          : 'character'
    return {
      id: readText(entity.key) || readText(entity.id) || `entity_${index + 1}`,
      kind,
      role,
      label: readText(entity.name) || readText(entity.key) || `Entity ${index + 1}`,
      sourceName: readText(entity.name),
      summary: readText(entity.summary),
      assetKey: (readStringArray(entity.assetKeys)[0] ?? readText(entity.assetKey)) || null,
      stagingNotes: [
        readText(entity.visualDescription),
        readStringArray(entity.visualTraits).length > 0 ? `Traits: ${readStringArray(entity.visualTraits).join(', ')}` : '',
      ].filter(Boolean).join(' '),
      priority: Math.max(10, 90 - index * 4),
      required: true,
    }
  })
}

function sanitizeCinematicScriptText(value: unknown) {
  return readText(value)
    .replace(/@[\s_-]*(?:image|video|audio)\s*\d+/gi, '')
    .replace(/\b(?:GPT\s*Image\s*2|Seedance\s*2(?:\.0)?|gpt-image-2|reference-to-video)\b/gi, '')
    .replace(/\b(?:480p|720p|1080p)\b/gi, '')
    .replace(/\b(?:16:9|9:16|1:1|4:3|3:4)\b/g, '')
    .replace(/\bkeyframes?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function normalizeDirectorDialogue(value: unknown, durationSeconds = 1) {
  const entries = Array.isArray(value) ? value.map(asRecord) : []
  return entries.map((entry) => ({
    speaker: sanitizeCinematicScriptText(entry.speaker ?? entry.speakerRefId),
    line: sanitizeCinematicScriptText(entry.line),
    delivery: sanitizeCinematicScriptText(entry.delivery),
    startSeconds: Math.max(0, Math.min(durationSeconds, Number(entry.startSeconds ?? 0) || 0)),
    endSeconds: Math.max(0, Math.min(durationSeconds, Number(entry.endSeconds ?? Math.min(durationSeconds, 2)) || Math.min(durationSeconds, 2))),
  })).filter((entry) => entry.line)
}

function normalizeDirectorActions(value: unknown, input: {
  shotId: string
  participantRefIds: string[]
  propRefIds: string[]
  beat: string
  visualAction: string
  durationSeconds: number
}) {
  const entries = Array.isArray(value) ? value.map(asRecord) : []
  const normalized = entries.map((entry, index) => {
    const startSeconds = Math.max(0, Math.min(input.durationSeconds, Number(entry.startSeconds ?? 0) || 0))
    const endSeconds = Math.max(startSeconds, Math.min(input.durationSeconds, Number(entry.endSeconds ?? input.durationSeconds) || input.durationSeconds))
    return {
      actor: sanitizeCinematicScriptText(entry.actor ?? entry.actorRefId) || input.participantRefIds[0] || '',
      verb: sanitizeCinematicScriptText(entry.verb ?? entry.action) || input.beat || `visible action ${index + 1}`,
      target: sanitizeCinematicScriptText(entry.target ?? entry.targetRefId),
      prop: sanitizeCinematicScriptText(entry.prop ?? entry.propRefId) || input.propRefIds[0] || '',
      stagingNotes: sanitizeCinematicScriptText(entry.stagingNotes ?? entry.description) || input.visualAction || input.beat,
      startSeconds,
      endSeconds,
    }
  }).filter((entry) => entry.verb || entry.stagingNotes)
  if (normalized.length > 0) return normalized.slice(0, 5)
  return [{
    actor: input.participantRefIds[0] || '',
    verb: input.beat || 'moves through the shot',
    target: '',
    prop: input.propRefIds[0] || '',
    stagingNotes: input.visualAction || input.beat || 'Stage the shot as one clear visible action.',
    startSeconds: 0,
    endSeconds: input.durationSeconds,
  }]
}

function normalizeCinematicScriptAuthoring(input: {
  value: Record<string, unknown>
  fallback: Record<string, unknown>
  assetPack: Record<string, unknown>
  presetFamily: string
  maxTotalDurationSeconds: number
}) {
  const { value, fallback, assetPack } = input
  const rawShots = Array.isArray(value.shots) ? value.shots.map(asRecord) : []
  const source = rawShots.length > 0 ? value : fallback
  const sourceShots = Array.isArray(source.shots) ? source.shots.map(asRecord) : []
  const entityBindings = buildCinematicEntityBindings(assetPack)
  const entityKeys = new Set(entityBindings.map((entry) => entry.id))
  const normalizeRefArray = (refs: unknown) => readStringArray(refs).filter((key) => entityKeys.size === 0 || entityKeys.has(key)).slice(0, 8)
  const sceneValues = Array.isArray(source.scenes) ? source.scenes.map(asRecord) : []
  const directorScenes = sceneValues.length > 0
    ? sceneValues.map((scene, index) => ({
      id: sanitizeCinematicScriptText(scene.id) || `scene_${index + 1}`,
      title: sanitizeCinematicScriptText(scene.title) || `Scene ${index + 1}`,
      summary: sanitizeCinematicScriptText(scene.summary),
      location: sanitizeCinematicScriptText(scene.location ?? scene.locationId),
    }))
    : [{
      id: 'scene_1',
      title: 'Scene 1',
      summary: sanitizeCinematicScriptText(source.logline ?? fallback.logline),
      location: entityBindings.find((entry) => entry.kind === 'environment')?.id ?? '',
    }]
  let cumulativeStart = 0
  const maxTotalDurationSeconds = Math.max(4, Math.min(CINEMATIC_MAX_TOTAL_DURATION_SECONDS, input.maxTotalDurationSeconds || CINEMATIC_MAX_TOTAL_DURATION_SECONDS))
  const directorShots: Record<string, unknown>[] = []
  const legacyShots: Record<string, unknown>[] = []
  for (const [index, shot] of sourceShots.slice(0, 36).entries()) {
    if (cumulativeStart >= maxTotalDurationSeconds) break
    const remaining = maxTotalDurationSeconds - cumulativeStart
    const durationSeconds = Math.min(remaining, clampShotDuration(shot.durationSeconds, index === 0 ? 3 : 4))
    if (durationSeconds <= 0) break
    const shotId = sanitizeCinematicScriptText(shot.id) || `shot_${String(index + 1).padStart(3, '0')}`
    const sceneId = sanitizeCinematicScriptText(shot.sceneId) || directorScenes[0]?.id || 'scene_1'
    const participantRefIds = normalizeRefArray(shot.participants ?? shot.participantRefIds)
    const locationRefId = normalizeMaybeNullString(shot.location ?? shot.locationRefId)
    const propRefIds = normalizeRefArray(shot.props ?? shot.propRefIds)
    const visualAction = sanitizeCinematicScriptText(shot.visualAction ?? shot.visualPrompt ?? shot.beat ?? shot.title)
    const composition = sanitizeCinematicScriptText(shot.composition ?? shot.compositionGuide)
    const beat = sanitizeCinematicScriptText(shot.beat) || visualAction || `Cinematic beat ${index + 1}`
    const startSeconds = cumulativeStart
    const endSeconds = cumulativeStart + durationSeconds
    const actions = Array.isArray(shot.actions) ? shot.actions.map(asRecord).slice(0, 5) : []
    const audio = Array.isArray(shot.audio) ? shot.audio.map(asRecord).slice(0, 3) : []
    const audioCues = readStringArray(shot.audioCues).map(sanitizeCinematicScriptText).filter(Boolean)
    const directorDialogue = normalizeDirectorDialogue(shot.dialogue, durationSeconds).slice(0, 4)
    const directorActions = normalizeDirectorActions(shot.actions, {
      shotId,
      participantRefIds,
      propRefIds,
      beat,
      visualAction,
      durationSeconds,
    })
    directorShots.push({
      id: shotId,
      sceneId,
      title: sanitizeCinematicScriptText(shot.title) || `Shot ${index + 1}`,
      beat,
      emotionalBeat: sanitizeCinematicScriptText(shot.emotionalBeat),
      durationSeconds,
      startSeconds,
      endSeconds,
      framing: sanitizeCinematicScriptText(shot.framing),
      cameraMovement: sanitizeCinematicScriptText(shot.cameraMovement),
      visualAction,
      composition,
      participants: participantRefIds,
      location: locationRefId ?? '',
      props: propRefIds,
      actions: directorActions,
      audioCues,
      dialogue: directorDialogue,
      forceTakeBreak: shot.forceTakeBreak === true,
    })
    legacyShots.push({
      id: shotId,
      sceneId,
      orderIndex: index,
      title: sanitizeCinematicScriptText(shot.title) || `Shot ${index + 1}`,
      beat,
      emotionalBeat: sanitizeCinematicScriptText(shot.emotionalBeat),
      durationSeconds,
      shotType: coerceCinematicShotType(shot.shotType),
      framing: sanitizeCinematicScriptText(shot.framing),
      cameraAngle: sanitizeCinematicScriptText(shot.cameraAngle),
      cameraMovement: sanitizeCinematicScriptText(shot.cameraMovement),
      lensPreference: sanitizeCinematicScriptText(shot.lensPreference),
      visualPrompt: visualAction || beat,
      compositionGuide: composition,
      continuityNotes: sanitizeCinematicScriptText(shot.continuityNotes),
      participantRefIds,
      locationRefId,
      propRefIds,
      backdropRefIds: normalizeRefArray(shot.backdropRefIds),
      startSeconds,
      endSeconds,
      forceTakeBreak: shot.forceTakeBreak === true,
      actions: actions.length > 0 ? actions.map((action, actionIndex) => ({
        id: sanitizeCinematicScriptText(action.id) || `${shotId}_action_${actionIndex + 1}`,
        actorRefId: normalizeMaybeNullString(action.actorRefId ?? action.actor),
        targetRefId: normalizeMaybeNullString(action.targetRefId ?? action.target),
        verb: sanitizeCinematicScriptText(action.verb ?? action.action) || beat,
        propRefId: normalizeMaybeNullString(action.propRefId ?? action.prop),
        stagingNotes: sanitizeCinematicScriptText(action.stagingNotes ?? action.description),
        startSeconds: Math.max(0, Number(action.startSeconds ?? 0) || 0),
        endSeconds: Math.max(0, Math.min(durationSeconds, Number(action.endSeconds ?? durationSeconds) || durationSeconds)),
      })) : [{
        id: `${shotId}_action_1`,
        actorRefId: participantRefIds[0] ?? null,
        targetRefId: null,
        verb: beat,
        propRefId: null,
        stagingNotes: visualAction || composition,
        startSeconds: 0,
        endSeconds: durationSeconds,
      }],
      dialogue: directorDialogue.map((entry, dialogueIndex) => ({
        id: `${shotId}_dialogue_${dialogueIndex + 1}`,
        speakerRefId: normalizeMaybeNullString(entry.speaker),
        line: readText(entry.line),
        delivery: readText(entry.delivery),
        startSeconds: Math.max(0, Math.min(durationSeconds, Number(entry.startSeconds ?? dialogueIndex) || dialogueIndex)),
        endSeconds: Math.max(0.5, Math.min(durationSeconds, Number(entry.endSeconds ?? dialogueIndex + 2) || dialogueIndex + 2)),
        lipSync: true,
      })),
      audio: audio.map((entry, audioIndex) => ({
        id: sanitizeCinematicScriptText(entry.id) || `${shotId}_audio_${audioIndex + 1}`,
        kind: coerceCinematicAudioKind(entry.kind),
        cue: sanitizeCinematicScriptText(entry.cue),
        sourceRefId: normalizeMaybeNullString(entry.sourceRefId),
        startSeconds: Math.max(0, Number(entry.startSeconds ?? 0) || 0),
        endSeconds: Math.max(0, Math.min(durationSeconds, Number(entry.endSeconds ?? durationSeconds) || durationSeconds)),
      })).filter((entry) => entry.cue).concat(audioCues.map((cue, audioIndex) => ({
        id: `${shotId}_audio_cue_${audioIndex + 1}`,
        kind: 'ambience',
        cue,
        sourceRefId: null,
        startSeconds: 0,
        endSeconds: durationSeconds,
      }))),
    })
    cumulativeStart = endSeconds
  }
  const directorScriptDoc: Record<string, unknown> = {
    title: sanitizeCinematicScriptText(source.title) || sanitizeCinematicScriptText(fallback.title) || 'Prompt Cinematic',
    logline: sanitizeCinematicScriptText(source.logline) || sanitizeCinematicScriptText(fallback.logline),
    tone: sanitizeCinematicScriptText(source.tone) || sanitizeCinematicScriptText(fallback.tone),
    continuityLock: sanitizeCinematicScriptText(source.continuityLock ?? source.continuityNotes ?? fallback.continuityNotes),
    scenes: directorScenes,
    entityRefs: entityBindings.map((entry) => ({ id: entry.id, role: entry.role })),
    shots: directorShots,
  }
  if (isUgcCinematicPresetFamily(input.presetFamily)) {
    const ugc = asRecord(source.ugcDirectives)
    directorScriptDoc.ugcDirectives = {
      formulaFamily: sanitizeCinematicScriptText(ugc.formulaFamily),
      hookType: sanitizeCinematicScriptText(ugc.hookType),
      proofMoment: sanitizeCinematicScriptText(ugc.proofMoment),
      ctaType: sanitizeCinematicScriptText(ugc.ctaType),
    }
  }
  const cinematicScriptDoc = cinematicScriptDocSchema.parse({
    title: directorScriptDoc.title,
    logline: directorScriptDoc.logline,
    tone: directorScriptDoc.tone,
    continuityNotes: directorScriptDoc.continuityLock,
    scenes: directorScenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      summary: scene.summary,
      locationRefId: scene.location || null,
    })),
    entityBindings,
    shots: legacyShots,
  })
  return { directorScriptDoc, cinematicScriptDoc }
}

function buildDeterministicCinematicScriptDoc(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  presetFamily: string
}) {
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  const sequenceUnits = Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord) : []
  const sequence = sequenceUnits[0] ?? {}
  const title = readText(wiki.title) || readText(sequence.name) || 'Prompt Cinematic'
  const summary = readText(readEntitySequence(sequence).synopsis) || readText(sequence.summary) || readText(wiki.logline) || input.prompt
  const bindings = buildCinematicEntityBindings(input.assetPack)
  const primary = bindings[0]?.id ?? null
  const location = bindings.find((entry) => entry.kind === 'environment' || entry.role === 'place')?.id ?? null
  const baseDurations = input.presetFamily.startsWith('ugc') ? [3, 4, 4, 4, 4] : [4, 5, 5, 5, 4, 4]
  return cinematicScriptDocSchema.parse({
    title,
    logline: summary,
    tone: readStringArray(wiki.toneTags).join(', ') || 'cinematic',
    continuityNotes: 'Preserve world canon, neutral visual identities, wardrobe, place geography, and emotional continuity.',
    entityBindings: bindings,
    shots: baseDurations.map((durationSeconds, index) => {
      const shotId = `shot_${String(index + 1).padStart(3, '0')}`
      const beat = index === 0
        ? `Open on the clearest visual hook from: ${summary}`
        : index === baseDurations.length - 1
          ? `Resolve the cinematic beat with a visible consequence.`
          : `Escalate the cinematic action through a new visible turn.`
      return {
        id: shotId,
        sceneId: 'scene_1',
        orderIndex: index,
        title: `Shot ${index + 1}`,
        beat,
        emotionalBeat: index === 0 ? 'attention' : index === baseDurations.length - 1 ? 'payoff' : 'escalation',
        durationSeconds,
        shotType: index === 0 ? 'establishing' : index === baseDurations.length - 1 ? 'reveal' : 'action',
        framing: index % 3 === 0 ? 'wide readable frame' : index % 3 === 1 ? 'medium subject-focused frame' : 'close reaction or insert',
        cameraAngle: 'cinematic eye-level angle',
        cameraMovement: index % 2 === 0 ? 'controlled push-in' : 'smooth lateral tracking move',
        visualPrompt: beat,
        compositionGuide: 'Clear subject silhouette, readable environment, grounded continuity.',
        participantRefIds: primary ? [primary] : [],
        locationRefId: location,
        forceTakeBreak: false,
        actions: [{
          id: `${shotId}_action_1`,
          actorRefId: primary,
          targetRefId: null,
          verb: beat,
          propRefId: null,
          stagingNotes: 'Make the beat visible through blocking, movement, and environment interaction.',
          startSeconds: 0,
          endSeconds: durationSeconds,
        }],
        audio: [{
          id: `${shotId}_audio_1`,
          kind: 'ambience',
          cue: input.presetFamily.startsWith('ugc') ? 'natural short-form audio bed' : 'cinematic ambience and restrained score',
          sourceRefId: null,
          startSeconds: 0,
          endSeconds: durationSeconds,
        }],
      }
    }),
  })
}

function buildCinematicScriptAuthoringInstruction(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
  aspectRatio: string
  resolution: string
  presetFamily: string
  legacyVideoBlockCount?: number | null
  legacyDurationPerBlockSeconds?: number | null
  maxTotalDurationSeconds?: number | null
}) {
  const maxTotalDurationSeconds = Math.max(4, Math.min(60, Number(input.maxTotalDurationSeconds ?? CINEMATIC_MAX_TOTAL_DURATION_SECONDS) || CINEMATIC_MAX_TOTAL_DURATION_SECONDS))
  const legacyHints = [
    input.legacyVideoBlockCount ? `Legacy requested block count hint: ${input.legacyVideoBlockCount}. Treat as a soft hint only.` : '',
    input.legacyDurationPerBlockSeconds ? `Legacy requested block duration hint: ${input.legacyDurationPerBlockSeconds}s. Treat as a soft hint only.` : '',
  ].filter(Boolean).join('\n')
  return [
    'Author the full directed cinematic script the prompt deserves as a lean director script, not a provider execution object.',
    `Preset family: ${input.presetFamily}.`,
    input.prompt ? `User request: ${input.prompt}` : '',
    legacyHints,
    guidanceMarkdown(input.guidance),
    '',
    'Requirements:',
    '- Return JSON only.',
    '- Let the shot count and runtime emerge from the prompt, world sequence, and dramatic complexity.',
    `- Hard limit: the complete cinematic script must not exceed ${maxTotalDurationSeconds} seconds total runtime.`,
    '- Every shot duration must be 1-15 seconds; the compiler will group shots into Seedance takes of 4-15 seconds.',
    '- Prefer continuous directed shots with blocking and camera intent; do not split every tiny motion into a separate shot.',
    '- Each shot gets one main visible action and one primary camera move. Avoid micro-choreography.',
    '- Include visible subject/action/blocking, camera/framing/movement, composition, actions, dialogue when spoken, audio cues, and entity ids.',
    '- Shot actions must be stage directions, not prose summary: actor, verb, target if any, prop if any, staging notes, and local shot timing.',
    '- Write action verbs as natural prose words, not snake_case machine labels.',
    '- Dialogue entries must include local shot timing and stay in the script only; storyboard images will convert speech into visible expression/body language.',
    '- Do not include provider refs or execution details: no @Image/@Video/@Audio labels, no keyframe wording, no model names, no resolution, no aspect-ratio strings.',
    '- Do not output empty legacy fields, workflow metadata, execution metadata, provider request fields, or storyboard/image-node instructions.',
    '- Preserve selected world canon and neutral visual identity traits. Do not invent new canon.',
    '- Use supplied entity keys in participants, location, props, entityRefs, and scene locations when relevant.',
    '- Add more than one scene only when location, time, or story mode actually changes.',
    isUgcCinematicPresetFamily(input.presetFamily)
      ? '- Because this is a UGC/brand preset, include concise ugcDirectives for hook/proof/CTA structure.'
      : '- Because this is story/movie cinematic output, do not include UGC formula, proof, CTA, platform, or ad fields.',
    '',
    'World context:',
    compactForPrompt({
      ...cinematicContextBrief(input.context),
      assetPack: input.assetPack,
    }, 14000),
  ].filter(Boolean).join('\n\n')
}

function buildDeterministicCinematicSequencePlan(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
  blockCount: number
  durationPerBlockSeconds: number
  aspectRatio: string
  resolution: string
  presetFamily: string
}) {
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  const sequenceUnits = Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord) : []
  const sequence = sequenceUnits[0] ?? {}
  const title = readText(wiki.title) || readText(sequence.name) || 'Cinematic Sequence'
  const summary = readText(sequence.summary) || readText(readEntitySequence(sequence).synopsis) || readText(wiki.logline) || input.prompt
  const entities = Array.isArray(input.assetPack.entities) ? input.assetPack.entities.map(asRecord) : []
  const blockFunctions = input.presetFamily.startsWith('ugc')
    ? ['hook and problem', 'proof and demonstration', 'payoff and call to action', 'variant proof', 'objection answer', 'final payoff']
    : ['visual hook and premise', 'escalation and reveal', 'payoff and consequence', 'reversal', 'climax', 'aftermath']
  return {
    title,
    presetFamily: input.presetFamily,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    totalDurationSeconds: input.blockCount * input.durationPerBlockSeconds,
    blocks: Array.from({ length: input.blockCount }, (_, index) => {
      const blockNumber = index + 1
      return {
        blockNumber,
        durationSeconds: input.durationPerBlockSeconds,
        storyFunction: blockFunctions[index] ?? `story movement ${blockNumber}`,
        hook: blockNumber === 1 ? 'Open with the clearest visual pressure or proof in the first two seconds.' : 'Continue with a visible escalation from the previous block.',
        summary,
        shotCount: input.durationPerBlockSeconds > 9 ? 12 : 8,
        requiredEntityKeys: entities.slice(0, 8).map((entity) => readText(entity.key)).filter(Boolean),
      }
    }),
    continuityNotes: [
      'Use neutral visual identity traits and available reference images as continuity anchors.',
      'Do not overwrite character/object/place identity with temporary action states.',
      'Each block must be renderable as a separate 4-15 second video clip.',
    ],
  }
}

const cinematicSequencePlanJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'presetFamily', 'aspectRatio', 'resolution', 'totalDurationSeconds', 'blocks', 'continuityNotes'],
  properties: {
    title: { type: 'string' },
    presetFamily: { type: 'string' },
    aspectRatio: { type: 'string' },
    resolution: { type: 'string' },
    totalDurationSeconds: { type: 'number' },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['blockNumber', 'durationSeconds', 'storyFunction', 'hook', 'summary', 'shotCount', 'requiredEntityKeys'],
        properties: {
          blockNumber: { type: 'number' },
          durationSeconds: { type: 'number' },
          storyFunction: { type: 'string' },
          hook: { type: 'string' },
          summary: { type: 'string' },
          shotCount: { type: 'number' },
          requiredEntityKeys: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    continuityNotes: { type: 'array', items: { type: 'string' } },
  },
}

const cinematicBlockScriptJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['blockNumber', 'blockCount', 'durationSeconds', 'title', 'storyFunction', 'hook', 'summary', 'continuityNotes', 'shots'],
  properties: {
    blockNumber: { type: 'number' },
    blockCount: { type: 'number' },
    durationSeconds: { type: 'number' },
    title: { type: 'string' },
    storyFunction: { type: 'string' },
    hook: { type: 'string' },
    summary: { type: 'string' },
    continuityNotes: { type: 'array', items: { type: 'string' } },
    shots: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['shotNumber', 'startTimeSeconds', 'endTimeSeconds', 'subject', 'action', 'camera', 'composition', 'audio', 'referenceNotes'],
        properties: {
          shotNumber: { type: 'number' },
          startTimeSeconds: { type: 'number' },
          endTimeSeconds: { type: 'number' },
          subject: { type: 'string' },
          action: { type: 'string' },
          camera: { type: 'string' },
          composition: { type: 'string' },
          audio: { type: 'string' },
          referenceNotes: { type: 'string' },
        },
      },
    },
  },
}

function normalizeCinematicSequencePlan(value: Record<string, unknown>, fallback: Record<string, unknown>) {
  const blocks = Array.isArray(value.blocks) ? value.blocks.map(asRecord) : []
  if (blocks.length === 0) return fallback
  return {
    title: readText(value.title) || readText(fallback.title),
    presetFamily: readText(value.presetFamily) || readText(fallback.presetFamily),
    aspectRatio: readText(value.aspectRatio) || readText(fallback.aspectRatio),
    resolution: readText(value.resolution) || readText(fallback.resolution),
    totalDurationSeconds: Number(value.totalDurationSeconds ?? fallback.totalDurationSeconds ?? 0) || 0,
    blocks: blocks.map((block, index) => ({
      blockNumber: Number(block.blockNumber ?? index + 1) || index + 1,
      durationSeconds: Math.max(4, Math.min(15, Number(block.durationSeconds ?? 8) || 8)),
      storyFunction: readText(block.storyFunction),
      hook: readText(block.hook),
      summary: readText(block.summary),
      shotCount: Math.max(4, Math.min(15, Number(block.shotCount ?? 8) || 8)),
      requiredEntityKeys: readStringArray(block.requiredEntityKeys).slice(0, 12),
    })),
    continuityNotes: readStringArray(value.continuityNotes).length > 0
      ? readStringArray(value.continuityNotes)
      : readStringArray(fallback.continuityNotes),
  }
}

function normalizeCinematicBlockScript(value: Record<string, unknown>, fallback: Record<string, unknown>, durationSeconds: number) {
  const shots = Array.isArray(value.shots) ? value.shots.map(asRecord) : []
  if (shots.length === 0) return fallback
  return {
    blockNumber: Number(value.blockNumber ?? fallback.blockNumber ?? 1) || 1,
    blockCount: Number(value.blockCount ?? fallback.blockCount ?? 1) || 1,
    durationSeconds: Math.max(4, Math.min(15, Number(value.durationSeconds ?? durationSeconds) || durationSeconds)),
    title: readText(value.title) || readText(fallback.title),
    storyFunction: readText(value.storyFunction) || readText(fallback.storyFunction),
    hook: readText(value.hook) || readText(fallback.hook),
    summary: readText(value.summary) || readText(fallback.summary),
    continuityNotes: readStringArray(value.continuityNotes).length > 0
      ? readStringArray(value.continuityNotes)
      : readStringArray(fallback.continuityNotes),
    shots: shots.map((shot, index) => ({
      shotNumber: Number(shot.shotNumber ?? index + 1) || index + 1,
      startTimeSeconds: Math.max(0, readShotStartSeconds(shot)),
      endTimeSeconds: Math.min(durationSeconds, Math.max(0, readShotEndSeconds(shot) || durationSeconds)),
      subject: readText(shot.subject),
      action: readText(shot.action),
      camera: readText(shot.camera),
      composition: readText(shot.composition),
      audio: readText(shot.audio),
      referenceNotes: readText(shot.referenceNotes),
    })),
  }
}

function buildCinematicSequencePlanInstruction(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
  blockCount: number
  durationPerBlockSeconds: number
  aspectRatio: string
  resolution: string
  presetFamily: string
}) {
  return [
    `Plan exactly ${input.blockCount} cinematic video block(s), each ${input.durationPerBlockSeconds} seconds.`,
    `Preset family: ${input.presetFamily}. Aspect ratio: ${input.aspectRatio}. Resolution: ${input.resolution}.`,
    input.prompt ? `User request: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    '',
    'Requirements:',
    '- Return JSON only.',
    '- Every block must be independently renderable as a 4-15 second video clip.',
    '- Make the first block hook visible within the first 1.5-2 seconds.',
    '- Preserve world canon and neutral visual identity traits; do not invent new canon.',
    '- Use concise shotCount values that produce clean contact sheets: prefer 4, 6, 8, 9, 12, or 16 shots per block.',
    '',
    'World context:',
    compactForPrompt({
      ...cinematicContextBrief(input.context),
      assetPack: input.assetPack,
    }, 12000),
  ].filter(Boolean).join('\n\n')
}

function buildCinematicBlockScriptInstruction(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  sequencePlan: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
  blockNumber: number
  blockCount: number
  durationSeconds: number
  presetFamily: string
}) {
  const planBlock = cinematicSequencePlanBlock(input.sequencePlan, input.blockNumber)
  return [
    `Write the timestamped shot script for cinematic video block ${input.blockNumber} of ${input.blockCount}.`,
    `Duration: exactly ${input.durationSeconds} seconds. Preset family: ${input.presetFamily}.`,
    input.prompt ? `User request: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    '',
    'Requirements:',
    '- Return JSON only.',
    '- Shots must be ordered, timestamped, and fit inside the block duration.',
    '- If the planned block includes shotCount, return exactly that many shots.',
    '- Each shot needs one dominant subject, one visible action, one camera direction, composition, audio note, and reference note.',
    '- Do not write prose, screenplay pages, marketing copy, hidden motivation, or workflow/internal terms.',
    '- Use @Image1 as storyboard continuity in referenceNotes and mention entity references only as continuity anchors.',
    '',
    'Planned block:',
    compactForPrompt(planBlock, 3000),
    '',
    'World context:',
    compactForPrompt({
      ...cinematicContextBrief(input.context),
      assetPack: input.assetPack,
    }, 10000),
  ].filter(Boolean).join('\n\n')
}

function cinematicSequencePlanBlock(sequencePlan: Record<string, unknown>, blockNumber: number) {
  const blocks = Array.isArray(sequencePlan.blocks) ? sequencePlan.blocks.map(asRecord) : []
  return blocks.find((block) => Number(block.blockNumber ?? 0) === blockNumber) ?? blocks[blockNumber - 1] ?? {}
}

function buildDeterministicCinematicBlockScript(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  sequencePlan: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
  blockNumber: number
  blockCount: number
  durationSeconds: number
  presetFamily: string
}) {
  const planBlock = cinematicSequencePlanBlock(input.sequencePlan, input.blockNumber)
  const entities = Array.isArray(input.assetPack.entities) ? input.assetPack.entities.map(asRecord) : []
  const shotCount = Math.min(input.durationSeconds > 9 ? 12 : 8, Math.max(4, Number(planBlock.shotCount ?? 8) || 8))
  const slice = input.durationSeconds / shotCount
  const primaryEntities = entities.slice(0, 4)
  const subjectFallback = primaryEntities.map((entity) => readText(entity.name)).filter(Boolean).join(', ') || 'the primary subject'
  const shots = Array.from({ length: shotCount }, (_, index) => {
    const start = Number((index * slice).toFixed(2))
    const end = Number(Math.min(input.durationSeconds, (index + 1) * slice).toFixed(2))
    const subject = readText(primaryEntities[index % Math.max(1, primaryEntities.length)]?.name) || subjectFallback
    const hookPrefix = input.blockNumber === 1 && index === 0 ? 'Immediate hook: ' : ''
    return {
      shotNumber: index + 1,
      startTimeSeconds: start,
      endTimeSeconds: end,
      subject,
      action: `${hookPrefix}${readText(planBlock.storyFunction) || 'cinematic story beat'} made visible through ${subject}.`,
      camera: index % 3 === 0 ? 'slow push-in with stable framing' : index % 3 === 1 ? 'controlled tracking move following the action' : 'clean reaction or insert shot',
      composition: index === 0 ? 'readable establishing frame with strong subject silhouette' : 'clear single-beat cinematic composition',
      audio: input.presetFamily.startsWith('ugc') ? 'natural creator-style voice or proof-focused sound if audio is generated' : 'cinematic ambient sound and restrained music if audio is generated',
      referenceNotes: '@Image1 storyboard continuity; use entity references for identity, wardrobe, environment, and hero props.',
    }
  })
  return {
    blockNumber: input.blockNumber,
    blockCount: input.blockCount,
    durationSeconds: input.durationSeconds,
    title: `Block ${input.blockNumber}: ${readText(planBlock.storyFunction) || 'Cinematic beat'}`,
    storyFunction: readText(planBlock.storyFunction),
    hook: readText(planBlock.hook),
    summary: readText(planBlock.summary) || input.prompt,
    continuityNotes: readStringArray(input.sequencePlan.continuityNotes),
    shots,
  }
}

function validateCinematicBlockScript(script: Record<string, unknown>, durationSeconds: number) {
  const diagnostics: string[] = []
  const scriptDuration = Number(script.durationSeconds ?? 0) || durationSeconds
  if (scriptDuration > 15) diagnostics.push('Block duration exceeds 15 seconds.')
  if (scriptDuration < 4) diagnostics.push('Block duration is below 4 seconds.')
  const shots = Array.isArray(script.shots) ? script.shots.map(asRecord) : []
  if (shots.length < 3) diagnostics.push('Block script needs at least 3 timestamped shots.')
  let previousEnd = 0
  shots.forEach((shot, index) => {
    const start = Number(shot.startTimeSeconds ?? -1)
    const end = Number(shot.endTimeSeconds ?? -1)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      diagnostics.push(`Shot ${index + 1} has invalid timestamps.`)
    }
    if (start < previousEnd - 0.05) diagnostics.push(`Shot ${index + 1} overlaps the previous shot.`)
    if (end > durationSeconds + 0.05) diagnostics.push(`Shot ${index + 1} exceeds the block duration.`)
    if (!readText(shot.subject) || !readText(shot.action) || !readText(shot.camera)) {
      diagnostics.push(`Shot ${index + 1} is missing subject, action, or camera direction.`)
    }
    previousEnd = Math.max(previousEnd, end)
  })
  return diagnostics
}

function cinematicBlockScriptMarkdown(script: Record<string, unknown>) {
  const shots = Array.isArray(script.shots) ? script.shots.map(asRecord) : []
  return [
    `# ${readText(script.title) || `Cinematic Block ${Number(script.blockNumber ?? 1)}`}`,
    readText(script.summary),
    '',
    shots.map((shot, index) => [
      `## Shot ${Number(shot.shotNumber ?? index + 1) || index + 1} (${formatShotSeconds(readShotStartSeconds(shot), 0)}s-${formatShotSeconds(readShotEndSeconds(shot), 0)}s)`,
      `Subject: ${readText(shot.subject)}`,
      `Action: ${readText(shot.action)}`,
      `Camera: ${readText(shot.camera)}`,
      readText(shot.composition) ? `Composition: ${readText(shot.composition)}` : '',
      readText(shot.audio) ? `Audio: ${readText(shot.audio)}` : '',
      readText(shot.referenceNotes) ? `References: ${readText(shot.referenceNotes)}` : '',
    ].filter(Boolean).join('\n')).join('\n\n'),
  ].filter(Boolean).join('\n\n')
}

function readNumericAlias(record: Record<string, unknown>, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = record[key]
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim().length === 0) continue
    const parsed = typeof value === 'number' ? value : Number(readText(value))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function readShotStartSeconds(shot: Record<string, unknown>) {
  return readNumericAlias(shot, ['startTimeSeconds', 'startSeconds', 'startSecond', 'start', 'from'], 0)
}

function readShotEndSeconds(shot: Record<string, unknown>) {
  return readNumericAlias(shot, ['endTimeSeconds', 'endSeconds', 'endSecond', 'end', 'to'], readShotStartSeconds(shot))
}

function formatShotSeconds(value: unknown, fallback: number) {
  const numeric = typeof value === 'number' ? value : Number(readText(value))
  const seconds = Number.isFinite(numeric) ? numeric : fallback
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function parseAspectRatio(value: string) {
  const [rawWidth, rawHeight] = value.split(':').map((part) => Number(part))
  if (Number.isFinite(rawWidth) && Number.isFinite(rawHeight) && rawWidth > 0 && rawHeight > 0) {
    return { width: rawWidth, height: rawHeight }
  }
  return { width: 16, height: 9 }
}

function storyboardLayoutForShotCount(shotCount: number) {
  const count = Math.max(1, Math.min(16, Math.ceil(shotCount)))
  if (count <= 3) return { columns: count, rows: 1, panelCount: count }
  if (count === 4) return { columns: 2, rows: 2, panelCount: count }
  if (count <= 6) return { columns: 3, rows: 2, panelCount: count }
  if (count <= 8) return { columns: 4, rows: 2, panelCount: count }
  if (count === 9) return { columns: 3, rows: 3, panelCount: count }
  if (count <= 12) return { columns: 4, rows: 3, panelCount: count }
  return { columns: 4, rows: 4, panelCount: count }
}

function normalizeStoryboardImageDimension(value: number) {
  return Math.max(16, Math.min(3072, Math.round(value / 16) * 16))
}

function storyboardImageSizeForLayout(input: {
  columns: number
  rows: number
  aspectRatio: string
}) {
  const ratio = parseAspectRatio(input.aspectRatio)
  const landscapeOrSquare = ratio.width >= ratio.height
  const panelShortSide = 432
  const rawWidth = landscapeOrSquare
    ? input.columns * panelShortSide * (ratio.width / ratio.height)
    : input.columns * panelShortSide
  const rawHeight = landscapeOrSquare
    ? input.rows * panelShortSide
    : input.rows * panelShortSide * (ratio.height / ratio.width)
  const scale = Math.min(1, 3072 / Math.max(rawWidth, rawHeight))
  return {
    width: normalizeStoryboardImageDimension(rawWidth * scale),
    height: normalizeStoryboardImageDimension(rawHeight * scale),
  }
}

function compactCinematicEntityAnchors(assetPack: Record<string, unknown>, limit = 8) {
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  const byKey = new Map<string, {
    key: string
    name: string
    visualDescription: string
    visualTraits: string[]
  }>()
  const seenNames = new Set<string>()
  for (const entity of entities) {
    const name = readText(entity.name)
    const visualDescription = readText(entity.visualDescription)
    const visualTraits = readStringArray(entity.visualTraits)
    if (!name && !visualDescription && visualTraits.length === 0) continue
    if (!visualDescription && visualTraits.length === 0) continue
    const key = slugify(readText(entity.key) || readText(entity.id) || readText(entity.assetKey) || name)
    const nameKey = slugify(name)
    if (!key || byKey.has(key) || (nameKey && seenNames.has(nameKey))) continue
    if (nameKey) seenNames.add(nameKey)
    byKey.set(key, { key, name, visualDescription, visualTraits })
    if (byKey.size >= limit) break
  }
  return [...byKey.values()]
}

function cinematicEntityLabelByKey(assetPack: Record<string, unknown>) {
  const labels = new Map<string, string>()
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  for (const entity of entities) {
    const key = readText(entity.key)
    if (!key) continue
    labels.set(key, readText(entity.name) || key)
  }
  return labels
}

function resolveCinematicV2AnimaticMode(config: Record<string, unknown>, run?: OutputWorkflowRun | null) {
  const runInput = asRecord(run?.input)
  const runMetadata = asRecord(run?.metadata)
  const raw = readText(runInput.cinematicV2AnimaticMode)
    || readText(runMetadata.cinematicV2AnimaticMode)
    || readText(config.cinematicV2AnimaticMode)
  return raw === 'quality_keyframes' ? 'quality_keyframes' : 'fast_panels'
}

function resolveCinematicV2QualityShotIds(config: Record<string, unknown>, run?: OutputWorkflowRun | null) {
  const runInput = asRecord(run?.input)
  const runMetadata = asRecord(run?.metadata)
  return uniqueStrings([
    ...readStringArray(runInput.cinematicV2QualityShotIds),
    ...readStringArray(runMetadata.cinematicV2QualityShotIds),
    ...readStringArray(config.cinematicV2QualityShotIds),
  ])
}

function formatCinematicEntityAnchorLines(entities: ReturnType<typeof compactCinematicEntityAnchors>) {
  return entities.map((entity) => {
    const parts = [
      entity.visualDescription ? `Visual: ${compactBeatCaptionSentence(entity.visualDescription, '', 24).replace(/\.$/, '')}` : '',
      entity.visualTraits.length > 0 ? `Traits: ${entity.visualTraits.slice(0, 10).join(', ')}` : '',
    ].filter(Boolean)
    return `${entity.name || 'Visual anchor'}: ${parts.join('. ')}.`
  }).join('\n')
}

function formatTimecode(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function distributeBeatDurations(totalSeconds: number, panelCount: number) {
  const count = Math.max(1, panelCount)
  const total = Math.max(count, Math.round(totalSeconds))
  const base = Math.max(1, Math.floor(total / count))
  let remainder = Math.max(0, total - base * count)
  return Array.from({ length: count }, (_, index) => {
    const addExtra = index >= count - remainder ? 1 : 0
    return base + addExtra
  })
}

type CinematicVisualDensity = 'slow' | 'standard' | 'active' | 'action'
type CinematicShotStripMode = 'sparse' | 'balanced' | 'dense'

function shotDurationSeconds(shot: Record<string, unknown>) {
  const explicit = Number(shot.durationSeconds)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  return Math.max(0, readShotEndSeconds(shot) - readShotStartSeconds(shot))
}

function collectShotDensityText(shot: Record<string, unknown>) {
  const actions = Array.isArray(shot.actions) ? shot.actions.map(asRecord) : []
  return [
    readText(shot.title),
    readText(shot.beat),
    readText(shot.emotionalBeat),
    readText(shot.visualAction),
    readText(shot.action),
    readText(shot.composition),
    readText(shot.framing),
    readText(shot.cameraMovement),
    ...actions.flatMap((action) => [
      readText(action.verb),
      readText(action.action),
      readText(action.target),
      readText(action.prop),
      readText(action.stagingNotes),
      readText(action.description),
    ]),
  ].filter(Boolean).join(' ').toLowerCase()
}

function countRegexMatches(value: string, pattern: RegExp) {
  return (value.match(pattern) ?? []).length
}

function estimateDialogueSeconds(shot: Record<string, unknown>) {
  const records = readShotDialogueRecords(shot).filter((entry) => readText(entry.line))
  if (records.length === 0) return 0
  return records.reduce((total, entry) => {
    const start = Number(entry.startSeconds)
    const end = Number(entry.endSeconds)
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) return total + Math.min(5, end - start)
    const wordCount = readText(entry.line).split(/\s+/).filter(Boolean).length
    return total + Math.max(1.2, Math.min(4, wordCount / 3.2))
  }, 0)
}

function classifyCinematicVisualDensity(input: {
  durationSeconds: number
  shots: Record<string, unknown>[]
}) {
  const duration = Math.max(4, Math.min(15, Math.round(input.durationSeconds) || 4))
  const shots = input.shots
  const shotCount = shots.length
  const allText = shots.map(collectShotDensityText).join(' ')
  const dialogueSeconds = shots.reduce((total, shot) => total + estimateDialogueSeconds(shot), 0)
  const dialogueCount = shots.reduce((total, shot) => total + readShotDialogueRecords(shot).filter((entry) => readText(entry.line)).length, 0)
  const dialogueRatio = duration > 0 ? dialogueSeconds / duration : 0
  const actionKeywordCount = countRegexMatches(
    allText,
    /\b(chase|pursu|fight|battle|attack|punch|kick|strike|shoot|fire|stun|slam|crash|burst|sprint|run|flee|vault|leap|dive|fall|collapse|explode|explosion|impact|hit|smash|throw|spin|transform|montage)\b/g,
  )
  const movementKeywordCount = countRegexMatches(
    allText,
    /\b(walk|move|cross|enter|exit|approach|turn|circle|track|follow|search|inspect|examine|lean|reach|grab|lift|open|close|pull|push)\b/g,
  )
  const stillKeywordCount = countRegexMatches(
    allText,
    /\b(sit|sits|still|motionless|quiet|stares|holds gaze|waits|listens|watches|smile|smirks|glances|breath|close-up|closeup|two-shot|table|cafe)\b/g,
  )
  const contactKeywordCount = countRegexMatches(
    allText,
    /\b(contact|impact|collide|hits|strikes|slams|crashes|sparks|grabs|yanks|vaults|lands|pins|blocks|cuts off|closes in)\b/g,
  )
  const forceBreakCount = shots.filter((shot) => shot.forceTakeBreak === true).length
  const locationKeys = new Set(shots.map((shot) => slugify(readText(shot.location) || readText(shot.locationRefId))).filter(Boolean))
  const cameraKeys = new Set(shots.map((shot) => slugify([readText(shot.framing), readText(shot.cameraMovement)].filter(Boolean).join(' '))).filter(Boolean))
  const cameraChangeCount = Math.max(0, cameraKeys.size - 1)
  const locationChangeCount = Math.max(0, locationKeys.size - 1)
  const longShotCount = shots.filter((shot) => shotDurationSeconds(shot) >= 5).length
  const actionScore = actionKeywordCount + contactKeywordCount * 1.5 + forceBreakCount * 2 + locationChangeCount + Math.max(0, cameraChangeCount - 1) * 0.5
  const movementScore = movementKeywordCount + cameraChangeCount + locationChangeCount
  let visualDensity: CinematicVisualDensity = 'standard'
  const reasons: string[] = []

  if (/\b(chase|fight|battle|montage|transformation|pursuit)\b/.test(allText) || actionScore >= 7 || shotCount >= 7) {
    visualDensity = 'action'
    reasons.push('action/contact or montage-style signals')
  } else if (actionScore >= 3 || movementScore >= 8 || shotCount >= 5 || locationChangeCount > 0) {
    visualDensity = 'active'
    reasons.push('movement, camera, or spatial transition signals')
  } else if (
    shotCount <= 4
    && actionScore < 3
    && (dialogueRatio >= 0.35 || dialogueCount >= 2 || stillKeywordCount >= Math.max(2, actionKeywordCount + contactKeywordCount))
  ) {
    visualDensity = 'slow'
    reasons.push('dialogue/stillness outweighs action')
  } else {
    reasons.push('balanced dramatic coverage')
  }

  if (longShotCount >= Math.max(1, shotCount - 1) && visualDensity === 'standard' && actionScore < 2 && dialogueCount > 0) {
    visualDensity = 'slow'
    reasons.length = 0
    reasons.push('long dialogue-oriented shots')
  }

  const shotStripMode: CinematicShotStripMode = visualDensity === 'slow'
    ? 'sparse'
    : visualDensity === 'action'
      ? 'dense'
      : 'balanced'

  return {
    visualDensity,
    shotStripMode,
    densityReason: [
      reasons.join(', '),
      `shots=${shotCount || 0}`,
      `dialogueRatio=${dialogueRatio.toFixed(2)}`,
      `actionScore=${actionScore.toFixed(1)}`,
      `cameraChanges=${cameraChangeCount}`,
      `locationChanges=${locationChangeCount}`,
    ].filter(Boolean).join('; '),
  }
}

function adaptiveBeatSheetPanelCount(input: {
  durationSeconds: number
  shotCount: number
  visualDensity: CinematicVisualDensity
}) {
  const duration = Math.max(4, Math.min(15, Math.round(input.durationSeconds) || 4))
  const shotCount = Math.max(1, input.shotCount || 1)
  if (input.visualDensity === 'slow') {
    const maxSlowPanels = duration <= 11 ? 4 : 5
    return Math.max(3, Math.min(maxSlowPanels, shotCount + 2))
  }
  if (input.visualDensity === 'standard') {
    return Math.max(5, Math.min(7, shotCount + 2, Math.ceil(duration * 0.45)))
  }
  if (input.visualDensity === 'active') {
    return Math.max(6, Math.min(8, shotCount + 3, Math.ceil(duration * 0.6)))
  }
  return Math.max(8, Math.min(12, shotCount + 5, Math.ceil(duration * 0.7)))
}

function findShotForBeatMidpoint(shots: Record<string, unknown>[], midpointSeconds: number) {
  return shots.find((shot) => midpointSeconds >= readShotStartSeconds(shot) && midpointSeconds < readShotEndSeconds(shot))
    ?? shots.find((shot) => midpointSeconds <= readShotEndSeconds(shot))
    ?? shots[shots.length - 1]
    ?? {}
}

function cleanBeatCaptionText(value: unknown) {
  return readText(value)
    .replace(/@\s*(Image|Video|Audio)\s*\d+/gi, '')
    .replace(/[{}[\]"]/g, ' ')
    .replace(/\b(Caption line|Subject|Action|Camera|Composition|Audio|References)\s*\d*\s*:/gi, ' ')
    .replace(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z0-9-]+){0,3})\s+\1\b/g, '$1')
    .replace(/([A-Za-z0-9])_([A-Za-z0-9])/g, '$1 $2')
    .replace(/\.{3}|\u2026/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sentenceCaseBeatCaption(value: string) {
  const clean = value.trim()
  if (!clean) return clean
  return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}${/[.!?]$/.test(clean) ? '' : '.'}`
}

function compactBeatCaptionSentence(value: unknown, fallback: string, maxWords = 13) {
  const clean = cleanBeatCaptionText(value) || cleanBeatCaptionText(fallback)
  if (!clean) return 'The visual continuity stays clear.'
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] ?? clean
  const firstClause = firstSentence.split(/\s+(?:while|as|before|after|then)\s+/i)[0]
  const weakTailWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'with', 'into', 'onto', 'through', 'from', 'to', 'of', 'in', 'on', 'for', 'as', 'while', 'before', 'after', 'then', 'just'])
  const words = firstClause.replace(/[.!?]+$/g, '').split(/\s+/).filter(Boolean)
  while (words.length > 1 && weakTailWords.has(words[words.length - 1].toLowerCase())) words.pop()
  const compactWords = words.length > maxWords ? words.slice(0, maxWords) : words
  while (compactWords.length > 1 && weakTailWords.has(compactWords[compactWords.length - 1].toLowerCase())) compactWords.pop()
  const compact = compactWords.join(' ').replace(/[,;:]+$/g, '')
  return sentenceCaseBeatCaption(compact)
}

function compactStoryboardSentence(value: unknown, fallback = '', maxWords = 22) {
  const clean = cleanBeatCaptionText(value)
    .replace(/\b(?:Dialogue cue|Audio cue|Opening state|Action escalation|Obstacle or contact|Consequence and transition|Visible action and blocking|Camera feel|Framing)\s*:/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const source = clean || cleanBeatCaptionText(fallback)
  if (!source) return ''
  const firstSentence = source.split(/(?<=[.!?])\s+/)[0] ?? source
  const words = firstSentence.replace(/[.!?]+$/g, '').split(/\s+/).filter(Boolean)
  const weakTailWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'with', 'into', 'onto', 'through', 'from', 'to', 'of', 'in', 'on', 'for', 'as', 'while', 'before', 'after', 'then', 'just', 'where'])
  while (words.length > 1 && weakTailWords.has(words[words.length - 1].toLowerCase())) words.pop()
  const compactWords = words.length > maxWords ? words.slice(0, maxWords) : words
  while (compactWords.length > 1 && weakTailWords.has(compactWords[compactWords.length - 1].toLowerCase())) compactWords.pop()
  const compact = compactWords.join(' ').replace(/[,;:]+$/g, '')
  return sentenceCaseBeatCaption(compact)
}

function splitStoryboardVisualClauses(value: unknown) {
  const clean = cleanBeatCaptionText(value)
  if (!clean) return []
  return clean
    .split(/(?:[.;]|\s+\bthen\b\s+|\s+\bwhile\b\s+|\s+\bas\b\s+)/i)
    .map((entry) => compactStoryboardSentence(entry, '', 18))
    .filter((entry) => {
      const words = entry.replace(/[.!?]+$/g, '').split(/\s+/).filter(Boolean)
      if (words.length < 3) return false
      return entry !== 'The visual continuity stays clear.'
    })
}

function naturalizeCinematicActorName(value: unknown) {
  const text = cleanBeatCaptionText(value)
  if (!text) return ''
  return text
    .split(/[.:/]/)[0]
    .replace(/\b(world|entity|actor|character|place|group|object)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function naturalizeCinematicTarget(value: unknown) {
  const text = cleanBeatCaptionText(value)
  if (!text) return ''
  return text
    .replace(/\b(world|entity|actor|character|place|group|object)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cinematicActionPhrase(input: {
  actor: string
  verb: string
  target: string
  prop: string
}) {
  const actor = input.actor || 'The subject'
  const verb = cleanBeatCaptionText(input.verb).toLowerCase()
  const articleObject = (value: string) => {
    if (!value) return ''
    if (/^(?:the|a|an|this|that|his|her|their|its)\s/i.test(value)) return value
    if (/^[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*)*$/.test(value)) return value
    if (/^(?:table|cup|window|street|door|wall|floor|worktable|face|hand|hands|room|corner|barrier|hatch|fence|panel|glass|dome)$/i.test(value)) {
      return `the ${value}`
    }
    return value
  }
  const target = articleObject(input.target)
  const prop = articleObject(input.prop)
  const propPhrase = prop ? `, ${prop} visible in the frame` : ''
  if (!verb) return ''
  if (/\bleans?\b/.test(verb)) return `${actor} leans over ${target || 'the table'}${prop ? ` near ${prop}` : ''}.`
  if (/\btilts?\b/.test(verb)) return `${actor} tilts their head toward ${target || 'the other character'}${propPhrase}.`
  if (/\bholds?\b/.test(verb)) return `${actor} holds ${target ? `${target}'s gaze` : 'a perfectly still gaze'}${propPhrase}.`
  if (/\bstudies?\b/.test(verb)) return `${actor} studies ${target || 'the other character'} with still, precise attention${propPhrase}.`
  if (/\bstares?\b/.test(verb)) return `${actor} stares at ${target || 'the other character'} with a fixed expression${propPhrase}.`
  if (/\blies?\s*still\b|\brests?\b/.test(verb)) return `${actor} lies motionless ${target ? `on ${target}` : 'in the frame'}${propPhrase}.`
  if (/\bstirs?\b/.test(verb)) return `${actor} stirs ${target || prop || 'the cup'} with restless, contained movement.`
  if (/\bsmirks?\b/.test(verb)) return `${actor} almost smiles toward ${target || 'the other character'}, then checks the reaction.`
  if (/\bglances?\b/.test(verb)) return `${actor} glances toward ${target || 'the edge of the room'}, alert to danger.`
  if (/\bfreezes?\b/.test(verb)) return `${actor} freezes around ${target || prop || 'the table'}, tension visible in the posture.`
  if (/\bwaits?\b/.test(verb)) return `${actor} waits in stillness, watching ${target || 'the other character'} for a reaction.`
  if (/\bapproaches?\b/.test(verb)) return `${actor} approaches ${target || 'the focal point'} with careful, contained body language.`
  if (/\bexamines?\b/.test(verb)) return `${actor} examines ${target || 'the focal detail'} with focused attention.`
  const normalizedVerb = verb.replace(/\s+/g, ' ')
  return `${actor} ${normalizedVerb}${target ? ` ${target}` : ''}${prop ? ` with ${prop}` : ''}.`
}

function readShotStoryboardActionClauses(shot: Record<string, unknown>) {
  const actionRecords = Array.isArray(shot.actions) ? shot.actions.map(asRecord) : []
  return actionRecords.flatMap((action) => {
    const actor = naturalizeCinematicActorName(action.actor) || naturalizeCinematicActorName(action.actorRefId) || naturalizeCinematicActorName(action.subject)
    const verb = cleanBeatCaptionText(action.verb ?? action.action)
    const target = naturalizeCinematicTarget(action.target) || naturalizeCinematicTarget(action.targetRefId)
    const prop = naturalizeCinematicTarget(action.prop) || naturalizeCinematicTarget(action.propRefId)
    const staging = readText(action.stagingNotes) || readText(action.description)
    const actionPhrase = cinematicActionPhrase({ actor, verb, target, prop })
    return [
      actionPhrase,
      staging,
    ].filter(Boolean)
  })
}

function readShotDialogueRecords(shot: Record<string, unknown>) {
  return Array.isArray(shot.dialogue) ? shot.dialogue.map(asRecord) : []
}

function readShotDialogueClauses(shot: Record<string, unknown>) {
  const dialogueRecords = Array.isArray(shot.dialogue) ? shot.dialogue.map(asRecord) : []
  return dialogueRecords.flatMap((entry) => {
    const speaker = readText(entry.speaker) || readText(entry.speakerRefId)
    const line = readText(entry.line)
    const delivery = readText(entry.delivery)
    return [
      line ? `${speaker ? `${speaker} says` : 'A voice says'} "${line}"` : '',
      delivery ? `${speaker || 'The speaker'} delivers the line ${delivery}` : '',
    ]
  })
}

function readShotAudioCueClauses(shot: Record<string, unknown>) {
  const cueRecords = Array.isArray(shot.audioCues) ? shot.audioCues.map((cue) => ({ cue })) : []
  const audioRecords = Array.isArray(shot.audio) ? shot.audio.map(asRecord) : []
  return [
    ...cueRecords.map((entry) => readText(entry.cue)),
    ...audioRecords.map((entry) => [readText(entry.kind), readText(entry.cue)].filter(Boolean).join(': ')),
  ].filter(Boolean)
}

function visibleStoryboardClausesForShot(shot: Record<string, unknown>) {
  const rawClauses = [
    ...splitStoryboardVisualClauses(shot.visualAction),
    ...splitStoryboardVisualClauses(shot.action),
    ...readShotStoryboardActionClauses(shot).flatMap(splitStoryboardVisualClauses),
    ...splitStoryboardVisualClauses(shot.composition),
    ...splitStoryboardVisualClauses(shot.beat),
  ]
  const seen = new Set<string>()
  const unique: string[] = []
  for (const clause of rawClauses) {
    const key = slugify(clause)
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(clause)
  }
  return unique
}

function stripCaptionLeadingNames(value: string) {
  return value
    .replace(/^(?:[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,3},\s*){2,}[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,3}\s+/, '')
    .trim()
}

function phaseFallbackBeatCaption(shot: Record<string, unknown>, phaseIndex: number) {
  const title = cleanBeatCaptionText(shot.title)
  const fallbacks = [
    title ? `${title} begins as a clear visual moment.` : 'The take opens on urgent movement.',
    'The action intensifies across the frame.',
    'The obstacle becomes visible in the environment.',
    'The beat transitions toward the next shot.',
  ]
  return compactBeatCaptionSentence(fallbacks[phaseIndex % fallbacks.length], '', 13)
}

function makeBeatCaptionSentences(shot: Record<string, unknown>, occurrenceIndex: number, occurrenceCount: number) {
  const clauses = visibleStoryboardClausesForShot(shot)
  const phaseCount = Math.max(1, occurrenceCount)
  const phaseIndex = Math.min(3, Math.floor((occurrenceIndex / phaseCount) * 4))
  const lineOne = clauses[(occurrenceIndex * 2) % Math.max(1, clauses.length)] ?? phaseFallbackBeatCaption(shot, phaseIndex)
  const lineTwo = clauses[(occurrenceIndex * 2 + 1) % Math.max(1, clauses.length)]
    ?? phaseFallbackBeatCaption(shot, phaseIndex + 1)
  const first = stripCaptionLeadingNames(compactBeatCaptionSentence(lineOne, phaseFallbackBeatCaption(shot, phaseIndex), 13))
  const second = stripCaptionLeadingNames(compactBeatCaptionSentence(lineTwo, phaseFallbackBeatCaption(shot, phaseIndex + 1), 13))
  return [
    storyboardCaptionLooksComplete(first) ? first : phaseFallbackBeatCaption(shot, phaseIndex),
    storyboardCaptionLooksComplete(second) ? second : phaseFallbackBeatCaption(shot, phaseIndex + 1),
  ]
}

function storyboardCaptionLooksComplete(value: string) {
  const words = value.replace(/[.!?]+$/g, '').split(/\s+/).filter(Boolean)
  if (words.length < 3) return false
  const weakTailWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'with', 'into', 'onto', 'through', 'from', 'to', 'of', 'in', 'on', 'for', 'as', 'while', 'before', 'after', 'then', 'just', 'where'])
  return !weakTailWords.has(words[words.length - 1].toLowerCase())
}

function readShotStoryboardDirectionClauses(shot: Record<string, unknown>) {
  const clauses = [
    compactStoryboardSentence(shot.visualAction, '', 28),
    compactStoryboardSentence(shot.action, '', 28),
    ...readShotStoryboardActionClauses(shot).map((entry) => compactStoryboardSentence(entry, '', 22)),
    compactStoryboardSentence(shot.composition, '', 24),
    compactStoryboardSentence(shot.beat, '', 22),
  ].filter((entry) => storyboardCaptionLooksComplete(entry))
  const seen = new Set<string>()
  return clauses.filter((clause) => {
    const key = slugify(clause)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function storyboardSpeechVisualCue(shot: Record<string, unknown>, occurrenceIndex: number, occurrenceCount: number) {
  const dialogue = readShotDialogueRecords(shot).filter((entry) => readText(entry.line))
  if (dialogue.length === 0) return ''
  const targetIndex = Math.max(0, Math.min(occurrenceCount - 1, Math.floor(occurrenceCount / 2)))
  if (occurrenceIndex !== targetIndex) return ''
  const entry = dialogue[0]
  const speaker = naturalizeCinematicActorName(entry.speaker) || naturalizeCinematicActorName(entry.speakerRefId) || 'The speaker'
  const delivery = cleanBeatCaptionText(entry.delivery).toLowerCase()
  if (/\b(deadpan|even|flat|controlled|cold)\b/.test(delivery)) {
    return `${speaker}'s lips are barely parted, expression flat and precise.`
  }
  if (/\b(stunned|surprised|disbeliev|regret|skeptical|testing)\b/.test(delivery)) {
    return `${speaker}'s mouth is slightly open, guarded emotion visible in the face.`
  }
  if (/\b(quiet|sincere|intimate|soft|low|whisper)\b/.test(delivery)) {
    return `${speaker}'s mouth is barely open, the expression still and close-held.`
  }
  if (/\b(teasing|light|dry)\b/.test(delivery)) {
    return `${speaker}'s mouth is slightly open, a restrained half-smile held back.`
  }
  return `${speaker}'s mouth is slightly open while their expression carries the beat.`
}

function naturalStoryboardCameraPhrase(shot: Record<string, unknown>) {
  const framing = cleanBeatCaptionText(shot.framing)
  const cameraMovement = cleanBeatCaptionText(shot.cameraMovement)
  if (framing && cameraMovement) return `${framing}, composed for ${cameraMovement.toLowerCase()}.`
  if (framing) return `${framing}.`
  if (cameraMovement) return `The frame is composed for ${cameraMovement.toLowerCase()}.`
  return ''
}

function makeBeatPanelVisualDirection(shot: Record<string, unknown>, occurrenceIndex: number, occurrenceCount: number) {
  const clauses = readShotStoryboardDirectionClauses(shot)
  const primary = clauses[occurrenceIndex % Math.max(1, clauses.length)]
    || compactStoryboardSentence(shot.visualAction, readText(shot.beat), 28)
    || phaseFallbackBeatCaption(shot, occurrenceIndex)
  const secondary = clauses[(occurrenceIndex + 1) % Math.max(1, clauses.length)]
    || compactStoryboardSentence(shot.composition, 'Preserve the same character identity, wardrobe, lighting direction, and location logic.', 24)
  const speechCue = storyboardSpeechVisualCue(shot, occurrenceIndex, Math.max(1, occurrenceCount))
  const cameraPhrase = naturalStoryboardCameraPhrase(shot)
  const firstSentence = compactStoryboardSentence(primary, '', 30)
  const secondSentence = compactStoryboardSentence(speechCue || secondary, '', 30)
  const cameraSentence = compactStoryboardSentence(cameraPhrase, '', 24)
  const sentences = [firstSentence, secondSentence, cameraSentence].filter((entry, index, list) => {
    if (!entry) return false
    const key = slugify(entry)
    return key && list.findIndex((candidate) => slugify(candidate) === key) === index
  })
  return sentences.join(' ')
}

function buildCinematicBeatSheetPlan(blockScript: Record<string, unknown>) {
  const shots = Array.isArray(blockScript.shots) ? blockScript.shots.map(asRecord) : []
  const durationSeconds = Math.max(4, Math.min(15, Number(blockScript.durationSeconds ?? 8) || 8))
  const density = classifyCinematicVisualDensity({ durationSeconds, shots })
  const panelCount = adaptiveBeatSheetPanelCount({
    durationSeconds,
    shotCount: shots.length,
    visualDensity: density.visualDensity,
  })
  const durations = distributeBeatDurations(durationSeconds, panelCount)
  let cursor = 0
  const pendingBeats = durations.map((duration, index) => {
    const startSeconds = cursor
    const endSeconds = Math.min(durationSeconds, cursor + duration)
    cursor = endSeconds
    const shot = findShotForBeatMidpoint(shots, startSeconds + Math.max(0.1, (endSeconds - startSeconds) / 2))
    return {
      beatNumber: index + 1,
      startSeconds,
      endSeconds,
      timecode: `${formatTimecode(startSeconds)}-${formatTimecode(endSeconds)}`,
      shotId: readText(shot.shotId) || readText(shot.id),
      shot,
    }
  })
  const shotPanelCounts = new Map<string, number>()
  for (const beat of pendingBeats) {
    const key = beat.shotId || `beat_${beat.beatNumber}`
    shotPanelCounts.set(key, (shotPanelCounts.get(key) ?? 0) + 1)
  }
  const shotPanelIndexes = new Map<string, number>()
  const beats = pendingBeats.map((beat, index) => {
    const key = beat.shotId || `beat_${beat.beatNumber}`
    const occurrenceIndex = shotPanelIndexes.get(key) ?? 0
    shotPanelIndexes.set(key, occurrenceIndex + 1)
    const captions = makeBeatCaptionSentences(beat.shot, occurrenceIndex, shotPanelCounts.get(key) ?? 1)
    const panelVisual = makeBeatPanelVisualDirection(beat.shot, occurrenceIndex, shotPanelCounts.get(key) ?? 1)
    return {
      beatNumber: beat.beatNumber,
      startSeconds: beat.startSeconds,
      endSeconds: beat.endSeconds,
      timecode: beat.timecode,
      shotId: beat.shotId,
      title: readText(beat.shot.title) || `Beat ${index + 1}`,
      panelVisual,
      captionLines: captions,
      visual: [
        readText(beat.shot.visualAction),
        readText(beat.shot.action),
        readText(beat.shot.composition),
      ].filter(Boolean).join(' '),
    }
  })
  const layout = panelCount > 9
    ? { columns: 3, rows: 4, panelCount }
    : panelCount > 6
      ? { columns: 3, rows: 3, panelCount }
      : panelCount > 4
        ? { columns: 3, rows: 2, panelCount }
        : panelCount === 4
          ? { columns: 2, rows: 2, panelCount }
          : { columns: panelCount, rows: 1, panelCount }
  return {
    planningOnly: true,
    durationSeconds,
    panelCount,
    visualDensity: density.visualDensity,
    densityReason: density.densityReason,
    shotStripMode: density.shotStripMode,
    layout,
    beats,
  }
}

function keyframeImageSizeForAspectRatio(aspectRatio: string) {
  const parsed = parseAspectRatio(aspectRatio)
  const ratio = parsed.width / parsed.height
  if (ratio >= 2) return { width: 2048, height: 960 }
  if (ratio > 1.2) return { width: 1792, height: 1024 }
  if (ratio < 0.55) return { width: 1024, height: 1792 }
  if (ratio < 0.9) return { width: 1280, height: 1792 }
  return { width: 1536, height: 1536 }
}

function directionSheetImageSizeForAspectRatio(aspectRatio: string) {
  const parsed = parseAspectRatio(aspectRatio)
  const ratio = parsed.width / parsed.height
  if (ratio < 0.75) return { width: 1536, height: 2304 }
  if (ratio > 1.35) return { width: 2304, height: 1536 }
  return { width: 2048, height: 2048 }
}

function directionSheetShotLine(shot: Record<string, unknown>, index: number) {
  const start = formatTimecode(readShotStartSeconds(shot))
  const end = formatTimecode(readShotEndSeconds(shot))
  const title = readText(shot.title) || `Shot ${index + 1}`
  const visual = compactStoryboardSentence(
    readText(shot.visualAction) || readText(shot.action) || readText(shot.beat),
    'Clear visible action with readable subject blocking.',
    32,
  )
  const composition = compactStoryboardSentence(
    readText(shot.composition) || readText(shot.framing),
    'Maintain coherent spatial layout and continuity.',
    24,
  )
  const camera = compactStoryboardSentence(
    [readText(shot.framing), readText(shot.cameraMovement)].filter(Boolean).join(' '),
    'Camera placement should be readable from the scene layout.',
    18,
  )
  return `${index + 1}. ${start}-${end} ${title}: ${visual} Composition: ${composition} Camera: ${camera}`
}

function directionSheetLocations(blockScript: Record<string, unknown>) {
  const shots = Array.isArray(blockScript.shots) ? blockScript.shots.map(asRecord) : []
  const names = [
    readText(blockScript.location),
    ...shots.map((shot) => readText(shot.location)),
  ].filter(Boolean)
  const seen = new Set<string>()
  return names.filter((name) => {
    const key = slugify(name)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 3)
}

export function buildCinematicDirectionSheetPrompt(input: {
  blockScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  aspectRatio: string
  prompt: string
  guidance: OutputGuidanceBundle | null
  debugCinematicStoryboardStyleSafeMode?: boolean
  cinematicStoryboardStyleOverride?: string
}) {
  const beatSheetPlan = buildCinematicBeatSheetPlan(input.blockScript)
  const shots = Array.isArray(input.blockScript.shots) ? input.blockScript.shots.map(asRecord) : []
  const entities = compactCinematicEntityAnchors(input.assetPack, 10)
  const entityAnchorLines = formatCinematicEntityAnchorLines(entities)
  const safeMode = input.debugCinematicStoryboardStyleSafeMode === true
  const sheetStyle = safeMode
    ? (readText(input.cinematicStoryboardStyleOverride) || DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT)
    : 'project/user visual style from the brief and world context'
  const styleInstruction = safeMode
    ? `Visual style: ${sheetStyle}. This is a stylized production-board translation, not photorealistic likeness. Apply the style to the cinematic panels and hero frame while preserving reference image identity anchors, silhouette, wardrobe, palette, props, material cues, and environment geometry.`
    : 'Visual style: follow the project/user visual style from the brief and world context; maintain palette, wardrobe, environment logic, lighting direction, and character identity across the sheet.'
  const imageSize = directionSheetImageSizeForAspectRatio(input.aspectRatio)
  const shotLines = shots.length > 0
    ? shots.slice(0, 12).map(directionSheetShotLine).join('\n')
    : beatSheetPlan.beats.map((beat) => `${beat.beatNumber}. ${beat.timecode}: ${beat.panelVisual}`).join('\n')
  const timedPanelLines = beatSheetPlan.beats.map((beat) => [
    `Panel ${String(beat.beatNumber).padStart(2, '0')} [${beat.timecode}]`,
    `Visual: ${beat.panelVisual}`,
    `Small label only: ${beat.captionLines[0]}`,
  ].join('\n')).join('\n\n')
  const locations = directionSheetLocations(input.blockScript)
  return {
    beatSheetPlan,
    directionSheetPlan: {
      planningOnly: true,
      sheetKind: 'shot_reference_sheet',
      durationSeconds: beatSheetPlan.durationSeconds,
      aspectRatio: input.aspectRatio,
      imageSize,
      panelCount: beatSheetPlan.panelCount,
      visualDensity: beatSheetPlan.visualDensity,
      densityReason: beatSheetPlan.densityReason,
      shotStripMode: beatSheetPlan.shotStripMode,
      locationNames: locations,
    },
    imageSize,
    prompt: [
      'Create one CINEMATIC DIRECTION SHEET reference image for a single video take.',
      `Canvas: large production-board layout, approximately ${imageSize.width}x${imageSize.height}, clean dark neutral background, sparse readable labels, no decorative poster treatment.`,
      `The final video aspect ratio is ${input.aspectRatio}. Any cinematic shot panels and hero frame must use an internal ${input.aspectRatio} crop.`,
      'This is a visual reference sheet, not a screenplay page and not a text table.',
      '',
      'Required sheet sections:',
      '1. HERO FRAME: one large cinematic composition showing the dominant visual read of the take, with subject identity, wardrobe, props, lighting, and environment locked.',
      `2. TIMED SHOT STRIP: ${beatSheetPlan.panelCount} ${beatSheetPlan.shotStripMode} cinematic panels in sequence, left-to-right, each showing a meaningful visible action/cut beat from the take.`,
      '3. LOCATION FLOOR MAP: simplified top-down map of the scene space with subject positions, movement arrows, camera positions, and camera direction cones.',
      '4. CAMERA LAYOUT: compact visual callouts for each shot camera placement, framing, lens feel, and motion path.',
      '5. LIGHTING / MOOD / STYLE: key light direction, practical lights, palette swatches, atmosphere, weather, haze, reflections, and contrast level.',
      '6. CONTINUITY ANCHORS: compact visual callouts for wardrobe, silhouettes, props, character marks, and environment features.',
      beatSheetPlan.visualDensity === 'slow'
        ? 'Density direction: sparse slow-scene coverage. Make the hero frame, actor blocking, gaze/reaction positions, table/room geography, and lighting mood larger and clearer than the shot strip. Do not invent second-by-second panels.'
        : beatSheetPlan.visualDensity === 'action'
          ? 'Density direction: dense action coverage. Emphasize obstacle/contact beats, movement arrows, spatial transitions, and readable impact geometry across the shot strip.'
          : 'Density direction: balanced coverage. Use panels only for meaningful cut/action changes, while the map, camera plan, and lighting notes carry continuity.',
      '',
      'Visual-only boundaries:',
      '- Do not include spoken words, foley, music, audio notes, technical service names, runtime instructions, JSON, or workflow metadata.',
      '- If a shot contains speech, show only visible performance cues such as lips parted, gaze, posture, or reaction.',
      '- Labels may identify planning marks such as CAM A, KEY LIGHT, MOVE, EXIT, or SHOT 01, but keep labels sparse and readable.',
      '- Do not create dense paragraphs, UI panels, screenplay columns, captions as story text, watermarks, logos, or poster titles.',
      '',
      `Take title: ${readText(input.blockScript.title) || 'Compiled cinematic take'}`,
      `Take duration: ${beatSheetPlan.durationSeconds} seconds exactly.`,
      `Shot density: ${beatSheetPlan.visualDensity}; shot-strip mode: ${beatSheetPlan.shotStripMode}; panel count: ${beatSheetPlan.panelCount}.`,
      `Density reason: ${beatSheetPlan.densityReason}.`,
      locations.length > 0 ? `Location basis: ${locations.join(', ')}` : '',
      '',
      'Timed shot cuts:',
      shotLines,
      '',
      'Shot-strip panel visuals:',
      timedPanelLines,
      '',
      'Floor map requirements:',
      'Show a schematic overhead plan of the location with walls, doors, table/vehicle/terrain/thresholds where relevant, subject start/end positions, movement arrows, camera cones, and practical light sources. Keep it simple enough to read at a glance.',
      '',
      'Camera and lighting requirements:',
      'Show camera positions and movement arrows that match the shot strip. Show key light direction, fill/shadow side, practical source colors, atmosphere, reflections, and mood palette.',
      entities.length > 0 ? 'Canonical visual identity anchors from appearance only:' : '',
      entityAnchorLines,
      input.prompt ? `User brief: ${input.prompt}` : '',
      styleInstruction,
      safeMode ? 'Reference fidelity: use uploaded/entity reference images as strict identity, costume, prop, palette, and spatial-continuity anchors, but render the sheet in the safe painterly comic-book production style rather than realistic likeness.' : '',
      `Storyboard style safe mode: ${safeMode ? 'painterly comic-book' : 'disabled'}.`,
      'The final image should read like a professional director/DP previsualization board: shot progression, spatial logic, camera plan, lighting plan, and continuity in one sheet.',
    ].filter(Boolean).join('\n\n'),
  }
}

export function buildCinematicBeatSheetPrompt(input: {
  blockScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  aspectRatio: string
  prompt: string
  guidance: OutputGuidanceBundle | null
  debugCinematicStoryboardStyleSafeMode?: boolean
  cinematicStoryboardStyleOverride?: string
}) {
  const beatSheetPlan = buildCinematicBeatSheetPlan(input.blockScript)
  const entities = compactCinematicEntityAnchors(input.assetPack, 10)
  const entityAnchorLines = formatCinematicEntityAnchorLines(entities)
  const safeMode = input.debugCinematicStoryboardStyleSafeMode === true
  const storyboardStyle = safeMode
    ? (readText(input.cinematicStoryboardStyleOverride) || DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT)
    : 'project/user visual style from the brief and world context'
  const styleInstruction = safeMode
    ? `Visual style: ${storyboardStyle}. This is a stylized production-board translation, not photorealistic likeness. Apply the style to every panel while preserving each reference image's identity anchors, silhouette, wardrobe, palette, props, material cues, and environment geometry.`
    : 'Visual style: follow the project/user visual style from the brief and world context; maintain palette, wardrobe, environment logic, lighting direction, and character identity across all panels.'
  const imageSize = beatSheetPlan.panelCount > 9
    ? { width: 1536, height: 2304 }
    : beatSheetPlan.panelCount > 6
      ? { width: 1536, height: 1536 }
      : { width: 1536, height: 1024 }
  const beatLines = beatSheetPlan.beats.map((beat) => [
    `BEAT ${String(beat.beatNumber).padStart(2, '0')} [${beat.timecode}]`,
    `Panel visual: ${beat.panelVisual}`,
    `Caption line 1: ${beat.captionLines[0]}`,
    `Caption line 2: ${beat.captionLines[1]}`,
  ].join('\n')).join('\n\n')
  return {
    beatSheetPlan,
    imageSize,
    prompt: [
      'Create a CINEMATIC BEAT SHEET planning image for video pre-production.',
      `Canvas: pure black (#000000), ${beatSheetPlan.layout.rows} rows x ${beatSheetPlan.layout.columns} columns, ${beatSheetPlan.panelCount} timed panels, approximately ${imageSize.width}x${imageSize.height}.`,
      `Every panel is a complete cinematic composition with an internal ${input.aspectRatio} video crop. Use thin black gutters only.`,
      'For each beat, draw the Panel visual as the actual storyboard frame. Caption lines are only the small readable text below that panel.',
      'Below each panel, include a narrow black caption band with panel number, timecode, and exactly two short caption sentences in clean white sans-serif.',
      'No title banner. No footer. No colored gridlines. No table columns. No director notes. No SFX/BGM columns. No UI-like layout. No watermark.',
      'Caption rules: describe only what the viewer sees. Do not place entity lists, JSON, truncated words, ellipses, camera notes, spoken dialogue, or repeated captions in caption bands.',
      'Storyboard rules: every Panel visual must be action-based and visually directed, with clear subject blocking, obstacle/contact, environment geometry, and continuity from the previous panel.',
      'Image prompt boundary: this board is visual-only. Do not render or describe spoken dialogue, foley, music, or audio cues; those belong to the video prompt, not the storyboard image.',
      `Take title: ${readText(input.blockScript.title) || 'Compiled cinematic take'}`,
      `Take duration: ${beatSheetPlan.durationSeconds} seconds exactly.`,
      'Story beats:',
      beatLines,
      `Shot density: ${beatSheetPlan.visualDensity}; shot-strip mode: ${beatSheetPlan.shotStripMode}; panel count: ${beatSheetPlan.panelCount}.`,
      `Density reason: ${beatSheetPlan.densityReason}.`,
      'Panel-count rule: these panels represent meaningful visual cuts or action phases, not every second of runtime. Do not invent extra panels for slow micro-continuity.',
      entities.length > 0 ? 'Canonical visual identity anchors from appearance only:' : '',
      entityAnchorLines,
      input.prompt ? `User brief: ${input.prompt}` : '',
      styleInstruction,
      safeMode ? 'Reference fidelity: use uploaded/entity reference images as strict identity, costume, prop, palette, and spatial-continuity anchors, but render the board in the safe painterly comic-book production style rather than a realistic likeness.' : '',
      `Storyboard style safe mode: ${safeMode ? 'painterly comic-book' : 'disabled'}.`,
      'This image is both a planning artifact and the primary Seedance visual reference. It must look like a clean production beat sheet, not a finished poster.',
    ].filter(Boolean).join('\n\n'),
  }
}

function buildCinematicKeyframePromptPack(input: {
  blockScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  aspectRatio: string
  prompt: string
  debugCinematicStoryboardStyleSafeMode?: boolean
  cinematicStoryboardStyleOverride?: string
}) {
  const shots = Array.isArray(input.blockScript.shots) ? input.blockScript.shots.map(asRecord) : []
  const durationSeconds = Math.max(4, Math.min(15, Number(input.blockScript.durationSeconds ?? 8) || 8))
  const entities = compactCinematicEntityAnchors(input.assetPack, 8)
  const safeMode = input.debugCinematicStoryboardStyleSafeMode === true
  const storyboardStyle = safeMode
    ? (readText(input.cinematicStoryboardStyleOverride) || DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT)
    : ''
  const picks = [
    { keyframeIndex: 0, label: 'opening', timeSeconds: 0, ref: '@Image1' },
    { keyframeIndex: 1, label: 'midpoint', timeSeconds: durationSeconds / 2, ref: '@Image2' },
    { keyframeIndex: 2, label: 'ending', timeSeconds: Math.max(0, durationSeconds - 0.5), ref: '@Image3' },
  ]
  const keyframePrompts = picks.map((pick) => {
    const shot = findShotForBeatMidpoint(shots, pick.timeSeconds)
    const visual = [
      readText(shot.subject),
      readText(shot.action),
      readText(shot.composition),
    ].filter(Boolean).join(' ') || readText(input.blockScript.summary) || input.prompt
    return {
      keyframeIndex: pick.keyframeIndex,
      label: pick.label,
      referenceName: pick.ref,
      timeSeconds: Number(pick.timeSeconds.toFixed(2)),
      shotId: readText(shot.shotId) || readText(shot.id),
      prompt: [
        `Create one clean standalone GPT Image 2 cinematic keyframe for the ${pick.label} of a ${durationSeconds}-second video take.`,
        `Frame aspect ratio: ${input.aspectRatio}. This keyframe will be used as ${pick.ref} for Seedance reference-to-video.`,
        `Visible moment: ${visual}`,
        `Framing and lens: ${readText(shot.camera) || 'cinematic lens, readable subject silhouette, coherent spatial blocking'}.`,
        'Lighting and palette: preserve the world palette, lighting direction, wardrobe, environment logic, and mood from the references.',
        safeMode ? `Render style: ${storyboardStyle}. This keyframe is a stylized production reference, not photorealistic likeness; preserve reference identity anchors, silhouette, wardrobe, props, palette, and environment geometry tightly.` : '',
        entities.length > 0 ? `Identity/world locks: ${compactForPrompt({ entities }, 2200)}` : '',
        input.prompt ? `User brief: ${input.prompt}` : '',
        'No text, no captions, no UI, no collage, no panels, no watermark. Do not render a storyboard sheet. Make it a single cinematic still image.',
      ].filter(Boolean).join('\n'),
    }
  })
  return {
    keyframePlan: {
      durationSeconds,
      aspectRatio: input.aspectRatio,
      keyframes: keyframePrompts.map((entry) => ({
        keyframeIndex: entry.keyframeIndex,
        label: entry.label,
        referenceName: entry.referenceName,
        timeSeconds: entry.timeSeconds,
        shotId: entry.shotId,
      })),
    },
    keyframePrompts,
  }
}

function buildCinematicStoryboardPrompt(input: {
  blockScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  aspectRatio: string
  prompt: string
  guidance: OutputGuidanceBundle | null
  debugCinematicStoryboardStyleSafeMode?: boolean
  cinematicStoryboardStyleOverride?: string
}) {
  const shots = Array.isArray(input.blockScript.shots) ? input.blockScript.shots.map(asRecord) : []
  const storyboardPanels = Array.isArray(input.blockScript.storyboardPanels) ? input.blockScript.storyboardPanels.map(asRecord) : []
  const entities = compactCinematicEntityAnchors(input.assetPack, 10)
  const layout = storyboardLayoutForShotCount(storyboardPanels.length || shots.length || 1)
  const imageSize = storyboardImageSizeForLayout({
    columns: layout.columns,
    rows: layout.rows,
    aspectRatio: input.aspectRatio,
  })
  const safeMode = input.debugCinematicStoryboardStyleSafeMode === true
  const storyboardStyle = safeMode
    ? (readText(input.cinematicStoryboardStyleOverride) || DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT)
    : ''
  const shotLines = storyboardPanels.length > 0
    ? storyboardPanels.slice(0, layout.panelCount).map((panel, index) => [
      `Panel ${index + 1}: ${readText(panel.title) || readText(panel.shotId) || `Storyboard panel ${index + 1}`}.`,
      readText(panel.description),
    ].filter(Boolean).join(' '))
    : shots.slice(0, layout.panelCount).map((shot, index) => [
      `Panel ${index + 1}: ${formatShotSeconds(readShotStartSeconds(shot), index)}s-${formatShotSeconds(readShotEndSeconds(shot), index + 1)}s.`,
      `Subject: ${readText(shot.subject)}.`,
      `Action: ${readText(shot.action)}.`,
      `Camera: ${readText(shot.camera)}.`,
    ].filter(Boolean).join(' '))
  return [
    `Create a clean ${layout.columns}-column x ${layout.rows}-row storyboard contact sheet with exactly ${layout.panelCount} panels for a ${readText(input.blockScript.durationSeconds)} second cinematic video block.`,
    `Every panel must be ${input.aspectRatio}, matching the final video aspect ratio. Arrange panels in timestamp order, left-to-right then top-to-bottom.`,
    `Target storyboard canvas: ${imageSize.width}x${imageSize.height}.`,
    'Each panel is one shot thumbnail. Do not add extra panels or leave blank placeholder panels. Use consistent identity, wardrobe, environment, props, palette, and camera continuity across panels.',
    'No captions, labels, speech bubbles, watermarks, signatures, UI, or visible text unless the user explicitly requested on-screen text.',
    `Block title: ${readText(input.blockScript.title)}`,
    `Block summary: ${readText(input.blockScript.summary)}`,
    'Shot panels:',
    shotLines.join('\n'),
    entities.length > 0 ? 'Canonical visual identity anchors:' : '',
    entities.length > 0 ? compactForPrompt({ entities }, 3200) : '',
    input.prompt ? `User style brief: ${input.prompt}` : '',
    safeMode
      ? `Render as ${storyboardStyle}; this is a stylized production-board translation, not photorealistic likeness. Preserve reference identity anchors, silhouette, wardrobe, props, palette, and environment geometry tightly.`
      : 'Render as low-detail but readable cinematic storyboard art, not a poster and not a finished comic page.',
    `Storyboard style safe mode: ${safeMode ? 'painterly comic-book' : 'disabled'}.`,
  ].filter(Boolean).join('\n\n')
}

function formatSeedanceDialogueForShot(shot: Record<string, unknown>) {
  const dialogueRecords = readShotDialogueRecords(shot).filter((entry) => readText(entry.line))
  if (dialogueRecords.length === 0) return ''
  return dialogueRecords.map((entry) => {
    const speaker = readText(entry.speaker) || readText(entry.speakerRefId) || 'Voice'
    const line = readText(entry.line).replace(/^["']|["']$/g, '')
    const delivery = readText(entry.delivery)
    return `${speaker}: "${line}"${delivery ? ` (${delivery})` : ''}`
  }).join(' ')
}

function formatSeedanceAudioForShot(shot: Record<string, unknown>, generateAudio: boolean) {
  if (!generateAudio) return 'minimal or none'
  const cueRecords = Array.isArray(shot.audioCues) ? shot.audioCues.map((cue) => ({ cue })) : []
  const audioRecords = Array.isArray(shot.audio) ? shot.audio.map(asRecord) : []
  const cues = [
    ...cueRecords.map((entry) => readText(entry.cue)),
    ...audioRecords.map((entry) => [readText(entry.kind), readText(entry.cue)].filter(Boolean).join(': ')),
  ].filter(Boolean)
  if (cues.length > 0) return cues.join('; ')
  return readText(shot.audio) || 'natural scene sound'
}

function formatSeedanceActionForShot(shot: Record<string, unknown>) {
  return cleanBeatCaptionText(shot.action)
    || cleanBeatCaptionText(shot.visualAction)
    || cleanBeatCaptionText(shot.composition)
    || cleanBeatCaptionText(shot.beat)
    || 'one coherent visible action'
}

export function buildCinematicVideoPrompt(input: {
  blockScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle | null
  durationSeconds: number
  aspectRatio: string
  resolution: string
  generateAudio: boolean
  referenceImageCount: number
  cinematicReferenceMode?: string
  debugCinematicStoryboardStyleSafeMode?: boolean
  cinematicStoryboardStyleOverride?: string
}) {
  const shots = Array.isArray(input.blockScript.shots) ? input.blockScript.shots.map(asRecord) : []
  const entities = compactCinematicEntityAnchors(input.assetPack, 8)
  const cinematicReferenceMode = normalizeCinematicReferenceMode(input.cinematicReferenceMode)
  const keyframeCount = cinematicReferenceMode === 'keyframes'
    ? Math.min(3, Math.max(0, input.referenceImageCount))
    : 0
  const extraReferenceStart = cinematicReferenceMode === 'keyframes' ? keyframeCount + 1 : 2
  const extraReferenceCount = cinematicReferenceMode === 'keyframes'
    ? Math.max(0, input.referenceImageCount - keyframeCount)
    : Math.max(0, input.referenceImageCount - 1)
  const truthSourceMode = readText(input.blockScript.truthSourceMode)
    || (String(input.prompt).toLowerCase().match(/\b(ugc|phone|selfie|tiktok|reel|creator)\b/) ? 'UGC / PHONE'
      : String(input.prompt).toLowerCase().match(/\b(broadcast|sports|live tv|news)\b/) ? 'BROADCAST SETUP'
        : String(input.prompt).toLowerCase().match(/\b(anime|animation|animated|2d)\b/) ? '2D / ANIMATION STYLE'
          : 'CINEMATIC SETUP')
  const targetVideoStyle = inferCinematicTargetVideoStyle({
    prompt: input.prompt,
    truthSourceMode,
    blockScript: input.blockScript,
  })
  const storyboardStyleSafeMode = input.debugCinematicStoryboardStyleSafeMode === true
  const storyboardStyle = storyboardStyleSafeMode
    ? (readText(input.cinematicStoryboardStyleOverride) || DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT)
    : ''
  const referenceLegend = cinematicReferenceMode === 'keyframes'
    ? [
      keyframeCount >= 1 ? '@Image1: opening keyframe; lock the opening look, subject identity, wardrobe, palette, and starting composition.' : '',
      keyframeCount >= 2 ? '@Image2: midpoint keyframe; lock the midpoint composition and continuity state.' : '',
      keyframeCount >= 3 ? '@Image3: ending keyframe; lock the final composition and emotional/visual beat.' : '',
      extraReferenceCount > 0 ? `@Image${extraReferenceStart}${extraReferenceCount > 1 ? `-@Image${input.referenceImageCount}` : ''}: individual entity, environment, prop, or optional continuity reference assets only.` : '',
    ].filter(Boolean)
    : cinematicReferenceMode === 'shot_reference_sheet'
      ? [
        input.referenceImageCount >= 1 ? '@Image1: cinematic direction sheet; follow the timed shot strip, blocking, camera layout, spatial map, lighting direction, identity anchors, and continuity.' : '',
        extraReferenceCount > 0 ? `@Image${extraReferenceStart}${extraReferenceCount > 1 ? `-@Image${input.referenceImageCount}` : ''}: individual entity, environment, prop, or optional continuity reference sheets.` : '',
      ].filter(Boolean)
    : [
      input.referenceImageCount >= 1 ? '@Image1: storyboard beat-sheet grid; use it as the primary visual continuity and timing board, following panel order left-to-right then top-to-bottom.' : '',
      extraReferenceCount > 0 ? `@Image${extraReferenceStart}${extraReferenceCount > 1 ? `-@Image${input.referenceImageCount}` : ''}: individual entity, environment, prop, or optional keyframe continuity reference assets.` : '',
    ].filter(Boolean)
  const timeline = shots.length > 0
    ? shots.map((shot) => {
      const start = formatTimecode(readShotStartSeconds(shot))
      const end = formatTimecode(readShotEndSeconds(shot))
      const dialogue = formatSeedanceDialogueForShot(shot)
      return [
        `[${start}-${end}] Shot: ${readText(shot.subject) || readText(shot.title)}`,
        `Camera: ${readText(shot.camera) || 'clear cinematic framing'}`,
        `Action: ${formatSeedanceActionForShot(shot)}`,
        'Physics: natural body/object motion and coherent spatial layout',
        dialogue ? `Dialogue: ${dialogue}` : '',
        `Audio: ${formatSeedanceAudioForShot(shot, input.generateAudio)}`,
      ].filter(Boolean).join(' | ')
    }).join('\n')
    : `[00:00-${formatTimecode(input.durationSeconds)}] Shot: ${readText(input.blockScript.summary) || input.prompt} | Camera: clear cinematic framing | Action: one coherent visible action | Physics: natural motion | Audio: ${input.generateAudio ? 'natural scene sound' : 'minimal or none'}`
  const continuityLock = [
    'Maintain the same subject identity, face/body shape, wardrobe/product details, color palette, environment logic, and lighting style across the full clip.',
    entities.length > 0 ? compactForPrompt({ entities }, 2200) : '',
  ].filter(Boolean).join('\n')
  return [
    `[${truthSourceMode}]`,
    `Generate one ${input.durationSeconds}-second Seedance 2 reference-to-video clip at ${input.aspectRatio}, ${input.resolution}.`,
    `Target video style: ${targetVideoStyle}.`,
    input.generateAudio ? 'Audio: native audio may include restrained music, natural foley, and any authored dialogue/audio cue on the exact timeline.' : 'Audio: keep generated audio minimal or absent.',
    '',
    '[IMAGE REFERENCES / LEGEND]',
    referenceLegend.length > 0
      ? referenceLegend.join('\n')
      : 'No image references are attached; use the written continuity locks only.',
    cinematicReferenceMode === 'keyframes'
      ? 'Beat sheets are planning-only and should not appear in the video. Use keyframes as the main visual references.'
      : cinematicReferenceMode === 'shot_reference_sheet'
        ? storyboardStyleSafeMode
          ? `Cinematic direction-sheet reference mode is enabled. @Image1 is a stylized director/DP reference sheet rendered as ${storyboardStyle}; follow its timed shot strip, subject blocking, camera layout, floor-map spatial logic, lighting direction, hero frame, identity anchors, and continuity, but render the final clip in the target video style: ${targetVideoStyle}. Do not reproduce sheet labels, maps, arrows, camera cones, gutters, caption bands, UI, diagram elements, or text as on-screen content. Use the written timeline below for dialogue, foley, music, and audio timing.`
          : 'Cinematic direction-sheet reference mode is enabled. Follow @Image1 for timed shot progression, subject blocking, camera layout, floor-map spatial logic, lighting direction, hero frame, identity anchors, and continuity. Do not reproduce sheet labels, maps, arrows, camera cones, gutters, caption bands, UI, diagram elements, or text as on-screen content. Use the written timeline below for dialogue, foley, music, and audio timing.'
      : storyboardStyleSafeMode
        ? `Storyboard-grid reference mode is enabled. @Image1 is a stylized storyboard/timing reference rendered as ${storyboardStyle}; follow its panel order, blocking, composition, identity anchors, and continuity, but render the final clip in the target video style: ${targetVideoStyle}. Do not reproduce caption bands, panel borders, grid gutters, UI, or text as on-screen elements. Use the written timeline below for dialogue, foley, music, and audio timing.`
        : 'Storyboard-grid reference mode is enabled. Follow @Image1 as the visual continuity and timing board, but do not reproduce caption bands, panel borders, grid gutters, UI, or text as on-screen elements. Use the written timeline below for dialogue, foley, music, and audio timing.',
    '',
    '[TIMELINE SECOND BY SECOND]',
    timeline,
    '',
    '[CONSISTENCY LOCK]',
    continuityLock,
    '',
    '[POSITIVE CONSTRAINTS]',
    '- stable face and body proportions',
    '- clean readable silhouette',
    '- natural physical motion',
    '- continuous lighting direction',
    '- coherent spatial layout',
    '- no on-screen text, UI, captions, watermark, storyboard-panel artifacts, map diagrams, arrows, or camera-layout marks',
    input.prompt ? `\nUser brief: ${input.prompt}` : '',
  ].filter(Boolean).join('\n\n')
}

function cinematicV2ReferenceIds(assetPack: Record<string, unknown>, context: Record<string, unknown>) {
  const entityRefs = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  const assetRefIds = entityRefs.map((entity) => readText(entity.key)).filter(Boolean)
  const contextRefs = Array.isArray(context.entities)
    ? context.entities.map(asRecord).map((entity) => readText(entity.key)).filter(Boolean)
    : []
  return [...new Set([...assetRefIds, ...contextRefs])]
}

function cinematicV2LocationRefId(assetPack: Record<string, unknown>, context: Record<string, unknown>) {
  const entities = [
    ...(Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []),
    ...(Array.isArray(context.entities) ? context.entities.map(asRecord) : []),
  ]
  const location = entities.find((entity) => ['place', 'environment', 'location', 'location_spot'].includes(readText(entity.type) || readText(entity.nodeType ?? entity.node_type)))
  return readText(location?.key) || null
}

function cinematicV2CharacterRefIds(assetPack: Record<string, unknown>, context: Record<string, unknown>) {
  const entities = [
    ...(Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []),
    ...(Array.isArray(context.entities) ? context.entities.map(asRecord) : []),
  ]
  const characters = entities
    .filter((entity) => ['actor', 'character', 'group'].includes(readText(entity.type) || readText(entity.nodeType ?? entity.node_type)))
    .map((entity) => readText(entity.key))
    .filter(Boolean)
  return [...new Set(characters)].slice(0, 4)
}

function buildFallbackCinematicV2ScreenplayDraft(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
}) {
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  const sequenceUnits = Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord) : []
  const primarySequence = sequenceUnits[0] ?? null
  const primarySequenceMetadata = asRecord(primarySequence?.metadata)
  const primarySequenceCustom = asRecord(primarySequence?.customProperties)
  const primarySequenceData = asRecord(primarySequenceCustom.sequence)
  const sequenceTitle = readText(primarySequence?.name)
  const worldTitle = readText(wiki.title)
  const title = sequenceTitle
    ? `${worldTitle ? `${worldTitle} - ` : ''}${sequenceTitle}`
    : worldTitle
      ? `${worldTitle} Cinematic Scene`
      : 'Cinematic Scene'
  const characterRefIds = cinematicV2CharacterRefIds(input.assetPack, input.context)
  const locationRefId = cinematicV2LocationRefId(input.assetPack, input.context)
  const sequenceStoryLines = [
    readText(primarySequence?.summary),
    readText(primarySequence?.context),
    readText(primarySequenceData.synopsis),
    readText(primarySequenceData.dramaticQuestion),
    readText(primarySequenceData.outcome),
  ].filter(Boolean)
  const rawLines = input.prompt
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const storyLines = sequenceStoryLines.length > 0
    ? sequenceStoryLines.slice(0, 10)
    : rawLines.length > 0
      ? rawLines.slice(0, 10)
      : [readText(wiki.logline) || 'A tense cinematic moment unfolds from the selected world context.']
  const sequenceRefIds = [
    ...readStringArray(primarySequenceData.actorKeys),
    ...readStringArray(primarySequenceData.affectedEntityKeys),
    ...readStringArray(primarySequenceData.sourceRefIds),
    ...readStringArray(primarySequenceData.entityKeys),
    ...readStringArray(primarySequenceData.locationKeys),
    ...readStringArray(primarySequenceData.propKeys),
  ]
  const consequenceRefs = Array.isArray(primarySequenceData.consequences)
    ? primarySequenceData.consequences.flatMap((entry) => readStringArray(asRecord(entry).affectedEntityKeys))
    : []
  const sourceRefIds = [...new Set([
    ...characterRefIds,
    ...(locationRefId ? [locationRefId] : []),
    ...sequenceRefIds,
    ...consequenceRefs,
  ].filter(Boolean))]
  const visualMotifs = [
    ...readStringArray(wiki.visualMotifs),
    readText(primarySequenceMetadata.visualDescription),
  ].filter(Boolean).slice(0, 8)
  const screenplayMarkdown = [
    `# ${title}`,
    '',
    '## Scene Treatment',
    storyLines.map((line) => `- ${line}`).join('\n'),
    '',
    '## Shot-Readable Screenplay',
    storyLines.map((line, index) => {
      if (/["“”]/.test(line)) return `SHOT ${index + 1} - DIALOGUE COVERAGE\n${line}`
      return `SHOT ${index + 1} - VISIBLE ACTION\n${line}`
    }).join('\n\n'),
  ].join('\n')
  return cinematicV2ScreenplayDraftSchema.parse({
    title,
    screenplayMarkdown,
    sceneObjective: storyLines[0] ?? 'Stage the requested cinematic moment clearly.',
    emotionalArc: storyLines.length > 1 ? 'setup -> pressure -> consequence' : 'focused dramatic pressure',
    suggestedDurationSeconds: primarySequence
      ? Math.min(180, Math.max(45, storyLines.length * 12))
      : Math.min(180, Math.max(12, storyLines.length * 5)),
    sourceRefIds,
    visualMotifs,
    diagnostics: ['Fallback screenplay draft generated deterministically.'],
  })
}

function normalizeCinematicV2ScreenplayMarkdown(value: string) {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i)
  const unfenced = (fenced?.[1] ?? trimmed).trim()
  if (!unfenced.startsWith('{')) return unfenced
  try {
    const parsed = parseJsonObject(unfenced)
    return readText(asRecord(parsed).screenplayMarkdown) || readText(asRecord(parsed).text) || unfenced
  } catch {
    return unfenced
  }
}

function inferCinematicV2ScreenplayTitle(markdown: string, fallbackTitle: string) {
  const heading = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line))
  return heading ? heading.replace(/^#{1,3}\s+/, '').trim().slice(0, 120) || fallbackTitle : fallbackTitle
}

async function runCinematicV2ScreenplayAuthor(input: {
  nodeKey: string
  instructions: string
  prompt: string
  fallback: z.infer<typeof cinematicV2ScreenplayDraftSchema>
  maxOutputTokens?: number
}) {
  const model = outputWorkflowTextModel()
  const response = await runOpenAiResponses({
    model,
    instructions: input.instructions,
    input: input.prompt,
    maxOutputTokens: input.maxOutputTokens ?? 4200,
    metadata: {
      graphcore_task: 'output_workflow_cinematic_v2_screenplay_author_markdown',
      graphcore_node_key: input.nodeKey,
    },
    timeoutMs: 120_000,
  })
  if (!response.response.ok) {
    const fallbackReason = `Provider request failed: ${response.response.status ?? 'unknown'} ${response.response.statusText ?? ''}`.trim()
    return { value: input.fallback, response, provider: 'graphcore', model: 'deterministic-output_workflow_cinematic_v2_screenplay_author_markdown-fallback-v1', fallbackUsed: true, fallbackReason }
  }
  const screenplayMarkdown = normalizeCinematicV2ScreenplayMarkdown(response.outputText)
  if (!screenplayMarkdown) {
    return { value: input.fallback, response, provider: 'graphcore', model: 'deterministic-output_workflow_cinematic_v2_screenplay_author_markdown-fallback-v1', fallbackUsed: true, fallbackReason: 'Screenplay author returned empty text.' }
  }
  const value = cinematicV2ScreenplayDraftSchema.parse({
    ...input.fallback,
    title: inferCinematicV2ScreenplayTitle(screenplayMarkdown, input.fallback.title),
    screenplayMarkdown,
    diagnostics: [],
  })
  return { value, response, provider: 'openai', model, fallbackUsed: false, fallbackReason: '' }
}

function buildFallbackCinematicV2ParsedScript(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  screenplayDraft?: Record<string, unknown> | null
}) {
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  const draft = cinematicV2ScreenplayDraftSchema.safeParse(input.screenplayDraft ?? {})
  const characterRefIds = cinematicV2CharacterRefIds(input.assetPack, input.context)
  const locationRefId = cinematicV2LocationRefId(input.assetPack, input.context)
  const sourceText = draft.success ? draft.data.screenplayMarkdown : input.prompt
  const rawLines = sourceText
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}\s/.test(line) && !/^SHOT\s+\d+/i.test(line))
  const lines = rawLines.length > 0
    ? rawLines.slice(0, 16)
    : [readText(wiki.logline) || 'A cinematic confrontation unfolds in the world.']
  return cinematicV2ParsedScriptSchema.parse({
    title: draft.success ? draft.data.title : readText(wiki.title) ? `${readText(wiki.title)} Scene` : 'Cinematic Scene',
    summary: lines.join(' '),
    sourceInputType: draft.success || sourceText.includes('\n') ? 'script' : 'prompt',
    characterRefIds,
    locationRefId,
    propRefIds: [],
    targetDurationSeconds: draft.success && draft.data.suggestedDurationSeconds
      ? Math.min(180, Math.max(8, draft.data.suggestedDurationSeconds))
      : Math.min(120, Math.max(8, lines.length * 4)),
    beats: lines.map((line, index) => ({
      id: `beat_${index + 1}`,
      type: /["“”]/.test(line) ? 'dialogue' : 'action',
      text: line,
      speakerRefId: null,
      characterRefIds,
      propRefIds: [],
      emotionalIntent: index === 0 ? 'setup tension' : index === lines.length - 1 ? 'payoff' : 'escalation',
      estimatedDurationSeconds: Math.max(1.5, Math.min(4, 2 + line.length / 110)),
    })),
    diagnostics: ['Fallback parsed script generated deterministically.'],
  })
}

function buildFallbackCinematicV2SceneState(input: {
  parsedScript: Record<string, unknown>
  context: Record<string, unknown>
}) {
  const parsed = cinematicV2ParsedScriptSchema.parse(input.parsedScript)
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  return cinematicV2SceneStateSchema.parse({
    sceneId: 'scene_1',
    title: parsed.title || 'Scene 1',
    summary: parsed.summary,
    locationRefId: parsed.locationRefId,
    characterRefIds: parsed.characterRefIds,
    propRefIds: parsed.propRefIds,
    timeOfDay: 'cinematic late day or motivated scene lighting',
    weather: 'story-appropriate atmosphere',
    atmosphere: readStringArray(wiki.toneTags).join(', ') || 'tense cinematic atmosphere',
    lighting: {
      direction: 'single motivated key direction preserved across shots',
      quality: 'dramatic but readable',
      colorTemperature: 'world palette with controlled contrast',
      contrast: 'medium-high',
    },
    mood: readText(wiki.genre) || readText(wiki.logline) || 'cinematic tension',
    visualContinuity: {
      palette: readStringArray(wiki.toneTags).slice(0, 5),
      lensLanguage: 'establishing wides, motivated closeups, clean reaction coverage',
      cameraMovementStyle: 'controlled push-ins and grounded physical motion',
      grainOrTexture: 'subtle production texture',
    },
    characterStates: parsed.characterRefIds.map((characterRefId, index) => ({
      characterRefId,
      startingPosition: index === 0 ? 'screen-left / active side' : 'screen-right / counter side',
      emotionalState: index === 0 ? 'intent and pressure' : 'controlled response',
      physicalState: 'canon-consistent',
      outfitState: 'preserve canonical outfit and silhouette',
      injuries: [],
      carriedPropRefIds: [],
      continuityNotes: ['Do not redesign identity, costume, face, props, or silhouette.'],
    })),
    locationState: {
      description: parsed.locationRefId ? 'Use the canonical location as the stage for this scene.' : 'Use the strongest canonical environment implied by the prompt.',
      continuityNotes: ['Keep geography, lighting direction, and screen direction stable.'],
    },
  })
}

function buildFallbackCinematicV2LayoutPlan(input: {
  parsedScript: Record<string, unknown>
  sceneState: Record<string, unknown>
}) {
  const parsed = cinematicV2ParsedScriptSchema.parse(input.parsedScript)
  const sceneState = cinematicV2SceneStateSchema.parse(input.sceneState)
  return cinematicV2SceneLayoutPlanSchema.parse({
    sceneId: sceneState.sceneId,
    summary: 'A readable cinematic blocking plan preserving screen direction and motivated lighting.',
    spatialMapDescription: 'Primary characters occupy opposing screen sides with clear action flow through the central stage. Camera coverage preserves eyelines and screen direction.',
    characterPositions: parsed.characterRefIds.map((characterRefId, index) => ({
      characterRefId,
      zone: index === 0 ? 'screen-left foreground or west side' : 'screen-right midground or east side',
      facing: index === 0 ? 'toward screen-right' : 'toward screen-left',
      movementDirection: index === 0 ? 'left-to-right' : 'right-to-left',
    })),
    landmarks: [{
      id: 'stage_center',
      name: 'Primary action line',
      position: 'center of scene geography',
      continuityRole: 'Keeps action and eyelines readable.',
    }],
    cameraPlan: [
      { id: 'cam_establish', purpose: 'establishing', position: 'wide master angle', lens: '28mm', movement: 'slow push-in', screenDirectionRule: 'Keep primary subject screen-left when possible.' },
      { id: 'cam_dialogue_a', purpose: 'dialogue', position: 'medium close coverage A', lens: '50mm', movement: 'subtle breathing motion', screenDirectionRule: 'Subject A looks screen-right.' },
      { id: 'cam_reaction_b', purpose: 'reaction', position: 'medium close coverage B', lens: '50mm', movement: 'still or slight push', screenDirectionRule: 'Subject B looks screen-left.' },
      { id: 'cam_action', purpose: 'action', position: 'grounded action angle', lens: '35mm', movement: 'short lateral track', screenDirectionRule: 'Preserve the established movement direction.' },
    ],
  })
}

function buildFallbackCinematicV2ShotPlan(input: {
  parsedScript: Record<string, unknown>
  sceneState: Record<string, unknown>
  maxShotCount: number
}) {
  const parsed = cinematicV2ParsedScriptSchema.parse(input.parsedScript)
  const sceneState = cinematicV2SceneStateSchema.parse(input.sceneState)
  const maxShotCount = Math.max(1, Math.min(36, input.maxShotCount || deriveCinematicV2MaxShotCount(parsed.targetDurationSeconds)))
  const beats = parsed.beats.slice(0, maxShotCount)
  const shots = beats.map((beat, index) => {
    const dialogue = beat.type === 'dialogue'
      ? [{
        id: `dialogue_${index + 1}`,
        speakerRefId: beat.speakerRefId || parsed.characterRefIds[0] || 'speaker',
        text: beat.text.replace(/^["“]|["”]$/g, ''),
        emotion: beat.emotionalIntent || 'controlled',
      }]
      : []
    const editorialDurationSeconds = Math.max(1.2, Math.min(4, beat.estimatedDurationSeconds ?? (beat.type === 'dialogue' ? 3 : 2)))
    const purpose = index === 0
      ? 'establishing'
      : beat.type === 'dialogue'
        ? 'dialogue'
        : index === beats.length - 1
          ? 'impact'
          : 'action'
    return {
      id: `shot_${index + 1}`,
      sceneId: sceneState.sceneId,
      index: index + 1,
      title: purpose === 'dialogue' ? `Dialogue ${index + 1}` : index === 0 ? 'Establishing Beat' : `Shot ${index + 1}`,
      purpose,
      editorialDurationSeconds,
      providerDurationSeconds: providerSafeCinematicV2DurationSeconds(editorialDurationSeconds),
      description: beat.text,
      action: beat.type === 'dialogue' ? 'stable visible speaking coverage with minimal head movement' : beat.text,
      dialogue,
      speakerRefIds: dialogue.map((line) => line.speakerRefId),
      visibleCharacterRefIds: beat.characterRefIds.length > 0 ? beat.characterRefIds : parsed.characterRefIds,
      performanceBeats: (beat.characterRefIds.length > 0 ? beat.characterRefIds : parsed.characterRefIds).map((characterRefId, characterIndex) => ({
        characterRefId,
        valence: index === beats.length - 1 ? 0.25 : index === 0 ? -0.2 : 0,
        arousal: purpose === 'impact' || purpose === 'action' ? 0.75 : purpose === 'dialogue' ? 0.55 : 0.45,
        confidence: index === beats.length - 1 ? 0.62 : 0.42,
        dominance: characterIndex === 0 ? 0.52 : 0.46,
        bodyLanguage: purpose === 'dialogue' ? 'controlled visible speaking posture' : 'clear readable physical intention',
        facialExpression: beat.emotionalIntent || 'focused cinematic expression',
        gaze: 'motivated by the shot eyeline and scene geography',
        gesture: purpose === 'dialogue' ? 'small speech-accompanying gesture' : 'single readable action gesture',
        voiceEnergy: dialogue.length > 0 ? beat.emotionalIntent || 'controlled delivery' : undefined,
      })),
      locationRefId: parsed.locationRefId,
      propRefIds: beat.propRefIds,
      continuityInputs: [sceneState.visualContinuity.lensLanguage, sceneState.lighting.direction].filter(Boolean),
      camera: {
        framing: purpose === 'establishing' ? 'wide establishing frame' : purpose === 'dialogue' ? 'medium closeup' : 'readable cinematic action frame',
        angle: purpose === 'impact' ? 'close low impact angle' : 'motivated eye-level or low cinematic angle',
        lens: purpose === 'establishing' ? '28mm' : '50mm',
        movement: purpose === 'dialogue' ? 'subtle push-in' : 'grounded controlled move',
        screenDirectionRule: 'Preserve the scene layout screen direction.',
      },
      requiresLipSync: dialogue.length > 0,
      status: 'planned',
    }
  })
  const totalEditorialDurationSeconds = shots.reduce((total, shot) => total + shot.editorialDurationSeconds, 0)
  return cinematicV2ShotPlanSchema.parse({
    sceneId: sceneState.sceneId,
    totalEditorialDurationSeconds,
    shots,
    performanceArc: parsed.characterRefIds.map((characterRefId) => ({
      characterRefId,
      startState: 'entering the scene with controlled uncertainty',
      endState: 'changed by the scene payoff',
      arc: 'track valence, arousal, confidence, and dominance across the shots without resetting performance continuity',
    })),
    audioPlan: {
      ambience: 'continuous scene ambience placeholder',
      music: 'subtle continuous score placeholder',
      sfx: shots.filter((shot) => shot.purpose === 'action' || shot.purpose === 'impact').map((shot) => `${shot.title} foley/impact placeholder`),
      dialogueTrackCount: shots.reduce((total, shot) => total + shot.dialogue.length, 0),
      placeholderOnly: true,
    },
    diagnostics: ['Fallback shot plan generated deterministically.'],
  })
}

async function runCinematicV2StructuredNode<TValue>(input: {
  nodeKey: string
  schemaName: string
  schema: z.ZodType<TValue>
  instructions: string
  prompt: string
  fallback: TValue
  maxOutputTokens?: number
}) {
  const model = outputWorkflowTextModel()
  const response = await runOpenAiResponses({
    model,
    instructions: input.instructions,
    input: input.prompt,
    text: {
      format: {
        type: 'json_schema',
        name: input.schemaName,
        schema: normalizeStrictJsonSchema(z.toJSONSchema(input.schema)),
        strict: true,
      },
    },
    maxOutputTokens: input.maxOutputTokens ?? 3200,
    metadata: {
      graphcore_task: input.schemaName,
      graphcore_node_key: input.nodeKey,
    },
    timeoutMs: 120_000,
  })
  if (!response.response.ok) {
    const fallbackReason = `Provider request failed: ${response.response.status ?? 'unknown'} ${response.response.statusText ?? ''}`.trim()
    return { value: input.fallback, response, provider: 'graphcore', model: `deterministic-${input.schemaName}-fallback-v1`, fallbackUsed: true, fallbackReason }
  }
  try {
    return { value: input.schema.parse(parseJsonObject(response.outputText)), response, provider: 'openai', model, fallbackUsed: false, fallbackReason: '' }
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : 'Structured output parse failed.'
    return { value: input.fallback, response, provider: 'graphcore', model: `deterministic-${input.schemaName}-fallback-v1`, fallbackUsed: true, fallbackReason }
  }
}

function buildCinematicV2StoryboardPrompt(input: {
  shotPlan: Record<string, unknown>
  sceneState: Record<string, unknown>
  layoutPlan: Record<string, unknown>
  assetPack: Record<string, unknown>
  storyboardGroup?: Record<string, unknown> | null
  aspectRatio: string
  prompt: string
}) {
  const fullShotPlan = cinematicV2ShotPlanSchema.parse(input.shotPlan)
  const storyboardGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(input.storyboardGroup ?? {}).success
    ? cinematicV2StoryboardGroupPlanSchema.shape.groups.element.parse(input.storyboardGroup)
    : null
  const groupShotIds = new Set(storyboardGroup?.shotIds ?? [])
  const matchedGroupShots = storyboardGroup
    ? fullShotPlan.shots.filter((shot) => groupShotIds.has(shot.id))
    : fullShotPlan.shots
  const fallbackGroupShots = storyboardGroup && matchedGroupShots.length === 0
    ? fullShotPlan.shots.slice(
      Math.max(0, (storyboardGroup.index - 1) * 9),
      Math.max(0, (storyboardGroup.index - 1) * 9) + storyboardGroup.panelCount,
    )
    : []
  const shotPlan = {
    ...fullShotPlan,
    shots: matchedGroupShots.length > 0 ? matchedGroupShots : fallbackGroupShots.length > 0 ? fallbackGroupShots : fullShotPlan.shots,
  }
  const sceneState = cinematicV2SceneStateSchema.parse(input.sceneState)
  const layout = storyboardGroup
    ? { rows: storyboardGroup.rows, columns: storyboardGroup.columns, panelCount: storyboardGroup.panelCount }
    : buildCinematicV2StoryboardLayout(shotPlan.shots.length)
  const gridCellCount = layout.rows * layout.columns
  const blankCellCount = Math.max(0, gridCellCount - layout.panelCount)
  const entities = compactCinematicEntityAnchors(input.assetPack, 10)
  const labelByKey = cinematicEntityLabelByKey(input.assetPack)
  const shotLines = shotPlan.shots.slice(0, layout.panelCount).map((shot, index) => [
    `Panel ${index + 1}: ${shot.title}.`,
    `Purpose: ${shot.purpose}.`,
    `Required subjects (${shot.visibleCharacterRefIds.length}): ${shot.visibleCharacterRefIds.map((key) => labelByKey.get(key) || key).join(', ') || 'no named character subject'}.`,
    shot.locationRefId ? `Required location: ${labelByKey.get(shot.locationRefId) || shot.locationRefId}.` : '',
    shot.propRefIds.length > 0 ? `Required props: ${shot.propRefIds.map((key) => labelByKey.get(key) || key).join(', ')}.` : '',
    formatCinematicV2PerformanceDirection(shot) ? `Required acting/performance: ${formatCinematicV2PerformanceDirection(shot)}.` : '',
    'Do not add unlisted principal characters, background lookalikes, duplicate versions of the same character, swapped identities, captions, labels, or panel text.',
    `Visual: ${shot.description || shot.action}.`,
    `Camera: ${shot.camera.framing}; ${shot.camera.angle}; ${shot.camera.movement}.`,
  ].filter(Boolean).join(' ')).join('\n')
  const blankCellInstruction = blankCellCount > 0
    ? `Cells ${layout.panelCount + 1}-${gridCellCount} are intentional empty placeholders: keep them as plain dark/neutral blank cells with no characters, no props, no scene action, and no text.`
    : ''
  return [
    `Create a cinematic storyboard sheet as a fixed ${layout.rows}x${layout.columns} rectangular grid with exactly ${gridCellCount} equal-size cells.`,
    `Fill cells 1-${layout.panelCount} with the storyboard panels below, ordered left-to-right then top-to-bottom. Do not change the row count, column count, cell sizes, or panel positions.`,
    blankCellInstruction,
    storyboardGroup ? `This is storyboard sheet ${storyboardGroup.index}: ${storyboardGroup.summary}.` : '',
    storyboardGroup?.continuityNotes.length ? `Group continuity notes: ${storyboardGroup.continuityNotes.join(' ')}` : '',
    `Every panel must have an internal ${input.aspectRatio} crop and feel like frames from the same continuous scene.`,
    'Use straight, evenly spaced gutters that divide the sheet into identical rectangular cells so automated cropping can split the image by rows and columns.',
    'Do not create a masonry layout, irregular comic layout, unequal panel sizes, merged panels, staggered rows, inset panels, diagonal dividers, floating panels, or extra panels.',
    'Treat each panel as a rough composition/blocking anchor only; final identity accuracy will be repaired later from entity reference sheets.',
    'No captions, no labels, no speech bubbles, no UI, no watermark, no text inside the image.',
    `Scene: ${sceneState.title}. ${sceneState.summary}`,
    `Lighting: ${sceneState.lighting.direction}; ${sceneState.lighting.quality}; ${sceneState.lighting.colorTemperature}.`,
    `Spatial layout: ${readText(input.layoutPlan.summary)} ${readText(input.layoutPlan.spatialMapDescription)}`,
    'Shot panels:',
    shotLines,
    entities.length > 0 ? `Canonical visual identity anchors:\n${compactForPrompt({ entities }, 3200)}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    'Preserve character identity, costumes, props, location architecture, lighting direction, color grade, screen direction, and proportions across panels.',
  ].filter(Boolean).join('\n\n')
}

function buildCinematicV3StoryboardPrompt(input: {
  shotPlan: Record<string, unknown>
  assetPack: Record<string, unknown>
  storyboardGroup?: Record<string, unknown> | null
  aspectRatio: string
  prompt: string
}) {
  const fullShotPlan = cinematicV2ShotPlanSchema.parse(input.shotPlan)
  const storyboardGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(input.storyboardGroup ?? {}).success
    ? cinematicV2StoryboardGroupPlanSchema.shape.groups.element.parse(input.storyboardGroup)
    : null
  const groupShotIds = new Set(storyboardGroup?.shotIds ?? [])
  const matchedGroupShots = storyboardGroup
    ? fullShotPlan.shots.filter((shot) => groupShotIds.has(shot.id))
    : fullShotPlan.shots
  const fallbackGroupShots = storyboardGroup && matchedGroupShots.length === 0
    ? fullShotPlan.shots.slice(
      Math.max(0, (storyboardGroup.index - 1) * 9),
      Math.max(0, (storyboardGroup.index - 1) * 9) + storyboardGroup.panelCount,
    )
    : []
  const shotPlan = {
    ...fullShotPlan,
    shots: matchedGroupShots.length > 0 ? matchedGroupShots : fallbackGroupShots.length > 0 ? fallbackGroupShots : fullShotPlan.shots,
  }
  const layout = storyboardGroup
    ? { rows: storyboardGroup.rows, columns: storyboardGroup.columns, panelCount: storyboardGroup.panelCount }
    : buildCinematicV2StoryboardLayout(shotPlan.shots.length)
  const gridCellCount = layout.rows * layout.columns
  const blankCellCount = Math.max(0, gridCellCount - layout.panelCount)
  const entities = compactCinematicEntityAnchors(input.assetPack, 12)
  const labelByKey = cinematicEntityLabelByKey(input.assetPack)
  const shotLines = shotPlan.shots.slice(0, layout.panelCount).map((shot, index) => {
    const caption = readText((shot as unknown as Record<string, unknown>).caption)
    const storyboardPanelPrompt = readText((shot as unknown as Record<string, unknown>).storyboardPanelPrompt)
    const lighting = readText((shot as unknown as Record<string, unknown>).lighting)
    const mood = readText((shot as unknown as Record<string, unknown>).mood)
    return [
      `Panel ${index + 1}: ${shot.title}.`,
      `Required subjects (${shot.visibleCharacterRefIds.length}): ${shot.visibleCharacterRefIds.map((key) => labelByKey.get(key) || key).join(', ') || 'no named character subject'}.`,
      shot.locationRefId ? `Required location: ${labelByKey.get(shot.locationRefId) || shot.locationRefId}.` : '',
      shot.propRefIds.length > 0 ? `Required props: ${shot.propRefIds.map((key) => labelByKey.get(key) || key).join(', ')}.` : '',
      formatCinematicV2PerformanceDirection(shot) ? `Required acting/performance: ${formatCinematicV2PerformanceDirection(shot)}.` : '',
      `Action: ${shot.action || shot.description}.`,
      caption ? `Caption meaning, not visible text: ${caption}.` : '',
      lighting ? `Lighting: ${lighting}.` : '',
      mood ? `Mood: ${mood}.` : '',
      storyboardPanelPrompt ? `Panel composition: ${storyboardPanelPrompt}.` : '',
      `Camera: ${shot.camera.framing}; ${shot.camera.angle}; ${shot.camera.lens}; ${shot.camera.movement}.`,
      'Do not add unlisted principal characters, duplicate versions of the same character, captions, labels, speech bubbles, UI, or panel text.',
    ].filter(Boolean).join(' ')
  }).join('\n')
  const blankCellInstruction = blankCellCount > 0
    ? `Cells ${layout.panelCount + 1}-${gridCellCount} are intentional empty placeholders: keep them plain dark/neutral blank cells with no characters, no props, no action, and no text.`
    : ''
  return [
    `Create a high-quality cinematic storyboard sheet as a fixed ${layout.rows}x${layout.columns} rectangular grid with exactly ${gridCellCount} equal-size cells.`,
    `Fill cells 1-${layout.panelCount} with the storyboard panels below, ordered left-to-right then top-to-bottom. Do not change row count, column count, cell sizes, or panel positions.`,
    blankCellInstruction,
    storyboardGroup ? `This is storyboard sheet ${storyboardGroup.index}: ${storyboardGroup.summary}.` : '',
    storyboardGroup ? `This sheet represents one video block of ${Math.min(15, Math.max(0, Number(storyboardGroup.editorialDurationSeconds) || 0)).toFixed(1).replace(/\.0$/, '')} seconds or less. It may contain fewer than 4 panels for a slow scene; leave unused grid cells blank exactly as instructed.` : '',
    storyboardGroup?.continuityNotes.length ? `Group continuity notes: ${storyboardGroup.continuityNotes.join(' ')}` : '',
    `Every panel must have an internal ${input.aspectRatio} cinematic crop and feel like frames from the same continuous sequence.`,
    'Use straight, evenly spaced gutters that divide the sheet into identical rectangular cells so automated cropping can split the image by rows and columns.',
    'Do not create a masonry layout, irregular comic layout, unequal panel sizes, merged panels, staggered rows, inset panels, diagonal dividers, floating panels, or extra panels.',
    'No captions, no labels, no speech bubbles, no UI, no watermark, no text inside the image.',
    'Shot panels:',
    shotLines,
    entities.length > 0 ? `Canonical visual identity anchors:\n${compactForPrompt({ entities }, 3600)}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    'Preserve character identity, costumes, props, location architecture, lighting direction, color grade, screen direction, and proportions across panels.',
  ].filter(Boolean).join('\n\n')
}

function formatCinematicV2PerformanceDirection(shot: z.infer<typeof cinematicV2ShotSchema>) {
  if (shot.performanceBeats.length === 0) return ''
  return shot.performanceBeats.map((beat) => {
    const metrics = [
      `valence ${beat.valence}`,
      `arousal ${beat.arousal}`,
      `confidence ${beat.confidence}`,
      `dominance ${beat.dominance}`,
    ].join(', ')
    const acting = [
      beat.facialExpression ? `face: ${beat.facialExpression}` : '',
      beat.bodyLanguage ? `body: ${beat.bodyLanguage}` : '',
      beat.gaze ? `gaze: ${beat.gaze}` : '',
      beat.gesture ? `gesture: ${beat.gesture}` : '',
      beat.voiceEnergy ? `voice: ${beat.voiceEnergy}` : '',
    ].filter(Boolean).join('; ')
    return `${beat.characterRefId} (${metrics})${acting ? ` - ${acting}` : ''}`
  }).join(' | ')
}

function buildCinematicV2KeyframePrompt(input: {
  shot: Record<string, unknown>
  sceneState: Record<string, unknown>
  layoutPlan: Record<string, unknown>
  panelAssetKey: string
  assetPack: Record<string, unknown>
  aspectRatio: string
  prompt: string
}) {
  const shot = cinematicV2ShotSchema.parse(input.shot)
  const sceneState = cinematicV2SceneStateSchema.parse(input.sceneState)
  const entities = compactCinematicEntityAnchors(input.assetPack, 8)
  const labelByKey = cinematicEntityLabelByKey(input.assetPack)
  const expectedCharacters = shot.visibleCharacterRefIds.map((key) => labelByKey.get(key) || key).filter(Boolean)
  const expectedProps = shot.propRefIds.map((key) => labelByKey.get(key) || key).filter(Boolean)
  const performanceDirection = formatCinematicV2PerformanceDirection(shot)
  return [
    `Refine the extracted storyboard panel into one high-quality cinematic keyframe for shot ${shot.index}: ${shot.title}.`,
    `Aspect ratio: ${input.aspectRatio}.`,
    `Shot purpose: ${shot.purpose}.`,
    `Required visible characters (${expectedCharacters.length}): ${expectedCharacters.join(', ') || 'none'}.`,
    shot.locationRefId ? `Required location/environment: ${labelByKey.get(shot.locationRefId) || shot.locationRefId}.` : '',
    expectedProps.length > 0 ? `Required props/items: ${expectedProps.join(', ')}.` : '',
    `Shot action: ${shot.action || shot.description}.`,
    performanceDirection ? `Acting/performance direction: ${performanceDirection}. Use the valence/arousal/confidence/dominance values as readable facial expression, body language, gaze, and gesture.` : '',
    `Camera: ${shot.camera.framing}; ${shot.camera.angle}; ${shot.camera.lens}; ${shot.camera.movement}.`,
    `Scene lighting: ${sceneState.lighting.direction}; ${sceneState.lighting.quality}; ${sceneState.lighting.colorTemperature}; ${sceneState.lighting.contrast}.`,
    `Layout rule: ${shot.camera.screenDirectionRule || readText(input.layoutPlan.summary)}.`,
    `Source panel asset: ${input.panelAssetKey}. Use it for composition and blocking only, not as identity truth.`,
    'Entity reference sheets and shot-scoped visual descriptions are the identity truth. Repair faces, silhouettes, wardrobe, badges, logos, props, hands, scale, and environment details to match those references exactly.',
    entities.length > 0 ? `Canonical visual identity anchors:\n${compactForPrompt({ entities }, 2600)}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    'Do not redesign characters, costumes, props, faces, weapons, or location architecture.',
    'No duplicate principal characters, no background lookalikes of listed characters, no swapped identities, no extra unlisted characters, no malformed signature logos/badges, no captions, no UI, no text, no watermark, no storyboard borders, no reference-sheet layout artifacts.',
  ].filter(Boolean).join('\n\n')
}

function buildCinematicV2VideoPrompt(input: {
  shot: Record<string, unknown>
  sceneState: Record<string, unknown>
  layoutPlan: Record<string, unknown>
  assetPack: Record<string, unknown>
  aspectRatio: string
  resolution: string
  prompt: string
}) {
  const shot = cinematicV2ShotSchema.parse(input.shot)
  const sceneState = cinematicV2SceneStateSchema.parse(input.sceneState)
  const entities = compactCinematicEntityAnchors(input.assetPack, 6)
  const dialogue = shot.dialogue.map((line) => `${line.speakerRefId}: "${line.text}" (${line.emotion})`).join(' ')
  const performanceDirection = formatCinematicV2PerformanceDirection(shot)
  const entityLocks = entities
    .map((entity) => {
      const record = asRecord(entity)
      const name = readText(record.name)
      const visualDescription = readText(record.visualDescription)
      return [name, visualDescription].filter(Boolean).join(': ')
    })
    .filter(Boolean)
    .slice(0, 4)
  return [
    `Create a ${shot.providerDurationSeconds}-second cinematic shot at ${input.aspectRatio}, ${input.resolution}.`,
    `Use @Image1 as the exact opening composition, character identity, wardrobe, lighting, and environment reference for shot ${shot.index}: ${shot.title}.`,
    `Action: ${shot.action || shot.description}.`,
    performanceDirection ? `Performance over the clip: ${performanceDirection}. Let the acting change subtly through posture, gaze, expression, and gesture without breaking identity.` : '',
    `Blocking: ${shot.camera.screenDirectionRule || readText(input.layoutPlan.summary) || 'preserve the established scene geography and screen direction.'}`,
    `Camera: ${shot.camera.framing}, ${shot.camera.angle}, ${shot.camera.lens}; ${shot.camera.movement}.`,
    `End state: let the action complete naturally while preserving the same location, face, costume, prop design, and scene geography.`,
    dialogue ? `Visible dialogue: ${dialogue}. Keep mouth motion subtle and stable; final lip sync is not required.` : '',
    `Lighting and grade: ${sceneState.lighting.direction}; ${sceneState.lighting.quality}; ${sceneState.lighting.colorTemperature}; ${sceneState.lighting.contrast}.`,
    `Continuity: ${[...shot.continuityInputs, sceneState.visualContinuity.cameraMovementStyle].filter(Boolean).join('; ')}.`,
    entityLocks.length > 0 ? `Identity references: ${entityLocks.join(' | ')}` : '',
    input.prompt ? `Brief context: ${input.prompt}` : '',
    'Avoid: captions, subtitles, UI, watermarks, storyboard borders, maps, arrows, labels, reference-sheet artifacts, sudden redesigns, teleporting, extra cuts, montage edits, camera-angle changes inside the shot.',
  ].filter(Boolean).join('\n\n')
}

function buildCinematicV2Timeline(input: {
  shotPlan: Record<string, unknown>
  videos: Record<string, unknown>[]
}) {
  const shotPlan = cinematicV2ShotPlanSchema.parse(input.shotPlan)
  let cursor = 0
  const videoByShotId = new Map(input.videos.map((video) => [readText(video.shotId), video] as const))
  const videoClips = shotPlan.shots.map((shot) => {
    const video = videoByShotId.get(shot.id) ?? {}
    const startTime = cursor
    const endTime = startTime + shot.editorialDurationSeconds
    cursor = endTime
    return {
      shotId: shot.id,
      videoAssetKey: readText(video.assetKey) || null,
      startTime,
      endTime,
      trimIn: 0,
      trimOut: Math.max(0, shot.providerDurationSeconds - shot.editorialDurationSeconds),
    }
  })
  return cinematicV2TimelineSchema.parse({
    id: 'timeline_1',
    sceneId: shotPlan.sceneId,
    durationSeconds: cursor,
    videoClips,
    audioClips: [
      { type: 'ambience', label: shotPlan.audioPlan.ambience || 'continuous ambience placeholder', startTime: 0, endTime: cursor, volumeDb: -12, placeholder: true },
      { type: 'music', label: shotPlan.audioPlan.music || 'continuous music placeholder', startTime: 0, endTime: cursor, volumeDb: -18, placeholder: true },
    ],
  })
}

function compileCinematicScriptDocForOutput(input: {
  scriptDoc: Record<string, unknown>
  directorScriptDoc?: Record<string, unknown> | null
  maxDynamicTakes: number
  maxTotalDurationSeconds?: number | null
}) {
  const cinematicScriptDoc = cinematicScriptDocSchema.parse(input.scriptDoc)
  const compiledCinematicSequence = buildCinematicSequenceFromScriptDoc(cinematicScriptDoc)
  const allTakes = compiledCinematicSequence.takes
  if (allTakes.length === 0) throw new Error('Cinematic script compile produced zero video takes.')
  const maxDynamicTakes = Math.max(1, Math.min(6, input.maxDynamicTakes || 6))
  const maxTotalDurationSeconds = Math.max(4, Math.min(60, Number(input.maxTotalDurationSeconds ?? CINEMATIC_MAX_TOTAL_DURATION_SECONDS) || CINEMATIC_MAX_TOTAL_DURATION_SECONDS))
  const generatedTakes: typeof allTakes = []
  let generatedDurationSeconds = 0
  for (const take of allTakes) {
    if (generatedTakes.length >= maxDynamicTakes) break
    const durationSeconds = Math.max(4, Math.min(15, Number(take.durationSeconds ?? 4) || 4))
    if (generatedTakes.length > 0 && generatedDurationSeconds + durationSeconds > maxTotalDurationSeconds) break
    generatedTakes.push(take)
    generatedDurationSeconds += durationSeconds
    if (generatedDurationSeconds >= maxTotalDurationSeconds) break
  }
  if (generatedTakes.length === 0) generatedTakes.push(allTakes[0])
  const takePlan = generatedTakes.map((take, index) => ({
    takeId: take.id,
    takeIndex: index,
    title: take.title || `Take ${index + 1}`,
    shotIds: take.shotIds,
    durationSeconds: Math.max(4, Math.min(15, Number(take.durationSeconds ?? 4) || 4)),
    startSeconds: Number(take.startSeconds ?? 0) || 0,
    endSeconds: Number(take.endSeconds ?? 0) || 0,
    breakReason: readText(take.breakReason),
    continuityRefIds: readStringArray(take.continuityRefIds),
    requiredSourceRefIds: readStringArray(take.requiredSourceRefIds),
    storyboardPanelPlan: take.storyboardPanelPlan ?? null,
    storyboardPanelScriptText: readText(take.storyboardPanelScriptText),
    representativeStillPrompt: readText(take.representativeStillPrompt),
    truthSourceMode: readText(take.truthSourceMode),
    beatSheetPlan: take.beatSheetPlan ?? null,
    keyframePlan: take.keyframePlan ?? null,
    referenceLegend: Array.isArray(take.referenceLegend) ? take.referenceLegend : [],
    timelineCells: Array.isArray(take.timelineCells) ? take.timelineCells : [],
    continuityLock: readText(take.continuityLock),
    positiveConstraints: readStringArray(take.positiveConstraints),
    planningOnlyArtifactKeys: readStringArray(take.planningOnlyArtifactKeys),
    seedanceEndpoint: readText(take.seedanceEndpoint) || 'reference-to-video',
  }))
  const totalDurationSeconds = takePlan.reduce((total, take) => total + take.durationSeconds, 0)
  const compileHash = hashOutputWorkflowValue({ scriptDoc: cinematicScriptDoc, takePlan })
  return {
    directorScriptDoc: input.directorScriptDoc && Object.keys(input.directorScriptDoc).length > 0 ? input.directorScriptDoc : null,
    cinematicScriptDoc,
    compiledCinematicSequence,
    takePlan,
    totalDurationSeconds,
    maxTotalDurationSeconds,
    dynamicTakeCount: takePlan.length,
    cappedTakeCount: allTakes.length > generatedTakes.length ? allTakes.length : null,
    scriptDurationSource: 'authored_script',
    compileHash,
    diagnostics: [
      ...(allTakes.length > generatedTakes.length
        ? [`Cinematic dynamic fanout is capped at ${maxDynamicTakes} takes and ${maxTotalDurationSeconds} seconds in V1; generated the first ${generatedTakes.length} of ${allTakes.length} compiled takes.`]
        : []),
      ...(totalDurationSeconds >= maxTotalDurationSeconds
        ? [`Generated cinematic duration reached the ${maxTotalDurationSeconds}-second maximum.`]
        : []),
    ],
  }
}

function nameForCinematicRef(assetPack: Record<string, unknown>, refId: string | null | undefined) {
  const id = readText(refId)
  if (!id) return ''
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  const match = entities.find((entity) => readText(entity.key) === id || readText(entity.id) === id)
  return readText(match?.name) || id
}

function actionTextForCompiledShot(shot: Record<string, unknown>, assetPack: Record<string, unknown>) {
  const actions = Array.isArray(shot.actions) ? shot.actions.map(asRecord) : []
  if (actions.length === 0) return readText(shot.visualPrompt) || readText(shot.beat) || readText(shot.title)
  return actions.map((action) => [
    nameForCinematicRef(assetPack, action.actorRefId),
    readText(action.verb),
    nameForCinematicRef(assetPack, action.targetRefId),
    readText(action.stagingNotes),
  ].filter(Boolean).join(' ')).filter(Boolean).join(' Then ')
}

function directorActionsForCompiledShot(shot: Record<string, unknown>, assetPack: Record<string, unknown>, durationSeconds: number) {
  const actions = Array.isArray(shot.actions) ? shot.actions.map(asRecord) : []
  return actions.map((action, index) => ({
    actor: nameForCinematicRef(assetPack, action.actorRefId) || readText(action.actorRefId),
    verb: readText(action.verb),
    target: nameForCinematicRef(assetPack, action.targetRefId) || readText(action.targetRefId),
    prop: nameForCinematicRef(assetPack, action.propRefId) || readText(action.propRefId),
    stagingNotes: readText(action.stagingNotes),
    startSeconds: Math.max(0, Number(action.startSeconds ?? 0) || 0),
    endSeconds: Math.max(0, Math.min(durationSeconds, Number(action.endSeconds ?? durationSeconds) || durationSeconds)),
    orderIndex: index,
  })).filter((entry) => entry.verb || entry.stagingNotes)
}

function directorDialogueForCompiledShot(shot: Record<string, unknown>, assetPack: Record<string, unknown>) {
  const dialogue = Array.isArray(shot.dialogue) ? shot.dialogue.map(asRecord) : []
  return dialogue.map((entry, index) => ({
    speaker: nameForCinematicRef(assetPack, entry.speakerRefId) || readText(entry.speakerRefId),
    line: readText(entry.line),
    delivery: readText(entry.delivery),
    startSeconds: Number(entry.startSeconds ?? 0) || 0,
    endSeconds: Number(entry.endSeconds ?? 0) || 0,
    orderIndex: index,
  })).filter((entry) => entry.line)
}

function directorAudioCuesForCompiledShot(shot: Record<string, unknown>, assetPack: Record<string, unknown>) {
  const audio = Array.isArray(shot.audio) ? shot.audio.map(asRecord) : []
  return audio.map((entry, index) => ({
    kind: readText(entry.kind),
    cue: readText(entry.cue),
    source: nameForCinematicRef(assetPack, entry.sourceRefId) || readText(entry.sourceRefId),
    startSeconds: Number(entry.startSeconds ?? 0) || 0,
    endSeconds: Number(entry.endSeconds ?? 0) || 0,
    orderIndex: index,
  })).filter((entry) => entry.cue)
}

function audioTextForCompiledShot(shot: Record<string, unknown>) {
  const dialogue = Array.isArray(shot.dialogue) ? shot.dialogue.map(asRecord) : []
  const audio = Array.isArray(shot.audio) ? shot.audio.map(asRecord) : []
  const dialogueText = dialogue.map((entry) => [
    readText(entry.speakerRefId),
    readText(entry.line),
    readText(entry.delivery),
  ].filter(Boolean).join(': ')).filter(Boolean).join(' ')
  const audioText = audio.map((entry) => [
    readText(entry.kind),
    readText(entry.cue),
  ].filter(Boolean).join(': ')).filter(Boolean).join(' ')
  return [dialogueText, audioText].filter(Boolean).join(' ')
}

function buildTakeBlockScriptFromCompiledSequence(input: {
  compiledCinematicSequence: Record<string, unknown>
  takePlan: Record<string, unknown>[]
  takeId?: string
  takeIndex?: number
  assetPack: Record<string, unknown>
}) {
  const take = input.takeId
    ? input.takePlan.find((candidate) => readText(candidate.takeId) === input.takeId)
    : input.takePlan[input.takeIndex ?? 0]
  if (!take) throw new Error('Compiled cinematic take was not found for this dynamic node.')
  const sequenceShots = Array.isArray(input.compiledCinematicSequence.shots)
    ? input.compiledCinematicSequence.shots.map(asRecord)
    : []
  const shotIds = new Set(readStringArray(take.shotIds))
  const takeStart = Number(take.startSeconds ?? 0) || 0
  const durationSeconds = Math.max(4, Math.min(15, Number(take.durationSeconds ?? 4) || 4))
  const shots = sequenceShots
    .filter((shot) => shotIds.has(readText(shot.id)))
    .map((shot, index) => {
      const start = Math.max(0, Number(shot.startSeconds ?? 0) - takeStart)
      const end = Math.max(start + 0.25, Math.min(durationSeconds, Number(shot.endSeconds ?? start + Number(shot.durationSeconds ?? 1)) - takeStart))
      const subject = [
        ...readStringArray(shot.participantRefIds).map((refId) => nameForCinematicRef(input.assetPack, refId)),
        nameForCinematicRef(input.assetPack, readText(shot.locationRefId)),
      ].filter(Boolean).join(', ') || readText(shot.title) || `Shot ${index + 1}`
      const relativeDuration = Math.max(0.25, end - start)
      const actions = directorActionsForCompiledShot(shot, input.assetPack, relativeDuration)
      const dialogue = directorDialogueForCompiledShot(shot, input.assetPack)
      const audioCues = directorAudioCuesForCompiledShot(shot, input.assetPack)
      return {
        shotNumber: index + 1,
        shotId: readText(shot.id),
        startTimeSeconds: Number(start.toFixed(2)),
        endTimeSeconds: Number(end.toFixed(2)),
        absoluteStartSeconds: Number(Number(shot.startSeconds ?? 0).toFixed(2)),
        absoluteEndSeconds: Number(Number(shot.endSeconds ?? 0).toFixed(2)),
        subject,
        title: readText(shot.title),
        beat: readText(shot.beat),
        emotionalBeat: readText(shot.emotionalBeat),
        visualAction: readText(shot.visualPrompt) || readText(shot.beat),
        framing: readText(shot.framing),
        cameraMovement: readText(shot.cameraMovement),
        participants: readStringArray(shot.participantRefIds).map((refId) => nameForCinematicRef(input.assetPack, refId) || refId),
        location: nameForCinematicRef(input.assetPack, readText(shot.locationRefId)) || readText(shot.locationRefId),
        props: readStringArray(shot.propRefIds).map((refId) => nameForCinematicRef(input.assetPack, refId) || refId),
        actions,
        dialogue,
        audioCues,
        action: actionTextForCompiledShot(shot, input.assetPack),
        camera: [readText(shot.cameraMovement), readText(shot.cameraAngle), readText(shot.framing), readText(shot.lensPreference)].filter(Boolean).join(', '),
        composition: readText(shot.compositionGuide) || readText(shot.visualPrompt),
        audio: audioTextForCompiledShot(shot),
        referenceNotes: 'Storyboard-grid reference mode uses the beat sheet first, followed by individual entity/environment/prop reference sheets.',
      }
    })
  const storyboardPanelPlan = asRecord(take.storyboardPanelPlan)
  const storyboardPanels = Array.isArray(storyboardPanelPlan.panels) ? storyboardPanelPlan.panels.map(asRecord) : []
  return {
    blockNumber: Number(take.takeIndex ?? 0) + 1,
    blockCount: input.takePlan.length,
    takeId: readText(take.takeId),
    takeIndex: Number(take.takeIndex ?? 0) || 0,
    durationSeconds,
    title: readText(take.title) || `Take ${(Number(take.takeIndex ?? 0) || 0) + 1}`,
    storyFunction: readText(take.breakReason) || 'compiled cinematic take',
    hook: shots[0]?.action ?? '',
    summary: readText(take.representativeStillPrompt) || shots.map((shot) => shot.action).join(' '),
    continuityNotes: readStringArray(take.continuityRefIds),
    truthSourceMode: readText(take.truthSourceMode),
    referenceLegend: Array.isArray(take.referenceLegend) ? take.referenceLegend : [],
    timelineCells: Array.isArray(take.timelineCells) ? take.timelineCells : [],
    continuityLock: readText(take.continuityLock),
    positiveConstraints: readStringArray(take.positiveConstraints),
    beatSheetPlan: take.beatSheetPlan ?? null,
    keyframePlan: take.keyframePlan ?? null,
    planningOnlyArtifactKeys: readStringArray(take.planningOnlyArtifactKeys),
    storyboardPanels,
    shots,
  }
}

function dynamicNodeRow(input: {
  workflow: OutputWorkflow
  key: string
  nodeType: OutputWorkflowNode['nodeType']
  label: string
  x: number
  y: number
  config: Record<string, unknown>
  compileHash: string
  generatedByNodeKey?: string
}) {
  return {
    workflow_id: input.workflow.id,
    draft_id: input.workflow.draftId,
    key: input.key,
    node_type: input.nodeType,
    label: input.label,
    position: { x: input.x, y: input.y },
    config: input.config,
    inputs: {},
    outputs: {},
    dirty: true,
    input_hash: '',
    output_hash: '',
    metadata: {
      dynamicCinematicGenerated: true,
      dynamicCompileHash: input.compileHash,
      generatedByNodeKey: input.generatedByNodeKey ?? 'cinematic_dynamic_take_fanout',
    },
  }
}

function preserveExistingDynamicNodeOutput(input: {
  nextRow: Record<string, unknown>
  existingNode: OutputWorkflowNodeRow | null | undefined
  preserve: boolean
  compileHash: string
}) {
  if (!input.preserve || !input.existingNode) return input.nextRow
  const existingMetadata = asRecord(input.existingNode.metadata)
  return {
    ...input.nextRow,
    outputs: asRecord(input.existingNode.outputs),
    dirty: input.existingNode.dirty === true,
    input_hash: readText(input.existingNode.input_hash),
    output_hash: readText(input.existingNode.output_hash),
    metadata: {
      ...asRecord(input.nextRow.metadata),
      execution: asRecord(existingMetadata.execution),
      outputPreview: asRecord(existingMetadata.outputPreview),
      preservedDuringSelectedShotMaterialization: true,
      preservedFromDynamicCompileHash: readText(existingMetadata.dynamicCompileHash),
      dynamicCompileHash: input.compileHash,
    },
  }
}

function isStaleDynamicCinematicNode(node: { metadata?: unknown } | null | undefined) {
  const metadata = asRecord(node?.metadata)
  return metadata.dynamicCinematicGenerated === true && metadata.dynamicCinematicStale === true
}

function isDynamicCinematicFanoutNodeKey(key: string) {
  return key === 'cinematic_v3_dynamic_storyboard_fanout' || key === 'cinematic_v2_dynamic_shot_fanout' || key === 'cinematic_dynamic_take_fanout'
}

function dynamicEdgeRow(input: {
  workflow: OutputWorkflow
  key: string
  sourceNodeKey: string
  sourcePort: string
  targetNodeKey: string
  targetPort: string
  compileHash: string
  metadata?: Record<string, unknown>
  generatedByNodeKey?: string
}) {
  return {
    workflow_id: input.workflow.id,
    draft_id: input.workflow.draftId,
    key: input.key,
    source_node_key: input.sourceNodeKey,
    source_port: input.sourcePort,
    target_node_key: input.targetNodeKey,
    target_port: input.targetPort,
    metadata: {
      dynamicCinematicGenerated: true,
      dynamicCompileHash: input.compileHash,
      generatedByNodeKey: input.generatedByNodeKey ?? 'cinematic_dynamic_take_fanout',
      ...(input.metadata ?? {}),
    },
  }
}

async function materializeDynamicCinematicTakeFanout(input: {
  client: DatabaseClient
  workflow: OutputWorkflow
  compileOutputs: Record<string, unknown>
  config: Record<string, unknown>
}) {
  const takePlan = Array.isArray(input.compileOutputs.takePlan) ? input.compileOutputs.takePlan.map(asRecord) : []
  const compileHash = readText(input.compileOutputs.compileHash) || hashOutputWorkflowValue(input.compileOutputs)
  if (takePlan.length === 0) throw new Error('Cannot materialize cinematic takes because the compile output has no takePlan.')

  const aspectRatio = readText(input.config.aspectRatio) || '16:9'
  const resolution = readText(input.config.resolution) || '720p'
  const generateAudio = input.config.generateAudio !== false
  const debugSkipVideoGeneration = input.config.debugSkipVideoGeneration === true
  const videoProvider = resolveOutputVideoProvider(input.config)
  const videoModel = readText(input.config.videoModel)
    || readText(input.config.model)
    || (videoProvider === 'muapi' ? DEFAULT_MUAPI_VIDEO_MODEL : resolveFalVideoModel(resolution))
  const presetFamily = readText(input.config.presetFamily) || 'story_movie_tv'
  const cinematicReferenceMode = normalizeCinematicReferenceMode(input.config.cinematicReferenceMode)
  const storyboardStylePolicy = resolveCinematicStoryboardStylePolicy(input.config)
  const useKeyframes = cinematicReferenceMode === 'keyframes' || cinematicReferenceMode === 'keyframes_and_storyboard'
  const useStoryboardReference = cinematicReferenceMode !== 'keyframes'
  const useDirectionSheet = cinematicReferenceMode === 'shot_reference_sheet'
  const keyframeImageSize = keyframeImageSizeForAspectRatio(aspectRatio)

  const existingNodeResponse = await input.client
    .from('output_workflow_nodes')
    .select(outputWorkflowNodeSelect)
    .eq('workflow_id', input.workflow.id)
  if (existingNodeResponse.error) throw new Error(existingNodeResponse.error.message)
  const existingDynamicNodes = ((existingNodeResponse.data ?? []) as OutputWorkflowNodeRow[])
    .filter((row) => asRecord(row.metadata).dynamicCinematicGenerated === true)
  const existingReferenceModes = existingDynamicNodes
    .map((row) => readText(asRecord(row.config).cinematicReferenceMode))
    .filter(Boolean)
  const existingStoryboardStyleModes = existingDynamicNodes
    .map((row) => asRecord(row.config))
    .filter((config) => readText(config.purpose) === 'cinematic_beat_sheet_prompt' || readText(config.purpose) === 'cinematic_beat_sheet')
    .map((config) => `${config.debugCinematicStoryboardStyleSafeMode === true}:${readText(config.cinematicStoryboardStyleOverride)}`)
    .filter(Boolean)
  const existingModeMatches = existingReferenceModes.length === 0
    || existingReferenceModes.every((mode) => mode === cinematicReferenceMode)
  const styleModeKey = `${storyboardStylePolicy.safeMode === true}:${storyboardStylePolicy.stylePrompt}`
  const existingStyleModeMatches = existingStoryboardStyleModes.length === 0
    || existingStoryboardStyleModes.every((mode) => mode === styleModeKey)
  const existingSameHash = existingDynamicNodes.length > 0
    && existingDynamicNodes.every((row) => readText(asRecord(row.metadata).dynamicCompileHash) === compileHash)
    && existingModeMatches
    && existingStyleModeMatches
    && existingDynamicNodes.some((row) => row.key === 'video_stitch')
    && existingDynamicNodes.some((row) => row.key.endsWith('_beat_sheet'))
    && (!useKeyframes || existingDynamicNodes.some((row) => row.key.endsWith('_keyframe_001')))
  if (existingSameHash) return { expanded: false, compileHash, takeCount: takePlan.length }

  const existingEdgeResponse = await input.client
    .from('output_workflow_edges')
    .select(outputWorkflowEdgeSelect)
    .eq('workflow_id', input.workflow.id)
  if (existingEdgeResponse.error) throw new Error(existingEdgeResponse.error.message)
  const dynamicEdgeKeys = ((existingEdgeResponse.data ?? []) as OutputWorkflowEdgeRow[])
    .filter((row) => asRecord(row.metadata).dynamicCinematicGenerated === true)
    .map((row) => row.key)
  if (dynamicEdgeKeys.length > 0) {
    const deleteEdges = await input.client.from('output_workflow_edges').delete().eq('workflow_id', input.workflow.id).in('key', dynamicEdgeKeys)
    if (deleteEdges.error) throw new Error(deleteEdges.error.message)
  }
  const nodeRows: Record<string, unknown>[] = []
  const edgeRows: Record<string, unknown>[] = []
  takePlan.forEach((take, index) => {
    const takeNumber = index + 1
    const suffix = String(takeNumber).padStart(3, '0')
    const takeId = readText(take.takeId) || `take_${takeNumber}`
    const durationSeconds = Math.max(4, Math.min(15, Number(take.durationSeconds ?? 4) || 4))
    const y = 40 + index * 220
    const beatSheetPromptKey = `take_${suffix}_beat_sheet_prompt`
    const beatSheetKey = `take_${suffix}_beat_sheet`
    const keyframePromptPackKey = `take_${suffix}_keyframe_prompt_pack`
    const keyframeKeys = [1, 2, 3].map((keyframeNumber) => `take_${suffix}_keyframe_${String(keyframeNumber).padStart(3, '0')}`)
    const videoPromptKey = `take_${suffix}_video_prompt`
    const videoKey = `take_${suffix}_video`
    nodeRows.push(
      dynamicNodeRow({ workflow: input.workflow, key: beatSheetPromptKey, nodeType: 'utility_transform', label: `Take ${takeNumber} ${useDirectionSheet ? 'Direction Sheet' : 'Beat Sheet'} Prompt`, x: 1760, y, compileHash, config: { purpose: 'cinematic_beat_sheet_prompt', takeId, takeIndex: index, aspectRatio, presetFamily, planningOnly: true, cinematicReferenceMode, referenceSheetKind: useDirectionSheet ? 'shot_reference_sheet' : 'storyboard_sheet', debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode, cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt, execution: { resourceClass: 'utility', groupKey: 'cinematic_beat_sheet_prompts', maxConcurrency: 6 } } }),
      dynamicNodeRow({ workflow: input.workflow, key: beatSheetKey, nodeType: 'image_generation', label: `Take ${takeNumber} ${useDirectionSheet ? 'Direction Sheet' : 'Beat Sheet'}`, x: 2040, y, compileHash, config: { purpose: 'cinematic_beat_sheet', role: useDirectionSheet ? 'cinematic_direction_sheet' : 'cinematic_beat_sheet', takeId, takeIndex: index, planningOnly: true, planning_only: true, usedAsVideoReference: useStoryboardReference, model: 'openai/gpt-image-2', referenceModel: 'openai/gpt-image-2/edit', quality: CINEMATIC_STORYBOARD_IMAGE_QUALITY, outputFormat: 'webp', maxReferenceImages: 16, imageSizePolicy: useDirectionSheet ? 'from_direction_sheet_layout' : 'from_beat_sheet_prompt_layout', panelAspectRatio: aspectRatio, cinematicReferenceMode, referenceSheetKind: useDirectionSheet ? 'shot_reference_sheet' : 'storyboard_sheet', debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode, cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt, skillKeys: [useDirectionSheet ? 'cinematic_direction_sheet_planning' : 'cinematic_beat_sheet_planning', 'image_prompt_visual_only', 'entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'], autoSkillTags: useDirectionSheet ? ['direction_sheet', 'shot_reference_sheet', 'camera_layout', 'floor_map', 'planning_only', 'video_reference', 'image_prompt', 'entity_reference', 'reference_continuity'] : ['beat_sheet', 'storyboard', 'planning_only', 'video_reference', 'image_prompt', 'entity_reference', 'reference_continuity'], guidanceMode: 'strict', execution: { resourceClass: 'image', groupKey: 'cinematic_beat_sheets', maxConcurrency: 8 } } }),
      ...(useKeyframes ? [
        dynamicNodeRow({ workflow: input.workflow, key: keyframePromptPackKey, nodeType: 'utility_transform', label: `Take ${takeNumber} Keyframe Prompts`, x: 2320, y, compileHash, config: { purpose: 'cinematic_keyframe_prompt_pack', takeId, takeIndex: index, aspectRatio, presetFamily, debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode, cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt, execution: { resourceClass: 'utility', groupKey: 'cinematic_keyframe_prompt_packs', maxConcurrency: 6 } } }),
        ...keyframeKeys.map((keyframeKey, keyframeIndex) => dynamicNodeRow({ workflow: input.workflow, key: keyframeKey, nodeType: 'image_generation', label: `Take ${takeNumber} Keyframe ${keyframeIndex + 1}`, x: 2600 + keyframeIndex * 40, y: y + keyframeIndex * 44, compileHash, config: { purpose: 'cinematic_keyframe', role: 'cinematic_keyframe', takeId, takeIndex: index, keyframeIndex, model: 'openai/gpt-image-2', referenceModel: 'openai/gpt-image-2/edit', quality: 'low', outputFormat: 'webp', maxReferenceImages: 16, imageSize: keyframeImageSize, aspectRatio, skillKeys: ['cinematic_keyframe_prompting', 'image_prompt_visual_only', 'entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'], autoSkillTags: ['keyframe', 'image_prompt', 'visual_only', 'entity_reference', 'reference_continuity'], guidanceMode: 'strict', execution: { resourceClass: 'image', groupKey: 'cinematic_keyframes', maxConcurrency: 8 } } })),
      ] : []),
      dynamicNodeRow({ workflow: input.workflow, key: videoPromptKey, nodeType: 'utility_transform', label: `Take ${takeNumber} Video Prompt`, x: 2880, y, compileHash, config: { purpose: 'cinematic_video_prompt', takeId, takeIndex: index, durationSeconds, aspectRatio, resolution, generateAudio, presetFamily, cinematicReferenceMode, debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode, cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt, debugSkipVideoGeneration, execution: { resourceClass: 'utility', groupKey: 'cinematic_video_prompts', maxConcurrency: 6 } } }),
      dynamicNodeRow({ workflow: input.workflow, key: videoKey, nodeType: 'video_generation', label: `Take ${takeNumber} Video`, x: 3160, y, compileHash, config: { purpose: 'cinematic_block_video', role: 'cinematic_block', takeId, takeIndex: index, provider: videoProvider, videoProvider, model: videoModel, durationSeconds, aspectRatio, resolution, generateAudio, cinematicReferenceMode, debugSkipVideoGeneration, syncMode: false, skillKeys: ['seedance_reference_video_prompting', 'seedance_truth_source_modes', 'seedance_reference_legend_contract', 'seedance_timeline_call_sheet', 'cinematic_shot_direction', 'shortform_hook_retention', 'brand_ugc_proof_structure', 'provider_prompt_hygiene'], autoSkillTags: ['video_prompt', 'seedance', 'cinematic', 'ugc', 'provider_hygiene'], guidanceMode: 'strict', execution: { resourceClass: 'video', groupKey: 'cinematic_videos', maxConcurrency: Math.min(takePlan.length, 8) } } }),
    )
    const takeMeta = { takeId, takeIndex: index }
    edgeRows.push(
      dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_sequence_compile__${beatSheetPromptKey}`, sourceNodeKey: 'cinematic_sequence_compile', sourcePort: 'takePlan', targetNodeKey: beatSheetPromptKey, targetPort: 'script', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_entities__${beatSheetPromptKey}`, sourceNodeKey: 'cinematic_entities', sourcePort: 'asset_pack', targetNodeKey: beatSheetPromptKey, targetPort: 'asset_pack', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `skill_context__${beatSheetPromptKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: beatSheetPromptKey, targetPort: 'guidance', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `${beatSheetPromptKey}__${beatSheetKey}`, sourceNodeKey: beatSheetPromptKey, sourcePort: 'text', targetNodeKey: beatSheetKey, targetPort: 'prompt', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_entities__${beatSheetKey}`, sourceNodeKey: 'cinematic_entities', sourcePort: 'asset_pack', targetNodeKey: beatSheetKey, targetPort: 'references', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `skill_context__${beatSheetKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: beatSheetKey, targetPort: 'guidance', compileHash, metadata: takeMeta }),
      ...(useKeyframes ? [
        dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_sequence_compile__${keyframePromptPackKey}`, sourceNodeKey: 'cinematic_sequence_compile', sourcePort: 'takePlan', targetNodeKey: keyframePromptPackKey, targetPort: 'script', compileHash, metadata: takeMeta }),
        dynamicEdgeRow({ workflow: input.workflow, key: `${beatSheetPromptKey}__${keyframePromptPackKey}`, sourceNodeKey: beatSheetPromptKey, sourcePort: 'beatSheetPlan', targetNodeKey: keyframePromptPackKey, targetPort: 'beat_sheet_plan', compileHash, metadata: takeMeta }),
        dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_entities__${keyframePromptPackKey}`, sourceNodeKey: 'cinematic_entities', sourcePort: 'asset_pack', targetNodeKey: keyframePromptPackKey, targetPort: 'asset_pack', compileHash, metadata: takeMeta }),
        dynamicEdgeRow({ workflow: input.workflow, key: `skill_context__${keyframePromptPackKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: keyframePromptPackKey, targetPort: 'guidance', compileHash, metadata: takeMeta }),
        ...keyframeKeys.flatMap((keyframeKey) => [
        dynamicEdgeRow({ workflow: input.workflow, key: `${keyframePromptPackKey}__${keyframeKey}`, sourceNodeKey: keyframePromptPackKey, sourcePort: 'keyframePrompts', targetNodeKey: keyframeKey, targetPort: 'prompt', compileHash, metadata: takeMeta }),
        dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_entities__${keyframeKey}`, sourceNodeKey: 'cinematic_entities', sourcePort: 'asset_pack', targetNodeKey: keyframeKey, targetPort: 'references', compileHash, metadata: takeMeta }),
        dynamicEdgeRow({ workflow: input.workflow, key: `skill_context__${keyframeKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: keyframeKey, targetPort: 'guidance', compileHash, metadata: takeMeta }),
        ]),
      ] : []),
      dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_sequence_compile__${videoPromptKey}`, sourceNodeKey: 'cinematic_sequence_compile', sourcePort: 'takePlan', targetNodeKey: videoPromptKey, targetPort: 'script', compileHash, metadata: takeMeta }),
      ...(useStoryboardReference ? [dynamicEdgeRow({ workflow: input.workflow, key: `${beatSheetKey}__${videoPromptKey}`, sourceNodeKey: beatSheetKey, sourcePort: 'image', targetNodeKey: videoPromptKey, targetPort: 'references', compileHash, metadata: takeMeta })] : []),
      ...(useKeyframes ? [
        dynamicEdgeRow({ workflow: input.workflow, key: `${keyframePromptPackKey}__${videoPromptKey}`, sourceNodeKey: keyframePromptPackKey, sourcePort: 'keyframePlan', targetNodeKey: videoPromptKey, targetPort: 'keyframes', compileHash, metadata: takeMeta }),
        ...keyframeKeys.map((keyframeKey) => dynamicEdgeRow({ workflow: input.workflow, key: `${keyframeKey}__${videoPromptKey}`, sourceNodeKey: keyframeKey, sourcePort: 'image', targetNodeKey: videoPromptKey, targetPort: 'references', compileHash, metadata: takeMeta })),
      ] : []),
      dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_entities__${videoPromptKey}`, sourceNodeKey: 'cinematic_entities', sourcePort: 'asset_pack', targetNodeKey: videoPromptKey, targetPort: 'asset_pack', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `skill_context__${videoPromptKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: videoPromptKey, targetPort: 'guidance', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `${videoPromptKey}__${videoKey}`, sourceNodeKey: videoPromptKey, sourcePort: 'text', targetNodeKey: videoKey, targetPort: 'prompt', compileHash, metadata: takeMeta }),
      ...(useKeyframes ? keyframeKeys.map((keyframeKey) => dynamicEdgeRow({ workflow: input.workflow, key: `${keyframeKey}__${videoKey}`, sourceNodeKey: keyframeKey, sourcePort: 'image', targetNodeKey: videoKey, targetPort: 'references', compileHash, metadata: takeMeta })) : []),
      dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_entities__${videoKey}`, sourceNodeKey: 'cinematic_entities', sourcePort: 'asset_pack', targetNodeKey: videoKey, targetPort: 'references', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `skill_context__${videoKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: videoKey, targetPort: 'guidance', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `${videoKey}__video_stitch`, sourceNodeKey: videoKey, sourcePort: 'video', targetNodeKey: 'video_stitch', targetPort: 'videos', compileHash, metadata: takeMeta }),
    )
    if (useStoryboardReference) {
      edgeRows.push(dynamicEdgeRow({ workflow: input.workflow, key: `${beatSheetKey}__${videoKey}`, sourceNodeKey: beatSheetKey, sourcePort: 'image', targetNodeKey: videoKey, targetPort: 'references', compileHash, metadata: takeMeta }))
    }
  })
  nodeRows.push(
    dynamicNodeRow({ workflow: input.workflow, key: 'video_stitch', nodeType: 'utility_transform', label: 'Stitch Video', x: 3440, y: 120, compileHash, config: { purpose: 'video_stitch', role: 'cinematic_sequence_final', dynamicTakeCount: takePlan.length, aspectRatio, resolution, debugSkipVideoGeneration, execution: { resourceClass: 'video', groupKey: 'video_stitch', maxConcurrency: 1 } } }),
    dynamicNodeRow({ workflow: input.workflow, key: 'artifact', nodeType: 'output_artifact', label: 'Register Video', x: 3720, y: 120, compileHash, config: { purpose: 'cinematic_video_artifact', artifactKind: 'video', execution: { resourceClass: 'utility' } } }),
  )
  edgeRows.push(dynamicEdgeRow({ workflow: input.workflow, key: 'video_stitch__artifact', sourceNodeKey: 'video_stitch', sourcePort: 'video', targetNodeKey: 'artifact', targetPort: 'input', compileHash }))

  const insertNodes = await input.client.from('output_workflow_nodes').upsert(nodeRows, { onConflict: 'workflow_id,key' })
  if (insertNodes.error) throw new Error(insertNodes.error.message)
  const insertEdges = await input.client.from('output_workflow_edges').upsert(edgeRows, { onConflict: 'workflow_id,key' })
  if (insertEdges.error) throw new Error(insertEdges.error.message)
  const nextDynamicNodeKeys = new Set(nodeRows.map((row) => readText(row.key)))
  const obsoleteDynamicNodes = existingDynamicNodes.filter((row) => !nextDynamicNodeKeys.has(row.key))
  if (obsoleteDynamicNodes.length > 0) {
    const staleAt = new Date().toISOString()
    for (const obsoleteNode of obsoleteDynamicNodes) {
      const markStale = await input.client
        .from('output_workflow_nodes')
        .update({
          dirty: true,
          metadata: {
            ...asRecord(obsoleteNode.metadata),
            dynamicCinematicStale: true,
            staleAt,
            staleReason: 'dynamic_fanout_rematerialized',
            replacedByDynamicCompileHash: compileHash,
          },
        })
        .eq('id', obsoleteNode.id)
      if (markStale.error) throw new Error(markStale.error.message)
    }
  }
  const dynamicUpdatedAt = new Date().toISOString()
  const updateWorkflow = await input.client.from('output_workflows').update({
    metadata: {
      ...input.workflow.metadata,
      directorScriptDoc: input.compileOutputs.directorScriptDoc ?? null,
      cinematicScriptDoc: input.compileOutputs.cinematicScriptDoc ?? null,
      compiledCinematicSequence: input.compileOutputs.compiledCinematicSequence ?? null,
      dynamicTakeCount: takePlan.length,
      totalDurationSeconds: Number(input.compileOutputs.totalDurationSeconds ?? 0) || null,
      scriptDurationSource: readText(input.compileOutputs.scriptDurationSource) || 'authored_script',
      cinematicReferenceMode,
      videoProvider,
      videoModel,
      debugSkipVideoGeneration,
      cinematicV2AnimaticMode,
      dynamicCinematicCompileHash: compileHash,
      dynamicGraphVersion: `${compileHash}:${nodeRows.length}:${edgeRows.length}`,
      lastDynamicGraphUpdatedAt: dynamicUpdatedAt,
      dynamicNodeCount: nodeRows.length,
    },
  }).eq('id', input.workflow.id)
  if (updateWorkflow.error) throw new Error(updateWorkflow.error.message)
  return { expanded: true, compileHash, takeCount: takePlan.length }
}

async function materializeDynamicCinematicV3StoryboardFanout(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  compileOutputs: Record<string, unknown>
  config: Record<string, unknown>
}) {
  const shotPlan = cinematicV2ShotPlanSchema.parse(input.compileOutputs.shotPlan)
  const storyboardGroupPlan = cinematicV2StoryboardGroupPlanSchema.parse(input.compileOutputs.storyboardGroupPlan)
  const screenplayDraft = asRecord(input.compileOutputs.screenplayDraft)
  const referencePlan = asRecord(input.compileOutputs.cinematicReferencePlan)
  const compileHash = readText(input.compileOutputs.compileHash) || hashOutputWorkflowValue({
    shotPlan,
    storyboardGroupPlan,
    screenplayDraft,
    referencePlan,
  })
  const aspectRatio = readText(input.config.aspectRatio) || '16:9'
  const resolution = readText(input.config.resolution) || '720p'
  const debugSkipVideoGeneration = input.config.debugSkipVideoGeneration !== false
  const videoProvider = resolveOutputVideoProvider(input.config)
  const videoModel = readText(input.config.videoModel)
    || readText(input.config.model)
    || (videoProvider === 'muapi' ? DEFAULT_MUAPI_VIDEO_MODEL : resolveFalVideoModel(resolution))
  const generatedByNodeKey = 'cinematic_v3_dynamic_storyboard_fanout'

  const existingNodeResponse = await input.client
    .from('output_workflow_nodes')
    .select(outputWorkflowNodeSelect)
    .eq('workflow_id', input.workflow.id)
  if (existingNodeResponse.error) throw new Error(existingNodeResponse.error.message)
  const allExistingDynamicNodes = ((existingNodeResponse.data ?? []) as OutputWorkflowNodeRow[])
    .filter((row) => asRecord(row.metadata).dynamicCinematicGenerated === true)
    .filter((row) => readText(asRecord(row.metadata).generatedByNodeKey) === generatedByNodeKey)
  const existingDynamicNodes = allExistingDynamicNodes.filter((row) => !isStaleDynamicCinematicNode(row))
  const existingSameHash = existingDynamicNodes.length > 0
    && existingDynamicNodes.every((row) => readText(asRecord(row.metadata).dynamicCompileHash) === compileHash)
    && existingDynamicNodes.some((row) => row.key === 'cinematic_v3_timeline_assemble')
    && storyboardGroupPlan.groups.every((group) => existingDynamicNodes.some((row) => row.key === `${group.id}_sheet`))
    && storyboardGroupPlan.groups.every((group) => existingDynamicNodes.some((row) => row.key === `${group.id}_panel_extract`))
  if (existingSameHash) return { expanded: false, compileHash, shotCount: shotPlan.shots.length, storyboardSheetCount: storyboardGroupPlan.groups.length }

  const existingEdgeResponse = await input.client
    .from('output_workflow_edges')
    .select(outputWorkflowEdgeSelect)
    .eq('workflow_id', input.workflow.id)
  if (existingEdgeResponse.error) throw new Error(existingEdgeResponse.error.message)
  const dynamicEdgeKeys = ((existingEdgeResponse.data ?? []) as OutputWorkflowEdgeRow[])
    .filter((row) => readText(asRecord(row.metadata).generatedByNodeKey) === generatedByNodeKey)
    .map((row) => row.key)
  if (dynamicEdgeKeys.length > 0) {
    const deleteEdges = await input.client.from('output_workflow_edges').delete().eq('workflow_id', input.workflow.id).in('key', dynamicEdgeKeys)
    if (deleteEdges.error) throw new Error(deleteEdges.error.message)
  }

  const v3Node = (args: Omit<Parameters<typeof dynamicNodeRow>[0], 'workflow' | 'compileHash' | 'generatedByNodeKey'>) => dynamicNodeRow({
    workflow: input.workflow,
    compileHash,
    generatedByNodeKey,
    ...args,
  })
  const v3Edge = (args: Omit<Parameters<typeof dynamicEdgeRow>[0], 'workflow' | 'compileHash' | 'generatedByNodeKey'>) => dynamicEdgeRow({
    workflow: input.workflow,
    compileHash,
    generatedByNodeKey,
    ...args,
  })

  const nodeRows: Record<string, unknown>[] = []
  const edgeRows: Record<string, unknown>[] = []
  const assetPackSourceNodeKey = 'cinematic_v3_reference_select'
  storyboardGroupPlan.groups.forEach((group, index) => {
    const storyboardLayout = { rows: group.rows, columns: group.columns, panelCount: group.panelCount }
    const storyboardImageSize = storyboardImageSizeForLayout({ columns: group.columns, rows: group.rows, aspectRatio })
    const y = 80 + index * 180
    const promptKey = `${group.id}_prompt`
    const sheetKey = `${group.id}_sheet`
    const extractKey = `${group.id}_panel_extract`
    const videoPromptKey = `${group.id}_video_prompt`
    const videoKey = `${group.id}_video`
    const groupDurationSeconds = Math.max(4, Math.min(15, Math.ceil(Number(group.providerDurationSeconds || group.editorialDurationSeconds) || group.shotIds.length * 3)))
    nodeRows.push(
      v3Node({ key: promptKey, nodeType: 'utility_transform', label: `Storyboard ${group.index} Prompt`, x: 1760, y, config: { purpose: 'cinematic_v3_storyboard_prompt', cinematicPipelineVersion: 'v3_script_storyboards', aspectRatio, storyboardGroup: group, storyboardLayout, planningOnly: true, execution: { resourceClass: 'utility', groupKey: 'cinematic_v3_storyboard_prompts', maxConcurrency: 6 } } }),
      v3Node({ key: sheetKey, nodeType: 'image_generation', label: `Storyboard ${group.index} Sheet`, x: 2040, y, config: { purpose: 'cinematic_v3_storyboard_sheet', role: 'cinematic_v3_storyboard_sheet', cinematicPipelineVersion: 'v3_script_storyboards', storyboardGroup: group, storyboardGroupId: group.id, model: 'openai/gpt-image-2', referenceModel: 'openai/gpt-image-2/edit', quality: 'high', outputFormat: 'webp', maxReferenceImages: 16, imageSize: storyboardImageSize, aspectRatio, storyboardLayout, planningOnly: true, planning_only: true, usedAsVideoReference: true, used_as_video_reference: true, skillKeys: ['cinematic_beat_sheet_planning', 'storyboard_panel_accuracy', 'image_prompt_visual_only', 'entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'], autoSkillTags: ['cinematic_v3', 'storyboard_sheet', 'panel_grid', 'image_prompt', 'entity_reference', 'panel_accuracy'], guidanceMode: 'strict', execution: { resourceClass: 'image', groupKey: 'cinematic_v3_storyboard_sheets', maxConcurrency: Math.min(storyboardGroupPlan.groups.length, 8) } } }),
      v3Node({ key: extractKey, nodeType: 'utility_transform', label: `Extract Storyboard ${group.index}`, x: 2320, y, config: { purpose: 'cinematic_v3_panel_extract', cinematicPipelineVersion: 'v3_script_storyboards', storyboardGroup: group, storyboardGroupId: group.id, storyboardLayout, aspectRatio, execution: { resourceClass: 'utility', groupKey: 'cinematic_v3_panel_extract', maxConcurrency: 6 } } }),
      v3Node({ key: videoPromptKey, nodeType: 'utility_transform', label: `Storyboard ${group.index} Video Prompt`, x: 2600, y, config: { purpose: 'cinematic_v3_storyboard_group_video_prompt', cinematicPipelineVersion: 'v3_script_storyboards', storyboardGroup: group, storyboardGroupId: group.id, durationSeconds: groupDurationSeconds, aspectRatio, resolution, generateAudio: false, execution: { resourceClass: 'utility', groupKey: 'cinematic_v3_video_prompts', maxConcurrency: 6 } } }),
      v3Node({ key: videoKey, nodeType: 'video_generation', label: `Storyboard ${group.index} Video`, x: 2880, y, config: { purpose: 'cinematic_v3_storyboard_group_video', role: 'cinematic_v3_storyboard_group_video', cinematicPipelineVersion: 'v3_script_storyboards', storyboardGroup: group, storyboardGroupId: group.id, provider: videoProvider, videoProvider, model: videoModel, durationSeconds: groupDurationSeconds, aspectRatio, resolution, generateAudio: false, cinematicReferenceMode: 'storyboard_sheet', assetPackReferenceLimit: 4, debugSkipVideoGeneration, syncMode: false, skillKeys: ['seedance_reference_video_prompting', 'seedance_truth_source_modes', 'cinematic_shot_direction', 'provider_prompt_hygiene'], autoSkillTags: ['cinematic_v3', 'video_prompt', 'storyboard_sheet', 'seedance', 'provider_hygiene'], guidanceMode: 'strict', execution: { resourceClass: 'video', groupKey: 'cinematic_v3_storyboard_group_videos', maxConcurrency: Math.min(storyboardGroupPlan.groups.length, 4) } } }),
    )
    edgeRows.push(
      v3Edge({ key: `shot_plan__${promptKey}`, sourceNodeKey: 'cinematic_v3_shot_parse', sourcePort: 'text', targetNodeKey: promptKey, targetPort: 'shot_plan' }),
      v3Edge({ key: `${assetPackSourceNodeKey}__${promptKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: promptKey, targetPort: 'asset_pack' }),
      v3Edge({ key: `skill_context__${promptKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: promptKey, targetPort: 'guidance' }),
      v3Edge({ key: `${promptKey}__${sheetKey}`, sourceNodeKey: promptKey, sourcePort: 'text', targetNodeKey: sheetKey, targetPort: 'prompt' }),
      v3Edge({ key: `${assetPackSourceNodeKey}__${sheetKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: sheetKey, targetPort: 'references' }),
      v3Edge({ key: `skill_context__${sheetKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: sheetKey, targetPort: 'guidance' }),
      v3Edge({ key: `${sheetKey}__${extractKey}`, sourceNodeKey: sheetKey, sourcePort: 'image', targetNodeKey: extractKey, targetPort: 'image' }),
      v3Edge({ key: `shot_plan__${extractKey}`, sourceNodeKey: 'cinematic_v3_shot_parse', sourcePort: 'text', targetNodeKey: extractKey, targetPort: 'shot_plan' }),
      v3Edge({ key: `shot_plan__${videoPromptKey}`, sourceNodeKey: 'cinematic_v3_shot_parse', sourcePort: 'text', targetNodeKey: videoPromptKey, targetPort: 'shot_plan' }),
      v3Edge({ key: `${sheetKey}__${videoPromptKey}`, sourceNodeKey: sheetKey, sourcePort: 'image', targetNodeKey: videoPromptKey, targetPort: 'references' }),
      v3Edge({ key: `${videoPromptKey}__${videoKey}_prompt`, sourceNodeKey: videoPromptKey, sourcePort: 'text', targetNodeKey: videoKey, targetPort: 'prompt' }),
      v3Edge({ key: `${sheetKey}__${videoKey}_reference`, sourceNodeKey: sheetKey, sourcePort: 'image', targetNodeKey: videoKey, targetPort: 'references' }),
      v3Edge({ key: `${videoKey}__timeline`, sourceNodeKey: videoKey, sourcePort: 'video', targetNodeKey: 'cinematic_v3_timeline_assemble', targetPort: 'videos', metadata: { storyboardGroupId: group.id, storyboardGroupIndex: group.index } }),
    )
  })

  nodeRows.push(
    v3Node({ key: 'cinematic_v3_timeline_assemble', nodeType: 'utility_transform', label: 'Assemble Storyboard Timeline', x: 3160, y: 120, config: { purpose: 'cinematic_v3_timeline_assemble', role: 'cinematic_v3_final_timeline', cinematicPipelineVersion: 'v3_script_storyboards', dynamicShotCount: shotPlan.shots.length, aspectRatio, resolution, debugSkipVideoGeneration, execution: { resourceClass: 'video', groupKey: 'cinematic_v3_timeline_assemble', maxConcurrency: 1 } } }),
    v3Node({ key: 'artifact', nodeType: 'output_artifact', label: 'Register Cinematic', x: 3440, y: 120, config: { purpose: 'cinematic_video_artifact', artifactKind: 'video', cinematicPipelineVersion: 'v3_script_storyboards', execution: { resourceClass: 'utility' } } }),
  )
  edgeRows.push(
    v3Edge({ key: 'shot_plan__timeline', sourceNodeKey: 'cinematic_v3_shot_parse', sourcePort: 'text', targetNodeKey: 'cinematic_v3_timeline_assemble', targetPort: 'shot_plan' }),
    v3Edge({ key: 'timeline__artifact', sourceNodeKey: 'cinematic_v3_timeline_assemble', sourcePort: 'video', targetNodeKey: 'artifact', targetPort: 'input' }),
  )

  const insertNodes = await input.client.from('output_workflow_nodes').upsert(nodeRows, { onConflict: 'workflow_id,key' })
  if (insertNodes.error) throw new Error(insertNodes.error.message)
  const insertEdges = await input.client.from('output_workflow_edges').upsert(edgeRows, { onConflict: 'workflow_id,key' })
  if (insertEdges.error) throw new Error(insertEdges.error.message)

  const nextDynamicNodeKeys = new Set(nodeRows.map((row) => readText(row.key)))
  const obsoleteDynamicNodes = existingDynamicNodes.filter((row) => !nextDynamicNodeKeys.has(row.key))
  if (obsoleteDynamicNodes.length > 0) {
    const staleAt = new Date().toISOString()
    for (const obsoleteNode of obsoleteDynamicNodes) {
      const markStale = await input.client
        .from('output_workflow_nodes')
        .update({
          dirty: true,
          metadata: {
            ...asRecord(obsoleteNode.metadata),
            dynamicCinematicStale: true,
            staleAt,
            staleReason: 'dynamic_v3_storyboard_fanout_rematerialized',
            replacedByDynamicCompileHash: compileHash,
          },
        })
        .eq('id', obsoleteNode.id)
      if (markStale.error) throw new Error(markStale.error.message)
    }
  }

  const dynamicUpdatedAt = new Date().toISOString()
  const updateWorkflow = await input.client.from('output_workflows').update({
    metadata: {
      ...input.workflow.metadata,
      cinematicPipelineVersion: 'v3_script_storyboards',
      cinematicV2ScreenplayDraft: screenplayDraft,
      cinematicV2ShotPlan: shotPlan,
      cinematicV2StoryboardGroupPlan: storyboardGroupPlan,
      cinematicV3ScreenplayDraft: screenplayDraft,
      cinematicV3ShotPlan: shotPlan,
      cinematicV3StoryboardGroupPlan: storyboardGroupPlan,
      dynamicShotCount: shotPlan.shots.length,
      storyboardSheetCount: storyboardGroupPlan.groups.length,
      totalDurationSeconds: shotPlan.totalEditorialDurationSeconds,
      videoProvider,
      videoModel,
      debugSkipVideoGeneration,
      dynamicCinematicCompileHash: compileHash,
      dynamicGraphVersion: 'v3_script_storyboards',
      lastDynamicGraphUpdatedAt: dynamicUpdatedAt,
      dynamicNodeCount: nodeRows.length,
    },
  }).eq('id', input.workflow.id)
  if (updateWorkflow.error) throw new Error(updateWorkflow.error.message)
  return { expanded: true, compileHash, shotCount: shotPlan.shots.length, storyboardSheetCount: storyboardGroupPlan.groups.length }
}

async function materializeDynamicCinematicV2ShotFanout(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  compileOutputs: Record<string, unknown>
  config: Record<string, unknown>
}) {
  const shotPlan = cinematicV2ShotPlanSchema.parse(input.compileOutputs.shotPlan ?? input.compileOutputs.shot_plan)
  const sceneState = cinematicV2SceneStateSchema.parse(input.compileOutputs.sceneState ?? input.compileOutputs.scene_state)
  const layoutPlan = cinematicV2SceneLayoutPlanSchema.parse(input.compileOutputs.layoutPlan ?? input.compileOutputs.layout_plan)
  const parsedScript = cinematicV2ParsedScriptSchema.parse(input.compileOutputs.parsedScript ?? input.compileOutputs.parsed_script)
  const storyboardGroupPlan = cinematicV2StoryboardGroupPlanSchema.safeParse(input.compileOutputs.storyboardGroupPlan ?? input.compileOutputs.storyboard_group_plan).success
    ? cinematicV2StoryboardGroupPlanSchema.parse(input.compileOutputs.storyboardGroupPlan ?? input.compileOutputs.storyboard_group_plan)
    : buildCinematicV2StoryboardGroupPlan(shotPlan)
  const screenplayDraft = cinematicV2ScreenplayDraftSchema.safeParse(input.compileOutputs.screenplayDraft ?? input.compileOutputs.screenplay_draft).success
    ? cinematicV2ScreenplayDraftSchema.parse(input.compileOutputs.screenplayDraft ?? input.compileOutputs.screenplay_draft)
    : null
  const referencePlan = cinematicV2ReferencePlanSchema.safeParse(input.compileOutputs.cinematicReferencePlan ?? input.compileOutputs.cinematic_reference_plan).success
    ? cinematicV2ReferencePlanSchema.parse(input.compileOutputs.cinematicReferencePlan ?? input.compileOutputs.cinematic_reference_plan)
    : null
  const aspectRatio = readText(input.config.aspectRatio) || '16:9'
  const resolution = readText(input.config.resolution) || '720p'
  const cinematicV2AnimaticMode = resolveCinematicV2AnimaticMode(input.config, input.run)
  const useQualityKeyframes = cinematicV2AnimaticMode === 'quality_keyframes'
  const cinematicV2QualityShotIds = resolveCinematicV2QualityShotIds(input.config, input.run)
  const cinematicV2QualityShotIdSet = new Set(cinematicV2QualityShotIds)
  const selectedShotMaterialization = readText(asRecord(input.run.metadata).materializationMode) === 'selected_shots'
    || readText(input.run.input.materializationMode) === 'selected_shots'
  const shotUsesQualityKeyframe = (shot: z.infer<typeof cinematicV2ShotSchema>) => (
    useQualityKeyframes
    || cinematicV2QualityShotIdSet.has(shot.id)
    || cinematicV2QualityShotIdSet.has(String(shot.index))
    || cinematicV2QualityShotIdSet.has(String(shot.index).padStart(3, '0'))
  )
  const compileHash = readText(input.compileOutputs.compileHash) || hashOutputWorkflowValue({
    shotPlan,
    storyboardGroupPlan,
    sceneState,
    layoutPlan,
    parsedScript,
    screenplayDraft,
    referencePlan,
    cinematicV2AnimaticMode,
    cinematicV2QualityShotIds: cinematicV2QualityShotIds.slice().sort(),
  })
  const debugSkipVideoGeneration = input.config.debugSkipVideoGeneration === true
  const videoProvider = resolveOutputVideoProvider(input.config)
  const videoModel = readText(input.config.videoModel)
    || readText(input.config.model)
    || (videoProvider === 'muapi' ? DEFAULT_MUAPI_VIDEO_MODEL : resolveFalVideoModel(resolution))
  const generatedByNodeKey = 'cinematic_v2_dynamic_shot_fanout'

  const existingNodeResponse = await input.client
    .from('output_workflow_nodes')
    .select(outputWorkflowNodeSelect)
    .eq('workflow_id', input.workflow.id)
  if (existingNodeResponse.error) throw new Error(existingNodeResponse.error.message)
  const allExistingDynamicNodes = ((existingNodeResponse.data ?? []) as OutputWorkflowNodeRow[])
    .filter((row) => asRecord(row.metadata).dynamicCinematicGenerated === true)
  const existingDynamicNodes = allExistingDynamicNodes.filter((row) => !isStaleDynamicCinematicNode(row))
  const existingDynamicNodeByKey = new Map(existingDynamicNodes.map((row) => [row.key, row]))
  const existingSameHash = existingDynamicNodes.length > 0
    && existingDynamicNodes.every((row) => readText(asRecord(row.metadata).dynamicCompileHash) === compileHash)
    && existingDynamicNodes.every((row) => readText(asRecord(row.metadata).generatedByNodeKey) === generatedByNodeKey)
    && existingDynamicNodes.some((row) => row.key === 'cinematic_v2_timeline_assemble')
    && storyboardGroupPlan.groups.every((group) => existingDynamicNodes.some((row) => row.key === `${group.id}_sheet`))
    && shotPlan.shots.every((shot) => existingDynamicNodes.some((row) => row.key === `cinematic_v2_shot_${String(shot.index).padStart(3, '0')}_asset_pack`))
    && shotPlan.shots.every((shot) => {
      const keyframeNode = existingDynamicNodes.find((row) => row.key === `cinematic_v2_shot_${String(shot.index).padStart(3, '0')}_keyframe`)
      const keyframePurpose = readText(asRecord(keyframeNode?.config).purpose)
      return shotUsesQualityKeyframe(shot)
        ? keyframePurpose === 'cinematic_v2_shot_keyframe'
        : keyframePurpose === 'cinematic_v2_shot_keyframe_passthrough'
    })
    && shotPlan.shots.every((shot) => existingDynamicNodes.some((row) => row.key === `cinematic_v2_shot_${String(shot.index).padStart(3, '0')}_keyframe_qa`))
    && shotPlan.shots.every((shot) => existingDynamicNodes.some((row) => row.key === `cinematic_v2_shot_${String(shot.index).padStart(3, '0')}_video`))
  if (existingSameHash) return { expanded: false, compileHash, shotCount: shotPlan.shots.length, storyboardSheetCount: storyboardGroupPlan.groups.length }

  const existingEdgeResponse = await input.client
    .from('output_workflow_edges')
    .select(outputWorkflowEdgeSelect)
    .eq('workflow_id', input.workflow.id)
  if (existingEdgeResponse.error) throw new Error(existingEdgeResponse.error.message)
  const dynamicEdgeKeys = ((existingEdgeResponse.data ?? []) as OutputWorkflowEdgeRow[])
    .filter((row) => asRecord(row.metadata).dynamicCinematicGenerated === true)
    .map((row) => row.key)
  if (dynamicEdgeKeys.length > 0) {
    const deleteEdges = await input.client.from('output_workflow_edges').delete().eq('workflow_id', input.workflow.id).in('key', dynamicEdgeKeys)
    if (deleteEdges.error) throw new Error(deleteEdges.error.message)
  }
  const nodeRows: Record<string, unknown>[] = []
  const edgeRows: Record<string, unknown>[] = []
  const preserveNodeRow = (row: Record<string, unknown>) => {
    const key = readText(row.key)
    const existingNode = existingDynamicNodeByKey.get(key)
    const nextPurpose = readText(asRecord(row.config).purpose)
    const existingPurpose = readText(asRecord(existingNode?.config).purpose)
    const selectedShotKeyframeNode = shotPlan.shots.some((shot, index) => {
      if (!shotUsesQualityKeyframe(shot)) return false
      const suffix = String(shot.index || index + 1).padStart(3, '0')
      const baseKey = `cinematic_v2_shot_${suffix}`
      return key === `${baseKey}_keyframe_prompt`
        || key === `${baseKey}_keyframe`
        || key === `${baseKey}_keyframe_qa`
    })
    return preserveExistingDynamicNodeOutput({
      nextRow: row,
      existingNode,
      compileHash,
      preserve: selectedShotMaterialization
        && !selectedShotKeyframeNode
        && Boolean(existingNode)
        && readText(existingNode?.node_type) === readText(row.node_type)
        && existingPurpose === nextPurpose,
    })
  }
  const v2Node = (args: Omit<Parameters<typeof dynamicNodeRow>[0], 'workflow' | 'compileHash' | 'generatedByNodeKey'>) => dynamicNodeRow({
    workflow: input.workflow,
    compileHash,
    generatedByNodeKey,
    ...args,
  })
  const v2Edge = (args: Omit<Parameters<typeof dynamicEdgeRow>[0], 'workflow' | 'compileHash' | 'generatedByNodeKey'>) => dynamicEdgeRow({
    workflow: input.workflow,
    compileHash,
    generatedByNodeKey,
    ...args,
  })
  const existingNodeKeys = new Set(((existingNodeResponse.data ?? []) as OutputWorkflowNodeRow[]).map((row) => row.key))
  const assetPackSourceNodeKey = existingNodeKeys.has('cinematic_v2_reference_select')
    ? 'cinematic_v2_reference_select'
    : 'cinematic_entities'
  const storyboardGroupByShotId = new Map<string, z.infer<typeof cinematicV2StoryboardGroupPlanSchema>['groups'][number]>()
  storyboardGroupPlan.groups.forEach((group) => {
    group.shotIds.forEach((shotId) => storyboardGroupByShotId.set(shotId, group))
  })

  storyboardGroupPlan.groups.forEach((group, index) => {
    const storyboardLayout = { rows: group.rows, columns: group.columns, panelCount: group.panelCount }
    const storyboardImageSize = storyboardImageSizeForLayout({ columns: group.columns, rows: group.rows, aspectRatio })
    const y = 80 + index * 170
    const promptKey = `${group.id}_prompt`
    const sheetKey = `${group.id}_sheet`
    const extractKey = `${group.id}_panel_extract`
    nodeRows.push(
      v2Node({ key: promptKey, nodeType: 'utility_transform', label: `Storyboard Group ${group.index} Prompt`, x: 1760, y, config: { purpose: 'cinematic_v2_storyboard_prompt', cinematicPipelineVersion: 'v2_shot_orchestration', aspectRatio, storyboardGroup: group, storyboardLayout, planningOnly: true, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_storyboard_prompts', maxConcurrency: 6 } } }),
      v2Node({ key: sheetKey, nodeType: 'image_generation', label: `Storyboard Group ${group.index} Sheet`, x: 2040, y, config: { purpose: 'cinematic_v2_storyboard_sheet', role: 'cinematic_v2_storyboard_sheet', cinematicPipelineVersion: 'v2_shot_orchestration', storyboardGroup: group, storyboardGroupId: group.id, model: 'openai/gpt-image-2', referenceModel: 'openai/gpt-image-2/edit', quality: CINEMATIC_STORYBOARD_IMAGE_QUALITY, outputFormat: 'webp', maxReferenceImages: 16, imageSize: storyboardImageSize, aspectRatio, storyboardLayout, planningOnly: true, planning_only: true, usedAsVideoReference: false, used_as_video_reference: false, skillKeys: ['cinematic_beat_sheet_planning', 'storyboard_panel_accuracy', 'image_prompt_visual_only', 'entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'], autoSkillTags: ['cinematic_v2', 'storyboard_sheet', 'panel_grid', 'image_prompt', 'entity_reference', 'panel_accuracy'], guidanceMode: 'strict', execution: { resourceClass: 'image', groupKey: 'cinematic_v2_storyboard_sheets', maxConcurrency: Math.min(storyboardGroupPlan.groups.length, 8) } } }),
      v2Node({ key: extractKey, nodeType: 'utility_transform', label: `Extract Group ${group.index} Panels`, x: 2320, y, config: { purpose: 'cinematic_v2_panel_extract', cinematicPipelineVersion: 'v2_shot_orchestration', storyboardGroup: group, storyboardGroupId: group.id, storyboardLayout, aspectRatio, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_panel_extract', maxConcurrency: 6 } } }),
    )
    edgeRows.push(
      v2Edge({ key: `shot_plan__${promptKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: promptKey, targetPort: 'shot_plan' }),
      v2Edge({ key: `scene_state__${promptKey}`, sourceNodeKey: 'cinematic_v2_scene_compile', sourcePort: 'text', targetNodeKey: promptKey, targetPort: 'scene_state' }),
      v2Edge({ key: `layout_plan__${promptKey}`, sourceNodeKey: 'cinematic_v2_layout_plan', sourcePort: 'text', targetNodeKey: promptKey, targetPort: 'layout_plan' }),
      v2Edge({ key: `${assetPackSourceNodeKey}__${promptKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: promptKey, targetPort: 'asset_pack' }),
      v2Edge({ key: `skill_context__${promptKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: promptKey, targetPort: 'guidance' }),
      v2Edge({ key: `${promptKey}__${sheetKey}`, sourceNodeKey: promptKey, sourcePort: 'text', targetNodeKey: sheetKey, targetPort: 'prompt' }),
      v2Edge({ key: `${assetPackSourceNodeKey}__${sheetKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: sheetKey, targetPort: 'references' }),
      v2Edge({ key: `skill_context__${sheetKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: sheetKey, targetPort: 'guidance' }),
      v2Edge({ key: `${sheetKey}__${extractKey}`, sourceNodeKey: sheetKey, sourcePort: 'image', targetNodeKey: extractKey, targetPort: 'image' }),
      v2Edge({ key: `shot_plan__${extractKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: extractKey, targetPort: 'shot_plan' }),
    )
  })

  shotPlan.shots.forEach((shot, index) => {
    const suffix = String(shot.index || index + 1).padStart(3, '0')
    const baseKey = `cinematic_v2_shot_${suffix}`
    const y = 260 + index * 170
    const keyframePromptKey = `${baseKey}_keyframe_prompt`
    const keyframeKey = `${baseKey}_keyframe`
    const keyframeQaKey = `${baseKey}_keyframe_qa`
    const videoPromptKey = `${baseKey}_video_prompt`
    const videoKey = `${baseKey}_video`
    const shotAssetPackKey = `${baseKey}_asset_pack`
    const storyboardGroup = storyboardGroupByShotId.get(shot.id)
    const panelExtractKey = storyboardGroup ? `${storyboardGroup.id}_panel_extract` : 'cinematic_v2_panel_extract'
    const shotMeta = { shotId: shot.id, shotIndex: shot.index, storyboardGroupId: storyboardGroup?.id ?? null }
    const shotQualityKeyframe = shotUsesQualityKeyframe(shot)
    const shotAnimaticMode = shotQualityKeyframe ? 'quality_keyframes' : cinematicV2AnimaticMode
    nodeRows.push(
      v2Node({ key: shotAssetPackKey, nodeType: 'utility_transform', label: `Shot ${shot.index} References`, x: 2460, y, config: { purpose: 'cinematic_v2_shot_asset_pack', cinematicPipelineVersion: 'v2_shot_orchestration', shotId: shot.id, shotIndex: shot.index, maxEntityCount: 6, maxAssetKeysPerEntity: 2, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_shot_asset_packs', maxConcurrency: 12 } } }),
      ...(shotQualityKeyframe
        ? [
          v2Node({ key: keyframePromptKey, nodeType: 'utility_transform', label: `Shot ${shot.index} Keyframe Enhancement Prompt`, x: 2600, y, config: { purpose: 'cinematic_v2_keyframe_prompt', cinematicPipelineVersion: 'v2_shot_orchestration', cinematicV2AnimaticMode: shotAnimaticMode, shotId: shot.id, shotIndex: shot.index, aspectRatio, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_keyframe_prompts', maxConcurrency: 6 } } }),
          v2Node({ key: keyframeKey, nodeType: 'image_generation', label: `Shot ${shot.index} Enhanced Keyframe`, x: 2880, y, config: { purpose: 'cinematic_v2_shot_keyframe', role: 'cinematic_v2_shot_keyframe', cinematicPipelineVersion: 'v2_shot_orchestration', cinematicV2AnimaticMode: shotAnimaticMode, shotId: shot.id, shotIndex: shot.index, model: 'openai/gpt-image-2', referenceModel: 'openai/gpt-image-2/edit', quality: 'medium', outputFormat: 'webp', maxReferenceImages: 6, imageSize: { width: 1536, height: 864 }, aspectRatio, usedAsVideoReference: true, used_as_video_reference: true, skillKeys: ['cinematic_keyframe_prompting', 'cinematic_keyframe_reference_repair', 'image_prompt_visual_only', 'entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'], autoSkillTags: ['cinematic_v2', 'keyframe', 'image_prompt', 'visual_only', 'entity_reference', 'reference_continuity', 'reference_repair'], guidanceMode: 'strict', execution: { resourceClass: 'image', groupKey: 'cinematic_v2_shot_keyframes', maxConcurrency: Math.min(shotPlan.shots.length, 8) } } }),
        ]
        : [
          v2Node({ key: keyframeKey, nodeType: 'utility_transform', label: `Shot ${shot.index} Panel Keyframe`, x: 2880, y, config: { purpose: 'cinematic_v2_shot_keyframe_passthrough', role: 'cinematic_v2_shot_keyframe', cinematicPipelineVersion: 'v2_shot_orchestration', cinematicV2AnimaticMode, shotId: shot.id, shotIndex: shot.index, aspectRatio, planningOnly: true, planning_only: true, usedAsVideoReference: true, used_as_video_reference: true, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_panel_keyframes', maxConcurrency: 12 } } }),
        ]),
      v2Node({ key: keyframeQaKey, nodeType: 'utility_transform', label: `Shot ${shot.index} Keyframe QA`, x: 3020, y, config: { purpose: 'cinematic_v2_keyframe_qa', cinematicPipelineVersion: 'v2_shot_orchestration', shotId: shot.id, shotIndex: shot.index, advisoryOnly: true, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_keyframe_qa', maxConcurrency: 12 } } }),
      v2Node({ key: videoPromptKey, nodeType: 'utility_transform', label: `Shot ${shot.index} Video Prompt`, x: 3160, y, config: { purpose: 'cinematic_v2_video_prompt', cinematicPipelineVersion: 'v2_shot_orchestration', shotId: shot.id, shotIndex: shot.index, durationSeconds: shot.providerDurationSeconds, aspectRatio, resolution, generateAudio: false, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_video_prompts', maxConcurrency: 6 } } }),
      v2Node({ key: videoKey, nodeType: 'video_generation', label: `Shot ${shot.index} Video`, x: 3440, y, config: { purpose: 'cinematic_v2_shot_video', role: 'cinematic_v2_shot_video', cinematicPipelineVersion: 'v2_shot_orchestration', shotId: shot.id, shotIndex: shot.index, provider: videoProvider, videoProvider, model: videoModel, durationSeconds: shot.providerDurationSeconds, aspectRatio, resolution, generateAudio: false, cinematicReferenceMode: 'keyframes', assetPackReferenceLimit: 5, debugSkipVideoGeneration, syncMode: false, skillKeys: ['seedance_reference_video_prompting', 'seedance_truth_source_modes', 'cinematic_shot_direction', 'provider_prompt_hygiene'], autoSkillTags: ['cinematic_v2', 'video_prompt', 'seedance', 'provider_hygiene'], guidanceMode: 'strict', execution: { resourceClass: 'video', groupKey: 'cinematic_v2_videos', maxConcurrency: Math.min(shotPlan.shots.length, 8) } } }),
    )
    edgeRows.push(
      v2Edge({ key: `${assetPackSourceNodeKey}__${shotAssetPackKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: shotAssetPackKey, targetPort: 'asset_pack', metadata: shotMeta }),
      v2Edge({ key: `shot_plan__${shotAssetPackKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: shotAssetPackKey, targetPort: 'shot_plan', metadata: shotMeta }),
      ...(shotQualityKeyframe
        ? [
          v2Edge({ key: `${panelExtractKey}__${keyframePromptKey}`, sourceNodeKey: panelExtractKey, sourcePort: 'panels', targetNodeKey: keyframePromptKey, targetPort: 'panels', metadata: shotMeta }),
          v2Edge({ key: `shot_plan__${keyframePromptKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: keyframePromptKey, targetPort: 'shot_plan', metadata: shotMeta }),
          v2Edge({ key: `scene_state__${keyframePromptKey}`, sourceNodeKey: 'cinematic_v2_scene_compile', sourcePort: 'text', targetNodeKey: keyframePromptKey, targetPort: 'scene_state', metadata: shotMeta }),
          v2Edge({ key: `layout_plan__${keyframePromptKey}`, sourceNodeKey: 'cinematic_v2_layout_plan', sourcePort: 'text', targetNodeKey: keyframePromptKey, targetPort: 'layout_plan', metadata: shotMeta }),
          v2Edge({ key: `${shotAssetPackKey}__${keyframePromptKey}`, sourceNodeKey: shotAssetPackKey, sourcePort: 'asset_pack', targetNodeKey: keyframePromptKey, targetPort: 'asset_pack', metadata: shotMeta }),
          v2Edge({ key: `${keyframePromptKey}__${keyframeKey}_prompt`, sourceNodeKey: keyframePromptKey, sourcePort: 'text', targetNodeKey: keyframeKey, targetPort: 'prompt', metadata: shotMeta }),
          v2Edge({ key: `${keyframePromptKey}__${keyframeKey}_panel`, sourceNodeKey: keyframePromptKey, sourcePort: 'image', targetNodeKey: keyframeKey, targetPort: 'references', metadata: shotMeta }),
        ]
        : [
          v2Edge({ key: `${panelExtractKey}__${keyframeKey}_panel`, sourceNodeKey: panelExtractKey, sourcePort: 'image', targetNodeKey: keyframeKey, targetPort: 'image', metadata: shotMeta }),
          v2Edge({ key: `${panelExtractKey}__${keyframeKey}_panels`, sourceNodeKey: panelExtractKey, sourcePort: 'panels', targetNodeKey: keyframeKey, targetPort: 'panels', metadata: shotMeta }),
          v2Edge({ key: `shot_plan__${keyframeKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: keyframeKey, targetPort: 'shot_plan', metadata: shotMeta }),
        ]),
      v2Edge({ key: `${shotAssetPackKey}__${keyframeKey}`, sourceNodeKey: shotAssetPackKey, sourcePort: 'asset_pack', targetNodeKey: keyframeKey, targetPort: 'references', metadata: shotMeta }),
      v2Edge({ key: `skill_context__${keyframeKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: keyframeKey, targetPort: 'guidance', metadata: shotMeta }),
      v2Edge({ key: `${keyframeKey}__${keyframeQaKey}`, sourceNodeKey: keyframeKey, sourcePort: 'image', targetNodeKey: keyframeQaKey, targetPort: 'image', metadata: shotMeta }),
      v2Edge({ key: `${shotAssetPackKey}__${keyframeQaKey}`, sourceNodeKey: shotAssetPackKey, sourcePort: 'asset_pack', targetNodeKey: keyframeQaKey, targetPort: 'asset_pack', metadata: shotMeta }),
      v2Edge({ key: `shot_plan__${keyframeQaKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: keyframeQaKey, targetPort: 'shot_plan', metadata: shotMeta }),
      v2Edge({ key: `${keyframeKey}__${videoPromptKey}_image`, sourceNodeKey: keyframeKey, sourcePort: 'image', targetNodeKey: videoPromptKey, targetPort: 'references', metadata: shotMeta }),
      v2Edge({ key: `shot_plan__${videoPromptKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: videoPromptKey, targetPort: 'shot_plan', metadata: shotMeta }),
      v2Edge({ key: `scene_state__${videoPromptKey}`, sourceNodeKey: 'cinematic_v2_scene_compile', sourcePort: 'text', targetNodeKey: videoPromptKey, targetPort: 'scene_state', metadata: shotMeta }),
      v2Edge({ key: `layout_plan__${videoPromptKey}`, sourceNodeKey: 'cinematic_v2_layout_plan', sourcePort: 'text', targetNodeKey: videoPromptKey, targetPort: 'layout_plan', metadata: shotMeta }),
      v2Edge({ key: `${shotAssetPackKey}__${videoPromptKey}`, sourceNodeKey: shotAssetPackKey, sourcePort: 'asset_pack', targetNodeKey: videoPromptKey, targetPort: 'asset_pack', metadata: shotMeta }),
      v2Edge({ key: `${videoPromptKey}__${videoKey}_prompt`, sourceNodeKey: videoPromptKey, sourcePort: 'text', targetNodeKey: videoKey, targetPort: 'prompt', metadata: shotMeta }),
      v2Edge({ key: `${keyframeKey}__${videoKey}_reference`, sourceNodeKey: keyframeKey, sourcePort: 'image', targetNodeKey: videoKey, targetPort: 'references', metadata: shotMeta }),
      v2Edge({ key: `${shotAssetPackKey}__${videoKey}`, sourceNodeKey: shotAssetPackKey, sourcePort: 'asset_pack', targetNodeKey: videoKey, targetPort: 'references', metadata: { ...shotMeta, optional: true, optionalDependency: true } }),
      v2Edge({ key: `${videoKey}__timeline`, sourceNodeKey: videoKey, sourcePort: 'video', targetNodeKey: 'cinematic_v2_timeline_assemble', targetPort: 'videos', metadata: shotMeta }),
    )
  })

  nodeRows.push(
    v2Node({ key: 'cinematic_v2_timeline_assemble', nodeType: 'utility_transform', label: 'V2 Assemble Timeline', x: 3720, y: 120, config: { purpose: 'cinematic_v2_timeline_assemble', role: 'cinematic_v2_final_timeline', cinematicPipelineVersion: 'v2_shot_orchestration', dynamicShotCount: shotPlan.shots.length, aspectRatio, resolution, debugSkipVideoGeneration, execution: { resourceClass: 'video', groupKey: 'cinematic_v2_timeline_assemble', maxConcurrency: 1 } } }),
    v2Node({ key: 'artifact', nodeType: 'output_artifact', label: 'Register V2 Cinematic', x: 4000, y: 120, config: { purpose: 'cinematic_video_artifact', artifactKind: 'video', cinematicPipelineVersion: 'v2_shot_orchestration', execution: { resourceClass: 'utility' } } }),
  )
  edgeRows.push(
    v2Edge({ key: 'shot_plan__timeline', sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: 'cinematic_v2_timeline_assemble', targetPort: 'shot_plan' }),
    v2Edge({ key: 'timeline__artifact', sourceNodeKey: 'cinematic_v2_timeline_assemble', sourcePort: 'video', targetNodeKey: 'artifact', targetPort: 'input' }),
  )

  const insertNodes = await input.client.from('output_workflow_nodes').upsert(nodeRows.map(preserveNodeRow), { onConflict: 'workflow_id,key' })
  if (insertNodes.error) throw new Error(insertNodes.error.message)
  const insertEdges = await input.client.from('output_workflow_edges').upsert(edgeRows, { onConflict: 'workflow_id,key' })
  if (insertEdges.error) throw new Error(insertEdges.error.message)
  const nextDynamicNodeKeys = new Set(nodeRows.map((row) => readText(row.key)))
  const obsoleteDynamicNodes = existingDynamicNodes.filter((row) => !nextDynamicNodeKeys.has(row.key))
  if (obsoleteDynamicNodes.length > 0) {
    const staleAt = new Date().toISOString()
    for (const obsoleteNode of obsoleteDynamicNodes) {
      const markStale = await input.client
        .from('output_workflow_nodes')
        .update({
          dirty: true,
          metadata: {
            ...asRecord(obsoleteNode.metadata),
            dynamicCinematicStale: true,
            staleAt,
            staleReason: 'dynamic_fanout_rematerialized',
            replacedByDynamicCompileHash: compileHash,
          },
        })
        .eq('id', obsoleteNode.id)
      if (markStale.error) throw new Error(markStale.error.message)
    }
  }
  const dynamicUpdatedAt = new Date().toISOString()
  const updateWorkflow = await input.client.from('output_workflows').update({
    metadata: {
      ...input.workflow.metadata,
      cinematicPipelineVersion: 'v2_shot_orchestration',
      cinematicV2ScreenplayDraft: screenplayDraft,
      cinematicV2ParsedScript: parsedScript,
      cinematicV2SceneState: sceneState,
      cinematicV2LayoutPlan: layoutPlan,
      cinematicV2ShotPlan: shotPlan,
      cinematicV2StoryboardGroupPlan: storyboardGroupPlan,
      cinematicV2QualityShotIds,
      dynamicShotCount: shotPlan.shots.length,
      storyboardSheetCount: storyboardGroupPlan.groups.length,
      totalDurationSeconds: shotPlan.totalEditorialDurationSeconds,
      videoProvider,
      videoModel,
      debugSkipVideoGeneration,
      dynamicCinematicCompileHash: compileHash,
      dynamicGraphVersion: `${compileHash}:${nodeRows.length}:${edgeRows.length}`,
      lastDynamicGraphUpdatedAt: dynamicUpdatedAt,
      dynamicNodeCount: nodeRows.length,
    },
  }).eq('id', input.workflow.id)
  if (updateWorkflow.error) throw new Error(updateWorkflow.error.message)
  return { expanded: true, compileHash, shotCount: shotPlan.shots.length, storyboardSheetCount: storyboardGroupPlan.groups.length }
}

function buildComicEntitySelectorInstruction(input: {
  context: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  return [
    'Select the entities that must visually appear in this comic issue.',
    'Return only JSON with shape: {"entities":[{"key":"","name":"","type":"","role":"","visualDescription":"","visualTraits":[],"visualTraitMap":{},"assetKeys":[]}],"missingReferenceEntityKeys":[]}.',
    'Use the supplied entity keys exactly. Do not invent new keys.',
    'Preserve neutral visual identity traits as continuity anchors. Do not replace identity with momentary action, injuries, lighting, camera angle, or scene state.',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({
      sequenceUnit,
      entities: Array.isArray(input.context.entities) ? input.context.entities.map(asRecord).slice(0, 24) : [],
      relationships: Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord).slice(0, 40) : [],
      assets: Array.isArray(input.context.assets) ? input.context.assets.map(asRecord).slice(0, 40) : [],
      wiki: asRecord(input.context.wiki),
    }),
  ].filter(Boolean).join('\n\n')
}

function buildComicSceneScriptInstruction(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
  pageCount: number
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  return [
    `Adapt the selected sequence unit into a rich dramatic scene script for a ${input.pageCount}-page comic issue.`,
    'Return only JSON matching the requested schema. Do not write final comic panels yet.',
    'The scene script must give the later page planner enough dramatic material: goal, obstacle, escalation, reversal, consequence, visual moments, dialogue beats, and emotional turns.',
    'Write visually and specifically. Every dramatic beat should be stageable as comic action, not prose summary.',
    'Preserve the sequence unit outcome and canon facts. Do not invent new world canon to improve pacing.',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({
      wiki: asRecord(input.context.wiki),
      sequenceUnit,
      assetPack: input.assetPack,
      relationships: Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord).slice(0, 40) : [],
    }),
  ].filter(Boolean).join('\n\n')
}

function comicSceneScriptMarkdown(sceneScript: Record<string, unknown>) {
  const characters = Array.isArray(sceneScript.characters) ? sceneScript.characters.map(asRecord) : []
  const dramaticBeats = Array.isArray(sceneScript.dramaticBeats) ? sceneScript.dramaticBeats.map(asRecord) : []
  const dialogueBeats = Array.isArray(sceneScript.dialogueBeats) ? sceneScript.dialogueBeats.map(asRecord) : []
  return [
    `# ${readText(sceneScript.title) || 'Comic Scene Script'}`,
    readText(sceneScript.premise) ? `Premise: ${readText(sceneScript.premise)}` : '',
    readText(sceneScript.sequenceOutcome) ? `Outcome: ${readText(sceneScript.sequenceOutcome)}` : '',
    readStringArray(sceneScript.canonConstraints).length > 0 ? `Canon constraints:\n${readStringArray(sceneScript.canonConstraints).map((entry) => `- ${entry}`).join('\n')}` : '',
    characters.length > 0 ? `## Characters\n${characters.map((character) => [
      `- ${readText(character.name) || readText(character.key)}`,
      readText(character.want) ? `want: ${readText(character.want)}` : '',
      readText(character.pressure) ? `pressure: ${readText(character.pressure)}` : '',
      readText(character.visualContinuity) ? `visual: ${readText(character.visualContinuity)}` : '',
    ].filter(Boolean).join('; ')).join('\n')}` : '',
    dramaticBeats.length > 0 ? `## Dramatic Beats\n${dramaticBeats.map((beat, index) => [
      `${Number(beat.beatNumber ?? index + 1)}. ${readText(beat.function)}`,
      readText(beat.action),
      readText(beat.conflict) ? `Conflict: ${readText(beat.conflict)}` : '',
      readText(beat.turn) ? `Turn: ${readText(beat.turn)}` : '',
      readText(beat.consequence) ? `Consequence: ${readText(beat.consequence)}` : '',
    ].filter(Boolean).join(' ')).join('\n\n')}` : '',
    readStringArray(sceneScript.visualMoments).length > 0 ? `## Visual Moments\n${readStringArray(sceneScript.visualMoments).map((entry) => `- ${entry}`).join('\n')}` : '',
    dialogueBeats.length > 0 ? `## Dialogue Beats\n${dialogueBeats.map((beat) => `- ${readText(beat.speaker)}: ${readText(beat.intent)}${readText(beat.sampleLine) ? ` | "${readText(beat.sampleLine)}"` : ''}`).join('\n')}` : '',
    readStringArray(sceneScript.emotionalTurns).length > 0 ? `## Emotional Turns\n${readStringArray(sceneScript.emotionalTurns).map((entry) => `- ${entry}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

function buildComicPagePlanInstruction(input: {
  context: Record<string, unknown>
  sceneScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
  pageCount: number
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  return [
    `Compress the scene script into exactly ${input.pageCount} comic pages.`,
    'Return only JSON matching the requested schema.',
    'Each page must have a unique story function, concrete included beats, explicit omitted/merged beats when compression is needed, a page turn, setting, entity keys, panel budget from 3 to 6, and dialogue/caption intent.',
    'Use page turns to escalate the sequence instead of repeating the same premise. Preserve the final sequence outcome.',
    'Do not write final panel script yet; this node only plans page rhythm and compression.',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({
      sceneScript: input.sceneScript,
      sequenceUnit,
      assetPack: input.assetPack,
      wiki: asRecord(input.context.wiki),
    }),
  ].filter(Boolean).join('\n\n')
}

function comicPagePlanMarkdown(pagePlan: Record<string, unknown>) {
  const pages = Array.isArray(pagePlan.pages) ? pagePlan.pages.map(asRecord) : []
  return [
    `# ${readText(pagePlan.title) || 'Comic Page Plan'}`,
    `Page count: ${Number(pagePlan.pageCount ?? pages.length) || pages.length}`,
    ...pages.map((page, index) => [
      `## Page ${Number(page.pageNumber ?? index + 1)}`,
      readText(page.storyFunction) ? `Function: ${readText(page.storyFunction)}` : '',
      readStringArray(page.includedBeats).length > 0 ? `Included: ${readStringArray(page.includedBeats).join('; ')}` : '',
      readStringArray(page.omittedOrMergedBeats).length > 0 ? `Omitted/Merged: ${readStringArray(page.omittedOrMergedBeats).join('; ')}` : '',
      readText(page.pageTurn) ? `Page turn: ${readText(page.pageTurn)}` : '',
      readText(page.setting) ? `Setting: ${readText(page.setting)}` : '',
      `Panel budget: ${Number(page.panelBudget ?? 0) || 4}`,
      readText(page.dialogueCaptionIntent) ? `Text intent: ${readText(page.dialogueCaptionIntent)}` : '',
    ].filter(Boolean).join('\n')),
  ].filter(Boolean).join('\n\n')
}

function validateComicPagePlan(pagePlan: Record<string, unknown>, input: { pageCount: number }) {
  const diagnostics: string[] = []
  const pages = Array.isArray(pagePlan.pages) ? pagePlan.pages.map(asRecord) : []
  if (pages.length !== input.pageCount) diagnostics.push(`Expected ${input.pageCount} planned comic pages, got ${pages.length}.`)
  for (let index = 0; index < input.pageCount; index += 1) {
    const pageNumber = index + 1
    const page = pages.find((entry) => Number(entry.pageNumber ?? 0) === pageNumber) ?? pages[index] ?? {}
    const panelBudget = Number(page.panelBudget ?? 0)
    if (!readText(page.storyFunction)) diagnostics.push(`Page plan ${pageNumber} is missing a story function.`)
    if (!readText(page.pageTurn)) diagnostics.push(`Page plan ${pageNumber} is missing a page turn.`)
    if (!readText(page.setting)) diagnostics.push(`Page plan ${pageNumber} is missing a setting.`)
    if (!Number.isFinite(panelBudget) || panelBudget < 3 || panelBudget > 6) diagnostics.push(`Page plan ${pageNumber} has invalid panel budget.`)
    if (readStringArray(page.includedBeats).length === 0) diagnostics.push(`Page plan ${pageNumber} has no included beats.`)
  }
  return diagnostics
}

function normalizeComicScript(raw: Record<string, unknown>, input: {
  context: Record<string, unknown>
  pageCount: number
  prompt: string
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  const sequence = asRecord(sequenceUnit.customProperties).sequence && typeof asRecord(sequenceUnit.customProperties).sequence === 'object'
    ? asRecord(asRecord(sequenceUnit.customProperties).sequence)
    : {}
  const sequenceOutcome = readText(sequence.outcome) || readText(sequenceUnit.summary)
  const rawPages = Array.isArray(raw.pages) ? raw.pages.map(asRecord) : []
  const pages = Array.from({ length: input.pageCount }, (_, index) => {
    const pageNumber = index + 1
    const rawPage = rawPages.find((page) => Number(page.pageNumber ?? page.page ?? 0) === pageNumber) ?? rawPages[index] ?? {}
    const rawPanels = rawPage.panels ?? rawPage.Panels ?? rawPage.panelScript ?? rawPage.panelDescriptions
    const panels = Array.isArray(rawPanels) ? rawPanels.map(asRecord) : []
    const continuityNotes = readText(rawPage.continuityNotes)
      || (sequenceOutcome ? `Maintain continuity with selected sequence outcome: ${sequenceOutcome}` : '')
    return {
      pageNumber,
      panelLayout: readText(rawPage.panelLayout) || (pageNumber === 1 ? '4 cinematic panels with a strong establishing panel' : '5 balanced comic panels'),
      setting: readText(rawPage.setting) || readText(rawPage.location),
      mood: readText(rawPage.mood) || readText(rawPage.tone),
      continuityNotes,
      requiredEntityKeys: readStringArray(rawPage.requiredEntityKeys),
      panels: panels.length > 0 ? panels.map((panel, panelIndex) => ({
        panelNumber: Number(panel.panelNumber ?? panelIndex + 1),
        shot: readText(panel.shot),
        action: readText(panel.action),
        dialogue: readText(panel.dialogue),
        caption: readText(panel.caption),
        characters: readStringArray(panel.characters),
      })) : [],
    }
  })
  return {
    title: readText(raw.title) || readText(sequenceUnit.name) || 'Generated Comic',
    pageCount: input.pageCount,
    logline: readText(raw.logline),
    pages,
  }
}

function normalizeComicScriptText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function validateComicScript(script: Record<string, unknown>, input: { pageCount: number }) {
  const diagnostics: string[] = []
  const pages = Array.isArray(script.pages) ? script.pages.map(asRecord) : []
  if (pages.length !== input.pageCount) {
    diagnostics.push(`Expected ${input.pageCount} comic pages, got ${pages.length}.`)
  }

  const panelSignatures = new Map<string, number>()
  let totalPanels = 0
  let textBearingPanels = 0

  for (let index = 0; index < input.pageCount; index += 1) {
    const pageNumber = index + 1
    const page = pages.find((entry) => Number(entry.pageNumber ?? 0) === pageNumber) ?? pages[index] ?? {}
    const panels = Array.isArray(page.panels) ? page.panels.map(asRecord) : []
    totalPanels += panels.length
    if (panels.length < 3) diagnostics.push(`Page ${pageNumber} has ${panels.length} panels; expected at least 3 complete panels.`)
    if (panels.length > 6) diagnostics.push(`Page ${pageNumber} has ${panels.length} panels; expected at most 6 panels.`)
    if (!readText(page.setting)) diagnostics.push(`Page ${pageNumber} is missing a setting.`)

    for (let panelIndex = 0; panelIndex < panels.length; panelIndex += 1) {
      const panelNumber = panelIndex + 1
      const panel = panels[panelIndex]
      const shot = readText(panel.shot)
      const action = readText(panel.action)
      const dialogue = readText(panel.dialogue)
      const caption = readText(panel.caption)
      if (shot.length < 8) diagnostics.push(`Page ${pageNumber}, panel ${panelNumber} has no usable shot description.`)
      if (action.length < 24) diagnostics.push(`Page ${pageNumber}, panel ${panelNumber} has no usable action description.`)
      if (dialogue || caption) textBearingPanels += 1
      const signature = normalizeComicScriptText([shot, action, dialogue, caption].join(' '))
      if (signature) panelSignatures.set(signature, (panelSignatures.get(signature) ?? 0) + 1)
    }
  }

  const repeatedPanels = [...panelSignatures.entries()].filter(([, count]) => count > 1)
  if (repeatedPanels.length > 0) {
    diagnostics.push(`Comic script repeats ${repeatedPanels.length} panel(s) verbatim across pages.`)
  }
  if (totalPanels < input.pageCount * 3) {
    diagnostics.push(`Comic script has ${totalPanels} total panels; expected at least ${input.pageCount * 3}.`)
  }
  if (textBearingPanels < Math.max(1, Math.ceil(input.pageCount / 2))) {
    diagnostics.push('Comic script has too little dialogue/caption text for a readable issue.')
  }

  return diagnostics
}

function buildComicScriptInstruction(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  sceneScript: Record<string, unknown>
  pagePlan: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
  pageCount: number
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  return [
    `Convert the upstream scene script and page plan into a final ${input.pageCount}-page comic production script.`,
    'Return only JSON with shape: {"title":"","logline":"","pageCount":8,"pages":[{"pageNumber":1,"panelLayout":"","setting":"","mood":"","requiredEntityKeys":[],"continuityNotes":"","panels":[{"panelNumber":1,"shot":"","action":"","dialogue":"","caption":"","characters":[]}]}]}.',
    `The pages array must contain exactly ${input.pageCount} pages, numbered 1 through ${input.pageCount}.`,
    'Treat the scene script and page plan as source of truth. Do not re-outline from scratch.',
    'For each page, follow that page plan story function, included beats, page turn, setting, entity keys, panel budget, and dialogue/caption intent.',
    'Every page must be a real comic-script page, not an outline placeholder: 3-6 concrete panels with distinct shot, action, dialogue/caption, and continuity details.',
    'Do not repeat the same page beat, action sentence, or panel description across pages. Each page must advance the sequence unit through a new story moment.',
    'Panel action should describe what is visible in the panel. Include blocking, character expression, setting detail, and the story change in that panel.',
    'Dialogue and captions must be brief enough for generated comic lettering, but at least half the pages should include some balloon or caption text.',
    'Use a clear page progression: establish the location and problem, escalate pressure, force a choice, show consequences, and land the sequence outcome.',
    'Preserve canon facts and the selected sequence unit outcome.',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({
      wiki: asRecord(input.context.wiki),
      sequenceUnit,
      sceneScript: input.sceneScript,
      pagePlan: input.pagePlan,
      assetPack: input.assetPack,
      relationships: Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord).slice(0, 40) : [],
    }),
  ].filter(Boolean).join('\n\n')
}

function buildComicScriptRepairInstruction(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  sceneScript: Record<string, unknown>
  pagePlan: Record<string, unknown>
  invalidScript: Record<string, unknown>
  diagnostics: string[]
  prompt: string
  guidance: OutputGuidanceBundle
  pageCount: number
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  return [
    `Repair the invalid comic production script into a complete ${input.pageCount}-page page/panel JSON script.`,
    'Return the full replacement JSON object only. Do not return a patch, explanation, markdown, or omitted pages.',
    'The pages array must contain every page from 1 through the requested page count.',
    'Every page must include setting, mood, continuityNotes, requiredEntityKeys, and 3-6 complete panels.',
    'Every panel must include panelNumber, shot, action, dialogue, caption, and characters. Empty dialogue/caption is allowed only when the panel should be silent.',
    'Use the approved page plan for page function, setting, page turn, panel budget, and included beats. Use the scene script for dramatization and dialogue/subtext.',
    'Do not preserve empty panel arrays from the invalid script. Rewrite any page with missing panels from scratch.',
    `Validation errors to fix: ${input.diagnostics.join(' ')}`,
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({
      wiki: asRecord(input.context.wiki),
      sequenceUnit,
      sceneScript: input.sceneScript,
      pagePlan: input.pagePlan,
      assetPack: input.assetPack,
      invalidScript: input.invalidScript,
    }),
  ].filter(Boolean).join('\n\n')
}

function comicScriptMarkdown(script: Record<string, unknown>) {
  const pages = Array.isArray(script.pages) ? script.pages.map(asRecord) : []
  return [
    `# ${readText(script.title) || 'Generated Comic'}`,
    readText(script.logline) ? `> ${readText(script.logline)}` : '',
    ...pages.flatMap((page) => [
      `## Page ${Number(page.pageNumber ?? 0) || ''}`,
      readText(page.panelLayout) ? `Layout: ${readText(page.panelLayout)}` : '',
      readText(page.setting) ? `Setting: ${readText(page.setting)}` : '',
      ...(Array.isArray(page.panels) ? page.panels.map((panel, index) => {
        const record = asRecord(panel)
        return [
          `Panel ${Number(record.panelNumber ?? index + 1)}: ${readText(record.shot)}`,
          readText(record.action),
          readText(record.dialogue) ? `Dialogue: ${readText(record.dialogue)}` : '',
          readText(record.caption) ? `Caption: ${readText(record.caption)}` : '',
        ].filter(Boolean).join(' ')
      }) : []),
    ]),
  ].filter(Boolean).join('\n\n')
}

function buildComicAtlasPromptInstruction(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
}) {
  const wiki = asRecord(input.context.wiki)
  return [
    'Create one GPT Image 2 prompt for a square comic-style reference atlas.',
    'The atlas should show the selected characters, places, objects, symbols, palette swatches, and style notes as labeled visual reference panels.',
    'Use a cohesive comic art direction suitable for later full-page comic generation.',
    'Ask for readable labels only for entity names; avoid internal keys in visible text.',
    readText(wiki.artStyleDescription) ? `Project art direction: ${readText(wiki.artStyleDescription)}` : '',
    Array.isArray(wiki.toneTags) ? `Tone tags: ${wiki.toneTags.join(', ')}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({ assetPack: input.assetPack, wiki }),
  ].filter(Boolean).join('\n\n')
}

function buildCinematicAtlasPromptInstruction(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
}) {
  const wiki = asRecord(input.context.wiki)
  const entities = compactCinematicEntityAnchors(input.assetPack, 12)
  return [
    'Create one GPT Image 2 prompt for a square cinematic reference atlas.',
    'The atlas should show all relevant characters, places, objects, symbols, wardrobe anchors, palette swatches, and material cues as clean visual reference panels.',
    'Use readable labels/captions for entity names only. A short caption under each panel is allowed when it clarifies role or visual identity.',
    'Keep the atlas neutral and continuity-focused: default appearance, recognizable silhouettes, faces, clothing, props, materials, and environment design. Do not depict combat poses, injury, blood, temporary emotion, camera effects, or scene-specific action.',
    'The atlas will be used as a single Seedance reference image, so each entity panel must be legible at thumbnail size and visually separated from the others.',
    readText(wiki.artStyleDescription) ? `Project art direction: ${readText(wiki.artStyleDescription)}` : '',
    Array.isArray(wiki.toneTags) ? `Tone tags: ${wiki.toneTags.join(', ')}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({ entities, wiki }, 7000),
  ].filter(Boolean).join('\n\n')
}

function comicScriptPage(script: Record<string, unknown>, pageNumber: number) {
  const pages = Array.isArray(script.pages) ? script.pages.map(asRecord) : []
  return pages.find((entry) => Number(entry.pageNumber ?? 0) === pageNumber) ?? pages[pageNumber - 1] ?? {}
}

function normalizeComicEntityToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function comicEntityTokens(entity: Record<string, unknown>) {
  return new Set([
    readText(entity.key),
    readText(entity.id),
    readText(entity.name),
    readText(entity.label),
  ].map(normalizeComicEntityToken).filter(Boolean))
}

function collectComicPageReferenceTokens(page: Record<string, unknown>) {
  const tokens = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value === 'string') {
      const token = normalizeComicEntityToken(value)
      if (token) tokens.add(token)
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) add(entry)
    }
  }
  add(page.requiredEntityKeys)
  add(page.characters)
  add(page.locations)
  add(page.props)
  const panels = Array.isArray(page.panels) ? page.panels.map(asRecord) : []
  for (const panel of panels) {
    add(panel.requiredEntityKeys)
    add(panel.characters)
    add(panel.location)
    add(panel.locations)
    add(panel.props)
    add(panel.items)
    add(panel.factions)
  }
  return tokens
}

function filterComicAssetPackForPage(assetPack: Record<string, unknown>, page: Record<string, unknown>, limit = 6) {
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  const tokens = collectComicPageReferenceTokens(page)
  const matched = tokens.size > 0
    ? entities.filter((entity) => {
      const entityTokens = comicEntityTokens(entity)
      return [...tokens].some((token) => [...entityTokens].some((entityToken) => (
        entityToken === token || entityToken.includes(token) || token.includes(entityToken)
      )))
    })
    : entities
  const pageEntities = (matched.length > 0 ? matched : entities).slice(0, limit)
  return {
    ...assetPack,
    entities: pageEntities,
    pageReferenceEntityKeys: pageEntities.map((entity) => readText(entity.key)).filter(Boolean),
    missingReferenceEntityKeys: pageEntities
      .filter((entity) => readStringArray(entity.assetKeys).length === 0)
      .map((entity) => readText(entity.key))
      .filter(Boolean),
  }
}

function compactComicPanelForPrompt(panel: Record<string, unknown>, fallbackPanelNumber: number) {
  const panelNumber = Number(panel.panelNumber ?? fallbackPanelNumber)
  return [
    `Panel ${Number.isFinite(panelNumber) ? panelNumber : fallbackPanelNumber}`,
    readText(panel.shot) ? `Shot: ${readText(panel.shot)}` : '',
    readText(panel.action) ? `Action: ${readText(panel.action)}` : '',
    readText(panel.dialogue) ? `Dialogue: ${readText(panel.dialogue)}` : '',
    readText(panel.caption) ? `Caption: ${readText(panel.caption)}` : '',
    readStringArray(panel.characters).length > 0 ? `Characters: ${readStringArray(panel.characters).join(', ')}` : '',
  ].filter(Boolean).join('\n')
}

function buildDeterministicComicPageImagePrompt(input: {
  script: Record<string, unknown>
  assetPack: Record<string, unknown>
  pageNumber: number
  pageCount: number
  prompt: string
  guidance: OutputGuidanceBundle
}) {
  const page = comicScriptPage(input.script, input.pageNumber)
  const panels = Array.isArray(page.panels) ? page.panels.map(asRecord) : []
  if (panels.length < 3) {
    throw new Error(`Comic page ${input.pageNumber} prompt cannot be built because the script page has ${panels.length} panel(s). Rerun the Comic Script node first.`)
  }
  const packedEntities = Array.isArray(input.assetPack.entities) ? input.assetPack.entities.map(asRecord) : []
  const pageAssetPack = filterComicAssetPackForPage(input.assetPack, page, 6)
  const relevantEntities = Array.isArray(pageAssetPack.entities) ? pageAssetPack.entities.map(asRecord) : packedEntities
  return [
    `Create a finished full-page portrait comic image for page ${input.pageNumber} of ${input.pageCount}.`,
    'Use the attached entity/environment reference sheets directly as continuity sources for identity, wardrobe, silhouettes, palette, props, materials, and environment features.',
    'The image must contain the complete page: panel borders, gutters, speech balloons, captions, sound effects where scripted, and readable lettering.',
    'Follow this script exactly. Do not invent a different beat, skip panels, merge pages, or repeat another page.',
    readText(input.script.title) ? `Issue title: ${readText(input.script.title)}` : '',
    readText(input.script.logline) ? `Issue logline: ${readText(input.script.logline)}` : '',
    `Page layout: ${readText(page.panelLayout) || `${panels.length} panels`}`,
    readText(page.setting) ? `Page setting: ${readText(page.setting)}` : '',
    readText(page.mood) ? `Page mood: ${readText(page.mood)}` : '',
    readText(page.continuityNotes) ? `Continuity notes: ${readText(page.continuityNotes)}` : '',
    'Panel script:',
    panels.map((panel, index) => compactComicPanelForPrompt(panel, index + 1)).join('\n\n'),
    relevantEntities.length > 0 ? 'Required visual continuity references:' : '',
    relevantEntities.length > 0 ? compactForPrompt({ entities: relevantEntities.slice(0, 6) }) : '',
    input.prompt ? `User style brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    'Visible text rules: include only the scripted dialogue/caption/SFX text; keep text short, legible, and placed inside clear balloons or caption boxes.',
    'Do not include workflow terms, JSON keys, entity IDs, prompt labels, watermarks, signatures, or production notes in the image.',
  ].filter(Boolean).join('\n\n')
}

function openingStrategyForSection(section: Record<string, unknown>, sectionNumber: number) {
  const explicit = readText(section.openingStrategy)
  if (explicit) return explicit
  const strategies = [
    'Open on a character doing something concrete under pressure, not on weather, skyline, light, mood, or abstract atmosphere.',
    'Open on a direct obstacle, interruption, or consequence from the previous beat, not on weather or city description.',
    'Open on discovery, dialogue, or a tactical choice, not on a metaphor or sensory panorama.',
    'Open on the cost of the chapter choice or the next necessary action, not on atmospheric scene-setting.',
  ]
  return strategies[(Math.max(1, sectionNumber) - 1) % strategies.length]
}

function repeatedOpeningAvoidanceRules() {
  return [
    'Do not open with rain, weather, skyline, neon, glass, towers, shadows, silence, a city description, or a broad mood image.',
    'Do not use rain as a transition or default atmosphere unless the current sequence unit explicitly requires rain as a plot fact.',
    'Do not start with a metaphor or simile. The first paragraph should establish a person, action, pressure, and immediate situation.',
    'Do not reuse stock cyberpunk/noir openings such as rain hitting glass, neon blurring, towers clawing, concrete spines, muted thrums, or shadows whispering.',
  ]
}

function findEntityByKey(context: Record<string, unknown>, key: string) {
  if (!key) return null
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  return entities.find((entity) => readText(entity.key) === key) ?? null
}

function readSequencePovBrief(input: {
  context: Record<string, unknown>
  chapter: Record<string, unknown>
  sequenceUnit: Record<string, unknown> | null
}) {
  const wiki = asRecord(input.context.wiki)
  const sequence = input.sequenceUnit ? readEntitySequence(input.sequenceUnit) : {}
  const narrationPov = readText(input.chapter.narrationPov)
    || readText(wiki.narrationPov)
    || 'close third person limited unless the world canon specifies otherwise'
  const povCharacterKey = readText(input.chapter.povCharacterKey)
    || readText(sequence.povCharacterKey ?? sequence.povActorKey ?? sequence.focalCharacterKey)
  const povCharacter = findEntityByKey(input.context, povCharacterKey)
  const povCharacterName = readText(input.chapter.povCharacterName)
    || readText(sequence.povCharacterName)
    || readText(povCharacter?.name)
  const povNotes = readText(input.chapter.povNotes) || readText(sequence.povNotes)
  return {
    narrationPov,
    povCharacterKey,
    povCharacterName,
    povNotes,
    povCharacterSummary: readText(povCharacter?.summary),
    povCharacterContext: readText(povCharacter?.context),
  }
}

function sectionFromPlan(input: {
  sectionPlan: Array<Record<string, unknown>>
  chapterNumber: number
  sectionNumber: number
}) {
  return input.sectionPlan.find((entry) => Number(entry.sectionNumber) === input.sectionNumber && Number(entry.chapterNumber) === input.chapterNumber)
    ?? input.sectionPlan.find((entry) => Number(entry.sectionNumber) === input.sectionNumber)
    ?? input.sectionPlan[input.sectionNumber - 1]
    ?? {}
}

function buildChapterProsePrompt(input: {
  context: Record<string, unknown>
  prompt: string
  chapterPlan: Array<Record<string, unknown>>
  chapterNumber: number
  sequenceUnitKey: string
  sequenceUnitName: string
  guidance: OutputGuidanceBundle
}) {
  const chapter = input.chapterPlan.find((entry) => readText(entry.sequenceUnitKey) === input.sequenceUnitKey)
    ?? input.chapterPlan.find((entry) => Number(entry.number) === input.chapterNumber)
    ?? input.chapterPlan[input.chapterNumber - 1]
    ?? {}
  const entities = Array.isArray(input.context.entities) ? input.context.entities.map(asRecord).slice(0, 8) : []
  const entityNotes = entities.map((entity) => `${readText(entity.name)} (${readText(entity.summary)})`).filter(Boolean).join('; ')
  const chapterTitle = readText(chapter.title) || input.sequenceUnitName || `Chapter ${input.chapterNumber}`
  const synopsis = readText(chapter.synopsis)
  const dramaticQuestion = readText(chapter.dramaticQuestion)
  const outcome = readText(chapter.outcome)
  const currentSequenceUnit = input.sequenceUnitKey
    ? (Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord).find((entry) => readText(entry.key) === input.sequenceUnitKey) ?? null : null)
    : null
  const pov = readSequencePovBrief({ context: input.context, chapter, sequenceUnit: currentSequenceUnit })
  return [
    `Write Chapter ${input.chapterNumber} as polished longform prose in Markdown.`,
    `Chapter title: ${chapterTitle}`,
    `Project narration POV: ${pov.narrationPov}`,
    pov.povCharacterName || pov.povCharacterKey ? `Chapter POV character: ${pov.povCharacterName || pov.povCharacterKey}${pov.povCharacterKey ? ` (${pov.povCharacterKey})` : ''}` : '',
    pov.povNotes ? `POV notes: ${pov.povNotes}` : '',
    pov.povCharacterSummary ? `POV character anchor: ${pov.povCharacterSummary}` : '',
    synopsis ? `Chapter synopsis: ${synopsis}` : '',
    dramaticQuestion ? `Dramatic question: ${dramaticQuestion}` : '',
    outcome ? `Required outcome: ${outcome}` : '',
    entityNotes ? `Canon anchors: ${entityNotes}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    '',
    'Opening constraints:',
    '- Open with a named character in motion, a concrete decision, a line of dialogue, or an immediate obstacle.',
    ...repeatedOpeningAvoidanceRules().map((rule) => `- ${rule}`),
    '',
    'POV and scene texture constraints:',
    '- Maintain the project narration POV consistently for the whole chapter.',
    '- Stay inside the chapter POV character perspective; do not reveal thoughts, motives, facts, or off-screen information the POV character cannot know.',
    '- Balance concrete action, dialogue/subtext, and selective internal reflection. Every major action beat should produce a POV reaction or choice; every reflection should be attached to present pressure; every dialogue exchange should include behavior or subtext.',
    '- Use interiority to show desire, fear, misreadings, tactical reasoning, and emotional cost, not to explain the theme.',
    '',
    'Use this world context as canon. Do not contradict it:',
    compactForPrompt({
      wiki: input.context.wiki,
      pov,
      currentSequenceUnit,
      chapterPlan: input.chapterPlan,
      entities: Array.isArray(input.context.entities) ? input.context.entities.map(asRecord).slice(0, 24) : [],
      relationships: Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord).slice(0, 80) : [],
    }),
    '',
    'Output requirements:',
    `- Start exactly with: ## ${input.chapterNumber}. ${chapterTitle}`,
    '- Then write scene-level prose, not an outline, not a brief, not analysis.',
    '- Target 1200-2200 words for this V1 draft unless the chapter canon is very small.',
    '- Keep markdown simple: chapter heading plus prose paragraphs only.',
    '- Do not include labels such as "Dramatic question", "Outcome", "Canon anchors", "Writing brief", or "Generated from".',
    '- Do not mention AI, prompts, world graphs, guidance, or workflow internals.',
  ].filter(Boolean).join('\n')
}

function buildChapterSectionProsePrompt(input: {
  context: Record<string, unknown>
  prompt: string
  chapterPlan: Array<Record<string, unknown>>
  sectionPlan: Array<Record<string, unknown>>
  chapterNumber: number
  sectionNumber: number
  sectionCount: number
  sequenceUnitKey: string
  sequenceUnitName: string
  guidance: OutputGuidanceBundle
}) {
  const chapter = input.chapterPlan.find((entry) => readText(entry.sequenceUnitKey) === input.sequenceUnitKey)
    ?? input.chapterPlan.find((entry) => Number(entry.number) === input.chapterNumber)
    ?? input.chapterPlan[input.chapterNumber - 1]
    ?? {}
  const section = sectionFromPlan({
    sectionPlan: input.sectionPlan,
    chapterNumber: input.chapterNumber,
    sectionNumber: input.sectionNumber,
  })
  const chapterTitle = readText(chapter.title) || readText(section.chapterTitle) || input.sequenceUnitName || `Chapter ${input.chapterNumber}`
  const sectionTitle = readText(section.title) || `Section ${input.sectionNumber}`
  const openingStrategy = openingStrategyForSection(section, input.sectionNumber)
  const entities = Array.isArray(input.context.entities) ? input.context.entities.map(asRecord).slice(0, 10) : []
  const entityNotes = entities.map((entity) => `${readText(entity.name)} (${readText(entity.summary)})`).filter(Boolean).join('; ')
  const currentSequenceUnit = input.sequenceUnitKey
    ? (Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord).find((entry) => readText(entry.key) === input.sequenceUnitKey) ?? null : null)
    : null
  const pov = readSequencePovBrief({ context: input.context, chapter, sequenceUnit: currentSequenceUnit })
  return [
    `Write section ${input.sectionNumber} of ${input.sectionCount} for Chapter ${input.chapterNumber} as polished longform prose in Markdown.`,
    `Chapter title: ${chapterTitle}`,
    `Section role: ${sectionTitle}`,
    `Project narration POV: ${pov.narrationPov}`,
    pov.povCharacterName || pov.povCharacterKey ? `Chapter POV character: ${pov.povCharacterName || pov.povCharacterKey}${pov.povCharacterKey ? ` (${pov.povCharacterKey})` : ''}` : '',
    pov.povNotes ? `POV notes: ${pov.povNotes}` : '',
    readText(section.synopsis) ? `Chapter synopsis: ${readText(section.synopsis)}` : '',
    readText(section.dramaticQuestion) ? `Dramatic question: ${readText(section.dramaticQuestion)}` : '',
    readText(section.outcome) ? `Required chapter outcome: ${readText(section.outcome)}` : '',
    entityNotes ? `Canon anchors: ${entityNotes}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    '',
    'Opening strategy for this section:',
    `- ${openingStrategy}`,
    ...repeatedOpeningAvoidanceRules().map((rule) => `- ${rule}`),
    '',
    'POV and scene texture constraints:',
    '- Maintain the project narration POV consistently.',
    '- Stay inside the chapter POV character perspective; do not head-hop.',
    '- Balance concrete action, dialogue/subtext, and selective internal reflection.',
    '',
    'Use this world context as canon. Do not contradict it:',
    compactForPrompt({
      wiki: input.context.wiki,
      pov,
      currentSequenceUnit,
      chapterPlan: input.chapterPlan,
      sectionPlan: input.sectionPlan,
      entities: Array.isArray(input.context.entities) ? input.context.entities.map(asRecord).slice(0, 24) : [],
      relationships: Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord).slice(0, 80) : [],
    }),
    '',
    'Output requirements:',
    `- Start exactly with: ### ${input.chapterNumber}.${input.sectionNumber} ${sectionTitle}`,
    '- Write prose scenes and narrative summary only where needed; do not output an outline or brief.',
    '- Target 900-1200 words.',
    '- Keep markdown simple: section heading plus prose paragraphs only.',
    '- Make the section stand alone, but do not repeat exposition already likely covered by earlier sections.',
    '- Do not include labels such as "Dramatic question", "Outcome", "Canon anchors", "Writing brief", or "Generated from".',
    '- Do not mention AI, prompts, world graphs, guidance, or workflow internals.',
  ].filter(Boolean).join('\n')
}

async function generateChapterMarkdown(input: {
  context: Record<string, unknown>
  prompt: string
  chapterPlan: Array<Record<string, unknown>>
  chapterNumber: number
  sequenceUnitKey: string
  sequenceUnitName: string
  guidance: OutputGuidanceBundle
}) {
  const model = outputWorkflowTextModel()
  const prompt = buildChapterProsePrompt(input)
  const attempts = outputWorkflowChapterAttempts()
  const timeoutMs = outputWorkflowChapterTimeoutMs()
  let lastError: unknown = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await runOpenAiResponses({
        model,
        instructions: [
          'You are a professional longform book writer.',
          'Write restrained, specific, publishable prose from the supplied canon.',
          'Open scenes through character action, choice, dialogue, or immediate pressure rather than weather, skyline, mood, or decorative metaphor.',
          'Follow the requested style guidance, but never reveal the guidance or workflow.',
          'Return only the requested Markdown manuscript content.',
        ].join(' '),
        input: prompt,
        maxOutputTokens: 4200,
        metadata: {
          graphcore_task: 'output_workflow_chapter_prose',
          graphcore_attempt: String(attempt),
        },
        timeoutMs,
      })

      if (!response.response.ok) {
        const errorMessage = typeof response.body.error === 'object' && response.body.error !== null
          ? readText((response.body.error as Record<string, unknown>).message)
          : readText(response.body.error)
        throw new Error(errorMessage || `OpenAI chapter generation failed with status ${response.response.status}.`)
      }

      const markdown = response.outputText.trim()
      if (!markdown) throw new Error('OpenAI returned an empty chapter draft.')
      return {
        markdown,
        model,
        providerRequestId: readText(response.body.id) || response.response.headers.get('x-request-id') || null,
        usage: asRecord(response.body.usage),
        attempts: attempt,
        timeoutMs,
      }
    } catch (error) {
      lastError = error
      if (attempt >= attempts || !isRetryableOpenAiError(error)) break
      await sleep(retryDelayMs(attempt))
    }
  }

  const finalMessage = lastError instanceof Error ? lastError.message : String(lastError ?? 'OpenAI chapter generation failed.')
  throw new Error(attempts > 1 ? `${finalMessage} Retried ${attempts} times.` : finalMessage)
}

function openAiErrorMessage(result: OpenAiResponseResult, fallback: string) {
  const error = result.body.error
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const message = readText((error as Record<string, unknown>).message)
    if (message) return message
  }
  if (typeof error === 'string' && error.trim()) return error.trim()
  return fallback
}

function isOpenAiTerminalStatus(status: string) {
  return ['completed', 'failed', 'cancelled', 'incomplete'].includes(status)
}

async function generateBackgroundMarkdown(input: {
  prompt: string
  instructions: string
  metadata: Record<string, string>
  maxOutputTokens: number
  priorProviderRequestId?: string | null
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    providerRequestId: string
    providerStatus: string
    providerMode: string
    lastProviderPollAt: string
  }) => Promise<void>
}) {
  const model = outputWorkflowTextModel()
  const timeoutMs = outputWorkflowChapterTimeoutMs()
  let result: OpenAiResponseResult

  if (input.priorProviderRequestId) {
    result = await retrieveOpenAiResponse(input.priorProviderRequestId, 45_000)
  } else {
    result = await createOpenAiBackgroundResponse({
      model,
      instructions: input.instructions,
      input: input.prompt,
      maxOutputTokens: input.maxOutputTokens,
      metadata: input.metadata,
      timeoutMs: 45_000,
    })
  }

  if (!result.response.ok) {
    throw new Error(openAiErrorMessage(result, `OpenAI background response failed with status ${result.response.status}.`))
  }
  if (!result.id) throw new Error('OpenAI background response did not return a response id.')

  let providerRequestId = result.id
  let providerStatus = result.status
  const startedAt = Date.now()

  while (!isOpenAiTerminalStatus(providerStatus)) {
    await input.onProgress?.({
      providerRequestId,
      providerStatus,
      providerMode: 'background',
      lastProviderPollAt: new Date().toISOString(),
    })

    if (await input.shouldCancel?.()) {
      await cancelOpenAiResponse(providerRequestId, 30_000).catch(() => null)
      await input.onProgress?.({
        providerRequestId,
        providerStatus: 'cancelled',
        providerMode: 'background',
        lastProviderPollAt: new Date().toISOString(),
      })
      throw new WorkflowCancelledError()
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`OpenAI background response did not complete after ${timeoutMs}ms. Response id: ${providerRequestId}.`)
    }

    await sleep(3_000)
    result = await retrieveOpenAiResponse(providerRequestId, 45_000)
    if (!result.response.ok) {
      throw new Error(openAiErrorMessage(result, `OpenAI background response poll failed with status ${result.response.status}.`))
    }
    providerRequestId = result.id ?? providerRequestId
    providerStatus = result.status
  }

  await input.onProgress?.({
    providerRequestId,
    providerStatus,
    providerMode: 'background',
    lastProviderPollAt: new Date().toISOString(),
  })

  if (providerStatus !== 'completed') {
    throw new Error(openAiErrorMessage(result, `OpenAI background response ended with status ${providerStatus}.`))
  }

  const markdown = result.outputText.trim()
  if (!markdown) throw new Error('OpenAI returned an empty background response.')
  return {
    markdown,
    model,
    providerRequestId,
    providerStatus,
    usage: asRecord(result.body.usage),
    timeoutMs,
  }
}

function assembleChapterMarkdown(upstream: Record<string, Record<string, unknown>>) {
  const chapters = Object.entries(upstream)
    .map(([nodeKey, outputs]) => ({
      nodeKey,
      chapterNumber: Number(outputs.chapterNumber ?? 9999),
      sectionNumber: Number(outputs.sectionNumber ?? 9999),
      markdown: readText(outputs.markdown) || readText(outputs.text),
    }))
    .filter((entry) => entry.markdown)
    .sort((left, right) => left.chapterNumber - right.chapterNumber || left.sectionNumber - right.sectionNumber || left.nodeKey.localeCompare(right.nodeKey))
  return chapters.map((entry) => entry.markdown).join('\n\n')
}

function addFrontBackMatter(context: Record<string, unknown>, markdown: string) {
  const wiki = asRecord(context.wiki)
  const title = titleFromContext(context)
  const logline = readText(wiki.logline)
  const synopsis = readText(wiki.synopsis)
  const toneTags = Array.isArray(wiki.toneTags) ? wiki.toneTags.filter((entry): entry is string => typeof entry === 'string') : []
  return [
    `# ${title}`,
    '',
    logline ? `> ${logline}` : '',
    '',
    synopsis ? `## Synopsis\n\n${synopsis}` : '',
    '',
    toneTags.length > 0 ? `\nTone: ${toneTags.join(', ')}` : '',
    '',
    markdown,
    '',
    '## Back Matter',
    '',
    'Generated from the GraphCore world graph. Canon entities, relationships, sequence units, and wiki metadata remain the source of truth.',
  ].filter(Boolean).join('\n')
}

function editMarkdown(source: string) {
  return source
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ +\n/g, '\n')
    .trim()
}

async function uploadBytes(client: DatabaseClient, path: string, bytes: Uint8Array, contentType: string) {
  const response = await client.storage.from('project-assets').upload(path, new Blob([bytes], { type: contentType }), {
    cacheControl: '31536000',
    contentType,
    upsert: true,
  })
  if (response.error) throw new Error(response.error.message)
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
  }
  return `data:${mimeType || 'image/png'};base64,${btoa(binary)}`
}

async function downloadRemoteBytes(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Generated Fal image could not be downloaded (${response.status}).`)
  return new Uint8Array(await response.arrayBuffer())
}

async function imageReferenceToFalUrl(client: DatabaseClient, image: Record<string, unknown>) {
  const url = readText(image.url)
  if (url) return url
  const storagePath = readText(image.storagePath) || readText(image.storage_path)
  if (!storagePath) return ''
  return projectAssetReferenceUrl(client, storagePath, readText(image.mimeType) || readText(image.mime_type) || 'image/png')
}

function resolveAssetByKey(run: OutputWorkflowRun, assetKey: string) {
  const assets = Array.isArray(asRecord(run.input).assets) ? asRecord(run.input).assets as unknown[] : []
  return assets.map(asRecord).find((asset) => readText(asset.key) === assetKey) ?? null
}

async function resolveProjectAssetByKey(client: DatabaseClient, run: OutputWorkflowRun, assetKey: string) {
  const localAsset = resolveAssetByKey(run, assetKey)
  if (localAsset) return localAsset
  if (!assetKey || isDirectReferenceUrl(assetKey) || isProjectAssetStoragePath(assetKey)) return null
  const response = await client
    .from('project_assets')
    .select('key, name, kind, mime_type, storage_path, metadata')
    .eq('project_id', run.projectId)
    .eq('key', assetKey)
    .maybeSingle()
  if (response.error || !response.data) return null
  const row = asRecord(response.data)
  return {
    key: readText(row.key),
    name: readText(row.name),
    kind: readText(row.kind),
    mimeType: readText(row.mime_type),
    mime_type: readText(row.mime_type),
    storagePath: readText(row.storage_path),
    storage_path: readText(row.storage_path),
    metadata: asRecord(row.metadata),
  }
}

async function collectAssetPackReferenceUrls(client: DatabaseClient, run: OutputWorkflowRun, assetPack: Record<string, unknown>, limit = 3) {
  const references: string[] = []
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  for (const entity of entities) {
    const primaryAssetKey = readText(entity.primaryAssetKey)
    const entityReferenceAssetKeys = primaryAssetKey ? [primaryAssetKey] : sortReferenceValues(readStringArray(entity.assetKeys))
    for (const assetKey of entityReferenceAssetKeys) {
      if (isDirectReferenceUrl(assetKey)) {
        references.push(assetKey)
        if (references.length >= limit) return references
        continue
      }
      if (isProjectAssetStoragePath(assetKey)) {
        references.push(await projectAssetReferenceUrl(client, assetKey.replace(/^project-assets\//i, ''), mimeTypeForStoragePath(assetKey)))
        if (references.length >= limit) return references
        continue
      }
      const asset = await resolveProjectAssetByKey(client, run, assetKey)
      const storagePath = readText(asset?.storagePath) || readText(asset?.storage_path)
      if (!storagePath) continue
      references.push(await projectAssetReferenceUrl(client, storagePath, readText(asset?.mimeType) || readText(asset?.mime_type) || 'image/png'))
      if (references.length >= limit) return references
    }
  }
  return references
}

function referenceLimitForImageNode(config: Record<string, unknown>, role: string) {
  const configured = Number(config.maxReferenceImages ?? config.referenceLimit ?? 0)
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.min(16, Math.floor(configured)))
  }
  if (role === 'comic_page') return 6
  if (role === 'comic_atlas' || role === 'cinematic_atlas' || role === 'cinematic_storyboard' || role === 'cinematic_direction_sheet') return 16
  return 16
}

async function projectAssetReferenceUrl(client: DatabaseClient, storagePath: string, mimeType: string) {
  const bucket = client.storage.from('project-assets')
  if (typeof bucket.createSignedUrl === 'function') {
    const signed = await bucket.createSignedUrl(storagePath, 60 * 60)
    const data = asRecord(signed.data)
    const signedUrl = readText(data.signedUrl) || readText(data.signedURL)
    if (!signed.error && signedUrl) return signedUrl
  }
  const bytes = await downloadProjectAssetBytes(client, storagePath)
  return bytesToDataUrl(bytes, mimeType)
}

async function downloadProjectAssetBytes(client: DatabaseClient, storagePath: string) {
  const response = await client.storage.from('project-assets').download(storagePath)
  if (response.error || !response.data) throw new Error(response.error?.message ?? `Project asset ${storagePath} could not be downloaded.`)
  return new Uint8Array(await response.data.arrayBuffer())
}

async function buildDocumentReferenceImages(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  limit?: number
}) {
  const context = worldContextFromRunInput(input.run)
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  const assets = Array.isArray(context.assets) ? context.assets.map(asRecord) : []
  const sourceEntityKeys = readStringArray(context.sourceEntityKeys)
  const sourceKeySet = new Set(sourceEntityKeys)
  const scopedEntities = sourceKeySet.size > 0
    ? entities.filter((entity) => sourceKeySet.has(readText(entity.key)))
    : entities
  const images: Array<{
    bytes: Uint8Array
    mimeType: string
    key?: string
    entityKey?: string
    title: string
    caption?: string
    type?: string
    assetKey?: string
    storagePath?: string
  }> = []
  const limit = Math.max(0, input.limit ?? 24)

  for (const entity of scopedEntities) {
    if (images.length >= limit) break
    const assetKeys = entityAssetKeys(entity, assets)
    for (const assetKey of assetKeys) {
      if (images.length >= limit) break
      const asset = resolveAssetByKey(input.run, assetKey)
      const storagePath = readText(asset?.storagePath) || readText(asset?.storage_path)
      if (!storagePath) continue
      const mimeType = readText(asset?.mimeType) || readText(asset?.mime_type) || 'image/png'
      if (mimeType && !mimeType.toLowerCase().startsWith('image/')) continue
      try {
        images.push({
          bytes: await downloadProjectAssetBytes(input.client, storagePath),
          mimeType,
          key: assetKey,
          assetKey,
          storagePath,
          entityKey: readText(entity.key),
          title: readText(entity.name) || readText(entity.key) || assetKey,
          caption: readOutputEntityVisualDescription(entity),
          type: readText(entity.nodeType ?? entity.node_type),
        })
      } catch {
        // Missing or stale asset rows should not block rendering the reference document.
      }
    }
  }
  return images
}

async function waitForOutputFalImage(input: {
  priorStep?: OutputWorkflowRunStep | null
  apiKey: string
  model: string
  prompt: string
  imageSize: unknown
  quality: string
  outputFormat: string
  referenceImageUrls?: string[]
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    providerRequestId: string
    providerStatus: string
    providerMode: string
    lastProviderPollAt: string
    statusUrl?: string | null
    responseUrl?: string | null
  }) => Promise<void>
}) {
  const priorMetadata = asRecord(input.priorStep?.metadata)
  let requestId = readText(input.priorStep?.providerRequestId) || readText(priorMetadata.falRequestId)
  let statusUrl: string | null = readText(priorMetadata.falStatusUrl) || null
  let responseUrl: string | null = readText(priorMetadata.falResponseUrl) || null

  if (!requestId) {
    const submit = await submitFalImageRequest({
      apiKey: input.apiKey,
      model: input.model,
      prompt: input.prompt,
      imageSize: input.imageSize,
      quality: input.quality,
      outputFormat: input.outputFormat,
      referenceImageUrls: input.referenceImageUrls,
    })
    if (!submit.response.ok) {
      throw new Error(falErrorMessage(submit.body, `Fal image submission failed with HTTP ${submit.response.status}.`))
    }
    requestId = readText(submit.body.request_id)
    statusUrl = readText(submit.body.status_url) || null
    responseUrl = readText(submit.body.response_url) || null
    if (!requestId) throw new Error('Fal did not return a request id for the output image generation node.')
  }

  await input.onProgress?.({
    providerRequestId: requestId,
    providerStatus: 'IN_QUEUE',
    providerMode: 'fal_queue',
    lastProviderPollAt: new Date().toISOString(),
    statusUrl,
    responseUrl,
  })

  const timeoutMs = outputWorkflowFalTimeoutMs()
  const pollIntervalMs = outputWorkflowFalPollIntervalMs()
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await input.shouldCancel?.()) {
      throw new WorkflowCancelledError()
    }
    const status = await getFalStatus({
      apiKey: input.apiKey,
      model: input.model,
      requestId,
      statusUrl,
    })
    const providerStatus = readText(status.body.status) || 'UNKNOWN'
    await input.onProgress?.({
      providerRequestId: requestId,
      providerStatus,
      providerMode: 'fal_queue',
      lastProviderPollAt: new Date().toISOString(),
      statusUrl,
      responseUrl,
    })

    if (providerStatus === 'COMPLETED' || providerStatus === 'UNKNOWN') {
      const result = await getFalResult({
        apiKey: input.apiKey,
        model: input.model,
        requestId,
        responseUrl,
      })
      if (!result.response.ok) {
        if (
          providerStatus === 'UNKNOWN'
          && [404, 405, 409, 425].includes(result.response.status)
        ) {
          await sleep(pollIntervalMs)
          continue
        }
        throw new Error(falErrorMessage(result.body, `Fal image result failed with HTTP ${result.response.status}.`))
      }
      const resultBody = normalizeFalResultBody(result.body)
      const image = extractFalImageRecord(resultBody) ?? extractFalImageRecord(result.body)
      const imageUrl = readText(image?.url)
      if (!imageUrl) throw new Error('Fal completed the output image request but did not return an image URL.')
      return {
        requestId,
        statusUrl,
        responseUrl,
        imageUrl,
        width: Number(image?.width ?? 0) || null,
        height: Number(image?.height ?? 0) || null,
        mimeType: readText(image?.content_type) || `image/${input.outputFormat}`,
        fileName: readText(image?.file_name),
        fileSize: Number(image?.file_size ?? 0) || null,
        resultBody,
      }
    }

    const errorMessage = falErrorMessage(status.body, '')
    if (errorMessage && providerStatus !== 'IN_PROGRESS' && providerStatus !== 'IN_QUEUE') {
      throw new Error(errorMessage)
    }

    await sleep(pollIntervalMs)
  }

  throw new Error(`Fal image request timed out before completion after ${timeoutMs}ms.`)
}

async function waitForOutputFalVideo(input: {
  priorStep?: OutputWorkflowRunStep | null
  apiKey: string
  model: string
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  resolution?: string
  generateAudio?: boolean
  syncMode?: boolean
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    providerRequestId: string
    providerStatus: string
    providerMode: string
    lastProviderPollAt: string
    statusUrl?: string | null
    responseUrl?: string | null
  }) => Promise<void>
}) {
  const priorMetadata = asRecord(input.priorStep?.metadata)
  let requestId = readText(input.priorStep?.providerRequestId) || readText(priorMetadata.falRequestId)
  let statusUrl: string | null = readText(priorMetadata.falStatusUrl) || null
  let responseUrl: string | null = readText(priorMetadata.falResponseUrl) || null

  if (!requestId) {
    const submit = await submitFalVideoRequest({
      apiKey: input.apiKey,
      model: input.model,
      prompt: input.prompt,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      generateAudio: input.generateAudio,
      syncMode: input.syncMode,
      referenceImageUrls: input.referenceImageUrls,
      referenceVideoUrls: input.referenceVideoUrls,
      referenceAudioUrls: input.referenceAudioUrls,
    })
    if (!submit.response.ok) {
      throw new Error(falErrorMessage(submit.body, `Fal video submission failed with HTTP ${submit.response.status}.`))
    }
    requestId = readText(submit.body.request_id)
    statusUrl = readText(submit.body.status_url) || null
    responseUrl = readText(submit.body.response_url) || null
    if (!requestId) throw new Error('Fal did not return a request id for the output video generation node.')
  }

  await input.onProgress?.({
    providerRequestId: requestId,
    providerStatus: 'IN_QUEUE',
    providerMode: 'fal_queue',
    lastProviderPollAt: new Date().toISOString(),
    statusUrl,
    responseUrl,
  })

  const timeoutMs = outputWorkflowFalTimeoutMs()
  const pollIntervalMs = outputWorkflowFalPollIntervalMs()
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await input.shouldCancel?.()) {
      throw new WorkflowCancelledError()
    }
    const status = await getFalStatus({ apiKey: input.apiKey, model: input.model, requestId, statusUrl })
    const providerStatus = readText(status.body.status) || 'UNKNOWN'
    await input.onProgress?.({
      providerRequestId: requestId,
      providerStatus,
      providerMode: 'fal_queue',
      lastProviderPollAt: new Date().toISOString(),
      statusUrl,
      responseUrl,
    })

    if (providerStatus === 'COMPLETED' || providerStatus === 'UNKNOWN') {
      const result = await getFalResult({ apiKey: input.apiKey, model: input.model, requestId, responseUrl })
      if (!result.response.ok) {
        if (providerStatus === 'UNKNOWN' && [404, 405, 409, 425].includes(result.response.status)) {
          await sleep(pollIntervalMs)
          continue
        }
        throw new Error(falErrorMessage(result.body, `Fal video result failed with HTTP ${result.response.status}.`))
      }
      const resultBody = normalizeFalResultBody(result.body)
      const video = extractFalVideoRecord(resultBody) ?? extractFalVideoRecord(result.body)
      const videoUrl = readText(video?.url)
      if (!videoUrl) throw new Error('Fal completed the output video request but did not return a video URL.')
      return {
        requestId,
        statusUrl,
        responseUrl,
        videoUrl,
        mimeType: readText(video?.content_type) || 'video/mp4',
        fileName: readText(video?.file_name),
        fileSize: Number(video?.file_size ?? 0) || null,
        resultBody,
      }
    }

    const errorMessage = falErrorMessage(status.body, '')
    if (errorMessage && providerStatus !== 'IN_PROGRESS' && providerStatus !== 'IN_QUEUE') {
      throw new Error(errorMessage)
    }

    await sleep(pollIntervalMs)
  }

  throw new Error(`Fal video request timed out before completion after ${timeoutMs}ms.`)
}

async function waitForOutputMuapiVideo(input: {
  priorStep?: OutputWorkflowRunStep | null
  apiKey: string
  model: string
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    providerRequestId: string
    providerStatus: string
    providerMode: string
    lastProviderPollAt: string
    resultUrl: string
    webhookConfigured?: boolean
  }) => Promise<void>
}) {
  const priorMetadata = asRecord(input.priorStep?.metadata)
  let requestId = readText(input.priorStep?.providerRequestId) || readText(priorMetadata.muapiRequestId)
  const webhookUrl = buildOutputWorkflowMuapiWebhookUrl()
  const providerMode = webhookUrl ? 'muapi_webhook_polling' : 'muapi_polling'

  if (!requestId) {
    const submit = await submitMuapiVideoRequest({
      apiKey: input.apiKey,
      prompt: input.prompt,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      referenceImageUrls: input.referenceImageUrls,
      referenceVideoUrls: input.referenceVideoUrls,
      referenceAudioUrls: input.referenceAudioUrls,
      webhookUrl,
    })
    if (!submit.response.ok) {
      throw new Error(muapiErrorMessage(submit.body, `MUAPI video submission failed with HTTP ${submit.response.status}.`))
    }
    requestId = readMuapiRequestId(submit.body)
    if (!requestId) throw new Error('MUAPI did not return a request id for the output video generation node.')
  }

  const resultUrl = `${MUAPI_BASE_URL}/predictions/${encodeURIComponent(requestId)}/result`
  await input.onProgress?.({
    providerRequestId: requestId,
    providerStatus: 'IN_QUEUE',
    providerMode,
    lastProviderPollAt: new Date().toISOString(),
    resultUrl,
    webhookConfigured: Boolean(webhookUrl),
  })

  const timeoutMs = outputWorkflowMuapiTimeoutMs()
  const pollIntervalMs = outputWorkflowMuapiPollIntervalMs()
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await input.shouldCancel?.()) {
      throw new WorkflowCancelledError()
    }

    const result = await getMuapiResult({ apiKey: input.apiKey, requestId })
    const providerStatus = readMuapiProviderStatus(result.body)
    await input.onProgress?.({
      providerRequestId: requestId,
      providerStatus,
      providerMode,
      lastProviderPollAt: new Date().toISOString(),
      resultUrl,
      webhookConfigured: Boolean(webhookUrl),
    })

    const videoUrl = extractMuapiVideoUrlFromResult(result.body)
    if (result.response.ok && (videoUrl || muapiStatusIsComplete(providerStatus))) {
      if (!videoUrl) throw new Error('MUAPI completed the output video request but did not return a video URL.')
      return {
        requestId,
        resultUrl,
        videoUrl,
        mimeType: videoUrl.toLowerCase().includes('.webm') ? 'video/webm' : 'video/mp4',
        fileName: videoUrl.split('/').pop()?.split('?')[0] || '',
        fileSize: null,
        resultBody: result.body,
      }
    }

    if (!result.response.ok && ![404, 409, 425, 429, 500, 502, 503, 504].includes(result.response.status)) {
      throw new Error(muapiErrorMessage(result.body, `MUAPI video result failed with HTTP ${result.response.status}.`))
    }
    if (muapiStatusIsFailed(providerStatus)) {
      throw new Error(muapiErrorMessage(result.body, `MUAPI video generation failed with status ${providerStatus}.`))
    }

    await sleep(pollIntervalMs)
  }

  throw new Error(`MUAPI video request timed out before completion after ${timeoutMs}ms.`)
}

async function registerImageArtifact(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  assetKey: string
  storagePath: string
  name: string
  summary: string
  mimeType: string
  metadata: Record<string, unknown>
}) {
  const assetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: input.assetKey,
      name: input.name,
      kind: 'image',
      mime_type: input.mimeType,
      storage_path: input.storagePath,
      metadata: input.metadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (assetResponse.error || !assetResponse.data) throw new Error(assetResponse.error?.message ?? 'Failed to register output image asset.')

  const artifactKey = `${input.assetKey}.artifact`
  const artifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: artifactKey,
      name: input.name,
      kind: 'image',
      asset_key: input.assetKey,
      mime_type: input.mimeType,
      summary: input.summary,
      metadata: input.metadata,
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (artifactResponse.error || !artifactResponse.data) throw new Error(artifactResponse.error?.message ?? 'Failed to register output image artifact.')
  return mapOutputArtifactRow(artifactResponse.data as OutputArtifactRow)
}

async function registerVideoArtifact(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  assetKey: string
  storagePath: string
  name: string
  summary: string
  mimeType: string
  metadata: Record<string, unknown>
}) {
  const assetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: input.assetKey,
      name: input.name,
      kind: 'video',
      mime_type: input.mimeType,
      storage_path: input.storagePath,
      metadata: input.metadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (assetResponse.error || !assetResponse.data) throw new Error(assetResponse.error?.message ?? 'Failed to register output video asset.')

  const artifactKey = `${input.assetKey}.artifact`
  const artifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: artifactKey,
      name: input.name,
      kind: 'video',
      asset_key: input.assetKey,
      mime_type: input.mimeType,
      summary: input.summary,
      metadata: input.metadata,
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (artifactResponse.error || !artifactResponse.data) throw new Error(artifactResponse.error?.message ?? 'Failed to register output video artifact.')
  return mapOutputArtifactRow(artifactResponse.data as OutputArtifactRow)
}

function collectCinematicBlockVideos(upstream: Record<string, Record<string, unknown>>) {
  const seen = new Set<string>()
  return readUpstreamVideos(upstream, ['video', 'videos'])
    .map((video, index) => ({
      ...video,
      blockNumber: Number(video.blockNumber ?? index + 1) || index + 1,
    }))
    .filter((video) => {
      const identity = [
        readText(video.assetKey),
        readText(video.storagePath),
        readText(video.url),
        `block:${Number(video.blockNumber ?? 0) || 0}`,
      ].filter(Boolean).join('|')
      if (!identity) return true
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
    .sort((left, right) => Number(left.blockNumber) - Number(right.blockNumber))
}

function collectCinematicV2ShotVideos(upstream: Record<string, Record<string, unknown>>) {
  const seen = new Set<string>()
  return readUpstreamVideos(upstream, ['video', 'videos'])
    .map((video, index) => ({
      ...video,
      shotIndex: Number(video.shotIndex ?? video.shot_index ?? index + 1) || index + 1,
      shotId: readText(video.shotId) || readText(video.shot_id),
    }))
    .filter((video) => {
      const identity = [
        readText(video.assetKey),
        readText(video.storagePath),
        readText(video.url),
        readText(video.shotId),
        `shot:${Number(video.shotIndex ?? 0) || 0}`,
      ].filter(Boolean).join('|')
      if (!identity) return true
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
    .sort((left, right) => Number(left.shotIndex) - Number(right.shotIndex))
}

function ffmpegConcatLine(path: string) {
  return `file '${path.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`
}

async function runFfmpeg(args: string[]) {
  const command = new Deno.Command('ffmpeg', {
    args,
    stdout: 'piped',
    stderr: 'piped',
  })
  const output = await command.output()
  const stderr = new TextDecoder().decode(output.stderr)
  return { ok: output.success, code: output.code, stderr }
}

async function probeImageSize(path: string) {
  try {
    const command = new Deno.Command('ffprobe', {
      args: ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path],
      stdout: 'piped',
      stderr: 'piped',
    })
    const output = await command.output()
    if (!output.success) return null
    const payload = JSON.parse(new TextDecoder().decode(output.stdout)) as { streams?: Array<{ width?: number; height?: number }> }
    const stream = payload.streams?.[0]
    const width = Number(stream?.width ?? 0)
    const height = Number(stream?.height ?? 0)
    return width > 0 && height > 0 ? { width, height } : null
  } catch {
    return null
  }
}

async function stitchVideoBytes(input: {
  client: DatabaseClient
  videos: Record<string, unknown>[]
}) {
  if (input.videos.length === 0) throw new Error('Video stitch requires at least one generated video clip.')
  const tempDir = await Deno.makeTempDir({ prefix: 'graphcore-video-stitch-' })
  try {
    const clipPaths: string[] = []
    for (const [index, video] of input.videos.entries()) {
      const mimeType = readText(video.mimeType) || readText(video.mime_type) || 'video/mp4'
      const extension = mimeType.includes('webm') ? 'webm' : 'mp4'
      const clipPath = `${tempDir}/clip-${String(index + 1).padStart(3, '0')}.${extension}`
      const url = readText(video.url)
      const storagePath = readText(video.storagePath) || readText(video.storage_path)
      const bytes = url
        ? await downloadRemoteBytes(url)
        : storagePath
          ? await downloadProjectAssetBytes(input.client, storagePath)
          : null
      if (!bytes) throw new Error(`Video clip ${index + 1} has no downloadable URL or storage path.`)
      await Deno.writeFile(clipPath, bytes)
      clipPaths.push(clipPath)
    }
    const concatPath = `${tempDir}/concat.txt`
    await Deno.writeTextFile(concatPath, clipPaths.map(ffmpegConcatLine).join('\n'))
    const copyOutputPath = `${tempDir}/stitched-copy.mp4`
    const copy = await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', copyOutputPath])
    if (copy.ok) {
      return { bytes: await Deno.readFile(copyOutputPath), mimeType: 'video/mp4', mode: 'concat_copy', diagnostics: copy.stderr }
    }
    const reencodeOutputPath = `${tempDir}/stitched-reencode.mp4`
    const reencode = await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatPath,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      reencodeOutputPath,
    ])
    if (!reencode.ok) {
      throw new Error(`ffmpeg video stitch failed. Copy: ${copy.stderr.slice(0, 1000)} Re-encode: ${reencode.stderr.slice(0, 1000)}`)
    }
    return { bytes: await Deno.readFile(reencodeOutputPath), mimeType: 'video/mp4', mode: 'reencode', diagnostics: reencode.stderr }
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {})
  }
}

function collectComicPageImages(upstream: Record<string, Record<string, unknown>>) {
  const seen = new Set<string>()
  return readUpstreamImages(upstream, ['comicPages', 'pageImages', 'pages', 'image'])
    .filter((image) => readText(image.role) === 'comic_page' || Number(image.pageNumber ?? 0) > 0)
    .map((image, index) => {
      const pageNumber = Number(image.pageNumber ?? index + 1) || index + 1
      return { ...image, pageNumber }
    })
    .filter((image) => {
      const pageNumber = Number(image.pageNumber ?? 0) || 0
      const identity = [
        readText(image.assetKey),
        readText(image.storagePath),
        readText(image.url),
        pageNumber > 0 ? `page:${pageNumber}` : '',
      ].filter(Boolean).join('|')
      if (!identity) return true
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
    .sort((left, right) => Number(left.pageNumber) - Number(right.pageNumber))
}

async function registerComicArtifact(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  comicPages: Record<string, unknown>[]
  scriptMarkdown: string
  script: Record<string, unknown> | null
  documentRenderer?: OutputDocumentRenderer | null
}) {
  if (!input.documentRenderer) throw new Error('Comic PDF rendering requires a worker document renderer.')
  const slug = slugify(input.workflow.name)
  const artifactKey = `output.${slug}.${input.run.id.slice(0, 8)}`
  const assetKey = `${artifactKey}.comic_pdf`
  const scriptArtifactKey = `${artifactKey}.comic_script`
  const scriptAssetKey = `${artifactKey}.comic_script.md`
  const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.pdf`
  const scriptStoragePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.comic-script.md`
  const context = worldContextFromRunInput(input.run)
  const wiki = asRecord(context.wiki)
  const title = readText(input.script?.title) || titleFromContext(context)
  const generatedAt = new Date().toISOString()
  const comicPageInputs = await Promise.all(input.comicPages.map(async (page, index) => ({
    bytes: await downloadProjectAssetBytes(input.client, readText(page.storagePath)),
    mimeType: readText(page.mimeType) || 'image/png',
    assetKey: readText(page.assetKey),
    storagePath: readText(page.storagePath),
    width: Number(page.width ?? 0) || null,
    height: Number(page.height ?? 0) || null,
    prompt: readText(page.prompt),
    pageNumber: Number(page.pageNumber ?? index + 1) || index + 1,
  })))
  const renderResult = await input.documentRenderer({
    markdown: input.scriptMarkdown,
    title,
    subtitle: readText(wiki.logline) || readText(wiki.subtitle),
    provenance: 'Generated from the GraphCore world graph',
    generatedAt,
    fileName: `${slug}.pdf`,
    renderMode: 'comic',
    comicPages: comicPageInputs,
    comicScript: input.script ?? null,
    coverImage: null,
    run: input.run,
    workflow: input.workflow,
    node: input.node,
  })
  await uploadBytes(input.client, storagePath, renderResult.bytes, 'application/pdf')
  const scriptBytes = new TextEncoder().encode(input.scriptMarkdown)
  await uploadBytes(input.client, scriptStoragePath, scriptBytes, 'text/markdown; charset=utf-8')
  const renderMetadata = {
    ...renderResult.metadata,
    sequenceUnitKey: readStringArray(input.run.input.sourceSequenceUnitKeys)[0] ?? '',
  }
  const assetMetadata = {
    generatedBy: 'output_workflow',
    workflowId: input.workflow.id,
    workflowKey: input.workflow.key,
    runId: input.run.id,
    nodeId: input.node.id,
    nodeKey: input.node.key,
    preset: input.run.preset,
    provider: 'graphcore',
    model: 'deterministic-comic-pdf-v1',
    storageBucket: 'project-assets',
    storagePath,
    sourceEntityKeys: input.run.input.sourceEntityKeys ?? [],
    sourceSequenceUnitKeys: input.run.input.sourceSequenceUnitKeys ?? [],
    pageAssetKeys: comicPageInputs.map((page) => page.assetKey),
    pageStoragePaths: comicPageInputs.map((page) => page.storagePath),
    render: renderMetadata,
  }
  const assetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: assetKey,
      name: `${input.workflow.name}.pdf`,
      kind: 'document',
      mime_type: 'application/pdf',
      storage_path: storagePath,
      metadata: assetMetadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (assetResponse.error || !assetResponse.data) throw new Error(assetResponse.error?.message ?? 'Failed to register comic PDF asset.')

  const scriptAssetMetadata = {
    ...assetMetadata,
    storagePath: scriptStoragePath,
    companionForAssetKey: assetKey,
    render: {
      ...renderMetadata,
      byteSize: scriptBytes.byteLength,
      mimeType: 'text/markdown',
    },
  }
  const scriptAssetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: scriptAssetKey,
      name: `${input.workflow.name} Script.md`,
      kind: 'document',
      mime_type: 'text/markdown',
      storage_path: scriptStoragePath,
      metadata: scriptAssetMetadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (scriptAssetResponse.error || !scriptAssetResponse.data) throw new Error(scriptAssetResponse.error?.message ?? 'Failed to register comic script asset.')

  const artifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: artifactKey,
      name: input.workflow.name,
      kind: 'comic_pdf',
      asset_key: assetKey,
      mime_type: 'application/pdf',
      summary: 'Comic issue PDF generated from the selected sequence unit.',
      metadata: {
        ...assetMetadata,
        companionScriptAssetKey: scriptAssetKey,
        companionScriptArtifactKey: scriptArtifactKey,
        scriptPreview: input.scriptMarkdown.slice(0, 4000),
        scriptPreviewOnly: true,
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (artifactResponse.error || !artifactResponse.data) throw new Error(artifactResponse.error?.message ?? 'Failed to register comic PDF artifact.')

  const scriptArtifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: scriptArtifactKey,
      name: `${input.workflow.name} Script`,
      kind: 'manuscript',
      asset_key: scriptAssetKey,
      mime_type: 'text/markdown',
      summary: 'Comic script used to generate the page images.',
      metadata: {
        ...scriptAssetMetadata,
        primaryComicPdfAssetKey: assetKey,
        scriptPreview: input.scriptMarkdown.slice(0, 4000),
        scriptPreviewOnly: true,
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (scriptArtifactResponse.error || !scriptArtifactResponse.data) throw new Error(scriptArtifactResponse.error?.message ?? 'Failed to register comic script artifact.')

  return {
    pdfArtifact: mapOutputArtifactRow(artifactResponse.data as OutputArtifactRow),
    scriptArtifact: mapOutputArtifactRow(scriptArtifactResponse.data as OutputArtifactRow),
    renderMetadata,
  }
}

async function registerDocumentArtifact(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  markdown: string
  guidance?: OutputGuidanceBundle | null
  coverImage?: Record<string, unknown> | null
  documentMode?: 'ebook' | 'reference' | 'designed_reference'
  documentRenderer?: OutputDocumentRenderer | null
}) {
  const slug = slugify(input.workflow.name)
  const artifactKey = `output.${slug}.${input.run.id.slice(0, 8)}`
  const assetKey = `${artifactKey}.pdf`
  const htmlArtifactKey = `${artifactKey}.html`
  const htmlAssetKey = `${artifactKey}.html`
  const markdownArtifactKey = `${artifactKey}.manuscript`
  const markdownAssetKey = `${artifactKey}.md`
  const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.pdf`
  const htmlStoragePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.html`
  const markdownStoragePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.md`
  const context = worldContextFromRunInput(input.run)
  const wiki = asRecord(context.wiki)
  const title = titleFromContext(context)
  const subtitle = readText(wiki.logline) || readText(wiki.subtitle)
  const generatedAt = new Date().toISOString()
  const provenance = 'Generated from the GraphCore world graph'
  const documentMode = input.documentMode ?? (input.run.preset === 'story_bible_from_world' ? 'reference' : 'ebook')
  const runPageSize = readText(asRecord(input.run.input).pageSize)
  const pageSize = documentMode === 'designed_reference'
    ? (runPageSize === 'letter' || runPageSize === 'trade_6x9' || runPageSize === 'a4' ? runPageSize : 'a4')
    : documentMode === 'reference'
      ? (runPageSize === 'a4' ? 'a4' : 'letter')
      : 'trade_6x9'
  const referenceImages = documentMode === 'designed_reference'
    ? await buildDocumentReferenceImages({ client: input.client, run: input.run, limit: 30 })
    : []
  const baseRenderMetadata = buildEbookDocumentMetadata(input.markdown, {
    title,
    subtitle,
    provenance,
    generatedAt,
    documentMode,
    pageSize,
  })
  if (!input.documentRenderer) {
    throw new Error('PDF rendering requires a worker document renderer. The truncated fallback renderer has been removed.')
  }
  const renderResult = await input.documentRenderer({
    markdown: input.markdown,
    title,
    subtitle,
    provenance,
    generatedAt,
    fileName: `${slug}.pdf`,
    renderMode: documentMode,
    pageSize,
    referenceImages,
    coverImage: input.coverImage && readText(input.coverImage.storagePath)
      ? {
        bytes: await downloadProjectAssetBytes(input.client, readText(input.coverImage.storagePath)),
        mimeType: readText(input.coverImage.mimeType) || 'image/png',
        assetKey: readText(input.coverImage.assetKey),
        storagePath: readText(input.coverImage.storagePath),
        width: Number(input.coverImage.width ?? 0) || null,
        height: Number(input.coverImage.height ?? 0) || null,
        prompt: readText(input.coverImage.prompt),
      }
      : null,
    run: input.run,
    workflow: input.workflow,
    node: input.node,
  })
  const renderMetadata = {
    ...baseRenderMetadata,
    ...renderResult.metadata,
    manuscriptCharacterCount: input.markdown.length,
  }
  await uploadBytes(input.client, storagePath, renderResult.bytes, 'application/pdf')
  const coverImageBytes = input.coverImage && readText(input.coverImage.storagePath)
    ? await downloadProjectAssetBytes(input.client, readText(input.coverImage.storagePath))
    : null
  const { html } = buildEbookHtmlDocument(input.markdown, {
    title,
    subtitle,
    provenance,
    generatedAt,
    documentMode,
    pageSize,
    coverImageSrc: coverImageBytes
      ? bytesToDataUrl(coverImageBytes, readText(input.coverImage?.mimeType) || 'image/png')
      : undefined,
    referenceImages: referenceImages.map((image) => ({
      key: image.key ?? image.assetKey ?? '',
      entityKey: image.entityKey ?? '',
      title: image.title,
      caption: image.caption ?? '',
      type: image.type ?? '',
      src: bytesToDataUrl(image.bytes, image.mimeType || 'image/png'),
    })),
  })
  const htmlBytes = new TextEncoder().encode(html)
  await uploadBytes(input.client, htmlStoragePath, htmlBytes, 'text/html; charset=utf-8')
  const markdownBytes = new TextEncoder().encode(input.markdown)
  await uploadBytes(input.client, markdownStoragePath, markdownBytes, 'text/markdown; charset=utf-8')
  const assetMetadata = {
    generatedBy: 'output_workflow',
    workflowId: input.workflow.id,
    workflowKey: input.workflow.key,
    runId: input.run.id,
    nodeId: input.node.id,
    nodeKey: input.node.key,
    preset: input.run.preset,
    provider: 'graphcore',
    model: documentMode === 'designed_reference'
      ? 'deterministic-designed-reference-document-v1'
      : documentMode === 'reference'
        ? 'deterministic-reference-document-v1'
        : 'deterministic-ebook-v1',
    documentMode,
    pageSize,
    companionHtmlAssetKey: htmlAssetKey,
    companionHtmlArtifactKey: htmlArtifactKey,
    storageBucket: 'project-assets',
    storagePath,
    sourceEntityKeys: input.run.input.sourceEntityKeys ?? [],
    sourceSequenceUnitKeys: input.run.input.sourceSequenceUnitKeys ?? [],
    skillKeys: input.guidance?.skillKeys ?? [],
    skillVersions: input.guidance?.skillVersions ?? {},
    guidanceHash: input.guidance?.guidanceHash ?? '',
    resolvedGuidancePreview: input.guidance?.resolvedGuidancePreview ?? '',
    cover: input.coverImage ? {
      assetKey: readText(input.coverImage.assetKey),
      storagePath: readText(input.coverImage.storagePath),
      mimeType: readText(input.coverImage.mimeType),
      width: Number(input.coverImage.width ?? 0) || null,
      height: Number(input.coverImage.height ?? 0) || null,
      prompt: readText(input.coverImage.prompt),
    } : null,
    referenceImages: referenceImages.map((image) => ({
      key: image.key ?? '',
      assetKey: image.assetKey ?? '',
      entityKey: image.entityKey ?? '',
      title: image.title,
      type: image.type ?? '',
      storagePath: image.storagePath ?? '',
      mimeType: image.mimeType,
    })),
    render: renderMetadata,
  }
  const assetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: assetKey,
      name: `${input.workflow.name}.pdf`,
      kind: 'document',
      mime_type: 'application/pdf',
      storage_path: storagePath,
      metadata: assetMetadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (assetResponse.error || !assetResponse.data) throw new Error(assetResponse.error?.message ?? 'Failed to register output asset.')

  const htmlAssetMetadata = {
    ...assetMetadata,
    storagePath: htmlStoragePath,
    companionForAssetKey: assetKey,
    render: {
      ...renderMetadata,
      byteSize: htmlBytes.byteLength,
      mimeType: 'text/html',
      renderer: 'graphcore-safe-html-document-v1',
    },
  }
  const htmlAssetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: htmlAssetKey,
      name: `${input.workflow.name}.html`,
      kind: 'document',
      mime_type: 'text/html',
      storage_path: htmlStoragePath,
      metadata: htmlAssetMetadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (htmlAssetResponse.error || !htmlAssetResponse.data) throw new Error(htmlAssetResponse.error?.message ?? 'Failed to register HTML page asset.')

  const markdownAssetMetadata = {
    ...assetMetadata,
    storagePath: markdownStoragePath,
    companionForAssetKey: assetKey,
    render: {
      ...renderMetadata,
      byteSize: markdownBytes.byteLength,
      mimeType: 'text/markdown',
    },
  }
  const markdownAssetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: markdownAssetKey,
      name: `${input.workflow.name}.md`,
      kind: 'document',
      mime_type: 'text/markdown',
      storage_path: markdownStoragePath,
      metadata: markdownAssetMetadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (markdownAssetResponse.error || !markdownAssetResponse.data) throw new Error(markdownAssetResponse.error?.message ?? 'Failed to register manuscript markdown asset.')

  const artifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: artifactKey,
      name: input.workflow.name,
      kind: 'pdf',
      asset_key: assetKey,
      mime_type: 'application/pdf',
      summary: documentMode === 'reference'
        ? 'Story bible reference PDF generated from the world graph.'
        : 'Written ebook PDF generated from the world graph.',
      metadata: {
        ...assetMetadata,
        companionHtmlAssetKey: htmlAssetKey,
        companionHtmlArtifactKey: htmlArtifactKey,
        companionMarkdownAssetKey: markdownAssetKey,
        companionMarkdownArtifactKey: markdownArtifactKey,
        markdownPreview: input.markdown.slice(0, 4000),
        markdownPreviewOnly: true,
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (artifactResponse.error || !artifactResponse.data) throw new Error(artifactResponse.error?.message ?? 'Failed to register output artifact.')

  const htmlArtifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: htmlArtifactKey,
      name: `${input.workflow.name} HTML`,
      kind: 'html',
      asset_key: htmlAssetKey,
      mime_type: 'text/html',
      summary: documentMode === 'reference' || documentMode === 'designed_reference'
        ? 'Openable designed HTML reference page generated from the world graph.'
        : 'Openable HTML ebook page generated from the world graph.',
      metadata: {
        ...htmlAssetMetadata,
        primaryPdfAssetKey: assetKey,
        htmlPreview: html.slice(0, 4000),
        htmlPreviewOnly: true,
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (htmlArtifactResponse.error || !htmlArtifactResponse.data) throw new Error(htmlArtifactResponse.error?.message ?? 'Failed to register HTML page artifact.')

  const markdownArtifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: markdownArtifactKey,
      name: documentMode === 'reference' ? `${input.workflow.name} Markdown` : `${input.workflow.name} Manuscript`,
      kind: 'manuscript',
      asset_key: markdownAssetKey,
      mime_type: 'text/markdown',
      summary: documentMode === 'reference'
        ? 'Full story bible reference Markdown generated from the world graph.'
        : 'Full manuscript Markdown generated from the world graph.',
      metadata: {
        ...markdownAssetMetadata,
        primaryPdfAssetKey: assetKey,
        companionHtmlAssetKey: htmlAssetKey,
        companionHtmlArtifactKey: htmlArtifactKey,
        markdownPreview: input.markdown.slice(0, 4000),
        markdownPreviewOnly: true,
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (markdownArtifactResponse.error || !markdownArtifactResponse.data) throw new Error(markdownArtifactResponse.error?.message ?? 'Failed to register manuscript artifact.')
  return {
    pdfArtifact: mapOutputArtifactRow(artifactResponse.data as OutputArtifactRow),
    htmlArtifact: mapOutputArtifactRow(htmlArtifactResponse.data as OutputArtifactRow),
    markdownArtifact: mapOutputArtifactRow(markdownArtifactResponse.data as OutputArtifactRow),
    renderMetadata,
  }
}

function computeNodeInputHash(input: {
  run: OutputWorkflowRun
  node: OutputWorkflowNode
  upstream: Record<string, Record<string, unknown>>
}) {
  const upstreamPayload = Object.fromEntries(
    Object.entries(input.upstream).map(([nodeKey, outputs]) => [nodeKey, outputs]),
  )
  return hashOutputWorkflowValue({
    executorVersion: OUTPUT_WORKFLOW_EXECUTOR_VERSION,
    runInput: input.run.input,
    nodeConfig: input.node.config,
    nodeInputs: input.node.inputs,
    upstream: upstreamPayload,
  })
}

async function executeNode(input: {
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  priorStep?: OutputWorkflowRunStep | null
  upstream: Record<string, Record<string, unknown>>
  inputHash: string
  client: DatabaseClient
  documentRenderer?: OutputDocumentRenderer | null
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    provider?: string | null
    model?: string | null
    providerRequestId?: string | null
    metadata?: Record<string, unknown>
  }) => Promise<void>
}) {
  switch (input.node.nodeType) {
    case 'world_context_query': {
      const context = await refreshWorldContextVisualReferences(input.client, input.run, extractWorldContext(input.run, input.node))
      return {
        inputHash: input.inputHash,
        outputHash: hashOutputWorkflowValue(context),
        outputs: { context },
      }
    }
    case 'skill_context_query': {
      const guidance = buildOutputGuidanceBundleForNode({
        node: input.node,
        worldWiki: asRecord(input.run.input).worldWiki,
      })
      const outputs = { guidance, guidanceHash: guidance.guidanceHash, skillKeys: guidance.skillKeys }
      return {
        inputHash: input.inputHash,
        outputHash: hashOutputWorkflowValue(outputs),
        outputs,
        provider: 'graphcore',
        model: 'output-skills-v1',
      }
    }
    case 'text_llm': {
      const purpose = readText(asRecord(input.node.config).purpose)
      const prompt = readText(input.node.inputs.prompt) || input.run.prompt
      const context = asRecord(asRecord(input.upstream.world_context).context)
      const guidance = resolveGuidanceForExecution({ run: input.run, node: input.node, upstream: input.upstream })
      if (purpose === 'outline') {
        const outline = outlineFromContext(context)
        const outputs = { outline, text: outline.map((chapter) => `${chapter.number}. ${chapter.title}`).join('\n'), guidance }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-outline-v1' }
      }
      if (purpose === 'chapter_plan') {
        const outline = readFirstUpstreamArray(input.upstream, ['outline'])
        const chapterPlan = buildChapterPlan(context, outline.length > 0 ? outline : outlineFromContext(context))
        const text = chapterPlan.map((chapter) => `${chapter.number}. ${chapter.title}: ${chapter.synopsis}`).join('\n')
        const outputs = { chapterPlan, plan: chapterPlan, text, guidance }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-chapter-plan-v1' }
      }
      if (purpose === 'bible_section_plan') {
        const config = asRecord(input.node.config)
        const sectionPlan = buildBibleSectionPlan(config, context)
        const text = sectionPlan.map((section) => `${section.order}. ${section.title}: ${section.description}`).join('\n')
        const outputs = { sectionPlan, plan: sectionPlan, sections: sectionPlan, text, guidance }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-bible-section-plan-v1' }
      }
      if (purpose === 'bible_section') {
        const config = asRecord(input.node.config)
        const sectionKey = readText(config.sectionKey)
        const sectionTitle = readText(config.sectionTitle) || input.node.label
        const sectionDescription = readText(config.sectionDescription)
        const sectionOrder = Number(config.sectionOrder ?? 9999) || 9999
        const sectionPlan = readFirstUpstreamArray(input.upstream, ['sectionPlan', 'plan', 'sections'])
        const prose = await generateBackgroundMarkdown({
          instructions: [
            'You are a senior story bible editor and canon documentation writer.',
            'Write concise reference-document Markdown from the supplied world graph only.',
            'Do not write fiction prose, screenplay, chapter prose, or marketing copy.',
            'If source material is missing, say so plainly instead of inventing canon.',
          ].join(' '),
          prompt: buildBibleSectionInstruction({
            context,
            sectionPlan,
            sectionKey,
            sectionTitle,
            sectionDescription,
            prompt,
            guidance,
          }),
          maxOutputTokens: 4200,
          metadata: {
            graphcore_task: 'output_workflow_bible_section',
            graphcore_node_key: input.node.key,
            graphcore_section_key: sectionKey,
          },
          priorProviderRequestId: input.priorStep?.providerRequestId,
          shouldCancel: input.shouldCancel,
          onProgress: async (progress) => {
            await input.onProgress?.({
              provider: 'openai',
              model: outputWorkflowTextModel(),
              providerRequestId: progress.providerRequestId,
              metadata: {
                providerMode: progress.providerMode,
                providerStatus: progress.providerStatus,
                lastProviderPollAt: progress.lastProviderPollAt,
              },
            })
          },
        })
        const outputs = {
          markdown: prose.markdown,
          text: prose.markdown,
          sectionKey,
          sectionTitle,
          sectionOrder,
          documentMode: readText(config.documentMode) || 'reference',
          pageSize: readText(config.pageSize) || '',
          imagePolicy: readText(config.imagePolicy) || '',
          guidance,
          usage: prose.usage,
          providerStatus: prose.providerStatus,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'openai',
          model: prose.model,
          providerRequestId: prose.providerRequestId,
        }
      }
      if (purpose === 'concept_art_prompt' || purpose === 'poster_prompt') {
        const worldWiki = asRecord(context.worldWiki ?? context.wiki)
        const title = readText(worldWiki.title) || titleFromContext(context)
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const packedEntities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
        const entities = packedEntities.length > 0
          ? packedEntities.slice(0, 10)
          : Array.isArray(context.entities) ? context.entities.map(asRecord).slice(0, 10) : []
        const entityLines = entities
          .map((entity) => {
            const name = readText(entity.name)
            const visualDescription = readText(entity.visualDescription) || readText(entity.summary) || readText(entity.context)
            const visualTraits = readStringArray(entity.visualTraits)
            const assetKeys = readStringArray(entity.assetKeys)
            const traitNote = visualTraits.length > 0 ? ` Traits: ${visualTraits.join(', ')}.` : ''
            const selectedVariantKey = readText(entity.selectedReferenceVariantKey)
            const selectedVariantLabel = readText(entity.selectedReferenceVariantLabel) || selectedVariantKey
            const selectedVariantSummary = readText(entity.selectedReferenceVariantSummary)
            const variantNote = selectedVariantKey && selectedVariantKey !== 'default'
              ? ` Selected visual variant: ${selectedVariantLabel}${selectedVariantSummary ? ` (${selectedVariantSummary})` : ''}.`
              : ''
            const assetNote = assetKeys.length > 0 ? ` Reference image asset: ${assetKeys.join(', ')}.` : ''
            return name ? `- ${name}: ${visualDescription}${traitNote}${variantNote}${assetNote}` : ''
          })
          .filter(Boolean)
          .join('\n')
        const visualStyle = readText(worldWiki.artStyleDescription) || readText(worldWiki.visualStyle) || ''
        const kind = purpose === 'poster_prompt' ? 'finished vertical poster/key art' : 'production concept art image'
        const text = [
          `Create a ${kind} for "${title}".`,
          `User request: ${prompt}`,
          visualStyle ? `World visual style: ${visualStyle}` : '',
          entityLines ? `Canonical subjects:\n${entityLines}` : '',
          'When a selected visual variant is listed for a subject, treat that variant reference as authoritative for costume, gear, props, location subset, and shot setting. Do not blend it with the default reference or replace it with the default look.',
          'Use exact canonical visual details. Keep the prompt visual-only. Do not mention GraphCore, schemas, nodes, world graph, internal keys, or implementation details.',
          purpose === 'poster_prompt'
            ? `If visible typography is needed, use the exact title text "${title}" and keep all other text minimal.`
            : 'No captions or UI text unless the user explicitly requested visible typography.',
        ].filter(Boolean).join('\n\n')
        const outputs = { text, prompt: text, assetPack, asset_pack: assetPack, guidance }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-visual-prompt-v1' }
      }
      if (purpose === 'image_reference_selector') {
        const assetPack = buildDeterministicImageAssetPack(context, { prompt: input.run.prompt })
        const outputs = {
          assetPack,
          asset_pack: assetPack,
          text: JSON.stringify(assetPack, null, 2),
          guidance,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-image-asset-pack-v1',
        }
      }
      if (purpose === 'cinematic_entity_selector') {
        const assetPack = buildDeterministicCinematicAssetPack(context)
        const outputs = {
          assetPack,
          asset_pack: assetPack,
          text: JSON.stringify(assetPack, null, 2),
          guidance,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-cinematic-asset-pack-v1',
        }
      }
      if (purpose === 'cinematic_v2_reference_select' || purpose === 'cinematic_v3_reference_select') {
        const config = asRecord(input.node.config)
        const maxReferenceCount = Math.max(1, Math.min(16, Number(config.maxReferenceCount ?? 16) || 16))
        const sourceAssetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const fallbackPlan = buildFallbackCinematicV2ReferencePlan(sourceAssetPack, maxReferenceCount)
        const result = await runCinematicV2StructuredNode({
          nodeKey: input.node.key,
          schemaName: purpose === 'cinematic_v3_reference_select' ? 'output_workflow_cinematic_v3_reference_select' : 'output_workflow_cinematic_v2_reference_select',
          schema: cinematicV2ReferencePlanSchema,
          instructions: 'You are a cinematic reference selector. Return strict JSON only. Choose only supplied reference keys needed for a V2 cinematic scene.',
          prompt: [
            'Choose the cinematic-level reference plan from the already sequence-scoped asset pack.',
            'Do not add or invent world entities. Do not select every available reference by default.',
            'Select primary cast, supporting cast, locations, props, concepts, and continuity anchors that are genuinely needed for the storyboard and shot plan.',
            'Reject refs that are unrelated to this prompt/sequence and explain briefly.',
            `User brief:\n${input.run.prompt}`,
            guidanceMarkdown(guidance),
            compactForPrompt({
              world: asRecord(context.wiki ?? context.worldWiki),
              sequenceUnits: Array.isArray(context.sequenceUnits) ? context.sequenceUnits.map(asRecord).slice(0, 4) : [],
              sourceAssetPack,
            }, 9000),
          ].filter(Boolean).join('\n\n'),
          fallback: fallbackPlan,
          maxOutputTokens: 2800,
        })
        const cinematicReferencePlan = sanitizeCinematicV2ReferencePlan(asRecord(result.value), sourceAssetPack, maxReferenceCount)
        const assetPack = filterCinematicAssetPack(sourceAssetPack, referencePlanKeys(cinematicReferencePlan), maxReferenceCount, 2)
        const outputs = {
          cinematicReferencePlan,
          cinematic_reference_plan: cinematicReferencePlan,
          assetPack,
          asset_pack: assetPack,
          sourceAssetPackEntityCount: cinematicAssetPackEntityKeys(sourceAssetPack).length,
          selectedEntityCount: cinematicAssetPackEntityKeys(assetPack).length,
          text: JSON.stringify({ cinematicReferencePlan, assetPack }, null, 2),
          guidance,
          usage: asRecord(result.response).usage,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: result.provider, model: result.model, providerRequestId: readText(asRecord(result.response).id) || undefined }
      }
      if (purpose === 'cinematic_v2_script_parse') {
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const screenplayDraft = readFirstUpstreamRecord(input.upstream, ['screenplayDraft', 'screenplay_draft'])
        const fallback = buildFallbackCinematicV2ParsedScript({ context, assetPack, prompt: input.run.prompt, screenplayDraft })
        const result = await runCinematicV2StructuredNode({
          nodeKey: input.node.key,
          schemaName: 'output_workflow_cinematic_v2_script_parse',
          schema: cinematicV2ParsedScriptSchema,
          instructions: 'You are a cinematic script parser. Return strict JSON only. Resolve references to existing world asset keys when supplied; do not invent new entity keys.',
          prompt: [
            'Parse the authored screenplay/treatment into cinematic beats for a shot-orchestrated production graph. The screenplay is the story spine; the raw user brief is only supporting context.',
            'Identify characters, location, props, dialogue, actions, emotional turns, and story-driven target duration.',
            'Do not target a fixed 15-second total runtime. The total animatic may exceed 15 seconds by using multiple short shots; 15 seconds is only a provider-safe ceiling for one generated clip.',
            'Use only canonical reference keys from the supplied asset pack/context. If a subject is implied but not bound, leave it as prose in the beat text rather than inventing a key.',
            `User brief:\n${input.run.prompt}`,
            compactForPrompt({ screenplayDraft }, 6000),
            guidanceMarkdown(guidance),
            compactForPrompt({ world: asRecord(context.wiki ?? context.worldWiki), assetPack, entities: Array.isArray(context.entities) ? context.entities.map(asRecord).slice(0, 30) : [] }, 9000),
          ].filter(Boolean).join('\n\n'),
          fallback,
          maxOutputTokens: 3600,
        })
        const outputs = {
          parsedScript: result.value,
          parsed_script: result.value,
          text: JSON.stringify(result.value, null, 2),
          guidance,
          usage: asRecord(result.response).usage,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: result.provider, model: result.model, providerRequestId: readText(asRecord(result.response).id) || undefined }
      }
      if (purpose === 'cinematic_v2_screenplay_author' || purpose === 'cinematic_v3_screenplay_author') {
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const fallback = buildFallbackCinematicV2ScreenplayDraft({ context, assetPack, prompt: input.run.prompt })
        const result = await runCinematicV2ScreenplayAuthor({
          nodeKey: input.node.key,
          instructions: [
            'You are a senior screenwriter and cinematic story artist.',
            'Return plain Markdown screenplay/treatment text only. Do not return JSON.',
          ].join('\n'),
          prompt: [
            'Write the cinematic source screenplay before any technical planning happens.',
            'Format it for production parsing: scene heading, concise visible action lines, dialogue blocks, short performance notes, and visual motifs.',
            'Prefer screenplay/action lines over novelistic prose. Avoid interior explanation unless it is paired with visible behavior.',
            'Target roughly 600-1200 words for one cinematic part unless the selected story unit clearly needs less.',
            'Use concrete visual behavior: blocking, gesture, expression, gaze, action, dialogue, and transitions.',
            'Keep performance direction compact: valence/arousal-style emotional movement may be described in plain language, but do not emit numeric JSON.',
            'Use the supplied world context and references as canon. Preserve selected sequence outcomes and entity identities.',
            'Do not write graph operations, provider instructions, image prompts, video prompts, model names, @Image labels, resolution, aspect-ratio instructions, or schema fields.',
            'Do not include a JSON object, bullet-only outline, or workflow metadata.',
            'Recommended shape:',
            '## Scene: [short title]',
            'EXT./INT. LOCATION - TIME',
            'Action lines and dialogue.',
            '## Performance Notes',
            '- Character: visible acting direction.',
            '## Visual Motifs',
            '- concrete recurring image.',
            `User brief:\n${input.run.prompt}`,
            guidanceMarkdown(guidance),
            compactForPrompt({ world: asRecord(context.wiki ?? context.worldWiki), assetPack, entities: Array.isArray(context.entities) ? context.entities.map(asRecord).slice(0, 30) : [] }, 11000),
          ].filter(Boolean).join('\n\n'),
          fallback,
          maxOutputTokens: 4200,
        })
        const screenplayDraft = result.fallbackUsed
          ? cinematicV2ScreenplayDraftSchema.parse({
            ...result.value,
            diagnostics: [
              ...readStringArray(asRecord(result.value).diagnostics),
              `Screenplay author fallback reason: ${result.fallbackReason}`,
            ],
          })
          : result.value
        const outputs = {
          screenplayDraft,
          screenplay_draft: screenplayDraft,
          text: screenplayDraft.screenplayMarkdown,
          fallbackUsed: result.fallbackUsed,
          fallbackReason: result.fallbackReason,
          guidance,
          usage: asRecord(result.response).usage,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: result.provider, model: result.model, providerRequestId: readText(asRecord(result.response).id) || undefined }
      }
      if (purpose === 'cinematic_v3_shot_parse') {
        const config = asRecord(input.node.config)
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const screenplayDraft = readFirstUpstreamRecord(input.upstream, ['screenplayDraft', 'screenplay_draft'])
        const parsedScript = buildFallbackCinematicV2ParsedScript({ context, assetPack, prompt: input.run.prompt, screenplayDraft })
        const sceneState = buildFallbackCinematicV2SceneState({ parsedScript, context })
        const configuredMaxShotCount = Number(config.maxShotCount ?? 0) || 0
        const suggestedDurationSeconds = Number(asRecord(screenplayDraft).suggestedDurationSeconds ?? 0) || null
        const maxShotCount = Math.max(1, Math.min(36, configuredMaxShotCount > 0 ? configuredMaxShotCount : deriveCinematicV2MaxShotCount(suggestedDurationSeconds)))
        const fallback = buildFallbackCinematicV2ShotPlan({ parsedScript, sceneState, maxShotCount })
        let result = await runCinematicV2StructuredNode({
          nodeKey: input.node.key,
          schemaName: 'output_workflow_cinematic_v3_shot_parse',
          schema: cinematicV2ShotPlanSchema,
          instructions: 'You are a cinematic shot parser. Return strict JSON only. Parse the authored screenplay directly into timed storyboard/video shots using only supplied reference keys.',
          prompt: [
            `Parse the authored screenplay directly into at most ${maxShotCount} cinematic shots. Do not create separate scene-state, layout, or secondary shot-planning abstractions.`,
            'Each shot must be a concrete storyboard panel and potential short video beat: timing, visible action, dialogue/caption meaning, camera, lighting, mood, acting direction, and reference IDs.',
            'Fill caption as semantic caption/beat meaning only; it must not become visible text in generated images.',
            'Fill storyboardPanelPrompt with a concise visual panel instruction. Fill videoDirection with concise movement/action continuity for the future storyboard-group video.',
            'Use only canonical reference keys from the supplied asset pack/context. If a subject is implied but not bound, leave it in prose rather than inventing a key.',
            'Provider durations must be 4-15 seconds; editorial durations should reflect actual timeline timing.',
            `User brief:\n${input.run.prompt}`,
            compactForPrompt({ screenplayDraft }, 8000),
            guidanceMarkdown(guidance),
            compactForPrompt({ world: asRecord(context.wiki ?? context.worldWiki), assetPack, entities: Array.isArray(context.entities) ? context.entities.map(asRecord).slice(0, 30) : [] }, 10000),
          ].filter(Boolean).join('\n\n'),
          fallback,
          maxOutputTokens: 12000,
        })
        if (result.fallbackUsed && result.response.response.ok) {
          result = await runCinematicV2StructuredNode({
            nodeKey: input.node.key,
            schemaName: 'output_workflow_cinematic_v3_shot_parse_repair',
            schema: cinematicV2ShotPlanSchema,
            instructions: 'Repair a Cinematics V3 shot JSON response into strict valid JSON only. Preserve screenplay coverage and do not shorten the scene unless requested.',
            prompt: [
              'The previous V3 shot parse response failed validation. Return a complete valid shot plan JSON matching the schema.',
              `Validation or parse failure:\n${result.fallbackReason}`,
              `Maximum shots: ${maxShotCount}.`,
              `Previous model output:\n${result.response.outputText.slice(0, 24000)}`,
              compactForPrompt({ screenplayDraft, assetPack }, 14000),
            ].filter(Boolean).join('\n\n'),
            fallback,
            maxOutputTokens: 12000,
          })
        }
        const normalizedShotPlan = cinematicV2ShotPlanSchema.parse({
          ...result.value,
          shots: result.value.shots.map((shot) => ({
            ...shot,
            providerDurationSeconds: providerSafeCinematicV2DurationSeconds(shot.editorialDurationSeconds),
          })),
        })
        const referenceDiagnostics = validateCinematicV2ShotPlanReferences({
          shotPlan: normalizedShotPlan,
          referenceIds: cinematicV2ReferenceIds(assetPack, {}),
        })
        const outputShotPlan = {
          ...normalizedShotPlan,
          diagnostics: [...normalizedShotPlan.diagnostics, ...(result.fallbackUsed ? [`V3 shot parser failed; fallback plan generated. ${result.fallbackReason}`] : []), ...referenceDiagnostics],
        }
        const outputs = {
          shotPlan: outputShotPlan,
          shot_plan: outputShotPlan,
          shots: outputShotPlan.shots,
          text: JSON.stringify(outputShotPlan, null, 2),
          referenceDiagnostics,
          fallbackUsed: result.fallbackUsed,
          fallbackReason: result.fallbackReason,
          guidance,
          usage: asRecord(result.response).usage,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: result.provider, model: result.model, providerRequestId: readText(asRecord(result.response).id) || undefined }
      }
      if (purpose === 'cinematic_v2_scene_compile') {
        const parsedScript = readFirstUpstreamRecord(input.upstream, ['parsedScript', 'parsed_script'])
        const fallback = buildFallbackCinematicV2SceneState({ parsedScript, context })
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const screenplayDraft = readFirstUpstreamRecord(input.upstream, ['screenplayDraft', 'screenplay_draft'])
        const result = await runCinematicV2StructuredNode({
          nodeKey: input.node.key,
          schemaName: 'output_workflow_cinematic_v2_scene_compile',
          schema: cinematicV2SceneStateSchema,
          instructions: 'You are a cinematic scene compiler. Return strict JSON only. Instantiate existing world references into a scene state; do not redesign characters or locations.',
          prompt: [
            'Create a lightweight cinematic scene state from the parsed beats, world style, and canonical references.',
            'Derive character emotional baselines and performance continuity from the screenplay arc; do not reset character acting between shots.',
            'Specify lighting, atmosphere, mood, visual continuity, character scene states, and location state.',
            'Do not create new canon and do not redesign existing identities.',
            `User brief:\n${input.run.prompt}`,
            compactForPrompt({ screenplayDraft }, 4500),
            guidanceMarkdown(guidance),
            compactForPrompt({ parsedScript, world: asRecord(context.wiki ?? context.worldWiki), assetPack }, 9000),
          ].filter(Boolean).join('\n\n'),
          fallback,
          maxOutputTokens: 3600,
        })
        const outputs = {
          sceneState: result.value,
          scene_state: result.value,
          text: JSON.stringify(result.value, null, 2),
          guidance,
          usage: asRecord(result.response).usage,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: result.provider, model: result.model, providerRequestId: readText(asRecord(result.response).id) || undefined }
      }
      if (purpose === 'cinematic_v2_layout_plan') {
        const parsedScript = readFirstUpstreamRecord(input.upstream, ['parsedScript', 'parsed_script'])
        const sceneState = readFirstUpstreamRecord(input.upstream, ['sceneState', 'scene_state'])
        const fallback = buildFallbackCinematicV2LayoutPlan({ parsedScript, sceneState })
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const screenplayDraft = readFirstUpstreamRecord(input.upstream, ['screenplayDraft', 'screenplay_draft'])
        const result = await runCinematicV2StructuredNode({
          nodeKey: input.node.key,
          schemaName: 'output_workflow_cinematic_v2_layout_plan',
          schema: cinematicV2SceneLayoutPlanSchema,
          instructions: 'You are a cinematic blocking and continuity planner. Return strict JSON only. Plan spatial continuity before storyboards or videos.',
          prompt: [
            'Plan scene geography, character positions, landmarks, camera positions, eyelines, lighting direction, and screen-direction rules.',
            'Keep it practical for short cinematic AI video shots. This is a JSON blocking plan, not final art.',
            'Do not use game or app language such as playable, level, sandbox, UI, or mechanics unless the user explicitly requested a game/app cinematic.',
            'Keep the camera plan compact and production-useful; prefer the fewest camera setups needed for the planned shots.',
            `User brief:\n${input.run.prompt}`,
            compactForPrompt({ screenplayDraft }, 4500),
            guidanceMarkdown(guidance),
            compactForPrompt({ parsedScript, sceneState, assetPack }, 9000),
          ].filter(Boolean).join('\n\n'),
          fallback,
          maxOutputTokens: 3600,
        })
        const outputs = {
          layoutPlan: result.value,
          layout_plan: result.value,
          text: JSON.stringify(result.value, null, 2),
          guidance,
          usage: asRecord(result.response).usage,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: result.provider, model: result.model, providerRequestId: readText(asRecord(result.response).id) || undefined }
      }
      if (purpose === 'cinematic_v2_shot_plan') {
        const config = asRecord(input.node.config)
        const parsedScript = readFirstUpstreamRecord(input.upstream, ['parsedScript', 'parsed_script'])
        const sceneState = readFirstUpstreamRecord(input.upstream, ['sceneState', 'scene_state'])
        const layoutPlan = readFirstUpstreamRecord(input.upstream, ['layoutPlan', 'layout_plan'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const screenplayDraft = readFirstUpstreamRecord(input.upstream, ['screenplayDraft', 'screenplay_draft'])
        const parsedDuration = Number(asRecord(parsedScript).targetDurationSeconds ?? 0) || null
        const derivedMaxShotCount = deriveCinematicV2MaxShotCount(parsedDuration)
        const configuredMaxShotCount = Number(config.maxShotCount ?? 0) || 0
        const maxShotCount = Math.max(1, Math.min(36, configuredMaxShotCount > 0 && configuredMaxShotCount < 36 ? configuredMaxShotCount : derivedMaxShotCount))
        const fallback = buildFallbackCinematicV2ShotPlan({ parsedScript, sceneState, maxShotCount })
        let result = await runCinematicV2StructuredNode({
          nodeKey: input.node.key,
          schemaName: 'output_workflow_cinematic_v2_shot_plan',
          schema: cinematicV2ShotPlanSchema,
          instructions: 'You are a cinematic shot planner. Return strict JSON only. Split scenes into short controllable shots for AI video generation.',
          prompt: [
            `Plan at most ${maxShotCount} shots. Each shot should have one purpose, one camera intent, explicit visible/speaker reference keys, and short editorial timing.`,
            'Dialogue closeups should be 2-4 editorial seconds. Reactions can be 1-2 seconds. Action/impact shots should be 1-3 seconds. Provider durations must be 4-15 seconds; final assembly trims to editorial timing.',
            'Use the authored screenplay as the creative source. Preserve its emotional progression and do not collapse the total runtime to 15 seconds unless explicitly requested; use more shots when the scene needs more time.',
            'For every visible character in a shot, fill performanceBeats with valence (-1 to 1), arousal/confidence/dominance (0 to 1), plus concrete body language, facial expression, gaze, gesture, and voice energy when relevant.',
            'Fill performanceArc at the shot-plan level so the timeline can show how each character changes across the scene.',
            'Fill visibleCharacterRefIds, speakerRefIds, locationRefId, and propRefIds only with keys from the supplied cinematic reference plan/asset pack. Do not invent refs and do not pull in unrelated sequence entities.',
            'Use layout rules for screen direction, eyelines, and lighting continuity. Mark requiresLipSync only for visible mouth dialogue; V2 MVP stores placeholder audio only.',
            `User brief:\n${input.run.prompt}`,
            compactForPrompt({ screenplayDraft }, 5000),
            guidanceMarkdown(guidance),
            compactForPrompt({ parsedScript, sceneState, layoutPlan, assetPack }, 10000),
          ].filter(Boolean).join('\n\n'),
          fallback,
          maxOutputTokens: 12000,
        })
        if (result.fallbackUsed && result.response.response.ok) {
          result = await runCinematicV2StructuredNode({
            nodeKey: input.node.key,
            schemaName: 'output_workflow_cinematic_v2_shot_plan_repair',
            schema: cinematicV2ShotPlanSchema,
            instructions: 'Repair a Cinematics V2 shot plan into strict valid JSON only. Preserve the authored scene coverage and do not shorten the scene unless the user requested it.',
            prompt: [
              'The previous directed shot-plan response failed validation. Return a complete valid shot plan JSON matching the schema.',
              `Validation or parse failure:\n${result.fallbackReason}`,
              `Maximum shots: ${maxShotCount}. Preferred total editorial duration: ${readText(asRecord(parsedScript).targetDurationSeconds) || 'story-driven'}.`,
              'Use the screenplay and parsed beats to cover the whole scene. Do not collapse the plan to one 3x3 storyboard sheet.',
              `Previous model output:\n${result.response.outputText.slice(0, 24000)}`,
              compactForPrompt({ screenplayDraft, parsedScript, sceneState, layoutPlan, assetPack }, 14000),
            ].filter(Boolean).join('\n\n'),
            fallback,
            maxOutputTokens: 12000,
          })
        }
        const normalizedShotPlan = cinematicV2ShotPlanSchema.parse({
          ...result.value,
          shots: result.value.shots.map((shot) => ({
            ...shot,
            providerDurationSeconds: providerSafeCinematicV2DurationSeconds(shot.editorialDurationSeconds),
          })),
        })
        const referenceDiagnostics = validateCinematicV2ShotPlanReferences({
          shotPlan: normalizedShotPlan,
          referenceIds: cinematicV2ReferenceIds(assetPack, {}),
        })
        const outputs = {
          shotPlan: {
            ...normalizedShotPlan,
            diagnostics: [...normalizedShotPlan.diagnostics, ...(result.fallbackUsed ? [`Directed shot planner failed; fallback plan generated. ${result.fallbackReason}`] : []), ...referenceDiagnostics],
          },
          shot_plan: {
            ...normalizedShotPlan,
            diagnostics: [...normalizedShotPlan.diagnostics, ...(result.fallbackUsed ? [`Directed shot planner failed; fallback plan generated. ${result.fallbackReason}`] : []), ...referenceDiagnostics],
          },
          shots: normalizedShotPlan.shots,
          text: JSON.stringify({
            ...normalizedShotPlan,
            diagnostics: [...normalizedShotPlan.diagnostics, ...(result.fallbackUsed ? [`Directed shot planner failed; fallback plan generated. ${result.fallbackReason}`] : []), ...referenceDiagnostics],
          }, null, 2),
          referenceDiagnostics,
          fallbackUsed: result.fallbackUsed,
          fallbackReason: result.fallbackReason,
          guidance,
          usage: asRecord(result.response).usage,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: result.provider, model: result.model, providerRequestId: readText(asRecord(result.response).id) || undefined }
      }
      if (purpose === 'cinematic_script_authoring') {
        const config = asRecord(input.node.config)
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const scriptInput = {
          context,
          assetPack,
          prompt: input.run.prompt,
          guidance,
          aspectRatio: readText(config.aspectRatio) || '16:9',
          resolution: readText(config.resolution) || '720p',
          presetFamily: readText(config.presetFamily) || 'story_movie_tv',
          legacyVideoBlockCount: Number(config.legacyVideoBlockCount ?? 0) || null,
          legacyDurationPerBlockSeconds: Number(config.legacyDurationPerBlockSeconds ?? 0) || null,
          maxTotalDurationSeconds: Number(config.maxTotalDurationSeconds ?? CINEMATIC_MAX_TOTAL_DURATION_SECONDS) || CINEMATIC_MAX_TOTAL_DURATION_SECONDS,
        }
        const fallbackScriptDoc = buildDeterministicCinematicScriptDoc(scriptInput)
        const model = outputWorkflowTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: 'You are a cinematic script author and shot director. Return strict JSON for a directed cinematic script only.',
          input: buildCinematicScriptAuthoringInstruction(scriptInput),
          text: {
            format: {
              type: 'json_schema',
              name: 'output_workflow_cinematic_script_authoring',
              schema: cinematicScriptAuthoringJsonSchemaForPreset(scriptInput.presetFamily),
              strict: true,
            },
          },
          maxOutputTokens: 9000,
          metadata: {
            graphcore_task: 'output_workflow_cinematic_script_authoring',
            graphcore_node_key: input.node.key,
          },
          timeoutMs: 180_000,
        })
        const normalizedScript = normalizeCinematicScriptAuthoring({
          value: response.response.ok ? parseJsonObject(response.outputText) : fallbackScriptDoc,
          fallback: fallbackScriptDoc,
          assetPack,
          presetFamily: scriptInput.presetFamily,
          maxTotalDurationSeconds: scriptInput.maxTotalDurationSeconds,
        })
        const { directorScriptDoc, cinematicScriptDoc } = normalizedScript
        if (cinematicScriptDoc.shots.length === 0) {
          throw new Error('Cinematic script authoring produced zero shots.')
        }
        const totalDurationSeconds = cinematicScriptDoc.shots.reduce((total, shot) => total + (Number(shot.durationSeconds ?? 0) || 0), 0)
        const text = JSON.stringify(directorScriptDoc, null, 2)
        const outputs = {
          directorScriptDoc,
          cinematicScriptDoc,
          scriptDoc: cinematicScriptDoc,
          script: directorScriptDoc,
          executionScriptDoc: cinematicScriptDoc,
          text,
          shotCount: cinematicScriptDoc.shots.length,
          totalDurationSeconds,
          scriptDurationSource: response.response.ok ? 'authored_script' : 'fallback_script',
          guidance,
          usage: response.response.ok ? asRecord(response.body?.usage) : {},
          providerStatus: response.response.ok ? response.status : 'fallback',
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: response.response.ok ? 'openai' : 'graphcore',
          model: response.response.ok ? model : 'deterministic-cinematic-script-v1',
          providerRequestId: response.response.ok ? readText(response.body?.id) || response.response.headers.get('x-request-id') || null : null,
        }
      }
      if (purpose === 'cinematic_sequence_plan') {
        const config = asRecord(input.node.config)
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const blockCount = Math.max(1, Math.min(6, Number(config.blockCount ?? 3) || 3))
        const durationPerBlockSeconds = Math.max(4, Math.min(15, Number(config.durationPerBlockSeconds ?? 8) || 8))
        const planInput = {
          context,
          assetPack,
          prompt: input.run.prompt,
          guidance,
          blockCount,
          durationPerBlockSeconds,
          aspectRatio: readText(config.aspectRatio) || '16:9',
          resolution: readText(config.resolution) || '720p',
          presetFamily: readText(config.presetFamily) || 'story_movie_tv',
        }
        const fallbackPlan = buildDeterministicCinematicSequencePlan(planInput)
        const model = outputWorkflowTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: 'You are a cinematic sequence planner. Return strict JSON for timed video block planning only.',
          input: buildCinematicSequencePlanInstruction(planInput),
          text: {
            format: {
              type: 'json_schema',
              name: 'output_workflow_cinematic_sequence_plan',
              schema: cinematicSequencePlanJsonSchema,
              strict: true,
            },
          },
          maxOutputTokens: 2800,
          metadata: {
            graphcore_task: 'output_workflow_cinematic_sequence_plan',
            graphcore_node_key: input.node.key,
          },
          timeoutMs: 120_000,
        })
        const sequencePlan = response.response.ok
          ? normalizeCinematicSequencePlan(parseJsonObject(response.outputText), fallbackPlan)
          : fallbackPlan
        const text = JSON.stringify(sequencePlan, null, 2)
        const outputs = {
          sequencePlan,
          sequence_plan: sequencePlan,
          blocks: sequencePlan.blocks,
          text,
          guidance,
          usage: response.response.ok ? asRecord(response.body?.usage) : {},
          providerStatus: response.response.ok ? response.status : 'fallback',
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: response.response.ok ? 'openai' : 'graphcore',
          model: response.response.ok ? model : 'deterministic-cinematic-sequence-plan-v1',
          providerRequestId: response.response.ok ? readText(response.body?.id) || response.response.headers.get('x-request-id') || null : null,
        }
      }
      if (purpose === 'cinematic_block_script') {
        const config = asRecord(input.node.config)
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const sequencePlan = readFirstUpstreamRecord(input.upstream, ['sequencePlan', 'sequence_plan'])
        const blockNumber = Math.max(1, Number(config.blockNumber ?? 1) || 1)
        const blockCount = Math.max(1, Number(config.blockCount ?? 1) || 1)
        const durationSeconds = Math.max(4, Math.min(15, Number(config.durationSeconds ?? 8) || 8))
        const scriptInput = {
          context,
          assetPack,
          sequencePlan,
          prompt: input.run.prompt,
          guidance,
          blockNumber,
          blockCount,
          durationSeconds,
          presetFamily: readText(config.presetFamily) || 'story_movie_tv',
        }
        const fallbackScript = buildDeterministicCinematicBlockScript(scriptInput)
        const model = outputWorkflowTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: 'You are a cinematic shot director. Return strict JSON for one timestamped video block script only.',
          input: buildCinematicBlockScriptInstruction(scriptInput),
          text: {
            format: {
              type: 'json_schema',
              name: 'output_workflow_cinematic_block_script',
              schema: cinematicBlockScriptJsonSchema,
              strict: true,
            },
          },
          maxOutputTokens: 4200,
          metadata: {
            graphcore_task: 'output_workflow_cinematic_block_script',
            graphcore_node_key: input.node.key,
          },
          timeoutMs: 120_000,
        })
        let blockScript = response.response.ok
          ? normalizeCinematicBlockScript(parseJsonObject(response.outputText), fallbackScript, durationSeconds)
          : fallbackScript
        let diagnostics = validateCinematicBlockScript(blockScript, durationSeconds)
        if (diagnostics.length > 0 && response.response.ok) {
          blockScript = fallbackScript
          diagnostics = validateCinematicBlockScript(blockScript, durationSeconds)
        }
        if (diagnostics.length > 0) {
          throw new Error(`Cinematic block script validation failed: ${diagnostics.slice(0, 8).join(' ')}`)
        }
        const markdown = cinematicBlockScriptMarkdown(blockScript)
        const outputs = {
          blockScript,
          block_script: blockScript,
          script: blockScript,
          markdown,
          text: markdown,
          blockNumber,
          durationSeconds,
          guidance,
          usage: response.response.ok ? asRecord(response.body?.usage) : {},
          providerStatus: response.response.ok ? response.status : 'fallback',
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: response.response.ok ? 'openai' : 'graphcore',
          model: response.response.ok ? model : 'deterministic-cinematic-block-script-v1',
          providerRequestId: response.response.ok ? readText(response.body?.id) || response.response.headers.get('x-request-id') || null : null,
        }
      }
      if (purpose === 'cinematic_atlas_prompt') {
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const model = outputWorkflowTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: 'You are a cinematic art director writing GPT Image 2 prompts. Return one prompt only.',
          input: buildCinematicAtlasPromptInstruction({ context, assetPack, prompt, guidance }),
          maxOutputTokens: 1200,
          metadata: {
            graphcore_task: 'output_workflow_cinematic_atlas_prompt',
            graphcore_node_key: input.node.key,
          },
          timeoutMs: 120_000,
        })
        if (!response.response.ok) {
          throw new Error(openAiErrorMessage(response, `OpenAI cinematic atlas prompt failed with status ${response.response.status}.`))
        }
        const atlasPrompt = response.outputText.trim()
        const outputs = { prompt: atlasPrompt, text: atlasPrompt, assetPack, guidance, usage: asRecord(response.body?.usage) }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'openai',
          model,
          providerRequestId: readText(response.body?.id) || response.response.headers.get('x-request-id') || null,
        }
      }
      if (purpose === 'comic_entity_selector') {
        const fallbackPack = buildDeterministicComicAssetPack(context)
        const model = outputWorkflowTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: 'You select visual comic references from canonical world context and return compact JSON only.',
          input: buildComicEntitySelectorInstruction({ context, prompt, guidance }),
          maxOutputTokens: 1800,
          metadata: {
            graphcore_task: 'output_workflow_comic_entity_selector',
            graphcore_node_key: input.node.key,
          },
          timeoutMs: 120_000,
        })
        const parsed = response.response.ok ? parseJsonObject(response.outputText) : {}
        const parsedEntities = Array.isArray(parsed.entities) && parsed.entities.length > 0
          ? parsed.entities.map(asRecord).map((entity) => ({
            key: readText(entity.key),
            name: readText(entity.name),
            type: readText(entity.type),
            role: readText(entity.role),
            summary: readText(entity.summary),
            visualDescription: readText(entity.visualDescription),
            visualTraits: readStringArray(entity.visualTraits),
            visualTraitMap: asRecord(entity.visualTraitMap),
            assetKeys: readStringArray(entity.assetKeys),
          })).filter((entity) => entity.key || entity.name)
          : []
        const selectedEntities = mergeComicSelectedEntitiesWithFallback(parsedEntities, fallbackPack)
        const assetPack = {
          entities: selectedEntities,
          missingReferenceEntityKeys: selectedEntities.filter((entity) => entity.assetKeys.length === 0).map((entity) => entity.key),
        }
        const outputs = {
          assetPack,
          asset_pack: assetPack,
          text: JSON.stringify(assetPack, null, 2),
          guidance,
          usage: asRecord(response.body?.usage),
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: response.response.ok ? 'openai' : 'graphcore',
          model: response.response.ok ? model : 'deterministic-comic-asset-pack-v1',
          providerRequestId: readText(response.body?.id) || response.response.headers.get('x-request-id') || null,
        }
      }
      if (purpose === 'comic_script') {
        const config = asRecord(input.node.config)
        const pageCount = Math.max(1, Math.min(12, Number(config.pageCount ?? 8)))
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const sceneScript = readFirstUpstreamRecord(input.upstream, ['sceneScript', 'scene_script'])
        const pagePlan = readFirstUpstreamRecord(input.upstream, ['pagePlan', 'page_plan'])
        const model = outputWorkflowComicTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: 'You are a professional comic writer and comics editor converting an approved scene treatment and page plan into final page/panel script JSON only. Never return outline placeholders.',
          input: buildComicScriptInstruction({ context, assetPack, sceneScript, pagePlan, prompt, guidance, pageCount }),
          text: {
            format: {
              type: 'json_schema',
              name: 'output_workflow_comic_script',
              schema: comicScriptJsonSchema,
              strict: true,
            },
          },
          maxOutputTokens: 9000,
          metadata: {
            graphcore_task: 'output_workflow_comic_script',
            graphcore_node_key: input.node.key,
          },
          timeoutMs: 240_000,
        })
        if (!response.response.ok) {
          throw new Error(openAiErrorMessage(response, `OpenAI comic script failed with status ${response.response.status}.`))
        }
        if (response.status === 'incomplete') {
          throw new Error('OpenAI comic script response was incomplete; rerun the Comic Script node.')
        }
        let script = normalizeComicScript(parseJsonObject(response.outputText), { context, pageCount, prompt })
        let diagnostics = validateComicScript(script, { pageCount })
        let repairResponse: OpenAiResponseResult | null = null
        const firstPassDiagnostics = diagnostics
        if (diagnostics.length > 0) {
          repairResponse = await runOpenAiResponses({
            model,
            instructions: 'You are a senior comic script doctor. Repair invalid comic JSON into a complete production script JSON object only.',
            input: buildComicScriptRepairInstruction({
              context,
              assetPack,
              sceneScript,
              pagePlan,
              invalidScript: script,
              diagnostics,
              prompt,
              guidance,
              pageCount,
            }),
            text: {
              format: {
                type: 'json_schema',
                name: 'output_workflow_comic_script_repair',
                schema: comicScriptJsonSchema,
                strict: true,
              },
            },
            maxOutputTokens: 10_000,
            metadata: {
              graphcore_task: 'output_workflow_comic_script_repair',
              graphcore_node_key: input.node.key,
            },
            timeoutMs: 240_000,
          })
          if (!repairResponse.response.ok) {
            throw new Error(openAiErrorMessage(repairResponse, `OpenAI comic script repair failed with status ${repairResponse.response.status}.`))
          }
          if (repairResponse.status === 'incomplete') {
            throw new Error('OpenAI comic script repair response was incomplete; rerun the Comic Script node.')
          }
          script = normalizeComicScript(parseJsonObject(repairResponse.outputText), { context, pageCount, prompt })
          diagnostics = validateComicScript(script, { pageCount })
        }
        if (diagnostics.length > 0) {
          throw new Error(`Comic script validation failed after repair: ${diagnostics.slice(0, 8).join(' ')}`)
        }
        const markdown = comicScriptMarkdown(script)
        const outputs = {
          script,
          pages: script.pages,
          markdown,
          text: markdown,
          guidance,
          repaired: repairResponse !== null,
          firstPassDiagnostics,
          usage: asRecord(repairResponse?.body.usage ?? response.body.usage),
          firstPassUsage: repairResponse ? asRecord(response.body.usage) : undefined,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'openai',
          model,
          providerRequestId: readText(response.body.id) || response.response.headers.get('x-request-id') || null,
        }
      }
      if (purpose === 'comic_scene_script') {
        const config = asRecord(input.node.config)
        const pageCount = Math.max(1, Math.min(12, Number(config.pageCount ?? 8)))
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const model = outputWorkflowComicTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: 'You are a senior comic adaptation writer. Return a rich structured dramatic scene script as JSON only, not final panel JSON.',
          input: buildComicSceneScriptInstruction({ context, assetPack, prompt, guidance, pageCount }),
          text: {
            format: {
              type: 'json_schema',
              name: 'output_workflow_comic_scene_script',
              schema: comicSceneScriptJsonSchema,
              strict: true,
            },
          },
          maxOutputTokens: 7000,
          metadata: {
            graphcore_task: 'output_workflow_comic_scene_script',
            graphcore_node_key: input.node.key,
          },
          timeoutMs: 240_000,
        })
        if (!response.response.ok) {
          throw new Error(openAiErrorMessage(response, `OpenAI comic scene script failed with status ${response.response.status}.`))
        }
        if (response.status === 'incomplete') {
          throw new Error('OpenAI comic scene script response was incomplete; rerun the Scene Script node.')
        }
        const sceneScript = parseJsonObject(response.outputText)
        const markdown = comicSceneScriptMarkdown(sceneScript)
        const outputs = {
          sceneScript,
          scene_script: sceneScript,
          markdown,
          text: markdown,
          assetPack,
          guidance,
          usage: asRecord(response.body.usage),
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'openai',
          model,
          providerRequestId: readText(response.body.id) || response.response.headers.get('x-request-id') || null,
        }
      }
      if (purpose === 'comic_page_plan') {
        const config = asRecord(input.node.config)
        const pageCount = Math.max(1, Math.min(12, Number(config.pageCount ?? 8)))
        const sceneScript = readFirstUpstreamRecord(input.upstream, ['sceneScript', 'scene_script'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const model = outputWorkflowComicTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: 'You are a senior comic editor planning page rhythm and compression. Return page-plan JSON only, not final panels.',
          input: buildComicPagePlanInstruction({ context, sceneScript, assetPack, prompt, guidance, pageCount }),
          text: {
            format: {
              type: 'json_schema',
              name: 'output_workflow_comic_page_plan',
              schema: comicPagePlanJsonSchema,
              strict: true,
            },
          },
          maxOutputTokens: 5200,
          metadata: {
            graphcore_task: 'output_workflow_comic_page_plan',
            graphcore_node_key: input.node.key,
          },
          timeoutMs: 180_000,
        })
        if (!response.response.ok) {
          throw new Error(openAiErrorMessage(response, `OpenAI comic page plan failed with status ${response.response.status}.`))
        }
        if (response.status === 'incomplete') {
          throw new Error('OpenAI comic page plan response was incomplete; rerun the Page Plan node.')
        }
        const pagePlan = parseJsonObject(response.outputText)
        const diagnostics = validateComicPagePlan(pagePlan, { pageCount })
        if (diagnostics.length > 0) {
          throw new Error(`Comic page plan validation failed: ${diagnostics.slice(0, 8).join(' ')}`)
        }
        const markdown = comicPagePlanMarkdown(pagePlan)
        const outputs = {
          pagePlan,
          page_plan: pagePlan,
          markdown,
          text: markdown,
          sceneScript,
          assetPack,
          guidance,
          usage: asRecord(response.body.usage),
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'openai',
          model,
          providerRequestId: readText(response.body.id) || response.response.headers.get('x-request-id') || null,
        }
      }
      if (purpose === 'comic_atlas_prompt') {
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const model = outputWorkflowTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: 'You are a comic art director writing GPT Image 2 prompts. Return one prompt only.',
          input: buildComicAtlasPromptInstruction({ context, assetPack, prompt, guidance }),
          maxOutputTokens: 1200,
          metadata: {
            graphcore_task: 'output_workflow_comic_atlas_prompt',
            graphcore_node_key: input.node.key,
          },
          timeoutMs: 120_000,
        })
        if (!response.response.ok) {
          throw new Error(openAiErrorMessage(response, `OpenAI comic atlas prompt failed with status ${response.response.status}.`))
        }
        const atlasPrompt = response.outputText.trim()
        const outputs = { prompt: atlasPrompt, text: atlasPrompt, assetPack, guidance, usage: asRecord(response.body.usage) }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'openai',
          model,
          providerRequestId: readText(response.body.id) || response.response.headers.get('x-request-id') || null,
        }
      }
      if (purpose === 'comic_page_prompt') {
        const config = asRecord(input.node.config)
        const pageNumber = Math.max(1, Number(config.pageNumber ?? 1))
        const pageCount = Math.max(1, Number(config.pageCount ?? 8))
        const script = readFirstUpstreamRecord(input.upstream, ['script'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const scriptPage = comicScriptPage(script, pageNumber)
        const pagePrompt = buildDeterministicComicPageImagePrompt({ script, assetPack, pageNumber, pageCount, prompt: input.run.prompt, guidance })
        const pageAssetPack = filterComicAssetPackForPage(assetPack, scriptPage, 6)
        const outputs = {
          prompt: pagePrompt,
          text: pagePrompt,
          pageNumber,
          pageCount,
          scriptPage,
          pageAssetPack,
          page_asset_pack: pageAssetPack,
          pageReferenceEntityKeys: readStringArray(pageAssetPack.pageReferenceEntityKeys),
          assetPack,
          guidance,
          deterministic: true,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-comic-page-prompt-v1',
          providerRequestId: null,
        }
      }
      if (purpose === 'ebook_cover_prompt') {
        const model = outputWorkflowTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: [
            'You are a senior publishing art director writing prompts for GPT Image 2.',
            'Return one concise, visual, production-ready image prompt for a finished ebook front cover.',
            'The prompt may request title typography in the image, but must not mention workflow internals.',
          ].join(' '),
          input: buildEbookCoverPromptInstruction({
            context,
            prompt: readText(input.node.inputs.prompt) || input.run.prompt,
            guidance,
          }),
          maxOutputTokens: 1100,
          metadata: {
            graphcore_task: 'output_workflow_ebook_cover_prompt',
            graphcore_node_key: input.node.key,
          },
          timeoutMs: 120_000,
        })
        if (!response.response.ok) {
          throw new Error(openAiErrorMessage(response, `OpenAI ebook cover prompt failed with status ${response.response.status}.`))
        }
        const coverPrompt = response.outputText.trim()
        if (!coverPrompt) throw new Error('OpenAI returned an empty ebook cover prompt.')
        const outputs = {
          prompt: coverPrompt,
          text: coverPrompt,
          guidance,
          usage: asRecord(response.body.usage),
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'openai',
          model,
          providerRequestId: readText(response.body.id) || response.response.headers.get('x-request-id') || null,
        }
      }
      if (purpose === 'chapter_section_plan') {
        const config = asRecord(input.node.config)
        const chapterNumber = Number(config.chapterNumber ?? 1)
        const sectionCount = Math.max(1, Number(config.sectionCount ?? 4))
        const sequenceUnitKey = readText(config.sequenceUnitKey)
        const sequenceUnitName = readText(config.sequenceUnitName)
        const chapterPlan = readFirstUpstreamArray(input.upstream, ['chapterPlan', 'plan'])
        const sections = buildChapterSectionPlan({
          context,
          chapterPlan: chapterPlan.length > 0 ? chapterPlan : buildChapterPlan(context, outlineFromContext(context)),
          chapterNumber,
          sequenceUnitKey,
          sequenceUnitName,
          sectionCount,
        })
        const text = sections.map((section) => `${section.chapterNumber}.${section.sectionNumber} ${section.title}`).join('\n')
        const outputs = { sections, sectionPlan: sections, text, chapterNumber, sequenceUnitKey, guidance }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-chapter-section-plan-v1' }
      }
      if (purpose === 'chapter_section_prose') {
        const config = asRecord(input.node.config)
        const chapterNumber = Number(config.chapterNumber ?? 1)
        const sectionNumber = Number(config.sectionNumber ?? 1)
        const sectionCount = Math.max(1, Number(config.sectionCount ?? 4))
        const sequenceUnitKey = readText(config.sequenceUnitKey)
        const sequenceUnitName = readText(config.sequenceUnitName)
        const chapterPlan = readFirstUpstreamArray(input.upstream, ['chapterPlan', 'plan'])
        const sectionPlan = readFirstUpstreamArray(input.upstream, ['sections', 'sectionPlan'])
        const prose = await generateBackgroundMarkdown({
          instructions: [
            'You are a professional longform book writer.',
            'Write restrained, specific, publishable prose from the supplied canon.',
            'Open scenes through character action, choice, dialogue, or immediate pressure rather than weather, skyline, mood, or decorative metaphor.',
            'Follow the requested style guidance, but never reveal the guidance or workflow.',
            'Return only the requested Markdown manuscript content.',
          ].join(' '),
          prompt: buildChapterSectionProsePrompt({
            context,
            prompt,
            chapterPlan: chapterPlan.length > 0 ? chapterPlan : buildChapterPlan(context, outlineFromContext(context)),
            sectionPlan: sectionPlan.length > 0 ? sectionPlan : buildChapterSectionPlan({
              context,
              chapterPlan: chapterPlan.length > 0 ? chapterPlan : buildChapterPlan(context, outlineFromContext(context)),
              chapterNumber,
              sequenceUnitKey,
              sequenceUnitName,
              sectionCount,
            }),
            chapterNumber,
            sectionNumber,
            sectionCount,
            sequenceUnitKey,
            sequenceUnitName,
            guidance,
          }),
          maxOutputTokens: 2400,
          metadata: {
            graphcore_task: 'output_workflow_chapter_section_prose',
            graphcore_node_key: input.node.key,
          },
          priorProviderRequestId: input.priorStep?.providerRequestId,
          shouldCancel: input.shouldCancel,
          onProgress: async (progress) => {
            await input.onProgress?.({
              provider: 'openai',
              model: outputWorkflowTextModel(),
              providerRequestId: progress.providerRequestId,
              metadata: {
                providerMode: progress.providerMode,
                providerStatus: progress.providerStatus,
                lastProviderPollAt: progress.lastProviderPollAt,
              },
            })
          },
        })
        const outputs = {
          markdown: prose.markdown,
          text: prose.markdown,
          chapterNumber,
          sectionNumber,
          sectionCount,
          sequenceUnitKey,
          sourceSequenceUnitKeys: sequenceUnitKey ? [sequenceUnitKey] : [],
          guidance,
          usage: prose.usage,
          timeoutMs: prose.timeoutMs,
          providerStatus: prose.providerStatus,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'openai',
          model: prose.model,
          providerRequestId: prose.providerRequestId,
        }
      }
      if (purpose === 'chapter_prose') {
        const config = asRecord(input.node.config)
        const chapterNumber = Number(config.chapterNumber ?? 1)
        const sequenceUnitKey = readText(config.sequenceUnitKey)
        const sequenceUnitName = readText(config.sequenceUnitName)
        const chapterPlan = readFirstUpstreamArray(input.upstream, ['chapterPlan', 'plan'])
        const prose = await generateBackgroundMarkdown({
          instructions: [
            'You are a professional longform book writer.',
            'Write restrained, specific, publishable prose from the supplied canon.',
            'Open scenes through character action, choice, dialogue, or immediate pressure rather than weather, skyline, mood, or decorative metaphor.',
            'Follow the requested style guidance, but never reveal the guidance or workflow.',
            'Return only the requested Markdown manuscript content.',
          ].join(' '),
          prompt: buildChapterProsePrompt({
            context,
            prompt,
            chapterPlan: chapterPlan.length > 0 ? chapterPlan : buildChapterPlan(context, outlineFromContext(context)),
            chapterNumber,
            sequenceUnitKey,
            sequenceUnitName,
            guidance,
          }),
          maxOutputTokens: 9000,
          metadata: {
            graphcore_task: 'output_workflow_chapter_prose',
            graphcore_node_key: input.node.key,
          },
          priorProviderRequestId: input.priorStep?.providerRequestId,
          shouldCancel: input.shouldCancel,
          onProgress: async (progress) => {
            await input.onProgress?.({
              provider: 'openai',
              model: outputWorkflowTextModel(),
              providerRequestId: progress.providerRequestId,
              metadata: {
                providerMode: progress.providerMode,
                providerStatus: progress.providerStatus,
                lastProviderPollAt: progress.lastProviderPollAt,
              },
            })
          },
        })
        const outputs = {
          markdown: prose.markdown,
          text: prose.markdown,
          chapterNumber,
          sequenceUnitKey,
          sourceSequenceUnitKeys: sequenceUnitKey ? [sequenceUnitKey] : [],
          guidance,
          usage: prose.usage,
          timeoutMs: prose.timeoutMs,
          providerStatus: prose.providerStatus,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'openai',
          model: prose.model,
          providerRequestId: prose.providerRequestId,
        }
      }
      if (purpose === 'front_back_matter') {
        const source = readFirstUpstreamText(input.upstream)
        const markdown = addFrontBackMatter(worldContextFromRunInput(input.run), editMarkdown(source))
        const outputs = { markdown, text: markdown, guidance }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-front-back-matter-v1' }
      }
      const source = readFirstUpstreamText(input.upstream)
      const markdown = editMarkdown(source)
      const outputs = { markdown, text: markdown, guidance }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-editor-v1' }
    }
    case 'image_generation': {
      const config = asRecord(input.node.config)
      const purpose = readText(config.purpose) || 'image_prompt'
      const role = readText(config.role) || purpose
      const guidance = resolveGuidanceForExecution({ run: input.run, node: input.node, upstream: input.upstream })
      const keyframePrompts = readFirstUpstreamArray(input.upstream, ['keyframePrompts', 'keyframe_prompts'])
      const keyframeIndex = Math.max(0, Math.min(2, Number(config.keyframeIndex ?? 0) || 0))
      const prompt = (purpose === 'cinematic_keyframe' || role === 'cinematic_keyframe'
        ? readText(keyframePrompts[keyframeIndex]?.prompt)
        : '')
        || readFirstUpstreamText(input.upstream, ['prompt'])
        || readFirstUpstreamText(input.upstream, ['text'])
        || readText(input.node.inputs.prompt)
        || input.run.prompt
      if (!prompt) throw new Error('Image generation node is missing a prompt.')
      const priorStepOutputs = asRecord(input.priorStep?.outputs)
      const priorImageOutput = asRecord(priorStepOutputs.image)
      const priorIsCinematicV2PanelPassthrough = role === 'cinematic_v2_shot_keyframe' && (
        readText(input.priorStep?.provider) === 'graphcore'
        || readText(priorImageOutput.generatedBy) === 'deterministic_panel_passthrough'
        || readText(priorImageOutput.keyframeMode) === 'storyboard_panel_crop'
      )
      if (!priorIsCinematicV2PanelPassthrough && hasStoredOutputs(priorStepOutputs) && input.priorStep?.outputHash && hasStoredOutputs(priorImageOutput)) {
        return {
          inputHash: input.priorStep.inputHash || input.inputHash,
          outputHash: input.priorStep.outputHash,
          outputs: priorStepOutputs,
          provider: input.priorStep.provider,
          model: input.priorStep.model,
          providerRequestId: input.priorStep.providerRequestId,
        }
      }
      const falApiKey = Deno.env.get('FAL_KEY')
      if (!falApiKey) throw new Error('FAL_KEY is not configured for the Fly output workflow worker.')
      const upstreamImages = readUpstreamImages(input.upstream)
      const assetPack = readFirstUpstreamRecord(input.upstream, ['pageAssetPack', 'page_asset_pack', 'assetPack', 'asset_pack'])
      const referenceLimit = referenceLimitForImageNode(config, role)
      const referenceImageUrls = [...new Set([
        ...(await Promise.all(upstreamImages.map((image) => imageReferenceToFalUrl(input.client, image)))),
        ...(await collectAssetPackReferenceUrls(input.client, input.run, assetPack, referenceLimit)),
      ].filter(Boolean))].slice(0, referenceLimit)
      const baseModel = outputWorkflowImageModel(config.model)
      const referenceModel = readText(config.referenceModel) || (baseModel.endsWith('/edit') ? baseModel : `${baseModel}/edit`)
      const model = referenceImageUrls.length > 0
        ? referenceModel
        : baseModel
      const quality = readText(config.quality)
        || Deno.env.get('OUTPUT_WORKFLOW_IMAGE_QUALITY')?.trim()
        || resolveOutputImageGenerationQuality({ role, purpose, prompt })
      const outputFormat = readText(config.outputFormat)
        || Deno.env.get('OUTPUT_WORKFLOW_IMAGE_OUTPUT_FORMAT')?.trim()
        || resolveOutputImageGenerationOutputFormat()
      const upstreamImageSize = readFirstUpstreamRecord(input.upstream, ['imageSize'])
      const imageSize = (purpose === 'cinematic_storyboard' || role === 'cinematic_storyboard' || purpose === 'cinematic_beat_sheet' || role === 'cinematic_beat_sheet') && Object.keys(upstreamImageSize).length > 0
        ? upstreamImageSize
        : config.imageSize ?? { width: 1792, height: 2688 }
      const includeProviderGuidance = purpose !== 'cinematic_storyboard'
        && role !== 'cinematic_storyboard'
        && purpose !== 'cinematic_beat_sheet'
        && role !== 'cinematic_beat_sheet'
        && purpose !== 'cinematic_keyframe'
        && role !== 'cinematic_keyframe'
      const providerPrompt = [
        prompt,
        includeProviderGuidance ? '' : '',
        includeProviderGuidance ? guidanceMarkdown(guidance) : '',
        '',
        'Provider requirements:',
        '- Generate one finished image only.',
        '- Keep the result visual and artifact-focused.',
        '- Do not include GraphCore, workflow, node, schema, or internal ID wording in visible text.',
      ].filter(Boolean).join('\n')

      const falResult = await waitForOutputFalImage({
        priorStep: input.priorStep,
        apiKey: falApiKey,
        model,
        prompt: providerPrompt,
        imageSize,
        quality,
        outputFormat,
        referenceImageUrls,
        shouldCancel: input.shouldCancel,
        onProgress: async (progress) => {
          await input.onProgress?.({
            provider: 'fal',
            model,
            providerRequestId: progress.providerRequestId,
            metadata: {
              providerMode: progress.providerMode,
              providerStatus: progress.providerStatus,
              lastProviderPollAt: progress.lastProviderPollAt,
              falRequestId: progress.providerRequestId,
              falStatusUrl: progress.statusUrl ?? null,
              falResponseUrl: progress.responseUrl ?? null,
              imageSize: normalizeImageSize(imageSize),
              quality,
              outputFormat,
              referenceImageCount: referenceImageUrls.length,
            },
          })
        },
      })
      const imageBytes = await downloadRemoteBytes(falResult.imageUrl)
      const assetKey = `output.${slugify(input.workflow.name)}.${input.run.id.slice(0, 8)}.${slugify(input.node.key)}`
      const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slugify(input.node.key)}.${outputFormat}`
      const mimeType = falResult.mimeType || `image/${outputFormat}`
      await uploadBytes(input.client, storagePath, imageBytes, mimeType)
      const planningOnly = config.planningOnly === true || config.planning_only === true
      const usedAsVideoReference = config.usedAsVideoReference === true || config.used_as_video_reference === true
      const packedReferenceEntities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
      const selectedReferenceVariants = packedReferenceEntities
        .map((entity) => ({
          entityKey: readText(entity.key),
          entityName: readText(entity.name),
          variantKey: readText(entity.selectedReferenceVariantKey) || 'default',
          label: readText(entity.selectedReferenceVariantLabel) || (readText(entity.selectedReferenceVariantKey) === 'default' ? 'Default' : readText(entity.selectedReferenceVariantKey)),
          summary: readText(entity.selectedReferenceVariantSummary),
          variantType: readText(entity.selectedReferenceVariantType),
          assetKey: readText(entity.primaryAssetKey) || readStringArray(entity.assetKeys)[0] || '',
          selectionReason: readText(entity.referenceSelectionReason),
        }))
        .filter((entry) => entry.entityKey || entry.entityName)
      const selectedReferenceVariantKeys = Object.fromEntries(selectedReferenceVariants
        .filter((entry) => entry.entityKey)
        .map((entry) => [entry.entityKey, entry.variantKey]))
      const selectedReferenceAssetKeys = selectedReferenceVariants.map((entry) => entry.assetKey).filter(Boolean)
      const referenceDiagnostics = [
        ...readStringArray(assetPack.referenceDiagnostics),
        ...packedReferenceEntities.flatMap((entity) => readStringArray(entity.referenceDiagnostics)),
      ].filter(Boolean)
      const imageOutput = {
        assetKey,
        storagePath,
        mimeType,
        width: falResult.width,
        height: falResult.height,
        prompt,
        providerPrompt,
        role,
        planningOnly,
        planning_only: planningOnly,
        usedAsVideoReference,
        used_as_video_reference: usedAsVideoReference,
        takeId: readText(config.takeId) || null,
        takeIndex: Number(config.takeIndex ?? -1) >= 0 ? Number(config.takeIndex) : null,
        storyboardGroupId: readText(config.storyboardGroupId) || readText(asRecord(config.storyboardGroup).id) || null,
        shotId: readText(config.shotId) || null,
        shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
        keyframeIndex: role === 'cinematic_keyframe' ? keyframeIndex : null,
        provider: 'fal',
        model,
        providerRequestId: falResult.requestId,
        referenceImageCount: referenceImageUrls.length,
        selectedReferenceVariants,
        selectedReferenceVariantKeys,
        selectedReferenceAssetKeys,
        referenceDiagnostics,
        sourceEntityKeys: input.run.input.sourceEntityKeys ?? [],
        sourceSequenceUnitKeys: input.run.input.sourceSequenceUnitKeys ?? [],
      }
      const metadata = {
        generatedBy: 'output_workflow',
        workflowId: input.workflow.id,
        workflowKey: input.workflow.key,
        runId: input.run.id,
        nodeId: input.node.id,
        nodeKey: input.node.key,
        preset: input.run.preset,
        provider: 'fal',
        model,
        baseModel,
        referenceModel,
        providerRequestId: falResult.requestId,
        providerMode: 'fal_queue',
        providerStatus: 'COMPLETED',
        falRequestId: falResult.requestId,
        falStatusUrl: falResult.statusUrl,
        falResponseUrl: falResult.responseUrl,
        falImageUrl: falResult.imageUrl,
        prompt,
        providerPrompt,
        role,
        purpose,
        planningOnly,
        planning_only: planningOnly,
        usedAsVideoReference,
        used_as_video_reference: usedAsVideoReference,
        takeId: readText(config.takeId) || null,
        takeIndex: Number(config.takeIndex ?? -1) >= 0 ? Number(config.takeIndex) : null,
        storyboardGroupId: readText(config.storyboardGroupId) || readText(asRecord(config.storyboardGroup).id) || null,
        shotId: readText(config.shotId) || null,
        shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
        keyframeIndex: role === 'cinematic_keyframe' ? keyframeIndex : null,
        pageNumber: Number(config.pageNumber ?? 0) || null,
        referenceImageCount: referenceImageUrls.length,
        selectedReferenceVariants,
        selectedReferenceVariantKeys,
        selectedReferenceAssetKeys,
        referenceDiagnostics,
        imageSize: normalizeImageSize(imageSize),
        quality,
        outputFormat,
        byteSize: imageBytes.byteLength,
        width: falResult.width,
        height: falResult.height,
        storageBucket: 'project-assets',
        storagePath,
        sourceEntityKeys: input.run.input.sourceEntityKeys ?? [],
        sourceSequenceUnitKeys: input.run.input.sourceSequenceUnitKeys ?? [],
        skillKeys: guidance.skillKeys,
        skillVersions: guidance.skillVersions,
        guidanceHash: guidance.guidanceHash,
        resolvedGuidancePreview: guidance.resolvedGuidancePreview,
      }
      const artifact = await registerImageArtifact({
        client: input.client,
        run: input.run,
        workflow: input.workflow,
        node: input.node,
        assetKey,
        storagePath,
        name: role === 'ebook_cover' ? `${titleFromContext(worldContextFromRunInput(input.run))} Cover` : input.node.label,
        summary: role === 'ebook_cover'
          ? 'Ebook cover image generated with GPT Image 2 from the world graph.'
          : role === 'comic_atlas' || role === 'cinematic_atlas'
            ? 'Reference atlas generated from selected world entities.'
            : role === 'cinematic_direction_sheet'
              ? 'Primary cinematic direction-sheet reference generated from the compiled take timeline, camera layout, floor map, lighting/mood, and continuity anchors.'
            : role === 'cinematic_beat_sheet'
              ? (usedAsVideoReference
                ? 'Primary cinematic storyboard-grid reference generated from the compiled take timeline.'
                : 'Planning-only cinematic beat sheet generated from the compiled take timeline.')
              : role === 'cinematic_keyframe'
                ? 'Clean cinematic keyframe generated as a Seedance visual reference.'
              : role === 'cinematic_v2_shot_keyframe'
                ? 'Enhanced Cinematics V2 shot keyframe generated from the cropped storyboard panel and shot-scoped references.'
            : role === 'comic_page'
              ? 'Comic page image generated from comic script and direct entity reference sheets.'
              : 'Generated image output from the workflow.',
        mimeType,
        metadata,
      })
      const outputs = {
        image: imageOutput,
        assetKey,
        storagePath,
        mimeType,
        width: falResult.width,
        height: falResult.height,
        prompt,
        providerPrompt,
        pageNumber: Number(config.pageNumber ?? 0) || null,
        role,
        planningOnly,
        planning_only: planningOnly,
        usedAsVideoReference,
        used_as_video_reference: usedAsVideoReference,
        takeId: readText(config.takeId) || null,
        takeIndex: Number(config.takeIndex ?? -1) >= 0 ? Number(config.takeIndex) : null,
        storyboardGroupId: readText(config.storyboardGroupId) || readText(asRecord(config.storyboardGroup).id) || null,
        shotId: readText(config.shotId) || null,
        shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
        keyframeIndex: role === 'cinematic_keyframe' ? keyframeIndex : null,
        selectedReferenceVariants,
        selectedReferenceVariantKeys,
        selectedReferenceAssetKeys,
        referenceDiagnostics,
        artifact,
        guidance,
      }
      return {
        inputHash: input.inputHash,
        outputHash: hashOutputWorkflowValue(outputs),
        outputs,
        provider: 'fal',
        model,
        providerRequestId: falResult.requestId,
      }
    }
    case 'video_generation': {
      const config = asRecord(input.node.config)
      const guidance = resolveGuidanceForExecution({ run: input.run, node: input.node, upstream: input.upstream })
      const prompt = readVideoPromptFromUpstream(input.upstream)
        || readText(input.node.inputs.prompt)
        || input.run.prompt
      if (!prompt) throw new Error('Video generation node is missing a prompt.')
      const priorStepOutputs = asRecord(input.priorStep?.outputs)
      const priorVideoOutput = asRecord(priorStepOutputs.video)
      const cinematicV2ApprovalMissing = isCinematicV2ProductionNode(config, input.node) && !cinematicVideoApprovedEnabled(input.run)
      const priorVideoWasSkipped = priorVideoOutput.skipped === true
        || priorStepOutputs.approvalRequired === true
        || priorStepOutputs.debugSkipVideoGeneration === true
        || readText(priorStepOutputs.skippedReason).length > 0
        || readText(priorVideoOutput.skippedReason).length > 0
      if (!cinematicV2ApprovalMissing && !priorVideoWasSkipped && hasStoredOutputs(priorStepOutputs) && input.priorStep?.outputHash && hasStoredOutputs(priorVideoOutput)) {
        return {
          inputHash: input.priorStep.inputHash || input.inputHash,
          outputHash: input.priorStep.outputHash,
          outputs: priorStepOutputs,
          provider: input.priorStep.provider,
          model: input.priorStep.model,
          providerRequestId: input.priorStep.providerRequestId,
        }
      }
      const resolution = readText(config.resolution) || '720p'
      const provider = resolveOutputVideoProvider(config)
      const model = readText(config.model)
        || (provider === 'muapi'
          ? Deno.env.get('OUTPUT_WORKFLOW_MUAPI_VIDEO_MODEL')?.trim()
          : Deno.env.get('OUTPUT_WORKFLOW_FAL_VIDEO_MODEL')?.trim())
        || Deno.env.get('OUTPUT_WORKFLOW_VIDEO_MODEL')?.trim()
        || (provider === 'muapi' ? DEFAULT_MUAPI_VIDEO_MODEL : resolveFalVideoModel(resolution))
      const durationSeconds = Math.max(4, Math.min(15, Number(config.durationSeconds ?? 8) || 8))
      const aspectRatio = readText(config.aspectRatio) || '16:9'
      const generateAudio = config.generateAudio !== false
      const syncMode = config.syncMode === true
      if (isCinematicV2ProductionNode(config, input.node) && !cinematicVideoApprovedEnabled(input.run)) {
        const outputs = {
          video: {
            skipped: true,
            approvalRequired: true,
            skippedReason: 'cinematic_video_approval_required',
            prompt,
            providerPrompt: prompt,
            provider: 'graphcore',
            model: 'cinematic-v2-video-approval-gate-v1',
            targetProvider: provider,
            targetModel: model,
            durationSeconds,
            aspectRatio,
            resolution,
            generateAudio,
            referenceImageCount: 0,
            referenceVideoCount: 0,
            referenceAudioCount: 0,
            referencePolicy: 'cinematic_video_approval_required',
            role: readText(config.role) || readText(config.purpose) || 'cinematic_v2_shot_video',
            shotId: readText(config.shotId) || null,
            shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
          },
          prompt,
          providerPrompt: prompt,
          durationSeconds,
          approvalRequired: true,
          skippedReason: 'cinematic_video_approval_required',
          guidance,
        }
        return {
          status: 'skipped',
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'cinematic-v2-video-approval-gate-v1',
        }
      }
      const debugSkipVideoGeneration = debugSkipVideoGenerationEnabled(config, input.run, input.node)
      if (debugSkipVideoGeneration) {
        const outputs = {
          video: {
            skipped: true,
            debugSkipVideoGeneration: true,
            skippedReason: 'debug_skip_video_generation',
            prompt,
            providerPrompt: prompt,
            provider: 'graphcore',
            model: 'debug-skip-video-generation-v1',
            targetProvider: provider,
            targetModel: model,
            durationSeconds,
            aspectRatio,
            resolution,
            generateAudio,
            referenceImageCount: 0,
            referenceVideoCount: 0,
            referenceAudioCount: 0,
            referencePolicy: 'debug_skip_video_generation',
            role: readText(config.role) || readText(config.purpose) || 'video',
            blockNumber: Number(config.blockNumber ?? 0) || null,
            shotId: readText(config.shotId) || null,
            shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
          },
          prompt,
          providerPrompt: prompt,
          durationSeconds,
          debugSkipVideoGeneration: true,
          skippedReason: 'debug_skip_video_generation',
          guidance,
        }
        return {
          status: 'skipped',
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'debug-skip-video-generation-v1',
        }
      }
      const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
      const cinematicReferenceMode = normalizeCinematicReferenceMode(config.cinematicReferenceMode)
      const upstreamImages = orderCinematicVideoReferenceImages(
        readUpstreamImages(input.upstream, ['image', 'coverImage', 'primaryReferenceImage', 'keyframe']),
        cinematicReferenceMode,
      )
      const directImageUrls = (await Promise.all(upstreamImages.map((image) => imageReferenceToFalUrl(input.client, image)))).filter(Boolean)
      const assetPackReferenceLimit = Math.max(1, Math.min(9, Number(config.assetPackReferenceLimit ?? 9) || 9))
      const totalReferenceImageLimit = Math.max(1, Math.min(9, directImageUrls.length + assetPackReferenceLimit))
      const assetPackImageUrls = await collectAssetPackReferenceUrls(input.client, input.run, assetPack, assetPackReferenceLimit)
      const referenceImageUrls = [...new Set([...directImageUrls, ...assetPackImageUrls])].slice(0, totalReferenceImageLimit)
      if (isCinematicV2ProductionNode(config, input.node) && cinematicReferenceMode === 'keyframes' && directImageUrls.length === 0) {
        throw new Error('Cinematics V2 video generation requires a shot keyframe image as @Image1. Run the shot keyframe node first, then rerun this video node.')
      }
      const upstreamVideos = readUpstreamVideos(input.upstream, ['videoReferences', 'referenceVideos'])
      const referenceVideoUrls = (await Promise.all(upstreamVideos.map((video) => imageReferenceToFalUrl(input.client, video))))
        .filter(Boolean)
        .slice(0, 3)
      const referenceAudioUrls: string[] = []
      const totalReferences = referenceImageUrls.length + referenceVideoUrls.length + referenceAudioUrls.length
      if (totalReferences > 12) {
        throw new Error('Seedance 2 Omni Reference supports at most 12 total reference files.')
      }
      const supportingReferenceText = (count: number) => count > 1
        ? ` @Image2 through @Image${count} are supporting entity, location, or prop references.`
        : ''
      const buildProviderPrompt = (imageUrls: string[], referencePolicy: string) => [
        prompt,
        imageUrls.length > 0
          ? (cinematicReferenceMode === 'keyframes'
            ? `Reference order: @Image1 is the shot keyframe and must drive the opening frame. In fast animatics this may be the cropped storyboard panel; in quality animatics it is the enhanced keyframe.${supportingReferenceText(imageUrls.length)}`
            : cinematicReferenceMode === 'shot_reference_sheet'
              ? `Reference order: @Image1 is the cinematic direction sheet timing/camera/spatial continuity board.${supportingReferenceText(imageUrls.length)}`
              : `Reference order: @Image1 is the storyboard beat-sheet timing/continuity board.${supportingReferenceText(imageUrls.length)}`)
          : '- No image references are attached; use the written continuity anchors in the prompt.',
        referenceVideoUrls.length > 0 ? `- Reference videos are ordered as @Video1 through @Video${referenceVideoUrls.length}.` : '',
        cinematicReferenceMode === 'keyframes'
          ? '- Do not copy reference-sheet layout, panel borders, or storyboard artifacts into the video.'
          : cinematicReferenceMode === 'shot_reference_sheet'
            ? '- A cinematic direction sheet is attached as the primary visual reference; follow its shot strip, camera layout, floor-map spatial logic, and hero frame while avoiding labels, map diagrams, arrows, UI, or sheet artifacts in the video.'
            : '- A beat sheet is attached as the primary visual reference; follow its panel order while avoiding caption-band, border, gutter, UI, or grid artifacts in the video.',
        referencePolicy !== (cinematicReferenceMode === 'keyframes' ? 'keyframes_and_asset_refs' : 'storyboard_and_asset_refs') ? `Reference fallback mode: ${referencePolicy}. Preserve character continuity from written entity descriptions instead of rejected identity images.` : '',
        `Technical target: one continuous ${durationSeconds}-second clip, ${aspectRatio}, ${resolution}.`,
        imageUrls.length > 0 ? 'Preserve identity, wardrobe, environment, and prop continuity from the references.' : 'Preserve identity, wardrobe, environment, and prop continuity from written descriptions.',
      ].filter(Boolean).join('\n')
      const primaryReferenceOnlyUrls = cinematicReferenceMode === 'keyframes'
        ? directImageUrls.slice(0, 1)
        : directImageUrls.slice(0, 1)
      const referenceAttempts = [
        { policy: cinematicReferenceMode === 'keyframes' ? 'keyframes_and_asset_refs' : 'storyboard_and_asset_refs', imageUrls: referenceImageUrls },
        { policy: cinematicReferenceMode === 'keyframes' ? 'keyframes_only' : 'storyboard_only', imageUrls: primaryReferenceOnlyUrls },
        { policy: 'text_only_no_image_refs', imageUrls: [] },
      ].filter((attempt, index, attempts) => (
        index === attempts.findIndex((candidate) => candidate.policy === attempt.policy
          && candidate.imageUrls.join('\n') === attempt.imageUrls.join('\n'))
      ))
      const priorFailedReferencePolicy = isFalReferencePolicyError(input.priorStep?.errorMessage)
      const startAttemptIndex = priorFailedReferencePolicy && referenceAttempts.length > 1 ? 1 : 0
      let providerResult: {
        requestId: string
        videoUrl: string
        mimeType: string
        fileName?: string
        fileSize: number | null
        resultBody: Record<string, unknown>
        statusUrl?: string | null
        responseUrl?: string | null
        resultUrl?: string | null
      } | null = null
      let providerPrompt = ''
      let usedReferenceImageUrls = referenceImageUrls
      let referencePolicy = cinematicReferenceMode === 'keyframes' ? 'keyframes_and_asset_refs' : 'storyboard_and_asset_refs'
      for (let attemptIndex = startAttemptIndex; attemptIndex < referenceAttempts.length; attemptIndex += 1) {
        const attempt = referenceAttempts[attemptIndex]
        providerPrompt = buildProviderPrompt(attempt.imageUrls, attempt.policy)
        usedReferenceImageUrls = attempt.imageUrls
        referencePolicy = attempt.policy
        try {
          if (provider === 'muapi') {
            const muapiApiKey = Deno.env.get('MUAPI_KEY')
            if (!muapiApiKey) throw new Error('MUAPI_KEY is not configured for the output workflow worker.')
            providerResult = await waitForOutputMuapiVideo({
              priorStep: attemptIndex === 0 && !priorFailedReferencePolicy ? input.priorStep : null,
              apiKey: muapiApiKey,
              model,
              prompt: providerPrompt,
              durationSeconds,
              aspectRatio,
              referenceImageUrls: attempt.imageUrls,
              referenceVideoUrls,
              referenceAudioUrls,
              shouldCancel: input.shouldCancel,
              onProgress: async (progress) => {
                await input.onProgress?.({
                  provider: 'muapi',
                  model,
                  providerRequestId: progress.providerRequestId,
                  metadata: {
                    providerMode: progress.providerMode,
                    providerStatus: progress.providerStatus,
                    lastProviderPollAt: progress.lastProviderPollAt,
                    muapiRequestId: progress.providerRequestId,
                    muapiResultUrl: progress.resultUrl,
                    muapiWebhookConfigured: progress.webhookConfigured ?? false,
                    durationSeconds,
                    aspectRatio,
                    resolution,
                    generateAudio,
                    referenceImageCount: attempt.imageUrls.length,
                    referenceVideoCount: referenceVideoUrls.length,
                    referenceAudioCount: referenceAudioUrls.length,
                    referencePolicy: attempt.policy,
                    cinematicReferenceMode,
                    providerPayload: buildMuapiVideoPayload({
                      prompt: providerPrompt,
                      durationSeconds,
                      aspectRatio,
                      referenceImageUrls: attempt.imageUrls,
                      referenceVideoUrls,
                      referenceAudioUrls,
                    }),
                  },
                })
              },
            })
          } else {
            const falApiKey = Deno.env.get('FAL_KEY')
            if (!falApiKey) throw new Error('FAL_KEY is not configured for the output workflow worker.')
            providerResult = await waitForOutputFalVideo({
              priorStep: attemptIndex === 0 && !priorFailedReferencePolicy ? input.priorStep : null,
              apiKey: falApiKey,
              model,
              prompt: providerPrompt,
              durationSeconds,
              aspectRatio,
              resolution,
              generateAudio,
              syncMode,
              referenceImageUrls: attempt.imageUrls,
              referenceVideoUrls,
              referenceAudioUrls,
              shouldCancel: input.shouldCancel,
              onProgress: async (progress) => {
                await input.onProgress?.({
                  provider: 'fal',
                  model,
                  providerRequestId: progress.providerRequestId,
                  metadata: {
                    providerMode: progress.providerMode,
                    providerStatus: progress.providerStatus,
                    lastProviderPollAt: progress.lastProviderPollAt,
                    falRequestId: progress.providerRequestId,
                    falStatusUrl: progress.statusUrl ?? null,
                    falResponseUrl: progress.responseUrl ?? null,
                    durationSeconds,
                    aspectRatio,
                    resolution,
                    generateAudio,
                    referenceImageCount: attempt.imageUrls.length,
                    referenceVideoCount: referenceVideoUrls.length,
                    referenceAudioCount: referenceAudioUrls.length,
                    referencePolicy: attempt.policy,
                    cinematicReferenceMode,
                  },
                })
              },
            })
          }
          break
        } catch (error) {
          if (isFalReferencePolicyError(error) && attemptIndex < referenceAttempts.length - 1) {
            continue
          }
          throw error
        }
      }
      if (!providerResult) throw new Error(`${provider === 'muapi' ? 'MUAPI' : 'Fal'} video generation did not return a result.`)
      const muapiWebhookConfigured = provider === 'muapi' ? Boolean(buildOutputWorkflowMuapiWebhookUrl()) : false
      const muapiProviderMode = muapiWebhookConfigured ? 'muapi_webhook_polling' : 'muapi_polling'
      const videoBytes = await downloadRemoteBytes(providerResult.videoUrl)
      const extension = providerResult.mimeType.includes('webm') ? 'webm' : 'mp4'
      const assetKey = `output.${slugify(input.workflow.name)}.${input.run.id.slice(0, 8)}.${slugify(input.node.key)}`
      const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slugify(input.node.key)}.${extension}`
      await uploadBytes(input.client, storagePath, videoBytes, providerResult.mimeType)
      const metadata = {
        generatedBy: 'output_workflow',
        workflowId: input.workflow.id,
        workflowKey: input.workflow.key,
        runId: input.run.id,
        nodeId: input.node.id,
        nodeKey: input.node.key,
        preset: input.run.preset,
        provider,
        model,
        providerRequestId: providerResult.requestId,
        providerMode: provider === 'muapi' ? muapiProviderMode : 'fal_queue',
        providerStatus: 'COMPLETED',
        falRequestId: provider === 'fal' ? providerResult.requestId : null,
        falStatusUrl: provider === 'fal' ? providerResult.statusUrl ?? null : null,
        falResponseUrl: provider === 'fal' ? providerResult.responseUrl ?? null : null,
        falVideoUrl: provider === 'fal' ? providerResult.videoUrl : null,
        muapiRequestId: provider === 'muapi' ? providerResult.requestId : null,
        muapiResultUrl: provider === 'muapi' ? providerResult.resultUrl ?? null : null,
        muapiVideoUrl: provider === 'muapi' ? providerResult.videoUrl : null,
        muapiWebhookConfigured,
        prompt,
        providerPrompt,
        durationSeconds,
        aspectRatio,
        resolution,
        generateAudio,
        referenceImageCount: usedReferenceImageUrls.length,
        referenceVideoCount: referenceVideoUrls.length,
        referenceAudioCount: referenceAudioUrls.length,
        referencePolicy,
        cinematicReferenceMode,
        shotId: readText(config.shotId) || null,
        shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
        providerPayload: provider === 'muapi' ? buildMuapiVideoPayload({
          prompt: providerPrompt,
          durationSeconds,
          aspectRatio,
          referenceImageUrls: usedReferenceImageUrls,
          referenceVideoUrls,
          referenceAudioUrls,
        }) : null,
        byteSize: videoBytes.byteLength,
        storageBucket: 'project-assets',
        storagePath,
        skillKeys: guidance.skillKeys,
        skillVersions: guidance.skillVersions,
        guidanceHash: guidance.guidanceHash,
      }
      const artifact = await registerVideoArtifact({
        client: input.client,
        run: input.run,
        workflow: input.workflow,
        node: input.node,
        assetKey,
        storagePath,
        name: input.node.label,
        summary: 'Generated video output from the workflow.',
        mimeType: providerResult.mimeType,
        metadata,
      })
      const outputs = {
        video: {
          assetKey,
          storagePath,
          mimeType: providerResult.mimeType,
          prompt,
          providerPrompt,
          provider,
          model,
          providerRequestId: providerResult.requestId,
          providerMode: provider === 'muapi' ? muapiProviderMode : 'fal_queue',
          durationSeconds,
          aspectRatio,
          resolution,
          generateAudio,
          referenceImageCount: usedReferenceImageUrls.length,
          referenceVideoCount: referenceVideoUrls.length,
          referenceAudioCount: referenceAudioUrls.length,
          referencePolicy,
          cinematicReferenceMode,
          muapiRequestId: provider === 'muapi' ? providerResult.requestId : null,
          muapiResultUrl: provider === 'muapi' ? providerResult.resultUrl ?? null : null,
          muapiWebhookConfigured,
          role: readText(config.role) || readText(config.purpose) || 'video',
          blockNumber: Number(config.blockNumber ?? 0) || null,
          shotId: readText(config.shotId) || null,
          shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
        },
        assetKey,
        storagePath,
        mimeType: providerResult.mimeType,
        prompt,
        providerPrompt,
        durationSeconds,
        artifact,
        guidance,
      }
      return {
        inputHash: input.inputHash,
        outputHash: hashOutputWorkflowValue(outputs),
        outputs,
        provider,
        model,
        providerRequestId: providerResult.requestId,
      }
    }
    case 'utility_transform': {
      const purpose = readText(asRecord(input.node.config).purpose)
      if (purpose === 'cinematic_v2_storyboard_group_plan' || purpose === 'cinematic_v3_storyboard_group_plan') {
        const config = asRecord(input.node.config)
        const shotPlan = cinematicV2ShotPlanSchema.parse(readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan']))
        const maxPanelsPerSheet = Math.max(1, Math.min(9, Number(config.maxPanelsPerSheet ?? 9) || 9))
        const maxDurationPerGroupSeconds = Math.max(1, Math.min(15, Number(config.maxDurationPerGroupSeconds ?? 15) || 15))
        const storyboardGroupPlan = purpose === 'cinematic_v3_storyboard_group_plan'
          ? buildCinematicV3StoryboardGroupPlan(shotPlan, {
            maxPanelsPerSheet,
            maxDurationPerGroupSeconds,
          })
          : buildCinematicV2StoryboardGroupPlan(shotPlan, maxPanelsPerSheet)
        const outputs = {
          storyboardGroupPlan,
          storyboard_group_plan: storyboardGroupPlan,
          groups: storyboardGroupPlan.groups,
          maxPanelsPerSheet: storyboardGroupPlan.maxPanelsPerSheet,
          maxDurationPerGroupSeconds: storyboardGroupPlan.maxDurationPerGroupSeconds,
          text: JSON.stringify(storyboardGroupPlan, null, 2),
          deterministic: true,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: purpose === 'cinematic_v3_storyboard_group_plan' ? 'deterministic-cinematic-v3-storyboard-group-plan-v2' : 'deterministic-cinematic-v2-storyboard-group-plan-v1' }
      }
      if (purpose === 'cinematic_v3_dynamic_storyboard_fanout') {
        const config = asRecord(input.node.config)
        const compileOutputs = {
          screenplayDraft: readFirstUpstreamRecord(input.upstream, ['screenplayDraft', 'screenplay_draft']),
          shotPlan: readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan']),
          storyboardGroupPlan: readFirstUpstreamRecord(input.upstream, ['storyboardGroupPlan', 'storyboard_group_plan']),
          cinematicReferencePlan: readFirstUpstreamRecord(input.upstream, ['cinematicReferencePlan', 'cinematic_reference_plan']),
          compileHash: readText(config.compileHash),
        }
        const result = await materializeDynamicCinematicV3StoryboardFanout({
          client: input.client,
          run: input.run,
          workflow: input.workflow,
          compileOutputs,
          config,
        })
        const outputs = {
          dynamicGraphExpanded: result.expanded,
          graphExpanded: result.expanded,
          compileHash: result.compileHash,
          dynamicShotCount: result.shotCount,
          storyboardSheetCount: result.storyboardSheetCount,
          text: result.expanded
            ? `Materialized ${result.storyboardSheetCount} Cinematics V3 storyboard sheet workflow(s) covering ${result.shotCount} shot(s).`
            : `Cinematics V3 storyboard workflows already materialized for ${result.shotCount} shots across ${result.storyboardSheetCount} sheet(s).`,
          deterministic: true,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-cinematic-v3-dynamic-storyboard-fanout-v1',
        }
      }
      if (purpose === 'cinematic_v2_dynamic_shot_fanout') {
        const config = asRecord(input.node.config)
        const compileOutputs = {
          screenplayDraft: readFirstUpstreamRecord(input.upstream, ['screenplayDraft', 'screenplay_draft']),
          parsedScript: readFirstUpstreamRecord(input.upstream, ['parsedScript', 'parsed_script']),
          sceneState: readFirstUpstreamRecord(input.upstream, ['sceneState', 'scene_state']),
          layoutPlan: readFirstUpstreamRecord(input.upstream, ['layoutPlan', 'layout_plan']),
          shotPlan: readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan']),
          storyboardGroupPlan: readFirstUpstreamRecord(input.upstream, ['storyboardGroupPlan', 'storyboard_group_plan']),
          cinematicReferencePlan: readFirstUpstreamRecord(input.upstream, ['cinematicReferencePlan', 'cinematic_reference_plan']),
          compileHash: readText(config.compileHash),
        }
        const result = await materializeDynamicCinematicV2ShotFanout({
          client: input.client,
          run: input.run,
          workflow: input.workflow,
          compileOutputs,
          config,
        })
        const outputs = {
          dynamicGraphExpanded: result.expanded,
          graphExpanded: result.expanded,
          compileHash: result.compileHash,
          dynamicShotCount: result.shotCount,
          storyboardSheetCount: result.storyboardSheetCount,
          text: result.expanded
            ? `Materialized ${result.shotCount} Cinematics V2 shot workflows across ${result.storyboardSheetCount} storyboard sheet(s).`
            : `Cinematics V2 shot workflows already materialized for ${result.shotCount} shots across ${result.storyboardSheetCount} storyboard sheet(s).`,
          deterministic: true,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-cinematic-v2-dynamic-shot-fanout-v1',
        }
      }
      if (purpose === 'cinematic_v2_storyboard_prompt' || purpose === 'cinematic_v3_storyboard_prompt') {
        const config = asRecord(input.node.config)
        const shotPlan = readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan'])
        const sceneState = readFirstUpstreamRecord(input.upstream, ['sceneState', 'scene_state'])
        const layoutPlan = readFirstUpstreamRecord(input.upstream, ['layoutPlan', 'layout_plan'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const aspectRatio = readText(config.aspectRatio) || '16:9'
        const configuredGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(config.storyboardGroup)
        const storyboardGroup = configuredGroup.success ? configuredGroup.data : null
        const layout = storyboardGroup
          ? { rows: storyboardGroup.rows, columns: storyboardGroup.columns, panelCount: storyboardGroup.panelCount }
          : buildCinematicV2StoryboardLayout(cinematicV2ShotPlanSchema.parse(shotPlan).shots.length)
        const imageSize = storyboardImageSizeForLayout({ columns: layout.columns, rows: layout.rows, aspectRatio })
        const prompt = purpose === 'cinematic_v3_storyboard_prompt'
          ? buildCinematicV3StoryboardPrompt({
            shotPlan,
            assetPack,
            storyboardGroup,
            aspectRatio,
            prompt: input.run.prompt,
          })
          : buildCinematicV2StoryboardPrompt({
            shotPlan,
            sceneState,
            layoutPlan,
            assetPack,
            storyboardGroup,
            aspectRatio,
            prompt: input.run.prompt,
          })
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const outputs = {
          prompt,
          text: prompt,
          shotPlan,
          sceneState,
          layoutPlan,
          assetPack,
          storyboardLayout: layout,
          storyboardGroup,
          storyboardGroupId: storyboardGroup?.id ?? null,
          gridColumns: layout.columns,
          gridRows: layout.rows,
          panelCount: layout.panelCount,
          gridCellCount: layout.rows * layout.columns,
          aspectRatio,
          imageSize,
          guidance,
          deterministic: true,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: purpose === 'cinematic_v3_storyboard_prompt' ? 'deterministic-cinematic-v3-storyboard-prompt-v1' : 'deterministic-cinematic-v2-storyboard-prompt-v1' }
      }
      if (purpose === 'cinematic_v2_shot_asset_pack') {
        const config = asRecord(input.node.config)
        const shotId = readText(config.shotId)
        const shotIndex = Number(config.shotIndex ?? 0) || 0
        const shotPlan = cinematicV2ShotPlanSchema.parse(readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan']))
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const referencePlan = readFirstUpstreamRecord(input.upstream, ['cinematicReferencePlan', 'cinematic_reference_plan'])
        const shot = shotPlan.shots.find((entry) => entry.id === shotId)
          ?? shotPlan.shots.find((entry) => entry.index === shotIndex)
          ?? shotPlan.shots[0]
        const shotAssetPack = buildCinematicV2ShotAssetPack({
          assetPack,
          referencePlan,
          shot,
          maxEntityCount: Math.max(1, Math.min(8, Number(config.maxEntityCount ?? 6) || 6)),
          maxAssetKeysPerEntity: Math.max(1, Math.min(3, Number(config.maxAssetKeysPerEntity ?? 2) || 2)),
        })
        const outputs = {
          assetPack: shotAssetPack,
          asset_pack: shotAssetPack,
          shot,
          shotReferenceKeys: readStringArray(shotAssetPack.shotReferenceKeys),
          selectedEntityCount: cinematicAssetPackEntityKeys(shotAssetPack).length,
          deterministic: true,
          text: JSON.stringify(shotAssetPack, null, 2),
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-cinematic-v2-shot-asset-pack-v1' }
      }
      if (purpose === 'cinematic_v2_panel_extract' || purpose === 'cinematic_v3_panel_extract') {
        const config = asRecord(input.node.config)
        const sheetImage = readFirstUpstreamImage(input.upstream, ['image'])
        const shotPlan = cinematicV2ShotPlanSchema.parse(readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan']))
        if (!sheetImage) throw new Error('Cinematics V2 panel extraction requires a storyboard sheet image.')
        const configuredLayout = cinematicV2StoryboardLayoutSchema.safeParse(config.storyboardLayout)
        const configuredGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(config.storyboardGroup)
        const storyboardGroup = configuredGroup.success ? configuredGroup.data : null
        const imageLayout = cinematicV2StoryboardLayoutSchema.safeParse(sheetImage.storyboardLayout ?? asRecord(sheetImage.metadata).storyboardLayout)
        const layout = configuredLayout.success
          ? configuredLayout.data
          : imageLayout.success
            ? imageLayout.data
            : buildCinematicV2StoryboardLayout(shotPlan.shots.length)
        const groupShotIds = new Set(storyboardGroup?.shotIds ?? [])
        const shotsToExtract = storyboardGroup
          ? shotPlan.shots.filter((shot) => groupShotIds.has(shot.id)).slice(0, layout.panelCount)
          : shotPlan.shots.slice(0, layout.panelCount)
        const sheetStoragePath = readText(sheetImage.storagePath) || readText(sheetImage.storage_path)
        const sheetBytes = sheetStoragePath
          ? await downloadProjectAssetBytes(input.client, sheetStoragePath)
          : await downloadRemoteBytes(readText(sheetImage.url))
        const sourceMimeType = readText(sheetImage.mimeType) || readText(sheetImage.mime_type) || 'image/webp'
        const tempDir = await Deno.makeTempDir({ prefix: 'graphcore-cinematic-panels-' })
        const panels: Record<string, unknown>[] = []
        try {
          const sourcePath = `${tempDir}/storyboard.${sourceMimeType.includes('png') ? 'png' : sourceMimeType.includes('jpeg') || sourceMimeType.includes('jpg') ? 'jpg' : 'webp'}`
          await Deno.writeFile(sourcePath, sheetBytes)
          const probedSize = await probeImageSize(sourcePath)
          const width = probedSize?.width
            || Number(sheetImage.width ?? 0)
            || Number(asRecord(config.imageSize).width ?? 0)
            || 1536
          const height = probedSize?.height
            || Number(sheetImage.height ?? 0)
            || Number(asRecord(config.imageSize).height ?? 0)
            || 864
          for (const [index, shot] of shotsToExtract.entries()) {
            const row = Math.floor(index / layout.columns)
            const column = index % layout.columns
            const cropX = Math.floor((width * column) / layout.columns)
            const cropY = Math.floor((height * row) / layout.rows)
            const nextX = Math.floor((width * (column + 1)) / layout.columns)
            const nextY = Math.floor((height * (row + 1)) / layout.rows)
            const panelWidth = Math.max(1, Math.min(width - cropX, nextX - cropX))
            const panelHeight = Math.max(1, Math.min(height - cropY, nextY - cropY))
            const outputPath = `${tempDir}/panel-${String(index + 1).padStart(3, '0')}.webp`
            const crop = await runFfmpeg(['-y', '-i', sourcePath, '-vf', `crop=${panelWidth}:${panelHeight}:${cropX}:${cropY}`, outputPath])
            if (!crop.ok) {
              throw new Error(`Cinematics V2 panel crop failed for shot ${shot.index}: ${crop.stderr.slice(0, 1200)}`)
            }
            const panelBytes = await Deno.readFile(outputPath)
            const assetKey = `output.${slugify(input.workflow.name)}.${input.run.id.slice(0, 8)}.cinematic-v2-panel-${slugify(shot.id)}`
            const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/cinematic-v2-panels/${slugify(storyboardGroup?.id || 'single')}/${slugify(shot.id)}.webp`
            const mimeType = 'image/webp'
            await uploadBytes(input.client, storagePath, panelBytes, mimeType)
            const metadata = {
              generatedBy: 'output_workflow',
              workflowId: input.workflow.id,
              workflowKey: input.workflow.key,
              runId: input.run.id,
              nodeId: input.node.id,
              nodeKey: input.node.key,
              preset: input.run.preset,
              role: purpose === 'cinematic_v3_panel_extract' ? 'cinematic_v3_storyboard_panel' : 'cinematic_v2_storyboard_panel',
              purpose,
              shotId: shot.id,
              shotIndex: shot.index,
              storyboardGroupId: storyboardGroup?.id ?? null,
              panelIndexInGroup: index,
              sourceSheetAssetKey: readText(sheetImage.assetKey),
              sourceSheetStoragePath: sheetStoragePath,
              row,
              column,
              crop: { x: cropX, y: cropY, width: panelWidth, height: panelHeight },
              cropRect: { x: cropX, y: cropY, width: panelWidth, height: panelHeight },
              cropMode: 'ffmpeg_crop',
              storageBucket: 'project-assets',
              storagePath,
            }
            const artifact = await registerImageArtifact({
              client: input.client,
              run: input.run,
              workflow: input.workflow,
              node: input.node,
              assetKey,
              storagePath,
              name: `Shot ${shot.index} Storyboard Panel`,
              summary: 'Extracted Cinematics V2 storyboard panel for one shot.',
              mimeType,
              metadata,
            })
            panels.push({
              id: `panel_${shot.id}`,
              shotId: shot.id,
              shotIndex: shot.index,
              storyboardGroupId: storyboardGroup?.id ?? null,
              panelIndexInGroup: index,
              assetKey,
              storagePath,
              mimeType,
              sourceSheetAssetKey: readText(sheetImage.assetKey) || null,
              row,
              column,
              cropRect: { x: cropX, y: cropY, width: panelWidth, height: panelHeight },
              width: panelWidth,
              height: panelHeight,
              role: purpose === 'cinematic_v3_panel_extract' ? 'cinematic_v3_storyboard_panel' : 'cinematic_v2_storyboard_panel',
              artifact,
            })
          }
        } finally {
          await Deno.remove(tempDir, { recursive: true }).catch(() => {})
        }
        const outputs = {
          panels,
          images: panels,
          image: panels[0] ?? null,
          storyboardLayout: layout,
          storyboardGroup,
          storyboardGroupId: storyboardGroup?.id ?? null,
          sourceImage: sheetImage,
          shotPlan,
          deterministic: true,
          text: `Extracted ${panels.length} Cinematics V2 storyboard panels.`,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'ffmpeg-cinematic-v2-panel-extract-v1' }
      }
      if (purpose === 'cinematic_v2_keyframe_prompt') {
        const config = asRecord(input.node.config)
        const shotId = readText(config.shotId)
        const shotIndex = Number(config.shotIndex ?? 0) || 0
        const shotPlan = cinematicV2ShotPlanSchema.parse(readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan']))
        const sceneState = readFirstUpstreamRecord(input.upstream, ['sceneState', 'scene_state'])
        const layoutPlan = readFirstUpstreamRecord(input.upstream, ['layoutPlan', 'layout_plan'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const panels = readFirstUpstreamArray(input.upstream, ['panels', 'images'])
        const shot = shotPlan.shots.find((entry) => entry.id === shotId) ?? shotPlan.shots.find((entry) => entry.index === shotIndex) ?? shotPlan.shots[0]
        const panel = panels.find((entry) => readText(entry.shotId) === shot.id) ?? panels.find((entry) => Number(entry.shotIndex ?? 0) === shot.index) ?? panels[0] ?? {}
        const prompt = buildCinematicV2KeyframePrompt({
          shot,
          sceneState,
          layoutPlan,
          panelAssetKey: readText(panel.assetKey),
          assetPack,
          aspectRatio: readText(config.aspectRatio) || '16:9',
          prompt: input.run.prompt,
        })
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const outputs = {
          prompt,
          text: prompt,
          shot,
          panel,
          image: panel,
          panelAssetKey: readText(panel.assetKey),
          sceneState,
          layoutPlan,
          assetPack,
          guidance,
          deterministic: true,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-cinematic-v2-keyframe-prompt-v1' }
      }
      if (purpose === 'cinematic_v2_shot_keyframe_passthrough') {
        const config = asRecord(input.node.config)
        const shotId = readText(config.shotId)
        const shotIndex = Number(config.shotIndex ?? 0) || 0
        const shotPlan = cinematicV2ShotPlanSchema.safeParse(readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan']))
        const shot = shotPlan.success
          ? shotPlan.data.shots.find((entry) => entry.id === shotId) ?? shotPlan.data.shots.find((entry) => entry.index === shotIndex) ?? null
          : null
        const panels = readFirstUpstreamArray(input.upstream, ['panels', 'images'])
        const selectedPanel = panels.find((entry) => readText(entry.shotId) === (shot?.id ?? shotId))
          ?? panels.find((entry) => Number(entry.shotIndex ?? 0) === (shot?.index ?? shotIndex))
          ?? null
        const selectedImage = selectedPanel ?? readFirstUpstreamImage(input.upstream, ['image'])
        if (!selectedImage) throw new Error('Cinematics V2 panel keyframe requires a cropped storyboard panel image.')
        const image = {
          ...selectedImage,
          role: 'cinematic_v2_shot_keyframe',
          sourceRole: readText(selectedImage.role) || readText(asRecord(selectedImage.metadata).role) || 'cinematic_v2_storyboard_panel',
          sourcePanelAssetKey: readText(selectedImage.assetKey),
          sourcePanelStoragePath: readText(selectedImage.storagePath) || readText(selectedImage.storage_path),
          shotId: readText(selectedImage.shotId) || shot?.id || shotId || null,
          shotIndex: Number(selectedImage.shotIndex ?? 0) || shot?.index || shotIndex || null,
          generatedBy: 'deterministic_panel_passthrough',
          keyframeMode: 'storyboard_panel_crop',
          planningOnly: true,
          planning_only: true,
        }
        const outputs = {
          image,
          keyframe: image,
          shot,
          deterministic: true,
          text: `Selected cropped storyboard panel as the shot ${image.shotIndex ?? ''} animatic keyframe.`.trim(),
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-cinematic-v2-panel-keyframe-v1' }
      }
      if (purpose === 'cinematic_v2_keyframe_qa') {
        const config = asRecord(input.node.config)
        const shotId = readText(config.shotId)
        const shotIndex = Number(config.shotIndex ?? 0) || 0
        const shotPlan = cinematicV2ShotPlanSchema.parse(readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan']))
        const shot = shotPlan.shots.find((entry) => entry.id === shotId) ?? shotPlan.shots.find((entry) => entry.index === shotIndex) ?? shotPlan.shots[0]
        const keyframeImage = readFirstUpstreamImage(input.upstream, ['image', 'keyframe'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const expectedEntityRefIds = [
          ...shot.visibleCharacterRefIds,
          ...shot.speakerRefIds,
          ...(shot.locationRefId ? [shot.locationRefId] : []),
          ...shot.propRefIds,
        ].filter((value, index, values) => value && values.indexOf(value) === index)
        const selectedEntityCount = cinematicAssetPackEntityKeys(assetPack).length
        const notes = [
          `Expected refs: ${expectedEntityRefIds.join(', ') || 'none'}.`,
          shot.performanceBeats.length > 0 ? `Expected acting direction: ${formatCinematicV2PerformanceDirection(shot)}.` : 'No structured acting direction was supplied for this shot.',
          `Shot-scoped asset pack refs: ${selectedEntityCount}.`,
          keyframeImage ? 'Keyframe media is present for advisory review.' : 'No keyframe media was found.',
        ]
        if (shot.visibleCharacterRefIds.length === 1) {
          notes.push('Single-character shot: review for duplicate subject or background lookalike risk.')
        }
        const issueCategories = [
          ...(!keyframeImage ? ['missing_keyframe' as const] : []),
          ...(shot.visibleCharacterRefIds.length === 1 ? ['duplicate_subject_risk' as const] : []),
          'storyboard_artifact_risk' as const,
          'prompt_adherence_risk' as const,
        ]
        const qa = cinematicV2KeyframeQaSchema.parse({
          shotId: shot.id,
          shotIndex: shot.index,
          status: keyframeImage ? 'needs_review' : 'missing_media',
          expectedEntityRefIds,
          expectedEntityCount: expectedEntityRefIds.length,
          issueCategories,
          notes,
        })
        const outputs = {
          keyframeQa: qa,
          keyframe_qa: qa,
          shot,
          image: keyframeImage ?? null,
          assetPack,
          deterministic: true,
          text: JSON.stringify(qa, null, 2),
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-cinematic-v2-keyframe-qa-v1' }
      }
      if (purpose === 'cinematic_v3_storyboard_group_video_prompt') {
        const config = asRecord(input.node.config)
        const shotPlan = cinematicV2ShotPlanSchema.parse(readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan']))
        const configuredGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(config.storyboardGroup)
        const storyboardGroup = configuredGroup.success ? configuredGroup.data : null
        const groupShotIds = new Set(storyboardGroup?.shotIds ?? [])
        const groupShots = storyboardGroup
          ? shotPlan.shots.filter((shot) => groupShotIds.has(shot.id))
          : shotPlan.shots
        const upstreamImages = readUpstreamImages(input.upstream)
        const actionLines = groupShots.map((shot) => [
          `Shot ${shot.index}: ${shot.action || shot.description || shot.title}.`,
          readText((shot as unknown as Record<string, unknown>).videoDirection) ? `Motion: ${readText((shot as unknown as Record<string, unknown>).videoDirection)}.` : '',
          `Camera: ${shot.camera.framing}; ${shot.camera.angle}; ${shot.camera.movement}.`,
        ].filter(Boolean).join(' ')).join('\n')
        const prompt = [
          `Animate storyboard group ${storyboardGroup?.index ?? 1} as one short cinematic clip using the supplied storyboard sheet as the primary visual reference.`,
          `Aspect ratio: ${readText(config.aspectRatio) || '16:9'}. Resolution: ${readText(config.resolution) || '720p'}.`,
          'Preserve the storyboard panel order, character identities, location, costume/variant references, lighting, and emotional continuity.',
          'Use subtle cinematic motion, readable acting, and clean transitions; do not add captions, subtitles, UI, watermarks, or new characters.',
          actionLines,
          `User brief: ${input.run.prompt}`,
        ].filter(Boolean).join('\n\n')
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const outputs = {
          prompt,
          text: prompt,
          shotPlan,
          storyboardGroup,
          primaryReferenceImage: upstreamImages[0] ?? null,
          referenceImageCount: upstreamImages.length,
          durationSeconds: Math.max(4, Math.min(15, Number(config.durationSeconds ?? 0) || Math.ceil(groupShots.length * 3))),
          guidance,
          deterministic: true,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-cinematic-v3-storyboard-group-video-prompt-v1' }
      }
      if (purpose === 'cinematic_v2_video_prompt') {
        const config = asRecord(input.node.config)
        const shotId = readText(config.shotId)
        const shotIndex = Number(config.shotIndex ?? 0) || 0
        const shotPlan = cinematicV2ShotPlanSchema.parse(readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan']))
        const sceneState = readFirstUpstreamRecord(input.upstream, ['sceneState', 'scene_state'])
        const layoutPlan = readFirstUpstreamRecord(input.upstream, ['layoutPlan', 'layout_plan'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const shot = shotPlan.shots.find((entry) => entry.id === shotId) ?? shotPlan.shots.find((entry) => entry.index === shotIndex) ?? shotPlan.shots[0]
        const upstreamImages = readUpstreamImages(input.upstream)
        const prompt = buildCinematicV2VideoPrompt({
          shot,
          sceneState,
          layoutPlan,
          assetPack,
          aspectRatio: readText(config.aspectRatio) || '16:9',
          resolution: readText(config.resolution) || '720p',
          prompt: input.run.prompt,
        })
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const outputs = {
          prompt,
          text: prompt,
          shot,
          sceneState,
          layoutPlan,
          assetPack,
          primaryReferenceImage: upstreamImages[0] ?? null,
          referenceImageCount: upstreamImages.length,
          durationSeconds: shot.providerDurationSeconds,
          guidance,
          deterministic: true,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-cinematic-v2-video-prompt-v1' }
      }
      if (purpose === 'cinematic_v3_timeline_assemble') {
        const config = asRecord(input.node.config)
        const shotPlan = readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan'])
        const videos = collectCinematicV2ShotVideos(input.upstream)
        const timeline = buildCinematicV2Timeline({ shotPlan, videos })
        if (!cinematicVideoApprovedEnabled(input.run)) {
          const video = {
            skipped: true,
            approvalRequired: true,
            skippedReason: 'cinematic_video_approval_required',
            provider: 'graphcore',
            model: 'cinematic-v3-timeline-approval-gate-v1',
            role: 'cinematic_v3_final_timeline',
            sourceVideoCount: videos.length,
          }
          const outputs = { video, videos, timeline, approvalRequired: true, skippedReason: 'cinematic_video_approval_required' }
          return { status: 'skipped', inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'cinematic-v3-timeline-approval-gate-v1' }
        }
        if (videos.length === 0 && (debugSkipVideoGenerationEnabled(config, input.run) || upstreamHasDebugSkippedVideo(input.upstream))) {
          const video = {
            skipped: true,
            debugSkipVideoGeneration: true,
            skippedReason: 'debug_skip_video_generation',
            provider: 'graphcore',
            model: 'debug-skip-cinematic-v3-timeline-v1',
            role: 'cinematic_v3_final_timeline',
            sourceVideoCount: 0,
          }
          const outputs = { video, videos: [], timeline, debugSkipVideoGeneration: true, skippedReason: 'debug_skip_video_generation' }
          return { status: 'skipped', inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'debug-skip-cinematic-v3-timeline-v1' }
        }
        const stitchResult = await stitchVideoBytes({ client: input.client, videos })
        const assetKey = `output.${slugify(input.workflow.name)}.${input.run.id.slice(0, 8)}.${slugify(input.node.key)}`
        const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slugify(input.node.key)}.mp4`
        await uploadBytes(input.client, storagePath, stitchResult.bytes, stitchResult.mimeType)
        const metadata = {
          generatedBy: 'output_workflow',
          workflowId: input.workflow.id,
          workflowKey: input.workflow.key,
          runId: input.run.id,
          nodeId: input.node.id,
          nodeKey: input.node.key,
          preset: input.run.preset,
          provider: 'graphcore',
          model: 'ffmpeg-cinematic-v3-timeline-assemble-v1',
          role: 'cinematic_v3_final_timeline',
          stitchMode: stitchResult.mode,
          timeline,
          sourceVideoAssetKeys: videos.map((video) => readText(video.assetKey)).filter(Boolean),
          sourceVideoStoragePaths: videos.map((video) => readText(video.storagePath) || readText(video.storage_path)).filter(Boolean),
          byteSize: stitchResult.bytes.byteLength,
          storageBucket: 'project-assets',
          storagePath,
        }
        const artifact = await registerVideoArtifact({
          client: input.client,
          run: input.run,
          workflow: input.workflow,
          node: input.node,
          assetKey,
          storagePath,
          name: input.node.label,
          summary: 'Final Cinematics V3 storyboard-group sequence video.',
          mimeType: stitchResult.mimeType,
          metadata,
        })
        const video = {
          assetKey,
          storagePath,
          mimeType: stitchResult.mimeType,
          provider: 'graphcore',
          model: 'ffmpeg-cinematic-v3-timeline-assemble-v1',
          role: 'cinematic_v3_final_timeline',
          sourceVideoCount: videos.length,
          stitchMode: stitchResult.mode,
        }
        const outputs = { video, videos, timeline, artifact, assetKey, storagePath, mimeType: stitchResult.mimeType }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'ffmpeg-cinematic-v3-timeline-assemble-v1' }
      }
      if (purpose === 'cinematic_v2_timeline_assemble') {
        const config = asRecord(input.node.config)
        const shotPlan = readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan'])
        const videos = collectCinematicV2ShotVideos(input.upstream)
        const timeline = buildCinematicV2Timeline({ shotPlan, videos })
        if (!cinematicVideoApprovedEnabled(input.run)) {
          const video = {
            skipped: true,
            approvalRequired: true,
            skippedReason: 'cinematic_video_approval_required',
            provider: 'graphcore',
            model: 'cinematic-v2-timeline-approval-gate-v1',
            role: 'cinematic_v2_final_timeline',
            sourceVideoCount: videos.length,
          }
          const outputs = { video, videos, timeline, approvalRequired: true, skippedReason: 'cinematic_video_approval_required' }
          return { status: 'skipped', inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'cinematic-v2-timeline-approval-gate-v1' }
        }
        if (videos.length === 0 && (debugSkipVideoGenerationEnabled(config, input.run) || upstreamHasDebugSkippedVideo(input.upstream))) {
          const video = {
            skipped: true,
            debugSkipVideoGeneration: true,
            skippedReason: 'debug_skip_video_generation',
            provider: 'graphcore',
            model: 'debug-skip-cinematic-v2-timeline-v1',
            role: 'cinematic_v2_final_timeline',
            sourceVideoCount: 0,
          }
          const outputs = { video, videos: [], timeline, debugSkipVideoGeneration: true, skippedReason: 'debug_skip_video_generation' }
          return { status: 'skipped', inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'debug-skip-cinematic-v2-timeline-v1' }
        }
        const stitchResult = await stitchVideoBytes({ client: input.client, videos })
        const assetKey = `output.${slugify(input.workflow.name)}.${input.run.id.slice(0, 8)}.${slugify(input.node.key)}`
        const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slugify(input.node.key)}.mp4`
        await uploadBytes(input.client, storagePath, stitchResult.bytes, stitchResult.mimeType)
        const metadata = {
          generatedBy: 'output_workflow',
          workflowId: input.workflow.id,
          workflowKey: input.workflow.key,
          runId: input.run.id,
          nodeId: input.node.id,
          nodeKey: input.node.key,
          preset: input.run.preset,
          provider: 'graphcore',
          model: 'ffmpeg-cinematic-v2-timeline-assemble-v1',
          role: 'cinematic_v2_final_timeline',
          stitchMode: stitchResult.mode,
          timeline,
          sourceVideoAssetKeys: videos.map((video) => readText(video.assetKey)).filter(Boolean),
          sourceVideoStoragePaths: videos.map((video) => readText(video.storagePath) || readText(video.storage_path)).filter(Boolean),
          byteSize: stitchResult.bytes.byteLength,
          storageBucket: 'project-assets',
          storagePath,
        }
        const artifact = await registerVideoArtifact({
          client: input.client,
          run: input.run,
          workflow: input.workflow,
          node: input.node,
          assetKey,
          storagePath,
          name: input.node.label,
          summary: 'Final Cinematics V2 shot-orchestrated sequence video.',
          mimeType: stitchResult.mimeType,
          metadata,
        })
        const video = {
          assetKey,
          storagePath,
          mimeType: stitchResult.mimeType,
          provider: 'graphcore',
          model: 'ffmpeg-cinematic-v2-timeline-assemble-v1',
          role: 'cinematic_v2_final_timeline',
          sourceVideoCount: videos.length,
          stitchMode: stitchResult.mode,
        }
        const outputs = { video, videos, timeline, artifact, assetKey, storagePath, mimeType: stitchResult.mimeType }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'ffmpeg-cinematic-v2-timeline-assemble-v1' }
      }
      if (purpose === 'cinematic_sequence_compile') {
        const config = asRecord(input.node.config)
        const scriptDoc = readFirstUpstreamRecord(input.upstream, ['cinematicScriptDoc', 'scriptDoc'])
        const directorScriptDoc = readFirstUpstreamRecord(input.upstream, ['directorScriptDoc', 'script'])
        if (Object.keys(scriptDoc).length === 0) {
          throw new Error('Cinematic sequence compile requires an authored cinematic script document.')
        }
        const compiled = compileCinematicScriptDocForOutput({
          scriptDoc,
          directorScriptDoc,
          maxDynamicTakes: Number(config.maxDynamicTakes ?? 6) || 6,
          maxTotalDurationSeconds: Number(config.maxTotalDurationSeconds ?? CINEMATIC_MAX_TOTAL_DURATION_SECONDS) || CINEMATIC_MAX_TOTAL_DURATION_SECONDS,
        })
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const outputs = {
          ...compiled,
          guidance,
          text: JSON.stringify({
            dynamicTakeCount: compiled.dynamicTakeCount,
            totalDurationSeconds: compiled.totalDurationSeconds,
            diagnostics: compiled.diagnostics,
          }, null, 2),
          deterministic: true,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-cinematic-sequence-compile-v1',
        }
      }
      if (purpose === 'cinematic_dynamic_take_fanout') {
        const config = asRecord(input.node.config)
        const compileOutputs = Object.values(input.upstream).find((outputs) => {
          const record = asRecord(outputs)
          return Array.isArray(record.takePlan) && Object.keys(asRecord(record.compiledCinematicSequence)).length > 0
        })
        if (!compileOutputs) {
          throw new Error('Cinematic dynamic fanout requires compiled take outputs.')
        }
        const result = await materializeDynamicCinematicTakeFanout({
          client: input.client,
          workflow: input.workflow,
          compileOutputs: asRecord(compileOutputs),
          config,
        })
        const outputs = {
          dynamicGraphExpanded: result.expanded,
          graphExpanded: result.expanded,
          compileHash: result.compileHash,
          dynamicTakeCount: result.takeCount,
          text: result.expanded
            ? `Materialized ${result.takeCount} cinematic take workflows.`
            : `Cinematic take workflows already materialized for ${result.takeCount} takes.`,
          deterministic: true,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-cinematic-dynamic-take-fanout-v1',
        }
      }
      if (purpose === 'cinematic_beat_sheet_prompt') {
        const config = asRecord(input.node.config)
        let blockScript = readFirstUpstreamRecord(input.upstream, ['blockScript', 'block_script', 'script'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        if (!Array.isArray(blockScript.shots) || blockScript.shots.length === 0) {
          const compileOutputs = Object.values(input.upstream).find((outputs) => {
            const record = asRecord(outputs)
            return Array.isArray(record.takePlan) && Object.keys(asRecord(record.compiledCinematicSequence)).length > 0
          })
          if (!compileOutputs) throw new Error('Cinematic beat sheet prompt requires a block script or compiled take output.')
          blockScript = buildTakeBlockScriptFromCompiledSequence({
            compiledCinematicSequence: asRecord(asRecord(compileOutputs).compiledCinematicSequence),
            takePlan: Array.isArray(asRecord(compileOutputs).takePlan) ? asRecord(compileOutputs).takePlan.map(asRecord) : [],
            takeId: readText(config.takeId),
            takeIndex: Number(config.takeIndex ?? 0) || 0,
            assetPack,
          })
        }
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const aspectRatio = readText(config.aspectRatio) || readText(blockScript.aspectRatio) || '16:9'
        const cinematicReferenceMode = normalizeCinematicReferenceMode(config.cinematicReferenceMode)
        const storyboardStylePolicy = resolveCinematicStoryboardStylePolicy(config, input.run)
        const beatSheet = cinematicReferenceMode === 'shot_reference_sheet'
          ? buildCinematicDirectionSheetPrompt({
            blockScript,
            assetPack,
            aspectRatio,
            prompt: input.run.prompt,
            guidance,
            debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode,
            cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt,
          })
          : buildCinematicBeatSheetPrompt({
            blockScript,
            assetPack,
            aspectRatio,
            prompt: input.run.prompt,
            guidance,
            debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode,
            cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt,
          })
        const outputs = {
          prompt: beatSheet.prompt,
          text: beatSheet.prompt,
          blockScript,
          assetPack,
          beatSheetPlan: beatSheet.beatSheetPlan,
          directionSheetPlan: 'directionSheetPlan' in beatSheet ? beatSheet.directionSheetPlan : null,
          planningOnly: true,
          planning_only: true,
          referenceSheetKind: cinematicReferenceMode === 'shot_reference_sheet' ? 'shot_reference_sheet' : 'storyboard_sheet',
          aspectRatio,
          panelAspectRatio: aspectRatio,
          imageSize: beatSheet.imageSize,
          cinematicReferenceMode,
          debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode,
          cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt,
          storyboardStyleSafeModeLabel: storyboardStylePolicy.label,
          diagnostics: [
            `Storyboard style safe mode: ${storyboardStylePolicy.label}.`,
            cinematicReferenceMode === 'shot_reference_sheet'
              ? 'Cinematic direction sheet reference mode: @Image1 will carry shot strip, floor map, camera layout, lighting/mood, hero frame, and continuity anchors.'
              : 'Storyboard-grid reference mode: @Image1 will carry timed beat-sheet panels.',
          ],
          guidance,
          deterministic: true,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-cinematic-beat-sheet-prompt-v1',
        }
      }
      if (purpose === 'cinematic_keyframe_prompt_pack') {
        const config = asRecord(input.node.config)
        let blockScript = readFirstUpstreamRecord(input.upstream, ['blockScript', 'block_script', 'script'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        if (!Array.isArray(blockScript.shots) || blockScript.shots.length === 0) {
          const compileOutputs = Object.values(input.upstream).find((outputs) => {
            const record = asRecord(outputs)
            return Array.isArray(record.takePlan) && Object.keys(asRecord(record.compiledCinematicSequence)).length > 0
          })
          if (!compileOutputs) throw new Error('Cinematic keyframe prompt pack requires a block script or compiled take output.')
          blockScript = buildTakeBlockScriptFromCompiledSequence({
            compiledCinematicSequence: asRecord(asRecord(compileOutputs).compiledCinematicSequence),
            takePlan: Array.isArray(asRecord(compileOutputs).takePlan) ? asRecord(compileOutputs).takePlan.map(asRecord) : [],
            takeId: readText(config.takeId),
            takeIndex: Number(config.takeIndex ?? 0) || 0,
            assetPack,
          })
        }
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const aspectRatio = readText(config.aspectRatio) || readText(blockScript.aspectRatio) || '16:9'
        const keyframes = buildCinematicKeyframePromptPack({
          blockScript,
          assetPack,
          aspectRatio,
          prompt: input.run.prompt,
          debugCinematicStoryboardStyleSafeMode: resolveCinematicStoryboardStylePolicy(config, input.run).safeMode,
          cinematicStoryboardStyleOverride: resolveCinematicStoryboardStylePolicy(config, input.run).stylePrompt,
        })
        const outputs = {
          prompt: keyframes.keyframePrompts[0]?.prompt ?? '',
          text: keyframes.keyframePrompts.map((entry) => `${entry.referenceName} ${entry.label}\n${entry.prompt}`).join('\n\n'),
          blockScript,
          assetPack,
          keyframePlan: keyframes.keyframePlan,
          keyframePrompts: keyframes.keyframePrompts,
          aspectRatio,
          imageSize: keyframeImageSizeForAspectRatio(aspectRatio),
          guidance,
          deterministic: true,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-cinematic-keyframe-prompt-pack-v1',
        }
      }
      if (purpose === 'cinematic_storyboard_prompt') {
        const config = asRecord(input.node.config)
        let blockScript = readFirstUpstreamRecord(input.upstream, ['blockScript', 'block_script', 'script'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        if (!Array.isArray(blockScript.shots) || blockScript.shots.length === 0) {
          const compileOutputs = Object.values(input.upstream).find((outputs) => {
            const record = asRecord(outputs)
            return Array.isArray(record.takePlan) && Object.keys(asRecord(record.compiledCinematicSequence)).length > 0
          })
          if (!compileOutputs) throw new Error('Cinematic storyboard prompt requires a block script or compiled take output.')
          blockScript = buildTakeBlockScriptFromCompiledSequence({
            compiledCinematicSequence: asRecord(asRecord(compileOutputs).compiledCinematicSequence),
            takePlan: Array.isArray(asRecord(compileOutputs).takePlan) ? asRecord(compileOutputs).takePlan.map(asRecord) : [],
            takeId: readText(config.takeId),
            takeIndex: Number(config.takeIndex ?? 0) || 0,
            assetPack,
          })
        }
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const shots = Array.isArray(blockScript.shots) ? blockScript.shots.map(asRecord) : []
        const aspectRatio = readText(config.aspectRatio) || readText(blockScript.aspectRatio) || '16:9'
        const layout = storyboardLayoutForShotCount(shots.length || Number(config.panelCount ?? 0) || 1)
        const imageSize = storyboardImageSizeForLayout({
          columns: layout.columns,
          rows: layout.rows,
          aspectRatio,
        })
        const storyboardPrompt = buildCinematicStoryboardPrompt({
          blockScript,
          assetPack,
          aspectRatio,
          prompt: input.run.prompt,
          guidance,
          debugCinematicStoryboardStyleSafeMode: resolveCinematicStoryboardStylePolicy(config, input.run).safeMode,
          cinematicStoryboardStyleOverride: resolveCinematicStoryboardStylePolicy(config, input.run).stylePrompt,
        })
        const outputs = {
          prompt: storyboardPrompt,
          text: storyboardPrompt,
          blockScript,
          assetPack,
          storyboardLayout: layout,
          gridDimension: Math.max(layout.columns, layout.rows),
          gridColumns: layout.columns,
          gridRows: layout.rows,
          panelCount: layout.panelCount,
          aspectRatio,
          panelAspectRatio: aspectRatio,
          imageSize,
          guidance,
          deterministic: true,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-cinematic-storyboard-prompt-v2',
        }
      }
      if (purpose === 'cinematic_video_prompt') {
        const config = asRecord(input.node.config)
        let blockScript = readFirstUpstreamRecord(input.upstream, ['blockScript', 'block_script', 'script'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        if (!Array.isArray(blockScript.shots) || blockScript.shots.length === 0) {
          const compileOutputs = Object.values(input.upstream).find((outputs) => {
            const record = asRecord(outputs)
            return Array.isArray(record.takePlan) && Object.keys(asRecord(record.compiledCinematicSequence)).length > 0
          })
          if (!compileOutputs) throw new Error('Cinematic video prompt requires a block script or compiled take output.')
          blockScript = buildTakeBlockScriptFromCompiledSequence({
            compiledCinematicSequence: asRecord(asRecord(compileOutputs).compiledCinematicSequence),
            takePlan: Array.isArray(asRecord(compileOutputs).takePlan) ? asRecord(compileOutputs).takePlan.map(asRecord) : [],
            takeId: readText(config.takeId),
            takeIndex: Number(config.takeIndex ?? 0) || 0,
            assetPack,
          })
        }
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const cinematicReferenceMode = normalizeCinematicReferenceMode(config.cinematicReferenceMode)
        const storyboardStylePolicy = resolveCinematicStoryboardStylePolicy(config, input.run)
        const upstreamImages = orderCinematicVideoReferenceImages(readUpstreamImages(input.upstream), cinematicReferenceMode)
        const referenceImageCount = Math.min(9, upstreamImages.length)
        const durationSeconds = Math.max(4, Math.min(15, Number(config.durationSeconds ?? blockScript.durationSeconds ?? 8) || 8))
        const videoPrompt = buildCinematicVideoPrompt({
          blockScript,
          assetPack,
          prompt: input.run.prompt,
          guidance,
          durationSeconds,
          aspectRatio: readText(config.aspectRatio) || '16:9',
          resolution: readText(config.resolution) || '720p',
          generateAudio: config.generateAudio !== false,
          referenceImageCount,
          cinematicReferenceMode,
          debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode,
          cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt,
        })
        const outputs = {
          prompt: videoPrompt,
          text: videoPrompt,
          blockScript,
          assetPack,
          durationSeconds,
          referenceImageCount,
          cinematicReferenceMode,
          debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode,
          cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt,
          targetVideoStyle: inferCinematicTargetVideoStyle({
            prompt: input.run.prompt,
            truthSourceMode: readText(blockScript.truthSourceMode) || 'CINEMATIC SETUP',
            blockScript,
          }),
          diagnostics: [`Storyboard style safe mode: ${storyboardStylePolicy.label}.`],
          guidance,
          deterministic: true,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-cinematic-video-prompt-v1',
        }
      }
      if (purpose === 'video_stitch') {
        const config = asRecord(input.node.config)
        const videos = collectCinematicBlockVideos(input.upstream)
        if (videos.length === 0 && (debugSkipVideoGenerationEnabled(config, input.run) || upstreamHasDebugSkippedVideo(input.upstream))) {
          const video = {
            skipped: true,
            debugSkipVideoGeneration: true,
            skippedReason: 'debug_skip_video_generation',
            provider: 'graphcore',
            model: 'debug-skip-video-stitch-v1',
            role: 'cinematic_sequence_final',
            sourceVideoCount: 0,
          }
          const outputs = {
            video,
            videos: [],
            debugSkipVideoGeneration: true,
            skippedReason: 'debug_skip_video_generation',
          }
          return {
            status: 'skipped',
            inputHash: input.inputHash,
            outputHash: hashOutputWorkflowValue(outputs),
            outputs,
            provider: 'graphcore',
            model: 'debug-skip-video-stitch-v1',
          }
        }
        const stitchResult = await stitchVideoBytes({ client: input.client, videos })
        const assetKey = `output.${slugify(input.workflow.name)}.${input.run.id.slice(0, 8)}.${slugify(input.node.key)}`
        const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slugify(input.node.key)}.mp4`
        await uploadBytes(input.client, storagePath, stitchResult.bytes, stitchResult.mimeType)
        const metadata = {
          generatedBy: 'output_workflow',
          workflowId: input.workflow.id,
          workflowKey: input.workflow.key,
          runId: input.run.id,
          nodeId: input.node.id,
          nodeKey: input.node.key,
          preset: input.run.preset,
          provider: 'graphcore',
          model: 'ffmpeg-video-stitch-v1',
          stitchMode: stitchResult.mode,
          sourceVideoAssetKeys: videos.map((video) => readText(video.assetKey)).filter(Boolean),
          sourceVideoStoragePaths: videos.map((video) => readText(video.storagePath) || readText(video.storage_path)).filter(Boolean),
          byteSize: stitchResult.bytes.byteLength,
          storageBucket: 'project-assets',
          storagePath,
        }
        const artifact = await registerVideoArtifact({
          client: input.client,
          run: input.run,
          workflow: input.workflow,
          node: input.node,
          assetKey,
          storagePath,
          name: input.node.label,
          summary: 'Final stitched cinematic sequence video.',
          mimeType: stitchResult.mimeType,
          metadata,
        })
        const video = {
          assetKey,
          storagePath,
          mimeType: stitchResult.mimeType,
          provider: 'graphcore',
          model: 'ffmpeg-video-stitch-v1',
          role: 'cinematic_sequence_final',
          sourceVideoCount: videos.length,
          stitchMode: stitchResult.mode,
        }
        const outputs = { video, videos, artifact, assetKey, storagePath, mimeType: stitchResult.mimeType }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'ffmpeg-video-stitch-v1',
        }
      }
      if (purpose === 'comic_page_prompt') {
        const config = asRecord(input.node.config)
        const pageNumber = Math.max(1, Number(config.pageNumber ?? 1))
        const pageCount = Math.max(1, Number(config.pageCount ?? 8))
        const script = readFirstUpstreamRecord(input.upstream, ['script'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const prompt = input.run.prompt
        const scriptPage = comicScriptPage(script, pageNumber)
        const pagePrompt = buildDeterministicComicPageImagePrompt({ script, assetPack, pageNumber, pageCount, prompt, guidance })
        const pageAssetPack = filterComicAssetPackForPage(assetPack, scriptPage, 6)
        const outputs = {
          prompt: pagePrompt,
          text: pagePrompt,
          pageNumber,
          pageCount,
          scriptPage,
          pageAssetPack,
          page_asset_pack: pageAssetPack,
          pageReferenceEntityKeys: readStringArray(pageAssetPack.pageReferenceEntityKeys),
          assetPack,
          guidance,
          deterministic: true,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-comic-page-prompt-v1',
        }
      }
      if (purpose === 'single_chapter_assembly') {
        const config = asRecord(input.node.config)
        const chapterNumber = Number(config.chapterNumber ?? 9999)
        const markdown = assembleChapterMarkdown(input.upstream)
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const outputs = { markdown, text: markdown, chapterNumber, guidance }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-single-chapter-assembly-v1' }
      }
      if (purpose === 'chapter_assembly') {
        const markdown = assembleChapterMarkdown(input.upstream)
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const outputs = { markdown, text: markdown, guidance }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-chapter-assembly-v1' }
      }
      if (purpose === 'bible_assembly') {
        const config = asRecord(input.node.config)
        const context = worldContextFromRunInput(input.run)
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const markdown = assembleBibleMarkdown({
          context,
          upstream: input.upstream,
          configuredSections: configuredBibleSections(config),
          outputKind: readText(config.outputKind),
        })
        const outputs = {
          markdown,
          text: markdown,
          documentMode: readText(config.documentMode) || 'reference',
          pageSize: readText(config.pageSize) || '',
          imagePolicy: readText(config.imagePolicy) || '',
          guidance,
          sectionCount: configuredBibleSections(config).length,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-bible-assembly-v1' }
      }
      const outputs = { output: input.upstream }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-utility-v1' }
    }
    case 'document_render': {
      const purpose = readText(asRecord(input.node.config).purpose)
      if (purpose === 'comic_pdf_render') {
        const script = readFirstUpstreamRecord(input.upstream, ['script'])
        const markdown = readFirstUpstreamText(input.upstream, ['markdown', 'text'])
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const comicPages = collectComicPageImages(input.upstream)
        const context = worldContextFromRunInput(input.run)
        const renderMetadata = {
          renderer: 'graphcore-comic-pdf-v1',
          pageSize: '6.625in x 10.25in',
          pageCount: comicPages.length,
          scriptCharacterCount: markdown.length,
          sequenceUnitKey: readStringArray(input.run.input.sourceSequenceUnitKeys)[0] ?? '',
          title: readText(script.title) || titleFromContext(context),
        }
        const outputs = {
          markdown,
          text: markdown,
          script,
          comicPages,
          pageImages: comicPages,
          mimeType: 'application/pdf',
          fileName: `${slugify(input.workflow.name)}.pdf`,
          renderMetadata,
          guidance,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-comic-document-render-v1' }
      }
      const markdown = readFirstUpstreamText(input.upstream)
      const config = asRecord(input.node.config)
      const guidance = readUpstreamGuidanceBundle(input.upstream)
      const coverImage = readFirstUpstreamImage(input.upstream, ['image', 'coverImage'])
      const context = worldContextFromRunInput(input.run)
      const wiki = asRecord(context.wiki)
      const title = titleFromContext(context)
      const subtitle = readText(wiki.logline) || readText(wiki.subtitle)
      const configuredDocumentMode = readText(config.documentMode)
      const documentMode = configuredDocumentMode === 'designed_reference'
        ? 'designed_reference'
        : configuredDocumentMode === 'reference' || input.run.preset === 'story_bible_from_world'
          ? 'reference'
          : 'ebook'
      const pageSize = readText(config.pageSize) || readText(asRecord(input.run.input).pageSize)
      const renderMetadata = buildEbookDocumentMetadata(markdown, {
        title,
        subtitle,
        provenance: 'Generated from the GraphCore world graph',
        generatedAt: new Date().toISOString(),
        documentMode,
        pageSize: pageSize === 'a4' || pageSize === 'letter' || pageSize === 'trade_6x9' ? pageSize : undefined,
      })
      const outputs = {
        markdown,
        mimeType: 'application/pdf',
        fileName: `${slugify(input.workflow.name)}.pdf`,
        renderMetadata,
        coverImage,
        documentMode,
        pageSize,
        guidance,
      }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-document-render-v1' }
    }
    case 'output_artifact': {
      const purpose = readText(asRecord(input.node.config).purpose)
      if (purpose === 'cinematic_video_artifact') {
        const video = readFirstUpstreamRecord(input.upstream, ['video'])
        const artifact = readFirstUpstreamRecord(input.upstream, ['artifact'])
        if (
          video.debugSkipVideoGeneration === true
          || video.skippedReason === 'debug_skip_video_generation'
          || video.skippedReason === 'cinematic_video_approval_required'
        ) {
          const skippedReason = readText(video.skippedReason) || 'debug_skip_video_generation'
          const outputs = {
            artifactKey: '',
            assetKey: '',
            artifact: {},
            artifacts: [],
            video,
            debugSkipVideoGeneration: video.debugSkipVideoGeneration === true,
            approvalRequired: video.skippedReason === 'cinematic_video_approval_required',
            skippedReason,
          }
          return {
            status: 'skipped',
            inputHash: input.inputHash,
            outputHash: hashOutputWorkflowValue(outputs),
            outputs,
            provider: 'graphcore',
            model: skippedReason === 'cinematic_video_approval_required'
              ? 'cinematic-v2-artifact-approval-gate-v1'
              : 'debug-skip-cinematic-video-artifact-v1',
          }
        }
        const assetKey = readText(video.assetKey) || readText(artifact.assetKey)
        if (!assetKey) throw new Error('Cinematic video artifact requires a stitched video input.')
        const outputs = {
          artifactKey: readText(artifact.key),
          assetKey,
          artifact,
          artifacts: Object.keys(artifact).length > 0 ? [artifact] : [],
          video,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-cinematic-video-artifact-v1',
        }
      }
      if (input.run.preset === 'comic_issue_from_sequence' || purpose === 'comic_artifact') {
        const script = readFirstUpstreamRecord(input.upstream, ['script'])
        const markdown = readFirstUpstreamText(input.upstream, ['markdown', 'text'])
        const comicPages = collectComicPageImages(input.upstream)
        if (comicPages.length === 0) throw new Error('Comic PDF artifact requires generated comic page images.')
        const artifact = await registerComicArtifact({
          client: input.client,
          run: input.run,
          workflow: input.workflow,
          node: input.node,
          comicPages,
          scriptMarkdown: markdown,
          script,
          documentRenderer: input.documentRenderer,
        })
        const outputs = {
          artifactKey: artifact.pdfArtifact.key,
          assetKey: artifact.pdfArtifact.assetKey,
          scriptArtifactKey: artifact.scriptArtifact.key,
          scriptAssetKey: artifact.scriptArtifact.assetKey,
          artifact: artifact.pdfArtifact,
          artifacts: [artifact.pdfArtifact, artifact.scriptArtifact],
          renderMetadata: artifact.renderMetadata,
          pageAssetKeys: comicPages.map((page) => readText(page.assetKey)).filter(Boolean),
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-comic-artifact-v1' }
      }
      const markdown = readFirstUpstreamText(input.upstream)
      const guidance = readUpstreamGuidanceBundle(input.upstream)
      const coverImage = readFirstUpstreamImage(input.upstream, ['coverImage', 'image'])
      const artifact = await registerDocumentArtifact({
        client: input.client,
        run: input.run,
        workflow: input.workflow,
        node: input.node,
        markdown,
        guidance,
        coverImage,
        documentMode: readText(asRecord(input.node.config).documentMode) === 'designed_reference'
          ? 'designed_reference'
          : input.run.preset === 'story_bible_from_world' || purpose === 'story_bible_artifact'
            ? 'reference'
            : 'ebook',
        documentRenderer: input.documentRenderer,
      })
      const outputs = {
        artifactKey: artifact.pdfArtifact.key,
        assetKey: artifact.pdfArtifact.assetKey,
        htmlArtifactKey: artifact.htmlArtifact.key,
        htmlAssetKey: artifact.htmlArtifact.assetKey,
        markdownArtifactKey: artifact.markdownArtifact.key,
        markdownAssetKey: artifact.markdownArtifact.assetKey,
        artifact: artifact.pdfArtifact,
        artifacts: [artifact.pdfArtifact, artifact.htmlArtifact, artifact.markdownArtifact],
        renderMetadata: artifact.renderMetadata,
        guidance,
      }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-artifact-v1' }
    }
    default: {
      const outputs = { skipped: true, reason: `${input.node.nodeType} is registered but not executed by the v1 ebook worker.` }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'unsupported-node-v1' }
    }
  }
}

export async function processFlyOutputWorkflowRuns(input: {
  client: DatabaseClient
  workerId: string
  documentRenderer?: OutputDocumentRenderer | null
}): Promise<{ processed: boolean; run?: Pick<OutputWorkflowRun, 'id' | 'status' | 'preset'> | null }> {
  const claimResponse = await input.client.rpc('claim_output_workflow_run', {
    worker_id: input.workerId,
  })
  if (claimResponse.error) throw new Error(claimResponse.error.message)
  const runId = typeof claimResponse.data === 'string' ? claimResponse.data : ''
  if (!runId) return { processed: false, run: null }

  let bundle = await loadOutputWorkflowRunBundle(input.client, runId, { includeStepOutputs: false })

  try {
    for (let dynamicPass = 0; dynamicPass < 4; dynamicPass += 1) {
    const activeWorkflowNodes = bundle.nodes.filter((node) => !isStaleDynamicCinematicNode(node))
    const activeWorkflowNodeKeys = new Set(activeWorkflowNodes.map((node) => node.key))
    const activeWorkflowEdges = bundle.edges.filter((edge) => (
      activeWorkflowNodeKeys.has(edge.sourceNodeKey)
      && activeWorkflowNodeKeys.has(edge.targetNodeKey)
    ))
    const validation = validateOutputWorkflowGraph({ nodes: activeWorkflowNodes, edges: activeWorkflowEdges })
    if (!validation.ok) {
      throw new Error(validation.diagnostics.join(' '))
    }

    await heartbeat(input.client, runId, input.workerId, {
      stage: 'running',
      preset: bundle.run.preset,
    })

    const runMetadata = asRecord(bundle.run.metadata)
    const targetNodeKeys = readStringArray(runMetadata.targetNodeKeys)
    const forceNodeKeys = new Set(readStringArray(runMetadata.forceNodeKeys))
    const reuseExistingUpstreamOutputs = runMetadata.reuseExistingUpstreamOutputs === true
    const allowStaleUpstreamOutputs = runMetadata.allowStaleUpstreamOutputs === true
    const runScope = readText(runMetadata.runScope) || (targetNodeKeys.length > 0 ? 'upstream_to_node' : 'full_workflow')
    const continueDynamicFanoutDependents = runScope === 'node_and_downstream'
      && targetNodeKeys.some(isDynamicCinematicFanoutNodeKey)
      && activeWorkflowNodes.some((node) => {
        const metadata = asRecord(node.metadata)
        return metadata.dynamicCinematicGenerated === true
          && targetNodeKeys.includes(readText(metadata.generatedByNodeKey))
      })
    const selectedSubgraph = selectOutputWorkflowRunSubgraph({
      nodes: activeWorkflowNodes,
      edges: activeWorkflowEdges,
      targetNodeKeys: continueDynamicFanoutDependents ? ['artifact'] : targetNodeKeys,
      runScope: continueDynamicFanoutDependents
        ? 'upstream_to_node'
        : runScope === 'node_only' || runScope === 'node_and_downstream' || runScope === 'artifact_rebake'
        ? runScope
        : 'upstream_to_node',
    })
    if (selectedSubgraph.diagnostics.length > 0) throw new Error(selectedSubgraph.diagnostics.join(' '))
    const fanoutGateNode = selectedSubgraph.nodes.find((node) => (
      node.key === 'cinematic_v3_dynamic_storyboard_fanout'
      || node.key === 'cinematic_v2_dynamic_shot_fanout'
      || node.key === 'cinematic_dynamic_take_fanout'
    )) ?? null
    const fanoutGateActive = Boolean(fanoutGateNode) && (
      fanoutGateNode?.dirty === true
      || forceNodeKeys.has(fanoutGateNode?.key ?? '')
      || !hasStoredOutputs(fanoutGateNode?.outputs)
    )
    const executionNodes = fanoutGateActive
      ? selectedSubgraph.nodes.filter((node) => node.key === fanoutGateNode?.key || asRecord(node.metadata).dynamicCinematicGenerated !== true)
      : selectedSubgraph.nodes
    const executionNodeKeySetForGate = new Set(executionNodes.map((node) => node.key))
    const executionEdges = fanoutGateActive
      ? selectedSubgraph.edges.filter((edge) => executionNodeKeySetForGate.has(edge.sourceNodeKey) && executionNodeKeySetForGate.has(edge.targetNodeKey))
      : selectedSubgraph.edges
    const executionPlan = buildOutputWorkflowExecutionPlan(executionNodes, executionEdges)
    const nodeByKey = new Map(executionNodes.map((node) => [node.key, node]))
    const workflowNodeByKey = new Map(activeWorkflowNodes.map((node) => [node.key, node]))
    const stepByNodeKey = new Map(bundle.run.steps.map((step) => [step.nodeKey, step]))
    const sourceRunIdForCache = readText(runMetadata.sourceRunId)
    if (sourceRunIdForCache && sourceRunIdForCache !== runId) {
      const sourceStepResponse = await input.client
        .from('output_workflow_run_steps')
        .select(outputWorkflowRunStepSelect)
        .eq('run_id', sourceRunIdForCache)
        .eq('workflow_id', bundle.workflow.id)
        .order('order_index', { ascending: true })
      if (sourceStepResponse.error) throw new Error(sourceStepResponse.error.message)
      for (const row of (sourceStepResponse.data ?? []) as OutputWorkflowRunStepRow[]) {
        const sourceStep = mapOutputWorkflowRunStepRow(row)
        const existingStep = stepByNodeKey.get(sourceStep.nodeKey)
        if (!existingStep || !hasStoredOutputs(existingStep.outputs)) stepByNodeKey.set(sourceStep.nodeKey, sourceStep)
      }
    }
    const executionNodeKeys = new Set(executionNodes.map((node) => node.key))
    const cachedExternalUpstreamByNodeKey = new Map(executionNodes.map((node) => [node.key, collectCachedExternalUpstream({
      node,
      nodesByKey: workflowNodeByKey,
      stepsByNodeKey: stepByNodeKey,
      executionNodeKeys,
      edges: activeWorkflowEdges,
    })] as const))
    const missingCachedInputs = [...cachedExternalUpstreamByNodeKey.entries()]
      .flatMap(([nodeKey, cached]) => cached.missingNodeKeys.map((sourceKey) => `${nodeKey} <- ${sourceKey}`))
    if (missingCachedInputs.length > 0) {
      throw new Error(`Required upstream cached output is missing: ${missingCachedInputs.join(', ')}. Run upstream to this node first.`)
    }
    const executionLevelByNodeKey = new Map(executionPlan.levels.flatMap((level, index) => level.map((key) => [key, index] as const)))
    const nodeResults = new Map<string, {
      inputHash: string
      outputHash: string
      outputs: Record<string, unknown>
      provider?: string | null
      model?: string | null
      providerRequestId?: string | null
      skipped?: boolean
      skippedReason?: string
      reusedNodeKeys?: string[]
      staleReusedNodeKeys?: string[]
      sourceRunIds?: string[]
    }>()
    const shouldCancelRun = async () => {
      const cancellationResponse = await input.client
        .from('output_workflow_runs')
        .select('status')
        .eq('id', runId)
        .single()
      if (cancellationResponse.error) throw new Error(cancellationResponse.error.message)
      return (cancellationResponse.data as { status?: string } | null)?.status === 'cancelled'
    }

    const schedulerResult = await runOutputWorkflowReadyQueue({
      nodes: executionNodes,
      edges: executionEdges,
      globalMaxConcurrency: defaultOutputWorkflowConcurrency.global,
      resourceClassMaxConcurrency: defaultOutputWorkflowConcurrency.resourceClasses,
      shouldCancel: shouldCancelRun,
      executeNode: async ({ node, upstream }) => {
        const cachedExternalUpstream = cachedExternalUpstreamByNodeKey.get(node.key) ?? {
          outputs: {},
          reusedNodeKeys: [],
          staleReusedNodeKeys: [],
          sourceRunIds: [],
          missingNodeKeys: [],
        }
        const effectiveUpstream = {
          ...cachedExternalUpstream.outputs,
          ...upstream,
        }
        const inputHash = computeNodeInputHash({ run: bundle.run, node, upstream: effectiveUpstream })
        const forceNode = forceNodeKeys.has(node.key)
        const priorStep = stepByNodeKey.get(node.key) ?? null
        const hasExistingOutputs = hasStoredOutputs(node.outputs)
        const hasRecoverableStepOutputs = !forceNode
          && !hasExistingOutputs
          && hasStoredOutputs(priorStep?.outputs)
          && Boolean(priorStep?.outputHash)
          && ['running', 'completed'].includes(priorStep?.status ?? '')
        const canHashSkip = !forceNode && !node.dirty && node.inputHash === inputHash && hasExistingOutputs
        const canReuseExistingOutput = !forceNode
          && reuseExistingUpstreamOutputs
          && runScope !== 'upstream_to_node'
          && hasExistingOutputs
        if (hasRecoverableStepOutputs && priorStep) {
          const recoveredInputHash = priorStep.inputHash || inputHash
          const recoveredOutputs = asRecord(priorStep.outputs)
          const updateNodeResponse = await input.client
            .from('output_workflow_nodes')
            .update({
              outputs: recoveredOutputs,
              dirty: false,
              input_hash: recoveredInputHash,
              output_hash: priorStep.outputHash,
              metadata: {
                ...node.metadata,
                execution: buildOutputWorkflowNodeExecutionCacheMetadata({
                  node,
                  runId,
                  level: executionLevelByNodeKey.get(node.key) ?? 0,
                  resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
                  inputHash: recoveredInputHash,
                  outputHash: priorStep.outputHash,
                  effectiveUpstream,
                  reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
                  staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
                  sourceRunIds: cachedExternalUpstream.sourceRunIds,
                  recoveredFromRunStep: true,
                }),
                outputPreview: buildOutputWorkflowNodeOutputPreview({
                  node: { ...node, outputHash: priorStep.outputHash },
                  outputs: recoveredOutputs,
                  provider: priorStep.provider,
                  model: priorStep.model,
                }),
              },
          })
            .eq('id', node.id)
          if (updateNodeResponse.error) throw new Error(updateNodeResponse.error.message)
          nodeResults.set(node.key, {
            inputHash: recoveredInputHash,
            outputHash: priorStep.outputHash,
            outputs: recoveredOutputs,
            provider: priorStep.provider,
            model: priorStep.model,
            providerRequestId: priorStep.providerRequestId,
            skipped: true,
            skippedReason: 'existing_run_step_output_recovered',
            reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
            staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
            sourceRunIds: cachedExternalUpstream.sourceRunIds,
          })
          return { status: 'skipped', outputs: recoveredOutputs }
        }
        if (canHashSkip || canReuseExistingOutput) {
          const skippedInputHash = canHashSkip ? inputHash : node.inputHash || inputHash
          const skippedReason = canHashSkip ? 'input_hash_unchanged' : 'existing_output_reused_for_targeted_rebake'
          const updateNodeResponse = await input.client
            .from('output_workflow_nodes')
            .update({
              outputs: node.outputs,
              dirty: false,
              input_hash: skippedInputHash,
              output_hash: node.outputHash,
              metadata: {
                ...node.metadata,
                execution: buildOutputWorkflowNodeExecutionCacheMetadata({
                  node,
                  runId,
                  level: executionLevelByNodeKey.get(node.key) ?? 0,
                  resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
                  inputHash: skippedInputHash,
                  outputHash: node.outputHash,
                  effectiveUpstream,
                  reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
                  staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
                  sourceRunIds: cachedExternalUpstream.sourceRunIds,
                  skippedReason,
                }),
                outputPreview: buildOutputWorkflowNodeOutputPreview({
                  node,
                  outputs: node.outputs,
                  provider: 'graphcore',
                  model: 'cached-node-output',
                }),
              },
            })
            .eq('id', node.id)
          if (updateNodeResponse.error) throw new Error(updateNodeResponse.error.message)
          nodeResults.set(node.key, {
            inputHash: skippedInputHash,
            outputHash: node.outputHash,
            outputs: node.outputs,
            provider: 'graphcore',
            model: 'cached-node-output',
            skipped: true,
            skippedReason,
            reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
            staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
            sourceRunIds: cachedExternalUpstream.sourceRunIds,
          })
          return { status: 'skipped', outputs: node.outputs }
        }
        const result = await executeNode({
          run: bundle.run,
          workflow: bundle.workflow,
          node,
          priorStep,
          upstream: effectiveUpstream,
          inputHash,
          client: input.client,
          documentRenderer: input.documentRenderer,
          shouldCancel: shouldCancelRun,
          onProgress: async (progress) => {
            const priorStep = stepByNodeKey.get(node.key)
            await setStepStatus(input.client, {
              runId,
              node,
              status: 'running',
              draftId: bundle.run.draftId,
              orderIndex: executionPlan.orderedNodeKeys.indexOf(node.key),
              inputHash,
              outputHash: priorStep?.outputHash ?? '',
              outputs: priorStep?.outputs ?? {},
              provider: progress.provider ?? priorStep?.provider ?? null,
              model: progress.model ?? priorStep?.model ?? null,
              providerRequestId: progress.providerRequestId ?? priorStep?.providerRequestId ?? null,
              metadata: {
                ...asRecord(priorStep?.metadata),
                stage: node.nodeType,
                runScope,
                executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
                resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
                groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
                ...progress.metadata,
                reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
                staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
                sourceRunIds: cachedExternalUpstream.sourceRunIds,
                staleInputAllowed: allowStaleUpstreamOutputs,
              },
            })
            if (priorStep) {
              priorStep.provider = progress.provider ?? priorStep.provider
              priorStep.model = progress.model ?? priorStep.model
              priorStep.providerRequestId = progress.providerRequestId ?? priorStep.providerRequestId
              priorStep.metadata = {
                ...asRecord(priorStep.metadata),
                ...progress.metadata,
              }
            }
          },
        })
        nodeResults.set(node.key, {
          inputHash: result.inputHash,
          outputHash: result.outputHash,
          outputs: result.outputs,
          provider: result.provider,
          model: result.model,
          providerRequestId: result.providerRequestId,
          skipped: result.status === 'skipped',
          skippedReason: result.status === 'skipped' ? readText(asRecord(result.outputs).skippedReason) || 'node_reported_skipped' : undefined,
          reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
          staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
          sourceRunIds: cachedExternalUpstream.sourceRunIds,
        })
        const guidanceMetadata = guidanceStepMetadata(result.outputs.guidance)
        const updateNodeResponse = await input.client
          .from('output_workflow_nodes')
          .update({
            outputs: result.outputs,
            dirty: false,
            input_hash: result.inputHash,
            output_hash: result.outputHash,
            metadata: {
              ...node.metadata,
              execution: buildOutputWorkflowNodeExecutionCacheMetadata({
                node,
                runId,
                level: executionLevelByNodeKey.get(node.key) ?? 0,
                resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
                inputHash: result.inputHash,
                outputHash: result.outputHash,
                effectiveUpstream,
                reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
                staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
                sourceRunIds: cachedExternalUpstream.sourceRunIds,
              }),
              guidance: guidanceMetadata,
              outputPreview: buildOutputWorkflowNodeOutputPreview({
                node: { ...node, outputHash: result.outputHash },
                outputs: result.outputs,
                provider: result.provider,
                model: result.model,
              }),
            },
          })
          .eq('id', node.id)
        if (updateNodeResponse.error) throw new Error(updateNodeResponse.error.message)
        return { status: 'completed', outputs: result.outputs }
      },
      onNodeStart: async ({ node, orderIndex, resourceClass }) => {
        const priorStep = stepByNodeKey.get(node.key)
        await setStepStatus(input.client, {
          runId,
          node,
          status: 'running',
          draftId: bundle.run.draftId,
          orderIndex,
          inputHash: priorStep?.inputHash ?? '',
          outputHash: priorStep?.outputHash ?? '',
          outputs: priorStep?.outputs ?? {},
          provider: priorStep?.provider ?? null,
          model: priorStep?.model ?? null,
          providerRequestId: priorStep?.providerRequestId ?? null,
          metadata: {
            ...asRecord(priorStep?.metadata),
            stage: node.nodeType,
            runScope,
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass,
            groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
          },
        })
      },
      onNodeComplete: async ({ node, orderIndex, skipped }) => {
        const result = nodeResults.get(node.key)
        const guidanceMetadata = guidanceStepMetadata(result?.outputs.guidance)
        const aiUsage = buildOutputStepAiUsage({ run: bundle.run, node, result, skipped })
        await setStepStatus(input.client, {
          runId,
          node,
          status: 'completed',
          draftId: bundle.run.draftId,
          orderIndex,
          inputHash: result?.inputHash ?? '',
          outputHash: result?.outputHash ?? '',
          outputs: result?.outputs ?? {},
          provider: result?.provider ?? null,
          model: result?.model ?? null,
          providerRequestId: result?.providerRequestId ?? null,
          metadata: {
            stage: node.nodeType,
            runScope,
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
            groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
            ...guidanceMetadata,
            skipped,
            reason: skipped ? result?.skippedReason ?? 'input_hash_unchanged' : undefined,
            reusedNodeKeys: result?.reusedNodeKeys ?? [],
            staleReusedNodeKeys: result?.staleReusedNodeKeys ?? [],
            sourceRunIds: result?.sourceRunIds ?? [],
            staleInputAllowed: allowStaleUpstreamOutputs,
            aiUsage: aiUsage.summary,
            aiUsageLine: aiUsage.line,
          },
        })
        if (aiUsage.line) {
          await recordAiUsageEvent(input.client, {
            line: aiUsage.line,
            context: {
              userId: bundle.run.requestedBy,
              projectId: bundle.run.projectId,
              draftId: bundle.run.draftId,
              surface: 'output_workflow',
              outputWorkflowId: bundle.workflow.id,
              outputWorkflowRunId: bundle.run.id,
              idempotencyKey: `${bundle.run.id}:${node.key}:${result?.providerRequestId ?? result?.outputHash ?? result?.inputHash}`,
            },
          })
        }
      },
      onNodeFailed: async ({ node, orderIndex, error, blockedDependents }) => {
        const message = error instanceof Error ? error.message : String(error)
        const priorStep = stepByNodeKey.get(node.key)
        await setStepStatus(input.client, {
          runId,
          node,
          status: 'failed',
          draftId: bundle.run.draftId,
          orderIndex,
          provider: priorStep?.provider ?? null,
          model: priorStep?.model ?? null,
          providerRequestId: priorStep?.providerRequestId ?? null,
          errorMessage: message,
          metadata: {
            ...asRecord(priorStep?.metadata),
            stage: node.nodeType,
            runScope,
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
            blockedDependents,
          },
        })
        const updateNodeFailurePreview = await input.client
          .from('output_workflow_nodes')
          .update({
            metadata: {
              ...node.metadata,
              outputPreview: buildOutputWorkflowNodeOutputPreview({
                node,
                outputs: {},
                provider: priorStep?.provider ?? null,
                model: priorStep?.model ?? null,
                errorMessage: message,
              }),
            },
          })
          .eq('id', node.id)
        if (updateNodeFailurePreview.error) throw new Error(updateNodeFailurePreview.error.message)
      },
      onNodeCancelled: async ({ node, orderIndex, reason, blockedBy }) => {
        const priorStep = stepByNodeKey.get(node.key)
        await setStepStatus(input.client, {
          runId,
          node,
          status: 'cancelled',
          draftId: bundle.run.draftId,
          orderIndex,
          provider: priorStep?.provider ?? null,
          model: priorStep?.model ?? null,
          providerRequestId: priorStep?.providerRequestId ?? null,
          errorMessage: reason === 'blocked_by_failed_dependency' ? `Blocked by ${blockedBy}.` : null,
          metadata: {
            ...asRecord(priorStep?.metadata),
            stage: node.nodeType,
            runScope,
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
            blocked: reason === 'blocked_by_failed_dependency',
            blockedBy: blockedBy ?? null,
            reason,
          },
        })
      },
      onHeartbeat: async ({ pending, running, completed, failed, cancelled, skipped }) => {
        await heartbeat(input.client, runId, input.workerId, {
          runtime: 'fly_output_workflow_worker',
          stage: running.length > 0 ? 'running_parallel_nodes' : 'scheduling',
          runMode: targetNodeKeys.length > 0 ? 'targeted_node_run' : 'full_workflow_run',
          runScope,
          targetNodeKeys,
          forceNodeKeys: [...forceNodeKeys],
          reuseExistingUpstreamOutputs,
          allowStaleUpstreamOutputs,
          pendingNodeKeys: pending,
          runningNodeKeys: running,
          completedNodeKeys: completed,
          failedNodeKeys: failed,
          cancelledNodeKeys: cancelled,
          skippedNodeKeys: skipped,
          executionLevels: executionPlan.levels,
          concurrency: defaultOutputWorkflowConcurrency,
        })
      },
    })

    if (schedulerResult.status === 'cancelled') {
      return { processed: true, run: { id: bundle.run.id, status: 'cancelled', preset: bundle.run.preset } }
    }
    if (schedulerResult.status === 'failed') {
      throw new Error('Output workflow failed while executing required nodes.')
    }
    const fanoutOutputs = asRecord(
      schedulerResult.outputsByNodeKey.cinematic_dynamic_take_fanout
      ?? schedulerResult.outputsByNodeKey.cinematic_v3_dynamic_storyboard_fanout
      ?? schedulerResult.outputsByNodeKey.cinematic_v2_dynamic_shot_fanout,
    )
    const dynamicGraphExpanded = fanoutOutputs.dynamicGraphExpanded === true || fanoutOutputs.graphExpanded === true
    const dynamicFanoutNodeKey = schedulerResult.outputsByNodeKey.cinematic_v3_dynamic_storyboard_fanout
      ? 'cinematic_v3_dynamic_storyboard_fanout'
      : schedulerResult.outputsByNodeKey.cinematic_v2_dynamic_shot_fanout
        ? 'cinematic_v2_dynamic_shot_fanout'
        : schedulerResult.outputsByNodeKey.cinematic_dynamic_take_fanout
          ? 'cinematic_dynamic_take_fanout'
          : ''
    if (dynamicGraphExpanded && dynamicFanoutNodeKey) {
      await heartbeat(input.client, runId, input.workerId, {
        runtime: 'fly_output_workflow_worker',
        stage: dynamicFanoutNodeKey === 'cinematic_v3_dynamic_storyboard_fanout'
          ? 'dynamic_cinematic_v3_storyboard_fanout_materialized'
          : dynamicFanoutNodeKey === 'cinematic_v2_dynamic_shot_fanout'
            ? 'dynamic_cinematic_v2_shot_fanout_materialized'
            : 'dynamic_cinematic_take_fanout_materialized',
        dynamicTakeCount: Number(fanoutOutputs.dynamicTakeCount ?? 0) || null,
        dynamicShotCount: Number(fanoutOutputs.dynamicShotCount ?? 0) || null,
        compileHash: readText(fanoutOutputs.compileHash) || null,
      })
      bundle = await loadOutputWorkflowRunBundle(input.client, runId, { includeStepOutputs: false })
      continue
    }

    const finalOutputs = {
      nodes: schedulerResult.outputsByNodeKey,
      artifact: schedulerResult.outputsByNodeKey.artifact ?? null,
    }
    const completeResponse = await input.client.rpc('complete_output_workflow_run', {
      run_id: runId,
      worker_id: input.workerId,
      outputs: finalOutputs,
      metadata_patch: {
        runtime: 'fly_output_workflow_worker',
        stage: schedulerResult.status,
          runMode: targetNodeKeys.length > 0 ? 'targeted_node_run' : 'full_workflow_run',
          runScope,
          targetNodeKeys,
          forceNodeKeys: [...forceNodeKeys],
          reuseExistingUpstreamOutputs,
          allowStaleUpstreamOutputs,
          status: schedulerResult.status === 'completed_with_errors' ? 'completed_with_errors' : undefined,
        completedNodeKeys: schedulerResult.completed,
        failedNodeKeys: schedulerResult.failed,
        cancelledNodeKeys: schedulerResult.cancelled,
        skippedNodeKeys: schedulerResult.skipped,
        executionLevels: executionPlan.levels,
      },
    })
    if (completeResponse.error) throw new Error(completeResponse.error.message)
    return { processed: true, run: { id: bundle.run.id, status: schedulerResult.status, preset: bundle.run.preset } }
    }
    throw new Error('Cinematic dynamic workflow expansion did not settle after 4 scheduler passes.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await input.client.rpc('fail_output_workflow_run', {
      run_id: runId,
      worker_id: input.workerId,
      error_message: message,
      metadata_patch: {
        runtime: 'fly_output_workflow_worker',
        stage: 'failed',
      },
    })
    return { processed: true, run: { id: bundle.run.id, status: 'failed', preset: bundle.run.preset } }
  }
}

export {
  buildOutputWorkflowExecutionPlan,
  isTerminalOutputWorkflowRunStatus,
  outputArtifactResponseSchema,
  outputWorkflowCancelResponseSchema,
  outputWorkflowPlanResponseSchema,
  outputWorkflowRunStatusResponseSchema,
  outputWorkflowStartResponseSchema,
  getOutputWorkflowNodeExecutionMetadata,
  getOutputWorkflowNodeGuidanceConfig,
  selectOutputWorkflowRunSubgraph,
  topologicallySortOutputWorkflow,
  validateOutputWorkflowGraph,
}
