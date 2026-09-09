import { cinematicV2ShotPlanSchema } from '../../../src/domain/cinematics.ts'
import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import type {
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
} from './output-workflow-sequence-animatic-node-pack-types.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'
import {
  runSequenceAnimaticOrchestratorRuntime,
} from './output-workflow-sequence-animatic-orchestrator-runtime.ts'
import {
  materializeSequenceAnimaticScenePlanFanoutRuntime,
  runSequenceAnimaticDirectorPlanRuntime,
  runSequenceAnimaticScenePlanMergeRuntime,
  runSequenceAnimaticScenePackageAssignmentRuntime,
  runSequenceAnimaticSceneShotPlanRuntime,
} from './output-workflow-sequence-animatic-planning-runtime.ts'
import {
  buildSequenceAnimaticManifestRuntime,
} from './output-workflow-sequence-animatic-manifest-runtime.ts'
import {
  vibeDirectorQualityPassSchema,
  vibeDirectorShotDirectionSchema,
} from '../../../src/domain/vibeDirector.ts'
function result(input: {
  context: SequenceAnimaticNodeExecutionContext
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  outputs: Record<string, unknown>
  provider?: string
  model: string
  providerRequestId?: string
  status?: string
}): SequenceAnimaticNodeExecutionResult {
  return createWorkflowNodeExecutionResult<SequenceAnimaticNodeExecutionResult>(input)
}
export async function sequenceAnimaticBlockInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const block = helpers.asRecord(config.block)
  const shotPlan = cinematicV2ShotPlanSchema.parse(config.shotPlan)
  const storyboardGroup = helpers.asRecord(config.storyboardGroup)
  const storyboardLayout = helpers.asRecord(config.storyboardLayout)
  const assetPack = helpers.asRecord(config.assetPack)
  const storyboardSpatialReferencePack = helpers.asRecord(config.storyboardSpatialReferencePack ?? config.storyboard_spatial_reference_pack)
  const manifestSummary = helpers.asRecord(config.manifestSummary)
  const outputs = {
    block,
    shotPlan,
    shot_plan: shotPlan,
    storyboardGroup,
    storyboardGroupId: helpers.readText(storyboardGroup.id) || helpers.readText(block.id),
    storyboardLayout,
    assetPack,
    asset_pack: assetPack,
    storyboardSpatialReferencePack,
    storyboard_spatial_reference_pack: storyboardSpatialReferencePack,
    storyboardSpatialReferencePackHash: helpers.readText(storyboardSpatialReferencePack.hash),
    manifestSummary,
    screenplayAnimaticRole: 'storyboard_block',
    sequenceAnimaticRole: 'storyboard_block',
    text: JSON.stringify({
      block,
      shotPlan,
      storyboardGroup,
      storyboardLayout,
    }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-block-input-v1' })
}

export async function sequenceAnimaticScenePlanFanout(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const compileOutputs = {
    screenplayDraft: helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft']),
    scenePackage: helpers.readFirstUpstreamRecord(context.upstream, ['scenePackage', 'scene_package']),
    cinematicReferencePlan: helpers.readFirstUpstreamRecord(context.upstream, ['cinematicReferencePlan', 'cinematic_reference_plan']),
    compileHash: helpers.readText(config.compileHash),
  }
  const fanout = await materializeSequenceAnimaticScenePlanFanoutRuntime({
    context: {
      client: context.client,
      run: context.run,
      workflow: context.workflow,
    },
    compileOutputs,
    config,
    helpers,
  })
  const outputs = {
    dynamicGraphExpanded: fanout.expanded,
    graphExpanded: fanout.expanded,
    compileHash: fanout.compileHash,
    sceneCount: fanout.sceneCount,
    scene_count: fanout.sceneCount,
    text: fanout.expanded
      ? `Materialized ${fanout.sceneCount} parallel scene shot planner node(s), merge, manifest, and orchestrator.`
      : `Scene shot planner graph already materialized for ${fanout.sceneCount} scene(s).`,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-scene-plan-fanout-v1' })
}

async function sequenceAnimaticScenePackageAssignment(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  purpose: 'sequence_animatic_scene_package' | 'sequence_animatic_scene_graph_assignment',
) {
  const executed = await runSequenceAnimaticScenePackageAssignmentRuntime({
    context: {
      client: context.client,
      run: context.run,
      workflow: context.workflow,
      node: context.node,
      upstream: context.upstream,
      shouldCancel: context.shouldCancel,
      onProgress: context.onProgress,
    },
    helpers,
    purpose,
  })
  return result({
    context,
    helpers,
    outputs: executed.outputs,
    provider: executed.provider,
    model: executed.model,
    providerRequestId: executed.providerRequestId || undefined,
  })
}

export async function sequenceAnimaticScenePackage(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return sequenceAnimaticScenePackageAssignment(context, helpers, 'sequence_animatic_scene_package')
}

export async function sequenceAnimaticSceneGraphAssignment(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return sequenceAnimaticScenePackageAssignment(context, helpers, 'sequence_animatic_scene_graph_assignment')
}

export async function sequenceAnimaticSceneShotPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const executed = await runSequenceAnimaticSceneShotPlanRuntime({
    context: {
      client: context.client,
      run: context.run,
      workflow: context.workflow,
      node: context.node,
      upstream: context.upstream,
      shouldCancel: context.shouldCancel,
      onProgress: context.onProgress,
    },
    helpers,
  })
  return result({
    context,
    helpers,
    outputs: executed.outputs,
    provider: executed.provider,
    model: executed.model,
    providerRequestId: executed.providerRequestId || undefined,
  })
}

export async function sequenceAnimaticDirectorPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const executed = await runSequenceAnimaticDirectorPlanRuntime({
    context: {
      client: context.client,
      run: context.run,
      workflow: context.workflow,
      node: context.node,
      upstream: context.upstream,
      shouldCancel: context.shouldCancel,
      onProgress: context.onProgress,
    },
    helpers,
  })
  return result({
    context,
    helpers,
    outputs: executed.outputs,
    provider: executed.provider,
    model: executed.model,
    providerRequestId: executed.providerRequestId || undefined,
  })
}

export async function sequenceAnimaticOrchestrator(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const outputs = await runSequenceAnimaticOrchestratorRuntime({
    context: {
      client: context.client,
      run: context.run,
      workflow: context.workflow,
      node: context.node,
      upstream: context.upstream,
    },
    helpers,
  })
  return result({ context, helpers, outputs, model: 'sequence-animatic-orchestrator-v1' })
}

export async function sequenceAnimaticScenePlanMerge(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const executed = runSequenceAnimaticScenePlanMergeRuntime({
    context: {
      client: context.client,
      run: context.run,
      workflow: context.workflow,
      node: context.node,
      upstream: context.upstream,
      shouldCancel: context.shouldCancel,
      onProgress: context.onProgress,
    },
    helpers,
  })
  return result({ context, helpers, outputs: executed.outputs, model: executed.model })
}

export async function vibeDirectorSceneShotQuality(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const vibeDirector = helpers.asRecord(config.vibeDirector ?? config.vibe_director)
  const shotNotes = helpers.asRecord(vibeDirector.shotDirectingNotesByShotId ?? vibeDirector.shot_directing_notes_by_shot_id)
  const scenePlan = helpers.readFirstUpstreamRecord(context.upstream, ['scenePlan', 'scene_plan', 'directorPlan', 'director_plan'])
  const upstreamShots = helpers.readFirstUpstreamArray(context.upstream, ['shots'])
  const planShots = Array.isArray(scenePlan.shots)
    ? scenePlan.shots.map((shot) => helpers.asRecord(shot))
    : upstreamShots.map((shot) => helpers.asRecord(shot))
  const shotDirections = planShots.map((shot, index) => {
    const shotId = helpers.readText(shot.id) || helpers.readText(shot.shotId) || `shot_${String(index + 1).padStart(3, '0')}`
    const camera = helpers.asRecord(shot.camera)
    return vibeDirectorShotDirectionSchema.parse({
      version: 'vibe_director_shot_direction_v1',
      shotId,
      note: helpers.readText(shotNotes[shotId]) || helpers.readText(vibeDirector.directingStyle) || '',
      camera: [helpers.readText(camera.framing), helpers.readText(camera.angle), helpers.readText(camera.lens)].filter(Boolean).join('; '),
      movement: helpers.readText(camera.movement) || helpers.readText(shot.movement),
      performance: helpers.readText(shot.performance) || helpers.readText(vibeDirector.performanceMode),
      continuity: helpers.readText(shot.continuity) || helpers.readText(scenePlan.continuity),
      source: helpers.readText(shotNotes[shotId]) ? 'user' : 'recommendation',
    })
  })
  const shotsWithoutCamera = planShots.filter((shot) => {
    const camera = helpers.asRecord(shot.camera)
    return !helpers.readText(camera.framing) && !helpers.readText(camera.angle) && !helpers.readText(camera.lens) && !helpers.readText(shot.camera)
  }).length
  const dialogueShots = planShots.filter((shot) => helpers.readText(shot.dialogue) || helpers.readText(shot.dialogueCue ?? shot.dialogue_cue)).length
  const dialogueWithoutPerformance = planShots.filter((shot) => {
    if (!helpers.readText(shot.dialogue) && !helpers.readText(shot.dialogueCue ?? shot.dialogue_cue)) return false
    return !helpers.readText(shot.performance)
  }).length
  const findingRecords = [
    planShots.length > 0
      ? { severity: 'info', text: `Coverage: ${planShots.length} shot${planShots.length === 1 ? '' : 's'} planned for this scene.` }
      : { severity: 'high', text: 'Coverage: no shots found in the scene plan.' },
    shotsWithoutCamera === 0
      ? { severity: 'info', text: 'Camera: all shots include camera language.' }
      : { severity: shotsWithoutCamera > Math.max(1, planShots.length / 2) ? 'medium' : 'low', text: `Camera: ${shotsWithoutCamera} shot${shotsWithoutCamera === 1 ? '' : 's'} need stronger camera grammar.` },
    dialogueWithoutPerformance === 0
      ? { severity: 'info', text: dialogueShots > 0 ? 'Performance: dialogue shots include performance direction.' : 'Performance: no dialogue-led shots require performance notes.' }
      : { severity: 'medium', text: `Performance: ${dialogueWithoutPerformance} dialogue shot${dialogueWithoutPerformance === 1 ? '' : 's'} need acting/performance specificity.` },
  ]
  const findings = findingRecords.map((finding) => finding.text)
  const highFindings = findingRecords.filter((finding) => finding.severity === 'high').length
  const mediumFindings = findingRecords.filter((finding) => finding.severity === 'medium').length
  const qualityPass = vibeDirectorQualityPassSchema.parse({
    version: 'vibe_director_quality_pass_v1',
    target: 'scene_shot_plan',
    status: highFindings > 0 ? 'blocked' : mediumFindings > 0 ? 'warning' : 'passed',
    score: Math.max(0.2, Math.min(1, 1 - highFindings * 0.3 - mediumFindings * 0.12)),
    findings,
    fixesApplied: [],
    recommendedActions: [
      planShots.length === 0 ? 'Regenerate the scene shot plan.' : '',
      shotsWithoutCamera > 0 ? 'Add framing, lens, and movement decisions to underspecified shots.' : '',
      dialogueWithoutPerformance > 0 ? 'Add performance beats to dialogue shots before keyframe prompts.' : '',
    ].filter(Boolean),
  })
  const enrichedScenePlan = {
    ...scenePlan,
    shots: planShots,
    vibeDirectorQualityPass: qualityPass,
    vibe_director_quality_pass: qualityPass,
    shotDirections,
    shot_directions: shotDirections,
  }
  const outputs = {
    text: JSON.stringify({ qualityPass, shotDirections }, null, 2),
    scenePlan: enrichedScenePlan,
    scene_plan: enrichedScenePlan,
    sceneShotPlan: enrichedScenePlan,
    scene_shot_plan: enrichedScenePlan,
    shotContinuityPlan: enrichedScenePlan,
    shot_continuity_plan: enrichedScenePlan,
    directorPlan: enrichedScenePlan,
    director_plan: enrichedScenePlan,
    qualityPass,
    quality_pass: qualityPass,
    shotDirections,
    shot_directions: shotDirections,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-vibe-director-scene-shot-quality-v1' })
}

export async function sequenceAnimaticManifest(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const manifestResult = buildSequenceAnimaticManifestRuntime({ context, helpers })
  return result({ context, helpers, outputs: manifestResult.outputs, model: manifestResult.model })
}

const sequenceAnimaticPlanningHandlers = {
  sequence_animatic_block_input: sequenceAnimaticBlockInput,
  sequence_animatic_scene_plan_fanout: sequenceAnimaticScenePlanFanout,
  sequence_animatic_scene_package: sequenceAnimaticScenePackage,
  sequence_animatic_scene_graph_assignment: sequenceAnimaticSceneGraphAssignment,
  sequence_animatic_scene_shot_plan: sequenceAnimaticSceneShotPlan,
  sequence_animatic_director_plan: sequenceAnimaticDirectorPlan,
  sequence_animatic_orchestrator: sequenceAnimaticOrchestrator,
  sequence_animatic_scene_plan_merge: sequenceAnimaticScenePlanMerge,
  vibe_director_scene_shot_quality: vibeDirectorSceneShotQuality,
  sequence_animatic_manifest: sequenceAnimaticManifest,
}

const sequenceAnimaticPlanningWorkflowNodePackKey = 'sequence_animatic_planning'

export const sequenceAnimaticPlanningWorkflowNodePack = defineWorkflowNodePack<
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
  typeof sequenceAnimaticPlanningHandlers
>({
  packKey: sequenceAnimaticPlanningWorkflowNodePackKey,
  handlers: sequenceAnimaticPlanningHandlers,
})

export const sequenceAnimaticPlanningWorkflowNodeHandlerKeys = sequenceAnimaticPlanningWorkflowNodePack.handlerKeys

function createSequenceAnimaticPlanningNodeScaffold(input: {
  purpose: keyof typeof sequenceAnimaticPlanningHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Sequence animatic planning workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: sequenceAnimaticPlanningWorkflowNodePackKey,
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

export const sequenceAnimaticPlanningWorkflowNodeScaffolds = [
  createSequenceAnimaticPlanningNodeScaffold({
    purpose: 'sequence_animatic_scene_graph_assignment',
    runtimeKind: 'structured_llm',
    sourceHashKeys: [
      'upstream.screenplay',
      'upstream.asset_pack',
      'upstream.context',
      'upstream.guidance',
      'config.masterRequestId',
      'config.sequenceAnimaticMode',
      'config.cinematicAnimaticMode',
      'config.graphSpecVersion',
      'config.sceneGraphAssignmentPolicyVersion',
      'config.maxSceneCount',
      'config.referenceAssetKeys',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'providerStatus',
      'providerRequestId',
      'streaming',
      'failedNodePurpose',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticPlanningNodeScaffold({
    purpose: 'sequence_animatic_scene_plan_fanout',
    runtimeKind: 'child_workflow_utility',
    sourceHashKeys: [
      'upstream.scene_package',
      'upstream.sceneGraphDraft',
      'config.masterRequestId',
      'config.scenePlanFanoutPolicyVersion',
      'config.scenePlannerConcurrency',
      'config.forceRefresh',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'activeChildRequestIds',
      'activeChildRunIds',
      'readyArtifactCount',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticPlanningNodeScaffold({
    purpose: 'sequence_animatic_scene_shot_plan',
    runtimeKind: 'streaming_jsonl',
    sourceHashKeys: [
      'upstream.scene_package',
      'upstream.screenplay',
      'upstream.asset_pack',
      'upstream.context',
      'upstream.guidance',
      'config.masterRequestId',
      'config.sceneId',
      'config.sceneIndex',
      'config.maxShotCount',
      'config.aspectRatio',
      'config.resolution',
      'config.sceneShotPlanPolicyVersion',
      'config.referenceAssetKeys',
      'config.vibeDirector',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'providerStatus',
      'providerRequestId',
      'streaming',
      'streamingEventCount',
      'streamingPartialArtifactKeys',
      'streamingResumeToken',
      'readyArtifactCount',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticPlanningNodeScaffold({
    purpose: 'vibe_director_scene_shot_quality',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.scenePlan',
      'upstream.scene_plan',
      'upstream.directorPlan',
      'upstream.director_plan',
      'config.vibeDirector',
      'config.qualityGateMode',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticPlanningNodeScaffold({
    purpose: 'sequence_animatic_scene_plan_merge',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.scene_plan',
      'upstream.scene_packages',
      'config.masterRequestId',
      'config.scenePlanMergePolicyVersion',
      'config.graphSpecVersion',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticPlanningNodeScaffold({
    purpose: 'sequence_animatic_manifest',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.director_plan',
      'upstream.shot_continuity_plan',
      'upstream.scene_package',
      'config.masterRequestId',
      'config.manifestPolicyVersion',
      'config.graphSpecVersion',
      'config.selectedVisualReferenceKeys',
      'config.referenceAssetKeys',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticPlanningNodeScaffold({
    purpose: 'sequence_animatic_orchestrator',
    runtimeKind: 'child_workflow_utility',
    sourceHashKeys: [
      'upstream.director_plan',
      'upstream.manifest',
      'config.masterRequestId',
      'config.blockConcurrency',
      'config.autoStartStoryboards',
      'config.autoStartVideos',
      'config.orchestratorPolicyVersion',
      'config.graphSpecVersion',
      'config.forceRefresh',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'activeChildRequestIds',
      'activeChildRunIds',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
]

export const sequenceAnimaticPlanningWorkflowNodeScaffoldHandlerKeys = sequenceAnimaticPlanningWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerSequenceAnimaticPlanningWorkflowNodePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>) => void
}) {
  sequenceAnimaticPlanningWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
