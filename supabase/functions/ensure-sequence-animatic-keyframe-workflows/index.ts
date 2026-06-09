import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputRequestRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputRequestSelect,
} from '../_shared/output-workflow.ts'
import {
  sequenceAnimaticKeyframeWorkflowEnsureRequestSchema,
  sequenceAnimaticKeyframeWorkflowEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  buildSequenceAnimaticContinuityAssetWorkflowGraph,
  buildSequenceAnimaticContinuityBatchWorkflowGraph,
  buildSequenceAnimaticCoverageAnchorWorkflowGraph,
  buildSequenceAnimaticPlannedKeyframeWorkflowGraph,
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from '../_shared/sequence-animatic-workflow-factory.ts'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'output'
}

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function readScreenplayAnimaticSource(metadata: Record<string, unknown>, fallback: 'wiki_sequence_unit' | 'prompt_cinematic' = 'wiki_sequence_unit') {
  const source = readText(metadata.screenplayAnimaticSource)
  return source === 'prompt_cinematic' || source === 'wiki_sequence_unit' ? source : fallback
}

function artifactMetadataRecord(
  artifacts: readonly Record<string, unknown>[],
  roles: readonly string[],
  fields: readonly string[],
) {
  for (const artifact of artifacts) {
    const metadata = asRecord(artifact.metadata)
    if (!roles.includes(readText(metadata.role))) continue
    for (const field of fields) {
      const record = asRecord(metadata[field])
      if (Object.keys(record).length > 0) return record
    }
  }
  return {}
}

function imageFromArtifact(artifact: Record<string, unknown> | null) {
  if (!artifact) return {}
  const metadata = asRecord(artifact.metadata)
  const image = asRecord(metadata.image)
  const assetKey = readText(metadata.assetKey) || readText(artifact.asset_key) || readText(image.assetKey)
  if (!assetKey) return {}
  return {
    ...image,
    assetKey,
    artifactKey: readText(artifact.key),
    role: readText(metadata.role),
  }
}

function continuityNodeCollections(graph: Record<string, unknown>) {
  return [
    ...readArray(graph.locationSets ?? graph.location_sets).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_set', assetKind: 'location_set' })),
    ...readArray(graph.zones).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_zone', assetKind: 'location_zone' })),
    ...readArray(graph.spots).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_spot', assetKind: 'location_spot' })),
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
  ].filter((entry) => readText(entry.id))
}

function continuityVisualDependencyEdges(graph: Record<string, unknown>) {
  const edges: Record<string, unknown>[] = []
  const push = (sourceNodeId: string, targetNodeId: string, relationship: string, required = false, evidence = '') => {
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return
    edges.push({ sourceNodeId, targetNodeId, relationship, required, evidence })
  }
  readArray(graph.locationSets ?? graph.location_sets).map(asRecord).forEach((set) => push(readText(set.worldLocationRefId), readText(set.id), 'world_location_to_set', true))
  readArray(graph.zones).map(asRecord).forEach((zone) => push(readText(zone.setId), readText(zone.id), 'set_to_zone', true))
  readArray(graph.spots).map(asRecord).forEach((spot) => push(readText(spot.zoneId), readText(spot.id), 'zone_to_spot', true))
  const viewpoints = readArray(graph.viewpoints).length > 0 ? readArray(graph.viewpoints) : readArray(graph.angles)
  viewpoints.map(asRecord).forEach((angle) => {
    push(readText(angle.setId), readText(angle.id), 'set_to_angle', true)
    push(readText(angle.zoneId), readText(angle.id), 'zone_to_angle', true)
    readStringArray(angle.spotIds).forEach((spotId) => push(spotId, readText(angle.id), 'spot_to_angle', false))
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

function continuityNodeParentId(node: Record<string, unknown>) {
  const nodeKind = readText(node.nodeKind)
  if (nodeKind === 'location_spot') {
    return readText(node.zoneId) || readText(node.setId) || readText(node.worldLocationRefId) || readText(node.baseLocationRefId)
  }
  if (nodeKind === 'location_viewpoint' || nodeKind === 'location_angle') {
    return readStringArray(node.spotIds)[0]
      || readText(node.spotId)
      || readText(node.zoneId)
      || readText(node.setId)
      || readText(node.worldLocationRefId)
      || readText(node.baseLocationRefId)
  }
  if (nodeKind === 'location_zone') return readText(node.setId) || readText(node.worldLocationRefId) || readText(node.baseLocationRefId)
  if (nodeKind === 'location_set') return readText(node.worldLocationRefId) || readText(node.baseLocationRefId)
  return readText(node.parentId) || readText(node.parent_id)
}

function continuityBatchKindForNodes(nodes: readonly Record<string, unknown>[]) {
  const kinds = [...new Set(nodes.map((node) => readText(node.nodeKind)).filter(Boolean))]
  if (kinds.length !== 1) return ''
  if (kinds[0] === 'location_spot') return 'spot_grid'
  if (kinds[0] === 'location_viewpoint' || kinds[0] === 'location_angle') return 'viewpoint_grid'
  return ''
}

function continuityNodeUsesParent(node: Record<string, unknown>, parentId: string) {
  if (!parentId) return false
  if (readText(node.id) === parentId) return false
  return continuityNodeParentId(node) === parentId
}

function assetEntityForKey(assetKey: string, label: string) {
  return {
    key: `continuity_ref_${slugify(assetKey)}`,
    name: label || 'Continuity reference',
    type: 'continuity_asset',
    role: 'continuity_reference',
    summary: 'Previously generated continuity asset used as a visual dependency.',
    visualDescription: 'Use this reference to preserve style, material, lighting, spatial layout, and design continuity.',
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
    selectedReferenceVariantKey: 'continuity_asset',
    selectedReferenceVariantLabel: label || 'Continuity reference',
    selectedReferenceVariantType: 'continuity_asset',
    referenceSelectionReason: 'Scene-graph continuity visual dependency.',
  }
}

function shotSceneBindingNodeIds(shot: Record<string, unknown>) {
  const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
  return [
    readText(binding.setId ?? shot.setId),
    readText(binding.zoneId ?? shot.zoneId),
    readText(binding.primarySpotId ?? shot.primarySpotId),
    ...readStringArray(binding.spotIds ?? shot.spotIds),
    readText(binding.viewpointId ?? shot.viewpointId),
    readText(binding.angleId ?? shot.angleId),
  ].filter(Boolean)
}

function shotReferenceNodeIds(shot: Record<string, unknown>, graphNodeIds: Set<string>) {
  const refs = readArray(shot.refs ?? shot.references).map(asRecord)
  return refs
    .map((ref) => readText(ref.entityKey) || readText(ref.refId) || readText(ref.id))
    .filter((id) => id && graphNodeIds.has(id))
}

function coverageSetupNodeIds(setup: Record<string, unknown>) {
  return [
    readText(setup.setId ?? setup.set_id),
    readText(setup.zoneId ?? setup.zone_id),
    readText(setup.primarySpotId ?? setup.primary_spot_id),
    ...readStringArray(setup.spotIds ?? setup.spot_ids),
    readText(setup.viewpointId ?? setup.viewpoint_id),
    ...readStringArray(setup.characterRefIds ?? setup.character_ref_ids),
  ].filter(Boolean)
}

function dependencyNodeIdsForKeyframePlan(input: {
  keyframePlan: Record<string, unknown>
  graphNodeIds: Set<string>
}) {
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

async function insertSequenceAnimaticEvent(input: {
  admin: ReturnType<typeof createAdminClient>
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

function shotContinuityLinkRequiresPrevious(shot: Record<string, unknown>) {
  const link = readText(shot.continuityLink ?? shot.continuity_link).toLowerCase()
  return ['match_action', 'blocking_change', 'continuation', 'same_motion', 'same_action'].includes(link)
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
      return setupShots.length > 1 || setupShots.some(shotContinuityLinkRequiresPrevious)
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
  for (const shotId of [...includedShotIds]) {
    let currentId = shotId
    const seen = new Set<string>()
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId)
      const currentIndex = shotIndexById.get(currentId)
      if (currentIndex === undefined || currentIndex <= 0) break
      const currentShot = mergedShots[currentIndex]
      if (!shotContinuityLinkRequiresPrevious(currentShot)) break
      const previousShotId = readText(mergedShots[currentIndex - 1]?.id)
      if (!previousShotId) break
      includedShotIds.add(previousShotId)
      currentId = previousShotId
    }
  }
  const filteredShots = mergedShots.filter((shot) => includedShotIds.has(readText(shot.id)))
  const shotKeyframeJobs = filteredShots.map((shot) => {
    const setupId = readText(shot.coverageSetupId ?? shot.coverage_setup_id)
    const currentIndex = shotIndexById.get(readText(shot.id))
    const previousShot = currentIndex !== undefined && currentIndex > 0 ? mergedShots[currentIndex - 1] : null
    return {
      id: `shot_keyframe_${readText(shot.id)}`,
      shotId: readText(shot.id),
      shot,
      storyboardBlockId: readText(shot.storyboardBlockId ?? shot.blockId),
      coverageSetupId: setupId,
      requiresCoverageAnchor: Boolean(setupId && coverageAnchorJobs.some((job) => job.coverageSetupId === setupId)),
      previousShotId: shotContinuityLinkRequiresPrevious(shot) ? readText(previousShot?.id) : '',
      dependencyOnly: requestedShotSet.size > 0 && !requestedShotSet.has(readText(shot.id)),
    }
  })
  return {
    version: 'sequence_animatic_keyframe_plan_v1',
    coverageAnchorJobs,
    shotKeyframeJobs,
    coverageAnchorCount: coverageAnchorJobs.length,
    shotKeyframeCount: shotKeyframeJobs.length,
    blockCount: blocks.length,
    shotCount: mergedShots.length,
    blockById: Object.fromEntries(blocks.map((block) => [readText(block.id), block]).filter(([id]) => id)),
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-keyframe-workflows')
    const admin = createAdminClient('ensure-sequence-animatic-keyframe-workflows')
    const payload = sequenceAnimaticKeyframeWorkflowEnsureRequestSchema.parse(await request.json())

    const masterResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')
    const masterRequest = mapOutputRequestRow(masterResponse.data)
    const masterMetadata = asRecord(masterRequest.metadata)
    if (readScreenplayAnimaticRole(masterMetadata) !== 'master') throw new HttpError(409, 'This output is not a screenplay animatic master request.')
    if (!masterRequest.workflowId) throw new HttpError(409, 'Screenplay animatic master has no workflow yet.')
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
    const manifest = artifactMetadataRecord(masterArtifacts, ['sequence_animatic_manifest'], ['manifest', 'sequenceAnimaticManifest', 'sequence_animatic_manifest'])
    if (Object.keys(manifest).length === 0) throw new HttpError(409, 'Generate the screenplay animatic manifest first.')
    const directorPlan = artifactMetadataRecord(masterArtifacts, ['sequence_animatic_director_plan'], ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
    if (Object.keys(directorPlan).length === 0) throw new HttpError(409, 'Generate the shot continuity plan first.')
    const manifestHash = sequenceAnimaticStableHash(manifest)
    const directorPlanHash = readText(directorPlan.shotPlanHash) || sequenceAnimaticStableHash(directorPlan)
    const masterManifestArtifactKey = readText(masterArtifacts.find((row) => readText(asRecord(row.metadata).role) === 'sequence_animatic_manifest')?.key)
    const assetPack = asRecord(manifest.assetPack)
    const aspectRatio = readText(assetPack.aspectRatio) || '16:9'
    const keyframePlan = deriveKeyframePlan({
      manifest,
      directorPlan,
      requestedShotIds: payload.shotIds ?? [],
      requestedCoverageSetupIds: payload.coverageSetupIds ?? [],
    })

    const childResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', masterRequest.id)
      .order('created_at', { ascending: true })
    if (childResponse.error) throw new Error(childResponse.error.message)
    const existingChildren = (childResponse.data ?? []).map(mapOutputRequestRow)
      .filter((child) => asRecord(child.metadata).sequenceAnimaticStale !== true)
    const existingByCoverageSetupId = new Map(existingChildren
      .filter((child) => readScreenplayAnimaticRole(asRecord(child.metadata)) === 'coverage_anchor')
      .map((child) => [readText(asRecord(child.metadata).coverageSetupId), child] as const)
      .filter(([id]) => id))
    const existingByShotId = new Map(existingChildren
      .filter((child) => readScreenplayAnimaticRole(asRecord(child.metadata)) === 'shot_keyframe')
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
    const ensuredChildren = [...existingChildren]
    const createdWorkflowIds: string[] = []
    const createdNodes: Record<string, unknown>[] = []
    const createdEdges: Record<string, unknown>[] = []
    const ensuredContinuityAssetRequests: ReturnType<typeof mapOutputRequestRow>[] = []
    const dependencyWaves: Record<string, unknown>[] = []

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
    const parentMissingIds = new Set<string>()
    for (const nodeId of missingDependencyIds) {
      const node = graphNodeById.get(nodeId)
      if (!node) continue
      const parentId = continuityNodeParentId(node)
      if (parentId && graphNodeById.has(parentId) && !assetStateReady(parentId)) parentMissingIds.add(parentId)
    }
    const initialRunnableIds = parentMissingIds.size > 0
      ? [...parentMissingIds]
      : missingDependencyIds.filter((nodeId) => {
        const node = graphNodeById.get(nodeId)
        if (!node) return false
        const parentId = continuityNodeParentId(node)
        return !parentId || !graphNodeById.has(parentId) || assetStateReady(parentId)
      })
    const runnableIds = new Set<string>(initialRunnableIds)
    for (const nodeId of initialRunnableIds) {
      const node = graphNodeById.get(nodeId)
      if (!node) continue
      const nodeKind = readText(node.nodeKind)
      if (nodeKind !== 'location_spot' && nodeKind !== 'location_viewpoint' && nodeKind !== 'location_angle') continue
      const parentId = continuityNodeParentId(node)
      if (!parentId) continue
      allGraphNodes
        .filter((candidate) => !assetStateReady(readText(candidate.id)))
        .filter((candidate) => readText(candidate.nodeKind) === nodeKind)
        .filter((candidate) => continuityNodeUsesParent(candidate, parentId))
        .slice(0, 4)
        .forEach((candidate) => runnableIds.add(readText(candidate.id)))
    }
    const runnableNodes = [...runnableIds].map((nodeId) => graphNodeById.get(nodeId)).filter((node): node is Record<string, unknown> => Boolean(node))
    const grouped = new Map<string, Record<string, unknown>[]>()
    const runGroups: { nodes: Record<string, unknown>[]; isBatch: boolean }[] = []
    for (const node of runnableNodes) {
      const kind = readText(node.nodeKind)
      const batchable = kind === 'location_spot' || kind === 'location_viewpoint' || kind === 'location_angle'
      const parentId = continuityNodeParentId(node)
      if (!batchable || !parentId) {
        runGroups.push({ nodes: [node], isBatch: false })
        continue
      }
      const key = `${kind}:${parentId}`
      grouped.set(key, [...(grouped.get(key) ?? []), node])
    }
    for (const group of grouped.values()) {
      if (group.length <= 1) runGroups.push({ nodes: group, isBatch: false })
      else {
        for (let index = 0; index < group.length; index += 4) {
          const chunk = group.slice(index, index + 4)
          runGroups.push({ nodes: chunk, isBatch: chunk.length > 1 })
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
        if (!batchKind || !parentId) return null
        const batch = {
          batchId: `keyframe_${batchKind}_${slugify(parentId)}_${sequenceAnimaticStableHash(targetNodeIds).slice(0, 8)}`,
          batchKind,
          targetNodeIds,
          sourceReferenceNodeIds: [
            parentId,
            ...allGraphNodes
              .filter((node) => !targetNodeIds.includes(readText(node.id)))
              .filter((node) => readText(node.nodeKind) === readText(targetNode.nodeKind))
              .filter((node) => continuityNodeUsesParent(node, parentId))
              .filter((node) => readText(asRecord(continuityAssetStateByNodeId[readText(node.id)]).assetKey))
              .map((node) => readText(node.id)),
          ].filter(Boolean),
          worldReferenceAssetKeys: referenceAssetKeys,
          blockIds: [...new Set(targetNodes.flatMap((node) => readStringArray(node.storyboardBlockIds ?? node.blockIds)))],
          layout: { rows: 2, columns: 2, cellCount: targetNodeIds.length },
          required: true,
          generationPolicy: 'keyframe_dependency_sibling_grid',
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
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          worldLocationRefId,
          parentNodeIds: readStringArray(batch.sourceReferenceNodeIds),
        }
        const graphParts = buildSequenceAnimaticContinuityBatchWorkflowGraph({
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
        })
        const targetNames = targetNodes.map((node) => readText(node.name) || readText(node.id)).filter(Boolean)
        const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
          p_project_id: payload.projectId,
          p_draft_id: payload.draftId,
          p_parent_request_id: masterRequest.id,
          p_role: 'continuity_asset_batch',
          p_identity_key: 'continuityBatchIdentity',
          p_identity_value: continuityBatchIdentity,
          p_workflow: {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            key: `sequence_animatic_continuity_asset_batch_${slugify(masterRequest.id)}_${slugify(readText(batch.batchId))}_${inputHash.slice(0, 8)}`,
            name: `${targetNames.slice(0, 3).join(', ')} continuity grid`,
            description: 'Sequence animatic keyframe dependency continuity grid workflow.',
            preset: 'cinematic_episode_from_sequence',
            status: 'active',
            created_by: user.id,
            metadata: { ...commonConfig, batch, readyToRun: true },
          },
          p_nodes: graphParts.nodes,
          p_edges: graphParts.edges,
          p_request: {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            parent_request_id: masterRequest.id,
            requested_by: user.id,
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
            metadata: { ...commonConfig, batch, targetNodes, referenceAssetKeys, readyToRun: true, createdFromKeyframeDependencyAt: now },
          },
        })
        if (ensureResponse.error || !ensureResponse.data) throw new Error(ensureResponse.error?.message ?? 'Failed to ensure keyframe dependency continuity grid.')
        const ensured = asRecord(ensureResponse.data)
        const child = mapOutputRequestRow(asRecord(ensured.request) as never)
        ensuredChildren.push(child)
        assetChildren.push(child)
        const workflow = asRecord(ensured.workflow)
        if (readText(workflow.id)) createdWorkflowIds.push(readText(workflow.id))
        createdNodes.push(...readArray(ensured.nodes).map(asRecord))
        createdEdges.push(...readArray(ensured.edges).map(asRecord))
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
        sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
        worldLocationRefId,
        parentNodeIds: dependencyEdges.filter((edge) => readText(edge.targetNodeId) === targetNodeId).map((edge) => readText(edge.sourceNodeId)).filter(Boolean),
      }
      const graphParts = buildSequenceAnimaticContinuityAssetWorkflowGraph({
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
      })
      const title = readText(targetNode.name) || targetNodeId
      const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
        p_project_id: payload.projectId,
        p_draft_id: payload.draftId,
        p_parent_request_id: masterRequest.id,
        p_role: 'continuity_asset',
        p_identity_key: 'assetIdentity',
        p_identity_value: assetIdentity,
        p_workflow: {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          key: `sequence_animatic_continuity_asset_${slugify(masterRequest.id)}_${slugify(targetNodeId)}_${inputHash.slice(0, 8)}`,
          name: `${title} continuity asset`,
          description: 'Sequence animatic keyframe dependency continuity asset workflow.',
          preset: 'cinematic_episode_from_sequence',
          status: 'active',
          created_by: user.id,
          metadata: { ...commonConfig, readyToRun: true },
        },
        p_nodes: graphParts.nodes,
        p_edges: graphParts.edges,
        p_request: {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          parent_request_id: masterRequest.id,
          requested_by: user.id,
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
          metadata: { ...commonConfig, targetNode, referenceAssetKeys, readyToRun: true, createdFromKeyframeDependencyAt: now },
        },
      })
      if (ensureResponse.error || !ensureResponse.data) throw new Error(ensureResponse.error?.message ?? 'Failed to ensure keyframe dependency continuity asset.')
      const ensured = asRecord(ensureResponse.data)
      const child = mapOutputRequestRow(asRecord(ensured.request) as never)
      ensuredChildren.push(child)
      assetChildren.push(child)
      const workflow = asRecord(ensured.workflow)
      if (readText(workflow.id)) createdWorkflowIds.push(readText(workflow.id))
      createdNodes.push(...readArray(ensured.nodes).map(asRecord))
      createdEdges.push(...readArray(ensured.edges).map(asRecord))
      return child
    }
    if (runGroups.length > 0) {
      dependencyWaves.push({
        wave: parentMissingIds.size > 0 ? 1 : 2,
        kind: parentMissingIds.size > 0 ? 'parent_scene_refs' : 'sibling_scene_ref_grids',
        nodeIds: runGroups.flatMap((group) => group.nodes.map((node) => readText(node.id)).filter(Boolean)),
      })
      for (const group of runGroups) {
        const child = await ensureContinuityDependencyGroup(group)
        if (child) ensuredContinuityAssetRequests.push(child)
      }
    }
    if (ensuredContinuityAssetRequests.length > 0) {
      const workflowsResponse = createdWorkflowIds.length > 0
        ? await client.from('output_workflows').select('*').in('id', createdWorkflowIds)
        : { data: [], error: null }
      if (workflowsResponse.error) throw new Error(workflowsResponse.error.message)
      return json(sequenceAnimaticKeyframeWorkflowEnsureResponseSchema.parse({
        ok: true,
        masterRequest,
        keyframePlan: {
          ...asRecord(keyframePlan),
          dependencyReadiness: {
            status: 'waiting_for_continuity_assets',
            dependencyNodeIds: dependencyTargetIds,
            missingDependencyNodeIds: missingDependencyIds,
          },
        },
        dependencyWaves,
        continuityAssetRequests: ensuredContinuityAssetRequests,
        coverageAnchorRequests: [],
        shotKeyframeRequests: [],
        childRequests: ensuredContinuityAssetRequests,
        workflows: (workflowsResponse.data ?? []).map((row) => mapOutputWorkflowRow(asRecord(row) as never)),
        nodes: createdNodes.map((row) => mapOutputWorkflowNodeRow(row as never)),
        edges: createdEdges.map((row) => mapOutputWorkflowEdgeRow(row as never)),
      }))
    }

    for (const job of readArray(keyframePlan.coverageAnchorJobs).map(asRecord)) {
      const coverageSetupId = readText(job.coverageSetupId)
      if (!coverageSetupId) continue
      if (payload.mode === 'generate' && readText(coverageAnchorImageBySetupId.get(coverageSetupId)?.assetKey)) continue
      let child = existingByCoverageSetupId.get(coverageSetupId) ?? null
      if (!child) {
        const workflowId = crypto.randomUUID()
        const setup = asRecord(job.coverageSetup)
        const shotIds = readStringArray(job.shotIds)
        const shots = readArray(asRecord(keyframePlan).shotKeyframeJobs)
          .map(asRecord)
          .map((entry) => asRecord(entry.shot))
          .filter((shot) => shotIds.includes(readText(shot.id)))
        const anchorHash = sequenceAnimaticStableHash({ coverageSetupId, setup, shotIds, manifestHash, directorPlanHash })
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
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          readyToRun: true,
        }
        const { nodes, edges } = buildSequenceAnimaticCoverageAnchorWorkflowGraph({
          workflowId,
          draftId: payload.draftId,
          commonConfig,
          coverageSetup: setup,
          shots,
          assetPack,
          referenceAssetKeys: [],
          aspectRatio,
        })
        const title = readText(setup.title) || `Coverage ${coverageSetupId}`
        const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
          p_project_id: payload.projectId,
          p_draft_id: payload.draftId,
          p_parent_request_id: masterRequest.id,
          p_role: 'coverage_anchor',
          p_identity_key: 'coverageSetupId',
          p_identity_value: coverageSetupId,
          p_workflow: {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            key: `sequence_animatic_coverage_anchor_${slugify(masterRequest.id)}_${slugify(coverageSetupId)}_${anchorHash.slice(0, 8)}`,
            name: `${masterRequest.title} / ${title}`,
            description: 'Sequence animatic reusable coverage-anchor keyframe workflow.',
            preset: 'cinematic_episode_from_sequence',
            status: 'active',
            created_by: user.id,
            metadata: commonConfig,
          },
          p_nodes: nodes,
          p_edges: edges,
          p_request: {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            parent_request_id: masterRequest.id,
            requested_by: user.id,
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
            metadata: { ...commonConfig, coverageSetup: setup, coverage_setup: setup, createdFromManifestAt: now },
          },
        })
        if (ensureResponse.error || !ensureResponse.data) throw new Error(ensureResponse.error?.message ?? 'Failed to ensure coverage anchor workflow.')
        const ensured = asRecord(ensureResponse.data)
        child = mapOutputRequestRow(asRecord(ensured.request) as never)
        ensuredChildren.push(child)
        existingByCoverageSetupId.set(coverageSetupId, child)
        const workflow = asRecord(ensured.workflow)
        if (readText(workflow.id)) createdWorkflowIds.push(readText(workflow.id))
        createdNodes.push(...readArray(ensured.nodes).map(asRecord))
        createdEdges.push(...readArray(ensured.edges).map(asRecord))
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

    for (const job of readArray(keyframePlan.shotKeyframeJobs).map(asRecord)) {
      const shotId = readText(job.shotId)
      if (!shotId) continue
      if (payload.mode === 'generate' && readText(shotKeyframeImageByShotId.get(shotId)?.assetKey)) continue
      const coverageSetupIdForReadiness = readText(job.coverageSetupId)
      if (job.requiresCoverageAnchor === true && coverageSetupIdForReadiness && !readText(coverageAnchorImageBySetupId.get(coverageSetupIdForReadiness)?.assetKey)) {
        continue
      }
      const previousShotIdForReadiness = readText(job.previousShotId)
      if (previousShotIdForReadiness && !readText(shotKeyframeImageByShotId.get(previousShotIdForReadiness)?.assetKey)) {
        continue
      }
      let child = existingByShotId.get(shotId) ?? null
      if (!child) {
        const workflowId = crypto.randomUUID()
        const shot = asRecord(job.shot)
        const blockId = readText(job.storyboardBlockId)
        const block = asRecord(asRecord(keyframePlan.blockById)[blockId])
        const coverageSetupId = readText(job.coverageSetupId)
        const coverageSetup = coverageSetupId
          ? asRecord(readArray(keyframePlan.coverageAnchorJobs).map(asRecord).find((entry) => readText(entry.coverageSetupId) === coverageSetupId)?.coverageSetup)
          : {}
        const keyframeHash = sequenceAnimaticStableHash({ shotId, shot, coverageSetupId, manifestHash, directorPlanHash })
        const commonConfig = {
          cinematicPipelineVersion: 'v3_script_storyboards',
          graphSpecVersion: sequenceAnimaticGraphSpecVersion,
          screenplayAnimaticRole: 'shot_keyframe',
          screenplayAnimaticSource,
          sequenceAnimaticRole: 'shot_keyframe',
          parentRequestId: masterRequest.id,
          masterRequestId: masterRequest.id,
          storyboardBlockId: blockId,
          shotId,
          coverageSetupId,
          keyframeHash,
          manifestHash,
          directorPlanHash,
          masterManifestArtifactKey,
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          readyToRun: true,
        }
        const { nodes, edges } = buildSequenceAnimaticPlannedKeyframeWorkflowGraph({
          workflowId,
          draftId: payload.draftId,
          commonConfig,
          block,
          shot,
          coverageSetup,
          coverageAnchor: coverageSetupId ? coverageAnchorImageBySetupId.get(coverageSetupId) ?? {} : {},
          previousKeyframe: readText(job.previousShotId) ? shotKeyframeImageByShotId.get(readText(job.previousShotId)) ?? {} : {},
          storyboardPanel: {},
          assetPack,
          aspectRatio,
        })
        const title = readText(shot.title) || `Shot ${readText(shot.index) || shotId}`
        const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
          p_project_id: payload.projectId,
          p_draft_id: payload.draftId,
          p_parent_request_id: masterRequest.id,
          p_role: 'shot_keyframe',
          p_identity_key: 'shotId',
          p_identity_value: shotId,
          p_workflow: {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            key: `sequence_animatic_shot_keyframe_${slugify(masterRequest.id)}_${slugify(shotId)}_${keyframeHash.slice(0, 8)}`,
            name: `${masterRequest.title} / ${title} Keyframe`,
            description: 'Sequence animatic final shot keyframe workflow.',
            preset: 'cinematic_episode_from_sequence',
            status: 'active',
            created_by: user.id,
            metadata: commonConfig,
          },
          p_nodes: nodes,
          p_edges: edges,
          p_request: {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            parent_request_id: masterRequest.id,
            requested_by: user.id,
            source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
            prompt: `Generate shot keyframe for ${title}.`,
            title: `${masterRequest.title} / ${title} Keyframe`,
            intent: 'output_generation',
            output_kind: 'cinematic_episode',
            status: 'awaiting_confirmation',
            selected_entity_keys: masterRequest.selectedEntityKeys,
            selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
            page_count: null,
            target_format: 'image',
            planner_notes: 'Shot keyframe prepared from the sequence animatic shot plan and continuity refs.',
            metadata: { ...commonConfig, shot, createdFromManifestAt: now },
          },
        })
        if (ensureResponse.error || !ensureResponse.data) throw new Error(ensureResponse.error?.message ?? 'Failed to ensure shot keyframe workflow.')
        const ensured = asRecord(ensureResponse.data)
        child = mapOutputRequestRow(asRecord(ensured.request) as never)
        ensuredChildren.push(child)
        existingByShotId.set(shotId, child)
        const workflow = asRecord(ensured.workflow)
        if (readText(workflow.id)) createdWorkflowIds.push(readText(workflow.id))
        createdNodes.push(...readArray(ensured.nodes).map(asRecord))
        createdEdges.push(...readArray(ensured.edges).map(asRecord))
      }
      await insertSequenceAnimaticEvent({
        admin,
        projectId: payload.projectId,
        draftId: payload.draftId,
        requestId: masterRequest.id,
        workflowId: child.workflowId,
        eventType: 'shot_keyframe_queued',
        payload: { shotId, storyboardBlockId: readText(job.storyboardBlockId), coverageSetupId: readText(job.coverageSetupId), requestId: child.id, workflowId: child.workflowId },
        dedupeKey: 'shotId',
        dedupeValue: shotId,
      })
    }

    const workflowsResponse = createdWorkflowIds.length > 0
      ? await client.from('output_workflows').select('*').in('id', createdWorkflowIds)
      : { data: [], error: null }
    if (workflowsResponse.error) throw new Error(workflowsResponse.error.message)
    const continuityAssetRequests = ensuredChildren.filter((child) => ['continuity_asset', 'continuity_asset_batch'].includes(readScreenplayAnimaticRole(asRecord(child.metadata))))
    const coverageAnchorRequests = ensuredChildren.filter((child) => readScreenplayAnimaticRole(asRecord(child.metadata)) === 'coverage_anchor')
    const shotKeyframeRequests = ensuredChildren.filter((child) => readScreenplayAnimaticRole(asRecord(child.metadata)) === 'shot_keyframe')

    return json(sequenceAnimaticKeyframeWorkflowEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      keyframePlan: {
        ...asRecord(keyframePlan),
        dependencyReadiness: {
          status: 'ready_for_keyframes',
          dependencyNodeIds: dependencyTargetIds,
          missingDependencyNodeIds: missingDependencyIds,
        },
      },
      dependencyWaves,
      continuityAssetRequests,
      coverageAnchorRequests,
      shotKeyframeRequests,
      childRequests: [...continuityAssetRequests, ...coverageAnchorRequests, ...shotKeyframeRequests],
      workflows: (workflowsResponse.data ?? []).map((row) => mapOutputWorkflowRow(asRecord(row) as never)),
      nodes: createdNodes.map((row) => mapOutputWorkflowNodeRow(row as never)),
      edges: createdEdges.map((row) => mapOutputWorkflowEdgeRow(row as never)),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to ensure sequence animatic keyframe workflows.')
  }
})
