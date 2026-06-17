import {
  childWorkflowUtilityOutputSchema,
  type ChildWorkflowUtilityOutput,
} from '../../../src/domain/outputWorkflowManifests.ts'
import {
  outputRequestSchema,
  outputWorkflowEdgeSchema,
  outputWorkflowSchema,
  type OutputRequest,
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
} from '../../../src/domain/outputWorkflow.ts'

type EnsureChildWorkflowClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
}

type ChildWorkflowReadClient = {
  from: (table: string) => any
}

type ChildWorkflowWriteClient = {
  from: (table: string) => any
  rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

function mapChildWorkflowRow(row: Record<string, unknown>) {
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

function mapChildWorkflowNodeRow(row: Record<string, unknown>): OutputWorkflowNode {
  return {
    id: readText(row.id),
    workflowId: readText(row.workflow_id),
    key: readText(row.key),
    nodeType: readText(row.node_type) as OutputWorkflowNode['nodeType'],
    label: readText(row.label),
    position: {
      x: Number(asRecord(row.position).x ?? 0),
      y: Number(asRecord(row.position).y ?? 0),
    },
    config: asRecord(row.config),
    inputs: asRecord(row.inputs),
    outputs: asRecord(row.outputs),
    dirty: row.dirty !== false,
    inputHash: readText(row.input_hash),
    outputHash: readText(row.output_hash),
    metadata: asRecord(row.metadata),
    createdAt: readText(row.created_at),
    updatedAt: readText(row.updated_at),
  }
}

function mapChildRequestRow(row: Record<string, unknown>) {
  return outputRequestSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    parentRequestId: row.parent_request_id,
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

function mapChildWorkflowEdgeRow(row: Record<string, unknown>) {
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

export async function ensureChildWorkflow(input: {
  client: EnsureChildWorkflowClient
  projectId: string
  draftId: string
  parentRequestId: string
  role: string
  identityKey: string
  identityValue: string
  workflow: Record<string, unknown>
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
  request: Record<string, unknown>
}) {
  const response = await input.client.rpc('ensure_sequence_animatic_child_workflow', {
    p_project_id: input.projectId,
    p_draft_id: input.draftId,
    p_parent_request_id: input.parentRequestId,
    p_role: input.role,
    p_identity_key: input.identityKey,
    p_identity_value: input.identityValue,
    p_workflow: input.workflow,
    p_nodes: input.nodes,
    p_edges: input.edges,
    p_request: input.request,
  })
  if (response.error) throw new Error(response.error.message)
  const ensured = asRecord(response.data)
  return {
    request: asRecord(ensured.request),
    workflow: asRecord(ensured.workflow),
    nodes: Array.isArray(ensured.nodes) ? ensured.nodes.map(asRecord) : [],
    edges: Array.isArray(ensured.edges) ? ensured.edges.map(asRecord) : [],
    created: ensured.created === true,
    reused: ensured.reused === true,
  }
}

export async function ensureMappedChildWorkflow(input: Parameters<typeof ensureChildWorkflow>[0]) {
  const ensured = await ensureChildWorkflow(input)
  return {
    request: mapChildRequestRow(ensured.request),
    workflow: Object.keys(asRecord(ensured.workflow)).length > 0
      ? mapChildWorkflowRow(ensured.workflow)
      : null,
    nodes: ensured.nodes.map(mapChildWorkflowNodeRow),
    edges: ensured.edges.map(mapChildWorkflowEdgeRow),
    created: ensured.created,
    reused: ensured.reused,
  }
}

export type MappedChildWorkflowEnsureResult = Awaited<ReturnType<typeof ensureMappedChildWorkflow>>

export type ChildWorkflowEnsureAccumulator = {
  requests: OutputRequest[]
  workflowIds: string[]
  workflows: OutputWorkflow[]
  nodes: OutputWorkflowNode[]
  edges: OutputWorkflowEdge[]
}

export function createChildWorkflowEnsureAccumulator(initialRequests: OutputRequest[] = []): ChildWorkflowEnsureAccumulator {
  return {
    requests: [...initialRequests],
    workflowIds: [],
    workflows: [],
    nodes: [],
    edges: [],
  }
}

export function appendEnsuredChildWorkflow(
  accumulator: ChildWorkflowEnsureAccumulator,
  ensured: MappedChildWorkflowEnsureResult,
) {
  accumulator.requests.push(ensured.request)
  if (ensured.workflow?.id) {
    accumulator.workflowIds.push(ensured.workflow.id)
    accumulator.workflows.push(ensured.workflow)
  }
  accumulator.nodes.push(...ensured.nodes)
  accumulator.edges.push(...ensured.edges)
  return ensured.request
}

function uniqueText(values: readonly unknown[]) {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const text = readText(value)
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
  }
  return result
}

export async function loadChildWorkflowGraphBundle(input: {
  client: ChildWorkflowReadClient
  workflowIds: readonly (string | null | undefined)[]
}) {
  const workflowIds = uniqueText(input.workflowIds)
  if (workflowIds.length === 0) {
    return { workflows: [], nodes: [], edges: [] }
  }
  const [workflowRows, nodeRows, edgeRows] = await Promise.all([
    input.client.from('output_workflows').select('*').in('id', workflowIds),
    input.client.from('output_workflow_nodes').select('*').in('workflow_id', workflowIds),
    input.client.from('output_workflow_edges').select('*').in('workflow_id', workflowIds),
  ])
  if (workflowRows.error) throw new Error(workflowRows.error.message)
  if (nodeRows.error) throw new Error(nodeRows.error.message)
  if (edgeRows.error) throw new Error(edgeRows.error.message)
  return {
    workflows: (workflowRows.data ?? []).map((row: unknown) => mapChildWorkflowRow(asRecord(row))),
    nodes: (nodeRows.data ?? []).map((row: unknown) => mapChildWorkflowNodeRow(asRecord(row))),
    edges: (edgeRows.data ?? []).map((row: unknown) => mapChildWorkflowEdgeRow(asRecord(row))),
  }
}

export async function loadWorkflowNodesByKey(input: {
  client: ChildWorkflowReadClient
  workflowId: string | null | undefined
  nodeKeys: readonly (string | null | undefined)[]
}) {
  const workflowId = readText(input.workflowId)
  const nodeKeys = uniqueText(input.nodeKeys)
  if (!workflowId || nodeKeys.length === 0) return []
  const response = await input.client
    .from('output_workflow_nodes')
    .select('*')
    .eq('workflow_id', workflowId)
    .in('key', nodeKeys)
  if (response.error) throw new Error(response.error.message)
  return (response.data ?? []).map((row: unknown) => mapChildWorkflowNodeRow(asRecord(row)))
}

export async function loadOutputRequestById(input: {
  client: ChildWorkflowReadClient
  requestId: string
  notFoundMessage?: string
}) {
  const response = await input.client
    .from('output_requests')
    .select('*')
    .eq('id', input.requestId)
    .single()
  if (response.error || !response.data) {
    throw new Error(response.error?.message ?? input.notFoundMessage ?? 'Output request was not found.')
  }
  return mapChildRequestRow(asRecord(response.data))
}

export async function markChildWorkflowStale(input: {
  client: ChildWorkflowWriteClient
  request: OutputRequest
  reason: string
  now?: string
  status?: string
  readyToRun?: boolean
  staleAtField?: 'staleAt' | 'staleMarkedAt'
  metadata?: Record<string, unknown>
  refreshProjection?: boolean
}) {
  const now = input.now ?? new Date().toISOString()
  const metadata = {
    ...asRecord(input.request.metadata),
    ...(input.readyToRun === undefined ? {} : { readyToRun: input.readyToRun }),
    sequenceAnimaticStale: true,
    staleReason: input.reason,
    [input.staleAtField ?? 'staleAt']: now,
    ...(input.metadata ?? {}),
  }
  const update: Record<string, unknown> = { metadata }
  if (input.status !== undefined) update.status = input.status
  const response = await input.client
    .from('output_requests')
    .update(update)
    .eq('id', input.request.id)
  if (response.error) throw new Error(response.error.message)
  if (input.refreshProjection && input.client.rpc) {
    const projectionResponse = await input.client.rpc('refresh_output_request_status_projection', { p_request_id: input.request.id })
    if (projectionResponse.error) throw new Error(projectionResponse.error.message ?? 'Failed to refresh output request status projection.')
  }
  return {
    ...input.request,
    status: input.status ?? input.request.status,
    metadata,
  }
}

export async function waitForChildWorkflowReadiness(input: {
  client: ChildWorkflowReadClient
  childRequestId: string
  requiredArtifactRoles?: string[]
  resumeAfterMs?: number
}): Promise<ChildWorkflowUtilityOutput> {
  const requestResponse = await input.client
    .from('output_requests')
    .select('id, workflow_id, latest_run_id, status, metadata')
    .eq('id', input.childRequestId)
    .maybeSingle()
  if (requestResponse.error) throw new Error(requestResponse.error.message)
  const request = asRecord(requestResponse.data)
  if (!readText(request.id)) {
    return childWorkflowUtilityOutputSchema.parse({
      childRequestId: input.childRequestId,
      childWorkflowId: 'unknown',
      status: 'failed',
      waiting: false,
      resumable: false,
      diagnostics: ['Child workflow request was not found.'],
    })
  }

  const workflowId = readText(request.workflow_id)
  const latestRunId = readText(request.latest_run_id) || null
  const status = readText(request.status) || 'waiting'
  const artifactResponse = workflowId
    ? await input.client
        .from('output_artifacts')
        .select('key, metadata')
        .eq('workflow_id', workflowId)
        .order('created_at', { ascending: false })
        .limit(200)
    : { data: [], error: null }
  if (artifactResponse.error) throw new Error(artifactResponse.error.message)
  const artifacts: Record<string, unknown>[] = (artifactResponse.data ?? []).map(asRecord)
  const readyArtifactRoles = [...new Set(artifacts
    .map((artifact) => readText(asRecord(artifact.metadata).role))
    .filter(Boolean))]
  const readyArtifactKeys = readStringArray(artifacts.map((artifact) => artifact.key))
  const required = input.requiredArtifactRoles ?? []
  const missingRoles = required.filter((role) => !readyArtifactRoles.includes(role))
  const terminal = ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status)
  const ready = missingRoles.length === 0 && ['completed', 'completed_with_errors'].includes(status)

  return childWorkflowUtilityOutputSchema.parse({
    childRequestId: readText(request.id),
    childWorkflowId: workflowId,
    childRunId: latestRunId,
    status: ready ? status : terminal ? status : 'waiting',
    readyArtifactRoles,
    readyArtifactKeys,
    waiting: !ready && !terminal,
    resumable: !ready && !terminal,
    resumeAfterMs: input.resumeAfterMs ?? 15_000,
    diagnostics: missingRoles.map((role) => `Waiting for child artifact role "${role}".`),
    metadata: {
      requestStatus: status,
      missingArtifactRoles: missingRoles,
    },
  })
}
