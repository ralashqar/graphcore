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
  assertWorkflowNodePackManifestCoverage,
  createWorkflowNodeHandlerRegistry,
  defineWorkflowNodePack,
  registerWorkflowNodeHandler,
} from './workflowNodeHandlerRegistry.ts'
import { outputWorkflowNodeManifests } from './outputWorkflowNodeContracts.ts'
import { buildWorkflowProgressViewModel } from './workflowProgressView.ts'
import {
  buildWorkflowStreamingMetadata,
  createWorkflowNodeManifest,
  validateWorkflowNodeExtensionScaffold,
  workflowProjectionMetadataSchema,
} from './outputWorkflowManifests.ts'
import { createStreamingJsonlProcessor, extractCompleteJsonRecords } from '../../supabase/functions/_shared/output-workflow-streaming.ts'
import {
  sceneBoardWorkflowNodeHandlerKeys,
  sceneBoardWorkflowNodePack,
  sceneBoardWorkflowNodeScaffoldHandlerKeys,
  sceneBoardWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-scene-board-pack.ts'
import {
  sequenceAnimaticPlanningWorkflowNodeHandlerKeys,
  sequenceAnimaticPlanningWorkflowNodePack,
  sequenceAnimaticPlanningWorkflowNodeScaffoldHandlerKeys,
  sequenceAnimaticPlanningWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-sequence-animatic-planning-pack.ts'
import {
  sequenceAnimaticSceneLifecycleWorkflowNodeHandlerKeys,
  sequenceAnimaticSceneLifecycleWorkflowNodePack,
  sequenceAnimaticSceneLifecycleWorkflowNodeScaffoldHandlerKeys,
  sequenceAnimaticSceneLifecycleWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-sequence-animatic-scene-lifecycle-pack.ts'
import {
  sequenceAnimaticArtifactWorkflowNodeHandlerKeys,
  sequenceAnimaticArtifactWorkflowNodePack,
  sequenceAnimaticArtifactWorkflowNodeScaffoldHandlerKeys,
  sequenceAnimaticArtifactWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-sequence-animatic-artifact-pack.ts'
import {
  sequenceAnimaticCoverageWorkflowNodeHandlerKeys,
  sequenceAnimaticCoverageWorkflowNodePack,
  sequenceAnimaticCoverageWorkflowNodeScaffoldHandlerKeys,
  sequenceAnimaticCoverageWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-sequence-animatic-coverage-pack.ts'
import {
  sequenceAnimaticContinuityAnchorWorkflowNodeHandlerKeys,
  sequenceAnimaticContinuityAnchorWorkflowNodePack,
  sequenceAnimaticContinuityAnchorWorkflowNodeScaffoldHandlerKeys,
  sequenceAnimaticContinuityAnchorWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-sequence-animatic-continuity-anchor-pack.ts'
import {
  sequenceAnimaticContinuityAssetWorkflowNodeHandlerKeys,
  sequenceAnimaticContinuityAssetWorkflowNodePack,
  sequenceAnimaticContinuityAssetWorkflowNodeScaffoldHandlerKeys,
  sequenceAnimaticContinuityAssetWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-sequence-animatic-continuity-asset-pack.ts'
import {
  sequenceAnimaticContinuityGraphWorkflowNodeHandlerKeys,
  sequenceAnimaticContinuityGraphWorkflowNodePack,
  sequenceAnimaticContinuityGraphWorkflowNodeScaffoldHandlerKeys,
  sequenceAnimaticContinuityGraphWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-sequence-animatic-continuity-graph-pack.ts'
import {
  sequenceAnimaticShotReferenceWorkflowNodeHandlerKeys,
  sequenceAnimaticShotReferenceWorkflowNodePack,
  sequenceAnimaticShotReferenceWorkflowNodeScaffoldHandlerKeys,
  sequenceAnimaticShotReferenceWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-sequence-animatic-shot-reference-pack.ts'
import {
  sequenceAnimaticShotProductionWorkflowNodeHandlerKeys,
  sequenceAnimaticShotProductionWorkflowNodePack,
  sequenceAnimaticShotProductionWorkflowNodeScaffoldHandlerKeys,
  sequenceAnimaticShotProductionWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-sequence-animatic-shot-production-pack.ts'
import {
  sequenceAnimaticShotRevisionWorkflowNodeHandlerKeys,
  sequenceAnimaticShotRevisionWorkflowNodePack,
  sequenceAnimaticShotRevisionWorkflowNodeScaffoldHandlerKeys,
  sequenceAnimaticShotRevisionWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-sequence-animatic-shot-revision-pack.ts'
import { workflowMediaNodeHandlerKeys, workflowMediaNodePack } from '../../supabase/functions/_shared/output-workflow-media-pack.ts'
import {
  imagePromptWorkflowNodeHandlerKeys,
  imagePromptWorkflowNodePack,
} from '../../supabase/functions/_shared/output-workflow-image-prompt-pack.ts'
import {
  comicWorkflowNodeHandlerKeys,
  comicWorkflowNodePack,
} from '../../supabase/functions/_shared/output-workflow-comic-pack.ts'
import {
  documentWorkflowNodeHandlerKeys,
  documentWorkflowNodePack,
} from '../../supabase/functions/_shared/output-workflow-document-pack.ts'
import {
  childWorkflowIsWaiting,
  normalizeChildWorkflowUtilityStatus,
  workflowUtilityNodeHandlerKeys,
  workflowUtilityNodePack,
} from '../../supabase/functions/_shared/output-workflow-utility-pack.ts'
import {
  assertLegacyMonolithWorkflowNodeHandlerDebtIsTracked,
  legacyMonolithWorkflowNodeHandlerKeys,
  legacyMonolithWorkflowNodeHandlerRecords,
} from '../../supabase/functions/_shared/output-workflow-legacy-handlers.ts'
import {
  cinematicTextWorkflowNodeHandlerKeys,
  cinematicTextWorkflowNodePack,
  cinematicTextWorkflowNodeScaffoldHandlerKeys,
  cinematicTextWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-cinematic-text-pack.ts'
import {
  cinematicAuthoringWorkflowNodeHandlerKeys,
  cinematicAuthoringWorkflowNodePack,
  cinematicAuthoringWorkflowNodeScaffoldHandlerKeys,
  cinematicAuthoringWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-cinematic-authoring-pack.ts'
import {
  cinematicPlanningWorkflowNodeHandlerKeys,
  cinematicPlanningWorkflowNodePack,
  cinematicPlanningWorkflowNodeScaffoldHandlerKeys,
  cinematicPlanningWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-cinematic-planning-pack.ts'
import {
  cinematicReferenceWorkflowNodeHandlerKeys,
  cinematicReferenceWorkflowNodePack,
  cinematicReferenceWorkflowNodeScaffoldHandlerKeys,
  cinematicReferenceWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-cinematic-reference-pack.ts'
import {
  cinematicParseWorkflowNodeHandlerKeys,
  cinematicParseWorkflowNodePack,
  cinematicParseWorkflowNodeScaffoldHandlerKeys,
  cinematicParseWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-cinematic-parse-pack.ts'
import {
  cinematicFanoutWorkflowNodeHandlerKeys,
  cinematicFanoutWorkflowNodePack,
  cinematicFanoutWorkflowNodeScaffoldHandlerKeys,
  cinematicFanoutWorkflowNodeScaffolds,
} from '../../supabase/functions/_shared/output-workflow-cinematic-fanout-pack.ts'

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
  const normalized = buildWorkflowStreamingMetadata({
    status: 'not_a_real_status',
    providerRequestId: ' response_2 ',
    providerStatus: 'IN_PROGRESS',
    eventCount: 4.8,
    warningCount: 2,
    partialArtifactKeys: ['artifact_partial', '', 'artifact_partial_2'],
    resumeToken: ' resume_2 ',
  })
  assert.equal(normalized.status, 'idle')
  assert.equal(normalized.providerRequestId, 'response_2')
  assert.equal(normalized.eventCount, 4)
  assert.equal(normalized.warningCount, 2)
  assert.deepEqual(normalized.partialArtifactKeys, ['artifact_partial', 'artifact_partial_2'])
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

test('buildWorkflowProgressViewModel normalizes canonical and legacy streaming step metadata', () => {
  const model = buildWorkflowProgressViewModel({
    run: {
      id: 'run_streaming_legacy',
      projectId: 'project_1',
      draftId: 'draft_1',
      workflowId: 'workflow_streaming_legacy',
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
        ...step('step_stream_legacy', 'run_streaming_legacy', 'workflow_streaming_legacy', 'scene_plan', 'running', 0, 'Scene Plan', 'Streaming scene plan'),
        metadata: {
          progressLabel: 'Streaming scene plan',
          streamingStatus: 'polling',
          streamingEventCount: 5,
          streamingPartialArtifactKeys: ['flat_partial'],
          streaming: {
            status: 'streaming',
            eventCount: 3,
            warningCount: 1,
            partialArtifactKeys: ['nested_partial'],
          },
        },
      }],
    },
  })

  assert.equal(model.streamingStatus, 'polling')
  assert.equal(model.streamingEventCount, 5)
  assert.deepEqual(model.streamingPartialArtifactKeys, ['nested_partial', 'flat_partial'])
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

  const continuityAsset = legacyPayloadForWorkflowCommand({
    family: 'sequence_animatic',
    action: 'generate_continuity_assets',
    scope: {
      masterRequestId: 'master_1',
      nodeIds: ['zone_1'],
    },
    flags: { forceRefresh: true, regenerate: true },
    payload: {
      continuityRequestId: 'continuity_1',
      batchKind: 'zone_spatial_map',
    },
  })
  assert.equal(continuityAsset.endpoint, 'ensure-sequence-animatic-continuity-asset-workflow')
  assert.deepEqual(continuityAsset.payload, {
    projectId: undefined,
    draftId: undefined,
    masterRequestId: 'master_1',
    continuityRequestId: 'continuity_1',
    nodeId: 'zone_1',
    nodeIds: ['zone_1'],
    batchKind: 'zone_spatial_map',
    mode: 'regenerate',
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
  assert.match(continuityAssetCommandSource, /regenerationRequestId/)
  assert.match(continuityAssetCommandSource, /assetStableIdentity/)
  assert.match(continuityAssetCommandSource, /continuityBatchStableIdentity/)
  assert.match(continuityAssetCommandSource, /_refresh_/)
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
  assert.match(repositorySource, /ensureSequenceAnimaticContinuityAssetWorkflow[\s\S]*generate_continuity_assets[\s\S]*nodeId: payloadInput\.nodeId[\s\S]*nodeIds: payloadInput\.nodeIds[\s\S]*mode: payloadInput\.mode/)
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

test('workflow node pack definitions bind handlers through one reusable registration contract', async () => {
  const pack = defineWorkflowNodePack<
    { value: number },
    { outputs: { value: number } },
    { multiplier: number },
    {
      test_handler: (
        context: { value: number },
        dependencies: { multiplier: number },
      ) => { outputs: { value: number } }
    }
  >({
    packKey: 'test_pack',
    handlers: {
      test_handler: (context: { value: number }, dependencies: { multiplier: number }) => ({
        outputs: { value: context.value * dependencies.multiplier },
      }),
    },
  })
  const registry = createWorkflowNodeHandlerRegistry<{ value: number }, { outputs: { value: number } }>()
  pack.register({
    dependencies: { multiplier: 3 },
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(registry, handlerKey, handler)
    },
  })
  assert.deepEqual(pack.handlerKeys, ['test_handler'])
  assert.equal(pack.packKey, 'test_pack')
  const handler = registry.get('test_handler')
  assert.ok(handler)
  assert.deepEqual(await handler({ value: 7 }), { outputs: { value: 21 } })
  assert.throws(
    () => defineWorkflowNodePack({ packKey: ' ', handlers: { ignored: () => ({ outputs: {} }) } }),
    /Workflow node pack key is required/,
  )
})

test('scene board media utility and sequence animatic node packs expose registered handler keys', () => {
  assert.equal(cinematicTextWorkflowNodePack.packKey, 'output_workflow_cinematic_text')
  assert.deepEqual(cinematicTextWorkflowNodeHandlerKeys, [
    'cinematic_atlas_prompt',
    'cinematic_v2_screenplay_author',
    'cinematic_v3_screenplay_author',
    'cinematic_script_authoring',
    'cinematic_sequence_plan',
    'cinematic_block_script',
    'cinematic_storyboard_prompt',
    'cinematic_v2_storyboard_prompt',
    'cinematic_v2_keyframe_prompt',
    'cinematic_v2_video_prompt',
    'cinematic_beat_sheet_prompt',
    'cinematic_keyframe_prompt_pack',
    'cinematic_video_prompt',
    'cinematic_v3_storyboard_prompt',
    'cinematic_v3_storyboard_group_video_prompt',
  ])
  assert.equal(cinematicAuthoringWorkflowNodePack.packKey, 'output_workflow_cinematic_authoring')
  assert.deepEqual(cinematicAuthoringWorkflowNodeHandlerKeys, [
    'cinematic_v2_panel_extract',
    'cinematic_v2_keyframe_qa',
    'cinematic_v2_shot_keyframe_passthrough',
    'cinematic_v2_timeline_assemble',
    'cinematic_v3_panel_extract',
    'cinematic_v3_timeline_assemble',
    'cinematic_video_artifact',
  ])
  assert.equal(cinematicPlanningWorkflowNodePack.packKey, 'output_workflow_cinematic_planning')
  assert.deepEqual(cinematicPlanningWorkflowNodeHandlerKeys, [
    'cinematic_v2_scene_compile',
    'cinematic_v2_layout_plan',
    'cinematic_v2_shot_plan',
    'cinematic_v3_shot_break_plan',
    'cinematic_v3_shot_plan_merge',
    'cinematic_v2_storyboard_group_plan',
    'cinematic_v3_storyboard_group_plan',
  ])
  assert.equal(cinematicReferenceWorkflowNodePack.packKey, 'output_workflow_cinematic_reference')
  assert.deepEqual(cinematicReferenceWorkflowNodeHandlerKeys, [
    'cinematic_entity_selector',
    'cinematic_v2_reference_select',
    'cinematic_v2_shot_asset_pack',
    'cinematic_v3_reference_select',
  ])
  assert.equal(cinematicParseWorkflowNodePack.packKey, 'output_workflow_cinematic_parse')
  assert.deepEqual(cinematicParseWorkflowNodeHandlerKeys, [
    'cinematic_v2_script_parse',
    'cinematic_v3_shot_parse',
    'cinematic_v3_shot_parse_group',
  ])
  assert.equal(cinematicFanoutWorkflowNodePack.packKey, 'output_workflow_cinematic_fanout')
  assert.deepEqual(cinematicFanoutWorkflowNodeHandlerKeys, [
    'cinematic_sequence_compile',
    'cinematic_v2_dynamic_shot_fanout',
    'cinematic_dynamic_take_fanout',
    'cinematic_v3_dynamic_shot_parse_fanout',
    'cinematic_v3_dynamic_storyboard_fanout',
  ])
  assert.deepEqual(sceneBoardWorkflowNodeHandlerKeys, [
    'sequence_animatic_scene_board_scope_input',
    'sequence_animatic_scene_board_required_ref_plan',
    'sequence_animatic_scene_board_set_ref_generation',
    'sequence_animatic_scene_board_scaffold_ref_generation',
    'sequence_animatic_scene_board_spot_angle_coverage',
    'sequence_animatic_scene_board_coverage_intent_batch',
    'sequence_animatic_scene_board_zone_coverage_grid',
    'sequence_animatic_scene_board_coverage_cell_artifact',
    'sequence_animatic_zone_coverage_board_input',
    'sequence_animatic_zone_coverage_board_brief',
    'sequence_animatic_zone_coverage_board_prompt',
    'sequence_animatic_zone_coverage_board_extract',
    'sequence_animatic_zone_coverage_board_artifact',
  ])
  assert.deepEqual(workflowUtilityNodeHandlerKeys, [
    'workflow_ensure_child_workflow',
    'workflow_wait_child_workflow',
    'workflow_register_artifact_projection',
    'workflow_fanout_children',
    'workflow_collect_child_artifacts',
  ])
  assert.deepEqual(workflowMediaNodeHandlerKeys, [
    'cinematic_beat_sheet',
    'cinematic_block_video',
    'cinematic_keyframe',
    'cinematic_v2_shot_keyframe',
    'cinematic_v2_shot_video',
    'cinematic_v2_storyboard_sheet',
    'cinematic_v3_storyboard_group_video',
    'cinematic_v3_storyboard_sheet',
    'comic_page',
    'concept_art_image',
    'ebook_cover_image',
    'poster_image',
    'sequence_animatic_character_anchor_atlas',
    'sequence_animatic_continuity_asset_image',
    'sequence_animatic_continuity_batch_image',
    'sequence_animatic_coverage_anchor_image',
    'sequence_animatic_location_anchor_atlas',
    'sequence_animatic_prop_anchor_atlas',
    'sequence_animatic_zone_coverage_board_image',
  ])
  assert.deepEqual(imagePromptWorkflowNodeHandlerKeys, [
    'concept_art_prompt',
    'image_reference_selector',
    'poster_prompt',
  ])
  assert.deepEqual(documentWorkflowNodeHandlerKeys, [
    'bible_assembly',
    'bible_section',
    'bible_section_plan',
    'chapter_assembly',
    'chapter_plan',
    'chapter_prose',
    'ebook_cover_prompt',
    'front_back_matter',
    'outline',
    'story_bible_artifact',
    'story_bible_document_render',
  ])
  assert.deepEqual(comicWorkflowNodeHandlerKeys, [
    'comic_artifact',
    'comic_entity_selector',
    'comic_page_plan',
    'comic_page_prompt',
    'comic_pdf_render',
    'comic_scene_script',
    'comic_script',
  ])
  assert.deepEqual(sequenceAnimaticPlanningWorkflowNodeHandlerKeys, [
    'sequence_animatic_block_input',
    'sequence_animatic_scene_plan_fanout',
    'sequence_animatic_scene_package',
    'sequence_animatic_scene_graph_assignment',
    'sequence_animatic_scene_shot_plan',
    'sequence_animatic_director_plan',
    'sequence_animatic_orchestrator',
    'sequence_animatic_scene_plan_merge',
    'sequence_animatic_manifest',
  ])
  assert.deepEqual(sequenceAnimaticSceneLifecycleWorkflowNodeHandlerKeys, [
    'sequence_animatic_scene_input',
    'sequence_animatic_scene_register',
  ])
  assert.deepEqual(sequenceAnimaticArtifactWorkflowNodeHandlerKeys, [
    'sequence_animatic_block_artifact',
    'sequence_animatic_manifest_artifact',
    'sequence_animatic_director_plan_artifact',
  ])
  assert.deepEqual(sequenceAnimaticShotProductionWorkflowNodeHandlerKeys, [
    'sequence_animatic_planned_keyframe_prompt',
    'sequence_animatic_planned_keyframe_input',
    'sequence_animatic_planned_keyframe_image',
    'sequence_animatic_planned_keyframe_artifact',
    'sequence_animatic_shot_video_prompt',
    'sequence_animatic_shot_video',
    'sequence_animatic_shot_video_artifact',
  ])
  assert.deepEqual(sequenceAnimaticCoverageWorkflowNodeHandlerKeys, [
    'sequence_animatic_coverage_plan',
    'sequence_animatic_coverage_intent_input',
    'sequence_animatic_coverage_intent_plan',
    'sequence_animatic_coverage_intent_artifact',
    'sequence_animatic_coverage_anchor_input',
    'sequence_animatic_coverage_anchor_brief',
    'sequence_animatic_coverage_anchor_prompt',
    'sequence_animatic_coverage_anchor_artifact',
  ])
  assert.deepEqual(sequenceAnimaticContinuityAnchorWorkflowNodeHandlerKeys, [
    'sequence_animatic_continuity_anchor_plan',
    'sequence_animatic_character_anchor_atlas_prompt',
    'sequence_animatic_prop_anchor_atlas_prompt',
    'sequence_animatic_location_anchor_atlas_prompt',
    'sequence_animatic_character_anchor_extract',
    'sequence_animatic_prop_anchor_extract',
    'sequence_animatic_location_anchor_extract',
  ])
  assert.deepEqual(sequenceAnimaticContinuityAssetWorkflowNodeHandlerKeys, [
    'sequence_animatic_continuity_asset_input',
    'sequence_animatic_continuity_batch_input',
    'sequence_animatic_continuity_batch_prompt',
    'sequence_animatic_continuity_batch_extract',
    'sequence_animatic_continuity_asset_prompt',
    'sequence_animatic_continuity_asset_artifact',
    'sequence_animatic_continuity_batch_artifact',
  ])
  assert.deepEqual(sequenceAnimaticContinuityGraphWorkflowNodeHandlerKeys, [
    'sequence_animatic_continuity_input',
    'sequence_animatic_continuity_seed_graph',
    'sequence_animatic_continuity_global_plan',
    'sequence_animatic_continuity_global_merge',
    'sequence_animatic_continuity_block_plan',
    'sequence_animatic_continuity_block_merge',
    'sequence_animatic_continuity_graph_finalize',
    'sequence_animatic_continuity_structure_artifact',
    'sequence_animatic_continuity_artifact',
  ])
  assert.deepEqual(sequenceAnimaticShotReferenceWorkflowNodeHandlerKeys, [
    'sequence_animatic_shot_input',
    'sequence_animatic_shared_asset_ref',
    'sequence_animatic_shot_reference_fix',
    'sequence_animatic_shot_reference_fix_apply',
    'sequence_animatic_shot_reference_pack',
  ])
  assert.deepEqual(sequenceAnimaticShotRevisionWorkflowNodeHandlerKeys, [
    'sequence_animatic_shot_revision_input',
    'sequence_animatic_shot_revision_plan',
    'sequence_animatic_shot_keyframe_prompt',
    'sequence_animatic_shot_keyframe_image',
    'sequence_animatic_shot_revision_artifact',
  ])
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: sceneBoardWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: sceneBoardWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: workflowUtilityNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: workflowUtilityNodeHandlerKeys,
  }))
  assert.equal(normalizeChildWorkflowUtilityStatus('awaiting_confirmation'), 'waiting')
  assert.equal(childWorkflowIsWaiting('awaiting_confirmation'), true)
  assert.equal(normalizeChildWorkflowUtilityStatus('completed'), 'completed')
  assert.equal(childWorkflowIsWaiting('completed'), false)
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: cinematicTextWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: [
      'cinematic_atlas_prompt',
      'cinematic_v2_screenplay_author',
      'cinematic_v3_screenplay_author',
      'cinematic_script_authoring',
      'cinematic_sequence_plan',
      'cinematic_block_script',
      'cinematic_storyboard_prompt',
      'cinematic_v2_storyboard_prompt',
      'cinematic_v2_keyframe_prompt',
      'cinematic_v2_video_prompt',
      'cinematic_beat_sheet_prompt',
      'cinematic_keyframe_prompt_pack',
      'cinematic_video_prompt',
      'cinematic_v3_storyboard_prompt',
      'cinematic_v3_storyboard_group_video_prompt',
    ],
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: cinematicAuthoringWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: [
      'cinematic_v2_panel_extract',
      'cinematic_v2_keyframe_qa',
      'cinematic_v2_shot_keyframe_passthrough',
      'cinematic_v2_timeline_assemble',
      'cinematic_v3_panel_extract',
      'cinematic_v3_timeline_assemble',
      'cinematic_video_artifact',
    ],
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: cinematicPlanningWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: [
      'cinematic_v2_scene_compile',
      'cinematic_v2_layout_plan',
      'cinematic_v2_shot_plan',
      'cinematic_v3_shot_break_plan',
      'cinematic_v3_shot_plan_merge',
      'cinematic_v2_storyboard_group_plan',
      'cinematic_v3_storyboard_group_plan',
    ],
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: cinematicReferenceWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: [
      'cinematic_entity_selector',
      'cinematic_v2_reference_select',
      'cinematic_v2_shot_asset_pack',
      'cinematic_v3_reference_select',
    ],
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: cinematicParseWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: [
      'cinematic_v2_script_parse',
      'cinematic_v3_shot_parse',
      'cinematic_v3_shot_parse_group',
    ],
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: cinematicFanoutWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: [
      'cinematic_sequence_compile',
      'cinematic_v2_dynamic_shot_fanout',
      'cinematic_dynamic_take_fanout',
      'cinematic_v3_dynamic_shot_parse_fanout',
      'cinematic_v3_dynamic_storyboard_fanout',
    ],
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: workflowMediaNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: workflowMediaNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: imagePromptWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: imagePromptWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: documentWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: documentWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: comicWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: comicWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: sequenceAnimaticPlanningWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: sequenceAnimaticPlanningWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: sequenceAnimaticSceneLifecycleWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: sequenceAnimaticSceneLifecycleWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: sequenceAnimaticArtifactWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: sequenceAnimaticArtifactWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: sequenceAnimaticCoverageWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: sequenceAnimaticCoverageWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: sequenceAnimaticContinuityAnchorWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: sequenceAnimaticContinuityAnchorWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: sequenceAnimaticContinuityAssetWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: sequenceAnimaticContinuityAssetWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: sequenceAnimaticContinuityGraphWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: sequenceAnimaticContinuityGraphWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: sequenceAnimaticShotReferenceWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: sequenceAnimaticShotReferenceWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: sequenceAnimaticShotProductionWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: sequenceAnimaticShotProductionWorkflowNodeHandlerKeys,
  }))
  assert.doesNotThrow(() => assertWorkflowNodePackManifestCoverage({
    pack: sequenceAnimaticShotRevisionWorkflowNodePack,
    manifests: outputWorkflowNodeManifests,
    expectedPurposes: sequenceAnimaticShotRevisionWorkflowNodeHandlerKeys,
  }))
  assert.throws(
    () => assertWorkflowNodePackManifestCoverage({
      pack: { packKey: 'bad_pack', handlerKeys: ['missing_handler'] },
      manifests: outputWorkflowNodeManifests,
    }),
    /handler key\(s\) without executable manifests/,
  )
})

test('cinematic node packs are backed by workflow node extension scaffolds', () => {
  const manifestByPurpose = new Map(outputWorkflowNodeManifests.map((manifest) => [manifest.purpose, manifest]))
  const scaffoldGroups = [
    {
      pack: cinematicTextWorkflowNodePack,
      handlerKeys: cinematicTextWorkflowNodeHandlerKeys,
      scaffoldHandlerKeys: cinematicTextWorkflowNodeScaffoldHandlerKeys,
      scaffolds: cinematicTextWorkflowNodeScaffolds,
      expectedRuntimeKinds: ['structured_llm', 'deterministic_transform'],
    },
    {
      pack: cinematicAuthoringWorkflowNodePack,
      handlerKeys: cinematicAuthoringWorkflowNodeHandlerKeys,
      scaffoldHandlerKeys: cinematicAuthoringWorkflowNodeScaffoldHandlerKeys,
      scaffolds: cinematicAuthoringWorkflowNodeScaffolds,
      expectedRuntimeKinds: ['artifact_registration', 'deterministic_transform'],
    },
    {
      pack: cinematicPlanningWorkflowNodePack,
      handlerKeys: cinematicPlanningWorkflowNodeHandlerKeys,
      scaffoldHandlerKeys: cinematicPlanningWorkflowNodeScaffoldHandlerKeys,
      scaffolds: cinematicPlanningWorkflowNodeScaffolds,
      expectedRuntimeKinds: ['structured_llm', 'deterministic_transform'],
    },
    {
      pack: cinematicReferenceWorkflowNodePack,
      handlerKeys: cinematicReferenceWorkflowNodeHandlerKeys,
      scaffoldHandlerKeys: cinematicReferenceWorkflowNodeScaffoldHandlerKeys,
      scaffolds: cinematicReferenceWorkflowNodeScaffolds,
      expectedRuntimeKinds: ['structured_llm', 'deterministic_transform'],
    },
    {
      pack: cinematicParseWorkflowNodePack,
      handlerKeys: cinematicParseWorkflowNodeHandlerKeys,
      scaffoldHandlerKeys: cinematicParseWorkflowNodeScaffoldHandlerKeys,
      scaffolds: cinematicParseWorkflowNodeScaffolds,
      expectedRuntimeKinds: ['structured_llm', 'provider_polling'],
    },
    {
      pack: cinematicFanoutWorkflowNodePack,
      handlerKeys: cinematicFanoutWorkflowNodeHandlerKeys,
      scaffoldHandlerKeys: cinematicFanoutWorkflowNodeScaffoldHandlerKeys,
      scaffolds: cinematicFanoutWorkflowNodeScaffolds,
      expectedRuntimeKinds: ['deterministic_transform'],
    },
  ] as const

  for (const group of scaffoldGroups) {
    assert.deepEqual(group.scaffoldHandlerKeys, group.handlerKeys)
    assert.equal(new Set(group.scaffolds.map((scaffold) => scaffold.manifest.purpose)).size, group.scaffolds.length)
    assert.equal(group.scaffolds.length, group.handlerKeys.length)
    for (const scaffold of group.scaffolds) {
      const validation = validateWorkflowNodeExtensionScaffold({
        scaffold,
        registeredManifest: manifestByPurpose.get(scaffold.manifest.purpose) ?? null,
        pack: group.pack,
      })
      assert.equal(validation.ok, true, `${scaffold.manifest.purpose}\n${validation.diagnostics.join('\n')}`)
      assert.equal(scaffold.packKey, group.pack.packKey)
      assert.ok(group.handlerKeys.includes(scaffold.handlerKey as never))
      assert.ok(scaffold.sourceHashKeys.length > 0)
      assert.ok(scaffold.projectionMetadataKeys.includes('activeManifestPurpose'))
      assert.ok(scaffold.projectionMetadataKeys.includes('activeProgressLabel'))
      assert.ok(scaffold.requiredTests.includes(`pack:${group.pack.packKey}:owns:${scaffold.handlerKey}`))
      assert.ok(scaffold.requiredTests.includes(`projection:${scaffold.manifest.purpose}:metadata_shape`))
      assert.ok(group.expectedRuntimeKinds.includes(scaffold.runtimeKind as never))
    }
  }
})

test('Scene Board node pack is backed by workflow node extension scaffolds', () => {
  assert.deepEqual(sceneBoardWorkflowNodeScaffoldHandlerKeys, sceneBoardWorkflowNodeHandlerKeys)

  const manifestByPurpose = new Map(outputWorkflowNodeManifests.map((manifest) => [manifest.purpose, manifest]))
  assert.equal(new Set(sceneBoardWorkflowNodeScaffolds.map((scaffold) => scaffold.manifest.purpose)).size, sceneBoardWorkflowNodeScaffolds.length)
  assert.ok(sceneBoardWorkflowNodeScaffolds.length > 0)

  for (const scaffold of sceneBoardWorkflowNodeScaffolds) {
    const validation = validateWorkflowNodeExtensionScaffold({
      scaffold,
      registeredManifest: manifestByPurpose.get(scaffold.manifest.purpose) ?? null,
      pack: sceneBoardWorkflowNodePack,
    })
    assert.equal(validation.ok, true, `${scaffold.manifest.purpose}\n${validation.diagnostics.join('\n')}`)
    assert.equal(scaffold.packKey, sceneBoardWorkflowNodePack.packKey)
    assert.ok(sceneBoardWorkflowNodeHandlerKeys.includes(scaffold.handlerKey))
    assert.ok(scaffold.sourceHashKeys.length > 0)
    assert.ok(scaffold.requiredTests.includes(`pack:${sceneBoardWorkflowNodePack.packKey}:owns:${scaffold.handlerKey}`))
    assert.ok(scaffold.requiredTests.includes(`projection:${scaffold.manifest.purpose}:metadata_shape`))
  }

  assert.deepEqual(
    sceneBoardWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'structured_llm')
      .map((scaffold) => scaffold.manifest.purpose),
    ['sequence_animatic_zone_coverage_board_brief'],
  )
  assert.deepEqual(
    sceneBoardWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'child_workflow_utility')
      .map((scaffold) => scaffold.manifest.purpose),
    [
      'sequence_animatic_scene_board_set_ref_generation',
      'sequence_animatic_scene_board_scaffold_ref_generation',
      'sequence_animatic_scene_board_spot_angle_coverage',
      'sequence_animatic_scene_board_coverage_intent_batch',
      'sequence_animatic_scene_board_zone_coverage_grid',
    ],
  )
  assert.deepEqual(
    sceneBoardWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'artifact_registration')
      .map((scaffold) => scaffold.manifest.purpose),
    [
      'sequence_animatic_scene_board_coverage_cell_artifact',
      'sequence_animatic_zone_coverage_board_extract',
      'sequence_animatic_zone_coverage_board_artifact',
    ],
  )
})

test('sequence animatic master path nodes are backed by workflow node extension scaffolds', () => {
  const expectedMasterPathHandlers = [
    'sequence_animatic_scene_graph_assignment',
    'sequence_animatic_scene_plan_fanout',
    'sequence_animatic_scene_shot_plan',
    'sequence_animatic_scene_plan_merge',
    'sequence_animatic_manifest',
    'sequence_animatic_orchestrator',
  ]
  assert.deepEqual(sequenceAnimaticPlanningWorkflowNodeScaffoldHandlerKeys, expectedMasterPathHandlers)

  const manifestByPurpose = new Map(outputWorkflowNodeManifests.map((manifest) => [manifest.purpose, manifest]))
  assert.equal(new Set(sequenceAnimaticPlanningWorkflowNodeScaffolds.map((scaffold) => scaffold.manifest.purpose)).size, sequenceAnimaticPlanningWorkflowNodeScaffolds.length)
  assert.equal(sequenceAnimaticPlanningWorkflowNodeScaffolds.length, expectedMasterPathHandlers.length)

  for (const scaffold of sequenceAnimaticPlanningWorkflowNodeScaffolds) {
    const validation = validateWorkflowNodeExtensionScaffold({
      scaffold,
      registeredManifest: manifestByPurpose.get(scaffold.manifest.purpose) ?? null,
      pack: sequenceAnimaticPlanningWorkflowNodePack,
    })
    assert.equal(validation.ok, true, `${scaffold.manifest.purpose}\n${validation.diagnostics.join('\n')}`)
    assert.equal(scaffold.packKey, sequenceAnimaticPlanningWorkflowNodePack.packKey)
    assert.ok(sequenceAnimaticPlanningWorkflowNodeHandlerKeys.includes(scaffold.handlerKey))
    assert.ok(scaffold.sourceHashKeys.length > 0)
    assert.ok(scaffold.projectionMetadataKeys.includes('activeManifestPurpose'))
    assert.ok(scaffold.projectionMetadataKeys.includes('activeProgressLabel'))
    assert.ok(scaffold.requiredTests.includes(`pack:${sequenceAnimaticPlanningWorkflowNodePack.packKey}:owns:${scaffold.handlerKey}`))
    assert.ok(scaffold.requiredTests.includes(`projection:${scaffold.manifest.purpose}:metadata_shape`))
  }

  assert.deepEqual(
    sequenceAnimaticPlanningWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'structured_llm')
      .map((scaffold) => scaffold.manifest.purpose),
    ['sequence_animatic_scene_graph_assignment'],
  )
  assert.deepEqual(
    sequenceAnimaticPlanningWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'streaming_jsonl')
      .map((scaffold) => scaffold.manifest.purpose),
    ['sequence_animatic_scene_shot_plan'],
  )
  assert.deepEqual(
    sequenceAnimaticPlanningWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'child_workflow_utility')
      .map((scaffold) => scaffold.manifest.purpose),
    [
      'sequence_animatic_scene_plan_fanout',
      'sequence_animatic_orchestrator',
    ],
  )
  assert.deepEqual(
    sequenceAnimaticPlanningWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'deterministic_transform')
      .map((scaffold) => scaffold.manifest.purpose),
    [
      'sequence_animatic_scene_plan_merge',
      'sequence_animatic_manifest',
    ],
  )
})

test('sequence animatic scene lifecycle nodes are backed by workflow node extension scaffolds', () => {
  const expectedSceneLifecycleHandlers = [
    'sequence_animatic_scene_input',
    'sequence_animatic_scene_register',
  ]
  assert.deepEqual(sequenceAnimaticSceneLifecycleWorkflowNodeScaffoldHandlerKeys, expectedSceneLifecycleHandlers)

  const manifestByPurpose = new Map(outputWorkflowNodeManifests.map((manifest) => [manifest.purpose, manifest]))
  assert.equal(new Set(sequenceAnimaticSceneLifecycleWorkflowNodeScaffolds.map((scaffold) => scaffold.manifest.purpose)).size, sequenceAnimaticSceneLifecycleWorkflowNodeScaffolds.length)
  assert.equal(sequenceAnimaticSceneLifecycleWorkflowNodeScaffolds.length, expectedSceneLifecycleHandlers.length)

  for (const scaffold of sequenceAnimaticSceneLifecycleWorkflowNodeScaffolds) {
    const validation = validateWorkflowNodeExtensionScaffold({
      scaffold,
      registeredManifest: manifestByPurpose.get(scaffold.manifest.purpose) ?? null,
      pack: sequenceAnimaticSceneLifecycleWorkflowNodePack,
    })
    assert.equal(validation.ok, true, `${scaffold.manifest.purpose}\n${validation.diagnostics.join('\n')}`)
    assert.equal(scaffold.packKey, sequenceAnimaticSceneLifecycleWorkflowNodePack.packKey)
    assert.ok(sequenceAnimaticSceneLifecycleWorkflowNodeHandlerKeys.includes(scaffold.handlerKey))
    assert.ok(scaffold.sourceHashKeys.length > 0)
    assert.ok(scaffold.projectionMetadataKeys.includes('activeManifestPurpose'))
    assert.ok(scaffold.projectionMetadataKeys.includes('activeProgressLabel'))
    assert.ok(scaffold.requiredTests.includes(`pack:${sequenceAnimaticSceneLifecycleWorkflowNodePack.packKey}:owns:${scaffold.handlerKey}`))
    assert.ok(scaffold.requiredTests.includes(`projection:${scaffold.manifest.purpose}:metadata_shape`))
  }

  assert.deepEqual(
    sequenceAnimaticSceneLifecycleWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'deterministic_transform')
      .map((scaffold) => scaffold.manifest.purpose),
    expectedSceneLifecycleHandlers,
  )
})

test('sequence animatic artifact nodes are backed by workflow node extension scaffolds', () => {
  const expectedArtifactHandlers = [
    'sequence_animatic_block_artifact',
    'sequence_animatic_manifest_artifact',
    'sequence_animatic_director_plan_artifact',
  ]
  assert.deepEqual(sequenceAnimaticArtifactWorkflowNodeScaffoldHandlerKeys, expectedArtifactHandlers)

  const manifestByPurpose = new Map(outputWorkflowNodeManifests.map((manifest) => [manifest.purpose, manifest]))
  assert.equal(new Set(sequenceAnimaticArtifactWorkflowNodeScaffolds.map((scaffold) => scaffold.manifest.purpose)).size, sequenceAnimaticArtifactWorkflowNodeScaffolds.length)
  assert.equal(sequenceAnimaticArtifactWorkflowNodeScaffolds.length, expectedArtifactHandlers.length)

  for (const scaffold of sequenceAnimaticArtifactWorkflowNodeScaffolds) {
    const validation = validateWorkflowNodeExtensionScaffold({
      scaffold,
      registeredManifest: manifestByPurpose.get(scaffold.manifest.purpose) ?? null,
      pack: sequenceAnimaticArtifactWorkflowNodePack,
    })
    assert.equal(validation.ok, true, `${scaffold.manifest.purpose}\n${validation.diagnostics.join('\n')}`)
    assert.equal(scaffold.packKey, sequenceAnimaticArtifactWorkflowNodePack.packKey)
    assert.ok(sequenceAnimaticArtifactWorkflowNodeHandlerKeys.includes(scaffold.handlerKey))
    assert.ok(scaffold.sourceHashKeys.length > 0)
    assert.ok(scaffold.projectionMetadataKeys.includes('activeManifestPurpose'))
    assert.ok(scaffold.projectionMetadataKeys.includes('activeProgressLabel'))
    assert.ok(scaffold.projectionMetadataKeys.includes('readyArtifactCount'))
    assert.ok(scaffold.requiredTests.includes(`pack:${sequenceAnimaticArtifactWorkflowNodePack.packKey}:owns:${scaffold.handlerKey}`))
    assert.ok(scaffold.requiredTests.includes(`projection:${scaffold.manifest.purpose}:metadata_shape`))
  }

  assert.deepEqual(
    sequenceAnimaticArtifactWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'artifact_registration')
      .map((scaffold) => scaffold.manifest.purpose),
    expectedArtifactHandlers,
  )
})

test('sequence animatic coverage nodes are backed by workflow node extension scaffolds', () => {
  const expectedCoverageHandlers = [
    'sequence_animatic_coverage_plan',
    'sequence_animatic_coverage_intent_input',
    'sequence_animatic_coverage_intent_plan',
    'sequence_animatic_coverage_intent_artifact',
    'sequence_animatic_coverage_anchor_input',
    'sequence_animatic_coverage_anchor_brief',
    'sequence_animatic_coverage_anchor_prompt',
    'sequence_animatic_coverage_anchor_artifact',
  ]
  assert.deepEqual(sequenceAnimaticCoverageWorkflowNodeScaffoldHandlerKeys, expectedCoverageHandlers)

  const manifestByPurpose = new Map(outputWorkflowNodeManifests.map((manifest) => [manifest.purpose, manifest]))
  assert.equal(new Set(sequenceAnimaticCoverageWorkflowNodeScaffolds.map((scaffold) => scaffold.manifest.purpose)).size, sequenceAnimaticCoverageWorkflowNodeScaffolds.length)
  assert.equal(sequenceAnimaticCoverageWorkflowNodeScaffolds.length, expectedCoverageHandlers.length)

  for (const scaffold of sequenceAnimaticCoverageWorkflowNodeScaffolds) {
    const validation = validateWorkflowNodeExtensionScaffold({
      scaffold,
      registeredManifest: manifestByPurpose.get(scaffold.manifest.purpose) ?? null,
      pack: sequenceAnimaticCoverageWorkflowNodePack,
    })
    assert.equal(validation.ok, true, `${scaffold.manifest.purpose}\n${validation.diagnostics.join('\n')}`)
    assert.equal(scaffold.packKey, sequenceAnimaticCoverageWorkflowNodePack.packKey)
    assert.ok(sequenceAnimaticCoverageWorkflowNodeHandlerKeys.includes(scaffold.handlerKey))
    assert.ok(scaffold.sourceHashKeys.length > 0)
    assert.ok(scaffold.projectionMetadataKeys.includes('activeManifestPurpose'))
    assert.ok(scaffold.projectionMetadataKeys.includes('activeProgressLabel'))
    assert.ok(scaffold.requiredTests.includes(`pack:${sequenceAnimaticCoverageWorkflowNodePack.packKey}:owns:${scaffold.handlerKey}`))
    assert.ok(scaffold.requiredTests.includes(`projection:${scaffold.manifest.purpose}:metadata_shape`))
  }

  assert.deepEqual(
    sequenceAnimaticCoverageWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'structured_llm')
      .map((scaffold) => scaffold.manifest.purpose),
    [
      'sequence_animatic_coverage_plan',
      'sequence_animatic_coverage_intent_plan',
      'sequence_animatic_coverage_anchor_brief',
    ],
  )
  assert.deepEqual(
    sequenceAnimaticCoverageWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'artifact_registration')
      .map((scaffold) => scaffold.manifest.purpose),
    [
      'sequence_animatic_coverage_intent_artifact',
      'sequence_animatic_coverage_anchor_artifact',
    ],
  )
})

test('sequence animatic continuity anchor nodes are backed by workflow node extension scaffolds', () => {
  const expectedContinuityAnchorHandlers = [
    'sequence_animatic_continuity_anchor_plan',
    'sequence_animatic_character_anchor_atlas_prompt',
    'sequence_animatic_prop_anchor_atlas_prompt',
    'sequence_animatic_location_anchor_atlas_prompt',
    'sequence_animatic_character_anchor_extract',
    'sequence_animatic_prop_anchor_extract',
    'sequence_animatic_location_anchor_extract',
  ]
  assert.deepEqual(sequenceAnimaticContinuityAnchorWorkflowNodeScaffoldHandlerKeys, expectedContinuityAnchorHandlers)

  const manifestByPurpose = new Map(outputWorkflowNodeManifests.map((manifest) => [manifest.purpose, manifest]))
  assert.equal(new Set(sequenceAnimaticContinuityAnchorWorkflowNodeScaffolds.map((scaffold) => scaffold.manifest.purpose)).size, sequenceAnimaticContinuityAnchorWorkflowNodeScaffolds.length)
  assert.equal(sequenceAnimaticContinuityAnchorWorkflowNodeScaffolds.length, expectedContinuityAnchorHandlers.length)

  for (const scaffold of sequenceAnimaticContinuityAnchorWorkflowNodeScaffolds) {
    const validation = validateWorkflowNodeExtensionScaffold({
      scaffold,
      registeredManifest: manifestByPurpose.get(scaffold.manifest.purpose) ?? null,
      pack: sequenceAnimaticContinuityAnchorWorkflowNodePack,
    })
    assert.equal(validation.ok, true, `${scaffold.manifest.purpose}\n${validation.diagnostics.join('\n')}`)
    assert.equal(scaffold.packKey, sequenceAnimaticContinuityAnchorWorkflowNodePack.packKey)
    assert.ok(sequenceAnimaticContinuityAnchorWorkflowNodeHandlerKeys.includes(scaffold.handlerKey))
    assert.ok(scaffold.sourceHashKeys.length > 0)
    assert.ok(scaffold.projectionMetadataKeys.includes('activeManifestPurpose'))
    assert.ok(scaffold.projectionMetadataKeys.includes('activeProgressLabel'))
    assert.ok(scaffold.requiredTests.includes(`pack:${sequenceAnimaticContinuityAnchorWorkflowNodePack.packKey}:owns:${scaffold.handlerKey}`))
    assert.ok(scaffold.requiredTests.includes(`projection:${scaffold.manifest.purpose}:metadata_shape`))
  }

  assert.deepEqual(
    sequenceAnimaticContinuityAnchorWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'structured_llm')
      .map((scaffold) => scaffold.manifest.purpose),
    ['sequence_animatic_continuity_anchor_plan'],
  )
  assert.deepEqual(
    sequenceAnimaticContinuityAnchorWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'artifact_registration')
      .map((scaffold) => scaffold.manifest.purpose),
    [
      'sequence_animatic_character_anchor_extract',
      'sequence_animatic_prop_anchor_extract',
      'sequence_animatic_location_anchor_extract',
    ],
  )
})

test('sequence animatic continuity asset nodes are backed by workflow node extension scaffolds', () => {
  const expectedContinuityAssetHandlers = [
    'sequence_animatic_continuity_asset_input',
    'sequence_animatic_continuity_batch_input',
    'sequence_animatic_continuity_batch_prompt',
    'sequence_animatic_continuity_batch_extract',
    'sequence_animatic_continuity_asset_prompt',
    'sequence_animatic_continuity_asset_artifact',
    'sequence_animatic_continuity_batch_artifact',
  ]
  assert.deepEqual(sequenceAnimaticContinuityAssetWorkflowNodeScaffoldHandlerKeys, expectedContinuityAssetHandlers)

  const manifestByPurpose = new Map(outputWorkflowNodeManifests.map((manifest) => [manifest.purpose, manifest]))
  assert.equal(new Set(sequenceAnimaticContinuityAssetWorkflowNodeScaffolds.map((scaffold) => scaffold.manifest.purpose)).size, sequenceAnimaticContinuityAssetWorkflowNodeScaffolds.length)
  assert.equal(sequenceAnimaticContinuityAssetWorkflowNodeScaffolds.length, expectedContinuityAssetHandlers.length)

  for (const scaffold of sequenceAnimaticContinuityAssetWorkflowNodeScaffolds) {
    const validation = validateWorkflowNodeExtensionScaffold({
      scaffold,
      registeredManifest: manifestByPurpose.get(scaffold.manifest.purpose) ?? null,
      pack: sequenceAnimaticContinuityAssetWorkflowNodePack,
    })
    assert.equal(validation.ok, true, `${scaffold.manifest.purpose}\n${validation.diagnostics.join('\n')}`)
    assert.equal(scaffold.packKey, sequenceAnimaticContinuityAssetWorkflowNodePack.packKey)
    assert.ok(sequenceAnimaticContinuityAssetWorkflowNodeHandlerKeys.includes(scaffold.handlerKey))
    assert.ok(scaffold.sourceHashKeys.length > 0)
    assert.ok(scaffold.projectionMetadataKeys.includes('activeManifestPurpose'))
    assert.ok(scaffold.projectionMetadataKeys.includes('activeProgressLabel'))
    assert.ok(scaffold.requiredTests.includes(`pack:${sequenceAnimaticContinuityAssetWorkflowNodePack.packKey}:owns:${scaffold.handlerKey}`))
    assert.ok(scaffold.requiredTests.includes(`projection:${scaffold.manifest.purpose}:metadata_shape`))
  }

  assert.deepEqual(
    sequenceAnimaticContinuityAssetWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'artifact_registration')
      .map((scaffold) => scaffold.manifest.purpose),
    [
      'sequence_animatic_continuity_batch_extract',
      'sequence_animatic_continuity_asset_artifact',
      'sequence_animatic_continuity_batch_artifact',
    ],
  )
  assert.deepEqual(
    sequenceAnimaticContinuityAssetWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'deterministic_transform')
      .map((scaffold) => scaffold.manifest.purpose),
    [
      'sequence_animatic_continuity_asset_input',
      'sequence_animatic_continuity_batch_input',
      'sequence_animatic_continuity_batch_prompt',
      'sequence_animatic_continuity_asset_prompt',
    ],
  )
})

test('sequence animatic continuity graph nodes are backed by workflow node extension scaffolds', () => {
  const expectedContinuityGraphHandlers = [
    'sequence_animatic_continuity_input',
    'sequence_animatic_continuity_seed_graph',
    'sequence_animatic_continuity_global_plan',
    'sequence_animatic_continuity_global_merge',
    'sequence_animatic_continuity_block_plan',
    'sequence_animatic_continuity_block_merge',
    'sequence_animatic_continuity_graph_finalize',
    'sequence_animatic_continuity_structure_artifact',
    'sequence_animatic_continuity_artifact',
  ]
  assert.deepEqual(sequenceAnimaticContinuityGraphWorkflowNodeScaffoldHandlerKeys, expectedContinuityGraphHandlers)

  const manifestByPurpose = new Map(outputWorkflowNodeManifests.map((manifest) => [manifest.purpose, manifest]))
  assert.equal(new Set(sequenceAnimaticContinuityGraphWorkflowNodeScaffolds.map((scaffold) => scaffold.manifest.purpose)).size, sequenceAnimaticContinuityGraphWorkflowNodeScaffolds.length)
  assert.equal(sequenceAnimaticContinuityGraphWorkflowNodeScaffolds.length, expectedContinuityGraphHandlers.length)

  for (const scaffold of sequenceAnimaticContinuityGraphWorkflowNodeScaffolds) {
    const validation = validateWorkflowNodeExtensionScaffold({
      scaffold,
      registeredManifest: manifestByPurpose.get(scaffold.manifest.purpose) ?? null,
      pack: sequenceAnimaticContinuityGraphWorkflowNodePack,
    })
    assert.equal(validation.ok, true, `${scaffold.manifest.purpose}\n${validation.diagnostics.join('\n')}`)
    assert.equal(scaffold.packKey, sequenceAnimaticContinuityGraphWorkflowNodePack.packKey)
    assert.ok(sequenceAnimaticContinuityGraphWorkflowNodeHandlerKeys.includes(scaffold.handlerKey))
    assert.ok(scaffold.sourceHashKeys.length > 0)
    assert.ok(scaffold.projectionMetadataKeys.includes('activeManifestPurpose'))
    assert.ok(scaffold.projectionMetadataKeys.includes('activeProgressLabel'))
    assert.ok(scaffold.requiredTests.includes(`pack:${sequenceAnimaticContinuityGraphWorkflowNodePack.packKey}:owns:${scaffold.handlerKey}`))
    assert.ok(scaffold.requiredTests.includes(`projection:${scaffold.manifest.purpose}:metadata_shape`))
  }

  assert.deepEqual(
    sequenceAnimaticContinuityGraphWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'structured_llm')
      .map((scaffold) => scaffold.manifest.purpose),
    [
      'sequence_animatic_continuity_global_plan',
      'sequence_animatic_continuity_block_plan',
    ],
  )
  assert.deepEqual(
    sequenceAnimaticContinuityGraphWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'artifact_registration')
      .map((scaffold) => scaffold.manifest.purpose),
    [
      'sequence_animatic_continuity_structure_artifact',
      'sequence_animatic_continuity_artifact',
    ],
  )
})

test('sequence animatic shot reference nodes are backed by workflow node extension scaffolds', () => {
  const expectedShotReferenceHandlers = [
    'sequence_animatic_shot_input',
    'sequence_animatic_shared_asset_ref',
    'sequence_animatic_shot_reference_pack',
    'sequence_animatic_shot_reference_fix',
    'sequence_animatic_shot_reference_fix_apply',
  ]
  assert.deepEqual(sequenceAnimaticShotReferenceWorkflowNodeScaffoldHandlerKeys, expectedShotReferenceHandlers)

  const manifestByPurpose = new Map(outputWorkflowNodeManifests.map((manifest) => [manifest.purpose, manifest]))
  assert.equal(new Set(sequenceAnimaticShotReferenceWorkflowNodeScaffolds.map((scaffold) => scaffold.manifest.purpose)).size, sequenceAnimaticShotReferenceWorkflowNodeScaffolds.length)
  assert.equal(sequenceAnimaticShotReferenceWorkflowNodeScaffolds.length, expectedShotReferenceHandlers.length)

  for (const scaffold of sequenceAnimaticShotReferenceWorkflowNodeScaffolds) {
    const validation = validateWorkflowNodeExtensionScaffold({
      scaffold,
      registeredManifest: manifestByPurpose.get(scaffold.manifest.purpose) ?? null,
      pack: sequenceAnimaticShotReferenceWorkflowNodePack,
    })
    assert.equal(validation.ok, true, `${scaffold.manifest.purpose}\n${validation.diagnostics.join('\n')}`)
    assert.equal(scaffold.packKey, sequenceAnimaticShotReferenceWorkflowNodePack.packKey)
    assert.ok(sequenceAnimaticShotReferenceWorkflowNodeHandlerKeys.includes(scaffold.handlerKey))
    assert.ok(scaffold.sourceHashKeys.length > 0)
    assert.ok(scaffold.projectionMetadataKeys.includes('activeManifestPurpose'))
    assert.ok(scaffold.projectionMetadataKeys.includes('activeProgressLabel'))
    assert.ok(scaffold.requiredTests.includes(`pack:${sequenceAnimaticShotReferenceWorkflowNodePack.packKey}:owns:${scaffold.handlerKey}`))
    assert.ok(scaffold.requiredTests.includes(`projection:${scaffold.manifest.purpose}:metadata_shape`))
  }

  assert.deepEqual(
    sequenceAnimaticShotReferenceWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'deterministic_transform')
      .map((scaffold) => scaffold.manifest.purpose),
    expectedShotReferenceHandlers.filter((handlerKey) => handlerKey !== 'sequence_animatic_shot_reference_fix'),
  )
})

test('sequence animatic shot production nodes are backed by workflow node extension scaffolds', () => {
  const expectedShotProductionHandlers = [
    'sequence_animatic_planned_keyframe_prompt',
    'sequence_animatic_planned_keyframe_input',
    'sequence_animatic_planned_keyframe_image',
    'sequence_animatic_planned_keyframe_artifact',
    'sequence_animatic_shot_video_prompt',
    'sequence_animatic_shot_video',
    'sequence_animatic_shot_video_artifact',
  ]
  assert.deepEqual(sequenceAnimaticShotProductionWorkflowNodeScaffoldHandlerKeys, expectedShotProductionHandlers)

  const manifestByPurpose = new Map(outputWorkflowNodeManifests.map((manifest) => [manifest.purpose, manifest]))
  assert.equal(new Set(sequenceAnimaticShotProductionWorkflowNodeScaffolds.map((scaffold) => scaffold.manifest.purpose)).size, sequenceAnimaticShotProductionWorkflowNodeScaffolds.length)
  assert.equal(sequenceAnimaticShotProductionWorkflowNodeScaffolds.length, expectedShotProductionHandlers.length)

  for (const scaffold of sequenceAnimaticShotProductionWorkflowNodeScaffolds) {
    const validation = validateWorkflowNodeExtensionScaffold({
      scaffold,
      registeredManifest: manifestByPurpose.get(scaffold.manifest.purpose) ?? null,
      pack: sequenceAnimaticShotProductionWorkflowNodePack,
    })
    assert.equal(validation.ok, true, `${scaffold.manifest.purpose}\n${validation.diagnostics.join('\n')}`)
    assert.equal(scaffold.packKey, sequenceAnimaticShotProductionWorkflowNodePack.packKey)
    assert.ok(sequenceAnimaticShotProductionWorkflowNodeHandlerKeys.includes(scaffold.handlerKey))
    assert.ok(scaffold.sourceHashKeys.length > 0)
    assert.ok(scaffold.projectionMetadataKeys.includes('activeManifestPurpose'))
    assert.ok(scaffold.projectionMetadataKeys.includes('activeProgressLabel'))
    assert.ok(scaffold.requiredTests.includes(`pack:${sequenceAnimaticShotProductionWorkflowNodePack.packKey}:owns:${scaffold.handlerKey}`))
    assert.ok(scaffold.requiredTests.includes(`projection:${scaffold.manifest.purpose}:metadata_shape`))
  }

  assert.deepEqual(
    sequenceAnimaticShotProductionWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'image_generation')
      .map((scaffold) => scaffold.manifest.purpose),
    ['sequence_animatic_planned_keyframe_image'],
  )
  assert.deepEqual(
    sequenceAnimaticShotProductionWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'video_generation')
      .map((scaffold) => scaffold.manifest.purpose),
    ['sequence_animatic_shot_video'],
  )
  assert.deepEqual(
    sequenceAnimaticShotProductionWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'artifact_registration')
      .map((scaffold) => scaffold.manifest.purpose),
    ['sequence_animatic_planned_keyframe_artifact', 'sequence_animatic_shot_video_artifact'],
  )
})

test('sequence animatic shot revision nodes are backed by workflow node extension scaffolds', () => {
  const expectedShotRevisionHandlers = [
    'sequence_animatic_shot_revision_input',
    'sequence_animatic_shot_revision_plan',
    'sequence_animatic_shot_keyframe_prompt',
    'sequence_animatic_shot_keyframe_image',
    'sequence_animatic_shot_revision_artifact',
  ]
  assert.deepEqual(sequenceAnimaticShotRevisionWorkflowNodeScaffoldHandlerKeys, expectedShotRevisionHandlers)

  const manifestByPurpose = new Map(outputWorkflowNodeManifests.map((manifest) => [manifest.purpose, manifest]))
  assert.equal(new Set(sequenceAnimaticShotRevisionWorkflowNodeScaffolds.map((scaffold) => scaffold.manifest.purpose)).size, sequenceAnimaticShotRevisionWorkflowNodeScaffolds.length)
  assert.equal(sequenceAnimaticShotRevisionWorkflowNodeScaffolds.length, expectedShotRevisionHandlers.length)

  for (const scaffold of sequenceAnimaticShotRevisionWorkflowNodeScaffolds) {
    const validation = validateWorkflowNodeExtensionScaffold({
      scaffold,
      registeredManifest: manifestByPurpose.get(scaffold.manifest.purpose) ?? null,
      pack: sequenceAnimaticShotRevisionWorkflowNodePack,
    })
    assert.equal(validation.ok, true, `${scaffold.manifest.purpose}\n${validation.diagnostics.join('\n')}`)
    assert.equal(scaffold.packKey, sequenceAnimaticShotRevisionWorkflowNodePack.packKey)
    assert.ok(sequenceAnimaticShotRevisionWorkflowNodeHandlerKeys.includes(scaffold.handlerKey))
    assert.ok(scaffold.sourceHashKeys.length > 0)
    assert.ok(scaffold.projectionMetadataKeys.includes('activeManifestPurpose'))
    assert.ok(scaffold.projectionMetadataKeys.includes('activeProgressLabel'))
    assert.ok(scaffold.requiredTests.includes(`pack:${sequenceAnimaticShotRevisionWorkflowNodePack.packKey}:owns:${scaffold.handlerKey}`))
    assert.ok(scaffold.requiredTests.includes(`projection:${scaffold.manifest.purpose}:metadata_shape`))
  }

  assert.deepEqual(
    sequenceAnimaticShotRevisionWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'structured_llm')
      .map((scaffold) => scaffold.manifest.purpose),
    ['sequence_animatic_shot_revision_plan'],
  )
  assert.deepEqual(
    sequenceAnimaticShotRevisionWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'image_generation')
      .map((scaffold) => scaffold.manifest.purpose),
    ['sequence_animatic_shot_keyframe_image'],
  )
  assert.deepEqual(
    sequenceAnimaticShotRevisionWorkflowNodeScaffolds
      .filter((scaffold) => scaffold.runtimeKind === 'artifact_registration')
      .map((scaffold) => scaffold.manifest.purpose),
    ['sequence_animatic_shot_revision_artifact'],
  )
})

test('output workflow worker requires explicit legacy or pack node handlers', () => {
  const repoRoot = process.cwd()
  const handlerRegistrySource = readFileSync(resolve(repoRoot, 'src/domain/workflowNodeHandlerRegistry.ts'), 'utf8')
  const runtimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const legacyHandlersSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-legacy-handlers.ts'), 'utf8')
  const cinematicTextPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-cinematic-text-pack.ts'), 'utf8')
  const cinematicScriptRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-cinematic-script-runtime.ts'), 'utf8')
  const cinematicAuthoringPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-cinematic-authoring-pack.ts'), 'utf8')
  const cinematicPlanningPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-cinematic-planning-pack.ts'), 'utf8')
  const cinematicReferencePackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-cinematic-reference-pack.ts'), 'utf8')
  const cinematicParsePackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-cinematic-parse-pack.ts'), 'utf8')
  const cinematicFanoutPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-cinematic-fanout-pack.ts'), 'utf8')
  const mediaPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-media-pack.ts'), 'utf8')
  const imagePromptPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-image-prompt-pack.ts'), 'utf8')
  const documentPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-document-pack.ts'), 'utf8')
  const comicPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-comic-pack.ts'), 'utf8')
  const sceneBoardPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-scene-board-pack.ts'), 'utf8')
  const sequenceAnimaticPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-pack.ts'), 'utf8')
  const sequenceAnimaticNodePackTypesSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-node-pack-types.ts'), 'utf8')
  const sequenceAnimaticAnchorPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-continuity-anchor-pack.ts'), 'utf8')
  const sequenceAnimaticAnchorRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-continuity-anchor-runtime.ts'), 'utf8')
  const sequenceAnimaticAssetPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-continuity-asset-pack.ts'), 'utf8')
  const sequenceAnimaticGraphPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-continuity-graph-pack.ts'), 'utf8')
  const sequenceAnimaticGraphRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-continuity-graph-runtime.ts'), 'utf8')
  const sequenceAnimaticCoveragePackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-coverage-pack.ts'), 'utf8')
  const sequenceAnimaticShotReferencePackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-shot-reference-pack.ts'), 'utf8')
  const sequenceAnimaticShotProductionPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-shot-production-pack.ts'), 'utf8')
  const sequenceAnimaticShotRevisionPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-shot-revision-pack.ts'), 'utf8')
  const sequenceAnimaticShotRevisionRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-shot-revision-runtime.ts'), 'utf8')
  const seedanceVideoPromptRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-seedance-video-prompt-runtime.ts'), 'utf8')
  const sequenceAnimaticShotVideoRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-shot-video-runtime.ts'), 'utf8')
  const sequenceAnimaticReferenceRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-reference-runtime.ts'), 'utf8')
  const cinematicAssetPackRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-cinematic-asset-pack-runtime.ts'), 'utf8')
  const cinematicV3FanoutRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-cinematic-v3-fanout-runtime.ts'), 'utf8')
  const cinematicV2FanoutRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-cinematic-v2-fanout-runtime.ts'), 'utf8')
  const sequenceAnimaticPlanningPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-planning-pack.ts'), 'utf8')
  const sequenceAnimaticSceneLifecyclePackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-scene-lifecycle-pack.ts'), 'utf8')
  const sequenceAnimaticArtifactPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-artifact-pack.ts'), 'utf8')
  const sequenceAnimaticManifestRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-manifest-runtime.ts'), 'utf8')
  const sequenceAnimaticScenePackageRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-scene-package-runtime.ts'), 'utf8')
  const sequenceAnimaticShotContinuityPlanRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-shot-continuity-plan-runtime.ts'), 'utf8')
  const sequenceAnimaticCoverageRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-coverage-runtime.ts'), 'utf8')
  const sequenceAnimaticPlanningRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-planning-runtime.ts'), 'utf8')
  const sequenceAnimaticOrchestratorRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-orchestrator-runtime.ts'), 'utf8')
  const sequenceAnimaticChildRunRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-child-run-runtime.ts'), 'utf8')
  const sequenceAnimaticSceneRunnerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-scene-runner.ts'), 'utf8')
  const utilityPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-utility-pack.ts'), 'utf8')
  const mediaRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-media-runtime.ts'), 'utf8')
  const nodePackRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-node-pack-runtime.ts'), 'utf8')

  assert.match(handlerRegistrySource, /export function defineWorkflowNodePack/)
  for (const packSource of [cinematicTextPackSource, cinematicAuthoringPackSource, cinematicPlanningPackSource, cinematicReferencePackSource, cinematicParsePackSource, cinematicFanoutPackSource, mediaPackSource, imagePromptPackSource, documentPackSource, comicPackSource, sceneBoardPackSource, sequenceAnimaticPlanningPackSource, sequenceAnimaticSceneLifecyclePackSource, sequenceAnimaticArtifactPackSource, sequenceAnimaticShotReferencePackSource, utilityPackSource]) {
    assert.match(packSource, /defineWorkflowNodePack/)
    assert.doesNotMatch(packSource, /export const \w+NodeHandlerKeys = Object\.keys\(/)
    assert.doesNotMatch(packSource, /for \(const \[handlerKey, handler\] of Object\.entries/)
  }
  assert.match(nodePackRuntimeSource, /export function createWorkflowNodeExecutionResult/)
  for (const packSource of [cinematicTextPackSource, cinematicAuthoringPackSource, cinematicPlanningPackSource, cinematicReferencePackSource, cinematicParsePackSource, cinematicFanoutPackSource, documentPackSource, comicPackSource, sceneBoardPackSource, sequenceAnimaticAnchorPackSource, sequenceAnimaticAssetPackSource, sequenceAnimaticGraphPackSource, sequenceAnimaticCoveragePackSource, sequenceAnimaticShotReferencePackSource, sequenceAnimaticShotProductionPackSource, sequenceAnimaticShotRevisionPackSource, sequenceAnimaticPlanningPackSource, sequenceAnimaticSceneLifecyclePackSource, sequenceAnimaticArtifactPackSource, utilityPackSource]) {
    assert.match(packSource, /createWorkflowNodeExecutionResult/)
    assert.doesNotMatch(packSource, /outputHash: input\.helpers\.hashOutputWorkflowValue\(input\.outputs\)/)
  }
  assert.match(runtimeSource, /from '\.\/output-workflow-legacy-handlers\.ts'/)
  assert.match(legacyHandlersSource, /legacyMonolithWorkflowNodeHandlerKeyList = \[/)
  assert.match(legacyHandlersSource, /migrationTargetForLegacyHandlerKey/)
  assert.match(legacyHandlersSource, /assertLegacyMonolithWorkflowNodeHandlerDebtIsTracked/)
  assert.doesNotThrow(() => assertLegacyMonolithWorkflowNodeHandlerDebtIsTracked())
  assert.equal(legacyMonolithWorkflowNodeHandlerRecords.length, legacyMonolithWorkflowNodeHandlerKeys.length)
  assert.equal(new Set(legacyMonolithWorkflowNodeHandlerKeys).size, legacyMonolithWorkflowNodeHandlerKeys.length)
  assert.ok(legacyMonolithWorkflowNodeHandlerRecords.every((record) => record.migrationTarget.length > 0))
  const legacyHandlerKeySet = new Set<string>(legacyMonolithWorkflowNodeHandlerKeys)
  assert.ok(cinematicTextWorkflowNodeHandlerKeys.every((handlerKey) => !legacyHandlerKeySet.has(handlerKey)))
  assert.ok(cinematicAuthoringWorkflowNodeHandlerKeys.every((handlerKey) => !legacyHandlerKeySet.has(handlerKey)))
  assert.ok(cinematicPlanningWorkflowNodeHandlerKeys.every((handlerKey) => !legacyHandlerKeySet.has(handlerKey)))
  assert.ok(cinematicReferenceWorkflowNodeHandlerKeys.every((handlerKey) => !legacyHandlerKeySet.has(handlerKey)))
  assert.ok(cinematicParseWorkflowNodeHandlerKeys.every((handlerKey) => !legacyHandlerKeySet.has(handlerKey)))
  assert.ok(cinematicFanoutWorkflowNodeHandlerKeys.every((handlerKey) => !legacyHandlerKeySet.has(handlerKey)))
  assert.ok(imagePromptWorkflowNodeHandlerKeys.every((handlerKey) => !legacyHandlerKeySet.has(handlerKey)))
  assert.ok(documentWorkflowNodeHandlerKeys.every((handlerKey) => !legacyHandlerKeySet.has(handlerKey)))
  assert.ok(comicWorkflowNodeHandlerKeys.every((handlerKey) => !legacyHandlerKeySet.has(handlerKey)))
  assert.ok(sequenceAnimaticSceneLifecycleWorkflowNodeHandlerKeys.every((handlerKey) => !legacyHandlerKeySet.has(handlerKey)))
  assert.ok(sequenceAnimaticArtifactWorkflowNodeHandlerKeys.every((handlerKey) => !legacyHandlerKeySet.has(handlerKey)))
  assert.ok(sceneBoardWorkflowNodeHandlerKeys.every((handlerKey) => !legacyHandlerKeySet.has(handlerKey)))
  assert.doesNotMatch(legacyHandlersSource, /sequence_animatic_scene_board_pack/)
  assert.doesNotMatch(legacyHandlersSource, /sequence_animatic_coverage_pack/)
  assert.ok(legacyMonolithWorkflowNodeHandlerKeys.every((handlerKey) => !handlerKey.startsWith('sequence_animatic_coverage_')))
  assert.ok(legacyMonolithWorkflowNodeHandlerRecords.some((record) => record.migrationTarget === 'legacy_output_pack'))
  assert.match(runtimeSource, /function assertNoImplicitMonolithWorkflowNodeHandlers/)
  assert.match(runtimeSource, /Workflow node manifest\(s\) need an explicit node pack handler or legacy monolith registration/)
  assert.match(runtimeSource, /for \(const handlerKey of legacyMonolithWorkflowNodeHandlerKeys\)/)
  assert.match(runtimeSource, /registerWorkflowUtilityNodePack/)
  assert.match(runtimeSource, /registerCinematicTextWorkflowNodePack/)
  assert.match(runtimeSource, /registerCinematicAuthoringWorkflowNodePack/)
  assert.match(runtimeSource, /registerCinematicPlanningWorkflowNodePack/)
  assert.match(runtimeSource, /registerCinematicReferenceWorkflowNodePack/)
  assert.match(runtimeSource, /registerCinematicParseWorkflowNodePack/)
  assert.match(runtimeSource, /registerCinematicFanoutWorkflowNodePack/)
  assert.match(runtimeSource, /registerWorkflowMediaNodePack/)
  assert.match(runtimeSource, /registerImagePromptWorkflowNodePack/)
  assert.match(runtimeSource, /registerDocumentWorkflowNodePack/)
  assert.match(runtimeSource, /registerComicWorkflowNodePack/)
  assert.match(runtimeSource, /registerSceneBoardWorkflowNodePack/)
  assert.match(runtimeSource, /registerSequenceAnimaticPlanningWorkflowNodePack/)
  assert.match(runtimeSource, /registerSequenceAnimaticSceneLifecycleWorkflowNodePack/)
  assert.match(runtimeSource, /registerSequenceAnimaticArtifactWorkflowNodePack/)
  assert.match(runtimeSource, /registerSequenceAnimaticContinuityAnchorWorkflowNodePack/)
  assert.match(runtimeSource, /registerSequenceAnimaticContinuityAssetWorkflowNodePack/)
  assert.match(runtimeSource, /registerSequenceAnimaticContinuityGraphWorkflowNodePack/)
  assert.match(runtimeSource, /registerSequenceAnimaticCoverageWorkflowNodePack/)
  assert.match(runtimeSource, /registerSequenceAnimaticShotReferenceWorkflowNodePack/)
  assert.match(runtimeSource, /registerSequenceAnimaticShotProductionWorkflowNodePack/)
  assert.match(runtimeSource, /registerSequenceAnimaticShotRevisionWorkflowNodePack/)
  assert.match(runtimeSource, /createWorkflowMediaRuntime/)
  assert.match(runtimeSource, /const mediaRuntime = createWorkflowMediaRuntime\(/)
  assert.match(runtimeSource, /executeImageGeneration: \(context\) => executeOutputWorkflowImageGeneration\(context as never\) as never/)
  assert.match(runtimeSource, /executeVideoGeneration: \(context\) => executeOutputWorkflowVideoGeneration\(context as never\) as never/)
  assert.match(runtimeSource, /registerWorkflowMediaNodePack\(\{\s*runtime: mediaRuntime/)
  assert.match(runtimeSource, /executeImageGeneration: \(context\) => mediaRuntime\.executeImageGeneration\(context as never\) as never/)
  assert.match(runtimeSource, /executeVideoGeneration: \(context\) => mediaRuntime\.executeVideoGeneration\(context as never\) as never/)
  assert.doesNotMatch(runtimeSource, /executeImageGeneration: \(context\) => executeNode\(context as never\) as never/)
  assert.doesNotMatch(runtimeSource, /executeVideoGeneration: \(context\) => executeNode\(context as never\) as never/)
  assert.doesNotMatch(runtimeSource, /executeMediaGeneration: \(context\) => executeNode/)
  assert.match(runtimeSource, /\.\.\.workflowMediaNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.imagePromptWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.documentWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.comicWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.sequenceAnimaticPlanningWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.sequenceAnimaticContinuityAnchorWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.sequenceAnimaticContinuityAssetWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.sequenceAnimaticContinuityGraphWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.sequenceAnimaticCoverageWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.sequenceAnimaticShotReferenceWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.sequenceAnimaticShotProductionWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.sequenceAnimaticShotRevisionWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.cinematicReferenceWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.cinematicParseWorkflowNodeHandlerKeys/)
  assert.match(runtimeSource, /\.\.\.cinematicFanoutWorkflowNodeHandlerKeys/)
  assert.match(sequenceAnimaticNodePackTypesSource, /export type SequenceAnimaticNodeExecutionContext/)
  assert.match(sequenceAnimaticNodePackTypesSource, /export type SequenceAnimaticWorkflowNodePackHelpers/)
  assert.match(sequenceAnimaticAnchorPackSource, /sequenceAnimaticAtlasLayout/)
  assert.match(sequenceAnimaticAnchorPackSource, /sequenceAnimaticAtlasImageSize/)
  assert.match(sequenceAnimaticAnchorRuntimeSource, /export function sequenceAnimaticAtlasLayout/)
  assert.match(sequenceAnimaticAnchorRuntimeSource, /export function sequenceAnimaticAtlasImageSize/)
  assert.doesNotMatch(runtimeSource, /function sequenceAnimaticAtlasLayout/)
  assert.doesNotMatch(runtimeSource, /function sequenceAnimaticAtlasImageSize/)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticAtlasLayout,\s*\n/)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticAtlasImageSize,\s*\n/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticAtlasLayout:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticAtlasImageSize:/)
  assert.match(sequenceAnimaticShotProductionPackSource, /output-workflow-seedance-video-prompt-runtime/)
  assert.match(sequenceAnimaticShotProductionPackSource, /output-workflow-sequence-animatic-shot-video-runtime/)
  assert.match(seedanceVideoPromptRuntimeSource, /export function buildCompactSeedanceVideoPrompt/)
  assert.match(seedanceVideoPromptRuntimeSource, /\[CAMERA PLAN\]/)
  assert.match(seedanceVideoPromptRuntimeSource, /export function buildSeedanceCharacterVoiceGuide/)
  assert.match(seedanceVideoPromptRuntimeSource, /export function buildSeedanceReferenceManifest/)
  assert.match(sequenceAnimaticShotVideoRuntimeSource, /export async function inferSequenceShotVideoTimingRuntime/)
  assert.match(sequenceAnimaticShotVideoRuntimeSource, /export const seedanceDirectedControlsSchema/)
  assert.match(sequenceAnimaticShotVideoRuntimeSource, /export const sequenceAnimaticShotVideoTimingSchema/)
  assert.match(sequenceAnimaticShotVideoRuntimeSource, /shot_visual_call_sheet_v1/)
  assert.match(sequenceAnimaticShotVideoRuntimeSource, /export function buildSequenceAnimaticShotVisualCallSheet/)
  assert.match(sequenceAnimaticShotVideoRuntimeSource, /export function formatSequenceAnimaticShotVisualCallSheetCameraPlan/)
  assert.match(sequenceAnimaticShotProductionPackSource, /visualCallSheet/)
  assert.match(sequenceAnimaticShotProductionPackSource, /No storyboard or keyframe reference is attached/)
  assert.match(sequenceAnimaticShotRevisionPackSource, /output-workflow-sequence-animatic-shot-revision-runtime/)
  assert.match(sequenceAnimaticShotRevisionRuntimeSource, /export async function planSequenceAnimaticShotRevisionRuntime/)
  assert.match(sequenceAnimaticShotRevisionRuntimeSource, /export const sequenceAnimaticShotRevisionPlanSchema/)
  assert.match(sequenceAnimaticReferenceRuntimeSource, /export function scopeAssetPackToReferenceAssetKeys/)
  assert.match(sequenceAnimaticReferenceRuntimeSource, /camera_grid_reference/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /movement includes motivation and endpoint/)
  assert.match(cinematicAssetPackRuntimeSource, /export function buildCinematicV3StoryboardGroupAssetPack/)
  assert.match(cinematicAssetPackRuntimeSource, /export function repairCinematicV2ShotPlanVisualReferences/)
  assert.match(cinematicV3FanoutRuntimeSource, /export function buildCinematicV3StoryboardDynamicFanoutGroupRows/)
  assert.match(cinematicV3FanoutRuntimeSource, /export function buildCinematicV3StoryboardDynamicFanoutTimelineRows/)
  assert.match(cinematicV3FanoutRuntimeSource, /export function parseAspectRatio/)
  assert.match(cinematicV3FanoutRuntimeSource, /export function storyboardLayoutForShotCount/)
  assert.match(cinematicV3FanoutRuntimeSource, /export function storyboardImageSizeForLayout/)
  assert.match(cinematicV3FanoutRuntimeSource, /export function cinematicV3StoryboardGroupShots/)
  assert.match(cinematicV3FanoutRuntimeSource, /export async function materializeDynamicCinematicV3StoryboardFanoutRuntime/)
  assert.match(cinematicV3FanoutRuntimeSource, /export async function materializeDynamicCinematicV3ShotParseFanoutRuntime/)
  assert.match(cinematicV3FanoutRuntimeSource, /buildCinematicV3StoryboardDynamicFanoutGroupRows/)
  assert.match(cinematicV3FanoutRuntimeSource, /buildCinematicV3StoryboardDynamicFanoutTimelineRows/)
  assert.match(runtimeSource, /createCinematicDynamicFanoutMaterializerHelpers/)
  assert.match(runtimeSource, /materializeDynamicCinematicV3StoryboardFanoutRuntime/)
  assert.match(runtimeSource, /materializeDynamicCinematicV3ShotParseFanoutRuntime/)
  assert.match(runtimeSource, /materializeDynamicCinematicV2ShotFanoutRuntime/)
  assert.match(cinematicV2FanoutRuntimeSource, /export async function materializeDynamicCinematicV2ShotFanoutRuntime/)
  assert.match(cinematicV2FanoutRuntimeSource, /cinematic_v2_storyboard_prompt/)
  assert.match(cinematicV2FanoutRuntimeSource, /cinematic_v2_timeline_assemble/)
  assert.doesNotMatch(runtimeSource, /function resolveCinematicV2QualityShotIds/)
  assert.match(cinematicTextPackSource, /cinematic_atlas_prompt: cinematicAtlasPromptNode/)
  assert.match(cinematicTextPackSource, /buildCinematicAtlasPromptInstruction/)
  assert.match(cinematicTextPackSource, /runCinematicSimpleTextPrompt/)
  assert.match(cinematicTextPackSource, /cinematic_v2_screenplay_author: cinematicV3ScreenplayAuthorNode/)
  assert.match(cinematicTextPackSource, /cinematic_v3_screenplay_author: cinematicV3ScreenplayAuthorNode/)
  assert.match(cinematicTextPackSource, /cinematic_script_authoring: cinematicScriptAuthoringNode/)
  assert.match(cinematicTextPackSource, /cinematic_sequence_plan: cinematicSequencePlanNode/)
  assert.match(cinematicTextPackSource, /cinematic_block_script: cinematicBlockScriptNode/)
  assert.match(cinematicTextPackSource, /output-workflow-cinematic-script-runtime/)
  assert.match(cinematicScriptRuntimeSource, /export function cinematicScriptAuthoringJsonSchemaForPreset/)
  assert.match(cinematicScriptRuntimeSource, /export function normalizeCinematicScriptAuthoring/)
  assert.match(cinematicScriptRuntimeSource, /export function buildDeterministicCinematicSequencePlan/)
  assert.match(cinematicScriptRuntimeSource, /export function cinematicBlockScriptMarkdown/)
  assert.match(cinematicTextPackSource, /runCinematicStructuredJson/)
  assert.match(cinematicTextPackSource, /const v3Screenplay = purpose !== 'cinematic_v2_screenplay_author'/)
  assert.match(cinematicTextPackSource, /cinematic_v3_storyboard_prompt: cinematicV3StoryboardPromptNode/)
  assert.match(cinematicTextPackSource, /cinematic_v3_storyboard_group_video_prompt: cinematicV3StoryboardGroupVideoPromptNode/)
  assert.match(cinematicTextPackSource, /cinematic_storyboard_prompt: cinematicStoryboardPromptNode/)
  assert.match(cinematicTextPackSource, /buildLegacyCinematicStoryboardPrompt/)
  assert.match(cinematicTextPackSource, /cinematic_v2_storyboard_prompt: cinematicV2StoryboardPromptNode/)
  assert.match(cinematicTextPackSource, /cinematic_v2_keyframe_prompt: cinematicV2KeyframePromptNode/)
  assert.match(cinematicTextPackSource, /cinematic_v2_video_prompt: cinematicV2VideoPromptNode/)
  assert.match(cinematicTextPackSource, /cinematic_beat_sheet_prompt: cinematicBeatSheetPromptNode/)
  assert.match(cinematicTextPackSource, /cinematic_keyframe_prompt_pack: cinematicKeyframePromptPackNode/)
  assert.match(cinematicTextPackSource, /cinematic_video_prompt: cinematicVideoPromptNode/)
  assert.match(cinematicTextPackSource, /buildCinematicBeatSheetPrompt/)
  assert.match(cinematicTextPackSource, /buildCinematicDirectionSheetPrompt/)
  assert.match(cinematicTextPackSource, /buildCinematicKeyframePromptPack/)
  assert.match(cinematicTextPackSource, /buildCinematicVideoPrompt/)
  assert.match(cinematicTextPackSource, /buildCinematicV3StoryboardGroupAssetPack/)
  assert.match(cinematicTextPackSource, /buildCompactSeedanceVideoPrompt/)
  assert.match(cinematicTextPackSource, /buildSeedanceDirectedControlsFromShot/)
  assert.match(cinematicAuthoringPackSource, /cinematic_v3_panel_extract: cinematicV3PanelExtractNode/)
  assert.match(cinematicAuthoringPackSource, /cinematic_v3_timeline_assemble: cinematicV3TimelineAssembleNode/)
  assert.match(cinematicAuthoringPackSource, /cinematic_v2_panel_extract: cinematicV2PanelExtractNode/)
  assert.match(cinematicAuthoringPackSource, /cinematic_v2_keyframe_qa: cinematicV2KeyframeQaNode/)
  assert.match(cinematicAuthoringPackSource, /cinematic_v2_shot_keyframe_passthrough: cinematicV2ShotKeyframePassthroughNode/)
  assert.match(cinematicAuthoringPackSource, /cinematic_v2_timeline_assemble: cinematicV2TimelineAssembleNode/)
  assert.match(cinematicAuthoringPackSource, /cinematic_video_artifact: cinematicVideoArtifactNode/)
  assert.match(cinematicAuthoringPackSource, /cinematic-v3-authoring-artifact-v1/)
  assert.match(cinematicAuthoringPackSource, /registerOtherArtifact/)
  assert.match(cinematicAuthoringPackSource, /registerImageArtifact/)
  assert.match(cinematicAuthoringPackSource, /stitchVideoBytes/)
  assert.match(cinematicAuthoringPackSource, /collectCinematicV3ShotPlansFromUpstream/)
  assert.match(cinematicAuthoringPackSource, /mergeCinematicV3ShotPlansForTimeline/)
  assert.match(cinematicPlanningPackSource, /cinematic_v3_shot_break_plan: cinematicV3ShotBreakPlanNode/)
  assert.match(cinematicPlanningPackSource, /cinematic_v2_scene_compile: cinematicV2SceneCompileNode/)
  assert.match(cinematicPlanningPackSource, /cinematic_v2_layout_plan: cinematicV2LayoutPlanNode/)
  assert.match(cinematicPlanningPackSource, /cinematic_v2_shot_plan: cinematicV2ShotPlanNode/)
  assert.match(cinematicPlanningPackSource, /cinematic_v3_shot_plan_merge: cinematicV3ShotPlanMergeNode/)
  assert.match(cinematicPlanningPackSource, /cinematic_v2_storyboard_group_plan: cinematicStoryboardGroupPlanNode/)
  assert.match(cinematicPlanningPackSource, /cinematic_v3_storyboard_group_plan: cinematicStoryboardGroupPlanNode/)
  assert.match(cinematicPlanningPackSource, /buildCinematicV3ShotBreakPlan/)
  assert.match(cinematicPlanningPackSource, /buildCinematicV3StoryboardGroupPlan/)
  assert.match(cinematicPlanningPackSource, /buildCinematicV2StoryboardGroupPlan/)
  assert.match(cinematicPlanningPackSource, /deriveCinematicV2MaxShotCount/)
  assert.match(cinematicPlanningPackSource, /schemaName: 'output_workflow_cinematic_v2_scene_compile'/)
  assert.match(cinematicPlanningPackSource, /schemaName: 'output_workflow_cinematic_v2_layout_plan'/)
  assert.match(cinematicPlanningPackSource, /schemaName: 'output_workflow_cinematic_v2_shot_plan'/)
  assert.match(cinematicPlanningPackSource, /schemaName: 'output_workflow_cinematic_v2_shot_plan_repair'/)
  assert.match(cinematicReferencePackSource, /cinematic_entity_selector: cinematicEntitySelectorNode/)
  assert.match(cinematicReferencePackSource, /buildDeterministicCinematicAssetPack/)
  assert.match(cinematicReferencePackSource, /cinematic_v3_reference_select: cinematicV3ReferenceSelectNode/)
  assert.match(cinematicReferencePackSource, /cinematic_v2_reference_select: cinematicV2ReferenceSelectNode/)
  assert.match(cinematicReferencePackSource, /cinematic_v2_shot_asset_pack: cinematicV2ShotAssetPackNode/)
  assert.match(cinematicReferencePackSource, /schemaName: 'output_workflow_cinematic_v2_reference_select'/)
  assert.match(cinematicReferencePackSource, /schemaName: 'output_workflow_cinematic_v3_reference_select'/)
  assert.match(cinematicReferencePackSource, /Choose only supplied reference keys needed for a V3 cinematic scene/)
  assert.match(cinematicParsePackSource, /cinematic_v2_script_parse: cinematicV2ScriptParseNode/)
  assert.match(cinematicParsePackSource, /cinematic_v3_shot_parse: cinematicV3ShotParseNode/)
  assert.match(cinematicParsePackSource, /cinematic_v3_shot_parse_group: cinematicV3ShotParseGroupNode/)
  assert.match(cinematicParsePackSource, /schemaName: 'output_workflow_cinematic_v2_script_parse'/)
  assert.match(cinematicParsePackSource, /runCinematicV3ShotParseGroup/)
  assert.match(cinematicParsePackSource, /schemaName: 'output_workflow_cinematic_v3_shot_parse_repair'/)
  assert.match(cinematicParsePackSource, /schemaName: 'output_workflow_cinematic_v3_shot_parse_group'/)
  assert.match(cinematicParsePackSource, /Screenplay excerpt for this block/)
  assert.match(cinematicParsePackSource, /Preferred shot IDs in order/)
  assert.match(cinematicFanoutPackSource, /cinematic_sequence_compile: cinematicSequenceCompileNode/)
  assert.match(cinematicFanoutPackSource, /cinematic_v2_dynamic_shot_fanout: cinematicV2DynamicShotFanoutNode/)
  assert.match(cinematicFanoutPackSource, /cinematic_dynamic_take_fanout: cinematicDynamicTakeFanoutNode/)
  assert.match(cinematicFanoutPackSource, /compileCinematicScriptDocForOutput/)
  assert.match(cinematicFanoutPackSource, /cinematic_v3_dynamic_shot_parse_fanout: cinematicV3DynamicShotParseFanoutNode/)
  assert.match(cinematicFanoutPackSource, /cinematic_v3_dynamic_storyboard_fanout: cinematicV3DynamicStoryboardFanoutNode/)
  assert.match(cinematicFanoutPackSource, /materializeDynamicCinematicV2ShotFanout/)
  assert.match(cinematicFanoutPackSource, /materializeDynamicCinematicTakeFanout/)
  assert.match(cinematicFanoutPackSource, /materializeDynamicCinematicV3ShotParseFanout/)
  assert.match(cinematicFanoutPackSource, /materializeDynamicCinematicV3StoryboardFanout/)
  assert.match(cinematicFanoutPackSource, /Materialized sequence animatic master manifest/)
  assert.match(cinematicFanoutPackSource, /Cinematics V3 parse groups and storyboard workflows already materialized/)
  assert.match(cinematicFanoutPackSource, /Cinematics V3 storyboard workflows already materialized/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /export function buildCinematicV3ShotBreakPlan/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /export function buildSequenceAnimaticShotPlanFromBreaks/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /export function buildSequenceAnimaticScriptShotProjection/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /export function collectCinematicV3ShotPlansFromUpstream/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /export function mergeCinematicV3ShotPlansForTimeline/)
  assert.doesNotMatch(runtimeSource, /function buildCompactSeedanceVideoPrompt/)
  assert.doesNotMatch(runtimeSource, /function buildSeedanceCharacterVoiceGuide/)
  assert.doesNotMatch(runtimeSource, /function buildSeedanceReferenceManifest/)
  assert.doesNotMatch(runtimeSource, /async function inferSequenceShotVideoTiming/)
  assert.doesNotMatch(runtimeSource, /const seedanceDirectedControlsSchema/)
  assert.doesNotMatch(runtimeSource, /const sequenceAnimaticShotVideoTimingSchema/)
  assert.doesNotMatch(runtimeSource, /async function planSequenceAnimaticShotRevision/)
  assert.doesNotMatch(runtimeSource, /const sequenceAnimaticShotRevisionPlanSchema/)
  assert.doesNotMatch(runtimeSource, /function scopeAssetPackToReferenceAssetKeys/)
  assert.doesNotMatch(runtimeSource, /function directReferenceEntityForAssetKey/)
  assert.doesNotMatch(runtimeSource, /function buildCinematicV3StoryboardGroupAssetPack/)
  assert.doesNotMatch(runtimeSource, /function buildCinematicV3StoryboardDynamicFanoutGroupRows/)
  assert.doesNotMatch(runtimeSource, /function buildCinematicV3StoryboardDynamicFanoutTimelineRows/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v3_dynamic_storyboard_fanout'\)/)
  assert.doesNotMatch(runtimeSource, /function buildCinematicV3StoryboardPrompt/)
  assert.doesNotMatch(runtimeSource, /function buildCinematicStoryboardPrompt/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_storyboard_prompt'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v3_storyboard_prompt'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v3_storyboard_group_video_prompt'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_script_authoring'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_sequence_plan'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_block_script'/)
  assert.doesNotMatch(runtimeSource, /function cinematicScriptAuthoringJsonSchemaForPreset/)
  assert.doesNotMatch(runtimeSource, /function normalizeCinematicScriptAuthoring/)
  assert.doesNotMatch(runtimeSource, /function buildDeterministicCinematicScriptDoc/)
  assert.doesNotMatch(runtimeSource, /function buildCinematicScriptAuthoringInstruction/)
  assert.doesNotMatch(runtimeSource, /const cinematicSequencePlanJsonSchema/)
  assert.doesNotMatch(runtimeSource, /const cinematicBlockScriptJsonSchema/)
  assert.doesNotMatch(runtimeSource, /function cinematicBlockScriptMarkdown/)
  assert.doesNotMatch(runtimeSource, /function isUgcCinematicPresetFamily/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_storyboard_prompt'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_keyframe_prompt'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_video_prompt'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v3_storyboard_prompt'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v3_storyboard_group_video_prompt'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_storyboard_prompt'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_script_authoring'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_sequence_plan'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_block_script'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_storyboard_prompt'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_keyframe_prompt'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_video_prompt'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v3_panel_extract'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v3_timeline_assemble'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_panel_extract'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_keyframe_qa'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_shot_keyframe_passthrough'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_timeline_assemble'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_video_artifact'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v3_panel_extract'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v3_timeline_assemble'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_panel_extract'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_keyframe_qa'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_shot_keyframe_passthrough'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_timeline_assemble'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_video_artifact'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v3_shot_break_plan'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_scene_compile'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_layout_plan'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_shot_plan'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v3_shot_plan_merge'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_storyboard_group_plan' \|\| purpose === 'cinematic_v3_storyboard_group_plan'\)/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v3_shot_break_plan'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_scene_compile'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_layout_plan'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_shot_plan'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v3_shot_plan_merge'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_storyboard_group_plan'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v3_storyboard_group_plan'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_reference_select' \|\| purpose === 'cinematic_v3_reference_select'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_reference_select'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_shot_asset_pack'\)/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_reference_select'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v3_reference_select'\)/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_shot_asset_pack'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v3_reference_select'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v3_shot_parse_group'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v3_shot_parse'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_script_parse'\)/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_script_parse'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v3_shot_parse'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v3_shot_parse_group'/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_sequence_compile'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_dynamic_shot_fanout'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_dynamic_take_fanout'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v3_dynamic_shot_parse_fanout'\)/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_sequence_compile'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_dynamic_shot_fanout'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_dynamic_take_fanout'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v3_dynamic_shot_parse_fanout'/)
  assert.doesNotMatch(runtimeSource, /function cinematicV3StoryboardGroupShots/)
  assert.doesNotMatch(runtimeSource, /function storyboardImageSizeForLayout/)
  assert.doesNotMatch(runtimeSource, /function storyboardLayoutForShotCount/)
  assert.doesNotMatch(runtimeSource, /function parseAspectRatio/)
  assert.doesNotMatch(runtimeSource, /function repairCinematicV2ShotPlanVisualReferences/)
  assert.doesNotMatch(runtimeSource, /function buildCinematicV3ShotBreakPlan/)
  assert.doesNotMatch(runtimeSource, /function buildSequenceAnimaticShotPlanFromBreaks/)
  assert.doesNotMatch(runtimeSource, /function buildSequenceAnimaticScriptShotProjection/)
  assert.doesNotMatch(runtimeSource, /function collectCinematicV3ShotPlansFromUpstream/)
  assert.doesNotMatch(runtimeSource, /function mergeCinematicV3ShotPlansForTimeline/)
  assert.doesNotMatch(runtimeSource, /buildCompactSeedanceVideoPrompt: /)
  assert.doesNotMatch(runtimeSource, /buildSeedanceCharacterVoiceGuide: /)
  assert.doesNotMatch(runtimeSource, /buildSeedanceReferenceManifest: /)
  assert.doesNotMatch(runtimeSource, /inferSequenceShotVideoTiming: /)
  assert.doesNotMatch(runtimeSource, /planSequenceAnimaticShotRevision: /)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /buildCompactSeedanceVideoPrompt:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /buildSeedanceCharacterVoiceGuide:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /buildSeedanceReferenceManifest:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /inferSequenceShotVideoTiming:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /planSequenceAnimaticShotRevision:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /scopeAssetPackToReferenceAssetKeys:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /buildCinematicV3StoryboardGroupAssetPack:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /repairCinematicV2ShotPlanVisualReferences:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /buildCinematicV3ShotBreakPlan:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /buildSequenceAnimaticShotPlanFromBreaks:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /buildSequenceAnimaticScriptShotProjection:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /collectCinematicV3ShotPlansFromUpstream:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /mergeCinematicV3ShotPlansForTimeline:/)
  assert.match(sequenceAnimaticPackSource, /from '\.\/output-workflow-sequence-animatic-planning-pack\.ts'/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /defineWorkflowNodePack/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_scene_graph_assignment: sequenceAnimaticSceneGraphAssignment/)
  assert.match(sequenceAnimaticPlanningPackSource, /from '\.\/output-workflow-sequence-animatic-node-pack-types\.ts'/)
  for (const packSource of [sequenceAnimaticAnchorPackSource, sequenceAnimaticAssetPackSource, sequenceAnimaticGraphPackSource, sequenceAnimaticCoveragePackSource, sequenceAnimaticShotReferencePackSource, sequenceAnimaticShotProductionPackSource, sequenceAnimaticShotRevisionPackSource, sequenceAnimaticPlanningPackSource, sequenceAnimaticSceneLifecyclePackSource, sequenceAnimaticArtifactPackSource]) {
    assert.match(packSource, /from '\.\/output-workflow-sequence-animatic-node-pack-types\.ts'/)
    assert.doesNotMatch(packSource, /from '\.\/output-workflow-sequence-animatic-pack\.ts'/)
  }
  assert.doesNotMatch(runtimeSource, /for \(const manifest of outputWorkflowNodeManifests\)[\s\S]{0,160}registerWorkflowNodeHandler\(outputWorkflowNodeHandlerRegistry, manifest\.handlerKey, executeNode/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'cinematic_beat_sheet'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_beat_sheet_prompt'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'cinematic_block_video'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'cinematic_keyframe'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_keyframe_prompt_pack'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_video_prompt'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'cinematic_v2_shot_keyframe'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'cinematic_v2_shot_video'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'cinematic_v2_storyboard_sheet'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'cinematic_v3_storyboard_group_video'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'cinematic_v3_storyboard_sheet'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v3_screenplay_author'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_v2_screenplay_author'/)
  assert.doesNotMatch(legacyHandlersSource, /'cinematic_entity_selector'/)
  assert.match(cinematicTextPackSource, /cinematic_v2_screenplay_author: cinematicV3ScreenplayAuthorNode/)
  assert.match(cinematicTextPackSource, /cinematic_v3_screenplay_author: cinematicV3ScreenplayAuthorNode/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_entity_selector'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_atlas_prompt'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_beat_sheet_prompt'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_keyframe_prompt_pack'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_video_prompt'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_screenplay_author' \|\| purpose === 'cinematic_v3_screenplay_author'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v2_screenplay_author'\)/)
  assert.doesNotMatch(runtimeSource, /if \(purpose === 'cinematic_v3_screenplay_author'\)/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'comic_page'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'concept_art_image'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'ebook_cover_image'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'poster_image'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_character_anchor_atlas'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_continuity_asset_image'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_continuity_batch_image'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_coverage_anchor_image'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_location_anchor_atlas'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_prop_anchor_atlas'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_zone_coverage_board_image'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_zone_coverage_board_input'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_zone_coverage_board_brief'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_zone_coverage_board_prompt'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_zone_coverage_board_extract'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_zone_coverage_board_artifact'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_zone_coverage_board_input'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_zone_coverage_board_brief'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_zone_coverage_board_prompt'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_zone_coverage_board_extract'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_zone_coverage_board_artifact'/)
  assert.match(sceneBoardPackSource, /sequence_animatic_zone_coverage_board_input/)
  assert.match(sceneBoardPackSource, /sequence_animatic_zone_coverage_board_brief/)
  assert.match(sceneBoardPackSource, /sequence_animatic_zone_coverage_board_prompt/)
  assert.match(sceneBoardPackSource, /sequence_animatic_zone_coverage_board_extract/)
  assert.match(sceneBoardPackSource, /sequence_animatic_zone_coverage_board_artifact/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_block_input'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_block_artifact'/)
  assert.match(sequenceAnimaticArtifactPackSource, /sequence_animatic_block_artifact/)
  assert.match(sequenceAnimaticArtifactPackSource, /Sequence animatic storyboard block manifest with panels and video prompt/)
  assert.doesNotMatch(sequenceAnimaticPlanningPackSource, /sequence_animatic_block_artifact/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_scene_package'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_scene_graph_assignment'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_scene_shot_plan'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_director_plan'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_scene_package'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_scene_graph_assignment'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_scene_shot_plan'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_scene_package'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_scene_graph_assignment'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_scene_shot_plan'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_director_plan'/)
  assert.match(sequenceAnimaticPlanningPackSource, /sequence_animatic_scene_package/)
  assert.match(sequenceAnimaticPlanningPackSource, /sequence_animatic_scene_graph_assignment/)
  assert.match(sequenceAnimaticPlanningPackSource, /sequence_animatic_scene_shot_plan/)
  assert.match(sequenceAnimaticPlanningPackSource, /sequence_animatic_director_plan/)
  assert.match(sequenceAnimaticPlanningPackSource, /runSequenceAnimaticScenePackageAssignmentRuntime/)
  assert.match(sequenceAnimaticPlanningPackSource, /runSequenceAnimaticSceneShotPlanRuntime/)
  assert.match(sequenceAnimaticPlanningPackSource, /runSequenceAnimaticDirectorPlanRuntime/)
  assert.match(sequenceAnimaticPlanningPackSource, /output-workflow-sequence-animatic-planning-runtime/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /export async function runSequenceAnimaticScenePackageAssignmentRuntime/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /export async function runSequenceAnimaticDirectorPlanRuntime/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /export async function runSequenceAnimaticSceneShotPlanRuntime/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /runSequenceAnimaticShotContinuityPlanStreamWithRetry/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /sequenceAnimaticShotContinuityPolicy/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /sequenceAnimaticShotContinuityPlanV2Schema\.parse/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /sequenceAnimaticUniqueTexts/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /function mergeById/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /normalizeSequenceAnimaticDirectorPlan/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /sequenceAnimaticShotRefs: SequenceAnimaticDirectorPlanNormalizationHelpers\['sequenceAnimaticShotRefs'\]/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /buildSequenceAnimaticMasterDynamicFanoutRows/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /context__sequence_manifest/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /Queue Animatic Blocks/)
  assert.match(sequenceAnimaticShotContinuityPlanRuntimeSource, /output-workflow-sequence-animatic-shot-binding-runtime/)
  assert.doesNotMatch(runtimeSource, /parseSequenceAnimaticShotContinuityPlanV2: /)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticUniqueTexts,\s*\n\s*mergeById: /)
  assert.doesNotMatch(runtimeSource, /mergeById: \(records\)/)
  assert.doesNotMatch(runtimeSource, /function mergeById<T extends \{ id: string/)
  assert.doesNotMatch(runtimeSource, /normalizeSequenceAnimaticDirectorPlan: /)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticDirectorPlanRuntimeHelpers/)
  assert.doesNotMatch(runtimeSource, /context__sequence_manifest/)
  assert.doesNotMatch(runtimeSource, /Queue Animatic Blocks/)
  assert.doesNotMatch(runtimeSource, /SequenceAnimaticShotContinuityPlanRuntimeHelpers/)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticShotContinuityPlanRuntimeHelpers/)
  assert.doesNotMatch(sequenceAnimaticShotContinuityPlanRuntimeSource, /SequenceAnimaticShotContinuityPlanRuntimeHelpers/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /parseSequenceAnimaticShotContinuityPlanV2:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticUniqueTexts:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /mergeById:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /normalizeSequenceAnimaticDirectorPlan:/)
  assert.match(runtimeSource, /output-workflow-sequence-animatic-scene-package-runtime/)
  assert.match(sequenceAnimaticScenePackageRuntimeSource, /export const sequenceAnimaticScenePackageOutputSchema/)
  assert.match(sequenceAnimaticScenePackageRuntimeSource, /export const sequenceAnimaticSceneGraphAssignmentSchema/)
  assert.match(sequenceAnimaticScenePackageRuntimeSource, /export function buildSequenceAnimaticScenePackageFromTaggedScreenplay/)
  assert.match(sequenceAnimaticScenePackageRuntimeSource, /export function mergeSequenceAnimaticSceneGraphAssignment/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /sequenceAnimaticScenePackageOutputSchema\.parse/)
  assert.match(sequenceAnimaticSceneRunnerSource, /sequenceAnimaticScenePackageOutputSchema\.parse/)
  assert.match(sequenceAnimaticGraphPackSource, /output-workflow-sequence-animatic-continuity-graph-runtime/)
  assert.match(sequenceAnimaticGraphRuntimeSource, /export function sequenceAnimaticEmptyGraphV2/)
  assert.match(sequenceAnimaticGraphRuntimeSource, /export function parseSequenceAnimaticGraphV2/)
  assert.match(sequenceAnimaticGraphRuntimeSource, /export function continuityBlockNodeSuffix/)
  assert.match(sequenceAnimaticGraphRuntimeSource, /export function previousContinuityGraphNodeKeys/)
  assert.match(sequenceAnimaticGraphPackSource, /sequenceAnimaticContinuityBlockDeltaSchema\.parse/)
  assert.match(sequenceAnimaticGraphPackSource, /mergeSequenceAnimaticContinuityGraphV2/)
  assert.match(sequenceAnimaticGraphPackSource, /finalizeSequenceAnimaticContinuityGraphV2/)
  assert.doesNotMatch(runtimeSource, /const sequenceAnimaticTaggedDialogueRowSchema/)
  assert.doesNotMatch(runtimeSource, /function buildSequenceAnimaticScenePackageFromTaggedScreenplay/)
  assert.doesNotMatch(runtimeSource, /buildSequenceAnimaticScenePackageFromTaggedScreenplay: /)
  assert.doesNotMatch(runtimeSource, /mergeSequenceAnimaticSceneGraphAssignment: /)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /parseSequenceAnimaticScenePackageOutput:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /buildSequenceAnimaticScenePackageFromTaggedScreenplay:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /mergeSequenceAnimaticSceneGraphAssignment:/)
  assert.doesNotMatch(runtimeSource, /function continuityBlockNodeSuffix/)
  assert.doesNotMatch(runtimeSource, /function previousContinuityGraphNodeKeys/)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticEmptyGraphV2: /)
  assert.doesNotMatch(runtimeSource, /parseSequenceAnimaticGraphV2: /)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticGlobalStoryboardBlock: /)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticBlockShots: /)
  assert.doesNotMatch(runtimeSource, /emptySequenceAnimaticContinuityBlockDelta: /)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticContinuityBlockDeltaSchema: /)
  assert.doesNotMatch(runtimeSource, /parseSequenceAnimaticContinuityBlockDelta: /)
  assert.doesNotMatch(runtimeSource, /mergeSequenceAnimaticContinuityGraphV2: /)
  assert.doesNotMatch(runtimeSource, /finalizeSequenceAnimaticContinuityGraphV2: /)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticContinuityCoverage: /)
  assert.doesNotMatch(runtimeSource, /continuityBlockNodeSuffix,\s*\n/)
  assert.doesNotMatch(runtimeSource, /previousContinuityGraphNodeKeys,\s*\n/)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticContinuityBlockStatesFromGraph: /)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticSeededBlockStatesFromCoverage: /)
  assert.doesNotMatch(runtimeSource, /withSequenceAnimaticContinuityAssetState: /)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticEmptyGraphV2:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /parseSequenceAnimaticGraphV2:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticGlobalStoryboardBlock:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticBlockShots:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /emptySequenceAnimaticContinuityBlockDelta:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticContinuityBlockDeltaSchema:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /parseSequenceAnimaticContinuityBlockDelta:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /mergeSequenceAnimaticContinuityGraphV2:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /finalizeSequenceAnimaticContinuityGraphV2:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticContinuityCoverage:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /continuityBlockNodeSuffix:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /previousContinuityGraphNodeKeys:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticContinuityBlockStatesFromGraph:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticSeededBlockStatesFromCoverage:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /withSequenceAnimaticContinuityAssetState:/)
  assert.doesNotMatch(runtimeSource, /async function runSequenceAnimaticScenePackageAssignment/)
  assert.doesNotMatch(runtimeSource, /runSequenceAnimaticScenePackageAssignment:/)
  assert.doesNotMatch(runtimeSource, /async function runSequenceAnimaticSceneShotPlan/)
  assert.doesNotMatch(runtimeSource, /runSequenceAnimaticSceneShotPlan:/)
  assert.doesNotMatch(runtimeSource, /async function runSequenceAnimaticDirectorPlan/)
  assert.doesNotMatch(runtimeSource, /runSequenceAnimaticDirectorPlan:/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_scene_plan_fanout'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_scene_input'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_scene_register'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_orchestrator'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_scene_plan_fanout'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_scene_input'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_scene_register'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_orchestrator'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'concept_art_prompt'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'poster_prompt'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'image_reference_selector'/)
  assert.doesNotMatch(runtimeSource, /async function materializeSequenceAnimaticScenePlanFanout/)
  assert.doesNotMatch(runtimeSource, /materializeSequenceAnimaticScenePlanFanout:/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_scene_plan_fanout'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_scene_input'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_scene_register'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_orchestrator'/)
  assert.doesNotMatch(legacyHandlersSource, /'concept_art_prompt'/)
  assert.doesNotMatch(legacyHandlersSource, /'poster_prompt'/)
  assert.doesNotMatch(legacyHandlersSource, /'image_reference_selector'/)
  assert.match(imagePromptPackSource, /concept_art_prompt/)
  assert.match(imagePromptPackSource, /poster_prompt/)
  assert.match(imagePromptPackSource, /image_reference_selector/)
  assert.match(sequenceAnimaticPlanningPackSource, /sequence_animatic_scene_plan_fanout/)
  assert.match(sequenceAnimaticPlanningPackSource, /materializeSequenceAnimaticScenePlanFanoutRuntime/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /export async function materializeSequenceAnimaticScenePlanFanoutRuntime/)
  assert.match(sequenceAnimaticPlanningPackSource, /Materialized \$\{fanout\.sceneCount\} parallel scene shot planner/)
  assert.match(sequenceAnimaticSceneLifecyclePackSource, /sequence_animatic_scene_input/)
  assert.match(sequenceAnimaticSceneLifecyclePackSource, /Sequence animatic scene input requires the authored screenplay text/)
  assert.match(sequenceAnimaticSceneLifecyclePackSource, /sequence_animatic_scene_register/)
  assert.match(sequenceAnimaticSceneLifecyclePackSource, /scenes_registered/)
  assert.match(sequenceAnimaticSceneLifecyclePackSource, /Sequence animatic scene registration requires at least one screenplay scene/)
  assert.doesNotMatch(sequenceAnimaticPlanningPackSource, /sequence_animatic_scene_input/)
  assert.doesNotMatch(sequenceAnimaticPlanningPackSource, /sequence_animatic_scene_register/)
  assert.match(sequenceAnimaticPlanningPackSource, /sequence_animatic_orchestrator/)
  assert.match(sequenceAnimaticPlanningPackSource, /runSequenceAnimaticOrchestratorRuntime/)
  assert.match(sequenceAnimaticPlanningPackSource, /output-workflow-sequence-animatic-orchestrator-runtime/)
  assert.match(sequenceAnimaticOrchestratorRuntimeSource, /export async function runSequenceAnimaticOrchestratorRuntime/)
  assert.match(sequenceAnimaticOrchestratorRuntimeSource, /ensureMappedChildWorkflow/)
  assert.match(sequenceAnimaticOrchestratorRuntimeSource, /buildSequenceAnimaticTemplateGraph/)
  assert.match(sequenceAnimaticOrchestratorRuntimeSource, /startSequenceAnimaticChildRun/)
  assert.match(sequenceAnimaticOrchestratorRuntimeSource, /export function sequenceAnimaticBlocksFromManifestAndDirectorPlan/)
  assert.match(sequenceAnimaticOrchestratorRuntimeSource, /sequenceAnimaticStoryboardImageSize/)
  assert.match(sequenceAnimaticOrchestratorRuntimeSource, /output-workflow-sequence-animatic-continuity-batches/)
  assert.match(sequenceAnimaticOrchestratorRuntimeSource, /sequenceAnimaticContinuityAssetBatches/)
  assert.match(sequenceAnimaticOrchestratorRuntimeSource, /sequenceAnimaticContinuityVisualDependencyEdges/)
  assert.match(sequenceAnimaticOrchestratorRuntimeSource, /sequenceAnimaticStableHash/)
  assert.match(sequenceAnimaticOrchestratorRuntimeSource, /sequenceAnimaticGraphSpecVersion/)
  assert.doesNotMatch(runtimeSource, /output-workflow-sequence-animatic-continuity-batches/)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticContinuityAssetBatches: /)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticContinuityVisualDependencyEdges: /)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticGraphSpecVersion,\s*\n/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticContinuityAssetBatches:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticContinuityVisualDependencyEdges:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticStableHash:/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticGraphSpecVersion:/)
  assert.doesNotMatch(runtimeSource, /function sequenceAnimaticBlocksFromManifestAndDirectorPlan/)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticBlocksFromManifestAndDirectorPlan: /)
  assert.doesNotMatch(runtimeSource, /sequenceAnimaticStoryboardImageSize/)
  assert.doesNotMatch(sequenceAnimaticNodePackTypesSource, /sequenceAnimaticStoryboardImageSize:/)
  assert.match(sequenceAnimaticChildRunRuntimeSource, /export async function startSequenceAnimaticChildRunRuntime/)
  assert.match(sequenceAnimaticChildRunRuntimeSource, /augmentStoryboardBlockWorkflowAssetPackWithContinuityAssets/)
  assert.match(runtimeSource, /startSequenceAnimaticChildRunRuntime/)
  assert.doesNotMatch(runtimeSource, /function sequenceAnimaticContinuityAssetEntityFromState/)
  assert.match(sequenceAnimaticSceneRunnerSource, /export async function ensureSequenceAnimaticSceneShotPlanWorkflowsRuntime/)
  assert.match(sequenceAnimaticSceneRunnerSource, /role: 'scene_shot_plan'/)
  assert.match(runtimeSource, /ensureSequenceAnimaticSceneShotPlanWorkflowsRuntime/)
  assert.doesNotMatch(runtimeSource, /async function runSequenceAnimaticOrchestrator/)
  assert.doesNotMatch(runtimeSource, /runSequenceAnimaticOrchestrator:/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_scene_plan_merge'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_scene_plan_merge'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_scene_plan_merge'/)
  assert.match(sequenceAnimaticPlanningPackSource, /sequence_animatic_scene_plan_merge/)
  assert.match(sequenceAnimaticPlanningPackSource, /runSequenceAnimaticScenePlanMergeRuntime/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /export function runSequenceAnimaticScenePlanMergeRuntime/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /Scene shot plan merge requires completed scene shot plans/)
  assert.match(sequenceAnimaticPlanningRuntimeSource, /deterministic-sequence-animatic-scene-plan-merge-v1/)
  assert.doesNotMatch(sequenceAnimaticPlanningPackSource, /Scene shot plan merge requires completed scene shot plans/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_manifest'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_manifest'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_manifest'/)
  assert.match(sequenceAnimaticPlanningPackSource, /sequence_animatic_manifest/)
  assert.match(sequenceAnimaticPlanningPackSource, /buildSequenceAnimaticManifestRuntime/)
  assert.match(sequenceAnimaticManifestRuntimeSource, /Sequence animatic manifest requires the authored screenplay/)
  assert.match(sequenceAnimaticManifestRuntimeSource, /deterministic-sequence-animatic-director-manifest-v1/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_manifest_artifact'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_manifest_artifact'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_manifest_artifact'/)
  assert.match(sequenceAnimaticArtifactPackSource, /sequence_animatic_manifest_artifact/)
  assert.match(sequenceAnimaticArtifactPackSource, /Sequence animatic manifest artifact requires a manifest input/)
  assert.doesNotMatch(sequenceAnimaticPlanningPackSource, /sequence_animatic_manifest_artifact/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_director_plan_artifact'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_director_plan_artifact'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_director_plan_artifact'/)
  assert.match(sequenceAnimaticArtifactPackSource, /sequence_animatic_director_plan_artifact/)
  assert.match(sequenceAnimaticArtifactPackSource, /Sequence animatic shot continuity plan artifact requires a shot continuity plan input/)
  assert.doesNotMatch(sequenceAnimaticPlanningPackSource, /sequence_animatic_director_plan_artifact/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_coverage_plan'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_coverage_plan'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_coverage_plan'/)
  assert.match(sequenceAnimaticCoveragePackSource, /sequence_animatic_coverage_plan: sequenceAnimaticCoveragePlan/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_coverage_plan: sequenceAnimaticCoveragePlan/)
  assert.match(sequenceAnimaticCoveragePackSource, /from '\.\/output-workflow-sequence-animatic-coverage-runtime\.ts'/)
  assert.match(sequenceAnimaticCoveragePackSource, /Assign every shot to exactly one coverage setup/)
  assert.match(sequenceAnimaticCoverageRuntimeSource, /export const sequenceAnimaticShotContinuityCoverageSetupV2Schema/)
  assert.match(sequenceAnimaticCoverageRuntimeSource, /export const sequenceAnimaticCoveragePlanLlmSchema/)
  assert.match(sequenceAnimaticCoverageRuntimeSource, /export function sequenceAnimaticCoverageShotRefs/)
  assert.match(sequenceAnimaticCoverageRuntimeSource, /export function sequenceAnimaticCoverageSpatialFields/)
  assert.match(sequenceAnimaticCoverageRuntimeSource, /export function normalizeSequenceAnimaticCoveragePlan/)
  assert.match(sequenceAnimaticCoverageRuntimeSource, /export function applySequenceAnimaticCoveragePlanToDirectorPlan/)
  assert.doesNotMatch(runtimeSource, /function sequenceAnimaticCoverageShotRefs/)
  assert.doesNotMatch(runtimeSource, /function sequenceAnimaticCoverageSpatialFields/)
  assert.doesNotMatch(runtimeSource, /function normalizeSequenceAnimaticCoveragePlan/)
  assert.doesNotMatch(runtimeSource, /function applySequenceAnimaticCoveragePlanToDirectorPlan/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_coverage_intent_input'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_coverage_intent_plan'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_coverage_intent_artifact'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_coverage_intent_plan'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_coverage_intent_plan'/)
  assert.match(sequenceAnimaticCoveragePackSource, /sequence_animatic_coverage_intent_plan: sequenceAnimaticCoverageIntentPlan/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_coverage_intent_plan: sequenceAnimaticCoverageIntentPlan/)
  assert.match(sequenceAnimaticCoveragePackSource, /sequence_animatic_coverage_intent_batch/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_coverage_anchor_input'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_coverage_anchor_brief'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_coverage_anchor_prompt'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_coverage_anchor_artifact'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_coverage_anchor_brief'/)
  assert.doesNotMatch(runtimeSource, /purpose === 'sequence_animatic_coverage_anchor_prompt'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_coverage_anchor_brief'/)
  assert.doesNotMatch(legacyHandlersSource, /'sequence_animatic_coverage_anchor_prompt'/)
  assert.match(sequenceAnimaticCoveragePackSource, /sequence_animatic_coverage_anchor_brief: sequenceAnimaticCoverageAnchorBrief/)
  assert.match(sequenceAnimaticCoveragePackSource, /sequence_animatic_coverage_anchor_prompt: sequenceAnimaticCoverageAnchorPrompt/)
  assert.match(sequenceAnimaticCoveragePackSource, /sequenceAnimaticCoverageWorkflowNodeScaffolds/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_coverage_anchor_brief: sequenceAnimaticCoverageAnchorBrief/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_coverage_anchor_prompt: sequenceAnimaticCoverageAnchorPrompt/)
  assert.match(sequenceAnimaticCoveragePackSource, /runBackgroundStructuredNode/)
  assert.match(sequenceAnimaticAnchorPackSource, /sequence_animatic_continuity_anchor_plan: sequenceAnimaticContinuityAnchorPlan/)
  assert.match(sequenceAnimaticAnchorPackSource, /sequence_animatic_character_anchor_atlas_prompt: sequenceAnimaticAnchorAtlasPrompt/)
  assert.match(sequenceAnimaticAnchorPackSource, /sequence_animatic_prop_anchor_atlas_prompt: sequenceAnimaticAnchorAtlasPrompt/)
  assert.match(sequenceAnimaticAnchorPackSource, /sequence_animatic_location_anchor_atlas_prompt: sequenceAnimaticAnchorAtlasPrompt/)
  assert.match(sequenceAnimaticAnchorPackSource, /sequence_animatic_character_anchor_extract: sequenceAnimaticAnchorExtract/)
  assert.match(sequenceAnimaticAnchorPackSource, /sequence_animatic_prop_anchor_extract: sequenceAnimaticAnchorExtract/)
  assert.match(sequenceAnimaticAnchorPackSource, /sequence_animatic_location_anchor_extract: sequenceAnimaticAnchorExtract/)
  assert.match(sequenceAnimaticAnchorPackSource, /sequenceAnimaticContinuityAnchorWorkflowNodeScaffolds/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_continuity_anchor_plan: sequenceAnimaticContinuityAnchorPlan/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_character_anchor_atlas_prompt: sequenceAnimaticAnchorAtlasPrompt/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_prop_anchor_atlas_prompt: sequenceAnimaticAnchorAtlasPrompt/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_location_anchor_atlas_prompt: sequenceAnimaticAnchorAtlasPrompt/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_character_anchor_extract: sequenceAnimaticAnchorExtract/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_prop_anchor_extract: sequenceAnimaticAnchorExtract/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_location_anchor_extract: sequenceAnimaticAnchorExtract/)
  const migratedContinuityGraphHandlers = [
    'sequence_animatic_continuity_input',
    'sequence_animatic_continuity_seed_graph',
    'sequence_animatic_continuity_global_plan',
    'sequence_animatic_continuity_global_merge',
    'sequence_animatic_continuity_block_plan',
    'sequence_animatic_continuity_block_merge',
    'sequence_animatic_continuity_graph_finalize',
    'sequence_animatic_continuity_structure_artifact',
    'sequence_animatic_continuity_artifact',
  ]
  assert.match(sequenceAnimaticGraphPackSource, /sequence_animatic_continuity_input: sequenceAnimaticContinuityInput/)
  assert.match(sequenceAnimaticGraphPackSource, /sequence_animatic_continuity_seed_graph: sequenceAnimaticContinuitySeedGraph/)
  assert.match(sequenceAnimaticGraphPackSource, /sequence_animatic_continuity_global_plan: sequenceAnimaticContinuityGlobalPlan/)
  assert.match(sequenceAnimaticGraphPackSource, /sequence_animatic_continuity_global_merge: sequenceAnimaticContinuityGlobalMerge/)
  assert.match(sequenceAnimaticGraphPackSource, /sequence_animatic_continuity_block_plan: sequenceAnimaticContinuityBlockPlan/)
  assert.match(sequenceAnimaticGraphPackSource, /sequence_animatic_continuity_block_merge: sequenceAnimaticContinuityBlockMerge/)
  assert.match(sequenceAnimaticGraphPackSource, /sequence_animatic_continuity_graph_finalize: sequenceAnimaticContinuityGraphFinalize/)
  assert.match(sequenceAnimaticGraphPackSource, /sequence_animatic_continuity_structure_artifact: sequenceAnimaticContinuityStructureArtifact/)
  assert.match(sequenceAnimaticGraphPackSource, /sequence_animatic_continuity_artifact: sequenceAnimaticContinuityArtifact/)
  assert.match(sequenceAnimaticGraphPackSource, /sequenceAnimaticContinuityGraphWorkflowNodeScaffolds/)
  for (const handlerKey of migratedContinuityGraphHandlers) {
    assert.doesNotMatch(runtimeSource, new RegExp(`legacyMonolithWorkflowNodeHandlerKeys = \\[[\\s\\S]*'${handlerKey}'`))
    assert.doesNotMatch(runtimeSource, new RegExp(`if \\(purpose === '${handlerKey}'`))
    assert.doesNotMatch(legacyHandlersSource, new RegExp(`'${handlerKey}'`))
    assert.match(sequenceAnimaticGraphPackSource, new RegExp(handlerKey))
    assert.doesNotMatch(sequenceAnimaticPackSource, new RegExp(`${handlerKey}:`))
  }
  for (const handlerKey of [
    'sequence_animatic_continuity_anchor_plan',
    'sequence_animatic_character_anchor_atlas_prompt',
    'sequence_animatic_prop_anchor_atlas_prompt',
    'sequence_animatic_location_anchor_atlas_prompt',
    'sequence_animatic_character_anchor_extract',
    'sequence_animatic_prop_anchor_extract',
    'sequence_animatic_location_anchor_extract',
  ]) {
    assert.doesNotMatch(runtimeSource, new RegExp(`legacyMonolithWorkflowNodeHandlerKeys = \\[[\\s\\S]*'${handlerKey}'`))
    assert.doesNotMatch(runtimeSource, new RegExp(`if \\(purpose === '${handlerKey}'`))
    assert.doesNotMatch(legacyHandlersSource, new RegExp(`'${handlerKey}'`))
    assert.match(sequenceAnimaticAnchorPackSource, new RegExp(handlerKey))
    assert.doesNotMatch(sequenceAnimaticPackSource, new RegExp(`${handlerKey}:`))
  }
  assert.match(sequenceAnimaticAssetPackSource, /sequence_animatic_continuity_asset_input: sequenceAnimaticContinuityAssetInput/)
  assert.match(sequenceAnimaticAssetPackSource, /sequence_animatic_continuity_batch_input: sequenceAnimaticContinuityBatchInput/)
  assert.match(sequenceAnimaticAssetPackSource, /sequence_animatic_continuity_batch_prompt: sequenceAnimaticContinuityBatchPrompt/)
  assert.match(sequenceAnimaticAssetPackSource, /sequence_animatic_continuity_batch_extract: sequenceAnimaticContinuityBatchExtract/)
  assert.match(sequenceAnimaticAssetPackSource, /sequence_animatic_continuity_asset_prompt: sequenceAnimaticContinuityAssetPrompt/)
  assert.match(sequenceAnimaticAssetPackSource, /sequence_animatic_continuity_asset_artifact: sequenceAnimaticContinuityAssetArtifact/)
  assert.match(sequenceAnimaticAssetPackSource, /sequence_animatic_continuity_batch_artifact: sequenceAnimaticContinuityBatchArtifact/)
  assert.match(sequenceAnimaticAssetPackSource, /sequenceAnimaticContinuityAssetWorkflowNodeScaffolds/)
  for (const handlerKey of [
    'sequence_animatic_continuity_asset_input',
    'sequence_animatic_continuity_batch_input',
    'sequence_animatic_continuity_batch_prompt',
    'sequence_animatic_continuity_batch_extract',
    'sequence_animatic_continuity_asset_prompt',
    'sequence_animatic_continuity_asset_artifact',
    'sequence_animatic_continuity_batch_artifact',
  ]) {
    assert.doesNotMatch(runtimeSource, new RegExp(`legacyMonolithWorkflowNodeHandlerKeys = \\[[\\s\\S]*'${handlerKey}'`))
    assert.doesNotMatch(runtimeSource, new RegExp(`if \\(purpose === '${handlerKey}'`))
    assert.doesNotMatch(legacyHandlersSource, new RegExp(`'${handlerKey}'`))
    assert.match(sequenceAnimaticAssetPackSource, new RegExp(handlerKey))
    assert.doesNotMatch(sequenceAnimaticPackSource, new RegExp(`${handlerKey}:`))
  }
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_shot_input'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_shared_asset_ref'/)
  assert.doesNotMatch(runtimeSource, /legacyMonolithWorkflowNodeHandlerKeys = \[[\s\S]*'sequence_animatic_shot_reference_pack'/)
  assert.match(sequenceAnimaticShotReferencePackSource, /sequenceAnimaticShotInput/)
  assert.match(sequenceAnimaticShotReferencePackSource, /sequenceAnimaticSharedAssetRef/)
  assert.match(sequenceAnimaticShotReferencePackSource, /sequenceAnimaticShotReferencePack/)
  assert.match(sequenceAnimaticShotReferencePackSource, /sequence_animatic_shot_input: sequenceAnimaticShotInput/)
  assert.match(sequenceAnimaticShotReferencePackSource, /sequence_animatic_shared_asset_ref: sequenceAnimaticSharedAssetRef/)
  assert.match(sequenceAnimaticShotReferencePackSource, /sequence_animatic_shot_reference_pack: sequenceAnimaticShotReferencePack/)
  assert.match(sequenceAnimaticShotReferencePackSource, /registerSequenceAnimaticShotReferenceWorkflowNodePack/)
  assert.match(sequenceAnimaticShotReferencePackSource, /sequenceAnimaticShotReferenceWorkflowNodeScaffolds/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_shot_input: sequenceAnimaticShotInput/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_shared_asset_ref: sequenceAnimaticSharedAssetRef/)
  assert.doesNotMatch(sequenceAnimaticPackSource, /sequence_animatic_shot_reference_pack: sequenceAnimaticShotReferencePack/)
  assert.match(sequenceAnimaticShotReferencePackSource, /providerSafeCinematicV2DurationSeconds/)
  assert.match(sequenceAnimaticShotReferencePackSource, /referenceScope: 'sequence_animatic_shot_production'/)
  assert.match(sequenceAnimaticShotProductionPackSource, /sequence_animatic_planned_keyframe_prompt: sequenceAnimaticPlannedKeyframePrompt/)
  assert.match(sequenceAnimaticShotProductionPackSource, /sequence_animatic_planned_keyframe_input: sequenceAnimaticPlannedKeyframeInput/)
  assert.match(sequenceAnimaticShotProductionPackSource, /sequence_animatic_planned_keyframe_image: sequenceAnimaticPlannedKeyframeImage/)
  assert.match(sequenceAnimaticShotProductionPackSource, /sequence_animatic_planned_keyframe_artifact: sequenceAnimaticPlannedKeyframeArtifact/)
  assert.match(sequenceAnimaticShotProductionPackSource, /sequence_animatic_shot_video_prompt: sequenceAnimaticShotVideoPrompt/)
  assert.match(sequenceAnimaticShotProductionPackSource, /sequence_animatic_shot_video: sequenceAnimaticShotVideo/)
  assert.match(sequenceAnimaticShotProductionPackSource, /sequence_animatic_shot_video_artifact: sequenceAnimaticShotVideoArtifact/)
  assert.match(sequenceAnimaticShotProductionPackSource, /sequenceAnimaticShotProductionWorkflowNodeScaffolds/)
  for (const handlerKey of [
    'sequence_animatic_planned_keyframe_prompt',
    'sequence_animatic_planned_keyframe_input',
    'sequence_animatic_planned_keyframe_image',
    'sequence_animatic_planned_keyframe_artifact',
    'sequence_animatic_shot_video_prompt',
    'sequence_animatic_shot_video',
    'sequence_animatic_shot_video_artifact',
  ]) {
    assert.doesNotMatch(runtimeSource, new RegExp(`legacyMonolithWorkflowNodeHandlerKeys = \\[[\\s\\S]*'${handlerKey}'`))
    assert.doesNotMatch(runtimeSource, new RegExp(`if \\(purpose === '${handlerKey}'`))
    assert.doesNotMatch(legacyHandlersSource, new RegExp(`'${handlerKey}'`))
    assert.match(sequenceAnimaticShotProductionPackSource, new RegExp(handlerKey))
    assert.doesNotMatch(sequenceAnimaticPackSource, new RegExp(`${handlerKey}:`))
  }
  assert.match(sequenceAnimaticShotRevisionPackSource, /sequence_animatic_shot_revision_input: sequenceAnimaticShotRevisionInput/)
  assert.match(sequenceAnimaticShotRevisionPackSource, /sequence_animatic_shot_revision_plan: sequenceAnimaticShotRevisionPlan/)
  assert.match(sequenceAnimaticShotRevisionPackSource, /sequence_animatic_shot_keyframe_prompt: sequenceAnimaticShotKeyframePrompt/)
  assert.match(sequenceAnimaticShotRevisionPackSource, /sequence_animatic_shot_keyframe_image: sequenceAnimaticShotKeyframeImage/)
  assert.match(sequenceAnimaticShotRevisionPackSource, /sequence_animatic_shot_revision_artifact: sequenceAnimaticShotRevisionArtifact/)
  assert.match(sequenceAnimaticShotRevisionPackSource, /sequenceAnimaticShotRevisionWorkflowNodeScaffolds/)
  for (const handlerKey of [
    'sequence_animatic_shot_revision_input',
    'sequence_animatic_shot_revision_plan',
    'sequence_animatic_shot_keyframe_prompt',
    'sequence_animatic_shot_keyframe_image',
    'sequence_animatic_shot_revision_artifact',
  ]) {
    assert.doesNotMatch(runtimeSource, new RegExp(`legacyMonolithWorkflowNodeHandlerKeys = \\[[\\s\\S]*'${handlerKey}'`))
    assert.doesNotMatch(runtimeSource, new RegExp(`if \\(purpose === '${handlerKey}'`))
    assert.doesNotMatch(legacyHandlersSource, new RegExp(`'${handlerKey}'`))
    assert.match(sequenceAnimaticShotRevisionPackSource, new RegExp(handlerKey))
    assert.doesNotMatch(sequenceAnimaticPackSource, new RegExp(`${handlerKey}:`))
  }
  assert.match(mediaPackSource, /executeImageGeneration/)
  assert.match(mediaPackSource, /executeVideoGeneration/)
  assert.match(mediaPackSource, /WorkflowMediaRuntime/)
  assert.match(mediaPackSource, /runtime: WorkflowMediaRuntime/)
  assert.doesNotMatch(mediaPackSource, /WorkflowMediaNodePackHelpers/)
  assert.match(mediaRuntimeSource, /export type WorkflowMediaRuntime/)
  assert.match(mediaRuntimeSource, /createWorkflowMediaRuntime/)
  assert.match(mediaRuntimeSource, /executeImageGeneration/)
  assert.match(mediaRuntimeSource, /executeVideoGeneration/)
  assert.match(mediaRuntimeSource, /outputWorkflowImageModel/)
  assert.match(mediaRuntimeSource, /normalizeImageSize/)
  assert.match(mediaRuntimeSource, /buildFalHeaders/)
  assert.match(mediaRuntimeSource, /buildMuapiHeaders/)
  assert.match(mediaRuntimeSource, /buildFalImageRequestBody/)
  assert.match(mediaRuntimeSource, /buildFalVideoRequestBody/)
  assert.match(mediaRuntimeSource, /outputWorkflowFalStaleRequestMs/)
  assert.match(mediaRuntimeSource, /fetchFalJson/)
  assert.match(mediaRuntimeSource, /fetchMuapiJson/)
  assert.match(mediaRuntimeSource, /submitFalImageRequest/)
  assert.match(mediaRuntimeSource, /submitFalVideoRequest/)
  assert.match(mediaRuntimeSource, /submitMuapiVideoRequest/)
  assert.match(mediaRuntimeSource, /getFalStatus/)
  assert.match(mediaRuntimeSource, /getFalResult/)
  assert.match(mediaRuntimeSource, /getMuapiResult/)
  assert.match(mediaRuntimeSource, /outputWorkflowFalTimeoutMs/)
  assert.match(mediaRuntimeSource, /outputWorkflowFalPollIntervalMs/)
  assert.match(mediaRuntimeSource, /outputWorkflowMuapiTimeoutMs/)
  assert.match(mediaRuntimeSource, /buildOutputWorkflowMuapiWebhookUrl/)
  assert.match(mediaRuntimeSource, /readFalWebhookImageResult/)
  assert.match(mediaRuntimeSource, /waitForOutputFalImage/)
  assert.match(mediaRuntimeSource, /waitForOutputFalVideo/)
  assert.match(mediaRuntimeSource, /waitForOutputMuapiVideo/)
  assert.match(mediaRuntimeSource, /falErrorMessage/)
  assert.match(mediaRuntimeSource, /isFalReferencePolicyError/)
  assert.match(mediaRuntimeSource, /normalizeFalResultBody/)
  assert.match(mediaRuntimeSource, /extractFalImageRecord/)
  assert.match(mediaRuntimeSource, /extractFalVideoRecord/)
  assert.match(mediaRuntimeSource, /muapiErrorMessage/)
  assert.match(mediaRuntimeSource, /readMuapiRequestId/)
  assert.match(mediaRuntimeSource, /readMuapiProviderStatus/)
  assert.match(mediaRuntimeSource, /muapiStatusIsComplete/)
  assert.match(mediaRuntimeSource, /muapiStatusIsFailed/)
  assert.match(mediaRuntimeSource, /MUAPI_VIDEO_PROMPT_MAX_CHARS/)
  assert.match(mediaRuntimeSource, /compactSeedancePromptForProvider/)
  assert.match(mediaRuntimeSource, /buildMuapiVideoPayload/)
  assert.match(mediaRuntimeSource, /extractMuapiVideoUrlFromResult/)
  assert.match(mediaRuntimeSource, /resolveOutputVideoProvider/)
  assert.match(mediaRuntimeSource, /outputWorkflowDefaultVideoModel/)
  assert.match(mediaRuntimeSource, /resolveMuapiVideoDurationSeconds/)
  assert.match(mediaRuntimeSource, /referenceLimitForImageNode/)
  assert.doesNotMatch(runtimeSource, /function outputWorkflowImageModel/)
  assert.doesNotMatch(runtimeSource, /function normalizeImageSize/)
  assert.doesNotMatch(runtimeSource, /function buildFalHeaders/)
  assert.doesNotMatch(runtimeSource, /function buildMuapiHeaders/)
  assert.doesNotMatch(runtimeSource, /function buildFalImageRequestBody/)
  assert.doesNotMatch(runtimeSource, /function buildFalVideoRequestBody/)
  assert.doesNotMatch(runtimeSource, /function outputWorkflowFalStaleRequestMs/)
  assert.doesNotMatch(runtimeSource, /function fetchFalJson/)
  assert.doesNotMatch(runtimeSource, /function fetchMuapiJson/)
  assert.doesNotMatch(runtimeSource, /async function submitFalImageRequest/)
  assert.doesNotMatch(runtimeSource, /async function submitFalVideoRequest/)
  assert.doesNotMatch(runtimeSource, /async function submitMuapiVideoRequest/)
  assert.doesNotMatch(runtimeSource, /async function getFalStatus/)
  assert.doesNotMatch(runtimeSource, /async function getFalResult/)
  assert.doesNotMatch(runtimeSource, /async function getMuapiResult/)
  assert.doesNotMatch(runtimeSource, /function outputWorkflowFalTimeoutMs/)
  assert.doesNotMatch(runtimeSource, /function outputWorkflowFalPollIntervalMs/)
  assert.doesNotMatch(runtimeSource, /function outputWorkflowMuapiTimeoutMs/)
  assert.doesNotMatch(runtimeSource, /function buildOutputWorkflowMuapiWebhookUrl/)
  assert.doesNotMatch(runtimeSource, /function readFalWebhookImageResult/)
  assert.doesNotMatch(runtimeSource, /async function waitForOutputFalImage/)
  assert.doesNotMatch(runtimeSource, /async function waitForOutputFalVideo/)
  assert.doesNotMatch(runtimeSource, /async function waitForOutputMuapiVideo/)
  assert.doesNotMatch(runtimeSource, /function falErrorMessage/)
  assert.doesNotMatch(runtimeSource, /function isFalReferencePolicyError/)
  assert.doesNotMatch(runtimeSource, /function normalizeFalResultBody/)
  assert.doesNotMatch(runtimeSource, /function extractFalImageRecord/)
  assert.doesNotMatch(runtimeSource, /function extractFalVideoRecord/)
  assert.doesNotMatch(runtimeSource, /function muapiErrorMessage/)
  assert.doesNotMatch(runtimeSource, /function readMuapiRequestId/)
  assert.doesNotMatch(runtimeSource, /function readMuapiProviderStatus/)
  assert.doesNotMatch(runtimeSource, /function muapiStatusIsComplete/)
  assert.doesNotMatch(runtimeSource, /function muapiStatusIsFailed/)
  assert.doesNotMatch(runtimeSource, /function compactSeedancePromptForProvider/)
  assert.doesNotMatch(runtimeSource, /function buildMuapiVideoPayload/)
  assert.doesNotMatch(runtimeSource, /function extractMuapiVideoUrlFromResult/)
  assert.doesNotMatch(runtimeSource, /function resolveOutputVideoProvider/)
  assert.doesNotMatch(runtimeSource, /function referenceLimitForImageNode/)
  assert.doesNotMatch(mediaPackSource, /executeMediaGeneration/)
  assert.match(mediaPackSource, /cinematic_block_video: videoGeneration/)
  assert.match(mediaPackSource, /cinematic_v3_storyboard_group_video: videoGeneration/)
  assert.match(mediaPackSource, /cinematic_beat_sheet: imageGeneration/)
  assert.match(mediaPackSource, /comic_page: imageGeneration/)
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

test('scene board modal resets stale scene state when the selected animatic changes', () => {
  const repoRoot = process.cwd()
  const pageSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const sceneBoardCanvasSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/scene-board/SceneBoardCanvas.tsx'), 'utf8')

  assert.match(sceneBoardCanvasSource, /const desiredSceneId = requestedInitialSceneId/)
  assert.match(sceneBoardCanvasSource, /setSceneId\(\(current\) => \(/)
  assert.match(sceneBoardCanvasSource, /model\.request\.id, requestedInitialSceneId, scopeNodeId/)
  assert.match(sceneBoardCanvasSource, /setSelectedShotIds\(new Set\(\)\)/)
  assert.match(pageSource, /sceneBoardSequenceKeys = sequenceAnimaticSceneBoardModel\.request\.selectedSequenceUnitKeys/)
  assert.match(pageSource, /sceneBoardSequenceKeys\.includes\(activeWikiEntity\.key\)/)
  assert.match(pageSource, /setSequenceAnimaticSceneBoardRequestId\(null\)[\s\S]*setSequenceAnimaticSceneBoardScopeSceneId\(null\)[\s\S]*setSequenceAnimaticSceneBoardScopeNodeId\(null\)/)
})

test('sequence animatic reference policy is imported by packs instead of injected by executor helpers', () => {
  const repoRoot = process.cwd()
  const helperTypesSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-node-pack-types.ts'), 'utf8')
  const referenceRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-reference-runtime.ts'), 'utf8')
  const cinematicAssetPackRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-cinematic-asset-pack-runtime.ts'), 'utf8')
  const coveragePackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-coverage-pack.ts'), 'utf8')
  const shotProductionPackSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-shot-production-pack.ts'), 'utf8')
  const manifestRuntimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-manifest-runtime.ts'), 'utf8')

  assert.match(referenceRuntimeSource, /export function orderSequenceAnimaticAssetPackReferences/)
  assert.match(referenceRuntimeSource, /export function sequenceAnimaticReferenceManifestEntries/)
  assert.match(cinematicAssetPackRuntimeSource, /export function cinematicAssetPackEntityKeys/)
  assert.match(coveragePackSource, /output-workflow-sequence-animatic-reference-runtime/)
  assert.match(shotProductionPackSource, /sequenceAnimaticReferenceVisual/)
  assert.match(manifestRuntimeSource, /cinematicV2ShotPlanSchema\.safeParse/)
  assert.doesNotMatch(helperTypesSource, /sequenceAnimaticReferenceManifestEntries:/)
  assert.doesNotMatch(helperTypesSource, /sequenceAnimaticReferenceRole:/)
  assert.doesNotMatch(helperTypesSource, /cinematicAssetPackEntityKeys:/)
  assert.doesNotMatch(helperTypesSource, /parseSequenceAnimaticShotPlan:/)
})

test('streaming jsonl processor extracts partial JSON records and tracks warnings', async () => {
  const repoRoot = process.cwd()
  const streamingSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-streaming.ts'), 'utf8')
  const runtimeSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const shotContinuityStreamSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow-sequence-animatic-shot-continuity-stream.ts'), 'utf8')

  assert.match(streamingSource, /export async function runOpenAiJsonlStream/)
  assert.match(streamingSource, /runOpenAiResponsesStream/)
  assert.match(streamingSource, /onProviderRequestId/)
  assert.match(streamingSource, /providerMode: 'stream'/)
  assert.match(streamingSource, /buildWorkflowStreamingMetadata/)
  assert.match(streamingSource, /streamingEventCount: streaming\.eventCount/)
  assert.match(streamingSource, /streamingWarningCount: streaming\.warningCount/)
  assert.match(streamingSource, /await progress\('completed', true\)/)
  assert.match(shotContinuityStreamSource, /runOpenAiJsonlStream<string>/)
  assert.match(runtimeSource, /output-workflow-sequence-animatic-shot-continuity-stream/)
  assert.doesNotMatch(runtimeSource, /runOpenAiJsonlStream<string>/)
  assert.doesNotMatch(runtimeSource, /runOpenAiResponsesStream/)

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
