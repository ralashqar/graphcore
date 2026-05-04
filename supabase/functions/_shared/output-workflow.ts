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

const OUTPUT_WORKFLOW_EXECUTOR_VERSION = 'comic-script-continuity-soft-v8'
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
  renderMode?: 'ebook' | 'comic'
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

function hasStoredOutputs(value: unknown) {
  return Object.keys(asRecord(value)).length > 0
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
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
    .filter((entity) => sourceEntityKeys.length === 0 || sourceEntityKeys.includes(String(entity.key)))
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
    visualDescription: readText(asRecord(entity.metadata).visualDescription),
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
    visualDescription: readText(asRecord(entity.metadata).visualDescription) || readText(entity.context),
    assetKeys: entityAssetKeys(entity, assets),
  })).filter((entity) => entity.key || entity.name)
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
    return {
      key,
      name: readText(entity.name) || readText(fallback.name),
      type: readText(entity.type) || readText(fallback.type),
      role: readText(entity.role) || readText(fallback.role) || readText(entity.type) || readText(fallback.type),
      summary: readText(entity.summary) || readText(fallback.summary),
      visualDescription: fallbackVisualDescription || readText(entity.visualDescription),
      assetKeys: [...new Set(assetKeys)].filter(Boolean),
    }
  }).filter((entity) => entity.key || entity.name).slice(0, 16)
}

function buildComicEntitySelectorInstruction(input: {
  context: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  return [
    'Select the entities that must visually appear in this comic issue.',
    'Return only JSON with shape: {"entities":[{"key":"","name":"","type":"","role":"","visualDescription":"","assetKeys":[]}],"missingReferenceEntityKeys":[]}.',
    'Use the supplied entity keys exactly. Do not invent new keys.',
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
    const panels = Array.isArray(rawPage.panels) ? rawPage.panels.map(asRecord) : []
    const continuityNotes = readText(rawPage.continuityNotes)
      || (sequenceOutcome ? `Maintain continuity with selected sequence outcome: ${sequenceOutcome}` : '')
    return {
      pageNumber,
      panelLayout: readText(rawPage.panelLayout) || (pageNumber === 1 ? '4 cinematic panels with a strong establishing panel' : '5 balanced comic panels'),
      setting: readText(rawPage.setting),
      mood: readText(rawPage.mood),
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
  prompt: string
  guidance: OutputGuidanceBundle
  pageCount: number
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  return [
    `Write a ${input.pageCount}-page comic script from the selected sequence unit.`,
    'Return only JSON with shape: {"title":"","logline":"","pageCount":8,"pages":[{"pageNumber":1,"panelLayout":"","setting":"","mood":"","requiredEntityKeys":[],"continuityNotes":"","panels":[{"panelNumber":1,"shot":"","action":"","dialogue":"","caption":"","characters":[]}]}]}.',
    `The pages array must contain exactly ${input.pageCount} pages, numbered 1 through ${input.pageCount}.`,
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
      assetPack: input.assetPack,
      relationships: Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord).slice(0, 40) : [],
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
  const storagePath = readText(image.storagePath)
  if (!storagePath) return ''
  return projectAssetReferenceUrl(client, storagePath, readText(image.mimeType) || 'image/png')
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
      const storagePath = readText(asset?.storagePath)
      if (!storagePath) continue
      references.push(await projectAssetReferenceUrl(client, storagePath, readText(asset?.mimeType) || 'image/png'))
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

function collectComicPageImages(upstream: Record<string, Record<string, unknown>>) {
  return readUpstreamImages(upstream, ['comicPages', 'pageImages', 'pages', 'image'])
    .filter((image) => readText(image.role) === 'comic_page' || Number(image.pageNumber ?? 0) > 0)
    .map((image, index) => ({
      ...image,
      pageNumber: Number(image.pageNumber ?? index + 1) || index + 1,
    }))
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
    cover: input.coverImage ? {
      assetKey: readText(input.coverImage.assetKey),
      storagePath: readText(input.coverImage.storagePath),
      mimeType: readText(input.coverImage.mimeType),
      width: Number(input.coverImage.width ?? 0) || null,
      height: Number(input.coverImage.height ?? 0) || null,
      prompt: readText(input.coverImage.prompt),
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
        const model = outputWorkflowTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: 'You are a professional comic writer and comics editor. Return a complete production comic script as JSON only. Never return outline placeholders.',
          input: buildComicScriptInstruction({ context, assetPack, prompt, guidance, pageCount }),
          text: {
            format: {
              type: 'json_schema',
              name: 'output_workflow_comic_script',
              schema: comicScriptJsonSchema,
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
        const script = normalizeComicScript(parseJsonObject(response.outputText), { context, pageCount, prompt })
        const diagnostics = validateComicScript(script, { pageCount })
        if (diagnostics.length > 0) {
          throw new Error(`Comic script validation failed: ${diagnostics.slice(0, 8).join(' ')}`)
        }
        const markdown = comicScriptMarkdown(script)
        const outputs = {
          script,
          pages: script.pages,
          markdown,
          text: markdown,
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
      const quality = readText(config.quality) || Deno.env.get('OUTPUT_WORKFLOW_IMAGE_QUALITY')?.trim() || 'high'
      const outputFormat = readText(config.outputFormat) || 'png'
      const imageSize = config.imageSize ?? { width: 1792, height: 2688 }
      const providerPrompt = [
        prompt,
        '',
        guidanceMarkdown(guidance),
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
    case 'utility_transform': {
      const purpose = readText(asRecord(input.node.config).purpose)
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
      const guidance = readUpstreamGuidanceBundle(input.upstream)
      const coverImage = readFirstUpstreamImage(input.upstream, ['image', 'coverImage'])
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
        coverImage,
        guidance,
      }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-document-render-v1' }
    }
    case 'output_artifact': {
      const purpose = readText(asRecord(input.node.config).purpose)
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
    const reuseExistingUpstreamOutputs = runMetadata.reuseExistingUpstreamOutputs === true
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
      skippedReason?: string
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
        const priorStep = stepByNodeKey.get(node.key) ?? null
        const hasExistingOutputs = hasStoredOutputs(node.outputs)
        const hasRecoverableStepOutputs = !forceNode
          && !hasExistingOutputs
          && hasStoredOutputs(priorStep?.outputs)
          && Boolean(priorStep?.outputHash)
          && ['running', 'completed'].includes(priorStep?.status ?? '')
        const canHashSkip = !forceNode && !node.dirty && node.inputHash === inputHash && hasExistingOutputs
        const canReuseExistingOutput = !forceNode && reuseExistingUpstreamOutputs && hasExistingOutputs
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
          })
          return { status: 'skipped', outputs: node.outputs }
        }
        const result = await executeNode({
          run: bundle.run,
          workflow: bundle.workflow,
          node,
          priorStep,
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
            reason: skipped ? result?.skippedReason ?? 'input_hash_unchanged' : undefined,
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
          reuseExistingUpstreamOutputs,
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
        reuseExistingUpstreamOutputs,
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
