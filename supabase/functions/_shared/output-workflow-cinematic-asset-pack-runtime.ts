import {
  cinematicV2ReferencePlanSchema,
  cinematicV2ShotPlanSchema,
  cinematicV2ShotSchema,
} from '../../../src/domain/cinematics.ts'

type LooseRecord = Record<string, unknown>

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

function normalizeReferenceText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function selectedReferenceVariantAssetKeyForEntity(entity: LooseRecord) {
  const metadata = asRecord(entity.metadata)
  return readText(metadata.selectedReferenceVariantAssetKey)
    || readText(entity.selectedReferenceVariantAssetKey)
}

function sortReferenceValuesWithPrimary(values: string[], primaryAssetKey = '') {
  const unique = [...new Set(values.map(readText).filter(Boolean))]
  if (!primaryAssetKey) return unique
  return [primaryAssetKey, ...unique.filter((value) => value !== primaryAssetKey)]
}

export function cinematicAssetPackEntities(assetPack: LooseRecord) {
  return Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
}

export function cinematicAssetPackEntityKeys(assetPack: LooseRecord) {
  return cinematicAssetPackEntities(assetPack).map((entity) => readText(entity.key)).filter(Boolean)
}

function referencePlanKeys(plan: LooseRecord) {
  return [...new Set([
    ...readStringArray(plan.primaryCastRefIds),
    ...readStringArray(plan.supportingCastRefIds),
    ...readStringArray(plan.locationRefIds),
    ...readStringArray(plan.propRefIds),
    ...readStringArray(plan.conceptRefIds),
    ...readStringArray(plan.continuityAnchorRefIds),
  ].filter(Boolean))]
}

function cloneCinematicAssetPackEntity(entity: LooseRecord, maxAssetKeys = 2): LooseRecord {
  const selectedReferenceVariantAssetKey = selectedReferenceVariantAssetKeyForEntity(entity)
  const primaryAssetKey = readText(entity.primaryAssetKey) || selectedReferenceVariantAssetKey
  return {
    ...entity,
    primaryAssetKey: primaryAssetKey || readStringArray(entity.assetKeys)[0] || '',
    assetKeys: sortReferenceValuesWithPrimary(readStringArray(entity.assetKeys), primaryAssetKey || selectedReferenceVariantAssetKey)
      .slice(0, Math.max(1, maxAssetKeys)),
  }
}

function filterCinematicAssetPack(assetPack: LooseRecord, keys: string[], limit = 16, maxAssetKeysPerEntity = 2) {
  const keySet = new Set(keys.filter(Boolean))
  const entities = cinematicAssetPackEntities(assetPack)
    .filter((entity) => keySet.has(readText(entity.key)))
    .slice(0, Math.max(1, limit))
    .map((entity) => cloneCinematicAssetPackEntity(entity, maxAssetKeysPerEntity))
  const selectedKeys = new Set(entities.map((entity) => readText(entity.key)).filter(Boolean))
  return {
    ...assetPack,
    entities,
    selectedEntityKeys: [...selectedKeys],
    missingReferenceEntityKeys: readStringArray(assetPack.missingReferenceEntityKeys)
      .filter((key) => selectedKeys.has(key)),
  }
}

function buildFallbackCinematicV2ReferencePlan(assetPack: LooseRecord, maxReferenceCount = 16) {
  const entities = cinematicAssetPackEntities(assetPack)
  const byType = (types: string[]) => entities
    .filter((entity) => types.includes(readText(entity.type) || readText(entity.role)))
    .map((entity) => readText(entity.key))
    .filter(Boolean)
  const primaryCastRefIds = byType(['actor', 'character', 'group']).slice(0, 5)
  const locationRefIds = byType(['place', 'environment', 'location', 'location_spot']).slice(0, 3)
  const propRefIds = byType(['object', 'item', 'inventory_item', 'prop']).slice(0, 4)
  const conceptRefIds = byType(['concept']).slice(0, 3)
  const selected = [...new Set([...primaryCastRefIds, ...locationRefIds, ...propRefIds, ...conceptRefIds])]
    .slice(0, Math.max(1, maxReferenceCount))
  return cinematicV2ReferencePlanSchema.parse({
    primaryCastRefIds: selected.filter((key) => primaryCastRefIds.includes(key)),
    supportingCastRefIds: [],
    locationRefIds: selected.filter((key) => locationRefIds.includes(key)),
    propRefIds: selected.filter((key) => propRefIds.includes(key)),
    conceptRefIds: selected.filter((key) => conceptRefIds.includes(key)),
    continuityAnchorRefIds: selected.filter((key) => !primaryCastRefIds.includes(key) && !locationRefIds.includes(key) && !propRefIds.includes(key) && !conceptRefIds.includes(key)),
    rejectedRefs: cinematicAssetPackEntityKeys(assetPack)
      .filter((key) => !selected.includes(key))
      .map((refId) => ({ refId, reason: 'Not selected by deterministic cinematic reference fallback.' })),
    rationale: 'Deterministic fallback selected the most likely cast, location, prop, and concept references from the sequence-scoped asset pack.',
    confidence: selected.length > 0 ? 0.55 : 0.2,
  })
}

function selectedReferenceVariantForPackedEntity(entity: LooseRecord) {
  const selectedVariantKey = readText(entity.selectedReferenceVariantKey)
    || readText(asRecord(entity.metadata).selectedReferenceVariantKey)
  if (!selectedVariantKey || selectedVariantKey === 'default') return null
  const metadata = asRecord(entity.metadata)
  const variants = Array.isArray(entity.referenceVariants)
    ? entity.referenceVariants.map(asRecord)
    : Array.isArray(metadata.referenceVariants)
      ? metadata.referenceVariants.map(asRecord)
      : []
  return variants.find((variant) => {
    const key = readText(variant.variantKey) || readText(variant.variant_key)
    return key === selectedVariantKey
  }) ?? null
}

function entityMentionedInShotText(entity: LooseRecord, shotText: string) {
  const selectedVariant = selectedReferenceVariantForPackedEntity(entity)
  const candidates = [
    readText(entity.key),
    readText(entity.name),
    ...readStringArray(entity.aliases),
    readText(entity.selectedReferenceVariantKey),
    readText(entity.selectedReferenceVariantLabel),
    readText(selectedVariant?.variantKey ?? selectedVariant?.variant_key),
    readText(selectedVariant?.label),
    readText(selectedVariant?.summary),
    readText(selectedVariant?.guidance),
  ]
  return candidates
    .map((candidate) => normalizeReferenceText(candidate).replace(/_/g, ' '))
    .filter((candidate) => candidate.length > 2)
    .some((candidate) => shotText.includes(candidate))
}

function cinematicShotReferenceRepairText(shot: ReturnType<typeof cinematicV2ShotSchema.parse>) {
  return normalizeReferenceText([
    shot.title,
    shot.description,
    shot.action,
    shot.caption,
    shot.lighting,
    shot.mood,
    shot.storyboardPanelPrompt,
    shot.videoDirection,
    shot.continuityInputs.join(' '),
    shot.camera.framing,
    shot.camera.angle,
    shot.camera.lens,
    shot.camera.movement,
    shot.camera.screenDirectionRule,
    ...shot.dialogue.map((line) => `${line.speakerName} ${line.speakerRefId} ${line.text} ${line.emotion}`),
    ...shot.performanceBeats.map((beat) => [
      beat.characterRefId,
      beat.bodyLanguage,
      beat.facialExpression,
      beat.gaze,
      beat.gesture,
      beat.voiceEnergy,
    ].filter(Boolean).join(' ')),
  ].filter(Boolean).join(' ')).replace(/_/g, ' ')
}

function entityExactNameMatched(entity: LooseRecord, value: string) {
  const normalizedValue = normalizeReferenceText(value).replace(/_/g, ' ')
  if (!normalizedValue) return false
  const candidates = [
    readText(entity.key),
    readText(entity.name),
    ...readStringArray(entity.aliases),
  ]
    .map((candidate) => normalizeReferenceText(candidate).replace(/_/g, ' '))
    .filter((candidate) => candidate.length > 1)
  return candidates.some((candidate) => {
    if (candidate === normalizedValue) return true
    const parts = candidate.split(/\s+/).filter((part) => part.length > 1)
    return parts.includes(normalizedValue)
  })
}

export function repairCinematicV2ShotPlanVisualReferences(input: {
  shotPlan: LooseRecord
  assetPack: LooseRecord
}) {
  const shotPlan = cinematicV2ShotPlanSchema.parse(input.shotPlan)
  const entities = cinematicAssetPackEntities(input.assetPack)
  const allowedKeys = new Set(entities.map((entity) => readText(entity.key)).filter(Boolean))
  const byKey = new Map<string, LooseRecord>(
    entities
      .map((entity): [string, LooseRecord] => [readText(entity.key), entity])
      .filter(([key]) => key),
  )
  const diagnostics: string[] = []
  const actorTypes = new Set(['actor', 'character'])
  const locationTypes = new Set(['place', 'environment', 'location', 'location_spot'])
  const propTypes = new Set(['object', 'item', 'inventory_item', 'prop'])

  const repairedShots = shotPlan.shots.map((shot) => {
    const parsedShot = cinematicV2ShotSchema.parse(shot)
    const shotText = cinematicShotReferenceRepairText(parsedShot)
    const visibleCharacterRefIds = [...new Set(parsedShot.visibleCharacterRefIds.filter((key) => allowedKeys.has(key)))]
    const speakerRefIds = [...new Set(parsedShot.speakerRefIds.filter((key) => allowedKeys.has(key)))]
    const propRefIds = [...new Set(parsedShot.propRefIds.filter((key) => allowedKeys.has(key)))]
    let locationRefId = parsedShot.locationRefId && allowedKeys.has(parsedShot.locationRefId) ? parsedShot.locationRefId : null
    const matchedEntities = entities.filter((entity) => {
      const key = readText(entity.key)
      return key && entityMentionedInShotText(entity, shotText)
    })

    for (const line of parsedShot.dialogue) {
      const currentSpeaker = readText(line.speakerRefId)
      if (currentSpeaker && allowedKeys.has(currentSpeaker)) {
        if (!speakerRefIds.includes(currentSpeaker)) speakerRefIds.push(currentSpeaker)
        continue
      }
      const matchedSpeaker = entities.find((entity) => {
        const key = readText(entity.key)
        const type = readText(entity.type) || readText(entity.role)
        return key && actorTypes.has(type) && entityExactNameMatched(entity, readText(line.speakerName))
      })
      const speakerKey = matchedSpeaker ? readText(matchedSpeaker.key) : ''
      if (speakerKey && !speakerRefIds.includes(speakerKey)) {
        speakerRefIds.push(speakerKey)
        diagnostics.push(`Repaired speaker reference ${speakerKey} on ${parsedShot.id} from dialogue speaker name.`)
      }
      if (speakerKey && !visibleCharacterRefIds.includes(speakerKey)) visibleCharacterRefIds.push(speakerKey)
    }

    for (const entity of matchedEntities) {
      const key = readText(entity.key)
      const type = readText(entity.type) || readText(entity.role)
      if (!key) continue
      if (actorTypes.has(type) && !visibleCharacterRefIds.includes(key)) {
        visibleCharacterRefIds.push(key)
        diagnostics.push(`Repaired visible character reference ${key} on ${parsedShot.id} from shot text.`)
      } else if (locationTypes.has(type)) {
        const currentLocation = locationRefId ? byKey.get(locationRefId) : null
        const currentLocationMentioned = currentLocation ? entityMentionedInShotText(currentLocation, shotText) : false
        if (!locationRefId || (!currentLocationMentioned && locationRefId !== key)) {
          const previousLocation = locationRefId
          locationRefId = key
          diagnostics.push(previousLocation
            ? `Repaired location reference on ${parsedShot.id} from ${previousLocation} to ${key} based on shot text.`
            : `Repaired location reference ${key} on ${parsedShot.id} from shot text.`)
        }
      } else if (propTypes.has(type) && !propRefIds.includes(key)) {
        propRefIds.push(key)
        diagnostics.push(`Repaired prop reference ${key} on ${parsedShot.id} from shot text.`)
      }
    }

    return cinematicV2ShotSchema.parse({
      ...parsedShot,
      visibleCharacterRefIds,
      speakerRefIds,
      locationRefId,
      worldLocationRefId: readText(parsedShot.worldLocationRefId) || locationRefId,
      continuitySetId: readText(parsedShot.continuitySetId) || (locationRefId ? `set_${slugify(locationRefId)}_primary` : ''),
      continuityZoneId: readText(parsedShot.continuityZoneId),
      continuitySpotIds: readStringArray(parsedShot.continuitySpotIds),
      continuityAngleId: readText(parsedShot.continuityAngleId),
      propRefIds,
    })
  })

  return cinematicV2ShotPlanSchema.parse({
    ...shotPlan,
    shots: repairedShots,
    diagnostics: [...shotPlan.diagnostics, ...diagnostics],
  })
}

export function buildCinematicV3StoryboardGroupAssetPack(input: {
  assetPack: LooseRecord
  shots: LooseRecord[]
  maxEntityCount?: number
  maxAssetKeysPerEntity?: number
  includeSpeakerRefs?: boolean
  includePerformanceRefs?: boolean
  includeTextMentionedRefs?: boolean
}) {
  const byKey = new Map<string, LooseRecord>(
    cinematicAssetPackEntities(input.assetPack)
      .map((entity): [string, LooseRecord] => [readText(entity.key), entity])
      .filter(([key]) => key),
  )
  const keys: string[] = []
  const addKey = (key: string) => {
    if (key && byKey.has(key) && !keys.includes(key)) keys.push(key)
  }
  const groupTextParts: string[] = []

  input.shots.forEach((rawShot) => {
    readStringArray(rawShot.continuityAnchorIds).forEach(addKey)
    readStringArray(rawShot.continuityAnchorRefIds).forEach(addKey)
    const parsedShot = cinematicV2ShotSchema.safeParse(rawShot)
    const shot = parsedShot.success ? parsedShot.data : null
    if (shot) {
      shot.visibleCharacterRefIds.forEach(addKey)
      if (shot.locationRefId) addKey(shot.locationRefId)
      shot.propRefIds.forEach(addKey)
      if (input.includeSpeakerRefs !== false) {
        shot.speakerRefIds.forEach(addKey)
        shot.dialogue.forEach((line) => addKey(line.speakerRefId))
      }
      if (input.includePerformanceRefs !== false) {
        shot.performanceBeats.forEach((beat) => addKey(beat.characterRefId))
      }
      groupTextParts.push([
        shot.title,
        shot.description,
        shot.action,
        shot.caption,
        shot.lighting,
        shot.mood,
        shot.storyboardPanelPrompt,
        shot.videoDirection,
        ...(input.includeSpeakerRefs === false ? [] : shot.dialogue.map((line) => `${line.speakerName || line.speakerRefId} ${line.text} ${line.emotion}`)),
      ].filter(Boolean).join(' '))
      return
    }
    readStringArray(rawShot.visibleCharacterRefIds).forEach(addKey)
    const locationRefId = readText(rawShot.locationRefId)
    if (locationRefId) addKey(locationRefId)
    readStringArray(rawShot.propRefIds).forEach(addKey)
    if (input.includeSpeakerRefs !== false) readStringArray(rawShot.speakerRefIds).forEach(addKey)
    groupTextParts.push(JSON.stringify(rawShot))
  })

  if (input.includeTextMentionedRefs !== false) {
    const groupText = normalizeReferenceText(groupTextParts.join(' ')).replace(/_/g, ' ')
    cinematicAssetPackEntities(input.assetPack)
      .filter((entity) => entityMentionedInShotText(entity, groupText))
      .forEach((entity) => addKey(readText(entity.key)))
  }

  const maxEntityCount = Math.max(0, input.maxEntityCount ?? 4)
  const spatialKeys: string[] = []
  cinematicAssetPackEntities(input.assetPack)
    .filter((entity) => {
      const type = readText(entity.type)
      return type === 'continuity_spatial_ref' || entity.storyboardSpatialReference === true
    })
    .forEach((entity) => {
      const key = readText(entity.key)
      if (key && byKey.has(key) && !spatialKeys.includes(key)) spatialKeys.push(key)
    })
  const spatialBudget = spatialKeys.length > 0 ? Math.min(spatialKeys.length, Math.max(1, Math.floor(maxEntityCount / 2))) : 0
  const entityBudget = Math.max(0, maxEntityCount - spatialBudget)
  const selectedKeys = [
    ...keys.slice(0, entityBudget),
    ...spatialKeys.slice(0, spatialBudget),
  ].filter((key, index, array) => key && array.indexOf(key) === index)
  const groupAssetPack = filterCinematicAssetPack(
    input.assetPack,
    selectedKeys,
    Math.max(1, maxEntityCount),
    input.maxAssetKeysPerEntity ?? 2,
  )
  return {
    ...groupAssetPack,
    storyboardGroupReferenceKeys: selectedKeys,
    referenceScope: 'cinematic_v3_storyboard_group',
    text: JSON.stringify(groupAssetPack, null, 2),
  }
}

export function buildCinematicV2ShotAssetPack(input: {
  assetPack: LooseRecord
  referencePlan?: LooseRecord | null
  shot: LooseRecord
  maxEntityCount?: number
  maxAssetKeysPerEntity?: number
}) {
  const shot = cinematicV2ShotSchema.parse(input.shot)
  const parsedReferencePlan = cinematicV2ReferencePlanSchema.safeParse(input.referencePlan ?? {})
  const referencePlan = parsedReferencePlan.success && referencePlanKeys(parsedReferencePlan.data).length > 0
    ? parsedReferencePlan.data
    : buildFallbackCinematicV2ReferencePlan(input.assetPack)
  const plannedKeys = new Set(referencePlanKeys(referencePlan))
  const byKey = new Map(
    cinematicAssetPackEntities(input.assetPack)
      .map((entity): [string, LooseRecord] => [readText(entity.key), entity])
      .filter(([key]) => key),
  )
  const shotText = normalizeReferenceText([
    shot.title,
    shot.description,
    shot.action,
    shot.caption,
    shot.lighting,
    shot.mood,
    shot.storyboardPanelPrompt,
    shot.videoDirection,
    shot.continuityInputs.join(' '),
    shot.camera.framing,
    shot.camera.angle,
    shot.camera.lens,
    shot.camera.movement,
    shot.camera.screenDirectionRule,
    ...shot.dialogue.map((line) => `${line.speakerName || line.speakerRefId} ${line.text} ${line.emotion}`),
    ...shot.performanceBeats.map((beat) => [
      beat.characterRefId,
      beat.bodyLanguage,
      beat.facialExpression,
      beat.gaze,
      beat.gesture,
      beat.voiceEnergy,
    ].filter(Boolean).join(' ')),
  ].filter(Boolean).join(' ')).replace(/_/g, ' ')
  const priorityKeys = [
    ...shot.speakerRefIds,
    ...shot.visibleCharacterRefIds,
    ...(shot.locationRefId ? [shot.locationRefId] : []),
    ...shot.propRefIds,
  ].filter((key) => plannedKeys.has(key) && byKey.has(key))
  const continuityKeys = referencePlan.continuityAnchorRefIds
    .filter((key) => plannedKeys.has(key) && byKey.has(key))
    .filter((key) => entityMentionedInShotText(byKey.get(key) ?? {}, shotText))
  const textMentionedKeys = [...plannedKeys]
    .filter((key) => byKey.has(key))
    .filter((key) => entityMentionedInShotText(byKey.get(key) ?? {}, shotText))
  const fallbackKeys = [
    ...referencePlan.primaryCastRefIds,
    ...referencePlan.locationRefIds,
    ...referencePlan.propRefIds,
    ...referencePlan.conceptRefIds,
  ].filter((key) => plannedKeys.has(key) && byKey.has(key))
  const directKeys = [...new Set([
    ...priorityKeys,
    ...continuityKeys,
    ...textMentionedKeys,
  ])]
  const selectedKeys = (directKeys.length > 0 ? directKeys : fallbackKeys)
    .slice(0, Math.max(1, input.maxEntityCount ?? 6))
  const shotAssetPack = filterCinematicAssetPack(input.assetPack, selectedKeys, input.maxEntityCount ?? 6, input.maxAssetKeysPerEntity ?? 2)
  return {
    ...shotAssetPack,
    shotId: shot.id,
    shotIndex: shot.index,
    shotReferenceKeys: selectedKeys,
    referencePlan,
    text: JSON.stringify(shotAssetPack, null, 2),
  }
}
