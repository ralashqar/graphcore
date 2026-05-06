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
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
  type OutputWorkflowRun,
  type OutputWorkflowRunStep,
} from '../../../src/domain/outputWorkflow.ts'
import { buildEbookDocumentMetadata, buildEbookHtmlDocument } from '../../../src/domain/ebookDocument.ts'
import { buildFalMediaUsageLine, buildOpenAiUsageLine, summarizeAiUsageLines, type AiUsageLine } from '../../../src/domain/aiUsage.ts'
import { hashOutputGuidanceBundle, outputGuidanceBundleSchema, type OutputGuidanceBundle } from '../../../src/domain/outputSkills.ts'
import {
  readWorldEntityVisualDescription,
  readWorldEntityVisualTraitMap,
  readWorldEntityVisualTraits,
} from '../../../src/domain/worldEntityVisuals.ts'
import { recordAiUsageEvent } from './ai-provider-gateway.ts'
import {
  cancelOpenAiResponse,
  createOpenAiBackgroundResponse,
  retrieveOpenAiResponse,
  runOpenAiResponses,
  type OpenAiResponseResult,
} from './openai.ts'

const OUTPUT_WORKFLOW_EXECUTOR_VERSION = 'cinematic-prompt-compact-v2'
const DEFAULT_CHAPTER_PROSE_TIMEOUT_MS = 3_600_000
const DEFAULT_CHAPTER_PROSE_ATTEMPTS = 2
const FAL_QUEUE_BASE_URL = 'https://queue.fal.run'

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
export const outputWorkflowEdgeSelect = 'id, workflow_id, key, source_node_key, source_port, target_node_key, target_port, metadata, created_at, updated_at'
export const outputWorkflowRunSelect = 'id, project_id, draft_id, workflow_id, requested_by, status, preset, prompt, target_format, world_snapshot_fingerprint, input, outputs, error_message, worker_id, heartbeat_at, attempt_count, metadata, started_at, completed_at, created_at, updated_at'
export const outputWorkflowRunStepSelect = 'id, run_id, workflow_id, node_id, node_key, node_type, status, order_index, label, input_hash, output_hash, outputs, provider, model, provider_request_id, error_message, metadata, started_at, completed_at, created_at, updated_at'
export const outputArtifactSelect = 'id, project_id, draft_id, workflow_id, run_id, node_id, key, name, kind, asset_key, mime_type, summary, metadata, created_at, updated_at'
export const outputRequestSelect = 'id, project_id, draft_id, workflow_id, latest_run_id, requested_by, source_surface, prompt, title, intent, output_kind, status, selected_entity_keys, selected_sequence_unit_keys, page_count, target_format, planner_notes, error_message, metadata, created_at, updated_at'

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
  return Promise.all(artifacts.map(async (artifact) => {
    const metadata = asRecord(artifact.metadata)
    const existingUrl = readText(metadata.sourceUrl) || readText(metadata.previewUrl)
    if (existingUrl) return artifact

    const storagePath = readText(metadata.storagePath)
      || readText(asRecord(metadata.render).storagePath)
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

function compactRecordForStatus(value: Record<string, unknown>, maxBytes = 180_000): Record<string, unknown> {
  const bytes = jsonByteLength(value)
  if (bytes <= maxBytes) return value
  return {
    _truncatedForStatus: true,
    _originalBytes: bytes,
    preview: compactStatusPreview(value),
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

export async function loadOutputWorkflowRunBundle(client: DatabaseClient, runId: string) {
  const runResponse = await client
    .from('output_workflow_runs')
    .select(outputWorkflowRunSelect)
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
      .select(outputWorkflowNodeSelect)
      .eq('workflow_id', runRow.workflow_id)
      .order('created_at', { ascending: true }),
    client
      .from('output_workflow_edges')
      .select(outputWorkflowEdgeSelect)
      .eq('workflow_id', runRow.workflow_id)
      .order('created_at', { ascending: true }),
    client
      .from('output_workflow_run_steps')
      .select(outputWorkflowRunStepSelect)
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
  const response = await client
    .from('output_workflow_run_steps')
    .upsert({
      run_id: input.runId,
      workflow_id: input.node.workflowId,
      node_id: input.node.id,
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
  if (response.error) throw new Error(response.error.message)
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildOutputStepAiUsage(input: {
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
  return { line: null, summary: null }
}

function hasStoredOutputs(value: unknown) {
  return Object.keys(asRecord(value)).length > 0
}

function isOptionalOutputWorkflowEdge(edge: Pick<OutputWorkflowEdge, 'metadata'> | Partial<Pick<OutputWorkflowEdge, 'metadata'>>) {
  const metadata = asRecord(edge.metadata)
  return metadata.optional === true || metadata.optionalDependency === true
}

function cachedOutputRunId(node: OutputWorkflowNode) {
  return readText(asRecord(asRecord(node.metadata).execution).lastRunId)
}

function collectCachedExternalUpstream(input: {
  node: OutputWorkflowNode
  nodesByKey: Map<string, OutputWorkflowNode>
  executionNodeKeys: Set<string>
  edges: OutputWorkflowEdge[]
}) {
  const outputs: Record<string, Record<string, unknown>> = {}
  const reusedNodeKeys: string[] = []
  const staleReusedNodeKeys: string[] = []
  const missingNodeKeys: string[] = []
  const sourceRunIds: string[] = []
  for (const edge of input.edges) {
    if (edge.targetNodeKey !== input.node.key || input.executionNodeKeys.has(edge.sourceNodeKey)) continue
    const sourceNode = input.nodesByKey.get(edge.sourceNodeKey)
    if (!sourceNode || !hasStoredOutputs(sourceNode.outputs)) {
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

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean) : []
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
  const sourceEntityKeys = run.preset === 'comic_issue_from_sequence'
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
  return Deno.env.get('OUTPUT_WORKFLOW_TEXT_MODEL')?.trim() || 'gpt-4o-mini'
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

function buildFalHeaders(apiKey: string) {
  return new Headers({
    Authorization: `Key ${apiKey}`,
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

function entityAssetKeys(entity: Record<string, unknown>, assets: Record<string, unknown>[]) {
  const keys = [
    readText(entity.thumbnailAssetKey),
    readText(entity.thumbnail_asset_key),
    readText(asRecord(entity.metadata).brandAtlasAssetKey),
    readText(asRecord(entity.metadata).assetKey),
  ].filter(Boolean)
  const matching = assets
    .filter((asset) => keys.includes(readText(asset.key)))
    .map((asset) => readText(asset.key))
  return [...new Set([...keys, ...matching])].filter(Boolean)
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
    assetKeys: entityAssetKeys(entity, assets),
  })).filter((entity) => entity.key || entity.name)
  return {
    entities: packedEntities,
    missingReferenceEntityKeys: packedEntities.filter((entity) => entity.assetKeys.length === 0).map((entity) => entity.key),
  }
}

function buildDeterministicImageAssetPack(context: Record<string, unknown>, limit = 8) {
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  const assets = Array.isArray(context.assets) ? context.assets.map(asRecord) : []
  const packedEntities = entities.slice(0, limit).map((entity) => {
    const visualDescription = readOutputEntityVisualDescription(entity)
    return {
      key: readText(entity.key),
      name: readText(entity.name),
      type: readText(entity.nodeType ?? entity.node_type),
      role: readText(entity.nodeType ?? entity.node_type),
      summary: readText(entity.summary),
      visualDescription,
      visualTraits: readOutputEntityVisualTraits(entity),
      visualTraitMap: readOutputEntityVisualTraitMap(entity),
      assetKeys: entityAssetKeys(entity, assets),
    }
  }).filter((entity) => entity.key || entity.name)
  return {
    entities: packedEntities,
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

function buildDeterministicCinematicAssetPack(context: Record<string, unknown>) {
  return buildDeterministicComicAssetPack(context)
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
    })),
    relationships: relationships.slice(0, 32),
  }
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
    '- Use concise shotCount values appropriate for a storyboard grid: 6-9 for 3x3, 10-15 for 4x4.',
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

function compactCinematicEntityAnchors(assetPack: Record<string, unknown>, limit = 8) {
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  return entities.slice(0, limit).map((entity) => ({
    name: readText(entity.name),
    summary: readText(entity.summary),
    visualDescription: readText(entity.visualDescription),
    visualTraits: readStringArray(entity.visualTraits),
  })).filter((entity) => entity.name || entity.summary || entity.visualDescription || entity.visualTraits.length > 0)
}

function buildCinematicStoryboardPrompt(input: {
  blockScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  gridDimension: number
  prompt: string
  guidance: OutputGuidanceBundle | null
}) {
  const shots = Array.isArray(input.blockScript.shots) ? input.blockScript.shots.map(asRecord) : []
  const entities = compactCinematicEntityAnchors(input.assetPack, 10)
  const panelCount = input.gridDimension * input.gridDimension
  const shotLines = shots.slice(0, panelCount).map((shot, index) => [
    `Panel ${index + 1}: ${formatShotSeconds(readShotStartSeconds(shot), index)}s-${formatShotSeconds(readShotEndSeconds(shot), index + 1)}s.`,
    `Subject: ${readText(shot.subject)}.`,
    `Action: ${readText(shot.action)}.`,
    `Camera: ${readText(shot.camera)}.`,
  ].filter(Boolean).join(' '))
  return [
    `Create a clean ${input.gridDimension}x${input.gridDimension} storyboard grid contact sheet for a ${readText(input.blockScript.durationSeconds)} second cinematic video block.`,
    'Each panel is one shot thumbnail. Use consistent identity, wardrobe, environment, props, palette, and camera continuity across panels.',
    'No captions, labels, speech bubbles, watermarks, signatures, UI, or visible text unless the user explicitly requested on-screen text.',
    `Block title: ${readText(input.blockScript.title)}`,
    `Block summary: ${readText(input.blockScript.summary)}`,
    'Shot panels:',
    shotLines.join('\n'),
    entities.length > 0 ? 'Canonical visual identity anchors:' : '',
    entities.length > 0 ? compactForPrompt({ entities }, 3200) : '',
    input.prompt ? `User style brief: ${input.prompt}` : '',
    'Render as low-detail but readable cinematic storyboard art, not a poster and not a finished comic page.',
  ].filter(Boolean).join('\n\n')
}

function buildCinematicVideoPrompt(input: {
  blockScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle | null
  durationSeconds: number
  aspectRatio: string
  resolution: string
  generateAudio: boolean
  referenceImageCount: number
}) {
  const shots = Array.isArray(input.blockScript.shots) ? input.blockScript.shots.map(asRecord) : []
  const entities = compactCinematicEntityAnchors(input.assetPack, 8)
  const imageRefs = Array.from({ length: Math.max(0, input.referenceImageCount) }, (_, index) => `@Image${index + 1}`)
  const referenceLine = imageRefs.length > 1
    ? `Use ${imageRefs[0]} as the storyboard/block motion reference. Additional references ${imageRefs.slice(1).join(', ')} are continuity anchors only.`
    : imageRefs.length === 1
      ? `Use ${imageRefs[0]} as the storyboard/block motion reference.`
      : ''
  return [
    `Generate one ${input.durationSeconds}-second cinematic video clip at ${input.aspectRatio}, ${input.resolution}.`,
    referenceLine,
    'Follow this shot timing. Keep action continuous, physically plausible, and visually readable.',
    shots.map((shot, index) => `${index + 1}. ${formatShotSeconds(readShotStartSeconds(shot), index)}s-${formatShotSeconds(readShotEndSeconds(shot), index + 1)}s: ${readText(shot.subject)} ${readText(shot.action)} Camera: ${readText(shot.camera)}. ${readText(shot.composition)}`).join('\n'),
    entities.length > 0 ? 'Entity continuity anchors:' : '',
    entities.length > 0 ? compactForPrompt({ entities }, 2600) : '',
    input.generateAudio ? 'Generate native audio if supported: natural sound, restrained music, and any implied voice/speech should serve the shot script.' : 'Do not add prominent generated dialogue; keep audio minimal if generated.',
    input.prompt ? `User brief: ${input.prompt}` : '',
    'Provider constraints: no watermarks, no captions, no workflow/schema/internal wording, no redesigning referenced characters or environments.',
  ].filter(Boolean).join('\n\n')
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

function comicScriptPage(script: Record<string, unknown>, pageNumber: number) {
  const pages = Array.isArray(script.pages) ? script.pages.map(asRecord) : []
  return pages.find((entry) => Number(entry.pageNumber ?? 0) === pageNumber) ?? pages[pageNumber - 1] ?? {}
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
  const pageEntityKeys = readStringArray(page.requiredEntityKeys)
  const packedEntities = Array.isArray(input.assetPack.entities) ? input.assetPack.entities.map(asRecord) : []
  const relevantEntities = pageEntityKeys.length > 0
    ? packedEntities.filter((entity) => pageEntityKeys.includes(readText(entity.key)))
    : packedEntities
  return [
    `Create a finished full-page portrait comic image for page ${input.pageNumber} of ${input.pageCount}.`,
    'Use the attached comic atlas image as the primary identity, costume, environment, palette, and line-art reference.',
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
    relevantEntities.length > 0 ? compactForPrompt({ entities: relevantEntities.slice(0, 10) }) : '',
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

async function collectAssetPackReferenceUrls(client: DatabaseClient, run: OutputWorkflowRun, assetPack: Record<string, unknown>, limit = 3) {
  const references: string[] = []
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  for (const entity of entities) {
    for (const assetKey of readStringArray(entity.assetKeys)) {
      const asset = resolveAssetByKey(run, assetKey)
      const storagePath = readText(asset?.storagePath) || readText(asset?.storage_path)
      if (!storagePath) continue
      references.push(await projectAssetReferenceUrl(client, storagePath, readText(asset?.mimeType) || readText(asset?.mime_type) || 'image/png'))
      if (references.length >= limit) return references
    }
  }
  return references
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
  atlasImage?: Record<string, unknown> | null
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
    atlasAssetKey: readText(input.atlasImage?.assetKey),
    atlasStoragePath: readText(input.atlasImage?.storagePath),
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
    atlas: input.atlasImage ? {
      assetKey: readText(input.atlasImage.assetKey),
      storagePath: readText(input.atlasImage.storagePath),
      mimeType: readText(input.atlasImage.mimeType),
    } : null,
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
      const context = extractWorldContext(input.run, input.node)
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
            const assetNote = assetKeys.length > 0 ? ` Reference image asset: ${assetKeys.join(', ')}.` : ''
            return name ? `- ${name}: ${visualDescription}${traitNote}${assetNote}` : ''
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
          'Use exact canonical visual details. Keep the prompt visual-only. Do not mention GraphCore, schemas, nodes, world graph, internal keys, or implementation details.',
          purpose === 'poster_prompt'
            ? `If visible typography is needed, use the exact title text "${title}" and keep all other text minimal.`
            : 'No captions or UI text unless the user explicitly requested visible typography.',
        ].filter(Boolean).join('\n\n')
        const outputs = { text, prompt: text, assetPack, asset_pack: assetPack, guidance }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-visual-prompt-v1' }
      }
      if (purpose === 'image_reference_selector') {
        const assetPack = buildDeterministicImageAssetPack(context)
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
          providerRequestId: readText(repairResponse?.body.id) || readText(response.body.id) || response.response.headers.get('x-request-id') || null,
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
        const outputs = {
          prompt: pagePrompt,
          text: pagePrompt,
          pageNumber,
          pageCount,
          scriptPage,
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
      const prompt = readFirstUpstreamText(input.upstream, ['prompt', 'text'])
        || readText(input.node.inputs.prompt)
        || input.run.prompt
      if (!prompt) throw new Error('Image generation node is missing a prompt.')
      const priorStepOutputs = asRecord(input.priorStep?.outputs)
      if (hasStoredOutputs(priorStepOutputs) && input.priorStep?.outputHash && hasStoredOutputs(asRecord(priorStepOutputs.image))) {
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
      const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
      const referenceLimit = role === 'comic_page' ? 1 : role === 'comic_atlas' ? 8 : 3
      const referenceImageUrls = [
        ...(await Promise.all(upstreamImages.map((image) => imageReferenceToFalUrl(input.client, image)))),
        ...(await collectAssetPackReferenceUrls(input.client, input.run, assetPack, referenceLimit)),
      ].filter(Boolean).slice(0, referenceLimit)
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
      const imageSize = config.imageSize ?? { width: 1792, height: 2688 }
      const includeProviderGuidance = purpose !== 'cinematic_storyboard' && role !== 'cinematic_storyboard'
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
      const imageOutput = {
        assetKey,
        storagePath,
        mimeType,
        width: falResult.width,
        height: falResult.height,
        prompt,
        providerPrompt,
        role,
        provider: 'fal',
        model,
        providerRequestId: falResult.requestId,
        referenceImageCount: referenceImageUrls.length,
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
        pageNumber: Number(config.pageNumber ?? 0) || null,
        referenceImageCount: referenceImageUrls.length,
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
          : role === 'comic_atlas'
            ? 'Comic style atlas generated from selected world entities.'
            : role === 'comic_page'
              ? 'Comic page image generated from comic script and atlas reference.'
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
      const prompt = readFirstUpstreamText(input.upstream, ['prompt', 'text'])
        || readText(input.node.inputs.prompt)
        || input.run.prompt
      if (!prompt) throw new Error('Video generation node is missing a prompt.')
      const priorStepOutputs = asRecord(input.priorStep?.outputs)
      if (hasStoredOutputs(priorStepOutputs) && input.priorStep?.outputHash && hasStoredOutputs(asRecord(priorStepOutputs.video))) {
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
      const resolution = readText(config.resolution) || '720p'
      const model = readText(config.model)
        || Deno.env.get('OUTPUT_WORKFLOW_VIDEO_MODEL')?.trim()
        || (resolution === '1080p' ? 'bytedance/seedance-2.0/reference-to-video' : 'bytedance/seedance-2.0/fast/reference-to-video')
      const durationSeconds = Math.max(4, Math.min(15, Number(config.durationSeconds ?? 8) || 8))
      const aspectRatio = readText(config.aspectRatio) || '16:9'
      const generateAudio = config.generateAudio !== false
      const syncMode = config.syncMode === true
      const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
      const upstreamImages = readUpstreamImages(input.upstream)
      const directImageUrls = (await Promise.all(upstreamImages.map((image) => imageReferenceToFalUrl(input.client, image)))).filter(Boolean)
      const assetPackImageUrls = await collectAssetPackReferenceUrls(input.client, input.run, assetPack, 9)
      const referenceImageUrls = [...new Set([...directImageUrls, ...assetPackImageUrls])].slice(0, 9)
      const upstreamVideos = readUpstreamVideos(input.upstream, ['videoReferences', 'referenceVideos'])
      const referenceVideoUrls = (await Promise.all(upstreamVideos.map((video) => imageReferenceToFalUrl(input.client, video))))
        .filter(Boolean)
        .slice(0, 3)
      const referenceAudioUrls: string[] = []
      const totalReferences = referenceImageUrls.length + referenceVideoUrls.length + referenceAudioUrls.length
      if (totalReferences > 12) {
        throw new Error('Seedance 2 reference-to-video supports at most 12 total reference files.')
      }
      const buildProviderPrompt = (imageUrls: string[], referencePolicy: string) => [
        prompt,
        'Provider requirements:',
        '- Generate one finished Seedance 2 reference-to-video clip only.',
        `- Duration must be ${durationSeconds} seconds. Aspect ratio: ${aspectRatio}. Resolution: ${resolution}.`,
        imageUrls.length > 0 ? `- Reference images are ordered as @Image1 through @Image${imageUrls.length}; @Image1 is usually the storyboard grid.` : '- No image references are attached; use the written continuity anchors in the prompt.',
        referenceVideoUrls.length > 0 ? `- Reference videos are ordered as @Video1 through @Video${referenceVideoUrls.length}.` : '',
        referencePolicy !== 'storyboard_and_asset_refs' ? `- Reference fallback mode: ${referencePolicy}. Preserve character continuity from written entity descriptions instead of rejected identity images.` : '',
        '- Keep one dominant action path and one coherent camera direction for the clip.',
        imageUrls.length > 0 ? '- Preserve identity, wardrobe, environment, product, and prop continuity from references.' : '- Preserve identity, wardrobe, environment, product, and prop continuity from written descriptions.',
        '- Do not include GraphCore, workflow, node, schema, or internal ID wording in visible text.',
      ].filter(Boolean).join('\n')
      const storyboardOnlyUrls = directImageUrls.slice(0, 1)
      const referenceAttempts = [
        { policy: 'storyboard_and_asset_refs', imageUrls: referenceImageUrls },
        { policy: 'storyboard_only', imageUrls: storyboardOnlyUrls },
        { policy: 'text_only_no_image_refs', imageUrls: [] },
      ].filter((attempt, index, attempts) => (
        index === attempts.findIndex((candidate) => candidate.policy === attempt.policy
          && candidate.imageUrls.join('\n') === attempt.imageUrls.join('\n'))
      ))
      const priorFailedReferencePolicy = isFalReferencePolicyError(input.priorStep?.errorMessage)
      const startAttemptIndex = priorFailedReferencePolicy && referenceAttempts.length > 1 ? 1 : 0
      let falResult: Awaited<ReturnType<typeof waitForOutputFalVideo>> | null = null
      let providerPrompt = ''
      let usedReferenceImageUrls = referenceImageUrls
      let referencePolicy = 'storyboard_and_asset_refs'
      for (let attemptIndex = startAttemptIndex; attemptIndex < referenceAttempts.length; attemptIndex += 1) {
        const attempt = referenceAttempts[attemptIndex]
        providerPrompt = buildProviderPrompt(attempt.imageUrls, attempt.policy)
        usedReferenceImageUrls = attempt.imageUrls
        referencePolicy = attempt.policy
        try {
          falResult = await waitForOutputFalVideo({
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
                },
              })
            },
          })
          break
        } catch (error) {
          if (isFalReferencePolicyError(error) && attemptIndex < referenceAttempts.length - 1) {
            continue
          }
          throw error
        }
      }
      if (!falResult) throw new Error('Fal video generation did not return a result.')
      const videoBytes = await downloadRemoteBytes(falResult.videoUrl)
      const extension = falResult.mimeType.includes('webm') ? 'webm' : 'mp4'
      const assetKey = `output.${slugify(input.workflow.name)}.${input.run.id.slice(0, 8)}.${slugify(input.node.key)}`
      const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slugify(input.node.key)}.${extension}`
      await uploadBytes(input.client, storagePath, videoBytes, falResult.mimeType)
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
        providerRequestId: falResult.requestId,
        providerMode: 'fal_queue',
        providerStatus: 'COMPLETED',
        falRequestId: falResult.requestId,
        falStatusUrl: falResult.statusUrl,
        falResponseUrl: falResult.responseUrl,
        falVideoUrl: falResult.videoUrl,
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
        mimeType: falResult.mimeType,
        metadata,
      })
      const outputs = {
        video: {
          assetKey,
          storagePath,
          mimeType: falResult.mimeType,
          prompt,
          providerPrompt,
          provider: 'fal',
          model,
          providerRequestId: falResult.requestId,
          durationSeconds,
          aspectRatio,
          resolution,
          generateAudio,
          referenceImageCount: usedReferenceImageUrls.length,
          referenceVideoCount: referenceVideoUrls.length,
          referenceAudioCount: referenceAudioUrls.length,
          referencePolicy,
          role: readText(config.role) || readText(config.purpose) || 'video',
          blockNumber: Number(config.blockNumber ?? 0) || null,
        },
        assetKey,
        storagePath,
        mimeType: falResult.mimeType,
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
        provider: 'fal',
        model,
        providerRequestId: falResult.requestId,
      }
    }
    case 'utility_transform': {
      const purpose = readText(asRecord(input.node.config).purpose)
      if (purpose === 'cinematic_storyboard_prompt') {
        const config = asRecord(input.node.config)
        const blockScript = readFirstUpstreamRecord(input.upstream, ['blockScript', 'block_script', 'script'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const gridDimension = Math.max(3, Math.min(4, Number(config.gridDimension ?? 3) || 3))
        const storyboardPrompt = buildCinematicStoryboardPrompt({
          blockScript,
          assetPack,
          gridDimension,
          prompt: input.run.prompt,
          guidance,
        })
        const outputs = {
          prompt: storyboardPrompt,
          text: storyboardPrompt,
          blockScript,
          assetPack,
          gridDimension,
          panelCount: gridDimension * gridDimension,
          guidance,
          deterministic: true,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'deterministic-cinematic-storyboard-prompt-v1',
        }
      }
      if (purpose === 'cinematic_video_prompt') {
        const config = asRecord(input.node.config)
        const blockScript = readFirstUpstreamRecord(input.upstream, ['blockScript', 'block_script', 'script'])
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const upstreamImages = readUpstreamImages(input.upstream)
        const packedEntities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
        const assetReferenceCount = new Set(packedEntities.flatMap((entity) => readStringArray(entity.assetKeys))).size
        const referenceImageCount = Math.min(9, Math.max(1, upstreamImages.length + assetReferenceCount))
        const durationSeconds = Math.max(4, Math.min(15, Number(config.durationSeconds ?? 8) || 8))
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
        })
        const outputs = {
          prompt: videoPrompt,
          text: videoPrompt,
          blockScript,
          assetPack,
          durationSeconds,
          referenceImageCount,
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
        const videos = collectCinematicBlockVideos(input.upstream)
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
        const outputs = {
          prompt: pagePrompt,
          text: pagePrompt,
          pageNumber,
          pageCount,
          scriptPage,
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
        const atlasImage = readUpstreamImages(input.upstream, ['image']).find((image) => readText(image.role) === 'comic_atlas') ?? null
        const context = worldContextFromRunInput(input.run)
        const renderMetadata = {
          renderer: 'graphcore-comic-pdf-v1',
          pageSize: '6.625in x 10.25in',
          pageCount: comicPages.length,
          scriptCharacterCount: markdown.length,
          sequenceUnitKey: readStringArray(input.run.input.sourceSequenceUnitKeys)[0] ?? '',
          atlasAssetKey: readText(atlasImage?.assetKey),
          title: readText(script.title) || titleFromContext(context),
        }
        const outputs = {
          markdown,
          text: markdown,
          script,
          comicPages,
          pageImages: comicPages,
          atlasImage,
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
        const atlasImage = readFirstUpstreamImage(input.upstream, ['atlasImage'])
        if (comicPages.length === 0) throw new Error('Comic PDF artifact requires generated comic page images.')
        const artifact = await registerComicArtifact({
          client: input.client,
          run: input.run,
          workflow: input.workflow,
          node: input.node,
          comicPages,
          scriptMarkdown: markdown,
          script,
          atlasImage,
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
          atlasAssetKey: readText(atlasImage?.assetKey),
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

  const bundle = await loadOutputWorkflowRunBundle(input.client, runId)

  try {
    const validation = validateOutputWorkflowGraph({ nodes: bundle.nodes, edges: bundle.edges })
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
    const selectedSubgraph = selectOutputWorkflowRunSubgraph({
      nodes: bundle.nodes,
      edges: bundle.edges,
      targetNodeKeys,
      runScope: runScope === 'node_only' || runScope === 'node_and_downstream' || runScope === 'artifact_rebake'
        ? runScope
        : 'upstream_to_node',
    })
    if (selectedSubgraph.diagnostics.length > 0) throw new Error(selectedSubgraph.diagnostics.join(' '))
    const executionNodes = selectedSubgraph.nodes
    const executionEdges = selectedSubgraph.edges
    const executionPlan = buildOutputWorkflowExecutionPlan(executionNodes, executionEdges)
    const nodeByKey = new Map(executionNodes.map((node) => [node.key, node]))
    const workflowNodeByKey = new Map(bundle.nodes.map((node) => [node.key, node]))
    const executionNodeKeys = new Set(executionNodes.map((node) => node.key))
    const cachedExternalUpstreamByNodeKey = new Map(executionNodes.map((node) => [node.key, collectCachedExternalUpstream({
      node,
      nodesByKey: workflowNodeByKey,
      executionNodeKeys,
      edges: bundle.edges,
    })] as const))
    const missingCachedInputs = [...cachedExternalUpstreamByNodeKey.entries()]
      .flatMap(([nodeKey, cached]) => cached.missingNodeKeys.map((sourceKey) => `${nodeKey} <- ${sourceKey}`))
    if (missingCachedInputs.length > 0) {
      throw new Error(`Cannot run this node only because required upstream cached output is missing: ${missingCachedInputs.join(', ')}. Run up to this node first.`)
    }
    const stepByNodeKey = new Map(bundle.run.steps.map((step) => [step.nodeKey, step]))
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
                execution: {
                  ...asRecord(asRecord(node.metadata).execution),
                  level: executionLevelByNodeKey.get(node.key) ?? 0,
                  resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
                  lastRunId: runId,
                  recoveredFromRunStep: true,
                },
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
          nodeResults.set(node.key, {
            inputHash: canHashSkip ? inputHash : node.inputHash || inputHash,
            outputHash: node.outputHash,
            outputs: node.outputs,
            provider: 'graphcore',
            model: 'cached-node-output',
            skipped: true,
            skippedReason: canHashSkip ? 'input_hash_unchanged' : 'existing_output_reused_for_targeted_rebake',
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
          skipped: false,
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
              execution: {
                ...asRecord(asRecord(node.metadata).execution),
                level: executionLevelByNodeKey.get(node.key) ?? 0,
                resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
                lastRunId: runId,
              },
              guidance: guidanceMetadata,
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
        const aiUsage = buildOutputStepAiUsage({ node, result, skipped })
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
