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
