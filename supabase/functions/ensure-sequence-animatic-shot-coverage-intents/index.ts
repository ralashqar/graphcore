import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputRequestRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputRequestSelect,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  resolveSequenceAnimaticCombinedManifest,
} from '../_shared/output-workflow.ts'
import {
  buildSequenceAnimaticShotCoverageIntentWorkflowGraph,
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from '../_shared/sequence-animatic-workflow-factory.ts'
import {
  sequenceAnimaticShotCoverageIntentEnsureRequestSchema,
  sequenceAnimaticShotCoverageIntentEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import { continuityNodeCollections } from '../../../src/domain/sequenceAnimaticContinuityDependencies.ts'

const COVERAGE_INTENT_POLICY_VERSION = 'coverage_intent_batch_v2'
const ACTIVE_OUTPUT_REQUEST_STATUSES = new Set(['queued', 'planning', 'running'])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

class CoverageIntentHttpError extends HttpError {
  details: Record<string, unknown>

  constructor(status: number, message: string, details: Record<string, unknown> = {}) {
    super(status, message)
    this.details = details
  }
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

function uniqueTexts(values: Iterable<string>) {
  return [...new Set([...values].map(readText).filter(Boolean))]
}

function uniqueShotRecords(shots: readonly Record<string, unknown>[]) {
  return [...new Map(shots.map((shot) => [readText(shot.id), shot] as const).filter(([id]) => Boolean(id))).values()]
}

function outputRequestIsActive(request: { status?: string | null } | null | undefined) {
  return ACTIVE_OUTPUT_REQUEST_STATUSES.has(readText(request?.status))
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 72) || 'output'
}

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function readScreenplayAnimaticSource(metadata: Record<string, unknown>, fallback: 'wiki_sequence_unit' | 'prompt_cinematic' = 'wiki_sequence_unit') {
  const source = readText(metadata.screenplayAnimaticSource)
  return source === 'prompt_cinematic' || source === 'wiki_sequence_unit' ? source : fallback
}

function sceneGraphOverrideForNode(metadata: Record<string, unknown>, nodeId: string) {
  const overrides = asRecord(metadata.sequenceAnimaticSceneGraphOverrides ?? metadata.sequence_animatic_scene_graph_overrides)
  const nodes = asRecord(overrides.nodes)
  const override = asRecord(nodes[nodeId])
  return {
    nodeId,
    nodeKind: readText(override.nodeKind),
    visualBriefOverride: readText(override.visualBriefOverride),
    extraPromptDirection: readText(override.extraPromptDirection),
  }
}

function sceneGraphOverridesForSpatialScope(metadata: Record<string, unknown>, spatial: Record<string, string>) {
  return uniqueTexts([spatial.setId, spatial.zoneId, spatial.primarySpotId, spatial.viewpointId])
    .map((nodeId) => sceneGraphOverrideForNode(metadata, nodeId))
    .filter((override) => override.visualBriefOverride || override.extraPromptDirection)
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

function sceneIdForShot(shot: Record<string, unknown>) {
  const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
  const idScene = /^scene_\d+/i.exec(readText(shot.id))?.[0] ?? ''
  const blockScene = /^scene_\d+/i.exec(readText(shot.storyboardBlockId ?? shot.blockId ?? shot.block_id))?.[0] ?? ''
  const explicitScene = readText(shot.sourceSceneId ?? shot.source_scene_id ?? binding.sceneId ?? binding.scene_id)
  const genericScene = readText(shot.sceneId ?? shot.scene_id)
  return explicitScene
    || idScene
    || blockScene
    || (genericScene && genericScene !== 'sequence_animatic_master' ? genericScene : '')
    || 'scene'
}

function spatialFieldsForShot(shot: Record<string, unknown>) {
  const explicitBinding = asRecord(shot.sceneBinding ?? shot.scene_binding)
  const shotBinding = asRecord(shot.shotBinding ?? shot.shot_binding)
  const nestedShotBinding = asRecord(shotBinding.sceneBinding ?? shotBinding.scene_binding)
  const binding = { ...nestedShotBinding, ...shotBinding, ...explicitBinding }
  const bindingSpotIds = readStringArray(binding.spotIds ?? binding.spot_ids ?? shot.spotIds ?? shot.spot_ids ?? shot.continuitySpotIds ?? shot.continuity_spot_ids)
  const primarySpotId = readText(binding.primarySpotId ?? binding.primary_spot_id ?? shot.primarySpotId ?? shot.primary_spot_id) || bindingSpotIds[0] || ''
  return {
    sceneId: sceneIdForShot(shot),
    setId: readText(binding.setId ?? binding.set_id ?? shot.setId ?? shot.set_id ?? shot.continuitySetId ?? shot.continuity_set_id),
    zoneId: readText(binding.zoneId ?? binding.zone_id ?? shot.zoneId ?? shot.zone_id ?? shot.continuityZoneId ?? shot.continuity_zone_id),
    primarySpotId,
    viewpointId: readText(binding.viewpointId ?? binding.viewpoint_id ?? shot.viewpointId ?? shot.viewpoint_id),
    setName: readText(binding.setName ?? binding.set_name),
    zoneName: readText(binding.zoneName ?? binding.zone_name),
    spotName: readText(binding.primarySpotName ?? binding.primary_spot_name),
  }
}

function shotOrderValue(shot: Record<string, unknown>, fallback: number) {
  const numeric = Number(shot.globalIndex ?? shot.global_index ?? shot.index ?? shot.shotIndex ?? shot.shot_index)
  return Number.isFinite(numeric) ? numeric : fallback
}

function collectNestedShots(value: unknown, depth = 0, context: Record<string, string> = {}): Record<string, unknown>[] {
  if (depth > 6) return []
  if (Array.isArray(value)) return value.flatMap((entry) => collectNestedShots(entry, depth + 1, context))
  const record = asRecord(value)
  if (Object.keys(record).length === 0) return []
  const id = readText(record.id)
  const sceneId = readText(record.sourceSceneId ?? record.source_scene_id ?? record.sceneId ?? record.scene_id)
    || (/^scene[_-]/i.test(id) ? id : context.sourceSceneId || context.sceneId || '')
  const blockId = readText(record.blockId ?? record.block_id ?? record.storyboardBlockId ?? record.storyboard_block_id)
    || (/block/i.test(id) ? id : context.blockId || '')
  const nextContext = {
    ...context,
    sceneId,
    sourceSceneId: sceneId || context.sourceSceneId || '',
    blockId,
    storyboardBlockId: blockId || context.storyboardBlockId || '',
    sourceSceneTitle: readText(record.sourceSceneTitle ?? record.source_scene_title ?? record.sceneTitle ?? record.scene_title ?? record.title) || context.sourceSceneTitle || '',
  }
  const directShots = readArray(record.shots).map(asRecord).filter((shot) => readText(shot.id)).map((shot) => ({
    ...nextContext,
    ...shot,
    sourceSceneId: readText(shot.sourceSceneId ?? shot.source_scene_id ?? shot.sceneId ?? shot.scene_id) || nextContext.sourceSceneId,
    blockId: readText(shot.blockId ?? shot.block_id ?? shot.storyboardBlockId ?? shot.storyboard_block_id) || nextContext.blockId,
    storyboardBlockId: readText(shot.storyboardBlockId ?? shot.storyboard_block_id ?? shot.blockId ?? shot.block_id) || nextContext.storyboardBlockId || nextContext.blockId,
    sourceSceneTitle: readText(shot.sourceSceneTitle ?? shot.source_scene_title ?? shot.sceneTitle ?? shot.scene_title) || nextContext.sourceSceneTitle,
  }))
  const nested = Object.entries(record)
    .filter(([key]) => key !== 'shots')
    .flatMap(([, child]) => collectNestedShots(child, depth + 1, nextContext))
  return [...directShots, ...nested]
}

function mergedShotsForScene(input: {
  manifest: Record<string, unknown>
  directorPlan: Record<string, unknown>
  sceneId: string
  shotIds: readonly string[]
  fallbackShots?: readonly Record<string, unknown>[]
}) {
  const scopedShotIds = new Set(input.shotIds.map(readText).filter(Boolean))
  const manifestBlocks = readArray(input.manifest.blocks).map(asRecord).filter((block) => readText(block.id))
  const directorShots = uniqueShotRecords([
    ...readArray(input.directorPlan.shots).map(asRecord),
    ...collectNestedShots(input.directorPlan),
  ])
  const directorShotsById = new Map(directorShots.map((shot) => [readText(shot.id), shot] as const))
  const blockMap = new Map<string, Record<string, unknown>>()
  const manifestBlockShots = manifestBlocks.flatMap((block) => {
    const blockId = readText(block.id)
    blockMap.set(blockId, block)
    return readArray(block.shots).map(asRecord).map((shot) => ({
      ...shot,
      blockId: readText(shot.blockId) || readText(shot.storyboardBlockId) || blockId,
      storyboardBlockId: readText(shot.storyboardBlockId) || readText(shot.blockId) || blockId,
    }))
  }).filter((shot) => readText(shot.id))
  const manifestShots = uniqueShotRecords([
    ...manifestBlockShots,
    ...collectNestedShots(input.manifest),
  ])
  const shotIdsFromManifest = new Set(manifestShots.map((shot) => readText(shot.id)).filter(Boolean))
  const shotIdsBeforeFallback = new Set([...shotIdsFromManifest, ...directorShots.map((shot) => readText(shot.id))].filter(Boolean))
  const fallbackShots = (input.fallbackShots ?? []).map(asRecord).filter((shot) => readText(shot.id) && !shotIdsBeforeFallback.has(readText(shot.id)))
  return [
    ...manifestShots,
    ...directorShots.filter((shot) => !shotIdsFromManifest.has(readText(shot.id))),
    ...fallbackShots.map((shot) => ({
      ...shot,
      sourceSceneId: readText(shot.sourceSceneId ?? shot.source_scene_id ?? shot.sceneId ?? shot.scene_id) || input.sceneId,
      blockId: readText(shot.blockId ?? shot.block_id ?? shot.storyboardBlockId ?? shot.storyboard_block_id) || `${input.sceneId}_block`,
      storyboardBlockId: readText(shot.storyboardBlockId ?? shot.storyboard_block_id ?? shot.blockId ?? shot.block_id) || `${input.sceneId}_block`,
    })),
  ].map((shot, index) => {
    const directorShot = directorShotsById.get(readText(shot.id)) ?? {}
    const blockId = readText(directorShot.blockId ?? directorShot.storyboardBlockId) || readText(shot.blockId ?? shot.storyboardBlockId)
    const block = blockMap.get(blockId) ?? {}
    return {
      ...shot,
      ...directorShot,
      id: readText(shot.id),
      blockId,
      storyboardBlockId: readText(directorShot.storyboardBlockId ?? directorShot.blockId) || readText(shot.storyboardBlockId ?? shot.blockId),
      sourceSceneId: readText(directorShot.sourceSceneId ?? directorShot.source_scene_id ?? shot.sourceSceneId ?? shot.source_scene_id) || sceneIdForShot(shot),
      sourceSceneTitle: readText(directorShot.sourceSceneTitle ?? directorShot.source_scene_title ?? shot.sourceSceneTitle ?? shot.source_scene_title) || readText(block.title),
      order: shotOrderValue({ ...shot, ...directorShot }, index),
    }
  })
    .filter((shot) => scopedShotIds.size > 0 ? scopedShotIds.has(readText(shot.id)) : sceneIdForShot(shot) === input.sceneId)
    .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0))
}

function continuityAssetKeysForNode(node: Record<string, unknown>) {
  const state = asRecord(node.assetState ?? node.asset_state)
  return uniqueTexts([
    readText(state.assetKey),
    readText(state.asset_key),
    readText(state.imageAssetKey),
    readText(state.image_asset_key),
    readText(state.primaryAssetKey),
    readText(state.selectedReferenceAssetKey),
    ...readStringArray(state.assetKeys),
  ])
}

function continuityAssetStatesFromArtifacts(artifacts: readonly Record<string, unknown>[]) {
  const states = new Map<string, Record<string, unknown>>()
  for (const artifact of artifacts) {
    const metadata = asRecord(artifact.metadata)
    const role = readText(metadata.role)
    if (role === 'sequence_animatic_continuity_asset_batch') {
      Object.entries(asRecord(metadata.assetStateByNodeId ?? metadata.asset_state_by_node_id)).forEach(([nodeId, value]) => {
        if (nodeId) states.set(nodeId, asRecord(value))
      })
      continue
    }
    if (role !== 'sequence_animatic_continuity_asset') continue
    const state = asRecord(metadata.assetState ?? metadata.asset_state)
    const nodeId = readText(state.sourceNodeId) || readText(metadata.targetNodeId)
    if (nodeId) states.set(nodeId, state)
  }
  return states
}

function applyContinuityAssetStatesToNodes(
  nodesById: Map<string, Record<string, unknown>>,
  statesByNodeId: Map<string, Record<string, unknown>>,
) {
  for (const [nodeId, state] of statesByNodeId.entries()) {
    const node = nodesById.get(nodeId)
    if (!node) continue
    node.assetState = {
      ...asRecord(node.assetState ?? node.asset_state),
      ...state,
    }
    node.asset_state = node.assetState
  }
}

function graphNodeMap(input: { manifest: Record<string, unknown>; directorPlan: Record<string, unknown> }) {
  const graph = asRecord(
    input.manifest.continuityGraphV2
      ?? input.manifest.continuity_graph_v2
      ?? input.directorPlan.continuityGraphV2
      ?? input.directorPlan.continuity_graph_v2,
  )
  return new Map(continuityNodeCollections(graph).map((node) => [readText(node.id), node] as const).filter(([id]) => Boolean(id)))
}

function entityAssetKeys(entity: Record<string, unknown>) {
  return uniqueTexts([
    readText(entity.primaryAssetKey),
    readText(entity.selectedReferenceAssetKey),
    readText(entity.selectedReferenceVariantAssetKey),
    ...readStringArray(entity.assetKeys),
  ])
}

function assetEntityForKey(assetKey: string, label: string) {
  return {
    key: `coverage_intent_ref_${slugify(assetKey)}`,
    name: label || 'Continuity reference',
    type: 'continuity_asset',
    role: 'location_continuity_reference',
    summary: 'Generated set, zone, spot, or viewpoint continuity asset used as context for shot coverage directions.',
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
  }
}

function locationReferenceEntitiesForShot(shot: Record<string, unknown>, nodesById: Map<string, Record<string, unknown>>) {
  const spatial = spatialFieldsForShot(shot)
  const spatialNodeIds = uniqueTexts([spatial.setId, spatial.zoneId, spatial.primarySpotId, spatial.viewpointId])
  const entities: Record<string, unknown>[] = []
  for (const nodeId of spatialNodeIds) {
    const node = nodesById.get(nodeId)
    if (!node) continue
    for (const assetKey of continuityAssetKeysForNode(node).slice(0, 1)) {
      entities.push(assetEntityForKey(assetKey, `${readText(node.name) || nodeId} ref`))
    }
  }
  return entities
}

function mergeAssetPacks(packs: readonly Record<string, unknown>[]) {
  const seenEntityKeys = new Set<string>()
  const entities: Record<string, unknown>[] = []
  const assetKeys: string[] = []
  for (const pack of packs) {
    for (const entity of readArray(pack.entities).map(asRecord)) {
      const key = readText(entity.key) || readText(entity.name) || readText(entity.primaryAssetKey)
      if (key && seenEntityKeys.has(key)) continue
      if (key) seenEntityKeys.add(key)
      entities.push(entity)
      assetKeys.push(
        readText(entity.primaryAssetKey),
        readText(entity.selectedReferenceAssetKey),
        ...readStringArray(entity.assetKeys),
      )
    }
    assetKeys.push(...readStringArray(pack.scopedReferenceAssetKeys ?? pack.referenceAssetKeys ?? pack.requiredReferenceAssetKeys))
  }
  return {
    ...asRecord(packs[0]),
    entities: entities.slice(0, 24),
    scopedReferenceAssetKeys: uniqueTexts(assetKeys).slice(0, 16),
    referenceScope: 'sequence_animatic_coverage_intent_batch',
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-shot-coverage-intents')
    const admin = createAdminClient('ensure-sequence-animatic-shot-coverage-intents')
    const payload = sequenceAnimaticShotCoverageIntentEnsureRequestSchema.parse(await request.json())

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
      .limit(24)
    if (masterArtifactsResponse.error) throw new Error(masterArtifactsResponse.error.message)
    const masterArtifacts = (masterArtifactsResponse.data ?? []).map(asRecord)
    let manifest = artifactMetadataRecord(masterArtifacts, ['sequence_animatic_manifest'], ['manifest', 'sequenceAnimaticManifest', 'sequence_animatic_manifest'])
    let directorPlan = artifactMetadataRecord(masterArtifacts, ['sequence_animatic_director_plan'], ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
    if (Object.keys(manifest).length === 0 || Object.keys(directorPlan).length === 0) {
      const combined = await resolveSequenceAnimaticCombinedManifest({ client: admin, masterRequest })
      if (combined) {
        manifest = combined.manifest
        directorPlan = combined.directorPlan
      }
    }
    if (Object.keys(manifest).length === 0) throw new CoverageIntentHttpError(409, 'Generate the screenplay animatic manifest first.', {
      reason: 'missing_manifest',
      sceneId: payload.sceneId,
      setId: readText(payload.setId),
      zoneId: readText(payload.zoneId),
      shotIds: payload.shotIds,
    })
    if (Object.keys(directorPlan).length === 0) throw new CoverageIntentHttpError(409, 'Generate the shot continuity plan first.', {
      reason: 'missing_director_plan',
      sceneId: payload.sceneId,
      setId: readText(payload.setId),
      zoneId: readText(payload.zoneId),
      shotIds: payload.shotIds,
    })

    const requestedShotIds = uniqueTexts(payload.shotIds)
    const scopedShotSnapshots = readArray(payload.scopedShots).map(asRecord).filter((shot) => readText(shot.id))
    let sceneShots = mergedShotsForScene({ manifest, directorPlan, sceneId: payload.sceneId, shotIds: requestedShotIds, fallbackShots: scopedShotSnapshots })
    if (sceneShots.length === 0) {
      const combined = await resolveSequenceAnimaticCombinedManifest({ client: admin, masterRequest })
      if (combined) {
        manifest = combined.manifest
        directorPlan = combined.directorPlan
        sceneShots = mergedShotsForScene({ manifest, directorPlan, sceneId: payload.sceneId, shotIds: requestedShotIds, fallbackShots: scopedShotSnapshots })
      }
    }
    if (sceneShots.length === 0) throw new CoverageIntentHttpError(409, 'This scene has no finalized shots available for coverage directions.', {
      reason: 'no_finalized_scene_shots',
      sceneId: payload.sceneId,
      setId: readText(payload.setId),
      zoneId: readText(payload.zoneId),
      shotIds: requestedShotIds,
      scopedShotSnapshotCount: scopedShotSnapshots.length,
    })

    const manifestAssetPack = asRecord(manifest.assetPack)
    const shotBindings = asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings)
    const nodesById = graphNodeMap({ manifest, directorPlan })
    const continuityAssetArtifactsResponse = await client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .order('created_at', { ascending: false })
      .limit(300)
    if (continuityAssetArtifactsResponse.error) throw new Error(continuityAssetArtifactsResponse.error.message)
    const continuityAssetArtifacts = (continuityAssetArtifactsResponse.data ?? [])
      .map(asRecord)
      .filter((artifact) => {
        const metadata = asRecord(artifact.metadata)
        return readText(metadata.masterRequestId) === masterRequest.id
          && (readText(metadata.role) === 'sequence_animatic_continuity_asset' || readText(metadata.role) === 'sequence_animatic_continuity_asset_batch')
      })
    applyContinuityAssetStatesToNodes(nodesById, continuityAssetStatesFromArtifacts(continuityAssetArtifacts))

    const scopeSetId = readText(payload.setId)
    const scopeZoneId = readText(payload.zoneId)
    const preparedShots = sceneShots.map((shot, index) => {
      const shotId = readText(shot.id)
      const rawShotBinding = asRecord(shotBindings[shotId])
      const shotBinding = {
        ...asRecord(rawShotBinding.sceneBinding ?? rawShotBinding.scene_binding),
        ...rawShotBinding,
      }
      const boundShot = { ...shot, shotBinding }
      const spatial = spatialFieldsForShot(boundShot)
      const entities = locationReferenceEntitiesForShot(boundShot, nodesById)
      const assetPack = {
        ...manifestAssetPack,
        entities,
        scopedReferenceAssetKeys: uniqueTexts(entities.flatMap(entityAssetKeys)).slice(0, 12),
        referenceScope: 'sequence_animatic_coverage_intent_shot',
      }
      return {
        shot: boundShot,
        spatial,
        assetPack,
        order: shotOrderValue(shot, index),
      }
    })
      .filter((entry) => !scopeSetId || entry.spatial.setId === scopeSetId)
      .filter((entry) => !scopeZoneId || entry.spatial.zoneId === scopeZoneId)
      .sort((left, right) => left.order - right.order)

    if (preparedShots.length === 0) throw new CoverageIntentHttpError(409, 'This scene scope has no matching shots for coverage directions.', {
      reason: 'scope_mismatch',
      sceneId: payload.sceneId,
      setId: scopeSetId,
      zoneId: scopeZoneId,
      requestedShotIds,
      availableZoneIds: uniqueTexts(sceneShots.map((shot) => spatialFieldsForShot({ ...shot, shotBinding: asRecord(shotBindings[readText(shot.id)]) }).zoneId)),
    })

    const first = preparedShots[0]
    const shotIds = preparedShots.map((entry) => readText(entry.shot.id)).filter(Boolean)
    const sceneGraphOverrides = first ? sceneGraphOverridesForSpatialScope(masterMetadata, first.spatial) : []
    const assetPack = mergeAssetPacks(preparedShots.map((entry) => entry.assetPack))
    const referenceAssetKeys = readStringArray(assetPack.scopedReferenceAssetKeys)
    const sourceHash = sequenceAnimaticStableHash({
      policy: COVERAGE_INTENT_POLICY_VERSION,
      sceneId: payload.sceneId,
      setId: scopeSetId,
      zoneId: scopeZoneId,
      shotIds,
      shots: preparedShots.map((entry) => ({
        id: readText(entry.shot.id),
        title: readText(entry.shot.title),
        action: readText(entry.shot.action) || readText(entry.shot.description),
        camera: asRecord(entry.shot.camera),
        lighting: readText(entry.shot.lighting),
        dialogue: readArray(entry.shot.dialogue).map(asRecord),
        refs: asRecord(entry.shot.refs),
        spatial: entry.spatial,
        locationReferenceAssetKeys: readStringArray(entry.assetPack.scopedReferenceAssetKeys),
      })),
      sceneGraphOverrides,
      referenceAssetKeys,
    })
    const batchId = sequenceAnimaticStableHash({
      policy: COVERAGE_INTENT_POLICY_VERSION,
      sceneId: payload.sceneId,
      setId: scopeSetId,
      zoneId: scopeZoneId,
      shotIds,
    })
    const registry = asRecord(masterMetadata.sequenceAnimaticZoneCoverageRegistry ?? masterMetadata.sequence_animatic_zone_coverage_registry)
    const broaderRegistry = asRecord(masterMetadata.sequenceAnimaticCoverageRegistry ?? masterMetadata.sequence_animatic_coverage_registry)
    const storedIntents = {
      ...asRecord(broaderRegistry.coverageIntentByShotId ?? broaderRegistry.coverage_intent_by_shot_id),
      ...asRecord(registry.coverageIntentByShotId ?? registry.coverage_intent_by_shot_id),
    }
    const scopedReadyIntents = Object.fromEntries(shotIds.map((shotId) => [shotId, asRecord(storedIntents[shotId])]).filter(([, intent]) => readText(intent.sourceHash) === sourceHash))

    const existingResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', masterRequest.id)
      .or('metadata->>screenplayAnimaticRole.eq.coverage_intent_batch,metadata->>sequenceAnimaticRole.eq.coverage_intent_batch')
      .order('created_at', { ascending: false })
      .limit(100)
    if (existingResponse.error) throw new Error(existingResponse.error.message)
    const children = (existingResponse.data ?? []).map(mapOutputRequestRow).filter((child) => asRecord(child.metadata).sequenceAnimaticStale !== true)
    const matchingChild = children.find((child) => {
      const metadata = asRecord(child.metadata)
      return readText(metadata.coverageIntentPolicyVersion) === COVERAGE_INTENT_POLICY_VERSION
        && readText(metadata.coverageIntentBatchId) === batchId
        && readText(metadata.sourceHash) === sourceHash
        && readText(child.workflowId)
    }) ?? null
    const matchingChildIsActive = outputRequestIsActive(matchingChild)
    if (payload.forceRefresh && matchingChild && !matchingChildIsActive) {
      const staleResponse = await admin
        .from('output_requests')
        .update({
          metadata: {
            ...asRecord(matchingChild.metadata),
            sequenceAnimaticStale: true,
            staleReason: 'Coverage direction refresh requested.',
            staleAt: new Date().toISOString(),
          },
        })
        .eq('id', matchingChild.id)
      if (staleResponse.error) throw new Error(staleResponse.error.message)
    }
    let child = !payload.forceRefresh || matchingChildIsActive ? matchingChild : null
    let workflow = null
    let nodes: ReturnType<typeof mapOutputWorkflowNodeRow>[] = []
    let edges: ReturnType<typeof mapOutputWorkflowEdgeRow>[] = []
    let cacheStatus: 'reused' | 'created' | 'refreshed' = child ? 'reused' : 'created'

    const intentBatch = {
      id: batchId,
      batchId,
      title: `${first?.spatial.zoneName || first?.spatial.zoneId || 'Zone'} coverage directions`,
      sceneId: payload.sceneId,
      setId: scopeSetId,
      zoneId: scopeZoneId,
      shotIds,
      sourceHash,
      policyVersion: COVERAGE_INTENT_POLICY_VERSION,
      sceneGraphOverrides,
      referenceAssetKeys,
    }

    if (!child && Object.keys(scopedReadyIntents).length < shotIds.length) {
      const workflowId = crypto.randomUUID()
      const commonConfig = {
        cinematicPipelineVersion: 'v3_script_storyboards',
        graphSpecVersion: sequenceAnimaticGraphSpecVersion,
        screenplayAnimaticRole: 'coverage_intent_batch',
        screenplayAnimaticSource,
        sequenceAnimaticRole: 'coverage_intent_batch',
        parentRequestId: masterRequest.id,
        masterRequestId: masterRequest.id,
        coverageIntentPolicyVersion: COVERAGE_INTENT_POLICY_VERSION,
        coverageIntentBatchId: batchId,
        sourceHash,
        sceneId: payload.sceneId,
        setId: scopeSetId,
        zoneId: scopeZoneId,
        shotIds,
        sceneGraphOverrides,
        referenceAssetKeys,
        dependencyMode: 'coverage_intent_batch',
        readyToRun: true,
      }
      const graphPlan = buildSequenceAnimaticShotCoverageIntentWorkflowGraph({
        workflowId,
        draftId: payload.draftId,
        commonConfig,
        intentBatch,
        shots: preparedShots.map((entry) => entry.shot),
        assetPack,
      })
      const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
        p_project_id: payload.projectId,
        p_draft_id: payload.draftId,
        p_parent_request_id: masterRequest.id,
        p_role: 'coverage_intent_batch',
        p_identity_key: 'coverageIntentBatchId',
        p_identity_value: batchId,
        p_workflow: {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          key: `sequence_animatic_coverage_intent_${slugify(masterRequest.id)}_${slugify(batchId)}_${sourceHash.slice(0, 8)}`,
          name: `${masterRequest.title} / ${readText(intentBatch.title) || 'Coverage Directions'}`,
          description: 'Scene Board shot coverage direction planning workflow.',
          preset: 'cinematic_episode_from_sequence',
          status: 'active',
          created_by: user.id,
          metadata: commonConfig,
        },
        p_nodes: graphPlan.nodes,
        p_edges: graphPlan.edges,
        p_request: {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          parent_request_id: masterRequest.id,
          requested_by: user.id,
          source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
          prompt: `Plan coverage directions for ${readText(intentBatch.title) || 'selected board'}.`,
          title: `${masterRequest.title} / ${readText(intentBatch.title) || 'Coverage Directions'}`,
          intent: 'output_generation',
          output_kind: 'cinematic_episode',
          status: 'awaiting_confirmation',
          selected_entity_keys: masterRequest.selectedEntityKeys,
          selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
          page_count: null,
          target_format: 'json',
          planner_notes: 'Scene Board coverage directions prepared before zone camera grid generation.',
          metadata: { ...commonConfig, intentBatch, createdFromSceneBoardPrepAt: new Date().toISOString() },
        },
      })
      if (ensureResponse.error || !ensureResponse.data) throw new Error(ensureResponse.error?.message ?? 'Failed to ensure coverage direction workflow.')
      const ensured = asRecord(ensureResponse.data)
      child = mapOutputRequestRow(asRecord(ensured.request) as never)
      workflow = mapOutputWorkflowRow(asRecord(ensured.workflow) as never)
      nodes = readArray(ensured.nodes).map((row) => mapOutputWorkflowNodeRow(asRecord(row) as never))
      edges = readArray(ensured.edges).map((row) => mapOutputWorkflowEdgeRow(asRecord(row) as never))
      cacheStatus = payload.forceRefresh ? 'refreshed' : 'created'
    }

    if (!child) {
      throw new CoverageIntentHttpError(409, 'Coverage directions are already ready but no child workflow request exists for this scope.', {
        reason: 'intents_ready_no_request',
        sceneId: payload.sceneId,
        setId: scopeSetId,
        zoneId: scopeZoneId,
        shotIds,
      })
    }
    if (child.workflowId && !workflow) {
      const workflowResponse = await client.from('output_workflows').select('*').eq('id', child.workflowId).maybeSingle()
      if (workflowResponse.error) throw new Error(workflowResponse.error.message)
      workflow = workflowResponse.data ? mapOutputWorkflowRow(asRecord(workflowResponse.data) as never) : null
    }
    if (child.workflowId && (nodes.length === 0 || edges.length === 0)) {
      const nodeResponse = await client.from('output_workflow_nodes').select(outputWorkflowNodeSelect).eq('workflow_id', child.workflowId)
      if (nodeResponse.error) throw new Error(nodeResponse.error.message)
      const edgeResponse = await client.from('output_workflow_edges').select(outputWorkflowEdgeSelect).eq('workflow_id', child.workflowId)
      if (edgeResponse.error) throw new Error(edgeResponse.error.message)
      nodes = (nodeResponse.data ?? []).map((row) => mapOutputWorkflowNodeRow(asRecord(row) as never))
      edges = (edgeResponse.data ?? []).map((row) => mapOutputWorkflowEdgeRow(asRecord(row) as never))
    }

    return json(sequenceAnimaticShotCoverageIntentEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      intentRequest: child,
      workflow,
      nodes,
      edges,
      coverageIntentByShotId: scopedReadyIntents,
      cacheStatus,
      sceneId: payload.sceneId,
      shotIds,
    }))
  } catch (error) {
    if (error instanceof CoverageIntentHttpError) {
      return json({ error: error.message, details: error.details }, { status: error.status })
    }
    return errorResponse(error, 'Failed to ensure sequence animatic coverage directions.')
  }
})
