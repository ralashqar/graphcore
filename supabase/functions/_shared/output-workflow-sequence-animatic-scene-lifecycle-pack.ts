import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import type {
  LooseRecord,
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
} from './output-workflow-sequence-animatic-node-pack-types.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'
import {
  sequenceAnimaticScenePackageOutputSchema,
} from './output-workflow-sequence-animatic-scene-package-runtime.ts'

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

export async function sequenceAnimaticSceneInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const scenePackageOutput = sequenceAnimaticScenePackageOutputSchema.parse(helpers.asRecord(config.scenePackage))
  const screenplayText = helpers.readText(config.sceneScreenplayText) || helpers.readText(config.screenplayText)
  if (!screenplayText) throw new Error('Sequence animatic scene input requires the authored screenplay text.')
  const screenplayDraft = { screenplayMarkdown: screenplayText, text: screenplayText }
  const assetPack = helpers.asRecord(config.sceneAssetPack ?? config.assetPack)
  const worldContext = helpers.asRecord(config.sceneContext ?? config.context)
  const guidance = helpers.asRecord(config.sceneGuidance)
  const outputs = {
    scenePackage: scenePackageOutput,
    scene_package: scenePackageOutput,
    screenplayDraft,
    screenplay_draft: screenplayDraft,
    screenplay: screenplayDraft,
    assetPack,
    asset_pack: assetPack,
    context: worldContext,
    guidance,
    sceneId: helpers.readText(config.sceneId),
    sceneIndex: Number(config.sceneIndex ?? 0) || 0,
    text: screenplayText,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-scene-input-v1' })
}

export async function sequenceAnimaticSceneRegister(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const scenePackageOutput = sequenceAnimaticScenePackageOutputSchema.parse(
    helpers.readFirstUpstreamRecord(context.upstream, ['scenePackage', 'scene_package']),
  )
  const scenePackages = scenePackageOutput.scenePackages.length > 0
    ? scenePackageOutput.scenePackages.map(helpers.asRecord)
    : helpers.readArray((scenePackageOutput as LooseRecord).screenplayScenes ?? (scenePackageOutput as LooseRecord).screenplay_scenes).map(helpers.asRecord)
  if (scenePackages.length === 0) throw new Error('Sequence animatic scene registration requires at least one screenplay scene.')
  const orderedScenes = [...scenePackages].sort((left, right) => (Number(left.index) || 9999) - (Number(right.index) || 9999))
  const registerConfig = helpers.asRecord(context.node.config)
  const scenes = orderedScenes.map((scene, index) => ({
    id: helpers.readText(scene.sceneId ?? scene.scene_id) || `scene_${String(index + 1).padStart(3, '0')}`,
    index: Number(scene.index) || index + 1,
    title: helpers.readText(scene.title) || `Scene ${index + 1}`,
    summary: helpers.compactSequenceAnimaticText(scene.sourceText ?? scene.source_text, 280),
    setId: helpers.readText(scene.setId ?? scene.set_id),
    zoneId: helpers.readText(scene.zoneId ?? scene.zone_id),
    worldLocationRefId: helpers.readText(scene.worldLocationRefId ?? scene.world_location_ref_id ?? scene.locationRefId ?? scene.location_ref_id),
    dialogueRowCount: helpers.readArray(scene.dialogueRows ?? scene.dialogue_rows).length,
    autoStart: index === 0 && registerConfig.autoStartFirstScene === true,
  }))
  const runMetadata = helpers.asRecord((context.run as { metadata?: unknown }).metadata)
  const outputRequestId = helpers.readText(runMetadata.outputRequestId) || helpers.readText(runMetadata.masterRequestId)
  if (outputRequestId) {
    await helpers.insertSequenceAnimaticEvent({
      client: context.client,
      projectId: context.run.projectId,
      draftId: context.run.draftId,
      requestId: outputRequestId,
      workflowId: context.workflow.id,
      runId: context.run.id,
      eventType: 'scenes_registered',
      payload: { sceneCount: scenes.length, scenes },
      metadata: { source: 'sequence_animatic_scene_register' },
      dedupe: { source: 'sequence_animatic_scene_register' },
    }).catch(() => null)
    for (const scene of scenes) {
      await helpers.insertSequenceAnimaticEvent({
        client: context.client,
        projectId: context.run.projectId,
        draftId: context.run.draftId,
        requestId: outputRequestId,
        workflowId: context.workflow.id,
        runId: context.run.id,
        eventType: 'scene_registered',
        payload: scene,
        metadata: { source: 'sequence_animatic_scene_register' },
        dedupe: { id: scene.id },
      }).catch(() => null)
    }
    const graphAdditions = helpers.readArray(scenePackageOutput.sceneGraphDraft?.additions).map(helpers.asRecord)
    const nodePayloadByKind = (addition: LooseRecord) => {
      const base = {
        id: helpers.readText(addition.id),
        name: helpers.readText(addition.name),
        visualBrief: helpers.readText(addition.visualBrief ?? addition.visual_brief),
        worldLocationRefId: helpers.readText(addition.worldLocationRefId ?? addition.world_location_ref_id),
      }
      const kind = helpers.readText(addition.kind)
      if (kind === 'set') return { ...base, nodeKind: 'set', worldLocationRefId: helpers.readText(addition.worldLocationRefId ?? addition.world_location_ref_id ?? addition.parentId ?? addition.parent_id) }
      if (kind === 'zone') return { ...base, nodeKind: 'zone', setId: helpers.readText(addition.setId ?? addition.set_id ?? addition.parentId ?? addition.parent_id) }
      if (kind === 'spot') return { ...base, nodeKind: 'spot', setId: helpers.readText(addition.setId ?? addition.set_id), zoneId: helpers.readText(addition.zoneId ?? addition.zone_id ?? addition.parentId ?? addition.parent_id) }
      return {
        ...base,
        nodeKind: 'angle',
        setId: helpers.readText(addition.setId ?? addition.set_id),
        zoneId: helpers.readText(addition.zoneId ?? addition.zone_id),
        spotIds: helpers.readText(addition.spotId ?? addition.spot_id) ? [helpers.readText(addition.spotId ?? addition.spot_id)] : [],
      }
    }
    for (const addition of graphAdditions) {
      const nodeId = helpers.readText(addition.id)
      if (!nodeId) continue
      await helpers.insertSequenceAnimaticEvent({
        client: context.client,
        projectId: context.run.projectId,
        draftId: context.run.draftId,
        requestId: outputRequestId,
        workflowId: context.workflow.id,
        runId: context.run.id,
        eventType: 'scene_graph_node_registered',
        payload: { nodeId, node: nodePayloadByKind(addition) },
        metadata: { source: 'sequence_animatic_scene_register' },
        dedupe: { nodeId },
      }).catch(() => null)
    }
  }
  const sceneIndex = {
    role: 'sequence_animatic_scene_index',
    graphSpecVersion: 'sequence_animatic_graph_v2',
    sequenceAnimaticRole: 'scene_index',
    screenplayAnimaticRole: 'scene_index',
    requestId: outputRequestId || null,
    workflowId: context.workflow.id,
    runId: context.run.id,
    sceneCount: scenes.length,
    scenes,
    scenePackageOutput,
  }
  const outputs = {
    scenes,
    sceneCount: scenes.length,
    scene_count: scenes.length,
    sceneIndex,
    sequence_animatic_scene_index: sceneIndex,
    scenePackage: scenePackageOutput,
    scene_package: scenePackageOutput,
    planningDefaults: {
      maxShotCount: Number(registerConfig.maxShotCount ?? 0) || 150,
      aspectRatio: helpers.readText(registerConfig.aspectRatio) || '16:9',
      resolution: helpers.readText(registerConfig.resolution) || '720p',
      autoStartFirstScene: registerConfig.autoStartFirstScene === true,
    },
    text: JSON.stringify({ sceneCount: scenes.length, scenes }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-scene-register-v1' })
}

const sequenceAnimaticSceneLifecycleHandlers = {
  sequence_animatic_scene_input: sequenceAnimaticSceneInput,
  sequence_animatic_scene_register: sequenceAnimaticSceneRegister,
}

const sequenceAnimaticSceneLifecycleWorkflowNodePackKey = 'sequence_animatic_scene_lifecycle'

export const sequenceAnimaticSceneLifecycleWorkflowNodePack = defineWorkflowNodePack<
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
  typeof sequenceAnimaticSceneLifecycleHandlers
>({
  packKey: sequenceAnimaticSceneLifecycleWorkflowNodePackKey,
  handlers: sequenceAnimaticSceneLifecycleHandlers,
})

export const sequenceAnimaticSceneLifecycleWorkflowNodeHandlerKeys = sequenceAnimaticSceneLifecycleWorkflowNodePack.handlerKeys

function createSequenceAnimaticSceneLifecycleNodeScaffold(input: {
  purpose: keyof typeof sequenceAnimaticSceneLifecycleHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Sequence animatic scene lifecycle workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: sequenceAnimaticSceneLifecycleWorkflowNodePackKey,
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

export const sequenceAnimaticSceneLifecycleWorkflowNodeScaffolds = [
  createSequenceAnimaticSceneLifecycleNodeScaffold({
    purpose: 'sequence_animatic_scene_input',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.scenePackage',
      'config.sceneScreenplayText',
      'config.screenplayText',
      'config.sceneAssetPack',
      'config.assetPack',
      'config.sceneContext',
      'config.context',
      'config.sceneGuidance',
      'config.sceneId',
      'config.sceneIndex',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticSceneLifecycleNodeScaffold({
    purpose: 'sequence_animatic_scene_register',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.scene_package',
      'config.masterRequestId',
      'config.autoStartFirstScene',
      'config.maxShotCount',
      'config.aspectRatio',
      'config.resolution',
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

export const sequenceAnimaticSceneLifecycleWorkflowNodeScaffoldHandlerKeys = sequenceAnimaticSceneLifecycleWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerSequenceAnimaticSceneLifecycleWorkflowNodePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>) => void
}) {
  sequenceAnimaticSceneLifecycleWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
