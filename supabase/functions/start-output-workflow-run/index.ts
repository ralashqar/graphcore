import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  buildOutputWorkflowInputFingerprint,
  buildOutputWorkflowExecutionPlan,
  getOutputWorkflowNodeGuidanceConfig,
  getOutputWorkflowNodeExecutionMetadata,
  isTerminalOutputWorkflowRunStatus,
  mapOutputArtifactRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRunRow,
  mapOutputWorkflowRunStepRow,
  outputArtifactSelect,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  outputWorkflowRunSelect,
  outputWorkflowRunStatusResponseSchema,
  outputWorkflowRunStepSelect,
  selectOutputWorkflowRunSubgraph,
  validateOutputWorkflowGraph,
} from '../_shared/output-workflow.ts'
import { outputWorkflowRunStartRequestSchema } from '../../../src/domain/outputWorkflow.ts'

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

function isRunStepNodeForeignKeyError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '23503' && String(error.message ?? '').includes('output_workflow_run_steps_node_id_fkey')
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'start-output-workflow-run')
    const payload = outputWorkflowRunStartRequestSchema.parse(await request.json())

    const workflowResponse = await client
      .from('output_workflows')
      .select('id, project_id, draft_id, preset')
      .eq('id', payload.workflowId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (workflowResponse.error || !workflowResponse.data) throw new HttpError(404, 'Output workflow not found or not editable.')

    const [nodeResponse, edgeResponse] = await Promise.all([
      client
        .from('output_workflow_nodes')
        .select(outputWorkflowNodeSelect)
        .eq('workflow_id', payload.workflowId)
        .order('created_at', { ascending: true }),
      client
        .from('output_workflow_edges')
        .select(outputWorkflowEdgeSelect)
        .eq('workflow_id', payload.workflowId)
        .order('created_at', { ascending: true }),
    ])
    if (nodeResponse.error) throw new Error(nodeResponse.error.message)
    if (edgeResponse.error) throw new Error(edgeResponse.error.message)
    const allNodes = (nodeResponse.data ?? []).map(mapOutputWorkflowNodeRow)
    const nodes = allNodes.filter((node) => {
      const metadata = node.metadata && typeof node.metadata === 'object' ? node.metadata as Record<string, unknown> : {}
      return !(metadata.dynamicCinematicGenerated === true && metadata.dynamicCinematicStale === true)
    })
    const nodeKeySet = new Set(nodes.map((node) => node.key))
    const edges = (edgeResponse.data ?? [])
      .map(mapOutputWorkflowEdgeRow)
      .filter((edge) => nodeKeySet.has(edge.sourceNodeKey) && nodeKeySet.has(edge.targetNodeKey))
    const validation = validateOutputWorkflowGraph({ nodes, edges })
    if (!validation.ok) throw new HttpError(400, validation.diagnostics.join(' '))

    const now = new Date().toISOString()
    const input = {
      ...payload.input,
      sourceEntityKeys: payload.input.sourceEntityKeys ?? [],
      sourceSequenceUnitKeys: payload.input.sourceSequenceUnitKeys ?? [],
    }
    const runResponse = await client
      .from('output_workflow_runs')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        workflow_id: payload.workflowId,
        requested_by: user.id,
        status: 'queued',
        preset: workflowResponse.data.preset,
        prompt: payload.prompt,
        target_format: payload.targetFormat,
        world_snapshot_fingerprint: buildOutputWorkflowInputFingerprint(input),
        input,
        metadata: {
          ...payload.metadata,
          queuedAt: now,
          startedBy: 'start-output-workflow-run',
        },
        heartbeat_at: now,
      })
      .select(outputWorkflowRunSelect)
      .single()
    if (runResponse.error || !runResponse.data) throw new Error(runResponse.error?.message ?? 'Failed to create output workflow run.')

    const runRow = runResponse.data
    const targetNodeKeys = readStringArray(payload.metadata.targetNodeKeys)
    const runScope = payload.metadata.runScope
    const selectedSubgraph = selectOutputWorkflowRunSubgraph({
      nodes,
      edges,
      targetNodeKeys,
      runScope,
    })
    if (selectedSubgraph.diagnostics.length > 0) throw new HttpError(400, selectedSubgraph.diagnostics.join(' '))
    const executionNodes = selectedSubgraph.nodes
    const executionPlan = buildOutputWorkflowExecutionPlan(executionNodes, selectedSubgraph.edges)
    const nodeOrder = new Map(executionPlan.orderedNodeKeys.map((key, index) => [key, index]))
    const executionLevelByNodeKey = new Map(executionPlan.levels.flatMap((level, index) => level.map((key) => [key, index] as const)))
    const buildStepRows = (nodeIdsByKey?: Map<string, string>) => executionNodes
      .slice()
      .sort((left, right) => (nodeOrder.get(left.key) ?? 999) - (nodeOrder.get(right.key) ?? 999))
      .map((node, index) => ({
        run_id: runRow.id,
        workflow_id: payload.workflowId,
        node_id: nodeIdsByKey ? nodeIdsByKey.get(node.key) ?? null : node.id,
        draft_id: payload.draftId,
        node_key: node.key,
        node_type: node.nodeType,
        status: 'queued',
        order_index: index,
        label: node.label,
        metadata: {
          executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
          resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
          groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
          skillKeys: getOutputWorkflowNodeGuidanceConfig(node).skillKeys,
          guidanceMode: getOutputWorkflowNodeGuidanceConfig(node).guidanceMode,
          runScope: runScope ?? (targetNodeKeys.length > 0 ? 'upstream_to_node' : 'full_workflow'),
        },
      }))
    let stepResponse = await client
      .from('output_workflow_run_steps')
      .insert(buildStepRows())
      .select(outputWorkflowRunStepSelect)
    if (isRunStepNodeForeignKeyError(stepResponse.error)) {
      const currentNodes = await client
        .from('output_workflow_nodes')
        .select('id,key')
        .eq('workflow_id', payload.workflowId)
      if (currentNodes.error) throw new Error(currentNodes.error.message)
      const nodeIdsByKey = new Map((currentNodes.data ?? [])
        .map((row) => [String(row.key ?? ''), String(row.id ?? '')] as const)
        .filter(([key, id]) => key.length > 0 && id.length > 0))
      stepResponse = await client
        .from('output_workflow_run_steps')
        .insert(buildStepRows(nodeIdsByKey))
        .select(outputWorkflowRunStepSelect)
    }
    if (stepResponse.error) throw new Error(stepResponse.error.message)

    const artifactsResponse = await client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('run_id', runRow.id)
    if (artifactsResponse.error) throw new Error(artifactsResponse.error.message)

    const run = mapOutputWorkflowRunRow(
      runRow,
      (stepResponse.data ?? []).map(mapOutputWorkflowRunStepRow),
      (artifactsResponse.data ?? []).map(mapOutputArtifactRow),
    )
    return json(outputWorkflowRunStatusResponseSchema.parse({
      ok: true,
      run,
      terminal: isTerminalOutputWorkflowRunStatus(run.status),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start output workflow run.')
  }
})
