type LooseRecord = Record<string, unknown>

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

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = readText(value)
    if (text) return text
  }
  return ''
}

export function spotCameraGridNodeId(spotId: string): string {
  const cleanSpotId = readText(spotId)
  return cleanSpotId ? `${cleanSpotId}::camera_grid` : ''
}

export function continuityNodeCollections(graph: LooseRecord): LooseRecord[] {
  const spots = readArray(graph.spots).map(asRecord)
  const spotCameraGridNodes = spots.map((spot) => {
    const spotId = readText(spot.id)
    const gridId = spotCameraGridNodeId(spotId)
    const spotName = readText(spot.name) || readText(spot.title) || spotId
    return {
      id: gridId,
      name: spotName ? `${spotName} camera grid` : 'Camera grid',
      nodeKind: 'spot_camera_grid',
      assetKind: 'spot_camera_grid',
      parentId: spotId,
      spotId,
      spotIds: [spotId].filter(Boolean),
      zoneId: firstText(spot.zoneId, spot.zone_id, spot.parentZoneId, spot.parent_zone_id, spot.parentId, spot.parent_id),
      setId: firstText(spot.setId, spot.set_id),
      worldLocationRefId: firstText(spot.worldLocationRefId, spot.world_location_ref_id, spot.baseLocationRefId, spot.base_location_ref_id),
      storyboardBlockIds: readStringArray(spot.storyboardBlockIds ?? spot.storyboard_block_ids ?? spot.blockIds ?? spot.block_ids),
      shotIds: readStringArray(spot.shotIds ?? spot.shot_ids),
      visualBrief: `Reusable multi-angle camera grid around ${spotName || 'this spot'}, grounded in the parent zone map and local spot reference.`,
      summary: `Reusable multi-angle camera grid around ${spotName || 'this spot'}.`,
    }
  }).filter((entry) => readText(entry.id))
  const nodes: LooseRecord[] = [
    ...readArray(graph.locationSets ?? graph.location_sets ?? graph.sets).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_set', assetKind: 'location_set' })),
    ...readArray(graph.zones).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_zone', assetKind: 'location_zone' })),
    ...spots.map((entry) => ({ ...entry, nodeKind: 'location_spot', assetKind: 'location_spot' })),
    ...spotCameraGridNodes,
    ...readArray(graph.viewpoints).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_viewpoint', assetKind: 'location_angle' })),
    ...readArray(graph.angles).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_angle', assetKind: 'location_angle' })),
    ...readArray(graph.assetAnchors ?? graph.asset_anchors).map((entry) => {
      const record = asRecord(entry)
      const type = readText(record.type) || readText(record.anchorType)
      return {
        ...record,
        nodeKind: type === 'character' ? 'temporary_character' : type === 'prop' ? 'prop' : 'location_anchor',
        assetKind: type === 'character' ? 'temporary_character' : type === 'prop' ? 'prop' : 'location_spot',
      }
    }),
  ]
  return nodes.filter((entry) => readText(entry.id))
}

export function continuityVisualDependencyEdges(graph: LooseRecord): LooseRecord[] {
  const edges: LooseRecord[] = []
  const push = (sourceNodeId: string, targetNodeId: string, relationship: string, required = false, evidence = '') => {
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return
    edges.push({ sourceNodeId, targetNodeId, relationship, required, evidence })
  }
  readArray(graph.locationSets ?? graph.location_sets ?? graph.sets).map(asRecord).forEach((set) => {
    push(firstText(set.worldLocationRefId, set.world_location_ref_id, set.baseLocationRefId, set.base_location_ref_id, set.parentId, set.parent_id), readText(set.id), 'world_location_to_set', true)
  })
  readArray(graph.zones).map(asRecord).forEach((zone) => {
    push(firstText(zone.setId, zone.set_id, zone.parentSetId, zone.parent_set_id, zone.parentId, zone.parent_id, zone.worldLocationRefId, zone.world_location_ref_id), readText(zone.id), 'set_to_zone', true)
  })
  readArray(graph.spots).map(asRecord).forEach((spot) => {
    const spotId = readText(spot.id)
    const gridId = spotCameraGridNodeId(spotId)
    const zoneId = firstText(spot.zoneId, spot.zone_id, spot.parentZoneId, spot.parent_zone_id, spot.parentId, spot.parent_id)
    push(zoneId, spotId, 'zone_to_spot', true)
    push(zoneId, gridId, 'zone_to_spot_camera_grid', true)
    push(spotId, gridId, 'spot_to_camera_grid', true)
  })
  const viewpoints = readArray(graph.viewpoints).length > 0 ? readArray(graph.viewpoints) : readArray(graph.angles)
  viewpoints.map(asRecord).forEach((angle) => {
    push(firstText(angle.setId, angle.set_id), readText(angle.id), 'set_to_angle', true)
    push(firstText(angle.zoneId, angle.zone_id, angle.parentZoneId, angle.parent_zone_id), readText(angle.id), 'zone_to_angle', true)
    readStringArray(angle.spotIds ?? angle.spot_ids).forEach((spotId) => push(spotId, readText(angle.id), 'spot_to_angle', false))
  })
  readArray(graph.edges).map(asRecord).forEach((edge) => {
    const relationship = readText(edge.relationship)
    if (['adjacent_to', 'visible_from', 'entrance_to', 'connected_to', 'same_space_angle'].includes(relationship)) {
      push(readText(edge.sourceId), readText(edge.targetId), relationship, false, readText(edge.evidence))
    }
  })
  const seen = new Set<string>()
  return edges.filter((edge) => {
    const key = `${edge.sourceNodeId}:${edge.relationship}:${edge.targetNodeId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function continuityNodeParentId(node: LooseRecord): string {
  const nodeKind = readText(node.nodeKind)
  if (nodeKind === 'location_spot') {
    return firstText(node.zoneId, node.zone_id, node.parentZoneId, node.parent_zone_id, node.parentId, node.parent_id, node.setId, node.set_id, node.worldLocationRefId, node.world_location_ref_id, node.baseLocationRefId, node.base_location_ref_id)
  }
  if (nodeKind === 'location_viewpoint' || nodeKind === 'location_angle') {
    return readStringArray(node.spotIds ?? node.spot_ids)[0]
      || firstText(node.spotId, node.spot_id, node.parentSpotId, node.parent_spot_id, node.parentId, node.parent_id, node.zoneId, node.zone_id, node.setId, node.set_id, node.worldLocationRefId, node.world_location_ref_id, node.baseLocationRefId, node.base_location_ref_id)
  }
  if (nodeKind === 'spot_camera_grid') {
    return firstText(node.spotId, node.spot_id)
      || readStringArray(node.spotIds ?? node.spot_ids)[0]
      || firstText(node.parentId, node.parent_id, node.zoneId, node.zone_id, node.setId, node.set_id, node.worldLocationRefId, node.world_location_ref_id, node.baseLocationRefId, node.base_location_ref_id)
  }
  if (nodeKind === 'location_zone') return firstText(node.setId, node.set_id, node.parentSetId, node.parent_set_id, node.parentId, node.parent_id, node.worldLocationRefId, node.world_location_ref_id, node.baseLocationRefId, node.base_location_ref_id)
  if (nodeKind === 'location_set') return firstText(node.worldLocationRefId, node.world_location_ref_id, node.baseLocationRefId, node.base_location_ref_id, node.parentId, node.parent_id)
  return readText(node.parentId) || readText(node.parent_id)
}

export function continuityBatchKindForNodes(nodes: readonly LooseRecord[]): string {
  if (nodes.length > 1) {
    const parent = nodes[0] ?? {}
    const parentId = readText(parent.id)
    const parentKind = readText(parent.nodeKind)
    const children = nodes.slice(1)
    const parentChildBatch = parentId
      && (parentKind === 'location_set' || parentKind === 'location_zone' || parentKind === 'location_spot')
      && children.length > 0
      && children.every((node) => {
        const kind = readText(node.nodeKind)
        return (kind === 'location_zone' || kind === 'location_spot' || kind === 'location_viewpoint' || kind === 'location_angle')
          && continuityNodeParentId(node) === parentId
      })
    if (parentChildBatch) return 'parent_child_scaffold_grid'
  }
  const kinds = [...new Set(nodes.map((node) => readText(node.nodeKind)).filter(Boolean))]
  if (kinds.length !== 1) return ''
  if (kinds[0] === 'location_zone') return 'location_zone_board'
  if (kinds[0] === 'location_spot') return 'spot_grid'
  if (kinds[0] === 'spot_camera_grid') return 'spot_camera_grid'
  if (kinds[0] === 'location_viewpoint' || kinds[0] === 'location_angle') return 'viewpoint_grid'
  if (kinds[0] === 'temporary_character') return 'temp_character_grid'
  if (kinds[0] === 'prop') return 'prop_grid'
  return ''
}

export function continuityBatchLayoutForTargetCount(count: number): { rows: number; columns: number; cellCount: number } {
  const cellCount = Math.max(1, Math.min(4, Math.floor(count) || 1))
  if (cellCount === 1) return { rows: 1, columns: 1, cellCount }
  if (cellCount === 2) return { rows: 1, columns: 2, cellCount }
  return { rows: 2, columns: 2, cellCount }
}

export function continuityAtlasLayoutForTargetCount(count: number): { rows: number; columns: number; cellCount: number } {
  const cellCount = Math.max(1, Math.min(9, Math.floor(count) || 1))
  if (cellCount <= 4) return { rows: 2, columns: 2, cellCount }
  return { rows: 3, columns: 3, cellCount }
}

export function continuitySpotCameraGridLayoutForTargetCount(count: number): { rows: number; columns: number; cellCount: number } {
  const cellCount = Math.max(1, Math.min(9, Math.floor(count) || 1))
  return cellCount <= 6
    ? { rows: 2, columns: 3, cellCount }
    : { rows: 3, columns: 3, cellCount }
}

export function continuityNodeUsesParent(node: LooseRecord, parentId: string): boolean {
  if (!parentId) return false
  if (readText(node.id) === parentId) return false
  return continuityNodeParentId(node) === parentId
}

export function shotSceneBindingNodeIds(shot: LooseRecord): string[] {
  const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
  const primarySpotId = readText(binding.primarySpotId ?? shot.primarySpotId)
  const spotIds = [
    primarySpotId,
    ...readStringArray(binding.spotIds ?? shot.spotIds),
  ].filter(Boolean)
  return [
    readText(binding.setId ?? shot.setId),
    readText(binding.zoneId ?? shot.zoneId),
    ...spotIds,
    ...spotIds.map(spotCameraGridNodeId),
    readText(binding.viewpointId ?? shot.viewpointId),
    readText(binding.angleId ?? shot.angleId),
  ].filter(Boolean)
}

export function shotReferenceNodeIds(shot: LooseRecord, graphNodeIds: Set<string>): string[] {
  const refsValue = shot.refs ?? shot.references
  const refsRecord = asRecord(refsValue)
  const refs = readArray(refsValue).map(asRecord)
  return [
    ...refs
      .map((ref) => readText(ref.entityKey) || readText(ref.refId) || readText(ref.id))
      .filter((id) => id && graphNodeIds.has(id)),
    ...readStringArray(refsRecord.localReferenceIds ?? refsRecord.local_reference_ids),
    ...readStringArray(refsRecord.continuityAnchorIds ?? refsRecord.continuity_anchor_ids),
    ...readStringArray(refsRecord.continuityAnchorRefIds ?? refsRecord.continuity_anchor_ref_ids),
    ...readStringArray(refsRecord.visibleCharacterRefIds ?? refsRecord.visible_character_ref_ids),
    ...readStringArray(refsRecord.speakerRefIds ?? refsRecord.speaker_ref_ids),
    ...readStringArray(refsRecord.characterRefIds ?? refsRecord.character_ref_ids),
    ...readStringArray(refsRecord.propRefIds ?? refsRecord.prop_ref_ids),
    ...readStringArray(refsRecord.itemRefIds ?? refsRecord.item_ref_ids),
    ...readStringArray(shot.localReferenceIds ?? shot.local_reference_ids),
    ...readStringArray(shot.continuityAnchorIds ?? shot.continuity_anchor_ids),
    ...readStringArray(shot.continuityAnchorRefIds ?? shot.continuity_anchor_ref_ids),
    ...readStringArray(shot.visibleCharacterRefIds ?? shot.visible_character_ref_ids),
    ...readStringArray(shot.speakerRefIds ?? shot.speaker_ref_ids),
    ...readStringArray(shot.characterRefIds ?? shot.character_ref_ids),
    ...readStringArray(shot.propRefIds ?? shot.prop_ref_ids),
    ...readStringArray(shot.itemRefIds ?? shot.item_ref_ids),
    ...readArray(shot.dialogue).map((line) => readText(asRecord(line).speakerRefId ?? asRecord(line).speaker_ref_id)),
  ].filter((id) => id && graphNodeIds.has(id))
}

export function coverageSetupNodeIds(setup: LooseRecord): string[] {
  const primarySpotId = readText(setup.primarySpotId ?? setup.primary_spot_id)
  const spotIds = [
    primarySpotId,
    ...readStringArray(setup.spotIds ?? setup.spot_ids),
  ].filter(Boolean)
  return [
    readText(setup.setId ?? setup.set_id),
    readText(setup.zoneId ?? setup.zone_id),
    ...spotIds,
    ...spotIds.map(spotCameraGridNodeId),
    readText(setup.viewpointId ?? setup.viewpoint_id),
    ...readStringArray(setup.characterRefIds ?? setup.character_ref_ids),
    ...readStringArray(setup.visibleCharacterRefIds ?? setup.visible_character_ref_ids),
    ...readStringArray(setup.propRefIds ?? setup.prop_ref_ids),
    ...readStringArray(setup.itemRefIds ?? setup.item_ref_ids),
    ...readStringArray(setup.localReferenceIds ?? setup.local_reference_ids),
  ].filter(Boolean)
}

export function dependencyNodeIdsForKeyframePlan(input: {
  keyframePlan: LooseRecord
  graphNodeIds: Set<string>
}): string[] {
  const ids = new Set<string>()
  readArray(input.keyframePlan.shotKeyframeJobs).map(asRecord).forEach((job) => {
    const shot = asRecord(job.shot)
    shotSceneBindingNodeIds(shot).forEach((id) => ids.add(id))
    shotReferenceNodeIds(shot, input.graphNodeIds).forEach((id) => ids.add(id))
  })
  readArray(input.keyframePlan.coverageAnchorJobs).map(asRecord).forEach((job) => {
    coverageSetupNodeIds(asRecord(job.coverageSetup)).forEach((id) => ids.add(id))
  })
  return [...ids].filter((id) => input.graphNodeIds.has(id))
}
