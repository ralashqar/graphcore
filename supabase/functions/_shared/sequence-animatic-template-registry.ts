import { z } from 'zod'

import {
  createWorkflowTemplateExtensionScaffold,
  createWorkflowTemplateRegistry,
  workflowTemplateSourceHash,
  type WorkflowTemplateRegistryEntry,
} from '../../../src/domain/outputWorkflowTemplateRegistry.ts'
import {
  buildSequenceAnimaticBlockWorkflowGraph,
  buildSequenceAnimaticContinuityAssetWorkflowGraph,
  buildSequenceAnimaticContinuityBatchWorkflowGraph,
  buildSequenceAnimaticContinuityWorkflowGraph,
  buildSequenceAnimaticPlannedKeyframeWorkflowGraph,
  buildSequenceAnimaticSceneWorkflowGraph,
  buildSequenceAnimaticShotProductionWorkflowGraph,
  buildSequenceAnimaticShotRevisionWorkflowGraph,
  buildSequenceAnimaticShotVideoWorkflowGraph,
} from './sequence-animatic-workflow-factory.ts'

const looseRecordSchema = z.record(z.string(), z.unknown())
const looseRecordArraySchema = z.array(looseRecordSchema)
const imageSizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict()

export const sequenceAnimaticStoryboardBlocksTemplateKey = 'sequence_animatic_storyboard_blocks'
export const sequenceAnimaticSceneShotPlansTemplateKey = 'sequence_animatic_scene_shot_plans'
export const sequenceAnimaticContinuityWorkflowTemplateKey = 'sequence_animatic_continuity_workflow'
export const sequenceAnimaticShotProductionTemplateKey = 'sequence_animatic_shot_production'
export const sequenceAnimaticShotKeyframesTemplateKey = 'sequence_animatic_shot_keyframes'
export const sequenceAnimaticShotVideoTemplateKey = 'sequence_animatic_shot_video'
export const sequenceAnimaticShotRevisionTemplateKey = 'sequence_animatic_shot_revision'
export const sequenceAnimaticContinuityAssetTemplateKey = 'sequence_animatic_continuity_asset'
export const sequenceAnimaticContinuityBatchTemplateKey = 'sequence_animatic_continuity_batch'

export const sequenceAnimaticStoryboardBlocksTemplateInputSchema = z.object({
  workflowId: z.string().min(1),
  draftId: z.string().min(1),
  commonConfig: looseRecordSchema.default({}),
  block: looseRecordSchema.default({}),
  manifestSummary: looseRecordSchema.default({}),
  shotPlan: looseRecordSchema.default({}),
  storyboardGroup: looseRecordSchema.default({}),
  storyboardLayout: z.object({
    rows: z.number().int().positive(),
    columns: z.number().int().positive(),
    panelCount: z.number().int().positive(),
  }).strict().default({ rows: 1, columns: 1, panelCount: 1 }),
  assetPack: looseRecordSchema.default({}),
  storyboardSpatialReferencePack: looseRecordSchema.default({}),
  aspectRatio: z.string().min(1).default('16:9'),
  imageSize: imageSizeSchema.default({ width: 1536, height: 864 }),
  durationSeconds: z.number().positive().default(5),
}).strict()

export const sequenceAnimaticSceneShotPlansTemplateInputSchema = z.object({
  workflowId: z.string().min(1),
  draftId: z.string().min(1),
  commonConfig: looseRecordSchema.default({}),
  sceneId: z.string().min(1),
  sceneIndex: z.number().int().positive().default(1),
  sceneTitle: z.string().default('Scene'),
  scenePackageOutput: looseRecordSchema.default({}),
  screenplayText: z.string().default(''),
  assetPack: looseRecordSchema.default({}),
  context: looseRecordSchema.default({}),
  guidance: looseRecordSchema.default({}),
  maxShotCount: z.number().int().positive().default(8),
  aspectRatio: z.string().min(1).default('16:9'),
  resolution: z.string().min(1).default('720p'),
}).strict()

export const sequenceAnimaticContinuityWorkflowTemplateInputSchema = z.object({
  workflowId: z.string().min(1),
  draftId: z.string().min(1),
  commonConfig: looseRecordSchema.default({}),
  manifest: looseRecordSchema.default({}),
  assetPack: looseRecordSchema.default({}),
  aspectRatio: z.string().min(1).default('16:9'),
}).strict()

export const sequenceAnimaticShotProductionTemplateInputSchema = z.object({
  workflowId: z.string().min(1),
  draftId: z.string().min(1),
  commonConfig: looseRecordSchema.default({}),
  block: looseRecordSchema.default({}),
  shot: looseRecordSchema.default({}),
  panel: looseRecordSchema.default({}),
  assetPack: looseRecordSchema.default({}),
  coverageAssetPack: looseRecordSchema.optional(),
  coverageAnchor: looseRecordSchema.optional(),
  sceneContinuityManifest: looseRecordSchema.optional(),
  previousKeyframe: looseRecordSchema.optional(),
  requiredReferenceAssetKeys: z.array(z.string()).default([]),
  omittedReferenceAssetKeys: z.array(z.string()).default([]),
  selectedReferences: looseRecordArraySchema.default([]),
  omittedReferences: looseRecordArraySchema.default([]),
  sharedDependencyRequests: looseRecordArraySchema.default([]),
  continuityDependencies: looseRecordArraySchema.optional(),
  coverageSetup: looseRecordSchema.optional(),
  coverageShots: looseRecordArraySchema.optional(),
  coverageReferenceAssetKeys: z.array(z.string()).optional(),
  dependencyMode: z.enum(['single_node_chain', 'batch_grid']).optional(),
  editorialDurationSeconds: z.number().positive().default(5),
  providerDurationSeconds: z.number().positive().default(5),
  aspectRatio: z.string().min(1).default('16:9'),
}).strict()

export const sequenceAnimaticShotKeyframesTemplateInputSchema = z.object({
  workflowId: z.string().min(1),
  draftId: z.string().min(1),
  commonConfig: looseRecordSchema.default({}),
  block: looseRecordSchema.default({}),
  shot: looseRecordSchema.default({}),
  coverageSetup: looseRecordSchema.default({}),
  coverageAnchor: looseRecordSchema.default({}),
  sceneContinuityManifest: looseRecordSchema.default({}),
  previousKeyframe: looseRecordSchema.default({}),
  storyboardPanel: looseRecordSchema.default({}),
  assetPack: looseRecordSchema.default({}),
  aspectRatio: z.string().min(1).default('16:9'),
}).strict()

export const sequenceAnimaticShotVideoTemplateInputSchema = z.object({
  workflowId: z.string().min(1),
  draftId: z.string().min(1),
  commonConfig: looseRecordSchema.default({}),
  block: looseRecordSchema.default({}),
  shot: looseRecordSchema.default({}),
  panel: looseRecordSchema.default({}),
  assetPack: looseRecordSchema.default({}),
  editorialDurationSeconds: z.number().positive().default(5),
  providerDurationSeconds: z.number().positive().default(5),
  aspectRatio: z.string().min(1).default('16:9'),
}).strict()

export const sequenceAnimaticShotRevisionTemplateInputSchema = z.object({
  workflowId: z.string().min(1),
  draftId: z.string().min(1),
  commonConfig: looseRecordSchema.default({}),
  block: looseRecordSchema.default({}),
  shot: looseRecordSchema.default({}),
  panel: looseRecordSchema.default({}),
  assetPack: looseRecordSchema.default({}),
  revisionPrompt: z.string().default(''),
  revisionId: z.string().min(1).default('revision_001'),
  aspectRatio: z.string().min(1).default('16:9'),
}).strict()

export const sequenceAnimaticContinuityAssetTemplateInputSchema = z.object({
  workflowId: z.string().min(1),
  draftId: z.string().min(1),
  commonConfig: looseRecordSchema.default({}),
  continuityPack: looseRecordSchema.default({}),
  targetNode: looseRecordSchema.default({}),
  targetNodeId: z.string().min(1),
  assetKind: z.string().min(1).default('location_reference'),
  relevantShots: looseRecordArraySchema.default([]),
  shotBindings: looseRecordSchema.default({}),
  assetPack: looseRecordSchema.default({}),
  referenceAssetKeys: z.array(z.string()).default([]),
  visualDependencyEdges: looseRecordArraySchema.default([]),
  aspectRatio: z.string().min(1).default('16:9'),
}).strict()

export const sequenceAnimaticContinuityBatchTemplateInputSchema = z.object({
  workflowId: z.string().min(1),
  draftId: z.string().min(1),
  commonConfig: looseRecordSchema.default({}),
  batch: looseRecordSchema.default({}),
  targetNodes: looseRecordArraySchema.default([]),
  continuityGraphV2: looseRecordSchema.default({}),
  relevantShots: looseRecordArraySchema.default([]),
  shotBindings: looseRecordSchema.default({}),
  assetPack: looseRecordSchema.default({}),
  referenceAssetKeys: z.array(z.string()).default([]),
  visualDependencyEdges: looseRecordArraySchema.default([]),
  aspectRatio: z.string().min(1).default('1:1'),
}).strict()

function templateSourceHash(policyVersion: string, input: Record<string, unknown>) {
  return workflowTemplateSourceHash({ policyVersion, ...input })
}

export const sequenceAnimaticStoryboardBlocksTemplateScaffold = createWorkflowTemplateExtensionScaffold<
  z.infer<typeof sequenceAnimaticStoryboardBlocksTemplateInputSchema>,
  ReturnType<typeof buildSequenceAnimaticBlockWorkflowGraph>
>({
  key: sequenceAnimaticStoryboardBlocksTemplateKey,
  label: 'Sequence Animatic Storyboard Block',
  inputSchema: sequenceAnimaticStoryboardBlocksTemplateInputSchema,
  policyVersion: 'sequence_animatic_storyboard_blocks_graph_v1',
  workflowFamily: 'sequence_animatic',
  commandAction: 'prepare_storyboard_blocks',
  sourceHashKeys: ['draftId', 'commonConfig', 'block', 'storyboardGroup', 'storyboardLayout', 'assetPack', 'storyboardSpatialReferencePack', 'aspectRatio', 'imageSize'],
  graphStages: ['block_input', 'storyboard_prompt', 'storyboard_sheet', 'panel_extract', 'video_prompt', 'video', 'artifact'],
  requiredNodePurposes: [
    'sequence_animatic_block_input',
    'cinematic_v3_storyboard_prompt',
    'cinematic_v3_storyboard_sheet',
    'cinematic_v3_panel_extract',
    'cinematic_v3_storyboard_group_video_prompt',
    'cinematic_v3_storyboard_group_video',
    'sequence_animatic_block_artifact',
  ],
  requiredArtifactRoles: ['cinematic_v3_storyboard_sheet', 'cinematic_v3_storyboard_group_video', 'sequence_animatic_block_manifest'],
  projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'readyArtifactCount', 'recoveryHints'],
  compatibilityWrappers: ['ensure-sequence-animatic-block-workflows'],
  buildGraph: buildSequenceAnimaticBlockWorkflowGraph,
  sourceHash: (input) => templateSourceHash('sequence_animatic_storyboard_blocks_graph_v1', input),
})

export const sequenceAnimaticSceneShotPlansTemplateScaffold = createWorkflowTemplateExtensionScaffold<
  z.infer<typeof sequenceAnimaticSceneShotPlansTemplateInputSchema>,
  ReturnType<typeof buildSequenceAnimaticSceneWorkflowGraph>
>({
  key: sequenceAnimaticSceneShotPlansTemplateKey,
  label: 'Sequence Animatic Scene Shot Plan',
  inputSchema: sequenceAnimaticSceneShotPlansTemplateInputSchema,
  policyVersion: 'sequence_animatic_scene_shot_plans_graph_v1',
  workflowFamily: 'sequence_animatic',
  commandAction: 'prepare_scene_shot_plans',
  sourceHashKeys: ['draftId', 'commonConfig', 'sceneId', 'scenePackageOutput', 'screenplayText', 'assetPack', 'context', 'guidance', 'maxShotCount'],
  graphStages: ['scene_input', 'sequence_animatic_scene_plan_merge', 'sequence_animatic_director_plan_artifact', 'sequence_animatic_manifest', 'artifact'],
  requiredNodePurposes: [
    'sequence_animatic_scene_input',
    'sequence_animatic_scene_shot_plan',
    'sequence_animatic_scene_plan_merge',
    'sequence_animatic_director_plan_artifact',
    'sequence_animatic_manifest',
    'sequence_animatic_manifest_artifact',
  ],
  requiredArtifactRoles: ['sequence_animatic_director_plan', 'sequence_animatic_manifest'],
  projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'readyArtifactCount', 'recoveryHints'],
  compatibilityWrappers: ['ensure-sequence-animatic-scene-workflows'],
  buildGraph: buildSequenceAnimaticSceneWorkflowGraph,
  sourceHash: (input) => templateSourceHash('sequence_animatic_scene_shot_plans_graph_v1', input),
})

export const sequenceAnimaticContinuityWorkflowTemplateScaffold = createWorkflowTemplateExtensionScaffold<
  z.infer<typeof sequenceAnimaticContinuityWorkflowTemplateInputSchema>,
  ReturnType<typeof buildSequenceAnimaticContinuityWorkflowGraph>
>({
  key: sequenceAnimaticContinuityWorkflowTemplateKey,
  label: 'Sequence Animatic Continuity Workflow',
  inputSchema: sequenceAnimaticContinuityWorkflowTemplateInputSchema,
  policyVersion: 'sequence_animatic_continuity_workflow_graph_v1',
  workflowFamily: 'sequence_animatic',
  commandAction: 'prepare_continuity_workflow',
  sourceHashKeys: ['draftId', 'commonConfig', 'manifest', 'assetPack', 'aspectRatio'],
  graphStages: ['continuity_input', 'continuity_artifact'],
  requiredNodePurposes: [
    'sequence_animatic_continuity_input',
    'sequence_animatic_continuity_seed_graph',
    'sequence_animatic_continuity_global_plan',
    'sequence_animatic_continuity_global_merge',
    'sequence_animatic_continuity_structure_artifact',
    'sequence_animatic_continuity_artifact',
  ],
  requiredArtifactRoles: ['sequence_animatic_continuity_pack'],
  projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'readyArtifactCount', 'recoveryHints'],
  compatibilityWrappers: ['ensure-sequence-animatic-continuity-workflow'],
  buildGraph: buildSequenceAnimaticContinuityWorkflowGraph,
  sourceHash: (input) => templateSourceHash('sequence_animatic_continuity_workflow_graph_v1', input),
})

export const sequenceAnimaticShotProductionTemplateScaffold = createWorkflowTemplateExtensionScaffold<
  z.infer<typeof sequenceAnimaticShotProductionTemplateInputSchema>,
  ReturnType<typeof buildSequenceAnimaticShotProductionWorkflowGraph>
>({
  key: sequenceAnimaticShotProductionTemplateKey,
  label: 'Sequence Animatic Shot Production',
  inputSchema: sequenceAnimaticShotProductionTemplateInputSchema,
  policyVersion: 'sequence_animatic_shot_production_graph_v1',
  workflowFamily: 'sequence_animatic',
  commandAction: 'prepare_shot_production_graph',
  sourceHashKeys: ['draftId', 'commonConfig', 'shot', 'panel', 'assetPack', 'coverageSetup', 'coverageAnchor', 'sceneContinuityManifest', 'continuityDependencies', 'dependencyMode', 'aspectRatio'],
  graphStages: ['shot_input', 'shot_reference_pack', 'planned_keyframe_prompt', 'planned_keyframe_image', 'planned_keyframe_artifact', 'shot_video_prompt', 'shot_video'],
  requiredNodePurposes: [
    'sequence_animatic_shot_input',
    'sequence_animatic_shot_reference_pack',
    'sequence_animatic_planned_keyframe_prompt',
    'sequence_animatic_planned_keyframe_image',
    'sequence_animatic_planned_keyframe_artifact',
    'sequence_animatic_shot_video_prompt',
    'sequence_animatic_shot_video',
    'sequence_animatic_shot_video_artifact',
  ],
  requiredArtifactRoles: ['sequence_animatic_shot_keyframe', 'sequence_animatic_shot_video'],
  projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'readyArtifactCount', 'recoveryHints'],
  compatibilityWrappers: ['ensure-sequence-animatic-shot-production-graph'],
  buildGraph: buildSequenceAnimaticShotProductionWorkflowGraph,
  sourceHash: (input) => templateSourceHash('sequence_animatic_shot_production_graph_v1', input),
})

export const sequenceAnimaticShotKeyframesTemplateScaffold = createWorkflowTemplateExtensionScaffold<
  z.infer<typeof sequenceAnimaticShotKeyframesTemplateInputSchema>,
  ReturnType<typeof buildSequenceAnimaticPlannedKeyframeWorkflowGraph>
>({
  key: sequenceAnimaticShotKeyframesTemplateKey,
  label: 'Sequence Animatic Shot Keyframe',
  inputSchema: sequenceAnimaticShotKeyframesTemplateInputSchema,
  policyVersion: 'sequence_animatic_shot_keyframes_graph_v1',
  workflowFamily: 'sequence_animatic',
  commandAction: 'generate_keyframes',
  sourceHashKeys: ['draftId', 'commonConfig', 'shot', 'coverageSetup', 'coverageAnchor', 'sceneContinuityManifest', 'previousKeyframe', 'storyboardPanel', 'assetPack', 'aspectRatio'],
  graphStages: ['planned_keyframe_input', 'planned_keyframe_prompt', 'planned_keyframe_image', 'planned_keyframe_artifact'],
  requiredNodePurposes: [
    'sequence_animatic_planned_keyframe_input',
    'sequence_animatic_planned_keyframe_prompt',
    'sequence_animatic_planned_keyframe_image',
    'sequence_animatic_planned_keyframe_artifact',
  ],
  requiredArtifactRoles: ['sequence_animatic_shot_keyframe'],
  projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'readyArtifactCount', 'recoveryHints'],
  compatibilityWrappers: ['ensure-sequence-animatic-keyframe-workflows'],
  buildGraph: buildSequenceAnimaticPlannedKeyframeWorkflowGraph,
  sourceHash: (input) => templateSourceHash('sequence_animatic_shot_keyframes_graph_v1', input),
})

export const sequenceAnimaticShotVideoTemplateScaffold = createWorkflowTemplateExtensionScaffold<
  z.infer<typeof sequenceAnimaticShotVideoTemplateInputSchema>,
  ReturnType<typeof buildSequenceAnimaticShotVideoWorkflowGraph>
>({
  key: sequenceAnimaticShotVideoTemplateKey,
  label: 'Sequence Animatic Shot Video',
  inputSchema: sequenceAnimaticShotVideoTemplateInputSchema,
  policyVersion: 'sequence_animatic_shot_video_graph_v1',
  workflowFamily: 'sequence_animatic',
  commandAction: 'generate_shot_video',
  sourceHashKeys: ['draftId', 'commonConfig', 'shot', 'panel', 'assetPack', 'editorialDurationSeconds', 'providerDurationSeconds', 'aspectRatio'],
  graphStages: ['shot_input', 'shot_video_prompt', 'shot_video'],
  requiredNodePurposes: [
    'sequence_animatic_shot_input',
    'sequence_animatic_shot_video_prompt',
    'sequence_animatic_shot_video',
  ],
  requiredArtifactRoles: ['sequence_animatic_shot_video'],
  projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'readyArtifactCount', 'recoveryHints'],
  compatibilityWrappers: ['ensure-sequence-animatic-block-workflows'],
  buildGraph: buildSequenceAnimaticShotVideoWorkflowGraph,
  sourceHash: (input) => templateSourceHash('sequence_animatic_shot_video_graph_v1', input),
})

export const sequenceAnimaticShotRevisionTemplateScaffold = createWorkflowTemplateExtensionScaffold<
  z.infer<typeof sequenceAnimaticShotRevisionTemplateInputSchema>,
  ReturnType<typeof buildSequenceAnimaticShotRevisionWorkflowGraph>
>({
  key: sequenceAnimaticShotRevisionTemplateKey,
  label: 'Sequence Animatic Shot Revision',
  inputSchema: sequenceAnimaticShotRevisionTemplateInputSchema,
  policyVersion: 'sequence_animatic_shot_revision_graph_v1',
  workflowFamily: 'sequence_animatic',
  commandAction: 'revise_shot',
  sourceHashKeys: ['draftId', 'commonConfig', 'shot', 'panel', 'assetPack', 'revisionPrompt', 'revisionId', 'aspectRatio'],
  graphStages: ['shot_revision_input', 'shot_revision_plan', 'shot_keyframe_prompt', 'shot_keyframe_image', 'shot_revision_artifact'],
  requiredNodePurposes: [
    'sequence_animatic_shot_revision_input',
    'sequence_animatic_shot_revision_plan',
    'sequence_animatic_shot_keyframe_prompt',
    'sequence_animatic_shot_keyframe_image',
    'sequence_animatic_shot_revision_artifact',
  ],
  requiredArtifactRoles: ['sequence_animatic_shot_keyframe', 'sequence_animatic_shot_revision'],
  projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'readyArtifactCount', 'recoveryHints'],
  compatibilityWrappers: ['ensure-sequence-animatic-shot-revision-workflow'],
  buildGraph: buildSequenceAnimaticShotRevisionWorkflowGraph,
  sourceHash: (input) => templateSourceHash('sequence_animatic_shot_revision_graph_v1', input),
})

export const sequenceAnimaticContinuityAssetTemplateScaffold = createWorkflowTemplateExtensionScaffold<
  z.infer<typeof sequenceAnimaticContinuityAssetTemplateInputSchema>,
  ReturnType<typeof buildSequenceAnimaticContinuityAssetWorkflowGraph>
>({
  key: sequenceAnimaticContinuityAssetTemplateKey,
  label: 'Sequence Animatic Continuity Asset',
  inputSchema: sequenceAnimaticContinuityAssetTemplateInputSchema,
  policyVersion: 'sequence_animatic_continuity_asset_graph_v1',
  workflowFamily: 'sequence_animatic',
  commandAction: 'generate_continuity_assets',
  sourceHashKeys: ['draftId', 'commonConfig', 'continuityPack', 'targetNodeId', 'targetNode', 'assetKind', 'assetPack', 'referenceAssetKeys', 'visualDependencyEdges', 'aspectRatio'],
  graphStages: ['continuity_asset_input', 'continuity_asset_prompt', 'continuity_asset_image', 'continuity_asset_artifact'],
  requiredNodePurposes: [
    'sequence_animatic_continuity_asset_input',
    'sequence_animatic_continuity_asset_prompt',
    'sequence_animatic_continuity_asset_image',
    'sequence_animatic_continuity_asset_artifact',
  ],
  requiredArtifactRoles: ['sequence_animatic_continuity_asset_image', 'sequence_animatic_continuity_asset'],
  projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'readyArtifactCount', 'recoveryHints'],
  compatibilityWrappers: ['ensure-sequence-animatic-continuity-asset-workflow'],
  buildGraph: buildSequenceAnimaticContinuityAssetWorkflowGraph,
  sourceHash: (input) => templateSourceHash('sequence_animatic_continuity_asset_graph_v1', input),
})

export const sequenceAnimaticContinuityBatchTemplateScaffold = createWorkflowTemplateExtensionScaffold<
  z.infer<typeof sequenceAnimaticContinuityBatchTemplateInputSchema>,
  ReturnType<typeof buildSequenceAnimaticContinuityBatchWorkflowGraph>
>({
  key: sequenceAnimaticContinuityBatchTemplateKey,
  label: 'Sequence Animatic Continuity Batch',
  inputSchema: sequenceAnimaticContinuityBatchTemplateInputSchema,
  policyVersion: 'sequence_animatic_continuity_batch_graph_v1',
  workflowFamily: 'sequence_animatic',
  commandAction: 'generate_continuity_assets',
  sourceHashKeys: ['draftId', 'commonConfig', 'batch', 'targetNodes', 'continuityGraphV2', 'assetPack', 'referenceAssetKeys', 'visualDependencyEdges', 'aspectRatio'],
  graphStages: ['continuity_batch_input', 'continuity_batch_prompt', 'continuity_batch_image', 'continuity_batch_extract', 'continuity_batch_artifact'],
  requiredNodePurposes: [
    'sequence_animatic_continuity_batch_input',
    'sequence_animatic_continuity_batch_prompt',
    'sequence_animatic_continuity_batch_image',
    'sequence_animatic_continuity_batch_extract',
    'sequence_animatic_continuity_batch_artifact',
  ],
  requiredArtifactRoles: ['sequence_animatic_continuity_batch_image', 'sequence_animatic_continuity_asset_batch'],
  projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'readyArtifactCount', 'recoveryHints'],
  compatibilityWrappers: ['ensure-sequence-animatic-continuity-asset-workflow'],
  buildGraph: buildSequenceAnimaticContinuityBatchWorkflowGraph,
  sourceHash: (input) => templateSourceHash('sequence_animatic_continuity_batch_graph_v1', input),
})

export const sequenceAnimaticCommandTemplateScaffolds = [
  sequenceAnimaticStoryboardBlocksTemplateScaffold,
  sequenceAnimaticSceneShotPlansTemplateScaffold,
  sequenceAnimaticContinuityWorkflowTemplateScaffold,
  sequenceAnimaticShotProductionTemplateScaffold,
  sequenceAnimaticShotKeyframesTemplateScaffold,
  sequenceAnimaticShotVideoTemplateScaffold,
  sequenceAnimaticShotRevisionTemplateScaffold,
  sequenceAnimaticContinuityAssetTemplateScaffold,
  sequenceAnimaticContinuityBatchTemplateScaffold,
] as const

export const sequenceAnimaticCommandTemplateManifests = sequenceAnimaticCommandTemplateScaffolds.map((scaffold) => scaffold.manifest) as Array<WorkflowTemplateRegistryEntry<any, any>>

export const sequenceAnimaticCommandWorkflowTemplateRegistry = createWorkflowTemplateRegistry(sequenceAnimaticCommandTemplateManifests)
