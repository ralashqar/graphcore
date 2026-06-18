import { sequenceAnimaticStableHash } from './sequence-animatic-workflow-factory.ts'

type LooseRecord = Record<string, unknown>

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return readArray(value).map(readText).filter(Boolean)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'item'
}

function sequenceAnimaticBatchLayout(count: number) {
  const safeCount = Math.max(1, Math.min(9, Math.floor(count) || 1))
  if (safeCount <= 1) return { rows: 1, columns: 1, cellCount: 1 }
  if (safeCount <= 2) return { rows: 1, columns: 2, cellCount: safeCount }
  if (safeCount <= 4) return { rows: 2, columns: 2, cellCount: safeCount }
  if (safeCount <= 6) return { rows: 2, columns: 3, cellCount: safeCount }
  return { rows: 3, columns: 3, cellCount: safeCount }
}

function sequenceAnimaticContinuityNodeCollections(graphInput: unknown) {
  const graph = asRecord(graphInput)
  return [
    ...readArray(graph.locationSets ?? graph.location_sets).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_set', assetKind: 'location_zone' })),
    ...readArray(graph.zones).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_zone', assetKind: 'location_zone' })),
    ...readArray(graph.spots).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_spot', assetKind: 'location_spot' })),
    ...readArray(graph.viewpoints).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_viewpoint', assetKind: 'location_angle' })),
    ...readArray(graph.angles).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_angle', assetKind: 'location_angle' })),
    ...readArray(graph.assetAnchors ?? graph.asset_anchors).map((entry) => {
      const record = asRecord(entry)
      const type = readText(record.type) || readText(record.anchorType)
      return {
        ...record,
        nodeKind: type === 'character' ? 'temporary_character' : type === 'prop' ? 'prop' : readText(record.nodeKind) || 'location_anchor',
        assetKind: type === 'character' ? 'temporary_character' : type === 'prop' ? 'prop' : 'location_spot',
      }
    }),
  ].filter((entry) => readText(entry.id))
}

function sequenceAnimaticNodeRequiredMap(requirementsInput: unknown) {
  const map = new Map<string, { required: boolean; assetType: string; priority: string; worldReferenceAssetKeys: string[] }>()
  for (const requirement of readArray(requirementsInput).map(asRecord)) {
    const nodeId = readText(requirement.sceneGraphNodeId ?? requirement.nodeId ?? requirement.id)
    if (!nodeId) continue
    const previous = map.get(nodeId)
    map.set(nodeId, {
      required: previous?.required === true || requirement.required === true || readText(requirement.priority) === 'required',
      assetType: readText(requirement.assetType ?? requirement.type) || previous?.assetType || '',
      priority: readText(requirement.priority) || previous?.priority || '',
      worldReferenceAssetKeys: [...new Set([
        ...(previous?.worldReferenceAssetKeys ?? []),
        ...readStringArray(requirement.worldReferenceAssetKeys ?? requirement.referenceAssetKeys),
      ])],
    })
  }
  return map
}

function sequenceAnimaticNodeBlockIds(node: LooseRecord, shotBindings: LooseRecord) {
  const ids = new Set(readStringArray(node.blockIds))
  for (const shotId of readStringArray(node.shotIds)) {
    const binding = asRecord(shotBindings[shotId])
    const blockId = readText(binding.storyboardBlockId)
    if (blockId) ids.add(blockId)
  }
  return [...ids]
}

function sequenceAnimaticWorldReferenceAssetKeysForNode(node: LooseRecord, assetPack: LooseRecord) {
  const worldKey = readText(node.worldLocationRefId) || readText(node.baseLocationRefId) || readText(node.worldRefId) || readText(node.worldEntityKey)
  if (!worldKey) return []
  const entity = readArray(assetPack.entities).map(asRecord).find((entry) => readText(entry.key) === worldKey) ?? null
  if (!entity) return []
  return [...new Set([
    readText(entity.primaryAssetKey),
    readText(entity.selectedReferenceAssetKey),
    ...readStringArray(entity.assetKeys),
  ].filter(Boolean))].slice(0, 3)
}

export function sequenceAnimaticContinuityAssetBatches(input: {
  directorPlan: LooseRecord
  manifest: LooseRecord
}) {
  const graph = asRecord(input.directorPlan.continuityGraphV2 ?? input.directorPlan.continuity_graph_v2)
  const assetPack = asRecord(input.manifest.assetPack)
  const shotBindings = asRecord(input.directorPlan.shotBindings ?? input.directorPlan.shot_bindings ?? graph.shotBindings)
  const requiredByNode = sequenceAnimaticNodeRequiredMap(input.directorPlan.assetRequirements ?? input.directorPlan.asset_requirements)
  const targets = sequenceAnimaticContinuityNodeCollections(graph)
    .filter((node) => requiredByNode.has(readText(node.id)) || readText(node.assetRequired) === 'true' || node.assetRequired === true || node.required === true)
  const batches: LooseRecord[] = []
  const pushBatch = (kind: string, nodes: LooseRecord[], sourceReferenceNodeIds: string[] = []) => {
    const cleanNodes = nodes.filter((node) => readText(node.id))
    if (cleanNodes.length === 0) return
    const targetNodeIds = cleanNodes.map((node) => readText(node.id)).filter(Boolean)
    const requirementInfo = targetNodeIds.map((id) => requiredByNode.get(id)).filter(Boolean)
    const required = requirementInfo.some((entry) => entry?.required === true)
    const blockIds = [...new Set(cleanNodes.flatMap((node) => sequenceAnimaticNodeBlockIds(node, shotBindings)))]
    const worldReferenceAssetKeys = [...new Set([
      ...cleanNodes.flatMap((node) => sequenceAnimaticWorldReferenceAssetKeysForNode(node, assetPack)),
      ...requirementInfo.flatMap((entry) => entry?.worldReferenceAssetKeys ?? []),
    ])].slice(0, 8)
    batches.push({
      batchId: `batch_${slugify(kind)}_${sequenceAnimaticStableHash({ kind, targetNodeIds }).slice(0, 8)}`,
      batchKind: kind,
      targetNodeIds,
      sourceReferenceNodeIds: [...new Set(sourceReferenceNodeIds.filter(Boolean))],
      worldReferenceAssetKeys,
      blockIds,
      layout: sequenceAnimaticBatchLayout(kind === 'single_hero_ref' || kind === 'location_zone_board' ? 1 : cleanNodes.length),
      required,
      targetNodes: cleanNodes,
    })
  }
  const setsAndZones = targets.filter((node) => ['location_set', 'location_zone'].includes(readText(node.nodeKind)))
  for (const node of setsAndZones) pushBatch('location_zone_board', [node], [readText(node.worldLocationRefId)].filter(Boolean))
  const anglesByZone = new Map<string, LooseRecord[]>()
  targets.filter((node) => readText(node.nodeKind) === 'location_angle' || readText(node.nodeKind) === 'location_viewpoint').forEach((node) => {
    const zoneId = readText(node.zoneId) || readText(node.setId) || 'global'
    anglesByZone.set(zoneId, [...(anglesByZone.get(zoneId) ?? []), node])
  })
  anglesByZone.forEach((nodes, zoneId) => {
    nodes.length === 1 ? pushBatch('single_hero_ref', nodes, [zoneId]) : pushBatch('angle_grid', nodes, [zoneId])
  })
  const spotsByZone = new Map<string, LooseRecord[]>()
  targets.filter((node) => readText(node.nodeKind) === 'location_spot').forEach((node) => {
    const zoneId = readText(node.zoneId) || 'global'
    spotsByZone.set(zoneId, [...(spotsByZone.get(zoneId) ?? []), node])
  })
  spotsByZone.forEach((nodes, zoneId) => {
    nodes.length === 1 ? pushBatch('single_hero_ref', nodes, [zoneId]) : pushBatch('spot_grid', nodes, [zoneId])
  })
  const anchors = targets.filter((node) => ['temporary_character', 'prop'].includes(readText(node.nodeKind)) || ['temporary_character', 'prop'].includes(readText(node.assetKind)))
  const groupedAnchors = new Map<string, LooseRecord[]>()
  anchors.forEach((node) => {
    const kind = readText(node.assetKind) === 'temporary_character' || readText(node.nodeKind) === 'temporary_character' ? 'temp_character_grid' : 'prop_grid'
    const blockKey = sequenceAnimaticNodeBlockIds(node, shotBindings).join('_') || 'global'
    const key = `${kind}:${blockKey}`
    groupedAnchors.set(key, [...(groupedAnchors.get(key) ?? []), node])
  })
  groupedAnchors.forEach((nodes, key) => {
    const kind = key.startsWith('temp_character_grid:') ? 'temp_character_grid' : 'prop_grid'
    const heroNodes = nodes.filter((node) => readStringArray(node.shotIds).length >= 3 || readText(node.importance) === 'hero' || readText(node.priority) === 'hero')
    heroNodes.forEach((node) => pushBatch('single_hero_ref', [node]))
    const incidental = nodes.filter((node) => !heroNodes.includes(node))
    for (let index = 0; index < incidental.length; index += 6) {
      const slice = incidental.slice(index, index + 6)
      slice.length === 1 ? pushBatch('single_hero_ref', slice) : pushBatch(kind, slice)
    }
  })
  return batches.filter((batch, index, list) => {
    const ids = readStringArray(batch.targetNodeIds).join('|')
    return list.findIndex((candidate) => readStringArray(candidate.targetNodeIds).join('|') === ids) === index
  })
}
