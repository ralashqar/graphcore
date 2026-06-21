import { HttpError } from './http.ts'
import {
  appendEnsuredChildWorkflow,
  createChildWorkflowEnsureAccumulator,
  ensureMappedChildWorkflow,
  loadChildWorkflowGraphBundle,
  loadOutputRequestById,
  markChildWorkflowStale,
} from './output-workflow-child-utils.ts'
import {
  mapOutputRequestRow,
  outputArtifactSelect,
  outputRequestSelect,
  outputWorkflowRunSelect,
  outputWorkflowRunStepSelect,
  resolveSequenceAnimaticCombinedManifest,
} from './output-workflow.ts'
import {
  sequenceAnimaticBlockWorkflowEnsureRequestSchema,
  sequenceAnimaticBlockWorkflowEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  sceneContinuityManifestSchema,
  type SceneContinuityManifest,
} from '../../../src/domain/sceneContinuityManifest.ts'
import {
  providerSafeSequenceAnimaticVideoDurationSeconds,
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStoryboardImageSize,
  sequenceAnimaticStableHash,
} from './sequence-animatic-workflow-factory.ts'
import {
  sequenceAnimaticCommandWorkflowTemplateRegistry,
  sequenceAnimaticShotVideoTemplateKey,
  sequenceAnimaticStoryboardBlocksTemplateKey,
} from './sequence-animatic-template-registry.ts'
import { buildValidatedSequenceAnimaticTemplateGraph } from './sequence-animatic-command-utils.ts'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'output'
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function readScreenplayAnimaticSource(metadata: Record<string, unknown>, fallback: 'wiki_sequence_unit' | 'prompt_cinematic' = 'wiki_sequence_unit') {
  const source = readText(metadata.screenplayAnimaticSource)
  return source === 'prompt_cinematic' || source === 'wiki_sequence_unit' ? source : fallback
}

async function loadSequenceAnimaticChildrenForRoles(input: {
  client: { from: (table: string) => any }
  projectId: string
  draftId: string
  parentRequestId: string
  roles: readonly string[]
}) {
  const byId = new Map<string, ReturnType<typeof mapOutputRequestRow>>()
  for (const role of input.roles.map(readText).filter(Boolean)) {
    for (const roleColumn of ['metadata->>screenplayAnimaticRole', 'metadata->>sequenceAnimaticRole']) {
      const response = await input.client
        .from('output_requests')
        .select(outputRequestSelect)
        .eq('project_id', input.projectId)
        .eq('draft_id', input.draftId)
        .eq('parent_request_id', input.parentRequestId)
        .eq(roleColumn, role)
        .order('created_at', { ascending: true })
      if (response.error) throw new Error(response.error.message)
      for (const row of response.data ?? []) {
        const request = mapOutputRequestRow(row)
        byId.set(request.id, request)
      }
    }
  }
  return Array.from(byId.values())
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

function continuityAnchorAssetPackEntity(anchor: Record<string, unknown>) {
  const id = readText(anchor.id)
  const assetKey = readText(anchor.assetKey)
  if (!id || !assetKey) return null
  const anchorType = readText(anchor.anchorType) || readText(anchor.type)
  const name = readText(anchor.name) || id
  const isCharacter = anchorType === 'character'
  const isLocation = anchorType === 'location_spot'
  return {
    key: id,
    name,
    type: isCharacter ? 'character' : isLocation ? 'location_spot' : 'prop',
    role: isCharacter ? 'character_reference' : isLocation ? 'location_reference' : 'prop_reference',
    summary: readText(anchor.summary),
    visualDescription: readText(anchor.visualBrief) || readText(anchor.summary),
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
    selectedReferenceVariantKey: 'continuity_anchor',
    selectedReferenceVariantLabel: name,
    selectedReferenceVariantSummary: readText(anchor.summary),
    selectedReferenceVariantType: anchorType,
    continuityAnchor: true,
    continuityAnchorType: anchorType,
    baseLocationRefId: readText(anchor.baseLocationRefId) || null,
    shotIds: readStringArray(anchor.shotIds),
    storyboardBlockIds: readStringArray(anchor.storyboardBlockIds),
    referenceSelectionReason: 'Sequence animatic continuity anchor generated from the parsed screenplay.',
  }
}

function assetPackWithContinuityAnchors(assetPack: Record<string, unknown>, manifest: Record<string, unknown>, anchorIds: string[]) {
  const idSet = new Set(anchorIds.filter(Boolean))
  if (idSet.size === 0) return assetPack
  const anchors = [
    ...readArray(manifest.characterAnchors).map(asRecord),
    ...readArray(manifest.propAnchors).map(asRecord),
    ...readArray(manifest.anchorAssets).map(asRecord),
  ].filter((anchor) => {
    const type = readText(anchor.type) || readText(anchor.anchorType)
    return type === 'character' || type === 'prop'
  })
  const anchorEntities = anchors
    .filter((anchor) => idSet.has(readText(anchor.id)))
    .map(continuityAnchorAssetPackEntity)
    .filter((entity): entity is NonNullable<ReturnType<typeof continuityAnchorAssetPackEntity>> => Boolean(entity))
  if (anchorEntities.length === 0) return assetPack
  const existingEntities = readArray(assetPack.entities).map(asRecord)
  const existingKeys = new Set(existingEntities.map((entity) => readText(entity.key)).filter(Boolean))
  return {
    ...assetPack,
    entities: [
      ...existingEntities,
      ...anchorEntities.filter((entity) => !existingKeys.has(readText(entity.key))),
    ],
    continuityAnchors: anchorEntities,
  }
}

function continuityAnchorIdsForScope(manifest: Record<string, unknown>, scopeKey: 'storyboardBlockIds' | 'shotIds', scopeId: string) {
  if (!scopeId) return []
  const shotContinuityMap = asRecord(manifest.shotContinuityMap ?? manifest.shot_continuity_map ?? manifest.continuityAnchorIdsByShotId)
  const shotBindings = asRecord(manifest.shotBindings ?? manifest.shot_bindings ?? asRecord(manifest.continuityGraphV2 ?? manifest.continuity_graph_v2).shotBindings)
  const mappedShotIds = scopeKey === 'shotIds'
    ? [
      ...readStringArray(shotContinuityMap[scopeId]),
      ...readStringArray(asRecord(shotBindings[scopeId]).continuityAnchorIds),
      ...readStringArray(asRecord(shotBindings[scopeId]).characterAnchorIds),
      ...readStringArray(asRecord(shotBindings[scopeId]).propAnchorIds),
    ].filter(Boolean)
    : []
  const blockMappedIds = scopeKey === 'storyboardBlockIds'
    ? Object.values(shotBindings)
      .map(asRecord)
      .filter((binding) => readText(binding.storyboardBlockId) === scopeId)
      .flatMap((binding) => [
        ...readStringArray(binding.continuityAnchorIds),
        ...readStringArray(binding.characterAnchorIds),
        ...readStringArray(binding.propAnchorIds),
      ])
      .filter(Boolean)
    : []
  const anchors = [
    ...readArray(manifest.characterAnchors).map(asRecord),
    ...readArray(manifest.propAnchors).map(asRecord),
    ...readArray(manifest.anchorAssets).map(asRecord),
  ].filter((anchor) => {
    const type = readText(anchor.type) || readText(anchor.anchorType)
    return type === 'character' || type === 'prop'
  })
  const validAnchorIds = new Set(anchors.map((anchor) => readText(anchor.id)).filter(Boolean))
  const anchorScopedIds = anchors
    .filter((anchor) => readStringArray(anchor[scopeKey]).includes(scopeId))
    .map((anchor) => readText(anchor.id))
    .filter(Boolean)
  return [...new Set([...mappedShotIds, ...blockMappedIds, ...anchorScopedIds])].filter((id) => validAnchorIds.has(id))
}

function mergeAnchorIds(...groups: string[][]) {
  const merged: string[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    for (const id of group) {
      if (!id || seen.has(id)) continue
      seen.add(id)
      merged.push(id)
    }
  }
  return merged
}

function compactUniqueTexts(values: readonly string[], limit = 24) {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values.map(readText).filter(Boolean)) {
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
    if (result.length >= limit) break
  }
  return result
}

function appendUniqueRecord<T extends Record<string, unknown>>(items: T[], item: T, key: string) {
  if (!key || items.some((entry) => readText(entry.assetKey) === key)) return
  items.push(item)
}

function storyboardSpatialReferenceLabel(role: string) {
  if (role === 'coverage_cell') return 'Coverage cell'
  if (role === 'spot_angle_grid') return 'Spot angle grid'
  if (role === 'spot_atlas') return 'Spot atlas'
  if (role === 'spatial_reference') return 'Spatial reference'
  return 'Continuity reference'
}

type StoryboardSceneContinuityManifestEntry = {
  artifactKey: string
  workflowId: string
  createdAt: string
  manifest: SceneContinuityManifest
}

async function loadSceneContinuityManifestsForStoryboardBlocks(input: {
  client: { from: (table: string) => any }
  projectId: string
  draftId: string
  children: readonly { workflowId?: string | null; metadata: unknown }[]
}): Promise<StoryboardSceneContinuityManifestEntry[]> {
  const sceneBoardWorkflowIds = input.children
    .filter((child) => readScreenplayAnimaticRole(asRecord(child.metadata)) === 'scene_board_prep')
    .map((child) => readText(child.workflowId))
    .filter(Boolean)
  if (sceneBoardWorkflowIds.length === 0) return []
  const response = await input.client
    .from('output_artifacts')
    .select(outputArtifactSelect)
    .eq('project_id', input.projectId)
    .eq('draft_id', input.draftId)
    .in('workflow_id', sceneBoardWorkflowIds)
    .order('created_at', { ascending: false })
  if (response.error) throw new Error(response.error.message)
  return (response.data ?? [])
    .map(asRecord)
    .map((row) => {
      const metadata = asRecord(row.metadata)
      const manifest = asRecord(metadata.sceneContinuityManifest ?? metadata.scene_continuity_manifest)
      const parsed = sceneContinuityManifestSchema.safeParse(manifest)
      if (!parsed.success) return null
      return {
        artifactKey: readText(row.key),
        workflowId: readText(row.workflow_id),
        createdAt: readText(row.created_at),
        manifest: parsed.data,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

function buildStoryboardSpatialReferencePack(input: {
  block: Record<string, unknown>
  manifests: readonly StoryboardSceneContinuityManifestEntry[]
}) {
  const shotIds = compactUniqueTexts([
    ...readStringArray(input.block.shotIds),
    ...readArray(input.block.shots).map((shot) => readText(asRecord(shot).id)),
  ], 12)
  const shotSpatialReferences: Record<string, unknown>[] = []
  const selectedReferenceAssets: Record<string, unknown>[] = []
  const manifestHashes: string[] = []
  const blockers: string[] = []
  for (const shotId of shotIds) {
    const match = input.manifests.find((entry) => {
      const manifest = entry.manifest
      return manifest.shotIds.includes(shotId) || manifest.shotReadiness.some((readiness) => readiness.shotId === shotId)
    }) ?? null
    const readiness = match?.manifest.shotReadiness.find((entry) => entry.shotId === shotId) ?? null
    if (match?.manifest.sourceHash) manifestHashes.push(match.manifest.sourceHash)
    if (!match || !readiness) {
      blockers.push('missing_scene_continuity_manifest')
      shotSpatialReferences.push({
        shotId,
        status: 'blocked',
        blockers: ['missing_scene_continuity_manifest'],
        referenceAssetKeys: [],
      })
      continue
    }
    const shotBlockers = compactUniqueTexts(readiness.blockers)
    shotBlockers.forEach((blocker) => blockers.push(blocker))
    const coverageAssetKey = readText(readiness.coverageCellAssetKey) || readText(readiness.coverageAnchorAssetKey)
    if (coverageAssetKey) {
      appendUniqueRecord(selectedReferenceAssets, {
        assetKey: coverageAssetKey,
        role: 'coverage_cell',
        priority: 1,
        shotIds: [shotId],
        sceneId: readiness.sceneId,
        zoneId: readiness.zoneId,
        spotIds: readiness.spotIds,
        coverageSetupId: readiness.coverageSetupId,
        label: `Coverage cell for ${shotId}`,
      }, coverageAssetKey)
    }
    for (const assetKey of readiness.spotAngleAssetKeys) {
      appendUniqueRecord(selectedReferenceAssets, {
        assetKey,
        role: 'spot_angle_grid',
        priority: 2,
        shotIds: [shotId],
        sceneId: readiness.sceneId,
        zoneId: readiness.zoneId,
        spotIds: readiness.spotIds,
        angleIds: readiness.angleIds,
        label: `Spot angle grid for ${readiness.spotIds[0] || shotId}`,
      }, assetKey)
    }
    for (const assetKey of readiness.spotAtlasAssetKeys) {
      appendUniqueRecord(selectedReferenceAssets, {
        assetKey,
        role: 'spot_atlas',
        priority: 3,
        shotIds: [shotId],
        sceneId: readiness.sceneId,
        zoneId: readiness.zoneId,
        spotIds: readiness.spotIds,
        label: `Spot atlas for ${readiness.spotIds[0] || shotId}`,
      }, assetKey)
    }
    const known = new Set([
      coverageAssetKey,
      ...readiness.spotAngleAssetKeys,
      ...readiness.spotAtlasAssetKeys,
    ].filter(Boolean))
    for (const assetKey of readiness.readyArtifactKeys.filter((key) => key && !known.has(key))) {
      appendUniqueRecord(selectedReferenceAssets, {
        assetKey,
        role: 'spatial_reference',
        priority: 4,
        shotIds: [shotId],
        sceneId: readiness.sceneId,
        zoneId: readiness.zoneId,
        spotIds: readiness.spotIds,
        label: `Spatial reference for ${readiness.zoneId || shotId}`,
      }, assetKey)
    }
    shotSpatialReferences.push({
      shotId,
      status: readiness.status,
      sceneId: readiness.sceneId,
      setId: readiness.setId,
      zoneId: readiness.zoneId,
      spotIds: readiness.spotIds,
      viewpointId: readiness.viewpointId,
      angleIds: readiness.angleIds,
      coverageSetupId: readiness.coverageSetupId,
      coverageCellAssetKey: readiness.coverageCellAssetKey,
      coverageAnchorAssetKey: readiness.coverageAnchorAssetKey,
      spotAtlasAssetKeys: readiness.spotAtlasAssetKeys,
      spotAngleAssetKeys: readiness.spotAngleAssetKeys,
      readyArtifactKeys: readiness.readyArtifactKeys,
      blockers: shotBlockers,
      referenceAssetKeys: compactUniqueTexts([
        coverageAssetKey,
        ...readiness.spotAngleAssetKeys,
        ...readiness.spotAtlasAssetKeys,
        ...readiness.readyArtifactKeys,
      ], 12),
      readinessHash: readiness.hash,
      manifestHash: match.manifest.sourceHash,
    })
  }
  const sortedAssets = selectedReferenceAssets
    .sort((left, right) => (Number(left.priority) || 99) - (Number(right.priority) || 99))
    .slice(0, 16)
  const uniqueBlockers = compactUniqueTexts(blockers, 12)
  const selectedReferenceAssetKeys = sortedAssets.map((asset) => readText(asset.assetKey)).filter(Boolean)
  const status = uniqueBlockers.length > 0 || shotSpatialReferences.some((entry) => readStringArray(entry.referenceAssetKeys).length === 0)
    ? 'provisional'
    : 'ready'
  const hash = sequenceAnimaticStableHash({
    policy: 'storyboard_spatial_reference_pack_v1',
    shotIds,
    manifestHashes: compactUniqueTexts(manifestHashes, 12),
    selectedReferenceAssetKeys,
    blockers: uniqueBlockers,
    shotReadinessHashes: shotSpatialReferences.map((entry) => readText(entry.readinessHash)).filter(Boolean),
  })
  return {
    contractVersion: 'storyboard_spatial_reference_pack_v1',
    status,
    provisional: status !== 'ready',
    staleable: status !== 'ready' || selectedReferenceAssetKeys.length > 0,
    hash,
    manifestHashes: compactUniqueTexts(manifestHashes, 12),
    shotIds,
    shotSpatialReferences,
    selectedReferenceAssets: sortedAssets,
    selectedReferenceAssetKeys,
    blockers: uniqueBlockers,
  }
}

function assetPackWithStoryboardSpatialReferences(assetPack: Record<string, unknown>, spatialPack: Record<string, unknown>) {
  const selectedAssets = readArray(spatialPack.selectedReferenceAssets).map(asRecord)
  if (selectedAssets.length === 0) {
    return {
      ...assetPack,
      storyboardSpatialReferencePack: spatialPack,
      storyboardSpatialReferencePackHash: readText(spatialPack.hash),
    }
  }
  const existingEntities = readArray(assetPack.entities).map(asRecord)
  const existingKeys = new Set(existingEntities.map((entity) => readText(entity.key)).filter(Boolean))
  const existingAssetKeys = new Set(existingEntities.flatMap((entity) => [
    readText(entity.primaryAssetKey),
    ...readStringArray(entity.assetKeys),
  ]).filter(Boolean))
  const spatialEntities = selectedAssets
    .filter((asset) => readText(asset.assetKey) && !existingAssetKeys.has(readText(asset.assetKey)))
    .map((asset, index) => {
      const assetKey = readText(asset.assetKey)
      const role = readText(asset.role) || 'spatial_reference'
      const label = readText(asset.label) || `${storyboardSpatialReferenceLabel(role)} ${index + 1}`
      return {
        key: `storyboard_spatial_${slugify(role)}_${sequenceAnimaticStableHash(asset).slice(0, 10)}`,
        name: label,
        type: 'continuity_spatial_ref',
        role,
        summary: `${storyboardSpatialReferenceLabel(role)} used to ground storyboard geography and camera blocking.`,
        visualDescription: `${label}. Use as continuity reference only; do not reproduce source grid, labels, gutters, or UI.`,
        assetKeys: [assetKey],
        primaryAssetKey: assetKey,
        selectedReferenceAssetKey: assetKey,
        selectedReferenceVariantKey: 'storyboard_spatial_reference',
        selectedReferenceVariantLabel: storyboardSpatialReferenceLabel(role),
        selectedReferenceVariantSummary: label,
        selectedReferenceVariantType: role,
        storyboardSpatialReference: true,
        shotIds: readStringArray(asset.shotIds),
        sceneId: readText(asset.sceneId),
        zoneId: readText(asset.zoneId),
        spotIds: readStringArray(asset.spotIds),
        angleIds: readStringArray(asset.angleIds),
        coverageSetupId: readText(asset.coverageSetupId),
        referenceSelectionReason: 'Selected from scene_continuity_manifest_v1 for sequence animatic storyboard block grounding.',
      }
    })
    .filter((entity) => !existingKeys.has(readText(entity.key)))
  return {
    ...assetPack,
    entities: [...existingEntities, ...spatialEntities],
    storyboardSpatialReferencePack: spatialPack,
    storyboardSpatialReferencePackHash: readText(spatialPack.hash),
    storyboardSpatialReferences: spatialEntities,
  }
}

function storyboardLayoutForShotCount(shotCount: number) {
  const panelCount = Math.max(1, Math.min(9, Math.ceil(Number(shotCount) || 1)))
  if (panelCount <= 1) return { rows: 1, columns: 1, panelCount }
  if (panelCount <= 2) return { rows: 1, columns: 2, panelCount }
  if (panelCount <= 4) return { rows: 2, columns: 2, panelCount }
  if (panelCount <= 6) return { rows: 2, columns: 3, panelCount }
  return { rows: 3, columns: 3, panelCount }
}

function storyboardBlockFromShots(input: {
  block: Record<string, unknown>
  index: number
  shots: Record<string, unknown>[]
}) {
  const blockId = readText(input.block.id) || `cinematic_v3_storyboard_group_${String(input.index + 1).padStart(3, '0')}`
  const shotIds = readStringArray(input.block.shotIds ?? input.block.shot_ids).length > 0
    ? readStringArray(input.block.shotIds ?? input.block.shot_ids)
    : input.shots.map((shot) => readText(shot.id)).filter(Boolean)
  const layout = storyboardLayoutForShotCount(Math.max(shotIds.length, input.shots.length))
  const durationSeconds = input.shots.reduce((total, shot) => total + (Number(shot.editorialDurationSeconds ?? shot.durationSeconds ?? 0) || 0), 0)
  const title = readText(input.block.title)
    || readText(input.block.summary)
    || input.shots.map((shot) => readText(shot.title)).filter(Boolean).slice(0, 2).join(' / ')
    || `Storyboard block ${input.index + 1}`
  const storyboardGroup = {
    ...asRecord(input.block.storyboardGroup ?? input.block.storyboard_group),
    id: blockId,
    index: Number(input.block.index ?? input.index + 1) || input.index + 1,
    shotIds,
    summary: readText(input.block.summary) || title,
    rows: layout.rows,
    columns: layout.columns,
    panelCount: layout.panelCount,
    editorialDurationSeconds: durationSeconds,
    providerDurationSeconds: Math.max(4, Math.min(15, Number(input.block.providerDurationSeconds ?? input.block.provider_duration_seconds ?? durationSeconds) || 8)),
    continuityNotes: readStringArray(input.block.continuityNotes ?? input.block.continuity_notes),
  }
  return {
    ...input.block,
    id: blockId,
    index: Number(input.block.index ?? input.index + 1) || input.index + 1,
    title,
    shotIds,
    shots: input.shots,
    storyboardGroup,
    storyboardLayout: layout,
    durationSeconds: durationSeconds || undefined,
  }
}

function deriveStoryboardBlocksForMaster(input: {
  manifest: Record<string, unknown>
  directorPlan: Record<string, unknown>
  directorShotById: ReadonlyMap<string, Record<string, unknown>>
}) {
  const manifestShotPlan = asRecord(input.manifest.shotPlan ?? input.manifest.shot_plan)
  const manifestShots = readArray(manifestShotPlan.shots).map(asRecord).filter((shot) => readText(shot.id))
  const manifestShotById = new Map(manifestShots.map((shot) => [readText(shot.id), shot] as const).filter(([id]) => id))
  const mergedShotById = new Map<string, Record<string, unknown>>()
  for (const shot of [...manifestShots, ...Array.from(input.directorShotById.values())]) {
    const shotId = readText(shot.id)
    if (!shotId) continue
    mergedShotById.set(shotId, { ...asRecord(mergedShotById.get(shotId)), ...shot, id: shotId })
  }
  const normalizeBlock = (block: Record<string, unknown>, index: number) => {
    const shotIds = readStringArray(block.shotIds ?? block.shot_ids)
    const blockShots = shotIds
      .map((shotId) => ({ ...asRecord(manifestShotById.get(shotId)), ...asRecord(input.directorShotById.get(shotId)), id: shotId }))
      .filter((shot) => readText(shot.id))
    const fallbackShots = blockShots.length > 0
      ? blockShots
      : readArray(block.shots).map(asRecord).filter((shot) => readText(shot.id))
    return storyboardBlockFromShots({ block, index, shots: fallbackShots })
  }

  const manifestBlocks = readArray(input.manifest.blocks).map(asRecord).filter((block) => readText(block.id))
  if (manifestBlocks.length > 0) return manifestBlocks.map(normalizeBlock)

  const directorBlocks = readArray(input.directorPlan.blocks).map(asRecord).filter((block) => readText(block.id))
  if (directorBlocks.length > 0) return directorBlocks.map(normalizeBlock)

  const orderedShots = Array.from(mergedShotById.values())
    .sort((left, right) => (Number(left.index ?? 0) || 0) - (Number(right.index ?? 0) || 0))
  const chunks: Record<string, unknown>[][] = []
  for (let index = 0; index < orderedShots.length; index += 9) {
    chunks.push(orderedShots.slice(index, index + 9))
  }
  return chunks.map((shots, index) => storyboardBlockFromShots({
    block: {
      id: `cinematic_v3_storyboard_group_${String(index + 1).padStart(3, '0')}`,
      index: index + 1,
      title: `Storyboard block ${index + 1}`,
      shotIds: shots.map((shot) => readText(shot.id)).filter(Boolean),
    },
    index,
    shots,
  }))
}

function isStoryboardPanelRole(role: string) {
  return role === 'cinematic_v3_storyboard_panel'
    || role === 'cinematic_v2_storyboard_panel'
    || role === 'sequence_animatic_block_panel'
}

function storyboardPanelCandidateForShot(value: unknown, shotId: string) {
  const record = asRecord(value)
  const metadata = asRecord(record.metadata)
  const role = readText(metadata.role) || readText(record.role) || readText(metadata.sequenceAnimaticArtifactRole)
  const sequenceRole = readText(metadata.sequenceAnimaticArtifactRole) || readText(record.sequenceAnimaticArtifactRole)
  const candidateShotId = readText(metadata.shotId) || readText(record.shotId)
  const assetKey = readText(record.asset_key) || readText(record.assetKey) || readText(metadata.assetKey)
  return Boolean(assetKey)
    && candidateShotId === shotId
    && (isStoryboardPanelRole(role) || isStoryboardPanelRole(sequenceRole))
}

function normalizeStoryboardPanelRecord(value: unknown, shotId: string) {
  const record = asRecord(value)
  const metadata = asRecord(record.metadata)
  const artifact = asRecord(record.artifact)
  const role = readText(metadata.role) || readText(record.role) || 'cinematic_v3_storyboard_panel'
  const assetKey = readText(record.asset_key) || readText(record.assetKey) || readText(metadata.assetKey)
  const storagePath = readText(record.storage_path) || readText(record.storagePath) || readText(metadata.storagePath)
  const mimeType = readText(record.mime_type) || readText(record.mimeType) || readText(metadata.mimeType) || 'image/webp'
  return {
    ...record,
    key: readText(record.key) || readText(artifact.key),
    asset_key: assetKey,
    storage_path: storagePath,
    mime_type: mimeType,
    metadata: {
      ...metadata,
      ...record,
      role,
      shotId,
      assetKey,
      storagePath,
      mimeType,
    },
  }
}

function collectStoryboardPanelCandidatesFromOutputs(outputs: unknown) {
  const record = asRecord(outputs)
  return [
    ...readArray(record.panels),
    ...readArray(record.images),
    record.image,
  ].filter((entry) => Object.keys(asRecord(entry)).length > 0)
}

function storyboardPanelRecordFromAsset(row: unknown, shotId: string) {
  const record = asRecord(row)
  const metadata = asRecord(record.metadata)
  const assetKey = readText(record.key)
  const storagePath = readText(record.storage_path)
  const mimeType = readText(record.mime_type) || 'image/webp'
  return {
    key: '',
    asset_key: assetKey,
    storage_path: storagePath,
    mime_type: mimeType,
    metadata: {
      ...metadata,
      role: 'cinematic_v3_storyboard_panel',
      sequenceAnimaticArtifactRole: 'sequence_animatic_block_panel',
      shotId,
      assetKey,
      storagePath,
      mimeType,
      source: 'explicit_panel_asset_key',
    },
  }
}

export async function runSequenceAnimaticBlockWorkflowCommand(input: {
  client: {
    from: (table: string) => any
    rpc: (fn: string, args?: Record<string, unknown>) => any
  }
  admin: {
    from: (table: string) => any
    rpc: (fn: string, args?: Record<string, unknown>) => any
  }
  userId: string
  payload: unknown
}) {
    const { client, admin, userId } = input
    const payload = sequenceAnimaticBlockWorkflowEnsureRequestSchema.parse(input.payload)

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
    if (readScreenplayAnimaticRole(masterMetadata) !== 'master') {
      throw new HttpError(409, 'This output is not a screenplay animatic master request.')
    }
    if (!masterRequest.workflowId) throw new HttpError(409, 'Screenplay animatic master has no workflow yet.')
    const screenplayAnimaticSource = readScreenplayAnimaticSource(
      masterMetadata,
      masterRequest.sourceSurface === 'wiki_sequence_unit' ? 'wiki_sequence_unit' : 'prompt_cinematic',
    )

    const artifactsResponse = await client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('workflow_id', masterRequest.workflowId)
      .order('created_at', { ascending: false })
    if (artifactsResponse.error) throw new Error(artifactsResponse.error.message)
    const manifestArtifactRow = (artifactsResponse.data ?? [])
      .find((row) => readText(asRecord(asRecord(row).metadata).role) === 'sequence_animatic_manifest') ?? null
    const manifestArtifactMetadata = asRecord(asRecord(manifestArtifactRow).metadata)
    let manifest = asRecord(manifestArtifactMetadata.manifest)
    const directorPlanArtifactRow = (artifactsResponse.data ?? [])
      .find((row) => readText(asRecord(asRecord(row).metadata).role) === 'sequence_animatic_director_plan') ?? null
    const directorPlanMetadata = asRecord(asRecord(directorPlanArtifactRow).metadata)
    let directorPlan = asRecord(directorPlanMetadata.directorPlan ?? directorPlanMetadata.director_plan)
    let masterManifestArtifactKey = readText(asRecord(manifestArtifactRow).key)
    if (Object.keys(manifest).length === 0 || Object.keys(directorPlan).length === 0) {
      // Per-scene architecture: sequence-unit masters may only register scenes.
      // Completed scene children own their director-plan/manifest artifacts, so
      // combine them at read time for storyboard block creation.
      const combined = await resolveSequenceAnimaticCombinedManifest({ client: admin, masterRequest })
      if (combined) {
        manifest = combined.manifest
        directorPlan = combined.directorPlan
        masterManifestArtifactKey = combined.manifestArtifactKey
      }
    }
    const directorShots = readArray(directorPlan.shots).map(asRecord).filter((shot) => readText(shot.id))
    const directorShotById = new Map(directorShots.map((shot) => [readText(shot.id), shot] as const).filter(([id]) => id))
    const manifestHash = sequenceAnimaticStableHash(manifest)
    const blocks = deriveStoryboardBlocksForMaster({ manifest, directorPlan, directorShotById })
      .filter((block) => readText(block.id) && readArray(block.shots).length > 0)
    if (blocks.length === 0) {
      const manifestReady = Object.keys(manifest).length > 0
      const directorPlanReady = Object.keys(directorPlan).length > 0
      throw new HttpError(
        409,
        manifestReady || directorPlanReady
          ? 'The screenplay animatic master has no storyboardable shots yet. Wait for the director/shot plan to finish, then try Generate storyboard again.'
          : 'No completed scene shot plans are ready yet for storyboard generation. Wait for at least one scene shot plan to finish, then try Generate storyboard again.',
      )
    }

    const existingChildren = await loadSequenceAnimaticChildrenForRoles({
      client,
      projectId: payload.projectId,
      draftId: payload.draftId,
      parentRequestId: masterRequest.id,
      roles: ['storyboard_block', 'continuity_pack', 'scene_board_prep'],
    })
    const currentBlockHashById = new Map(blocks.map((block) => [readText(block.id), sequenceAnimaticStableHash(block)] as const).filter(([id]) => id))
    const storyboardSceneContinuityManifests = await loadSceneContinuityManifestsForStoryboardBlocks({
      client,
      projectId: payload.projectId,
      draftId: payload.draftId,
      children: existingChildren,
    })
    const storyboardSpatialReferencePackByBlockId = new Map(blocks.map((block) => {
      const blockId = readText(block.id)
      if (!blockId) return null
      return [blockId, buildStoryboardSpatialReferencePack({ block, manifests: storyboardSceneContinuityManifests })] as const
    }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)))
    const staleChildren: typeof existingChildren = []
    const staleChildReasons = new Map<string, string>()
    const activeExistingChildren = existingChildren.filter((child) => {
      const metadata = asRecord(child.metadata)
      if (metadata.sequenceAnimaticStale === true) return false
      const role = readScreenplayAnimaticRole(metadata)
      if (role === 'storyboard_block') {
        const blockId = readText(metadata.storyboardBlockId)
        const currentBlockHash = currentBlockHashById.get(blockId)
        const spatialPack = storyboardSpatialReferencePackByBlockId.get(blockId) ?? null
        const currentSpatialHash = readText(spatialPack?.hash)
        const spatialHashMatters = Boolean(currentSpatialHash && (
          readStringArray(spatialPack?.selectedReferenceAssetKeys).length > 0
          || readStringArray(spatialPack?.manifestHashes).length > 0
        ))
        const spatialStale = spatialHashMatters && readText(metadata.storyboardSpatialReferencePackHash) !== currentSpatialHash
        const manifestStale = Boolean(readText(metadata.manifestHash) && readText(metadata.manifestHash) !== manifestHash)
        const blockStale = Boolean(currentBlockHash && readText(metadata.blockHash) && readText(metadata.blockHash) !== currentBlockHash)
        const stale = manifestStale || blockStale || spatialStale
        if (stale) {
          staleChildReasons.set(child.id, spatialStale ? 'storyboard_spatial_refs_changed' : 'master_manifest_changed')
          staleChildren.push(child)
          return false
        }
      }
      return true
    })
    for (const staleChild of staleChildren) {
      const metadata = asRecord(staleChild.metadata)
      await markChildWorkflowStale({
        client,
        request: staleChild,
        status: 'awaiting_confirmation',
        readyToRun: false,
        reason: staleChildReasons.get(staleChild.id) || 'master_manifest_changed',
        metadata: {
          staleManifestHash: readText(metadata.manifestHash) || null,
          replacedByManifestHash: manifestHash,
          staleStoryboardSpatialReferencePackHash: readText(metadata.storyboardSpatialReferencePackHash) || null,
          replacedByStoryboardSpatialReferencePackHash: readText(storyboardSpatialReferencePackByBlockId.get(readText(metadata.storyboardBlockId))?.hash) || null,
        },
      })
    }
    const existingByBlockId = new Map(activeExistingChildren.map((child) => [readText(asRecord(child.metadata).storyboardBlockId), child] as const).filter(([id]) => id))
    const continuityChild = activeExistingChildren.find((child) => {
      const metadata = asRecord(child.metadata)
      return readScreenplayAnimaticRole(metadata) === 'continuity_pack'
        && (!readText(metadata.manifestHash) || readText(metadata.manifestHash) === manifestHash)
    }) ?? null
    let continuityAnchorSource = manifest
    let continuityPackHash = ''
    if (continuityChild?.workflowId) {
      const continuityArtifactsResponse = await client
        .from('output_artifacts')
        .select(outputArtifactSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .eq('workflow_id', continuityChild.workflowId)
        .order('created_at', { ascending: false })
      if (continuityArtifactsResponse.error) throw new Error(continuityArtifactsResponse.error.message)
      const continuityArtifact = (continuityArtifactsResponse.data ?? []).find((row) => {
        const metadata = asRecord(asRecord(row).metadata)
        return readText(metadata.role) === 'sequence_animatic_continuity_pack'
      }) ?? null
      const continuityMetadata = asRecord(asRecord(continuityArtifact).metadata)
      const continuityPack = asRecord(continuityMetadata.continuityPack)
      if (Object.keys(continuityPack).length > 0) {
        continuityAnchorSource = continuityPack
        continuityPackHash = readText(continuityMetadata.continuityPackHash) || sequenceAnimaticStableHash(continuityPack)
      }
    }
    if (Object.keys(directorPlan).length > 0) {
      continuityAnchorSource = {
        ...continuityAnchorSource,
        ...directorPlan,
        continuityGraphV2: asRecord(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2),
        shotBindings: asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings),
      }
      continuityPackHash = continuityPackHash || readText(directorPlan.shotPlanHash) || sequenceAnimaticStableHash(directorPlan)
    }

    if (payload.sequenceAnimaticMode === 'shot_video') {
      const blockRequestId = readText(payload.blockRequestId)
      const shotId = readText(payload.shotId)
      const requestedStoryboardBlockId = readText(payload.storyboardBlockId)
      const requestedPanelAssetKey = readText(payload.panelAssetKey)
      if (!blockRequestId && !requestedStoryboardBlockId) {
        throw new HttpError(400, 'blockRequestId or storyboardBlockId is required when preparing a shot video workflow.')
      }
      if (!shotId) throw new HttpError(400, 'shotId is required when preparing a shot video workflow.')

      const blockRequest = activeExistingChildren.find((child) => child.id === blockRequestId)
        ?? (requestedStoryboardBlockId ? existingByBlockId.get(requestedStoryboardBlockId) ?? null : null)
      if (!blockRequest) {
        throw new HttpError(404, 'Storyboard block request was not found under this sequence animatic master. Refresh the animatic state or regenerate the storyboard block workflow.')
      }
      const blockMetadata = asRecord(blockRequest.metadata)
      if (readScreenplayAnimaticRole(blockMetadata) !== 'storyboard_block') {
        throw new HttpError(409, 'The selected parent request is not a storyboard block workflow.')
      }
      if (!blockRequest.workflowId) throw new HttpError(409, 'Storyboard block request has no workflow yet.')

      const storyboardBlockId = readText(blockMetadata.storyboardBlockId) || requestedStoryboardBlockId
      const block = blocks.find((entry) => readText(entry.id) === storyboardBlockId) ?? null
      if (!block) throw new HttpError(404, 'Storyboard block was not found in the sequence animatic manifest.')
      const shots = readArray(block.shots).map(asRecord)
      const shot = shots.find((entry) => readText(entry.id) === shotId) ?? null
      if (!shot) throw new HttpError(404, 'Shot was not found in the storyboard block.')
      const currentBlockHash = sequenceAnimaticStableHash(block)

      const shotChildrenResponse = await client
        .from('output_requests')
        .select(outputRequestSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .eq('parent_request_id', blockRequest.id)
        .order('created_at', { ascending: true })
      if (shotChildrenResponse.error) throw new Error(shotChildrenResponse.error.message)
      const shotChildren = (shotChildrenResponse.data ?? []).map(mapOutputRequestRow)
      const revisionWorkflowIds = shotChildren
        .filter((child) => {
          const metadata = asRecord(child.metadata)
          return metadata.sequenceAnimaticStale !== true
            && readScreenplayAnimaticRole(metadata) === 'shot_revision'
            && readText(metadata.shotId) === shotId
            && child.workflowId
        })
        .map((child) => child.workflowId as string)
      let latestShotRevision: Record<string, unknown> | null = null
      if (revisionWorkflowIds.length > 0) {
        const revisionArtifactsResponse = await client
          .from('output_artifacts')
          .select(outputArtifactSelect)
          .eq('project_id', payload.projectId)
          .eq('draft_id', payload.draftId)
          .in('workflow_id', revisionWorkflowIds)
          .order('created_at', { ascending: false })
        if (revisionArtifactsResponse.error) throw new Error(revisionArtifactsResponse.error.message)
        latestShotRevision = (revisionArtifactsResponse.data ?? [])
          .map(asRecord)
          .find((row) => {
            const metadata = asRecord(row.metadata)
            return readText(metadata.role) === 'sequence_animatic_shot_revision'
              && readText(metadata.shotId) === shotId
              && (readText(metadata.keyframeAssetKey) || readText(row.asset_key))
          }) ?? null
      }
      const existingShotChild = shotChildren.find((child) => {
        const metadata = asRecord(child.metadata)
        return metadata.sequenceAnimaticStale !== true
          && readScreenplayAnimaticRole(metadata) === 'shot_video'
          && readText(metadata.shotId) === shotId
          && (!readText(metadata.manifestHash) || readText(metadata.manifestHash) === manifestHash)
          && (!readText(metadata.blockHash) || readText(metadata.blockHash) === currentBlockHash)
      }) ?? null

      let shotChild = existingShotChild
      const now = new Date().toISOString()
      if (shotChild && requestedPanelAssetKey) {
        const existingMetadata = asRecord(shotChild.metadata)
        const existingPanelAssetKey = readText(existingMetadata.panelAssetKey)
        if (existingPanelAssetKey && existingPanelAssetKey !== requestedPanelAssetKey) {
          await markChildWorkflowStale({
            client: admin,
            request: shotChild,
            reason: 'shot_panel_asset_changed',
            staleAtField: 'staleMarkedAt',
            now,
            metadata: {
              replacementPanelAssetKey: requestedPanelAssetKey,
            },
            refreshProjection: true,
          })
          shotChild = null
        }
      }
      if (!shotChild) {
        const panelArtifactsResponse = await client
          .from('output_artifacts')
          .select(outputArtifactSelect)
          .eq('project_id', payload.projectId)
          .eq('draft_id', payload.draftId)
          .eq('workflow_id', blockRequest.workflowId)
          .order('created_at', { ascending: false })
        if (panelArtifactsResponse.error) throw new Error(panelArtifactsResponse.error.message)
        let panelArtifact = (panelArtifactsResponse.data ?? []).find((row) => storyboardPanelCandidateForShot(row, shotId)) ?? null
        const availableArtifactPanelShotIds = new Set((panelArtifactsResponse.data ?? [])
          .map((row) => readText(asRecord(asRecord(row).metadata).shotId))
          .filter(Boolean))
        if (!panelArtifact) {
          const [runRows, stepRows] = await Promise.all([
            client
              .from('output_workflow_runs')
              .select(outputWorkflowRunSelect)
              .eq('project_id', payload.projectId)
              .eq('draft_id', payload.draftId)
              .eq('workflow_id', blockRequest.workflowId)
              .order('updated_at', { ascending: false })
              .limit(5),
            client
              .from('output_workflow_run_steps')
              .select(outputWorkflowRunStepSelect)
              .eq('workflow_id', blockRequest.workflowId)
              .eq('node_key', 'panel_extract')
              .order('updated_at', { ascending: false })
              .limit(5),
          ])
          if (runRows.error) throw new Error(runRows.error.message)
          if (stepRows.error) throw new Error(stepRows.error.message)
          const outputPanelCandidates = [
            ...(stepRows.data ?? []).flatMap((row) => collectStoryboardPanelCandidatesFromOutputs(asRecord(row).outputs)),
            ...(runRows.data ?? []).flatMap((row) => collectStoryboardPanelCandidatesFromOutputs(asRecord(row).outputs)),
          ]
          for (const candidate of outputPanelCandidates) {
            const candidateShotId = readText(asRecord(candidate).shotId) || readText(asRecord(asRecord(candidate).metadata).shotId)
            if (candidateShotId) availableArtifactPanelShotIds.add(candidateShotId)
          }
          const outputPanel = outputPanelCandidates.find((candidate) => storyboardPanelCandidateForShot(candidate, shotId)) ?? null
          if (outputPanel) panelArtifact = normalizeStoryboardPanelRecord(outputPanel, shotId)
        }
        if (!panelArtifact && requestedPanelAssetKey) {
          const panelAssetResponse = await admin
            .from('project_assets')
            .select('key, storage_path, mime_type, metadata')
            .eq('project_id', payload.projectId)
            .eq('key', requestedPanelAssetKey)
            .maybeSingle()
          if (panelAssetResponse.error) throw new Error(panelAssetResponse.error.message)
          if (panelAssetResponse.data) panelArtifact = storyboardPanelRecordFromAsset(panelAssetResponse.data, shotId)
        }
        if (!panelArtifact) {
          const availableShotSummary = Array.from(availableArtifactPanelShotIds).slice(0, 12).join(', ')
          throw new HttpError(
            409,
            `Generate/extract the storyboard panel before creating a shot video workflow. No panel asset was found for shot "${shotId}" on this block${requestedPanelAssetKey ? `, and the requested panel asset "${requestedPanelAssetKey}" was not found` : ''}${availableShotSummary ? `; available panel shots: ${availableShotSummary}` : ''}.`,
          )
        }
        const revisionMetadata = asRecord(latestShotRevision?.metadata)
        const revisionRecord = asRecord(revisionMetadata.revision)
        const revisedShot = asRecord(revisionMetadata.revisedShot ?? revisionRecord.revisedShot)
        const effectiveShot = Object.keys(revisedShot).length > 0 ? { ...shot, ...revisedShot, id: shotId } : shot
        const basePanelArtifactRecord = asRecord(panelArtifact)
        const panelArtifactRecord = latestShotRevision && (readText(revisionMetadata.keyframeAssetKey) || readText(latestShotRevision.asset_key))
          ? {
            ...basePanelArtifactRecord,
            asset_key: readText(revisionMetadata.keyframeAssetKey) || readText(latestShotRevision.asset_key),
            key: readText(latestShotRevision.key) || readText(basePanelArtifactRecord.key),
            metadata: {
              ...asRecord(basePanelArtifactRecord.metadata),
              ...revisionMetadata,
              role: 'sequence_animatic_shot_revision_keyframe',
              sourcePanelAssetKey: readText(basePanelArtifactRecord.asset_key),
              revisionArtifactKey: readText(latestShotRevision.key),
            },
          }
          : basePanelArtifactRecord
        const panelMetadata = asRecord(panelArtifactRecord.metadata)
        const editorialDurationSeconds = Math.max(0.5, Math.min(15, Number(effectiveShot.editorialDurationSeconds ?? 0) || Number(panelMetadata.editorialDurationSeconds ?? 0) || 3))
        const providerDurationSeconds = providerSafeSequenceAnimaticVideoDurationSeconds(effectiveShot.providerDurationSeconds ?? editorialDurationSeconds)
        const blockHash = sequenceAnimaticStableHash(block)
        const shotHash = sequenceAnimaticStableHash({ blockId: storyboardBlockId, shot: effectiveShot, panelAssetKey: readText(panelArtifactRecord.asset_key) })
        const workflowPayload = {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            key: `sequence_animatic_shot_${slugify(blockRequest.id)}_${slugify(shotId)}_${shotHash.slice(0, 8)}`,
            name: `${blockRequest.title} / Shot ${Number(effectiveShot.index ?? 0) || shots.indexOf(shot) + 1}`,
            description: 'Sequence animatic per-shot video workflow.',
            preset: 'cinematic_episode_from_sequence',
            status: 'active',
            created_by: userId,
            metadata: {
              parentRequestId: blockRequest.id,
              masterRequestId: masterRequest.id,
              graphSpecVersion: sequenceAnimaticGraphSpecVersion,
              screenplayAnimaticRole: 'shot_video',
              screenplayAnimaticSource,
              sequenceAnimaticRole: 'shot_video',
              storyboardBlockId,
              shotId,
              manifestHash,
              blockHash,
              shotHash,
              continuityPackHash: continuityPackHash || null,
              masterManifestArtifactKey,
              sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
              sourceMasterWorkflowId: masterRequest.workflowId,
              sourceBlockWorkflowId: blockRequest.workflowId,
              readyToRun: true,
            },
          }
        const aspectRatio = readText(asRecord(manifest.assetPack).aspectRatio) || '16:9'
        const commonConfig = {
          cinematicPipelineVersion: 'v3_script_storyboards',
          graphSpecVersion: sequenceAnimaticGraphSpecVersion,
          screenplayAnimaticRole: 'shot_video',
          screenplayAnimaticSource,
          sequenceAnimaticRole: 'shot_video',
          masterRequestId: masterRequest.id,
          parentRequestId: blockRequest.id,
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          storyboardBlockId,
          shotId,
          manifestHash,
          blockHash,
          shotHash,
          continuityPackHash: continuityPackHash || null,
          masterManifestArtifactKey,
        }
        const panel = {
          id: readText(panelMetadata.panelId) || `${shotId}_panel`,
          role: 'cinematic_v2_shot_keyframe',
          name: `${readText(effectiveShot.title) || `Shot ${Number(effectiveShot.index ?? 0) || shots.indexOf(shot) + 1}`} cropped panel keyframe`,
          assetKey: readText(panelArtifactRecord.asset_key),
          artifactKey: readText(panelArtifactRecord.key),
          mimeType: readText(panelArtifactRecord.mime_type),
          sourceSheetAssetKey: readText(panelMetadata.sourceSheetAssetKey),
          cropRect: panelMetadata.cropRect ?? panelMetadata.crop ?? null,
          storyboardBlockId,
          shotId,
          metadata: panelMetadata,
        }
        const shotContinuityAnchorIds = mergeAnchorIds(
          readStringArray(shot.continuityAnchorIds),
          readStringArray(shot.continuityAnchorRefIds),
          readStringArray(effectiveShot.continuityAnchorIds),
          readStringArray(effectiveShot.continuityAnchorRefIds),
          continuityAnchorIdsForScope(continuityAnchorSource, 'shotIds', shotId),
        )
        const shotAssetPack = assetPackWithContinuityAnchors(
          asRecord(manifest.assetPack),
          continuityAnchorSource,
          shotContinuityAnchorIds,
        )
        const graphResult = buildValidatedSequenceAnimaticTemplateGraph({
          registry: sequenceAnimaticCommandWorkflowTemplateRegistry,
          templateKey: sequenceAnimaticShotVideoTemplateKey,
          rawInput: {
            workflowId: crypto.randomUUID(),
            draftId: payload.draftId,
            commonConfig,
            block,
            shot: effectiveShot,
            panel,
            assetPack: shotAssetPack,
            editorialDurationSeconds,
            providerDurationSeconds,
            aspectRatio,
          },
        })
        const { nodes, edges } = graphResult.graph
        Object.assign(workflowPayload.metadata, {
          workflowTemplateKey: sequenceAnimaticShotVideoTemplateKey,
          workflowTemplateSourceHash: graphResult.sourceHash,
        })
        const requestPayload = {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            parent_request_id: blockRequest.id,
            requested_by: userId,
            source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
            prompt: `Generate a per-shot video take for ${readText(effectiveShot.title) || shotId}.`,
            title: `${blockRequest.title} / Shot ${Number(effectiveShot.index ?? 0) || shots.indexOf(shot) + 1}`,
            intent: 'output_generation',
            output_kind: 'cinematic_episode',
            status: 'awaiting_confirmation',
            selected_entity_keys: masterRequest.selectedEntityKeys,
            selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
            page_count: null,
            target_format: 'video',
            planner_notes: 'Per-shot sequence animatic video graph prepared from a cropped storyboard panel.',
            metadata: {
              graphSpecVersion: sequenceAnimaticGraphSpecVersion,
              screenplayAnimaticRole: 'shot_video',
              screenplayAnimaticSource,
              sequenceAnimaticRole: 'shot_video',
              parentRequestId: blockRequest.id,
              masterRequestId: masterRequest.id,
              storyboardBlockId,
              shotId,
              manifestHash,
              blockHash: sequenceAnimaticStableHash(block),
              shotHash,
              continuityPackHash: continuityPackHash || null,
              masterManifestArtifactKey,
              shotIndex: Number(shot.index ?? 0) || shots.indexOf(shot) + 1,
              sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
              sourceMasterWorkflowId: masterRequest.workflowId,
              sourceBlockWorkflowId: blockRequest.workflowId,
              panelAssetKey: readText(panelArtifactRecord.asset_key),
              editorialDurationSeconds,
              providerDurationSeconds,
              readyToRun: true,
              workflowTemplateKey: sequenceAnimaticShotVideoTemplateKey,
              workflowTemplateSourceHash: graphResult.sourceHash,
              createdFromManifestAt: now,
              shot: effectiveShot,
              sourceShotRevisionId: readText(revisionMetadata.revisionId) || null,
              sourceShotRevisionArtifactKey: readText(latestShotRevision?.key) || null,
            },
          }
        const ensured = await ensureMappedChildWorkflow({
          client: admin,
          projectId: payload.projectId,
          draftId: payload.draftId,
          parentRequestId: blockRequest.id,
          role: 'shot_video',
          identityKey: 'shotId',
          identityValue: shotId,
          workflow: workflowPayload,
          nodes,
          edges,
          request: requestPayload,
        })
        shotChild = ensured.request
        console.info('[GraphCore] sequence animatic shot ensure rpc completed.', {
          masterRequestId: masterRequest.id,
          blockRequestId: blockRequest.id,
          shotRequestId: shotChild.id,
          shotId,
          manifestHash,
          blockHash,
          shotHash,
          created: ensured.created,
          reused: ensured.reused,
        })
      }

      const allChildren = [
        ...await loadSequenceAnimaticChildrenForRoles({
          client,
          projectId: payload.projectId,
          draftId: payload.draftId,
          parentRequestId: masterRequest.id,
          roles: ['storyboard_block', 'continuity_pack', 'scene_board_prep'],
        }),
        ...await loadSequenceAnimaticChildrenForRoles({
          client,
          projectId: payload.projectId,
          draftId: payload.draftId,
          parentRequestId: blockRequest.id,
          roles: ['shot_video', 'shot_revision'],
        }),
      ]
      const [graphBundle, latestMasterRequest] = await Promise.all([
        loadChildWorkflowGraphBundle({
          client,
          workflowIds: allChildren.map((child) => child.workflowId),
        }),
        loadOutputRequestById({
          client,
          requestId: masterRequest.id,
          notFoundMessage: 'Failed to reload master request.',
        }),
      ])

      return sequenceAnimaticBlockWorkflowEnsureResponseSchema.parse({
        ok: true,
        masterRequest: latestMasterRequest,
        childRequests: allChildren,
        workflows: graphBundle.workflows,
        nodes: graphBundle.nodes,
        edges: graphBundle.edges,
      })
    }

    const childAccumulator = createChildWorkflowEnsureAccumulator(activeExistingChildren)
    const createdWorkflowIds = childAccumulator.workflowIds
    const childRequests = childAccumulator.requests
    const now = new Date().toISOString()
    for (const block of blocks) {
      const blockId = readText(block.id)
      if (!blockId || existingByBlockId.has(blockId)) continue
      const storyboardGroup = asRecord(block.storyboardGroup)
      const layout = asRecord(block.storyboardLayout)
      const rows = Math.max(1, Number(layout.rows ?? storyboardGroup.rows ?? 1) || 1)
      const columns = Math.max(1, Number(layout.columns ?? storyboardGroup.columns ?? 1) || 1)
      const panelCount = Math.max(1, Number(layout.panelCount ?? storyboardGroup.panelCount ?? readArray(block.shots).length) || 1)
      const aspectRatio = readText(asRecord(manifest.assetPack).aspectRatio) || '16:9'
      const imageSize = sequenceAnimaticStoryboardImageSize(columns, rows, aspectRatio)
      const blockHash = sequenceAnimaticStableHash(block)
      const storyboardSpatialReferencePack = storyboardSpatialReferencePackByBlockId.get(blockId)
        ?? buildStoryboardSpatialReferencePack({ block, manifests: storyboardSceneContinuityManifests })
      const storyboardContinuityMode = readText(storyboardSpatialReferencePack.status) || 'provisional'
      const storyboardContinuityBlockers = readStringArray(storyboardSpatialReferencePack.blockers)
      const storyboardSpatialReferenceAssetKeys = readStringArray(storyboardSpatialReferencePack.selectedReferenceAssetKeys)
      const workflowPayload = {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          key: `sequence_animatic_${slugify(masterRequest.id)}_${slugify(blockId)}_${manifestHash.slice(0, 8)}`,
          name: `${masterRequest.title} / Block ${Number(block.index ?? 0) || childRequests.length + 1}`,
          description: 'Sequence animatic storyboard block workflow.',
          preset: 'cinematic_episode_from_sequence',
          status: 'active',
          created_by: userId,
          metadata: {
            parentRequestId: masterRequest.id,
            graphSpecVersion: sequenceAnimaticGraphSpecVersion,
            screenplayAnimaticRole: 'storyboard_block',
            screenplayAnimaticSource,
            sequenceAnimaticRole: 'storyboard_block',
            storyboardBlockId: blockId,
            manifestHash,
            blockHash,
            continuityPackHash: continuityPackHash || null,
            masterManifestArtifactKey,
            storyboardSpatialReferencePackHash: readText(storyboardSpatialReferencePack.hash),
            storyboardContinuityMode,
            storyboardContinuityBlockers,
            storyboardSpatialReferenceAssetKeys,
            storyboardContinuityStaleable: storyboardSpatialReferencePack.staleable === true,
            staleable: storyboardSpatialReferencePack.staleable === true,
            sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
            sourceMasterWorkflowId: masterRequest.workflowId,
            readyToRun: true,
          },
        }

      const blockShotPlan = {
        ...asRecord(manifest.shotPlan),
        totalEditorialDurationSeconds: Number(block.durationSeconds ?? storyboardGroup.editorialDurationSeconds ?? 0) || readArray(block.shots).reduce((total, shot) => total + (Number(asRecord(shot).editorialDurationSeconds ?? 0) || 0), 0),
        shots: readArray(block.shots).map(asRecord),
      }
      const blockContinuityAnchorIds = mergeAnchorIds(
        readStringArray(block.continuityAnchorIds),
        continuityAnchorIdsForScope(continuityAnchorSource, 'storyboardBlockIds', blockId),
      )
      const blockAssetPack = assetPackWithContinuityAnchors(
        asRecord(manifest.assetPack),
        continuityAnchorSource,
        blockContinuityAnchorIds,
      )
      const blockAssetPackWithSpatialRefs = assetPackWithStoryboardSpatialReferences(blockAssetPack, storyboardSpatialReferencePack)
      const commonConfig = {
        cinematicPipelineVersion: 'v3_script_storyboards',
        graphSpecVersion: sequenceAnimaticGraphSpecVersion,
        screenplayAnimaticRole: 'storyboard_block',
        screenplayAnimaticSource,
        sequenceAnimaticRole: 'storyboard_block',
        parentRequestId: masterRequest.id,
        sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
        storyboardBlockId: blockId,
        manifestHash,
        blockHash,
        continuityPackHash: continuityPackHash || null,
        masterManifestArtifactKey,
        storyboardSpatialReferencePack,
        storyboardSpatialReferencePackHash: readText(storyboardSpatialReferencePack.hash),
        storyboardContinuityMode,
        storyboardContinuityBlockers,
        storyboardSpatialReferenceAssetKeys,
        storyboardContinuityStaleable: storyboardSpatialReferencePack.staleable === true,
      }
      const durationSeconds = Math.max(4, Math.min(15, Number(block.durationSeconds ?? storyboardGroup.providerDurationSeconds ?? 0) || 8))
      const graphResult = buildValidatedSequenceAnimaticTemplateGraph({
        registry: sequenceAnimaticCommandWorkflowTemplateRegistry,
        templateKey: sequenceAnimaticStoryboardBlocksTemplateKey,
        rawInput: {
          workflowId: crypto.randomUUID(),
          draftId: payload.draftId,
          commonConfig,
          block,
          manifestSummary: {
            title: readText(manifest.title) || masterRequest.title,
            screenplayMarkdown: readText(manifest.screenplayMarkdown),
          },
          shotPlan: blockShotPlan,
          storyboardGroup,
          storyboardLayout: { rows, columns, panelCount },
          assetPack: blockAssetPackWithSpatialRefs,
          storyboardSpatialReferencePack,
          aspectRatio,
          imageSize,
          durationSeconds,
        },
      })
      const { nodes, edges } = graphResult.graph
      Object.assign(workflowPayload.metadata, {
        workflowTemplateKey: sequenceAnimaticStoryboardBlocksTemplateKey,
        workflowTemplateSourceHash: graphResult.sourceHash,
      })
      const requestPayload = {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          parent_request_id: masterRequest.id,
          requested_by: userId,
          source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
          prompt: `${masterRequest.prompt}\n\nStoryboard block ${Number(block.index ?? 0) || childRequests.length + 1}: ${readText(block.title) || blockId}`,
          title: `${masterRequest.title} / Block ${Number(block.index ?? 0) || childRequests.length + 1}`,
          intent: 'output_generation',
          output_kind: 'cinematic_episode',
          status: 'awaiting_confirmation',
          selected_entity_keys: masterRequest.selectedEntityKeys,
          selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
          page_count: null,
          target_format: 'video',
          planner_notes: storyboardContinuityMode === 'ready'
            ? 'Storyboard block graph prepared with scene continuity spatial references.'
            : 'Storyboard block graph prepared provisionally; prepare Scene Board for stronger location continuity.',
          metadata: {
            graphSpecVersion: sequenceAnimaticGraphSpecVersion,
            screenplayAnimaticRole: 'storyboard_block',
            screenplayAnimaticSource,
            sequenceAnimaticRole: 'storyboard_block',
            parentRequestId: masterRequest.id,
            storyboardBlockId: blockId,
            storyboardBlockIndex: Number(block.index ?? 0) || childRequests.length + 1,
            manifestHash,
            blockHash,
            continuityPackHash: continuityPackHash || null,
            masterManifestArtifactKey,
            storyboardSpatialReferencePackHash: readText(storyboardSpatialReferencePack.hash),
            storyboardContinuityMode,
            storyboardContinuityBlockers,
            storyboardSpatialReferenceAssetKeys,
            storyboardContinuityStaleable: storyboardSpatialReferencePack.staleable === true,
            staleable: storyboardSpatialReferencePack.staleable === true,
            sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
            sourceMasterWorkflowId: masterRequest.workflowId,
            readyToRun: true,
            workflowTemplateKey: sequenceAnimaticStoryboardBlocksTemplateKey,
            workflowTemplateSourceHash: graphResult.sourceHash,
            createdFromManifestAt: now,
            block,
          },
        }
      const ensured = await ensureMappedChildWorkflow({
        client: admin,
        projectId: payload.projectId,
        draftId: payload.draftId,
        parentRequestId: masterRequest.id,
        role: 'storyboard_block',
        identityKey: 'storyboardBlockId',
        identityValue: blockId,
        workflow: workflowPayload,
        nodes,
        edges,
        request: requestPayload,
      })
      const child = appendEnsuredChildWorkflow(childAccumulator, ensured)
      console.info('[GraphCore] sequence animatic storyboard block ensure rpc completed.', {
        masterRequestId: masterRequest.id,
        blockRequestId: child.id,
        storyboardBlockId: blockId,
        manifestHash,
        blockHash,
        created: ensured.created,
        reused: ensured.reused,
      })
    }

    if (createdWorkflowIds.length > 0) {
      await client
        .from('output_requests')
        .update({
          metadata: {
            ...masterMetadata,
            screenplayAnimaticRole: 'master',
            screenplayAnimaticSource,
            sequenceAnimaticRole: 'master',
            childBlockRequestIds: childRequests.map((child) => child.id),
            childBlockWorkflowIds: childRequests.map((child) => child.workflowId).filter(Boolean),
            blockWorkflowsEnsuredAt: now,
          },
        })
        .eq('id', masterRequest.id)
      await client.rpc('refresh_output_request_status_projection', { p_request_id: masterRequest.id })
    }

    const [graphBundle, latestMasterRequest] = await Promise.all([
      loadChildWorkflowGraphBundle({
        client,
        workflowIds: childRequests.map((child) => child.workflowId),
      }),
      loadOutputRequestById({
        client,
        requestId: masterRequest.id,
        notFoundMessage: 'Failed to reload master request.',
      }),
    ])

    return sequenceAnimaticBlockWorkflowEnsureResponseSchema.parse({
      ok: true,
      masterRequest: latestMasterRequest,
      childRequests,
      workflows: graphBundle.workflows,
      nodes: graphBundle.nodes,
      edges: graphBundle.edges,
    })
}
