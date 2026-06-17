import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  assertWorkflowCommandRouteCoverage,
  legacyPayloadForWorkflowCommand,
  listWorkflowCommandManifests,
  parseWorkflowCommand,
  workflowCommandActionSchema,
} from './workflowCommandRegistry.ts'
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

test('workflow command manifests cover every registered action exactly once', () => {
  assert.doesNotThrow(() => assertWorkflowCommandRouteCoverage())
  const manifestActionCounts = new Map<string, number>()
  for (const manifest of listWorkflowCommandManifests()) {
    manifestActionCounts.set(manifest.action, (manifestActionCounts.get(manifest.action) ?? 0) + 1)
  }

  for (const action of workflowCommandActionSchema.options) {
    assert.equal(manifestActionCounts.get(action), 1, `${action} should have exactly one command manifest`)
  }
})

test('legacyPayloadForWorkflowCommand maps generic commands to compatibility endpoints', () => {
  assert.doesNotThrow(() => assertWorkflowCommandRouteCoverage())

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

  const shotGraph = legacyPayloadForWorkflowCommand({
    family: 'sequence_animatic',
    action: 'prepare_shot_production_graph',
    scope: {
      masterRequestId: 'master_1',
      shotId: 'shot_1',
      coverageSetupIds: ['setup_1'],
    },
    flags: { allowProvisional: true, forceRefresh: true },
  })
  assert.equal(shotGraph.endpoint, 'ensure-sequence-animatic-shot-production-graph')
  assert.deepEqual(shotGraph.payload, {
    projectId: undefined,
    draftId: undefined,
    masterRequestId: 'master_1',
    shotId: 'shot_1',
    coverageSetupId: 'setup_1',
    forceRefresh: true,
    allowProvisional: true,
  })

  const shotVideo = legacyPayloadForWorkflowCommand({
    family: 'sequence_animatic',
    action: 'generate_shot_video',
    scope: {
      masterRequestId: 'master_1',
      storyboardBlockId: 'block_1',
      shotId: 'shot_1',
    },
    payload: {
      blockRequestId: 'request_1',
      panelAssetKey: 'panel_asset_1',
    },
  })
  assert.equal(shotVideo.endpoint, 'ensure-sequence-animatic-block-workflows')
  assert.deepEqual(shotVideo.payload, {
    projectId: undefined,
    draftId: undefined,
    masterRequestId: 'master_1',
    sequenceAnimaticMode: 'shot_video',
    storyboardBlockId: 'block_1',
    shotId: 'shot_1',
    blockRequestId: 'request_1',
    panelAssetKey: 'panel_asset_1',
  })

  const storyboardBlocks = legacyPayloadForWorkflowCommand({
    family: 'sequence_animatic',
    action: 'prepare_storyboard_blocks',
    scope: {
      masterRequestId: 'master_1',
    },
  })
  assert.equal(storyboardBlocks.endpoint, 'ensure-sequence-animatic-block-workflows')
  assert.deepEqual(storyboardBlocks.payload, {
    projectId: undefined,
    draftId: undefined,
    masterRequestId: 'master_1',
    sequenceAnimaticMode: 'storyboard_blocks',
  })

  const sceneShotPlans = legacyPayloadForWorkflowCommand({
    family: 'sequence_animatic',
    action: 'prepare_scene_shot_plans',
    scope: {
      masterRequestId: 'master_1',
      sceneIds: ['scene_1', 'scene_2'],
      sceneId: 'scene_2',
    },
  })
  assert.equal(sceneShotPlans.endpoint, 'ensure-sequence-animatic-scene-workflows')
  assert.deepEqual(sceneShotPlans.payload, {
    projectId: undefined,
    draftId: undefined,
    masterRequestId: 'master_1',
    sceneIds: ['scene_1', 'scene_2'],
    startSceneId: 'scene_2',
  })

  const continuityWorkflow = legacyPayloadForWorkflowCommand({
    family: 'sequence_animatic',
    action: 'prepare_continuity_workflow',
    scope: {
      masterRequestId: 'master_1',
    },
  })
  assert.equal(continuityWorkflow.endpoint, 'ensure-sequence-animatic-continuity-workflow')
  assert.deepEqual(continuityWorkflow.payload, {
    projectId: undefined,
    draftId: undefined,
    masterRequestId: 'master_1',
  })
})

test('generic workflow command endpoint starts scene board commands directly', () => {
  const repoRoot = process.cwd()
  const genericSource = readFileSync(resolve(repoRoot, 'supabase/functions/start-workflow-command/index.ts'), 'utf8')
  const commandHandlerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/workflow-command-handlers.ts'), 'utf8')
  const sceneBoardSource = readFileSync(resolve(repoRoot, 'supabase/functions/start-scene-board-workflow-command/index.ts'), 'utf8')
  const sceneBoardCommandSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/scene-board-workflow-command.ts'), 'utf8')
  const continuityEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-continuity-workflow/index.ts'), 'utf8')
  const continuityCommandSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-continuity-workflow-command.ts'), 'utf8')
  const sceneEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-scene-workflows/index.ts'), 'utf8')
  const sceneCommandSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-scene-workflow-command.ts'), 'utf8')
  const blockEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-block-workflows/index.ts'), 'utf8')
  const blockCommandSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-block-workflow-command.ts'), 'utf8')
  const shotRevisionEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-shot-revision-workflow/index.ts'), 'utf8')
  const shotRevisionCommandSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-shot-revision-workflow-command.ts'), 'utf8')
  const continuityAssetEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-continuity-asset-workflow/index.ts'), 'utf8')
  const continuityAssetCommandSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-continuity-asset-workflow-command.ts'), 'utf8')
  const shotProductionEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-shot-production-graph/index.ts'), 'utf8')
  const shotProductionCommandSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-shot-production-graph-command.ts'), 'utf8')
  const keyframeEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-keyframe-workflows/index.ts'), 'utf8')
  const keyframeCommandSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-keyframe-workflows-command.ts'), 'utf8')
  const animaticCommandUtilsSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-command-utils.ts'), 'utf8')
  const childWorkflowUtilsSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-child-utils.ts'), 'utf8')
  const coverageIntentEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-shot-coverage-intents/index.ts'), 'utf8')
  const coverageIntentCommandSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-shot-coverage-intents-command.ts'), 'utf8')
  const zoneCoverageEnsureSource = readFileSync(resolve(repoRoot, 'supabase/functions/ensure-sequence-animatic-zone-coverage-boards/index.ts'), 'utf8')
  const zoneCoverageCommandSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/sequence-animatic-zone-coverage-boards-command.ts'), 'utf8')
  const repositorySource = readFileSync(resolve(repoRoot, 'src/data/graphcoreRepository.ts'), 'utf8')

  assert.match(genericSource, /runWorkflowCommandHandler/)
  assert.doesNotMatch(genericSource, /runSceneBoardWorkflowCommand/)
  assert.doesNotMatch(genericSource, /runSequenceAnimaticContinuityWorkflowCommand/)
  assert.match(commandHandlerSource, /runSceneBoardWorkflowCommand/)
  assert.match(commandHandlerSource, /runSequenceAnimaticContinuityWorkflowCommand/)
  assert.match(commandHandlerSource, /runSequenceAnimaticSceneWorkflowCommand/)
  assert.match(commandHandlerSource, /runSequenceAnimaticBlockWorkflowCommand/)
  assert.match(commandHandlerSource, /runSequenceAnimaticShotRevisionWorkflowCommand/)
  assert.match(commandHandlerSource, /runSequenceAnimaticContinuityAssetWorkflowCommand/)
  assert.match(commandHandlerSource, /runSequenceAnimaticShotProductionGraphCommand/)
  assert.match(commandHandlerSource, /runSequenceAnimaticKeyframeWorkflowsCommand/)
  assert.match(commandHandlerSource, /runSequenceAnimaticShotCoverageIntentsCommand/)
  assert.match(commandHandlerSource, /runSequenceAnimaticZoneCoverageBoardsCommand/)
  assert.match(genericSource, /assertWorkflowCommandRouteCoverage/)
  assert.match(genericSource, /assertWorkflowCommandHandlerCoverage/)
  assert.match(commandHandlerSource, /export function assertWorkflowCommandHandlerCoverage/)
  assert.match(commandHandlerSource, /satisfies Record<WorkflowCommandAction, WorkflowCommandHandler>/)
  assert.match(commandHandlerSource, /prepare_scene_board: async/)
  assert.match(commandHandlerSource, /regenerate_scene_board_zone: async/)
  assert.match(commandHandlerSource, /prepare_continuity_workflow: async/)
  assert.match(commandHandlerSource, /prepare_scene_shot_plans: async/)
  assert.match(commandHandlerSource, /prepare_storyboard_blocks: async/)
  assert.match(commandHandlerSource, /generate_shot_video: async/)
  assert.match(commandHandlerSource, /revise_shot: async/)
  assert.match(commandHandlerSource, /generate_continuity_assets: async/)
  assert.match(commandHandlerSource, /prepare_shot_production_graph: async/)
  assert.match(commandHandlerSource, /generate_keyframes: async/)
  assert.match(commandHandlerSource, /generate_coverage_intents: async/)
  assert.match(commandHandlerSource, /generate_zone_coverage_grids: async/)
  assert.match(commandHandlerSource, /generate_coverage_anchors: async/)
  assert.match(commandHandlerSource, /export async function runWorkflowCommandHandler/)
  assert.match(commandHandlerSource, /assertWorkflowCommandHandlerCoverage\(\)/)
  assert.match(commandHandlerSource, /Workflow command handler is not implemented/)
  assert.match(childWorkflowUtilsSource, /markChildWorkflowStale/)
  assert.match(childWorkflowUtilsSource, /appendEnsuredChildWorkflow/)
  assert.match(childWorkflowUtilsSource, /createChildWorkflowEnsureAccumulator/)
  assert.match(childWorkflowUtilsSource, /loadChildWorkflowGraphBundle/)
  assert.match(childWorkflowUtilsSource, /loadOutputRequestById/)
  assert.match(genericSource, /parsed\.manifest\.templateKey/)
  assert.doesNotMatch(genericSource, /fetch\(`\$\{supabaseUrl\.replace/)
  assert.doesNotMatch(genericSource, /SUPABASE_URL/)
  assert.match(sceneBoardSource, /runSceneBoardWorkflowCommand/)
  assert.doesNotMatch(sceneBoardSource, /ensure_sequence_animatic_child_workflow/)
  assert.doesNotMatch(sceneBoardSource, /buildWorkflowTemplateGraph/)
  assert.match(sceneBoardCommandSource, /buildValidatedOutputWorkflowTemplateGraph/)
  assert.doesNotMatch(sceneBoardCommandSource, /buildWorkflowTemplateGraph/)
  assert.match(continuityEnsureSource, /runSequenceAnimaticContinuityWorkflowCommand/)
  assert.doesNotMatch(continuityEnsureSource, /ensure_sequence_animatic_child_workflow/)
  assert.match(continuityCommandSource, /ensureMappedChildWorkflow/)
  assert.match(continuityCommandSource, /markChildWorkflowStale/)
  assert.match(continuityCommandSource, /loadChildWorkflowGraphBundle/)
  assert.match(continuityCommandSource, /role: 'continuity_pack'/)
  assert.match(continuityCommandSource, /buildValidatedSequenceAnimaticTemplateGraph/)
  assert.match(continuityCommandSource, /sequenceAnimaticContinuityWorkflowTemplateKey/)
  assert.doesNotMatch(continuityCommandSource, /buildSequenceAnimaticContinuityWorkflowGraph/)
  assert.doesNotMatch(continuityCommandSource, /ensure_sequence_animatic_child_workflow/)
  assert.match(sceneEnsureSource, /runSequenceAnimaticSceneWorkflowCommand/)
  assert.doesNotMatch(sceneEnsureSource, /ensureSequenceAnimaticSceneShotPlanWorkflows/)
  assert.match(sceneCommandSource, /ensureSequenceAnimaticSceneShotPlanWorkflows/)
  assert.match(sceneCommandSource, /loadWorkflowNodesByKey/)
  assert.match(sceneCommandSource, /loadChildWorkflowGraphBundle/)
  assert.match(sceneCommandSource, /generate_scene_shot_plan/)
  assert.doesNotMatch(sceneCommandSource, /from\('output_workflow_nodes'\)/)
  assert.doesNotMatch(sceneCommandSource, /outputWorkflowNodeSelect/)
  assert.doesNotMatch(sceneCommandSource, /mapOutputWorkflowNodeRow/)
  assert.match(blockEnsureSource, /runSequenceAnimaticBlockWorkflowCommand/)
  assert.doesNotMatch(blockEnsureSource, /ensure_sequence_animatic_child_workflow/)
  assert.match(blockCommandSource, /ensureMappedChildWorkflow/)
  assert.match(blockCommandSource, /markChildWorkflowStale/)
  assert.match(blockCommandSource, /appendEnsuredChildWorkflow/)
  assert.match(blockCommandSource, /createChildWorkflowEnsureAccumulator/)
  assert.match(blockCommandSource, /loadChildWorkflowGraphBundle/)
  assert.match(blockCommandSource, /loadOutputRequestById/)
  assert.match(blockCommandSource, /role: 'storyboard_block'/)
  assert.match(blockCommandSource, /role: 'shot_video'/)
  assert.match(blockCommandSource, /buildValidatedSequenceAnimaticTemplateGraph/)
  assert.match(blockCommandSource, /sequenceAnimaticStoryboardBlocksTemplateKey/)
  assert.match(blockCommandSource, /sequenceAnimaticShotVideoTemplateKey/)
  assert.doesNotMatch(blockCommandSource, /buildSequenceAnimaticBlockWorkflowGraph/)
  assert.doesNotMatch(blockCommandSource, /buildSequenceAnimaticShotVideoWorkflowGraph/)
  assert.doesNotMatch(blockCommandSource, /ensure_sequence_animatic_child_workflow/)
  assert.match(shotRevisionEnsureSource, /runSequenceAnimaticShotRevisionWorkflowCommand/)
  assert.doesNotMatch(shotRevisionEnsureSource, /buildSequenceAnimaticShotRevisionWorkflowGraph/)
  assert.match(shotRevisionCommandSource, /buildValidatedSequenceAnimaticTemplateGraph/)
  assert.match(shotRevisionCommandSource, /sequenceAnimaticShotRevisionTemplateKey/)
  assert.doesNotMatch(shotRevisionCommandSource, /buildSequenceAnimaticShotRevisionWorkflowGraph/)
  assert.match(shotRevisionCommandSource, /ensureMappedChildWorkflow/)
  assert.match(shotRevisionCommandSource, /role: 'shot_revision'/)
  assert.doesNotMatch(shotRevisionCommandSource, /ensure_sequence_animatic_child_workflow/)
  assert.match(continuityAssetEnsureSource, /runSequenceAnimaticContinuityAssetWorkflowCommand/)
  assert.doesNotMatch(continuityAssetEnsureSource, /ensure_sequence_animatic_child_workflow/)
  assert.match(continuityAssetCommandSource, /ensureMappedChildWorkflow/)
  assert.match(continuityAssetCommandSource, /markChildWorkflowStale/)
  assert.match(continuityAssetCommandSource, /role: 'continuity_asset'/)
  assert.match(continuityAssetCommandSource, /role: 'continuity_asset_batch'/)
  assert.match(continuityAssetCommandSource, /buildValidatedSequenceAnimaticTemplateGraph/)
  assert.match(continuityAssetCommandSource, /sequenceAnimaticContinuityAssetTemplateKey/)
  assert.match(continuityAssetCommandSource, /sequenceAnimaticContinuityBatchTemplateKey/)
  assert.doesNotMatch(continuityAssetCommandSource, /buildSequenceAnimaticContinuityAssetWorkflowGraph/)
  assert.doesNotMatch(continuityAssetCommandSource, /buildSequenceAnimaticContinuityBatchWorkflowGraph/)
  assert.doesNotMatch(continuityAssetCommandSource, /ensure_sequence_animatic_child_workflow/)
  assert.match(shotProductionEnsureSource, /runSequenceAnimaticShotProductionGraphCommand/)
  assert.doesNotMatch(shotProductionEnsureSource, /buildSequenceAnimaticShotProductionWorkflowGraph/)
  assert.match(shotProductionCommandSource, /buildValidatedSequenceAnimaticTemplateGraph/)
  assert.match(shotProductionCommandSource, /sequenceAnimaticShotProductionTemplateKey/)
  assert.match(shotProductionCommandSource, /workflowTemplateSourceHash: graphResult\.sourceHash/)
  assert.doesNotMatch(shotProductionCommandSource, /buildSequenceAnimaticShotProductionWorkflowGraph/)
  assert.match(shotProductionCommandSource, /ensureMappedChildWorkflow/)
  assert.match(shotProductionCommandSource, /loadChildWorkflowGraphBundle/)
  assert.match(shotProductionCommandSource, /role: 'shot_production'/)
  assert.doesNotMatch(shotProductionCommandSource, /ensure_sequence_animatic_child_workflow/)
  assert.doesNotMatch(shotProductionCommandSource, /client\s*\.\s*from\('output_workflows'\)/)
  assert.doesNotMatch(shotProductionCommandSource, /client\s*\.\s*from\('output_workflow_nodes'\)/)
  assert.doesNotMatch(shotProductionCommandSource, /client\s*\.\s*from\('output_workflow_edges'\)/)
  assert.match(shotProductionCommandSource, /loadScreenplayAnimaticMasterRequest/)
  assert.doesNotMatch(shotProductionCommandSource, /function readScreenplayAnimaticRole/)
  assert.doesNotMatch(shotProductionCommandSource, /Screenplay animatic master request not found/)
  assert.doesNotMatch(shotProductionCommandSource, /function artifactMetadataRecord/)
  assert.doesNotMatch(shotProductionCommandSource, /function assetEntityForKey/)
  assert.doesNotMatch(shotProductionCommandSource, /function shotEntityRefIds/)
  assert.match(keyframeEnsureSource, /runSequenceAnimaticKeyframeWorkflowsCommand/)
  assert.doesNotMatch(keyframeEnsureSource, /ensure_sequence_animatic_child_workflow/)
  assert.match(keyframeCommandSource, /ensureMappedChildWorkflow/)
  assert.match(keyframeCommandSource, /appendEnsuredChildWorkflow/)
  assert.match(keyframeCommandSource, /createChildWorkflowEnsureAccumulator/)
  assert.match(keyframeCommandSource, /loadChildWorkflowGraphBundle/)
  assert.match(keyframeCommandSource, /buildValidatedSequenceAnimaticTemplateGraph/)
  assert.match(keyframeCommandSource, /sequenceAnimaticContinuityAssetTemplateKey/)
  assert.match(keyframeCommandSource, /sequenceAnimaticContinuityBatchTemplateKey/)
  assert.match(keyframeCommandSource, /sequenceAnimaticCoverageAnchorTemplateKey/)
  assert.match(keyframeCommandSource, /sequenceAnimaticShotProductionTemplateKey/)
  assert.match(keyframeCommandSource, /workflowTemplateSourceHash: graphResult\.sourceHash/)
  assert.doesNotMatch(keyframeCommandSource, /buildSequenceAnimaticContinuityAssetWorkflowGraph/)
  assert.doesNotMatch(keyframeCommandSource, /buildSequenceAnimaticContinuityBatchWorkflowGraph/)
  assert.doesNotMatch(keyframeCommandSource, /buildSequenceAnimaticCoverageAnchorWorkflowGraph/)
  assert.doesNotMatch(keyframeCommandSource, /buildSequenceAnimaticShotProductionWorkflowGraph/)
  assert.match(keyframeCommandSource, /role: 'shot_production'/)
  assert.match(keyframeCommandSource, /role: 'coverage_anchor'/)
  assert.match(keyframeCommandSource, /role: 'continuity_asset'/)
  assert.match(keyframeCommandSource, /role: 'continuity_asset_batch'/)
  assert.doesNotMatch(keyframeCommandSource, /ensure_sequence_animatic_child_workflow/)
  assert.match(keyframeCommandSource, /loadScreenplayAnimaticMasterRequest/)
  assert.doesNotMatch(keyframeCommandSource, /function readScreenplayAnimaticRole/)
  assert.doesNotMatch(keyframeCommandSource, /Screenplay animatic master request not found/)
  assert.doesNotMatch(keyframeCommandSource, /function artifactMetadataRecord/)
  assert.doesNotMatch(keyframeCommandSource, /function imageFromArtifact/)
  assert.doesNotMatch(keyframeCommandSource, /function assetEntityForKey/)
  assert.doesNotMatch(keyframeCommandSource, /function shotEntityRefIds/)
  assert.match(animaticCommandUtilsSource, /export async function loadScreenplayAnimaticMasterRequest/)
  assert.match(animaticCommandUtilsSource, /export function readScreenplayAnimaticSource/)
  assert.match(animaticCommandUtilsSource, /export function artifactMetadataRecord/)
  assert.match(animaticCommandUtilsSource, /export function imageFromArtifact/)
  assert.match(animaticCommandUtilsSource, /export function assetEntityForKey/)
  assert.match(animaticCommandUtilsSource, /export function shotEntityRefIds/)
  assert.match(animaticCommandUtilsSource, /export function buildValidatedSequenceAnimaticTemplateGraph/)
  assert.match(animaticCommandUtilsSource, /buildValidatedOutputWorkflowTemplateGraph/)
  assert.doesNotMatch(animaticCommandUtilsSource, /normalizeWorkflowTemplateGraphRows/)
  assert.match(coverageIntentEnsureSource, /runSequenceAnimaticShotCoverageIntentsCommand/)
  assert.doesNotMatch(coverageIntentEnsureSource, /ensureChildWorkflow/)
  assert.match(coverageIntentCommandSource, /ensureChildWorkflow/)
  assert.match(coverageIntentCommandSource, /loadChildWorkflowGraphBundle/)
  assert.match(coverageIntentCommandSource, /planSceneBoardCoverageIntentChildren/)
  assert.doesNotMatch(coverageIntentCommandSource, /client\s*\.\s*from\('output_workflows'\)/)
  assert.doesNotMatch(coverageIntentCommandSource, /client\s*\.\s*from\('output_workflow_nodes'\)/)
  assert.doesNotMatch(coverageIntentCommandSource, /client\s*\.\s*from\('output_workflow_edges'\)/)
  assert.match(zoneCoverageEnsureSource, /runSequenceAnimaticZoneCoverageBoardsCommand/)
  assert.doesNotMatch(zoneCoverageEnsureSource, /ensureChildWorkflow/)
  assert.match(zoneCoverageCommandSource, /ensureChildWorkflow/)
  assert.match(zoneCoverageCommandSource, /loadChildWorkflowGraphBundle/)
  assert.match(zoneCoverageCommandSource, /planSceneBoardZoneCoverageGridChildren/)
  assert.doesNotMatch(zoneCoverageCommandSource, /client\s*\.\s*from\('output_workflows'\)/)
  assert.doesNotMatch(zoneCoverageCommandSource, /client\s*\.\s*from\('output_workflow_nodes'\)/)
  assert.doesNotMatch(zoneCoverageCommandSource, /client\s*\.\s*from\('output_workflow_edges'\)/)
  assert.match(sceneBoardCommandSource, /ensureMappedChildWorkflow/)
  assert.match(sceneBoardCommandSource, /role: 'scene_board_prep'/)
  assert.doesNotMatch(sceneBoardCommandSource, /ensure_sequence_animatic_child_workflow/)
  assert.doesNotMatch(sceneBoardCommandSource, /sequenceAnimaticSceneBoardPrepRunsSchema/)
  assert.doesNotMatch(sceneBoardCommandSource, /sequence_animatic_scene_board_prep_runs/)
  assert.match(repositorySource, /async function startTypedWorkflowCommand/)
  assert.match(repositorySource, /resultSchema\.parse\(response\.result\)/)
  assert.match(repositorySource, /ensureSequenceAnimaticBlockWorkflows[\s\S]*prepare_storyboard_blocks[\s\S]*return startTypedWorkflowCommand/)
  assert.match(repositorySource, /ensureSequenceAnimaticSceneWorkflows[\s\S]*prepare_scene_shot_plans[\s\S]*return startTypedWorkflowCommand/)
  assert.match(repositorySource, /ensureSequenceAnimaticContinuityWorkflow[\s\S]*prepare_continuity_workflow[\s\S]*return startTypedWorkflowCommand/)
  assert.match(repositorySource, /ensureSequenceAnimaticKeyframeWorkflows[\s\S]*return startTypedWorkflowCommand/)
  assert.match(repositorySource, /ensureSequenceAnimaticZoneCoverageBoards[\s\S]*return startTypedWorkflowCommand/)
  assert.match(repositorySource, /ensureSequenceAnimaticShotCoverageIntents[\s\S]*return startTypedWorkflowCommand/)
  assert.match(repositorySource, /ensureSequenceAnimaticShotProductionGraph[\s\S]*prepare_shot_production_graph/)
  assert.match(repositorySource, /ensureSequenceAnimaticBlockWorkflows[\s\S]*generate_shot_video[\s\S]*return startTypedWorkflowCommand/)
  assert.match(repositorySource, /startSequenceAnimaticSceneBoardWorkflowCommand[\s\S]*return startTypedWorkflowCommand/)
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

test('scene board progress lookup is owned by projection helpers', () => {
  const repoRoot = process.cwd()
  const pageSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const sceneBoardProjectionSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/scene-board/sceneBoardProjection.ts'), 'utf8')

  assert.match(sceneBoardProjectionSource, /export function sceneBoardPrepRequestMatchesScope/)
  assert.match(sceneBoardProjectionSource, /export function sequenceAnimaticSceneBoardPrepRequestForScope/)
  assert.match(sceneBoardProjectionSource, /graphNativePrepRequestId/)
  assert.match(pageSource, /sequenceAnimaticSceneBoardPrepRequestForScope\(\{/)
  assert.doesNotMatch(pageSource, /function sceneBoardPrepRequestMatchesScope/)
  assert.doesNotMatch(pageSource, /\.filter\(\(request\) => sceneBoardPrepRequestMatchesScope/)
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
