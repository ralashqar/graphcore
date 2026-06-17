import { z } from 'zod'

import { HttpError } from './http.ts'
import { ensureMappedChildWorkflow } from './output-workflow-child-utils.ts'
import {
  buildOutputWorkflowInputFingerprint,
  buildOutputWorkflowExecutionPlan,
  getOutputWorkflowNodeExecutionMetadata,
  getOutputWorkflowNodeGuidanceConfig,
  mapOutputRequestRow,
  mapOutputWorkflowRunRow,
  mapOutputWorkflowRunStepRow,
  outputRequestSelect,
  outputWorkflowRunSelect,
  outputWorkflowRunStepSelect,
  selectOutputWorkflowRunSubgraph,
} from './output-workflow.ts'
import {
  buildValidatedOutputWorkflowTemplateGraph,
  sequenceAnimaticSceneBoardPrepRunSchema,
  sequenceAnimaticSceneBoardWorkflowCommandRequestSchema,
  sequenceAnimaticSceneBoardWorkflowCommandResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import { getWorkflowNodeManifest } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import {
  sequenceAnimaticSceneBoardPrepTemplateKey,
  sequenceAnimaticSceneBoardPrepPolicyVersion,
  sequenceAnimaticWorkflowTemplateRegistry,
} from './sequence-animatic-scene-board-workflows.ts'
import {
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from './sequence-animatic-workflow-factory.ts'
import { notifyWorkerWakeBestEffort } from './worker-wake.ts'

type SceneBoardWorkflowCommandPayload = z.infer<typeof sequenceAnimaticSceneBoardWorkflowCommandRequestSchema>

type DatabaseClient = {
  from: (table: string) => any
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
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

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 72) || 'scene_board'
}

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function stablePrepRunKey(input: {
  masterRequestId: string
  sceneId: string
  setId?: string | null
  zoneId?: string | null
  scopeNodeId?: string | null
  shotIds: readonly string[]
}) {
  const scope = readText(input.scopeNodeId) || readText(input.zoneId) || readText(input.setId) || 'scene'
  const shots = [...new Set(input.shotIds.map(readText).filter(Boolean))].sort().join(',')
  return `${input.masterRequestId}:${input.sceneId}:${scope}:${shots}`
}

export async function runSceneBoardWorkflowCommand(input: {
  client: DatabaseClient
  admin: DatabaseClient
  userId: string
  payload: SceneBoardWorkflowCommandPayload
  startedBy: string
}) {
  const { client, admin, payload } = input
  const masterResponse = await client
    .from('output_requests')
    .select(outputRequestSelect)
    .eq('id', payload.masterRequestId)
    .eq('project_id', payload.projectId)
    .eq('draft_id', payload.draftId)
    .single()
  if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')

  const masterRequest = mapOutputRequestRow(masterResponse.data)
  const masterMetadata = asRecord(masterRequest.metadata)
  if (readScreenplayAnimaticRole(masterMetadata) !== 'master') throw new HttpError(409, 'This output is not a screenplay animatic master request.')

  const shotIds = readStringArray(payload.shotIds)
  const forceRefresh = payload.forceRefresh || payload.action === 'regenerate_zone_top_down'
  const identity = sequenceAnimaticStableHash({
    policy: sequenceAnimaticSceneBoardPrepPolicyVersion,
    masterRequestId: payload.masterRequestId,
    sceneId: payload.sceneId,
    action: payload.action,
    setId: payload.setId,
    zoneId: payload.zoneId,
    scopeNodeId: payload.scopeNodeId,
    shotIds,
    forceRefresh,
  })
  const workflowId = crypto.randomUUID()
  const command = {
    action: payload.action,
    sceneId: payload.sceneId,
    setId: payload.setId ?? null,
    zoneId: payload.zoneId ?? null,
    scopeNodeId: payload.scopeNodeId ?? null,
    shotIds,
    forceRefresh,
  }
  const commonConfig = {
    cinematicPipelineVersion: 'v3_script_storyboards',
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    screenplayAnimaticRole: 'scene_board_prep',
    screenplayAnimaticSource: readText(masterMetadata.screenplayAnimaticSource) || 'wiki_sequence_unit',
    sequenceAnimaticRole: 'scene_board_prep',
    parentRequestId: masterRequest.id,
    masterRequestId: masterRequest.id,
    requestedBy: input.userId,
    workflowFamily: 'scene_board',
    workflowCommandAction: payload.action,
    sceneBoardPrepPolicyVersion: sequenceAnimaticSceneBoardPrepPolicyVersion,
    sceneBoardPrepIdentity: identity,
    sceneId: payload.sceneId,
    setId: payload.setId ?? null,
    zoneId: payload.zoneId ?? null,
    scopeNodeId: payload.scopeNodeId ?? null,
    shotIds,
    forceRefresh,
    action: payload.action,
    dependencyMode: 'scene_board_prep_parent',
  }
  const graphResult = buildValidatedOutputWorkflowTemplateGraph({
    registry: sequenceAnimaticWorkflowTemplateRegistry,
    templateKey: sequenceAnimaticSceneBoardPrepTemplateKey,
    rawInput: {
      workflowId,
      draftId: payload.draftId,
      commonConfig,
      command,
    },
  })
  if (!graphResult.ok || !graphResult.graph) throw new HttpError(400, graphResult.diagnostics.join(' '))
  const graph = graphResult.graph

  const title = payload.action === 'regenerate_zone_top_down'
    ? 'Regenerate Scene Board Zone'
    : payload.action === 'generate_zone_coverage_grids'
    ? 'Generate Scene Board Coverage Grids'
    : payload.action === 'generate_selected_coverage_anchors'
    ? 'Generate Scene Board Coverage Anchors'
    : 'Prepare Scene Board'
  const ensured = await ensureMappedChildWorkflow({
    client: admin,
    projectId: payload.projectId,
    draftId: payload.draftId,
    parentRequestId: masterRequest.id,
    role: 'scene_board_prep',
    identityKey: 'sceneBoardPrepIdentity',
    identityValue: identity,
    workflow: {
      project_id: payload.projectId,
      draft_id: payload.draftId,
      key: `sequence_animatic_scene_board_prep_${slugify(masterRequest.id)}_${identity.slice(0, 12)}`,
      name: title,
      description: 'Graph-native Scene Board prep workflow assembled from a typed command.',
      preset: 'cinematic_episode_from_sequence',
      status: 'active',
      created_by: input.userId,
      metadata: {
        ...commonConfig,
        command,
        readyToRun: true,
        workflowTemplateKey: sequenceAnimaticSceneBoardPrepTemplateKey,
        workflowTemplateSourceHash: graphResult.sourceHash,
      },
    },
    nodes: graph.nodes,
    edges: graph.edges,
    request: {
      project_id: payload.projectId,
      draft_id: payload.draftId,
      parent_request_id: masterRequest.id,
      requested_by: input.userId,
      source_surface: masterRequest.sourceSurface === 'outputs' ? 'outputs' : 'wiki_sequence_unit',
      prompt: `${title} for ${payload.sceneId}.`,
      title,
      intent: 'output_generation',
      output_kind: 'cinematic_episode',
      status: 'awaiting_confirmation',
      selected_entity_keys: masterRequest.selectedEntityKeys,
      selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
      target_format: 'image',
      planner_notes: 'Scene Board prep command routed through graph-native parent workflow.',
      metadata: {
        ...commonConfig,
        command,
        readyToRun: true,
        workflowTemplateKey: sequenceAnimaticSceneBoardPrepTemplateKey,
        workflowTemplateSourceHash: graphResult.sourceHash,
        createdFromSceneBoardCommandAt: new Date().toISOString(),
      },
    },
  })
  const prepRequest = ensured.request
  const workflow = ensured.workflow
  if (!workflow) throw new Error('Failed to ensure Scene Board prep workflow.')
  const nodes = ensured.nodes
  const edges = ensured.edges

  const activeRunResponse = prepRequest.latestRunId
    ? await admin.from('output_workflow_runs').select(outputWorkflowRunSelect).eq('id', prepRequest.latestRunId).maybeSingle()
    : { data: null, error: null }
  const activeRunStatus = readText(asRecord(activeRunResponse.data).status)
  const hasActiveRun = ['queued', 'running'].includes(activeRunStatus)
  let run = activeRunResponse.data && hasActiveRun ? mapOutputWorkflowRunRow(activeRunResponse.data as never) : null

  if (!run) {
    const now = new Date().toISOString()
    const runInput = {
      sourceEntityKeys: masterRequest.selectedEntityKeys,
      sourceSequenceUnitKeys: masterRequest.selectedSequenceUnitKeys,
      sceneBoardCommand: command,
    }
    const runResponse = await admin
      .from('output_workflow_runs')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        workflow_id: workflow.id,
        requested_by: input.userId,
        status: 'queued',
        preset: workflow.preset,
        prompt: `${title} for ${payload.sceneId}.`,
        target_format: 'image',
        world_snapshot_fingerprint: buildOutputWorkflowInputFingerprint(runInput),
        input: runInput,
        metadata: {
          runIntent: payload.action === 'regenerate_zone_top_down' ? 'regenerate_scene_board_zone' : 'prepare_scene_board',
          workflowFamily: 'scene_board',
          workflowCommandAction: payload.action,
          runScope: 'upstream_to_node',
          targetNodeKeys: ['coverage_cell_artifact'],
          allowStaleUpstreamOutputs: false,
          sceneBoardPrepIdentity: identity,
          queuedAt: now,
          startedBy: input.startedBy,
        },
        heartbeat_at: now,
      })
      .select(outputWorkflowRunSelect)
      .single()
    if (runResponse.error || !runResponse.data) throw new Error(runResponse.error?.message ?? 'Failed to create Scene Board prep run.')

    const selectedSubgraph = selectOutputWorkflowRunSubgraph({
      nodes,
      edges,
      targetNodeKeys: ['coverage_cell_artifact'],
      runScope: 'upstream_to_node',
    })
    if (selectedSubgraph.diagnostics.length > 0) throw new HttpError(400, selectedSubgraph.diagnostics.join(' '))
    const executionPlan = buildOutputWorkflowExecutionPlan(selectedSubgraph.nodes, selectedSubgraph.edges)
    const nodeOrder = new Map(executionPlan.orderedNodeKeys.map((key, index) => [key, index]))
    const executionLevelByNodeKey = new Map(executionPlan.levels.flatMap((level, index) => level.map((key) => [key, index] as const)))
    const stepResponse = await admin
      .from('output_workflow_run_steps')
      .insert(selectedSubgraph.nodes
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
            manifestPurpose: getWorkflowNodeManifest(node)?.purpose ?? (readText(asRecord(node.config).purpose) || null),
            progressLabel: getWorkflowNodeManifest(node)?.progressLabel ?? node.label,
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
            groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
            skillKeys: getOutputWorkflowNodeGuidanceConfig(node).skillKeys,
            guidanceMode: getOutputWorkflowNodeGuidanceConfig(node).guidanceMode,
            runScope: 'upstream_to_node',
          },
        })))
      .select(outputWorkflowRunStepSelect)
    if (stepResponse.error) throw new Error(stepResponse.error.message)

    const updateRequestResponse = await admin
      .from('output_requests')
      .update({
        latest_run_id: runResponse.data.id,
        status: 'running',
        error_message: null,
        metadata: {
          ...prepRequest.metadata,
          readyToRun: false,
          lastRunStartedAt: now,
          latestRunId: runResponse.data.id,
        },
      })
      .eq('id', prepRequest.id)
    if (updateRequestResponse.error) throw new Error(updateRequestResponse.error.message)

    run = mapOutputWorkflowRunRow(runResponse.data, (stepResponse.data ?? []).map(mapOutputWorkflowRunStepRow))
    await admin.rpc('refresh_output_request_status_projection', { p_request_id: prepRequest.id })
    await notifyWorkerWakeBestEffort({
      family: 'output_workflow',
      source: input.startedBy,
      runId: run.id,
      projectId: payload.projectId,
      draftId: payload.draftId,
    })
  }

  const prepRunKey = stablePrepRunKey({
    masterRequestId: masterRequest.id,
    sceneId: payload.sceneId,
    setId: payload.setId,
    zoneId: payload.zoneId,
    scopeNodeId: payload.scopeNodeId,
    shotIds,
  })
  const prepRunId = `scene_board_prep_${identity.slice(0, 16)}`
  const now = new Date().toISOString()
  const prepRun = sequenceAnimaticSceneBoardPrepRunSchema.parse({
    runId: prepRunId,
    runKey: prepRunKey,
    sceneId: payload.sceneId,
    setId: payload.setId ?? null,
    zoneId: payload.zoneId ?? null,
    scopeNodeId: payload.scopeNodeId ?? null,
    shotIds,
    stage: payload.action === 'generate_zone_coverage_grids' ? 'coverage_grids' : 'set_refs',
    status: 'running',
    activeUnitId: payload.scopeNodeId ?? payload.zoneId ?? payload.setId ?? null,
    activeUnitLabel: title,
    stageLabel: title,
    message: 'Scene Board prep is running through the graph-native workflow.',
    queued: nodes.length,
    running: 0,
    ready: 0,
    failed: 0,
    activeRequestIds: [prepRequest.id],
    activeRunIds: run ? [run.id] : [],
    activeReferenceNodeIds: [],
    activeCoverageShotIds: shotIds,
    activeRunStepKey: 'scope_input',
    startedAt: now,
    updatedAt: now,
    error: '',
    graphNativePrepRequestId: prepRequest.id,
    graphNativePrepWorkflowId: workflow.id,
    graphNativePrepRunId: run?.id ?? '',
  })

  return sequenceAnimaticSceneBoardWorkflowCommandResponseSchema.parse({
    ok: true,
    masterRequest,
    prepRequest,
    workflow,
    run,
    nodes,
    edges,
    prepRun,
    reused: ensured.reused === true,
  })
}
