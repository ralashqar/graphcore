import { cinematicV2ShotPlanSchema, providerSafeCinematicV2DurationSeconds } from '../../../src/domain/cinematics.ts'
import type {
  LooseRecord,
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
  runSequenceAnimaticScenePackageAssignmentRuntime,
  runSequenceAnimaticSceneShotPlanRuntime,
} from './output-workflow-sequence-animatic-planning-runtime.ts'
import { sequenceAnimaticStableHash } from './sequence-animatic-workflow-factory.ts'

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

export async function sequenceAnimaticSceneInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const scenePackageOutput = helpers.parseSequenceAnimaticScenePackageOutput(helpers.asRecord(config.scenePackage))
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
  const scenePackageOutput = helpers.parseSequenceAnimaticScenePackageOutput(
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
  // Prefer the scene_input/master node's full scene-package output. Scene shot
  // plan nodes also emit scenePackage, but those are single tagged scenes.
  const scenePackageOutput = helpers.parseSequenceAnimaticScenePackageOutput(
    helpers.readPreferredUpstreamRecord(context.upstream, ['scene_input'], ['scenePackage', 'scene_package']),
  )
  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const scenePlanEntries = Object.entries(context.upstream)
    .map(([nodeKey, outputs]) => ({
      nodeKey,
      sourceSceneIndex: Number(outputs.sourceSceneIndex ?? outputs.source_scene_index ?? 0) || 0,
      sourceSceneId: helpers.readText(outputs.sceneId ?? outputs.scene_id),
      plan: helpers.asRecord(outputs.directorPlan ?? outputs.director_plan ?? outputs.shotContinuityPlan ?? outputs.shot_continuity_plan ?? outputs.sceneShotPlan ?? outputs.scene_shot_plan),
    }))
    .filter((entry) => Object.keys(entry.plan).length > 0 && helpers.readArray(entry.plan.shots).length > 0)
    .sort((left, right) => (left.sourceSceneIndex || 9999) - (right.sourceSceneIndex || 9999) || left.nodeKey.localeCompare(right.nodeKey))
  if (scenePlanEntries.length === 0) throw new Error('Scene shot plan merge requires completed scene shot plans.')

  const shots: LooseRecord[] = []
  const blocks: LooseRecord[] = []
  const shotIdMap = new Map<string, string>()
  const blockIdMap = new Map<string, string>()
  const scenePackageById = new Map(scenePackageOutput.scenePackages.map((scene) => [scene.sceneId, scene] as const))
  const preserveSceneScopedIds = helpers.asRecord(context.node.config).preserveSceneScopedIds === true
  let globalShotIndex = 1
  let globalBlockIndex = 1

  for (const entry of scenePlanEntries) {
    const sceneId = entry.sourceSceneId || helpers.readText(entry.plan.sourceSceneId) || `scene_${String(entry.sourceSceneIndex || globalBlockIndex).padStart(3, '0')}`
    const planBlocks = helpers.readArray(entry.plan.blocks).map(helpers.asRecord)
    const planShots = helpers.readArray(entry.plan.shots).map(helpers.asRecord)
    for (const block of planBlocks) {
      const oldBlockId = helpers.readText(block.id) || `${sceneId}_block_${String(globalBlockIndex).padStart(3, '0')}`
      const newBlockId = preserveSceneScopedIds ? oldBlockId : `block_${String(globalBlockIndex).padStart(3, '0')}`
      blockIdMap.set(`${sceneId}:${oldBlockId}`, newBlockId)
      globalBlockIndex += 1
    }
    for (const shot of planShots) {
      const oldShotId = helpers.readText(shot.id) || `${sceneId}_shot_${String(globalShotIndex).padStart(3, '0')}`
      const newShotId = preserveSceneScopedIds ? oldShotId : `shot_${String(globalShotIndex).padStart(3, '0')}`
      shotIdMap.set(`${sceneId}:${oldShotId}`, newShotId)
      globalShotIndex += 1
    }
  }

  globalShotIndex = 1
  globalBlockIndex = 1
  for (const entry of scenePlanEntries) {
    const sceneId = entry.sourceSceneId || helpers.readText(entry.plan.sourceSceneId) || `scene_${String(entry.sourceSceneIndex || globalBlockIndex).padStart(3, '0')}`
    const scenePackage = scenePackageById.get(sceneId) ?? scenePackageOutput.scenePackages.find((scene) => scene.index === entry.sourceSceneIndex) ?? null
    const planBlocks = helpers.readArray(entry.plan.blocks).map(helpers.asRecord)
    const planShots = helpers.readArray(entry.plan.shots).map(helpers.asRecord)
    for (const block of planBlocks) {
      const oldBlockId = helpers.readText(block.id) || `${sceneId}_block_${String(globalBlockIndex).padStart(3, '0')}`
      const newBlockId = blockIdMap.get(`${sceneId}:${oldBlockId}`) || `block_${String(globalBlockIndex).padStart(3, '0')}`
      const mappedShotIds = helpers.readStringArray(block.shotIds ?? block.shot_ids)
        .map((shotId) => shotIdMap.get(`${sceneId}:${shotId}`))
        .filter((shotId): shotId is string => Boolean(shotId))
      blocks.push({
        ...block,
        id: newBlockId,
        index: globalBlockIndex,
        title: helpers.readText(block.title) || `Scene ${entry.sourceSceneIndex || globalBlockIndex}`,
        summary: helpers.readText(block.summary) || helpers.readText(block.title),
        shotIds: mappedShotIds,
        sourceSceneId: sceneId,
      })
      globalBlockIndex += 1
    }
    for (const shot of planShots) {
      const oldShotId = helpers.readText(shot.id) || `${sceneId}_shot_${String(globalShotIndex).padStart(3, '0')}`
      const oldBlockId = helpers.readText(shot.blockId) || helpers.readText(shot.storyboardBlockId)
      const planShotBindings = helpers.asRecord(entry.plan.shotBindings ?? entry.plan.shot_bindings)
      const shotBinding = helpers.asRecord(planShotBindings[oldShotId])
      const rawSceneBinding = helpers.asRecord(shot.sceneBinding ?? shot.scene_binding)
      const sceneBinding = {
        ...rawSceneBinding,
        worldLocationRefId: helpers.readText(rawSceneBinding.worldLocationRefId ?? rawSceneBinding.world_location_ref_id)
          || helpers.readText(shot.worldLocationRefId ?? shot.world_location_ref_id ?? shot.locationRefId ?? shot.location_ref_id)
          || helpers.readText(shotBinding.worldLocationRefId ?? shotBinding.world_location_ref_id)
          || scenePackage?.worldLocationRefId
          || scenePackage?.locationRefId
          || '',
        setId: helpers.readText(rawSceneBinding.setId ?? rawSceneBinding.set_id)
          || helpers.readText(shot.continuitySetId ?? shot.continuity_set_id)
          || helpers.readText(shotBinding.setId ?? shotBinding.set_id)
          || scenePackage?.setId
          || '',
        zoneId: helpers.readText(rawSceneBinding.zoneId ?? rawSceneBinding.zone_id)
          || helpers.readText(shot.continuityZoneId ?? shot.continuity_zone_id)
          || helpers.readText(shotBinding.zoneId ?? shotBinding.zone_id)
          || scenePackage?.zoneId
          || '',
        primarySpotId: helpers.readText(rawSceneBinding.primarySpotId ?? rawSceneBinding.primary_spot_id)
          || helpers.readText(shot.primarySpotId ?? shot.primary_spot_id)
          || helpers.readText(shotBinding.primarySpotId ?? shotBinding.primary_spot_id)
          || scenePackage?.spotIds[0]
          || '',
        spotIds: helpers.sequenceAnimaticUniqueTexts([
          rawSceneBinding.spotIds,
          rawSceneBinding.spot_ids,
          shot.continuitySpotIds,
          shot.continuity_spot_ids,
          shotBinding.spotIds,
          shotBinding.spot_ids,
          scenePackage?.spotIds ?? [],
        ]),
        viewpointId: helpers.readText(rawSceneBinding.viewpointId ?? rawSceneBinding.viewpoint_id)
          || helpers.readText(shot.viewpointId ?? shot.viewpoint_id ?? shot.continuityAngleId ?? shot.continuity_angle_id)
          || helpers.readText(shotBinding.viewpointId ?? shotBinding.viewpoint_id ?? shotBinding.angleId ?? shotBinding.angle_id),
        localReferenceIds: helpers.sequenceAnimaticUniqueTexts([
          rawSceneBinding.localReferenceIds,
          rawSceneBinding.local_reference_ids,
          shot.localReferenceIds,
          shot.local_reference_ids,
          shotBinding.localReferenceIds,
          shotBinding.local_reference_ids,
        ]),
      }
      if (!sceneBinding.primarySpotId && sceneBinding.spotIds.length > 0) {
        sceneBinding.primarySpotId = sceneBinding.spotIds[0]
      }
      const newShotId = shotIdMap.get(`${sceneId}:${oldShotId}`) || `shot_${String(globalShotIndex).padStart(3, '0')}`
      const newBlockId = blockIdMap.get(`${sceneId}:${oldBlockId}`)
        || blocks.find((block) => helpers.readStringArray(block.shotIds).includes(newShotId))?.id
        || `block_${String(Math.max(1, globalBlockIndex - 1)).padStart(3, '0')}`
      const continuityLink = helpers.asRecord(shot.continuityLink ?? shot.continuity_link)
      const continuityLinkFromShotId = helpers.readText(continuityLink.fromShotId ?? continuityLink.from_shot_id)
      const remappedContinuityLink = Object.keys(continuityLink).length > 0
        ? {
          ...continuityLink,
          fromShotId: continuityLinkFromShotId
            ? shotIdMap.get(`${sceneId}:${continuityLinkFromShotId}`) || continuityLinkFromShotId
            : '',
          from_shot_id: continuityLinkFromShotId
            ? shotIdMap.get(`${sceneId}:${continuityLinkFromShotId}`) || continuityLinkFromShotId
            : '',
        }
        : continuityLink
      shots.push({
        ...shot,
        id: newShotId,
        index: globalShotIndex,
        blockId: newBlockId,
        storyboardBlockId: newBlockId,
        coverageSetupId: '',
        coverage_setup_id: '',
        continuityLink: remappedContinuityLink,
        continuity_link: remappedContinuityLink,
        sceneBinding,
        scene_binding: sceneBinding,
        sourceSceneId: sceneId,
        sourceSceneShotId: oldShotId,
      })
      globalShotIndex += 1
    }
  }

  const mergeSceneGraphArray = (field: string) => helpers.mergeById(scenePlanEntries.flatMap((entry) => helpers.readArray(helpers.asRecord(entry.plan.sceneGraphAdditions)[field]).map(helpers.asRecord)))
  const localReferences = helpers.mergeById(scenePlanEntries.flatMap((entry) => helpers.readArray(entry.plan.localReferences ?? entry.plan.outputLocalReferences).map(helpers.asRecord)))
  const coverageSetups: LooseRecord[] = []
  const mergedV2 = helpers.parseSequenceAnimaticShotContinuityPlanV2({
    role: 'sequence_animatic_director_plan',
    contractVersion: 'shot_continuity_plan_v2',
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'director_plan',
    sequenceAnimaticRole: 'director_plan',
    planningMode: 'single_director_pass',
    screenplaySummary: `Merged ${scenePlanEntries.length} scene-scoped shot plan${scenePlanEntries.length === 1 ? '' : 's'}.`,
    shots,
    blocks: blocks.filter((block) => helpers.readStringArray(block.shotIds).length > 0),
    sceneGraphAdditions: {
      sets: helpers.mergeById([
        ...scenePackageOutput.sceneGraphDraft.additions.filter((addition) => addition.kind === 'set').map((addition) => ({ id: addition.id, worldLocationRefId: addition.worldLocationRefId || addition.parentId || null, name: addition.name, visualBrief: addition.visualBrief })),
        ...mergeSceneGraphArray('sets'),
      ]),
      zones: helpers.mergeById([
        ...scenePackageOutput.sceneGraphDraft.additions.filter((addition) => addition.kind === 'zone').map((addition) => ({ id: addition.id, setId: addition.setId || addition.parentId, worldLocationRefId: addition.worldLocationRefId || null, name: addition.name, visualBrief: addition.visualBrief })),
        ...mergeSceneGraphArray('zones'),
      ]),
      spots: helpers.mergeById([
        ...scenePackageOutput.sceneGraphDraft.additions.filter((addition) => addition.kind === 'spot').map((addition) => ({ id: addition.id, setId: addition.setId, zoneId: addition.zoneId || addition.parentId, worldLocationRefId: addition.worldLocationRefId || null, name: addition.name, visualBrief: addition.visualBrief })),
        ...mergeSceneGraphArray('spots'),
      ]),
      viewpoints: helpers.mergeById([
        ...scenePackageOutput.sceneGraphDraft.additions.filter((addition) => addition.kind === 'viewpoint').map((addition) => ({ id: addition.id, setId: addition.setId, zoneId: addition.zoneId, spotIds: [addition.spotId].filter(Boolean), worldLocationRefId: addition.worldLocationRefId || null, name: addition.name, visualBrief: addition.visualBrief })),
        ...mergeSceneGraphArray('viewpoints'),
      ]),
      angles: mergeSceneGraphArray('angles'),
      edges: mergeSceneGraphArray('edges'),
    },
    coverageSetups,
    localReferences,
    notes: scenePlanEntries.flatMap((entry) => helpers.readStringArray(entry.plan.notes)),
  })
  const runMetadata = helpers.asRecord((context.run as { metadata?: unknown }).metadata)
  const manifest = {
    role: 'sequence_animatic_director_source',
    requestId: runMetadata.outputRequestId ?? runMetadata.masterRequestId ?? null,
    workflowId: context.workflow.id,
    runId: context.run.id,
    screenplayDraft,
    screenplayMarkdown: helpers.readText(screenplayDraft.screenplayMarkdown) || helpers.readText(screenplayDraft.markdown) || helpers.readText(screenplayDraft.text),
    scenePackageOutput,
    assetPack,
  }
  const animaticReferenceCatalog = helpers.sequenceAnimaticReferenceCatalog({
    animaticReferenceCatalog: helpers.readFirstUpstreamRecord(context.upstream, ['animaticReferenceCatalog', 'animatic_reference_catalog']),
    assetPack,
  })
  const continuityPlannerContext = helpers.buildSequenceAnimaticContinuityPlannerContext({
    screenplayDraft,
    shotPlan: {},
    shotBreakPlan: {},
    assetPack,
    animaticReferenceCatalog,
  })
  const directorPlan = helpers.normalizeSequenceAnimaticDirectorPlan({
    rawPlan: mergedV2,
    manifest,
    manifestHash: helpers.hashOutputWorkflowValue(manifest),
    masterManifestArtifactKey: `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.sequence-animatic-merged-shot-plan`,
    continuityPlannerContext,
  })
  const shotPlan = {
    sceneId: 'sequence_animatic_master',
    shots: directorPlan.shots,
    totalEditorialDurationSeconds: directorPlan.shots.reduce((total, shot) => total + (Number(helpers.asRecord(shot).editorialDurationSeconds) || 0), 0),
  }
  const outputs = {
    directorPlan,
    director_plan: directorPlan,
    shotContinuityPlan: directorPlan,
    shot_continuity_plan: directorPlan,
    shotPlan,
    shot_plan: shotPlan,
    blocks: directorPlan.blocks,
    continuityGraphV2: directorPlan.continuityGraphV2,
    continuity_graph_v2: directorPlan.continuityGraphV2,
    shotBindings: directorPlan.shotBindings,
    shot_bindings: directorPlan.shotBindings,
    scenePackage: scenePackageOutput,
    scene_package: scenePackageOutput,
    text: JSON.stringify(directorPlan, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-scene-plan-merge-v1' })
}

export async function sequenceAnimaticManifest(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const directorPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
  const workflowMetadata = helpers.asRecord(context.workflow.metadata)
  const runMetadata = helpers.asRecord((context.run as { metadata?: unknown }).metadata)
  const screenplayAnimaticSource = helpers.readText(workflowMetadata.screenplayAnimaticSource)
    || (helpers.readText(workflowMetadata.cinematicAnimaticMode) === 'prompt_cinematic_master' ? 'prompt_cinematic' : 'wiki_sequence_unit')

  if (Object.keys(directorPlan).length > 0) {
    const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
    const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
    const worldContext = helpers.readFirstUpstreamRecord(context.upstream, ['context'])
    if (!Object.keys(screenplayDraft).length) throw new Error('Sequence animatic manifest requires the authored screenplay.')
    if (!Object.keys(assetPack).length) throw new Error('Sequence animatic manifest requires the visual reference asset pack.')

    const selectedVisualReferenceKeys = helpers.cinematicAssetPackEntityKeys(assetPack)
    const animaticReferenceCatalog = helpers.buildSequenceAnimaticReferenceCatalog({ context: worldContext, assetPack })
    const rawShotPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan'])
    const directorShots = helpers.readArray(directorPlan.shots).map(helpers.asRecord)
    if (directorShots.length === 0) throw new Error('Sequence animatic manifest requires shot-continuity-owned shots.')
    const parsedShotPlan = helpers.safeParseSequenceAnimaticShotPlan(rawShotPlan)
    const shotPlan = parsedShotPlan.success
      ? parsedShotPlan.data
      : helpers.parseSequenceAnimaticShotPlan({
        sceneId: 'sequence_animatic_master',
        totalEditorialDurationSeconds: directorShots.reduce((total, shot) => total + (Number(shot.editorialDurationSeconds) || 0), 0),
        shots: directorShots,
        performanceArc: [],
        audioPlan: { ambience: '', music: '', sfx: [], dialogueTrackCount: 0, placeholderOnly: true },
        diagnostics: ['Built shot plan from authoritative shot continuity plan shots.'],
      })
    const shotById = new Map(shotPlan.shots.map((shot) => [helpers.readText(shot.id), shot] as const).filter(([shotId]) => shotId))
    const coverageSetups = helpers.readArray(directorPlan.coverageSetups ?? directorPlan.coverage_setups).map(helpers.asRecord)
    const coverageSetupById = new Map(coverageSetups.map((setup) => [helpers.readText(setup.id), setup] as const).filter(([id]) => id))
    let cursor = 0
    const blocks = helpers.readArray(directorPlan.blocks).map(helpers.asRecord).map((block, index) => {
      const blockId = helpers.readText(block.id) || `cinematic_v3_storyboard_group_${String(index + 1).padStart(3, '0')}`
      const shotIds = helpers.readStringArray(block.shotIds ?? block.shot_ids).filter((shotId) => shotById.has(shotId))
      const blockShots = shotIds.map((shotId) => shotById.get(shotId)).filter((shot): shot is LooseRecord => Boolean(shot))
      if (blockShots.length === 0) throw new Error(`Sequence animatic shot continuity block ${blockId} has no valid shots.`)
      const layout = helpers.buildCinematicV3StoryboardLayout(blockShots.length)
      const duration = blockShots.reduce((total, shot) => total + (Number(shot.editorialDurationSeconds) || 0), 0)
      const startSeconds = cursor
      const endSeconds = startSeconds + duration
      cursor = endSeconds
      const summary = helpers.readText(block.summary) || blockShots.map((shot) => helpers.readText(shot.title)).filter(Boolean).join(' / ')
      const blockCoverageSetupIds = [...new Set(blockShots.map((shot) => helpers.readText(shot.coverageSetupId ?? shot.coverage_setup_id)).filter(Boolean))]
      const blockCoverageSetups = blockCoverageSetupIds.map((setupId) => coverageSetupById.get(setupId)).filter((setup): setup is LooseRecord => Boolean(setup))
      const storyboardGroup = {
        id: blockId,
        index: Number(block.index ?? index + 1) || index + 1,
        shotIds,
        summary,
        rows: layout.rows,
        columns: layout.columns,
        panelCount: layout.panelCount,
        startSeconds,
        endSeconds,
        editorialDurationSeconds: duration,
        providerDurationSeconds: providerSafeCinematicV2DurationSeconds(duration),
        coverageSetupIds: blockCoverageSetupIds,
        coverageSetups: blockCoverageSetups,
        continuityNotes: [
          ...helpers.readStringArray(block.continuityNotes ?? block.continuity_notes),
          helpers.readText(block.summary),
          ...blockCoverageSetups.slice(0, 8).map((setup) => `Coverage ${helpers.readText(setup.id)}: ${helpers.readText(setup.title) || helpers.readText(setup.setupKind)}; ${helpers.readText(setup.screenDirection ?? setup.screen_direction)}; ${helpers.readText(setup.stagingBrief ?? setup.staging_brief)}`),
        ].filter(Boolean),
      }
      return {
        ...block,
        id: blockId,
        index: Number(block.index ?? index + 1) || index + 1,
        title: helpers.readText(block.title) || summary || `Storyboard block ${index + 1}`,
        summary,
        sourceText: helpers.readText(block.sourceText ?? block.source_text),
        shotIds,
        shots: blockShots,
        coverageSetupIds: blockCoverageSetupIds,
        coverageSetups: blockCoverageSetups,
        continuityAnchorIds: [...new Set(blockShots.flatMap((shot) => helpers.readStringArray(shot.continuityAnchorIds)))],
        storyboardGroup,
        storyboardLayout: { rows: layout.rows, columns: layout.columns, panelCount: layout.panelCount },
        durationSeconds: duration,
        startSeconds,
        endSeconds,
        childRequestId: null,
        childWorkflowId: null,
      }
    })
    if (blocks.length === 0) throw new Error('Sequence animatic manifest requires shot-continuity-owned storyboard blocks.')

    const roughShotBreakPlan = helpers.readFirstUpstreamRecord(context.upstream, ['roughShotBreakPlan', 'rough_shot_break_plan', 'shotBreakPlan', 'shot_break_plan'])
    const directorPlanHash = helpers.readText(directorPlan.shotPlanHash) || sequenceAnimaticStableHash(directorPlan)
    const continuityGraphV2 = helpers.asRecord(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2)
    const shotBindings = helpers.asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings)
    const manifest = {
      role: 'sequence_animatic_manifest',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      screenplayAnimaticRole: 'master',
      screenplayAnimaticSource,
      sequenceAnimaticRole: 'master',
      requestId: runMetadata.outputRequestId ?? null,
      workflowId: context.workflow.id,
      runId: context.run.id,
      screenplayDraft,
      screenplayMarkdown: helpers.readText(screenplayDraft.screenplayMarkdown) || helpers.readText(screenplayDraft.markdown) || helpers.readText(screenplayDraft.text),
      shotBreakPlan: roughShotBreakPlan,
      roughShotBreakPlan,
      shotPlan,
      blocks,
      assetPack,
      selectedReferences: assetPack,
      selectedVisualReferenceKeys,
      animaticReferenceCatalog,
      directorPlan,
      directorPlanHash,
      shotContinuityPlan: directorPlan,
      shotContinuityPlanHash: directorPlanHash,
      continuityGraphV2,
      shotBindings,
      diagnostics: [
        ...helpers.readStringArray(directorPlan.diagnostics),
        `Built final sequence animatic manifest from shot continuity plan with ${blocks.length} storyboard block${blocks.length === 1 ? '' : 's'} and ${shotPlan.shots.length} shot${shotPlan.shots.length === 1 ? '' : 's'}.`,
      ],
    }
    const outputs = {
      manifest,
      sequenceAnimaticManifest: manifest,
      sequence_animatic_manifest: manifest,
      screenplayDraft,
      screenplay_draft: screenplayDraft,
      shotBreakPlan: roughShotBreakPlan,
      shot_break_plan: roughShotBreakPlan,
      shotPlan,
      shot_plan: shotPlan,
      blocks,
      assetPack,
      asset_pack: assetPack,
      selectedVisualReferenceKeys,
      selected_visual_reference_keys: selectedVisualReferenceKeys,
      animaticReferenceCatalog,
      animatic_reference_catalog: animaticReferenceCatalog,
      directorPlan,
      director_plan: directorPlan,
      shotContinuityPlan: directorPlan,
      shot_continuity_plan: directorPlan,
      continuityGraphV2,
      continuity_graph_v2: continuityGraphV2,
      shotBindings,
      shot_bindings: shotBindings,
      text: JSON.stringify(manifest, null, 2),
      deterministic: true,
    }
    return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-director-manifest-v1' })
  }

  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft'])
  const shotBreakPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotBreakPlan', 'shot_break_plan'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const worldContext = helpers.readFirstUpstreamRecord(context.upstream, ['context'])
  const animaticReferenceCatalog = helpers.buildSequenceAnimaticReferenceCatalog({ context: worldContext, assetPack })
  const selectedVisualReferenceKeys = helpers.cinematicAssetPackEntityKeys(assetPack)
  const continuityAnchorPlan = helpers.readFirstUpstreamRecord(context.upstream, ['continuityAnchorPlan', 'continuity_anchor_plan'])
  const readAnchorArray = (fields: string[]) => {
    const arrays = Object.values(context.upstream).flatMap((outputs) => fields.flatMap((field) => {
      const value = outputs[field]
      return Array.isArray(value) ? value.map(helpers.asRecord) : []
    }))
    const withAssets = arrays.filter((anchor) => helpers.readText(anchor.assetKey))
    return (withAssets.length > 0 ? withAssets : arrays)
      .filter((anchor, index, values) => helpers.readText(anchor.id) && values.findIndex((candidate) => helpers.readText(candidate.id) === helpers.readText(anchor.id)) === index)
  }
  const characterAnchors = readAnchorArray(['characterAnchors', 'character_anchors']).filter((anchor) => helpers.readText(anchor.anchorType) === 'character')
  const propAnchors = readAnchorArray(['propAnchors', 'prop_anchors']).filter((anchor) => helpers.readText(anchor.anchorType) !== 'location_spot' && helpers.readText(anchor.anchorType) !== 'character')
  const locationSpotAnchors = readAnchorArray(['locationSpotAnchors', 'location_spot_anchors']).filter((anchor) => helpers.readText(anchor.anchorType) === 'location_spot' || helpers.readText(anchor.baseLocationRefId))
  const anchorAssets = [...characterAnchors, ...propAnchors, ...locationSpotAnchors].map(helpers.asRecord).filter((anchor) => helpers.readText(anchor.id))
  const continuityAnchorIdsByShotId = helpers.asRecord(continuityAnchorPlan.continuityAnchorIdsByShotId ?? continuityAnchorPlan.shotContinuityAnchorIds)
  const groupPlans = helpers.collectCinematicV3ShotPlansFromUpstream(context.upstream)
  const rawMergedShotPlan = groupPlans.length > 0
    ? helpers.mergeCinematicV3ShotPlansForTimeline(groupPlans)
    : helpers.buildSequenceAnimaticShotPlanFromBreaks({ shotBreakPlan, assetPack, context: worldContext })
  const baseMergedShotPlan = helpers.repairCinematicV2ShotPlanVisualReferences({
    shotPlan: rawMergedShotPlan,
    assetPack,
  })
  const mergedShots: LooseRecord[] = baseMergedShotPlan.shots.map((shot) => {
    const anchorIds = helpers.readStringArray(continuityAnchorIdsByShotId[helpers.readText(shot.id)])
    return {
      ...shot,
      continuityAnchorIds: anchorIds,
      continuityAnchorRefIds: anchorIds,
    }
  })
  const mergedShotPlan = {
    ...baseMergedShotPlan,
    shots: mergedShots,
  }
  const breakGroups = Array.isArray(shotBreakPlan.groups) ? shotBreakPlan.groups.map(helpers.asRecord) : []
  const blocks = breakGroups.map((group, index) => {
    const storyboardGroup = helpers.buildCinematicV3StoryboardGroupFromShotBreakGroup(group, index)
    const shotIds = helpers.readStringArray(group.shotBreakIds)
    const shots = mergedShotPlan.shots.filter((shot) => shotIds.includes(helpers.readText(shot.id)))
    const storyboardShotIds = helpers.readStringArray(storyboardGroup.shotIds)
    const resolvedShots = shots.length > 0
      ? shots
      : mergedShotPlan.shots.filter((shot) => storyboardShotIds.includes(helpers.readText(shot.id)))
    const blockAnchorIds = [...new Set(resolvedShots.flatMap((shot) => helpers.readStringArray(shot.continuityAnchorIds)))]
    return {
      id: storyboardGroup.id,
      index: storyboardGroup.index,
      title: helpers.readText(group.title) || helpers.readText(group.summary) || helpers.readText(storyboardGroup.summary) || `Storyboard block ${helpers.readText(storyboardGroup.index) || index + 1}`,
      summary: storyboardGroup.summary,
      sourceText: helpers.readText(group.sourceText),
      shotIds: (resolvedShots.length > 0 ? resolvedShots.map((shot) => helpers.readText(shot.id)).filter(Boolean) : storyboardShotIds),
      shots: resolvedShots,
      continuityAnchorIds: blockAnchorIds,
      storyboardGroup,
      storyboardLayout: { rows: storyboardGroup.rows, columns: storyboardGroup.columns, panelCount: storyboardGroup.panelCount },
      durationSeconds: storyboardGroup.editorialDurationSeconds,
      startSeconds: storyboardGroup.startSeconds,
      endSeconds: storyboardGroup.endSeconds,
      childRequestId: null,
      childWorkflowId: null,
    }
  })
  const manifest = {
    role: 'sequence_animatic_manifest',
    graphSpecVersion: 'sequence_animatic_graph_v1',
    screenplayAnimaticRole: 'master',
    screenplayAnimaticSource,
    sequenceAnimaticRole: 'master',
    requestId: runMetadata.outputRequestId ?? null,
    workflowId: context.workflow.id,
    runId: context.run.id,
    screenplayDraft,
    screenplayMarkdown: helpers.readText(screenplayDraft.screenplayMarkdown) || helpers.readText(screenplayDraft.markdown) || helpers.readText(screenplayDraft.text),
    shotBreakPlan,
    shotPlan: mergedShotPlan,
    blocks,
    assetPack,
    selectedReferences: assetPack,
    selectedVisualReferenceKeys,
    animaticReferenceCatalog,
    continuityAnchorPlan,
    characterAnchors,
    propAnchors,
    locationSpotAnchors,
    anchorAssets,
    diagnostics: [
      ...helpers.readStringArray(shotBreakPlan.diagnostics),
      ...helpers.readStringArray(continuityAnchorPlan.diagnostics),
      ...(groupPlans.length === 0 ? ['Skipped parse-group LLM shot planning for sequence animatic master; shot continuity plan will assign shot references and scene graph continuity in one coherent pass.'] : []),
      `Built sequence animatic manifest with ${blocks.length} storyboard block${blocks.length === 1 ? '' : 's'} and ${mergedShotPlan.shots.length} shot${mergedShotPlan.shots.length === 1 ? '' : 's'}.`,
    ],
  }
  const outputs = {
    manifest,
    sequenceAnimaticManifest: manifest,
    sequence_animatic_manifest: manifest,
    screenplayDraft,
    screenplay_draft: screenplayDraft,
    shotBreakPlan,
    shot_break_plan: shotBreakPlan,
    shotPlan: mergedShotPlan,
    shot_plan: mergedShotPlan,
    blocks,
    assetPack,
    asset_pack: assetPack,
    selectedVisualReferenceKeys,
    selected_visual_reference_keys: selectedVisualReferenceKeys,
    animaticReferenceCatalog,
    animatic_reference_catalog: animaticReferenceCatalog,
    continuityAnchorPlan,
    continuity_anchor_plan: continuityAnchorPlan,
    characterAnchors,
    character_anchors: characterAnchors,
    propAnchors,
    prop_anchors: propAnchors,
    locationSpotAnchors,
    location_spot_anchors: locationSpotAnchors,
    anchorAssets,
    anchor_assets: anchorAssets,
    text: JSON.stringify(manifest, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-manifest-v1' })
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
