import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseWorkflowCommand } from './workflowCommandRegistry.ts'
import { legacyPayloadForWorkflowCommand } from './workflowCommandRegistry.ts'
import {
  assertWorkflowNodeHandlerCoverage,
  createWorkflowNodeHandlerRegistry,
  registerWorkflowNodeHandler,
} from './workflowNodeHandlerRegistry.ts'
import { buildWorkflowProgressViewModel } from './workflowProgressView.ts'
import { createWorkflowNodeManifest, workflowProjectionMetadataSchema } from './outputWorkflowManifests.ts'
import { createStreamingJsonlProcessor, extractCompleteJsonRecords } from '../../supabase/functions/_shared/output-workflow-streaming.ts'
import { sceneBoardWorkflowNodeHandlerKeys } from '../../supabase/functions/_shared/output-workflow-scene-board-pack.ts'
import { workflowUtilityNodeHandlerKeys } from '../../supabase/functions/_shared/output-workflow-utility-pack.ts'

test('buildWorkflowProgressViewModel derives active runtime state from projection metadata', () => {
  const model = buildWorkflowProgressViewModel({
    projection: {
      requestId: 'request_1',
      projectId: 'project_1',
      draftId: 'draft_1',
      workflowId: 'workflow_1',
      latestRunId: 'run_1',
      status: 'running',
      outputKind: 'cinematic_episode',
      title: 'Scene Board Prep',
      progress: {
        totalSteps: 4,
        steps: { queued: 2, running: 1, completed: 1, failed: 0 },
        activeNodes: [
          {
            nodeKey: 'zone_coverage_grid',
            label: 'Zone Coverage Grid',
            status: 'running',
            orderIndex: 2,
            manifestPurpose: 'sequence_animatic_scene_board_zone_coverage_grid',
            progressLabel: 'Queueing zone coverage grids',
            providerStatus: 'IN_PROGRESS',
            providerRequestId: 'provider_1',
          },
        ],
      },
      activeNodeKey: 'zone_coverage_grid',
      activeNodeLabel: 'Zone Coverage Grid',
      latestError: null,
      artifactKeys: ['artifact_1'],
      previewAssetKeys: ['asset_1'],
      graphRevision: 'graph_rev',
      timelineRevision: 'timeline_rev',
      terminal: false,
      metadata: {
        workflowRuntime: {
          activeManifestPurpose: 'sequence_animatic_scene_board_zone_coverage_grid',
          activeProgressLabel: 'Queueing zone coverage grids',
          activeChildRequestIds: ['child_request_1'],
          activeChildRunIds: ['child_run_1'],
          providerStatus: 'IN_PROGRESS',
          providerRequestId: 'provider_1',
          streaming: {
            status: 'streaming',
            providerRequestId: 'provider_1',
            providerStatus: 'IN_PROGRESS',
            eventCount: 12,
            partialArtifactKeys: ['partial_artifact_1'],
          },
          readyArtifactCount: 1,
          scopedAssetKeys: ['asset_1'],
          recoveryHints: ['resume child workflow'],
        },
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    },
  })

  assert.equal(model.status, 'running')
  assert.equal(model.activeProgressLabel, 'Queueing zone coverage grids')
  assert.equal(model.activeManifestPurpose, 'sequence_animatic_scene_board_zone_coverage_grid')
  assert.equal(model.percent, 25)
  assert.deepEqual(model.activeChildRequestIds, ['child_request_1'])
  assert.deepEqual(model.scopedAssetKeys, ['asset_1'])
  assert.equal(model.streamingStatus, 'streaming')
  assert.equal(model.streamingEventCount, 12)
  assert.deepEqual(model.streamingPartialArtifactKeys, ['partial_artifact_1'])
  assert.equal(model.nodes[0]?.key, 'zone_coverage_grid')
})

test('workflow projection metadata schema standardizes streaming state', () => {
  const parsed = workflowProjectionMetadataSchema.parse({
    activeManifestPurpose: 'sequence_animatic_scene_shot_plan',
    streaming: {
      status: 'polling',
      providerRequestId: 'response_1',
      providerStatus: 'queued',
      eventCount: 3,
      warningCount: 1,
      partialArtifactKeys: ['artifact_partial'],
      resumeToken: 'resume_1',
    },
  })

  assert.equal(parsed.streaming.status, 'polling')
  assert.equal(parsed.streaming.eventCount, 3)
  assert.deepEqual(parsed.streaming.partialArtifactKeys, ['artifact_partial'])
  assert.deepEqual(workflowProjectionMetadataSchema.parse({}).streaming.status, 'idle')
})

test('buildWorkflowProgressViewModel falls back to run steps when projection is not loaded', () => {
  const model = buildWorkflowProgressViewModel({
    request: {
      id: 'request_2',
      projectId: 'project_1',
      draftId: 'draft_1',
      parentRequestId: null,
      workflowId: 'workflow_2',
      latestRunId: 'run_2',
      requestedBy: null,
      sourceSurface: 'outputs',
      prompt: '',
      title: 'Animatic Master',
      intent: 'output_generation',
      outputKind: 'cinematic_episode',
      status: 'running',
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: [],
      pageCount: null,
      targetFormat: 'video',
      plannerNotes: '',
      errorMessage: null,
      metadata: { screenplayAnimaticRole: 'master' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    },
    run: {
      id: 'run_2',
      projectId: 'project_1',
      draftId: 'draft_1',
      workflowId: 'workflow_2',
      requestedBy: null,
      status: 'running',
      preset: 'cinematic_episode_from_sequence',
      prompt: '',
      targetFormat: 'video',
      worldSnapshotFingerprint: '',
      input: {},
      outputs: {},
      errorMessage: null,
      workerId: null,
      heartbeatAt: null,
      attemptCount: 0,
      metadata: {},
      artifacts: [],
      startedAt: null,
      completedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      steps: [
        step('step_1', 'run_2', 'workflow_2', 'script', 'completed', 0, 'Script', 'Authoring screenplay'),
        step('step_2', 'run_2', 'workflow_2', 'scene_plan', 'running', 1, 'Scene Plan', 'Building scene shots'),
        step('step_3', 'run_2', 'workflow_2', 'manifest', 'queued', 2, 'Manifest', 'Building manifest'),
      ],
    },
  })

  assert.equal(model.completedSteps, 1)
  assert.equal(model.totalSteps, 3)
  assert.equal(model.percent, 33)
  assert.equal(model.activeNodeKey, 'scene_plan')
  assert.equal(model.activeProgressLabel, 'Building scene shots')
  assert.equal(model.family, 'master')
})

test('buildWorkflowProgressViewModel reads streaming state from active run steps', () => {
  const model = buildWorkflowProgressViewModel({
    run: {
      id: 'run_streaming',
      projectId: 'project_1',
      draftId: 'draft_1',
      workflowId: 'workflow_streaming',
      requestedBy: null,
      status: 'running',
      preset: 'cinematic_episode_from_sequence',
      prompt: '',
      targetFormat: 'video',
      worldSnapshotFingerprint: '',
      input: {},
      outputs: {},
      errorMessage: null,
      workerId: null,
      heartbeatAt: null,
      attemptCount: 0,
      metadata: {},
      artifacts: [],
      startedAt: null,
      completedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      steps: [{
        ...step('step_stream', 'run_streaming', 'workflow_streaming', 'screenplay', 'running', 0, 'Screenplay', 'Streaming screenplay'),
        metadata: {
          progressLabel: 'Streaming screenplay',
          streaming: {
            status: 'streaming',
            eventCount: 8,
            partialArtifactKeys: ['partial_screenplay'],
          },
        },
      }],
    },
  })

  assert.equal(model.streamingStatus, 'streaming')
  assert.equal(model.streamingEventCount, 8)
  assert.deepEqual(model.streamingPartialArtifactKeys, ['partial_screenplay'])
})

test('parseWorkflowCommand resolves registered command defaults', () => {
  const parsed = parseWorkflowCommand({
    family: 'scene_board',
    action: 'regenerate_scene_board_zone',
    scope: {
      masterRequestId: 'master_1',
      sceneId: 'scene_1',
      shotIds: ['shot_2', 'shot_1'],
    },
  })

  assert.equal(parsed.manifest.legacyEndpoint, 'start-scene-board-workflow-command')
  assert.equal(parsed.manifest.targetRole, 'scene_board_prep')
  assert.equal(parsed.flags.forceRefresh, true)
})

test('legacyPayloadForWorkflowCommand maps generic commands to compatibility endpoints', () => {
  const routed = legacyPayloadForWorkflowCommand({
    family: 'sequence_animatic',
    action: 'generate_keyframes',
    scope: {
      masterRequestId: 'master_1',
      shotIds: ['shot_1'],
      coverageSetupIds: ['setup_1'],
    },
    flags: { allowProvisional: true },
  })

  assert.equal(routed.endpoint, 'ensure-sequence-animatic-keyframe-workflows')
  assert.deepEqual(routed.payload, {
    projectId: undefined,
    draftId: undefined,
    masterRequestId: 'master_1',
    mode: 'generate',
    shotIds: ['shot_1'],
    coverageSetupIds: ['setup_1'],
    allowProvisional: true,
  })
})

test('generic workflow command endpoint starts scene board commands directly', () => {
  const repoRoot = process.cwd()
  const genericSource = readFileSync(resolve(repoRoot, 'supabase/functions/start-workflow-command/index.ts'), 'utf8')
  const sceneBoardSource = readFileSync(resolve(repoRoot, 'supabase/functions/start-scene-board-workflow-command/index.ts'), 'utf8')

  assert.match(genericSource, /runSceneBoardWorkflowCommand/)
  assert.match(genericSource, /parsed\.family === 'scene_board'/)
  assert.match(genericSource, /parsed\.manifest\.templateKey/)
  assert.match(genericSource, /fetch\(`\$\{supabaseUrl\.replace/)
  assert.match(sceneBoardSource, /runSceneBoardWorkflowCommand/)
  assert.doesNotMatch(sceneBoardSource, /ensure_sequence_animatic_child_workflow/)
  assert.doesNotMatch(sceneBoardSource, /buildWorkflowTemplateGraph/)
  const sceneBoardCommandSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/scene-board-workflow-command.ts'), 'utf8')
  assert.doesNotMatch(sceneBoardCommandSource, /sequenceAnimaticSceneBoardPrepRunsSchema/)
  assert.doesNotMatch(sceneBoardCommandSource, /sequence_animatic_scene_board_prep_runs/)
})

test('workflow node handler registry enforces executable manifest coverage', () => {
  const manifest = createWorkflowNodeManifest({
    purpose: 'test_handler_manifest',
    label: 'Test Handler',
    requiredInputs: [],
    producedOutputs: ['output'],
    artifactRoles: [],
    previewRoles: [],
    recoveryStrategy: 'node_step',
    progressLabel: 'Testing handler',
    providerBacked: false,
    manualOnly: false,
    handlerKey: 'test_handler',
  })
  const registry = createWorkflowNodeHandlerRegistry()
  assert.throws(() => assertWorkflowNodeHandlerCoverage([manifest], registry), /Missing workflow node handler/)
  registerWorkflowNodeHandler(registry, 'test_handler', () => ({ outputs: { output: true } }))
  assert.doesNotThrow(() => assertWorkflowNodeHandlerCoverage([manifest], registry))
})

test('scene board and utility node packs expose registered handler keys', () => {
  assert.deepEqual(sceneBoardWorkflowNodeHandlerKeys, [
    'sequence_animatic_scene_board_scope_input',
    'sequence_animatic_scene_board_required_ref_plan',
    'sequence_animatic_scene_board_set_ref_generation',
    'sequence_animatic_scene_board_scaffold_ref_generation',
    'sequence_animatic_scene_board_coverage_intent_batch',
    'sequence_animatic_scene_board_zone_coverage_grid',
    'sequence_animatic_scene_board_coverage_cell_artifact',
  ])
  assert.deepEqual(workflowUtilityNodeHandlerKeys, [
    'workflow_ensure_child_workflow',
    'workflow_wait_child_workflow',
    'workflow_register_artifact_projection',
    'workflow_fanout_children',
    'workflow_collect_child_artifacts',
  ])
})

test('workflow runtime promotes child utility outputs into step metadata for projections', () => {
  const repoRoot = process.cwd()
  const runtimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(runtimeSource, /function stepRuntimeMetadataFromOutputs/)
  assert.match(runtimeSource, /outputs\.workflowRuntime/)
  assert.match(runtimeSource, /activeChildRequestIds: mergeUniqueStrings/)
  assert.match(runtimeSource, /streamingPartialArtifactKeys: mergeUniqueStrings/)
  assert.match(runtimeSource, /\.\.\.outputRuntimeMetadata/)
})

test('streaming jsonl processor extracts partial JSON records and tracks warnings', async () => {
  assert.deepEqual(extractCompleteJsonRecords('noise {"a":1}\n{"b":"two"} tail').records, ['{"a":1}', '{"b":"two"}'])
  const accepted: unknown[] = []
  const warnings: string[] = []
  const processor = createStreamingJsonlProcessor({
    parseRecord: (recordText) => {
      try {
        return { record: JSON.parse(recordText) as unknown, error: null }
      } catch (error) {
        return { record: null, error }
      }
    },
    onRecord: (record) => {
      accepted.push(record)
    },
    onInvalidRecord: (error) => {
      warnings.push(error instanceof Error ? error.message : String(error))
    },
  })
  await processor.push('{"first":')
  await processor.push('1}\n{bad')
  await processor.flush()
  assert.deepEqual(accepted, [{ first: 1 }])
  assert.equal(processor.acceptedRecordCount, 1)
  assert.equal(processor.warningCount, 1)
  assert.equal(warnings.length, 1)
})

function step(
  id: string,
  runId: string,
  workflowId: string,
  nodeKey: string,
  status: 'queued' | 'running' | 'completed',
  orderIndex: number,
  label: string,
  progressLabel: string,
) {
  return {
    id,
    runId,
    workflowId,
    nodeId: null,
    nodeKey,
    nodeType: 'utility_transform' as const,
    status,
    orderIndex,
    label,
    inputHash: '',
    outputHash: '',
    outputs: {},
    provider: null,
    model: null,
    providerRequestId: null,
    errorMessage: null,
    metadata: { progressLabel },
    startedAt: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
