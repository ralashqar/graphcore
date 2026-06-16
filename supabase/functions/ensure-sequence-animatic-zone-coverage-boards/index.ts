import {
  createAdminClient,
  requireUserClient } from '../_shared/auth.ts'
import { errorResponse,
  HttpError,
  json,
  maybeHandleOptions } from '../_shared/http.ts'
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
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash
} from '../_shared/sequence-animatic-workflow-factory.ts'
import {
  buildSequenceAnimaticZoneCoverageBoardWorkflowGraph,
} from '../_shared/sequence-animatic-scene-board-workflows.ts'
import {
  sequenceAnimaticZoneCoverageBoardEnsureRequestSchema,
  sequenceAnimaticZoneCoverageBoardEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import { continuityNodeCollections } from '../../../src/domain/sequenceAnimaticContinuityDependencies.ts'

const ZONE_COVERAGE_BOARD_POLICY_VERSION = 'zone_camera_coverage_grid_v6'
const ZONE_COVERAGE_GRID_MODE = 'location_camera_plate_v1'
const ZONE_COVERAGE_CELL_SOURCE = 'zone_camera_grid_cell'
const ACTIVE_OUTPUT_REQUEST_STATUSES = new Set(['queued', 'planning', 'running'])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

class ZoneCoverageHttpError extends HttpError {
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
  const explicitScene = readText(shot.sourceSceneId ?? shot.source_scene_id)
  const bindingScene = readText(binding.sceneId ?? binding.scene_id)
  const genericScene = readText(shot.sceneId ?? shot.scene_id)
  return explicitScene
    || idScene
    || blockScene
    || (bindingScene && bindingScene !== 'sequence_animatic_master' ? bindingScene : '')
    || (genericScene && genericScene !== 'sequence_animatic_master' ? genericScene : '')
    || 'scene'
}

function sceneIdFromShotId(shotId: string) {
  return /^scene_\d+/i.exec(readText(shotId))?.[0] ?? ''
}

function spatialFieldsForShot(shot: Record<string, unknown>, metadata: Record<string, unknown>) {
  const explicitBinding = asRecord(shot.sceneBinding ?? shot.scene_binding)
  const shotBinding = asRecord(shot.shotBinding ?? shot.shot_binding)
  const nestedShotBinding = asRecord(shotBinding.sceneBinding ?? shotBinding.scene_binding)
  const binding = { ...nestedShotBinding, ...shotBinding, ...explicitBinding }
  const setup = asRecord(metadata.coverageSetup ?? metadata.coverage_setup)
  const bindingSpotIds = readStringArray(binding.spotIds ?? binding.spot_ids ?? shot.spotIds ?? shot.spot_ids ?? shot.continuitySpotIds ?? shot.continuity_spot_ids)
  const setupSpotIds = readStringArray(setup.spotIds ?? setup.spot_ids)
  const primarySpotId = readText(binding.primarySpotId ?? binding.primary_spot_id ?? shot.primarySpotId ?? shot.primary_spot_id)
    || bindingSpotIds[0]
    || readText(setup.primarySpotId ?? setup.primary_spot_id)
    || setupSpotIds[0]
  return {
    sceneId: sceneIdForShot(shot),
    setId: readText(binding.setId ?? binding.set_id ?? shot.setId ?? shot.set_id ?? shot.continuitySetId ?? shot.continuity_set_id) || readText(setup.setId ?? setup.set_id),
    zoneId: readText(binding.zoneId ?? binding.zone_id ?? shot.zoneId ?? shot.zone_id ?? shot.continuityZoneId ?? shot.continuity_zone_id) || readText(setup.zoneId ?? setup.zone_id),
    primarySpotId,
    viewpointId: readText(binding.viewpointId ?? binding.viewpoint_id ?? shot.viewpointId ?? shot.viewpoint_id) || readText(setup.viewpointId ?? setup.viewpoint_id),
    setName: readText(binding.setName ?? binding.set_name ?? setup.setName ?? setup.set_name),
    zoneName: readText(binding.zoneName ?? binding.zone_name ?? setup.zoneName ?? setup.zone_name),
    spotName: readText(binding.primarySpotName ?? binding.primary_spot_name ?? setup.primarySpotName ?? setup.primary_spot_name),
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
    .filter(([key]) => !['shots'].includes(key))
    .flatMap(([, child]) => collectNestedShots(child, depth + 1, nextContext))
  return [...directShots, ...nested]
}

function mergedShotsForScene(input: {
  manifest: Record<string, unknown>
  directorPlan: Record<string, unknown>
  sceneId: string
  shotIds?: readonly string[]
  fallbackShots?: readonly Record<string, unknown>[]
}) {
  const scopedShotIds = new Set((input.shotIds ?? []).map(readText).filter(Boolean))
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
  const fallbackShots = (input.fallbackShots ?? []).map(asRecord).filter((shot) => readText(shot.id) && !shotIdsFromManifest.has(readText(shot.id)))
  const shotIdsBeforeFallback = new Set([...shotIdsFromManifest, ...directorShots.map((shot) => readText(shot.id))].filter(Boolean))
  const shots = [
    ...manifestShots,
    ...directorShots.filter((shot) => !shotIdsFromManifest.has(readText(shot.id))).map((shot) => {
      const blockId = readText(shot.storyboardBlockId ?? shot.blockId) || `${readText(shot.sourceSceneId ?? shot.sceneId) || 'scene'}_block`
      if (!blockMap.has(blockId)) blockMap.set(blockId, { id: blockId, title: readText(shot.sourceSceneTitle ?? shot.sceneTitle) || 'Shot Block', shots: [] })
      return {
        ...shot,
        blockId,
        storyboardBlockId: blockId,
      }
    }),
    ...fallbackShots.filter((shot) => !shotIdsBeforeFallback.has(readText(shot.id))).map((shot) => {
      const blockId = readText(shot.storyboardBlockId ?? shot.blockId) || `${readText(shot.sourceSceneId ?? shot.sceneId) || input.sceneId || 'scene'}_block`
      if (!blockMap.has(blockId)) blockMap.set(blockId, { id: blockId, title: readText(shot.sourceSceneTitle ?? shot.sceneTitle) || 'Scene Board Shots', shots: [] })
      return {
        ...shot,
        sourceSceneId: readText(shot.sourceSceneId ?? shot.source_scene_id ?? shot.sceneId ?? shot.scene_id) || input.sceneId,
        blockId,
        storyboardBlockId: blockId,
      }
    }),
  ]
  return shots.map((shot, index) => {
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

function entityAssetKeys(entity: Record<string, unknown>) {
  return uniqueTexts([
    readText(entity.primaryAssetKey),
    readText(entity.selectedReferenceAssetKey),
    readText(entity.selectedReferenceVariantAssetKey),
    ...readStringArray(entity.assetKeys),
  ])
}

function assetEntityForKey(assetKey: string, label: string, role = 'continuity_reference') {
  return {
    key: `zone_board_ref_${slugify(assetKey)}`,
    name: label || 'Continuity reference',
    type: 'continuity_asset',
    role,
    summary: 'Previously generated continuity asset used as a visual dependency for a zone camera grid.',
    visualDescription: 'Use this reference to preserve location materials, spatial geography, weather, and lighting continuity.',
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
    selectedReferenceVariantKey: role,
    selectedReferenceVariantLabel: label || 'Continuity reference',
    selectedReferenceVariantType: role,
    referenceSelectionReason: 'Scene-graph continuity visual dependency for zone camera grid.',
  }
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

function locationReferenceEntitiesForShot(shot: Record<string, unknown>, nodesById: Map<string, Record<string, unknown>>) {
  const spatial = spatialFieldsForShot(shot, {})
  const spatialNodeIds = uniqueTexts([spatial.setId, spatial.zoneId, spatial.primarySpotId, spatial.viewpointId])
  const entities: Record<string, unknown>[] = []
  for (const nodeId of spatialNodeIds) {
    const node = nodesById.get(nodeId)
    if (!node) continue
    for (const assetKey of continuityAssetKeysForNode(node).slice(0, 1)) {
      entities.push(assetEntityForKey(assetKey, `${readText(node.name) || nodeId} ref`, 'location_continuity_reference'))
    }
  }
  return entities
}

function locationAssetPackForShot(assetPack: Record<string, unknown>, shot: Record<string, unknown>, nodesById: Map<string, Record<string, unknown>>) {
  const entities = locationReferenceEntitiesForShot(shot, nodesById)
  return {
    ...assetPack,
    entities,
    scopedReferenceAssetKeys: uniqueTexts(entities.flatMap(entityAssetKeys)).slice(0, 12),
    referenceScope: 'sequence_animatic_zone_camera_grid_shot',
  }
}

function requiredSpatialReferenceIds(spatial: Record<string, string>) {
  return uniqueTexts([spatial.setId, spatial.zoneId, spatial.primarySpotId, spatial.viewpointId])
}

function missingSpatialReferencesForEntry(entry: {
  shot: Record<string, unknown>
  spatial: Record<string, string>
}, nodesById: Map<string, Record<string, unknown>>) {
  const shotId = readText(entry.shot.id)
  return requiredSpatialReferenceIds(entry.spatial)
    .map((nodeId) => {
      const node = nodesById.get(nodeId) ?? {}
      const assetKeys = continuityAssetKeysForNode(node)
      return {
        nodeId,
        shotId,
        kind: readText(node.kind),
        name: readText(node.name) || readText(node.label) || nodeId,
        reason: Object.keys(node).length === 0 ? 'missing_graph_node' : assetKeys.length === 0 ? 'missing_asset' : '',
      }
    })
    .filter((entry) => entry.reason)
}

function coverageCellScopeKey(input: {
  boardId: string
  sourceHash: string
  shot: Record<string, unknown>
  spatial: Record<string, string>
}) {
  return sequenceAnimaticStableHash({
    policy: 'zone_camera_grid_cell_coverage_anchor_v1',
    boardId: input.boardId,
    sourceHash: input.sourceHash,
    shotId: readText(input.shot.id),
    setId: input.spatial.setId,
    zoneId: input.spatial.zoneId,
    primarySpotId: input.spatial.primarySpotId,
  })
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
    referenceScope: 'sequence_animatic_zone_camera_grid',
  }
}

function artStyleDescriptionForBoard(input: {
  masterMetadata: Record<string, unknown>
  manifest: Record<string, unknown>
  directorPlan: Record<string, unknown>
  assetPack: Record<string, unknown>
}) {
  const projectContext = asRecord(input.masterMetadata.projectContext ?? input.masterMetadata.project_context)
  const worldWiki = asRecord(
    input.masterMetadata.worldWiki
      ?? input.masterMetadata.world_wiki
      ?? projectContext.worldWiki
      ?? projectContext.world_wiki
      ?? input.manifest.worldWiki
      ?? input.manifest.world_wiki
      ?? input.directorPlan.worldWiki
      ?? input.directorPlan.world_wiki,
  )
  return readText(worldWiki.artStyleDescription)
    || readText(worldWiki.visualStyle)
    || readText(input.manifest.artStyleDescription)
    || readText(input.manifest.visualStyle)
    || readText(input.directorPlan.artStyleDescription)
    || readText(input.directorPlan.visualStyle)
    || readText(input.assetPack.artStyleDescription)
    || readText(input.assetPack.visualStyle)
}

function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size) as T[])
  return chunks
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-zone-coverage-boards')
    const admin = createAdminClient('ensure-sequence-animatic-zone-coverage-boards')
    const payload = sequenceAnimaticZoneCoverageBoardEnsureRequestSchema.parse(await request.json())

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
    let combinedReadySceneIds: string[] = []
    if (Object.keys(manifest).length === 0 || Object.keys(directorPlan).length === 0) {
      const combined = await resolveSequenceAnimaticCombinedManifest({ client: admin, masterRequest })
      if (combined) {
        manifest = combined.manifest
        directorPlan = combined.directorPlan
        combinedReadySceneIds = combined.readySceneIds
      }
    }
    if (Object.keys(manifest).length === 0) throw new ZoneCoverageHttpError(409, 'Generate the screenplay animatic manifest first.', {
      reason: 'missing_manifest',
      sceneId: payload.sceneId,
      setId: readText(payload.setId),
      zoneId: readText(payload.zoneId),
    })
    if (Object.keys(directorPlan).length === 0) throw new ZoneCoverageHttpError(409, 'Generate the shot continuity plan first.', {
      reason: 'missing_director_plan',
      sceneId: payload.sceneId,
      setId: readText(payload.setId),
      zoneId: readText(payload.zoneId),
    })

    const requestedShotIds = readStringArray(payload.shotIds)
    const scopedShotSnapshots = readArray(payload.scopedShots).map(asRecord).filter((shot) => readText(shot.id))
    const requestedSceneId = readText(payload.sceneId)
    const scopedSceneIds = uniqueTexts([
      ...requestedShotIds.map(sceneIdFromShotId),
      ...scopedShotSnapshots.map(sceneIdForShot),
    ]).filter((sceneId) => sceneId !== 'sequence_animatic_master' && sceneId !== 'scene')
    const effectiveSceneId = requestedSceneId === 'sequence_animatic_master' && scopedSceneIds.length === 1
      ? scopedSceneIds[0]
      : requestedSceneId
    let sceneShots = mergedShotsForScene({ manifest, directorPlan, sceneId: effectiveSceneId, shotIds: requestedShotIds, fallbackShots: scopedShotSnapshots })
    if (sceneShots.length === 0) {
      const combined = await resolveSequenceAnimaticCombinedManifest({ client: admin, masterRequest })
      const combinedSceneShots = combined
        ? mergedShotsForScene({ manifest: combined.manifest, directorPlan: combined.directorPlan, sceneId: effectiveSceneId, shotIds: requestedShotIds, fallbackShots: scopedShotSnapshots })
        : []
      if (combined && combinedSceneShots.length > 0) {
        manifest = combined.manifest
        directorPlan = combined.directorPlan
        combinedReadySceneIds = combined.readySceneIds
        sceneShots = combinedSceneShots
      }
    }

    const manifestAssetPack = asRecord(manifest.assetPack)
    const artStyleDescription = artStyleDescriptionForBoard({
      masterMetadata,
      manifest,
      directorPlan,
      assetPack: manifestAssetPack,
    })
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
    if (sceneShots.length === 0) {
      throw new ZoneCoverageHttpError(409, 'This scene has no finalized shots available for zone camera grids.', {
        reason: 'no_finalized_scene_shots',
        sceneId: effectiveSceneId,
        requestedSceneId,
        setId: readText(payload.setId),
        zoneId: readText(payload.zoneId),
        readySceneIds: combinedReadySceneIds,
        requestedShotIds,
        scopedShotSnapshotCount: scopedShotSnapshots.length,
      })
    }
    const shotBindings = asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings)

    const scopeSetId = readText(payload.setId)
    const scopeZoneId = readText(payload.zoneId)
    const allPreparedShots = sceneShots.map((shot, index) => {
      const shotId = readText(shot.id)
      const rawShotBinding = asRecord(shotBindings[shotId])
      const shotBinding = {
        ...asRecord(rawShotBinding.sceneBinding ?? rawShotBinding.scene_binding),
        ...rawShotBinding,
      }
      const boundShot = {
        ...shot,
        shotBinding,
      }
      const metadata: Record<string, unknown> = {}
      const spatial = spatialFieldsForShot(boundShot, metadata)
      return {
        metadata,
        shot: boundShot,
        assetPack: locationAssetPackForShot(manifestAssetPack, boundShot, nodesById),
        spatial,
        order: shotOrderValue(shot, index),
      }
    }).filter((entry) => entry.spatial.zoneId)
    const availableZoneIds = uniqueTexts(allPreparedShots.map((entry) => entry.spatial.zoneId))
    const preparedShots = allPreparedShots
      .filter((entry) => !scopeSetId || entry.spatial.setId === scopeSetId)
      .filter((entry) => !scopeZoneId || entry.spatial.zoneId === scopeZoneId)
      .sort((left, right) => left.order - right.order)
    if (preparedShots.length === 0) {
      throw new ZoneCoverageHttpError(409, scopeZoneId
        ? 'This scene scope has no shots with zone bindings available for zone camera grids.'
        : 'This scene has no shots with zone bindings available for zone camera grids.', {
        reason: allPreparedShots.length === 0 ? 'no_zone_bound_shots' : 'scope_mismatch',
        sceneId: effectiveSceneId,
        requestedSceneId,
        setId: scopeSetId,
        zoneId: scopeZoneId,
        availableZoneIds,
      })
    }
    const missingSpatialReferences = [...new Map(preparedShots
      .flatMap((entry) => missingSpatialReferencesForEntry(entry, nodesById))
      .map((entry) => [entry.nodeId, entry] as const)).values()]
    if (missingSpatialReferences.length > 0) {
      throw new ZoneCoverageHttpError(409, 'Generate set, zone, and spot continuity references before creating zone camera grids.', {
        reason: 'missing_spatial_reference_assets',
        sceneId: effectiveSceneId,
        requestedSceneId,
        setId: scopeSetId,
        zoneId: scopeZoneId,
        missingReferenceCount: missingSpatialReferences.length,
        missingReferences: missingSpatialReferences.slice(0, 24),
        shotIds: preparedShots.map((entry) => readText(entry.shot.id)).filter(Boolean),
      })
    }

    const groups = new Map<string, typeof preparedShots>()
    for (const entry of preparedShots) {
      const key = [entry.spatial.sceneId, entry.spatial.setId || 'set', entry.spatial.zoneId].join('::')
      groups.set(key, [...(groups.get(key) ?? []), entry])
    }

    const existingBoardsResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', masterRequest.id)
      .or('metadata->>screenplayAnimaticRole.eq.zone_coverage_board,metadata->>sequenceAnimaticRole.eq.zone_coverage_board')
      .order('created_at', { ascending: false })
      .limit(200)
    if (existingBoardsResponse.error) throw new Error(existingBoardsResponse.error.message)
    const activeBoardChildren = (existingBoardsResponse.data ?? []).map(mapOutputRequestRow)
      .filter((child) => asRecord(child.metadata).sequenceAnimaticStale !== true)
    const storedBoardRegistry = asRecord(masterMetadata.sequenceAnimaticZoneCoverageRegistry ?? masterMetadata.sequence_animatic_zone_coverage_registry)
    const storedCoverageRegistry = asRecord(masterMetadata.sequenceAnimaticCoverageRegistry ?? masterMetadata.sequence_animatic_coverage_registry)
    const coverageIntentByShotId = {
      ...asRecord(storedCoverageRegistry.coverageIntentByShotId ?? storedCoverageRegistry.coverage_intent_by_shot_id),
      ...asRecord(storedBoardRegistry.coverageIntentByShotId ?? storedBoardRegistry.coverage_intent_by_shot_id),
    }
    const storedBoards = readArray(storedBoardRegistry.zoneCoverageBoards ?? storedBoardRegistry.zone_coverage_boards).map(asRecord)

    const boardRequests = []
    const workflows = []
    let nodes: ReturnType<typeof mapOutputWorkflowNodeRow>[] = []
    let edges: ReturnType<typeof mapOutputWorkflowEdgeRow>[] = []
    const zoneCoverageBoards: Record<string, unknown>[] = []
    let createdCount = 0
    let reusedCount = 0
    let refreshedCount = 0

    for (const [, entries] of groups) {
      const chunks = chunk(entries, 9)
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunkEntries = chunks[chunkIndex]
        const first = chunkEntries[0]
        if (!first) continue
        const boardShotIds = chunkEntries.map((entry) => readText(entry.shot.id)).filter(Boolean)
        const sceneGraphOverrides = sceneGraphOverridesForSpatialScope(masterMetadata, first.spatial)
        const chunkCoverageIntents = Object.fromEntries(chunkEntries.map((entry) => {
          const shotId = readText(entry.shot.id)
          return [shotId, asRecord(coverageIntentByShotId[shotId])]
        }).filter(([shotId, intent]) => Boolean(shotId) && Object.keys(asRecord(intent)).length > 0))
        const boardId = sequenceAnimaticStableHash({
          policy: ZONE_COVERAGE_BOARD_POLICY_VERSION,
          sceneId: first.spatial.sceneId,
          setId: first.spatial.setId,
          zoneId: first.spatial.zoneId,
          chunkIndex,
          shotIds: boardShotIds,
        })
        const sourceHash = sequenceAnimaticStableHash({
          policy: ZONE_COVERAGE_BOARD_POLICY_VERSION,
          sceneId: first.spatial.sceneId,
          setId: first.spatial.setId,
          zoneId: first.spatial.zoneId,
          chunkIndex,
          shots: chunkEntries.map((entry) => ({
            id: readText(entry.shot.id),
            camera: asRecord(entry.shot.camera),
            lighting: readText(entry.shot.lighting),
            locationContinuity: readText(entry.shot.locationContinuity ?? entry.shot.location_continuity),
            screenDirection: readText(entry.shot.screenDirection ?? entry.shot.screen_direction),
            spatial: entry.spatial,
            coverageIntent: asRecord(chunkCoverageIntents[readText(entry.shot.id)]),
            locationReferenceAssetKeys: readStringArray(entry.assetPack.scopedReferenceAssetKeys),
            })),
          artStyleDescription,
          sceneGraphOverrides,
        })
        const matchingChild = activeBoardChildren.find((child) => {
          const metadata = asRecord(child.metadata)
          return readText(metadata.zoneCoverageBoardPolicyVersion) === ZONE_COVERAGE_BOARD_POLICY_VERSION
            && readText(metadata.boardId) === boardId
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
                staleReason: 'Zone camera grid refresh requested.',
                staleAt: new Date().toISOString(),
              },
            })
            .eq('id', matchingChild.id)
          if (staleResponse.error) throw new Error(staleResponse.error.message)
        }
        let child = !payload.forceRefresh || matchingChildIsActive ? matchingChild : null
        let workflow = null
        let boardNodes: ReturnType<typeof mapOutputWorkflowNodeRow>[] = []
        let boardEdges: ReturnType<typeof mapOutputWorkflowEdgeRow>[] = []
        const previousBoard = storedBoards.find((board) => (
          readText(board.sceneId) === first.spatial.sceneId
          && readText(board.setId) === first.spatial.setId
          && readText(board.zoneId) === first.spatial.zoneId
          && Number(board.chunkIndex ?? -1) === chunkIndex - 1
          && readText(board.boardAssetKey)
        )) ?? {}
        const board = {
          id: boardId,
          boardId,
          title: `${first.spatial.zoneName || first.spatial.zoneId || 'Zone'} Camera Grid ${chunkIndex + 1}`,
          sceneId: first.spatial.sceneId,
          sceneTitle: readText(first.shot.sourceSceneTitle ?? first.shot.sceneTitle),
          setId: first.spatial.setId,
          setName: first.spatial.setName,
          zoneId: first.spatial.zoneId,
          zoneName: first.spatial.zoneName,
          zoneSummary: readText(first.shot.locationContinuity ?? first.shot.location_continuity),
          chunkIndex,
          shotIds: boardShotIds,
          sourceHash,
          sceneGraphOverrides,
          previousBoardAssetKey: readText(previousBoard.boardAssetKey),
          policyVersion: ZONE_COVERAGE_BOARD_POLICY_VERSION,
          zoneCoverageGridMode: ZONE_COVERAGE_GRID_MODE,
          artStyleDescription,
        }
        const coverageCells = chunkEntries.map((entry, index) => {
          const coverageIntent = asRecord(chunkCoverageIntents[readText(entry.shot.id)])
          return {
            shotId: readText(entry.shot.id),
            shotTitle: readText(entry.shot.title),
            camera: asRecord(entry.shot.camera),
            lighting: readText(entry.shot.lighting),
            locationContinuity: readText(entry.shot.locationContinuity ?? entry.shot.location_continuity),
            screenDirection: readText(coverageIntent.screenDirection ?? coverageIntent.screen_direction)
              || readText(entry.shot.screenDirection ?? entry.shot.screen_direction),
            coverageSetupId: readText(entry.shot.coverageSetupId ?? entry.shot.coverage_setup_id),
            coverageIntent,
            coverage_intent: coverageIntent,
            coverageIntentText: readText(coverageIntent.coverageIntent ?? coverageIntent.coverage_intent),
            coverage_intent_text: readText(coverageIntent.coverageIntent ?? coverageIntent.coverage_intent),
            cameraFraming: readText(coverageIntent.cameraFraming ?? coverageIntent.camera_framing),
            camera_framing: readText(coverageIntent.cameraFraming ?? coverageIntent.camera_framing),
            cameraAngle: readText(coverageIntent.cameraAngle ?? coverageIntent.camera_angle),
            camera_angle: readText(coverageIntent.cameraAngle ?? coverageIntent.camera_angle),
            subjectFocus: readText(coverageIntent.subjectFocus ?? coverageIntent.subject_focus),
            subject_focus: readText(coverageIntent.subjectFocus ?? coverageIntent.subject_focus),
            stagingBrief: readText(coverageIntent.stagingBrief ?? coverageIntent.staging_brief),
            staging_brief: readText(coverageIntent.stagingBrief ?? coverageIntent.staging_brief),
            coverageIntentSourceHash: readText(coverageIntent.sourceHash ?? coverageIntent.source_hash),
            coverage_intent_source_hash: readText(coverageIntent.sourceHash ?? coverageIntent.source_hash),
            coverageAnchorScopeKey: coverageCellScopeKey({
              boardId,
              sourceHash,
              shot: entry.shot,
              spatial: entry.spatial,
            }),
            coverageAnchorScope: ZONE_COVERAGE_CELL_SOURCE,
            coverageAnchorSource: ZONE_COVERAGE_CELL_SOURCE,
            coverageAnchorMode: ZONE_COVERAGE_GRID_MODE,
            spotId: entry.spatial.primarySpotId,
            spotName: entry.spatial.spotName,
            cellIndex: index,
            row: Math.floor(index / 3),
            column: index % 3,
            rowLabel: `row ${Math.floor(index / 3) + 1}, col ${(index % 3) + 1}`,
          }
        })
        const assetPack = mergeAssetPacks(chunkEntries.map((entry) => entry.assetPack))
        const referenceAssetKeys = readStringArray(assetPack.scopedReferenceAssetKeys)

        if (!child) {
          const workflowId = crypto.randomUUID()
          const commonConfig = {
            cinematicPipelineVersion: 'v3_script_storyboards',
            graphSpecVersion: sequenceAnimaticGraphSpecVersion,
            screenplayAnimaticRole: 'zone_coverage_board',
            screenplayAnimaticSource,
            sequenceAnimaticRole: 'zone_coverage_board',
            parentRequestId: masterRequest.id,
            masterRequestId: masterRequest.id,
            zoneCoverageBoardPolicyVersion: ZONE_COVERAGE_BOARD_POLICY_VERSION,
            boardId,
            sourceHash,
            sceneGraphOverrides,
            sceneId: first.spatial.sceneId,
            setId: first.spatial.setId,
            zoneId: first.spatial.zoneId,
            chunkIndex,
            shotIds: boardShotIds,
            previousBoardAssetKey: readText(previousBoard.boardAssetKey),
            dependencyMode: 'zone_coverage_board',
            zoneCoverageGridMode: ZONE_COVERAGE_GRID_MODE,
            coverageAnchorMode: ZONE_COVERAGE_GRID_MODE,
            coverageAnchorSource: ZONE_COVERAGE_CELL_SOURCE,
            artStyleDescription,
            readyToRun: true,
          }
          const graphPlan = buildSequenceAnimaticZoneCoverageBoardWorkflowGraph({
            workflowId,
            draftId: payload.draftId,
            commonConfig,
            board,
            shots: chunkEntries.map((entry) => entry.shot),
            coverageCells,
            assetPack,
            referenceAssetKeys,
            previousBoard,
          })
          const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
            p_project_id: payload.projectId,
            p_draft_id: payload.draftId,
            p_parent_request_id: masterRequest.id,
            p_role: 'zone_coverage_board',
            p_identity_key: 'boardId',
            p_identity_value: boardId,
            p_workflow: {
              project_id: payload.projectId,
              draft_id: payload.draftId,
              key: `sequence_animatic_zone_coverage_board_${slugify(masterRequest.id)}_${slugify(boardId)}_${sourceHash.slice(0, 8)}`,
              name: `${masterRequest.title} / ${readText(board.title) || 'Zone Camera Grid'}`,
              description: 'Scene-level zone camera coverage grid workflow for location-only shot coverage cells.',
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
              prompt: `Generate ${readText(board.title) || 'zone camera coverage grid'}.`,
              title: `${masterRequest.title} / ${readText(board.title) || 'Zone Camera Grid'}`,
              intent: 'output_generation',
              output_kind: 'cinematic_episode',
              status: 'awaiting_confirmation',
              selected_entity_keys: masterRequest.selectedEntityKeys,
              selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
              page_count: null,
              target_format: 'image',
              planner_notes: 'Scene-level location-only zone camera grid prepared from shot-scoped production graph data.',
              metadata: { ...commonConfig, board, coverageCells, createdFromSceneCoverageRefreshAt: new Date().toISOString() },
            },
          })
          if (ensureResponse.error || !ensureResponse.data) throw new Error(ensureResponse.error?.message ?? 'Failed to ensure zone camera grid workflow.')
          const ensured = asRecord(ensureResponse.data)
          child = mapOutputRequestRow(asRecord(ensured.request) as never)
          workflow = mapOutputWorkflowRow(asRecord(ensured.workflow) as never)
          boardNodes = readArray(ensured.nodes).map((row) => mapOutputWorkflowNodeRow(asRecord(row) as never))
          boardEdges = readArray(ensured.edges).map((row) => mapOutputWorkflowEdgeRow(asRecord(row) as never))
          createdCount += 1
          if (payload.forceRefresh) refreshedCount += 1
        } else {
          reusedCount += 1
        }
        if (child?.workflowId && !workflow) {
          const workflowResponse = await client.from('output_workflows').select('*').eq('id', child.workflowId).maybeSingle()
          if (workflowResponse.error) throw new Error(workflowResponse.error.message)
          workflow = workflowResponse.data ? mapOutputWorkflowRow(asRecord(workflowResponse.data) as never) : null
        }
        if (child?.workflowId && (boardNodes.length === 0 || boardEdges.length === 0)) {
          const nodeResponse = await client.from('output_workflow_nodes').select(outputWorkflowNodeSelect).eq('workflow_id', child.workflowId)
          if (nodeResponse.error) throw new Error(nodeResponse.error.message)
          const edgeResponse = await client.from('output_workflow_edges').select(outputWorkflowEdgeSelect).eq('workflow_id', child.workflowId)
          if (edgeResponse.error) throw new Error(edgeResponse.error.message)
          boardNodes = (nodeResponse.data ?? []).map((row) => mapOutputWorkflowNodeRow(asRecord(row) as never))
          boardEdges = (edgeResponse.data ?? []).map((row) => mapOutputWorkflowEdgeRow(asRecord(row) as never))
        }
        if (child) boardRequests.push(child)
        if (workflow) workflows.push(workflow)
        nodes = [...nodes, ...boardNodes]
        edges = [...edges, ...boardEdges]
        zoneCoverageBoards.push({
          ...board,
          coverageCells,
          requestId: child?.id ?? null,
          workflowId: child?.workflowId ?? null,
          latestRunId: child?.latestRunId ?? null,
          requestStatus: child?.status ?? null,
          active: outputRequestIsActive(child),
        })
      }
    }

    const coverageCellByShotId = Object.fromEntries(zoneCoverageBoards.flatMap((board) => readArray(board.coverageCells).map(asRecord).map((cell) => [
      readText(cell.shotId),
      {
        ...cell,
        boardId: readText(board.id),
        source: 'pending_zone_camera_grid_cell',
        coverageAnchorSource: ZONE_COVERAGE_CELL_SOURCE,
      },
    ]).filter(([shotId]) => Boolean(shotId))))
    const cacheStatus = reusedCount > 0 && createdCount > 0
      ? 'mixed'
      : payload.forceRefresh && refreshedCount > 0
        ? 'refreshed'
        : reusedCount > 0 && createdCount === 0
          ? 'reused'
          : 'created'

    return json(sequenceAnimaticZoneCoverageBoardEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      boardRequests,
      workflows,
      nodes,
      edges,
      zoneCoverageBoards,
      coverageCellByShotId,
      cacheStatus,
      sceneId: payload.sceneId,
    }))
  } catch (error) {
    if (error instanceof ZoneCoverageHttpError) {
      return json({ error: error.message, details: error.details }, { status: error.status })
    }
    return errorResponse(error, 'Failed to ensure sequence animatic zone camera grids.')
  }
})
