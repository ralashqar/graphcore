import type { OutputArtifact } from '../../../src/domain/outputWorkflow.ts'
import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import {
  planSceneBoardCoverageIntentChildren,
  planSceneBoardZoneCoverageGridChildren,
} from './sequence-animatic-scene-board-child-planners.ts'
import { z } from 'zod'

type LooseRecord = Record<string, unknown>

type SceneBoardDatabaseClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ error?: { message?: string } | null; data?: unknown | null }>
      }
    }
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error?: { message?: string } | null }>
    }
  }
}

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
  readArray: (value: unknown) => unknown[]
  readStringArray: (value: unknown) => string[]
  readFirstUpstreamRecord: (upstream: Record<string, Record<string, unknown>>, fields: string[]) => LooseRecord
  readFirstUpstreamArray: (upstream: Record<string, Record<string, unknown>>, fields: string[]) => unknown[]
  readFirstUpstreamText: (upstream: Record<string, Record<string, unknown>>, fields?: string[]) => string
  readFirstUpstreamImage: (upstream: Record<string, Record<string, unknown>>, fields?: string[]) => LooseRecord | null
  slugify: (value: string) => string
  titleFromRefLike: (value: string) => string
  hashOutputWorkflowValue: (value: unknown) => string
  sanitizeSequenceAnimaticCameraPlateText: (value: unknown, maxLength?: number) => string
  sanitizeSequenceAnimaticSpatialPromptText: (
    value: unknown,
    options?: { forbiddenNames?: string[]; maxLength?: number },
  ) => { text: string; removedTerms: string[] }
  sequenceAnimaticSpatialForbiddenNamesFromShots: (shots: LooseRecord[]) => string[]
  sequenceAnimaticCompactZoneGridCellLine: (cell: LooseRecord, index: number) => string
  sequenceAnimaticZoneGridPromptDiagnostics: (cells: LooseRecord[]) => LooseRecord
  sequenceAnimaticReferenceManifestEntries: (assetPack: LooseRecord) => unknown[]
  sequenceAnimaticReferenceManifestText: (assetPack: LooseRecord) => string
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
  registerImageArtifact: (input: {
    client: unknown
    run: SceneBoardNodeExecutionContext['run']
    workflow: SceneBoardNodeExecutionContext['workflow']
    node: SceneBoardNodeExecutionContext['node']
    assetKey: string
    storagePath: string
    name: string
    summary: string
    mimeType: string
    metadata: Record<string, unknown>
  }) => Promise<OutputArtifact>
  insertSequenceAnimaticEvent: (input: {
    client: unknown
    projectId: string
    draftId: string
    requestId: string
    workflowId: string
    runId: string
    eventType: string
    payload: Record<string, unknown>
    metadata?: Record<string, unknown>
    dedupe?: Record<string, unknown>
  }) => Promise<void>
  downloadProjectAssetBytes: (client: unknown, storagePath: string) => Promise<Uint8Array>
  makeTempDir: (prefix: string) => Promise<string>
  writeFile: (path: string, bytes: Uint8Array) => Promise<void>
  readFile: (path: string) => Promise<Uint8Array>
  removeDir: (path: string) => Promise<void>
  probeImageSize: (path: string) => Promise<{ width: number; height: number } | null>
  runFfmpeg: (args: string[]) => Promise<{ ok: boolean; stderr: string }>
  verifySequenceAnimaticAnchorCrop: (input: {
    outputPath: string
    anchorId: string
    expectedWidth: number
    expectedHeight: number
    row: number
    column: number
  }) => Promise<unknown>
  uploadBytes: (client: unknown, path: string, bytes: Uint8Array, contentType: string) => Promise<void>
  runStructuredNode: <TValue>(input: {
    nodeKey: string
    schemaName: string
    schema: z.ZodType<TValue>
    instructions: string
    prompt: string
    fallback: TValue
    maxOutputTokens?: number
  }) => Promise<{
    value: TValue
    provider: string
    model: string
    fallbackUsed: boolean
    fallbackReason: string
  }>
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

const sequenceAnimaticZoneCameraGridBriefSchema = z.object({
  boardSummary: z.string().max(900).default(''),
  cells: z.array(z.object({
    shotId: z.string().max(120),
    cellIndex: z.number().int().min(0).max(8),
    row: z.number().int().min(0).max(2),
    column: z.number().int().min(0).max(2),
    cameraPlateBrief: z.string().max(520),
    camera: z.string().max(260).default(''),
    framing: z.string().max(140).default(''),
    cameraHeight: z.string().max(140).default(''),
    cameraAngle: z.string().max(140).default(''),
    lens: z.string().max(140).default(''),
    movement: z.string().max(140).default(''),
    foreground: z.string().max(220).default(''),
    midground: z.string().max(260).default(''),
    background: z.string().max(260).default(''),
    landmarks: z.string().max(260).default(''),
    locationFeatures: z.string().max(360).default(''),
    lightingWeather: z.string().max(240).default(''),
    lightDirection: z.string().max(180).default(''),
    paletteWeather: z.string().max(180).default(''),
    screenDirection: z.string().max(180).default(''),
    composition: z.string().max(300).default(''),
    spotId: z.string().max(160).default(''),
    spotName: z.string().max(220).default(''),
  })).min(1).max(9),
  diagnostics: z.array(z.string().max(260)).default([]),
})

function readCameraPart(
  helpers: SceneBoardWorkflowNodePackHelpers,
  camera: Record<string, unknown>,
  key: string,
  maxLength = 120,
) {
  return helpers.sanitizeSequenceAnimaticCameraPlateText(camera[key], maxLength)
}

function inferCameraHeight(helpers: SceneBoardWorkflowNodePackHelpers, cameraText: string) {
  const matches = cameraText.match(/\b(?:low|ground|waist|eye|shoulder|high|overhead|top[-\s]?down|upward|downward)\b(?:[-\s]\w+){0,3}/i)
  return helpers.sanitizeSequenceAnimaticCameraPlateText(matches?.[0] ?? '', 90)
}

function inferCameraAngle(helpers: SceneBoardWorkflowNodePackHelpers, cameraText: string) {
  const matches = cameraText.match(/\b(?:front|profile|side|reverse|three[-\s]?quarter|wide|close|insert|macro|telephoto|wide[-\s]?angle)\b(?:[-\s]\w+){0,4}/i)
  return helpers.sanitizeSequenceAnimaticCameraPlateText(matches?.[0] ?? '', 100)
}

function buildCameraPlateBrief(helpers: SceneBoardWorkflowNodePackHelpers, cell: Record<string, unknown>) {
  const camera = [
    helpers.readText(cell.framing),
    helpers.readText(cell.cameraHeight),
    helpers.readText(cell.cameraAngle),
    helpers.readText(cell.lens),
    helpers.readText(cell.movement),
    helpers.readText(cell.camera),
  ].filter(Boolean).join('; ')
  const space = [
    helpers.readText(cell.foreground) ? `foreground ${helpers.readText(cell.foreground)}` : '',
    helpers.readText(cell.midground) ? `midground ${helpers.readText(cell.midground)}` : '',
    helpers.readText(cell.background) ? `background ${helpers.readText(cell.background)}` : '',
    helpers.readText(cell.landmarks) ? `landmarks ${helpers.readText(cell.landmarks)}` : '',
  ].filter(Boolean).join('; ')
  const light = helpers.readText(cell.lightDirection) || helpers.readText(cell.lightingWeather) || helpers.readText(cell.paletteWeather)
  return helpers.sanitizeSequenceAnimaticCameraPlateText([
    camera ? `Camera ${camera}` : '',
    space || helpers.readText(cell.locationFeatures),
    light ? `Light ${light}` : '',
    helpers.readText(cell.screenDirection) ? `Screen direction ${helpers.readText(cell.screenDirection)}` : '',
  ].filter(Boolean).join(' | '), 520)
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

async function sequenceAnimaticZoneCoverageBoardInput(
  context: SceneBoardNodeExecutionContext,
  helpers: SceneBoardWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const board = helpers.asRecord(config.board ?? config.zoneCoverageBoard ?? config.zone_coverage_board)
  const shots = helpers.readArray(config.shots).map(helpers.asRecord)
  const coverageCells = helpers.readArray(config.coverageCells ?? config.coverage_cells).map(helpers.asRecord)
  const assetPack = helpers.asRecord(config.assetPack ?? config.asset_pack)
  const referenceAssetKeys = helpers.readStringArray(config.referenceAssetKeys ?? config.reference_asset_keys)
  const previousBoard = helpers.asRecord(config.previousBoard ?? config.previous_board)
  const gridLayout = helpers.asRecord(config.gridLayout ?? config.grid_layout)
  const sceneGraphOverrides = helpers.readArray(config.sceneGraphOverrides ?? config.scene_graph_overrides).map(helpers.asRecord)
  const outputs = {
    board,
    zoneCoverageBoard: board,
    zone_coverage_board: board,
    shots,
    coverageCells,
    coverage_cells: coverageCells,
    assetPack,
    asset_pack: assetPack,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    previousBoard,
    previous_board: previousBoard,
    gridLayout,
    grid_layout: gridLayout,
    sceneGraphOverrides,
    scene_graph_overrides: sceneGraphOverrides,
    text: JSON.stringify({
      boardId: helpers.readText(board.id),
      sceneId: helpers.readText(board.sceneId),
      zoneId: helpers.readText(board.zoneId),
      chunkIndex: Number(board.chunkIndex ?? 0) || 0,
      shotIds: helpers.readStringArray(board.shotIds),
      referenceAssetKeys,
      previousBoardAssetKey: helpers.readText(previousBoard.assetKey),
      sceneGraphOverrides,
    }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-zone-coverage-board-input-v1' })
}

async function sequenceAnimaticZoneCoverageBoardBrief(
  context: SceneBoardNodeExecutionContext,
  helpers: SceneBoardWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const board = helpers.readFirstUpstreamRecord(context.upstream, ['board', 'zoneCoverageBoard', 'zone_coverage_board'])
  const boardRecord = Object.keys(board).length > 0 ? board : helpers.asRecord(config.board)
  const upstreamShots = helpers.readFirstUpstreamArray(context.upstream, ['shots']).map(helpers.asRecord)
  const shots = upstreamShots.length > 0 ? upstreamShots : helpers.readArray(config.shots).map(helpers.asRecord)
  const upstreamCoverageCells = helpers.readFirstUpstreamArray(context.upstream, ['coverageCells', 'coverage_cells']).map(helpers.asRecord)
  const coverageCells = upstreamCoverageCells.length > 0
    ? upstreamCoverageCells
    : helpers.readArray(config.coverageCells ?? config.coverage_cells).map(helpers.asRecord)
  const upstreamAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const assetPack = Object.keys(upstreamAssetPack).length > 0 ? upstreamAssetPack : helpers.asRecord(config.assetPack)
  const previousBoard = helpers.readFirstUpstreamRecord(context.upstream, ['previousBoard', 'previous_board'])
  const upstreamSceneGraphOverrides = helpers.readFirstUpstreamArray(context.upstream, ['sceneGraphOverrides', 'scene_graph_overrides']).map(helpers.asRecord)
  const sceneGraphOverrides = upstreamSceneGraphOverrides.length > 0
    ? upstreamSceneGraphOverrides
    : helpers.readArray(config.sceneGraphOverrides ?? config.scene_graph_overrides).map(helpers.asRecord)
  const artStyleDescription = helpers.readText(boardRecord.artStyleDescription ?? boardRecord.art_style_description)
    || helpers.readText(config.artStyleDescription ?? config.art_style_description)
  const boardForbiddenNames = helpers.sequenceAnimaticSpatialForbiddenNamesFromShots(shots)
  const fallbackCells = coverageCells.slice(0, 9).map((cell, index) => {
    const shot = shots.find((entry) => helpers.readText(entry.id) === helpers.readText(cell.shotId)) ?? {}
    const camera = helpers.asRecord(cell.camera ?? helpers.asRecord(shot).camera)
    const framing = readCameraPart(helpers, camera, 'framing') || helpers.sanitizeSequenceAnimaticCameraPlateText(cell.cameraFraming ?? cell.camera_framing, 120)
    const cameraAngle = readCameraPart(helpers, camera, 'angle') || helpers.sanitizeSequenceAnimaticCameraPlateText(cell.cameraAngle ?? cell.camera_angle, 120)
    const lens = readCameraPart(helpers, camera, 'lens')
    const movement = readCameraPart(helpers, camera, 'movement')
    const cameraText = helpers.sanitizeSequenceAnimaticCameraPlateText([
      framing,
      cameraAngle,
      lens,
      movement,
    ].filter(Boolean).join('; '), 220)
    const cameraHeight = inferCameraHeight(helpers, cameraText)
    const inferredCameraAngle = cameraAngle || inferCameraAngle(helpers, cameraText)
    const spotName = helpers.sanitizeSequenceAnimaticSpatialPromptText(cell.spotName ?? cell.spot_name, {
      forbiddenNames: boardForbiddenNames,
      maxLength: 140,
    }).text
    const locationContinuity = helpers.sanitizeSequenceAnimaticCameraPlateText(
      cell.locationContinuity ?? cell.location_continuity ?? helpers.asRecord(shot).locationContinuity ?? helpers.asRecord(shot).location_continuity,
      260,
    )
    const locationFeatures = [
      spotName ? `frame the ${spotName} area` : '',
      locationContinuity,
    ].filter(Boolean).join('; ')
    const lightingWeather = helpers.sanitizeSequenceAnimaticCameraPlateText(cell.lighting ?? helpers.asRecord(shot).lighting, 160)
    const screenDirection = helpers.sanitizeSequenceAnimaticCameraPlateText(
      cell.screenDirection ?? cell.screen_direction ?? helpers.asRecord(shot).screenDirection ?? helpers.asRecord(shot).screen_direction,
      140,
    )
    const normalizedCell = {
      shotId: helpers.readText(cell.shotId),
      cellIndex: Number(cell.cellIndex ?? index) || index,
      row: Number(cell.row ?? Math.floor(index / 3)) || Math.floor(index / 3),
      column: Number(cell.column ?? index % 3) || index % 3,
      camera: cameraText,
      framing,
      cameraHeight,
      cameraAngle: inferredCameraAngle,
      lens,
      movement,
      foreground: spotName ? `${spotName} foreground geometry` : '',
      midground: locationFeatures,
      background: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(boardRecord.zoneName) || helpers.readText(boardRecord.zoneId) || 'zone background', 160),
      landmarks: locationFeatures,
      locationFeatures,
      lightingWeather,
      lightDirection: lightingWeather,
      paletteWeather: lightingWeather,
      screenDirection,
      composition: helpers.sanitizeSequenceAnimaticCameraPlateText([cameraText, locationFeatures, screenDirection].filter(Boolean).join('; '), 260),
      spotId: helpers.readText(cell.spotId ?? cell.spot_id),
      spotName,
    }
    return {
      ...normalizedCell,
      cameraPlateBrief: buildCameraPlateBrief(helpers, normalizedCell),
    }
  }).filter((cell) => cell.shotId)
  const fallback = sequenceAnimaticZoneCameraGridBriefSchema.parse({
    boardSummary: `Location-only camera coverage grid for ${helpers.readText(boardRecord.zoneName) || helpers.readText(boardRecord.zoneId) || 'zone'}.`,
    cells: fallbackCells.length > 0 ? fallbackCells : [{
      shotId: 'shot',
      cellIndex: 0,
      row: 0,
      column: 0,
      cameraPlateBrief: 'Show the zone geography from the shot camera angle, without characters or labels.',
    }],
    diagnostics: ['Deterministic camera-grid brief fallback.'],
  })
  const briefPrompt = [
    'Create visual-only camera plate facts for a 3x3 zone camera coverage grid.',
    'Return compact mechanical fields, not prose. Each cell is an empty location/camera plate only.',
    'Use only camera facts, spatial binding, lighting/weather, screen direction, set/zone/spot names, and location continuity.',
    'Do not mention character names, people, bodies, silhouettes, crowds, props held by characters, action beats, dialogue, captions, labels, arrows, storyboard text, panels, UI, or internal IDs.',
    'If any input implies action or emotion, drop it. Keep only camera angle, lens/height, foreground/midground/background geometry, landmarks, weather, and screen direction.',
    artStyleDescription ? `Project art style to preserve later: ${artStyleDescription}` : '',
    helpers.readText(previousBoard.assetKey ?? previousBoard.boardAssetKey) ? 'A previous zone camera grid exists. Note reusable camera angles/geography only when shots return to the same location angle.' : '',
    '',
    'Board context',
    JSON.stringify({
      title: helpers.readText(boardRecord.title),
      scene: helpers.readText(boardRecord.sceneTitle) || helpers.readText(boardRecord.sceneId),
      set: helpers.readText(boardRecord.setName) || helpers.readText(boardRecord.setId),
      zone: helpers.readText(boardRecord.zoneName) || helpers.readText(boardRecord.zoneId),
      zoneSummary: helpers.readText(boardRecord.zoneSummary),
      userSceneGraphOverrides: sceneGraphOverrides.map((override) => ({
        nodeId: helpers.readText(override.nodeId),
        nodeKind: helpers.readText(override.nodeKind),
        visualBriefOverride: helpers.readText(override.visualBriefOverride),
        extraPromptDirection: helpers.readText(override.extraPromptDirection),
      })),
    }, null, 2),
    '',
    'Cells and shot camera facts',
    JSON.stringify(coverageCells.slice(0, 9).map((cell, index) => {
      const shot = shots.find((entry) => helpers.readText(entry.id) === helpers.readText(cell.shotId)) ?? {}
      const shotRecord = helpers.asRecord(shot)
      const camera = helpers.asRecord(cell.camera ?? shotRecord.camera)
      return {
        shotId: helpers.readText(cell.shotId),
        cellIndex: Number(cell.cellIndex ?? index) || index,
        row: Number(cell.row ?? Math.floor(index / 3)) || Math.floor(index / 3),
        column: Number(cell.column ?? index % 3) || index % 3,
        camera: {
          framing: helpers.sanitizeSequenceAnimaticCameraPlateText(camera.framing, 120),
          angle: helpers.sanitizeSequenceAnimaticCameraPlateText(camera.angle, 120),
          lens: helpers.sanitizeSequenceAnimaticCameraPlateText(camera.lens, 120),
          movement: helpers.sanitizeSequenceAnimaticCameraPlateText(camera.movement, 120),
        },
        lighting: helpers.sanitizeSequenceAnimaticCameraPlateText(cell.lighting ?? shotRecord.lighting, 140),
        screenDirection: helpers.sanitizeSequenceAnimaticCameraPlateText(cell.screenDirection ?? cell.screen_direction ?? shotRecord.screenDirection ?? shotRecord.screen_direction, 140),
        cameraFraming: helpers.sanitizeSequenceAnimaticCameraPlateText(cell.cameraFraming ?? cell.camera_framing, 120),
        cameraAngle: helpers.sanitizeSequenceAnimaticCameraPlateText(cell.cameraAngle ?? cell.camera_angle, 120),
        locationContinuity: helpers.sanitizeSequenceAnimaticCameraPlateText(cell.locationContinuity ?? cell.location_continuity ?? shotRecord.locationContinuity ?? shotRecord.location_continuity, 220),
        spotId: helpers.readText(cell.spotId ?? cell.spot_id),
        spotName: helpers.sanitizeSequenceAnimaticSpatialPromptText(cell.spotName ?? cell.spot_name, {
          forbiddenNames: boardForbiddenNames,
          maxLength: 120,
        }).text,
      }
    }), null, 2),
    '',
    'Location reference names only',
    JSON.stringify(helpers.readArray(assetPack.entities).map(helpers.asRecord).map((entity) => ({
      name: helpers.readText(entity.name ?? entity.title ?? entity.label),
      role: helpers.readText(entity.role),
      summary: helpers.readText(entity.summary ?? entity.visualDescription ?? entity.visual_description),
    })).slice(0, 16), null, 2),
  ].filter(Boolean).join('\n')
  const structuredResult = await helpers.runStructuredNode({
    nodeKey: context.node.key,
    schemaName: 'sequence_animatic_zone_camera_grid_brief',
    schema: sequenceAnimaticZoneCameraGridBriefSchema,
    instructions: 'Return strict JSON only. Produce location-only camera plate briefs. Never include characters, subject labels, storyboard text, image prompt prose, or internal workflow language.',
    prompt: briefPrompt,
    fallback,
    maxOutputTokens: 4200,
  })
  const fallbackByShotId = new Map(fallback.cells.map((cell) => [helpers.readText(cell.shotId), cell]))
  const normalizedCells = structuredResult.value.cells.map((cell, index) => {
    const fallbackCell = helpers.asRecord(fallbackByShotId.get(helpers.readText(cell.shotId)) ?? fallback.cells[index])
    const merged = { ...fallbackCell, ...cell }
    const cameraText = helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.camera) || helpers.readText(fallbackCell.camera), 180)
    const normalizedCell = {
      ...merged,
      shotId: helpers.readText(merged.shotId),
      cellIndex: Number(merged.cellIndex ?? index) || index,
      row: Number(merged.row ?? Math.floor(index / 3)) || Math.floor(index / 3),
      column: Number(merged.column ?? index % 3) || index % 3,
      camera: cameraText,
      framing: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.framing) || helpers.readText(fallbackCell.framing), 120),
      cameraHeight: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.cameraHeight) || helpers.readText(fallbackCell.cameraHeight) || inferCameraHeight(helpers, cameraText), 100),
      cameraAngle: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.cameraAngle) || helpers.readText(fallbackCell.cameraAngle) || inferCameraAngle(helpers, cameraText), 120),
      lens: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.lens) || helpers.readText(fallbackCell.lens), 90),
      movement: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.movement) || helpers.readText(fallbackCell.movement), 100),
      foreground: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.foreground) || helpers.readText(fallbackCell.foreground), 160),
      midground: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.midground) || helpers.readText(fallbackCell.midground), 180),
      background: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.background) || helpers.readText(fallbackCell.background), 180),
      landmarks: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.landmarks) || helpers.readText(fallbackCell.landmarks) || helpers.readText(merged.locationFeatures), 200),
      locationFeatures: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.locationFeatures) || helpers.readText(fallbackCell.locationFeatures), 240),
      lightingWeather: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.lightingWeather) || helpers.readText(fallbackCell.lightingWeather), 160),
      lightDirection: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.lightDirection) || helpers.readText(fallbackCell.lightDirection) || helpers.readText(merged.lightingWeather), 140),
      paletteWeather: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.paletteWeather) || helpers.readText(fallbackCell.paletteWeather) || helpers.readText(merged.lightingWeather), 140),
      screenDirection: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.screenDirection) || helpers.readText(fallbackCell.screenDirection), 140),
      composition: helpers.sanitizeSequenceAnimaticCameraPlateText(helpers.readText(merged.composition) || helpers.readText(fallbackCell.composition), 220),
      spotId: helpers.readText(merged.spotId),
      spotName: helpers.sanitizeSequenceAnimaticSpatialPromptText(helpers.readText(merged.spotName) || helpers.readText(fallbackCell.spotName), {
        forbiddenNames: boardForbiddenNames,
        maxLength: 120,
      }).text,
    }
    return {
      ...normalizedCell,
      cameraPlateBrief: buildCameraPlateBrief(helpers, normalizedCell),
    }
  }).filter((cell) => cell.shotId && cell.cameraPlateBrief).slice(0, 9)
  const promptDiagnostics = helpers.sequenceAnimaticZoneGridPromptDiagnostics(normalizedCells)
  const brief = sequenceAnimaticZoneCameraGridBriefSchema.parse({
    ...structuredResult.value,
    cells: normalizedCells.length > 0 ? normalizedCells : fallback.cells,
    diagnostics: [
      ...helpers.readStringArray(structuredResult.value.diagnostics),
      ...helpers.readStringArray(promptDiagnostics.messages),
    ].slice(0, 12),
  })
  const outputs = {
    coverageBrief: brief,
    coverage_brief: brief,
    cameraGridBrief: brief,
    camera_grid_brief: brief,
    cells: brief.cells,
    board: boardRecord,
    zoneCoverageBoard: boardRecord,
    zone_coverage_board: boardRecord,
    shots,
    coverageCells,
    coverage_cells: coverageCells,
    assetPack,
    asset_pack: assetPack,
    previousBoard,
    previous_board: previousBoard,
    sceneGraphOverrides,
    scene_graph_overrides: sceneGraphOverrides,
    text: JSON.stringify(brief, null, 2),
    prompt: briefPrompt,
    promptDiagnostics,
    prompt_diagnostics: promptDiagnostics,
    fallbackUsed: structuredResult.fallbackUsed,
    fallbackReason: structuredResult.fallbackReason,
    deterministic: structuredResult.fallbackUsed,
  }
  return {
    inputHash: context.inputHash,
    outputHash: helpers.hashOutputWorkflowValue(outputs),
    outputs,
    provider: structuredResult.provider,
    model: structuredResult.model,
  }
}

async function sequenceAnimaticZoneCoverageBoardPrompt(
  context: SceneBoardNodeExecutionContext,
  helpers: SceneBoardWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const board = helpers.readFirstUpstreamRecord(context.upstream, ['board', 'zoneCoverageBoard', 'zone_coverage_board'])
  const upstreamShots = helpers.readFirstUpstreamArray(context.upstream, ['shots']).map(helpers.asRecord)
  const shots = upstreamShots.length > 0 ? upstreamShots : helpers.readArray(config.shots).map(helpers.asRecord)
  const upstreamCoverageCells = helpers.readFirstUpstreamArray(context.upstream, ['coverageCells', 'coverage_cells']).map(helpers.asRecord)
  const coverageCells = upstreamCoverageCells.length > 0 ? upstreamCoverageCells : helpers.readArray(config.coverageCells ?? config.coverage_cells).map(helpers.asRecord)
  const coverageBrief = helpers.readFirstUpstreamRecord(context.upstream, ['coverageBrief', 'coverage_brief', 'cameraGridBrief', 'camera_grid_brief'])
  const briefCells = helpers.readArray(coverageBrief.cells).map(helpers.asRecord)
  const upstreamAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const assetPack = Object.keys(upstreamAssetPack).length > 0 ? upstreamAssetPack : helpers.asRecord(config.assetPack)
  const previousBoard = helpers.readFirstUpstreamRecord(context.upstream, ['previousBoard', 'previous_board'])
  const upstreamSceneGraphOverrides = helpers.readFirstUpstreamArray(context.upstream, ['sceneGraphOverrides', 'scene_graph_overrides']).map(helpers.asRecord)
  const sceneGraphOverrides = upstreamSceneGraphOverrides.length > 0
    ? upstreamSceneGraphOverrides
    : helpers.readArray(config.sceneGraphOverrides ?? config.scene_graph_overrides).map(helpers.asRecord)
  const referenceManifestText = helpers.sequenceAnimaticReferenceManifestText(assetPack)
  const boardRecord = Object.keys(board).length > 0 ? board : helpers.asRecord(config.board)
  const artStyleDescription = helpers.readText(boardRecord.artStyleDescription ?? boardRecord.art_style_description)
    || helpers.readText(config.artStyleDescription ?? config.art_style_description)
  const boardForbiddenNames = helpers.sequenceAnimaticSpatialForbiddenNamesFromShots(shots)
  const cellLines = coverageCells.map((cell, index) => {
    const brief = helpers.asRecord(briefCells.find((entry) => helpers.readText(entry.shotId) === helpers.readText(cell.shotId)) ?? {})
    return helpers.sequenceAnimaticCompactZoneGridCellLine({
      ...cell,
      ...brief,
      row: Number(cell.row ?? brief.row ?? Math.floor(index / 3)) || Math.floor(index / 3),
      column: Number(cell.column ?? brief.column ?? index % 3) || index % 3,
      spotName: helpers.readText(brief.spotName) || helpers.readText(cell.spotName ?? cell.spot_name),
    }, index)
  }).join('\n')
  const previousBoardAssetKey = helpers.readText(previousBoard.assetKey ?? previousBoard.boardAssetKey ?? previousBoard.board_asset_key)
  const referenceNames = helpers.sequenceAnimaticReferenceManifestEntries(assetPack)
    .map(helpers.asRecord)
    .map((entry) => [helpers.readText(entry.label), helpers.readText(entry.role)].filter(Boolean).join(' '))
    .filter(Boolean)
    .slice(0, 10)
  const promptDiagnostics = helpers.sequenceAnimaticZoneGridPromptDiagnostics(briefCells)
  const diagnosticMessages = helpers.readStringArray(promptDiagnostics.messages)
  const prompt = [
    'Visual-only production plate grid: create one wide 16:9 zone camera coverage grid divided into a clean 3x3 grid.',
    'Each filled cell is an empty location camera plate for one shot angle. Fill cells in row-major order; leave unused cells plain and empty.',
    artStyleDescription ? `Project art style lock: ${artStyleDescription}` : '',
    'Use attached references in global-to-local order: the zone spatial map locks topology, routes, entrances, sightlines, and POI placement; spot atlas references lock local surfaces, landmarks, material detail, and camera-facing geometry; the set ref locks broader style and lighting logic.',
    'No people, no characters, no silhouettes, no crowds, no placeholder bodies, no subject labels, no arrows, no captions, no shot numbers, no speech bubbles, no UI, no watermarks, and no visible text inside the image.',
    'Do not use a cartoony/sketch/comic/storyboard style unless the project art style explicitly says so. Match the project art direction and the visual finish of the location references.',
    'Each cell should show only camera angle, foreground/midground/background geometry, horizon/ground plane, screen direction, lighting/weather, and stable spatial landmarks.',
    previousBoardAssetKey ? 'A previous zone camera grid reference is attached. Reuse matching location geography, camera angles, landmarks, and lighting continuity where the new cells return to the same zone angle.' : '',
    '',
    `Grid: ${helpers.readText(boardRecord.title) || helpers.readText(boardRecord.id) || 'Zone camera grid'}`,
    `Scene: ${helpers.readText(boardRecord.sceneTitle) || helpers.readText(boardRecord.sceneId) || 'scene'} / Set: ${helpers.readText(boardRecord.setName) || helpers.readText(boardRecord.setId) || 'set'} / Zone: ${helpers.readText(boardRecord.zoneName) || helpers.readText(boardRecord.zoneId) || 'zone'}`,
    helpers.readText(boardRecord.zoneSummary) ? `Zone continuity: ${helpers.sanitizeSequenceAnimaticCameraPlateText(boardRecord.zoneSummary, 260)}` : '',
    referenceNames.length > 0 ? `Attached refs: ${referenceNames.join(' / ')}` : '',
    sceneGraphOverrides.length > 0 ? [
      '',
      'User-edited scene graph direction',
      ...sceneGraphOverrides.map((override) => [
        helpers.readText(override.nodeKind) || 'node',
        helpers.readText(override.nodeId),
        helpers.readText(override.visualBriefOverride) ? `Visual brief: ${helpers.sanitizeSequenceAnimaticSpatialPromptText(override.visualBriefOverride, { forbiddenNames: boardForbiddenNames, maxLength: 180 }).text}` : '',
        helpers.readText(override.extraPromptDirection) ? `Extra direction: ${helpers.sanitizeSequenceAnimaticSpatialPromptText(override.extraPromptDirection, { forbiddenNames: boardForbiddenNames, maxLength: 180 }).text}` : '',
      ].filter(Boolean).join(' / ')),
    ].join('\n') : '',
    '',
    'Cell camera/location map',
    cellLines,
    diagnosticMessages.length > 0 ? `\nPrompt diagnostics: ${diagnosticMessages.join(' | ')}` : '',
  ].filter(Boolean).join('\n')
  const referenceManifest = helpers.sequenceAnimaticReferenceManifestEntries(assetPack)
  const outputs = {
    prompt,
    text: prompt,
    board: boardRecord,
    zoneCoverageBoard: boardRecord,
    zone_coverage_board: boardRecord,
    shots,
    coverageCells,
    coverage_cells: coverageCells,
    assetPack,
    asset_pack: assetPack,
    previousBoard,
    previous_board: previousBoard,
    coverageBrief,
    coverage_brief: coverageBrief,
    sceneGraphOverrides,
    scene_graph_overrides: sceneGraphOverrides,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText,
    reference_manifest_text: referenceManifestText,
    promptDiagnostics,
    prompt_diagnostics: promptDiagnostics,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-zone-coverage-board-prompt-v1' })
}

async function sequenceAnimaticZoneCoverageBoardExtract(
  context: SceneBoardNodeExecutionContext,
  helpers: SceneBoardWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const board = helpers.readFirstUpstreamRecord(context.upstream, ['board', 'zoneCoverageBoard', 'zone_coverage_board'])
  const coverageCells = helpers.readFirstUpstreamArray(context.upstream, ['coverageCells', 'coverage_cells']).map(helpers.asRecord)
  const image = helpers.asRecord(helpers.readFirstUpstreamImage(context.upstream, ['image']) ?? {})
  const assetKey = helpers.readText(image.assetKey)
  const storagePath = helpers.readText(image.storagePath) || helpers.readText(image.storage_path)
  if (!assetKey || !storagePath) throw new Error('Zone camera grid extraction requires a generated grid image.')
  const mimeType = helpers.readText(image.mimeType) || helpers.readText(image.mime_type) || 'image/webp'
  const sourceBytes = await helpers.downloadProjectAssetBytes(context.client, storagePath)
  const tempDir = await helpers.makeTempDir('graphcore-zone-coverage-board-')
  const sourceExt = mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'webp'
  const sourcePath = `${tempDir}/source.${sourceExt}`
  const extractedCells: LooseRecord[] = []
  const cellAssetKeysByShotId: Record<string, string> = {}
  const coverageCellByShotId: Record<string, unknown> = {}
  try {
    await helpers.writeFile(sourcePath, sourceBytes)
    const size = await helpers.probeImageSize(sourcePath)
    if (!size) throw new Error('Zone camera grid extraction could not read generated image dimensions.')
    const rows = 3
    const columns = 3
    for (let index = 0; index < coverageCells.length && index < 9; index += 1) {
      const cell = coverageCells[index]
      const shotId = helpers.readText(cell.shotId)
      if (!shotId) continue
      const row = Math.floor(index / columns)
      const column = index % columns
      const cropX = Math.floor((size.width * column) / columns)
      const cropY = Math.floor((size.height * row) / rows)
      const nextX = Math.floor((size.width * (column + 1)) / columns)
      const nextY = Math.floor((size.height * (row + 1)) / rows)
      const cellWidth = Math.max(1, Math.min(size.width - cropX, nextX - cropX))
      const cellHeight = Math.max(1, Math.min(size.height - cropY, nextY - cropY))
      const outputPath = `${tempDir}/${helpers.slugify(shotId)}.webp`
      const crop = await helpers.runFfmpeg(['-y', '-i', sourcePath, '-vf', `crop=${cellWidth}:${cellHeight}:${cropX}:${cropY}`, outputPath])
      if (!crop.ok) throw new Error(`Zone camera grid crop failed for ${shotId}: ${crop.stderr.slice(0, 1200)}`)
      const cropVerification = await helpers.verifySequenceAnimaticAnchorCrop({
        outputPath,
        anchorId: shotId,
        expectedWidth: cellWidth,
        expectedHeight: cellHeight,
        row,
        column,
      })
      const bytes = await helpers.readFile(outputPath)
      const targetAssetKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(shotId)}.sequence-animatic-zone-coverage-cell`
      const targetStoragePath = `generated/output-workflows/${context.run.projectId}/${context.run.id}/zone-coverage-cell-${helpers.slugify(shotId)}.webp`
      await helpers.uploadBytes(context.client, targetStoragePath, bytes, 'image/webp')
      const coverageSetupId = helpers.readText(cell.coverageSetupId)
      const coverageAnchorScopeKey = helpers.readText(cell.coverageAnchorScopeKey)
      const coverageAnchorScope = helpers.readText(cell.coverageAnchorScope) || 'shot_scoped'
      const coverageAnchorSource = helpers.readText(cell.coverageAnchorSource ?? cell.coverage_anchor_source ?? config.coverageAnchorSource ?? config.coverage_anchor_source) || 'zone_camera_grid_cell'
      const coverageAnchorMode = helpers.readText(cell.coverageAnchorMode ?? cell.coverage_anchor_mode ?? config.coverageAnchorMode ?? config.coverage_anchor_mode) || 'location_camera_plate_v2'
      const cellImage = {
        assetKey: targetAssetKey,
        storagePath: targetStoragePath,
        storage_path: targetStoragePath,
        mimeType: 'image/webp',
        mime_type: 'image/webp',
        width: cellWidth,
        height: cellHeight,
        role: 'sequence_animatic_coverage_anchor_image',
        coverageAnchorSource,
        coverage_anchor_source: coverageAnchorSource,
      }
      const artifact = await helpers.registerImageArtifact({
        client: context.client,
        run: context.run,
        workflow: context.workflow,
        node: context.node,
        assetKey: targetAssetKey,
        storagePath: targetStoragePath,
        name: `${helpers.readText(cell.shotTitle) || shotId} Coverage Cell`,
        summary: 'Cropped shot coverage anchor generated from a scene-level zone camera grid.',
        mimeType: 'image/webp',
        metadata: {
          generatedBy: 'output_workflow',
          workflowId: context.workflow.id,
          workflowKey: context.workflow.key,
          runId: context.run.id,
          nodeId: context.node.id,
          nodeKey: context.node.key,
          provider: 'graphcore',
          model: 'ffmpeg-sequence-animatic-zone-coverage-board-extract-v1',
          role: 'sequence_animatic_coverage_anchor',
          sourceArtifactRole: 'sequence_animatic_zone_coverage_cell',
          sequenceAnimaticRole: 'coverage_anchor',
          screenplayAnimaticRole: 'coverage_anchor',
          coverageAnchorMode,
          coverage_anchor_mode: coverageAnchorMode,
          coverageAnchorSource,
          coverage_anchor_source: coverageAnchorSource,
          masterRequestId: helpers.readText(config.masterRequestId),
          sceneId: helpers.readText(board.sceneId ?? config.sceneId),
          setId: helpers.readText(board.setId ?? config.setId),
          zoneId: helpers.readText(board.zoneId ?? config.zoneId),
          boardId: helpers.readText(board.id ?? config.boardId),
          chunkIndex: Number(board.chunkIndex ?? config.chunkIndex ?? 0) || 0,
          shotId,
          shotIds: [shotId],
          coverageSetupId,
          coverageAnchorScopeKey,
          coverageAnchorScope,
          assetKey: targetAssetKey,
          image: cellImage,
          sourceBoardAssetKey: assetKey,
          sourceBoardStoragePath: storagePath,
          row,
          column,
          cellIndex: index,
          cropRect: { x: cropX, y: cropY, width: cellWidth, height: cellHeight },
          cropVerification,
          cell,
          storageBucket: 'project-assets',
          storagePath: targetStoragePath,
        },
      })
      const extractedCell = {
        ...cell,
        shotId,
        assetKey: targetAssetKey,
        storagePath: targetStoragePath,
        artifactKey: artifact.key,
        image: { ...cellImage, artifact },
        coverageSetupId,
        coverageAnchorScopeKey,
        coverageAnchorScope,
        coverageAnchorSource,
        coverageAnchorMode,
        row,
        column,
        cellIndex: index,
        cropRect: { x: cropX, y: cropY, width: cellWidth, height: cellHeight },
        cropVerification,
      }
      extractedCells.push(extractedCell)
      cellAssetKeysByShotId[shotId] = targetAssetKey
      coverageCellByShotId[shotId] = extractedCell
    }
  } finally {
    await helpers.removeDir(tempDir)
  }
  const outputs = {
    cells: extractedCells,
    coverageCells: extractedCells,
    coverage_cells: extractedCells,
    cellAssetKeysByShotId,
    cell_asset_keys_by_shot_id: cellAssetKeysByShotId,
    coverageCellByShotId,
    coverage_cell_by_shot_id: coverageCellByShotId,
    board: Object.keys(board).length > 0 ? board : helpers.asRecord(config.board),
    sourceImage: image,
    source_image: image,
    text: `Extracted ${extractedCells.length} zone camera grid cell${extractedCells.length === 1 ? '' : 's'}.`,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-zone-coverage-board-extract-v1' })
}

async function sequenceAnimaticZoneCoverageBoardArtifact(
  context: SceneBoardNodeExecutionContext,
  helpers: SceneBoardWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const board = helpers.readFirstUpstreamRecord(context.upstream, ['board', 'zoneCoverageBoard', 'zone_coverage_board'])
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const image = helpers.asRecord(helpers.readFirstUpstreamImage(context.upstream, ['image']) ?? {})
  const upstreamCellSets = Object.entries(context.upstream)
    .map(([key, outputs]) => ({
      key,
      cells: helpers.readFirstUpstreamArray({ [key]: outputs }, ['cells', 'coverageCells', 'coverage_cells']).map(helpers.asRecord),
    }))
    .filter((entry) => entry.cells.length > 0)
  const extractedCellSet = upstreamCellSets.find((entry) =>
    entry.key.includes('extract') && entry.cells.some((cell) => helpers.readText(cell.assetKey ?? cell.asset_key)),
  )
  const assetBackedCellSet = upstreamCellSets.find((entry) =>
    entry.cells.some((cell) => helpers.readText(cell.assetKey ?? cell.asset_key)),
  )
  const cells = (extractedCellSet ?? assetBackedCellSet ?? upstreamCellSets[0] ?? { cells: [] }).cells.map(helpers.asRecord)
  const boardId = helpers.readText(board.id) || helpers.readText(config.boardId)
  if (!boardId) throw new Error('Zone camera grid artifact requires a board id.')
  const boardAssetKey = helpers.readText(image.assetKey)
  if (!boardAssetKey) throw new Error('Zone camera grid image did not produce an asset key.')
  const cellAssetKeysByShotId = Object.fromEntries(cells
    .map((cell) => [helpers.readText(cell.shotId), helpers.readText(cell.assetKey)] as const)
    .filter(([shotId, assetKey]) => shotId && assetKey))
  const coverageCellByShotId = Object.fromEntries(cells
    .map((cell) => [helpers.readText(cell.shotId), cell] as const)
    .filter(([shotId]) => Boolean(shotId)))
  const now = new Date().toISOString()
  const boardRecord = {
    ...board,
    id: boardId,
    boardId,
    boardAssetKey,
    image,
    cellAssetKeysByShotId,
    cell_asset_keys_by_shot_id: cellAssetKeysByShotId,
    coverageCellByShotId,
    coverage_cell_by_shot_id: coverageCellByShotId,
    cells,
    generatedAt: now,
    status: 'ready',
  }
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(boardId)}.sequence-animatic-zone-coverage-board`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${helpers.readText(board.title) || helpers.titleFromRefLike(boardId)} Zone Camera Grid`,
    summary: 'Scene-level 3x3 location-only camera grid whose cells feed shot coverage anchors.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-zone-coverage-board-artifact-v1',
      role: 'sequence_animatic_zone_coverage_board',
      zoneCoverageGridMode: helpers.readText(config.zoneCoverageGridMode ?? config.zone_coverage_grid_mode) || 'location_camera_plate_v2',
      coverageAnchorSource: helpers.readText(config.coverageAnchorSource ?? config.coverage_anchor_source) || 'zone_camera_grid_cell',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'zone_coverage_board',
      screenplayAnimaticRole: 'zone_coverage_board',
      masterRequestId: helpers.readText(config.masterRequestId),
      sceneId: helpers.readText(board.sceneId ?? config.sceneId),
      setId: helpers.readText(board.setId ?? config.setId),
      zoneId: helpers.readText(board.zoneId ?? config.zoneId),
      chunkIndex: Number(board.chunkIndex ?? config.chunkIndex ?? 0) || 0,
      shotIds: helpers.readStringArray(board.shotIds),
      sourceHash: helpers.readText(board.sourceHash ?? config.sourceHash),
      previousBoardAssetKey: helpers.readText(board.previousBoardAssetKey ?? config.previousBoardAssetKey),
      board: boardRecord,
      prompt,
      image,
      boardAssetKey,
      cells,
      cellAssetKeysByShotId,
      coverageCellByShotId,
    },
  })
  const masterRequestId = helpers.readText(config.masterRequestId)
  if (masterRequestId) {
    const client = context.client as SceneBoardDatabaseClient
    const masterResponse = await client
      .from('output_requests')
      .select('metadata')
      .eq('id', masterRequestId)
      .maybeSingle()
    if (!masterResponse.error && masterResponse.data) {
      const masterMetadata = helpers.asRecord(helpers.asRecord(masterResponse.data).metadata)
      const previousRegistry = helpers.asRecord(masterMetadata.sequenceAnimaticZoneCoverageRegistry ?? masterMetadata.sequence_animatic_zone_coverage_registry)
      const previousBoards = helpers.readArray(previousRegistry.zoneCoverageBoards ?? previousRegistry.zone_coverage_boards).map(helpers.asRecord)
      const nextBoards = [
        ...previousBoards.filter((entry) => helpers.readText(entry.id ?? entry.boardId) !== boardId),
        { ...boardRecord, artifactKey: artifact.key },
      ]
      const previousCellsByShot = helpers.asRecord(previousRegistry.coverageCellByShotId ?? previousRegistry.coverage_cell_by_shot_id)
      const nextCoverageCellByShotId = {
        ...previousCellsByShot,
        ...Object.fromEntries(Object.entries(coverageCellByShotId).map(([shotId, value]) => [shotId, { ...helpers.asRecord(value), boardId, artifactKey: artifact.key }])),
      }
      const registry = {
        role: 'sequence_animatic_zone_coverage_registry',
        contractVersion: 'zone_camera_coverage_grid_registry_v1',
        sourceMasterRequestId: masterRequestId,
        revision: (Number(previousRegistry.revision ?? 0) || 0) + 1,
        zoneCoverageBoards: nextBoards,
        zone_coverage_boards: nextBoards,
        coverageCellByShotId: nextCoverageCellByShotId,
        coverage_cell_by_shot_id: nextCoverageCellByShotId,
        updatedAt: now,
        updatedByBoardId: boardId,
      }
      const updateResponse = await client
        .from('output_requests')
        .update({
          metadata: {
            ...masterMetadata,
            sequenceAnimaticZoneCoverageRegistry: registry,
            sequence_animatic_zone_coverage_registry: registry,
          },
        })
        .eq('id', masterRequestId)
      if (updateResponse.error) throw new Error(updateResponse.error.message)
    }
  }
  await helpers.insertSequenceAnimaticEvent({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    requestId: masterRequestId,
    workflowId: context.workflow.id,
    runId: context.run.id,
    eventType: 'zone_coverage_board_ready',
    payload: {
      boardId,
      boardAssetKey,
      artifactKey: artifact.key,
      shotIds: helpers.readStringArray(board.shotIds),
      cellAssetKeysByShotId,
    },
    metadata: { source: 'sequence_animatic_zone_coverage_board_workflow' },
    dedupe: { boardId },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey: boardAssetKey,
    artifact,
    artifacts: [artifact],
    board: boardRecord,
    zoneCoverageBoard: boardRecord,
    zone_coverage_board: boardRecord,
    cells,
    coverageCells: cells,
    coverage_cells: cells,
    cellAssetKeysByShotId,
    cell_asset_keys_by_shot_id: cellAssetKeysByShotId,
    coverageCellByShotId,
    coverage_cell_by_shot_id: coverageCellByShotId,
    image,
    keyframe: image,
    primaryReferenceImage: image,
    prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-zone-coverage-board-artifact-v1' })
}

const sceneBoardHandlers = {
  sequence_animatic_scene_board_scope_input: sceneBoardScopeInput,
  sequence_animatic_scene_board_required_ref_plan: sceneBoardRequiredRefPlan,
  sequence_animatic_scene_board_set_ref_generation: sceneBoardSetRefGeneration,
  sequence_animatic_scene_board_scaffold_ref_generation: sceneBoardScaffoldRefGeneration,
  sequence_animatic_scene_board_coverage_intent_batch: sceneBoardCoverageIntentBatch,
  sequence_animatic_scene_board_zone_coverage_grid: sceneBoardZoneCoverageGrid,
  sequence_animatic_scene_board_coverage_cell_artifact: sceneBoardCoverageCellArtifact,
  sequence_animatic_zone_coverage_board_input: sequenceAnimaticZoneCoverageBoardInput,
  sequence_animatic_zone_coverage_board_brief: sequenceAnimaticZoneCoverageBoardBrief,
  sequence_animatic_zone_coverage_board_prompt: sequenceAnimaticZoneCoverageBoardPrompt,
  sequence_animatic_zone_coverage_board_extract: sequenceAnimaticZoneCoverageBoardExtract,
  sequence_animatic_zone_coverage_board_artifact: sequenceAnimaticZoneCoverageBoardArtifact,
}

const sceneBoardWorkflowNodePackKey = 'sequence_animatic_scene_board'

export const sceneBoardWorkflowNodePack = defineWorkflowNodePack<
  SceneBoardNodeExecutionContext,
  SceneBoardNodeExecutionResult,
  SceneBoardWorkflowNodePackHelpers,
  typeof sceneBoardHandlers
>({
  packKey: sceneBoardWorkflowNodePackKey,
  handlers: sceneBoardHandlers,
})

export const sceneBoardWorkflowNodeHandlerKeys = sceneBoardWorkflowNodePack.handlerKeys

function createSceneBoardNodeScaffold(input: {
  purpose: keyof typeof sceneBoardHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Scene Board workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: sceneBoardWorkflowNodePackKey,
    runtimeKind: input.runtimeKind,
    sourceHashKeys: input.sourceHashKeys,
    projectionMetadataKeys: input.projectionMetadataKeys,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    configSchema: manifest.configSchema,
    executable: manifest.executable,
    executionPolicy: manifest.executionPolicy,
    retryPolicy: manifest.retryPolicy,
    cachePolicy: {
      ...manifest.cachePolicy,
      sourceHashKeys: manifest.cachePolicy.sourceHashKeys.length > 0
        ? manifest.cachePolicy.sourceHashKeys
        : input.sourceHashKeys,
    },
    cancellationPolicy: manifest.cancellationPolicy,
    streamingPolicy: manifest.streamingPolicy,
  })
}

export const sceneBoardWorkflowNodeScaffolds = [
  createSceneBoardNodeScaffold({
    purpose: 'sequence_animatic_scene_board_scope_input',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.masterRequestId',
      'config.parentRequestId',
      'config.command.action',
      'config.command.sceneId',
      'config.command.setId',
      'config.command.zoneId',
      'config.command.scopeNodeId',
      'config.command.shotIds',
      'config.command.forceRefresh',
      'config.sceneBoardPrepPolicyVersion',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createSceneBoardNodeScaffold({
    purpose: 'sequence_animatic_scene_board_required_ref_plan',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.scope',
      'config.command.sceneId',
      'config.command.setId',
      'config.command.zoneId',
      'config.command.scopeNodeId',
      'config.command.shotIds',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'recoveryHints'],
  }),
  createSceneBoardNodeScaffold({
    purpose: 'sequence_animatic_scene_board_set_ref_generation',
    runtimeKind: 'child_workflow_utility',
    sourceHashKeys: [
      'upstream.requiredRefs',
      'config.masterRequestId',
      'config.command.forceRefresh',
      'config.sceneBoardChildWorkflowSpecsByStage.set_refs',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'activeChildRequestIds', 'activeChildRunIds', 'readyArtifactCount', 'recoveryHints'],
  }),
  createSceneBoardNodeScaffold({
    purpose: 'sequence_animatic_scene_board_scaffold_ref_generation',
    runtimeKind: 'child_workflow_utility',
    sourceHashKeys: [
      'upstream.setRefStatus',
      'config.masterRequestId',
      'config.command.forceRefresh',
      'config.sceneBoardChildWorkflowSpecsByStage.scaffold_refs',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'activeChildRequestIds', 'activeChildRunIds', 'readyArtifactCount', 'recoveryHints'],
  }),
  createSceneBoardNodeScaffold({
    purpose: 'sequence_animatic_scene_board_coverage_intent_batch',
    runtimeKind: 'child_workflow_utility',
    sourceHashKeys: [
      'upstream.scaffoldRefStatus',
      'config.masterRequestId',
      'config.command.sceneId',
      'config.command.setId',
      'config.command.zoneId',
      'config.command.shotIds',
      'config.command.scopedShots',
      'config.command.forceRefresh',
      'config.sceneBoardChildWorkflowSpecsByStage.coverage_directions',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'activeChildRequestIds', 'activeChildRunIds', 'readyArtifactCount', 'recoveryHints'],
  }),
  createSceneBoardNodeScaffold({
    purpose: 'sequence_animatic_scene_board_zone_coverage_grid',
    runtimeKind: 'child_workflow_utility',
    sourceHashKeys: [
      'upstream.coverageIntentStatus',
      'config.masterRequestId',
      'config.command.sceneId',
      'config.command.setId',
      'config.command.zoneId',
      'config.command.shotIds',
      'config.command.scopedShots',
      'config.command.forceRefresh',
      'config.sceneBoardChildWorkflowSpecsByStage.coverage_grids',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'activeChildRequestIds', 'activeChildRunIds', 'readyArtifactCount', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createSceneBoardNodeScaffold({
    purpose: 'sequence_animatic_scene_board_coverage_cell_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.workflowRuntime',
      'upstream.scope',
      'config.masterRequestId',
      'config.command.sceneId',
      'config.command.zoneId',
      'config.command.shotIds',
      'config.command.forceRefresh',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'activeChildRequestIds', 'readyArtifactCount', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createSceneBoardNodeScaffold({
    purpose: 'sequence_animatic_zone_coverage_board_input',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.masterRequestId',
      'config.board',
      'config.shots',
      'config.coverageCells',
      'config.assetPack',
      'config.previousBoard',
      'config.sceneGraphOverrides',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createSceneBoardNodeScaffold({
    purpose: 'sequence_animatic_zone_coverage_board_brief',
    runtimeKind: 'structured_llm',
    sourceHashKeys: [
      'upstream.board',
      'upstream.coverageCells',
      'upstream.assetPack',
      'config.masterRequestId',
      'config.sceneGraphOverrides',
      'config.zoneCoverageGridPolicyVersion',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'providerRequestId', 'recoveryHints'],
  }),
  createSceneBoardNodeScaffold({
    purpose: 'sequence_animatic_zone_coverage_board_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.coverageBrief',
      'upstream.coverageCells',
      'upstream.assetPack',
      'config.sceneGraphOverrides',
      'config.referenceAssetKeys',
      'config.zoneCoverageGridPolicyVersion',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'recoveryHints'],
  }),
  createSceneBoardNodeScaffold({
    purpose: 'sequence_animatic_zone_coverage_board_extract',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.image.assetKey',
      'upstream.image.storagePath',
      'upstream.coverageCells',
      'config.masterRequestId',
      'config.coverageAnchorSource',
      'config.coverageAnchorMode',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'readyArtifactCount', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createSceneBoardNodeScaffold({
    purpose: 'sequence_animatic_zone_coverage_board_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.image.assetKey',
      'upstream.cells',
      'upstream.board',
      'config.masterRequestId',
      'config.zoneCoverageGridMode',
      'config.coverageAnchorSource',
    ],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'readyArtifactCount', 'scopedAssetKeys', 'recoveryHints'],
  }),
]

export const sceneBoardWorkflowNodeScaffoldHandlerKeys = sceneBoardWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerSceneBoardWorkflowNodePack(input: {
  helpers: SceneBoardWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SceneBoardNodeExecutionContext) => Promise<SceneBoardNodeExecutionResult>) => void
}) {
  sceneBoardWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
