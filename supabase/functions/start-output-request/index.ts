import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  buildOutputWorkflowExecutionPlan,
  buildOutputWorkflowFingerprint,
  classifyOutputPrompt,
  getOutputWorkflowNodeExecutionMetadata,
  getOutputWorkflowNodeGuidanceConfig,
  isTerminalOutputWorkflowRunStatus,
  outputRequestStartRequestSchema,
  outputRequestStatusResponseSchema,
  planOutputRequestWorkflow,
} from '../../../src/domain/outputWorkflow.ts'
import {
  mapOutputArtifactRow,
  mapOutputRequestRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRunRow,
  mapOutputWorkflowRunStepRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputRequestSelect,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  outputWorkflowRunSelect,
  outputWorkflowRunStepSelect,
  outputWorkflowSelect,
  validateOutputWorkflowGraph,
} from '../_shared/output-workflow.ts'

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'output'
}

function titleFromPrompt(prompt: string) {
  const cleaned = prompt.replace(/\s+/g, ' ').trim()
  return cleaned.length > 72 ? `${cleaned.slice(0, 69)}...` : cleaned || 'Output request'
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'start-output-request')
    const payload = outputRequestStartRequestSchema.parse(await request.json())

    const draftResponse = await client
      .from('project_drafts')
      .select('id, project_id')
      .eq('id', payload.draftId)
      .eq('project_id', payload.projectId)
      .single()
    if (draftResponse.error || !draftResponse.data) throw new HttpError(404, 'Draft not found or not editable.')

    const classification = classifyOutputPrompt(payload.prompt)
    const requestInsertResponse = await client
      .from('output_requests')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        requested_by: user.id,
        source_surface: payload.sourceSurface,
        prompt: payload.prompt,
        title: titleFromPrompt(payload.prompt),
        intent: classification.intent,
        output_kind: classification.outputKind,
        status: classification.intent === 'output_generation' ? 'planning' : 'awaiting_confirmation',
        selected_entity_keys: payload.selectedEntityKeys,
        selected_sequence_unit_keys: payload.selectedSequenceUnitKeys,
        page_count: payload.pageCount,
        target_format: payload.targetFormat,
        planner_notes: classification.notes,
        metadata: {
          classification,
          confidence: classification.confidence,
        },
      })
      .select(outputRequestSelect)
      .single()
    if (requestInsertResponse.error || !requestInsertResponse.data) throw new Error(requestInsertResponse.error?.message ?? 'Failed to create output request.')
    let outputRequest = mapOutputRequestRow(requestInsertResponse.data)

    if (classification.intent !== 'output_generation') {
      return json(outputRequestStatusResponseSchema.parse({
        ok: true,
        request: outputRequest,
        workflow: null,
        nodes: [],
        edges: [],
        run: null,
        artifacts: [],
        terminal: false,
      }))
    }

    const targetFormat = classification.outputKind === 'concept_art_image' || classification.outputKind === 'poster_image'
      ? 'image'
      : payload.targetFormat
    const plan = planOutputRequestWorkflow({
      projectId: payload.projectId,
      draftId: payload.draftId,
      prompt: payload.prompt,
      selectedEntityKeys: payload.selectedEntityKeys,
      selectedSequenceUnitKeys: payload.selectedSequenceUnitKeys,
      pageCount: payload.pageCount,
      targetFormat,
      snapshot: payload.snapshot,
    }, classification.outputKind)
    const validation = validateOutputWorkflowGraph({ nodes: plan.nodes, edges: plan.edges })
    if (!validation.ok) throw new HttpError(400, validation.diagnostics.join(' '))

    const workflowKey = `output.${slugify(plan.name)}.${crypto.randomUUID().slice(0, 8)}`
    const workflowResponse = await client
      .from('output_workflows')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        key: workflowKey,
        name: plan.name,
        description: plan.description,
        preset: plan.preset,
        status: 'active',
        created_by: user.id,
        metadata: {
          prompt: plan.prompt,
          targetFormat: plan.targetFormat,
          sourceEntityKeys: plan.sourceEntityKeys,
          sourceSequenceUnitKeys: plan.sourceSequenceUnitKeys,
          diagnostics: plan.diagnostics,
          outputRequestId: outputRequest.id,
          outputKind: classification.outputKind,
        },
      })
      .select(outputWorkflowSelect)
      .single()
    if (workflowResponse.error || !workflowResponse.data) throw new Error(workflowResponse.error?.message ?? 'Failed to create output workflow.')
    const workflow = mapOutputWorkflowRow(workflowResponse.data)

    const nodeResponse = await client
      .from('output_workflow_nodes')
      .insert(plan.nodes.map((node) => ({
        workflow_id: workflow.id,
        draft_id: payload.draftId,
        key: node.key,
        node_type: node.nodeType,
        label: node.label,
        position: node.position,
        config: node.config,
        inputs: node.inputs,
        outputs: node.outputs,
        dirty: node.dirty,
        input_hash: node.inputHash,
        output_hash: node.outputHash,
        metadata: node.metadata,
      })))
      .select(outputWorkflowNodeSelect)
    if (nodeResponse.error) throw new Error(nodeResponse.error.message)
    const nodes = (nodeResponse.data ?? []).map(mapOutputWorkflowNodeRow)

    const edgeResponse = await client
      .from('output_workflow_edges')
      .insert(plan.edges.map((edge) => ({
        workflow_id: workflow.id,
        draft_id: payload.draftId,
        key: edge.key,
        source_node_key: edge.sourceNodeKey,
        source_port: edge.sourcePort,
        target_node_key: edge.targetNodeKey,
        target_port: edge.targetPort,
        metadata: edge.metadata,
      })))
      .select(outputWorkflowEdgeSelect)
    if (edgeResponse.error) throw new Error(edgeResponse.error.message)
    const edges = (edgeResponse.data ?? []).map(mapOutputWorkflowEdgeRow)

    const now = new Date().toISOString()
    const input = {
      projectContext: payload.snapshot.projectContext,
      worldEntities: payload.snapshot.worldEntities,
      worldRelationships: payload.snapshot.worldRelationships,
      worldThreads: payload.snapshot.worldThreads,
      worldWiki: payload.snapshot.worldWiki,
      assets: Array.isArray(payload.runInput.assets) ? payload.runInput.assets : [],
      sourceEntityKeys: plan.sourceEntityKeys,
      sourceSequenceUnitKeys: plan.sourceSequenceUnitKeys,
      pageCount: payload.pageCount,
    }
    const runResponse = await client
      .from('output_workflow_runs')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        workflow_id: workflow.id,
        requested_by: user.id,
        status: 'queued',
        preset: workflow.preset,
        prompt: payload.prompt,
        target_format: plan.targetFormat,
        world_snapshot_fingerprint: buildOutputWorkflowFingerprint(input),
        input,
        metadata: {
          queuedAt: now,
          startedBy: 'start-output-request',
          outputRequestId: outputRequest.id,
          outputKind: classification.outputKind,
        },
        heartbeat_at: now,
      })
      .select(outputWorkflowRunSelect)
      .single()
    if (runResponse.error || !runResponse.data) throw new Error(runResponse.error?.message ?? 'Failed to create output workflow run.')

    const executionPlan = buildOutputWorkflowExecutionPlan(nodes, edges)
    const nodeOrder = new Map(executionPlan.orderedNodeKeys.map((key, index) => [key, index]))
    const executionLevelByNodeKey = new Map(executionPlan.levels.flatMap((level, index) => level.map((key) => [key, index] as const)))
    const stepResponse = await client
      .from('output_workflow_run_steps')
      .insert(nodes
        .slice()
        .sort((left, right) => (nodeOrder.get(left.key) ?? 999) - (nodeOrder.get(right.key) ?? 999))
        .map((node, index) => ({
          run_id: runResponse.data.id,
          workflow_id: workflow.id,
          node_id: node.id,
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
            outputRequestId: outputRequest.id,
          },
        })))
      .select(outputWorkflowRunStepSelect)
    if (stepResponse.error) throw new Error(stepResponse.error.message)

    const requestUpdateResponse = await client
      .from('output_requests')
      .update({
        workflow_id: workflow.id,
        latest_run_id: runResponse.data.id,
        status: 'running',
        selected_entity_keys: plan.sourceEntityKeys,
        selected_sequence_unit_keys: plan.sourceSequenceUnitKeys,
        target_format: plan.targetFormat,
        planner_notes: [classification.notes, ...plan.diagnostics].filter(Boolean).join('\n'),
        metadata: {
          ...outputRequest.metadata,
          classification,
          planDiagnostics: plan.diagnostics,
          preset: plan.preset,
        },
      })
      .eq('id', outputRequest.id)
      .select(outputRequestSelect)
      .single()
    if (requestUpdateResponse.error || !requestUpdateResponse.data) throw new Error(requestUpdateResponse.error?.message ?? 'Failed to update output request.')
    outputRequest = mapOutputRequestRow(requestUpdateResponse.data)

    const artifactsResponse = await client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('run_id', runResponse.data.id)
    if (artifactsResponse.error) throw new Error(artifactsResponse.error.message)
    const artifacts = (artifactsResponse.data ?? []).map(mapOutputArtifactRow)
    const run = mapOutputWorkflowRunRow(
      runResponse.data,
      (stepResponse.data ?? []).map(mapOutputWorkflowRunStepRow),
      artifacts,
    )
    return json(outputRequestStatusResponseSchema.parse({
      ok: true,
      request: outputRequest,
      workflow,
      nodes,
      edges,
      run,
      artifacts,
      terminal: isTerminalOutputWorkflowRunStatus(run.status),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start output request.')
  }
})
