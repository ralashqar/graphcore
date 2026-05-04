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
  outputWorkflowCancelResponseSchema,
  outputWorkflowEdgeSchema,
  outputWorkflowPlanRequestSchema,
  outputWorkflowPlanResponseSchema,
  outputWorkflowRunSchema,
  outputWorkflowRunStatusResponseSchema,
  outputWorkflowSchema,
  outputWorkflowStartResponseSchema,
  planOutputWorkflow,
  runOutputWorkflowReadyQueue,
  selectOutputWorkflowRunSubgraph,
  topologicallySortOutputWorkflow,
  validateOutputWorkflowGraph,
  type OutputArtifact,
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
  type OutputWorkflowRun,
  type OutputWorkflowRunStep,
} from '../../../src/domain/outputWorkflow.ts'
import { buildEbookDocumentMetadata } from '../../../src/domain/ebookDocument.ts'
import { hashOutputGuidanceBundle, outputGuidanceBundleSchema, type OutputGuidanceBundle } from '../../../src/domain/outputSkills.ts'
import {
  cancelOpenAiResponse,
  createOpenAiBackgroundResponse,
  retrieveOpenAiResponse,
  runOpenAiResponses,
  type OpenAiResponseResult,
} from './openai.ts'

const OUTPUT_WORKFLOW_EXECUTOR_VERSION = 'ebook-full-chapter-background-v4'
const DEFAULT_CHAPTER_PROSE_TIMEOUT_MS = 3_600_000
const DEFAULT_CHAPTER_PROSE_ATTEMPTS = 2

export type OutputDocumentRenderer = (input: {
  markdown: string
  title: string
  subtitle: string
  provenance: string
  generatedAt: string
  fileName: string
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
    }
  }
}

export const outputWorkflowSelect = 'id, project_id, draft_id, key, name, description, preset, status, created_by, metadata, created_at, updated_at'
export const outputWorkflowNodeSelect = 'id, workflow_id, key, node_type, label, position, config, inputs, outputs, dirty, input_hash, output_hash, metadata, created_at, updated_at'
export const outputWorkflowEdgeSelect = 'id, workflow_id, key, source_node_key, source_port, target_node_key, target_port, metadata, created_at, updated_at'
export const outputWorkflowRunSelect = 'id, project_id, draft_id, workflow_id, requested_by, status, preset, prompt, target_format, world_snapshot_fingerprint, input, outputs, error_message, worker_id, heartbeat_at, attempt_count, metadata, started_at, completed_at, created_at, updated_at'
export const outputWorkflowRunStepSelect = 'id, run_id, workflow_id, node_id, node_key, node_type, status, order_index, label, input_hash, output_hash, outputs, provider, model, provider_request_id, error_message, metadata, started_at, completed_at, created_at, updated_at'
export const outputArtifactSelect = 'id, project_id, draft_id, workflow_id, run_id, node_id, key, name, kind, asset_key, mime_type, summary, metadata, created_at, updated_at'

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

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

function readEntitySequence(entity: Record<string, unknown>) {
  const customProperties = asRecord(entity.customProperties ?? entity.custom_properties)
  return asRecord(customProperties.sequence)
}

function extractWorldContext(run: OutputWorkflowRun, node: OutputWorkflowNode) {
  const input = asRecord(run.input)
  const entities = Array.isArray(input.worldEntities) ? input.worldEntities.map(asRecord) : []
  const relationships = Array.isArray(input.worldRelationships) ? input.worldRelationships.map(asRecord) : []
  const wiki = asRecord(input.worldWiki)
  const config = asRecord(node.config)
  const sourceEntityKeys = Array.isArray(config.sourceEntityKeys) ? config.sourceEntityKeys.filter((entry): entry is string => typeof entry === 'string') : []
  const sourceSequenceUnitKeys = Array.isArray(config.sourceSequenceUnitKeys) ? config.sourceSequenceUnitKeys.filter((entry): entry is string => typeof entry === 'string') : []
  const sequenceUnits = entities
    .filter((entity) => entity.nodeType === 'sequence_unit' || entity.node_type === 'sequence_unit')
    .filter((entity) => sourceSequenceUnitKeys.length === 0 || sourceSequenceUnitKeys.includes(String(entity.key)))
    .sort((left, right) => Number(readEntitySequence(left).ordinal ?? 0) - Number(readEntitySequence(right).ordinal ?? 0))
  const worldEntities = entities
    .filter((entity) => entity.nodeType !== 'sequence_unit' && entity.node_type !== 'sequence_unit')
    .filter((entity) => sourceEntityKeys.length === 0 || sourceEntityKeys.includes(String(entity.key)))
  return {
    wiki,
    entities: worldEntities,
    sequenceUnits,
    relationships,
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

async function registerDocumentArtifact(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  markdown: string
  guidance?: OutputGuidanceBundle | null
  documentRenderer?: OutputDocumentRenderer | null
}) {
  const slug = slugify(input.workflow.name)
  const artifactKey = `output.${slug}.${input.run.id.slice(0, 8)}`
  const assetKey = `${artifactKey}.pdf`
  const markdownArtifactKey = `${artifactKey}.manuscript`
  const markdownAssetKey = `${artifactKey}.md`
  const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.pdf`
  const markdownStoragePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.md`
  const context = worldContextFromRunInput(input.run)
  const wiki = asRecord(context.wiki)
  const title = titleFromContext(context)
  const subtitle = readText(wiki.logline) || readText(wiki.subtitle)
  const generatedAt = new Date().toISOString()
  const provenance = 'Generated from the GraphCore world graph'
  const baseRenderMetadata = buildEbookDocumentMetadata(input.markdown, {
    title,
    subtitle,
    provenance,
    generatedAt,
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
    model: 'deterministic-ebook-v1',
    storageBucket: 'project-assets',
    storagePath,
    sourceEntityKeys: input.run.input.sourceEntityKeys ?? [],
    sourceSequenceUnitKeys: input.run.input.sourceSequenceUnitKeys ?? [],
    skillKeys: input.guidance?.skillKeys ?? [],
    skillVersions: input.guidance?.skillVersions ?? {},
    guidanceHash: input.guidance?.guidanceHash ?? '',
    resolvedGuidancePreview: input.guidance?.resolvedGuidancePreview ?? '',
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
      summary: 'Written ebook PDF generated from the world graph.',
      metadata: {
        ...assetMetadata,
        companionMarkdownAssetKey: markdownAssetKey,
        companionMarkdownArtifactKey: markdownArtifactKey,
        markdownPreview: input.markdown.slice(0, 4000),
        markdownPreviewOnly: true,
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (artifactResponse.error || !artifactResponse.data) throw new Error(artifactResponse.error?.message ?? 'Failed to register output artifact.')
  const markdownArtifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: markdownArtifactKey,
      name: `${input.workflow.name} Manuscript`,
      kind: 'manuscript',
      asset_key: markdownAssetKey,
      mime_type: 'text/markdown',
      summary: 'Full manuscript Markdown generated from the world graph.',
      metadata: {
        ...markdownAssetMetadata,
        primaryPdfAssetKey: assetKey,
        markdownPreview: input.markdown.slice(0, 4000),
        markdownPreviewOnly: true,
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (markdownArtifactResponse.error || !markdownArtifactResponse.data) throw new Error(markdownArtifactResponse.error?.message ?? 'Failed to register manuscript artifact.')
  return {
    pdfArtifact: mapOutputArtifactRow(artifactResponse.data as OutputArtifactRow),
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
    case 'utility_transform': {
      const purpose = readText(asRecord(input.node.config).purpose)
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
      const outputs = { output: input.upstream }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-utility-v1' }
    }
    case 'document_render': {
      const markdown = readFirstUpstreamText(input.upstream)
      const guidance = readUpstreamGuidanceBundle(input.upstream)
      const context = worldContextFromRunInput(input.run)
      const wiki = asRecord(context.wiki)
      const title = titleFromContext(context)
      const subtitle = readText(wiki.logline) || readText(wiki.subtitle)
      const renderMetadata = buildEbookDocumentMetadata(markdown, {
        title,
        subtitle,
        provenance: 'Generated from the GraphCore world graph',
        generatedAt: new Date().toISOString(),
      })
      const outputs = {
        markdown,
        mimeType: 'application/pdf',
        fileName: `${slugify(input.workflow.name)}.pdf`,
        renderMetadata,
        guidance,
      }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-document-render-v1' }
    }
    case 'output_artifact': {
      const markdown = readFirstUpstreamText(input.upstream)
      const guidance = readUpstreamGuidanceBundle(input.upstream)
      const artifact = await registerDocumentArtifact({
        client: input.client,
        run: input.run,
        workflow: input.workflow,
        node: input.node,
        markdown,
        guidance,
        documentRenderer: input.documentRenderer,
      })
      const outputs = {
        artifactKey: artifact.pdfArtifact.key,
        assetKey: artifact.pdfArtifact.assetKey,
        markdownArtifactKey: artifact.markdownArtifact.key,
        markdownAssetKey: artifact.markdownArtifact.assetKey,
        artifact: artifact.pdfArtifact,
        artifacts: [artifact.pdfArtifact, artifact.markdownArtifact],
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
    const selectedSubgraph = selectOutputWorkflowRunSubgraph({
      nodes: bundle.nodes,
      edges: bundle.edges,
      targetNodeKeys,
    })
    if (selectedSubgraph.diagnostics.length > 0) throw new Error(selectedSubgraph.diagnostics.join(' '))
    const executionNodes = selectedSubgraph.nodes
    const executionEdges = selectedSubgraph.edges
    const executionPlan = buildOutputWorkflowExecutionPlan(executionNodes, executionEdges)
    const nodeByKey = new Map(executionNodes.map((node) => [node.key, node]))
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
        const inputHash = computeNodeInputHash({ run: bundle.run, node, upstream })
        const forceNode = forceNodeKeys.has(node.key)
        if (!forceNode && !node.dirty && node.inputHash === inputHash && Object.keys(node.outputs).length > 0) {
          nodeResults.set(node.key, {
            inputHash,
            outputHash: node.outputHash,
            outputs: node.outputs,
            provider: 'graphcore',
            model: 'cached-node-output',
            skipped: true,
          })
          return { status: 'skipped', outputs: node.outputs }
        }
        const result = await executeNode({
          run: bundle.run,
          workflow: bundle.workflow,
          node,
          priorStep: stepByNodeKey.get(node.key) ?? null,
          upstream,
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
                executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
                resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
                groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
                ...progress.metadata,
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
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass,
            groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
          },
        })
      },
      onNodeComplete: async ({ node, orderIndex, skipped }) => {
        const result = nodeResults.get(node.key)
        const guidanceMetadata = guidanceStepMetadata(result?.outputs.guidance)
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
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
            groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
            ...guidanceMetadata,
            skipped,
            reason: skipped ? 'input_hash_unchanged' : undefined,
          },
        })
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
          targetNodeKeys,
          forceNodeKeys: [...forceNodeKeys],
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
        targetNodeKeys,
        forceNodeKeys: [...forceNodeKeys],
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
