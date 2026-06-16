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
import { outputWorkflowRunIntentDefaults } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { notifyWorkerWakeBestEffort } from '../_shared/worker-wake.ts'

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

function isRunStepNodeForeignKeyError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '23503' && String(error.message ?? '').includes('output_workflow_run_steps_node_id_fkey')
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function nodeBelongsToRetiredCinematicPipeline(node: { key: string; config: unknown }) {
  const config = readRecord(node.config)
  const purpose = readText(config.purpose)
  const role = readText(config.role)
  const pipelineVersion = readText(config.cinematicPipelineVersion)
  return pipelineVersion === 'v1_take_blocks'
    || pipelineVersion === 'v2_shot_orchestration'
    || node.key === 'cinematic_dynamic_take_fanout'
    || node.key === 'cinematic_v2_dynamic_shot_fanout'
    || purpose.startsWith('cinematic_v2_')
    || role.startsWith('cinematic_v2_')
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'start-output-workflow-run')
    const payload = outputWorkflowRunStartRequestSchema.parse(await request.json())
    const runIntent = typeof payload.metadata.runIntent === 'string' ? payload.metadata.runIntent : ''
    const intentDefaults = outputWorkflowRunIntentDefaults(runIntent)
    const metadata = intentDefaults
      ? {
        ...payload.metadata,
        runScope: payload.metadata.runScope ?? intentDefaults.runScope,
        allowStaleUpstreamOutputs: payload.metadata.allowStaleUpstreamOutputs ?? intentDefaults.allowStaleUpstreamOutputs,
        debugSkipVideoGeneration: payload.metadata.debugSkipVideoGeneration ?? intentDefaults.debugSkipVideoGeneration,
        cinematicVideoApproved: payload.metadata.cinematicVideoApproved ?? intentDefaults.cinematicVideoApproved,
      }
      : payload.metadata

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
    if (nodes.some(nodeBelongsToRetiredCinematicPipeline)) {
      throw new HttpError(410, 'Legacy cinematic workflow rerun is no longer supported. Historical v1/v2 outputs remain viewable, but new generation must use the current screenplay animatic pipeline.')
    }
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
          ...metadata,
          queuedAt: now,
          startedBy: 'start-output-workflow-run',
        },
        heartbeat_at: now,
      })
      .select(outputWorkflowRunSelect)
      .single()
    if (runResponse.error || !runResponse.data) throw new Error(runResponse.error?.message ?? 'Failed to create output workflow run.')

    const runRow = runResponse.data
    const linkedRequestResponse = await client
      .from('output_requests')
      .select('id, metadata')
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('workflow_id', payload.workflowId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const linkedRequestId = typeof linkedRequestResponse.data?.id === 'string' ? linkedRequestResponse.data.id : ''
    if (linkedRequestId) {
      const linkedMetadata = linkedRequestResponse.data?.metadata && typeof linkedRequestResponse.data.metadata === 'object'
        ? linkedRequestResponse.data.metadata as Record<string, unknown>
        : {}
      const requestUpdateResponse = await client
        .from('output_requests')
        .update({
          latest_run_id: runRow.id,
          status: 'running',
          error_message: null,
          metadata: {
            ...linkedMetadata,
            readyToRun: false,
            lastRunStartedAt: now,
            latestRunId: runRow.id,
          },
        })
        .eq('id', linkedRequestId)
      if (requestUpdateResponse.error) throw new Error(requestUpdateResponse.error.message)
      await client.rpc('refresh_output_request_status_projection', { p_request_id: linkedRequestId })
    }
    const targetNodeKeys = readStringArray(metadata.targetNodeKeys)
    const runScope = metadata.runScope
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
    await notifyWorkerWakeBestEffort({
      family: 'output_workflow',
      source: 'start-output-workflow-run',
      runId: run.id,
      projectId: payload.projectId,
      draftId: payload.draftId,
    })
    return json(outputWorkflowRunStatusResponseSchema.parse({
      ok: true,
      run,
      terminal: isTerminalOutputWorkflowRunStatus(run.status),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start output workflow run.')
  }
})
