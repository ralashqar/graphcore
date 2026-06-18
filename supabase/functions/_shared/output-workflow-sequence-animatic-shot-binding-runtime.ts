import {
  sequenceAnimaticContinuityShotBindingSchema,
} from './output-workflow-sequence-animatic-shot-continuity-contracts.ts'

export type SequenceAnimaticShotRefs = ReturnType<typeof sequenceAnimaticShotRefs>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(readText).filter(Boolean)
  const text = readText(value)
  return text ? [text] : []
}

export function sequenceAnimaticUniqueTexts(values: unknown[]) {
  return [...new Set(values.flatMap((value) => readStringArray(value)).map(readText).filter(Boolean))]
}

export function sequenceAnimaticShotRefs(shot: Record<string, unknown>, fallback: Record<string, unknown> = {}) {
  const refs = asRecord(shot.refs ?? shot.referenceAssignments ?? shot.reference_assignments)
  const fallbackRefs = asRecord(fallback.refs ?? fallback.referenceAssignments ?? fallback.reference_assignments)
  return {
    visibleCharacterRefIds: sequenceAnimaticUniqueTexts([
      shot.visibleCharacterRefIds,
      shot.visible_character_ref_ids,
      refs.visibleCharacterRefIds,
      refs.visible_character_ref_ids,
      fallback.visibleCharacterRefIds,
      fallback.visible_character_ref_ids,
      fallbackRefs.visibleCharacterRefIds,
      fallbackRefs.visible_character_ref_ids,
    ]),
    speakerRefIds: sequenceAnimaticUniqueTexts([
      shot.speakerRefIds,
      shot.speaker_ref_ids,
      refs.speakerRefIds,
      refs.speaker_ref_ids,
      fallback.speakerRefIds,
      fallback.speaker_ref_ids,
      fallbackRefs.speakerRefIds,
      fallbackRefs.speaker_ref_ids,
    ]),
    propRefIds: sequenceAnimaticUniqueTexts([
      shot.propRefIds,
      shot.prop_ref_ids,
      refs.propRefIds,
      refs.prop_ref_ids,
      fallback.propRefIds,
      fallback.prop_ref_ids,
      fallbackRefs.propRefIds,
      fallbackRefs.prop_ref_ids,
    ]),
    locationRefIds: sequenceAnimaticUniqueTexts([
      shot.locationRefIds,
      shot.location_ref_ids,
      refs.locationRefIds,
      refs.location_ref_ids,
      fallback.locationRefIds,
      fallback.location_ref_ids,
      fallbackRefs.locationRefIds,
      fallbackRefs.location_ref_ids,
      [readText(shot.locationRefId), readText(shot.location_ref_id), readText(fallback.locationRefId), readText(fallback.location_ref_id)].filter(Boolean),
    ]),
    localReferenceIds: sequenceAnimaticUniqueTexts([
      shot.localReferenceIds,
      shot.local_reference_ids,
      refs.localReferenceIds,
      refs.local_reference_ids,
      fallback.localReferenceIds,
      fallback.local_reference_ids,
      fallbackRefs.localReferenceIds,
      fallbackRefs.local_reference_ids,
    ]),
  }
}

export function sequenceAnimaticShotBindingFromSceneBinding(input: {
  shotId: string
  storyboardBlockId: string
  sceneBinding: Record<string, unknown>
  refs: SequenceAnimaticShotRefs
}) {
  const sceneBinding = input.sceneBinding
  const localReferenceIds = sequenceAnimaticUniqueTexts([
    sceneBinding.localReferenceIds,
    sceneBinding.local_reference_ids,
    input.refs.localReferenceIds,
  ])
  const characterAnchorIds = sequenceAnimaticUniqueTexts([
    sceneBinding.characterAnchorIds,
    sceneBinding.character_anchor_ids,
  ])
  const propAnchorIds = sequenceAnimaticUniqueTexts([
    sceneBinding.propAnchorIds,
    sceneBinding.prop_anchor_ids,
  ])
  const explicitAssetAnchorIds = sequenceAnimaticUniqueTexts([
    sceneBinding.assetAnchorIds,
    sceneBinding.asset_anchor_ids,
  ])
  const assetAnchorIds = [...new Set([...explicitAssetAnchorIds, ...localReferenceIds, ...characterAnchorIds, ...propAnchorIds])]
  const worldLocationRefId = readText(sceneBinding.worldLocationRefId)
    || readText(sceneBinding.world_location_ref_id)
    || input.refs.locationRefIds[0]
    || null
  const setId = readText(sceneBinding.setId) || readText(sceneBinding.set_id)
  const zoneId = readText(sceneBinding.zoneId) || readText(sceneBinding.zone_id)
  const primarySpotId = readText(sceneBinding.primarySpotId) || readText(sceneBinding.primary_spot_id)
  const spotIds = sequenceAnimaticUniqueTexts([sceneBinding.spotIds, sceneBinding.spot_ids, primarySpotId ? [primarySpotId] : []])
  const viewpointId = readText(sceneBinding.viewpointId) || readText(sceneBinding.viewpoint_id) || readText(sceneBinding.angleId) || readText(sceneBinding.angle_id)
  const angleId = readText(sceneBinding.angleId) || readText(sceneBinding.angle_id) || viewpointId
  return sequenceAnimaticContinuityShotBindingSchema.parse({
    shotId: input.shotId,
    storyboardBlockId: input.storyboardBlockId,
    worldLocationRefId,
    setId,
    zoneId,
    primarySpotId: primarySpotId || spotIds[0] || '',
    spotIds,
    viewpointId,
    angleId,
    characterAnchorIds,
    propAnchorIds,
    assetAnchorIds,
    spatialNodeIds: [...new Set([setId, zoneId, primarySpotId, ...spotIds, viewpointId, angleId].filter(Boolean))],
    continuityAnchorIds: assetAnchorIds,
  })
}
