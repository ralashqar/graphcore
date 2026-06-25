import { z } from 'zod'
import {
  sequenceAnimaticContinuityGraphAngleSchema,
  sequenceAnimaticContinuityGraphEdgeSchema,
  sequenceAnimaticContinuityGraphSetSchema,
  sequenceAnimaticContinuityGraphSpotSchema,
  sequenceAnimaticContinuityGraphZoneSchema,
  sequenceAnimaticShotContinuityBlockV2Schema,
  sequenceAnimaticShotContinuityLocalReferenceV2Schema,
  sequenceAnimaticShotContinuityPlanV2Schema,
  sequenceAnimaticShotContinuityShotV2Schema,
  sequenceAnimaticShotContinuityStreamPlanDoneRecordSchema,
  sequenceAnimaticShotContinuityStreamRecordSchema,
  sequenceAnimaticShotContinuityStreamSceneGraphRecordSchema,
  type SequenceAnimaticShotContinuityStreamRecord,
} from './output-workflow-sequence-animatic-shot-continuity-contracts.ts'
import {
  sequenceAnimaticShotContinuityCoverageSetupV2Schema,
} from './output-workflow-sequence-animatic-coverage-runtime.ts'
import {
  sequenceAnimaticShotBindingFromSceneBinding,
  sequenceAnimaticShotRefs,
} from './output-workflow-sequence-animatic-shot-binding-runtime.ts'

type SequenceAnimaticShotContinuityStreamAccumulator = {
  planStarted: boolean
  planDone: z.infer<typeof sequenceAnimaticShotContinuityStreamPlanDoneRecordSchema> | null
  blocksById: Map<string, z.infer<typeof sequenceAnimaticShotContinuityBlockV2Schema>>
  shotsById: Map<string, z.infer<typeof sequenceAnimaticShotContinuityShotV2Schema>>
  setsById: Map<string, z.infer<typeof sequenceAnimaticContinuityGraphSetSchema>>
  zonesById: Map<string, z.infer<typeof sequenceAnimaticContinuityGraphZoneSchema>>
  spotsById: Map<string, z.infer<typeof sequenceAnimaticContinuityGraphSpotSchema>>
  viewpointsById: Map<string, z.infer<typeof sequenceAnimaticContinuityGraphAngleSchema>>
  anglesById: Map<string, z.infer<typeof sequenceAnimaticContinuityGraphAngleSchema>>
  edgesById: Map<string, z.infer<typeof sequenceAnimaticContinuityGraphEdgeSchema>>
  coverageSetupsById: Map<string, z.infer<typeof sequenceAnimaticShotContinuityCoverageSetupV2Schema>>
  localReferencesById: Map<string, z.infer<typeof sequenceAnimaticShotContinuityLocalReferenceV2Schema>>
  notes: string[]
}

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

function sequenceAnimaticUniqueTexts(values: unknown[]) {
  return [...new Set(values.flatMap((value) => readStringArray(value)).map(readText).filter(Boolean))]
}

function titleFromRefLike(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function deterministicSequenceAnimaticJsonCandidates(record: string) {
  const base = record.trim()
  const candidates = new Set<string>()
  const addCandidate = (value: string) => {
    const trimmed = value.trim()
    if (trimmed) candidates.add(trimmed)
  }
  addCandidate(base)
  const firstBrace = base.indexOf('{')
  const lastBrace = base.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) addCandidate(base.slice(firstBrace, lastBrace + 1))
  for (const candidate of [...candidates]) {
    addCandidate(candidate
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, '$1'))
  }
  return [...candidates]
}

function repairSequenceAnimaticStreamShotRecord(record: Record<string, unknown>) {
  const blockId = readText(record.blockId) || readText(record.block_id)
  if (blockId) return { ...record, blockId }
  const shotId = readText(record.id)
  const sceneScope = /^(.+)_shot_\d+/.exec(shotId)?.[1]
  return { ...record, blockId: sceneScope ? `${sceneScope}_block_001` : 'block_001' }
}

export function parseSequenceAnimaticStreamRecord(record: string) {
  let firstError: unknown = null
  for (const candidate of deterministicSequenceAnimaticJsonCandidates(record)) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      const parsedRecord = asRecord(parsed)
      const kind = readText(parsedRecord.kind)
      const normalizedParsed = kind === 'scene_plan_start'
        ? { ...parsedRecord, kind: 'plan_start' }
        : kind === 'scene_plan_done'
          ? { ...parsedRecord, kind: 'plan_done' }
          : kind === 'shot'
            ? repairSequenceAnimaticStreamShotRecord(parsedRecord)
            : parsed
      const validated = sequenceAnimaticShotContinuityStreamRecordSchema.safeParse(parsed)
      const normalizedValidated = validated.success
        ? validated
        : sequenceAnimaticShotContinuityStreamRecordSchema.safeParse(normalizedParsed)
      if (normalizedValidated.success) return { record: normalizedValidated.data, error: null as unknown }
      firstError ??= normalizedValidated.error
    } catch (error) {
      firstError ??= error
    }
  }
  return { record: null as SequenceAnimaticShotContinuityStreamRecord | null, error: firstError }
}

export function createSequenceAnimaticShotContinuityStreamAccumulator(): SequenceAnimaticShotContinuityStreamAccumulator {
  return {
    planStarted: false,
    planDone: null,
    blocksById: new Map(),
    shotsById: new Map(),
    setsById: new Map(),
    zonesById: new Map(),
    spotsById: new Map(),
    viewpointsById: new Map(),
    anglesById: new Map(),
    edgesById: new Map(),
    coverageSetupsById: new Map(),
    localReferencesById: new Map(),
    notes: [],
  }
}

export function normalizeSequenceAnimaticCoverageSetup(input: z.infer<typeof sequenceAnimaticShotContinuityCoverageSetupV2Schema>) {
  const setupKind = (input.setupKind || input.setup_kind || 'other') as z.infer<typeof sequenceAnimaticShotContinuityCoverageSetupV2Schema>['setupKind']
  const continuityMode = (input.continuityMode || input.continuity_mode || 'new_setup') as z.infer<typeof sequenceAnimaticShotContinuityCoverageSetupV2Schema>['continuityMode']
  return sequenceAnimaticShotContinuityCoverageSetupV2Schema.parse({
    ...input,
    sceneId: input.sceneId || input.scene_id,
    setupKind,
    title: input.title || titleFromRefLike(input.id),
    setId: input.setId || input.set_id,
    zoneId: input.zoneId || input.zone_id,
    primarySpotId: input.primarySpotId || input.primary_spot_id,
    spotIds: sequenceAnimaticUniqueTexts([input.spotIds, input.spot_ids, input.primarySpotId || input.primary_spot_id ? [input.primarySpotId || input.primary_spot_id] : []]),
    viewpointId: input.viewpointId || input.viewpoint_id,
    characterRefIds: sequenceAnimaticUniqueTexts([input.characterRefIds, input.character_ref_ids]),
    screenDirection: input.screenDirection || input.screen_direction,
    stagingBrief: input.stagingBrief || input.staging_brief,
    continuityFromSetupId: input.continuityFromSetupId || input.continuity_from_setup_id,
    continuityMode,
    usedShotIds: sequenceAnimaticUniqueTexts([input.usedShotIds, input.used_shot_ids]),
    blockIds: sequenceAnimaticUniqueTexts([input.blockIds, input.block_ids]),
  })
}

function sequenceAnimaticStreamBlockIdsFromShotIds(
  blocks: z.infer<typeof sequenceAnimaticShotContinuityBlockV2Schema>[],
  shots: z.infer<typeof sequenceAnimaticShotContinuityShotV2Schema>[],
) {
  const byShotId = new Map(shots.map((shot) => [shot.id, shot.blockId] as const))
  return blocks.map((block) => ({
    ...block,
    shotIds: block.shotIds.length > 0
      ? block.shotIds
      : shots.filter((shot) => shot.blockId === block.id).sort((left, right) => left.index - right.index).map((shot) => shot.id),
  })).filter((block) => block.shotIds.some((shotId) => byShotId.has(shotId)))
}

function sequenceAnimaticSyntheticStreamBlocksFromShots(
  shots: z.infer<typeof sequenceAnimaticShotContinuityShotV2Schema>[],
) {
  const blockIds: string[] = []
  const shotIdsByBlockId = new Map<string, string[]>()
  for (const shot of shots) {
    const blockId = shot.blockId || 'block_001'
    if (!shotIdsByBlockId.has(blockId)) {
      shotIdsByBlockId.set(blockId, [])
      blockIds.push(blockId)
    }
    shotIdsByBlockId.get(blockId)?.push(shot.id)
  }
  return blockIds.map((blockId, index) => sequenceAnimaticShotContinuityBlockV2Schema.parse({
    id: blockId,
    index: index + 1,
    title: `Block ${index + 1}`,
    summary: 'Synthesized from streamed shot records.',
    shotIds: shotIdsByBlockId.get(blockId) ?? [],
  }))
}

function sequenceAnimaticSceneGraphRecordToNode(record: z.infer<typeof sequenceAnimaticShotContinuityStreamSceneGraphRecordSchema>) {
  const storyboardBlockIds = [...new Set([...record.storyboardBlockIds, ...record.blockIds].filter(Boolean))]
  if (record.nodeKind === 'set') {
    return {
      nodeKind: 'set' as const,
      node: sequenceAnimaticContinuityGraphSetSchema.parse({
        id: record.id,
        worldLocationRefId: record.worldLocationRefId || null,
        name: record.name,
        visualBrief: record.visualBrief,
        shotIds: record.shotIds,
        storyboardBlockIds,
      }),
    }
  }
  if (record.nodeKind === 'zone') {
    return {
      nodeKind: 'zone' as const,
      node: sequenceAnimaticContinuityGraphZoneSchema.parse({
        id: record.id,
        setId: record.setId,
        worldLocationRefId: record.worldLocationRefId || null,
        name: record.name,
        visualBrief: record.visualBrief,
        shotIds: record.shotIds,
        storyboardBlockIds,
      }),
    }
  }
  if (record.nodeKind === 'spot') {
    return {
      nodeKind: 'spot' as const,
      node: sequenceAnimaticContinuityGraphSpotSchema.parse({
        id: record.id,
        setId: record.setId,
        zoneId: record.zoneId,
        worldLocationRefId: record.worldLocationRefId || null,
        name: record.name,
        visualBrief: record.visualBrief,
        landmarks: record.landmarks,
        shotIds: record.shotIds,
        storyboardBlockIds,
      }),
    }
  }
  return {
    nodeKind: record.nodeKind === 'viewpoint' ? 'viewpoint' as const : 'angle' as const,
    node: sequenceAnimaticContinuityGraphAngleSchema.parse({
      id: record.id,
      setId: record.setId,
      zoneId: record.zoneId,
      spotIds: record.spotIds,
      worldLocationRefId: record.worldLocationRefId || null,
      name: record.name,
      visualBrief: record.visualBrief,
      framing: record.framing,
      cameraPosition: record.cameraPosition,
      facingDirection: record.facingDirection,
      subjectPosition: record.subjectPosition,
      visibleLandmarks: record.visibleLandmarks,
      lightingDirection: record.lightingDirection,
      shotIds: record.shotIds,
      storyboardBlockIds,
    }),
  }
}

export function applySequenceAnimaticShotContinuityStreamRecord(
  accumulator: SequenceAnimaticShotContinuityStreamAccumulator,
  record: SequenceAnimaticShotContinuityStreamRecord,
) {
  if (record.kind === 'plan_start') {
    accumulator.planStarted = true
    if (record.note) accumulator.notes.push(record.note)
    return
  }
  if (record.kind === 'block') {
    const { kind: _kind, ...block } = record
    accumulator.blocksById.set(block.id, sequenceAnimaticShotContinuityBlockV2Schema.parse(block))
    return
  }
  if (record.kind === 'shot') {
    const { kind: _kind, ...shot } = record
    const refs = sequenceAnimaticShotRefs(shot)
    sequenceAnimaticShotBindingFromSceneBinding({
      shotId: shot.id,
      storyboardBlockId: shot.blockId,
      sceneBinding: asRecord(shot.sceneBinding),
      refs,
    })
    accumulator.shotsById.set(shot.id, sequenceAnimaticShotContinuityShotV2Schema.parse(shot))
    return
  }
  if (record.kind === 'scene_graph_addition') {
    const projected = sequenceAnimaticSceneGraphRecordToNode(record)
    if (projected.nodeKind === 'set') accumulator.setsById.set(projected.node.id, projected.node)
    else if (projected.nodeKind === 'zone') accumulator.zonesById.set(projected.node.id, projected.node)
    else if (projected.nodeKind === 'spot') accumulator.spotsById.set(projected.node.id, projected.node)
    else if (projected.nodeKind === 'viewpoint') accumulator.viewpointsById.set(projected.node.id, projected.node)
    else accumulator.anglesById.set(projected.node.id, projected.node)
    return
  }
  if (record.kind === 'spot_relation') {
    const edge = sequenceAnimaticContinuityGraphEdgeSchema.parse({
      sourceId: record.sourceId,
      targetId: record.targetId,
      relationship: record.relationship,
      evidence: record.evidence,
      direction: record.direction,
      screenDirection: record.screenDirection,
    })
    accumulator.edgesById.set(`${edge.sourceId}:${edge.relationship}:${edge.targetId}`, edge)
    return
  }
  if (record.kind === 'coverage_setup') {
    const { kind: _kind, ...setup } = record
    const normalized = normalizeSequenceAnimaticCoverageSetup(setup)
    accumulator.coverageSetupsById.set(normalized.id, normalized)
    return
  }
  if (record.kind === 'local_reference') {
    const { kind: _kind, ...reference } = record
    accumulator.localReferencesById.set(reference.id, sequenceAnimaticShotContinuityLocalReferenceV2Schema.parse(reference))
    return
  }
  if (record.kind === 'plan_done') {
    accumulator.planDone = record
    accumulator.notes.push(...record.notes)
  }
}

export function finalizeSequenceAnimaticShotContinuityStreamPlan(accumulator: SequenceAnimaticShotContinuityStreamAccumulator) {
  const unorderedShots = [...accumulator.shotsById.values()]
  if (unorderedShots.length === 0) throw new Error('Sequence animatic shot continuity stream returned no shot records.')
  const unorderedBlocks = [...accumulator.blocksById.values()]
  const recoveryNotes: string[] = []
  const sortedShotIds = unorderedShots
    .slice()
    .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
    .map((shot) => shot.id)
  const sortedBlockIds = (unorderedBlocks.length > 0 ? unorderedBlocks : sequenceAnimaticSyntheticStreamBlocksFromShots(unorderedShots))
    .slice()
    .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
    .map((block) => block.id)
  const done = accumulator.planDone ?? {
    kind: 'plan_done' as const,
    shotCount: unorderedShots.length,
    blockCount: sortedBlockIds.length,
    orderedShotIds: sortedShotIds,
    orderedBlockIds: sortedBlockIds,
    screenplaySummary: '',
    notes: ['Recovered from accepted streamed shot records because plan_done was missing.'],
  }
  if (!accumulator.planDone) {
    recoveryNotes.push('Recovered from accepted streamed shot records because plan_done was missing.')
  }
  const orderedShotIds = done.orderedShotIds.filter((shotId) => accumulator.shotsById.has(shotId))
  const missingOrderedShotIds = done.orderedShotIds.filter((shotId) => !accumulator.shotsById.has(shotId))
  if (missingOrderedShotIds.length > 0) {
    recoveryNotes.push(`Dropped ${missingOrderedShotIds.length} ordered shot reference(s) that were not accepted: ${missingOrderedShotIds.slice(0, 8).join(', ')}.`)
  }
  const shots = [
    ...orderedShotIds.map((shotId) => accumulator.shotsById.get(shotId)).filter((shot): shot is z.infer<typeof sequenceAnimaticShotContinuityShotV2Schema> => Boolean(shot)),
    ...unorderedShots.filter((shot) => !orderedShotIds.includes(shot.id)).sort((left, right) => left.index - right.index || left.id.localeCompare(right.id)),
  ]
  const orderedBlockIds = done.orderedBlockIds.filter((blockId) => accumulator.blocksById.has(blockId))
  const missingOrderedBlockIds = done.orderedBlockIds.filter((blockId) => !accumulator.blocksById.has(blockId))
  if (missingOrderedBlockIds.length > 0) {
    recoveryNotes.push(`Dropped ${missingOrderedBlockIds.length} ordered block reference(s) that were not accepted: ${missingOrderedBlockIds.slice(0, 8).join(', ')}.`)
  }
  const streamedBlocks = [
    ...orderedBlockIds.map((blockId) => accumulator.blocksById.get(blockId)).filter((block): block is z.infer<typeof sequenceAnimaticShotContinuityBlockV2Schema> => Boolean(block)),
    ...unorderedBlocks.filter((block) => !orderedBlockIds.includes(block.id)).sort((left, right) => left.index - right.index || left.id.localeCompare(right.id)),
  ]
  const acceptedShotIds = new Set(shots.map((shot) => shot.id))
  const blocksWithAcceptedShots = sequenceAnimaticStreamBlockIdsFromShotIds(
    streamedBlocks.length > 0 ? streamedBlocks : sequenceAnimaticSyntheticStreamBlocksFromShots(shots),
    shots,
  ).map((block) => ({
    ...block,
    shotIds: block.shotIds.filter((shotId) => acceptedShotIds.has(shotId)),
  })).filter((block) => block.shotIds.length > 0)
  const missingBlockShotIds = (streamedBlocks.length > 0 ? streamedBlocks : blocksWithAcceptedShots)
    .flatMap((block) => block.shotIds.map((shotId) => ({ blockId: block.id, shotId })))
    .filter((entry) => !acceptedShotIds.has(entry.shotId))
  if (missingBlockShotIds.length > 0) {
    recoveryNotes.push(`Dropped ${missingBlockShotIds.length} block shot reference(s) that were not accepted: ${missingBlockShotIds.slice(0, 8).map((entry) => `${entry.blockId}/${entry.shotId}`).join(', ')}.`)
  }
  const blocks = blocksWithAcceptedShots.length > 0 ? blocksWithAcceptedShots : sequenceAnimaticSyntheticStreamBlocksFromShots(shots)
  if (blocks.length === 0) throw new Error('Sequence animatic shot continuity stream returned no block records.')
  return sequenceAnimaticShotContinuityPlanV2Schema.parse({
    role: 'sequence_animatic_director_plan',
    contractVersion: 'shot_continuity_plan_v2',
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'director_plan',
    sequenceAnimaticRole: 'director_plan',
    planningMode: 'single_director_pass',
    screenplaySummary: done.screenplaySummary,
    shots,
    blocks,
    sceneGraphAdditions: {
      sets: [...accumulator.setsById.values()],
      zones: [...accumulator.zonesById.values()],
      spots: [...accumulator.spotsById.values()],
      viewpoints: [...accumulator.viewpointsById.values()],
      angles: [...accumulator.anglesById.values()],
      edges: [...accumulator.edgesById.values()],
    },
    coverageSetups: [...accumulator.coverageSetupsById.values()],
    localReferences: [...accumulator.localReferencesById.values()],
    notes: [...new Set([...accumulator.notes, ...done.notes, ...recoveryNotes].map(readText).filter(Boolean))],
  })
}
