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
    artifactKey: readText(artifact.key),
    role: readText(metadata.role),
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
