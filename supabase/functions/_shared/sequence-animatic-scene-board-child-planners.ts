import {
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from './sequence-animatic-workflow-factory.ts'
import {
  buildSequenceAnimaticShotCoverageIntentWorkflowGraph,
  buildSequenceAnimaticZoneCoverageBoardWorkflowGraph,
} from './sequence-animatic-scene-board-workflows.ts'
import {
  buildSequenceAnimaticContinuityAssetWorkflowGraph,
  buildSequenceAnimaticContinuityBatchWorkflowGraph,
} from './sequence-animatic-workflow-factory.ts'
import { continuityNodeCollections } from '../../../src/domain/sequenceAnimaticContinuityDependencies.ts'

type LooseRecord = Record<string, unknown>

type DatabaseClient = {
  from: (table: string) => any
}

type SceneBoardChildPlannerInput = {
  client: DatabaseClient
  projectId: string
  draftId: string
  masterRequestId: string
  sceneId: string
  setId?: string | null
  zoneId?: string | null
  shotIds?: readonly string[]
  scopedShots?: readonly LooseRecord[]
  requestedBy?: string | null
  forceRefresh?: boolean
  upstreamStatus?: LooseRecord
}

export type SceneBoardChildWorkflowSpec = {
  stage: 'set_refs' | 'zone_maps' | 'spot_atlases' | 'spot_angles' | 'scaffold_refs' | 'coverage_directions' | 'coverage_grids'
  role: 'continuity_asset' | 'continuity_asset_batch' | 'coverage_intent_batch' | 'zone_coverage_board'
  identityKey: string
  identityValue: string
  workflow: LooseRecord
  request: LooseRecord
  nodes: LooseRecord[]
  edges: LooseRecord[]
  metadata: LooseRecord
}

export type SceneBoardChildPlannerResult = {
  childWorkflows: SceneBoardChildWorkflowSpec[]
  diagnostics: string[]
  metadata: LooseRecord
}

const outputRequestSelect = 'id, project_id, draft_id, parent_request_id, workflow_id, latest_run_id, requested_by, source_surface, prompt, title, intent, output_kind, status, selected_entity_keys, selected_sequence_unit_keys, page_count, target_format, planner_notes, error_message, metadata, created_at, updated_at'
const outputArtifactSelect = 'id, project_id, draft_id, workflow_id, run_id, node_id, key, name, kind, asset_key, mime_type, summary, metadata, created_at, updated_at'
const COVERAGE_INTENT_POLICY_VERSION = 'coverage_intent_batch_v2'
const ZONE_COVERAGE_BOARD_POLICY_VERSION = 'zone_camera_coverage_grid_v7'
const SET_REF_POLICY_VERSION = 'scene_board_set_ref_v1'
const ZONE_MAP_POLICY_VERSION = 'scene_board_zone_spatial_map_v1'
const SPOT_ATLAS_POLICY_VERSION = 'scene_board_spot_atlas_rectangular_grid_ref_v3'
const SPOT_ANGLE_POLICY_VERSION = 'scene_board_spot_angle_coverage_v1'
const ZONE_COVERAGE_GRID_MODE = 'location_camera_plate_v2'
const ZONE_COVERAGE_CELL_SOURCE = 'zone_camera_grid_cell'
const ACTIVE_OUTPUT_REQUEST_STATUSES = new Set(['queued', 'planning', 'running'])

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
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

function uniqueShotRecords(shots: readonly LooseRecord[]) {
  return [...new Map(shots.map((shot) => [readText(shot.id), shot] as const).filter(([id]) => Boolean(id))).values()]
}

function outputRequestIsActive(request: { status?: string | null } | null | undefined) {
  return ACTIVE_OUTPUT_REQUEST_STATUSES.has(readText(request?.status))
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 72) || 'output'
}

function normalizeOutputRequest(row: LooseRecord) {
  return {
    id: readText(row.id),
    projectId: readText(row.project_id),
    draftId: readText(row.draft_id),
    parentRequestId: readText(row.parent_request_id) || null,
    workflowId: readText(row.workflow_id) || null,
    latestRunId: readText(row.latest_run_id) || null,
    requestedBy: readText(row.requested_by) || null,
    sourceSurface: readText(row.source_surface) || 'outputs',
    prompt: readText(row.prompt),
    title: readText(row.title) || 'Untitled output',
    intent: readText(row.intent) || 'output_generation',
    outputKind: readText(row.output_kind) || 'unknown',
    status: readText(row.status) || 'queued',
    selectedEntityKeys: readStringArray(row.selected_entity_keys),
    selectedSequenceUnitKeys: readStringArray(row.selected_sequence_unit_keys),
    targetFormat: readText(row.target_format),
    metadata: asRecord(row.metadata),
  }
}

function readScreenplayAnimaticRole(metadata: LooseRecord) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function readScreenplayAnimaticSource(metadata: LooseRecord, fallback: 'wiki_sequence_unit' | 'prompt_cinematic' = 'wiki_sequence_unit') {
  const source = readText(metadata.screenplayAnimaticSource)
  return source === 'prompt_cinematic' || source === 'wiki_sequence_unit' ? source : fallback
}

function artifactMetadataRecord(
  artifacts: readonly LooseRecord[],
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

function sceneGraphOverrideForNode(metadata: LooseRecord, nodeId: string) {
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

function sceneGraphOverridesForSpatialScope(metadata: LooseRecord, spatial: Record<string, string>) {
  return uniqueTexts([spatial.setId, spatial.zoneId, spatial.primarySpotId, spatial.viewpointId])
    .map((nodeId) => sceneGraphOverrideForNode(metadata, nodeId))
    .filter((override) => override.visualBriefOverride || override.extraPromptDirection)
}

function sceneIdForShot(shot: LooseRecord) {
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

function spatialFieldsForShot(shot: LooseRecord, metadata: LooseRecord = {}) {
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
    || ''
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

function shotOrderValue(shot: LooseRecord, fallback: number) {
  const numeric = Number(shot.globalIndex ?? shot.global_index ?? shot.index ?? shot.shotIndex ?? shot.shot_index)
  return Number.isFinite(numeric) ? numeric : fallback
}

function collectNestedShots(value: unknown, depth = 0, context: Record<string, string> = {}): LooseRecord[] {
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
  manifest: LooseRecord
  directorPlan: LooseRecord
  sceneId: string
  shotIds?: readonly string[]
  fallbackShots?: readonly LooseRecord[]
}) {
  const scopedShotIds = new Set((input.shotIds ?? []).map(readText).filter(Boolean))
  const manifestBlocks = readArray(input.manifest.blocks).map(asRecord).filter((block) => readText(block.id))
  const directorShots = uniqueShotRecords([
    ...readArray(input.directorPlan.shots).map(asRecord),
    ...collectNestedShots(input.directorPlan),
  ])
  const directorShotsById = new Map(directorShots.map((shot) => [readText(shot.id), shot] as const))
  const blockMap = new Map<string, LooseRecord>()
  const manifestBlockShots = manifestBlocks.flatMap((block) => {
    const blockId = readText(block.id)
    blockMap.set(blockId, block)
    return readArray(block.shots).map(asRecord).map((shot) => ({
      ...shot,
      blockId: readText(shot.blockId) || readText(shot.storyboardBlockId) || blockId,
      storyboardBlockId: readText(shot.storyboardBlockId) || readText(shot.blockId) || blockId,
    }) as LooseRecord)
  }).filter((shot: LooseRecord) => readText(shot.id))
  const manifestShots = uniqueShotRecords([
    ...manifestBlockShots,
    ...collectNestedShots(input.manifest),
  ])
  const shotIdsFromManifest = new Set(manifestShots.map((shot) => readText(shot.id)).filter(Boolean))
  const shotIdsBeforeFallback = new Set([...shotIdsFromManifest, ...directorShots.map((shot) => readText(shot.id))].filter(Boolean))
  const fallbackShots = (input.fallbackShots ?? []).map(asRecord).filter((shot) => readText(shot.id) && !shotIdsBeforeFallback.has(readText(shot.id)))
  const shots: LooseRecord[] = [
    ...manifestShots,
    ...directorShots.filter((shot) => !shotIdsFromManifest.has(readText(shot.id))),
    ...fallbackShots.map((shot) => ({
      ...shot,
      sourceSceneId: readText(shot.sourceSceneId ?? shot.source_scene_id ?? shot.sceneId ?? shot.scene_id) || input.sceneId,
      blockId: readText(shot.blockId ?? shot.block_id ?? shot.storyboardBlockId ?? shot.storyboard_block_id) || `${input.sceneId}_block`,
      storyboardBlockId: readText(shot.storyboardBlockId ?? shot.storyboard_block_id ?? shot.blockId ?? shot.block_id) || `${input.sceneId}_block`,
    })),
  ]
  return shots.map((shot: LooseRecord, index) => {
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
    } as LooseRecord
  })
    .filter((shot) => scopedShotIds.size > 0 ? scopedShotIds.has(readText(shot.id)) : sceneIdForShot(shot) === input.sceneId)
    .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0))
}

function entityAssetKeys(entity: LooseRecord) {
  return uniqueTexts([
    readText(entity.primaryAssetKey),
    readText(entity.selectedReferenceAssetKey),
    readText(entity.selectedReferenceVariantAssetKey),
    ...readStringArray(entity.assetKeys),
  ])
}

function assetEntityForKey(assetKey: string, label: string, role = 'continuity_reference') {
  return {
    key: `scene_board_ref_${slugify(assetKey)}`,
    name: label || 'Continuity reference',
    type: 'continuity_asset',
    role,
    summary: 'Generated continuity asset used as Scene Board production context.',
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
  }
}

function continuityAssetKeysForNode(node: LooseRecord) {
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

function strictSpotAtlasAssetKeysForNode(node: LooseRecord) {
  const state = asRecord(node.assetState ?? node.asset_state)
  const generationPolicy = readText(state.generationPolicy ?? state.generation_policy)
  const referenceAssetKeys = readStringArray(state.referenceAssetKeys ?? state.reference_asset_keys)
  return generationPolicy === 'spot_atlas_grid_rectangular_ref_v3' && referenceAssetKeys.length > 0
    ? continuityAssetKeysForNode(node)
    : []
}

function spatialNodeZoneId(node: LooseRecord, nodesById: Map<string, LooseRecord>, depth = 0): string {
  if (depth > 4) return ''
  const directZoneId = readText(node.zoneId ?? node.zone_id ?? node.sourceZoneId ?? node.source_zone_id)
  if (directZoneId) return directZoneId
  const parentId = readText(node.parentId ?? node.parent_id ?? node.spotId ?? node.spot_id)
  if (!parentId) return ''
  const parent = nodesById.get(parentId) ?? {}
  if (spatialAssetKindForNode(parent) === 'location_zone') return readText(parent.id)
  return spatialNodeZoneId(parent, nodesById, depth + 1)
}

function spatialNodeBelongsToZone(node: LooseRecord, zoneId: string, nodesById: Map<string, LooseRecord>) {
  const nodeId = readText(node.id)
  const kind = spatialAssetKindForNode(node)
  if (!nodeId || !zoneId) return false
  if (kind === 'location_zone') return nodeId === zoneId
  const nodeZoneId = spatialNodeZoneId(node, nodesById)
  return nodeZoneId === zoneId
}

function candidateSpotNodeIdsForZone(entries: readonly { spatial: Record<string, string> }[], zoneId: string, nodesById: Map<string, LooseRecord>) {
  return uniqueTexts(entries.flatMap((entry) => [entry.spatial.primarySpotId, entry.spatial.viewpointId]))
    .map((nodeId) => nodesById.get(nodeId) ?? {})
    .filter((node) => {
      const kind = spatialAssetKindForNode(node)
      return kind === 'location_spot' || kind === 'location_viewpoint'
    })
    .filter((node) => spatialNodeBelongsToZone(node, zoneId, nodesById))
    .map((node) => readText(node.id))
}

function continuityAssetStatesFromArtifacts(artifacts: readonly LooseRecord[]) {
  const states = new Map<string, LooseRecord>()
  for (const artifact of artifacts) {
    const metadata = asRecord(artifact.metadata)
    const role = readText(metadata.role)
    if (role === 'sequence_animatic_continuity_asset_batch') {
      Object.entries(asRecord(metadata.assetStateByNodeId ?? metadata.asset_state_by_node_id)).forEach(([nodeId, value]) => {
        if (nodeId && !states.has(nodeId)) states.set(nodeId, asRecord(value))
      })
      continue
    }
    if (role !== 'sequence_animatic_continuity_asset') continue
    const state = asRecord(metadata.assetState ?? metadata.asset_state)
    const nodeId = readText(state.sourceNodeId) || readText(metadata.targetNodeId)
    if (nodeId && !states.has(nodeId)) states.set(nodeId, state)
  }
  return states
}

function upstreamRuntimeRecords(value: unknown): LooseRecord[] {
  const root = asRecord(value)
  return [
    root,
    asRecord(root.upstreamStatus ?? root.upstream_status),
    asRecord(root.workflowRuntime ?? root.workflow_runtime),
  ].filter((record) => Object.keys(record).length > 0)
}

function upstreamAssetStatesByNodeId(value: unknown) {
  const states = new Map<string, LooseRecord>()
  for (const record of upstreamRuntimeRecords(value)) {
    const byNode = asRecord(record.assetStatesByNodeId ?? record.asset_states_by_node_id)
    for (const [nodeId, state] of Object.entries(byNode)) {
      if (nodeId && !states.has(nodeId)) states.set(nodeId, asRecord(state))
    }
  }
  return states
}

function upstreamAssetKeysForNodeId(
  value: unknown,
  nodeId: string,
  predicate?: (state: LooseRecord) => boolean,
) {
  const keys: string[] = []
  const states = upstreamAssetStatesByNodeId(value)
  const state = states.get(nodeId)
  if (state && (!predicate || predicate(state))) {
    keys.push(
      readText(state.assetKey ?? state.asset_key),
      readText(state.imageAssetKey ?? state.image_asset_key),
      readText(state.primaryAssetKey ?? state.primary_asset_key),
      readText(state.selectedReferenceAssetKey ?? state.selected_reference_asset_key),
      ...readStringArray(state.assetKeys ?? state.asset_keys),
    )
  }
  for (const record of upstreamRuntimeRecords(value)) {
    const byNode = asRecord(record.assetKeysByNodeId ?? record.asset_keys_by_node_id)
    const directKeys = readStringArray(byNode[nodeId])
    if (directKeys.length > 0 && (!predicate || !state || predicate(state))) keys.push(...directKeys)
  }
  return uniqueTexts(keys)
}

function upstreamReferenceAssetKeysForNodeId(value: unknown, nodeId: string) {
  const state = upstreamAssetStatesByNodeId(value).get(nodeId)
  return state ? readStringArray(state.referenceAssetKeys ?? state.reference_asset_keys) : []
}

function strictSpotAtlasStateIsUsable(state: LooseRecord) {
  const generationPolicy = readText(state.generationPolicy ?? state.generation_policy)
  const referenceAssetKeys = readStringArray(state.referenceAssetKeys ?? state.reference_asset_keys)
  return generationPolicy === 'spot_atlas_grid_rectangular_ref_v3' && referenceAssetKeys.length > 0
}

function referenceAssetKeysForNodeIdsWithRuntime(input: {
  nodeIds: readonly string[]
  nodesById: Map<string, LooseRecord>
  upstreamStatus?: LooseRecord
  forceRefresh?: boolean
  predicate?: (state: LooseRecord) => boolean
}) {
  const currentRunKeys = input.nodeIds.flatMap((nodeId) => upstreamAssetKeysForNodeId(input.upstreamStatus, nodeId, input.predicate))
  const fallbackKeys = input.forceRefresh === true
    ? []
    : input.nodeIds.flatMap((nodeId) => continuityAssetKeysForNode(input.nodesById.get(nodeId) ?? {}))
  return uniqueTexts([...currentRunKeys, ...fallbackKeys])
}

function applyContinuityAssetStatesToNodes(
  nodesById: Map<string, LooseRecord>,
  statesByNodeId: Map<string, LooseRecord>,
) {
  for (const [nodeId, state] of statesByNodeId.entries()) {
    const node = nodesById.get(nodeId) ?? {
      id: nodeId,
      nodeKind: readText(state.assetKind) || 'location_angle',
      assetKind: readText(state.assetKind) || 'location_angle',
      kind: readText(state.assetKind) || 'location_angle',
      name: readText(state.name) || nodeId,
      summary: readText(state.summary),
      parentId: readText(state.parentNodeId ?? state.parent_node_id ?? state.sourceSpotId ?? state.source_spot_id),
      parent_id: readText(state.parentNodeId ?? state.parent_node_id ?? state.sourceSpotId ?? state.source_spot_id),
      spotId: readText(state.sourceSpotId ?? state.source_spot_id),
      spot_id: readText(state.sourceSpotId ?? state.source_spot_id),
      zoneId: readText(state.sourceZoneId ?? state.source_zone_id),
      zone_id: readText(state.sourceZoneId ?? state.source_zone_id),
    }
    node.assetState = {
      ...asRecord(node.assetState ?? node.asset_state),
      ...state,
    }
    node.asset_state = node.assetState
    nodesById.set(nodeId, node)
  }
}

function graphNodeMap(input: { manifest: LooseRecord; directorPlan: LooseRecord }) {
  const graph = asRecord(
    input.manifest.continuityGraphV2
      ?? input.manifest.continuity_graph_v2
      ?? input.directorPlan.continuityGraphV2
      ?? input.directorPlan.continuity_graph_v2,
  )
  return new Map(continuityNodeCollections(graph).map((node) => [readText(node.id), node as LooseRecord] as const).filter(([id]) => Boolean(id)))
}

function locationReferenceEntitiesForShot(shot: LooseRecord, nodesById: Map<string, LooseRecord>) {
  const spatial = spatialFieldsForShot(shot)
  const angleNodeIds = [...nodesById.values()]
    .filter((node) => {
      const kind = spatialAssetKindForNode(node)
      return kind === 'location_angle' && readText(node.spotId ?? node.spot_id ?? node.parentId ?? node.parent_id) === spatial.primarySpotId
    })
    .map((node) => readText(node.id))
  const spatialNodeIds = uniqueTexts([spatial.setId, spatial.zoneId, spatial.primarySpotId, spatial.viewpointId, ...angleNodeIds])
  const entities: LooseRecord[] = []
  for (const nodeId of spatialNodeIds) {
    const node = nodesById.get(nodeId)
    if (!node) continue
    const nodeKind = readText(node.nodeKind ?? node.assetKind)
    const role = nodeKind === 'location_zone'
      ? 'zone_spatial_map_reference'
      : nodeKind === 'location_spot' || nodeKind === 'location_viewpoint' || nodeKind === 'location_angle'
        ? 'spot_atlas_reference'
        : 'location_continuity_reference'
    for (const assetKey of continuityAssetKeysForNode(node).slice(0, 1)) {
      entities.push(assetEntityForKey(assetKey, `${readText(node.name) || nodeId} ref`, role))
    }
  }
  return entities
}

function locationAssetPackForShot(assetPack: LooseRecord, shot: LooseRecord, nodesById: Map<string, LooseRecord>, referenceScope: string) {
  const entities = locationReferenceEntitiesForShot(shot, nodesById)
  return {
    ...assetPack,
    entities,
    scopedReferenceAssetKeys: uniqueTexts(entities.flatMap(entityAssetKeys)).slice(0, 12),
    referenceScope,
  }
}

function mergeAssetPacks(packs: readonly LooseRecord[], referenceScope: string) {
  const seenEntityKeys = new Set<string>()
  const entities: LooseRecord[] = []
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
    referenceScope,
  }
}

function requiredSpatialReferenceIds(spatial: Record<string, string>) {
  return uniqueTexts([spatial.setId, spatial.zoneId, spatial.primarySpotId, spatial.viewpointId])
}

function missingSpatialReferencesForEntry(entry: {
  shot: LooseRecord
  spatial: Record<string, string>
}, nodesById: Map<string, LooseRecord>) {
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

function spotAngleAssetKeysForSpot(spotId: string, nodesById: Map<string, LooseRecord>) {
  return uniqueTexts([...nodesById.values()]
    .filter((node) => spatialAssetKindForNode(node) === 'location_angle')
    .filter((node) => readText(node.spotId ?? node.spot_id ?? node.parentId ?? node.parent_id) === spotId)
    .flatMap(continuityAssetKeysForNode))
}

function missingSpotAngleReferencesForEntry(entry: {
  shot: LooseRecord
  spatial: Record<string, string>
}, nodesById: Map<string, LooseRecord>) {
  const spotId = readText(entry.spatial.primarySpotId)
  if (!spotId) return []
  const angleAssets = spotAngleAssetKeysForSpot(spotId, nodesById)
  return angleAssets.length > 0 ? [] : [{
    nodeId: `${spotId}::spot_angle_coverage`,
    shotId: readText(entry.shot.id),
    kind: 'location_angle',
    name: `${readText(nodesById.get(spotId)?.name) || spotId} angle coverage`,
    reason: 'missing_spot_angle_assets',
  }]
}

function spatialAssetKindForNode(node: LooseRecord) {
  const kind = readText(node.nodeKind ?? node.assetKind ?? node.kind)
  const id = readText(node.id)
  if (kind === 'world_location' || kind === 'location_set' || kind === 'set' || id.startsWith('set_')) return 'location_set'
  if (kind === 'location_zone' || kind === 'zone' || id.startsWith('zone_')) return 'location_zone'
  if (kind === 'location_angle' || kind === 'angle' || id.includes('_angle_')) return 'location_angle'
  if (kind === 'location_viewpoint' || kind === 'viewpoint' || id.includes('_viewpoint')) return 'location_viewpoint'
  if (kind === 'location_spot' || kind === 'spot' || id.startsWith('spot_')) return 'location_spot'
  return kind || 'location_reference'
}

function parentIdForSpatialNode(node: LooseRecord) {
  return readText(
    node.parentId
      ?? node.parent_id
      ?? node.setId
      ?? node.set_id
      ?? node.zoneId
      ?? node.zone_id
      ?? node.spotId
      ?? node.spot_id,
  )
}

function continuityPackForSceneBoard(input: {
  masterRequestId: string
  manifest: LooseRecord
  directorPlan: LooseRecord
}) {
  const graph = asRecord(
    input.manifest.continuityGraphV2
      ?? input.manifest.continuity_graph_v2
      ?? input.directorPlan.continuityGraphV2
      ?? input.directorPlan.continuity_graph_v2,
  )
  const shotBindings = asRecord(
    input.manifest.shotBindings
      ?? input.manifest.shot_bindings
      ?? input.directorPlan.shotBindings
      ?? input.directorPlan.shot_bindings,
  )
  return {
    graphSpecVersion: 'sequence_animatic_graph_v2',
    masterRequestId: input.masterRequestId,
    continuityGraphV2: graph,
    continuity_graph_v2: graph,
    shotBindings,
    shot_bindings: shotBindings,
    continuityPackHash: sequenceAnimaticStableHash({ graph, shotBindings }),
  }
}

function relevantShotsForNode(nodeId: string, entries: readonly { shot: LooseRecord; spatial: Record<string, string> }[]) {
  return entries
    .filter((entry) => requiredSpatialReferenceIds(entry.spatial).includes(nodeId))
    .map((entry) => entry.shot)
}

function buildContinuityAssetChildSpec(input: {
  stage: 'set_refs' | 'zone_maps'
  policyVersion: string
  context: Awaited<ReturnType<typeof loadSceneBoardPlanningContext>>
  projectId: string
  draftId: string
  requestedBy: string
  targetNode: LooseRecord
  relevantShots: LooseRecord[]
  referenceAssetKeys: string[]
  generationPolicy: string
  sourceSurface: string
  visualCanonGuard?: { text: string; hash: string; forbidden: string[] }
}) {
  const targetNodeId = readText(input.targetNode.id)
  const assetKind = spatialAssetKindForNode(input.targetNode)
  const visualCanonGuard = input.visualCanonGuard ?? { text: '', hash: '', forbidden: [] }
  const sourceHash = sequenceAnimaticStableHash({
    policy: input.policyVersion,
    targetNodeId,
    targetNode: input.targetNode,
    assetKind,
    generationPolicy: input.generationPolicy,
    relevantShotIds: input.relevantShots.map((shot) => readText(shot.id)),
    referenceAssetKeys: input.referenceAssetKeys,
    visualCanonGuardHash: visualCanonGuard.hash,
  })
  const workflowId = crypto.randomUUID()
  const commonConfig = {
    cinematicPipelineVersion: 'v3_script_storyboards',
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    screenplayAnimaticRole: 'continuity_asset',
    screenplayAnimaticSource: input.context.screenplayAnimaticSource,
    sequenceAnimaticRole: 'continuity_asset',
    parentRequestId: input.context.masterRequest.id,
    masterRequestId: input.context.masterRequest.id,
    sceneBoardPrepStage: input.stage,
    scene_board_prep_stage: input.stage,
    sceneBoardContinuityPolicyVersion: input.policyVersion,
    scene_board_continuity_policy_version: input.policyVersion,
    sourceHash,
    sceneBoardContinuityIdentity: `${input.stage}:${targetNodeId}:${sourceHash}`,
    scene_board_continuity_identity: `${input.stage}:${targetNodeId}:${sourceHash}`,
    targetNodeId,
    assetKind,
    generationPolicy: input.generationPolicy,
    visualCanonGuard: visualCanonGuard.text,
    visual_canon_guard: visualCanonGuard.text,
    visualCanonGuardHash: visualCanonGuard.hash,
    visual_canon_guard_hash: visualCanonGuard.hash,
    forbiddenVisualElements: visualCanonGuard.forbidden,
    forbidden_visual_elements: visualCanonGuard.forbidden,
    readyToRun: true,
  }
  const graphPlan = buildSequenceAnimaticContinuityAssetWorkflowGraph({
    workflowId,
    draftId: input.draftId,
    commonConfig,
    continuityPack: continuityPackForSceneBoard({
      masterRequestId: input.context.masterRequest.id,
      manifest: input.context.manifest,
      directorPlan: input.context.directorPlan,
    }),
    targetNode: input.targetNode,
    targetNodeId,
    assetKind,
    relevantShots: input.relevantShots,
    shotBindings: asRecord(input.context.directorPlan.shotBindings ?? input.context.directorPlan.shot_bindings),
    assetPack: asRecord(input.context.manifest.assetPack),
    referenceAssetKeys: input.referenceAssetKeys,
    visualDependencyEdges: [],
    aspectRatio: assetKind === 'location_zone' ? '3:2' : '1:1',
  })
  const title = `${input.context.masterRequest.title} / ${readText(input.targetNode.name) || targetNodeId} Reference`
  return {
    stage: input.stage,
    role: 'continuity_asset',
    identityKey: 'sceneBoardContinuityIdentity',
    identityValue: `${input.stage}:${targetNodeId}:${sourceHash}`,
    workflow: {
      project_id: input.projectId,
      draft_id: input.draftId,
      key: `sequence_animatic_scene_board_${input.stage}_${slugify(input.context.masterRequest.id)}_${slugify(targetNodeId)}_${sourceHash.slice(0, 8)}`,
      name: title,
      description: 'Scene Board continuity reference child workflow.',
      preset: 'cinematic_episode_from_sequence',
      status: 'active',
      created_by: input.requestedBy,
      metadata: commonConfig,
    },
    nodes: graphPlan.nodes.map(asRecord),
    edges: graphPlan.edges.map(asRecord),
    request: {
      project_id: input.projectId,
      draft_id: input.draftId,
      parent_request_id: input.context.masterRequest.id,
      requested_by: input.requestedBy,
      source_surface: input.sourceSurface,
      prompt: `Generate continuity reference for ${readText(input.targetNode.name) || targetNodeId}.`,
      title,
      intent: 'output_generation',
      output_kind: 'cinematic_episode',
      status: 'awaiting_confirmation',
      selected_entity_keys: input.context.masterRequest.selectedEntityKeys,
      selected_sequence_unit_keys: input.context.masterRequest.selectedSequenceUnitKeys,
      page_count: null,
      target_format: 'image',
      planner_notes: 'Scene Board parent workflow generated this spatial continuity reference child.',
      metadata: {
        ...commonConfig,
        targetNode: input.targetNode,
        target_node: input.targetNode,
        relevantShotIds: input.relevantShots.map((shot) => readText(shot.id)).filter(Boolean),
        relevant_shot_ids: input.relevantShots.map((shot) => readText(shot.id)).filter(Boolean),
        referenceAssetKeys: input.referenceAssetKeys,
        reference_asset_keys: input.referenceAssetKeys,
        createdFromSceneBoardPrepAt: new Date().toISOString(),
      },
    },
    metadata: { sourceHash, targetNodeId, assetKind, referenceAssetKeys: input.referenceAssetKeys },
  } satisfies SceneBoardChildWorkflowSpec
}

function buildContinuityBatchChildSpec(input: {
  stage: 'spot_atlases' | 'spot_angles'
  policyVersion: string
  context: Awaited<ReturnType<typeof loadSceneBoardPlanningContext>>
  projectId: string
  draftId: string
  requestedBy: string
  parentNode: LooseRecord
  targetNodes: LooseRecord[]
  relevantShots: LooseRecord[]
  referenceAssetKeys: string[]
  generationPolicy: string
  batchKind: string
  sourceSurface: string
  forceRefresh?: boolean
  visualCanonGuard?: { text: string; hash: string; forbidden: string[] }
}) {
  const parentNodeId = readText(input.parentNode.id) || 'scene'
  const targetNodeIds = input.targetNodes.map((node) => readText(node.id)).filter(Boolean)
  const visualCanonGuard = input.visualCanonGuard ?? { text: '', hash: '', forbidden: [] }
  const columns = input.stage === 'spot_angles' && input.targetNodes.length === 4
    ? 2
    : Math.min(3, Math.max(1, input.targetNodes.length))
  const rows = Math.max(1, Math.ceil(input.targetNodes.length / columns))
  const layout = { rows, columns, cellCount: input.targetNodes.length }
  const sourceHash = sequenceAnimaticStableHash({
    policy: input.policyVersion,
    parentNodeId,
    targetNodeIds,
    layout,
    generationPolicy: input.generationPolicy,
    relevantShotIds: input.relevantShots.map((shot) => readText(shot.id)),
    referenceAssetKeys: input.referenceAssetKeys,
    forceRefresh: input.forceRefresh === true,
    visualCanonGuardHash: visualCanonGuard.hash,
  })
  const workflowId = crypto.randomUUID()
  const batchId = sequenceAnimaticStableHash({
    policy: input.policyVersion,
    parentNodeId,
    targetNodeIds,
    layout,
  })
  const batchTitle = input.stage === 'spot_angles'
    ? `${readText(input.parentNode.name) || parentNodeId} canonical spot angles`
    : `${readText(input.parentNode.name) || parentNodeId} spot atlas`
  const batch = {
    batchId,
    batchKind: input.batchKind,
    generationPolicy: input.generationPolicy,
    parentNodeId,
    targetNodeIds,
    layout,
    cellRoles: input.targetNodes.map((node) => spatialAssetKindForNode(node)),
    title: batchTitle,
  }
  const commonConfig = {
    cinematicPipelineVersion: 'v3_script_storyboards',
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    screenplayAnimaticRole: 'continuity_asset_batch',
    screenplayAnimaticSource: input.context.screenplayAnimaticSource,
    sequenceAnimaticRole: 'continuity_asset_batch',
    parentRequestId: input.context.masterRequest.id,
    masterRequestId: input.context.masterRequest.id,
    sceneBoardPrepStage: input.stage,
    scene_board_prep_stage: input.stage,
    sceneBoardContinuityPolicyVersion: input.policyVersion,
    scene_board_continuity_policy_version: input.policyVersion,
    batchId,
    sourceHash,
    sceneBoardContinuityIdentity: `${input.stage}:${batchId}:${sourceHash}`,
    scene_board_continuity_identity: `${input.stage}:${batchId}:${sourceHash}`,
    parentNodeId,
    generationPolicy: input.generationPolicy,
    visualCanonGuard: visualCanonGuard.text,
    visual_canon_guard: visualCanonGuard.text,
    visualCanonGuardHash: visualCanonGuard.hash,
    visual_canon_guard_hash: visualCanonGuard.hash,
    forbiddenVisualElements: visualCanonGuard.forbidden,
    forbidden_visual_elements: visualCanonGuard.forbidden,
    forceRefresh: input.forceRefresh === true,
    readyToRun: true,
  }
  const graphPlan = buildSequenceAnimaticContinuityBatchWorkflowGraph({
    workflowId,
    draftId: input.draftId,
    commonConfig,
    batch,
    targetNodes: input.targetNodes,
    continuityGraphV2: asRecord(input.context.manifest.continuityGraphV2 ?? input.context.manifest.continuity_graph_v2 ?? input.context.directorPlan.continuityGraphV2 ?? input.context.directorPlan.continuity_graph_v2),
    relevantShots: input.relevantShots,
    shotBindings: asRecord(input.context.directorPlan.shotBindings ?? input.context.directorPlan.shot_bindings),
    assetPack: asRecord(input.context.manifest.assetPack),
    referenceAssetKeys: input.referenceAssetKeys,
    visualDependencyEdges: [],
    aspectRatio: '1:1',
  })
  const title = `${input.context.masterRequest.title} / ${readText(batch.title) || 'Spot Atlas'}`
  return {
    stage: input.stage,
    role: 'continuity_asset_batch',
    identityKey: 'sceneBoardContinuityIdentity',
    identityValue: `${input.stage}:${batchId}:${sourceHash}`,
    workflow: {
      project_id: input.projectId,
      draft_id: input.draftId,
      key: `sequence_animatic_scene_board_${input.stage}_${slugify(input.context.masterRequest.id)}_${slugify(parentNodeId)}_${sourceHash.slice(0, 8)}`,
      name: title,
      description: 'Scene Board spot atlas child workflow.',
      preset: 'cinematic_episode_from_sequence',
      status: 'active',
      created_by: input.requestedBy,
      metadata: commonConfig,
    },
    nodes: graphPlan.nodes.map(asRecord),
    edges: graphPlan.edges.map(asRecord),
    request: {
      project_id: input.projectId,
      draft_id: input.draftId,
      parent_request_id: input.context.masterRequest.id,
      requested_by: input.requestedBy,
      source_surface: input.sourceSurface,
      prompt: `Generate spot atlas for ${readText(input.parentNode.name) || parentNodeId}.`,
      title,
      intent: 'output_generation',
      output_kind: 'cinematic_episode',
      status: 'awaiting_confirmation',
      selected_entity_keys: input.context.masterRequest.selectedEntityKeys,
      selected_sequence_unit_keys: input.context.masterRequest.selectedSequenceUnitKeys,
      page_count: null,
      target_format: 'image',
      planner_notes: 'Scene Board parent workflow generated this spot atlas child.',
      metadata: {
        ...commonConfig,
        batch,
        targetNodes: input.targetNodes,
        target_nodes: input.targetNodes,
        referenceAssetKeys: input.referenceAssetKeys,
        reference_asset_keys: input.referenceAssetKeys,
        createdFromSceneBoardPrepAt: new Date().toISOString(),
      },
    },
    metadata: { sourceHash, batchId, parentNodeId, targetNodeIds, referenceAssetKeys: input.referenceAssetKeys },
  } satisfies SceneBoardChildWorkflowSpec
}

function coverageCellScopeKey(input: {
  boardId: string
  sourceHash: string
  shot: LooseRecord
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

function artStyleDescriptionForBoard(input: {
  masterMetadata: LooseRecord
  manifest: LooseRecord
  directorPlan: LooseRecord
  assetPack: LooseRecord
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

function visualCanonGuardForBoard(input: {
  masterMetadata: LooseRecord
  manifest: LooseRecord
  directorPlan: LooseRecord
  assetPack: LooseRecord
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
  const positiveContext = uniqueTexts([
    readText(worldWiki.title),
    readText(worldWiki.genre),
    readText(worldWiki.setting),
    readText(worldWiki.settingEra ?? worldWiki.setting_era),
    readText(worldWiki.timePeriod ?? worldWiki.time_period),
    readText(worldWiki.technologyLevel ?? worldWiki.technology_level),
    readText(worldWiki.transportation ?? worldWiki.transport),
    readText(worldWiki.architecture),
    readText(worldWiki.materialCulture ?? worldWiki.material_culture),
    readText(worldWiki.artStyleDescription),
    readText(projectContext.genre),
    readText(projectContext.setting),
    readText(projectContext.settingEra ?? projectContext.setting_era),
    readText(projectContext.timePeriod ?? projectContext.time_period),
    readText(projectContext.technologyLevel ?? projectContext.technology_level),
    readText(input.manifest.worldContext ?? input.manifest.world_context),
    readText(input.directorPlan.worldContext ?? input.directorPlan.world_context),
    readText(input.assetPack.artStyleDescription),
  ]).slice(0, 8)
  const explicitForbidden = uniqueTexts([
    ...readStringArray(worldWiki.forbiddenVisualElements ?? worldWiki.forbidden_visual_elements),
    ...readStringArray(worldWiki.anachronismAvoidList ?? worldWiki.anachronism_avoid_list),
    ...readStringArray(projectContext.forbiddenVisualElements ?? projectContext.forbidden_visual_elements),
    ...readStringArray(projectContext.anachronismAvoidList ?? projectContext.anachronism_avoid_list),
  ])
  const forbidden = uniqueTexts(explicitForbidden).slice(0, 12)
  const guard = [
    positiveContext.length > 0 ? `Project visual canon: ${positiveContext.join(' / ')}` : '',
    forbidden.length > 0 ? `Do not introduce anachronisms or unsupported technology: ${forbidden.join(', ')}.` : '',
    'Only show visual elements that are supported by this world context or the scene graph brief.',
  ].filter(Boolean).join('\n')
  return {
    text: guard,
    hash: sequenceAnimaticStableHash({ positiveContext, forbidden, policy: 'visual_canon_guard_v1' }),
    forbidden,
  }
}

function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size) as T[])
  return chunks
}

async function resolveSceneBoardCombinedManifest(input: {
  client: DatabaseClient
  masterRequest: ReturnType<typeof normalizeOutputRequest>
}) {
  const childrenResponse = await input.client
    .from('output_requests')
    .select(outputRequestSelect)
    .eq('project_id', input.masterRequest.projectId)
    .eq('draft_id', input.masterRequest.draftId)
    .eq('parent_request_id', input.masterRequest.id)
    .order('created_at', { ascending: true })
  if (childrenResponse.error) throw new Error(childrenResponse.error.message)
  const sceneChildren = (childrenResponse.data ?? [])
    .map((row: unknown) => normalizeOutputRequest(asRecord(row)))
    .filter((child: ReturnType<typeof normalizeOutputRequest>) => readScreenplayAnimaticRole(asRecord(child.metadata)) === 'scene_shot_plan')
    .filter((child: ReturnType<typeof normalizeOutputRequest>) => child.status === 'completed' && child.workflowId)
    .sort((left: ReturnType<typeof normalizeOutputRequest>, right: ReturnType<typeof normalizeOutputRequest>) => (
      Number(asRecord(left.metadata).sceneIndex ?? 0) || 9999
    ) - (
      Number(asRecord(right.metadata).sceneIndex ?? 0) || 9999
    ))
  if (sceneChildren.length === 0) return null
  const workflowIds = sceneChildren.map((child: ReturnType<typeof normalizeOutputRequest>) => child.workflowId).filter(Boolean)
  const artifactsResponse = await input.client
    .from('output_artifacts')
    .select(outputArtifactSelect)
    .in('workflow_id', workflowIds)
    .order('created_at', { ascending: false })
  if (artifactsResponse.error) throw new Error(artifactsResponse.error.message)
  const latestByWorkflowAndRole = new Map<string, LooseRecord>()
  for (const row of (artifactsResponse.data ?? []).map(asRecord)) {
    const role = readText(asRecord(row.metadata).role)
    const key = `${readText(row.workflow_id)}:${role}`
    if (!latestByWorkflowAndRole.has(key)) latestByWorkflowAndRole.set(key, row)
  }
  const mergeRecordsById = (entries: LooseRecord[]) => {
    const byId = new Map<string, LooseRecord>()
    for (const entry of entries) {
      const id = readText(entry.id)
      if (!id) continue
      byId.set(id, { ...byId.get(id), ...entry })
    }
    return [...byId.values()]
  }
  const blocks: LooseRecord[] = []
  const shots: LooseRecord[] = []
  const planShots: LooseRecord[] = []
  const planBlocks: LooseRecord[] = []
  const coverageSetups: LooseRecord[] = []
  const localReferences: LooseRecord[] = []
  const shotBindings: LooseRecord = {}
  const graphArrays: Record<string, LooseRecord[]> = { sets: [], zones: [], spots: [], viewpoints: [], angles: [], edges: [] }
  const readySceneIds: string[] = []
  let assetPack: LooseRecord = {}
  let blockIndex = 1
  let shotIndex = 1
  for (const child of sceneChildren) {
    const manifestRow = latestByWorkflowAndRole.get(`${child.workflowId}:sequence_animatic_manifest`)
    const planRow = latestByWorkflowAndRole.get(`${child.workflowId}:sequence_animatic_director_plan`)
    const sceneManifest = asRecord(asRecord(manifestRow?.metadata).manifest)
    const scenePlan = asRecord(asRecord(planRow?.metadata).shotContinuityPlan ?? asRecord(planRow?.metadata).directorPlan)
    if (Object.keys(sceneManifest).length === 0) continue
    readySceneIds.push(readText(asRecord(child.metadata).sceneId))
    if (Object.keys(assetPack).length === 0) assetPack = asRecord(sceneManifest.assetPack)
    for (const block of readArray(sceneManifest.blocks).map(asRecord)) {
      blocks.push({ ...block, index: blockIndex })
      blockIndex += 1
    }
    for (const shot of readArray(asRecord(sceneManifest.shotPlan).shots).map(asRecord)) {
      shots.push({ ...shot, index: shotIndex })
      shotIndex += 1
    }
    const planSource = Object.keys(scenePlan).length > 0 ? scenePlan : asRecord(sceneManifest.directorPlan)
    for (const shot of readArray(planSource.shots).map(asRecord)) planShots.push(shot)
    for (const block of readArray(planSource.blocks).map(asRecord)) planBlocks.push(block)
    for (const setup of readArray(planSource.coverageSetups ?? planSource.coverage_setups).map(asRecord)) coverageSetups.push(setup)
    for (const reference of readArray(planSource.localReferences ?? planSource.outputLocalReferences).map(asRecord)) localReferences.push(reference)
    Object.assign(shotBindings, asRecord(planSource.shotBindings ?? planSource.shot_bindings))
    const graph = asRecord(planSource.continuityGraphV2 ?? planSource.continuity_graph_v2 ?? sceneManifest.continuityGraphV2)
    const sceneGraphAdditions = asRecord(planSource.sceneGraphAdditions ?? planSource.scene_graph_additions ?? sceneManifest.sceneGraphAdditions ?? sceneManifest.scene_graph_additions)
    for (const field of Object.keys(graphArrays)) {
      for (const node of readArray(graph[field]).map(asRecord)) graphArrays[field].push(node)
      for (const node of readArray(sceneGraphAdditions[field]).map(asRecord)) graphArrays[field].push(node)
    }
  }
  if (blocks.length === 0 || planShots.length === 0) return null
  const continuityGraphV2 = Object.fromEntries(Object.entries(graphArrays).map(([field, entries]) => [field, mergeRecordsById(entries)]))
  continuityGraphV2.locationSets = mergeRecordsById([
    ...readArray(continuityGraphV2.locationSets).map(asRecord),
    ...readArray(continuityGraphV2.location_sets).map(asRecord),
    ...readArray(continuityGraphV2.sets).map(asRecord),
  ])
  continuityGraphV2.location_sets = continuityGraphV2.locationSets
  const directorPlan = {
    role: 'sequence_animatic_director_plan',
    contractVersion: 'shot_continuity_plan_v2',
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'director_plan',
    sequenceAnimaticRole: 'director_plan',
    planningMode: 'per_scene_combined',
    combinedFromSceneIds: readySceneIds,
    shots: planShots.map((shot, index) => ({ ...shot, index: index + 1 })),
    blocks: planBlocks.map((block, index) => ({ ...block, index: index + 1 })),
    coverageSetups: mergeRecordsById(coverageSetups),
    localReferences: mergeRecordsById(localReferences),
    shotBindings,
    shot_bindings: shotBindings,
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
  }
  const manifest = {
    role: 'sequence_animatic_manifest',
    graphSpecVersion: 'sequence_animatic_graph_v2',
    sequenceAnimaticRole: 'master',
    screenplayAnimaticRole: 'master',
    requestId: input.masterRequest.id,
    combinedFromSceneIds: readySceneIds,
    provisionalSceneCoverage: true,
    assetPack,
    selectedReferences: assetPack,
    blocks,
    shotPlan: {
      sceneId: 'sequence_animatic_master',
      shots,
      totalEditorialDurationSeconds: shots.reduce((total, shot) => total + (Number(asRecord(shot).editorialDurationSeconds) || 0), 0),
    },
    directorPlan,
    shotContinuityPlan: directorPlan,
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    shotBindings,
    shot_bindings: shotBindings,
    diagnostics: [`Combined ${readySceneIds.length} ready scene manifest${readySceneIds.length === 1 ? '' : 's'} at read time (per-scene architecture).`],
  }
  return {
    manifest,
    directorPlan,
    readySceneIds,
  }
}

async function loadSceneBoardPlanningContext(input: SceneBoardChildPlannerInput) {
  const masterResponse = await input.client
    .from('output_requests')
    .select(outputRequestSelect)
    .eq('id', input.masterRequestId)
    .eq('project_id', input.projectId)
    .eq('draft_id', input.draftId)
    .single()
  if (masterResponse.error || !masterResponse.data) throw new Error('Screenplay animatic master request not found.')
  const masterRequest = normalizeOutputRequest(asRecord(masterResponse.data))
  const masterMetadata = asRecord(masterRequest.metadata)
  if (readScreenplayAnimaticRole(masterMetadata) !== 'master') throw new Error('This output is not a screenplay animatic master request.')
  if (!masterRequest.workflowId) throw new Error('Screenplay animatic master has no workflow yet.')

  const masterArtifactsResponse = await input.client
    .from('output_artifacts')
    .select(outputArtifactSelect)
    .eq('project_id', input.projectId)
    .eq('draft_id', input.draftId)
    .eq('workflow_id', masterRequest.workflowId)
    .order('created_at', { ascending: false })
    .limit(24)
  if (masterArtifactsResponse.error) throw new Error(masterArtifactsResponse.error.message)
  const masterArtifacts = (masterArtifactsResponse.data ?? []).map(asRecord)
  let manifest = artifactMetadataRecord(masterArtifacts, ['sequence_animatic_manifest'], ['manifest', 'sequenceAnimaticManifest', 'sequence_animatic_manifest'])
  let directorPlan = artifactMetadataRecord(masterArtifacts, ['sequence_animatic_director_plan'], ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
  if (Object.keys(manifest).length === 0 || Object.keys(directorPlan).length === 0) {
    const combined = await resolveSceneBoardCombinedManifest({ client: input.client, masterRequest })
    if (combined) {
      manifest = combined.manifest
      directorPlan = combined.directorPlan
    }
  }
  if (Object.keys(manifest).length === 0) throw new Error('Generate the screenplay animatic manifest first.')
  if (Object.keys(directorPlan).length === 0) throw new Error('Generate the shot continuity plan first.')

  const nodesById = graphNodeMap({ manifest, directorPlan })
  const continuityAssetArtifactsResponse = await input.client
    .from('output_artifacts')
    .select(outputArtifactSelect)
    .eq('project_id', input.projectId)
    .eq('draft_id', input.draftId)
    .order('created_at', { ascending: false })
    .limit(300)
  if (continuityAssetArtifactsResponse.error) throw new Error(continuityAssetArtifactsResponse.error.message)
  const continuityAssetArtifacts = ((continuityAssetArtifactsResponse.data ?? []) as unknown[])
    .map(asRecord)
    .filter((artifact) => {
      const metadata = asRecord(artifact.metadata)
      return readText(metadata.masterRequestId) === masterRequest.id
        && (readText(metadata.role) === 'sequence_animatic_continuity_asset' || readText(metadata.role) === 'sequence_animatic_continuity_asset_batch')
    })
  applyContinuityAssetStatesToNodes(nodesById, continuityAssetStatesFromArtifacts(continuityAssetArtifacts))

  return {
    masterRequest,
    masterMetadata,
    manifest,
    directorPlan,
    nodesById,
    screenplayAnimaticSource: readScreenplayAnimaticSource(
      masterMetadata,
      masterRequest.sourceSurface === 'outputs' ? 'prompt_cinematic' : 'wiki_sequence_unit',
    ),
  }
}

function prepareSceneShots(input: {
  manifest: LooseRecord
  directorPlan: LooseRecord
  nodesById: Map<string, LooseRecord>
  sceneId: string
  setId?: string | null
  zoneId?: string | null
  shotIds?: readonly string[]
  scopedShots?: readonly LooseRecord[]
  assetPackScope: string
}) {
  const requestedShotIds = uniqueTexts(input.shotIds ?? [])
  const scopedShotSnapshots = (input.scopedShots ?? []).map(asRecord).filter((shot) => readText(shot.id))
  const requestedSceneId = readText(input.sceneId)
  const scopedSceneIds = uniqueTexts([
    ...requestedShotIds.map(sceneIdFromShotId),
    ...scopedShotSnapshots.map(sceneIdForShot),
  ]).filter((sceneId) => sceneId !== 'sequence_animatic_master' && sceneId !== 'scene')
  const effectiveSceneId = requestedSceneId === 'sequence_animatic_master' && scopedSceneIds.length === 1
    ? scopedSceneIds[0]
    : requestedSceneId
  const sceneShots = mergedShotsForScene({
    manifest: input.manifest,
    directorPlan: input.directorPlan,
    sceneId: effectiveSceneId,
    shotIds: requestedShotIds,
    fallbackShots: scopedShotSnapshots,
  })
  const shotBindings = asRecord(input.directorPlan.shotBindings ?? input.directorPlan.shot_bindings)
  const manifestAssetPack = asRecord(input.manifest.assetPack)
  const scopeSetId = readText(input.setId)
  const scopeZoneId = readText(input.zoneId)
  const allPreparedShots = sceneShots.map((shot, index) => {
    const shotId = readText(shot.id)
    const rawShotBinding = asRecord(shotBindings[shotId])
    const shotBinding = {
      ...asRecord(rawShotBinding.sceneBinding ?? rawShotBinding.scene_binding),
      ...rawShotBinding,
    }
    const boundShot: LooseRecord = { ...shot, shotBinding }
    const spatial = spatialFieldsForShot(boundShot)
    return {
      shot: boundShot,
      assetPack: locationAssetPackForShot(manifestAssetPack, boundShot, input.nodesById, input.assetPackScope),
      spatial,
      order: shotOrderValue(shot, index),
    }
  })
  const preparedShots = allPreparedShots
    .filter((entry) => !scopeSetId || entry.spatial.setId === scopeSetId)
    .filter((entry) => !scopeZoneId || entry.spatial.zoneId === scopeZoneId)
    .sort((left, right) => left.order - right.order)
  return {
    effectiveSceneId,
    requestedSceneId,
    preparedShots,
    allPreparedShots,
    availableZoneIds: uniqueTexts(allPreparedShots.map((entry) => entry.spatial.zoneId)),
  }
}

async function markMatchingChildrenStale(input: {
  client: DatabaseClient
  children: Array<{ id: string; status: string; metadata: LooseRecord; workflowId: string | null }>
  reason: string
}) {
  for (const child of input.children) {
    if (outputRequestIsActive(child)) continue
    const response = await input.client
      .from('output_requests')
      .update({
        metadata: {
          ...child.metadata,
          sequenceAnimaticStale: true,
          staleReason: input.reason,
          staleAt: new Date().toISOString(),
        },
      })
      .eq('id', child.id)
    if (response.error) throw new Error(response.error.message)
  }
}

export async function planSceneBoardSetRefChildren(input: SceneBoardChildPlannerInput): Promise<SceneBoardChildPlannerResult> {
  const context = await loadSceneBoardPlanningContext(input)
  const prepared = prepareSceneShots({
    manifest: context.manifest,
    directorPlan: context.directorPlan,
    nodesById: context.nodesById,
    sceneId: input.sceneId,
    setId: input.setId,
    zoneId: input.zoneId,
    shotIds: input.shotIds,
    scopedShots: input.scopedShots,
    assetPackScope: 'sequence_animatic_scene_board_set_ref',
  })
  if (prepared.preparedShots.length === 0) {
    return {
      childWorkflows: [],
      diagnostics: ['This scene scope has no matching shots for set reference generation.'],
      metadata: {
        reason: prepared.allPreparedShots.length === 0 ? 'no_finalized_scene_shots' : 'scope_mismatch',
        sceneId: prepared.effectiveSceneId,
        requestedSceneId: prepared.requestedSceneId,
        availableZoneIds: prepared.availableZoneIds,
      },
    }
  }

  const manifestAssetPack = asRecord(context.manifest.assetPack)
  const visualCanonGuard = visualCanonGuardForBoard({
    masterMetadata: context.masterMetadata,
    manifest: context.manifest,
    directorPlan: context.directorPlan,
    assetPack: manifestAssetPack,
  })
  const requestedBy = readText(input.requestedBy) || readText(context.masterRequest.requestedBy)
  const sourceSurface = context.screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit'
  const setIds = uniqueTexts(prepared.preparedShots.map((entry) => entry.spatial.setId))
  const childWorkflows = setIds
    .map((setId) => context.nodesById.get(setId) ?? {})
    .filter((node) => readText(node.id))
    .filter((node) => input.forceRefresh || continuityAssetKeysForNode(node).length === 0)
    .map((node) => buildContinuityAssetChildSpec({
      stage: 'set_refs',
      policyVersion: SET_REF_POLICY_VERSION,
      context,
      projectId: input.projectId,
      draftId: input.draftId,
      requestedBy,
      targetNode: node,
      relevantShots: relevantShotsForNode(readText(node.id), prepared.preparedShots),
      referenceAssetKeys: [],
      generationPolicy: 'location_set_reference_v1',
      sourceSurface,
      visualCanonGuard,
    }))

  return {
    childWorkflows,
    diagnostics: childWorkflows.length > 0 ? [] : ['All required set references are already ready for this Scene Board scope.'],
    metadata: {
      stage: 'set_refs',
      childWorkflowCount: childWorkflows.length,
      preparedShotCount: prepared.preparedShots.length,
      requiredSetIds: setIds,
    },
  }
}

function canonicalSpotAngleNodes(input: {
  spotNode: LooseRecord
  zoneId: string
  setId: string
  angleCount?: number
}) {
  const spotId = readText(input.spotNode.id)
  const spotName = readText(input.spotNode.name) || spotId
  const count = Math.max(4, Math.min(8, Number(input.angleCount ?? 4) || 4))
  const defaults = [
    ['approach', 'Establishing / approach angle showing the main entrance, walkable route, and dominant landmarks.'],
    ['reverse', 'Reverse angle preserving screen direction, exits, background depth, and landmark continuity.'],
    ['profile_cross_axis', 'Profile or cross-axis side angle clarifying lateral movement, foreground/midground/background planes, and staging depth.'],
    ['low_detail', 'Low, detail, or overhead utility angle for inserts, obstacle handling, props, and local surface continuity.'],
    ['high_wide', 'Higher wide angle for geography, crowd flow, and route continuity.'],
    ['tight_reverse', 'Tighter reverse angle for dialogue or reaction coverage while preserving the same local layout.'],
    ['diagonal_depth', 'Diagonal depth angle showing near/far landmarks and screen-direction logic.'],
    ['overhead_insert', 'Overhead/detail insert angle for spatial problem solving and local object placement.'],
  ]
  return defaults.slice(0, count).map(([key, brief], index) => ({
    id: `${spotId}_angle_${key}`,
    name: `${spotName} ${key.replace(/_/g, ' ')} angle`,
    nodeKind: 'location_angle',
    assetKind: 'location_angle',
    kind: 'location_angle',
    parentId: spotId,
    parent_id: spotId,
    spotId,
    spot_id: spotId,
    zoneId: input.zoneId,
    zone_id: input.zoneId,
    setId: input.setId,
    set_id: input.setId,
    angleIndex: index,
    angle_index: index,
    visualBrief: brief,
    summary: brief,
  }))
}

export async function planSceneBoardScaffoldRefChildren(
  input: SceneBoardChildPlannerInput & { mode?: 'zone_maps' | 'spot_atlases' | 'spot_angles' },
): Promise<SceneBoardChildPlannerResult> {
  const mode = input.mode === 'spot_atlases' || input.mode === 'spot_angles' ? input.mode : 'zone_maps'
  const context = await loadSceneBoardPlanningContext(input)
  const prepared = prepareSceneShots({
    manifest: context.manifest,
    directorPlan: context.directorPlan,
    nodesById: context.nodesById,
    sceneId: input.sceneId,
    setId: input.setId,
    zoneId: input.zoneId,
    shotIds: input.shotIds,
    scopedShots: input.scopedShots,
    assetPackScope: mode === 'zone_maps'
      ? 'sequence_animatic_scene_board_zone_map'
      : mode === 'spot_angles'
        ? 'sequence_animatic_scene_board_spot_angle'
        : 'sequence_animatic_scene_board_spot_atlas',
  })
  if (prepared.preparedShots.length === 0) {
    return {
      childWorkflows: [],
      diagnostics: [`This scene scope has no matching shots for ${mode === 'zone_maps' ? 'zone map' : mode === 'spot_angles' ? 'spot angle' : 'spot atlas'} generation.`],
      metadata: {
        reason: prepared.allPreparedShots.length === 0 ? 'no_finalized_scene_shots' : 'scope_mismatch',
        sceneId: prepared.effectiveSceneId,
        requestedSceneId: prepared.requestedSceneId,
        availableZoneIds: prepared.availableZoneIds,
      },
    }
  }

  const manifestAssetPack = asRecord(context.manifest.assetPack)
  const visualCanonGuard = visualCanonGuardForBoard({
    masterMetadata: context.masterMetadata,
    manifest: context.manifest,
    directorPlan: context.directorPlan,
    assetPack: manifestAssetPack,
  })
  const requestedBy = readText(input.requestedBy) || readText(context.masterRequest.requestedBy)
  const sourceSurface = context.screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit'
  if (mode === 'zone_maps') {
    const zoneIds = uniqueTexts(prepared.preparedShots.map((entry) => entry.spatial.zoneId))
    const missingParentSetRefs = zoneIds
      .map((zoneId) => context.nodesById.get(zoneId) ?? {})
      .map((zoneNode) => readText(parentIdForSpatialNode(zoneNode)) || prepared.preparedShots.find((entry) => entry.spatial.zoneId === readText(zoneNode.id))?.spatial.setId || '')
      .filter(Boolean)
      .filter((setId) => referenceAssetKeysForNodeIdsWithRuntime({
        nodeIds: [setId],
        nodesById: context.nodesById,
        upstreamStatus: input.upstreamStatus,
        forceRefresh: input.forceRefresh,
      }).length === 0)
    if (missingParentSetRefs.length > 0 && !input.forceRefresh) {
      return {
        childWorkflows: [],
        diagnostics: ['Generate set references before creating zone spatial maps.'],
        metadata: {
          reason: 'missing_parent_set_reference_assets',
          missingReferenceCount: uniqueTexts(missingParentSetRefs).length,
          missingReferences: uniqueTexts(missingParentSetRefs).map((nodeId) => ({
            nodeId,
            kind: 'location_set',
            name: readText(context.nodesById.get(nodeId)?.name) || nodeId,
            reason: 'missing_asset',
          })),
        },
      }
    }
    const childWorkflows = zoneIds
      .map((zoneId) => context.nodesById.get(zoneId) ?? {})
      .filter((node) => readText(node.id))
      .filter((node) => input.forceRefresh || continuityAssetKeysForNode(node).length === 0)
      .map((node) => {
        const parentSetId = readText(parentIdForSpatialNode(node))
          || prepared.preparedShots.find((entry) => entry.spatial.zoneId === readText(node.id))?.spatial.setId
          || ''
        return buildContinuityAssetChildSpec({
          stage: 'zone_maps',
          policyVersion: ZONE_MAP_POLICY_VERSION,
          context,
          projectId: input.projectId,
          draftId: input.draftId,
          requestedBy,
          targetNode: node,
          relevantShots: relevantShotsForNode(readText(node.id), prepared.preparedShots),
          referenceAssetKeys: referenceAssetKeysForNodeIdsWithRuntime({
            nodeIds: [parentSetId],
            nodesById: context.nodesById,
            upstreamStatus: input.upstreamStatus,
            forceRefresh: input.forceRefresh,
          }),
          generationPolicy: 'zone_spatial_map_v1',
          sourceSurface,
          visualCanonGuard,
        })
      })
    return {
      childWorkflows,
      diagnostics: childWorkflows.length > 0 ? [] : ['All required zone spatial maps are already ready for this Scene Board scope.'],
      metadata: {
        stage: 'zone_maps',
        childWorkflowCount: childWorkflows.length,
        preparedShotCount: prepared.preparedShots.length,
        requiredZoneIds: zoneIds,
      },
    }
  }

  const groups = new Map<string, Array<{ shot: LooseRecord; spatial: Record<string, string> }>>()
  for (const entry of prepared.preparedShots) {
    const zoneId = entry.spatial.zoneId
    if (!zoneId) continue
    groups.set(zoneId, [...(groups.get(zoneId) ?? []), entry])
  }
  const childWorkflows: SceneBoardChildWorkflowSpec[] = []
  const missingZoneRefs: string[] = []
  for (const [zoneId, entries] of groups.entries()) {
    const zoneNode = context.nodesById.get(zoneId) ?? {}
    const zoneAssetKeys = referenceAssetKeysForNodeIdsWithRuntime({
      nodeIds: [zoneId],
      nodesById: context.nodesById,
      upstreamStatus: input.upstreamStatus,
      forceRefresh: input.forceRefresh,
    })
    if (zoneAssetKeys.length === 0 && (mode === 'spot_atlases' || !input.forceRefresh)) {
      missingZoneRefs.push(zoneId)
      continue
    }
    const candidateIds = uniqueTexts(entries.flatMap((entry) => [entry.spatial.primarySpotId, entry.spatial.viewpointId]))
    const spotIds = candidateSpotNodeIdsForZone(entries, zoneId, context.nodesById)
    const rejectedTargetIds = candidateIds.filter((nodeId) => !spotIds.includes(nodeId))
    const spotNodes = spotIds
      .map((nodeId) => context.nodesById.get(nodeId) ?? {})
      .filter((node) => readText(node.id))
    if (mode === 'spot_angles') {
      const angleCount = Number(context.masterMetadata.sceneBoardSpotAngleCount ?? context.masterMetadata.scene_board_spot_angle_count ?? 4) || 4
      for (const spotNode of spotNodes) {
        const spotId = readText(spotNode.id)
        if (!spotId) continue
        if (!input.forceRefresh && spotAngleAssetKeysForSpot(spotId, context.nodesById).length > 0) continue
        const currentSpotAtlasAssetKeys = upstreamAssetKeysForNodeId(input.upstreamStatus, spotId, strictSpotAtlasStateIsUsable)
        const fallbackSpotAtlasAssetKeys = input.forceRefresh ? [] : strictSpotAtlasAssetKeysForNode(spotNode)
        const spotAssetKeys = uniqueTexts([...currentSpotAtlasAssetKeys, ...fallbackSpotAtlasAssetKeys])
        const atlasReferenceZoneKeys = upstreamReferenceAssetKeysForNodeId(input.upstreamStatus, spotId)
        const spotZoneAssetKeys = uniqueTexts([
          ...atlasReferenceZoneKeys,
          ...(atlasReferenceZoneKeys.length > 0 || input.forceRefresh ? [] : zoneAssetKeys),
        ])
        if (spotAssetKeys.length === 0 || spotZoneAssetKeys.length === 0) {
          missingZoneRefs.push(spotId)
          continue
        }
        const targetNodes = canonicalSpotAngleNodes({
          spotNode,
          zoneId,
          setId: entries.find((entry) => entry.spatial.zoneId === zoneId)?.spatial.setId || '',
          angleCount,
        })
        if (targetNodes.length === 0) continue
        childWorkflows.push(buildContinuityBatchChildSpec({
          stage: 'spot_angles',
          policyVersion: SPOT_ANGLE_POLICY_VERSION,
          context,
          projectId: input.projectId,
          draftId: input.draftId,
          requestedBy,
          parentNode: spotNode,
          targetNodes,
          relevantShots: entries
            .filter((entry) => entry.spatial.primarySpotId === spotId || entry.spatial.viewpointId === spotId)
            .map((entry) => entry.shot),
          referenceAssetKeys: uniqueTexts([...spotZoneAssetKeys, ...spotAssetKeys]),
          generationPolicy: 'spot_angle_coverage_v1',
          batchKind: 'angle_grid',
          sourceSurface,
          forceRefresh: input.forceRefresh,
          visualCanonGuard,
        }))
      }
      continue
    }
    const targetNodes = spotNodes
      .filter((node) => input.forceRefresh || strictSpotAtlasAssetKeysForNode(node).length === 0)
      .slice(0, 9)
    if (targetNodes.length === 0) continue
    childWorkflows.push(buildContinuityBatchChildSpec({
      stage: 'spot_atlases',
      policyVersion: SPOT_ATLAS_POLICY_VERSION,
      context,
      projectId: input.projectId,
      draftId: input.draftId,
      requestedBy,
      parentNode: zoneNode,
      targetNodes,
      relevantShots: entries.map((entry) => entry.shot),
      referenceAssetKeys: zoneAssetKeys,
      generationPolicy: 'spot_atlas_grid_rectangular_ref_v3',
      batchKind: 'spot_atlas_grid',
      sourceSurface,
      forceRefresh: input.forceRefresh,
      visualCanonGuard,
    }))
    if (rejectedTargetIds.length > 0) {
      childWorkflows[childWorkflows.length - 1].metadata = {
        ...childWorkflows[childWorkflows.length - 1].metadata,
        rejectedCrossZoneTargetIds: rejectedTargetIds,
        rejected_cross_zone_target_ids: rejectedTargetIds,
      }
    }
  }
  if (missingZoneRefs.length > 0) {
    return {
      childWorkflows: [],
      diagnostics: [mode === 'spot_angles' ? 'Generate strict spot atlases before creating spot angle coverage.' : 'Generate zone spatial maps before creating spot atlases.'],
      metadata: {
        reason: mode === 'spot_angles' ? 'missing_spot_atlas_assets' : 'missing_zone_spatial_map_assets',
        missingReferenceCount: uniqueTexts(missingZoneRefs).length,
        missingReferences: uniqueTexts(missingZoneRefs).map((nodeId) => ({
          nodeId,
          kind: 'location_zone',
          name: readText(context.nodesById.get(nodeId)?.name) || nodeId,
          reason: 'missing_asset',
        })),
      },
    }
  }
  return {
    childWorkflows,
    diagnostics: childWorkflows.length > 0 ? [] : [mode === 'spot_angles' ? 'All required spot angle references are already ready for this Scene Board scope.' : 'All required spot atlases are already ready for this Scene Board scope.'],
    metadata: {
      stage: mode,
      childWorkflowCount: childWorkflows.length,
      preparedShotCount: prepared.preparedShots.length,
      requiredZoneIds: [...groups.keys()],
    },
  }
}

export async function planSceneBoardCoverageIntentChildren(input: SceneBoardChildPlannerInput): Promise<SceneBoardChildPlannerResult> {
  const context = await loadSceneBoardPlanningContext(input)
  const prepared = prepareSceneShots({
    manifest: context.manifest,
    directorPlan: context.directorPlan,
    nodesById: context.nodesById,
    sceneId: input.sceneId,
    setId: input.setId,
    zoneId: input.zoneId,
    shotIds: input.shotIds,
    scopedShots: input.scopedShots,
    assetPackScope: 'sequence_animatic_coverage_intent_shot',
  })
  if (prepared.preparedShots.length === 0) {
    return {
      childWorkflows: [],
      diagnostics: ['This scene scope has no matching shots for coverage directions.'],
      metadata: {
        reason: prepared.allPreparedShots.length === 0 ? 'no_finalized_scene_shots' : 'scope_mismatch',
        sceneId: prepared.effectiveSceneId,
        requestedSceneId: prepared.requestedSceneId,
        availableZoneIds: prepared.availableZoneIds,
      },
    }
  }

  const first = prepared.preparedShots[0]
  const shotIds = prepared.preparedShots.map((entry) => readText(entry.shot.id)).filter(Boolean)
  const sceneGraphOverrides = first ? sceneGraphOverridesForSpatialScope(context.masterMetadata, first.spatial) : []
  const assetPack = mergeAssetPacks(prepared.preparedShots.map((entry) => entry.assetPack), 'sequence_animatic_coverage_intent_batch')
  const referenceAssetKeys = readStringArray(assetPack.scopedReferenceAssetKeys)
  const scopeSetId = readText(input.setId)
  const scopeZoneId = readText(input.zoneId)
  const sourceHash = sequenceAnimaticStableHash({
    policy: COVERAGE_INTENT_POLICY_VERSION,
    sceneId: prepared.effectiveSceneId,
    setId: scopeSetId,
    zoneId: scopeZoneId,
    shotIds,
    shots: prepared.preparedShots.map((entry) => ({
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
    sceneId: prepared.effectiveSceneId,
    setId: scopeSetId,
    zoneId: scopeZoneId,
    shotIds,
  })

  const existingResponse = await input.client
    .from('output_requests')
    .select(outputRequestSelect)
    .eq('project_id', input.projectId)
    .eq('draft_id', input.draftId)
    .eq('parent_request_id', context.masterRequest.id)
    .or('metadata->>screenplayAnimaticRole.eq.coverage_intent_batch,metadata->>sequenceAnimaticRole.eq.coverage_intent_batch')
    .order('created_at', { ascending: false })
    .limit(100)
  if (existingResponse.error) throw new Error(existingResponse.error.message)
  const existingChildren = (existingResponse.data ?? [])
    .map((row: unknown) => normalizeOutputRequest(asRecord(row)))
    .filter((child: ReturnType<typeof normalizeOutputRequest>) => asRecord(child.metadata).sequenceAnimaticStale !== true)
  const matchingChildren = existingChildren.filter((child: ReturnType<typeof normalizeOutputRequest>) => {
    const metadata = asRecord(child.metadata)
    return readText(metadata.coverageIntentPolicyVersion) === COVERAGE_INTENT_POLICY_VERSION
      && readText(metadata.coverageIntentBatchId) === batchId
      && readText(metadata.sourceHash) === sourceHash
      && readText(child.workflowId)
  })
  if (input.forceRefresh && matchingChildren.length > 0) {
    await markMatchingChildrenStale({
      client: input.client,
      children: matchingChildren,
      reason: 'Coverage direction refresh requested.',
    })
  }

  const workflowId = crypto.randomUUID()
  const requestedBy = readText(input.requestedBy) || readText(context.masterRequest.requestedBy)
  const commonConfig = {
    cinematicPipelineVersion: 'v3_script_storyboards',
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    screenplayAnimaticRole: 'coverage_intent_batch',
    screenplayAnimaticSource: context.screenplayAnimaticSource,
    sequenceAnimaticRole: 'coverage_intent_batch',
    parentRequestId: context.masterRequest.id,
    masterRequestId: context.masterRequest.id,
    coverageIntentPolicyVersion: COVERAGE_INTENT_POLICY_VERSION,
    coverageIntentBatchId: batchId,
    sourceHash,
    sceneId: prepared.effectiveSceneId,
    setId: scopeSetId,
    zoneId: scopeZoneId,
    shotIds,
    sceneGraphOverrides,
    referenceAssetKeys,
    dependencyMode: 'coverage_intent_batch',
    readyToRun: true,
  }
  const intentBatch = {
    id: batchId,
    batchId,
    title: `${first?.spatial.zoneName || first?.spatial.zoneId || 'Zone'} coverage directions`,
    sceneId: prepared.effectiveSceneId,
    setId: scopeSetId,
    zoneId: scopeZoneId,
    shotIds,
    sourceHash,
    policyVersion: COVERAGE_INTENT_POLICY_VERSION,
    sceneGraphOverrides,
    referenceAssetKeys,
  }
  const graphPlan = buildSequenceAnimaticShotCoverageIntentWorkflowGraph({
    workflowId,
    draftId: input.draftId,
    commonConfig,
    intentBatch,
    shots: prepared.preparedShots.map((entry) => entry.shot),
    assetPack,
  })
  const spec: SceneBoardChildWorkflowSpec = {
    stage: 'coverage_directions',
    role: 'coverage_intent_batch',
    identityKey: 'coverageIntentBatchId',
    identityValue: batchId,
    workflow: {
      project_id: input.projectId,
      draft_id: input.draftId,
      key: `sequence_animatic_coverage_intent_${slugify(context.masterRequest.id)}_${slugify(batchId)}_${sourceHash.slice(0, 8)}`,
      name: `${context.masterRequest.title} / ${readText(intentBatch.title) || 'Coverage Directions'}`,
      description: 'Scene Board shot coverage direction planning workflow.',
      preset: 'cinematic_episode_from_sequence',
      status: 'active',
      created_by: requestedBy,
      metadata: commonConfig,
    },
    nodes: graphPlan.nodes.map(asRecord),
    edges: graphPlan.edges.map(asRecord),
    request: {
      project_id: input.projectId,
      draft_id: input.draftId,
      parent_request_id: context.masterRequest.id,
      requested_by: requestedBy,
      source_surface: context.screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
      prompt: `Plan coverage directions for ${readText(intentBatch.title) || 'selected board'}.`,
      title: `${context.masterRequest.title} / ${readText(intentBatch.title) || 'Coverage Directions'}`,
      intent: 'output_generation',
      output_kind: 'cinematic_episode',
      status: 'awaiting_confirmation',
      selected_entity_keys: context.masterRequest.selectedEntityKeys,
      selected_sequence_unit_keys: context.masterRequest.selectedSequenceUnitKeys,
      page_count: null,
      target_format: 'json',
      planner_notes: 'Scene Board coverage directions prepared before zone camera grid generation.',
      metadata: { ...commonConfig, intentBatch, createdFromSceneBoardPrepAt: new Date().toISOString() },
    },
    metadata: { sourceHash, batchId, shotIds },
  }
  return {
    childWorkflows: [spec],
    diagnostics: [],
    metadata: {
      sourceHash,
      batchId,
      shotIds,
      preparedShotCount: prepared.preparedShots.length,
    },
  }
}

export async function planSceneBoardZoneCoverageGridChildren(input: SceneBoardChildPlannerInput): Promise<SceneBoardChildPlannerResult> {
  const context = await loadSceneBoardPlanningContext(input)
  const manifestAssetPack = asRecord(context.manifest.assetPack)
  const artStyleDescription = artStyleDescriptionForBoard({
    masterMetadata: context.masterMetadata,
    manifest: context.manifest,
    directorPlan: context.directorPlan,
    assetPack: manifestAssetPack,
  })
  const prepared = prepareSceneShots({
    manifest: context.manifest,
    directorPlan: context.directorPlan,
    nodesById: context.nodesById,
    sceneId: input.sceneId,
    setId: input.setId,
    zoneId: input.zoneId,
    shotIds: input.shotIds,
    scopedShots: input.scopedShots,
    assetPackScope: 'sequence_animatic_zone_camera_grid_shot',
  })
  const zonePreparedShots = prepared.preparedShots.filter((entry) => entry.spatial.zoneId)
  if (zonePreparedShots.length === 0) {
    return {
      childWorkflows: [],
      diagnostics: ['This scene scope has no shots with zone bindings available for zone camera grids.'],
      metadata: {
        reason: prepared.allPreparedShots.length === 0 ? 'no_zone_bound_shots' : 'scope_mismatch',
        sceneId: prepared.effectiveSceneId,
        requestedSceneId: prepared.requestedSceneId,
        availableZoneIds: prepared.availableZoneIds,
      },
    }
  }
  const missingSpatialReferences = [...new Map(zonePreparedShots
    .flatMap((entry) => [
      ...missingSpatialReferencesForEntry(entry, context.nodesById),
      ...missingSpotAngleReferencesForEntry(entry, context.nodesById),
    ])
    .map((entry) => [entry.nodeId, entry] as const)).values()]
  if (missingSpatialReferences.length > 0) {
    return {
      childWorkflows: [],
      diagnostics: ['Generate set, zone, spot, and canonical spot angle continuity references before creating zone camera grids.'],
      metadata: {
        reason: 'missing_spatial_reference_assets',
        missingReferenceCount: missingSpatialReferences.length,
        missingReferences: missingSpatialReferences.slice(0, 24),
      },
    }
  }

  const existingBoardsResponse = await input.client
    .from('output_requests')
    .select(outputRequestSelect)
    .eq('project_id', input.projectId)
    .eq('draft_id', input.draftId)
    .eq('parent_request_id', context.masterRequest.id)
    .or('metadata->>screenplayAnimaticRole.eq.zone_coverage_board,metadata->>sequenceAnimaticRole.eq.zone_coverage_board')
    .order('created_at', { ascending: false })
    .limit(200)
  if (existingBoardsResponse.error) throw new Error(existingBoardsResponse.error.message)
  const activeBoardChildren = (existingBoardsResponse.data ?? [])
    .map((row: unknown) => normalizeOutputRequest(asRecord(row)))
    .filter((child: ReturnType<typeof normalizeOutputRequest>) => asRecord(child.metadata).sequenceAnimaticStale !== true)
  const storedBoardRegistry = asRecord(context.masterMetadata.sequenceAnimaticZoneCoverageRegistry ?? context.masterMetadata.sequence_animatic_zone_coverage_registry)
  const storedCoverageRegistry = asRecord(context.masterMetadata.sequenceAnimaticCoverageRegistry ?? context.masterMetadata.sequence_animatic_coverage_registry)
  const coverageIntentByShotId = {
    ...asRecord(storedCoverageRegistry.coverageIntentByShotId ?? storedCoverageRegistry.coverage_intent_by_shot_id),
    ...asRecord(storedBoardRegistry.coverageIntentByShotId ?? storedBoardRegistry.coverage_intent_by_shot_id),
  }
  const storedBoards = readArray(storedBoardRegistry.zoneCoverageBoards ?? storedBoardRegistry.zone_coverage_boards).map(asRecord)

  const groups = new Map<string, typeof zonePreparedShots>()
  for (const entry of zonePreparedShots) {
    const key = [entry.spatial.sceneId, entry.spatial.setId || 'set', entry.spatial.zoneId].join('::')
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  const requestedBy = readText(input.requestedBy) || readText(context.masterRequest.requestedBy)
  const childWorkflows: SceneBoardChildWorkflowSpec[] = []
  const matchingChildrenToStale: Array<{ id: string; status: string; metadata: LooseRecord; workflowId: string | null }> = []

  for (const [, entries] of groups) {
    const chunks = chunk(entries, 9)
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunkEntries = chunks[chunkIndex]
      const first = chunkEntries[0]
      if (!first) continue
      const boardShotIds = chunkEntries.map((entry) => readText(entry.shot.id)).filter(Boolean)
      const sceneGraphOverrides = sceneGraphOverridesForSpatialScope(context.masterMetadata, first.spatial)
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
        const matchingChildren = activeBoardChildren.filter((child: ReturnType<typeof normalizeOutputRequest>) => {
        const metadata = asRecord(child.metadata)
        return readText(metadata.zoneCoverageBoardPolicyVersion) === ZONE_COVERAGE_BOARD_POLICY_VERSION
          && readText(metadata.boardId) === boardId
          && readText(metadata.sourceHash) === sourceHash
          && readText(child.workflowId)
      })
      if (input.forceRefresh && matchingChildren.length > 0) {
        matchingChildrenToStale.push(...matchingChildren)
      }
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
      const assetPack = mergeAssetPacks(chunkEntries.map((entry) => entry.assetPack), 'sequence_animatic_zone_camera_grid')
      const referenceAssetKeys = readStringArray(assetPack.scopedReferenceAssetKeys)
      const workflowId = crypto.randomUUID()
      const commonConfig = {
        cinematicPipelineVersion: 'v3_script_storyboards',
        graphSpecVersion: sequenceAnimaticGraphSpecVersion,
        screenplayAnimaticRole: 'zone_coverage_board',
        screenplayAnimaticSource: context.screenplayAnimaticSource,
        sequenceAnimaticRole: 'zone_coverage_board',
        parentRequestId: context.masterRequest.id,
        masterRequestId: context.masterRequest.id,
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
        draftId: input.draftId,
        commonConfig,
        board,
        shots: chunkEntries.map((entry) => entry.shot),
        coverageCells,
        assetPack,
        referenceAssetKeys,
        previousBoard,
      })
      childWorkflows.push({
        stage: 'coverage_grids',
        role: 'zone_coverage_board',
        identityKey: 'boardId',
        identityValue: boardId,
        workflow: {
          project_id: input.projectId,
          draft_id: input.draftId,
          key: `sequence_animatic_zone_coverage_board_${slugify(context.masterRequest.id)}_${slugify(boardId)}_${sourceHash.slice(0, 8)}`,
          name: `${context.masterRequest.title} / ${readText(board.title) || 'Zone Camera Grid'}`,
          description: 'Scene-level zone camera coverage grid workflow for location-only shot coverage cells.',
          preset: 'cinematic_episode_from_sequence',
          status: 'active',
          created_by: requestedBy,
          metadata: commonConfig,
        },
        nodes: graphPlan.nodes.map(asRecord),
        edges: graphPlan.edges.map(asRecord),
        request: {
          project_id: input.projectId,
          draft_id: input.draftId,
          parent_request_id: context.masterRequest.id,
          requested_by: requestedBy,
          source_surface: context.screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
          prompt: `Generate ${readText(board.title) || 'zone camera coverage grid'}.`,
          title: `${context.masterRequest.title} / ${readText(board.title) || 'Zone Camera Grid'}`,
          intent: 'output_generation',
          output_kind: 'cinematic_episode',
          status: 'awaiting_confirmation',
          selected_entity_keys: context.masterRequest.selectedEntityKeys,
          selected_sequence_unit_keys: context.masterRequest.selectedSequenceUnitKeys,
          page_count: null,
          target_format: 'image',
          planner_notes: 'Scene-level location-only zone camera grid prepared from shot-scoped production graph data.',
          metadata: { ...commonConfig, board, coverageCells, createdFromSceneCoverageRefreshAt: new Date().toISOString() },
        },
        metadata: { boardId, sourceHash, shotIds: boardShotIds, coverageCells },
      })
    }
  }
  if (input.forceRefresh && matchingChildrenToStale.length > 0) {
    await markMatchingChildrenStale({
      client: input.client,
      children: matchingChildrenToStale,
      reason: 'Zone camera grid refresh requested.',
    })
  }
  return {
    childWorkflows,
    diagnostics: [],
    metadata: {
      childWorkflowCount: childWorkflows.length,
      preparedShotCount: zonePreparedShots.length,
    },
  }
}
