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

export async function sequenceAnimaticBlockArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const block = helpers.readFirstUpstreamRecord(context.upstream, ['block'])
  const shotPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan'])
  const panels = helpers.readFirstUpstreamArray(context.upstream, ['panels'])
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.sequence-animatic-block`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${context.node.label} Manifest`,
    summary: 'Sequence animatic storyboard block manifest with panels and video prompt.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-block-artifact-v1',
      role: 'sequence_animatic_block_manifest',
      sequenceAnimaticRole: 'storyboard_block',
      parentRequestId: helpers.readText(config.parentRequestId) || helpers.readText(helpers.asRecord(context.workflow.metadata).parentRequestId) || null,
      sequenceUnitKey: helpers.readText(config.sequenceUnitKey) || helpers.readText(helpers.asRecord(context.workflow.metadata).sequenceUnitKey) || null,
      storyboardBlockId: helpers.readText(config.storyboardBlockId) || helpers.readText(block.id) || null,
      block,
      shotPlan,
      panelAssetKeys: panels.map((panel) => helpers.readText(helpers.asRecord(panel).assetKey)).filter(Boolean),
      panelCount: panels.length,
      videoPromptHash: prompt ? helpers.hashOutputWorkflowValue(prompt) : '',
    },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey: '',
    artifact,
    artifacts: [artifact],
    block,
    shotPlan,
    panels,
    videoPrompt: prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-block-artifact-v1' })
}

export async function sequenceAnimaticManifestArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const manifest = helpers.readFirstUpstreamRecord(context.upstream, ['manifest', 'sequenceAnimaticManifest', 'sequence_animatic_manifest'])
  if (!Object.keys(manifest).length) throw new Error('Sequence animatic manifest artifact requires a manifest input.')
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.sequence-animatic-manifest`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${context.node.label} Manifest`,
    summary: 'Sequence-unit screenplay animatic manifest with shot-continuity storyboard blocks and shot data.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-manifest-artifact-v1',
      role: 'sequence_animatic_manifest',
      graphSpecVersion: helpers.readText(manifest.graphSpecVersion) || 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'master',
      manifest,
      screenplayDraft: helpers.asRecord(manifest.screenplayDraft),
      shotBreakPlan: helpers.asRecord(manifest.shotBreakPlan),
      directorPlan: helpers.asRecord(manifest.directorPlan),
      shotPlan: helpers.asRecord(manifest.shotPlan),
      blocks: Array.isArray(manifest.blocks) ? manifest.blocks : [],
      blockCount: Array.isArray(manifest.blocks) ? manifest.blocks.length : 0,
    },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey: '',
    artifact,
    artifacts: [artifact],
    manifest,
    sequenceAnimaticManifest: manifest,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-manifest-artifact-v1' })
}

export async function sequenceAnimaticDirectorPlanArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const directorPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
  if (!Object.keys(directorPlan).length) throw new Error('Sequence animatic shot continuity plan artifact requires a shot continuity plan input.')
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.sequence-animatic-director-plan`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${context.node.label} Shot Continuity Plan`,
    summary: 'Sequence-unit animatic shot continuity plan with all shots, canonical references, output-local scene graph bindings, and asset requirements.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-director-plan-artifact-v1',
      role: 'sequence_animatic_director_plan',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'director_plan',
      screenplayAnimaticRole: 'director_plan',
      directorPlan,
      director_plan: directorPlan,
      shotContinuityPlan: directorPlan,
      shot_continuity_plan: directorPlan,
      shots: helpers.readArray(directorPlan.shots).map(helpers.asRecord),
      blocks: helpers.readArray(directorPlan.blocks).map(helpers.asRecord),
      coverageSetups: helpers.readArray(directorPlan.coverageSetups ?? directorPlan.coverage_setups).map(helpers.asRecord),
      coverage_setups: helpers.readArray(directorPlan.coverageSetups ?? directorPlan.coverage_setups).map(helpers.asRecord),
      coverageSetupByShotId: helpers.asRecord(directorPlan.coverageSetupByShotId ?? directorPlan.coverage_setup_by_shot_id),
      coverage_setup_by_shot_id: helpers.asRecord(directorPlan.coverageSetupByShotId ?? directorPlan.coverage_setup_by_shot_id),
      continuityGraphV2: helpers.asRecord(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2),
      continuity_graph_v2: helpers.asRecord(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2),
      shotBindings: helpers.asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings),
      shot_bindings: helpers.asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings),
      assetRequirements: helpers.readArray(directorPlan.assetRequirements ?? directorPlan.asset_requirements).map(helpers.asRecord),
      asset_requirements: helpers.readArray(directorPlan.assetRequirements ?? directorPlan.asset_requirements).map(helpers.asRecord),
      outputLocalReferences: helpers.readArray(directorPlan.outputLocalReferences ?? directorPlan.output_local_references).map(helpers.asRecord),
      output_local_references: helpers.readArray(directorPlan.outputLocalReferences ?? directorPlan.output_local_references).map(helpers.asRecord),
      rejectedCandidates: helpers.readArray(directorPlan.rejectedCandidates ?? directorPlan.rejected_candidates).map(helpers.asRecord),
      warnings: helpers.readStringArray(directorPlan.warnings),
      diagnostics: helpers.readStringArray(directorPlan.diagnostics),
      shotCount: helpers.readArray(directorPlan.shots).length,
      blockCount: helpers.readArray(directorPlan.blocks).length,
      manifestHash: helpers.readText(directorPlan.manifestHash),
      shotPlanHash: helpers.readText(directorPlan.shotPlanHash),
    },
  })
  await helpers.persistSequenceAnimaticDirectorPlanRequestState({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    artifactKey: artifact.key,
    directorPlan,
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey: '',
    artifact,
    artifacts: [artifact],
    directorPlan,
    director_plan: directorPlan,
    shotContinuityPlan: directorPlan,
    shot_continuity_plan: directorPlan,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-director-plan-artifact-v1' })
}

const sequenceAnimaticArtifactHandlers = {
  sequence_animatic_block_artifact: sequenceAnimaticBlockArtifact,
  sequence_animatic_manifest_artifact: sequenceAnimaticManifestArtifact,
  sequence_animatic_director_plan_artifact: sequenceAnimaticDirectorPlanArtifact,
}

const sequenceAnimaticArtifactWorkflowNodePackKey = 'sequence_animatic_artifact'

export const sequenceAnimaticArtifactWorkflowNodePack = defineWorkflowNodePack<
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
  typeof sequenceAnimaticArtifactHandlers
>({
  packKey: sequenceAnimaticArtifactWorkflowNodePackKey,
  handlers: sequenceAnimaticArtifactHandlers,
})

export const sequenceAnimaticArtifactWorkflowNodeHandlerKeys = sequenceAnimaticArtifactWorkflowNodePack.handlerKeys

function createSequenceAnimaticArtifactNodeScaffold(input: {
  purpose: keyof typeof sequenceAnimaticArtifactHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Sequence animatic artifact workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: sequenceAnimaticArtifactWorkflowNodePackKey,
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

export const sequenceAnimaticArtifactWorkflowNodeScaffolds = [
  createSequenceAnimaticArtifactNodeScaffold({
    purpose: 'sequence_animatic_block_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.block',
      'upstream.shot_plan',
      'upstream.panels',
      'upstream.prompt',
      'config.parentRequestId',
      'config.sequenceUnitKey',
      'config.storyboardBlockId',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticArtifactNodeScaffold({
    purpose: 'sequence_animatic_manifest_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.manifest',
      'upstream.sequence_animatic_manifest',
      'config.masterRequestId',
      'config.graphSpecVersion',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticArtifactNodeScaffold({
    purpose: 'sequence_animatic_director_plan_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.director_plan',
      'upstream.shot_continuity_plan',
      'config.masterRequestId',
      'config.graphSpecVersion',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
]

export const sequenceAnimaticArtifactWorkflowNodeScaffoldHandlerKeys = sequenceAnimaticArtifactWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerSequenceAnimaticArtifactWorkflowNodePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>) => void
}) {
  sequenceAnimaticArtifactWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
