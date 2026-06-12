type LooseRecord = Record<string, unknown>

const sequenceAnimaticGraphSpecVersion = 'sequence_animatic_graph_v2'

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

function stepOutputRecord(
  steps: readonly LooseRecord[],
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

function scenePackageForShot(shot: LooseRecord, scenePackages: readonly LooseRecord[]) {
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
  shot: LooseRecord
  scenePackage: LooseRecord
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

function shotBindingFromShot(shot: LooseRecord, blockId: string) {
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

function graphNodesFromScenePackage(scenePackage: LooseRecord) {
  const scenePackages = readArray(scenePackage.scenePackages ?? scenePackage.scene_packages).map(asRecord)
  const additions = [
    ...readArray(asRecord(scenePackage.sceneGraphDraft ?? scenePackage.scene_graph_draft).additions).map(asRecord),
    ...scenePackages.flatMap((entry) => readArray(asRecord(entry.sceneGraphDraft ?? entry.scene_graph_draft).additions).map(asRecord)),
  ]
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

function mergeById(records: readonly LooseRecord[]) {
  const byId = new Map<string, LooseRecord>()
  for (const record of records) {
    const id = readText(record.id)
    if (!id) continue
    byId.set(id, { ...byId.get(id), ...record, id })
  }
  return [...byId.values()]
}

function continuityLinkRequiresPrevious(shot: LooseRecord) {
  const link = shot.continuityLink ?? shot.continuity_link
  const mode = typeof link === 'string'
    ? link.trim().toLowerCase()
    : readText(asRecord(link).mode ?? asRecord(link).continuityMode ?? asRecord(link).continuity_mode).toLowerCase()
  return ['match_action', 'blocking_change', 'continuation', 'same_motion', 'same_action'].includes(mode)
}

export type SequenceAnimaticStreamedShotReadyContext = {
  source: 'streamed_scene_plan'
  manifest: LooseRecord
  directorPlan: LooseRecord
  assetPack: LooseRecord
  requestedShotIds: string[]
  includedShotIds: string[]
  selectedShots: LooseRecord[]
  coverageSetups: LooseRecord[]
  localReferences: LooseRecord[]
  continuityGraphV2: LooseRecord
  shotBindings: Record<string, LooseRecord>
  provisional: true
}

export function buildSequenceAnimaticStreamedShotReadyContext(input: {
  masterRequestId: string
  events: readonly LooseRecord[]
  steps: readonly LooseRecord[]
  requestedShotIds: readonly string[]
}): SequenceAnimaticStreamedShotReadyContext {
  if (input.requestedShotIds.length === 0) {
    throw new Error('Choose a streamed shot before generating an early keyframe.')
  }
  const scenePackage = stepOutputRecord(input.steps, ['sequence_animatic_scene_graph_assignment', 'sequence_animatic_scene_package'], ['scenePackage', 'scene_package'])
  const assetPack = stepOutputRecord(input.steps, ['cinematic_v3_reference_select', 'cinematic_v2_reference_select'], ['assetPack', 'asset_pack'])
  if (Object.keys(assetPack).length === 0) throw new Error('Reference selection is not ready yet.')
  const scenePackages = readArray(scenePackage.scenePackages ?? scenePackage.scene_packages).map(asRecord)
  const shotsById = new Map<string, LooseRecord>()
  const blocksById = new Map<string, LooseRecord>()
  const coverageSetupsById = new Map<string, LooseRecord>()
  const localReferences: LooseRecord[] = []
  const streamedSets: LooseRecord[] = []
  const streamedZones: LooseRecord[] = []
  const streamedSpots: LooseRecord[] = []
  const streamedViewpoints: LooseRecord[] = []

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
      if (setupId) coverageSetupsById.set(setupId, { ...setup, id: setupId, provisional: true })
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

  const allShots = [...shotsById.values()].sort((left, right) => (Number(left.index ?? 0) || 0) - (Number(right.index ?? 0) || 0))
  const requestedShotSet = new Set(input.requestedShotIds)
  const selectedShots = allShots.filter((shot) => requestedShotSet.has(readText(shot.id)))
  if (selectedShots.length === 0) throw new Error('That streamed shot is not ready yet.')
  const missingBindingShot = selectedShots.find((shot) => {
    const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
    return !readText(binding.setId ?? binding.set_id) && !readText(binding.worldLocationRefId ?? binding.world_location_ref_id)
  })
  if (missingBindingShot) throw new Error(`Shot ${readText(missingBindingShot.id)} binding is not ready yet.`)

  if (blocksById.size === 0) {
    for (const shot of allShots) {
      const blockId = readText(shot.blockId ?? shot.storyboardBlockId) || 'block_001'
      const block = blocksById.get(blockId) ?? { id: blockId, index: blocksById.size + 1, title: `Block ${blocksById.size + 1}`, summary: 'Streamed shot continuity records.', shotIds: [], status: 'planned', provisional: true }
      const shotIds = readStringArray(asRecord(block).shotIds)
      if (!shotIds.includes(readText(shot.id))) shotIds.push(readText(shot.id))
      blocksById.set(blockId, { ...asRecord(block), shotIds })
    }
  }
  for (const shot of allShots) {
    const blockId = readText(shot.blockId ?? shot.storyboardBlockId) || 'block_001'
    const block = blocksById.get(blockId)
    if (!block) continue
    const shotIds = readStringArray(block.shotIds)
    if (!shotIds.includes(readText(shot.id))) blocksById.set(blockId, { ...block, shotIds: [...shotIds, readText(shot.id)] })
  }

  const includedShotIds = new Set(input.requestedShotIds)
  for (const shotId of [...includedShotIds]) {
    const currentIndex = allShots.findIndex((shot) => readText(shot.id) === shotId)
    if (currentIndex > 0 && continuityLinkRequiresPrevious(allShots[currentIndex])) {
      const previousShotId = readText(allShots[currentIndex - 1]?.id)
      if (previousShotId) includedShotIds.add(previousShotId)
    }
  }
  const includedShots = allShots.filter((shot) => includedShotIds.has(readText(shot.id)))
  const includedBlockIds = new Set(includedShots.map((shot) => readText(shot.storyboardBlockId ?? shot.blockId)).filter(Boolean))

  const packageGraph = graphNodesFromScenePackage(scenePackage)
  const shotBindings: Record<string, LooseRecord> = {}
  for (const shot of includedShots) {
    const blockId = readText(shot.storyboardBlockId ?? shot.blockId) || 'block_001'
    shotBindings[readText(shot.id)] = shotBindingFromShot(shot, blockId)
  }
  const continuityGraphV2 = {
    version: 'sequence_animatic_continuity_graph_v2',
    planningMode: 'streamed_shot_ready',
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
    .filter((block) => includedBlockIds.has(readText(block.id)))
    .map((block) => {
      const shotIds = readStringArray(block.shotIds).filter((shotId) => includedShotIds.has(shotId))
      return {
        ...block,
        shotIds,
        shots: shotIds.map((shotId) => shotsById.get(shotId)).filter(Boolean),
      }
    })
    .filter((block) => readArray(block.shots).length > 0)
  const coverageSetups = [...coverageSetupsById.values()].filter((setup) => {
    const usedShotIds = readStringArray(setup.usedShotIds ?? setup.used_shot_ids)
    if (usedShotIds.some((shotId) => includedShotIds.has(shotId))) return true
    const setupId = readText(setup.id)
    return includedShots.some((shot) => readText(shot.coverageSetupId ?? shot.coverage_setup_id) === setupId)
  })
  const directorPlan = {
    role: 'sequence_animatic_director_plan',
    contractVersion: 'shot_continuity_plan_v2',
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    screenplayAnimaticRole: 'director_plan',
    sequenceAnimaticRole: 'director_plan',
    masterRequestId: input.masterRequestId,
    source: 'streamed_scene_plan',
    shots: includedShots,
    blocks: blocks.map((block) => ({ ...block, shots: undefined })),
    coverageSetups,
    coverage_setups: coverageSetups,
    coverageSetupByShotId: Object.fromEntries(includedShots.map((shot) => [readText(shot.id), readText(shot.coverageSetupId ?? shot.coverage_setup_id)] as const).filter(([, setupId]) => setupId)),
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    shotBindings,
    shot_bindings: shotBindings,
    outputLocalReferences: localReferences,
    output_local_references: localReferences,
    provisional: true,
  }
  const manifest = {
    role: 'sequence_animatic_manifest',
    masterRequestId: input.masterRequestId,
    source: 'streamed_scene_plan',
    assetPack,
    blocks,
    shotPlan: {
      sceneId: 'sequence_animatic_streamed',
      shots: includedShots,
      totalEditorialDurationSeconds: includedShots.reduce((total, shot) => total + (Number(shot.editorialDurationSeconds ?? shot.durationSeconds) || 0), 0),
    },
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    shotBindings,
    shot_bindings: shotBindings,
    provisional: true,
  }
  return {
    source: 'streamed_scene_plan',
    manifest,
    directorPlan,
    assetPack,
    requestedShotIds: [...requestedShotSet],
    includedShotIds: [...includedShotIds],
    selectedShots,
    coverageSetups,
    localReferences,
    continuityGraphV2,
    shotBindings,
    provisional: true,
  }
}
