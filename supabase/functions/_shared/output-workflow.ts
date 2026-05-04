import {
  buildOutputWorkflowExecutionPlan,
  buildOutputWorkflowFingerprint,
  defaultOutputWorkflowConcurrency,
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
  topologicallySortOutputWorkflow,
  validateOutputWorkflowGraph,
  type OutputArtifact,
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
  type OutputWorkflowRun,
  type OutputWorkflowRunStep,
} from '../../../src/domain/outputWorkflow.ts'

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

function buildChapterPlan(context: Record<string, unknown>, outline: Array<Record<string, unknown>>) {
  const sequenceUnits = Array.isArray(context.sequenceUnits) ? context.sequenceUnits.map(asRecord) : []
  return outline.map((chapter, index) => {
    const sequenceUnit = sequenceUnits[index] ?? {}
    const sequence = readEntitySequence(sequenceUnit)
    return {
      number: Number(chapter.number ?? index + 1),
      title: readText(chapter.title) || readText(sequenceUnit.name) || `Chapter ${index + 1}`,
      synopsis: readText(chapter.synopsis) || readText(sequence.synopsis) || readText(sequenceUnit.summary),
      dramaticQuestion: readText(sequence.dramaticQuestion),
      outcome: readText(chapter.outcome) || readText(sequence.outcome),
      sequenceUnitKey: readText(sequenceUnit.key),
    }
  })
}

function generateChapterMarkdown(input: {
  context: Record<string, unknown>
  prompt: string
  chapterPlan: Array<Record<string, unknown>>
  chapterNumber: number
  sequenceUnitKey: string
  sequenceUnitName: string
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
  return [
    `## ${input.chapterNumber}. ${chapterTitle}`,
    '',
    synopsis || `This chapter develops ${chapterTitle} through the established world canon.`,
    '',
    dramaticQuestion ? `**Dramatic question:** ${dramaticQuestion}` : '',
    outcome ? `**Outcome:** ${outcome}` : '',
    entityNotes ? `**Canon anchors:** ${entityNotes}` : '',
    '',
    `**Writing brief:** ${input.prompt || 'Write polished chapter prose from the world graph.'}`,
    '',
    'This chapter draft is generated independently from its sequence-unit context, world context, and shared chapter plan. The consistency editor pass should smooth transitions and continuity after all chapter drafts complete.',
  ].filter(Boolean).join('\n')
}

function assembleChapterMarkdown(upstream: Record<string, Record<string, unknown>>) {
  const chapters = Object.entries(upstream)
    .map(([nodeKey, outputs]) => ({
      nodeKey,
      chapterNumber: Number(outputs.chapterNumber ?? 9999),
      markdown: readText(outputs.markdown) || readText(outputs.text),
    }))
    .filter((entry) => entry.markdown)
    .sort((left, right) => left.chapterNumber - right.chapterNumber || left.nodeKey.localeCompare(right.nodeKey))
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

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
}

function markdownToPlainLines(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^>\s?/gm, '')
    .split(/\r?\n/)
    .flatMap((line) => {
      const trimmed = line.trim()
      if (!trimmed) return ['']
      const chunks: string[] = []
      let current = trimmed
      while (current.length > 88) {
        const splitAt = Math.max(current.lastIndexOf(' ', 88), 50)
        chunks.push(current.slice(0, splitAt).trim())
        current = current.slice(splitAt).trim()
      }
      chunks.push(current)
      return chunks
    })
}

function buildSimplePdf(markdown: string) {
  const lines = markdownToPlainLines(markdown).slice(0, 240)
  const content = [
    'BT',
    '/F1 11 Tf',
    '50 780 Td',
    '14 TL',
    ...lines.map((line) => line ? `(${escapePdfText(line)}) Tj T*` : 'T*'),
    'ET',
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefAt = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`
  return new TextEncoder().encode(pdf)
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
}) {
  const slug = slugify(input.workflow.name)
  const artifactKey = `output.${slug}.${input.run.id.slice(0, 8)}`
  const assetKey = `${artifactKey}.pdf`
  const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.pdf`
  const bytes = buildSimplePdf(input.markdown)
  await uploadBytes(input.client, storagePath, bytes, 'application/pdf')
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
        markdownPreview: input.markdown.slice(0, 4000),
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (artifactResponse.error || !artifactResponse.data) throw new Error(artifactResponse.error?.message ?? 'Failed to register output artifact.')
  return mapOutputArtifactRow(artifactResponse.data as OutputArtifactRow)
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
  upstream: Record<string, Record<string, unknown>>
  inputHash: string
  client: DatabaseClient
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
    case 'text_llm': {
      const purpose = readText(asRecord(input.node.config).purpose)
      const prompt = readText(input.node.inputs.prompt) || input.run.prompt
      const context = asRecord(asRecord(input.upstream.world_context).context)
      if (purpose === 'outline') {
        const outline = outlineFromContext(context)
        const outputs = { outline, text: outline.map((chapter) => `${chapter.number}. ${chapter.title}`).join('\n') }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-outline-v1' }
      }
      if (purpose === 'chapter_plan') {
        const outline = readFirstUpstreamArray(input.upstream, ['outline'])
        const chapterPlan = buildChapterPlan(context, outline.length > 0 ? outline : outlineFromContext(context))
        const text = chapterPlan.map((chapter) => `${chapter.number}. ${chapter.title}: ${chapter.synopsis}`).join('\n')
        const outputs = { chapterPlan, plan: chapterPlan, text }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-chapter-plan-v1' }
      }
      if (purpose === 'chapter_prose') {
        const config = asRecord(input.node.config)
        const chapterNumber = Number(config.chapterNumber ?? 1)
        const sequenceUnitKey = readText(config.sequenceUnitKey)
        const sequenceUnitName = readText(config.sequenceUnitName)
        const chapterPlan = readFirstUpstreamArray(input.upstream, ['chapterPlan', 'plan'])
        const markdown = generateChapterMarkdown({
          context,
          prompt,
          chapterPlan: chapterPlan.length > 0 ? chapterPlan : buildChapterPlan(context, outlineFromContext(context)),
          chapterNumber,
          sequenceUnitKey,
          sequenceUnitName,
        })
        const outputs = { markdown, text: markdown, chapterNumber, sequenceUnitKey, sourceSequenceUnitKeys: sequenceUnitKey ? [sequenceUnitKey] : [] }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-chapter-prose-v1' }
      }
      if (purpose === 'front_back_matter') {
        const source = readFirstUpstreamText(input.upstream)
        const markdown = addFrontBackMatter(worldContextFromRunInput(input.run), editMarkdown(source))
        const outputs = { markdown, text: markdown }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-front-back-matter-v1' }
      }
      const source = readFirstUpstreamText(input.upstream)
      const markdown = editMarkdown(source)
      const outputs = { markdown, text: markdown }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-editor-v1' }
    }
    case 'utility_transform': {
      const purpose = readText(asRecord(input.node.config).purpose)
      if (purpose === 'chapter_assembly') {
        const markdown = assembleChapterMarkdown(input.upstream)
        const outputs = { markdown, text: markdown }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-chapter-assembly-v1' }
      }
      const outputs = { output: input.upstream }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-utility-v1' }
    }
    case 'document_render': {
      const markdown = readFirstUpstreamText(input.upstream)
      const outputs = {
        markdown,
        mimeType: 'application/pdf',
        fileName: `${slugify(input.workflow.name)}.pdf`,
      }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-document-render-v1' }
    }
    case 'output_artifact': {
      const markdown = readFirstUpstreamText(input.upstream)
      const artifact = await registerDocumentArtifact({
        client: input.client,
        run: input.run,
        workflow: input.workflow,
        node: input.node,
        markdown,
      })
      const outputs = { artifactKey: artifact.key, assetKey: artifact.assetKey, artifact }
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

    const executionPlan = buildOutputWorkflowExecutionPlan(bundle.nodes, bundle.edges)
    const nodeByKey = new Map(bundle.nodes.map((node) => [node.key, node]))
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

    const schedulerResult = await runOutputWorkflowReadyQueue({
      nodes: bundle.nodes,
      edges: bundle.edges,
      globalMaxConcurrency: defaultOutputWorkflowConcurrency.global,
      resourceClassMaxConcurrency: defaultOutputWorkflowConcurrency.resourceClasses,
      shouldCancel: async () => {
        const cancellationResponse = await input.client
          .from('output_workflow_runs')
          .select('status')
          .eq('id', runId)
          .single()
        if (cancellationResponse.error) throw new Error(cancellationResponse.error.message)
        return (cancellationResponse.data as { status?: string } | null)?.status === 'cancelled'
      },
      executeNode: async ({ node, upstream }) => {
        const inputHash = computeNodeInputHash({ run: bundle.run, node, upstream })
        if (!node.dirty && node.inputHash === inputHash && Object.keys(node.outputs).length > 0) {
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
          upstream,
          inputHash,
          client: input.client,
        })
        nodeResults.set(node.key, {
          inputHash: result.inputHash,
          outputHash: result.outputHash,
          outputs: result.outputs,
          provider: result.provider,
          model: result.model,
          skipped: false,
        })
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
            },
          })
          .eq('id', node.id)
        if (updateNodeResponse.error) throw new Error(updateNodeResponse.error.message)
        return { status: 'completed', outputs: result.outputs }
      },
      onNodeStart: async ({ node, orderIndex, resourceClass }) => {
        await setStepStatus(input.client, {
          runId,
          node,
          status: 'running',
          draftId: bundle.run.draftId,
          orderIndex,
          metadata: {
            stage: node.nodeType,
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass,
            groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
          },
        })
      },
      onNodeComplete: async ({ node, orderIndex, skipped }) => {
        const result = nodeResults.get(node.key)
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
            skipped,
            reason: skipped ? 'input_hash_unchanged' : undefined,
          },
        })
      },
      onNodeFailed: async ({ node, orderIndex, error, blockedDependents }) => {
        const message = error instanceof Error ? error.message : String(error)
        await setStepStatus(input.client, {
          runId,
          node,
          status: 'failed',
          draftId: bundle.run.draftId,
          orderIndex,
          errorMessage: message,
          metadata: {
            stage: node.nodeType,
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
            blockedDependents,
          },
        })
      },
      onNodeCancelled: async ({ node, orderIndex, reason, blockedBy }) => {
        await setStepStatus(input.client, {
          runId,
          node,
          status: 'cancelled',
          draftId: bundle.run.draftId,
          orderIndex,
          errorMessage: reason === 'blocked_by_failed_dependency' ? `Blocked by ${blockedBy}.` : null,
          metadata: {
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
  topologicallySortOutputWorkflow,
  validateOutputWorkflowGraph,
}
