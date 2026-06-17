import type { OutputArtifact } from '../../../src/domain/outputWorkflow.ts'
import {
  planSceneBoardCoverageIntentChildren,
  planSceneBoardZoneCoverageGridChildren,
} from './sequence-animatic-scene-board-child-planners.ts'

type LooseRecord = Record<string, unknown>

type SceneBoardNodeExecutionContext = {
  client: unknown
  inputHash: string
  node: {
    id: string
    key: string
    config: unknown
  }
  workflow: {
    id: string
    key: string
    name: string
  }
  run: {
    id: string
    projectId: string
    draftId: string
    preset: string
    requestedBy?: string | null
  }
  upstream: Record<string, Record<string, unknown>>
}

type SceneBoardNodeExecutionResult = {
  inputHash: string
  outputHash: string
  outputs: Record<string, unknown>
  provider: string
  model: string
}

export type SceneBoardWorkflowNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readStringArray: (value: unknown) => string[]
  readFirstUpstreamRecord: (upstream: Record<string, Record<string, unknown>>, fields: string[]) => LooseRecord
  slugify: (value: string) => string
  hashOutputWorkflowValue: (value: unknown) => string
  registerOtherOutputArtifact: (input: {
    client: unknown
    run: SceneBoardNodeExecutionContext['run']
    workflow: SceneBoardNodeExecutionContext['workflow']
    node: SceneBoardNodeExecutionContext['node']
    key: string
    name: string
    summary: string
    metadata: Record<string, unknown>
  }) => Promise<OutputArtifact>
}

function result(input: {
  context: SceneBoardNodeExecutionContext
  helpers: SceneBoardWorkflowNodePackHelpers
  outputs: Record<string, unknown>
  model: string
}): SceneBoardNodeExecutionResult {
  return {
    inputHash: input.context.inputHash,
    outputHash: input.helpers.hashOutputWorkflowValue(input.outputs),
    outputs: input.outputs,
    provider: 'graphcore',
    model: input.model,
  }
}

function readStageChildWorkflows(
  config: LooseRecord,
  command: LooseRecord,
  stage: string,
) {
  const byStage = [
    config.sceneBoardChildWorkflowSpecsByStage,
    config.scene_board_child_workflow_specs_by_stage,
    config.childWorkflowSpecsByStage,
    config.child_workflow_specs_by_stage,
    command.sceneBoardChildWorkflowSpecsByStage,
    command.scene_board_child_workflow_specs_by_stage,
    command.childWorkflowSpecsByStage,
    command.child_workflow_specs_by_stage,
  ].map((value) => value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {})
  for (const record of byStage) {
    const direct = record[stage]
    if (Array.isArray(direct)) return direct
  }
  const stageSpecs = [
    config.childWorkflows,
    config.child_workflows,
    command.childWorkflows,
    command.child_workflows,
  ]
    .filter(Array.isArray)
    .flat() as unknown[]
  return stageSpecs.filter((spec) => {
    const record = spec && typeof spec === 'object' && !Array.isArray(spec) ? spec as LooseRecord : {}
    const child = record.childWorkflow && typeof record.childWorkflow === 'object' && !Array.isArray(record.childWorkflow)
      ? record.childWorkflow as LooseRecord
      : record.child_workflow && typeof record.child_workflow === 'object' && !Array.isArray(record.child_workflow)
        ? record.child_workflow as LooseRecord
        : record
    return String(child.stage ?? child.sceneBoardStage ?? child.scene_board_stage ?? record.stage ?? '').trim() === stage
  })
}

async function sceneBoardScopeInput(
  context: SceneBoardNodeExecutionContext,
  helpers: SceneBoardWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const command = helpers.asRecord(config.command ?? config.sceneBoardCommand ?? config.scene_board_command)
  const shotIds = helpers.readStringArray(command.shotIds ?? command.shot_ids ?? config.shotIds)
  const scope = {
    action: helpers.readText(command.action) || 'prepare_selected_board',
    sceneId: helpers.readText(command.sceneId ?? config.sceneId),
    setId: helpers.readText(command.setId ?? config.setId),
    zoneId: helpers.readText(command.zoneId ?? config.zoneId),
    scopeNodeId: helpers.readText(command.scopeNodeId ?? config.scopeNodeId),
    shotIds,
    forceRefresh: command.forceRefresh === true || config.forceRefresh === true,
    masterRequestId: helpers.readText(config.masterRequestId),
    parentRequestId: helpers.readText(config.parentRequestId),
    policyVersion: helpers.readText(config.sceneBoardPrepPolicyVersion) || 'scene_board_prep_graph_v1',
  }
  const outputs = {
    scope,
    sceneBoardCommand: command,
    scene_board_command: command,
    shotIds,
    shot_ids: shotIds,
    text: JSON.stringify(scope, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-scene-board-scope-input-v1' })
}

async function sceneBoardRequiredRefPlan(
  context: SceneBoardNodeExecutionContext,
  helpers: SceneBoardWorkflowNodePackHelpers,
) {
  const scope = helpers.readFirstUpstreamRecord(context.upstream, ['scope'])
  const config = helpers.asRecord(context.node.config)
  const command = helpers.asRecord(config.command ?? config.sceneBoardCommand ?? config.scene_board_command)
  const requiredRefs = {
    status: 'planned',
    setId: helpers.readText(scope.setId ?? command.setId),
    zoneId: helpers.readText(scope.zoneId ?? command.zoneId),
    scopeNodeId: helpers.readText(scope.scopeNodeId ?? command.scopeNodeId),
    shotIds: helpers.readStringArray(scope.shotIds ?? command.shotIds),
    stages: ['set_refs', 'scaffold_refs', 'coverage_directions', 'coverage_grids'],
    migrationMode: 'graph_native_parent',
  }
  const outputs = {
    scope,
    requiredRefs,
    required_refs: requiredRefs,
    text: JSON.stringify(requiredRefs, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-scene-board-required-ref-plan-v1' })
}

async function sceneBoardSetRefGeneration(
  context: SceneBoardNodeExecutionContext,
  helpers: SceneBoardWorkflowNodePackHelpers,
) {
  const requiredRefs = helpers.readFirstUpstreamRecord(context.upstream, ['requiredRefs', 'required_refs'])
  const setRefStatus = {
    status: 'delegated',
    stage: 'set_refs',
    requiredRefs,
    message: 'Set reference generation is represented by the graph-native Scene Board prep parent. Existing continuity asset child workflows remain the asset-producing implementation during migration.',
    childRequests: [],
  }
  const outputs = {
    setRefStatus,
    set_ref_status: setRefStatus,
    childRequests: [],
    child_requests: [],
    text: JSON.stringify(setRefStatus, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-scene-board-set-ref-generation-v1' })
}

async function sceneBoardScaffoldRefGeneration(
  context: SceneBoardNodeExecutionContext,
  helpers: SceneBoardWorkflowNodePackHelpers,
) {
  const setRefStatus = helpers.readFirstUpstreamRecord(context.upstream, ['setRefStatus', 'set_ref_status'])
  const scaffoldRefStatus = {
    status: 'delegated',
    stage: 'scaffold_refs',
    upstreamStatus: setRefStatus,
    message: 'Zone map and spot atlas generation are sequenced by the parent prep graph while existing continuity asset child graphs remain compatible asset producers.',
    childRequests: [],
  }
  const outputs = {
    scaffoldRefStatus,
    scaffold_ref_status: scaffoldRefStatus,
    childRequests: [],
    child_requests: [],
    text: JSON.stringify(scaffoldRefStatus, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-scene-board-scaffold-ref-generation-v1' })
}

async function sceneBoardCoverageIntentBatch(
  context: SceneBoardNodeExecutionContext,
  helpers: SceneBoardWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const command = helpers.asRecord(config.command ?? config.sceneBoardCommand ?? config.scene_board_command)
  const scaffoldRefStatus = helpers.readFirstUpstreamRecord(context.upstream, ['scaffoldRefStatus', 'scaffold_ref_status', 'workflowRuntime', 'workflow_runtime', 'upstreamStatus'])
  const configuredChildWorkflows = readStageChildWorkflows(config, command, 'coverage_directions')
  const planned = configuredChildWorkflows.length > 0
    ? { childWorkflows: configuredChildWorkflows, diagnostics: [] as string[], metadata: { source: 'configured' } }
    : await planSceneBoardCoverageIntentChildren({
        client: context.client as never,
        projectId: context.run.projectId,
        draftId: context.run.draftId,
        masterRequestId: helpers.readText(config.masterRequestId),
        sceneId: helpers.readText(command.sceneId ?? config.sceneId),
        setId: helpers.readText(command.setId ?? config.setId),
        zoneId: helpers.readText(command.zoneId ?? config.zoneId),
        shotIds: helpers.readStringArray(command.shotIds ?? command.shot_ids ?? config.shotIds),
        scopedShots: Array.isArray(command.scopedShots) ? command.scopedShots.map(helpers.asRecord) : [],
        requestedBy: helpers.readText(config.requestedBy) || helpers.readText(context.run.requestedBy),
        forceRefresh: command.forceRefresh === true || config.forceRefresh === true,
      })
  const childWorkflows = planned.childWorkflows
  const coverageIntentStatus = {
    status: childWorkflows.length > 0 ? 'planned' : 'delegated',
    stage: 'coverage_directions',
    upstreamStatus: scaffoldRefStatus,
    message: 'Coverage direction batches are tracked under the graph-native Scene Board prep parent. Existing coverage-intent child workflows remain readable and reusable.',
    childWorkflowCount: childWorkflows.length,
    diagnostics: planned.diagnostics,
    planningMetadata: planned.metadata,
    childRequests: [],
  }
  const outputs = {
    coverageIntentStatus,
    coverage_intent_status: coverageIntentStatus,
    childWorkflows,
    child_workflows: childWorkflows,
    childRequests: [],
    child_requests: [],
    text: JSON.stringify(coverageIntentStatus, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-scene-board-coverage-intent-batch-v1' })
}

async function sceneBoardZoneCoverageGrid(
  context: SceneBoardNodeExecutionContext,
  helpers: SceneBoardWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const command = helpers.asRecord(config.command ?? config.sceneBoardCommand ?? config.scene_board_command)
  const coverageIntentStatus = helpers.readFirstUpstreamRecord(context.upstream, ['coverageIntentStatus', 'coverage_intent_status', 'workflowRuntime', 'workflow_runtime', 'upstreamStatus', 'coverageIntents'])
  const configuredChildWorkflows = readStageChildWorkflows(config, command, 'coverage_grids')
  const planned = configuredChildWorkflows.length > 0
    ? { childWorkflows: configuredChildWorkflows, diagnostics: [] as string[], metadata: { source: 'configured' } }
    : await planSceneBoardZoneCoverageGridChildren({
        client: context.client as never,
        projectId: context.run.projectId,
        draftId: context.run.draftId,
        masterRequestId: helpers.readText(config.masterRequestId),
        sceneId: helpers.readText(command.sceneId ?? config.sceneId),
        setId: helpers.readText(command.setId ?? config.setId),
        zoneId: helpers.readText(command.zoneId ?? config.zoneId),
        shotIds: helpers.readStringArray(command.shotIds ?? command.shot_ids ?? config.shotIds),
        scopedShots: Array.isArray(command.scopedShots) ? command.scopedShots.map(helpers.asRecord) : [],
        requestedBy: helpers.readText(config.requestedBy) || helpers.readText(context.run.requestedBy),
        forceRefresh: command.forceRefresh === true || config.forceRefresh === true,
      })
  const childWorkflows = planned.childWorkflows
  const zoneCoverageStatus = {
    status: childWorkflows.length > 0 ? 'planned' : 'delegated',
    stage: 'coverage_grids',
    upstreamStatus: coverageIntentStatus,
    message: 'Zone coverage grid generation is tracked by the parent prep graph while existing zone coverage board child workflows keep producing cells.',
    childWorkflowCount: childWorkflows.length,
    diagnostics: planned.diagnostics,
    planningMetadata: planned.metadata,
    childRequests: [],
  }
  const outputs = {
    zoneCoverageStatus,
    zone_coverage_status: zoneCoverageStatus,
    childWorkflows,
    child_workflows: childWorkflows,
    childRequests: [],
    child_requests: [],
    text: JSON.stringify(zoneCoverageStatus, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-scene-board-zone-coverage-grid-v1' })
}

async function sceneBoardCoverageCellArtifact(
  context: SceneBoardNodeExecutionContext,
  helpers: SceneBoardWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const scope = helpers.readFirstUpstreamRecord(context.upstream, ['scope'])
  const zoneCoverageStatus = helpers.readFirstUpstreamRecord(context.upstream, ['zoneCoverageStatus', 'zone_coverage_status'])
  const workflowRuntime = helpers.readFirstUpstreamRecord(context.upstream, ['workflowRuntime', 'workflow_runtime'])
  const childRequests = helpers.readStringArray(workflowRuntime.activeChildRequestIds ?? workflowRuntime.active_child_request_ids)
  const readyArtifactKeys = helpers.readStringArray(workflowRuntime.scopedAssetKeys ?? workflowRuntime.scoped_asset_keys)
  const recoveryHints = helpers.readStringArray(workflowRuntime.recoveryHints ?? workflowRuntime.recovery_hints)
  const waiting = childRequests.length > 0 || recoveryHints.length > 0
  const sceneId = helpers.readText(scope.sceneId ?? config.sceneId)
  const scopeNodeId = helpers.readText(scope.scopeNodeId ?? config.scopeNodeId)
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(sceneId || 'scene')}.sequence-animatic-scene-board-prep`
  const sceneBoardPrep = {
    status: waiting ? 'waiting' : 'ready',
    sceneId,
    setId: helpers.readText(scope.setId ?? config.setId),
    zoneId: helpers.readText(scope.zoneId ?? config.zoneId),
    scopeNodeId,
    shotIds: helpers.readStringArray(scope.shotIds ?? config.shotIds),
    forceRefresh: scope.forceRefresh === true || config.forceRefresh === true,
    zoneCoverageStatus,
    workflowRuntime,
    readyArtifactKeys,
    recoveryHints,
    migrationMode: 'graph_native_parent',
    completedAt: new Date().toISOString(),
  }
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: 'Scene Board Prep',
    summary: 'Graph-native parent workflow record for Scene Board reference, coverage direction, and coverage grid preparation.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-scene-board-prep-artifact-v1',
      role: 'sequence_animatic_scene_board_prep',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'scene_board_prep',
      screenplayAnimaticRole: 'scene_board_prep',
      masterRequestId: helpers.readText(config.masterRequestId),
      sceneId,
      setId: helpers.readText(scope.setId ?? config.setId),
      zoneId: helpers.readText(scope.zoneId ?? config.zoneId),
      scopeNodeId,
      sceneBoardPrep,
      scene_board_prep: sceneBoardPrep,
      workflowRuntime,
      workflow_runtime: workflowRuntime,
    },
  })
  const outputs = {
    artifactKey: artifact.key,
    artifact,
    artifacts: [artifact],
    sceneBoardPrep,
    scene_board_prep: sceneBoardPrep,
    workflowRuntime,
    workflow_runtime: workflowRuntime,
    childRequests,
    child_requests: childRequests,
    readyArtifactKeys,
    ready_artifact_keys: readyArtifactKeys,
    recoveryHints,
    recovery_hints: recoveryHints,
    waiting,
    authoringReady: !waiting,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-scene-board-prep-artifact-v1' })
}

const sceneBoardHandlers = {
  sequence_animatic_scene_board_scope_input: sceneBoardScopeInput,
  sequence_animatic_scene_board_required_ref_plan: sceneBoardRequiredRefPlan,
  sequence_animatic_scene_board_set_ref_generation: sceneBoardSetRefGeneration,
  sequence_animatic_scene_board_scaffold_ref_generation: sceneBoardScaffoldRefGeneration,
  sequence_animatic_scene_board_coverage_intent_batch: sceneBoardCoverageIntentBatch,
  sequence_animatic_scene_board_zone_coverage_grid: sceneBoardZoneCoverageGrid,
  sequence_animatic_scene_board_coverage_cell_artifact: sceneBoardCoverageCellArtifact,
}

export const sceneBoardWorkflowNodeHandlerKeys = Object.keys(sceneBoardHandlers)

export function registerSceneBoardWorkflowNodePack(input: {
  helpers: SceneBoardWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SceneBoardNodeExecutionContext) => Promise<SceneBoardNodeExecutionResult>) => void
}) {
  for (const [handlerKey, handler] of Object.entries(sceneBoardHandlers)) {
    input.register(handlerKey, (context) => handler(context, input.helpers))
  }
}
