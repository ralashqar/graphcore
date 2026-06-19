import {
  childWorkflowUtilityOutputSchema,
  type ChildWorkflowUtilityOutput,
} from '../../../src/domain/outputWorkflowManifests.ts'
import {
  buildOutputWorkflowExecutionPlan,
  getOutputWorkflowNodeGuidanceConfig,
  getOutputWorkflowNodeExecutionMetadata,
  selectOutputWorkflowRunSubgraph,
  outputRequestSchema,
  outputWorkflowEdgeSchema,
  outputWorkflowSchema,
  type OutputRequest,
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
} from '../../../src/domain/outputWorkflow.ts'
import {
  getWorkflowNodeManifest,
} from '../../../src/domain/outputWorkflowNodeContracts.ts'

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

const ACTIVE_CHILD_RUN_STATUSES = new Set(['queued', 'running'])
const TERMINAL_CHILD_REQUEST_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled'])

function readBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return null
}

function mapChildNodeForPlan(row: Record<string, unknown>) {
  return {
    id: readText(row.id),
    key: readText(row.key),
    nodeType: readText(row.node_type),
    label: readText(row.label),
    config: asRecord(row.config),
    metadata: asRecord(row.metadata),
  }
}

function mapChildEdgeForPlan(row: Record<string, unknown>) {
  return {
    key: readText(row.key),
    sourceNodeKey: readText(row.source_node_key),
    sourcePort: readText(row.source_port),
    targetNodeKey: readText(row.target_node_key),
    targetPort: readText(row.target_port),
    metadata: asRecord(row.metadata),
  }
}

function inferChildTargetNodeKeys(input: {
  nodes: Array<ReturnType<typeof mapChildNodeForPlan>>
  configuredTargetNodeKeys?: readonly string[]
}) {
  const configured = uniqueText([...(input.configuredTargetNodeKeys ?? [])])
  if (configured.length > 0) return configured
  const artifactKeys = input.nodes
    .filter((node) => node.nodeType === 'output_artifact' || node.key.endsWith('_artifact'))
    .map((node) => node.key)
    .filter(Boolean)
  return artifactKeys.length > 0 ? [artifactKeys[artifactKeys.length - 1]] : []
}

export async function ensureChildWorkflowRun(input: {
  client: ChildWorkflowWriteClient
  projectId: string
  draftId: string
  request: Record<string, unknown>
  workflow: Record<string, unknown>
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
  parentRunId: string
  parentNodeKey: string
  parentNodePurpose?: string | null
  targetNodeKeys?: string[]
  runScope?: string
  runIntent?: string
  workflowFamily?: string
  commandAction?: string
  source?: string
  inputFingerprint: (value: unknown) => string
}) {
  const requestId = readText(input.request.id)
  const workflowId = readText(input.workflow.id)
  if (!requestId || !workflowId) return null
  const requestStatus = readText(input.request.status)
  if (TERMINAL_CHILD_REQUEST_STATUSES.has(requestStatus)) return null
  const requestMetadata = asRecord(input.request.metadata)
  if (readBoolean(requestMetadata.readyToRun) === false) return null

  const latestRunId = readText(input.request.latest_run_id ?? input.request.latestRunId)
  if (latestRunId) {
    const activeRunResponse = await input.client
      .from('output_workflow_runs')
      .select('id, status')
      .eq('id', latestRunId)
      .maybeSingle()
    if (activeRunResponse.error) throw new Error(activeRunResponse.error.message)
    const activeStatus = readText(asRecord(activeRunResponse.data).status)
    if (ACTIVE_CHILD_RUN_STATUSES.has(activeStatus)) {
      return { runId: latestRunId, status: activeStatus, reused: true }
    }
  }

  const nodes = input.nodes.map(mapChildNodeForPlan).filter((node) => node.key)
  const edges = input.edges.map(mapChildEdgeForPlan).filter((edge) => edge.sourceNodeKey && edge.targetNodeKey)
  const targetNodeKeys = inferChildTargetNodeKeys({ nodes, configuredTargetNodeKeys: input.targetNodeKeys })
  const runScope = readText(input.runScope) || (targetNodeKeys.length > 0 ? 'upstream_to_node' : 'full_workflow')
  const selectedSubgraph = selectOutputWorkflowRunSubgraph({
    nodes,
    edges,
    targetNodeKeys,
    runScope: runScope as never,
  })
  if (selectedSubgraph.diagnostics.length > 0) throw new Error(selectedSubgraph.diagnostics.join(' '))
  const executionPlan = buildOutputWorkflowExecutionPlan(selectedSubgraph.nodes, selectedSubgraph.edges)
  if (executionPlan.diagnostics.length > 0) throw new Error(executionPlan.diagnostics.join(' '))
  const nodeOrder = new Map(executionPlan.orderedNodeKeys.map((key, index) => [key, index]))
  const executionLevelByNodeKey = new Map(executionPlan.levels.flatMap((level, index) => level.map((key) => [key, index] as const)))
  const now = new Date().toISOString()
  const runInput = {
    childRequestId: requestId,
    parentRunId: input.parentRunId,
    parentNodeKey: input.parentNodeKey,
    targetNodeKeys,
    sourceEntityKeys: Array.isArray(input.request.selected_entity_keys) ? input.request.selected_entity_keys : [],
    sourceSequenceUnitKeys: Array.isArray(input.request.selected_sequence_unit_keys) ? input.request.selected_sequence_unit_keys : [],
  }
  const runResponse = await input.client
    .from('output_workflow_runs')
    .insert({
      project_id: input.projectId,
      draft_id: input.draftId,
      workflow_id: workflowId,
      requested_by: readText(input.request.requested_by),
      status: 'queued',
      preset: readText(input.workflow.preset) || 'cinematic_episode_from_sequence',
      prompt: readText(input.request.prompt),
      target_format: readText(input.request.target_format) || 'json',
      world_snapshot_fingerprint: input.inputFingerprint(runInput),
      input: runInput,
      metadata: {
        ...requestMetadata,
        runIntent: input.runIntent || readText(requestMetadata.workflowCommandAction) || 'child_workflow',
        workflowFamily: input.workflowFamily || readText(requestMetadata.workflowFamily) || 'child_workflow',
        workflowCommandAction: input.commandAction || readText(requestMetadata.workflowCommandAction) || 'auto_start_child_workflow',
        runScope,
        targetNodeKeys,
        parentRunId: input.parentRunId,
        parentNodeKey: input.parentNodeKey,
        parentNodePurpose: input.parentNodePurpose ?? null,
        queuedAt: now,
        startedBy: input.source || 'workflow-utility-auto-start',
      },
      heartbeat_at: now,
    })
    .select('id, status')
    .single()
  if (runResponse.error || !runResponse.data) throw new Error(runResponse.error?.message ?? 'Failed to create child workflow run.')

  const runId = readText(runResponse.data.id)
  const stepRows = selectedSubgraph.nodes
    .slice()
    .sort((left, right) => (nodeOrder.get(left.key) ?? 999) - (nodeOrder.get(right.key) ?? 999))
    .map((node, index) => ({
      run_id: runId,
      workflow_id: workflowId,
      node_id: node.id,
      draft_id: input.draftId,
      node_key: node.key,
      node_type: node.nodeType,
      status: 'queued',
      order_index: index,
      label: node.label || node.key,
      metadata: {
        manifestPurpose: getWorkflowNodeManifest(node as never)?.purpose ?? (readText(asRecord(node.config).purpose) || null),
        progressLabel: getWorkflowNodeManifest(node as never)?.progressLabel ?? node.label ?? node.key,
        executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
        resourceClass: getOutputWorkflowNodeExecutionMetadata(node as never).resourceClass,
        groupKey: getOutputWorkflowNodeExecutionMetadata(node as never).groupKey ?? null,
        skillKeys: getOutputWorkflowNodeGuidanceConfig(node as never).skillKeys,
        guidanceMode: getOutputWorkflowNodeGuidanceConfig(node as never).guidanceMode,
        runScope,
      },
    }))
  if (stepRows.length > 0) {
    const stepResponse = await input.client
      .from('output_workflow_run_steps')
      .insert(stepRows)
    if (stepResponse.error) throw new Error(stepResponse.error.message)
  }

  const requestUpdateResponse = await input.client
    .from('output_requests')
    .update({
      latest_run_id: runId,
      status: 'running',
      error_message: null,
      metadata: {
        ...requestMetadata,
        readyToRun: false,
        lastRunStartedAt: now,
        latestRunId: runId,
        autoStartedByParentRunId: input.parentRunId,
        autoStartedByParentNodeKey: input.parentNodeKey,
      },
    })
    .eq('id', requestId)
  if (requestUpdateResponse.error) throw new Error(requestUpdateResponse.error.message)
  if (input.client.rpc) {
    const projectionResponse = await input.client.rpc('refresh_output_request_status_projection', { p_request_id: requestId })
    if (projectionResponse.error) throw new Error(projectionResponse.error.message ?? 'Failed to refresh child workflow projection.')
  }
  return { runId, status: 'queued', reused: false }
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
