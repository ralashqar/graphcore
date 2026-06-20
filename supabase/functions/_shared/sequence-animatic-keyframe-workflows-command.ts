import { HttpError } from './http.ts'
import {
  appendEnsuredChildWorkflow,
  createChildWorkflowEnsureAccumulator,
  ensureMappedChildWorkflow,
  loadChildWorkflowGraphBundle,
} from './output-workflow-child-utils.ts'
import {
  mapOutputRequestRow,
  outputArtifactSelect,
  outputRequestSelect,
  outputWorkflowRunStepSelect,
  resolveSequenceAnimaticCombinedManifest,
} from './output-workflow.ts'
import {
  asRecord,
  artifactMetadataRecord,
  assetEntityForKey,
  buildValidatedSequenceAnimaticTemplateGraph,
  coverageSetupEntityRefIds,
  imageFromArtifact,
  loadScreenplayAnimaticMasterRequest,
  prioritizedEntityAssetKeys,
  readArray,
  readScreenplayAnimaticSource,
  readStringArray,
  readText,
  shotEntityRefIds,
  slugify,
  uniqueTexts,
} from './sequence-animatic-command-utils.ts'
import {
  applyCoverageResolutionToRegistry,
  coverageRegistryFromSources,
  graphNodeMapForShot,
  incidentalCharacterNodesForShot,
  resolveCoverageSetupForShot,
  scopedCoverageShotsForShot,
  shotSpatialFingerprint,
} from './sequence-animatic-coverage-utils.ts'
import {
  sequenceAnimaticKeyframeWorkflowEnsureRequestSchema,
  sequenceAnimaticKeyframeWorkflowEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import { lintSequenceAnimaticContinuity } from '../../../src/domain/sequenceAnimaticContinuityLint.ts'
import {
  continuityBatchKindForNodes,
  continuityBatchLayoutForTargetCount,
  continuityNodeCollections,
  continuityNodeParentId,
  continuityNodeUsesParent,
  continuityVisualDependencyEdges,
  coverageSetupNodeIds,
  dependencyNodeIdsForKeyframePlan,
  shotReferenceNodeIds,
  shotSceneBindingNodeIds,
} from '../../../src/domain/sequenceAnimaticContinuityDependencies.ts'
import { deriveSequenceAnimaticSceneStates } from '../../../src/domain/sequenceAnimaticSceneState.ts'
import { buildSequenceAnimaticStreamedShotReadyContext } from '../../../src/domain/sequenceAnimaticStreamedShotReady.ts'
import {
  buildSequenceAnimaticVisualReferencePlan,
  sequenceAnimaticContinuityLinkRequiresPrevious,
  sequenceAnimaticVisualReferenceHash,
} from '../../../src/domain/sequenceAnimaticVisualReferencePlan.ts'
import {
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from './sequence-animatic-workflow-factory.ts'
import {
  sequenceAnimaticCommandWorkflowTemplateRegistry,
  sequenceAnimaticContinuityAssetTemplateKey,
  sequenceAnimaticContinuityBatchTemplateKey,
  sequenceAnimaticShotProductionTemplateKey,
} from './sequence-animatic-template-registry.ts'
import {
  sequenceAnimaticCoverageAnchorTemplateKey,
  sequenceAnimaticWorkflowTemplateRegistry,
} from './sequence-animatic-scene-board-workflows.ts'
import {
  loadSceneContinuityManifests,
  resolveSceneContinuityForShot,
  sceneContinuityBlockingReason,
} from './scene-continuity-manifest-utils.ts'
import {
  buildShotReferenceReadinessHash,
  type SceneContinuityBlockerReason,
} from '../../../src/domain/sceneContinuityManifest.ts'

async function insertSequenceAnimaticEvent(input: {
  admin: {
    from: (table: string) => any
  }
  projectId: string
  draftId: string
  requestId: string
  workflowId?: string | null
  eventType: string
  payload?: Record<string, unknown>
  dedupeKey?: string
  dedupeValue?: string
}) {
  if (!input.requestId || !input.eventType) return
  if (input.dedupeKey && input.dedupeValue) {
    const deleteResponse = await input.admin
      .from('output_request_events')
      .delete()
      .eq('request_id', input.requestId)
      .eq('event_type', input.eventType)
      .eq(`payload->>${input.dedupeKey}`, input.dedupeValue)
    if (deleteResponse.error) throw new Error(deleteResponse.error.message)
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latestResponse = await input.admin
      .from('output_request_events')
      .select('sequence')
      .eq('request_id', input.requestId)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestResponse.error) throw new Error(latestResponse.error.message)
    const sequence = (Number(asRecord(latestResponse.data).sequence ?? 0) || 0) + 1
    const insertResponse = await input.admin
      .from('output_request_events')
      .insert({
        project_id: input.projectId,
        draft_id: input.draftId,
        request_id: input.requestId,
        workflow_id: input.workflowId ?? null,
        run_id: null,
        sequence,
        event_type: input.eventType,
        payload: input.payload ?? {},
        metadata: { source: 'ensure_sequence_animatic_keyframe_workflows' },
      })
    if (!insertResponse.error) return
    if (!String(insertResponse.error.message ?? '').includes('output_request_events_request_id_sequence_key') && !String(insertResponse.error.message ?? '').includes('duplicate key')) {
      throw new Error(insertResponse.error.message)
    }
  }
}

function deriveKeyframePlan(input: {
  manifest: Record<string, unknown>
  directorPlan: Record<string, unknown>
  requestedShotIds: string[]
  requestedCoverageSetupIds: string[]
}) {
  const blocks = readArray(input.manifest.blocks).map(asRecord).filter((block) => readText(block.id))
  const blockById = new Map(blocks.map((block) => [readText(block.id), block] as const))
  const shots = blocks.flatMap((block) => readArray(block.shots).map(asRecord).map((shot) => ({
    ...shot,
    blockId: readText(shot.blockId) || readText(shot.storyboardBlockId) || readText(block.id),
    storyboardBlockId: readText(shot.storyboardBlockId) || readText(shot.blockId) || readText(block.id),
  }))).filter((shot) => readText(shot.id))
  const directorShotsById = new Map(readArray(input.directorPlan.shots).map(asRecord).map((shot) => [readText(shot.id), shot] as const).filter(([id]) => id))
  const mergedShots = shots.map((shot) => ({
    ...shot,
    ...asRecord(directorShotsById.get(readText(shot.id))),
    id: readText(shot.id),
    blockId: readText(shot.blockId) || readText(shot.storyboardBlockId),
    storyboardBlockId: readText(shot.storyboardBlockId) || readText(shot.blockId),
  }))
  const shotIndexById = new Map(mergedShots.map((shot, index) => [readText(shot.id), index] as const).filter(([id]) => id))
  const requestedShotSet = new Set(input.requestedShotIds)
  const includedShotIds = new Set(requestedShotSet.size > 0 ? input.requestedShotIds : mergedShots.map((shot) => readText(shot.id)).filter(Boolean))
  const coverageSetups = readArray(input.directorPlan.coverageSetups ?? input.directorPlan.coverage_setups)
    .map(asRecord)
    .filter((setup) => readText(setup.id))
  const setupById = new Map(coverageSetups.map((setup) => [readText(setup.id), setup] as const))
  const shotsBySetupId = new Map<string, Record<string, unknown>[]>()
  for (const shot of mergedShots) {
    const setupId = readText(shot.coverageSetupId ?? shot.coverage_setup_id)
    if (!setupId) continue
    const list = shotsBySetupId.get(setupId) ?? []
    list.push(shot)
    shotsBySetupId.set(setupId, list)
  }
  const requestedSetupSet = new Set(input.requestedCoverageSetupIds)
  const coverageAnchorJobs = [...shotsBySetupId.entries()]
    .filter(([setupId, setupShots]) => {
      if (requestedSetupSet.size > 0) return requestedSetupSet.has(setupId)
      return setupShots.length > 0
    })
    .map(([setupId, setupShots]) => {
      const setup = setupById.get(setupId) ?? { id: setupId, title: setupId }
      return {
        id: `coverage_anchor_${setupId}`,
        coverageSetupId: setupId,
        coverageSetup: setup,
        shotIds: setupShots.map((shot) => readText(shot.id)).filter(Boolean),
        storyboardBlockIds: [...new Set(setupShots.map((shot) => readText(shot.storyboardBlockId ?? shot.blockId)).filter(Boolean))],
      }
    })
  const dependencySceneStates = deriveSequenceAnimaticSceneStates({ shots: mergedShots, coverageSetups })
  for (const shotId of [...includedShotIds]) {
    let currentId = shotId
    const seen = new Set<string>()
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId)
      const currentIndex = shotIndexById.get(currentId)
      if (currentIndex === undefined || currentIndex <= 0) break
      const currentShot = mergedShots[currentIndex]
      if (!sequenceAnimaticContinuityLinkRequiresPrevious(currentShot)) break
      const previousShotId = readText(asRecord(dependencySceneStates.get(currentId)).previousSameSetupShotId)
      if (!previousShotId) break
      includedShotIds.add(previousShotId)
      currentId = previousShotId
    }
  }
  const filteredShots = mergedShots.filter((shot) => includedShotIds.has(readText(shot.id)))
  // Scene-state conditioning: explicit per-shot continuity state (location,
  // inherited lighting, present characters, established props, screen
  // direction) derived once for the whole plan and embedded in each keyframe
  // job so prompts no longer depend solely on previous-keyframe pixels.
  const sceneStates = deriveSequenceAnimaticSceneStates({ shots: mergedShots, coverageSetups })
  // Continuity lint: text-only film-grammar validation (180° line, eyelines,
  // reverse pairs, speaker coverage, establishing coverage) before any image
  // generation is paid for.
  const continuityLint = lintSequenceAnimaticContinuity({ shots: mergedShots, coverageSetups })
  const shotKeyframeJobs = filteredShots.map((shot) => {
    const setupId = readText(shot.coverageSetupId ?? shot.coverage_setup_id)
    const sceneState = sceneStates.get(readText(shot.id)) ?? null
    return {
      id: `shot_keyframe_${readText(shot.id)}`,
      shotId: readText(shot.id),
      shot,
      storyboardBlockId: readText(shot.storyboardBlockId ?? shot.blockId),
      coverageSetupId: setupId,
      requiresCoverageAnchor: Boolean(setupId && coverageAnchorJobs.some((job) => job.coverageSetupId === setupId)),
      previousShotId: sequenceAnimaticContinuityLinkRequiresPrevious(shot) ? readText(asRecord(sceneState).previousSameSetupShotId) : '',
      dependencyOnly: requestedShotSet.size > 0 && !requestedShotSet.has(readText(shot.id)),
      sceneState,
    }
  })
  return {
    version: 'sequence_animatic_keyframe_plan_v1',
    continuityLint,
    coverageAnchorJobs,
    shotKeyframeJobs,
    coverageAnchorCount: coverageAnchorJobs.length,
    shotKeyframeCount: shotKeyframeJobs.length,
    blockCount: blocks.length,
    shotCount: mergedShots.length,
    blockById: Object.fromEntries(blocks.map((block) => [readText(block.id), block]).filter(([id]) => id)),
  }
}

function stepOutputRecord(
  steps: readonly Record<string, unknown>[],
  nodeKeys: readonly string[],
  fields: readonly string[],
) {
  for (const nodeKey of nodeKeys) {
    const step = [...steps].reverse().find((entry) => readText(entry.node_key ?? entry.nodeKey) === nodeKey && readText(entry.status) === 'completed')
    const outputs = asRecord(step?.outputs)
    for (const field of fields) {
      const record = asRecord(outputs[field])
      if (Object.keys(record).length > 0) return record
    }
  }
  return {}
}

function scenePackageForShot(shot: Record<string, unknown>, scenePackages: readonly Record<string, unknown>[]) {
  const sourceSceneId = readText(shot.sourceSceneId ?? shot.source_scene_id ?? shot.sceneId ?? shot.scene_id)
  if (sourceSceneId) {
    const exact = scenePackages.find((scene) => readText(scene.sceneId ?? scene.scene_id) === sourceSceneId)
    if (exact) return exact
  }
  const blockId = readText(shot.blockId ?? shot.block_id ?? shot.storyboardBlockId ?? shot.storyboard_block_id)
  if (blockId) {
    const byBlock = scenePackages.find((scene) => readStringArray(scene.graphAdditionIds ?? scene.graph_addition_ids).includes(blockId))
    if (byBlock) return byBlock
  }
  return scenePackages[0] ?? {}
}

function repairedShotSceneBinding(input: {
  shot: Record<string, unknown>
  scenePackage: Record<string, unknown>
}) {
  const shot = input.shot
  const scenePackage = input.scenePackage
  const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
  const spotIds = [
    ...readStringArray(binding.spotIds ?? binding.spot_ids),
    ...readStringArray(shot.continuitySpotIds ?? shot.continuity_spot_ids),
    ...readStringArray(scenePackage.spotIds ?? scenePackage.spot_ids),
  ].filter((value, index, values) => value && values.indexOf(value) === index)
  const primarySpotId = readText(binding.primarySpotId ?? binding.primary_spot_id)
    || readText(shot.primarySpotId ?? shot.primary_spot_id)
    || spotIds[0]
    || ''
  return {
    ...binding,
    worldLocationRefId: readText(binding.worldLocationRefId ?? binding.world_location_ref_id)
      || readText(shot.worldLocationRefId ?? shot.world_location_ref_id ?? shot.locationRefId ?? shot.location_ref_id)
      || readText(scenePackage.worldLocationRefId ?? scenePackage.world_location_ref_id ?? scenePackage.locationRefId ?? scenePackage.location_ref_id),
    setId: readText(binding.setId ?? binding.set_id)
      || readText(shot.continuitySetId ?? shot.continuity_set_id)
      || readText(scenePackage.setId ?? scenePackage.set_id),
    zoneId: readText(binding.zoneId ?? binding.zone_id)
      || readText(shot.continuityZoneId ?? shot.continuity_zone_id)
      || readText(scenePackage.zoneId ?? scenePackage.zone_id),
    primarySpotId,
    spotIds,
    viewpointId: readText(binding.viewpointId ?? binding.viewpoint_id)
      || readText(shot.viewpointId ?? shot.viewpoint_id ?? shot.continuityAngleId ?? shot.continuity_angle_id),
    localReferenceIds: readStringArray(binding.localReferenceIds ?? binding.local_reference_ids),
  }
}

function shotBindingFromShot(shot: Record<string, unknown>, blockId: string) {
  const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
  const worldLocationRefId = readText(binding.worldLocationRefId ?? binding.world_location_ref_id) || null
  const setId = readText(binding.setId ?? binding.set_id)
  const zoneId = readText(binding.zoneId ?? binding.zone_id)
  const primarySpotId = readText(binding.primarySpotId ?? binding.primary_spot_id)
  const spotIds = readStringArray(binding.spotIds ?? binding.spot_ids)
  const viewpointId = readText(binding.viewpointId ?? binding.viewpoint_id)
  const localReferenceIds = readStringArray(binding.localReferenceIds ?? binding.local_reference_ids)
  return {
    shotId: readText(shot.id),
    storyboardBlockId: blockId,
    worldLocationRefId,
    setId,
    zoneId,
    primarySpotId,
    spotIds,
    viewpointId,
    angleId: viewpointId,
    characterAnchorIds: [],
    propAnchorIds: [],
    assetAnchorIds: localReferenceIds,
    spatialNodeIds: [...new Set([setId, zoneId, primarySpotId, ...spotIds, viewpointId].filter(Boolean))],
    continuityAnchorIds: localReferenceIds,
  }
}

function graphNodesFromScenePackage(scenePackage: Record<string, unknown>) {
  const additions = readArray(asRecord(scenePackage.sceneGraphDraft ?? scenePackage.scene_graph_draft).additions).map(asRecord)
  return {
    locationSets: additions
      .filter((entry) => readText(entry.kind) === 'set')
      .map((entry) => ({ ...entry, id: readText(entry.id), worldLocationRefId: readText(entry.worldLocationRefId ?? entry.world_location_ref_id ?? entry.parentId ?? entry.parent_id), nodeKind: 'location_set' })),
    zones: additions
      .filter((entry) => readText(entry.kind) === 'zone')
      .map((entry) => ({ ...entry, id: readText(entry.id), setId: readText(entry.setId ?? entry.set_id ?? entry.parentId ?? entry.parent_id), worldLocationRefId: readText(entry.worldLocationRefId ?? entry.world_location_ref_id), nodeKind: 'location_zone' })),
    spots: additions
      .filter((entry) => readText(entry.kind) === 'spot')
      .map((entry) => ({ ...entry, id: readText(entry.id), setId: readText(entry.setId ?? entry.set_id), zoneId: readText(entry.zoneId ?? entry.zone_id ?? entry.parentId ?? entry.parent_id), worldLocationRefId: readText(entry.worldLocationRefId ?? entry.world_location_ref_id), nodeKind: 'location_spot' })),
    viewpoints: additions
      .filter((entry) => readText(entry.kind) === 'viewpoint')
      .map((entry) => ({ ...entry, id: readText(entry.id), setId: readText(entry.setId ?? entry.set_id), zoneId: readText(entry.zoneId ?? entry.zone_id), spotIds: [readText(entry.spotId ?? entry.spot_id)].filter(Boolean), worldLocationRefId: readText(entry.worldLocationRefId ?? entry.world_location_ref_id), nodeKind: 'location_viewpoint' })),
  }
}

function mergeById(records: readonly Record<string, unknown>[]) {
  const byId = new Map<string, Record<string, unknown>>()
  for (const record of records) {
    const id = readText(record.id)
    if (!id) continue
    byId.set(id, { ...byId.get(id), ...record, id })
  }
  return [...byId.values()]
}

function buildProvisionalKeyframeContext(input: {
  masterRequest: ReturnType<typeof mapOutputRequestRow>
  events: readonly Record<string, unknown>[]
  steps: readonly Record<string, unknown>[]
  requestedShotIds: readonly string[]
}) {
  if (input.requestedShotIds.length === 0) {
    throw new HttpError(409, 'Choose a streamed shot before generating an early keyframe.')
  }
  const scenePackage = stepOutputRecord(input.steps, ['sequence_animatic_scene_graph_assignment', 'sequence_animatic_scene_package'], ['scenePackage', 'scene_package'])
  const assetPack = stepOutputRecord(input.steps, ['cinematic_v3_reference_select', 'cinematic_v2_reference_select'], ['assetPack', 'asset_pack'])
  if (Object.keys(assetPack).length === 0) throw new HttpError(409, 'Reference selection is not ready yet.')
  const scenePackages = readArray(scenePackage.scenePackages ?? scenePackage.scene_packages).map(asRecord)
  const shotsById = new Map<string, Record<string, unknown>>()
  const blocksById = new Map<string, Record<string, unknown>>()
  const coverageSetups: Record<string, unknown>[] = []
  const localReferences: Record<string, unknown>[] = []
  const streamedSets: Record<string, unknown>[] = []
  const streamedZones: Record<string, unknown>[] = []
  const streamedSpots: Record<string, unknown>[] = []
  const streamedViewpoints: Record<string, unknown>[] = []

  for (const event of input.events) {
    const eventType = readText(event.event_type ?? event.eventType)
    const payload = asRecord(event.payload)
    if (eventType === 'block_planned') {
      const block = asRecord(payload.block)
      const blockId = readText(block.id) || readText(payload.blockId)
      if (blockId) {
        blocksById.set(blockId, {
          ...block,
          id: blockId,
          index: Number(block.index ?? payload.index ?? 0) || blocksById.size + 1,
          title: readText(block.title) || readText(payload.title) || `Block ${blocksById.size + 1}`,
          summary: readText(block.summary) || readText(payload.summary),
          shotIds: readStringArray(block.shotIds ?? block.shot_ids ?? payload.shotIds),
          status: 'planned',
          provisional: true,
        })
      }
    }
    if (eventType === 'shot_streamed') {
      const rawShot = asRecord(payload.shot)
      const shotId = readText(rawShot.id) || readText(payload.shotId)
      if (!shotId) continue
      const blockId = readText(rawShot.blockId ?? rawShot.block_id) || readText(payload.blockId) || readText(payload.storyboardBlockId) || 'block_001'
      const scenePackageForThisShot = scenePackageForShot(rawShot, scenePackages)
      const sceneBinding = repairedShotSceneBinding({ shot: rawShot, scenePackage: scenePackageForThisShot })
      shotsById.set(shotId, {
        ...rawShot,
        id: shotId,
        index: Number(rawShot.index ?? payload.index ?? 0) || shotsById.size + 1,
        blockId,
        storyboardBlockId: readText(rawShot.storyboardBlockId ?? rawShot.storyboard_block_id) || blockId,
        sceneBinding,
        scene_binding: sceneBinding,
        title: readText(rawShot.title) || readText(payload.title) || `Shot ${shotsById.size + 1}`,
        provisional: true,
      })
    }
    if (eventType === 'coverage_setup_registered') {
      const setup = asRecord(payload.coverageSetup)
      const setupId = readText(setup.id) || readText(payload.setupId)
      if (setupId) coverageSetups.push({ ...setup, id: setupId, provisional: true })
    }
    if (eventType === 'local_reference_registered') {
      const localReference = asRecord(payload.localReference)
      const id = readText(localReference.id) || readText(payload.referenceId)
      if (id) localReferences.push({ ...localReference, id, provisional: true })
    }
    if (eventType === 'scene_graph_node_registered') {
      const node = asRecord(payload.node)
      const id = readText(node.id) || readText(payload.nodeId)
      const nodeKind = readText(node.nodeKind) || readText(payload.nodeKind)
      if (!id) continue
      const entry = { ...node, id, nodeKind, provisional: true }
      if (nodeKind === 'set') streamedSets.push({ ...entry, nodeKind: 'location_set' })
      else if (nodeKind === 'zone') streamedZones.push({ ...entry, nodeKind: 'location_zone' })
      else if (nodeKind === 'spot') streamedSpots.push({ ...entry, nodeKind: 'location_spot' })
      else if (nodeKind === 'viewpoint' || nodeKind === 'angle') streamedViewpoints.push({ ...entry, nodeKind: 'location_viewpoint' })
    }
  }

  const requestedShotSet = new Set(input.requestedShotIds)
  const selectedShots = [...shotsById.values()].filter((shot) => requestedShotSet.has(readText(shot.id)))
  if (selectedShots.length === 0) throw new HttpError(409, 'That streamed shot is not ready yet.')
  const missingBindingShot = selectedShots.find((shot) => {
    const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
    return !readText(binding.setId ?? binding.set_id) && !readText(binding.worldLocationRefId ?? binding.world_location_ref_id)
  })
  if (missingBindingShot) {
    throw new HttpError(409, `Shot ${readText(missingBindingShot.id)} binding is not ready yet.`)
  }

  if (blocksById.size === 0) {
    for (const shot of shotsById.values()) {
      const blockId = readText(shot.blockId ?? shot.storyboardBlockId) || 'block_001'
      const block = blocksById.get(blockId) ?? { id: blockId, index: blocksById.size + 1, title: `Block ${blocksById.size + 1}`, summary: 'Streamed shot continuity records.', shotIds: [], status: 'planned', provisional: true }
      const shotIds = readStringArray(asRecord(block).shotIds)
      if (!shotIds.includes(readText(shot.id))) shotIds.push(readText(shot.id))
      blocksById.set(blockId, { ...asRecord(block), shotIds })
    }
  }
  for (const shot of shotsById.values()) {
    const blockId = readText(shot.blockId ?? shot.storyboardBlockId) || 'block_001'
    const block = blocksById.get(blockId)
    if (!block) continue
    const shotIds = readStringArray(block.shotIds)
    if (!shotIds.includes(readText(shot.id))) blocksById.set(blockId, { ...block, shotIds: [...shotIds, readText(shot.id)] })
  }

  const packageGraph = graphNodesFromScenePackage(scenePackage)
  const shotBindings: Record<string, Record<string, unknown>> = {}
  for (const shot of shotsById.values()) {
    const blockId = readText(shot.storyboardBlockId ?? shot.blockId) || 'block_001'
    shotBindings[readText(shot.id)] = shotBindingFromShot(shot, blockId)
  }
  const graph = {
    version: 'sequence_animatic_continuity_graph_v2',
    planningMode: 'block_graph_v2',
    worldLocationRefs: [],
    locationSets: mergeById([...packageGraph.locationSets, ...streamedSets]),
    zones: mergeById([...packageGraph.zones, ...streamedZones]),
    spots: mergeById([...packageGraph.spots, ...streamedSpots]),
    viewpoints: mergeById([...packageGraph.viewpoints, ...streamedViewpoints]),
    angles: mergeById([...packageGraph.viewpoints, ...streamedViewpoints]),
    edges: readArray(scenePackage.spotRelations ?? scenePackage.spot_relations).map(asRecord),
    shotBindings,
    assetAnchors: localReferences.map((reference) => ({
      ...reference,
      id: readText(reference.id),
      type: readText(reference.type) || 'prop',
      shotIds: readStringArray(reference.usedShotIds ?? reference.used_shot_ids),
    })),
    rejectedCandidates: [],
    blockSummaries: [...blocksById.values()].map((block) => ({ blockId: readText(block.id), summary: readText(block.summary), status: 'planned' })),
    warnings: ['Provisional keyframe context built from streamed shot-continuity events.'],
    diagnostics: [],
  }
  const blocks = [...blocksById.values()]
    .map((block) => {
      const shotIds = readStringArray(block.shotIds)
      return {
        ...block,
        shotIds,
        shots: shotIds.map((shotId) => shotsById.get(shotId)).filter(Boolean),
      }
    })
    .filter((block) => readArray(block.shots).length > 0)
  const shots = [...shotsById.values()].sort((left, right) => (Number(left.index ?? 0) || 0) - (Number(right.index ?? 0) || 0))
  const directorPlan = {
    role: 'sequence_animatic_director_plan',
    contractVersion: 'shot_continuity_plan_v2',
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    screenplayAnimaticRole: 'director_plan',
    sequenceAnimaticRole: 'director_plan',
    masterRequestId: input.masterRequest.id,
    shots,
    blocks: blocks.map((block) => ({ ...block, shots: undefined })),
    coverageSetups,
    coverage_setups: coverageSetups,
    coverageSetupByShotId: Object.fromEntries(shots.map((shot) => [readText(shot.id), readText(shot.coverageSetupId ?? shot.coverage_setup_id)] as const).filter(([, setupId]) => setupId)),
    continuityGraphV2: graph,
    continuity_graph_v2: graph,
    shotBindings,
    shot_bindings: shotBindings,
    outputLocalReferences: localReferences,
    output_local_references: localReferences,
    provisional: true,
  }
  const manifest = {
    role: 'sequence_animatic_manifest',
    masterRequestId: input.masterRequest.id,
    assetPack,
    blocks,
    shotPlan: {
      sceneId: 'sequence_animatic_master',
      shots,
      totalEditorialDurationSeconds: shots.reduce((total, shot) => total + (Number(shot.editorialDurationSeconds ?? shot.durationSeconds) || 0), 0),
    },
    continuityGraphV2: graph,
    continuity_graph_v2: graph,
    shotBindings,
    shot_bindings: shotBindings,
    provisional: true,
  }
  return { manifest, directorPlan, assetPack, provisional: true }
}

export async function runSequenceAnimaticKeyframeWorkflowsCommand(input: {
  client: {
    from: (table: string) => any
  }
  admin: {
    from: (table: string) => any
    rpc: (fn: string, args?: Record<string, unknown>) => any
  }
  userId: string
  payload: unknown
}) {
    const { client, admin, userId } = input
    const payload = sequenceAnimaticKeyframeWorkflowEnsureRequestSchema.parse(input.payload)

    const masterRequest = await loadScreenplayAnimaticMasterRequest({
      client,
      projectId: payload.projectId,
      draftId: payload.draftId,
      masterRequestId: payload.masterRequestId,
    })
    const masterMetadata = asRecord(masterRequest.metadata)
    const screenplayAnimaticSource = readScreenplayAnimaticSource(
      masterMetadata,
      masterRequest.sourceSurface === 'outputs' ? 'prompt_cinematic' : 'wiki_sequence_unit',
    )

    const masterArtifactsResponse = await client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('workflow_id', masterRequest.workflowId)
      .order('created_at', { ascending: false })
    if (masterArtifactsResponse.error) throw new Error(masterArtifactsResponse.error.message)
    const masterArtifacts = (masterArtifactsResponse.data ?? []).map(asRecord)
    let manifest = artifactMetadataRecord(masterArtifacts, ['sequence_animatic_manifest'], ['manifest', 'sequenceAnimaticManifest', 'sequence_animatic_manifest'])
    let directorPlan = artifactMetadataRecord(masterArtifacts, ['sequence_animatic_director_plan'], ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
    let combinedManifestArtifactKey = ''
    let keyframePlanSource = 'final_manifest'
    if (Object.keys(manifest).length === 0 || Object.keys(directorPlan).length === 0) {
      // Per-scene architecture: combine ready scene children's manifests/plans at
      // read time so keyframes can run for whatever scenes are complete.
      const combined = await resolveSequenceAnimaticCombinedManifest({ client: admin, masterRequest })
      if (combined) {
        manifest = combined.manifest
        directorPlan = combined.directorPlan
        combinedManifestArtifactKey = combined.manifestArtifactKey
        keyframePlanSource = 'combined_scene_plan'
      }
    }
    let provisionalContext = false
    if ((Object.keys(manifest).length === 0 || Object.keys(directorPlan).length === 0) && payload.allowProvisional) {
      const runId = masterRequest.latestRunId
      const stepsResponse = runId
        ? await admin
          .from('output_workflow_run_steps')
          .select(outputWorkflowRunStepSelect)
          .eq('run_id', runId)
          .order('order_index', { ascending: true })
        : { data: [], error: null }
      if (stepsResponse.error) throw new Error(stepsResponse.error.message)
      const eventsResponse = await admin
        .from('output_request_events')
        .select('id, project_id, draft_id, request_id, sequence, event_type, payload, created_at')
        .eq('draft_id', payload.draftId)
        .eq('request_id', masterRequest.id)
        .order('sequence', { ascending: true })
        .limit(1000)
      if (eventsResponse.error) throw new Error(eventsResponse.error.message)
      try {
        const streamed = buildSequenceAnimaticStreamedShotReadyContext({
          masterRequestId: masterRequest.id,
          events: (eventsResponse.data ?? []).map(asRecord),
          steps: (stepsResponse.data ?? []).map(asRecord),
          requestedShotIds: payload.shotIds ?? [],
        })
        manifest = streamed.manifest
        directorPlan = streamed.directorPlan
        keyframePlanSource = streamed.source
      } catch (error) {
        throw new HttpError(409, error instanceof Error ? error.message : String(error))
      }
      provisionalContext = true
    }
    if (Object.keys(manifest).length === 0) throw new HttpError(409, 'Generate the screenplay animatic manifest first.')
    if (Object.keys(directorPlan).length === 0) throw new HttpError(409, 'Generate the shot continuity plan first.')
    const manifestHash = sequenceAnimaticStableHash(manifest)
    const directorPlanHash = readText(directorPlan.shotPlanHash) || sequenceAnimaticStableHash(directorPlan)
    const masterManifestArtifactKey = readText(masterArtifacts.find((row) => readText(asRecord(row.metadata).role) === 'sequence_animatic_manifest')?.key) || combinedManifestArtifactKey
    const assetPack = asRecord(manifest.assetPack)
    const aspectRatio = readText(assetPack.aspectRatio) || '16:9'
    const keyframePlan = deriveKeyframePlan({
      manifest,
      directorPlan,
      requestedShotIds: payload.shotIds ?? [],
      requestedCoverageSetupIds: payload.coverageSetupIds ?? [],
    })
    const requestedShotIds = readStringArray(payload.shotIds)
    const isShotScopedEnsure = requestedShotIds.length === 1
    const scopedShotId = requestedShotIds[0] ?? ''
    const shotGraphDependencyMode = 'single_node_chain' as const
    const shotGraphPolicyVersion = 'primary_chain_v7' as const
    let masterMetadataForWrites = masterMetadata
    let coverageRegistry = coverageRegistryFromSources({
      masterMetadata,
      directorPlan,
      masterRequestId: masterRequest.id,
    })
    const keyframePlanWithSource = {
      ...asRecord(keyframePlan),
      source: keyframePlanSource,
      shotReadySource: provisionalContext ? 'streamed_scene_plan' : keyframePlanSource,
      provisional: provisionalContext,
    }
    const continuityLintReport = asRecord(keyframePlan.continuityLint)
    const continuityLintFindings = readArray(continuityLintReport.findings)
    if (continuityLintFindings.length > 0) {
      // Surface film-grammar findings as a deduped event so the client can
      // show "continuity review" details; lint never blocks generation.
      await insertSequenceAnimaticEvent({
        admin,
        projectId: payload.projectId,
        draftId: payload.draftId,
        requestId: masterRequest.id,
        workflowId: masterRequest.workflowId,
        eventType: 'continuity_lint',
        payload: {
          report: continuityLintReport,
          masterRequestId: masterRequest.id,
        },
        dedupeKey: 'masterRequestId',
        dedupeValue: masterRequest.id,
      })
    }

    const childResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', masterRequest.id)
      .or('metadata->>sequenceAnimaticStale.is.null,metadata->>sequenceAnimaticStale.neq.true')
      .order('created_at', { ascending: true })
    if (childResponse.error) throw new Error(childResponse.error.message)
    const existingChildren = (childResponse.data ?? []).map(mapOutputRequestRow)
      .filter((child) => asRecord(child.metadata).sequenceAnimaticStale !== true)
    const existingByCoverageSetupId = new Map(existingChildren
      .filter((child) => readScreenplayAnimaticRole(asRecord(child.metadata)) === 'coverage_anchor')
      .map((child) => [readText(asRecord(child.metadata).coverageSetupId), child] as const)
      .filter(([id]) => id))
    const existingByShotId = new Map(existingChildren
      .filter((child) => ['shot_keyframe', 'shot_production'].includes(readScreenplayAnimaticRole(asRecord(child.metadata))))
      .map((child) => [readText(asRecord(child.metadata).shotId), child] as const)
      .filter(([id]) => id))

    const existingArtifactWorkflowIds = existingChildren.map((child) => child.workflowId).filter((id): id is string => Boolean(id))
    const childArtifactsResponse = existingArtifactWorkflowIds.length > 0
      ? await client
        .from('output_artifacts')
        .select(outputArtifactSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .in('workflow_id', existingArtifactWorkflowIds)
        .order('created_at', { ascending: false })
      : { data: [], error: null }
    if (childArtifactsResponse.error) throw new Error(childArtifactsResponse.error.message)
    const childArtifacts = (childArtifactsResponse.data ?? []).map(asRecord)
    const coverageAnchorImageBySetupId = new Map<string, Record<string, unknown>>()
    const shotKeyframeImageByShotId = new Map<string, Record<string, unknown>>()
    const continuityAssetStateByNodeId: Record<string, Record<string, unknown>> = {}
    for (const artifact of childArtifacts) {
      const metadata = asRecord(artifact.metadata)
      const role = readText(metadata.role)
      if (role === 'sequence_animatic_coverage_anchor') {
        const setupId = readText(metadata.coverageSetupId)
        if (setupId && !coverageAnchorImageBySetupId.has(setupId)) coverageAnchorImageBySetupId.set(setupId, imageFromArtifact(artifact))
      }
      if (role === 'sequence_animatic_shot_keyframe') {
        const shotId = readText(metadata.shotId)
        if (shotId && !shotKeyframeImageByShotId.has(shotId)) shotKeyframeImageByShotId.set(shotId, imageFromArtifact(artifact))
      }
      if (role === 'sequence_animatic_continuity_asset') {
        const state = asRecord(metadata.assetState ?? metadata.asset_state)
        const nodeId = readText(state.sourceNodeId) || readText(metadata.targetNodeId)
        if (nodeId && Object.keys(state).length > 0) continuityAssetStateByNodeId[nodeId] = state
      }
      if (role === 'sequence_animatic_continuity_asset_batch') {
        const stateByNodeId = asRecord(metadata.assetStateByNodeId ?? metadata.asset_state_by_node_id)
        Object.entries(stateByNodeId).forEach(([nodeId, state]) => {
          if (readText(nodeId) && Object.keys(asRecord(state)).length > 0) continuityAssetStateByNodeId[nodeId] = asRecord(state)
        })
      }
    }

    const now = new Date().toISOString()
    const childAccumulator = createChildWorkflowEnsureAccumulator(existingChildren)
    const ensuredChildren = childAccumulator.requests
    const createdWorkflowIds = childAccumulator.workflowIds
    const createdNodes = childAccumulator.nodes
    const createdEdges = childAccumulator.edges
    const ensuredContinuityAssetRequests: ReturnType<typeof mapOutputRequestRow>[] = []
    const dependencyWaves: Record<string, unknown>[] = []
    const staleChildIds = new Set<string>()

    const graph = asRecord(
      manifest.continuityGraphV2
        ?? manifest.continuity_graph_v2
        ?? directorPlan.continuityGraphV2
        ?? directorPlan.continuity_graph_v2,
    )
    const allGraphNodes = continuityNodeCollections(graph)
    const graphNodeById = new Map(allGraphNodes.map((node) => [readText(node.id), node] as const).filter(([id]) => id))
    const graphNodeIds = new Set([...graphNodeById.keys()])
    const shotBindings = asRecord(
      manifest.shotBindings
        ?? manifest.shot_bindings
        ?? directorPlan.shotBindings
        ?? directorPlan.shot_bindings
        ?? graph.shotBindings,
    )
    const visualDependencyEdges = readArray(directorPlan.visualDependencyEdges ?? directorPlan.visual_dependency_edges).map(asRecord)
    const dependencyEdges = visualDependencyEdges.length > 0 ? visualDependencyEdges : continuityVisualDependencyEdges(graph)
    const continuityPack = {
      graphSpecVersion: sequenceAnimaticGraphSpecVersion,
      masterRequestId: masterRequest.id,
      continuityGraphV2: graph,
      continuity_graph_v2: graph,
      shotBindings,
      shot_bindings: shotBindings,
      assetStateByNodeId: continuityAssetStateByNodeId,
      asset_state_by_node_id: continuityAssetStateByNodeId,
      visualDependencyEdges: dependencyEdges,
      visual_dependency_edges: dependencyEdges,
      continuityPackHash: sequenceAnimaticStableHash({ graph, shotBindings }),
    }
    const allShots = readArray(asRecord(manifest.shotPlan).shots)
      .map(asRecord)
      .concat(readArray(manifest.blocks).flatMap((block) => readArray(asRecord(block).shots).map(asRecord)))
    const seenShotIds = new Set<string>()
    const uniqueShots = allShots.filter((shot) => {
      const id = readText(shot.id)
      if (!id || seenShotIds.has(id)) return false
      seenShotIds.add(id)
      return true
    })
    const assetPackEntities = readArray(assetPack.entities).map(asRecord)
    const assetChildren = ensuredChildren.filter((child) => {
      const role = readScreenplayAnimaticRole(asRecord(child.metadata))
      return role === 'continuity_asset' || role === 'continuity_asset_batch'
    })
    const assetStateReady = (nodeId: string) => Boolean(readText(asRecord(continuityAssetStateByNodeId[nodeId]).assetKey))
    const dependencyTargetIds = dependencyNodeIdsForKeyframePlan({ keyframePlan: asRecord(keyframePlan), graphNodeIds })
    const missingDependencyIds = dependencyTargetIds.filter((nodeId) => !assetStateReady(nodeId))
    const shotBlockingDependencyNodeIdsByShotId: Record<string, string[]> = {}
    for (const job of readArray(keyframePlan.shotKeyframeJobs).map(asRecord)) {
      const shotId = readText(job.shotId)
      if (!shotId) continue
      const shot = asRecord(job.shot)
      const requiredNodeIds = [
        ...shotSceneBindingNodeIds(shot),
        ...shotReferenceNodeIds(shot, graphNodeIds),
      ].filter((nodeId) => graphNodeIds.has(nodeId))
      const missingForShot = requiredNodeIds.filter((nodeId) => !assetStateReady(nodeId))
      if (missingForShot.length > 0) shotBlockingDependencyNodeIdsByShotId[shotId] = [...new Set(missingForShot)]
    }
    const coverageAnchorAssetKeysBySetupId = Object.fromEntries([...coverageAnchorImageBySetupId.entries()]
      .map(([setupId, image]) => [setupId, readText(image.assetKey)] as const)
      .filter(([, assetKey]) => assetKey))
    const shotKeyframeAssetKeysByShotId = Object.fromEntries([...shotKeyframeImageByShotId.entries()]
      .map(([shotId, image]) => [shotId, readText(image.assetKey)] as const)
      .filter(([, assetKey]) => assetKey))
    const parentMissingIds = new Set<string>()
    for (const nodeId of missingDependencyIds) {
      const node = graphNodeById.get(nodeId)
      if (!node) continue
      const parentId = continuityNodeParentId(node)
      if (parentId && graphNodeById.has(parentId) && !assetStateReady(parentId)) parentMissingIds.add(parentId)
    }
    const missingChildrenByParentId = new Map<string, Record<string, unknown>[]>()
    for (const nodeId of missingDependencyIds) {
      const node = graphNodeById.get(nodeId)
      if (!node) continue
      const nodeKind = readText(node.nodeKind)
      const parentId = continuityNodeParentId(node)
      if (!parentId || !parentMissingIds.has(parentId)) continue
      if (nodeKind !== 'location_zone' && nodeKind !== 'location_spot' && nodeKind !== 'location_viewpoint' && nodeKind !== 'location_angle') continue
      missingChildrenByParentId.set(parentId, [...(missingChildrenByParentId.get(parentId) ?? []), node])
    }
    const handledNodeIds = new Set<string>()
    const runGroups: {
      nodes: Record<string, unknown>[]
      isBatch: boolean
      generationPolicy?: string
      dependencyWave?: number
      cellRoles?: string[]
      sourceReferenceNodeIds?: string[]
      sourceBatchAssetKey?: string
    }[] = []
    for (const [parentId, children] of missingChildrenByParentId.entries()) {
      const parentNode = graphNodeById.get(parentId)
      if (!parentNode || assetStateReady(parentId)) continue
      const parentKind = readText(parentNode.nodeKind)
      if (parentKind !== 'location_set' && parentKind !== 'location_zone' && parentKind !== 'location_spot') continue
      const orderedChildren = children
        .filter((child, index, entries) => entries.findIndex((entry) => readText(entry.id) === readText(child.id)) === index)
        .slice(0, 3)
      if (orderedChildren.length === 0) continue
      const nodes = [parentNode, ...orderedChildren]
      nodes.forEach((node) => handledNodeIds.add(readText(node.id)))
      runGroups.push({
        nodes,
        isBatch: true,
        dependencyWave: 1,
        generationPolicy: 'parent_child_scaffold_grid',
        cellRoles: ['parent', ...orderedChildren.map(() => 'child')],
        sourceReferenceNodeIds: [continuityNodeParentId(parentNode)].filter(Boolean),
      })
    }
    const initialRunnableIds = missingDependencyIds.filter((nodeId) => {
      if (handledNodeIds.has(nodeId)) return false
      const node = graphNodeById.get(nodeId)
      if (!node) return false
      const parentId = continuityNodeParentId(node)
      if (!parentId || !graphNodeById.has(parentId)) return true
      if (assetStateReady(parentId)) return true
      const kind = readText(node.nodeKind)
      return kind !== 'location_zone' && kind !== 'location_spot' && kind !== 'location_viewpoint' && kind !== 'location_angle'
    })
    for (const parentId of parentMissingIds) {
      if (!handledNodeIds.has(parentId)) initialRunnableIds.push(parentId)
    }
    const runnableIds = new Set<string>(initialRunnableIds)
    for (const nodeId of initialRunnableIds) {
      const node = graphNodeById.get(nodeId)
      if (!node) continue
      const nodeKind = readText(node.nodeKind)
      if (nodeKind !== 'location_zone' && nodeKind !== 'location_spot' && nodeKind !== 'location_viewpoint' && nodeKind !== 'location_angle') continue
      const parentId = continuityNodeParentId(node)
      if (!parentId) continue
      allGraphNodes
        .filter((candidate) => !assetStateReady(readText(candidate.id)))
        .filter((candidate) => readText(candidate.nodeKind) === nodeKind)
        .filter((candidate) => continuityNodeUsesParent(candidate, parentId))
        .slice(0, 4)
        .forEach((candidate) => {
          const candidateId = readText(candidate.id)
          if (!handledNodeIds.has(candidateId)) runnableIds.add(candidateId)
        })
    }
    const runnableNodes = [...runnableIds].map((nodeId) => graphNodeById.get(nodeId)).filter((node): node is Record<string, unknown> => Boolean(node))
    const grouped = new Map<string, Record<string, unknown>[]>()
    for (const node of runnableNodes) {
      if (handledNodeIds.has(readText(node.id))) continue
      const kind = readText(node.nodeKind)
      const batchable = kind === 'location_zone'
        || kind === 'location_spot'
        || kind === 'location_viewpoint'
        || kind === 'location_angle'
        || kind === 'temporary_character'
        || kind === 'prop'
      const parentId = continuityNodeParentId(node)
      if (!batchable) {
        runGroups.push({ nodes: [node], isBatch: false, dependencyWave: kind === 'temporary_character' || kind === 'prop' ? 3 : 1 })
        continue
      }
      const blockKey = readStringArray(node.storyboardBlockIds ?? node.blockIds ?? node.shotIds).slice(0, 4).join('_') || 'global'
      const key = `${kind}:${parentId || blockKey}`
      grouped.set(key, [...(grouped.get(key) ?? []), node])
    }
    for (const group of grouped.values()) {
      if (group.length <= 1) {
        const kind = readText(group[0]?.nodeKind)
        runGroups.push({ nodes: group, isBatch: false, dependencyWave: kind === 'temporary_character' || kind === 'prop' ? 3 : 2 })
      }
      else {
        for (let index = 0; index < group.length; index += 4) {
          const chunk = group.slice(index, index + 4)
          const kind = readText(chunk[0]?.nodeKind)
          runGroups.push({ nodes: chunk, isBatch: chunk.length > 1, dependencyWave: kind === 'temporary_character' || kind === 'prop' ? 3 : 2 })
        }
      }
    }
    const referenceAssetKeysForTargets = (targetNodes: readonly Record<string, unknown>[]) => {
      const requestedNodeIdSet = new Set(targetNodes.map((node) => readText(node.id)).filter(Boolean))
      const firstTarget = targetNodes[0] ?? {}
      const parentId = continuityNodeParentId(firstTarget)
      const dependencyReferenceKeys = dependencyEdges
        .filter((edge) => requestedNodeIdSet.has(readText(edge.targetNodeId)))
        .map((edge) => readText(asRecord(continuityAssetStateByNodeId[readText(edge.sourceNodeId)]).assetKey))
        .filter(Boolean)
      const siblingReferenceKeys = parentId
        ? allGraphNodes
          .filter((node) => !requestedNodeIdSet.has(readText(node.id)))
          .filter((node) => readText(node.nodeKind) === readText(firstTarget.nodeKind))
          .filter((node) => continuityNodeUsesParent(node, parentId))
          .map((node) => readText(asRecord(continuityAssetStateByNodeId[readText(node.id)]).assetKey))
          .filter(Boolean)
        : []
      const worldLocationRefId = readText(firstTarget.worldLocationRefId) || readText(firstTarget.baseLocationRefId)
      const targetWorldEntity = worldLocationRefId ? assetPackEntities.find((entity) => readText(entity.key) === worldLocationRefId) ?? null : null
      const worldReferenceKeys = targetWorldEntity ? [
        readText(targetWorldEntity.primaryAssetKey),
        readText(targetWorldEntity.selectedReferenceAssetKey),
        ...readStringArray(targetWorldEntity.assetKeys),
      ].filter(Boolean).slice(0, 2) : []
      return [...new Set([...dependencyReferenceKeys, ...siblingReferenceKeys, ...worldReferenceKeys])].slice(0, 8)
    }
    const assetKeysForEntityKeys = (entityKeys: readonly string[]) => {
      const entities: Record<string, unknown>[] = []
      for (const entityKey of entityKeys) {
        const entity = assetPackEntities.find((entry) => readText(entry.key) === entityKey)
        if (!entity) continue
        entities.push(entity)
      }
      return prioritizedEntityAssetKeys(entities, 8)
    }
    const assetKeysForGraphNodeIds = (nodeIds: readonly string[]) => [...new Set(nodeIds
      .map((nodeId) => readText(asRecord(continuityAssetStateByNodeId[nodeId]).assetKey))
      .filter(Boolean))]
    const referenceAssetKeysForCoverageSetup = (setup: Record<string, unknown>, setupShots: readonly Record<string, unknown>[]) => {
      const setupNodeIds = coverageSetupNodeIds(setup).filter((id) => graphNodeIds.has(id))
      const setupNodeAssetKeys = assetKeysForGraphNodeIds(setupNodeIds)
      const setupEntityKeys = [
        ...readStringArray(setup.characterRefIds ?? setup.character_ref_ids),
        ...setupShots.flatMap((shot) => {
          const refs = asRecord(shot.refs)
          const dialogue = readArray(shot.dialogue).map(asRecord)
          return [
            ...readStringArray(refs.visibleCharacterRefIds ?? refs.visible_character_ref_ids),
            ...readStringArray(refs.speakerRefIds ?? refs.speaker_ref_ids),
            ...readStringArray(refs.propRefIds ?? refs.prop_ref_ids),
            ...readStringArray(shot.visibleCharacterRefIds),
            ...readStringArray(shot.speakerRefIds),
            ...readStringArray(shot.propRefIds),
            ...dialogue.map((line) => readText(line.speakerRefId ?? line.speaker_ref_id)),
          ]
        }),
      ]
      return [...new Set([
        ...setupNodeAssetKeys,
        ...assetKeysForEntityKeys(setupEntityKeys),
      ].filter(Boolean))].slice(0, 8)
    }
    const rankedReferenceKeysForShot = (job: Record<string, unknown>) => {
      const shot = asRecord(job.shot)
      const shotId = readText(job.shotId)
      const coverageSetupId = readText(job.coverageSetupId)
      const previousShotId = readText(job.previousShotId)
      const coverageSetup = coverageSetupId
        ? asRecord(readArray(keyframePlan.coverageAnchorJobs).map(asRecord).find((entry) => readText(entry.coverageSetupId) === coverageSetupId)?.coverageSetup)
        : {}
      const refs = asRecord(shot.refs)
      const dialogue = readArray(shot.dialogue).map(asRecord)
      const graphAssetKeys = assetKeysForGraphNodeIds([
        ...shotSceneBindingNodeIds(shot),
        ...shotReferenceNodeIds(shot, graphNodeIds),
      ])
      const coverageSetupEntityKeys = [
        ...readStringArray(coverageSetup.characterRefIds ?? coverageSetup.character_ref_ids),
        ...readStringArray(coverageSetup.visibleCharacterRefIds ?? coverageSetup.visible_character_ref_ids),
        ...readStringArray(coverageSetup.subjectRefIds ?? coverageSetup.subject_ref_ids),
        ...readStringArray(coverageSetup.speakerRefIds ?? coverageSetup.speaker_ref_ids),
        ...readStringArray(coverageSetup.propRefIds ?? coverageSetup.prop_ref_ids),
        ...readStringArray(coverageSetup.itemRefIds ?? coverageSetup.item_ref_ids),
      ]
      const shotEntityKeys = [
        ...readStringArray(refs.speakerRefIds ?? refs.speaker_ref_ids),
        ...dialogue.map((line) => readText(line.speakerRefId ?? line.speaker_ref_id)),
        ...readStringArray(refs.visibleCharacterRefIds ?? refs.visible_character_ref_ids),
        ...readStringArray(refs.propRefIds ?? refs.prop_ref_ids),
        ...readStringArray(shot.speakerRefIds),
        ...readStringArray(shot.visibleCharacterRefIds),
        ...readStringArray(shot.propRefIds),
        readText(shot.locationRefId),
      ].filter(Boolean)
      const entityAssetKeys = assetKeysForEntityKeys([
        ...shotEntityKeys,
        ...(shotEntityKeys.length === 0 ? coverageSetupEntityKeys : []),
      ])
      const candidates = [
        { assetKey: readText(coverageAnchorImageBySetupId.get(coverageSetupId)?.assetKey), role: 'coverage_anchor' as const, reason: 'Reusable coverage anchor for this camera setup.' },
        { assetKey: readText(shotKeyframeImageByShotId.get(previousShotId)?.assetKey), role: 'previous_keyframe' as const, reason: 'Same-setup motion continuity reference.' },
        ...graphAssetKeys.map((assetKey) => ({ assetKey, role: 'continuity_asset' as const, reason: 'Scene-graph spatial or local continuity reference.' })),
        ...entityAssetKeys.map((assetKey) => ({ assetKey, role: 'entity_reference' as const, reason: shotEntityKeys.length === 0 ? 'Coverage setup subject fallback reference.' : 'Shot-visible character, speaker, prop, or location reference.' })),
      ].filter((entry) => readText(entry.assetKey))
      const unique = candidates.filter((entry, index, entries) => entries.findIndex((candidate) => readText(candidate.assetKey) === readText(entry.assetKey)) === index)
      const required = unique.slice(0, 8)
      const omitted = unique.slice(8)
      return {
        shotId,
        required: required.map((entry) => readText(entry.assetKey)),
        omitted: omitted.map((entry) => readText(entry.assetKey)),
        selectedReferences: required,
        omittedReferences: omitted.map((entry) => ({ ...entry, reason: `${entry.reason} Omitted because the shot reference budget was full.` })),
      }
    }
    const coverageAnchorReferenceAssetKeysBySetupId = Object.fromEntries(readArray(keyframePlan.coverageAnchorJobs)
      .map(asRecord)
      .map((job) => {
        const setupId = readText(job.coverageSetupId)
        const setupShots = readArray(asRecord(keyframePlan).shotKeyframeJobs)
          .map(asRecord)
          .map((entry) => asRecord(entry.shot))
          .filter((shot) => readStringArray(job.shotIds).includes(readText(shot.id)))
        return [setupId, referenceAssetKeysForCoverageSetup(asRecord(job.coverageSetup), setupShots)] as const
      })
      .filter(([setupId]) => setupId))
    const shotReferenceSelection = readArray(keyframePlan.shotKeyframeJobs)
      .map(asRecord)
      .map(rankedReferenceKeysForShot)
    const shotRequiredReferenceAssetKeysByShotId = Object.fromEntries(shotReferenceSelection.map((entry) => [entry.shotId, entry.required]).filter(([shotId]) => shotId))
    const shotOmittedReferenceAssetKeysByShotId = Object.fromEntries(shotReferenceSelection.map((entry) => [entry.shotId, entry.omitted]).filter(([shotId]) => shotId))
    const coverageAnchorSelectedReferencesBySetupId = Object.fromEntries(Object.entries(coverageAnchorReferenceAssetKeysBySetupId)
      .map(([setupId, assetKeys]) => [setupId, readStringArray(assetKeys).map((assetKey) => ({ assetKey, role: 'selected_reference' as const, reason: 'Selected for coverage anchor generation.' }))] as const))
    const shotSelectedReferencesByShotId = Object.fromEntries(shotReferenceSelection.map((entry) => [entry.shotId, entry.selectedReferences]).filter(([shotId]) => shotId))
    const shotOmittedReferencesByShotId = Object.fromEntries(shotReferenceSelection.map((entry) => [entry.shotId, entry.omittedReferences]).filter(([shotId]) => shotId))
    const graphLocalReferenceKeysForShotProduction = (shotId: string) => readArray(shotSelectedReferencesByShotId[shotId])
      .map(asRecord)
      .filter((entry) => ['entity_reference', 'continuity_asset'].includes(readText(entry.role)))
      .map((entry) => readText(entry.assetKey))
      .filter(Boolean)
    const visualReferencePlan = buildSequenceAnimaticVisualReferencePlan({
      keyframePlan: asRecord(keyframePlan),
      dependencyNodeIds: dependencyTargetIds,
      missingDependencyNodeIds: missingDependencyIds,
      coverageAnchorAssetKeysBySetupId,
      shotKeyframeAssetKeysByShotId,
      coverageAnchorReferenceAssetKeysBySetupId,
      shotRequiredReferenceAssetKeysByShotId,
      shotOmittedReferenceAssetKeysByShotId,
      coverageAnchorSelectedReferencesBySetupId,
      shotSelectedReferencesByShotId,
      shotOmittedReferencesByShotId,
      shotBlockingDependencyNodeIdsByShotId,
    })
    const scopedShotJob = isShotScopedEnsure
      ? readArray(keyframePlan.shotKeyframeJobs).map(asRecord).find((job) => readText(job.shotId) === scopedShotId) ?? null
      : null
    const scopedCoverageSetupId = scopedShotJob ? readText(scopedShotJob.coverageSetupId) : ''
    const scopedPreviousShotId = scopedShotJob ? readText(scopedShotJob.previousShotId) : ''
    const scopedMissingContinuityNodeIds = readStringArray(shotBlockingDependencyNodeIdsByShotId[scopedShotId])
    const scopedKeyframeReady = Boolean(scopedShotId && readText(shotKeyframeImageByShotId.get(scopedShotId)?.assetKey))
    const scopedCoverageReady = !scopedShotJob
      || scopedShotJob.requiresCoverageAnchor !== true
      || !scopedCoverageSetupId
      || Boolean(readText(coverageAnchorImageBySetupId.get(scopedCoverageSetupId)?.assetKey))
    const scopedPreviousKeyframeReady = !scopedPreviousShotId || Boolean(readText(shotKeyframeImageByShotId.get(scopedPreviousShotId)?.assetKey))
    const shotReadiness = isShotScopedEnsure ? {
      shotId: scopedShotId,
      status: scopedKeyframeReady
        ? 'keyframe_ready'
        : !scopedPreviousKeyframeReady
          ? 'waiting_for_previous_keyframe'
          : scopedShotJob
            ? 'ready_for_keyframe'
            : 'blocked',
      missingContinuityNodeIds: scopedMissingContinuityNodeIds,
      coverageSetupReady: scopedCoverageReady,
      previousKeyframeReady: scopedPreviousKeyframeReady,
      keyframeReady: scopedKeyframeReady,
    } : null
    const workflowsForCreatedIds = async () => (await loadChildWorkflowGraphBundle({
      client,
      workflowIds: createdWorkflowIds,
    })).workflows
    const childNextAction = (
      kind: 'run_continuity_asset' | 'run_coverage_anchor' | 'run_shot_production_keyframe',
      child: ReturnType<typeof mapOutputRequestRow> | null,
      reason: string,
      dependencyNodeIds: string[] = [],
    ) => {
      const childMetadata = asRecord(child?.metadata)
      return {
        kind,
        requestId: child?.id ?? null,
        workflowId: child?.workflowId ?? null,
        role: child ? readScreenplayAnimaticRole(childMetadata) : null,
        reason,
        shotId: scopedShotId,
        coverageSetupId: readText(childMetadata.coverageSetupId) || scopedCoverageSetupId || null,
        dependencyNodeIds,
      }
    }
    const blockedNextAction = (reason: string, dependencyNodeIds: string[] = []) => ({
      kind: 'blocked' as const,
      requestId: null,
      workflowId: null,
      role: null,
      reason,
      shotId: scopedShotId,
      coverageSetupId: scopedCoverageSetupId || null,
      dependencyNodeIds,
    })
    const sceneContinuityManifests = await loadSceneContinuityManifests({
      client,
      projectId: payload.projectId,
      draftId: payload.draftId,
      masterRequestId: masterRequest.id,
    })
    const sceneContinuityByShotId = new Map<string, ReturnType<typeof resolveSceneContinuityForShot>>()
    const sceneContinuityBlockedShotKeyframes: Array<{
      shotId: string
      storyboardBlockId: string | null
      reason: SceneContinuityBlockerReason
      coverageSetupId: string | null
      previousShotId: string | null
      missingContinuityNodeIds: string[]
    }> = []
    for (const job of readArray(keyframePlan.shotKeyframeJobs).map(asRecord)) {
      const shotId = readText(job.shotId)
      if (!shotId) continue
      const shot = asRecord(job.shot)
      const continuity = resolveSceneContinuityForShot({
        manifests: sceneContinuityManifests,
        shot,
      })
      sceneContinuityByShotId.set(shotId, continuity)
      if (payload.allowProvisional || provisionalContext) continue
      if (payload.mode === 'generate' && readText(shotKeyframeImageByShotId.get(shotId)?.assetKey)) continue
      const blockReason = sceneContinuityBlockingReason(continuity)
      if (!blockReason) continue
      sceneContinuityBlockedShotKeyframes.push({
        shotId,
        storyboardBlockId: readText(job.storyboardBlockId) || null,
        reason: blockReason,
        coverageSetupId: readText(job.coverageSetupId) || null,
        previousShotId: readText(job.previousShotId) || null,
        missingContinuityNodeIds: readStringArray(continuity.readiness?.spatialNodeIds),
      })
    }
    if (sceneContinuityBlockedShotKeyframes.length > 0) {
      const scopedBlock = isShotScopedEnsure
        ? sceneContinuityBlockedShotKeyframes.find((entry) => entry.shotId === scopedShotId) ?? sceneContinuityBlockedShotKeyframes[0]
        : null
      return sequenceAnimaticKeyframeWorkflowEnsureResponseSchema.parse({
        ok: true,
        masterRequest,
        keyframePlan: {
          ...keyframePlanWithSource,
          dependencyReadiness: {
            status: 'waiting_for_scene_continuity_manifest',
            dependencyNodeIds: dependencyTargetIds,
            missingDependencyNodeIds: missingDependencyIds,
          },
          sceneContinuityManifests,
        },
        visualReferencePlan,
        nextAction: scopedBlock
          ? blockedNextAction(
            scopedBlock.reason === 'missing_scene_continuity_manifest'
              ? 'Prepare the Scene Board before generating final keyframes.'
              : 'Scene continuity references are not ready for this shot.',
            scopedBlock.missingContinuityNodeIds,
          )
          : null,
        shotReadiness: isShotScopedEnsure ? {
          ...asRecord(shotReadiness),
          status: 'blocked',
          missingContinuityNodeIds: scopedBlock?.missingContinuityNodeIds ?? [],
        } : null,
        blockedShotKeyframes: sceneContinuityBlockedShotKeyframes,
        dependencyWaves,
        continuityAssetRequests: [],
        coverageAnchorRequests: [],
        shotKeyframeRequests: [],
        childRequests: [],
        workflows: await workflowsForCreatedIds(),
        nodes: createdNodes,
        edges: createdEdges,
      })
    }
    const relevantShotsForNodes = (nodes: readonly Record<string, unknown>[]) => {
      const targetShotIds = new Set(nodes.flatMap((node) => readStringArray(node.shotIds)))
      const requestedNodeIds = new Set(nodes.map((node) => readText(node.id)).filter(Boolean))
      Object.entries(shotBindings).forEach(([shotId, bindingValue]) => {
        const binding = asRecord(bindingValue)
        const bindingNodeIds = new Set([
          readText(binding.setId),
          readText(binding.zoneId),
          readText(binding.angleId),
          readText(binding.viewpointId),
          readText(binding.primarySpotId),
          ...readStringArray(binding.spotIds),
        ].filter(Boolean))
        if ([...requestedNodeIds].some((nodeId) => bindingNodeIds.has(nodeId))) targetShotIds.add(shotId)
      })
      return uniqueShots.filter((shot) => targetShotIds.has(readText(shot.id))).slice(0, 12)
    }
    const ensureContinuityDependencyGroup = async (group: { nodes: Record<string, unknown>[]; isBatch: boolean }) => {
      const targetNodes = group.nodes.filter((node) => readText(node.id))
      if (targetNodes.length === 0) return null
      const targetNode = targetNodes[0]
      const targetNodeIds = targetNodes.map((node) => readText(node.id)).filter(Boolean)
      const dependencyWave = Math.max(1, Math.min(5, Math.floor(Number((group as { dependencyWave?: number }).dependencyWave ?? 0) || 0))
        || (['temporary_character', 'prop'].includes(readText(targetNode.nodeKind)) ? 3 : group.isBatch ? 2 : 1))
      const referenceAssetKeys = referenceAssetKeysForTargets(targetNodes)
      const referenceEntities = referenceAssetKeys.map((assetKey) => assetEntityForKey(assetKey, `${readText(targetNode.name) || readText(targetNode.id)} dependency`))
      const augmentedAssetPack = {
        ...assetPack,
        entities: [...assetPackEntities, ...referenceEntities],
        continuityReferenceAssetKeys: referenceAssetKeys,
      }
      const relevantShots = relevantShotsForNodes(targetNodes)
      const parentId = continuityNodeParentId(targetNode)
      const worldLocationRefId = readText(targetNode.worldLocationRefId) || readText(targetNode.baseLocationRefId)
      if (group.isBatch) {
        const batchKind = continuityBatchKindForNodes(targetNodes)
        if (!batchKind) return null
        const generationPolicy = readText((group as { generationPolicy?: string }).generationPolicy)
          || (batchKind === 'parent_child_scaffold_grid' ? 'parent_child_scaffold_grid' : 'keyframe_dependency_sibling_grid')
        const cellRoles = Array.isArray((group as { cellRoles?: string[] }).cellRoles)
          ? ((group as { cellRoles?: string[] }).cellRoles ?? []).map(readText).filter(Boolean)
          : targetNodes.map(() => 'target')
        const layout = continuityBatchLayoutForTargetCount(targetNodeIds.length)
        const sourceReferenceNodeIds = [
          ...readStringArray((group as { sourceReferenceNodeIds?: string[] }).sourceReferenceNodeIds),
          parentId,
          ...allGraphNodes
            .filter((node) => !targetNodeIds.includes(readText(node.id)))
            .filter((node) => readText(node.nodeKind) === readText(targetNode.nodeKind))
            .filter((node) => continuityNodeUsesParent(node, parentId))
            .filter((node) => readText(asRecord(continuityAssetStateByNodeId[readText(node.id)]).assetKey))
            .map((node) => readText(node.id)),
        ].filter(Boolean)
        const batch = {
          batchId: `keyframe_${batchKind}_${slugify(parentId || readStringArray(targetNode.storyboardBlockIds ?? targetNode.blockIds ?? targetNode.shotIds).join('_') || 'global')}_${sequenceAnimaticStableHash(targetNodeIds).slice(0, 8)}`,
          batchKind,
          targetNodeIds,
          sourceReferenceNodeIds,
          worldReferenceAssetKeys: referenceAssetKeys,
          blockIds: [...new Set(targetNodes.flatMap((node) => readStringArray(node.storyboardBlockIds ?? node.blockIds)))],
          layout,
          gridLayout: layout,
          cellRoles,
          required: true,
          generationPolicy,
        }
        const inputHash = sequenceAnimaticStableHash({ batch, targetNodes, referenceAssetKeys, manifestHash })
        const continuityBatchIdentity = `${readText(batch.batchId)}:${inputHash}`
        const existing = assetChildren.find((child) => {
          const metadata = asRecord(child.metadata)
          return metadata.sequenceAnimaticStale !== true
            && readScreenplayAnimaticRole(metadata) === 'continuity_asset_batch'
            && readText(metadata.continuityBatchIdentity) === continuityBatchIdentity
        }) ?? null
        if (existing?.workflowId) return existing
        const workflowId = crypto.randomUUID()
        const commonConfig = {
          cinematicPipelineVersion: 'v3_script_storyboards',
          graphSpecVersion: sequenceAnimaticGraphSpecVersion,
          screenplayAnimaticRole: 'continuity_asset_batch',
          screenplayAnimaticSource,
          sequenceAnimaticRole: 'continuity_asset_batch',
          masterRequestId: masterRequest.id,
          continuityRequestId: null,
          continuityWorkflowId: null,
          continuityBatchId: readText(batch.batchId),
          continuityBatchHash: inputHash,
          continuityBatchIdentity,
          targetNodeIds,
          assetKind: batchKind,
          assetInputHash: inputHash,
          manifestHash,
          continuityPackHash: readText(continuityPack.continuityPackHash),
          masterManifestArtifactKey,
          shotReadySource: provisionalContext ? 'streamed_scene_plan' : keyframePlanSource,
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          worldLocationRefId,
          parentNodeIds: readStringArray(batch.sourceReferenceNodeIds),
          dependencyWave,
          referenceSelection: {
            selectedReferences: referenceAssetKeys.map((assetKey) => ({ assetKey, role: 'continuity_asset', reason: 'Selected scene-graph dependency reference.' })),
            omittedReferences: [],
          },
          visualBrief: {
            targetNames: targetNodes.map((node) => readText(node.name) || readText(node.id)).filter(Boolean),
            batchKind,
            generationPolicy,
          },
          generationPolicy,
          gridLayout: layout,
          cellRoles,
          sourceReferenceNodeIds,
          sourceBatchAssetKey: readText((group as { sourceBatchAssetKey?: string }).sourceBatchAssetKey),
          provisional: provisionalContext,
        }
        const graphResult = buildValidatedSequenceAnimaticTemplateGraph({
          registry: sequenceAnimaticCommandWorkflowTemplateRegistry,
          templateKey: sequenceAnimaticContinuityBatchTemplateKey,
          rawInput: {
            workflowId,
            draftId: payload.draftId,
            commonConfig,
            batch,
            targetNodes,
            continuityGraphV2: graph,
            relevantShots,
            shotBindings,
            assetPack: augmentedAssetPack,
            referenceAssetKeys,
            visualDependencyEdges: dependencyEdges,
            aspectRatio: readText(assetPack.aspectRatio) || '1:1',
          },
        })
        const graphParts = graphResult.graph
        const workflowTemplateMetadata = {
          workflowTemplateKey: sequenceAnimaticContinuityBatchTemplateKey,
          workflowTemplateSourceHash: graphResult.sourceHash,
        }
        const targetNames = targetNodes.map((node) => readText(node.name) || readText(node.id)).filter(Boolean)
        const ensured = await ensureMappedChildWorkflow({
          client: admin,
          projectId: payload.projectId,
          draftId: payload.draftId,
          parentRequestId: masterRequest.id,
          role: 'continuity_asset_batch',
          identityKey: 'continuityBatchIdentity',
          identityValue: continuityBatchIdentity,
          workflow: {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            key: `sequence_animatic_continuity_asset_batch_${slugify(masterRequest.id)}_${slugify(readText(batch.batchId))}_${inputHash.slice(0, 8)}`,
            name: `${targetNames.slice(0, 3).join(', ')} continuity grid`,
            description: 'Sequence animatic keyframe dependency continuity grid workflow.',
            preset: 'cinematic_episode_from_sequence',
            status: 'active',
            created_by: userId,
            metadata: { ...commonConfig, ...workflowTemplateMetadata, batch, readyToRun: true },
          },
          nodes: graphParts.nodes,
          edges: graphParts.edges,
          request: {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            parent_request_id: masterRequest.id,
            requested_by: userId,
            source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
            prompt: `Generate continuity asset grid for ${targetNames.join(', ')}.`,
            title: `${targetNames.slice(0, 3).join(', ')} continuity grid`,
            intent: 'output_generation',
            output_kind: 'cinematic_episode',
            status: 'awaiting_confirmation',
            selected_entity_keys: masterRequest.selectedEntityKeys,
            selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
            page_count: null,
            target_format: 'image',
            planner_notes: 'Sibling continuity assets generated as one keyframe dependency grid and cropped per scene-graph node.',
            metadata: { ...commonConfig, ...workflowTemplateMetadata, batch, targetNodes, referenceAssetKeys, dependencyWave, readyToRun: true, createdFromKeyframeDependencyAt: now },
          },
        })
        const child = appendEnsuredChildWorkflow(childAccumulator, ensured)
        assetChildren.push(child)
        return child
      }

      const targetNodeId = readText(targetNode.id)
      const inputHash = sequenceAnimaticStableHash({ targetNode, relevantShotIds: relevantShots.map((shot) => readText(shot.id)), referenceAssetKeys, manifestHash })
      const assetIdentity = `${targetNodeId}:${inputHash}`
      const existing = assetChildren.find((child) => {
        const metadata = asRecord(child.metadata)
        return metadata.sequenceAnimaticStale !== true
          && readScreenplayAnimaticRole(metadata) === 'continuity_asset'
          && readText(metadata.assetIdentity) === assetIdentity
      }) ?? null
      if (existing?.workflowId) return existing
      const workflowId = crypto.randomUUID()
      const assetKind = readText(targetNode.assetKind) || readText(targetNode.nodeKind) || 'continuity_asset'
      const commonConfig = {
        cinematicPipelineVersion: 'v3_script_storyboards',
        graphSpecVersion: sequenceAnimaticGraphSpecVersion,
        screenplayAnimaticRole: 'continuity_asset',
        screenplayAnimaticSource,
        sequenceAnimaticRole: 'continuity_asset',
        masterRequestId: masterRequest.id,
        continuityRequestId: null,
        continuityWorkflowId: null,
        targetNodeId,
        assetKind,
        assetInputHash: inputHash,
        assetIdentity,
        manifestHash,
        continuityPackHash: readText(continuityPack.continuityPackHash),
        masterManifestArtifactKey,
        shotReadySource: provisionalContext ? 'streamed_scene_plan' : keyframePlanSource,
        sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
        worldLocationRefId,
        parentNodeIds: dependencyEdges.filter((edge) => readText(edge.targetNodeId) === targetNodeId).map((edge) => readText(edge.sourceNodeId)).filter(Boolean),
        dependencyWave,
        referenceSelection: {
          selectedReferences: referenceAssetKeys.map((assetKey) => ({ assetKey, role: 'continuity_asset', reason: 'Selected scene-graph dependency reference.' })),
          omittedReferences: [],
        },
        visualBrief: {
          targetName: readText(targetNode.name) || targetNodeId,
          assetKind,
          summary: readText(targetNode.visualBrief) || readText(targetNode.summary),
        },
        provisional: provisionalContext,
      }
      const graphResult = buildValidatedSequenceAnimaticTemplateGraph({
        registry: sequenceAnimaticCommandWorkflowTemplateRegistry,
        templateKey: sequenceAnimaticContinuityAssetTemplateKey,
        rawInput: {
          workflowId,
          draftId: payload.draftId,
          commonConfig,
          continuityPack,
          targetNode,
          targetNodeId,
          assetKind,
          relevantShots,
          shotBindings,
          assetPack: augmentedAssetPack,
          referenceAssetKeys,
          visualDependencyEdges: dependencyEdges,
          aspectRatio: readText(assetPack.aspectRatio) || '16:9',
        },
      })
      const graphParts = graphResult.graph
      const workflowTemplateMetadata = {
        workflowTemplateKey: sequenceAnimaticContinuityAssetTemplateKey,
        workflowTemplateSourceHash: graphResult.sourceHash,
      }
      const title = readText(targetNode.name) || targetNodeId
      const ensured = await ensureMappedChildWorkflow({
        client: admin,
        projectId: payload.projectId,
        draftId: payload.draftId,
        parentRequestId: masterRequest.id,
        role: 'continuity_asset',
        identityKey: 'assetIdentity',
        identityValue: assetIdentity,
        workflow: {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          key: `sequence_animatic_continuity_asset_${slugify(masterRequest.id)}_${slugify(targetNodeId)}_${inputHash.slice(0, 8)}`,
          name: `${title} continuity asset`,
          description: 'Sequence animatic keyframe dependency continuity asset workflow.',
          preset: 'cinematic_episode_from_sequence',
          status: 'active',
          created_by: userId,
          metadata: { ...commonConfig, ...workflowTemplateMetadata, readyToRun: true },
        },
        nodes: graphParts.nodes,
        edges: graphParts.edges,
        request: {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          parent_request_id: masterRequest.id,
          requested_by: userId,
          source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
          prompt: `Generate continuity asset for ${title}.`,
          title: `${title} continuity asset`,
          intent: 'output_generation',
          output_kind: 'cinematic_episode',
          status: 'awaiting_confirmation',
          selected_entity_keys: masterRequest.selectedEntityKeys,
          selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
          page_count: null,
          target_format: 'image',
          planner_notes: 'Node-scoped continuity asset generated as a keyframe dependency.',
          metadata: { ...commonConfig, ...workflowTemplateMetadata, targetNode, referenceAssetKeys, dependencyWave, readyToRun: true, createdFromKeyframeDependencyAt: now },
        },
      })
      const child = appendEnsuredChildWorkflow(childAccumulator, ensured)
      assetChildren.push(child)
      return child
    }
    if (runGroups.length > 0) {
      const groupsByWave = new Map<number, typeof runGroups>()
      for (const group of runGroups) {
        const wave = Math.max(1, Math.min(3, Math.floor(Number((group as { dependencyWave?: number }).dependencyWave ?? 0) || 0)))
          || (group.nodes.some((node) => ['temporary_character', 'prop'].includes(readText(node.nodeKind))) ? 3 : group.isBatch ? 2 : 1)
        groupsByWave.set(wave, [...(groupsByWave.get(wave) ?? []), group])
      }
      for (const [wave, groups] of [...groupsByWave.entries()].sort(([left], [right]) => left - right)) {
        dependencyWaves.push({
          wave,
          kind: wave === 1 ? 'parent_scene_refs' : wave === 2 ? 'sibling_scene_ref_grids' : 'temporary_entity_ref_grids',
          nodeIds: groups.flatMap((group) => group.nodes.map((node) => readText(node.id)).filter(Boolean)),
        })
      }
      if (isShotScopedEnsure && shotGraphDependencyMode !== 'single_node_chain') {
        const [wave, groups] = [...groupsByWave.entries()].sort(([left], [right]) => left - right)[0] ?? [1, []]
        const group = groups[0]
        const child = group ? await ensureContinuityDependencyGroup(group) : null
        if (child) ensuredContinuityAssetRequests.push(child)
        const dependencyNodeIds = group?.nodes.map((node) => readText(node.id)).filter(Boolean) ?? scopedMissingContinuityNodeIds
        return sequenceAnimaticKeyframeWorkflowEnsureResponseSchema.parse({
          ok: true,
          masterRequest,
          keyframePlan: {
            ...keyframePlanWithSource,
            dependencyReadiness: {
              status: 'waiting_for_keyframe_refs',
              dependencyNodeIds: dependencyTargetIds,
              missingDependencyNodeIds: missingDependencyIds,
            },
          },
          visualReferencePlan,
          nextAction: child
            ? childNextAction('run_continuity_asset', child, `Generating next continuity reference wave ${wave}.`, dependencyNodeIds)
            : blockedNextAction('Shot has missing continuity references but no runnable dependency workflow could be prepared.', scopedMissingContinuityNodeIds),
          shotReadiness,
          blockedShotKeyframes: scopedMissingContinuityNodeIds.length > 0 ? [{
            shotId: scopedShotId,
            storyboardBlockId: readText(scopedShotJob?.storyboardBlockId) || null,
            reason: 'missing_continuity_asset' as const,
            coverageSetupId: scopedCoverageSetupId || null,
            previousShotId: null,
            missingContinuityNodeIds: scopedMissingContinuityNodeIds,
          }] : [],
          dependencyWaves,
          continuityAssetRequests: ensuredContinuityAssetRequests,
          coverageAnchorRequests: [],
          shotKeyframeRequests: [],
          childRequests: ensuredContinuityAssetRequests,
          workflows: await workflowsForCreatedIds(),
          nodes: createdNodes,
          edges: createdEdges,
        })
      }
      if (isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain') {
        // In the self-contained shot graph mode, missing continuity references
        // become upstream nodes inside shot_production. Keep legacy batch groups
        // computed for diagnostics, but do not create/run separate children.
      } else {
      for (const group of runGroups) {
        const child = await ensureContinuityDependencyGroup(group)
        if (child) ensuredContinuityAssetRequests.push(child)
      }
      }
    }
    if (ensuredContinuityAssetRequests.length > 0 && !(isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain')) {
      const blockedShotKeyframes = Object.entries(shotBlockingDependencyNodeIdsByShotId).map(([shotId, missingContinuityNodeIds]) => {
        const job = readArray(keyframePlan.shotKeyframeJobs).map(asRecord).find((entry) => readText(entry.shotId) === shotId) ?? {}
        return {
          shotId,
          storyboardBlockId: readText(job.storyboardBlockId) || null,
          reason: 'missing_continuity_asset' as const,
          coverageSetupId: readText(job.coverageSetupId) || null,
          previousShotId: null,
          missingContinuityNodeIds,
        }
      })
      const graphBundle = await loadChildWorkflowGraphBundle({
        client,
        workflowIds: createdWorkflowIds,
      })
      return sequenceAnimaticKeyframeWorkflowEnsureResponseSchema.parse({
        ok: true,
        masterRequest,
        keyframePlan: {
          ...keyframePlanWithSource,
          dependencyReadiness: {
            status: 'waiting_for_keyframe_refs',
            dependencyNodeIds: dependencyTargetIds,
            missingDependencyNodeIds: missingDependencyIds,
          },
        },
        visualReferencePlan,
        nextAction: null,
        shotReadiness: null,
        blockedShotKeyframes,
        dependencyWaves,
        continuityAssetRequests: ensuredContinuityAssetRequests,
        coverageAnchorRequests: [],
        shotKeyframeRequests: [],
        childRequests: ensuredContinuityAssetRequests,
        workflows: graphBundle.workflows,
        nodes: createdNodes,
        edges: createdEdges,
      })
    }

    if (!isShotScopedEnsure || shotGraphDependencyMode !== 'single_node_chain') for (const job of readArray(keyframePlan.coverageAnchorJobs).map(asRecord)) {
      const coverageSetupId = readText(job.coverageSetupId)
      if (!coverageSetupId) continue
      if (payload.mode === 'generate' && readText(coverageAnchorImageBySetupId.get(coverageSetupId)?.assetKey)) continue
      let child = existingByCoverageSetupId.get(coverageSetupId) ?? null
      if (!child) {
        const workflowId = crypto.randomUUID()
        const setup = asRecord(job.coverageSetup)
        const shotIds = readStringArray(job.shotIds)
        const requiredReferenceAssetKeys = readStringArray(coverageAnchorReferenceAssetKeysBySetupId[coverageSetupId])
        const sourceReferenceHash = sequenceAnimaticVisualReferenceHash({ coverageSetupId, requiredReferenceAssetKeys })
        const shots = readArray(asRecord(keyframePlan).shotKeyframeJobs)
          .map(asRecord)
          .map((entry) => asRecord(entry.shot))
          .filter((shot) => shotIds.includes(readText(shot.id)))
        const anchorHash = sequenceAnimaticStableHash({ coverageSetupId, setup, shotIds, manifestHash, directorPlanHash, sourceReferenceHash })
        const commonConfig = {
          cinematicPipelineVersion: 'v3_script_storyboards',
          graphSpecVersion: sequenceAnimaticGraphSpecVersion,
          screenplayAnimaticRole: 'coverage_anchor',
          screenplayAnimaticSource,
          sequenceAnimaticRole: 'coverage_anchor',
          parentRequestId: masterRequest.id,
          masterRequestId: masterRequest.id,
          coverageSetupId,
          coverageAnchorHash: anchorHash,
          shotIds,
          storyboardBlockIds: readStringArray(job.storyboardBlockIds),
          manifestHash,
          directorPlanHash,
          masterManifestArtifactKey,
          requiredReferenceAssetKeys,
          omittedReferenceAssetKeys: [],
          sourceReferenceHash,
          visualPlanHash: readText(visualReferencePlan.visualPlanHash),
          dependencyWave: 4,
          referenceSelection: {
            selectedReferences: readArray(coverageAnchorSelectedReferencesBySetupId[coverageSetupId]).map(asRecord),
            omittedReferences: [],
          },
          visualBrief: {
            title: readText(setup.title) || coverageSetupId,
            staging: readText(setup.stagingBrief ?? setup.staging_brief),
            camera: readText(setup.cameraBrief ?? setup.camera_brief),
            lighting: readText(setup.lightingBrief ?? setup.lighting_brief),
          },
          shotReadySource: provisionalContext ? 'streamed_scene_plan' : keyframePlanSource,
          qcStatus: 'pending',
          qcFindings: [],
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          readyToRun: true,
          provisional: provisionalContext,
        }
        const graphResult = buildValidatedSequenceAnimaticTemplateGraph({
          registry: sequenceAnimaticWorkflowTemplateRegistry,
          templateKey: sequenceAnimaticCoverageAnchorTemplateKey,
          rawInput: {
            workflowId,
            draftId: payload.draftId,
            commonConfig,
            coverageSetup: setup,
            shots,
            assetPack,
            referenceAssetKeys: requiredReferenceAssetKeys,
            aspectRatio,
          },
        })
        const { nodes, edges } = graphResult.graph
        const workflowTemplateMetadata = {
          workflowTemplateKey: sequenceAnimaticCoverageAnchorTemplateKey,
          workflowTemplateSourceHash: graphResult.sourceHash,
        }
        const title = readText(setup.title) || `Coverage ${coverageSetupId}`
        const ensured = await ensureMappedChildWorkflow({
          client: admin,
          projectId: payload.projectId,
          draftId: payload.draftId,
          parentRequestId: masterRequest.id,
          role: 'coverage_anchor',
          identityKey: 'coverageSetupId',
          identityValue: coverageSetupId,
          workflow: {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            key: `sequence_animatic_coverage_anchor_${slugify(masterRequest.id)}_${slugify(coverageSetupId)}_${anchorHash.slice(0, 8)}`,
            name: `${masterRequest.title} / ${title}`,
            description: 'Sequence animatic reusable coverage-anchor keyframe workflow.',
            preset: 'cinematic_episode_from_sequence',
            status: 'active',
            created_by: userId,
            metadata: { ...commonConfig, ...workflowTemplateMetadata },
          },
          nodes,
          edges,
          request: {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            parent_request_id: masterRequest.id,
            requested_by: userId,
            source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
            prompt: `Generate coverage anchor for ${title}.`,
            title: `${masterRequest.title} / ${title}`,
            intent: 'output_generation',
            output_kind: 'cinematic_episode',
            status: 'awaiting_confirmation',
            selected_entity_keys: masterRequest.selectedEntityKeys,
            selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
            page_count: null,
            target_format: 'image',
            planner_notes: 'Reusable coverage anchor prepared from the sequence animatic shot plan.',
            metadata: { ...commonConfig, ...workflowTemplateMetadata, coverageSetup: setup, coverage_setup: setup, createdFromManifestAt: now },
          },
        })
        child = appendEnsuredChildWorkflow(childAccumulator, ensured)
        existingByCoverageSetupId.set(coverageSetupId, child)
      }
      await insertSequenceAnimaticEvent({
        admin,
        projectId: payload.projectId,
        draftId: payload.draftId,
        requestId: masterRequest.id,
        workflowId: child.workflowId,
        eventType: 'coverage_anchor_queued',
        payload: { coverageSetupId, requestId: child.id, workflowId: child.workflowId, shotIds: readStringArray(job.shotIds) },
        dedupeKey: 'coverageSetupId',
        dedupeValue: coverageSetupId,
      })
    }

    if (isShotScopedEnsure && shotGraphDependencyMode !== 'single_node_chain' && scopedShotJob && !scopedCoverageReady) {
      const child = scopedCoverageSetupId ? existingByCoverageSetupId.get(scopedCoverageSetupId) ?? null : null
      return sequenceAnimaticKeyframeWorkflowEnsureResponseSchema.parse({
        ok: true,
        masterRequest,
        keyframePlan: {
          ...keyframePlanWithSource,
          dependencyReadiness: {
            status: 'waiting_for_coverage_anchor',
            dependencyNodeIds: dependencyTargetIds,
            missingDependencyNodeIds: missingDependencyIds,
          },
        },
        visualReferencePlan,
        nextAction: child
          ? childNextAction('run_coverage_anchor', child, 'Generating coverage anchor for this shot setup.')
          : blockedNextAction('Shot requires a coverage anchor, but no coverage workflow could be prepared.'),
        shotReadiness,
        blockedShotKeyframes: [{
          shotId: scopedShotId,
          storyboardBlockId: readText(scopedShotJob.storyboardBlockId) || null,
          reason: 'missing_coverage_anchor' as const,
          coverageSetupId: scopedCoverageSetupId || null,
          previousShotId: null,
          missingContinuityNodeIds: [],
        }],
        dependencyWaves,
        continuityAssetRequests: [],
        coverageAnchorRequests: child ? [child] : [],
        shotKeyframeRequests: [],
        childRequests: child ? [child] : [],
        workflows: await workflowsForCreatedIds(),
        nodes: createdNodes,
        edges: createdEdges,
      })
    }

    const primaryShotSpatialNodeIds = (shot: Record<string, unknown>, coverageSetup: Record<string, unknown>) => {
      const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
      const bindingSpotIds = readStringArray(binding.spotIds ?? binding.spot_ids ?? shot.spotIds ?? shot.spot_ids ?? shot.continuitySpotIds ?? shot.continuity_spot_ids)
      const setupSpotIds = readStringArray(coverageSetup.spotIds ?? coverageSetup.spot_ids)
      const primarySpotId = readText(binding.primarySpotId ?? binding.primary_spot_id ?? shot.primarySpotId ?? shot.primary_spot_id)
        || bindingSpotIds[0]
        || readText(coverageSetup.primarySpotId ?? coverageSetup.primary_spot_id)
        || setupSpotIds[0]
      return [
        readText(binding.setId ?? binding.set_id ?? shot.setId ?? shot.set_id ?? shot.continuitySetId ?? shot.continuity_set_id) || readText(coverageSetup.setId ?? coverageSetup.set_id),
        readText(binding.zoneId ?? binding.zone_id ?? shot.zoneId ?? shot.zone_id ?? shot.continuityZoneId ?? shot.continuity_zone_id) || readText(coverageSetup.zoneId ?? coverageSetup.zone_id),
        primarySpotId,
        readText(binding.viewpointId ?? binding.viewpoint_id ?? shot.viewpointId ?? shot.viewpoint_id) || readText(coverageSetup.viewpointId ?? coverageSetup.viewpoint_id),
        readText(binding.angleId ?? binding.angle_id ?? shot.angleId ?? shot.angle_id ?? shot.continuityAngleId ?? shot.continuity_angle_id),
      ].filter(Boolean)
    }
    const referencedAnimaticAssetNodeIds = (
      shot: Record<string, unknown>,
      coverageSetup: Record<string, unknown>,
      nodeById: Map<string, Record<string, unknown>> = graphNodeById,
    ) => {
      const localNodeIds = new Set([...nodeById.keys()])
      const candidateIds = new Set([
        ...shotReferenceNodeIds(shot, localNodeIds),
        ...readStringArray(asRecord(shot.refs ?? shot.references).characterRefIds ?? asRecord(shot.refs ?? shot.references).character_ref_ids),
        ...readStringArray(asRecord(shot.refs ?? shot.references).visibleCharacterRefIds ?? asRecord(shot.refs ?? shot.references).visible_character_ref_ids),
        ...readStringArray(asRecord(shot.refs ?? shot.references).propRefIds ?? asRecord(shot.refs ?? shot.references).prop_ref_ids),
        ...readStringArray(asRecord(shot.refs ?? shot.references).itemRefIds ?? asRecord(shot.refs ?? shot.references).item_ref_ids),
        ...readStringArray(shot.characterRefIds ?? shot.character_ref_ids),
        ...readStringArray(shot.visibleCharacterRefIds ?? shot.visible_character_ref_ids),
        ...readStringArray(shot.propRefIds ?? shot.prop_ref_ids),
        ...readStringArray(shot.itemRefIds ?? shot.item_ref_ids),
        ...readArray(shot.dialogue).map((line) => readText(asRecord(line).speakerRefId ?? asRecord(line).speaker_ref_id)),
      ].filter(Boolean))
      return [...candidateIds].filter((nodeId) => {
        const node = nodeById.get(nodeId)
        const kind = readText(node?.nodeKind)
        const assetKind = readText(node?.assetKind)
        return kind === 'temporary_character' || kind === 'prop' || assetKind === 'temporary_character' || assetKind === 'prop'
      })
    }
    const scopedRelevantShotsForNodes = (nodes: readonly Record<string, unknown>[], shot: Record<string, unknown>) => {
      const currentShotId = readText(shot.id)
      const currentShot = uniqueShots.find((entry) => readText(entry.id) === currentShotId)
      return currentShot ? [currentShot] : [shot]
    }
    const shotContinuityDependencyNodes = (shot: Record<string, unknown>, coverageSetup: Record<string, unknown>) => {
      const localGraphNodeById = graphNodeMapForShot(allGraphNodes, shot)
      const localGraphNodeIds = new Set([...localGraphNodeById.keys()])
      const directNodeIds = [
        ...primaryShotSpatialNodeIds(shot, coverageSetup),
        ...referencedAnimaticAssetNodeIds(shot, coverageSetup, localGraphNodeById),
      ].filter((nodeId) => localGraphNodeIds.has(nodeId))
      const orderedIds: string[] = []
      const seen = new Set<string>()
      const addWithParents = (nodeId: string) => {
        const chain: string[] = []
        let currentId = nodeId
        const localSeen = new Set<string>()
        while (currentId && localGraphNodeById.has(currentId) && !localSeen.has(currentId)) {
          localSeen.add(currentId)
          chain.push(currentId)
          const parentId = continuityNodeParentId(localGraphNodeById.get(currentId) ?? {})
          if (!parentId || !localGraphNodeById.has(parentId)) break
          currentId = parentId
        }
        for (const id of chain.reverse()) {
          if (seen.has(id)) continue
          seen.add(id)
          orderedIds.push(id)
        }
      }
      directNodeIds.forEach(addWithParents)
      const orderedNodes = orderedIds.map((nodeId) => localGraphNodeById.get(nodeId)).filter((node): node is Record<string, unknown> => Boolean(node))
      const incidentalNodes = incidentalCharacterNodesForShot({ shot, coverageSetup, graphNodeById: localGraphNodeById, contextNodes: orderedNodes })
      return [...orderedNodes, ...incidentalNodes.filter((node) => !seen.has(readText(node.id)))]
    }

    const shotContinuityDependenciesForGraph = (shot: Record<string, unknown>, coverageSetup: Record<string, unknown>) => shotContinuityDependencyNodes(shot, coverageSetup).map((targetNode) => {
      const targetNodeId = readText(targetNode.id)
      const referenceAssetKeys = referenceAssetKeysForTargets([targetNode])
      const relevantShots = scopedRelevantShotsForNodes([targetNode], shot)
      const assetKind = readText(targetNode.assetKind) || readText(targetNode.nodeKind) || 'continuity_asset'
      const assetInputHash = sequenceAnimaticStableHash({
        targetNode,
        relevantShotIds: relevantShots.map((entry) => readText(entry.id)),
        referenceAssetKeys,
        manifestHash,
      })
      const referenceEntities = referenceAssetKeys.map((assetKey) => assetEntityForKey(assetKey, `${readText(targetNode.name) || targetNodeId} dependency`))
      return {
        targetNode,
        targetNodeId,
        assetKind,
        assetInputHash,
        assetState: asRecord(continuityAssetStateByNodeId[targetNodeId]),
        parentNodeIds: dependencyEdges
          .filter((edge) => readText(edge.targetNodeId) === targetNodeId)
          .map((edge) => readText(edge.sourceNodeId))
          .filter(Boolean),
        referenceAssetKeys,
        relevantShots,
        shotBindings,
        assetPack: {
          ...assetPack,
          entities: [...assetPackEntities, ...referenceEntities],
          continuityReferenceAssetKeys: referenceAssetKeys,
        },
        globalAssetIdentity: `${targetNodeId}:${assetInputHash}`,
        dependencyMode: shotGraphDependencyMode,
        dependencyWave: ['temporary_character', 'prop'].includes(assetKind) ? 3 : 1,
        referenceSelection: {
          selectedReferences: referenceAssetKeys.map((assetKey) => ({ assetKey, role: 'continuity_asset', reason: 'Selected scene-graph dependency reference.' })),
          omittedReferences: [],
        },
        visualBrief: {
          targetName: readText(targetNode.name) || targetNodeId,
          assetKind,
          summary: readText(targetNode.visualBrief) || readText(targetNode.summary),
        },
      }
    })

    const blockedShotKeyframes: Array<{
      shotId: string
      storyboardBlockId: string | null
      reason: 'missing_continuity_asset' | 'missing_coverage_anchor' | 'missing_previous_keyframe' | SceneContinuityBlockerReason
      coverageSetupId: string | null
      previousShotId: string | null
      missingContinuityNodeIds: string[]
    }> = []
    for (const job of readArray(keyframePlan.shotKeyframeJobs).map(asRecord)) {
      const shotId = readText(job.shotId)
      if (!shotId) continue
      if (payload.mode === 'generate' && readText(shotKeyframeImageByShotId.get(shotId)?.assetKey) && !(isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain' && shotId === scopedShotId)) continue
      const missingContinuityNodeIds = readStringArray(shotBlockingDependencyNodeIdsByShotId[shotId])
      if (missingContinuityNodeIds.length > 0 && !(isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain')) {
        blockedShotKeyframes.push({
          shotId,
          storyboardBlockId: readText(job.storyboardBlockId) || null,
          reason: 'missing_continuity_asset',
          coverageSetupId: readText(job.coverageSetupId) || null,
          previousShotId: null,
          missingContinuityNodeIds,
        })
        continue
      }
      const coverageSetupIdForReadiness = readText(job.coverageSetupId)
      if (job.requiresCoverageAnchor === true && coverageSetupIdForReadiness && !readText(coverageAnchorImageBySetupId.get(coverageSetupIdForReadiness)?.assetKey) && !(isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain')) {
        // Coverage validation gate: never silently drop a shot — report why it
        // is blocked so the client can offer "generate missing anchors" instead
        // of appearing stuck.
        blockedShotKeyframes.push({
          shotId,
          storyboardBlockId: readText(job.storyboardBlockId) || null,
          reason: 'missing_coverage_anchor',
          coverageSetupId: coverageSetupIdForReadiness,
          previousShotId: null,
          missingContinuityNodeIds: [],
        })
        continue
      }
      const previousShotIdForReadiness = readText(job.previousShotId)
      if (previousShotIdForReadiness && !readText(shotKeyframeImageByShotId.get(previousShotIdForReadiness)?.assetKey)) {
        if (isShotScopedEnsure && shotId === scopedShotId) {
          return sequenceAnimaticKeyframeWorkflowEnsureResponseSchema.parse({
            ok: true,
            masterRequest,
            keyframePlan: {
              ...keyframePlanWithSource,
              dependencyReadiness: {
                status: 'waiting_for_keyframe_refs',
                dependencyNodeIds: dependencyTargetIds,
                missingDependencyNodeIds: missingDependencyIds,
              },
            },
            visualReferencePlan,
            nextAction: blockedNextAction(`Shot is waiting for previous keyframe ${previousShotIdForReadiness}.`, [`shot:${previousShotIdForReadiness}`]),
            shotReadiness,
            blockedShotKeyframes: [{
              shotId,
              storyboardBlockId: readText(job.storyboardBlockId) || null,
              reason: 'missing_previous_keyframe' as const,
              coverageSetupId: null,
              previousShotId: previousShotIdForReadiness,
              missingContinuityNodeIds: [],
            }],
            dependencyWaves,
            continuityAssetRequests: [],
            coverageAnchorRequests: [],
            shotKeyframeRequests: [],
            childRequests: [],
            workflows: await workflowsForCreatedIds(),
            nodes: createdNodes,
            edges: createdEdges,
          })
        }
        blockedShotKeyframes.push({
          shotId,
          storyboardBlockId: readText(job.storyboardBlockId) || null,
          reason: 'missing_previous_keyframe',
          coverageSetupId: null,
          previousShotId: previousShotIdForReadiness,
          missingContinuityNodeIds: [],
        })
        continue
      }
      let child = existingByShotId.get(shotId) ?? null
      const shot = asRecord(job.shot)
      let coverageSetupId = readText(job.coverageSetupId)
      let coverageSetup = coverageSetupId
        ? asRecord(readArray(keyframePlan.coverageAnchorJobs).map(asRecord).find((entry) => readText(entry.coverageSetupId) === coverageSetupId)?.coverageSetup)
        : {}
      const legacyCoverageSetup = coverageSetup
      const coverageResolution = resolveCoverageSetupForShot({
        shot,
        registry: coverageRegistry,
        legacySetup: legacyCoverageSetup,
        forceRefresh: payload.mode === 'regenerate' && shotId === scopedShotId,
      })
      coverageSetup = coverageResolution.coverageSetup
      coverageSetupId = coverageResolution.coverageSetupId
      const priorSetupRecord = coverageRegistry.coverageSetups.find((setup) => readText(setup.id) === coverageSetupId) ?? null
      const nextUsedShotIds = uniqueTexts([...readStringArray(coverageSetup.usedShotIds ?? coverageSetup.used_shot_ids), shotId])
      const nextSetupRecord = {
        ...coverageSetup,
        usedShotIds: nextUsedShotIds,
        used_shot_ids: nextUsedShotIds,
      }
      const coverageRegistryNext = applyCoverageResolutionToRegistry({
        registry: coverageRegistry,
        shotId,
        setup: nextSetupRecord,
      })
      const needsRegistryUpdate = readText(coverageRegistry.coverageSetupByShotId[shotId]) !== coverageSetupId
        || sequenceAnimaticStableHash(priorSetupRecord ?? {}) !== sequenceAnimaticStableHash(nextSetupRecord)
      if (needsRegistryUpdate) {
        const nextMetadata = {
          ...masterMetadataForWrites,
          sequenceAnimaticCoverageRegistry: coverageRegistryNext,
          sequence_animatic_coverage_registry: coverageRegistryNext,
        }
        const registryResponse = await admin
          .from('output_requests')
          .update({ metadata: nextMetadata })
          .eq('id', masterRequest.id)
        if (registryResponse.error) throw new Error(registryResponse.error.message)
        masterMetadataForWrites = nextMetadata
        coverageRegistry = coverageRegistryNext
      }
      coverageSetup = nextSetupRecord
      const coverageJob = coverageSetupId
        ? asRecord(readArray(keyframePlan.coverageAnchorJobs).map(asRecord).find((entry) => readText(entry.coverageSetupId) === coverageSetupId))
        : {}
      const coverageShotIds = uniqueTexts([
        ...readStringArray(coverageJob.shotIds),
        ...readStringArray(coverageSetup.usedShotIds ?? coverageSetup.used_shot_ids),
        shotId,
      ])
      const coverageShots = readArray(keyframePlan.shotKeyframeJobs)
        .map(asRecord)
        .map((entry) => asRecord(entry.shot))
        .filter((entry) => coverageShotIds.includes(readText(entry.id)))
      const scopedCoverageShots = scopedCoverageShotsForShot({ shot, coverageSetup, coverageShots })
      const visualPlanRequiredReferenceAssetKeys = readStringArray(shotRequiredReferenceAssetKeysByShotId[shotId])
      const visualPlanOmittedReferenceAssetKeys = readStringArray(shotOmittedReferenceAssetKeysByShotId[shotId])
      const requiredReferenceAssetKeys = isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain'
        ? graphLocalReferenceKeysForShotProduction(shotId)
        : visualPlanRequiredReferenceAssetKeys
      const selectedReferencesForShotProduction = isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain'
        ? readArray(shotSelectedReferencesByShotId[shotId])
          .map(asRecord)
          .filter((entry) => requiredReferenceAssetKeys.includes(readText(entry.assetKey)))
        : readArray(shotSelectedReferencesByShotId[shotId]).map(asRecord)
      const omittedReferenceAssetKeys = isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain'
        ? readArray(shotOmittedReferencesByShotId[shotId])
          .map(asRecord)
          .filter((entry) => ['entity_reference', 'continuity_asset'].includes(readText(entry.role)))
          .map((entry) => readText(entry.assetKey))
          .filter(Boolean)
        : visualPlanOmittedReferenceAssetKeys
      const sourceReferenceHash = sequenceAnimaticVisualReferenceHash({ shotId, coverageSetupId, requiredReferenceAssetKeys, omittedReferenceAssetKeys })
      const sceneContinuity = sceneContinuityByShotId.get(shotId) ?? { manifest: null, readiness: null }
      const sceneContinuityManifest = sceneContinuity.manifest ?? {}
      const sceneContinuityManifestHash = readText(sceneContinuity.manifest?.sourceHash)
      const shotReferenceReadinessHash = readText(sceneContinuity.readiness?.hash)
        || (sceneContinuity.readiness ? buildShotReferenceReadinessHash(sceneContinuity.readiness) : '')
      const sourceShotHash = sequenceAnimaticStableHash({
        shotId,
        shot,
        coverageSetupId,
        coverageAnchorShotIds: scopedCoverageShots.map((entry) => readText(entry.id)).filter(Boolean),
        sourceReferenceHash,
        sceneContinuityManifestHash,
        shotReferenceReadinessHash,
        graphPolicyVersion: shotGraphPolicyVersion,
        coverageRegistryRevision: coverageRegistry.revision,
        coverageDecision: coverageResolution.coverageDecision,
      })
      const coverageAnchorScopeKey = coverageSetupId ? sequenceAnimaticStableHash({
        coverageSetupId,
        spatial: shotSpatialFingerprint(shot, coverageSetup),
        shotIds: scopedCoverageShots.map((entry) => readText(entry.id)).filter(Boolean),
        subjectRefIds: shotEntityRefIds(shot),
        policy: 'shot_scoped_coverage_anchor_v1',
      }) : ''
      if (child && isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain') {
        const childMetadata = asRecord(child.metadata)
        const staleReason = payload.mode === 'regenerate' && shotId === scopedShotId
          ? 'Shot production graph refresh requested.'
          : !child.workflowId
          ? 'Shot production workflow request had no graph workflow attached.'
          : readScreenplayAnimaticRole(childMetadata) !== 'shot_production'
            || readText(childMetadata.dependencyMode) !== shotGraphDependencyMode
            || readText(childMetadata.shotGraphPolicyVersion) !== shotGraphPolicyVersion
            ? 'Shot production workflow upgraded to self-contained single-node dependency graph.'
            : ''
        if (staleReason) {
          const staleResponse = await admin
            .from('output_requests')
            .update({
              metadata: {
                ...childMetadata,
                sequenceAnimaticStale: true,
                staleReason,
                staleAt: now,
              },
            })
            .eq('id', child.id)
          if (staleResponse.error) throw new Error(staleResponse.error.message)
          staleChildIds.add(child.id)
          child = null
          existingByShotId.delete(shotId)
        }
      }
      if (child && !provisionalContext) {
        const childMetadata = asRecord(child.metadata)
        const childWasProvisional = childMetadata.provisional === true
        const childSourceShotHash = readText(childMetadata.sourceShotHash)
        if (childWasProvisional && childSourceShotHash && childSourceShotHash !== sourceShotHash) {
          const staleResponse = await admin
            .from('output_requests')
            .update({
              metadata: {
                ...childMetadata,
                sequenceAnimaticStale: true,
                staleReason: 'Final shot continuity plan changed after early keyframe generation.',
                staleAt: now,
              },
            })
            .eq('id', child.id)
          if (staleResponse.error) throw new Error(staleResponse.error.message)
          staleChildIds.add(child.id)
          child = null
          existingByShotId.delete(shotId)
        } else if (!childWasProvisional && childMetadata.sequenceAnimaticStale !== true) {
          // Staleness cascade: when the shot's source plan changed since this
          // keyframe was created (manifest or director plan revision), flag the
          // child as stale so the UI can surface "regenerate impacted shots"
          // instead of silently reusing outdated keyframes.
          const childSourceHashForCascade = readText(childMetadata.sourceShotHash)
          if (childSourceHashForCascade && childSourceHashForCascade !== sourceShotHash) {
            const cascadeResponse = await admin
              .from('output_requests')
              .update({
                metadata: {
                  ...childMetadata,
                  sequenceAnimaticStale: true,
                  staleReason: 'Shot continuity plan changed after this keyframe was generated.',
                  staleAt: now,
                },
              })
              .eq('id', child.id)
            if (cascadeResponse.error) throw new Error(cascadeResponse.error.message)
            staleChildIds.add(child.id)
            child = { ...child, metadata: { ...childMetadata, sequenceAnimaticStale: true } }
            existingByShotId.set(shotId, child)
          }
        }
      }
      if (!child) {
        const workflowId = crypto.randomUUID()
        const blockId = readText(job.storyboardBlockId)
        const block = asRecord(asRecord(keyframePlan.blockById)[blockId])
        const continuityDependencies = shotGraphDependencyMode === 'single_node_chain'
          ? shotContinuityDependenciesForGraph(shot, coverageSetup)
          : []
        const keyframeHash = sequenceAnimaticStableHash({ shotId, shot, coverageSetupId, manifestHash, directorPlanHash, sourceReferenceHash, sceneContinuityManifestHash, shotReferenceReadinessHash, graphPolicyVersion: shotGraphPolicyVersion })
        const commonConfig = {
          cinematicPipelineVersion: 'v3_script_storyboards',
          graphSpecVersion: sequenceAnimaticGraphSpecVersion,
          screenplayAnimaticRole: 'shot_production',
          screenplayAnimaticSource,
          sequenceAnimaticRole: 'shot_production',
          dependencyMode: shotGraphDependencyMode,
          shotGraphPolicyVersion,
          parentRequestId: masterRequest.id,
          masterRequestId: masterRequest.id,
          storyboardBlockId: blockId,
          shotId,
          coverageSetupId,
          coverageDecision: coverageResolution.coverageDecision,
          coverageDecisionReason: coverageResolution.coverageDecisionReason,
          coverageCompatibilityDiagnostics: coverageResolution.compatibilityDiagnostics,
          coverageRegistryRevision: coverageRegistry.revision,
          coverageSetupSource: coverageResolution.coverageSetupSource,
          keyframeHash,
          sourceShotHash,
          sceneContinuityManifestHash,
          shotReferenceReadinessHash,
          sceneContinuityManifestStatus: readText(sceneContinuity.manifest?.status),
          manifestHash,
          directorPlanHash,
          masterManifestArtifactKey,
          requiredReferenceAssetKeys,
          omittedReferenceAssetKeys,
          sourceReferenceHash,
          coverageAnchorScopeKey,
          coverageAnchorShotIds: scopedCoverageShots.map((entry) => readText(entry.id)).filter(Boolean),
          coverageAnchorScope: scopedCoverageShots.length === coverageShots.length ? 'coverage_setup' : 'shot_scoped',
          visualPlanHash: readText(visualReferencePlan.visualPlanHash),
          dependencyWave: 5,
          continuityDependencyNodeIds: continuityDependencies.map((entry) => readText(entry.targetNodeId)).filter(Boolean),
          missingContinuityNodeIds,
          referenceSelection: {
            selectedReferences: selectedReferencesForShotProduction,
            omittedReferences: readArray(shotOmittedReferencesByShotId[shotId]).map(asRecord),
          },
          sharedDependencyRequests: [
            ...(coverageSetupId ? [{
              role: 'coverage_anchor',
              identityKey: 'coverageAnchorScopeKey',
              identityValue: coverageAnchorScopeKey,
              coverageSetupId,
              requestId: readText(existingByCoverageSetupId.get(coverageSetupId)?.id),
              workflowId: readText(existingByCoverageSetupId.get(coverageSetupId)?.workflowId),
              status: readText(coverageAnchorImageBySetupId.get(coverageSetupId)?.assetKey) ? 'ready' : 'missing',
            }] : []),
            ...(readText(job.previousShotId) ? [{
              role: 'previous_keyframe',
              identityKey: 'shotId',
              identityValue: readText(job.previousShotId),
              requestId: readText(existingByShotId.get(readText(job.previousShotId))?.id),
              workflowId: readText(existingByShotId.get(readText(job.previousShotId))?.workflowId),
              status: readText(shotKeyframeImageByShotId.get(readText(job.previousShotId))?.assetKey) ? 'ready' : 'missing',
            }] : []),
            ...requiredReferenceAssetKeys.map((assetKey) => ({
              role: 'continuity_asset',
              identityKey: 'assetKey',
              identityValue: assetKey,
              assetKey,
              status: 'ready',
            })),
          ],
          visualBrief: {
            title: readText(shot.title) || shotId,
            action: readText(shot.action) || readText(shot.description),
            camera: asRecord(shot.camera),
            lighting: readText(shot.lighting),
          },
          shotReadySource: provisionalContext ? 'streamed_scene_plan' : keyframePlanSource,
          qcStatus: 'pending',
          qcFindings: [],
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          readyToRun: true,
          provisional: provisionalContext,
        }
        const graphResult = buildValidatedSequenceAnimaticTemplateGraph({
          registry: sequenceAnimaticCommandWorkflowTemplateRegistry,
          templateKey: sequenceAnimaticShotProductionTemplateKey,
          rawInput: {
            workflowId,
            draftId: payload.draftId,
            commonConfig: { ...commonConfig, sceneState: asRecord(job.sceneState), scene_state: asRecord(job.sceneState) },
            block,
            shot,
            panel: {},
            coverageAnchor: coverageSetupId ? coverageAnchorImageBySetupId.get(coverageSetupId) ?? {} : {},
            sceneContinuityManifest,
            coverageSetup,
            coverageShots: scopedCoverageShots.length > 0 ? scopedCoverageShots : [shot],
            coverageReferenceAssetKeys: requiredReferenceAssetKeys,
            previousKeyframe: readText(job.previousShotId) ? shotKeyframeImageByShotId.get(readText(job.previousShotId)) ?? {} : {},
            assetPack,
            continuityDependencies,
            dependencyMode: shotGraphDependencyMode,
            requiredReferenceAssetKeys,
            omittedReferenceAssetKeys,
            selectedReferences: selectedReferencesForShotProduction,
            omittedReferences: readArray(shotOmittedReferencesByShotId[shotId]).map(asRecord),
            sharedDependencyRequests: readArray(commonConfig.sharedDependencyRequests).map(asRecord),
            editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(shot.editorialDurationSeconds ?? 0) || 3)),
            providerDurationSeconds: Math.max(5, Math.min(15, Number(shot.providerDurationSeconds ?? shot.editorialDurationSeconds ?? 0) || 5)),
            aspectRatio,
          },
        })
        const { nodes, edges } = graphResult.graph
        const workflowTemplateMetadata = {
          workflowTemplateKey: sequenceAnimaticShotProductionTemplateKey,
          workflowTemplateSourceHash: graphResult.sourceHash,
        }
        const title = readText(shot.title) || `Shot ${readText(shot.index) || shotId}`
        const ensured = await ensureMappedChildWorkflow({
          client: admin,
          projectId: payload.projectId,
          draftId: payload.draftId,
          parentRequestId: masterRequest.id,
          role: 'shot_production',
          identityKey: 'shotId',
          identityValue: shotId,
          workflow: {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            key: `sequence_animatic_shot_production_${slugify(masterRequest.id)}_${slugify(shotId)}_${slugify(shotGraphPolicyVersion)}_${keyframeHash.slice(0, 8)}`,
            name: `${masterRequest.title} / ${title} Production`,
            description: 'Sequence animatic graph-native shot production workflow.',
            preset: 'cinematic_episode_from_sequence',
            status: 'active',
            created_by: userId,
            metadata: { ...commonConfig, ...workflowTemplateMetadata },
          },
          nodes,
          edges,
          request: {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            parent_request_id: masterRequest.id,
            requested_by: userId,
            source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
            prompt: `Generate shot keyframe and prepare video graph for ${title}.`,
            title: `${masterRequest.title} / ${title} Production`,
            intent: 'output_generation',
            output_kind: 'cinematic_episode',
            status: 'awaiting_confirmation',
            selected_entity_keys: masterRequest.selectedEntityKeys,
            selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
            page_count: null,
            target_format: 'video',
            planner_notes: 'Shot production graph prepared from the sequence animatic shot plan, shared refs, keyframe, and downstream video node.',
            metadata: { ...commonConfig, ...workflowTemplateMetadata, shot, createdFromManifestAt: now },
          },
        })
        child = appendEnsuredChildWorkflow(childAccumulator, ensured)
        existingByShotId.set(shotId, child)
      }
      await insertSequenceAnimaticEvent({
        admin,
        projectId: payload.projectId,
        draftId: payload.draftId,
        requestId: masterRequest.id,
        workflowId: child.workflowId,
        eventType: 'shot_keyframe_queued',
        payload: { shotId, storyboardBlockId: readText(job.storyboardBlockId), coverageSetupId, requestId: child.id, workflowId: child.workflowId },
        dedupeKey: 'shotId',
        dedupeValue: shotId,
      })
    }

    const currentShotProductionRequest = (child: ReturnType<typeof mapOutputRequestRow> | null | undefined) => {
      if (!child || staleChildIds.has(child.id)) return false
      const metadata = asRecord(child.metadata)
      if (metadata.sequenceAnimaticStale === true || !child.workflowId) return false
      const role = readScreenplayAnimaticRole(metadata)
      if (!['shot_keyframe', 'shot_production'].includes(role)) return false
      if (isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain') {
        return role === 'shot_production'
          && readText(metadata.shotId) === scopedShotId
          && readText(metadata.dependencyMode) === shotGraphDependencyMode
          && readText(metadata.shotGraphPolicyVersion) === shotGraphPolicyVersion
      }
      return true
    }
    const dedupeRequests = (requests: Array<ReturnType<typeof mapOutputRequestRow> | null | undefined>) => {
      const seen = new Set<string>()
      return requests.filter((request): request is ReturnType<typeof mapOutputRequestRow> => {
        if (!request || seen.has(request.id)) return false
        seen.add(request.id)
        return true
      })
    }
    const continuityAssetRequests = isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain'
      ? []
      : ensuredChildren.filter((child) => !staleChildIds.has(child.id) && asRecord(child.metadata).sequenceAnimaticStale !== true && ['continuity_asset', 'continuity_asset_batch'].includes(readScreenplayAnimaticRole(asRecord(child.metadata))))
    const coverageAnchorRequests = isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain'
      ? []
      : ensuredChildren.filter((child) => !staleChildIds.has(child.id) && asRecord(child.metadata).sequenceAnimaticStale !== true && readScreenplayAnimaticRole(asRecord(child.metadata)) === 'coverage_anchor')
    const scopedExistingShotRequest = isShotScopedEnsure
      ? existingByShotId.get(scopedShotId) ?? null
      : null
    const shotKeyframeRequests = isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain'
      ? dedupeRequests([scopedExistingShotRequest, ...ensuredChildren]).filter(currentShotProductionRequest)
      : ensuredChildren.filter(currentShotProductionRequest)
    const scopedShotRequest = isShotScopedEnsure
      ? shotKeyframeRequests.find((child) => readText(asRecord(child.metadata).shotId) === scopedShotId) ?? null
      : null
    const responseWorkflowIds = [
      ...createdWorkflowIds,
      ...shotKeyframeRequests.map((child) => child.workflowId).filter((id): id is string => Boolean(id)),
    ].filter((id, index, values) => values.indexOf(id) === index)
    const graphBundle = await loadChildWorkflowGraphBundle({
      client,
      workflowIds: responseWorkflowIds,
    })
    const finalNextAction = isShotScopedEnsure
      ? scopedKeyframeReady
        ? {
          kind: 'keyframe_ready' as const,
          requestId: scopedShotRequest?.id ?? null,
          workflowId: scopedShotRequest?.workflowId ?? null,
          role: scopedShotRequest ? readScreenplayAnimaticRole(asRecord(scopedShotRequest.metadata)) : null,
          reason: 'Shot keyframe is already ready.',
          shotId: scopedShotId,
          coverageSetupId: scopedCoverageSetupId || null,
          dependencyNodeIds: [],
        }
        : scopedShotRequest
          ? childNextAction('run_shot_production_keyframe', scopedShotRequest, 'Generating final shot keyframe.')
          : blockedNextAction(scopedShotJob
            ? `Shot production workflow could not be prepared. Expected active ${shotGraphPolicyVersion} ${shotGraphDependencyMode} graph with workflowId for this shot.`
            : 'Shot production workflow could not be prepared. Shot was not found in the keyframe plan.')
      : null
    if (coverageAnchorRequests.length > 0 && !dependencyWaves.some((wave) => Number(asRecord(wave).wave) === 4)) {
      dependencyWaves.push({
        wave: 4,
        kind: 'coverage_anchors',
        nodeIds: coverageAnchorRequests.map((child) => readText(asRecord(child.metadata).coverageSetupId)).filter(Boolean),
      })
    }
    if (shotKeyframeRequests.length > 0 && !dependencyWaves.some((wave) => Number(asRecord(wave).wave) === 5)) {
      dependencyWaves.push({
        wave: 5,
        kind: 'shot_keyframes',
        nodeIds: shotKeyframeRequests.map((child) => readText(asRecord(child.metadata).shotId)).filter(Boolean),
      })
    }

    return sequenceAnimaticKeyframeWorkflowEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      blockedShotKeyframes,
      keyframePlan: {
        ...keyframePlanWithSource,
        dependencyReadiness: {
          status: isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain'
            ? 'ready_for_keyframes'
            : readText(asRecord(visualReferencePlan.dependencyReadiness).status) || 'ready_for_keyframes',
          dependencyNodeIds: dependencyTargetIds,
          missingDependencyNodeIds: missingDependencyIds,
        },
      },
      visualReferencePlan,
      nextAction: finalNextAction,
      shotReadiness,
      dependencyWaves,
      continuityAssetRequests,
      coverageAnchorRequests,
      shotKeyframeRequests,
      childRequests: isShotScopedEnsure && shotGraphDependencyMode === 'single_node_chain'
        ? shotKeyframeRequests
        : [...continuityAssetRequests, ...coverageAnchorRequests, ...shotKeyframeRequests],
      workflows: graphBundle.workflows,
      nodes: createdNodes,
      edges: createdEdges,
    })
}
