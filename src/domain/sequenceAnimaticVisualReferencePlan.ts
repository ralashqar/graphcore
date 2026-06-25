type LooseRecord = Record<string, unknown>

export type SequenceAnimaticVisualReferenceStatus = 'ready' | 'missing' | 'blocked' | 'stale'

export type SequenceAnimaticReferenceDiagnostic = {
  assetKey: string
  role: 'coverage_anchor' | 'previous_keyframe' | 'continuity_asset' | 'entity_reference' | 'selected_reference' | 'zone_reference' | 'world_character_reference' | 'temp_character_reference' | 'item_or_prop_reference'
  reason: string
}

export type SequenceAnimaticShotIngredientReferenceKind = 'zone_location' | 'world_character' | 'temp_character' | 'item_or_prop'

export type SequenceAnimaticShotIngredientReference = {
  id: string
  kind: SequenceAnimaticShotIngredientReferenceKind
  name: string
  assetKey: string
  nodeId: string
  entityKey: string
  role: SequenceAnimaticReferenceDiagnostic['role']
  sourceArtifactRole: string
  requiredForKeyframe: boolean
  status: 'ready' | 'missing'
  reason: string
  imageUrl?: string
}

export type SequenceAnimaticShotIngredientReferencePlan = {
  version: 'sequence_animatic_shot_ingredient_reference_plan_v1'
  shotId: string
  referencePlanHash: string
  ingredients: SequenceAnimaticShotIngredientReference[]
  requiredReferenceAssetKeys: string[]
  selectedReferences: SequenceAnimaticReferenceDiagnostic[]
  missingReferences: SequenceAnimaticShotIngredientReference[]
}

export const sequenceAnimaticCanonicalShotGraphPolicyVersion = 'primary_chain_v14_reference_fix'
export const sequenceAnimaticPreviousCanonicalShotGraphPolicyVersion = 'primary_chain_v13_ui_ingredient_override'

export type SequenceAnimaticVisualReferencePlan = {
  version: 'sequence_animatic_visual_reference_plan_v1'
  visualPlanHash: string
  dependencyReadiness: {
    status: 'ready_for_keyframes' | 'ready_for_coverage_anchors' | 'waiting_for_coverage_anchor' | 'waiting_for_keyframe_refs' | 'waiting_for_continuity_assets'
    dependencyNodeIds: string[]
    missingDependencyNodeIds: string[]
    readyDependencyNodeIds: string[]
  }
  counts: {
    dependencyRefs: number
    missingDependencyRefs: number
    coverageAnchors: number
    readyCoverageAnchors: number
    shotKeyframes: number
    readyShotKeyframes: number
    blockedShotKeyframes: number
  }
  coverageAnchors: Array<{
    coverageSetupId: string
    status: SequenceAnimaticVisualReferenceStatus
    shotIds: string[]
    requiredReferenceAssetKeys: string[]
    selectedReferences: SequenceAnimaticReferenceDiagnostic[]
    sourceReferenceHash: string
  }>
  shotKeyframes: Array<{
    shotId: string
    storyboardBlockId: string
    coverageSetupId: string
    status: SequenceAnimaticVisualReferenceStatus
    requiredReferenceAssetKeys: string[]
    omittedReferenceAssetKeys: string[]
    selectedReferences: SequenceAnimaticReferenceDiagnostic[]
    omittedReferences: SequenceAnimaticReferenceDiagnostic[]
    blockingAssetIds: string[]
    sourceReferenceHash: string
  }>
}

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

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].filter(Boolean)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  return `{${Object.entries(value as LooseRecord)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`
}

export function sequenceAnimaticVisualReferenceHash(value: unknown): string {
  const input = stableStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function readSequenceAnimaticContinuityLinkMode(shot: LooseRecord): string {
  const link = shot.continuityLink ?? shot.continuity_link
  if (typeof link === 'string') return link.trim().toLowerCase()
  const record = asRecord(link)
  return readText(record.mode ?? record.continuityMode ?? record.continuity_mode).toLowerCase()
}

export function sequenceAnimaticContinuityLinkRequiresPrevious(shot: LooseRecord): boolean {
  return ['match_action', 'blocking_change', 'continuation', 'same_motion', 'same_action']
    .includes(readSequenceAnimaticContinuityLinkMode(shot))
}

function referenceDiagnostics(assetKeys: string[], role: SequenceAnimaticReferenceDiagnostic['role'], reason: string): SequenceAnimaticReferenceDiagnostic[] {
  return uniqueStrings(assetKeys).map((assetKey) => ({ assetKey, role, reason }))
}

function lookupKey(value: unknown) {
  return readText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function displayNameFromKey(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function addReferenceAlias(aliases: Set<string>, value: unknown) {
  const key = lookupKey(value)
  if (key) aliases.add(key)
}

function addReferenceAliasesFromRecord(aliases: Set<string>, record: LooseRecord) {
  for (const value of [
    record.id,
    record.refId,
    record.ref_id,
    record.referenceId,
    record.reference_id,
    record.entityKey,
    record.entity_key,
    record.entityRefId,
    record.entity_ref_id,
    record.worldRefId,
    record.world_ref_id,
    record.worldEntityKey,
    record.world_entity_key,
    record.characterRefId,
    record.character_ref_id,
    record.speakerRefId,
    record.speaker_ref_id,
    record.propRefId,
    record.prop_ref_id,
    record.itemRefId,
    record.item_ref_id,
  ]) {
    addReferenceAlias(aliases, value)
  }
}

function shotReferenceAliases(shot: LooseRecord) {
  const aliases = new Set<string>()
  const refs = asRecord(shot.refs)
  for (const field of [
    refs.referenceIds,
    refs.reference_ids,
    refs.refIds,
    refs.ref_ids,
    refs.entityRefIds,
    refs.entity_ref_ids,
    refs.worldRefIds,
    refs.world_ref_ids,
    refs.worldEntityKeys,
    refs.world_entity_keys,
    refs.visibleCharacterRefIds,
    refs.visible_character_ref_ids,
    refs.worldCharacterRefIds,
    refs.world_character_ref_ids,
    refs.speakerRefIds,
    refs.speaker_ref_ids,
    refs.characterRefIds,
    refs.character_ref_ids,
    refs.propRefIds,
    refs.prop_ref_ids,
    refs.itemRefIds,
    refs.item_ref_ids,
    refs.localReferenceIds,
    refs.local_reference_ids,
    refs.locationRefIds,
    refs.location_ref_ids,
    shot.referenceIds,
    shot.reference_ids,
    shot.refIds,
    shot.ref_ids,
    shot.entityRefIds,
    shot.entity_ref_ids,
    shot.worldRefIds,
    shot.world_ref_ids,
    shot.worldEntityKeys,
    shot.world_entity_keys,
    shot.visibleCharacterRefIds,
    shot.visible_character_ref_ids,
    shot.worldCharacterRefIds,
    shot.world_character_ref_ids,
    shot.speakerRefIds,
    shot.speaker_ref_ids,
    shot.characterRefIds,
    shot.character_ref_ids,
    shot.propRefIds,
    shot.prop_ref_ids,
    shot.itemRefIds,
    shot.item_ref_ids,
    shot.localReferenceIds,
    shot.local_reference_ids,
    shot.locationRefIds,
    shot.location_ref_ids,
  ]) {
    readStringArray(field).forEach((entry) => addReferenceAlias(aliases, entry))
  }
  readArray(shot.references).forEach((entry) => {
    if (typeof entry === 'string') {
      addReferenceAlias(aliases, entry)
      return
    }
    addReferenceAliasesFromRecord(aliases, asRecord(entry))
  })
  readArray(shot.dialogue).map(asRecord).forEach((line) => {
    addReferenceAliasesFromRecord(aliases, line)
  })
  readArray(shot.performanceBeats ?? shot.performance_beats).map(asRecord).forEach((beat) => {
    addReferenceAliasesFromRecord(aliases, beat)
  })
  return aliases
}

function aliasesMatch(aliases: ReadonlySet<string>, ...values: unknown[]) {
  const candidateKeys = values.map(lookupKey).filter(Boolean)
  return candidateKeys.some((candidate) => aliases.has(candidate))
}

function readEntityAssetKey(entity: LooseRecord) {
  return readText(entity.primaryAssetKey)
    || readText(entity.primary_asset_key)
    || readText(entity.selectedReferenceAssetKey)
    || readText(entity.selected_reference_asset_key)
    || readText(entity.selectedReferenceVariantAssetKey)
    || readText(entity.selected_reference_variant_asset_key)
    || readStringArray(entity.assetKeys ?? entity.asset_keys)[0]
    || ''
}

function readTargetAssetKey(target: LooseRecord) {
  return readText(target.assetKey)
    || readText(target.asset_key)
    || readText(asRecord(target.assetState ?? target.asset_state).assetKey)
    || readText(asRecord(target.assetState ?? target.asset_state).asset_key)
    || ''
}

function makeShotIngredientReference(input: {
  id: string
  kind: SequenceAnimaticShotIngredientReferenceKind
  name: string
  assetKey?: string
  nodeId?: string
  entityKey?: string
  role: SequenceAnimaticReferenceDiagnostic['role']
  sourceArtifactRole: string
  reason: string
  imageUrl?: string
}): SequenceAnimaticShotIngredientReference {
  const assetKey = readText(input.assetKey)
  return {
    id: input.id,
    kind: input.kind,
    name: input.name,
    assetKey,
    nodeId: readText(input.nodeId),
    entityKey: readText(input.entityKey),
    role: input.role,
    sourceArtifactRole: input.sourceArtifactRole,
    requiredForKeyframe: true,
    status: assetKey ? 'ready' : 'missing',
    reason: input.reason,
    imageUrl: input.imageUrl,
  }
}

export function buildSequenceAnimaticShotIngredientReferencePlan(input: {
  shot: LooseRecord
  spatialNodes?: LooseRecord[]
  continuityTargets?: LooseRecord[]
  assetPack?: LooseRecord
  explicitReferenceIds?: string[]
  maxReferences?: number
}): SequenceAnimaticShotIngredientReferencePlan {
  const shotId = readText(input.shot.id ?? input.shot.shotId ?? input.shot.shot_id)
  const maxReferences = Math.max(1, Math.min(12, Number(input.maxReferences ?? 8) || 8))
  const aliases = shotReferenceAliases(input.shot)
  for (const refId of input.explicitReferenceIds ?? []) addReferenceAlias(aliases, refId)
  const ingredients: SequenceAnimaticShotIngredientReference[] = []
  const add = (ingredient: SequenceAnimaticShotIngredientReference) => {
    const key = ingredient.assetKey ? `asset:${ingredient.assetKey}` : `id:${ingredient.kind}:${ingredient.nodeId || ingredient.entityKey || ingredient.name}`
    if (ingredients.some((entry) => (entry.assetKey ? `asset:${entry.assetKey}` : `id:${entry.kind}:${entry.nodeId || entry.entityKey || entry.name}`) === key)) return
    ingredients.push(ingredient)
  }

  const spatialNodes = (input.spatialNodes ?? []).map(asRecord)
  const zoneNodes = spatialNodes.filter((node) => ['zone', 'location_zone'].includes(readText(node.kind ?? node.nodeKind ?? node.node_kind ?? node.assetKind ?? node.asset_kind)))
  const readyZone = zoneNodes.find((node) => readTargetAssetKey(node)) ?? zoneNodes[0] ?? null
  if (readyZone) {
    const nodeId = readText(readyZone.id ?? readyZone.nodeId ?? readyZone.node_id)
    add(makeShotIngredientReference({
      id: `zone:${nodeId || 'location'}`,
      kind: 'zone_location',
      name: readText(readyZone.name ?? readyZone.label ?? readyZone.title) || displayNameFromKey(nodeId || 'Zone location'),
      assetKey: readTargetAssetKey(readyZone),
      nodeId,
      entityKey: nodeId,
      role: 'zone_reference',
      sourceArtifactRole: 'sequence_animatic_continuity_asset',
      reason: 'Parent zone location image selected as the only spatial keyframe reference.',
      imageUrl: readText(readyZone.assetUrl ?? readyZone.asset_url),
    }))
  }

  const assetPackEntities = readArray(asRecord(input.assetPack).entities).map(asRecord)
  for (const entity of assetPackEntities) {
    const entityKey = readText(entity.key ?? entity.id)
    const name = readText(entity.name ?? entity.title) || displayNameFromKey(entityKey)
    const type = readText(entity.type ?? entity.nodeType ?? entity.node_type).toLowerCase()
    if (type.includes('location') || type.includes('set') || type.includes('zone') || type.includes('spot')) continue
    const isProp = type.includes('prop') || type.includes('item') || type.includes('object')
    if (!aliasesMatch(aliases, entityKey)) continue
    const assetKey = readEntityAssetKey(entity)
    add(makeShotIngredientReference({
      id: `entity:${entityKey || name}`,
      kind: isProp ? 'item_or_prop' : 'world_character',
      name,
      assetKey,
      nodeId: entityKey,
      entityKey,
      role: isProp ? 'item_or_prop_reference' : 'world_character_reference',
      sourceArtifactRole: 'world_entity_reference',
      reason: isProp ? 'Shot-visible world item/prop reference.' : 'Shot-visible world character reference.',
      imageUrl: readText(entity.assetUrl ?? entity.asset_url ?? entity.iconUrl ?? entity.icon_url),
    }))
  }

  for (const target of (input.continuityTargets ?? []).map(asRecord)) {
    const nodeId = readText(target.nodeId ?? target.node_id ?? target.id)
    const name = readText(target.name ?? target.label ?? target.title) || displayNameFromKey(nodeId)
    const assetKind = readText(target.assetKind ?? target.asset_kind ?? target.nodeKind ?? target.node_kind).toLowerCase()
    const isTempCharacter = ['temporary_character', 'temp_character', 'character', 'person', 'crowd', 'group', 'faction'].includes(assetKind)
    const isProp = ['prop', 'item', 'temporary_prop', 'animatic_item'].includes(assetKind)
    if (!isTempCharacter && !isProp) continue
    const shotIds = readStringArray(target.shotIds ?? target.shot_ids)
    if (shotId && shotIds.length > 0 && !shotIds.includes(shotId)) continue
    if (shotIds.length === 0 && !aliasesMatch(aliases, nodeId)) continue
    add(makeShotIngredientReference({
      id: `local:${nodeId || name}`,
      kind: isTempCharacter ? 'temp_character' : 'item_or_prop',
      name,
      assetKey: readTargetAssetKey(target),
      nodeId,
      entityKey: nodeId,
      role: isTempCharacter ? 'temp_character_reference' : 'item_or_prop_reference',
      sourceArtifactRole: 'sequence_animatic_continuity_asset',
      reason: isTempCharacter ? 'Animatic-local character reference.' : 'Animatic-local item/prop reference.',
      imageUrl: readText(target.assetUrl ?? target.asset_url),
    }))
  }

  const limitedIngredients = ingredients.slice(0, maxReferences)
  const requiredReferenceAssetKeys = uniqueStrings(limitedIngredients.map((entry) => entry.assetKey).filter(Boolean))
  const missingReferences = limitedIngredients.filter((entry) => entry.status !== 'ready')
  const selectedReferences = limitedIngredients
    .filter((entry) => entry.status === 'ready')
    .map((entry) => ({
      assetKey: entry.assetKey,
      role: entry.role,
      reason: entry.reason,
    }))
  const referencePlanHash = sequenceAnimaticVisualReferenceHash({
    version: 'sequence_animatic_shot_ingredient_reference_plan_v1',
    shotId,
    ingredients: limitedIngredients.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      assetKey: entry.assetKey,
      nodeId: entry.nodeId,
      entityKey: entry.entityKey,
      status: entry.status,
    })),
  })
  return {
    version: 'sequence_animatic_shot_ingredient_reference_plan_v1',
    shotId,
    referencePlanHash,
    ingredients: limitedIngredients,
    requiredReferenceAssetKeys,
    selectedReferences,
    missingReferences,
  }
}

export function buildSequenceAnimaticVisualReferencePlan(input: {
  keyframePlan: LooseRecord
  dependencyNodeIds: string[]
  missingDependencyNodeIds: string[]
  coverageAnchorAssetKeysBySetupId: Record<string, string>
  shotKeyframeAssetKeysByShotId: Record<string, string>
  coverageAnchorReferenceAssetKeysBySetupId?: Record<string, string[]>
  shotRequiredReferenceAssetKeysByShotId?: Record<string, string[]>
  shotOmittedReferenceAssetKeysByShotId?: Record<string, string[]>
  coverageAnchorSelectedReferencesBySetupId?: Record<string, SequenceAnimaticReferenceDiagnostic[]>
  shotSelectedReferencesByShotId?: Record<string, SequenceAnimaticReferenceDiagnostic[]>
  shotOmittedReferencesByShotId?: Record<string, SequenceAnimaticReferenceDiagnostic[]>
  shotBlockingDependencyNodeIdsByShotId?: Record<string, string[]>
  coverageAnchorsRequiredForKeyframes?: boolean
}): SequenceAnimaticVisualReferencePlan {
  const dependencyNodeIds = uniqueStrings(input.dependencyNodeIds)
  const missingDependencyNodeIds = uniqueStrings(input.missingDependencyNodeIds)
  const missingSet = new Set(missingDependencyNodeIds)
  const readyDependencyNodeIds = dependencyNodeIds.filter((nodeId) => !missingSet.has(nodeId))
  const coverageAnchorJobs = readArray(input.keyframePlan.coverageAnchorJobs).map(asRecord)
  const shotKeyframeJobs = readArray(input.keyframePlan.shotKeyframeJobs).map(asRecord)

  const coverageAnchors = coverageAnchorJobs.map((job) => {
    const coverageSetupId = readText(job.coverageSetupId)
    const requiredReferenceAssetKeys = uniqueStrings(input.coverageAnchorReferenceAssetKeysBySetupId?.[coverageSetupId] ?? [])
    const assetKey = readText(input.coverageAnchorAssetKeysBySetupId[coverageSetupId])
    return {
      coverageSetupId,
      status: assetKey ? 'ready' as const : 'missing' as const,
      shotIds: readStringArray(job.shotIds),
      requiredReferenceAssetKeys,
      selectedReferences: input.coverageAnchorSelectedReferencesBySetupId?.[coverageSetupId]
        ?? referenceDiagnostics(requiredReferenceAssetKeys, 'selected_reference', 'Selected for coverage anchor generation.'),
      sourceReferenceHash: sequenceAnimaticVisualReferenceHash({ coverageSetupId, requiredReferenceAssetKeys }),
    }
  })

  const coverageReady = new Set(
    Object.entries(input.coverageAnchorAssetKeysBySetupId)
      .filter(([, assetKey]) => readText(assetKey))
      .map(([setupId]) => setupId),
  )
  const coverageAnchorsRequiredForKeyframes = input.coverageAnchorsRequiredForKeyframes !== false
  const shotKeyframes = shotKeyframeJobs.map((job) => {
    const shotId = readText(job.shotId)
    const coverageSetupId = readText(job.coverageSetupId)
    const requiredReferenceAssetKeys = uniqueStrings(input.shotRequiredReferenceAssetKeysByShotId?.[shotId] ?? [])
    const omittedReferenceAssetKeys = uniqueStrings(input.shotOmittedReferenceAssetKeysByShotId?.[shotId] ?? [])
    const blockingDependencyNodeIds = uniqueStrings(input.shotBlockingDependencyNodeIdsByShotId?.[shotId] ?? [])
    const blockingAssetIds = [
      ...blockingDependencyNodeIds.map((nodeId) => `continuity:${nodeId}`),
      coverageAnchorsRequiredForKeyframes && job.requiresCoverageAnchor === true && coverageSetupId && !coverageReady.has(coverageSetupId) ? `coverage:${coverageSetupId}` : '',
      readText(job.previousShotId) && !readText(input.shotKeyframeAssetKeysByShotId[readText(job.previousShotId)]) ? `shot:${readText(job.previousShotId)}` : '',
    ].filter(Boolean)
    const assetKey = readText(input.shotKeyframeAssetKeysByShotId[shotId])
    return {
      shotId,
      storyboardBlockId: readText(job.storyboardBlockId),
      coverageSetupId,
      status: assetKey ? 'ready' as const : blockingAssetIds.length > 0 ? 'blocked' as const : 'missing' as const,
      requiredReferenceAssetKeys,
      omittedReferenceAssetKeys,
      selectedReferences: input.shotSelectedReferencesByShotId?.[shotId]
        ?? referenceDiagnostics(requiredReferenceAssetKeys, 'selected_reference', 'Selected for shot keyframe generation within the reference budget.'),
      omittedReferences: input.shotOmittedReferencesByShotId?.[shotId]
        ?? referenceDiagnostics(omittedReferenceAssetKeys, 'selected_reference', 'Omitted because the shot reference budget was full.'),
      blockingAssetIds,
      sourceReferenceHash: sequenceAnimaticVisualReferenceHash({ shotId, coverageSetupId, requiredReferenceAssetKeys, omittedReferenceAssetKeys }),
    }
  })

  const readyCoverageAnchors = coverageAnchors.filter((entry) => entry.status === 'ready').length
  const readyShotKeyframes = shotKeyframes.filter((entry) => entry.status === 'ready').length
  const blockedShotKeyframes = shotKeyframes.filter((entry) => entry.status === 'blocked').length
  const dependencyReadinessStatus = missingDependencyNodeIds.length > 0
    ? 'waiting_for_keyframe_refs' as const
    : coverageAnchorsRequiredForKeyframes && coverageAnchors.some((entry) => entry.status !== 'ready')
      ? 'waiting_for_coverage_anchor' as const
      : blockedShotKeyframes > 0
        ? 'waiting_for_keyframe_refs' as const
        : 'ready_for_keyframes' as const
  return {
    version: 'sequence_animatic_visual_reference_plan_v1',
    visualPlanHash: sequenceAnimaticVisualReferenceHash({
      dependencyNodeIds,
      missingDependencyNodeIds,
      coverageAnchors,
      shotKeyframes,
    }),
    dependencyReadiness: {
      status: dependencyReadinessStatus,
      dependencyNodeIds,
      missingDependencyNodeIds,
      readyDependencyNodeIds,
    },
    counts: {
      dependencyRefs: dependencyNodeIds.length,
      missingDependencyRefs: missingDependencyNodeIds.length,
      coverageAnchors: coverageAnchors.length,
      readyCoverageAnchors,
      shotKeyframes: shotKeyframes.length,
      readyShotKeyframes,
      blockedShotKeyframes,
    },
    coverageAnchors,
    shotKeyframes,
  }
}
