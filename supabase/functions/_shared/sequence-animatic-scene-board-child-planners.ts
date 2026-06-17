import {
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from './sequence-animatic-workflow-factory.ts'
import {
  buildSequenceAnimaticShotCoverageIntentWorkflowGraph,
  buildSequenceAnimaticZoneCoverageBoardWorkflowGraph,
} from './sequence-animatic-scene-board-workflows.ts'
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
}

export type SceneBoardChildWorkflowSpec = {
  stage: 'coverage_directions' | 'coverage_grids'
  role: 'coverage_intent_batch' | 'zone_coverage_board'
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

function continuityAssetStatesFromArtifacts(artifacts: readonly LooseRecord[]) {
  const states = new Map<string, LooseRecord>()
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
  nodesById: Map<string, LooseRecord>,
  statesByNodeId: Map<string, LooseRecord>,
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
  const spatialNodeIds = uniqueTexts([spatial.setId, spatial.zoneId, spatial.primarySpotId, spatial.viewpointId])
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
    .flatMap((entry) => missingSpatialReferencesForEntry(entry, context.nodesById))
    .map((entry) => [entry.nodeId, entry] as const)).values()]
  if (missingSpatialReferences.length > 0) {
    return {
      childWorkflows: [],
      diagnostics: ['Generate set, zone, and spot continuity references before creating zone camera grids.'],
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
