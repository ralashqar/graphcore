import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import {
  sequenceAnimaticCoverageAnchorArtifact,
  sequenceAnimaticCoverageAnchorBrief,
  sequenceAnimaticCoverageAnchorInput,
  sequenceAnimaticCoverageAnchorPrompt,
  sequenceAnimaticCoverageIntentArtifact,
  sequenceAnimaticCoverageIntentInput,
  sequenceAnimaticCoverageIntentPlan,
  sequenceAnimaticCoveragePlan,
} from './output-workflow-sequence-animatic-coverage-pack.ts'
import {
  sequenceAnimaticAnchorAtlasPrompt,
  sequenceAnimaticAnchorExtract,
  sequenceAnimaticContinuityAnchorPlan,
} from './output-workflow-sequence-animatic-continuity-anchor-pack.ts'
import {
  sequenceAnimaticContinuityAssetArtifact,
  sequenceAnimaticContinuityAssetInput,
  sequenceAnimaticContinuityAssetPrompt,
  sequenceAnimaticContinuityBatchArtifact,
  sequenceAnimaticContinuityBatchExtract,
  sequenceAnimaticContinuityBatchInput,
  sequenceAnimaticContinuityBatchPrompt,
} from './output-workflow-sequence-animatic-continuity-asset-pack.ts'
import {
  sequenceAnimaticContinuityArtifact,
  sequenceAnimaticContinuityBlockMerge,
  sequenceAnimaticContinuityBlockPlan,
  sequenceAnimaticContinuityGlobalMerge,
  sequenceAnimaticContinuityGlobalPlan,
  sequenceAnimaticContinuityGraphFinalize,
  sequenceAnimaticContinuityInput,
  sequenceAnimaticContinuitySeedGraph,
  sequenceAnimaticContinuityStructureArtifact,
} from './output-workflow-sequence-animatic-continuity-graph-pack.ts'
import {
  sequenceAnimaticPlannedKeyframeArtifact,
  sequenceAnimaticPlannedKeyframeImage,
  sequenceAnimaticPlannedKeyframeInput,
  sequenceAnimaticPlannedKeyframePrompt,
  sequenceAnimaticShotVideo,
  sequenceAnimaticShotVideoArtifact,
  sequenceAnimaticShotVideoPrompt,
} from './output-workflow-sequence-animatic-shot-production-pack.ts'
import {
  sequenceAnimaticShotKeyframeImage,
  sequenceAnimaticShotKeyframePrompt,
  sequenceAnimaticShotRevisionArtifact,
  sequenceAnimaticShotRevisionInput,
  sequenceAnimaticShotRevisionPlan,
} from './output-workflow-sequence-animatic-shot-revision-pack.ts'
import {
  sequenceAnimaticBlockArtifact,
  sequenceAnimaticBlockInput,
  sequenceAnimaticDirectorPlan,
  sequenceAnimaticDirectorPlanArtifact,
  sequenceAnimaticManifest,
  sequenceAnimaticManifestArtifact,
  sequenceAnimaticOrchestrator,
  sequenceAnimaticSceneGraphAssignment,
  sequenceAnimaticSceneInput,
  sequenceAnimaticScenePackage,
  sequenceAnimaticScenePlanFanout,
  sequenceAnimaticScenePlanMerge,
  sequenceAnimaticSceneRegister,
  sequenceAnimaticSceneShotPlan,
} from './output-workflow-sequence-animatic-planning-pack.ts'
import {
  sequenceAnimaticSharedAssetRef,
  sequenceAnimaticShotInput,
  sequenceAnimaticShotReferencePack,
} from './output-workflow-sequence-animatic-shot-reference-pack.ts'
import type {
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
} from './output-workflow-sequence-animatic-node-pack-types.ts'
const sequenceAnimaticHandlers = {
  sequence_animatic_shot_input: sequenceAnimaticShotInput,
  sequence_animatic_shared_asset_ref: sequenceAnimaticSharedAssetRef,
  sequence_animatic_shot_reference_pack: sequenceAnimaticShotReferencePack,
  sequence_animatic_block_input: sequenceAnimaticBlockInput,
  sequence_animatic_block_artifact: sequenceAnimaticBlockArtifact,
  sequence_animatic_scene_plan_fanout: sequenceAnimaticScenePlanFanout,
  sequence_animatic_scene_package: sequenceAnimaticScenePackage,
  sequence_animatic_scene_graph_assignment: sequenceAnimaticSceneGraphAssignment,
  sequence_animatic_scene_shot_plan: sequenceAnimaticSceneShotPlan,
  sequence_animatic_director_plan: sequenceAnimaticDirectorPlan,
  sequence_animatic_scene_input: sequenceAnimaticSceneInput,
  sequence_animatic_scene_register: sequenceAnimaticSceneRegister,
  sequence_animatic_orchestrator: sequenceAnimaticOrchestrator,
  sequence_animatic_scene_plan_merge: sequenceAnimaticScenePlanMerge,
  sequence_animatic_manifest: sequenceAnimaticManifest,
  sequence_animatic_manifest_artifact: sequenceAnimaticManifestArtifact,
  sequence_animatic_director_plan_artifact: sequenceAnimaticDirectorPlanArtifact,
  sequence_animatic_coverage_plan: sequenceAnimaticCoveragePlan,
  sequence_animatic_coverage_intent_input: sequenceAnimaticCoverageIntentInput,
  sequence_animatic_coverage_intent_plan: sequenceAnimaticCoverageIntentPlan,
  sequence_animatic_coverage_intent_artifact: sequenceAnimaticCoverageIntentArtifact,
  sequence_animatic_coverage_anchor_input: sequenceAnimaticCoverageAnchorInput,
  sequence_animatic_coverage_anchor_brief: sequenceAnimaticCoverageAnchorBrief,
  sequence_animatic_coverage_anchor_prompt: sequenceAnimaticCoverageAnchorPrompt,
  sequence_animatic_coverage_anchor_artifact: sequenceAnimaticCoverageAnchorArtifact,
  sequence_animatic_continuity_input: sequenceAnimaticContinuityInput,
  sequence_animatic_continuity_anchor_plan: sequenceAnimaticContinuityAnchorPlan,
  sequence_animatic_character_anchor_atlas_prompt: sequenceAnimaticAnchorAtlasPrompt,
  sequence_animatic_prop_anchor_atlas_prompt: sequenceAnimaticAnchorAtlasPrompt,
  sequence_animatic_location_anchor_atlas_prompt: sequenceAnimaticAnchorAtlasPrompt,
  sequence_animatic_character_anchor_extract: sequenceAnimaticAnchorExtract,
  sequence_animatic_prop_anchor_extract: sequenceAnimaticAnchorExtract,
  sequence_animatic_location_anchor_extract: sequenceAnimaticAnchorExtract,
  sequence_animatic_continuity_seed_graph: sequenceAnimaticContinuitySeedGraph,
  sequence_animatic_continuity_global_plan: sequenceAnimaticContinuityGlobalPlan,
  sequence_animatic_continuity_global_merge: sequenceAnimaticContinuityGlobalMerge,
  sequence_animatic_continuity_block_plan: sequenceAnimaticContinuityBlockPlan,
  sequence_animatic_continuity_block_merge: sequenceAnimaticContinuityBlockMerge,
  sequence_animatic_continuity_graph_finalize: sequenceAnimaticContinuityGraphFinalize,
  sequence_animatic_continuity_structure_artifact: sequenceAnimaticContinuityStructureArtifact,
  sequence_animatic_continuity_asset_input: sequenceAnimaticContinuityAssetInput,
  sequence_animatic_continuity_batch_input: sequenceAnimaticContinuityBatchInput,
  sequence_animatic_continuity_batch_prompt: sequenceAnimaticContinuityBatchPrompt,
  sequence_animatic_continuity_batch_extract: sequenceAnimaticContinuityBatchExtract,
  sequence_animatic_continuity_asset_prompt: sequenceAnimaticContinuityAssetPrompt,
  sequence_animatic_continuity_asset_artifact: sequenceAnimaticContinuityAssetArtifact,
  sequence_animatic_continuity_artifact: sequenceAnimaticContinuityArtifact,
  sequence_animatic_continuity_batch_artifact: sequenceAnimaticContinuityBatchArtifact,
  sequence_animatic_planned_keyframe_prompt: sequenceAnimaticPlannedKeyframePrompt,
  sequence_animatic_planned_keyframe_input: sequenceAnimaticPlannedKeyframeInput,
  sequence_animatic_planned_keyframe_image: sequenceAnimaticPlannedKeyframeImage,
  sequence_animatic_planned_keyframe_artifact: sequenceAnimaticPlannedKeyframeArtifact,
  sequence_animatic_shot_video_prompt: sequenceAnimaticShotVideoPrompt,
  sequence_animatic_shot_video: sequenceAnimaticShotVideo,
  sequence_animatic_shot_video_artifact: sequenceAnimaticShotVideoArtifact,
  sequence_animatic_shot_revision_input: sequenceAnimaticShotRevisionInput,
  sequence_animatic_shot_revision_plan: sequenceAnimaticShotRevisionPlan,
  sequence_animatic_shot_keyframe_prompt: sequenceAnimaticShotKeyframePrompt,
  sequence_animatic_shot_keyframe_image: sequenceAnimaticShotKeyframeImage,
  sequence_animatic_shot_revision_artifact: sequenceAnimaticShotRevisionArtifact,
}

const sequenceAnimaticWorkflowNodePackKey = 'sequence_animatic'

export const sequenceAnimaticWorkflowNodePack = defineWorkflowNodePack<
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
  typeof sequenceAnimaticHandlers
>({
  packKey: sequenceAnimaticWorkflowNodePackKey,
  handlers: sequenceAnimaticHandlers,
})

export const sequenceAnimaticWorkflowNodeHandlerKeys = sequenceAnimaticWorkflowNodePack.handlerKeys

function createSequenceAnimaticNodeScaffold(input: {
  purpose: keyof typeof sequenceAnimaticHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Sequence animatic workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: sequenceAnimaticWorkflowNodePackKey,
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

export const sequenceAnimaticWorkflowNodeScaffolds = [
  createSequenceAnimaticNodeScaffold({
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
  createSequenceAnimaticNodeScaffold({
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
  createSequenceAnimaticNodeScaffold({
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
  createSequenceAnimaticNodeScaffold({
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
  createSequenceAnimaticNodeScaffold({
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
  createSequenceAnimaticNodeScaffold({
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

export const sequenceAnimaticWorkflowNodeScaffoldHandlerKeys = sequenceAnimaticWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerSequenceAnimaticWorkflowNodePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>) => void
}) {
  sequenceAnimaticWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
