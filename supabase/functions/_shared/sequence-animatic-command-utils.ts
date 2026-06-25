import { HttpError } from './http.ts'
import {
  mapOutputRequestRow,
  outputRequestSelect,
} from './output-workflow.ts'
import {
  type AnyWorkflowTemplateRegistryEntry,
} from '../../../src/domain/outputWorkflowTemplateRegistry.ts'
import {
  buildValidatedOutputWorkflowTemplateGraph,
  type OutputRequest,
  type WorkflowTemplateGraphRows,
} from '../../../src/domain/outputWorkflow.ts'
import { sequenceAnimaticStableHash } from './sequence-animatic-workflow-factory.ts'

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

export function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

export function uniqueTexts(values: Iterable<string>) {
  return [...new Set([...values].map(readText).filter(Boolean))]
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'output'
}

export function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

export function readScreenplayAnimaticSource(
  metadata: Record<string, unknown>,
  fallback: 'wiki_sequence_unit' | 'prompt_cinematic' = 'wiki_sequence_unit',
) {
  const source = readText(metadata.screenplayAnimaticSource)
  return source === 'prompt_cinematic' || source === 'wiki_sequence_unit' ? source : fallback
}

export function artifactMetadataRecord(
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

export function imageFromArtifact(artifact: Record<string, unknown> | null) {
  if (!artifact) return {}
  const metadata = asRecord(artifact.metadata)
  const image = asRecord(metadata.image)
  const assetKey = readText(metadata.assetKey) || readText(artifact.asset_key) || readText(image.assetKey)
  if (!assetKey) return {}
  return {
    ...image,
    assetKey,
    asset_key: assetKey,
    artifactKey: readText(artifact.key),
    artifact_key: readText(artifact.key),
    storagePath: readText(image.storagePath ?? image.storage_path) || readText(metadata.storagePath ?? metadata.storage_path),
    storage_path: readText(image.storagePath ?? image.storage_path) || readText(metadata.storagePath ?? metadata.storage_path),
    shotId: readText(metadata.shotId ?? metadata.shot_id) || readText(image.shotId ?? image.shot_id),
    shot_id: readText(metadata.shotId ?? metadata.shot_id) || readText(image.shotId ?? image.shot_id),
    role: readText(metadata.role),
  }
}

export function normalizeSequenceAnimaticShotContinuityOptions(value: unknown) {
  const options = asRecord(value)
  return {
    includePreviousKeyframeGrid: options.includePreviousKeyframeGrid !== false
      && options.include_previous_keyframe_grid !== false,
    include_previous_keyframe_grid: options.includePreviousKeyframeGrid !== false
      && options.include_previous_keyframe_grid !== false,
  }
}

function sceneIdFromScopedId(value: unknown, kind: 'shot' | 'block') {
  const text = readText(value)
  const pattern = kind === 'shot' ? /^(scene_\d+)_shot_\d+$/i : /^(scene_\d+)_block_\d+$/i
  return pattern.exec(text)?.[1] ?? ''
}

function sceneIdFromSetupId(value: unknown) {
  return /^(scene_\d+)_/.exec(readText(value))?.[1] ?? ''
}

function usableSceneId(value: unknown) {
  const text = readText(value)
  return text && text !== 'sequence_animatic_master' ? text : ''
}

function sceneScopedPlanId(sceneId: string, value: unknown, kind: 'shot' | 'block') {
  const text = readText(value)
  if (!sceneId || !text) return text
  if (text.startsWith(`${sceneId}_`)) return text
  if (kind === 'shot' && /^shot_\d+$/i.test(text)) return `${sceneId}_${text}`
  if (kind === 'block' && /^block_\d+$/i.test(text)) return `${sceneId}_${text}`
  return text
}

function sceneIdFromPlanEntry(entry: Record<string, unknown>, kind: 'shot' | 'block', fallbackSceneId = '') {
  return usableSceneId(entry.sourceSceneId ?? entry.source_scene_id)
    || usableSceneId(entry.sceneId ?? entry.scene_id)
    || sceneIdFromScopedId(entry.id, kind)
    || sceneIdFromScopedId(entry.shotId ?? entry.shot_id, 'shot')
    || sceneIdFromScopedId(entry.blockId ?? entry.block_id ?? entry.storyboardBlockId ?? entry.storyboard_block_id, 'block')
    || sceneIdFromSetupId(entry.coverageSetupId ?? entry.coverage_setup_id ?? entry.setupId ?? entry.setup_id)
    || fallbackSceneId
}

function normalizeSceneScopedLinkIds(sceneId: string, value: unknown) {
  const link = asRecord(value)
  if (Object.keys(link).length === 0) return link
  return {
    ...link,
    fromShotId: sceneScopedPlanId(sceneId, link.fromShotId ?? link.from_shot_id, 'shot'),
    from_shot_id: sceneScopedPlanId(sceneId, link.from_shot_id ?? link.fromShotId, 'shot'),
  }
}

function normalizeSceneScopedShot(shot: Record<string, unknown>, fallbackSceneId = '') {
  const sceneId = sceneIdFromPlanEntry(shot, 'shot', readText(fallbackSceneId))
  const shotId = sceneScopedPlanId(sceneId, shot.id ?? shot.shotId ?? shot.shot_id, 'shot')
  const blockId = sceneScopedPlanId(sceneId, shot.blockId ?? shot.block_id ?? shot.storyboardBlockId ?? shot.storyboard_block_id, 'block')
  const explicitSceneId = usableSceneId(shot.sceneId ?? shot.scene_id)
  const sourceSceneId = usableSceneId(shot.sourceSceneId ?? shot.source_scene_id) || sceneId
  return {
    ...shot,
    id: shotId,
    shotId,
    shot_id: shotId,
    sceneId: explicitSceneId || sourceSceneId || sceneId,
    scene_id: explicitSceneId || sourceSceneId || sceneId,
    sourceSceneId,
    source_scene_id: sourceSceneId,
    blockId,
    block_id: blockId,
    storyboardBlockId: sceneScopedPlanId(sceneId, shot.storyboardBlockId ?? shot.storyboard_block_id ?? blockId, 'block'),
    storyboard_block_id: sceneScopedPlanId(sceneId, shot.storyboard_block_id ?? shot.storyboardBlockId ?? blockId, 'block'),
    previousShotId: sceneScopedPlanId(sceneId, shot.previousShotId ?? shot.previous_shot_id, 'shot'),
    previous_shot_id: sceneScopedPlanId(sceneId, shot.previous_shot_id ?? shot.previousShotId, 'shot'),
    continuityLink: normalizeSceneScopedLinkIds(sceneId, shot.continuityLink ?? shot.continuity_link),
    continuity_link: normalizeSceneScopedLinkIds(sceneId, shot.continuity_link ?? shot.continuityLink),
  }
}

function normalizeSceneScopedBlock(block: Record<string, unknown>, fallbackSceneId = '') {
  const firstShot = asRecord(readArray(block.shots)[0])
  const sceneId = sceneIdFromPlanEntry(block, 'block', sceneIdFromPlanEntry(firstShot, 'shot', fallbackSceneId))
  const blockId = sceneScopedPlanId(sceneId, block.id ?? block.blockId ?? block.block_id, 'block')
  const shots = readArray(block.shots).map(asRecord).map((shot) => normalizeSceneScopedShot({ ...shot, blockId }, sceneId))
  const shotIds = readArray(block.shotIds ?? block.shot_ids)
    .map((shotId) => sceneScopedPlanId(sceneId, shotId, 'shot'))
    .filter(Boolean)
  return {
    ...block,
    id: blockId,
    blockId,
    block_id: blockId,
    sceneId: usableSceneId(block.sceneId ?? block.scene_id) || sceneId,
    scene_id: usableSceneId(block.scene_id ?? block.sceneId) || sceneId,
    sourceSceneId: usableSceneId(block.sourceSceneId ?? block.source_scene_id) || sceneId,
    source_scene_id: usableSceneId(block.source_scene_id ?? block.sourceSceneId) || sceneId,
    shots,
    shotIds: shotIds.length > 0 ? shotIds : shots.map((shot) => readText(shot.id)).filter(Boolean),
    shot_ids: shotIds.length > 0 ? shotIds : shots.map((shot) => readText(shot.id)).filter(Boolean),
  }
}

function normalizeSceneScopedShotIdArrays(entry: Record<string, unknown>, fallbackSceneId = '') {
  const sceneId = sceneIdFromPlanEntry(entry, 'shot', fallbackSceneId)
  return {
    ...entry,
    sceneId: usableSceneId(entry.sceneId ?? entry.scene_id) || sceneId,
    scene_id: usableSceneId(entry.scene_id ?? entry.sceneId) || sceneId,
    sourceSceneId: usableSceneId(entry.sourceSceneId ?? entry.source_scene_id) || sceneId,
    source_scene_id: usableSceneId(entry.source_scene_id ?? entry.sourceSceneId) || sceneId,
    shotId: sceneScopedPlanId(sceneId, entry.shotId ?? entry.shot_id, 'shot'),
    shot_id: sceneScopedPlanId(sceneId, entry.shot_id ?? entry.shotId, 'shot'),
    shotIds: readArray(entry.shotIds ?? entry.shot_ids).map((shotId) => sceneScopedPlanId(sceneId, shotId, 'shot')).filter(Boolean),
    shot_ids: readArray(entry.shot_ids ?? entry.shotIds).map((shotId) => sceneScopedPlanId(sceneId, shotId, 'shot')).filter(Boolean),
    blockId: sceneScopedPlanId(sceneId, entry.blockId ?? entry.block_id ?? entry.storyboardBlockId ?? entry.storyboard_block_id, 'block'),
    block_id: sceneScopedPlanId(sceneId, entry.block_id ?? entry.blockId ?? entry.storyboardBlockId ?? entry.storyboard_block_id, 'block'),
    storyboardBlockId: sceneScopedPlanId(sceneId, entry.storyboardBlockId ?? entry.storyboard_block_id ?? entry.blockId ?? entry.block_id, 'block'),
    storyboard_block_id: sceneScopedPlanId(sceneId, entry.storyboard_block_id ?? entry.storyboardBlockId ?? entry.blockId ?? entry.block_id, 'block'),
  }
}

export function canonicalizeSequenceAnimaticSceneScopedPlanIds(input: {
  manifest: Record<string, unknown>
  directorPlan: Record<string, unknown>
}) {
  const manifest = asRecord(input.manifest)
  const directorPlan = asRecord(input.directorPlan)
  const blocks = readArray(manifest.blocks).map(asRecord).map((block) => normalizeSceneScopedBlock(block))
  const blockSceneById = new Map(blocks.map((block) => [readText(block.id), readText(block.sourceSceneId ?? block.sceneId)] as const).filter(([id]) => id))
  const normalizeShotWithKnownBlock = (shot: Record<string, unknown>) => {
    const blockId = readText(shot.blockId ?? shot.block_id ?? shot.storyboardBlockId ?? shot.storyboard_block_id)
    return normalizeSceneScopedShot(shot, blockSceneById.get(blockId) ?? '')
  }
  const directorShots = readArray(directorPlan.shots).map(asRecord).map(normalizeShotWithKnownBlock)
  const coverageSetups = readArray(directorPlan.coverageSetups ?? directorPlan.coverage_setups)
    .map(asRecord)
    .map((setup) => normalizeSceneScopedShotIdArrays(setup))
  const localReferences = readArray(directorPlan.localReferences ?? directorPlan.outputLocalReferences)
    .map(asRecord)
    .map((reference) => normalizeSceneScopedShotIdArrays(reference))
  const shotBindings = Object.fromEntries(Object.entries(asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings))
    .map(([shotId, binding]) => {
      const entry = normalizeSceneScopedShotIdArrays({ ...asRecord(binding), shotId })
      return [readText(entry.shotId) || shotId, entry]
    }))
  const shotPlan = {
    ...asRecord(manifest.shotPlan ?? manifest.shot_plan),
    shots: readArray(asRecord(manifest.shotPlan ?? manifest.shot_plan).shots)
      .map(asRecord)
      .map(normalizeShotWithKnownBlock),
  }
  return {
    manifest: {
      ...manifest,
      blocks,
      shotPlan,
      shot_plan: shotPlan,
    },
    directorPlan: {
      ...directorPlan,
      shots: directorShots,
      coverageSetups,
      coverage_setups: coverageSetups,
      localReferences,
      outputLocalReferences: localReferences,
      shotBindings,
      shot_bindings: shotBindings,
    },
  }
}

function sequenceAnimaticSceneIdFromShot(input: {
  shotId: string
  shot?: Record<string, unknown>
  job?: Record<string, unknown>
}) {
  const shotIdScene = /^(.+)_shot_\d+/.exec(input.shotId)?.[1] || ''
  const explicitSceneId = readText(input.job?.sceneId ?? input.job?.scene_id)
    || readText(input.shot?.sceneId ?? input.shot?.scene_id)
  const usableExplicitSceneId = explicitSceneId && explicitSceneId !== 'sequence_animatic_master'
    ? explicitSceneId
    : ''
  return usableExplicitSceneId
    || shotIdScene
    || readText(input.shot?.sceneKey ?? input.shot?.scene_key)
    || readText(input.shot?.storySceneId ?? input.shot?.story_scene_id)
    || ''
}

function sequenceAnimaticShotActionCaption(shot: Record<string, unknown>, job: Record<string, unknown>) {
  return readText(shot.action)
    || readText(shot.description)
    || readText(shot.storyboardPanelPrompt ?? shot.storyboard_panel_prompt)
    || readText(job.action)
    || readText(job.description)
    || readText(shot.title)
    || readText(job.title)
    || 'Previous shot keyframe.'
}

export function buildSequenceAnimaticPreviousKeyframeGridContext(input: {
  shotId: string
  shotKeyframeJobs: readonly Record<string, unknown>[]
  shotKeyframeImageByShotId: ReadonlyMap<string, Record<string, unknown>>
  shotContinuityOptions?: Record<string, unknown> | null
  maxShots?: number
}) {
  const shotId = readText(input.shotId)
  const options = normalizeSequenceAnimaticShotContinuityOptions(input.shotContinuityOptions)
  const includePreviousKeyframeGrid = options.includePreviousKeyframeGrid
  const jobs = input.shotKeyframeJobs.map(asRecord)
  const activeIndex = jobs.findIndex((job) => readText(job.shotId ?? job.shot_id ?? asRecord(job.shot).id) === shotId)
  const activeJob = activeIndex >= 0 ? jobs[activeIndex] ?? {} : {}
  const activeShot = asRecord(activeJob.shot)
  const sceneId = sequenceAnimaticSceneIdFromShot({ shotId, shot: activeShot, job: activeJob })
  const maxShots = Math.max(1, Math.min(6, Number(input.maxShots ?? 6) || 6))
  const selected = includePreviousKeyframeGrid && activeIndex > 0
    ? jobs
      .slice(0, activeIndex)
      .map((job, index) => {
        const previousShot = asRecord(job.shot)
        const previousShotId = readText(job.shotId ?? job.shot_id ?? previousShot.id)
        const previousSceneId = sequenceAnimaticSceneIdFromShot({ shotId: previousShotId, shot: previousShot, job })
        const image = previousShotId ? asRecord(input.shotKeyframeImageByShotId.get(previousShotId)) : {}
        const assetKey = readText(image.assetKey ?? image.asset_key)
        return {
          shotId: previousShotId,
          shot_id: previousShotId,
          sceneId: previousSceneId,
          scene_id: previousSceneId,
          index,
          assetKey,
          asset_key: assetKey,
          storagePath: readText(image.storagePath ?? image.storage_path),
          storage_path: readText(image.storagePath ?? image.storage_path),
          artifactKey: readText(image.artifactKey ?? image.artifact_key),
          artifact_key: readText(image.artifactKey ?? image.artifact_key),
          title: readText(previousShot.title ?? job.title),
          action: sequenceAnimaticShotActionCaption(previousShot, job),
        }
      })
      .filter((entry) => entry.sceneId === sceneId && readText(entry.assetKey))
      .slice(-maxShots)
      .map((entry, index) => ({
        ...entry,
        order: index + 1,
        order_index: index + 1,
      }))
    : []
  const referenceAssetKeys = selected.map((entry) => entry.assetKey).filter(Boolean)
  const skippedReason = !includePreviousKeyframeGrid
    ? 'disabled'
    : selected.length === 0
      ? 'no_prior_ready_scene_keyframes'
      : ''
  const sourceHash = sequenceAnimaticStableHash({
    version: 'sequence_animatic_previous_keyframe_grid_context_v1',
    shotId,
    sceneId,
    includePreviousKeyframeGrid,
    previous: selected.map((entry) => ({
      shotId: entry.shotId,
      assetKey: entry.assetKey,
      action: entry.action,
      order: entry.order,
    })),
  })
  return {
    version: 'sequence_animatic_previous_keyframe_grid_context_v1',
    enabled: includePreviousKeyframeGrid && selected.length > 0,
    includePreviousKeyframeGrid,
    include_previous_keyframe_grid: includePreviousKeyframeGrid,
    skippedReason,
    skipped_reason: skippedReason,
    shotId,
    shot_id: shotId,
    sceneId,
    scene_id: sceneId,
    selectedPriorKeyframes: selected,
    selected_prior_keyframes: selected,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    sourceHash,
    source_hash: sourceHash,
  }
}

export function assetEntityForKey(assetKey: string, label: string) {
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

export function entityAssetKeys(entity: Record<string, unknown>) {
  const metadata = asRecord(entity.metadata)
  return uniqueTexts([
    readText(entity.primaryAssetKey),
    readText(entity.primary_asset_key),
    readText(entity.selectedReferenceAssetKey),
    readText(entity.selected_reference_asset_key),
    readText(entity.selectedReferenceVariantAssetKey),
    readText(entity.selected_reference_variant_asset_key),
    readText(metadata.referenceSheetAssetKey),
    readText(metadata.reference_sheet_asset_key),
    readStringArray(metadata.referenceSheetAssetKeys)[0] ?? '',
    readText(entity.thumbnailAssetKey),
    readText(entity.thumbnail_asset_key),
    ...readStringArray(entity.assetKeys),
    ...readStringArray(entity.asset_keys),
  ])
}

export function preferredEntityAssetKey(entity: Record<string, unknown>) {
  return entityAssetKeys(entity)[0] ?? ''
}

function entityAssetUrl(entity: Record<string, unknown>) {
  const metadata = asRecord(entity.metadata)
  return readText(entity.assetUrl)
    || readText(entity.asset_url)
    || readText(entity.imageUrl)
    || readText(entity.image_url)
    || readText(entity.referenceArtUrl)
    || readText(entity.reference_art_url)
    || readText(entity.iconUrl)
    || readText(entity.icon_url)
    || readText(entity.selectedReferenceAssetUrl)
    || readText(entity.selected_reference_asset_url)
    || readText(metadata.referenceSheetUrl)
    || readText(metadata.reference_sheet_url)
    || readText(metadata.thumbnailUrl)
    || readText(metadata.thumbnail_url)
}

export function buildValidatedSequenceAnimaticTemplateGraph<TGraph extends WorkflowTemplateGraphRows>(input: {
  registry: Map<string, AnyWorkflowTemplateRegistryEntry>
  templateKey: string
  rawInput: unknown
}) {
  const graphResult = buildValidatedOutputWorkflowTemplateGraph<TGraph>({
    registry: input.registry,
    templateKey: input.templateKey,
    rawInput: input.rawInput,
  })
  if (!graphResult.ok || !graphResult.graph) {
    throw new HttpError(400, graphResult.diagnostics.join(' '))
  }
  return graphResult
}

export function prioritizedEntityAssetKeys(entities: readonly Record<string, unknown>[], limit = 8) {
  const primaryKeys = uniqueTexts(entities.map(preferredEntityAssetKey))
  const extraKeys = uniqueTexts(entities.flatMap(entityAssetKeys).filter((assetKey) => !primaryKeys.includes(assetKey)))
  return uniqueTexts([...primaryKeys, ...extraKeys]).slice(0, Math.max(1, limit))
}

export function referenceSheetAssetKeyFromWorldEntity(entity: Record<string, unknown>) {
  const metadata = asRecord(entity.metadata)
  return readText(metadata.referenceSheetAssetKey)
    || readText(metadata.reference_sheet_asset_key)
    || readStringArray(metadata.referenceSheetAssetKeys)[0]
    || readStringArray(metadata.reference_sheet_asset_keys)[0]
    || readText(entity.thumbnailAssetKey)
    || readText(entity.thumbnail_asset_key)
    || ''
}

export function worldEntityAssetPackEntity(entity: Record<string, unknown>) {
  const key = readText(entity.key)
  const assetKey = referenceSheetAssetKeyFromWorldEntity(entity)
  return {
    key,
    id: key,
    name: readText(entity.name) || key,
    type: readText(entity.nodeType) || readText(entity.node_type) || 'actor',
    nodeType: readText(entity.nodeType) || readText(entity.node_type) || 'actor',
    node_type: readText(entity.nodeType) || readText(entity.node_type) || 'actor',
    primaryAssetKey: assetKey,
    primary_asset_key: assetKey,
    selectedReferenceAssetKey: assetKey,
    selected_reference_asset_key: assetKey,
    selectedReferenceVariantKey: assetKey ? 'entity_reference_sheet' : '',
    selected_reference_variant_key: assetKey ? 'entity_reference_sheet' : '',
    assetKeys: assetKey ? [assetKey] : [],
    asset_keys: assetKey ? [assetKey] : [],
    metadata: asRecord(entity.metadata),
  }
}

export function assetPackWithShotWorldRefs(input: {
  assetPack: Record<string, unknown>
  shot: Record<string, unknown>
  worldEntityByKey: ReadonlyMap<string, Record<string, unknown>>
}) {
  const entitiesByKey = new Map<string, Record<string, unknown>>()
  const addEntity = (entity: Record<string, unknown>) => {
    const key = readText(entity.key) || readText(entity.id)
    if (!key) return
    const previous = entitiesByKey.get(key)
    if (!previous) {
      entitiesByKey.set(key, entity)
      return
    }
    const previousAssetKey = preferredEntityAssetKey(previous)
    const nextAssetKey = preferredEntityAssetKey(entity)
    entitiesByKey.set(key, previousAssetKey || !nextAssetKey ? { ...entity, ...previous } : { ...previous, ...entity })
  }
  readArray(input.assetPack.entities).map(asRecord).forEach(addEntity)
  for (const refId of shotEntityRefIds(input.shot)) {
    const entity = input.worldEntityByKey.get(refId)
    if (entity) addEntity(worldEntityAssetPackEntity(entity))
  }
  return {
    ...input.assetPack,
    entities: [...entitiesByKey.values()],
  }
}

function referenceFixKindFromEntity(entity: Record<string, unknown>) {
  const type = readText(entity.type ?? entity.nodeType ?? entity.node_type).toLowerCase()
  if (type.includes('location') || type.includes('place') || type.includes('set') || type.includes('zone') || type.includes('spot')) return ''
  if (type.includes('group') || type.includes('faction') || type.includes('crowd')) return 'faction_group'
  if (type.includes('item') || type.includes('prop') || type.includes('object')) return 'item_or_prop'
  return 'world_character'
}

function referenceFixKindFromContinuityTarget(target: Record<string, unknown>) {
  const kind = readText(target.assetKind ?? target.asset_kind ?? target.nodeKind ?? target.node_kind ?? target.kind).toLowerCase()
  if (kind.includes('location') || kind.includes('set') || kind.includes('zone') || kind.includes('spot') || kind.includes('coverage')) return ''
  if (kind.includes('group') || kind.includes('faction') || kind.includes('crowd')) return 'faction_group'
  if (kind.includes('item') || kind.includes('prop') || kind.includes('object')) return 'item_or_prop'
  if (kind.includes('character') || kind.includes('person') || kind.includes('actor')) return 'temp_character'
  return ''
}

function compactReferenceFixText(value: unknown, maxLength = 420) {
  const text = readText(value).replace(/\s+/g, ' ')
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text
}

function referenceFixAliases(record: Record<string, unknown>) {
  return uniqueTexts([
    ...readStringArray(record.aliases),
    ...readStringArray(record.alias_keys),
    ...readStringArray(record.aliasKeys),
    ...readStringArray(asRecord(record.metadata).aliases),
    ...readStringArray(asRecord(record.metadata).aliasKeys),
    readText(record.key),
    readText(record.id),
    readText(record.name),
    readText(record.title),
    readText(record.label),
  ])
}

export function buildSequenceAnimaticShotReferenceFixCandidatePool(input: {
  assetPack: Record<string, unknown>
  continuityTargets?: readonly Record<string, unknown>[]
  currentReferences?: readonly Record<string, unknown>[]
  limit?: number
}) {
  const limit = Math.max(8, Math.min(80, Number(input.limit ?? 48) || 48))
  const byCandidateId = new Map<string, Record<string, unknown>>()
  const add = (candidate: Record<string, unknown>) => {
    const candidateId = readText(candidate.candidateId ?? candidate.candidate_id)
    const assetKey = readText(candidate.assetKey ?? candidate.asset_key)
    if (!candidateId || !assetKey || byCandidateId.has(candidateId)) return
    byCandidateId.set(candidateId, candidate)
  }
  for (const entity of readArray(input.assetPack.entities).map(asRecord)) {
    const kind = referenceFixKindFromEntity(entity)
    if (!kind) continue
    const assetKey = preferredEntityAssetKey(entity)
    if (!assetKey) continue
    const entityKey = readText(entity.key) || readText(entity.id)
    const name = readText(entity.name ?? entity.title ?? entity.label) || entityKey
    const assetUrl = entityAssetUrl(entity)
    add({
      candidateId: `world:${entityKey || slugify(name)}:${assetKey}`,
      candidate_id: `world:${entityKey || slugify(name)}:${assetKey}`,
      source: 'world_reference',
      kind,
      role: kind === 'item_or_prop' ? 'item_or_prop_reference' : 'world_character_reference',
      name,
      nodeId: entityKey,
      node_id: entityKey,
      entityKey,
      entity_key: entityKey,
      assetKey,
      asset_key: assetKey,
      assetUrl,
      asset_url: assetUrl,
      aliases: referenceFixAliases(entity),
      summary: compactReferenceFixText(entity.summary ?? entity.context ?? asRecord(entity.metadata).summary),
      visualDescription: compactReferenceFixText(entity.visualDescription ?? entity.visual_description ?? asRecord(asRecord(entity.metadata).visual).description ?? asRecord(entity.metadata).visualDescription),
    })
  }
  for (const target of input.continuityTargets ?? []) {
    const kind = referenceFixKindFromContinuityTarget(target)
    if (!kind) continue
    const assetKey = readText(target.assetKey ?? target.asset_key ?? target.lastGeneratedAssetKey ?? target.last_generated_asset_key)
    if (!assetKey) continue
    const nodeId = readText(target.nodeId ?? target.node_id ?? target.id)
    const name = readText(target.name ?? target.label ?? target.title) || nodeId
    const assetUrl = readText(target.assetUrl)
      || readText(target.asset_url)
      || readText(target.imageUrl)
      || readText(target.image_url)
      || readText(target.referenceArtUrl)
      || readText(target.reference_art_url)
      || readText(target.iconUrl)
      || readText(target.icon_url)
    add({
      candidateId: `animatic:${nodeId || slugify(name)}:${assetKey}`,
      candidate_id: `animatic:${nodeId || slugify(name)}:${assetKey}`,
      source: 'animatic_reference',
      kind,
      role: kind === 'temp_character' || kind === 'faction_group' ? 'temp_character_reference' : 'item_or_prop_reference',
      name,
      nodeId,
      node_id: nodeId,
      entityKey: nodeId,
      entity_key: nodeId,
      assetKey,
      asset_key: assetKey,
      assetUrl,
      asset_url: assetUrl,
      aliases: referenceFixAliases(target),
      summary: compactReferenceFixText(target.summary ?? target.visualBrief ?? target.visual_brief),
      visualDescription: compactReferenceFixText(target.visualDescription ?? target.visual_description ?? target.effectiveVisualBrief ?? target.effective_visual_brief),
    })
  }
  const current = (input.currentReferences ?? []).map(asRecord).map((entry, index) => ({
    candidateId: readText(entry.candidateId ?? entry.candidate_id) || `current:${readText(entry.assetKey ?? entry.asset_key) || index}`,
    candidate_id: readText(entry.candidateId ?? entry.candidate_id) || `current:${readText(entry.assetKey ?? entry.asset_key) || index}`,
    source: readText(entry.source) || 'current_reference',
    kind: readText(entry.kind),
    role: readText(entry.role),
    name: readText(entry.name),
    nodeId: readText(entry.nodeId ?? entry.node_id),
    node_id: readText(entry.nodeId ?? entry.node_id),
    entityKey: readText(entry.entityKey ?? entry.entity_key),
    entity_key: readText(entry.entityKey ?? entry.entity_key),
    assetKey: readText(entry.assetKey ?? entry.asset_key),
    asset_key: readText(entry.assetKey ?? entry.asset_key),
    assetUrl: readText(entry.assetUrl ?? entry.asset_url ?? entry.imageUrl ?? entry.image_url ?? entry.referenceArtUrl ?? entry.reference_art_url ?? entry.iconUrl ?? entry.icon_url),
    asset_url: readText(entry.assetUrl ?? entry.asset_url ?? entry.imageUrl ?? entry.image_url ?? entry.referenceArtUrl ?? entry.reference_art_url ?? entry.iconUrl ?? entry.icon_url),
    uiOrder: Number(entry.uiOrder ?? entry.ui_order ?? index) || index,
  }))
  return {
    version: 'sequence_animatic_shot_reference_fix_candidate_pool_v1',
    candidates: [...byCandidateId.values()].slice(0, limit),
    currentReferences: current,
    current_references: current,
  }
}

export function shotEntityRefIds(shot: Record<string, unknown>) {
  const refs = asRecord(shot.refs ?? shot.references)
  const referenceObjectIds = readArray(shot.references).flatMap((entry) => {
    if (typeof entry === 'string') return [entry]
    const record = asRecord(entry)
    return [
      readText(record.id),
      readText(record.refId ?? record.ref_id),
      readText(record.referenceId ?? record.reference_id),
      readText(record.entityKey ?? record.entity_key),
      readText(record.entityRefId ?? record.entity_ref_id),
      readText(record.worldRefId ?? record.world_ref_id),
      readText(record.worldEntityKey ?? record.world_entity_key),
      readText(record.characterRefId ?? record.character_ref_id),
      readText(record.speakerRefId ?? record.speaker_ref_id),
      readText(record.propRefId ?? record.prop_ref_id),
      readText(record.itemRefId ?? record.item_ref_id),
    ]
  })
  return uniqueTexts([
    ...readStringArray(refs.referenceIds ?? refs.reference_ids),
    ...readStringArray(refs.refIds ?? refs.ref_ids),
    ...readStringArray(refs.entityRefIds ?? refs.entity_ref_ids),
    ...readStringArray(refs.worldRefIds ?? refs.world_ref_ids),
    ...readStringArray(refs.worldEntityKeys ?? refs.world_entity_keys),
    ...readStringArray(refs.characterRefIds ?? refs.character_ref_ids),
    ...readStringArray(refs.worldCharacterRefIds ?? refs.world_character_ref_ids),
    ...readStringArray(refs.visibleCharacterRefIds ?? refs.visible_character_ref_ids),
    ...readStringArray(refs.speakerRefIds ?? refs.speaker_ref_ids),
    ...readStringArray(refs.propRefIds ?? refs.prop_ref_ids),
    ...readStringArray(refs.itemRefIds ?? refs.item_ref_ids),
    ...readStringArray(refs.localReferenceIds ?? refs.local_reference_ids),
    ...readStringArray(refs.locationRefIds ?? refs.location_ref_ids),
    ...readStringArray(shot.referenceIds ?? shot.reference_ids),
    ...readStringArray(shot.refIds ?? shot.ref_ids),
    ...readStringArray(shot.entityRefIds ?? shot.entity_ref_ids),
    ...readStringArray(shot.worldRefIds ?? shot.world_ref_ids),
    ...readStringArray(shot.worldEntityKeys ?? shot.world_entity_keys),
    ...readStringArray(shot.characterRefIds ?? shot.character_ref_ids),
    ...readStringArray(shot.worldCharacterRefIds ?? shot.world_character_ref_ids),
    ...readStringArray(shot.visibleCharacterRefIds ?? shot.visible_character_ref_ids),
    ...readStringArray(shot.speakerRefIds ?? shot.speaker_ref_ids),
    ...readStringArray(shot.propRefIds ?? shot.prop_ref_ids),
    ...readStringArray(shot.itemRefIds ?? shot.item_ref_ids),
    ...readStringArray(shot.localReferenceIds ?? shot.local_reference_ids),
    ...readStringArray(shot.locationRefIds ?? shot.location_ref_ids),
    ...referenceObjectIds,
    ...readArray(shot.dialogue).flatMap((line) => {
      const record = asRecord(line)
      return [
        readText(record.speakerRefId ?? record.speaker_ref_id),
        readText(record.characterRefId ?? record.character_ref_id),
        readText(record.entityRefId ?? record.entity_ref_id),
        readText(record.worldRefId ?? record.world_ref_id),
      ]
    }),
    ...readArray(shot.performanceBeats ?? shot.performance_beats).flatMap((beat) => {
      const record = asRecord(beat)
      return [
        readText(record.characterRefId ?? record.character_ref_id),
        readText(record.speakerRefId ?? record.speaker_ref_id),
        readText(record.entityRefId ?? record.entity_ref_id),
        readText(record.worldRefId ?? record.world_ref_id),
      ]
    }),
  ])
}

export function coverageSetupEntityRefIds(coverageSetup: Record<string, unknown>) {
  return uniqueTexts([
    ...readStringArray(coverageSetup.characterRefIds ?? coverageSetup.character_ref_ids),
    ...readStringArray(coverageSetup.visibleCharacterRefIds ?? coverageSetup.visible_character_ref_ids),
    ...readStringArray(coverageSetup.subjectRefIds ?? coverageSetup.subject_ref_ids),
    ...readStringArray(coverageSetup.speakerRefIds ?? coverageSetup.speaker_ref_ids),
    ...readStringArray(coverageSetup.propRefIds ?? coverageSetup.prop_ref_ids),
    ...readStringArray(coverageSetup.itemRefIds ?? coverageSetup.item_ref_ids),
  ])
}

export async function loadScreenplayAnimaticMasterRequest(input: {
  client: {
    from: (table: string) => any
  }
  projectId: string
  draftId: string
  masterRequestId: string
}): Promise<OutputRequest> {
  const masterResponse = await input.client
    .from('output_requests')
    .select(outputRequestSelect)
    .eq('id', input.masterRequestId)
    .eq('project_id', input.projectId)
    .eq('draft_id', input.draftId)
    .single()
  if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')
  const masterRequest = mapOutputRequestRow(masterResponse.data)
  const masterMetadata = asRecord(masterRequest.metadata)
  if (readScreenplayAnimaticRole(masterMetadata) !== 'master') throw new HttpError(409, 'This output is not a screenplay animatic master request.')
  if (!masterRequest.workflowId) throw new HttpError(409, 'Screenplay animatic master has no workflow yet.')
  return masterRequest
}
