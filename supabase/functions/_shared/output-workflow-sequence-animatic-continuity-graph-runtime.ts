import { z } from 'zod'
import {
  continuityAssetStateSchema,
  continuityVisualDependencyEdgeSchema,
  hashOutputWorkflowValue,
} from '../../../src/domain/outputWorkflow.ts'
import {
  readWorldEntityVisualDescription,
} from '../../../src/domain/worldEntityVisuals.ts'
import {
  sequenceAnimaticContinuityGraphV2Schema,
  sequenceAnimaticContinuityGraphAngleSchema,
  sequenceAnimaticContinuityGraphEdgeSchema,
  sequenceAnimaticContinuityGraphSetSchema,
  sequenceAnimaticContinuityGraphSpotSchema,
  sequenceAnimaticContinuityGraphZoneSchema,
  sequenceAnimaticContinuityLocationAngleSchema,
  sequenceAnimaticContinuityLocationSetSchema,
  sequenceAnimaticContinuityPlannerAnchorSchema,
  sequenceAnimaticContinuityRejectedCandidateSchema,
  sequenceAnimaticContinuityRejectedReasonSchema,
  sequenceAnimaticContinuitySceneGraphSchema,
  sequenceAnimaticContinuityShotBindingSchema,
  sequenceAnimaticContinuityWorldLocationRefSchema,
} from './output-workflow-sequence-animatic-shot-continuity-contracts.ts'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return readArray(value).map(readText).filter(Boolean)
}

function compactSequenceAnimaticText(value: unknown, maxLength = 900) {
  const text = readText(value).replace(/\s+/g, ' ')
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text
}

export const sequenceAnimaticContinuityBlockDeltaSchema = z.object({
  blockId: z.string(),
  blockSummary: z.string().default(''),
  worldLocationRefs: z.array(sequenceAnimaticContinuityWorldLocationRefSchema).default([]),
  locationSets: z.array(sequenceAnimaticContinuityGraphSetSchema).default([]),
  zones: z.array(sequenceAnimaticContinuityGraphZoneSchema).default([]),
  spots: z.array(sequenceAnimaticContinuityGraphSpotSchema).default([]),
  angles: z.array(sequenceAnimaticContinuityGraphAngleSchema).default([]),
  edges: z.array(sequenceAnimaticContinuityGraphEdgeSchema).default([]),
  shotBindings: z.record(z.string(), sequenceAnimaticContinuityShotBindingSchema).default({}),
  assetAnchors: z.array(sequenceAnimaticContinuityPlannerAnchorSchema).default([]),
  rejectedCandidates: z.array(sequenceAnimaticContinuityRejectedCandidateSchema).default([]),
  warnings: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
})

export const sequenceAnimaticContinuityAssetStateSchema = continuityAssetStateSchema
export const sequenceAnimaticContinuityVisualDependencyEdgeSchema = continuityVisualDependencyEdgeSchema

export const sequenceAnimaticContinuityPlanV2Schema = z.object({
  version: z.literal('sequence_animatic_continuity_plan_v2').default('sequence_animatic_continuity_plan_v2'),
  planningMode: z.enum(['block_graph_v2', 'llm_structured_v2', 'deterministic_fallback']).default('llm_structured_v2'),
  anchors: z.array(sequenceAnimaticContinuityPlannerAnchorSchema).default([]),
  continuityGraphV2: sequenceAnimaticContinuityGraphV2Schema.optional(),
  locationSets: z.array(sequenceAnimaticContinuityLocationSetSchema).default([]),
  locationAngles: z.array(sequenceAnimaticContinuityLocationAngleSchema).default([]),
  sceneGraph: sequenceAnimaticContinuitySceneGraphSchema.default({ nodes: [], edges: [] }),
  shotBindings: z.record(z.string(), sequenceAnimaticContinuityShotBindingSchema).default({}),
  rejectedCandidates: z.array(sequenceAnimaticContinuityRejectedCandidateSchema).default([]),
  warnings: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
})

export type SequenceAnimaticContinuityAnchor = {
  id: string
  name: string
  anchorType: 'prop' | 'location_spot' | 'character'
  continuitySubtype?: 'prop' | 'location_set' | 'location_angle' | 'location_spot' | 'character'
  baseLocationRefId?: string | null
  summary: string
  visualBrief: string
  persistenceReason?: string
  confidence?: number
  sourceEvidence?: string[]
  existingWorldEntityMatch?: string | null
  rejectionRisk?: string
  shotIds: string[]
  storyboardBlockIds: string[]
  usageCount: number
  setId?: string | null
  angleId?: string | null
  connectedTo?: string[]
  entryFrom?: string[]
  visibleFrom?: string[]
  relationshipHints?: string[]
  sourcePhrases?: string[]
  assetKey?: string | null
  artifactKey?: string | null
  sourceAtlasAssetKey?: string | null
  cropRect?: Record<string, number> | null
}

export function sequenceAnimaticGraphLocationRefsFromContext(context: Record<string, unknown>) {
  return readArray(context.existingWorldReferences).map(asRecord)
    .filter((entry) => /\b(place|location|environment|set)\b/i.test(readText(entry.type)))
    .map((entry) => ({
      id: readText(entry.key),
      name: readText(entry.name) || readText(entry.key),
      summary: compactSequenceAnimaticText(entry.summary, 360),
      visualSummary: compactSequenceAnimaticText(entry.visualSummary, 420),
    }))
    .filter((entry, index, values) => entry.id && values.findIndex((candidate) => candidate.id === entry.id) === index)
}

export function continuityBlockNodeSuffix(nodeKey: string) {
  return /^continuity_block_(\d+)_/.exec(nodeKey)?.[1] ?? ''
}

export function previousContinuityGraphNodeKeys(blockSuffix: string) {
  const blockNumber = Number.parseInt(blockSuffix, 10)
  if (!Number.isFinite(blockNumber) || blockNumber <= 1) return ['continuity_global_merge', 'continuity_seed_graph']
  return [`continuity_block_${String(blockNumber - 1).padStart(3, '0')}_merge`, 'continuity_global_merge', 'continuity_seed_graph']
}

export function sequenceAnimaticEmptyGraphV2(context: Record<string, unknown> = {}) {
  return sequenceAnimaticContinuityGraphV2Schema.parse({
    version: 'sequence_animatic_continuity_graph_v2',
    planningMode: 'block_graph_v2',
    worldLocationRefs: sequenceAnimaticGraphLocationRefsFromContext(context),
    locationSets: [],
    zones: [],
    spots: [],
    viewpoints: [],
    angles: [],
    edges: [],
    shotBindings: {},
    assetAnchors: [],
    rejectedCandidates: [],
    blockSummaries: [],
    warnings: [],
    diagnostics: [],
  })
}

export function sequenceAnimaticBlockShots(context: Record<string, unknown>, block: Record<string, unknown>) {
  const explicitShotIds = readStringArray(block.shotIds)
  const shotIds = new Set(explicitShotIds.length > 0 ? explicitShotIds : readStringArray(block.shotBreakIds))
  const shots = readArray(context.shots).map(asRecord)
  return shotIds.size > 0 ? shots.filter((shot) => shotIds.has(readText(shot.id))) : shots
}

export function emptySequenceAnimaticContinuityBlockDelta(blockId: string, warning = '') {
  return sequenceAnimaticContinuityBlockDeltaSchema.parse({
    blockId,
    blockSummary: '',
    worldLocationRefs: [],
    locationSets: [],
    zones: [],
    spots: [],
    angles: [],
    edges: [],
    shotBindings: {},
    assetAnchors: [],
    rejectedCandidates: [],
    warnings: warning ? [warning] : [],
    diagnostics: [],
  })
}

export function sequenceAnimaticContinuityGraphStatusFromBlockStates(blockStates: Record<string, unknown>) {
  const states = Object.values(blockStates).map(asRecord)
  if (states.some((state) => readText(state.status) === 'failed')) return 'failed'
  if (states.some((state) => readText(state.status) === 'stale')) return 'stale'
  if (states.some((state) => readText(state.status) === 'ready' || readText(state.status) === 'needs_review')) return 'partial'
  if (states.some((state) => readText(state.status) === 'seeded')) return 'partial'
  return 'empty'
}

export function sequenceAnimaticGlobalStoryboardBlock(continuityPlannerContext: Record<string, unknown>) {
  const shots = readArray(continuityPlannerContext.shots).map(asRecord)
  return {
    id: 'global',
    title: 'Global continuity structure',
    summary: 'Compact all-shot continuity seed.',
    shotIds: shots.map((shot) => readText(shot.id)).filter(Boolean),
  }
}

const sequenceAnimaticDeterministicSpotPhrases = [
  'threshold',
  'doorway',
  'entrance',
  'hidden passage',
  'service gap',
  'service shaft',
  'central chamber',
  'leader chamber table',
  'long table',
  'map wall',
  'saltglass window',
  'porthole window',
  'catwalk',
  'platform',
  'rail',
  'corridor',
  'archive wall',
  'pipe lane',
  'clock face',
  'engine heart',
]

function sequenceAnimaticDeterministicSlug(...parts: unknown[]) {
  const slug = parts.map(readText).filter(Boolean).join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 84)
  return slug || 'output'
}

function sequenceAnimaticDeterministicSpatialRecord(shot: Record<string, unknown>) {
  return asRecord(shot.spatialContinuity ?? shot.spatial_continuity)
}

function compactSequenceAnimaticCameraForGraph(shot: Record<string, unknown>) {
  const camera = asRecord(shot.camera)
  return {
    framing: compactSequenceAnimaticText(camera.framing ?? shot.framing, 220),
    angle: compactSequenceAnimaticText(camera.angle ?? shot.cameraAngle, 220),
    movement: compactSequenceAnimaticText(camera.movement ?? shot.cameraMovement, 260),
  }
}

function sequenceAnimaticPersistentLightingCueForGraph(value: unknown) {
  const text = compactSequenceAnimaticText(value, 360)
  if (!text) return ''
  return /\b(lantern|torch|fire|candle|window|sun|moon|neon|monitor|screen|emergency|practical|lamp|spotlight|backlight|silhouette|strobe|flicker|glow from|shafts? of light)\b/i.test(text)
    ? text
    : ''
}

function sequenceAnimaticShotWorldLocationRefId(shot: Record<string, unknown>, graph: z.infer<typeof sequenceAnimaticContinuityGraphV2Schema>) {
  const resolvedLocation = asRecord(asRecord(shot.resolvedRefs).location)
  return readText(shot.worldLocationRefId)
    || readText(shot.locationRefId)
    || readText(resolvedLocation.key)
    || graph.worldLocationRefs[0]?.id
    || 'unknown_location'
}

function sequenceAnimaticGraphSetId(shot: Record<string, unknown>, worldLocationRefId: string) {
  return readText(shot.continuitySetId)
    || `set_${sequenceAnimaticDeterministicSlug(worldLocationRefId, 'primary')}`
}

function sequenceAnimaticGraphZoneSeed(shot: Record<string, unknown>, worldLocationRefId: string) {
  const spatial = sequenceAnimaticDeterministicSpatialRecord(shot)
  const physicalCandidates = [
    readText(shot.continuityZoneLabel),
    readText(spatial.subjectPosition),
    ...readStringArray(spatial.visibleLandmarks),
  ].filter(Boolean)
  const physicalCandidate = physicalCandidates.find((candidate) => sequenceAnimaticContinuityTextHasPhysicalLocationCue(candidate))
  return physicalCandidate || `${worldLocationRefId} action area`
}

function sequenceAnimaticGraphZoneId(shot: Record<string, unknown>, worldLocationRefId: string, setId: string) {
  return readText(shot.continuityZoneId)
    || `zone_${sequenceAnimaticDeterministicSlug(setId, sequenceAnimaticGraphZoneSeed(shot, worldLocationRefId)).slice(0, 64)}`
}

function sequenceAnimaticGraphAngleId(shot: Record<string, unknown>, setId: string, zoneId: string) {
  const camera = asRecord(shot.camera)
  return readText(shot.continuityAngleId)
    || `angle_${sequenceAnimaticDeterministicSlug(setId, zoneId, camera.framing, camera.angle, camera.movement).slice(0, 64)}`
}

function sequenceAnimaticGraphSpotIds(shot: Record<string, unknown>, zoneId: string) {
  const explicit = readStringArray(shot.continuitySpotIds)
  if (explicit.length > 0) return explicit
  const action = normalizeSequenceAnimaticReferenceText([shot.title, shot.action, shot.description].map(readText).filter(Boolean).join(' '))
  const phrases = sequenceAnimaticDeterministicSpotPhrases.filter((phrase) => action.includes(normalizeSequenceAnimaticReferenceText(phrase))).slice(0, 3)
  return phrases.length > 0
    ? phrases.map((phrase) => `spot_${sequenceAnimaticDeterministicSlug(zoneId, phrase).slice(0, 72)}`)
    : [`spot_${sequenceAnimaticDeterministicSlug(zoneId, 'primary').slice(0, 72)}`]
}

function sequenceAnimaticGraphShotBindingAnchorIds(graph: z.infer<typeof sequenceAnimaticContinuityGraphV2Schema>, shotId: string) {
  const characterAnchorIds: string[] = []
  const propAnchorIds: string[] = []
  graph.assetAnchors.forEach((anchor) => {
    if (!anchor.shotIds.includes(shotId)) return
    const id = readText(anchor.id)
    if (!id) return
    if (anchor.type === 'character') characterAnchorIds.push(id)
    if (anchor.type === 'prop') propAnchorIds.push(id)
  })
  return {
    characterAnchorIds: [...new Set(characterAnchorIds)],
    propAnchorIds: [...new Set(propAnchorIds)],
  }
}

function sequenceAnimaticContinuitySafePhysicalLabel(input: {
  fallbackPrefix: string
  worldLocationRefId: string
  shot: Record<string, unknown>
  lookup?: ReturnType<typeof buildSequenceAnimaticReferenceLookup>
}) {
  const spatial = sequenceAnimaticDeterministicSpatialRecord(input.shot)
  const candidates = [
    readText(input.shot.continuityZoneLabel),
    readText(spatial.subjectPosition),
    readText(spatial.cameraPosition),
    ...readStringArray(spatial.visibleLandmarks),
    readText(asRecord(asRecord(input.shot.resolvedRefs).location).name),
    sequenceAnimaticContinuityTitleFromRefLike(input.worldLocationRefId),
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (!sequenceAnimaticContinuityTextHasPhysicalLocationCue(candidate)) continue
    if (input.lookup && sequenceAnimaticCanonicalCharacterMatchForText(candidate, input.lookup)) continue
    return sequenceAnimaticContinuityTitleFromRefLike(candidate)
  }
  return `${sequenceAnimaticContinuityTitleFromRefLike(input.worldLocationRefId)} ${input.fallbackPrefix}`.trim()
}

export function buildDeterministicSequenceAnimaticBlockDelta(input: {
  graph: z.infer<typeof sequenceAnimaticContinuityGraphV2Schema>
  continuityPlannerContext: Record<string, unknown>
  storyboardBlock: Record<string, unknown>
  assetAnchors?: Array<z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>>
  fallbackReason?: string
}) {
  const blockId = readText(input.storyboardBlock.id) || readText(input.storyboardBlock.storyboardBlockId) || 'storyboard_block'
  const blockTitle = readText(input.storyboardBlock.title) || readText(input.storyboardBlock.summary) || blockId
  const shots = sequenceAnimaticBlockShots(input.continuityPlannerContext, input.storyboardBlock)
  const locationSets: Array<z.infer<typeof sequenceAnimaticContinuityGraphSetSchema>> = []
  const zones: Array<z.infer<typeof sequenceAnimaticContinuityGraphZoneSchema>> = []
  const spots: Array<z.infer<typeof sequenceAnimaticContinuityGraphSpotSchema>> = []
  const angles: Array<z.infer<typeof sequenceAnimaticContinuityGraphAngleSchema>> = []
  const edges: Array<z.infer<typeof sequenceAnimaticContinuityGraphEdgeSchema>> = []
  const shotBindings: Record<string, z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>> = {}
  const assetAnchors = (input.assetAnchors ?? []).map((anchor) => sequenceAnimaticContinuityPlannerAnchorSchema.parse(anchor))
  const rejectedCandidates: z.infer<typeof sequenceAnimaticContinuityRejectedCandidateSchema>[] = []
  const worldLocationRefs = [...input.graph.worldLocationRefs]
  const referenceLookup = sequenceAnimaticReferenceLookupFromPlannerContext(input.continuityPlannerContext)

  for (const shot of shots) {
    const shotId = readText(shot.id)
    if (!shotId) continue
    const spatial = sequenceAnimaticDeterministicSpatialRecord(shot)
    const camera = compactSequenceAnimaticCameraForGraph(shot)
    const worldLocationRefId = sequenceAnimaticShotWorldLocationRefId(shot, input.graph)
    if (worldLocationRefId && !worldLocationRefs.some((entry) => entry.id === worldLocationRefId)) {
      const resolvedLocation = asRecord(asRecord(shot.resolvedRefs).location)
      worldLocationRefs.push({
        id: worldLocationRefId,
        name: readText(resolvedLocation.name) || sequenceAnimaticContinuityTitleFromRefLike(worldLocationRefId),
        summary: compactSequenceAnimaticText(resolvedLocation.summary, 360),
        visualSummary: compactSequenceAnimaticText(resolvedLocation.visualSummary, 420),
      })
    }
    const setId = sequenceAnimaticGraphSetId(shot, worldLocationRefId)
    const zoneId = sequenceAnimaticGraphZoneId(shot, worldLocationRefId, setId)
    const spotIds = sequenceAnimaticGraphSpotIds(shot, zoneId)
    const angleId = sequenceAnimaticGraphAngleId(shot, setId, zoneId)
    const zoneName = sequenceAnimaticContinuitySafePhysicalLabel({
      fallbackPrefix: 'action zone',
      worldLocationRefId,
      shot,
      lookup: referenceLookup,
    })
    const spotName = sequenceAnimaticContinuitySafePhysicalLabel({
      fallbackPrefix: 'primary spot',
      worldLocationRefId,
      shot,
      lookup: referenceLookup,
    })
    const angleName = [
      sequenceAnimaticContinuitySafePhysicalLabel({
        fallbackPrefix: 'camera angle',
        worldLocationRefId,
        shot,
        lookup: referenceLookup,
      }),
      camera.framing || camera.angle || camera.movement ? 'camera angle' : '',
    ].filter(Boolean).join(' ')
    const shotIds = [shotId]
    const storyboardBlockIds = [blockId].filter(Boolean)
    locationSets.push({
      id: setId,
      worldLocationRefId,
      name: `${sequenceAnimaticContinuityTitleFromRefLike(worldLocationRefId)} primary set`,
      visualBrief: compactSequenceAnimaticText(readText(asRecord(asRecord(shot.resolvedRefs).location).visualSummary) || readText(shot.action), 700),
      shotIds,
      storyboardBlockIds,
    })
    zones.push({
      id: zoneId,
      setId,
      worldLocationRefId,
      name: zoneName,
      visualBrief: compactSequenceAnimaticText(readText(shot.action) || readText(shot.description), 700),
      shotIds,
      storyboardBlockIds,
    })
    for (const spotId of spotIds) {
      spots.push({
        id: spotId,
        zoneId,
        setId,
        worldLocationRefId,
        name: spotId.includes('primary') ? spotName : sequenceAnimaticContinuityTitleFromRefLike(spotId.replace(/^spot_/, '')),
        visualBrief: compactSequenceAnimaticText(readText(shot.action) || readText(shot.description), 520),
        landmarks: readStringArray(spatial.visibleLandmarks),
        shotIds,
        storyboardBlockIds,
      })
      edges.push({ sourceId: zoneId, targetId: spotId, relationship: 'contains', evidence: `Shot ${shotId} occurs at this spot.`, direction: '', screenDirection: '' })
    }
    angles.push({
      id: angleId,
      setId,
      zoneId,
      spotIds,
      worldLocationRefId,
      name: angleName || `${sequenceAnimaticContinuityTitleFromRefLike(worldLocationRefId)} camera angle`,
      visualBrief: compactSequenceAnimaticText([readText(shot.action), camera.framing, camera.angle, camera.movement].filter(Boolean).join(' '), 700),
      framing: camera.framing,
      cameraPosition: readText(spatial.cameraPosition),
      facingDirection: readText(spatial.facingDirection) || camera.angle,
      subjectPosition: readText(spatial.subjectPosition),
      visibleLandmarks: readStringArray(spatial.visibleLandmarks),
      lightingDirection: readText(spatial.lightSourceDirection) || sequenceAnimaticPersistentLightingCueForGraph(shot.lighting),
      shotIds,
      storyboardBlockIds,
    })
    edges.push(
      { sourceId: setId, targetId: zoneId, relationship: 'contains', evidence: `Block ${blockId} uses this zone.`, direction: '', screenDirection: '' },
      { sourceId: angleId, targetId: zoneId, relationship: 'same_space_angle', evidence: `Shot ${shotId} camera coverage.`, direction: '', screenDirection: '' },
      { sourceId: angleId, targetId: spotIds[0] ?? zoneId, relationship: 'camera_faces', evidence: `Shot ${shotId} framing faces this spot.`, direction: '', screenDirection: '' },
    )

    const graphAnchorIds = sequenceAnimaticGraphShotBindingAnchorIds(input.graph, shotId)
    const characterAnchorIds = [
      ...graphAnchorIds.characterAnchorIds,
      ...assetAnchors.filter((anchor) => anchor.type === 'character' && anchor.shotIds.includes(shotId)).map((anchor) => readText(anchor.id)).filter(Boolean),
    ]
    const propAnchorIds = [
      ...graphAnchorIds.propAnchorIds,
      ...assetAnchors.filter((anchor) => anchor.type === 'prop' && anchor.shotIds.includes(shotId)).map((anchor) => readText(anchor.id)).filter(Boolean),
    ]
    shotBindings[shotId] = {
      shotId,
      storyboardBlockId: blockId,
      worldLocationRefId,
      setId,
      zoneId,
      primarySpotId: spotIds[0] ?? '',
      spotIds,
      viewpointId: angleId,
      angleId,
      characterAnchorIds: [...new Set(characterAnchorIds)],
      propAnchorIds: [...new Set(propAnchorIds)],
      assetAnchorIds: [...new Set([...characterAnchorIds, ...propAnchorIds])],
      spatialNodeIds: [...new Set([setId, zoneId, spotIds[0] ?? '', ...spotIds, angleId].filter(Boolean))],
      continuityAnchorIds: [...new Set([...characterAnchorIds, ...propAnchorIds])],
    }
  }

  return sequenceAnimaticContinuityBlockDeltaSchema.parse({
    blockId,
    blockSummary: `${blockTitle}: ${shots.length} shot${shots.length === 1 ? '' : 's'} spatially bound.`,
    worldLocationRefs,
    locationSets,
    zones,
    spots,
    angles,
    edges,
    shotBindings,
    assetAnchors,
    rejectedCandidates,
    warnings: input.fallbackReason ? [`Block continuity fallback used: ${input.fallbackReason}`] : [],
    diagnostics: [`Planned continuity scene graph delta for ${blockId}.`],
  })
}

export function parseSequenceAnimaticGraphV2(value: unknown): z.infer<typeof sequenceAnimaticContinuityGraphV2Schema> {
  const parsed = sequenceAnimaticContinuityGraphV2Schema.safeParse(value)
  if (!parsed.success) return sequenceAnimaticEmptyGraphV2()
  const viewpoints = parsed.data.viewpoints.length > 0 ? parsed.data.viewpoints : parsed.data.angles
  const angles = parsed.data.angles.length > 0 ? parsed.data.angles : viewpoints
  return sequenceAnimaticContinuityGraphV2Schema.parse({
    ...parsed.data,
    viewpoints,
    angles,
  })
}

export function sequenceAnimaticContinuityAnchorSemanticName(value: string) {
  return value
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function sequenceAnimaticContinuityAnchorSemanticKey(anchor: { type?: string; name?: string }) {
  const type = readText(anchor.type)
  const name = sequenceAnimaticContinuityAnchorSemanticName(readText(anchor.name))
  return type && name ? `${type}:${name}` : ''
}

export function sequenceAnimaticContinuityAnchorStableId(anchor: { type?: string; name?: string }) {
  const type = readText(anchor.type)
  const slug = sequenceAnimaticContinuityAnchorSemanticName(readText(anchor.name)).replace(/\s+/g, '_')
  if (!slug) return ''
  if (type === 'character') return `char_${slug}`
  if (type === 'prop') return `prop_${slug}`
  if (type === 'location_spot') return `spot_anchor_${slug}`
  if (type === 'location_set') return `set_anchor_${slug}`
  if (type === 'location_angle') return `angle_anchor_${slug}`
  return `anchor_${slug}`
}

function normalizeSequenceAnimaticAnchorName(value: unknown) {
  return readText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const sequenceAnimaticRuntimeNonCharacterSpeakerNames = new Set([
  'unknown',
  'narrator',
  'voiceover',
  'voice over',
  'offscreen voice',
  'crowd',
  'all',
])

function sequenceAnimaticTemporaryCharacterLooksSpecific(name: string, visualBrief = '') {
  const normalized = sequenceAnimaticContinuityAnchorSemanticName(`${name} ${visualBrief}`)
  if (!normalized || sequenceAnimaticRuntimeNonCharacterSpeakerNames.has(normalized)) return false
  if (/\b(crowd|workers|people|figures|extras|everyone|someone|anyone|voices|background)\b/i.test(normalized)) return false
  return /\b(mechanic|worker|courier|cashier|shopkeeper|guard|watchman|attendant|scribe|clerk|messenger|apprentice|elder|old|young|vole|puffin|mouse|rat|otter|mole|badger|fox|bird)\b/i.test(normalized)
}

function sequenceAnimaticTemporaryCharacterEvidenceIsVisible(sourceEvidence: string[]) {
  const evidenceText = sourceEvidence.join(' ')
  return /\b(visible|nearby|beside|behind|below|above|foreground|background|passes|stands|sits|walks|crosses|looks|glances|ignores|reacts|speaks|asks|says|dialogue|worker|mechanic|courier|guard|attendant)\b/i.test(evidenceText)
}

function sequenceAnimaticShouldKeepSingleUseTemporaryCharacter(input: {
  name: string
  visualBrief?: string
  sourceEvidence: string[]
  existingWorldEntityMatch?: string | null
}) {
  if (readText(input.existingWorldEntityMatch)) return false
  return sequenceAnimaticTemporaryCharacterLooksSpecific(input.name, input.visualBrief)
    && sequenceAnimaticTemporaryCharacterEvidenceIsVisible(input.sourceEvidence)
}

const sequenceAnimaticContinuityPropInteractionPattern = /\b(activates?|adjusts?|aims?|attaches?|breaks?|carries|carry|checks?|clicks?|compares?|connects?|cuts?|diagnoses?|drags?|drops?|examines?|fails?|fixes?|flips?|grabs?|grips?|hands?|hangs?|hits?|holds?|holding|inserts?|jerks?|lifts?|locks?|lowers?|manipulates?|moves?|opens?|passes?|places?|points?|presses?|pulls?|pushes?|raises?|reads?|repairs?|reveals?|rises?|seals?|sets?|shuts?|slides?|snaps?|strikes?|takes?|taps?|throws?|touches?|turns?|twists?|unlocks?|uses?|watches?|wrenches?|writes?|gaze|gazes|look|looks|stares?)\b/i

const sequenceAnimaticContinuityPropNameStopWords = new Set([
  'the',
  'and',
  'with',
  'from',
  'into',
  'onto',
  'near',
  'over',
  'under',
  'side',
  'small',
  'large',
  'old',
  'new',
  'primary',
])

function sequenceAnimaticContinuityPropNameTokens(value: unknown) {
  return sequenceAnimaticContinuityAnchorSemanticName(readText(value))
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !sequenceAnimaticContinuityPropNameStopWords.has(token))
}

function sequenceAnimaticContinuityShotEvidenceText(shot: Record<string, unknown>) {
  const dialogue = readArray(shot.dialogue).map(asRecord)
    .map((line) => `${readText(line.speakerName)} ${readText(line.text)}`)
    .filter(Boolean)
    .join(' ')
  return [
    shot.description,
    shot.action,
    shot.actionLine,
    shot.title,
    dialogue,
  ].map(readText).filter(Boolean).join(' ')
}

function sequenceAnimaticContinuityPropMentionedInText(anchor: z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>, text: string) {
  const normalized = sequenceAnimaticContinuityAnchorSemanticName(text)
  const name = sequenceAnimaticContinuityAnchorSemanticName(anchor.name)
  if (name && normalized.includes(name)) return true
  const tokens = sequenceAnimaticContinuityPropNameTokens(anchor.name)
  if (tokens.length === 0) return false
  return tokens.some((token) => normalized.includes(token))
}

export function sequenceAnimaticContinuityPropHasInteractionEvidence(input: {
  anchor: z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>
  continuityPlannerContext: Record<string, unknown>
  existingGraphAnchors?: z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>[]
}) {
  const anchorKey = sequenceAnimaticContinuityAnchorSemanticKey(input.anchor)
  const matchingExisting = (input.existingGraphAnchors ?? []).filter((entry) => sequenceAnimaticContinuityAnchorSemanticKey(entry) === anchorKey)
  const shotIds = [...new Set([
    ...input.anchor.shotIds,
    ...matchingExisting.flatMap((entry) => entry.shotIds),
    ...readArray(input.continuityPlannerContext.shots).map(asRecord)
      .filter((shot) => sequenceAnimaticContinuityPropMentionedInText(input.anchor, sequenceAnimaticContinuityShotEvidenceText(shot)))
      .map((shot) => readText(shot.id)),
  ].map(readText).filter(Boolean))]
  if (shotIds.length < 2) {
    return {
      keep: false,
      reason: 'single_use_not_story_critical' as z.infer<typeof sequenceAnimaticContinuityRejectedReasonSchema>,
      shotIds,
      evidence: readStringArray(input.anchor.sourceEvidence),
    }
  }

  const shotById = new Map(readArray(input.continuityPlannerContext.shots).map(asRecord).map((shot) => [readText(shot.id), shot]))
  const evidenceTexts = [
    ...readStringArray(input.anchor.sourceEvidence),
    ...matchingExisting.flatMap((entry) => readStringArray(entry.sourceEvidence)),
  ]
  const interactionShotIds = new Set<string>()

  for (const shotId of shotIds) {
    const shot = shotById.get(shotId)
    const shotText = shot ? sequenceAnimaticContinuityShotEvidenceText(shot) : ''
    const sourceEvidence = evidenceTexts.filter((entry) => readText(entry).includes(shotId)).join(' ')
    const combined = [shotText, sourceEvidence].filter(Boolean).join(' ')
    if (!sequenceAnimaticContinuityPropInteractionPattern.test(combined)) continue
    if (!sequenceAnimaticContinuityPropMentionedInText(input.anchor, combined)) continue
    interactionShotIds.add(shotId)
  }

  if (interactionShotIds.size < 2) {
    return {
      keep: false,
      reason: 'low_confidence' as z.infer<typeof sequenceAnimaticContinuityRejectedReasonSchema>,
      shotIds,
      evidence: evidenceTexts,
    }
  }

  return { keep: true, reason: null, shotIds, evidence: evidenceTexts }
}

export function sequenceAnimaticContinuityAnchorFromRejectedCandidate(input: {
  rejected: z.infer<typeof sequenceAnimaticContinuityRejectedCandidateSchema>
  continuityPlannerContext: Record<string, unknown>
  existingGraphAnchors: z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>[]
}) {
  const rejected = input.rejected
  const type = readText(rejected.type)
  if (type !== 'character' && type !== 'prop') return null
  if (!['single_use_not_story_critical', 'low_confidence', 'too_generic'].includes(rejected.reason)) return null
  const name = normalizeSequenceAnimaticAnchorName(rejected.name)
  if (!name) return null
  const sourceEvidence = readStringArray(rejected.sourceEvidence)
  const shotIds = readStringArray(rejected.shotIds)
  const visualBrief = type === 'character'
    ? `${name}, specific visible incidental supporting character; preserve species, body shape, age cue, clothing, silhouette, and working-role details.`
    : `${name}, physical prop continuity reference; preserve form, material, scale, damage/wear, and readable functional details.`
  const baseAnchor = sequenceAnimaticContinuityPlannerAnchorSchema.parse({
    id: sequenceAnimaticContinuityAnchorStableId({ type, name }),
    type,
    name,
    visualBrief,
    persistenceReason: type === 'character'
      ? 'Specific visible incidental character with no canonical world entity; keep design consistent for storyboard continuity.'
      : 'Repeated physical prop with direct action or character-interaction evidence; keep design consistent across shots.',
    confidence: type === 'character' ? 0.72 : 0.68,
    shotIds,
    storyboardBlockIds: [],
    sourceEvidence,
    existingWorldEntityMatch: readText(rejected.existingWorldEntityMatch) || null,
    rejectionRisk: `Recovered from LLM ${rejected.reason} rejection after GraphCore continuity validation.`,
  })
  if (type === 'character') {
    return sequenceAnimaticShouldKeepSingleUseTemporaryCharacter({
      name,
      visualBrief,
      sourceEvidence,
      existingWorldEntityMatch: baseAnchor.existingWorldEntityMatch,
    })
      ? baseAnchor
      : null
  }
  const propCheck = sequenceAnimaticContinuityPropHasInteractionEvidence({
    anchor: baseAnchor,
    continuityPlannerContext: input.continuityPlannerContext,
    existingGraphAnchors: input.existingGraphAnchors,
  })
  return propCheck.keep
    ? sequenceAnimaticContinuityPlannerAnchorSchema.parse({
      ...baseAnchor,
      shotIds: propCheck.shotIds,
      sourceEvidence: propCheck.evidence.length > 0 ? propCheck.evidence : sourceEvidence,
    })
    : null
}

function sequenceAnimaticContinuityReferenceTextKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function sequenceAnimaticRuntimeSlugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'output'
}

function sequenceAnimaticRuntimeAnchorId(prefix: 'prop' | 'spot' | 'char', name: string, baseLocationRefId = '') {
  const base = [baseLocationRefId, name].filter(Boolean).join(' ')
  return `${prefix}_${sequenceAnimaticRuntimeSlugify(base).slice(0, 72)}`
}

function sequenceAnimaticRuntimeTitleFromRefLike(value: string) {
  return normalizeSequenceAnimaticAnchorName(value)
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function sequenceAnimaticRuntimeAssetPackEntities(assetPack: Record<string, unknown>) {
  return readArray(assetPack.entities).map(asRecord)
}

function sequenceAnimaticRuntimeKnownEntityAliases(assetPack: Record<string, unknown>) {
  const aliases = new Map<string, string>()
  sequenceAnimaticRuntimeAssetPackEntities(assetPack).forEach((entity) => {
    const key = readText(entity.key)
    const values = [
      key,
      readText(entity.name),
      readText(entity.label),
      ...readStringArray(entity.aliases),
      ...readStringArray(asRecord(entity.metadata).aliases),
    ].map(sequenceAnimaticContinuityReferenceTextKey).filter(Boolean)
    values.forEach((value) => {
      if (key && value) aliases.set(value, key)
    })
  })
  return aliases
}

function sequenceAnimaticRuntimeWorldEntityVisualSource(entity: Record<string, unknown>) {
  return {
    summary: readText(entity.summary),
    context: readText(entity.context),
    metadata: asRecord(entity.metadata),
    customProperties: asRecord(entity.customProperties ?? entity.custom_properties),
  }
}

function readSequenceAnimaticRuntimeEntityVisualDescription(entity: Record<string, unknown>) {
  return readWorldEntityVisualDescription(sequenceAnimaticRuntimeWorldEntityVisualSource(entity))
    || readText(entity.visualDescription)
}

const sequenceAnimaticRuntimeAbstractContinuityTerms = new Set([
  'rain',
  'fog',
  'mist',
  'smoke',
  'tension',
  'silence',
  'ambience',
  'ambiance',
  'atmosphere',
  'mood',
  'danger',
  'blue light',
  'red light',
  'lighting',
  'shadow',
  'shadows',
  'darkness',
  'wind',
  'motion',
  'movement',
  'music',
  'score',
  'room tone',
])

function sequenceAnimaticRuntimeContinuityAbstractReason(name: string, visualBrief = '') {
  const normalized = sequenceAnimaticContinuityReferenceTextKey(name) || sequenceAnimaticContinuityReferenceTextKey(visualBrief)
  if (!normalized) return 'too_generic'
  for (const term of sequenceAnimaticRuntimeAbstractContinuityTerms) {
    const normalizedTerm = sequenceAnimaticContinuityReferenceTextKey(term)
    if (normalized === normalizedTerm || normalized.includes(` ${normalizedTerm} `) || normalized.startsWith(`${normalizedTerm} `) || normalized.endsWith(` ${normalizedTerm}`)) {
      return 'abstract_or_atmospheric'
    }
  }
  const words = normalized.split(' ').filter(Boolean)
  if (words.length <= 1 && ['door', 'wall', 'floor', 'window', 'table', 'room', 'corridor', 'hall', 'light'].includes(normalized)) return 'too_generic'
  return ''
}

function sequenceAnimaticRuntimeShotSearchText(shot: Record<string, unknown>) {
  const dialogue = readArray(shot.dialogue).map(asRecord)
    .map((line) => `${readText(line.speakerName)} ${readText(line.text)}`)
    .join(' ')
  const camera = asRecord(shot.camera)
  return [
    shot.id,
    shot.title,
    shot.description,
    shot.action,
    shot.caption,
    shot.storyboardPanelPrompt,
    shot.videoDirection,
    shot.lighting,
    shot.mood,
    camera.framing,
    camera.angle,
    camera.movement,
    dialogue,
  ].map(readText).filter(Boolean).join(' ')
}

function sequenceAnimaticRuntimeShotPropSearchText(shot: Record<string, unknown>) {
  const dialogue = readArray(shot.dialogue).map(asRecord)
    .map((line) => `${readText(line.speakerName)} ${readText(line.text)}`)
    .join(' ')
  const camera = asRecord(shot.camera)
  return [
    shot.id,
    shot.title,
    shot.description,
    shot.action,
    shot.caption,
    shot.storyboardPanelPrompt,
    shot.videoDirection,
    camera.framing,
    camera.angle,
    camera.movement,
    dialogue,
  ].map(readText).filter(Boolean).join(' ')
}

const sequenceAnimaticRuntimePropPhrases = [
  'tide dial',
  'broken tide dial',
  'saltglass atlas',
  'saltglass gauge',
  'brass keys',
  'hidden latch',
  'map threads',
  'stitched map',
  'wall map',
  'schematic',
  'metal shard',
  'inspection slate',
  'tool-belt satchel',
  'brass tool-belt',
  'mail tube',
  'paper notices',
  'wet slips',
  'hatch door',
  'sealed hatch',
  'access hatch',
  'sight-tube water',
  'sight tube water',
  'sight tube',
  'water tube',
  'clock hand',
  'bell hammer',
  'clock dial',
  'clock mechanism',
  'chime arm',
  'dead chime-arm',
  'escapement',
  'timing gear',
  'gear assembly',
  'clamp',
  'leak clamp',
  'lantern',
  'oilskin lantern',
]

const sequenceAnimaticRuntimeImportantSinglePropPhrases = new Set([
  'broken tide dial',
  'saltglass atlas',
  'saltglass gauge',
  'brass keys',
  'hidden latch',
  'metal shard',
  'inspection slate',
  'hatch door',
  'sealed hatch',
  'access hatch',
  'sight-tube water',
  'sight tube water',
  'sight tube',
  'water tube',
  'clock hand',
  'bell hammer',
  'clock dial',
  'clock mechanism',
  'chime arm',
  'dead chime-arm',
])

const sequenceAnimaticRuntimeSpotPhrases = [
  'threshold',
  'doorway',
  'entrance',
  'hidden passage',
  'service gap',
  'service shaft',
  'central chamber',
  'leader chamber table',
  'long table',
  'map wall',
  'saltglass window',
  'porthole window',
  'catwalk',
  'platform',
  'rail',
  'corridor',
  'archive wall',
  'pipe lane',
  'clock face',
  'engine heart',
]

const sequenceAnimaticRuntimeImportantSingleSpotPhrases = new Set([
  'hidden passage',
  'service shaft',
  'central chamber',
  'leader chamber table',
  'map wall',
  'saltglass window',
  'engine heart',
])

const sequenceAnimaticRuntimeIncidentalCharacterPhrases = [
  'vole mechanic',
  'elder mechanic',
  'old mechanic',
  'courier',
  'puffin courier',
  'cashier',
  'shopkeeper',
  'guard',
  'watchman',
  'attendant',
  'scribe',
  'clerk',
  'messenger',
  'apprentice',
]

function sequenceAnimaticRuntimeAnchorUsageFromPhrase(shots: Record<string, unknown>[], phrase: string) {
  const normalizedPhrase = sequenceAnimaticContinuityReferenceTextKey(phrase)
  return shots.filter((shot) => sequenceAnimaticContinuityReferenceTextKey(sequenceAnimaticRuntimeShotSearchText(shot)).includes(normalizedPhrase))
}

function sequenceAnimaticRuntimePropAnchorUsageFromPhrase(shots: Record<string, unknown>[], phrase: string) {
  const normalizedPhrase = sequenceAnimaticContinuityReferenceTextKey(phrase)
  return shots.filter((shot) => sequenceAnimaticContinuityReferenceTextKey(sequenceAnimaticRuntimeShotPropSearchText(shot)).includes(normalizedPhrase))
}

export function collectSequenceAnimaticContinuityAnchors(input: {
  shotPlan: Record<string, unknown>
  shotBreakPlan: Record<string, unknown>
  assetPack: Record<string, unknown>
}) {
  const shots = readArray(input.shotPlan.shots).map(asRecord)
  const groups = readArray(input.shotBreakPlan.groups).map(asRecord)
  const groupIdByShotId = new Map<string, string>()
  groups.forEach((group, index) => {
    const groupId = readText(group.id) || `cinematic_v3_storyboard_group_${String(index + 1).padStart(3, '0')}`
    readStringArray(group.shotBreakIds).forEach((shotId) => groupIdByShotId.set(shotId, groupId))
  })
  const entities = sequenceAnimaticRuntimeAssetPackEntities(input.assetPack)
  const entityByKey = new Map(entities.map((entity) => [readText(entity.key), entity] as const).filter(([key]) => key))
  const knownCharacterAliases = new Set<string>()
  entities.forEach((entity) => {
    const type = readText(entity.type) || readText(entity.nodeType) || readText(entity.entityType)
    const role = readText(entity.role)
    const looksCharacter = ['character', 'person', 'cast', 'actor'].some((token) => type.toLowerCase().includes(token) || role.toLowerCase().includes(token))
    if (!looksCharacter) return
    ;[entity.key, entity.name, entity.label].map(readText).filter(Boolean).forEach((value) => {
      knownCharacterAliases.add(sequenceAnimaticContinuityReferenceTextKey(value))
      const parts = sequenceAnimaticContinuityReferenceTextKey(value).split('_').filter((part) => part.length >= 3)
      if (parts.length > 1) {
        knownCharacterAliases.add(parts[0])
        knownCharacterAliases.add(parts[parts.length - 1])
      }
    })
  })
  const anchorById = new Map<string, SequenceAnimaticContinuityAnchor>()
  const addAnchor = (anchor: SequenceAnimaticContinuityAnchor) => {
    const existing = anchorById.get(anchor.id)
    if (!existing) {
      anchorById.set(anchor.id, anchor)
      return
    }
    existing.shotIds = [...new Set([...existing.shotIds, ...anchor.shotIds])]
    existing.storyboardBlockIds = [...new Set([...existing.storyboardBlockIds, ...anchor.storyboardBlockIds])]
    existing.usageCount = Math.max(existing.usageCount, existing.shotIds.length)
    existing.sourcePhrases = [...new Set([...(existing.sourcePhrases ?? []), ...(anchor.sourcePhrases ?? [])])]
  }
  const anchorFromShotRefs = new Map<string, Set<string>>()
  shots.forEach((shot) => {
    const shotId = readText(shot.id)
    readStringArray(shot.propRefIds).forEach((propId) => {
      if (!entityByKey.has(propId)) return
      const set = anchorFromShotRefs.get(propId) ?? new Set<string>()
      if (shotId) set.add(shotId)
      anchorFromShotRefs.set(propId, set)
    })
  })
  anchorFromShotRefs.forEach((shotIdSet, propId) => {
    if (shotIdSet.size < 2) return
    const entity = entityByKey.get(propId) ?? {}
    const name = readText(entity.name) || sequenceAnimaticRuntimeTitleFromRefLike(propId)
    const shotIds = [...shotIdSet]
    addAnchor({
      id: sequenceAnimaticRuntimeAnchorId('prop', name),
      name,
      anchorType: 'prop',
      summary: `Reusable prop continuity reference for ${name}.`,
      visualBrief: readSequenceAnimaticRuntimeEntityVisualDescription(entity) || readText(entity.summary) || `${name}, isolated reusable prop reference.`,
      shotIds,
      storyboardBlockIds: [...new Set(shotIds.map((shotId) => groupIdByShotId.get(shotId) ?? '').filter(Boolean))],
      usageCount: shotIds.length,
      sourcePhrases: [propId],
    })
  })
  shots.forEach((shot) => {
    const shotId = readText(shot.id)
    const structuredAnchors = [
      ...readArray(shot.continuityAnchors),
      ...readArray(shot.plannedContinuityAnchors),
      ...readArray(shot.temporaryReferenceAnchors),
    ].map(asRecord)
    structuredAnchors.forEach((entry) => {
      const rawType = readText(entry.anchorType) || readText(entry.type)
      const anchorType = rawType === 'character' || rawType === 'prop' || rawType === 'location_spot'
        ? rawType
        : rawType.includes('location') ? 'location_spot' : rawType.includes('char') ? 'character' : 'prop'
      const name = readText(entry.name) || readText(entry.label) || readText(entry.id)
      if (!name) return
      const shotIds = [...new Set([shotId, ...readStringArray(entry.shotIds)].filter(Boolean))]
      addAnchor({
        id: readText(entry.id) || sequenceAnimaticRuntimeAnchorId(anchorType === 'location_spot' ? 'spot' : anchorType === 'character' ? 'char' : 'prop', name, readText(entry.baseLocationRefId)),
        name,
        anchorType,
        baseLocationRefId: readText(entry.baseLocationRefId) || null,
        summary: readText(entry.summary) || `Structured ${anchorType.replace(/_/g, ' ')} continuity reference for ${name}.`,
        visualBrief: readText(entry.visualBrief) || readText(entry.visualDescription) || readText(entry.summary) || `${name}, reusable continuity reference for storyboard consistency.`,
        shotIds,
        storyboardBlockIds: [...new Set(shotIds.map((id) => groupIdByShotId.get(id) ?? '').filter(Boolean))],
        usageCount: Math.max(1, shotIds.length),
        sourcePhrases: [readText(entry.source) || 'structured_shot_anchor'],
      })
    })
  })
  const temporaryCharacterShotIds = new Map<string, Set<string>>()
  const temporaryCharacterNames = new Map<string, string>()
  const addTemporaryCharacterUsage = (name: string, shotId: string) => {
    const normalizedName = normalizeSequenceAnimaticAnchorName(name)
    const lookup = sequenceAnimaticContinuityReferenceTextKey(normalizedName)
    if (!normalizedName || !lookup || sequenceAnimaticRuntimeNonCharacterSpeakerNames.has(lookup.replace(/_/g, ' ')) || knownCharacterAliases.has(lookup)) return
    const set = temporaryCharacterShotIds.get(lookup) ?? new Set<string>()
    if (shotId) set.add(shotId)
    temporaryCharacterShotIds.set(lookup, set)
    if (!temporaryCharacterNames.has(lookup)) temporaryCharacterNames.set(lookup, sequenceAnimaticRuntimeTitleFromRefLike(normalizedName))
  }
  shots.forEach((shot) => {
    const shotId = readText(shot.id)
    readArray(shot.dialogue).map(asRecord).forEach((line) => {
      const speakerRefId = readText(line.speakerRefId) || readText(line.characterRefId)
      if (speakerRefId && entityByKey.has(speakerRefId)) return
      const speakerName = readText(line.speakerName) || readText(line.speaker) || readText(line.characterName)
      addTemporaryCharacterUsage(speakerName, shotId)
    })
    const searchText = sequenceAnimaticContinuityReferenceTextKey(sequenceAnimaticRuntimeShotSearchText(shot))
    sequenceAnimaticRuntimeIncidentalCharacterPhrases.forEach((phrase) => {
      if (searchText.includes(sequenceAnimaticContinuityReferenceTextKey(phrase))) addTemporaryCharacterUsage(phrase, shotId)
    })
  })
  temporaryCharacterShotIds.forEach((shotIdSet, lookup) => {
    if (shotIdSet.size < 1) return
    const name = temporaryCharacterNames.get(lookup) ?? sequenceAnimaticRuntimeTitleFromRefLike(lookup)
    const shotIds = [...shotIdSet]
    addAnchor({
      id: sequenceAnimaticRuntimeAnchorId('char', name),
      name,
      anchorType: 'character',
      summary: `Temporary character continuity reference for ${name}.`,
      visualBrief: `${name}, temporary supporting character design for storyboard continuity. Show a clean readable half-body or full-body character reference, consistent species/age/wardrobe/silhouette, neutral pose, no text.`,
      shotIds,
      storyboardBlockIds: [...new Set(shotIds.map((shotId) => groupIdByShotId.get(shotId) ?? '').filter(Boolean))],
      usageCount: shotIds.length,
      sourcePhrases: [name],
    })
  })
  sequenceAnimaticRuntimePropPhrases.forEach((phrase) => {
    const usedShots = sequenceAnimaticRuntimePropAnchorUsageFromPhrase(shots, phrase)
    if (usedShots.length < (sequenceAnimaticRuntimeImportantSinglePropPhrases.has(phrase) ? 1 : 2)) return
    const shotIds = usedShots.map((shot) => readText(shot.id)).filter(Boolean)
    const name = sequenceAnimaticRuntimeTitleFromRefLike(phrase)
    addAnchor({
      id: sequenceAnimaticRuntimeAnchorId('prop', name),
      name,
      anchorType: 'prop',
      summary: `Reusable prop continuity reference for ${name}.`,
      visualBrief: `${name}, clean isolated prop reference, consistent shape, material, scale, color, and worn detail for reuse across shots.`,
      shotIds,
      storyboardBlockIds: [...new Set(shotIds.map((shotId) => groupIdByShotId.get(shotId) ?? '').filter(Boolean))],
      usageCount: shotIds.length,
      sourcePhrases: [phrase],
    })
  })
  sequenceAnimaticRuntimeSpotPhrases.forEach((phrase) => {
    const usedShots = sequenceAnimaticRuntimeAnchorUsageFromPhrase(shots, phrase)
    if (usedShots.length < (sequenceAnimaticRuntimeImportantSingleSpotPhrases.has(phrase) ? 1 : 2)) return
    const shotIds = usedShots.map((shot) => readText(shot.id)).filter(Boolean)
    const firstShot = usedShots[0] ?? {}
    const baseLocationRefId = readText(firstShot.locationRefId) || null
    const name = sequenceAnimaticRuntimeTitleFromRefLike(phrase)
    const connectedTo = sequenceAnimaticRuntimeSpotPhrases
      .filter((other) => other !== phrase && usedShots.some((shot) => sequenceAnimaticContinuityReferenceTextKey(sequenceAnimaticRuntimeShotSearchText(shot)).includes(sequenceAnimaticContinuityReferenceTextKey(other))))
      .map(sequenceAnimaticRuntimeTitleFromRefLike)
      .slice(0, 4)
    addAnchor({
      id: sequenceAnimaticRuntimeAnchorId('spot', name, baseLocationRefId ?? ''),
      name,
      anchorType: 'location_spot',
      baseLocationRefId,
      summary: `Reusable set-continuity spot for ${name}.`,
      visualBrief: `${name} inside ${baseLocationRefId ? sequenceAnimaticRuntimeTitleFromRefLike(baseLocationRefId) : 'the base location'}, cinematic set-reference angle, clear entrances, surfaces, lighting direction, scale, and spatial relation to adjacent areas.`,
      shotIds,
      storyboardBlockIds: [...new Set(shotIds.map((shotId) => groupIdByShotId.get(shotId) ?? '').filter(Boolean))],
      usageCount: shotIds.length,
      connectedTo,
      entryFrom: phrase.includes('entrance') || phrase.includes('threshold') || phrase.includes('door') ? connectedTo : [],
      visibleFrom: connectedTo,
      relationshipHints: connectedTo.map((target) => `${name} visible/connected to ${target}`),
      sourcePhrases: [phrase],
    })
  })
  const anchors = [...anchorById.values()]
    .map((anchor) => ({ ...anchor, shotIds: [...new Set(anchor.shotIds)], storyboardBlockIds: [...new Set(anchor.storyboardBlockIds)] }))
    .sort((left, right) => right.usageCount - left.usageCount || left.id.localeCompare(right.id))
    .slice(0, 18)
  const characterAnchors = anchors.filter((anchor) => anchor.anchorType === 'character').slice(0, 9)
  const propAnchors = anchors.filter((anchor) => anchor.anchorType === 'prop').slice(0, 9)
  const locationSpotAnchors = anchors.filter((anchor) => anchor.anchorType === 'location_spot').slice(0, 9)
  const selectedAnchors = [...characterAnchors, ...propAnchors, ...locationSpotAnchors]
  const continuityAnchorIdsByShotId: Record<string, string[]> = {}
  selectedAnchors.forEach((anchor) => {
    anchor.shotIds.forEach((shotId) => {
      continuityAnchorIdsByShotId[shotId] = [...new Set([...(continuityAnchorIdsByShotId[shotId] ?? []), anchor.id])]
    })
  })
  return {
    version: 'sequence_animatic_continuity_plan_v2',
    planningMode: 'deterministic_fallback',
    llmRepairUsed: false,
    anchors: selectedAnchors,
    locationSets: [],
    locationAngles: [],
    sceneGraph: { nodes: [], edges: [] },
    rejectedCandidates: [],
    characterAnchors,
    propAnchors,
    locationSpotAnchors,
    continuityAnchorIdsByShotId,
    shotContinuityMap: continuityAnchorIdsByShotId,
    warnings: ['Continuity planner used deterministic fallback extraction; review anchors before relying on them for detailed continuity.'],
    diagnostics: [
      `Planned ${characterAnchors.length} temporary character anchor${characterAnchors.length === 1 ? '' : 's'}, ${propAnchors.length} prop continuity anchor${propAnchors.length === 1 ? '' : 's'}, and ${locationSpotAnchors.length} location spot anchor${locationSpotAnchors.length === 1 ? '' : 's'}.`,
    ],
  }
}

function sequenceAnimaticPlannerAnchorFromLegacyAnchor(anchor: SequenceAnimaticContinuityAnchor): z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema> | null {
  const id = readText(anchor.id)
  const anchorType = readText(anchor.anchorType)
  const name = readText(anchor.name)
  if (!id || !name || (anchorType !== 'character' && anchorType !== 'prop')) return null
  return sequenceAnimaticContinuityPlannerAnchorSchema.parse({
    id,
    type: anchorType,
    name,
    visualBrief: readText(anchor.visualBrief) || readText(anchor.summary) || `${name}, reusable continuity reference for storyboard consistency.`,
    persistenceReason: readText(anchor.persistenceReason) || readText(anchor.summary) || `Output-local ${anchorType === 'character' ? 'temporary character' : 'prop'} continuity reference for ${name}.`,
    confidence: Math.max(0.62, Math.min(0.86, Number(anchor.confidence) || 0.72)),
    shotIds: readStringArray(anchor.shotIds),
    storyboardBlockIds: readStringArray(anchor.storyboardBlockIds),
    sourceEvidence: readStringArray(anchor.sourcePhrases).length > 0
      ? readStringArray(anchor.sourcePhrases)
      : readStringArray(anchor.shotIds).map((shotId) => `${shotId}: deterministic continuity asset cue`),
    existingWorldEntityMatch: readText(anchor.existingWorldEntityMatch) || null,
    rejectionRisk: readText(anchor.rejectionRisk) || 'low: deterministic output-local continuity asset candidate.',
    baseLocationRefId: readText(anchor.baseLocationRefId) || null,
    setId: readText(anchor.setId) || null,
    angleId: readText(anchor.angleId) || null,
    connectedTo: readStringArray(anchor.connectedTo),
    visibleFrom: readStringArray(anchor.visibleFrom),
    entryFrom: readStringArray(anchor.entryFrom),
  })
}

function deterministicSequenceAnimaticAssetAnchorsForBlock(input: {
  continuityPlannerContext: Record<string, unknown>
  storyboardBlock: Record<string, unknown>
}) {
  const blockId = readText(input.storyboardBlock.id) || readText(input.storyboardBlock.storyboardBlockId) || 'storyboard_block'
  const shots = sequenceAnimaticBlockShots(input.continuityPlannerContext, input.storyboardBlock)
  if (shots.length === 0) return []
  const shotBreakIds = shots.map((shot) => readText(shot.id)).filter(Boolean)
  const fallbackPlan = collectSequenceAnimaticContinuityAnchors({
    shotPlan: { shots },
    shotBreakPlan: { groups: [{ id: blockId, shotBreakIds }] },
    assetPack: { entities: readArray(input.continuityPlannerContext.existingWorldReferences).map(asRecord) },
  })
  return [
    ...readArray(fallbackPlan.characterAnchors).map(asRecord),
    ...readArray(fallbackPlan.propAnchors).map(asRecord),
  ]
    .map((anchor) => sequenceAnimaticPlannerAnchorFromLegacyAnchor(anchor as SequenceAnimaticContinuityAnchor))
    .filter((anchor): anchor is z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema> => Boolean(anchor))
}

function sequenceAnimaticRuntimeRejectedCandidate(input: {
  name: string
  type?: string
  reason: z.infer<typeof sequenceAnimaticContinuityRejectedReasonSchema>
  sourceEvidence?: string[]
  shotIds?: string[]
  existingWorldEntityMatch?: string | null
}) {
  const type = input.type === 'character' || input.type === 'prop' || input.type === 'location_spot' || input.type === 'location_set' || input.type === 'location_angle'
    ? input.type
    : 'unknown'
  return sequenceAnimaticContinuityRejectedCandidateSchema.parse({
    name: input.name || 'Unnamed candidate',
    type,
    reason: input.reason,
    sourceEvidence: input.sourceEvidence ?? [],
    shotIds: input.shotIds ?? [],
    existingWorldEntityMatch: input.existingWorldEntityMatch ?? null,
  })
}

function sequenceAnimaticRuntimeGroupIdByShotId(shotBreakPlan: Record<string, unknown>) {
  const groupIdByShotId = new Map<string, string>()
  const groups = readArray(shotBreakPlan.groups).map(asRecord)
  groups.forEach((group, index) => {
    const groupId = readText(group.id) || `cinematic_v3_storyboard_group_${String(index + 1).padStart(3, '0')}`
    readStringArray(group.shotBreakIds).forEach((shotId) => groupIdByShotId.set(shotId, groupId))
  })
  return groupIdByShotId
}

export function normalizeSequenceAnimaticContinuityPlan(input: {
  rawPlan: z.infer<typeof sequenceAnimaticContinuityPlanV2Schema>
  fallbackPlan: Record<string, unknown>
  shotPlan: Record<string, unknown>
  shotBreakPlan: Record<string, unknown>
  assetPack: Record<string, unknown>
  fallbackUsed: boolean
  fallbackReason?: string
}) {
  if (input.fallbackUsed) {
    return {
      ...input.fallbackPlan,
      planningMode: 'deterministic_fallback',
      warnings: [
        ...readStringArray(input.fallbackPlan.warnings),
        input.fallbackReason ? `LLM continuity planner fallback: ${input.fallbackReason}` : 'LLM continuity planner fallback was used.',
      ],
    }
  }
  const knownAliases = sequenceAnimaticRuntimeKnownEntityAliases(input.assetPack)
  const shots = readArray(input.shotPlan.shots).map(asRecord)
  const knownShotIds = new Set(shots.map((shot) => readText(shot.id)).filter(Boolean))
  const groupIdByShotId = sequenceAnimaticRuntimeGroupIdByShotId(input.shotBreakPlan)
  const rejectedCandidates = [...input.rawPlan.rejectedCandidates]
  const anchorById = new Map<string, SequenceAnimaticContinuityAnchor>()
  const addRejected = (entry: ReturnType<typeof sequenceAnimaticRuntimeRejectedCandidate>) => {
    const key = `${entry.name}:${entry.reason}:${entry.shotIds.join(',')}`
    if (rejectedCandidates.some((candidate) => `${candidate.name}:${candidate.reason}:${candidate.shotIds.join(',')}` === key)) return
    rejectedCandidates.push(entry)
  }
  const acceptedSourceIds = new Set<string>()
  const acceptedRejectedCandidateKeys = new Set<string>()

  const cleanShotIds = (ids: string[]) => [...new Set(ids.map(readText).filter((id) => !knownShotIds.size || knownShotIds.has(id)))]
  const cleanBlockIds = (ids: string[], shotIds: string[]) => {
    const explicit = ids.map(readText).filter(Boolean)
    const inferred = shotIds.map((shotId) => groupIdByShotId.get(shotId) ?? '').filter(Boolean)
    return [...new Set([...explicit, ...inferred])]
  }
  const anchorPrefixForType = (type: string): 'char' | 'prop' | 'spot' => type === 'character' ? 'char' : type === 'prop' ? 'prop' : 'spot'

  for (const rawAnchor of input.rawPlan.anchors) {
    const name = normalizeSequenceAnimaticAnchorName(rawAnchor.name)
    const visualBrief = readText(rawAnchor.visualBrief)
    const type = rawAnchor.type
    const sourceEvidence = rawAnchor.sourceEvidence.map(readText).filter(Boolean)
    const shotIds = cleanShotIds(rawAnchor.shotIds)
    const explicitExistingMatch = readText(rawAnchor.existingWorldEntityMatch)
    const aliasMatch = knownAliases.get(sequenceAnimaticContinuityReferenceTextKey(name)) ?? ''
    const existingWorldEntityMatch = explicitExistingMatch || aliasMatch
    const abstractReason = sequenceAnimaticRuntimeContinuityAbstractReason(name, visualBrief)
    const storyCritical = /story[-\s]?critical|hero|plot|recurring|reuse|continuity|required|persistent/i.test(rawAnchor.persistenceReason)
      || sourceEvidence.length >= 2
      || shotIds.length >= 2
      || (type === 'character' && sequenceAnimaticShouldKeepSingleUseTemporaryCharacter({
        name,
        visualBrief,
        sourceEvidence,
        existingWorldEntityMatch,
      }))
    const confidence = Math.max(0, Math.min(1, Number(rawAnchor.confidence) || 0))
    if (!name || !visualBrief) {
      addRejected(sequenceAnimaticRuntimeRejectedCandidate({ name, type, reason: 'not_visual', sourceEvidence, shotIds }))
      continue
    }
    if (abstractReason) {
      addRejected(sequenceAnimaticRuntimeRejectedCandidate({ name, type, reason: abstractReason as z.infer<typeof sequenceAnimaticContinuityRejectedReasonSchema>, sourceEvidence, shotIds }))
      continue
    }
    if (existingWorldEntityMatch && type !== 'location_angle' && type !== 'location_set') {
      addRejected(sequenceAnimaticRuntimeRejectedCandidate({ name, type, reason: 'existing_world_entity', sourceEvidence, shotIds, existingWorldEntityMatch }))
      continue
    }
    if (confidence < 0.45) {
      addRejected(sequenceAnimaticRuntimeRejectedCandidate({ name, type, reason: 'low_confidence', sourceEvidence, shotIds }))
      continue
    }
    if (shotIds.length <= 1 && !storyCritical) {
      addRejected(sequenceAnimaticRuntimeRejectedCandidate({ name, type, reason: 'single_use_not_story_critical', sourceEvidence, shotIds }))
      continue
    }
    const continuitySubtype = type === 'location_set' || type === 'location_angle' ? type : type === 'location_spot' ? 'location_spot' : type
    const legacyAnchorType: SequenceAnimaticContinuityAnchor['anchorType'] = type === 'character' ? 'character' : type === 'prop' ? 'prop' : 'location_spot'
    const baseLocationRefId = readText(rawAnchor.baseLocationRefId) || null
    const id = readText(rawAnchor.id) || sequenceAnimaticRuntimeAnchorId(anchorPrefixForType(legacyAnchorType), name, baseLocationRefId ?? '')
    if (acceptedSourceIds.has(id)) continue
    acceptedSourceIds.add(id)
    const storyboardBlockIds = cleanBlockIds(rawAnchor.storyboardBlockIds, shotIds)
    anchorById.set(id, {
      id,
      name,
      anchorType: legacyAnchorType,
      continuitySubtype,
      baseLocationRefId,
      summary: readText(rawAnchor.persistenceReason) || `Reusable ${legacyAnchorType.replace(/_/g, ' ')} continuity reference for ${name}.`,
      visualBrief,
      persistenceReason: readText(rawAnchor.persistenceReason),
      confidence,
      sourceEvidence,
      existingWorldEntityMatch: existingWorldEntityMatch || null,
      rejectionRisk: readText(rawAnchor.rejectionRisk),
      shotIds,
      storyboardBlockIds,
      usageCount: Math.max(shotIds.length, storyboardBlockIds.length, 1),
      setId: readText(rawAnchor.setId) || null,
      angleId: readText(rawAnchor.angleId) || null,
      connectedTo: rawAnchor.connectedTo.map(readText).filter(Boolean),
      visibleFrom: rawAnchor.visibleFrom.map(readText).filter(Boolean),
      entryFrom: rawAnchor.entryFrom.map(readText).filter(Boolean),
      relationshipHints: [],
      sourcePhrases: sourceEvidence,
    })
  }

  for (const rejected of input.rawPlan.rejectedCandidates) {
    const name = normalizeSequenceAnimaticAnchorName(rejected.name)
    const sourceEvidence = rejected.sourceEvidence.map(readText).filter(Boolean)
    const shotIds = cleanShotIds(rejected.shotIds)
    const existingWorldEntityMatch = readText(rejected.existingWorldEntityMatch)
    if (
      rejected.type !== 'character'
      || rejected.reason !== 'single_use_not_story_critical'
      || shotIds.length <= 0
      || !sequenceAnimaticShouldKeepSingleUseTemporaryCharacter({
        name,
        sourceEvidence,
        existingWorldEntityMatch,
      })
    ) {
      continue
    }
    const id = sequenceAnimaticRuntimeAnchorId('char', name)
    if (acceptedSourceIds.has(id)) continue
    acceptedSourceIds.add(id)
    acceptedRejectedCandidateKeys.add(`${rejected.name}:${rejected.reason}:${rejected.shotIds.join(',')}`)
    const storyboardBlockIds = cleanBlockIds([], shotIds)
    anchorById.set(id, {
      id,
      name,
      anchorType: 'character',
      continuitySubtype: 'character',
      baseLocationRefId: null,
      summary: `Visible incidental character continuity reference for ${name}.`,
      visualBrief: `${name}, visible temporary supporting character design for storyboard continuity. Keep species, age, wardrobe, silhouette, and working-role details consistent; neutral pose, no text.`,
      persistenceReason: 'Visible incidental character with no canonical world entity; keep design consistent for storyboard continuity.',
      confidence: 0.72,
      sourceEvidence,
      existingWorldEntityMatch: null,
      rejectionRisk: 'medium: appears in one shot, but is a specific visible character rather than an abstract or crowd cue.',
      shotIds,
      storyboardBlockIds,
      usageCount: Math.max(1, shotIds.length),
      setId: null,
      angleId: null,
      connectedTo: [],
      visibleFrom: [],
      entryFrom: [],
      relationshipHints: [],
      sourcePhrases: sourceEvidence,
    })
  }

  const anchors = [...anchorById.values()]
    .sort((left, right) => right.usageCount - left.usageCount || (right.confidence ?? 0) - (left.confidence ?? 0) || left.id.localeCompare(right.id))
    .slice(0, 24)
  const characterAnchors = anchors.filter((anchor) => anchor.anchorType === 'character').slice(0, 9)
  const propAnchors = anchors.filter((anchor) => anchor.anchorType === 'prop').slice(0, 9)
  const locationSpotAnchors = anchors.filter((anchor) => anchor.anchorType === 'location_spot').slice(0, 12)
  const selectedAnchors = [...characterAnchors, ...propAnchors, ...locationSpotAnchors]
  const shotContinuityMap: Record<string, string[]> = {}
  selectedAnchors.forEach((anchor) => {
    anchor.shotIds.forEach((shotId) => {
      shotContinuityMap[shotId] = [...new Set([...(shotContinuityMap[shotId] ?? []), anchor.id])]
    })
  })

  const selectedAnchorIds = new Set(selectedAnchors.map((anchor) => anchor.id))
  const locationSets = input.rawPlan.locationSets
    .filter((entry) => {
      const abstractReason = sequenceAnimaticRuntimeContinuityAbstractReason(entry.name, entry.visualBrief)
      if (abstractReason) {
        addRejected(sequenceAnimaticRuntimeRejectedCandidate({ name: entry.name, type: 'location_set', reason: abstractReason as z.infer<typeof sequenceAnimaticContinuityRejectedReasonSchema>, sourceEvidence: [entry.persistenceReason], shotIds: entry.shotIds }))
        return false
      }
      const aliasMatch = knownAliases.get(sequenceAnimaticContinuityReferenceTextKey(entry.name)) ?? ''
      if (aliasMatch && (!entry.baseLocationRefId || entry.baseLocationRefId === aliasMatch)) {
        addRejected(sequenceAnimaticRuntimeRejectedCandidate({ name: entry.name, type: 'location_set', reason: 'existing_world_entity', sourceEvidence: [entry.persistenceReason], shotIds: entry.shotIds, existingWorldEntityMatch: aliasMatch }))
        return false
      }
      return true
    })
    .map((entry) => ({
      ...entry,
      shotIds: cleanShotIds(entry.shotIds),
      storyboardBlockIds: cleanBlockIds(entry.storyboardBlockIds, cleanShotIds(entry.shotIds)),
    }))
    .slice(0, 12)
  const locationAngles = input.rawPlan.locationAngles
    .filter((entry) => {
      const abstractReason = sequenceAnimaticRuntimeContinuityAbstractReason(entry.name, entry.visualBrief)
      if (abstractReason) {
        addRejected(sequenceAnimaticRuntimeRejectedCandidate({ name: entry.name, type: 'location_angle', reason: abstractReason as z.infer<typeof sequenceAnimaticContinuityRejectedReasonSchema>, sourceEvidence: [entry.visualBrief], shotIds: entry.shotIds }))
        return false
      }
      return true
    })
    .map((entry) => ({
      ...entry,
      shotIds: cleanShotIds(entry.shotIds),
      storyboardBlockIds: cleanBlockIds(entry.storyboardBlockIds, cleanShotIds(entry.shotIds)),
    }))
    .slice(0, 18)
  const graphNodeById = new Map<string, { id: string; type: 'location_set' | 'location_angle'; name: string }>()
  locationSets.forEach((entry) => graphNodeById.set(entry.id, { id: entry.id, type: 'location_set', name: entry.name }))
  locationAngles.forEach((entry) => graphNodeById.set(entry.id, { id: entry.id, type: 'location_angle', name: entry.name }))
  input.rawPlan.sceneGraph.nodes.forEach((entry) => {
    if (graphNodeById.has(entry.id)) return
    if (entry.type === 'location_set' || entry.type === 'location_angle') graphNodeById.set(entry.id, entry)
  })
  const sceneGraph = {
    nodes: [...graphNodeById.values()],
    edges: input.rawPlan.sceneGraph.edges
      .filter((edge) => graphNodeById.has(edge.sourceId) && graphNodeById.has(edge.targetId) && edge.sourceId !== edge.targetId)
      .slice(0, 40),
  }
  const warnings = [
    ...input.rawPlan.warnings,
    ...(selectedAnchorIds.size === 0 ? ['LLM continuity planner found no physical, non-duplicative sidecar anchors worth persisting.'] : []),
  ]
  const finalRejectedCandidates = rejectedCandidates.filter((candidate) => !acceptedRejectedCandidateKeys.has(`${candidate.name}:${candidate.reason}:${candidate.shotIds.join(',')}`))
  return {
    version: 'sequence_animatic_continuity_plan_v2',
    planningMode: 'llm_structured_v2',
    anchors: selectedAnchors,
    characterAnchors,
    propAnchors,
    locationSpotAnchors,
    locationSets,
    locationAngles,
    sceneGraph,
    continuityAnchorIdsByShotId: shotContinuityMap,
    shotContinuityMap,
    rejectedCandidates: finalRejectedCandidates,
    warnings,
    diagnostics: [
      ...input.rawPlan.diagnostics,
      ...(acceptedRejectedCandidateKeys.size > 0
        ? [`Recovered ${acceptedRejectedCandidateKeys.size} visible one-shot incidental character anchor${acceptedRejectedCandidateKeys.size === 1 ? '' : 's'} from LLM single-use rejections.`]
        : []),
      `LLM continuity planner accepted ${selectedAnchors.length} anchor${selectedAnchors.length === 1 ? '' : 's'} and rejected ${finalRejectedCandidates.length} candidate${finalRejectedCandidates.length === 1 ? '' : 's'}.`,
    ],
  }
}

export function repairSequenceAnimaticContinuityBlockDelta(input: {
  delta: z.infer<typeof sequenceAnimaticContinuityBlockDeltaSchema>
  graph: z.infer<typeof sequenceAnimaticContinuityGraphV2Schema>
  continuityPlannerContext: Record<string, unknown>
  storyboardBlock: Record<string, unknown>
  allowDeterministicFallback?: boolean
}) {
  const delta = sanitizeSequenceAnimaticContinuityBlockDeltaSpatialNodes({
    delta: sequenceAnimaticContinuityBlockDeltaSchema.parse(input.delta),
    continuityPlannerContext: input.continuityPlannerContext,
    storyboardBlock: input.storyboardBlock,
  })
  const allowDeterministicFallback = input.allowDeterministicFallback === true
  const deterministicAssetAnchors = allowDeterministicFallback
    ? deterministicSequenceAnimaticAssetAnchorsForBlock({
      continuityPlannerContext: input.continuityPlannerContext,
      storyboardBlock: input.storyboardBlock,
    })
    : []
  const fallback = allowDeterministicFallback
    ? buildDeterministicSequenceAnimaticBlockDelta({
      graph: input.graph,
      continuityPlannerContext: input.continuityPlannerContext,
      storyboardBlock: input.storyboardBlock,
      assetAnchors: deterministicAssetAnchors,
      fallbackReason: 'missing_shot_bindings_repair',
    })
    : null
  const shots = sequenceAnimaticBlockShots(input.continuityPlannerContext, input.storyboardBlock)
  const shotBindings = { ...delta.shotBindings }
  let repairedCount = 0
  const referenceLookup = sequenceAnimaticReferenceLookupFromPlannerContext(input.continuityPlannerContext)
  const rejectedCanonicalAnchors: z.infer<typeof sequenceAnimaticContinuityRejectedCandidateSchema>[] = []
  const rejectedPropAnchors: z.infer<typeof sequenceAnimaticContinuityRejectedCandidateSchema>[] = []
  const removedCanonicalAnchorIds = new Set<string>()
  const recoveredRejectedAssetAnchors = delta.rejectedCandidates
    .map((rejected) => sequenceAnimaticContinuityAnchorFromRejectedCandidate({
      rejected,
      continuityPlannerContext: input.continuityPlannerContext,
      existingGraphAnchors: input.graph.assetAnchors,
    }))
    .filter((anchor): anchor is z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema> => Boolean(anchor))
  const rawAssetAnchors = mergeById(
    [...deterministicAssetAnchors, ...recoveredRejectedAssetAnchors].map((entry) => ({ ...entry, id: readText(entry.id) })),
    delta.assetAnchors.map((entry) => ({ ...entry, id: readText(entry.id) })),
  ).filter((entry) => entry.id) as z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>[]
  const semanticAnchorMerge = mergeSequenceAnimaticContinuityAssetAnchorsBySemanticKey(rawAssetAnchors)
  for (const [shotId, bindingValue] of Object.entries(shotBindings)) {
    shotBindings[shotId] = remapSequenceAnimaticContinuityShotBindingAnchorIds(bindingValue, semanticAnchorMerge.idRemap)
  }
  const assetAnchors = semanticAnchorMerge.anchors.filter((anchor) => {
    const match = sequenceAnimaticCanonicalReferenceMatchForAnchor(anchor, referenceLookup)
    if (!match && readText(anchor.type) === 'prop') {
      const propCheck = sequenceAnimaticContinuityPropHasInteractionEvidence({
        anchor,
        continuityPlannerContext: input.continuityPlannerContext,
        existingGraphAnchors: input.graph.assetAnchors,
      })
      if (!propCheck.keep) {
        const anchorId = readText(anchor.id)
        if (anchorId) removedCanonicalAnchorIds.add(anchorId)
        rejectedPropAnchors.push(sequenceAnimaticRuntimeRejectedCandidate({
          name: readText(anchor.name),
          type: 'prop',
          reason: propCheck.reason ?? 'low_confidence',
          sourceEvidence: propCheck.evidence,
          shotIds: propCheck.shotIds,
        }))
        return false
      }
    }
    if (!match) return true
    const anchorId = readText(anchor.id)
    if (anchorId) removedCanonicalAnchorIds.add(anchorId)
    const matchKey = readText(match.key) || readText(match.name)
    rejectedCanonicalAnchors.push(sequenceAnimaticRuntimeRejectedCandidate({
      name: readText(anchor.name),
      type: readText(anchor.type),
      reason: 'existing_world_entity',
      sourceEvidence: readStringArray(anchor.sourceEvidence),
      shotIds: readStringArray(anchor.shotIds),
      existingWorldEntityMatch: matchKey || null,
    }))
    return false
  })

  for (const shot of shots) {
    const shotId = readText(shot.id)
    if (!shotId) continue
    const existing = asRecord(shotBindings[shotId])
    if ((readText(existing.setId) || readText(existing.worldLocationRefId)) && (readText(existing.zoneId) || readText(existing.primarySpotId) || readStringArray(existing.spotIds).length > 0 || readText(existing.viewpointId) || readText(existing.angleId))) continue

    const fallbackBinding = asRecord(fallback?.shotBindings[shotId])
    const zone = delta.zones.find((entry) => entry.shotIds.includes(shotId))
    const set = delta.locationSets.find((entry) => entry.shotIds.includes(shotId) || entry.id === zone?.setId)
      ?? input.graph.locationSets.find((entry) => entry.id === zone?.setId)
    const spots = delta.spots.filter((entry) => entry.shotIds.includes(shotId))
    const angle = delta.angles.find((entry) => entry.shotIds.includes(shotId))
    const characterAnchorIds = assetAnchors
      .filter((anchor) => anchor.shotIds.includes(shotId) && readText(anchor.type) === 'character')
      .map((anchor) => readText(anchor.id))
      .filter(Boolean)
    const propAnchorIds = assetAnchors
      .filter((anchor) => anchor.shotIds.includes(shotId) && readText(anchor.type) === 'prop')
      .map((anchor) => readText(anchor.id))
      .filter(Boolean)
    const setId = readText(set?.id) || readText(zone?.setId) || readText(angle?.setId) || readText(fallbackBinding.setId)
    const zoneId = readText(zone?.id) || readText(angle?.zoneId) || readText(fallbackBinding.zoneId)
    const spotIds = spots.map((entry) => readText(entry.id)).filter(Boolean)
    const angleId = readText(angle?.id) || readText(fallbackBinding.angleId) || readText(fallbackBinding.viewpointId)
    if (!setId && !zoneId && !angleId) continue
    const assetAnchorIds = [...new Set([...characterAnchorIds, ...propAnchorIds].filter(Boolean))]
    shotBindings[shotId] = sequenceAnimaticContinuityShotBindingSchema.parse({
      shotId,
      storyboardBlockId: delta.blockId || readText(input.storyboardBlock.id),
      worldLocationRefId: readText(zone?.worldLocationRefId) || readText(set?.worldLocationRefId) || readText(angle?.worldLocationRefId) || readText(fallbackBinding.worldLocationRefId),
      setId,
      zoneId,
      primarySpotId: spotIds[0] || readText(fallbackBinding.primarySpotId),
      spotIds: spotIds.length > 0 ? spotIds : readStringArray(fallbackBinding.spotIds),
      viewpointId: angleId,
      angleId,
      characterAnchorIds,
      propAnchorIds,
      assetAnchorIds,
      spatialNodeIds: [...new Set([setId, zoneId, spotIds[0] || readText(fallbackBinding.primarySpotId), ...(spotIds.length > 0 ? spotIds : readStringArray(fallbackBinding.spotIds)), angleId].filter(Boolean))],
      continuityAnchorIds: assetAnchorIds,
    })
    repairedCount += 1
  }

  if (removedCanonicalAnchorIds.size > 0) {
    for (const [shotId, bindingValue] of Object.entries(shotBindings)) {
      const binding = sequenceAnimaticContinuityShotBindingSchema.parse(bindingValue)
      const characterAnchorIds = binding.characterAnchorIds.filter((id) => !removedCanonicalAnchorIds.has(id))
      const propAnchorIds = binding.propAnchorIds.filter((id) => !removedCanonicalAnchorIds.has(id))
      const assetAnchorIds = binding.assetAnchorIds.filter((id) => !removedCanonicalAnchorIds.has(id))
      const continuityAnchorIds = binding.continuityAnchorIds.filter((id) => !removedCanonicalAnchorIds.has(id))
      shotBindings[shotId] = sequenceAnimaticContinuityShotBindingSchema.parse({
        ...binding,
        characterAnchorIds,
        propAnchorIds,
        assetAnchorIds,
        continuityAnchorIds,
      })
    }
  }

  for (const [shotId, bindingValue] of Object.entries(shotBindings)) {
    const binding = sequenceAnimaticContinuityShotBindingSchema.parse(bindingValue)
    const availableAssetAnchorMerge = mergeSequenceAnimaticContinuityAssetAnchorsBySemanticKey([...input.graph.assetAnchors, ...assetAnchors])
    const availableAssetAnchors = availableAssetAnchorMerge.anchors
    const inferredCharacterAnchorIds = availableAssetAnchors
      .filter((anchor) => anchor.type === 'character' && anchor.shotIds.includes(shotId))
      .map((anchor) => readText(anchor.id))
      .filter(Boolean)
    const inferredPropAnchorIds = availableAssetAnchors
      .filter((anchor) => anchor.type === 'prop' && anchor.shotIds.includes(shotId))
      .map((anchor) => readText(anchor.id))
      .filter(Boolean)
    const characterAnchorIds = [...new Set([...binding.characterAnchorIds, ...inferredCharacterAnchorIds])]
      .filter((id) => availableAssetAnchors.some((anchor) => anchor.id === id && anchor.type === 'character'))
    const propAnchorIds = [...new Set([...binding.propAnchorIds, ...inferredPropAnchorIds])]
      .filter((id) => availableAssetAnchors.some((anchor) => anchor.id === id && anchor.type === 'prop'))
    const assetAnchorIds = [...new Set([...characterAnchorIds, ...propAnchorIds].filter(Boolean))]
    shotBindings[shotId] = sequenceAnimaticContinuityShotBindingSchema.parse({
      ...binding,
      characterAnchorIds,
      propAnchorIds,
      assetAnchorIds,
      spatialNodeIds: [...new Set([binding.setId, binding.zoneId, binding.primarySpotId, ...binding.spotIds, binding.viewpointId, binding.angleId, ...binding.spatialNodeIds].filter(Boolean))],
      continuityAnchorIds: assetAnchorIds,
    })
  }

  return sequenceAnimaticContinuityBlockDeltaSchema.parse({
    ...delta,
    assetAnchors,
    rejectedCandidates: [...delta.rejectedCandidates, ...rejectedCanonicalAnchors, ...rejectedPropAnchors]
      .filter((entry) => !assetAnchors.some((anchor) => sequenceAnimaticContinuityAnchorSemanticKey(anchor) === `${readText(entry.type)}:${sequenceAnimaticContinuityAnchorSemanticName(readText(entry.name))}`))
      .filter((entry, index, values) => values.findIndex((candidate) => `${candidate.name}:${candidate.reason}:${candidate.existingWorldEntityMatch ?? ''}:${candidate.shotIds.join(',')}` === `${entry.name}:${entry.reason}:${entry.existingWorldEntityMatch ?? ''}:${entry.shotIds.join(',')}`) === index),
    shotBindings,
    warnings: [
      ...delta.warnings,
      ...(repairedCount > 0
        ? [`Repaired missing shotBindings for ${repairedCount} shot${repairedCount === 1 ? '' : 's'} from planned continuity zones/spots/angles.`]
        : []),
      ...(rejectedCanonicalAnchors.length > 0
        ? [`Rejected ${rejectedCanonicalAnchors.length} continuity anchor${rejectedCanonicalAnchors.length === 1 ? '' : 's'} that matched existing world entities.`]
        : []),
      ...(rejectedPropAnchors.length > 0
        ? [`Rejected ${rejectedPropAnchors.length} prop anchor${rejectedPropAnchors.length === 1 ? '' : 's'} without multi-shot action or character-interaction evidence.`]
        : []),
      ...(recoveredRejectedAssetAnchors.length > 0
        ? [`Recovered ${recoveredRejectedAssetAnchors.length} asset anchor${recoveredRejectedAssetAnchors.length === 1 ? '' : 's'} from LLM rejected candidates after continuity validation.`]
        : []),
    ],
  })
}

function sequenceAnimaticPreferContinuityAnchorText(previous: string, incoming: string) {
  const left = readText(previous)
  const right = readText(incoming)
  if (!left) return right
  if (!right) return left
  return right.length > left.length ? right : left
}

function sequenceAnimaticContinuityAnchorDisplayName(entries: readonly z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>[]) {
  const names = entries.map((entry) => readText(entry.name)).filter(Boolean)
  return names.find((name) => /[a-z]/.test(name) && name !== name.toUpperCase()) || names[0] || ''
}

function mergeSequenceAnimaticContinuityAssetAnchorGroup(entries: readonly z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>[]) {
  const first = entries[0]
  const stableId = sequenceAnimaticContinuityAnchorStableId(first)
  const canonicalId = entries.map((entry) => readText(entry.id)).find((id) => id === stableId)
    || stableId
    || entries.map((entry) => readText(entry.id)).find(Boolean)
    || ''
  const merged = entries.reduce((previous, entry) => sequenceAnimaticContinuityPlannerAnchorSchema.parse({
    ...previous,
    ...entry,
    id: canonicalId,
    name: sequenceAnimaticContinuityAnchorDisplayName(entries) || previous.name || entry.name,
    visualBrief: sequenceAnimaticPreferContinuityAnchorText(previous.visualBrief, entry.visualBrief),
    persistenceReason: sequenceAnimaticPreferContinuityAnchorText(previous.persistenceReason, entry.persistenceReason),
    confidence: Math.max(previous.confidence ?? 0, entry.confidence ?? 0),
    shotIds: [...new Set([...(previous.shotIds ?? []), ...(entry.shotIds ?? [])].map(readText).filter(Boolean))],
    storyboardBlockIds: [...new Set([...(previous.storyboardBlockIds ?? []), ...(entry.storyboardBlockIds ?? [])].map(readText).filter(Boolean))],
    sourceEvidence: [...new Set([...(previous.sourceEvidence ?? []), ...(entry.sourceEvidence ?? [])].map(readText).filter(Boolean))],
    connectedTo: [...new Set([...(previous.connectedTo ?? []), ...(entry.connectedTo ?? [])].map(readText).filter(Boolean))],
    visibleFrom: [...new Set([...(previous.visibleFrom ?? []), ...(entry.visibleFrom ?? [])].map(readText).filter(Boolean))],
    entryFrom: [...new Set([...(previous.entryFrom ?? []), ...(entry.entryFrom ?? [])].map(readText).filter(Boolean))],
    existingWorldEntityMatch: previous.existingWorldEntityMatch || entry.existingWorldEntityMatch || null,
    baseLocationRefId: previous.baseLocationRefId || entry.baseLocationRefId || null,
    setId: previous.setId || entry.setId || null,
    angleId: previous.angleId || entry.angleId || null,
  }), sequenceAnimaticContinuityPlannerAnchorSchema.parse({
    ...first,
    id: canonicalId,
  }))
  return merged
}

export function mergeSequenceAnimaticContinuityAssetAnchorsBySemanticKey(anchors: readonly z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>[]) {
  const grouped = new Map<string, z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>[]>()
  for (const rawAnchor of anchors) {
    const anchor = sequenceAnimaticContinuityPlannerAnchorSchema.parse({
      ...rawAnchor,
      id: readText(rawAnchor.id) || sequenceAnimaticContinuityAnchorStableId(rawAnchor),
    })
    const key = sequenceAnimaticContinuityAnchorSemanticKey(anchor) || readText(anchor.id)
    if (!key) continue
    const group = grouped.get(key) ?? []
    group.push(anchor)
    grouped.set(key, group)
  }
  const idRemap = new Map<string, string>()
  const mergedAnchors = [...grouped.values()].map((entries) => {
    const merged = mergeSequenceAnimaticContinuityAssetAnchorGroup(entries)
    const canonicalId = readText(merged.id)
    for (const entry of entries) {
      const oldId = readText(entry.id)
      if (oldId && canonicalId && oldId !== canonicalId) idRemap.set(oldId, canonicalId)
    }
    return merged
  })
  return { anchors: mergedAnchors, idRemap }
}

function remapSequenceAnimaticContinuityAssetIds(ids: readonly string[], idRemap: ReadonlyMap<string, string>) {
  return [...new Set(ids.map((id) => idRemap.get(id) || id).map(readText).filter(Boolean))]
}

export function remapSequenceAnimaticContinuityShotBindingAnchorIds(
  bindingValue: unknown,
  idRemap: ReadonlyMap<string, string>,
) {
  const binding = sequenceAnimaticContinuityShotBindingSchema.parse(bindingValue)
  const characterAnchorIds = remapSequenceAnimaticContinuityAssetIds(binding.characterAnchorIds, idRemap)
  const propAnchorIds = remapSequenceAnimaticContinuityAssetIds(binding.propAnchorIds, idRemap)
  const assetAnchorIds = remapSequenceAnimaticContinuityAssetIds(binding.assetAnchorIds, idRemap)
  const continuityAnchorIds = remapSequenceAnimaticContinuityAssetIds(binding.continuityAnchorIds, idRemap)
  return sequenceAnimaticContinuityShotBindingSchema.parse({
    ...binding,
    characterAnchorIds,
    propAnchorIds,
    assetAnchorIds,
    continuityAnchorIds,
  })
}

export function remapSequenceAnimaticContinuityShotBindingsAnchorIds(
  shotBindings: Record<string, z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>>,
  idRemap: ReadonlyMap<string, string>,
) {
  if (idRemap.size === 0) return shotBindings
  const remapped: Record<string, z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>> = {}
  for (const [shotId, binding] of Object.entries(shotBindings)) {
    remapped[shotId] = remapSequenceAnimaticContinuityShotBindingAnchorIds(binding, idRemap)
  }
  return remapped
}

function mergeById<T extends { id: string; shotIds?: string[]; storyboardBlockIds?: string[] }>(
  existing: T[] = [],
  incoming: T[] = [],
) {
  const byId = new Map<string, T>()
  for (const entry of existing) if (entry.id) byId.set(entry.id, entry)
  for (const entry of incoming) {
    if (!entry.id) continue
    const previous = byId.get(entry.id)
    byId.set(entry.id, previous
      ? {
        ...previous,
        ...entry,
        shotIds: [...new Set([...(previous.shotIds ?? []), ...(entry.shotIds ?? [])])],
        storyboardBlockIds: [...new Set([...(previous.storyboardBlockIds ?? []), ...(entry.storyboardBlockIds ?? [])])],
      }
      : entry)
  }
  return [...byId.values()]
}

export function mergeSequenceAnimaticContinuityGraphV2(input: {
  graph: z.infer<typeof sequenceAnimaticContinuityGraphV2Schema>
  delta: z.infer<typeof sequenceAnimaticContinuityBlockDeltaSchema>
  continuityPlannerContext?: Record<string, unknown>
}) {
  const graph = parseSequenceAnimaticGraphV2(input.graph)
  const delta = input.delta
  const nodeIds = new Set<string>()
  const locationSets = mergeById(graph.locationSets, delta.locationSets)
  const zones = mergeById(graph.zones, delta.zones)
  const spots = mergeById(graph.spots, delta.spots)
  const angles = mergeById(graph.angles, delta.angles)
  locationSets.forEach((entry) => nodeIds.add(entry.id))
  zones.forEach((entry) => nodeIds.add(entry.id))
  spots.forEach((entry) => nodeIds.add(entry.id))
  angles.forEach((entry) => nodeIds.add(entry.id))
  const edgeKey = (edge: z.infer<typeof sequenceAnimaticContinuityGraphEdgeSchema>) => `${edge.sourceId}:${edge.relationship}:${edge.targetId}`
  const edges = [...graph.edges, ...delta.edges]
    .filter((edge) => edge.sourceId !== edge.targetId && nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
    .filter((edge, index, values) => values.findIndex((candidate) => edgeKey(candidate) === edgeKey(edge)) === index)
    .slice(0, 160)
  const semanticAssetAnchorMerge = mergeSequenceAnimaticContinuityAssetAnchorsBySemanticKey([
    ...graph.assetAnchors.map((entry) => ({ ...entry, id: readText(entry.id) })),
    ...delta.assetAnchors.map((entry) => ({ ...entry, id: readText(entry.id) })),
  ])
  const shotBindings = remapSequenceAnimaticContinuityShotBindingsAnchorIds(
    { ...graph.shotBindings, ...delta.shotBindings },
    semanticAssetAnchorMerge.idRemap,
  )
  return sequenceAnimaticContinuityGraphV2Schema.parse({
    ...graph,
    worldLocationRefs: mergeById(graph.worldLocationRefs, delta.worldLocationRefs).slice(0, 24),
    locationSets: locationSets.slice(0, 48),
    zones: zones.slice(0, 72),
    spots: spots.slice(0, 96),
    angles: angles.slice(0, 96),
    edges,
    shotBindings,
    assetAnchors: semanticAssetAnchorMerge.anchors.filter((entry) => readText(entry.id)),
    rejectedCandidates: [...graph.rejectedCandidates, ...delta.rejectedCandidates]
      .filter((entry, index, values) => values.findIndex((candidate) => `${candidate.name}:${candidate.reason}:${candidate.shotIds.join(',')}` === `${entry.name}:${entry.reason}:${entry.shotIds.join(',')}`) === index)
      .slice(0, 96),
    blockSummaries: [
      ...graph.blockSummaries.filter((entry) => entry.blockId !== delta.blockId),
      { blockId: delta.blockId, summary: delta.blockSummary, status: delta.warnings.length > 0 ? 'fallback' : 'planned' },
    ],
    warnings: [...new Set([...graph.warnings, ...delta.warnings])],
    diagnostics: [...graph.diagnostics, ...delta.diagnostics],
  })
}

function sceneGraphEdgeEndpointSafe(
  sourceId: string,
  targetId: string,
  locationSets: z.infer<typeof sequenceAnimaticContinuityLocationSetSchema>[],
  locationAngles: z.infer<typeof sequenceAnimaticContinuityLocationAngleSchema>[],
) {
  const ids = new Set([...locationSets.map((entry) => entry.id), ...locationAngles.map((entry) => entry.id)])
  return ids.has(sourceId) && ids.has(targetId) && sourceId !== targetId
}

export function finalizeSequenceAnimaticContinuityGraphV2(graphInput: unknown) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const locationSets = graph.locationSets.map((entry) => sequenceAnimaticContinuityLocationSetSchema.parse({
    id: entry.id,
    name: entry.name,
    baseLocationRefId: entry.worldLocationRefId,
    visualBrief: entry.visualBrief || entry.name,
    persistenceReason: `Reusable continuity set inside ${entry.worldLocationRefId || 'the animatic location'}.`,
    shotIds: entry.shotIds,
    storyboardBlockIds: entry.storyboardBlockIds,
    connectedSetIds: graph.edges.filter((edge) => edge.sourceId === entry.id && edge.relationship === 'connected_to').map((edge) => edge.targetId),
    entrances: graph.edges.filter((edge) => edge.targetId === entry.id && edge.relationship === 'entrance_to').map((edge) => edge.sourceId),
    landmarks: [],
  }))
  const locationAngles = graph.angles.map((entry) => sequenceAnimaticContinuityLocationAngleSchema.parse({
    id: entry.id,
    setId: entry.setId,
    name: entry.name,
    visualBrief: entry.visualBrief || entry.name,
    framing: entry.framing,
    screenDirectionRule: entry.facingDirection,
    visibleLandmarks: entry.visibleLandmarks,
    lightingDirection: entry.lightingDirection,
    shotIds: entry.shotIds,
    storyboardBlockIds: entry.storyboardBlockIds,
  }))
  const sceneGraph = {
    nodes: [
      ...locationSets.map((entry) => ({ id: entry.id, type: 'location_set' as const, name: entry.name })),
      ...locationAngles.map((entry) => ({ id: entry.id, type: 'location_angle' as const, name: entry.name })),
    ],
    edges: graph.edges
      .filter((edge) => ['connected_to', 'visible_from', 'entrance_to', 'adjacent_to', 'same_space_angle'].includes(edge.relationship))
      .map((edge) => ({
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        relationship: edge.relationship === 'adjacent_to' ? 'connected_to' : edge.relationship,
        evidence: edge.evidence,
      }))
      .filter((edge) => sceneGraphEdgeEndpointSafe(edge.sourceId, edge.targetId, locationSets, locationAngles))
      .slice(0, 80),
  }
  const locationSpotAnchors = [
    ...graph.zones.map((entry) => ({
      id: `spot_${entry.id.replace(/^zone_/, '')}`,
      type: 'location_spot' as const,
      name: entry.name,
      visualBrief: entry.visualBrief || entry.name,
      persistenceReason: `Reusable zone continuity reference inside ${entry.worldLocationRefId || 'the animatic location'}.`,
      confidence: 0.72,
      shotIds: entry.shotIds,
      storyboardBlockIds: entry.storyboardBlockIds,
      sourceEvidence: entry.shotIds.map((shotId) => `${shotId}: zone binding`),
      existingWorldEntityMatch: null,
      rejectionRisk: 'low: output-local zone, not a world entity.',
      baseLocationRefId: entry.worldLocationRefId,
      setId: entry.setId,
      angleId: null,
      connectedTo: [],
      visibleFrom: [],
      entryFrom: [],
    })),
    ...graph.spots.map((entry) => ({
      id: entry.id,
      type: 'location_spot' as const,
      name: entry.name,
      visualBrief: entry.visualBrief || entry.name,
      persistenceReason: `Reusable spot continuity reference inside ${entry.worldLocationRefId || 'the animatic location'}.`,
      confidence: 0.72,
      shotIds: entry.shotIds,
      storyboardBlockIds: entry.storyboardBlockIds,
      sourceEvidence: entry.shotIds.map((shotId) => `${shotId}: spot binding`),
      existingWorldEntityMatch: null,
      rejectionRisk: 'low: output-local spot, not a world entity.',
      baseLocationRefId: entry.worldLocationRefId,
      setId: entry.setId,
      angleId: null,
      connectedTo: [],
      visibleFrom: [],
      entryFrom: [],
    })),
    ...graph.angles.map((entry) => ({
      id: entry.id,
      type: 'location_spot' as const,
      name: entry.name,
      visualBrief: entry.visualBrief || entry.name,
      persistenceReason: `Reusable camera angle continuity reference inside ${entry.worldLocationRefId || 'the animatic location'}.`,
      confidence: 0.72,
      shotIds: entry.shotIds,
      storyboardBlockIds: entry.storyboardBlockIds,
      sourceEvidence: entry.shotIds.map((shotId) => `${shotId}: angle binding`),
      existingWorldEntityMatch: null,
      rejectionRisk: 'low: output-local camera angle, not a world entity.',
      baseLocationRefId: entry.worldLocationRefId,
      setId: entry.setId,
      angleId: entry.id,
      connectedTo: [],
      visibleFrom: entry.spotIds,
      entryFrom: [],
    })),
  ].filter((entry, index, values) => values.findIndex((candidate) => candidate.id === entry.id) === index)
  const shotContinuityMap: Record<string, string[]> = {}
  Object.entries(graph.shotBindings).forEach(([shotId, binding]) => {
    shotContinuityMap[shotId] = [...new Set([
      ...binding.continuityAnchorIds,
    ].filter(Boolean))]
  })
  const assetAnchors = graph.assetAnchors
  return {
    continuityGraphV2: graph,
    locationSets,
    locationAngles,
    sceneGraph,
    shotContinuityMap,
    shotBindings: graph.shotBindings,
    assetAnchors,
    locationSpotAnchors,
    rejectedCandidates: graph.rejectedCandidates,
    warnings: graph.warnings,
    diagnostics: graph.diagnostics,
  }
}

export function sequenceAnimaticPlanFromContinuityGraphV2(graphInput: unknown) {
  const finalized = finalizeSequenceAnimaticContinuityGraphV2(graphInput)
  const anchors = finalized.assetAnchors.map((entry) => sequenceAnimaticContinuityPlannerAnchorSchema.parse({
    id: readText(entry.id),
    type: readText(entry.type) === 'character' ? 'character' : readText(entry.type) === 'prop' ? 'prop' : 'location_spot',
    name: readText(entry.name) || readText(entry.id),
    visualBrief: readText(entry.visualBrief) || readText(entry.name) || readText(entry.id),
    persistenceReason: readText(entry.persistenceReason) || 'Output-local continuity graph anchor.',
    confidence: Number(entry.confidence ?? 0.72) || 0.72,
    shotIds: readStringArray(entry.shotIds),
    storyboardBlockIds: readStringArray(entry.storyboardBlockIds),
    sourceEvidence: readStringArray(entry.sourceEvidence),
    existingWorldEntityMatch: readText(entry.existingWorldEntityMatch) || null,
    rejectionRisk: readText(entry.rejectionRisk),
    baseLocationRefId: readText(entry.baseLocationRefId) || null,
    setId: readText(entry.setId) || null,
    angleId: readText(entry.angleId) || null,
    connectedTo: readStringArray(entry.connectedTo),
    visibleFrom: readStringArray(entry.visibleFrom),
    entryFrom: readStringArray(entry.entryFrom),
  }))
  return {
    version: 'sequence_animatic_continuity_plan_v2',
    planningMode: 'block_graph_v2',
    anchors,
    characterAnchors: anchors.filter((anchor) => anchor.type === 'character').map((anchor) => ({
      ...anchor,
      anchorType: 'character',
      summary: anchor.persistenceReason,
      usageCount: Math.max(anchor.shotIds.length, 1),
    })),
    propAnchors: anchors.filter((anchor) => anchor.type === 'prop').map((anchor) => ({
      ...anchor,
      anchorType: 'prop',
      summary: anchor.persistenceReason,
      usageCount: Math.max(anchor.shotIds.length, 1),
    })),
    locationSpotAnchors: finalized.locationSpotAnchors,
    continuityGraphV2: finalized.continuityGraphV2,
    locationSets: finalized.locationSets,
    locationAngles: finalized.locationAngles,
    sceneGraph: finalized.sceneGraph,
    continuityAnchorIdsByShotId: finalized.shotContinuityMap,
    shotBindings: finalized.shotBindings,
    shotContinuityMap: finalized.shotContinuityMap,
    rejectedCandidates: finalized.rejectedCandidates,
    warnings: finalized.warnings,
    diagnostics: [
      ...finalized.diagnostics,
      `Block graph continuity planner emitted ${anchors.length} output-local anchor${anchors.length === 1 ? '' : 's'}.`,
    ],
  }
}

function normalizeSequenceAnimaticReferenceText(value: unknown) {
  return readText(value)
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
}

function mergeSequenceAnimaticReferenceCatalogEntries(entries: Array<Record<string, unknown>>) {
  const byKey = new Map<string, Record<string, unknown>>()
  for (const entry of entries) {
    const key = readText(entry.key)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, entry)
      continue
    }
    byKey.set(key, {
      ...existing,
      ...entry,
      name: readText(existing.name) || readText(entry.name),
      type: readText(existing.type) || readText(entry.type),
      summary: readText(existing.summary) || readText(entry.summary),
      visualSummary: readText(existing.visualSummary) || readText(entry.visualSummary),
      aliases: [...new Set([...readStringArray(existing.aliases), ...readStringArray(entry.aliases)])].filter(Boolean),
      assetKeys: [...new Set([...readStringArray(existing.assetKeys), ...readStringArray(entry.assetKeys)])].filter(Boolean).slice(0, 8),
      source: [...new Set([readText(existing.source), readText(entry.source)].filter(Boolean))].join('+'),
    })
  }
  return [...byKey.values()]
}

const sequenceAnimaticReferenceAliasStopwords = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

function sequenceAnimaticReferenceIsCharacterLike(entry: Record<string, unknown>) {
  const type = normalizeSequenceAnimaticReferenceText([
    readText(entry.type),
    readText(entry.referenceRole),
    readText(entry.nodeType),
  ].filter(Boolean).join(' '))
  return /\b(actor|character|cast|person|persona|protagonist|antagonist)\b/.test(type.replace(/_/g, ' '))
}

function sequenceAnimaticReferenceAliasCandidates(entry: Record<string, unknown>) {
  const rawValues = [
    readText(entry.key),
    readText(entry.key).replace(/_/g, ' '),
    readText(entry.name),
    readText(entry.label),
    ...readStringArray(entry.aliases),
  ].filter(Boolean)
  const candidates = new Set<string>()
  for (const value of rawValues) {
    const normalized = normalizeSequenceAnimaticReferenceText(value)
    if (normalized) candidates.add(normalized)
  }

  if (sequenceAnimaticReferenceIsCharacterLike(entry)) {
    for (const value of rawValues) {
      const parts = normalizeSequenceAnimaticReferenceText(value)
        .split('_')
        .filter((part) => part.length >= 3 && !sequenceAnimaticReferenceAliasStopwords.has(part))
      if (parts.length >= 2) {
        candidates.add(parts[0])
        candidates.add(parts[parts.length - 1])
      }
    }
  }

  return [...candidates]
}

function buildSequenceAnimaticReferenceLookup(catalog: Array<Record<string, unknown>>) {
  const byKey = new Map<string, Record<string, unknown>>()
  const byAlias = new Map<string, Record<string, unknown>>()
  for (const entry of catalog) {
    const key = readText(entry.key)
    if (key) byKey.set(key, entry)
    for (const normalized of sequenceAnimaticReferenceAliasCandidates(entry)) {
      if (normalized && !byAlias.has(normalized)) byAlias.set(normalized, entry)
    }
  }
  return { byKey, byAlias }
}

function sequenceAnimaticReferenceLookupFromPlannerContext(context: Record<string, unknown>) {
  const references = readArray(context.existingWorldReferences).map(asRecord)
  const resolvedReferences: Array<Record<string, unknown>> = []
  for (const shot of readArray(context.shots).map(asRecord)) {
    const resolvedRefs = asRecord(shot.resolvedRefs)
    for (const value of Object.values(resolvedRefs)) {
      if (Array.isArray(value)) resolvedReferences.push(...value.map(asRecord))
      else {
        const record = asRecord(value)
        if (Object.keys(record).length > 0) resolvedReferences.push(record)
      }
    }
  }
  return buildSequenceAnimaticReferenceLookup(mergeSequenceAnimaticReferenceCatalogEntries([
    ...references,
    ...resolvedReferences,
  ]))
}

function sequenceAnimaticCanonicalReferenceMatchForAnchor(
  anchor: z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>,
  lookup: ReturnType<typeof buildSequenceAnimaticReferenceLookup>,
) {
  const anchorType = readText(anchor.type)
  if (anchorType !== 'character' && anchorType !== 'prop') return null
  const explicitMatch = readText(anchor.existingWorldEntityMatch)
  if (explicitMatch) {
    return lookup.byKey.get(explicitMatch)
      ?? lookup.byAlias.get(normalizeSequenceAnimaticReferenceText(explicitMatch))
      ?? { key: explicitMatch, name: explicitMatch, type: 'world_entity' }
  }
  const candidates = [
    readText(anchor.name),
    readText(anchor.id).replace(/^anchor_(character|prop)_/i, '').replace(/_block\d+$/i, '').replace(/_/g, ' '),
  ].filter(Boolean)
  for (const candidate of candidates) {
    const match = lookup.byAlias.get(normalizeSequenceAnimaticReferenceText(candidate))
    if (match) return match
  }
  return null
}

function sequenceAnimaticContinuityTextHasPhysicalLocationCue(value: unknown) {
  const normalized = ` ${normalizeSequenceAnimaticReferenceText(value).replace(/_/g, ' ')} `
  return /\b(row|lane|street|city|station|clock|face|pipe|rail|catwalk|walkway|chamber|room|corridor|passage|gap|hatch|ledge|platform|shaft|wall|door|gate|workshop|bay|bench|tunnel|engine|basin|bridge|stair|dock|harbor|drain|crate|lamp|lantern)\b/.test(normalized)
}

function sequenceAnimaticCanonicalCharacterMatchForText(
  value: unknown,
  lookup: ReturnType<typeof buildSequenceAnimaticReferenceLookup>,
) {
  const normalized = normalizeSequenceAnimaticReferenceText(value)
  if (!normalized) return null
  for (const [alias, entry] of lookup.byAlias.entries()) {
    if (alias.length < 3 || !sequenceAnimaticReferenceIsCharacterLike(entry)) continue
    if (normalized === alias || normalized.includes(`_${alias}_`) || normalized.startsWith(`${alias}_`) || normalized.endsWith(`_${alias}`)) {
      return entry
    }
  }
  return null
}

function sequenceAnimaticContinuityLocationNodeLooksCharacterDerived(
  node: Record<string, unknown>,
  lookup: ReturnType<typeof buildSequenceAnimaticReferenceLookup>,
) {
  const label = readText(node.name) || readText(node.id)
  const match = sequenceAnimaticCanonicalCharacterMatchForText(label, lookup)
  return Boolean(match && !sequenceAnimaticContinuityTextHasPhysicalLocationCue(label))
}

function sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived(
  node: Record<string, unknown>,
  shots: Array<Record<string, unknown>>,
) {
  const nodeText = normalizeSequenceAnimaticReferenceText([node.id, node.name].map(readText).filter(Boolean).join(' '))
  if (!nodeText) return false
  for (const shot of shots) {
    const title = readText(shot.title)
    const normalizedTitle = normalizeSequenceAnimaticReferenceText(title)
    if (normalizedTitle.length >= 8 && nodeText.includes(normalizedTitle) && !sequenceAnimaticContinuityTextHasPhysicalLocationCue(title)) return true
  }
  return false
}

function sequenceAnimaticContinuityTitleFromRefLike(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim()
}

export function sanitizeSequenceAnimaticContinuityBlockDeltaSpatialNodes(input: {
  delta: z.infer<typeof sequenceAnimaticContinuityBlockDeltaSchema>
  continuityPlannerContext: Record<string, unknown>
  storyboardBlock: Record<string, unknown>
}) {
  const delta = sequenceAnimaticContinuityBlockDeltaSchema.parse(input.delta)
  const lookup = sequenceAnimaticReferenceLookupFromPlannerContext(input.continuityPlannerContext)
  const shots = sequenceAnimaticBlockShots(input.continuityPlannerContext, input.storyboardBlock)
  const invalidNodeIds = new Set<string>()
  const rejectedCandidates: z.infer<typeof sequenceAnimaticContinuityRejectedCandidateSchema>[] = []

  const markInvalid = (entry: Record<string, unknown>, type: 'location_spot' | 'location_set' | 'location_angle', reason: string) => {
    const id = readText(entry.id)
    if (id) invalidNodeIds.add(id)
    rejectedCandidates.push(sequenceAnimaticContinuityRejectedCandidateSchema.parse({
      name: readText(entry.name) || sequenceAnimaticContinuityTitleFromRefLike(id) || 'Unnamed candidate',
      type,
      reason: 'too_generic',
      sourceEvidence: [reason],
      shotIds: readStringArray(entry.shotIds),
    }))
  }

  const isBadLocationNode = (entry: Record<string, unknown>) => (
    sequenceAnimaticContinuityLocationNodeLooksCharacterDerived(entry, lookup)
    || sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived(entry, shots)
  )

  const zones = delta.zones.filter((entry) => {
    if (!isBadLocationNode(entry)) return true
    markInvalid(entry, 'location_spot', 'Continuity location node looked like a character/action label instead of a physical zone.')
    return false
  })
  const spots = delta.spots.filter((entry) => {
    if (invalidNodeIds.has(entry.zoneId) || isBadLocationNode(entry)) {
      markInvalid(entry, 'location_spot', 'Continuity spot depended on a rejected character/action-derived zone.')
      return false
    }
    return true
  })
  const angles = delta.angles.filter((entry) => {
    if (invalidNodeIds.has(entry.zoneId) || entry.spotIds.some((spotId) => invalidNodeIds.has(spotId)) || isBadLocationNode(entry)) {
      markInvalid(entry, 'location_angle', 'Continuity angle depended on a rejected character/action-derived zone or spot.')
      return false
    }
    return true
  })

  if (invalidNodeIds.size === 0) return delta

  const shotBindings: Record<string, z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>> = {}
  for (const [shotId, bindingValue] of Object.entries(delta.shotBindings)) {
    const binding = sequenceAnimaticContinuityShotBindingSchema.parse(bindingValue)
    const spotIds = binding.spotIds.filter((spotId) => !invalidNodeIds.has(spotId))
    shotBindings[shotId] = sequenceAnimaticContinuityShotBindingSchema.parse({
      ...binding,
      zoneId: invalidNodeIds.has(binding.zoneId) ? '' : binding.zoneId,
      spotIds,
      angleId: invalidNodeIds.has(binding.angleId) ? '' : binding.angleId,
      spatialNodeIds: binding.spatialNodeIds.filter((nodeId) => !invalidNodeIds.has(nodeId)),
      continuityAnchorIds: binding.continuityAnchorIds.filter((anchorId) => !invalidNodeIds.has(anchorId)),
    })
  }

  return sequenceAnimaticContinuityBlockDeltaSchema.parse({
    ...delta,
    zones,
    spots,
    angles,
    edges: delta.edges.filter((edge) => !invalidNodeIds.has(edge.sourceId) && !invalidNodeIds.has(edge.targetId)),
    shotBindings,
    rejectedCandidates: [...delta.rejectedCandidates, ...rejectedCandidates]
      .filter((entry, index, values) => values.findIndex((candidate) => `${candidate.name}:${candidate.reason}:${candidate.shotIds.join(',')}` === `${entry.name}:${entry.reason}:${entry.shotIds.join(',')}`) === index),
    warnings: [
      ...delta.warnings,
      `Rejected ${invalidNodeIds.size} continuity spatial node${invalidNodeIds.size === 1 ? '' : 's'} that looked like character/action labels instead of physical locations.`,
    ],
  })
}

export function sanitizeSequenceAnimaticContinuityGraphCanonicalAnchors(input: {
  graph: z.infer<typeof sequenceAnimaticContinuityGraphV2Schema>
  continuityPlannerContext: Record<string, unknown>
}) {
  const graph = parseSequenceAnimaticGraphV2(input.graph)
  const lookup = sequenceAnimaticReferenceLookupFromPlannerContext(input.continuityPlannerContext)
  const contextShots = readArray(input.continuityPlannerContext.shots).map(asRecord)
  const removedAnchorIds = new Set<string>()
  const removedLocationNodeIds = new Set<string>()
  const rejectedCandidates: z.infer<typeof sequenceAnimaticContinuityRejectedCandidateSchema>[] = []
  const filteredAssetAnchors = graph.assetAnchors.filter((anchor) => {
    const match = sequenceAnimaticCanonicalReferenceMatchForAnchor(anchor, lookup)
    if (!match) return true
    const anchorId = readText(anchor.id)
    if (anchorId) removedAnchorIds.add(anchorId)
    rejectedCandidates.push(sequenceAnimaticContinuityRejectedCandidateSchema.parse({
      name: readText(anchor.name) || 'Unnamed candidate',
      type: readText(anchor.type) === 'character' || readText(anchor.type) === 'prop' ? readText(anchor.type) : 'unknown',
      reason: 'existing_world_entity',
      sourceEvidence: readStringArray(anchor.sourceEvidence),
      shotIds: readStringArray(anchor.shotIds),
      existingWorldEntityMatch: readText(match.key) || readText(match.name) || null,
    }))
    return false
  })
  const semanticAnchorMerge = mergeSequenceAnimaticContinuityAssetAnchorsBySemanticKey(filteredAssetAnchors)
  const assetAnchors = semanticAnchorMerge.anchors
  const locationSets = graph.locationSets.filter((entry) => {
    if (!sequenceAnimaticContinuityLocationNodeLooksCharacterDerived(entry, lookup) && !sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived(entry, contextShots)) return true
    removedLocationNodeIds.add(entry.id)
    return false
  })
  const zones = graph.zones.filter((entry) => {
    if (removedLocationNodeIds.has(entry.setId) || sequenceAnimaticContinuityLocationNodeLooksCharacterDerived(entry, lookup) || sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived(entry, contextShots)) {
      removedLocationNodeIds.add(entry.id)
      return false
    }
    return true
  })
  const spots = graph.spots.filter((entry) => {
    if (removedLocationNodeIds.has(entry.zoneId) || sequenceAnimaticContinuityLocationNodeLooksCharacterDerived(entry, lookup) || sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived(entry, contextShots)) {
      removedLocationNodeIds.add(entry.id)
      return false
    }
    return true
  })
  const angles = graph.angles.filter((entry) => {
    if (removedLocationNodeIds.has(entry.setId) || removedLocationNodeIds.has(entry.zoneId) || entry.spotIds.some((spotId) => removedLocationNodeIds.has(spotId)) || sequenceAnimaticContinuityLocationNodeLooksCharacterDerived(entry, lookup) || sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived(entry, contextShots)) {
      removedLocationNodeIds.add(entry.id)
      return false
    }
    return true
  })

  const shotBindings: Record<string, z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>> = {}
  const validCharacterAnchorIds = new Set(assetAnchors.filter((anchor) => anchor.type === 'character').map((anchor) => anchor.id).filter(Boolean))
  const validPropAnchorIds = new Set(assetAnchors.filter((anchor) => anchor.type === 'prop').map((anchor) => anchor.id).filter(Boolean))
  for (const [shotId, bindingValue] of Object.entries(graph.shotBindings)) {
    const binding = remapSequenceAnimaticContinuityShotBindingAnchorIds(bindingValue, semanticAnchorMerge.idRemap)
    const characterAnchorIds = binding.characterAnchorIds.filter((id) => validCharacterAnchorIds.has(id))
    const propAnchorIds = binding.propAnchorIds.filter((id) => validPropAnchorIds.has(id))
    const assetAnchorIds = [...new Set([...characterAnchorIds, ...propAnchorIds].filter(Boolean))]
    const zoneId = removedLocationNodeIds.has(binding.zoneId) ? '' : binding.zoneId
    const primarySpotId = removedLocationNodeIds.has(binding.primarySpotId) ? '' : binding.primarySpotId
    const spotIds = binding.spotIds.filter((id) => !removedLocationNodeIds.has(id))
    const viewpointId = removedLocationNodeIds.has(binding.viewpointId) ? '' : binding.viewpointId
    const angleId = removedLocationNodeIds.has(binding.angleId) ? '' : binding.angleId
    shotBindings[shotId] = sequenceAnimaticContinuityShotBindingSchema.parse({
      ...binding,
      characterAnchorIds,
      propAnchorIds,
      assetAnchorIds,
      zoneId,
      primarySpotId,
      spotIds,
      viewpointId,
      angleId,
      spatialNodeIds: [...new Set([binding.setId, zoneId, primarySpotId, ...spotIds, viewpointId, angleId, ...binding.spatialNodeIds].filter((id) => id && !removedLocationNodeIds.has(id)))],
      continuityAnchorIds: assetAnchorIds,
    })
  }

  return sequenceAnimaticContinuityGraphV2Schema.parse({
    ...graph,
    locationSets,
    zones,
    spots,
    angles,
    edges: graph.edges.filter((edge) => !removedLocationNodeIds.has(edge.sourceId) && !removedLocationNodeIds.has(edge.targetId)),
    assetAnchors,
    rejectedCandidates: [...graph.rejectedCandidates, ...rejectedCandidates]
      .filter((entry, index, values) => values.findIndex((candidate) => `${candidate.name}:${candidate.reason}:${candidate.existingWorldEntityMatch ?? ''}:${candidate.shotIds.join(',')}` === `${entry.name}:${entry.reason}:${entry.existingWorldEntityMatch ?? ''}:${entry.shotIds.join(',')}`) === index),
    shotBindings,
    warnings: [
      ...graph.warnings,
      ...(removedAnchorIds.size > 0 ? [`Removed ${removedAnchorIds.size} continuity anchor${removedAnchorIds.size === 1 ? '' : 's'} that duplicated existing world entities.`] : []),
      ...(removedLocationNodeIds.size > 0 ? [`Removed ${removedLocationNodeIds.size} continuity spatial node${removedLocationNodeIds.size === 1 ? '' : 's'} that looked like character/action labels instead of physical locations.`] : []),
    ],
  })
}

export function sequenceAnimaticContinuityBlockStatesFromGraph(
  graphInput: unknown,
  options: {
    activeBlockId?: string
    activeDelta?: Record<string, unknown>
    status?: 'not_started' | 'seeded' | 'deriving' | 'ready' | 'needs_review' | 'failed' | 'stale'
    error?: string
  } = {},
) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const now = new Date().toISOString()
  const blockIds = new Set<string>()
  Object.values(graph.shotBindings).forEach((binding) => {
    if (binding.storyboardBlockId) blockIds.add(binding.storyboardBlockId)
  })
  readStringArray(options.activeDelta?.storyboardBlockIds).forEach((id) => blockIds.add(id))
  const activeBlockId = readText(options.activeBlockId) || readText(options.activeDelta?.blockId)
  if (activeBlockId) blockIds.add(activeBlockId)
  const states: Record<string, Record<string, unknown>> = {}
  blockIds.forEach((blockId) => {
    const shotIds = Object.values(graph.shotBindings)
      .filter((binding) => binding.storyboardBlockId === blockId)
      .map((binding) => binding.shotId)
      .filter(Boolean)
    states[blockId] = {
      blockId,
      status: blockId === activeBlockId ? options.status ?? 'ready' : 'ready',
      inputHash: hashOutputWorkflowValue({
        blockId,
        shotIds,
        graphVersion: graph.version,
      }),
      lastDeltaHash: blockId === activeBlockId && Object.keys(asRecord(options.activeDelta)).length > 0
        ? hashOutputWorkflowValue(options.activeDelta)
        : '',
      shotIds,
      warningCount: graph.warnings.length,
      warnings: graph.warnings,
      error: blockId === activeBlockId ? readText(options.error) : '',
      updatedAt: now,
    }
  })
  return states
}

export function sequenceAnimaticContinuityCoverage(
  graphInput: unknown,
  continuityPlannerContext: Record<string, unknown>,
  blockStates: Record<string, unknown> = {},
) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const shots = readArray(continuityPlannerContext.shots).map(asRecord)
  const explicitBlocks = readArray(continuityPlannerContext.blocks).map(asRecord)
  const totalShotIds = shots.map((shot) => readText(shot.id)).filter(Boolean)
  const bindingShotIds = Object.keys(graph.shotBindings).map(readText).filter(Boolean)
  const effectiveShotIds = totalShotIds.length > 0 ? totalShotIds : bindingShotIds
  const effectiveBoundShotIds = effectiveShotIds.filter((shotId) => {
    const binding = asRecord(graph.shotBindings[shotId])
    const hasLocation = Boolean(readText(binding.setId) || readText(binding.worldLocationRefId))
    const hasSpecificSpatialNode = Boolean(
      readText(binding.zoneId)
      || readText(binding.primarySpotId)
      || readStringArray(binding.spotIds).length > 0
      || readText(binding.viewpointId)
      || readText(binding.angleId)
    )
    return hasLocation && hasSpecificSpatialNode
  })
  const inferredBlockIds = [...new Set(Object.values(graph.shotBindings)
    .map((binding) => readText(asRecord(binding).storyboardBlockId))
    .filter(Boolean))]
  const blocks = explicitBlocks.length > 0
    ? explicitBlocks
    : inferredBlockIds.map((blockId) => ({
      id: blockId,
      shotIds: bindingShotIds.filter((shotId) => readText(asRecord(graph.shotBindings[shotId]).storyboardBlockId) === blockId),
    }))
  const seededBlockIds: string[] = []
  const missingBlockIds: string[] = []
  for (const block of blocks) {
    const blockId = readText(block.id)
    if (!blockId) continue
    const shotIds = readStringArray(block.shotIds)
    const relevantShotIds = shotIds.length > 0 ? shotIds : effectiveShotIds.filter((shotId) => readText(asRecord(graph.shotBindings[shotId]).storyboardBlockId) === blockId)
    const boundCount = relevantShotIds.filter((shotId) => effectiveBoundShotIds.includes(shotId)).length
    if (relevantShotIds.length > 0 && boundCount === relevantShotIds.length) seededBlockIds.push(blockId)
    if (relevantShotIds.length === 0 || boundCount < relevantShotIds.length) missingBlockIds.push(blockId)
  }
  const readyBlockIds = Object.entries(blockStates)
    .filter(([, state]) => readText(asRecord(state).status) === 'ready')
    .map(([blockId]) => blockId)
  return {
    totalShots: effectiveShotIds.length,
    boundShots: effectiveBoundShotIds.length,
    missingShotIds: effectiveShotIds.filter((shotId) => !effectiveBoundShotIds.includes(shotId)),
    seededBlockIds,
    readyBlockIds,
    missingBlockIds,
    tempAnchorCount: graph.assetAnchors.length,
  }
}

export function sequenceAnimaticSeededBlockStatesFromCoverage(
  graphInput: unknown,
  continuityPlannerContext: Record<string, unknown>,
  previousStates: Record<string, unknown> = {},
) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const blocks = readArray(continuityPlannerContext.blocks).map(asRecord)
  const coverage = sequenceAnimaticContinuityCoverage(graph, continuityPlannerContext, previousStates)
  const now = new Date().toISOString()
  const states: Record<string, Record<string, unknown>> = { ...Object.fromEntries(Object.entries(previousStates).map(([key, value]) => [key, asRecord(value)])) }
  for (const block of blocks) {
    const blockId = readText(block.id)
    if (!blockId) continue
    const existing = asRecord(states[blockId])
    const existingStatus = readText(existing.status)
    const keepExisting = ['ready', 'deriving', 'failed', 'stale'].includes(existingStatus)
    const shotIds = readStringArray(block.shotIds)
    const status = keepExisting
      ? existingStatus
      : coverage.seededBlockIds.includes(blockId)
        ? 'seeded'
        : coverage.missingBlockIds.includes(blockId)
          ? 'needs_review'
          : 'not_started'
    states[blockId] = {
      ...existing,
      blockId,
      status,
      inputHash: readText(existing.inputHash) || hashOutputWorkflowValue({ blockId, shotIds, graphVersion: graph.version }),
      lastDeltaHash: readText(existing.lastDeltaHash),
      shotIds,
      warnings: readStringArray(existing.warnings),
      error: readText(existing.error),
      updatedAt: now,
    }
  }
  return states
}

export function sequenceAnimaticContinuityVisualDependencyEdges(graphInput: unknown) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const edges: Array<z.infer<typeof sequenceAnimaticContinuityVisualDependencyEdgeSchema>> = []
  const push = (sourceNodeId: string, targetNodeId: string, relationship: string, required = false, evidence = '') => {
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return
    edges.push(sequenceAnimaticContinuityVisualDependencyEdgeSchema.parse({
      sourceNodeId,
      targetNodeId,
      relationship,
      required,
      evidence,
    }))
  }
  graph.locationSets.forEach((set) => push(readText(set.worldLocationRefId), set.id, 'world_location_to_set', true, `Set ${set.name} belongs to ${set.worldLocationRefId}.`))
  graph.zones.forEach((zone) => push(zone.setId, zone.id, 'set_to_zone', true, `Zone ${zone.name} belongs to set ${zone.setId}.`))
  graph.spots.forEach((spot) => push(spot.zoneId, spot.id, 'zone_to_spot', true, `Spot ${spot.name} belongs to zone ${spot.zoneId}.`))
  graph.angles.forEach((angle) => {
    push(angle.setId, angle.id, 'set_to_angle', true, `Angle ${angle.name} belongs to set ${angle.setId}.`)
    push(angle.zoneId, angle.id, 'zone_to_angle', true, `Angle ${angle.name} is framed inside zone ${angle.zoneId}.`)
    angle.spotIds.forEach((spotId) => push(spotId, angle.id, 'spot_to_angle', false, `Angle ${angle.name} faces spot ${spotId}.`))
  })
  graph.edges.forEach((edge) => {
    if (['adjacent_to', 'visible_from', 'entrance_to', 'connected_to', 'same_space_angle', 'faces', 'opposes', 'above_below', 'left_of', 'right_of', 'near', 'occludes'].includes(edge.relationship)) {
      push(edge.sourceId, edge.targetId, edge.relationship, false, edge.evidence)
    }
  })
  const key = (edge: z.infer<typeof sequenceAnimaticContinuityVisualDependencyEdgeSchema>) => `${edge.sourceNodeId}:${edge.relationship}:${edge.targetNodeId}`
  return edges.filter((edge, index, values) => values.findIndex((candidate) => key(candidate) === key(edge)) === index).slice(0, 240)
}

export function sequenceAnimaticContinuityAssetTargets(graphInput: unknown) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const targets = [
    ...graph.locationSets.map((entry) => ({ ...entry, id: entry.id, nodeKind: 'location_set', assetKind: 'location_set' })),
    ...graph.zones.map((entry) => ({ ...entry, id: entry.id, nodeKind: 'location_zone', assetKind: 'location_zone' })),
    ...graph.spots.map((entry) => ({ ...entry, id: entry.id, nodeKind: 'location_spot', assetKind: 'location_spot' })),
    ...graph.angles.map((entry) => ({ ...entry, id: entry.id, nodeKind: 'location_angle', assetKind: 'location_angle' })),
    ...graph.assetAnchors.map((entry) => ({
      ...entry,
      id: readText(entry.id),
      nodeKind: entry.type === 'character' ? 'temporary_character' : entry.type === 'prop' ? 'prop' : 'location_anchor',
      assetKind: entry.type === 'character' ? 'temporary_character' : entry.type === 'prop' ? 'prop' : 'location_spot',
    })),
  ].map(asRecord).filter((entry) => readText(entry.id))
  const seen = new Set<string>()
  return targets.filter((target) => {
    const id = readText(target.id)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

export function sequenceAnimaticContinuityAssetTargetInputHash(target: Record<string, unknown>) {
  return hashOutputWorkflowValue({
    id: readText(target.id),
    assetKind: readText(target.assetKind) || readText(target.nodeKind),
    name: readText(target.name),
    visualBrief: readText(target.visualBrief),
    shotIds: readStringArray(target.shotIds),
    storyboardBlockIds: readStringArray(target.storyboardBlockIds),
    worldLocationRefId: readText(target.worldLocationRefId) || readText(target.baseLocationRefId),
    setId: readText(target.setId),
    zoneId: readText(target.zoneId),
    spotIds: readStringArray(target.spotIds),
  })
}

export function sequenceAnimaticContinuityAssetStates(input: {
  graph: unknown
  previousStates?: Record<string, unknown>
}) {
  const previousStates = asRecord(input.previousStates)
  const states: Record<string, z.infer<typeof sequenceAnimaticContinuityAssetStateSchema>> = {}
  for (const target of sequenceAnimaticContinuityAssetTargets(input.graph)) {
    const sourceNodeId = readText(target.id)
    const inputHash = sequenceAnimaticContinuityAssetTargetInputHash(target)
    const previous = asRecord(previousStates[sourceNodeId])
    const previousStatus = readText(previous.status)
    const previousAssetKey = readText(previous.assetKey)
    const status = previousStatus === 'ready' && previousAssetKey && readText(previous.inputHash) === inputHash
      ? 'ready'
      : previousStatus === 'failed' && readText(previous.inputHash) === inputHash
        ? 'failed'
        : previousAssetKey
          ? 'stale'
          : 'missing'
    states[sourceNodeId] = sequenceAnimaticContinuityAssetStateSchema.parse({
      status,
      inputHash,
      assetKey: previousAssetKey || null,
      artifactKey: readText(previous.artifactKey) || null,
      prompt: readText(previous.prompt),
      referenceAssetKeys: readStringArray(previous.referenceAssetKeys),
      sourceNodeId,
      assetKind: readText(target.assetKind) || readText(target.nodeKind) || 'continuity_asset',
      generatedAt: readText(previous.generatedAt) || null,
      warnings: readStringArray(previous.warnings),
      error: readText(previous.error),
    })
  }
  return states
}

export function sequenceAnimaticAssetGenerationStatus(assetStateByNodeId: Record<string, unknown>) {
  const states = Object.values(assetStateByNodeId).map(asRecord)
  if (states.length === 0) return 'none'
  if (states.some((state) => readText(state.status) === 'failed')) return 'failed'
  if (states.some((state) => readText(state.status) === 'stale')) return 'stale'
  const readyCount = states.filter((state) => readText(state.status) === 'ready').length
  if (readyCount === states.length) return 'ready'
  if (readyCount > 0) return 'partial'
  return 'none'
}

export function withSequenceAnimaticContinuityAssetState(pack: Record<string, unknown>, graphInput: unknown) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const assetStateByNodeId = sequenceAnimaticContinuityAssetStates({
    graph,
    previousStates: asRecord(pack.assetStateByNodeId ?? pack.asset_state_by_node_id),
  })
  const visualDependencyEdges = sequenceAnimaticContinuityVisualDependencyEdges(graph)
  return {
    ...pack,
    assetStateByNodeId,
    asset_state_by_node_id: assetStateByNodeId,
    visualDependencyEdges,
    visual_dependency_edges: visualDependencyEdges,
    assetGenerationStatus: sequenceAnimaticAssetGenerationStatus(assetStateByNodeId),
    asset_generation_status: sequenceAnimaticAssetGenerationStatus(assetStateByNodeId),
  }
}
